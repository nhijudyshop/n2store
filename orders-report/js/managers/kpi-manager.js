/**
 * KPI Manager - Quản lý tính KPI dựa trên NET sản phẩm mới (upselling)
 * REFACTORED: AUTO BASE + NET KPI per product + Employee Range + Reconciliation
 *
 * Flow:
 * 1. Bulk Message Sender hoàn tất → saveAutoBaseSnapshot() tự động lưu BASE
 * 2. Nhân viên thao tác SP → Audit Log ghi lại (qua kpi-audit-logger.js)
 * 3. Sau mỗi thao tác → recalculateAndSaveKPI() tính NET KPI
 * 4. NET KPI = chỉ tính SP MỚI (không trong BASE), net per product = add - remove (min 0)
 * 5. Tổng KPI = SUM(net per product) × 5,000 VNĐ
 *
 * Firestore Structure:
 * - kpi_base/{orderId} - BASE snapshot (auto-saved, immutable)
 * - kpi_audit_log/{auto-id} - Audit log (append-only, via kpi-audit-logger.js)
 * - kpi_statistics/{userId}/dates/{date} - KPI statistics
 * - report_order_details/{campaignName} - Order details (synced from TPOS)
 * - settings/employee_ranges - General employee ranges
 * - settings/employee_ranges_by_campaign - Campaign-specific employee ranges
 */

