/**
 * KPI Manager - Quản lý tính KPI dựa trên sự khác biệt sản phẩm
 *
 * Flow:
 * 1. User xác nhận sản phẩm lần đầu → checkKPIBaseExists()
 * 2. Nếu chưa có BASE → Hỏi user "Tính KPI từ lúc này?"
 * 3. Nếu đồng ý → saveKPIBase() lưu snapshot sản phẩm chính
 * 4. So sánh Note với BASE → calculateKPIDifference()
 * 5. Tính KPI = Số SP khác biệt × 5,000đ
 *
 * Firebase Structure:
 * - kpi_base/{orderId} - Lưu BASE snapshot
 * - kpi_statistics/{userId}/{date} - Lưu thống kê KPI
 */

(function () {
    'use strict';

    const KPI_BASE_COLLECTION = 'kpi_base';
    const KPI_STATISTICS_COLLECTION = 'kpi_statistics';
    const KPI_AMOUNT_PER_DIFFERENCE = 5000; // 5,000 VNĐ per difference

    /**
     * 1. Check if KPI BASE exists for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<boolean>} - true if BASE exists
     */
    async function checkKPIBaseExists(orderId) {
        if (!orderId) {
            console.warn('[KPI] checkKPIBaseExists: No orderId provided');
            return false;
        }

        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[KPI] Firebase not available');
                return false;
            }

            const snapshot = await window.firebase.database()
                .ref(`${KPI_BASE_COLLECTION}/${orderId}`)
                .once('value');

            const exists = snapshot.exists();
            console.log(`[KPI] checkKPIBaseExists(${orderId}):`, exists);
            return exists;
        } catch (error) {
            console.error('[KPI] Error checking BASE exists:', error);
            return false;
        }
    }

    /**
     * 2. Save KPI BASE to Firebase
     * @param {string} orderId - Order ID
     * @param {string} userId - User ID
     * @param {number} stt - Order sequential number
     * @param {Array} products - Array of main products [{code, quantity, price}]
     * @returns {Promise<void>}
     */
    async function saveKPIBase(orderId, userId, stt, products) {
        if (!orderId || !userId) {
            throw new Error('orderId and userId are required');
        }

        try {
            if (!window.firebase || !window.firebase.database) {
                throw new Error('Firebase not available');
            }

            // Get user display name from authManager
            let userName = 'Unknown';
            if (window.authManager) {
                const auth = window.authManager.getAuthState();
                if (auth) {
                    userName = auth.displayName || auth.userType || auth.username || 'Unknown';
                }
            }

            // Normalize products to BASE format
            const baseProducts = (products || []).map(p => ({
                code: p.ProductCode || p.Code || p.DefaultCode || '',
                quantity: p.Quantity || 1,
                price: p.Price || 0,
                productId: p.ProductId || null
            })).filter(p => p.code); // Only include products with code

            const baseData = {
                orderId: orderId,
                stt: stt || 0,
                userId: userId,
                userName: userName,
                timestamp: window.firebase.database.ServerValue.TIMESTAMP,
                products: baseProducts
            };

            await window.firebase.database()
                .ref(`${KPI_BASE_COLLECTION}/${orderId}`)
                .set(baseData);

            console.log('[KPI] ✓ Saved BASE:', {
                orderId,
                stt,
                userName,
                productsCount: baseProducts.length
            });

        } catch (error) {
            console.error('[KPI] Error saving BASE:', error);
            throw error;
        }
    }

    /**
     * 3. Get KPI BASE from Firebase
     * @param {string} orderId - Order ID
     * @returns {Promise<object|null>} - BASE data or null if not exists
     */
    async function getKPIBase(orderId) {
        if (!orderId) {
            console.warn('[KPI] getKPIBase: No orderId provided');
            return null;
        }

        try {
            if (!window.firebase || !window.firebase.database) {
                console.warn('[KPI] Firebase not available');
                return null;
            }

            const snapshot = await window.firebase.database()
                .ref(`${KPI_BASE_COLLECTION}/${orderId}`)
                .once('value');

            if (!snapshot.exists()) {
                console.log(`[KPI] No BASE found for order: ${orderId}`);
                return null;
            }

            const data = snapshot.val();
            console.log(`[KPI] Got BASE for order ${orderId}:`, data);
            return data;
        } catch (error) {
            console.error('[KPI] Error getting BASE:', error);
            return null;
        }
    }

    /**
     * 4. Parse products from Note format
     * Format: "N1769 - 1 - 390000" (code - quantity - price)
     * @param {string} noteText - Note text containing products
     * @returns {Array<{code: string, quantity: number, price: number}>}
     */
    function parseNoteProducts(noteText) {
        if (!noteText || typeof noteText !== 'string') {
            return [];
        }

        const products = [];
        const lines = noteText.split('\n');

        // Regex pattern: code - quantity - price
        // Examples: N1769 - 1 - 390000, N1278L - 2 - 360000
        const pattern = /^([A-Za-z0-9]+)\s*-\s*(\d+)\s*-\s*(\d+)/;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const match = trimmedLine.match(pattern);
            if (match) {
                products.push({
                    code: match[1].toUpperCase(),
                    quantity: parseInt(match[2], 10),
                    price: parseInt(match[3], 10)
                });
            }
        }

        console.log('[KPI] Parsed note products:', products);
        return products;
    }

    /**
     * 5. Calculate KPI difference between BASE and Note products
     *
     * Rules:
     * - New product (not in BASE): +1 difference
     * - Removed product (in BASE, not in Note): +1 difference
     * - Quantity difference: +|delta| difference
     * - Exact match: 0 difference
     *
     * @param {Array} baseProducts - BASE products [{code, quantity, price}]
     * @param {Array} noteProducts - Note products [{code, quantity, price}]
     * @returns {object} - {totalDifferences, details: [{code, baseQty, noteQty, diff, type}]}
     */
    function calculateKPIDifference(baseProducts, noteProducts) {
        const result = {
            totalDifferences: 0,
            details: []
        };

        if (!Array.isArray(baseProducts)) baseProducts = [];
        if (!Array.isArray(noteProducts)) noteProducts = [];

        // Create maps for easy lookup (uppercase code as key)
        const baseMap = new Map();
        baseProducts.forEach(p => {
            const code = (p.code || '').toUpperCase();
            if (code) {
                baseMap.set(code, p.quantity || 0);
            }
        });

        const noteMap = new Map();
        noteProducts.forEach(p => {
            const code = (p.code || '').toUpperCase();
            if (code) {
                noteMap.set(code, p.quantity || 0);
            }
        });

        // Check products in BASE
        for (const [code, baseQty] of baseMap) {
            const noteQty = noteMap.get(code) || 0;

            if (noteQty === 0) {
                // Product removed (in BASE but not in Note)
                result.details.push({
                    code,
                    baseQty,
                    noteQty: 0,
                    diff: baseQty,
                    type: 'removed'
                });
                result.totalDifferences += baseQty;
            } else if (noteQty !== baseQty) {
                // Quantity changed
                const diff = Math.abs(noteQty - baseQty);
                result.details.push({
                    code,
                    baseQty,
                    noteQty,
                    diff,
                    type: noteQty > baseQty ? 'increased' : 'decreased'
                });
                result.totalDifferences += diff;
            } else {
                // Exact match
                result.details.push({
                    code,
                    baseQty,
                    noteQty,
                    diff: 0,
                    type: 'match'
                });
            }
        }

        // Check new products (in Note but not in BASE)
        for (const [code, noteQty] of noteMap) {
            if (!baseMap.has(code)) {
                result.details.push({
                    code,
                    baseQty: 0,
                    noteQty,
                    diff: noteQty,
                    type: 'added'
                });
                result.totalDifferences += noteQty;
            }
        }

        console.log('[KPI] Calculated differences:', result);
        return result;
    }

    /**
     * 6. Calculate KPI amount from differences
     * @param {number} differences - Number of product differences
     * @returns {number} - KPI amount in VNĐ
     */
    function calculateKPIAmount(differences) {
        const amount = (differences || 0) * KPI_AMOUNT_PER_DIFFERENCE;
        console.log(`[KPI] Amount: ${differences} × ${KPI_AMOUNT_PER_DIFFERENCE} = ${amount} VNĐ`);
        return amount;
    }

    /**
     * 7. Save KPI Statistics to Firebase
     * @param {string} userId - User ID
     * @param {string} date - Date in format YYYY-MM-DD
     * @param {object} statistics - {orderId, stt, differences, kpi, details}
     * @returns {Promise<void>}
     */
    async function saveKPIStatistics(userId, date, statistics) {
        if (!userId || !date || !statistics) {
            throw new Error('userId, date, and statistics are required');
        }

        try {
            if (!window.firebase || !window.firebase.database) {
                throw new Error('Firebase not available');
            }

            const statsRef = window.firebase.database()
                .ref(`${KPI_STATISTICS_COLLECTION}/${userId}/${date}`);

            // Get current statistics for this user/date
            const snapshot = await statsRef.once('value');
            let currentStats = snapshot.val() || {
                totalDifferences: 0,
                totalKPI: 0,
                orders: []
            };

            // Check if order already exists in statistics
            const existingOrderIndex = currentStats.orders.findIndex(
                o => o.orderId === statistics.orderId
            );

            if (existingOrderIndex >= 0) {
                // Update existing order stats
                const oldOrder = currentStats.orders[existingOrderIndex];
                currentStats.totalDifferences -= oldOrder.differences || 0;
                currentStats.totalKPI -= oldOrder.kpi || 0;

                currentStats.orders[existingOrderIndex] = {
                    orderId: statistics.orderId,
                    stt: statistics.stt,
                    differences: statistics.differences,
                    kpi: statistics.kpi,
                    details: statistics.details || [],
                    timestamp: window.firebase.database.ServerValue.TIMESTAMP
                };
            } else {
                // Add new order to statistics
                currentStats.orders.push({
                    orderId: statistics.orderId,
                    stt: statistics.stt,
                    differences: statistics.differences,
                    kpi: statistics.kpi,
                    details: statistics.details || [],
                    timestamp: window.firebase.database.ServerValue.TIMESTAMP
                });
            }

            // Recalculate totals
            currentStats.totalDifferences += statistics.differences || 0;
            currentStats.totalKPI += statistics.kpi || 0;

            // Save updated statistics
            await statsRef.set(currentStats);

            console.log('[KPI] ✓ Saved statistics:', {
                userId,
                date,
                totalDifferences: currentStats.totalDifferences,
                totalKPI: currentStats.totalKPI,
                ordersCount: currentStats.orders.length
            });

        } catch (error) {
            console.error('[KPI] Error saving statistics:', error);
            throw error;
        }
    }

    /**
     * Helper: Get current date in YYYY-MM-DD format
     * @returns {string}
     */
    function getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Helper: Show KPI confirmation popup and handle BASE saving
     * Called from confirmHeldProduct() when confirming first product
     * @param {string} orderId - Order ID
     * @param {number} stt - Order STT
     * @param {Array} mainProducts - Current main products
     * @returns {Promise<boolean>} - true if BASE was saved
     */
    async function promptAndSaveKPIBase(orderId, stt, mainProducts) {
        try {
            // Check if BASE already exists
            const hasBase = await checkKPIBaseExists(orderId);

            if (hasBase) {
                console.log('[KPI] BASE already exists, skipping prompt');
                return false;
            }

            // Show confirmation popup
            let confirmed = false;
            const message = 'Bạn có muốn tính KPI từ lúc này?\n\n' +
                'Hệ thống sẽ lưu danh sách sản phẩm hiện tại làm BASE để so sánh.';

            if (window.CustomPopup) {
                confirmed = await window.CustomPopup.confirm(message, 'Xác nhận tính KPI');
            } else {
                confirmed = confirm(message);
            }

            if (!confirmed) {
                console.log('[KPI] User declined KPI tracking');
                return false;
            }

            // Get user ID
            let userId = null;
            if (window.authManager) {
                const auth = window.authManager.getAuthState();
                if (auth) {
                    userId = auth.id || auth.Id || auth.username || auth.userType;
                    if (!userId && auth.displayName) {
                        userId = auth.displayName.replace(/[.#$/\[\]]/g, '_');
                    }
                }
            }

            if (!userId) {
                console.warn('[KPI] No userId found, cannot save BASE');
                return false;
            }

            // Save BASE
            await saveKPIBase(orderId, userId, stt, mainProducts);

            // Show success notification
            if (window.notificationManager) {
                window.notificationManager.show('✓ Đã lưu BASE để tính KPI', 'success');
            }

            return true;

        } catch (error) {
            console.error('[KPI] Error in promptAndSaveKPIBase:', error);
            return false;
        }
    }

    /**
     * Helper: Calculate and save KPI for an order
     * Call this when order is completed/updated
     * @param {string} orderId - Order ID
     * @param {string} noteText - Order note containing products
     * @returns {Promise<object|null>} - KPI result or null
     */
    async function calculateAndSaveKPI(orderId, noteText) {
        try {
            // Get BASE
            const base = await getKPIBase(orderId);
            if (!base) {
                console.log('[KPI] No BASE found, skipping KPI calculation');
                return null;
            }

            // Parse note products
            const noteProducts = parseNoteProducts(noteText);

            // Calculate differences
            const diffResult = calculateKPIDifference(base.products, noteProducts);

            // Calculate KPI amount
            const kpiAmount = calculateKPIAmount(diffResult.totalDifferences);

            // Get user ID and date
            const userId = base.userId;
            const date = getCurrentDateString();

            // Save statistics
            await saveKPIStatistics(userId, date, {
                orderId: orderId,
                stt: base.stt,
                differences: diffResult.totalDifferences,
                kpi: kpiAmount,
                details: diffResult.details
            });

            return {
                orderId,
                stt: base.stt,
                differences: diffResult.totalDifferences,
                kpi: kpiAmount,
                details: diffResult.details
            };

        } catch (error) {
            console.error('[KPI] Error calculating KPI:', error);
            return null;
        }
    }

    // Export functions to window
    window.kpiManager = {
        // Core 7 functions
        checkKPIBaseExists,
        saveKPIBase,
        getKPIBase,
        parseNoteProducts,
        calculateKPIDifference,
        calculateKPIAmount,
        saveKPIStatistics,

        // Helper functions
        getCurrentDateString,
        promptAndSaveKPIBase,
        calculateAndSaveKPI,

        // Constants
        KPI_AMOUNT_PER_DIFFERENCE
    };

    console.log('[KPI] ✓ KPI Manager initialized');

})();