(function () {
    'use strict';

    const KPI_BASE_COLLECTION = 'kpi_base';
    const KPI_STATISTICS_COLLECTION = 'kpi_statistics';
    const KPI_AMOUNT_PER_DIFFERENCE = 5000; // 5,000 VNĐ per net product

    // ========================================
    // HELPER: Sleep for exponential backoff
    // ========================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================
    // HELPER: Check if user is admin
    // ========================================
    function isAdminUser(userId) {
        try {
            if (window.authManager) {
                const auth = window.authManager.getAuthState();
                if (auth && (auth.id === userId || auth.Id === userId || auth.username === userId)) {
                    return auth.role === 'admin' || auth.userType === 'admin';
                }
            }
        } catch (e) {
            console.warn('[KPI] Error checking admin status:', e);
        }
        return false;
    }

    // ========================================
    // KEPT: checkKPIBaseExists (unchanged)
    // ========================================
    /**
     * Check if KPI BASE exists for an order
     * @param {string} orderId - Order ID
     * @returns {Promise<boolean>} - true if BASE exists
     */
    async function checkKPIBaseExists(orderId) {
        if (!orderId) {
            console.warn('[KPI] checkKPIBaseExists: No orderId provided');
            return false;
        }

        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('[KPI] Firestore not available');
                return false;
            }

            const doc = await window.firebase.firestore()
                .collection(KPI_BASE_COLLECTION)
                .doc(orderId)
                .get();

            const exists = doc.exists;
            console.log(`[KPI] checkKPIBaseExists(${orderId}):`, exists);
            return exists;
        } catch (error) {
            console.error('[KPI] Error checking BASE exists:', error);
            return false;
        }
    }

    // ========================================
    // KEPT: getKPIBase (unchanged)
    // ========================================
    /**
     * Get KPI BASE from Firestore
     * @param {string} orderId - Order ID
     * @returns {Promise<object|null>} - BASE data or null if not exists
     */
    async function getKPIBase(orderId) {
        if (!orderId) {
            console.warn('[KPI] getKPIBase: No orderId provided');
            return null;
        }

        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('[KPI] Firestore not available');
                return null;
            }

            const doc = await window.firebase.firestore()
                .collection(KPI_BASE_COLLECTION)
                .doc(orderId)
                .get();

            if (!doc.exists) {
                console.log(`[KPI] No BASE found for order: ${orderId}`);
                return null;
            }

            const data = doc.data();
            console.log(`[KPI] Got BASE for order ${orderId}:`, data);
            return data;
        } catch (error) {
            console.error('[KPI] Error getting BASE:', error);
            return null;
        }
    }

    // ========================================
    // KEPT: getOrderDetailsFromFirebase (unchanged)
    // ========================================
    /**
     * Get order Details from report_order_details Firestore
     * @param {string} orderId - Order ID
     * @param {string} campaignName - Campaign/table name
     * @returns {Promise<Array|null>} - Array of order products or null
     */
    async function getOrderDetailsFromFirebase(orderId, campaignName) {
        if (!orderId || !campaignName) {
            console.warn('[KPI] getOrderDetailsFromFirebase: Missing orderId or campaignName');
            return null;
        }

        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('[KPI] Firestore not available');
                return null;
            }

            const safeTableName = campaignName.replace(/[.$#\[\]\/]/g, '_');

            const doc = await window.firebase.firestore()
                .collection('report_order_details')
                .doc(safeTableName)
                .get();

            if (!doc.exists) {
                console.log(`[KPI] No report data found for campaign: ${campaignName}`);
                return null;
            }

            const data = doc.data();
            const orders = data.orders || [];

            const order = orders.find(o => o.Id === orderId || o.id === orderId);

            if (!order) {
                console.log(`[KPI] Order ${orderId} not found in campaign ${campaignName}`);
                return null;
            }

            const details = (order.Details || []).map(d => ({
                code: d.ProductCode || d.Code || d.DefaultCode || '',
                quantity: d.Quantity || 1,
                price: d.Price || 0,
                productId: d.ProductId || null,
                productName: d.ProductName || d.Name || ''
            })).filter(d => d.code);

            console.log(`[KPI] Got order details from Firestore:`, {
                orderId,
                campaignName,
                productsCount: details.length
            });

            return details;

        } catch (error) {
            console.error('[KPI] Error getting order details from Firestore:', error);
            return null;
        }
    }

    // ========================================
    // KEPT: getCurrentDateString (unchanged)
    // ========================================
    /**
     * Get current date in YYYY-MM-DD format
     * @returns {string}
     */
    function getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // ========================================
    // KEPT: saveKPIStatistics (unchanged)
    // ========================================
    /**
     * Save KPI Statistics to Firestore
     * Structure: kpi_statistics/{userId}/dates/{date}
     * @param {string} userId - User ID
     * @param {string} date - Date in format YYYY-MM-DD
     * @param {object} statistics - KPI statistics object
     * @returns {Promise<void>}
     */
    async function saveKPIStatistics(userId, date, statistics) {
        if (!userId || !date || !statistics) {
            throw new Error('userId, date, and statistics are required');
        }

        try {
            if (!window.firebase || !window.firebase.firestore) {
                throw new Error('Firestore not available');
            }

            const statsRef = window.firebase.firestore()
                .collection(KPI_STATISTICS_COLLECTION)
                .doc(userId)
                .collection('dates')
                .doc(date);

            const doc = await statsRef.get();
            let currentStats = doc.exists ? doc.data() : {
                totalNetProducts: 0,
                totalKPI: 0,
                orders: []
            };

            // Ensure we have the new field names
            if (currentStats.totalDifferences !== undefined && currentStats.totalNetProducts === undefined) {
                currentStats.totalNetProducts = currentStats.totalDifferences;
                delete currentStats.totalDifferences;
            }

            const existingOrderIndex = currentStats.orders.findIndex(
                o => o.orderId === statistics.orderId
            );

            if (existingOrderIndex >= 0) {
                const oldOrder = currentStats.orders[existingOrderIndex];
                currentStats.totalNetProducts -= oldOrder.netProducts || oldOrder.differences || 0;
                currentStats.totalKPI -= oldOrder.kpi || 0;

                currentStats.orders[existingOrderIndex] = {
                    orderId: statistics.orderId,
                    stt: statistics.stt,
                    campaignId: statistics.campaignId || null,
                    campaignName: statistics.campaignName || null,
                    netProducts: statistics.netProducts || 0,
                    kpi: statistics.kpi || 0,
                    hasDiscrepancy: statistics.hasDiscrepancy || false,
                    details: statistics.details || {},
                    updatedAt: new Date().toISOString()
                };
            } else {
                currentStats.orders.push({
                    orderId: statistics.orderId,
                    stt: statistics.stt,
                    campaignId: statistics.campaignId || null,
                    campaignName: statistics.campaignName || null,
                    netProducts: statistics.netProducts || 0,
                    kpi: statistics.kpi || 0,
                    hasDiscrepancy: statistics.hasDiscrepancy || false,
                    details: statistics.details || {},
                    updatedAt: new Date().toISOString()
                });
            }

            currentStats.totalNetProducts += statistics.netProducts || 0;
            currentStats.totalKPI += statistics.kpi || 0;
            currentStats.updatedAt = window.firebase.firestore.FieldValue.serverTimestamp();

            await statsRef.set(currentStats, { merge: true });

            // Ensure parent document exists so loadAllStatistics can list users
            const parentRef = window.firebase.firestore()
                .collection(KPI_STATISTICS_COLLECTION)
                .doc(userId);
            await parentRef.set({
                lastUpdated: window.firebase.firestore.FieldValue.serverTimestamp(),
                userId: userId
            }, { merge: true });

            console.log('[KPI] ✓ Saved statistics:', {
                userId,
                date,
                totalNetProducts: currentStats.totalNetProducts,
                totalKPI: currentStats.totalKPI,
                ordersCount: currentStats.orders.length
            });

        } catch (error) {
            console.error('[KPI] Error saving statistics:', error);
            throw error;
        }
    }

    // ========================================
    // NEW: saveAutoBaseSnapshot
    // ========================================
    /**
     * Auto-save BASE snapshot for multiple orders after bulk message send.
     * Reads products from report_order_details, fallback to local data.
     * Skips orders that already have a BASE. Retry 3 times with exponential backoff.
     *
     * @param {Array} successOrders - Array of successful orders from sendingState
     *   Each order: { Id/id, STT/stt, Details/products, ... }
     * @param {string} campaignName - Campaign name
     * @param {string} userId - User ID who triggered the bulk send
     * @returns {Promise<{saved: number, skipped: number, failed: number}>}
     */
    async function saveAutoBaseSnapshot(successOrders, campaignName, userId) {
        if (!Array.isArray(successOrders) || successOrders.length === 0) {
            console.warn('[KPI] saveAutoBaseSnapshot: No orders provided');
            return { saved: 0, skipped: 0, failed: 0 };
        }

        if (!window.firebase || !window.firebase.firestore) {
            console.error('[KPI] Firestore not available for saveAutoBaseSnapshot');
            return { saved: 0, skipped: 0, failed: successOrders.length };
        }

        // Get user info
        let userName = 'Unknown';
        if (window.authManager) {
            const auth = window.authManager.getAuthState();
            if (auth) {
                userName = auth.displayName || auth.userType || auth.username || 'Unknown';
            }
        }

        // Get campaign info
        let campaignId = null;
        if (window.campaignManager && window.campaignManager.activeCampaign) {
            campaignId = window.campaignManager.activeCampaignId;
        }
        if (!campaignName && window.campaignManager && window.campaignManager.activeCampaign) {
            campaignName = window.campaignManager.activeCampaign.name ||
                window.campaignManager.activeCampaign.displayName;
        }

        // Try to load report_order_details for this campaign (bulk read once)
        let reportOrdersMap = {};
        try {
            const safeTableName = (campaignName || '').replace(/[.$#\[\]\/]/g, '_');
            if (safeTableName) {
                const doc = await window.firebase.firestore()
                    .collection('report_order_details')
                    .doc(safeTableName)
                    .get();
                if (doc.exists) {
                    const data = doc.data();
                    (data.orders || []).forEach(o => {
                        const oid = o.Id || o.id;
                        if (oid) reportOrdersMap[oid] = o;
                    });
                }
            }
        } catch (e) {
            console.warn('[KPI] Could not load report_order_details, will use local data:', e);
        }

        let saved = 0;
        let skipped = 0;
        let failed = 0;

        // Process orders in batches (Firestore batch limit = 500)
        const BATCH_SIZE = 400;
        const db = window.firebase.firestore();

        for (let i = 0; i < successOrders.length; i += BATCH_SIZE) {
            const chunk = successOrders.slice(i, i + BATCH_SIZE);

            // Check which orders already have BASE (batch read)
            const orderIds = chunk.map(o => String(o.Id || o.id || '')).filter(Boolean);
            const existingBases = new Set();

            // Read existing bases in chunks of 10 (Firestore 'in' query limit)
            for (let j = 0; j < orderIds.length; j += 10) {
                const idChunk = orderIds.slice(j, j + 10);
                try {
                    const snapshot = await db.collection(KPI_BASE_COLLECTION)
                        .where(window.firebase.firestore.FieldPath.documentId(), 'in', idChunk)
                        .get();
                    snapshot.forEach(doc => existingBases.add(doc.id));
                } catch (e) {
                    console.warn('[KPI] Error checking existing bases:', e);
                }
            }

            // Retry logic with exponential backoff
            const maxRetries = 3;
            let attempt = 0;
            let batchSuccess = false;

            while (attempt < maxRetries && !batchSuccess) {
                attempt++;
                try {
                    const batch = db.batch();
                    let batchCount = 0;

                    for (const order of chunk) {
                        const orderId = String(order.Id || order.id || '');
                        if (!orderId) continue;

                        // Skip if BASE already exists
                        if (existingBases.has(orderId)) {
                            skipped++;
                            continue;
                        }

                        // Get products: prefer report_order_details, fallback to local
                        let products = [];
                        const reportOrder = reportOrdersMap[orderId];
                        if (reportOrder && reportOrder.Details && reportOrder.Details.length > 0) {
                            products = reportOrder.Details.map(d => ({
                                ProductId: d.ProductId || null,
                                ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                                ProductName: d.ProductName || d.Name || '',
                                Quantity: d.Quantity || 1,
                                Price: d.Price || 0
                            })).filter(p => p.ProductCode);
                        } else {
                            // Fallback to local data from successOrders
                            const localProducts = order.Details || order.products || order.mainProducts || [];
                            products = localProducts.map(p => ({
                                ProductId: p.ProductId || null,
                                ProductCode: p.ProductCode || p.Code || p.DefaultCode || '',
                                ProductName: p.ProductName || p.Name || '',
                                Quantity: p.Quantity || 1,
                                Price: p.Price || 0
                            })).filter(p => p.ProductCode);
                        }

                        const baseData = {
                            orderId: orderId,
                            campaignId: campaignId,
                            campaignName: campaignName,
                            timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
                            userId: userId,
                            userName: userName,
                            stt: order.STT || order.stt || 0,
                            products: products
                        };

                        const docRef = db.collection(KPI_BASE_COLLECTION).doc(orderId);
                        batch.set(docRef, baseData);
                        batchCount++;
                    }

                    if (batchCount > 0) {
                        await batch.commit();
                        saved += batchCount;
                    }
                    batchSuccess = true;

                } catch (error) {
                    console.error(`[KPI] saveAutoBaseSnapshot batch attempt ${attempt}/${maxRetries} failed:`, error);
                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                        console.log(`[KPI] Retrying in ${delay}ms...`);
                        await sleep(delay);
                    } else {
                        failed += chunk.length - skipped;
                        console.error('[KPI] ⚠️ saveAutoBaseSnapshot failed after all retries');
                    }
                }
            }
        }

        console.log('[KPI] ✓ saveAutoBaseSnapshot complete:', { saved, skipped, failed });
        return { saved, skipped, failed };
    }

    // ========================================
    // NEW: calculateNetKPI
    // ========================================
    /**
     * Calculate NET KPI for an order based on audit logs.
     * Only counts NEW products (not in BASE). Net per product = add - remove (min 0).
     * Filters by employee range. Excludes admin actions.
     *
     * @param {string} orderId - Order ID
     * @param {string} [employeeUserId] - Optional employee user ID to filter audit logs
     * @returns {Promise<{netProducts: number, kpiAmount: number, details: object, baseProductCount: number}>}
     */
    async function calculateNetKPI(orderId, employeeUserId) {
        const emptyResult = { netProducts: 0, kpiAmount: 0, details: {}, baseProductCount: 0 };

        if (!orderId) {
            console.warn('[KPI] calculateNetKPI: No orderId provided');
            return emptyResult;
        }

        try {
            // 1. Get BASE snapshot
            const base = await getKPIBase(orderId);
            if (!base) {
                console.log('[KPI] calculateNetKPI: No BASE found, KPI = 0');
                return emptyResult;
            }

            // 2. Build set of BASE product IDs
            const baseProductIds = new Set();
            (base.products || []).forEach(p => {
                const pid = p.ProductId || p.productId;
                if (pid) baseProductIds.add(Number(pid));
            });

            // 3. Get audit logs for this order
            let auditLogs = [];
            if (window.kpiAuditLogger && window.kpiAuditLogger.getAuditLogsForOrder) {
                auditLogs = await window.kpiAuditLogger.getAuditLogsForOrder(orderId);
            } else {
                // Fallback: query Firestore directly (with index fallback)
                try {
                    const snapshot = await window.firebase.firestore()
                        .collection('kpi_audit_log')
                        .where('orderId', '==', orderId)
                        .orderBy('timestamp', 'asc')
                        .get();
                    auditLogs = snapshot.docs.map(doc => doc.data());
                } catch (e) {
                    console.warn('[KPI] Composite index query failed, using fallback:', e.message);
                    try {
                        const fallbackSnapshot = await window.firebase.firestore()
                            .collection('kpi_audit_log')
                            .where('orderId', '==', orderId)
                            .get();
                        auditLogs = fallbackSnapshot.docs.map(doc => doc.data());
                        auditLogs.sort((a, b) => {
                            const tsA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : 0;
                            const tsB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : 0;
                            return tsA - tsB;
                        });
                    } catch (fallbackErr) {
                        console.error('[KPI] Fallback audit log query also failed:', fallbackErr);
                    }
                }
            }

            // 4. Filter by employee if specified
            if (employeeUserId) {
                auditLogs = auditLogs.filter(log => log.userId === employeeUserId);
            }

            // 5. NOTE: Admin filter removed - admin's own product actions
            // should count toward KPI when admin is the BASE owner.
            // Previously filtered out all admin actions, causing KPI = 0 for admins.

            // 6. Only keep logs for NEW products (not in BASE)
            const newProductLogs = auditLogs.filter(log => {
                const pid = Number(log.productId);
                return !baseProductIds.has(pid);
            });

            // 7. Group by productId, calculate net per product
            const netPerProduct = {};
            for (const log of newProductLogs) {
                const pid = String(log.productId);
                if (!netPerProduct[pid]) {
                    netPerProduct[pid] = {
                        code: log.productCode || '',
                        name: log.productName || '',
                        added: 0,
                        removed: 0,
                        net: 0
                    };
                }
                if (log.action === 'add') {
                    netPerProduct[pid].added += (log.quantity || 0);
                } else if (log.action === 'remove') {
                    netPerProduct[pid].removed += (log.quantity || 0);
                }
            }

            // 8. Calculate net (min 0 per product) and total
            let totalNet = 0;
            for (const pid of Object.keys(netPerProduct)) {
                const data = netPerProduct[pid];
                data.net = Math.max(0, data.added - data.removed);
                totalNet += data.net;
            }

            const kpiAmount = totalNet * KPI_AMOUNT_PER_DIFFERENCE;

            console.log('[KPI] calculateNetKPI result:', {
                orderId,
                employeeUserId,
                baseProductCount: baseProductIds.size,
                newProductsTracked: Object.keys(netPerProduct).length,
                totalNet,
                kpiAmount
            });

            return {
                netProducts: totalNet,
                kpiAmount: kpiAmount,
                details: netPerProduct,
                baseProductCount: baseProductIds.size
            };

        } catch (error) {
            console.error('[KPI] Error in calculateNetKPI:', error);
            return emptyResult;
        }
    }

    // ========================================
    // NEW: recalculateAndSaveKPI
    // ========================================
    /**
     * Recalculate NET KPI for an order and save to kpi_statistics.
     * Called after each product action (audit log) to update KPI realtime.
     *
     * @param {string} orderId - Order ID
     * @returns {Promise<{netProducts: number, kpiAmount: number}|null>}
     */
    async function recalculateAndSaveKPI(orderId) {
        try {
            // Get BASE to determine the employee userId
            const base = await getKPIBase(orderId);
            if (!base) {
                console.log('[KPI] recalculateAndSaveKPI: No BASE, skipping');
                return null;
            }

            const employeeUserId = base.userId;
            if (!employeeUserId) {
                console.warn('[KPI] recalculateAndSaveKPI: No userId in BASE');
                return null;
            }

            // Calculate NET KPI
            const result = await calculateNetKPI(orderId, employeeUserId);

            // Save to kpi_statistics
            const date = getCurrentDateString();
            await saveKPIStatistics(employeeUserId, date, {
                orderId: orderId,
                stt: base.stt || 0,
                campaignId: base.campaignId || null,
                campaignName: base.campaignName || null,
                netProducts: result.netProducts,
                kpi: result.kpiAmount,
                hasDiscrepancy: false,
                details: result.details
            });

            console.log('[KPI] ✓ recalculateAndSaveKPI:', {
                orderId,
                netProducts: result.netProducts,
                kpiAmount: result.kpiAmount
            });

            // Update KPI badge + show toast (non-blocking)
            try {
                updateKPIBadge(orderId, result.netProducts, result.kpiAmount, true);
                showKPIToast(result.netProducts, result.kpiAmount);
            } catch (uiErr) {
                console.warn('[KPI] Badge/toast update failed (non-blocking):', uiErr);
            }

            return {
                netProducts: result.netProducts,
                kpiAmount: result.kpiAmount
            };

        } catch (error) {
            console.error('[KPI] Error in recalculateAndSaveKPI:', error);
            return null;
        }
    }

    // ========================================
    // NEW: isOrderInEmployeeRange
    // ========================================
    /**
     * Check if an order STT falls within an employee's assigned range.
     * Priority: campaign-specific range > general range.
     *
     * @param {number} orderSTT - Order sequential number
     * @param {string} userId - Employee user ID
     * @param {string} [campaignName] - Campaign name (for campaign-specific ranges)
     * @returns {Promise<boolean>} - true if order is in employee's range
     */
    async function isOrderInEmployeeRange(orderSTT, userId, campaignName) {
        if (!orderSTT || !userId) {
            return false;
        }

        try {
            if (!window.firebase || !window.firebase.firestore) {
                console.warn('[KPI] Firestore not available');
                return false;
            }

            const db = window.firebase.firestore();

            // 1. Try campaign-specific ranges first (priority)
            if (campaignName) {
                try {
                    const campaignRangesDoc = await db
                        .collection('settings')
                        .doc('employee_ranges_by_campaign')
                        .get();

                    if (campaignRangesDoc.exists) {
                        const data = campaignRangesDoc.data();
                        const campaignRanges = data[campaignName] || data[campaignName.replace(/[.$#\[\]\/]/g, '_')];

                        if (campaignRanges) {
                            const employeeRange = campaignRanges[userId];
                            if (employeeRange) {
                                const from = employeeRange.from || employeeRange.start || 0;
                                const to = employeeRange.to || employeeRange.end || Infinity;
                                const inRange = orderSTT >= from && orderSTT <= to;
                                console.log(`[KPI] isOrderInEmployeeRange (campaign): STT=${orderSTT}, range=${from}-${to}, inRange=${inRange}`);
                                return inRange;
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[KPI] Error reading campaign-specific ranges:', e);
                }
            }

            // 2. Fallback to general employee ranges
            try {
                const generalRangesDoc = await db
                    .collection('settings')
                    .doc('employee_ranges')
                    .get();

                if (generalRangesDoc.exists) {
                    const data = generalRangesDoc.data();
                    const employeeRange = data[userId];

                    if (employeeRange) {
                        const from = employeeRange.from || employeeRange.start || 0;
                        const to = employeeRange.to || employeeRange.end || Infinity;
                        const inRange = orderSTT >= from && orderSTT <= to;
                        console.log(`[KPI] isOrderInEmployeeRange (general): STT=${orderSTT}, range=${from}-${to}, inRange=${inRange}`);
                        return inRange;
                    }
                }
            } catch (e) {
                console.warn('[KPI] Error reading general employee ranges:', e);
            }

            // No range found for this employee
            console.log(`[KPI] No employee range found for userId=${userId}`);
            return false;

        } catch (error) {
            console.error('[KPI] Error in isOrderInEmployeeRange:', error);
            return false;
        }
    }

    // ========================================
    // NEW: reconcileKPI
    // ========================================
    /**
     * Reconcile KPI for an order: compare expected state (BASE + audit log)
     * vs actual state (TPOS API via report_order_details).
     *
     * @param {string} orderId - Order ID
     * @param {string} campaignName - Campaign name
     * @returns {Promise<{orderId: string, hasDiscrepancy: boolean, expected: object, actual: object, discrepancies: Array}>}
     */
    async function reconcileKPI(orderId, campaignName) {
        const result = {
            orderId: orderId,
            hasDiscrepancy: false,
            expected: {},
            actual: {},
            discrepancies: []
        };

        try {
            // 1. Get BASE
            const base = await getKPIBase(orderId);
            if (!base) {
                result.hasDiscrepancy = true;
                result.discrepancies.push({ type: 'no_base', message: 'No BASE snapshot found' });
                return result;
            }

            // 2. Build expected state from BASE + audit logs
            const expectedProducts = {};
            (base.products || []).forEach(p => {
                const pid = String(p.ProductId || p.productId);
                if (pid) {
                    expectedProducts[pid] = {
                        code: p.ProductCode || p.code || '',
                        name: p.ProductName || p.productName || '',
                        quantity: p.Quantity || p.quantity || 0
                    };
                }
            });

            // Get audit logs
            let auditLogs = [];
            if (window.kpiAuditLogger && window.kpiAuditLogger.getAuditLogsForOrder) {
                auditLogs = await window.kpiAuditLogger.getAuditLogsForOrder(orderId);
            } else {
                try {
                    const snapshot = await window.firebase.firestore()
                        .collection('kpi_audit_log')
                        .where('orderId', '==', orderId)
                        .orderBy('timestamp', 'asc')
                        .get();
                    auditLogs = snapshot.docs.map(doc => doc.data());
                } catch (e) {
                    console.warn('[KPI] Composite index query failed in reconcile, using fallback:', e.message);
                    try {
                        const fallbackSnapshot = await window.firebase.firestore()
                            .collection('kpi_audit_log')
                            .where('orderId', '==', orderId)
                            .get();
                        auditLogs = fallbackSnapshot.docs.map(doc => doc.data());
                        auditLogs.sort((a, b) => {
                            const tsA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : 0;
                            const tsB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : 0;
                            return tsA - tsB;
                        });
                    } catch (fallbackErr) {
                        console.error('[KPI] Fallback audit log query also failed in reconcile:', fallbackErr);
                    }
                }
            }

            // Apply audit logs to expected state
            for (const log of auditLogs) {
                const pid = String(log.productId);
                if (!expectedProducts[pid]) {
                    expectedProducts[pid] = {
                        code: log.productCode || '',
                        name: log.productName || '',
                        quantity: 0
                    };
                }
                if (log.action === 'add') {
                    expectedProducts[pid].quantity += (log.quantity || 0);
                } else if (log.action === 'remove') {
                    expectedProducts[pid].quantity -= (log.quantity || 0);
                    if (expectedProducts[pid].quantity < 0) {
                        expectedProducts[pid].quantity = 0;
                    }
                }
            }

            result.expected = expectedProducts;

            // 3. Get actual state from report_order_details
            const actualProducts = {};
            const targetCampaign = campaignName || base.campaignName;
            if (targetCampaign) {
                const orderDetails = await getOrderDetailsFromFirebase(orderId, targetCampaign);
                if (orderDetails) {
                    orderDetails.forEach(p => {
                        const pid = String(p.productId);
                        if (pid) {
                            actualProducts[pid] = {
                                code: p.code || '',
                                name: p.productName || '',
                                quantity: p.quantity || 0
                            };
                        }
                    });
                }
            }

            result.actual = actualProducts;

            // 4. Compare expected vs actual
            const allPids = new Set([
                ...Object.keys(expectedProducts),
                ...Object.keys(actualProducts)
            ]);

            for (const pid of allPids) {
                const exp = expectedProducts[pid] || { code: '', name: '', quantity: 0 };
                const act = actualProducts[pid] || { code: '', name: '', quantity: 0 };

                if (exp.quantity !== act.quantity) {
                    result.hasDiscrepancy = true;
                    result.discrepancies.push({
                        type: 'quantity_mismatch',
                        productId: pid,
                        productCode: exp.code || act.code,
                        productName: exp.name || act.name,
                        expectedQty: exp.quantity,
                        actualQty: act.quantity,
                        delta: act.quantity - exp.quantity
                    });
                }
            }

            console.log('[KPI] reconcileKPI result:', {
                orderId,
                hasDiscrepancy: result.hasDiscrepancy,
                discrepancyCount: result.discrepancies.length
            });

            return result;

        } catch (error) {
            console.error('[KPI] Error in reconcileKPI:', error);
            result.hasDiscrepancy = true;
            result.discrepancies.push({ type: 'error', message: error.message });
            return result;
        }
    }

    // ========================================
    // KEPT: calculateKPIForCampaign (updated to use NET KPI)
    // ========================================
    /**
     * Calculate KPI for all orders in a campaign that have BASE
     * @param {string} campaignName - Campaign name to calculate
     * @returns {Promise<{success: number, failed: number, results: Array}>}
     */
    async function calculateKPIForCampaign(campaignName) {
        if (!campaignName) {
            console.error('[KPI] No campaign name provided');
            return { success: 0, failed: 0, results: [] };
        }

        try {
            console.log('[KPI] Calculating KPI for campaign:', campaignName);

            const safeTableName = campaignName.replace(/[.$#\[\]\/]/g, '_');
            const campaignDoc = await window.firebase.firestore()
                .collection('report_order_details')
                .doc(safeTableName)
                .get();

            const campaignData = campaignDoc.exists ? campaignDoc.data() : null;
            if (!campaignData || !campaignData.orders) {
                console.log('[KPI] No orders found in campaign:', campaignName);
                return { success: 0, failed: 0, results: [] };
            }

            const campaignOrders = campaignData.orders;
            const results = [];
            let success = 0;
            let failed = 0;
            let skippedNoBase = 0;

            for (const order of campaignOrders) {
                const orderId = order.Id || order.id;
                if (!orderId) continue;

                try {
                    const result = await recalculateAndSaveKPI(orderId);
                    if (result) {
                        results.push({ orderId, ...result });
                        success++;
                    } else {
                        skippedNoBase++;
                    }
                } catch (e) {
                    console.error(`[KPI] Error calculating for order ${orderId}:`, e);
                    failed++;
                }
            }

            console.log('[KPI] Campaign KPI calculation complete:', {
                success, failed, skippedNoBase, totalOrders: campaignOrders.length
            });

            return { success, failed, skippedNoBase, results };

        } catch (error) {
            console.error('[KPI] Error in calculateKPIForCampaign:', error);
            return { success: 0, failed: 0, results: [] };
        }
    }

    // ========================================
    // KEPT: getKPIStatisticsByCampaign (unchanged)
    // ========================================
    /**
     * Get all KPI statistics filtered by campaign
     * @param {string} campaignName - Campaign name to filter
     * @returns {Promise<object>} - Statistics grouped by user
     */
    async function getKPIStatisticsByCampaign(campaignName) {
        try {
            const usersSnapshot = await window.firebase.firestore()
                .collection(KPI_STATISTICS_COLLECTION)
                .get();

            const filteredStats = {};

            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const datesSnapshot = await window.firebase.firestore()
                    .collection(KPI_STATISTICS_COLLECTION)
                    .doc(userId)
                    .collection('dates')
                    .get();

                const filteredDates = {};

                for (const dateDoc of datesSnapshot.docs) {
                    const date = dateDoc.id;
                    const dateStats = dateDoc.data();
                    const filteredOrders = (dateStats.orders || []).filter(
                        o => o.campaignName === campaignName
                    );

                    if (filteredOrders.length > 0) {
                        filteredDates[date] = {
                            ...dateStats,
                            orders: filteredOrders,
                            totalNetProducts: filteredOrders.reduce((sum, o) => sum + (o.netProducts || o.differences || 0), 0),
                            totalKPI: filteredOrders.reduce((sum, o) => sum + (o.kpi || 0), 0)
                        };
                    }
                }

                if (Object.keys(filteredDates).length > 0) {
                    filteredStats[userId] = filteredDates;
                }
            }

            return filteredStats;

        } catch (error) {
            console.error('[KPI] Error getting statistics by campaign:', error);
            return {};
        }
    }

    // ========================================
    // KPI Badge Display + Toast Notification
    // ========================================

    /**
     * Format currency in Vietnamese format
     * @param {number} amount
     * @returns {string}
     */
    function formatKPICurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    /**
     * Update KPI badge in chat order UI.
     * Shows "KPI: +X SP = Y VNĐ" if BASE exists and NET > 0,
     * "KPI: 0" if BASE exists but NET = 0,
     * "Chưa có BASE" if no BASE exists.
     *
     * @param {string} orderId - Order ID
     * @param {number} netProducts - NET product count
     * @param {number} kpiAmount - KPI amount in VNĐ
     * @param {boolean} hasBase - Whether BASE exists
     */
    function updateKPIBadge(orderId, netProducts, kpiAmount, hasBase) {
        try {
            const container = document.getElementById('kpiBadgeContainer');
            const badge = document.getElementById('kpiBadge');
            if (!container || !badge) return;

            container.style.display = 'block';

            if (!hasBase) {
                badge.textContent = 'Chưa có BASE';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#94a3b8';
            } else if (netProducts > 0) {
                badge.textContent = 'KPI: +' + netProducts + ' SP = ' + formatKPICurrency(kpiAmount);
                badge.style.background = '#dcfce7';
                badge.style.color = '#16a34a';
            } else {
                badge.textContent = 'KPI: 0';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#94a3b8';
            }
        } catch (e) {
            console.warn('[KPI] updateKPIBadge error (non-blocking):', e);
        }
    }

    /**
     * Show a toast notification when NET_KPI changes.
     * Text: "KPI đơn này: +X sản phẩm = Y VNĐ"
     * Auto-dismiss after 3 seconds.
     *
     * @param {number} netProducts
     * @param {number} kpiAmount
     */
    function showKPIToast(netProducts, kpiAmount) {
        try {
            if (netProducts <= 0) return; // Only show toast for positive KPI

            // Create toast container if not exists
            let toastContainer = document.getElementById('kpi-toast-container');
            if (!toastContainer) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'kpi-toast-container';
                toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(toastContainer);
            }

            // Create toast element
            const toast = document.createElement('div');
            toast.style.cssText = 'background:#16a34a;color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;opacity:0;transform:translateY(12px);transition:all 0.3s ease;';
            toast.textContent = 'KPI đơn này: +' + netProducts + ' sản phẩm = ' + formatKPICurrency(kpiAmount);

            toastContainer.appendChild(toast);

            // Animate in
            requestAnimationFrame(function () {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            // Auto-dismiss after 3 seconds
            setTimeout(function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(12px)';
                setTimeout(function () {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 300);
            }, 3000);
        } catch (e) {
            console.warn('[KPI] showKPIToast error (non-blocking):', e);
        }
    }

    /**
     * Initialize KPI badge for the current chat order.
     * Called when an order is loaded/displayed in chat.
     * Checks if BASE exists and displays appropriate badge.
     *
     * @param {string} orderId - Order ID
     */
    async function initKPIBadge(orderId) {
        try {
            if (!orderId) return;

            const hasBase = await checkKPIBaseExists(String(orderId));
            if (hasBase) {
                const result = await calculateNetKPI(String(orderId));
                updateKPIBadge(String(orderId), result.netProducts, result.kpiAmount, true);
            } else {
                updateKPIBadge(String(orderId), 0, 0, false);
            }
        } catch (e) {
            console.warn('[KPI] initKPIBadge error (non-blocking):', e);
        }
    }

    // ========================================
    // Export functions to window
    // ========================================
    window.kpiManager = {
        // Kept functions (unchanged API)
        checkKPIBaseExists,
        getKPIBase,
        getOrderDetailsFromFirebase,
        getCurrentDateString,
        saveKPIStatistics,

        // New functions (AUTO BASE + NET KPI)
        saveAutoBaseSnapshot,
        calculateNetKPI,
        recalculateAndSaveKPI,
        isOrderInEmployeeRange,
        reconcileKPI,

        // Campaign functions
        calculateKPIForCampaign,
        getKPIStatisticsByCampaign,

        // KPI Badge + Toast (UI)
        updateKPIBadge,
        showKPIToast,
        initKPIBadge,

        // Constants
        KPI_AMOUNT_PER_DIFFERENCE
    };

    console.log('[KPI] ✓ KPI Manager initialized (refactored: AUTO BASE + NET KPI)');

})();
