// Upload TPOS Tab JavaScript
(function () {
    'use strict';

    // State
    let assignments = [];
    let sessionIndexData = {}; // Group by SessionIndex
    let selectedSessionIndexes = new Set();
    let ordersData = []; // Orders data from tab1
    let productNotes = {}; // Store notes for each product: { "stt-productId": "note text" }
    let userStorageManager = null; // User-specific storage manager
    let currentViewMode = 'order'; // 'order' or 'product' - view mode for table

    // Firebase Configuration
    const firebaseConfig = {
        apiKey: "AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM",
        authDomain: "n2shop-69e37.firebaseapp.com",
        databaseURL: "https://n2shop-69e37-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "n2shop-69e37",
        storageBucket: "n2shop-69e37-ne0q1",
        messagingSenderId: "598906493303",
        appId: "1:598906493303:web:46d6236a1fdc2eff33e972",
        measurementId: "G-TEJH3S2T1D"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const database = firebase.database();

    // Get Firebase path for current user
    function getUserFirebasePath(basePath = 'productAssignments') {
        if (!userStorageManager) {
            userStorageManager = window.userStorageManager;
        }
        return userStorageManager ? userStorageManager.getUserFirebasePath(basePath) : `${basePath}/guest`;
    }

    // =====================================================
    // PRODUCT ENCODING/DECODING UTILITIES
    // =====================================================
    const ENCODE_KEY = 'live';
    const BASE_TIME = 1704067200000; // 2024-01-01 00:00:00 UTC

    /**
     * Base64URL encode - compact format without padding
     * @param {string} str - String to encode
     * @returns {string} Base64URL encoded string
     */
    function base64UrlEncode(str) {
        return btoa(String.fromCharCode(...new TextEncoder().encode(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Base64URL decode
     * @param {string} str - Base64URL encoded string
     * @returns {string} Decoded string
     */
    function base64UrlDecode(str) {
        const padding = '='.repeat((4 - str.length % 4) % 4);
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding;
        const binary = atob(base64);
        return new TextDecoder().decode(
            Uint8Array.from(binary, c => c.charCodeAt(0))
        );
    }

    /**
     * Generate short checksum (6 characters)
     * @param {string} str - String to checksum
     * @returns {string} Checksum in base36 (6 chars)
     */
    function shortChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36).substring(0, 6);
    }

    /**
     * Encode product info with XOR cipher using key "live"
     * NEW FORMAT: Includes orderId, compact data, checksum, Base64URL
     * @param {number} orderId - Order ID
     * @param {string} productCode - Product code
     * @param {number} quantity - Quantity
     * @param {number} price - Price
     * @param {number} timestamp - Optional timestamp (defaults to current time)
     * @returns {string} Base64URL encoded string
     */
    function encodeProductLine(orderId, productCode, quantity, price, timestamp = null) {
        // Generate timestamp if not provided
        const ts = timestamp || Date.now();

        // Use relative timestamp (seconds since BASE_TIME) for compactness
        const relativeTime = Math.floor((ts - BASE_TIME) / 1000);

        // Compact format: use comma separator (shorter than pipe)
        const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;

        // Generate checksum (6 chars)
        const checksum = shortChecksum(data);

        // Full data with checksum
        const fullData = `${data},${checksum}`;

        // XOR encrypt
        const encrypted = xorEncrypt(fullData, ENCODE_KEY);

        // Base64URL encode (no padding, URL-safe)
        return base64UrlEncode(encrypted);
    }

    /**
     * Decode product line - supports both old and new formats
     * NEW FORMAT: Base64URL, comma separator, orderId, checksum
     * OLD FORMAT: Base64, pipe separator, no orderId
     * @param {string} encoded - Encoded string
     * @param {number} expectedOrderId - Expected order ID (for verification in new format)
     * @returns {object|null} { orderId?, productCode, quantity, price, timestamp } or null if invalid
     */
    function decodeProductLine(encoded, expectedOrderId = null) {
        try {
            // Detect format by checking for Base64URL characters
            const isNewFormat = encoded.includes('-') || encoded.includes('_') || (!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

            if (isNewFormat) {
                // ===== NEW FORMAT: Base64URL + orderId + checksum =====
                try {
                    // Base64URL decode
                    const decrypted = base64UrlDecode(encoded);

                    // XOR decrypt
                    const fullData = xorDecrypt(decrypted, ENCODE_KEY);

                    // Parse
                    const parts = fullData.split(',');
                    if (parts.length !== 6) {
                        // Not new format, fallback to old format
                        throw new Error('Not new format');
                    }

                    const [orderId, productCode, quantity, price, relativeTime, checksum] = parts;

                    // Verify checksum
                    const data = `${orderId},${productCode},${quantity},${price},${relativeTime}`;
                    if (checksum !== shortChecksum(data)) {
                        console.warn('⚠️ Checksum mismatch - data may be corrupted');
                        return null;
                    }

                    // Verify order ID if provided
                    if (expectedOrderId !== null && orderId !== expectedOrderId.toString()) {
                        console.warn(`⚠️ OrderId mismatch: encoded=${orderId}, expected=${expectedOrderId}`);
                        return null;
                    }

                    // Convert relative timestamp back to absolute
                    const timestamp = parseInt(relativeTime) * 1000 + BASE_TIME;

                    return {
                        orderId: orderId,
                        productCode,
                        quantity: parseInt(quantity),
                        price: parseFloat(price),
                        timestamp
                    };
                } catch (newFormatError) {
                    // Fallback to old format
                    console.log('New format decode failed, trying old format...');
                }
            }

            // ===== OLD FORMAT: Base64 + pipe separator =====
            const decoded = xorDecrypt(encoded, ENCODE_KEY);
            const parts = decoded.split('|');

            // Support both old format (3 parts) and old format with timestamp (4 parts)
            if (parts.length !== 3 && parts.length !== 4) return null;

            const result = {
                productCode: parts[0],
                quantity: parseInt(parts[1]),
                price: parseFloat(parts[2])
            };

            // Add timestamp if present
            if (parts.length === 4) {
                result.timestamp = parseInt(parts[3]);
            }

            return result;
        } catch (error) {
            console.error('Decode error:', error);
            return null;
        }
    }

    /**
     * XOR encryption with key
     * @param {string} text - Text to encrypt
     * @param {string} key - Encryption key
     * @returns {string} Base64 encoded encrypted text
     */
    function xorEncrypt(text, key) {
        const textBytes = new TextEncoder().encode(text);
        const keyBytes = new TextEncoder().encode(key);
        const encrypted = new Uint8Array(textBytes.length);

        for (let i = 0; i < textBytes.length; i++) {
            encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
        }

        // Convert to base64
        return btoa(String.fromCharCode(...encrypted));
    }

    /**
     * XOR decryption with key
     * @param {string} encoded - Base64 encoded encrypted text
     * @param {string} key - Decryption key
     * @returns {string} Decrypted text
     */
    function xorDecrypt(encoded, key) {
        // Decode from base64
        const encrypted = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const keyBytes = new TextEncoder().encode(key);
        const decrypted = new Uint8Array(encrypted.length);

        for (let i = 0; i < encrypted.length; i++) {
            decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
        }

        return new TextDecoder().decode(decrypted);
    }

    /**
     * Append encoded products to order Note
     * @param {number} orderId - Order ID
     * @param {string} currentNote - Current order note (can be null/empty)
     * @param {array} products - Array of { productCode, quantity, price }
     * @returns {string} Updated note with encoded products
     */
    function appendEncodedProducts(orderId, currentNote, products) {
        const encodedLines = products.map(p =>
            encodeProductLine(orderId, p.productCode, p.quantity, p.price)
        );

        const encodedBlock = encodedLines.join('\n');

        // Append to existing note
        if (currentNote && currentNote.trim() !== '') {
            return `${currentNote}\n${encodedBlock}`;
        } else {
            return encodedBlock;
        }
    }

    /**
     * Extract encoded products from order Note
     * @param {string} note - Order note
     * @returns {array} Array of { productCode, quantity, price }
     */
    function extractEncodedProducts(note) {
        if (!note) return [];

        const lines = note.split('\n').filter(l => l.trim() !== '');

        // Try to decode each line, skip lines that fail
        return lines
            .map(line => {
                try {
                    return decodeProductLine(line.trim());
                } catch {
                    return null;
                }
            })
            .filter(p => p !== null);
    }

    /**
     * Check if current user is admin
     * @returns {boolean} true if user has admin privileges
     */
    function isAdmin() {
        try {
            const auth = window.authManager?.getAuthState();
            if (!auth) return false;
            // Admin typically has checkLogin value of 1 or lower
            return parseInt(auth.checkLogin) <= 1;
        } catch (error) {
            console.error('Error checking admin status:', error);
            return false;
        }
    }

    /**
     * Format note text to make encoded strings clickable for admin users
     * @param {string} note - Raw note text (may contain encoded strings)
     * @returns {string} HTML string with clickable encoded strings
     */
    function formatNoteWithClickableEncoded(note) {
        if (!note || !note.trim()) return '(Không có)';

        if (window.DecodingUtility) {
            return window.DecodingUtility.formatNoteWithDecodedData(note);
        }

        // Fallback if utility not loaded
        return `<span class="text-muted" style="font-size: 13px;">${escapeHtml(note)}</span>`;
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Truncate string with ellipsis
     */
    function truncateString(str, maxLength) {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '...';
    }

    /**
     * Global click handler for encoded strings
     */
    window.handleEncodedStringClick = function (encodedString) {
        try {
            const decoded = decodeProductLine(encodedString);
            if (decoded) {
                const timestamp = decoded.timestamp
                    ? new Date(decoded.timestamp).toLocaleString('vi-VN')
                    : 'N/A';

                const message = `
🔓 Decoded Information:
━━━━━━━━━━━━━━━━━━━━
📦 Product Code: ${decoded.productCode}
📊 Quantity: ${decoded.quantity}
💰 Price: ${decoded.price.toLocaleString('vi-VN')}đ
⏰ Timestamp: ${timestamp}
━━━━━━━━━━━━━━━━━━━━

🔒 Encoded String:
${encodedString}
                `.trim();

                alert(message);
            } else {
                alert('❌ Không thể decode chuỗi này');
            }
        } catch (error) {
            console.error('Error decoding string:', error);
            alert('❌ Lỗi khi decode: ' + error.message);
        }
    };

    // Utility Functions
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, ${type === 'success' ? '#10b981 0%, #059669 100%' : '#ef4444 0%, #dc2626 100%'});
            color: white;
            padding: 16px 24px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 600;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // =====================================================
    // AUTH: Using tokenManager (EXACTLY like tab1-orders.js)
    // =====================================================
    // Auth is handled by token-manager.js (loaded in HTML)
    // Use: const headers = await window.tokenManager.getAuthHeader();
    // Then: fetch(url, { method: 'PUT', headers: { ...headers, ... }, ... })

    // Load Assignments Data from LocalStorage
    function loadAssignmentsFromLocalStorage() {
        try {
            console.log('[LOAD] 💾 Loading from LocalStorage...');

            const storedData = localStorage.getItem('productAssignments');

            if (storedData) {
                const parsedData = JSON.parse(storedData);
                processLocalStorageData(parsedData);
            } else {
                console.log('[LOAD] 📭 LocalStorage is empty');
                assignments = [];
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
            }
        } catch (error) {
            console.error('[LOAD] ❌ Error loading assignments from LocalStorage:', error);
            showNotification('Lỗi tải dữ liệu: ' + error.message, 'error');
            assignments = [];
            groupBySessionIndex();
            renderTable();
            updateTotalCount();
        }
    }

    // Process LocalStorage Data
    function processLocalStorageData(data) {
        if (data && data.assignments) {
            console.log('[DATA] ✅ Received data with timestamp:', data._timestamp);
            const rawAssignments = data.assignments;
            processAssignments(rawAssignments);
        } else if (Array.isArray(data)) {
            // Old format (direct array)
            console.log('[DATA] 📦 Old format detected');
            processAssignments(data);
        } else {
            console.log('[DATA] ⚠️ Invalid data format');
            assignments = [];
            groupBySessionIndex();
            renderTable();
            updateTotalCount();
        }
    }

    // Process Assignments Array (Filter & Migrate)
    function processAssignments(rawAssignments) {
        // Migrate and Filter
        const validAssignments = rawAssignments.map(a => {
            // Migration: Ensure sttList exists
            if (!a.sttList) {
                if (a.sttNumber) {
                    a.sttList = [{ stt: a.sttNumber, orderInfo: a.orderInfo }];
                } else {
                    a.sttList = [];
                }
            }
            return a;
        }).filter(a => a.sttList && a.sttList.length > 0);

        assignments = validAssignments;
        console.log(`[DATA] 📦 Processed ${rawAssignments.length} raw -> ${assignments.length} valid assignments`);

        groupBySessionIndex();
        renderTable();
        updateTotalCount();
    }

    // Setup LocalStorage Listeners
    function setupLocalStorageListeners() {
        console.log('[SYNC] 🔧 Setting up LocalStorage listeners');

        window.addEventListener('storage', (event) => {
            if (event.key === 'productAssignments') {
                console.log('[SYNC] 🔔 LocalStorage changed (from another tab)');
                loadAssignmentsFromLocalStorage();
                showNotification('🔄 Dữ liệu đã được cập nhật từ tab khác');
            }
        });
    }

    // Backward compatibility
    async function loadAssignments() {
        loadAssignmentsFromLocalStorage();
    }

    /**
     * Hard refresh - Force reload data from Firebase
     * Called from UI button
     */
    /**
     * Hard refresh - Force reload data from LocalStorage
     * Called from UI button
     */
    window.hardRefreshFromFirebase = async function () {
        try {
            console.log('[HARD-REFRESH] 🔄 Hard refresh requested...');

            // Show loading indicator
            const btn = event.target.closest('button');
            const originalHTML = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';

            // Force reload from LocalStorage
            loadAssignmentsFromLocalStorage();

            // Restore button
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                console.log('[HARD-REFRESH] ✅ Hard refresh completed');
                showNotification('✅ Đã tải lại dữ liệu từ LocalStorage!');
            }, 500);

        } catch (error) {
            console.error('[HARD-REFRESH] ❌ Error:', error);
            showNotification('❌ Lỗi khi tải dữ liệu: ' + error.message, 'error');

            // Restore button
            if (event && event.target) {
                const btn = event.target.closest('button');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Hard Refresh';
            }
        }
    };

    // Group assignments by SessionIndex
    function groupBySessionIndex() {
        sessionIndexData = {};

        assignments.forEach(assignment => {
            assignment.sttList.forEach(sttItem => {
                const stt = sttItem.stt;

                if (!sessionIndexData[stt]) {
                    sessionIndexData[stt] = {
                        stt: stt,
                        orderInfo: sttItem.orderInfo,
                        products: []
                    };
                }

                // Add product to this SessionIndex
                sessionIndexData[stt].products.push({
                    productId: assignment.productId,
                    productName: assignment.productName,
                    productCode: assignment.productCode,
                    imageUrl: assignment.imageUrl
                });
            });
        });

        console.log(`📊 Đã group thành ${Object.keys(sessionIndexData).length} SessionIndex`);
    }

    // Render Table (grouped by SessionIndex)
    function renderTable() {
        const tbody = document.getElementById('productsTableBody');
        const totalItems = document.getElementById('totalItems');
        const totalProducts = document.getElementById('totalProducts');
        const totalOrders = document.getElementById('totalOrders');

        const sessionIndexKeys = Object.keys(sessionIndexData);
        const uniqueProductCodes = new Set();
        let totalItemCount = 0;

        // Count unique product codes and total items across all orders
        Object.values(sessionIndexData).forEach(data => {
            if (data && data.products) {
                totalItemCount += data.products.length;
                data.products.forEach(product => {
                    const code = product.productCode || product.productName;
                    uniqueProductCodes.add(code);
                });
            }
        });

        totalItems.textContent = totalItemCount;
        totalProducts.textContent = uniqueProductCodes.size;
        totalOrders.textContent = sessionIndexKeys.length;

        if (sessionIndexKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        <p class="mb-2">Chưa có sản phẩm nào được gán STT</p>
                        <p class="small">Vui lòng vào tab "Gán Sản Phẩm - STT" để thêm sản phẩm</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sessionIndexKeys.map(stt => {
            const data = sessionIndexData[stt];
            const isSelected = selectedSessionIndexes.has(stt);

            // Count products by ID
            const productCounts = {};
            data.products.forEach(product => {
                const key = product.productId;
                if (!productCounts[key]) {
                    productCounts[key] = {
                        ...product,
                        count: 0
                    };
                }
                productCounts[key].count++;
            });

            // Create product list text (simple format: N55 x2, N60 x1)
            const productsText = Object.values(productCounts).map(product => {
                const code = product.productCode || product.productName;
                return `${code} x${product.count}`;
            }).join(', ');

            // Calculate total quantity
            const totalQuantity = data.products.length;

            // Get orderId from orderInfo in sessionIndexData
            const orderId = data.orderInfo?.orderId || '';

            return `
                <tr class="${isSelected ? 'selected' : ''}">
                    <td>
                        <input
                            type="checkbox"
                            class="form-check-input stt-checkbox"
                            data-stt="${stt}"
                            ${isSelected ? 'checked' : ''}
                            onchange="handleSTTCheckbox('${stt}', this.checked)"
                        >
                    </td>
                    <td>
                        <div class="stt-cell">
                            <div class="stt-badge-large">
                                <i class="fas fa-hashtag"></i>${stt}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="order-info-cell">
                            <div class="order-customer">
                                <i class="fas fa-user"></i>
                                ${data.orderInfo?.customerName || 'N/A'}
                            </div>
                            <div class="order-phone">
                                <i class="fas fa-phone"></i>
                                ${data.orderInfo?.phone || 'N/A'}
                            </div>
                            <div class="order-address">
                                <i class="fas fa-map-marker-alt"></i>
                                ${data.orderInfo?.address || 'N/A'}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="products-text">
                            ${productsText}
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="total-quantity-cell">
                            <div class="total-badge">${totalQuantity}</div>
                            <div class="total-label">sản phẩm</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Render Table by Product (grouped by product, showing which orders contain it)
    function renderTableByProduct() {
        const tbody = document.getElementById('productsTableBody');
        const totalItems = document.getElementById('totalItems');
        const totalProducts = document.getElementById('totalProducts');
        const totalOrders = document.getElementById('totalOrders');
        const tableHead = document.querySelector('#productsTable thead tr');

        // Update table headers for product view
        tableHead.innerHTML = `
            <th style="width: 50px">
                <input type="checkbox" class="form-check-input" disabled>
            </th>
            <th style="width: 15%">Mã sản phẩm</th>
            <th style="width: 55%">Đơn hàng chứa sản phẩm</th>
            <th style="width: 15%">Tổng SL</th>
        `;

        // Group products from all orders, preserving the order from assignments
        const productGroups = {};
        const productInsertionOrder = []; // Track insertion order from assignments array

        // First, iterate through assignments to establish product order
        assignments.forEach(assignment => {
            const productId = assignment.productId;

            if (!productGroups[productId]) {
                productGroups[productId] = {
                    productId: productId,
                    productCode: assignment.productCode || assignment.productName,
                    productName: assignment.productName,
                    imageUrl: assignment.imageUrl,
                    orders: []
                };
                productInsertionOrder.push(productId); // Track order as it appears in assignments
            }
        });

        // Then, populate the orders for each product (preserving insertion order)
        // We need to iterate through assignments to preserve the STT insertion order
        assignments.forEach(assignment => {
            const productId = assignment.productId;

            if (productGroups[productId] && assignment.sttList) {
                assignment.sttList.forEach(sttItem => {
                    const stt = sttItem.stt;
                    const sessionData = sessionIndexData[stt];

                    if (sessionData) {
                        // Check if this order is already in the list
                        const existingOrder = productGroups[productId].orders.find(o => o.stt === stt);
                        if (existingOrder) {
                            existingOrder.quantity++;
                        } else {
                            productGroups[productId].orders.push({
                                stt: stt,
                                customerName: sttItem.orderInfo?.customerName || 'N/A',
                                phone: sttItem.orderInfo?.phone || 'N/A',
                                note: sttItem.orderInfo?.note || '',
                                quantity: 1
                            });
                        }
                    }
                });
            }
        });

        const productKeys = productInsertionOrder; // Use insertion order from assignments

        // Calculate total items count
        let totalItemCount = 0;
        Object.values(sessionIndexData).forEach(data => {
            if (data && data.products) {
                totalItemCount += data.products.length;
            }
        });

        totalItems.textContent = totalItemCount;
        totalProducts.textContent = productKeys.length;
        totalOrders.textContent = Object.keys(sessionIndexData).length;

        if (productKeys.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-5">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        <p class="mb-2">Chưa có sản phẩm nào được gán STT</p>
                        <p class="small">Vui lòng vào tab "Gán Sản Phẩm - STT" để thêm sản phẩm</p>
                    </td>
                </tr>
            `;
            return;
        }

        // Map products in insertion order (preserving order from assignments)
        const sortedProducts = productKeys.map(productId => productGroups[productId]);

        tbody.innerHTML = sortedProducts.map(product => {
            const totalQuantity = product.orders.reduce((sum, o) => sum + o.quantity, 0);

            // Create orders list with STT chips (matching tab3-product-assignment style)
            // Don't sort - preserve insertion order
            const ordersHtml = product.orders.map(order => {
                const isSelected = selectedSessionIndexes.has(order.stt);
                // Format: "STT 32 Huỳnh Thành Đạt" (only customer name, no note)

                return `
                    <div class="stt-chip" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; margin: 4px; background: ${isSelected ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}; color: white; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                        <span class="stt-chip-number" style="font-weight: 700;">STT ${order.stt}</span>
                        ${order.customerName ? `<span class="stt-chip-customer" style="font-size: 11px; opacity: 0.9;">${order.customerName}</span>` : ''}
                        ${order.quantity > 1 ? `<span style="font-size: 11px; opacity: 0.9;">(x${order.quantity})</span>` : ''}
                    </div>
                `;
            }).join('');

            return `
                <tr>
                    <td>
                        <div class="product-checkbox-group">
                            <input
                                type="checkbox"
                                class="form-check-input product-group-checkbox"
                                data-product-id="${product.productId}"
                                onchange="handleProductGroupCheckbox('${product.productId}', this.checked)"
                            >
                        </div>
                    </td>
                    <td>
                        <div class="product-code-cell" style="display: flex; align-items: center; gap: 10px;">
                            ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.productCode}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;">` : ''}
                            <div>
                                <div style="font-weight: 700; font-size: 16px; color: #1f2937;">${product.productCode}</div>
                                ${product.productName !== product.productCode ? `<div style="font-size: 12px; color: #6b7280;">${product.productName}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="orders-list" style="display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; border: 2px solid ${product.orders.length > 0 ? '#10b981' : '#e5e7eb'}; border-radius: 8px; background: ${product.orders.length > 0 ? 'rgba(16, 185, 129, 0.05)' : '#f9fafb'}; min-height: 52px;">
                            ${ordersHtml}
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="total-quantity-cell">
                            <div class="total-badge">${totalQuantity}</div>
                            <div class="total-label">sản phẩm</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Switch View Mode (order or product)
    window.switchViewMode = function(mode) {
        if (mode === currentViewMode) return;

        currentViewMode = mode;

        // Update button states
        const orderBtn = document.getElementById('viewModeOrder');
        const productBtn = document.getElementById('viewModeProduct');

        if (mode === 'order') {
            orderBtn.classList.remove('btn-outline-light');
            orderBtn.classList.add('btn-light', 'active');
            productBtn.classList.remove('btn-light', 'active');
            productBtn.classList.add('btn-outline-light');

            // Reset table headers for order view
            const tableHead = document.querySelector('#productsTable thead tr');
            tableHead.innerHTML = `
                <th style="width: 50px">
                    <input type="checkbox" class="form-check-input" disabled>
                </th>
                <th style="width: 12%">STT</th>
                <th style="width: 25%">Thông tin đơn hàng</th>
                <th style="width: 50%">Sản phẩm</th>
                <th style="width: 10%">Tổng SL</th>
            `;

            renderTable();
        } else {
            productBtn.classList.remove('btn-outline-light');
            productBtn.classList.add('btn-light', 'active');
            orderBtn.classList.remove('btn-light', 'active');
            orderBtn.classList.add('btn-outline-light');

            renderTableByProduct();
        }
    };

    // Handle Product Group Checkbox (select/deselect all orders containing this product)
    window.handleProductGroupCheckbox = function(productId, checked) {
        // Find all orders containing this product
        Object.entries(sessionIndexData).forEach(([stt, data]) => {
            const hasProduct = data.products.some(p => p.productId === productId);
            if (hasProduct) {
                if (checked) {
                    selectedSessionIndexes.add(stt);
                } else {
                    selectedSessionIndexes.delete(stt);
                }
            }
        });

        // Re-render to update visual state
        renderTableByProduct();
        updateSelectedCount();
    };

    // Update Total Count
    function updateTotalCount() {
        const totalItems = document.getElementById('totalItems');
        const totalProducts = document.getElementById('totalProducts');
        const totalOrders = document.getElementById('totalOrders');

        const orderCount = Object.keys(sessionIndexData).length;
        const uniqueProductCodes = new Set();
        let totalItemCount = 0;

        // Count unique product codes and total items across all orders
        Object.values(sessionIndexData).forEach(data => {
            if (data && data.products) {
                totalItemCount += data.products.length;
                data.products.forEach(product => {
                    const code = product.productCode || product.productName;
                    uniqueProductCodes.add(code);
                });
            }
        });

        totalItems.textContent = totalItemCount;
        totalProducts.textContent = uniqueProductCodes.size;
        totalOrders.textContent = orderCount;
    }

    // Update Selected Count
    function updateSelectedCount() {
        const selectedItemCount = document.getElementById('selectedItemCount');
        const selectedOrderCount = document.getElementById('selectedOrderCount');
        const selectedProductCodeCount = document.getElementById('selectedProductCodeCount');
        const uploadBtn = document.getElementById('uploadBtn');
        const actionSection = document.getElementById('actionSection');
        const selectAllCheckbox = document.getElementById('selectAll');

        // Calculate counts for selected orders
        let totalItems = 0; // Tổng số món (quantity)
        const uniqueProductCodes = new Set(); // Mã sản phẩm unique

        selectedSessionIndexes.forEach(stt => {
            const data = sessionIndexData[stt];
            if (data && data.products) {
                totalItems += data.products.length;
                data.products.forEach(product => {
                    const code = product.productCode || product.productName;
                    uniqueProductCodes.add(code);
                });
            }
        });

        // Update display
        selectedItemCount.textContent = totalItems;
        selectedOrderCount.textContent = selectedSessionIndexes.size;
        selectedProductCodeCount.textContent = uniqueProductCodes.size;

        // Show/hide action section
        if (selectedSessionIndexes.size > 0) {
            actionSection.style.display = 'block';
            uploadBtn.disabled = false;
        } else {
            actionSection.style.display = 'none';
            uploadBtn.disabled = true;
        }

        // Update select all checkbox
        const totalSTT = Object.keys(sessionIndexData).length;
        if (totalSTT > 0) {
            const allSelected = selectedSessionIndexes.size === totalSTT;
            const someSelected = selectedSessionIndexes.size > 0 && selectedSessionIndexes.size < totalSTT;

            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = someSelected;
        }
    }

    // Handle STT Checkbox
    window.handleSTTCheckbox = function (stt, checked) {
        if (checked) {
            selectedSessionIndexes.add(stt);
        } else {
            selectedSessionIndexes.delete(stt);
        }

        // Update row visual state
        const checkbox = document.querySelector(`.stt-checkbox[data-stt="${stt}"]`);
        if (checkbox) {
            const row = checkbox.closest('tr');
            if (row) {
                if (checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        }

        updateSelectedCount();
    };

    // Toggle Select All
    window.toggleSelectAll = function () {
        const selectAllCheckbox = document.getElementById('selectAll');
        const isChecked = selectAllCheckbox.checked;

        console.log('[SELECT-ALL] Toggle called, checked:', isChecked);

        if (isChecked) {
            // Select all SessionIndexes
            Object.keys(sessionIndexData).forEach(stt => selectedSessionIndexes.add(stt));
        } else {
            // Deselect all
            selectedSessionIndexes.clear();
        }

        // Update all individual checkboxes without re-rendering entire table
        document.querySelectorAll('.stt-checkbox').forEach(checkbox => {
            const stt = checkbox.dataset.stt;
            checkbox.checked = selectedSessionIndexes.has(stt);

            // Update row visual state
            const row = checkbox.closest('tr');
            if (row) {
                if (checkbox.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            }
        });

        updateSelectedCount();
    };

    // Clear Selection
    window.clearSelection = function () {
        selectedSessionIndexes.clear();
        document.getElementById('selectAll').checked = false;
        document.getElementById('selectAll').indeterminate = false;

        // Update all individual checkboxes without re-rendering
        document.querySelectorAll('.stt-checkbox').forEach(checkbox => {
            checkbox.checked = false;

            // Update row visual state
            const row = checkbox.closest('tr');
            if (row) {
                row.classList.remove('selected');
            }
        });

        updateSelectedCount();
    };

    // Upload to TPOS - Show Preview Modal First
    window.uploadToTPOS = async function () {
        console.log('🚀 uploadToTPOS called');
        console.log('📊 selectedSessionIndexes:', selectedSessionIndexes);

        if (selectedSessionIndexes.size === 0) {
            showNotification('Vui lòng chọn SessionIndex để upload', 'error');
            return;
        }

        // Show preview modal with loading state
        showPreviewModal();

        // Fetch detailed order data from TPOS API
        console.log('🔄 Calling fetchOrdersDetails...');
        await fetchOrdersDetails();
    };

    // Fetch Orders Details from TPOS API
    async function fetchOrdersDetails() {
        const selectedSTTs = Array.from(selectedSessionIndexes);
        const modalBody = document.getElementById('previewModalBody');

        console.log('🔍 fetchOrdersDetails START');
        console.log('📊 selectedSTTs:', selectedSTTs);

        // Show loading state
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang tải dữ liệu sản phẩm từ TPOS...</p>
            </div>
        `;

        try {
            // Fetch all orders in parallel
            const fetchPromises = selectedSTTs.map(async stt => {
                console.log(`\n🔎 Processing STT: ${stt}`);

                // Get order info from sessionIndexData
                const sessionData = sessionIndexData[stt];
                if (!sessionData) {
                    console.warn(`⚠️ STT ${stt} - No sessionData found`);
                    return { stt, orderData: null };
                }

                // Get orderId from orderInfo
                const orderId = sessionData.orderInfo?.orderId;
                console.log(`📄 STT ${stt} - Order info:`, sessionData.orderInfo);
                console.log(`📄 STT ${stt} - OrderId: ${orderId}`);

                if (!orderId) {
                    console.warn(`⚠️ STT ${stt} - No orderId found in orderInfo`);
                    return { stt, orderData: null };
                }

                try {
                    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;
                    console.log(`📡 API Request for STT ${stt}:`);
                    console.log(`   URL: ${apiUrl}`);

                    // Get auth headers from tokenManager
                    const headers = await window.tokenManager.getAuthHeader();

                    const response = await fetch(apiUrl, {
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                    });

                    console.log(`📬 Response status for STT ${stt}:`, response.status);

                    if (!response.ok) {
                        console.error(`❌ Failed to fetch order ${orderId} - Status: ${response.status}`);
                        return { stt, orderData: null };
                    }

                    const orderData = await response.json();
                    console.log(`✅ Successfully fetched order data for STT ${stt}`);
                    console.log(`   Products count: ${orderData.Details?.length || 0}`);
                    return { stt, orderData };
                } catch (error) {
                    console.error(`❌ Error fetching order ${orderId}:`, error);
                    return { stt, orderData: null };
                }
            });

            console.log(`\n⏳ Waiting for ${fetchPromises.length} fetch requests...`);
            const results = await Promise.all(fetchPromises);
            console.log(`✅ All fetch requests completed. Results:`, results.length);

            // Store fetched products in sessionIndexData and fetch template images if needed
            for (const result of results) {
                if (result.orderData && sessionIndexData[result.stt]) {
                    // Parse products from Details
                    const products = await Promise.all((result.orderData.Details || []).map(async detail => {
                        let imageUrl = detail.Product?.ImageUrl || '';

                        // Load template image if product has no image
                        if (!imageUrl && detail.Product?.ProductTmplId) {
                            try {
                                console.log(`📸 Fetching template image for ProductTmplId: ${detail.Product.ProductTmplId}`);
                                const headers = await window.tokenManager.getAuthHeader();
                                const templateResponse = await fetch(
                                    `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/ProductTemplate(${detail.Product.ProductTmplId})`,
                                    {
                                        headers: {
                                            ...headers,
                                            "Content-Type": "application/json",
                                            Accept: "application/json",
                                        },
                                    }
                                );

                                if (templateResponse.ok) {
                                    const templateData = await templateResponse.json();
                                    imageUrl = templateData.ImageUrl || '';
                                    console.log(`✅ Got template image: ${imageUrl ? 'Yes' : 'No'}`);
                                }
                            } catch (error) {
                                console.error('Error fetching template image:', error);
                            }
                        }

                        const productId = detail.ProductId;
                        const noteKey = `${result.stt}-${productId}`;

                        // Store existing note for this product
                        if (detail.Note) {
                            productNotes[noteKey] = detail.Note;
                        }

                        return {
                            code: detail.Product?.Code || detail.ProductCode || '',
                            name: detail.Product?.NameGet || detail.ProductName || '',
                            nameGet: detail.Product?.NameGet || detail.ProductName || '',
                            quantity: detail.Quantity || 0,
                            price: detail.Price || 0,
                            imageUrl: imageUrl,
                            productId: productId,
                            detailId: detail.Id, // Store detail ID to update existing products
                            note: detail.Note || '' // Store existing note
                        };
                    }));

                    sessionIndexData[result.stt].fetchedProducts = products;
                    console.log(`💾 Stored ${products.length} products for STT ${result.stt}`);
                }
            }

            // Re-render modal with fetched data
            renderPreviewModal();

        } catch (error) {
            console.error('Error fetching orders details:', error);
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">Lỗi: ${error.message}</p>
                    <button class="btn btn-primary" onclick="uploadToTPOS()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    }

    // Show Preview Modal with Both Assigned and Original Products
    function showPreviewModal() {
        // Show modal first with loading state
        const previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
        previewModal.show();

        const modalBody = document.getElementById('previewModalBody');
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang chuẩn bị...</p>
            </div>
        `;
    }

    // Update Product Note
    window.updateProductNote = function (noteKey, value) {
        productNotes[noteKey] = value;
        console.log(`📝 Updated note for ${noteKey}:`, value);
    };

    // Helper function to filter out encoded notes and keep only non-encoded text
    function filterNonEncodedNotes(noteText) {
        if (!noteText) return '';

        // Split by spaces and newlines
        const parts = noteText.split(/[\s\n]+/);
        const nonEncodedParts = [];

        for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Check if this part is encoded by attempting to decode it
            // Encoded parts are typically long strings without spaces
            if (trimmed.length > 20 && !trimmed.includes(' ')) {
                // Try to decode using DecodingUtility
                const decoded = window.DecodingUtility ? window.DecodingUtility.decodeProductLine(trimmed) : null;
                if (decoded) {
                    // This is an encoded part, skip it
                    continue;
                }
            }

            // This is a non-encoded part, keep it
            nonEncodedParts.push(trimmed);
        }

        return nonEncodedParts.join(' ');
    }

    // Render Preview Modal Content
    function renderPreviewModal() {
        const selectedSTTs = Array.from(selectedSessionIndexes);
        const modalBody = document.getElementById('previewModalBody');

        let html = '';

        selectedSTTs.forEach(stt => {
            const data = sessionIndexData[stt];
            if (!data) return;

            // Get order products from the fetched data (stored temporarily)
            const orderProducts = data.fetchedProducts || [];

            // Create map of existing products by ProductId for quick lookup
            const existingProductsMap = {};
            orderProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            // Count assigned products and check if they exist
            const assignedProductCounts = {};
            data.products.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = {
                        ...product,
                        count: 0,
                        isExisting: !!existingProductsMap[product.productId] // Check if product exists in order
                    };
                }
                assignedProductCounts[key].count++;
            });

            // Filter non-encoded notes for display
            const filteredNote = data.orderInfo?.note ? filterNonEncodedNotes(data.orderInfo.note) : '';

            html += `
                <div class="card mb-4">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${filteredNote ? `, ${filteredNote}` : ''}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <!-- Assigned Products with Note -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm sẽ upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th style="width: 200px;">Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                const noteKey = `${stt}-${product.productId}`;

                // Tự động thêm "live" nếu chưa có note
                if (!productNotes[noteKey]) {
                    productNotes[noteKey] = 'live';
                }
                // Filter to show only non-encoded notes
                const rawNote = productNotes[noteKey] || '';
                const existingNote = filterNonEncodedNotes(rawNote);

                // Badge to show if product is new or existing
                const statusBadge = product.isExisting
                    ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, sẽ cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                    : '<span class="badge bg-success ms-2" title="Sản phẩm mới sẽ được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div>
                                                            <div style="font-weight: 600;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">
                                                                ${product.productCode || 'N/A'}
                                                                ${statusBadge}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge ${product.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${product.count}</span>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        class="form-control form-control-sm"
                                                        placeholder="Nhập ghi chú..."
                                                        value="${existingNote}"
                                                        data-note-key="${noteKey}"
                                                        onchange="updateProductNote('${noteKey}', this.value)"
                                                    />
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Original Order Products with Note (Editable) -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${orderProducts.length})
                                </h6>
                                ${orderProducts.length > 0 ? `
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th style="width: 180px;">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${orderProducts.map(product => {
                    const noteKey = `${stt}-${product.productId}`;
                    // Filter to show only non-encoded notes
                    const rawNote = productNotes[noteKey] || product.note || '';
                    const existingNote = filterNonEncodedNotes(rawNote);

                    // Check if this product will be updated (exists in assigned products)
                    const willBeUpdated = !!assignedProductCounts[product.productId];
                    const updateBadge = willBeUpdated
                        ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này sẽ được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                        : '';

                    return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">` : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div>
                                                                <div style="font-weight: 600;">${product.nameGet || product.name}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}${updateBadge}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="text"
                                                            class="form-control form-control-sm"
                                                            placeholder="Ghi chú..."
                                                            value="${existingNote}"
                                                            data-note-key="${noteKey}"
                                                            onchange="updateProductNote('${noteKey}', this.value)"
                                                        />
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="text-center text-muted py-3">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        modalBody.innerHTML = html;
    }

    // Remove uploaded STTs from LocalStorage
    async function removeUploadedSTTsFromLocalStorage(uploadedSTTs) {
        try {
            console.log('[REMOVE-STT] 🗑️ Removing uploaded STTs from LocalStorage...');
            console.log('[REMOVE-STT] STTs to remove:', uploadedSTTs);

            // Convert uploadedSTTs to strings for consistent comparison
            const uploadedSTTsStr = uploadedSTTs.map(s => String(s));

            // Load current assignments from LocalStorage
            const storedData = localStorage.getItem('productAssignments');
            let productAssignments = [];
            let timestamp = Date.now();

            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (parsedData && parsedData.assignments) {
                    productAssignments = parsedData.assignments;
                } else if (Array.isArray(parsedData)) {
                    productAssignments = parsedData;
                }
            }

            if (productAssignments.length === 0) {
                console.log('[REMOVE-STT] No assignments found in LocalStorage');
                return { success: true, removedCount: 0, removedProducts: 0 };
            }

            console.log(`[REMOVE-STT] Current assignments: ${productAssignments.length} products`);

            // Remove uploaded STTs from each assignment
            let totalRemovedSTTs = 0;
            let removedProducts = 0;

            productAssignments = productAssignments.filter(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) {
                    return true; // Keep products without sttList
                }

                const originalLength = assignment.sttList.length;

                // Remove all sttList items that match uploaded STTs (convert to string for comparison)
                assignment.sttList = assignment.sttList.filter(sttItem => {
                    const sttStr = String(sttItem.stt);
                    const shouldRemove = uploadedSTTsStr.includes(sttStr);
                    return !shouldRemove;
                });

                const removedCount = originalLength - assignment.sttList.length;
                totalRemovedSTTs += removedCount;

                // If no STTs left, remove the entire product
                if (assignment.sttList.length === 0) {
                    removedProducts++;
                    return false;
                }

                return true; // Keep products that still have STTs
            });

            console.log(`[REMOVE-STT] ✅ Removed ${totalRemovedSTTs} STT entries from ${removedProducts} products`);

            // Save updated assignments to LocalStorage with timestamp
            const dataWithTimestamp = {
                assignments: productAssignments,
                _timestamp: Date.now(),
                _version: 1
            };

            localStorage.setItem('productAssignments', JSON.stringify(dataWithTimestamp));
            console.log('[REMOVE-STT] ✅ Saved to LocalStorage successfully');

            // Dispatch storage event manually
            window.dispatchEvent(new Event('storage'));

            // Return success with stats
            return {
                success: true,
                removedCount: totalRemovedSTTs,
                removedProducts: removedProducts
            };

        } catch (error) {
            console.error('[REMOVE-STT] ❌ Error removing uploaded STTs:', error);
            throw new Error(`Failed to remove STTs: ${error.message}`);
        }
    }

    // Confirm Upload - Proceed with Actual Upload (WITH BACKUP & RESTORE)
    window.confirmUpload = async function () {
        console.log('[UPLOAD] 🚀 confirmUpload() called');

        // Get selected STTs
        const selectedSTTs = Array.from(selectedSessionIndexes);
        console.log('[UPLOAD] Selected STTs:', selectedSTTs);

        // Confirm with user
        const confirmMsg = `Bạn có chắc muốn upload ${selectedSTTs.length} đơn hàng lên TPOS?\n\n` +
            `Sau khi upload thành công, các sản phẩm sẽ tự động bị xóa khỏi danh sách gán.`;

        if (!confirm(confirmMsg)) {
            console.log('[UPLOAD] ❌ User cancelled upload');
            return;
        }

        // Hide preview modal
        const previewModal = bootstrap.Modal.getInstance(document.getElementById('previewModal'));
        if (previewModal) {
            previewModal.hide();
        }

        // Disable upload button to prevent concurrent uploads
        const uploadBtn = document.getElementById('uploadBtn');
        const prevBtnText = uploadBtn ? uploadBtn.textContent : '';
        const prevBtnDisabled = uploadBtn ? uploadBtn.disabled : false;

        if (uploadBtn) {
            uploadBtn.disabled = true;
            uploadBtn.textContent = '⏳ Đang upload...';
        }

        // Variables for tracking
        let uploadId = null;
        let backupData = null;
        let uploadModal = null;

        try {
            // =====================================================
            // PHASE 1: CREATE BACKUP
            // =====================================================
            console.log('[UPLOAD] 📦 Phase 1: Creating backup...');

            try {
                uploadId = await createBackupBeforeUpload(selectedSTTs);
                backupData = await loadBackupData(uploadId);
                console.log('[UPLOAD] ✅ Backup created:', uploadId);
            } catch (error) {
                console.error('[UPLOAD] ❌ Cannot create backup:', error);
                showNotification('❌ Lỗi: Không thể tạo backup trước khi upload', 'error');
                return; // STOP if backup fails
            }

            // =====================================================
            // PHASE 2: UPLOAD TO TPOS
            // =====================================================
            console.log('[UPLOAD] 📤 Phase 2: Uploading to TPOS...');

            // Show upload modal
            uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
            uploadModal.show();

            const progressBar = document.getElementById('uploadProgress');
            const statusText = document.getElementById('uploadStatus');

            // Reset progress
            progressBar.style.width = '0%';
            progressBar.textContent = '0%';
            progressBar.classList.remove('bg-success', 'bg-warning', 'bg-danger');
            progressBar.classList.add('bg-primary');

            let completed = 0;
            const total = selectedSTTs.length;
            const results = [];

            // Upload loop
            for (const stt of selectedSTTs) {
                const sessionData = sessionIndexData[stt];
                if (!sessionData) {
                    console.warn(`[UPLOAD] ⚠️ No sessionData for STT ${stt}`);
                    results.push({ stt, orderId: null, success: false, error: 'No session data' });
                    completed++;
                    continue;
                }

                const orderId = sessionData.orderInfo?.orderId;
                if (!orderId) {
                    console.warn(`[UPLOAD] ⚠️ No orderId for STT ${stt}`);
                    results.push({ stt, orderId: null, success: false, error: 'No order ID' });
                    completed++;
                    continue;
                }

                statusText.textContent = `Đang upload STT ${stt} - ${sessionData.orderInfo?.customerName || 'N/A'}...`;

                try {
                    // Fetch current order data
                    console.log(`[UPLOAD] 📡 Fetching order ${orderId} for STT ${stt}...`);
                    const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;

                    const headers = await window.tokenManager.getAuthHeader();

                    const response = await fetch(apiUrl, {
                        headers: {
                            ...headers,
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch order ${orderId}: ${response.status}`);
                    }

                    const orderData = await response.json();
                    console.log(`[UPLOAD] ✅ Fetched order data for STT ${stt}`);

                    // Extract existing products BEFORE upload (for history comparison)
                    const existingProducts = orderData.Details ? orderData.Details.map(detail => ({
                        productId: detail.Product?.Id || detail.ProductId,
                        nameGet: detail.Product?.NameGet || detail.ProductName || 'N/A',
                        code: detail.Product?.DefaultCode || detail.ProductCode || '',
                        quantity: detail.Quantity || 0,
                        price: detail.Price || 0,
                        imageUrl: detail.Product?.ImageUrl || '',
                        note: detail.Note || ''
                    })) : [];
                    console.log(`[UPLOAD] 📦 Extracted ${existingProducts.length} existing products for STT ${stt}`);

                    // Prepare merged Details and get products to encode
                    const { details: mergedDetails, productsToEncode } = await prepareUploadDetails(orderData, sessionData);
                    orderData.Details = mergedDetails;

                    // ============================================
                    // ENCODE PRODUCTS and APPEND to Order Note
                    // ============================================
                    if (productsToEncode.length > 0) {
                        console.log(`[UPLOAD] 🔐 Encoding ${productsToEncode.length} products to Note...`);
                        const currentNote = orderData.Note || '';
                        orderData.Note = appendEncodedProducts(orderId, currentNote, productsToEncode);
                        console.log(`[UPLOAD] ✅ Updated order Note with encoded products`);
                    }

                    // Recalculate totals
                    let totalQty = 0;
                    let totalAmount = 0;
                    orderData.Details.forEach(detail => {
                        totalQty += detail.Quantity || 0;
                        totalAmount += (detail.Quantity || 0) * (detail.Price || 0);
                    });
                    orderData.TotalQuantity = totalQty;
                    orderData.TotalAmount = totalAmount;

                    // Prepare payload
                    const payload = prepareUploadPayload(orderData);

                    console.log(`[UPLOAD] 📤 Uploading order ${orderId}...`);
                    console.log(`[UPLOAD]   Details count: ${payload.Details.length}`);
                    console.log(`[UPLOAD]   Total Quantity: ${payload.TotalQuantity}`);

                    // PUT request
                    const uploadHeaders = await window.tokenManager.getAuthHeader();

                    const uploadResponse = await fetch(
                        `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})`,
                        {
                            method: "PUT",
                            headers: {
                                ...uploadHeaders,
                                "Content-Type": "application/json",
                                Accept: "application/json",
                            },
                            body: JSON.stringify(payload),
                        },
                    );

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text();
                        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
                    }

                    console.log(`[UPLOAD] ✅ Successfully uploaded STT ${stt}`);
                    results.push({ stt, orderId, success: true, existingProducts });

                } catch (error) {
                    console.error(`[UPLOAD] ❌ Error uploading STT ${stt}:`, error);
                    results.push({ stt, orderId, success: false, error: error.message });
                }

                // Update progress
                completed++;
                const percentage = Math.round((completed / total) * 100);
                progressBar.style.width = percentage + '%';
                progressBar.textContent = percentage + '%';
            }

            // =====================================================
            // PHASE 3: PROCESS RESULTS
            // =====================================================
            console.log('[UPLOAD] 📊 Phase 3: Processing results...');

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            console.log(`[UPLOAD] Results: ${successCount} success, ${failCount} failed`);

            if (failCount === 0) {
                // ===== ALL SUCCESS =====
                console.log('[UPLOAD] ✅ ALL SUCCESS - Processing deletion...');

                statusText.textContent = `✅ Upload thành công ${successCount} đơn hàng! Đang xóa sản phẩm...`;

                try {
                    // Step 1: Delete products from LocalStorage
                    const successfulSTTs = results.map(r => r.stt);
                    const deleteResult = await removeUploadedSTTsFromLocalStorage(successfulSTTs);

                    console.log('[UPLOAD] ✅ Deleted:', deleteResult.removedCount, 'STT entries from LocalStorage');

                    // Step 2: Read afterSnapshot from LocalStorage (AFTER deletion completes)
                    const storedData = localStorage.getItem('productAssignments');
                    let afterData = null;
                    if (storedData) {
                        afterData = JSON.parse(storedData);
                    }

                    // Step 3: Save history
                    await saveToHistory(uploadId, results, 'completed', backupData, afterData);

                    // Step 4: Mark as committed
                    await markHistoryAsCommitted(uploadId);

                    // Step 5: Update UI
                    statusText.textContent = `✅ Hoàn tất! Đã upload ${successCount} đơn hàng và xóa sản phẩm`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-success');

                    // Reload from LocalStorage to update UI
                    loadAssignmentsFromLocalStorage();

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification(`✅ Đã upload ${successCount} đơn hàng lên TPOS thành công!`);
                        clearSelection();
                    }, 1500);

                } catch (deleteError) {
                    // Deletion failed (CRITICAL)
                    console.error('[UPLOAD] ❌ Deletion failed:', deleteError);

                    statusText.textContent = `⚠️ Upload thành công nhưng không thể xóa sản phẩm`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-warning');

                    // Save history with special status
                    const storedData = localStorage.getItem('productAssignments');
                    let afterData = null;
                    if (storedData) {
                        afterData = JSON.parse(storedData);
                    }
                    await saveToHistory(uploadId, results, 'deletion_failed', backupData, afterData);

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification('⚠️ Upload thành công nhưng không thể xóa products. Vui lòng xóa thủ công!', 'warning');
                    }, 2000);
                }

            } else if (failCount < total) {
                // ===== PARTIAL SUCCESS =====
                console.log('[UPLOAD] ⚠️ PARTIAL SUCCESS - Processing...');

                const successfulSTTs = results.filter(r => r.success).map(r => r.stt);

                statusText.textContent = `⚠️ Thành công: ${successCount}, Thất bại: ${failCount}. Đang xóa sản phẩm thành công...`;

                try {
                    // Step 1: Delete ONLY successful STTs from LocalStorage
                    if (successfulSTTs.length > 0) {
                        const deleteResult = await removeUploadedSTTsFromLocalStorage(successfulSTTs);
                        console.log('[UPLOAD] ✅ Deleted successful STTs from LocalStorage:', deleteResult.removedCount);
                    }

                    // Step 2: Read afterSnapshot from LocalStorage
                    const storedData = localStorage.getItem('productAssignments');
                    let afterData = null;
                    if (storedData) {
                        afterData = JSON.parse(storedData);
                    }

                    // Step 3: Save history
                    await saveToHistory(uploadId, results, 'partial', backupData, afterData);

                    // Step 4: Mark as committed (cannot safely restore partial)
                    await markHistoryAsCommitted(uploadId);

                    // Step 5: Update UI
                    statusText.textContent = `⚠️ Thành công: ${successCount}, Thất bại: ${failCount}`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-warning');

                    // Reload from LocalStorage to update UI
                    loadAssignmentsFromLocalStorage();

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification(`⚠️ Upload hoàn tất: ${successCount} thành công, ${failCount} thất bại`, 'warning');
                    }, 2000);

                } catch (deleteError) {
                    console.error('[UPLOAD] ❌ Partial deletion failed:', deleteError);

                    statusText.textContent = `❌ Lỗi xử lý kết quả upload`;

                    // Try to save history anyway
                    const storedData = localStorage.getItem('productAssignments');
                    let afterData = null;
                    if (storedData) {
                        afterData = JSON.parse(storedData);
                    }
                    await saveToHistory(uploadId, results, 'deletion_failed', backupData, afterData);

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        showNotification('❌ Lỗi xử lý kết quả. Vui lòng kiểm tra lại dữ liệu!', 'error');
                    }, 2000);
                }

            } else {
                // ===== ALL FAILED =====
                console.log('[UPLOAD] ❌ ALL FAILED - Restoring from backup...');

                statusText.textContent = `❌ Upload thất bại. Đang khôi phục dữ liệu...`;

                try {
                    // Step 1: Restore from backup
                    await restoreFromBackup(uploadId);

                    // Step 2: Save history (for audit)
                    await saveToHistory(uploadId, results, 'failed', backupData, null);

                    // Step 3: Update UI
                    statusText.textContent = `❌ Upload thất bại. Đã khôi phục dữ liệu`;
                    progressBar.classList.remove('bg-primary');
                    progressBar.classList.add('bg-danger');

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();

                        // Show detailed error
                        const firstError = results.find(r => !r.success);
                        const errorMsg = firstError ? firstError.error : 'Unknown error';
                        showNotification(`❌ Upload thất bại: ${errorMsg}. Đã khôi phục dữ liệu.`, 'error');
                    }, 2000);

                } catch (restoreError) {
                    console.error('[UPLOAD] ❌❌ CRITICAL: Restore failed:', restoreError);

                    statusText.textContent = `❌❌ CRITICAL: Không thể khôi phục!`;

                    setTimeout(() => {
                        if (uploadModal) uploadModal.hide();
                        alert('❌ CRITICAL ERROR:\n\n' +
                            'Upload thất bại VÀ không thể khôi phục dữ liệu!\n\n' +
                            'Vui lòng KHÔNG thao tác gì thêm và liên hệ IT ngay!\n\n' +
                            `Backup ID: ${uploadId}`);
                    }, 2000);
                }
            }

        } catch (error) {
            // UNEXPECTED ERROR during upload loop
            console.error('[UPLOAD] ❌ Unexpected error:', error);

            try {
                // Try to restore from backup
                if (uploadId) {
                    console.log('[UPLOAD] 🔄 Attempting restore due to unexpected error...');
                    await restoreFromBackup(uploadId);
                    await saveToHistory(uploadId, [], 'failed', backupData, null);
                    showNotification('❌ Upload thất bại: ' + error.message + '. Đã khôi phục dữ liệu.', 'error');
                } else {
                    showNotification('❌ Upload thất bại: ' + error.message, 'error');
                }
            } catch (restoreError) {
                console.error('[UPLOAD] ❌❌ CRITICAL: Cannot restore after unexpected error:', restoreError);
                alert('❌ CRITICAL ERROR:\n\nĐã xảy ra lỗi nghiêm trọng!\n\nVui lòng liên hệ IT ngay!');
            }

            if (uploadModal) {
                uploadModal.hide();
            }

        } finally {
            // Always cleanup and re-enable button
            console.log('[UPLOAD] 🧹 Cleanup...');

            // Cleanup backup (if not already cleaned by saveToHistory)
            if (uploadId) {
                await cleanupBackup(uploadId);
            }

            // Re-enable upload button
            if (uploadBtn) {
                uploadBtn.disabled = prevBtnDisabled;
                uploadBtn.textContent = prevBtnText || 'Upload lên TPOS';
            }

            console.log('[UPLOAD] ✅ Upload flow completed');
        }
    };

    // Prepare Details for upload (merge existing + assigned)
    // LOGIC GIỐNG tab1-orders.js: addProductToOrderFromInline (dòng 2214-2369)
    async function prepareUploadDetails(orderData, sessionData) {
        const existingDetails = orderData.Details || [];
        const assignedProducts = sessionData.products || [];
        const stt = sessionData.stt; // Get STT for note lookup

        console.log(`\n📊 Preparing upload details:`);
        console.log(`   Existing products: ${existingDetails.length}`);
        console.log(`   Assigned products: ${assignedProducts.length}`);

        // Group existing products by ProductId
        const existingByProductId = {};
        existingDetails.forEach(detail => {
            existingByProductId[detail.ProductId] = detail;
        });

        // Group assigned products by ProductId and count
        const assignedByProductId = {};
        assignedProducts.forEach(product => {
            const productId = product.productId;
            if (!assignedByProductId[productId]) {
                assignedByProductId[productId] = {
                    productId: productId,
                    productCode: product.productCode,
                    productName: product.productName,
                    imageUrl: product.imageUrl,
                    count: 0
                };
            }
            assignedByProductId[productId].count++;
        });

        // Clone existing details to modify
        const mergedDetails = [...existingDetails];

        // Track products to encode (all assigned products)
        const productsToEncode = [];

        // Process assigned products: Update existing OR Add new
        for (const productId of Object.keys(assignedByProductId)) {
            const assignedData = assignedByProductId[productId];
            const existingDetail = existingByProductId[productId];

            // Get note for this product
            const noteKey = `${stt}-${productId}`;
            const note = productNotes[noteKey] || null;

            if (existingDetail) {
                // ============================================
                // PRODUCT EXISTS - Increase quantity and update note
                // ============================================
                const oldQty = existingDetail.Quantity || 0;
                existingDetail.Quantity = oldQty + assignedData.count;

                // Update note if provided
                if (note !== null && note.trim() !== '') {
                    existingDetail.Note = note;
                    console.log(`   📝 Updated note for ${existingDetail.ProductCode}: "${note}"`);
                }

                console.log(`   ✏️ Updated ${existingDetail.ProductCode}: ${oldQty} → ${existingDetail.Quantity} (+${assignedData.count})`);

                // Track for encoding (quantity added, not total)
                productsToEncode.push({
                    productCode: assignedData.productCode,
                    quantity: assignedData.count,
                    price: existingDetail.Price || 0
                });
            } else {
                // ============================================
                // NEW PRODUCT - Fetch full info and add (EXACTLY like tab1-orders.js)
                // ============================================
                console.log(`   ➕ Adding new product: ${assignedData.productCode} x${assignedData.count}`);

                try {
                    // Fetch full product details from API
                    const fullProduct = await fetchProductDetails(productId);

                    if (!fullProduct) {
                        console.error(`   ❌ Cannot fetch product ${productId}, skipping...`);
                        continue;
                    }

                    // ============================================
                    // CREATE NEW DETAIL WITH COMPUTED FIELDS
                    // EXACTLY like tab1-orders.js (dòng 2284-2322)
                    // ============================================
                    const newProduct = {
                        // ============================================
                        // REQUIRED FIELDS
                        // ============================================
                        // ✅ KHÔNG có Id: để API tự tạo cho sản phẩm mới
                        ProductId: fullProduct.Id,
                        Quantity: assignedData.count,  // Use counted quantity
                        Price:
                            fullProduct.PriceVariant ||
                            fullProduct.ListPrice ||
                            fullProduct.StandardPrice ||
                            0,
                        Note: note && note.trim() !== '' ? note : null, // Add note from input
                        UOMId: fullProduct.UOM?.Id || 1,
                        Factor: 1,
                        Priority: 0,
                        OrderId: orderData.Id,
                        LiveCampaign_DetailId: null,
                        ProductWeight: 0,

                        // ============================================
                        // COMPUTED FIELDS - PHẢI CÓ! (EXACTLY like tab1-orders.js)
                        // ============================================
                        ProductName: fullProduct.Name || fullProduct.NameTemplate,
                        ProductNameGet:
                            fullProduct.NameGet ||
                            `[${fullProduct.DefaultCode}] ${fullProduct.Name}`,
                        ProductCode: fullProduct.DefaultCode || fullProduct.Barcode,
                        UOMName: fullProduct.UOM?.Name || "Cái",
                        ImageUrl: fullProduct.ImageUrl || assignedData.imageUrl,
                        IsOrderPriority: null,
                        QuantityRegex: null,
                        IsDisabledLiveCampaignDetail: false,

                        // Creator ID
                        CreatedById: orderData.UserId || orderData.CreatedById,
                    };

                    if (note && note.trim() !== '') {
                        console.log(`   📝 Added note for new product ${assignedData.productCode}: "${note}"`);
                    }

                    mergedDetails.push(newProduct);
                    console.log(`   ✅ Added new product with computed fields:`, newProduct);

                    // Track for encoding
                    productsToEncode.push({
                        productCode: assignedData.productCode,
                        quantity: assignedData.count,
                        price: newProduct.Price || 0
                    });

                } catch (error) {
                    console.error(`   ❌ Error adding product ${productId}:`, error);
                    console.error(`   ⚠️ Skipping product ${assignedData.productCode}`);
                }
            }
        }

        // ============================================
        // UPDATE NOTES for existing products that are NOT in assigned products
        // (User might have edited notes for products already in order)
        // ============================================
        for (const existingDetail of mergedDetails) {
            const productId = existingDetail.ProductId;

            // Skip if this product was already processed above (in assigned products)
            if (assignedByProductId[productId]) {
                continue;
            }

            // Check if there's a note update for this existing product
            const noteKey = `${stt}-${productId}`;
            const note = productNotes[noteKey] || null;

            if (note !== null && note.trim() !== '') {
                existingDetail.Note = note;
                console.log(`   📝 Updated note for existing product ${existingDetail.ProductCode}: "${note}"`);
            }
        }

        console.log(`   📦 Final details count: ${mergedDetails.length}`);
        console.log(`   🔐 Products to encode: ${productsToEncode.length}`);

        return {
            details: mergedDetails,
            productsToEncode: productsToEncode
        };
    }

    // Fetch full product details from TPOS API
    async function fetchProductDetails(productId) {
        try {
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Product(${productId})?$expand=UOM`;

            // Get auth headers from tokenManager
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                console.error(`Failed to fetch product ${productId}: ${response.status}`);
                return null;
            }

            const product = await response.json();
            console.log(`   📦 Fetched product details for ${productId}:`, product);
            return product;

        } catch (error) {
            console.error(`Error fetching product ${productId}:`, error);
            return null;
        }
    }

    // Prepare payload for PUT request (exactly like tab1-orders.js)
    function prepareUploadPayload(orderData) {
        console.log('[PAYLOAD] Preparing payload for PUT request...');

        // Clone data to avoid modifying original
        const payload = JSON.parse(JSON.stringify(orderData));

        // CRITICAL: Add @odata.context (exactly as in tab1-orders.js)
        if (!payload['@odata.context']) {
            payload['@odata.context'] =
                'http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity';
            console.log('[PAYLOAD] ✓ Added @odata.context');
        }

        // Process Details array (exactly as in tab1-orders.js)
        if (payload.Details && Array.isArray(payload.Details)) {
            payload.Details = payload.Details.map((detail, index) => {
                const cleaned = { ...detail };

                // Remove Id if null/undefined (new products that need to be created)
                // Keep Id if exists (existing products that need to be updated)
                if (!cleaned.Id || cleaned.Id === null || cleaned.Id === undefined) {
                    delete cleaned.Id;
                    console.log(`[PAYLOAD FIX] Detail[${index}]: Removed Id:null for ProductId:`, cleaned.ProductId);
                } else {
                    console.log(`[PAYLOAD] Detail[${index}]: Keeping existing Id:`, cleaned.Id);
                }

                // Ensure OrderId matches the parent order
                cleaned.OrderId = payload.Id;

                // Keep all other fields intact (ProductName, ProductNameGet, ProductCode, etc.)
                // These fields are already in the detail object from TPOS API

                return cleaned;
            });
        }

        // Statistics for logging
        const newDetailsCount = payload.Details?.filter(d => !d.Id).length || 0;
        const existingDetailsCount = payload.Details?.filter(d => d.Id).length || 0;

        const summary = {
            orderId: payload.Id,
            orderCode: payload.Code,
            topLevelFields: Object.keys(payload).length,
            detailsCount: payload.Details?.length || 0,
            newDetails: newDetailsCount,
            existingDetails: existingDetailsCount,
            hasContext: !!payload['@odata.context'],
            hasPartner: !!payload.Partner,
            hasUser: !!payload.User,
            hasCRMTeam: !!payload.CRMTeam,
            hasRowVersion: !!payload.RowVersion
        };

        console.log('[PAYLOAD] ✓ Payload prepared successfully:', summary);

        // Validate critical fields
        if (!payload.RowVersion) {
            console.warn('[PAYLOAD] ⚠️ WARNING: Missing RowVersion!');
        }
        if (!payload['@odata.context']) {
            console.error('[PAYLOAD] ❌ ERROR: Missing @odata.context!');
        }

        // VALIDATION: Check for Id: null (this will cause API error)
        const detailsWithNullId = payload.Details?.filter(d =>
            d.hasOwnProperty('Id') && (d.Id === null || d.Id === undefined)
        ) || [];

        if (detailsWithNullId.length > 0) {
            console.error('[PAYLOAD] ❌ ERROR: Found details with null Id:', detailsWithNullId);
            throw new Error('Payload contains details with null Id - this will cause API error');
        }

        return payload;
    }

    // =====================================================
    // EDIT MODAL FUNCTIONALITY
    // =====================================================
    let currentEditOrderData = null;
    let currentEditSTT = null;

    // Open Edit Modal - Fetch Order Data from TPOS
    window.openEditModal = async function (stt, orderId) {
        currentEditSTT = stt;

        // Show modal
        const editModal = new bootstrap.Modal(document.getElementById('editOrderModal'));
        editModal.show();

        // Show loading state
        document.getElementById('editModalBody').innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted">Đang tải dữ liệu đơn hàng...</p>
            </div>
        `;

        try {
            // Fetch order data from TPOS API (EXACTLY like tab1-orders.js)
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User,CRMTeam`;

            // Get auth headers from tokenManager
            const headers = await window.tokenManager.getAuthHeader();

            const response = await fetch(apiUrl, {
                headers: {
                    ...headers,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            currentEditOrderData = await response.json();

            // Fetch template images for products without ImageUrl
            if (currentEditOrderData.Details && Array.isArray(currentEditOrderData.Details)) {
                for (const detail of currentEditOrderData.Details) {
                    if (detail.Product && !detail.Product.ImageUrl && detail.Product.ProductTmplId) {
                        try {
                            console.log(`📸 Fetching template image for ProductTmplId: ${detail.Product.ProductTmplId}`);
                            const headers = await window.tokenManager.getAuthHeader();
                            const templateResponse = await fetch(
                                `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/ProductTemplate(${detail.Product.ProductTmplId})`,
                                {
                                    headers: {
                                        ...headers,
                                        "Content-Type": "application/json",
                                        Accept: "application/json",
                                    },
                                }
                            );

                            if (templateResponse.ok) {
                                const templateData = await templateResponse.json();
                                detail.Product.ImageUrl = templateData.ImageUrl || '';
                                console.log(`✅ Got template image for edit modal: ${detail.Product.ImageUrl ? 'Yes' : 'No'}`);
                            }
                        } catch (error) {
                            console.error('Error fetching template image:', error);
                        }
                    }
                }
            }

            // Render modal content
            renderEditModalContent(stt);

        } catch (error) {
            console.error('Error fetching order data:', error);
            document.getElementById('editModalBody').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">Lỗi: ${error.message}</p>
                    <button class="btn btn-primary" onclick="openEditModal('${stt}', '${orderId}')">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    // Render Edit Modal Content with Merged Products
    function renderEditModalContent(stt) {
        const data = sessionIndexData[stt];
        if (!data || !currentEditOrderData) return;

        // Get assigned products for this STT
        const assignedProductCounts = {};
        data.products.forEach(product => {
            const key = product.productCode || product.productName;
            if (!assignedProductCounts[key]) {
                assignedProductCounts[key] = {
                    ...product,
                    count: 0,
                    source: 'assigned'
                };
            }
            assignedProductCounts[key].count++;
        });

        // Get existing products from order
        const existingProducts = {};
        if (currentEditOrderData.Details && Array.isArray(currentEditOrderData.Details)) {
            currentEditOrderData.Details.forEach(detail => {
                const code = detail.Product?.Code || detail.ProductCode || '';
                if (code) {
                    existingProducts[code] = {
                        code: code,
                        name: detail.Product?.NameGet || detail.ProductName || '',
                        quantity: detail.Quantity || 0,
                        price: detail.Price || 0,
                        imageUrl: detail.Product?.ImageUrl || '',
                        source: 'existing'
                    };
                }
            });
        }

        // Merge products: combine quantities if codes match
        const mergedProducts = {};

        // Add existing products first
        Object.keys(existingProducts).forEach(code => {
            mergedProducts[code] = {
                ...existingProducts[code],
                assignedQuantity: 0,
                existingQuantity: existingProducts[code].quantity,
                totalQuantity: existingProducts[code].quantity,
                hasMatch: false
            };
        });

        // Add assigned products and merge if match
        Object.keys(assignedProductCounts).forEach(code => {
            const assignedProduct = assignedProductCounts[code];
            if (mergedProducts[code]) {
                // Match found - merge quantities
                mergedProducts[code].assignedQuantity = assignedProduct.count;
                mergedProducts[code].totalQuantity = mergedProducts[code].existingQuantity + assignedProduct.count;
                mergedProducts[code].hasMatch = true;
                mergedProducts[code].imageUrl = mergedProducts[code].imageUrl || assignedProduct.imageUrl;
            } else {
                // New product to be added
                mergedProducts[code] = {
                    code: code,
                    name: assignedProduct.productName,
                    quantity: 0,
                    price: 0,
                    imageUrl: assignedProduct.imageUrl || '',
                    assignedQuantity: assignedProduct.count,
                    existingQuantity: 0,
                    totalQuantity: assignedProduct.count,
                    hasMatch: false,
                    source: 'new'
                };
            }
        });

        // Render modal body
        const modalBody = document.getElementById('editModalBody');

        let html = `
            <div class="mb-4">
                <h5 class="mb-3">
                    <i class="fas fa-hashtag"></i> STT ${stt} - ${data.orderInfo?.customerName || 'N/A'}
                </h5>
                <div class="alert alert-info mb-3">
                    <i class="fas fa-info-circle"></i>
                    <strong>Mã đơn hàng:</strong> ${currentEditOrderData.Code || 'N/A'}
                </div>
            </div>

            <div class="table-responsive">
                <table class="table table-bordered">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 50px">#</th>
                            <th>Sản phẩm</th>
                            <th class="text-center" style="width: 120px">SL có sẵn</th>
                            <th class="text-center" style="width: 120px">SL sẽ upload</th>
                            <th class="text-center" style="width: 120px">Tổng</th>
                            <th class="text-end" style="width: 150px">Giá</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        Object.values(mergedProducts).forEach((product, index) => {
            const rowClass = product.hasMatch ? 'table-warning' : (product.source === 'new' ? 'table-success' : '');
            const badge = product.hasMatch ? '<span class="badge bg-warning text-dark ms-2">Trùng mã</span>' :
                (product.source === 'new' ? '<span class="badge bg-success ms-2">Mới</span>' : '');

            html += `
                <tr class="${rowClass}">
                    <td class="text-center">${index + 1}</td>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            ${product.imageUrl ?
                    `<img src="${product.imageUrl}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">` :
                    '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-box"></i></div>'
                }
                            <div>
                                <div style="font-weight: 600;">${product.name}</div>
                                <div style="font-size: 12px; color: #6b7280;">
                                    ${product.code}${badge}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-info">${product.existingQuantity}</span>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-success">${product.assignedQuantity}</span>
                    </td>
                    <td class="text-center">
                        <strong class="badge bg-primary">${product.totalQuantity}</strong>
                    </td>
                    <td class="text-end">
                        <span style="font-weight: 600; color: #3b82f6;">
                            ${product.price.toLocaleString('vi-VN')}đ
                        </span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>

            <div class="alert alert-warning mt-3">
                <i class="fas fa-lightbulb"></i>
                <strong>Lưu ý:</strong>
                <ul class="mb-0 mt-2">
                    <li><span class="badge bg-warning text-dark">Trùng mã</span>: Sản phẩm có sẵn sẽ được cộng thêm số lượng khi upload</li>
                    <li><span class="badge bg-success">Mới</span>: Sản phẩm mới sẽ được thêm vào đơn hàng</li>
                </ul>
            </div>
        `;

        modalBody.innerHTML = html;
    }

    // Close Edit Modal
    window.closeEditModal = function () {
        const editModal = bootstrap.Modal.getInstance(document.getElementById('editOrderModal'));
        if (editModal) {
            editModal.hide();
        }
        currentEditOrderData = null;
        currentEditSTT = null;
    };

    // Setup Firebase Listeners with timestamp-based conflict resolution
    // Setup real-time Firebase listener for automatic updates
    function setupFirebaseListeners() {
        const firebasePath = getUserFirebasePath('productAssignments');
        console.log('[SYNC] 🔧 Setting up Firebase real-time listener for path:', firebasePath);

        let isFirstLoad = true; // Skip first trigger (we already loaded in init)

        database.ref(firebasePath).on('value', (snapshot) => {
            console.log('[SYNC] 🔔 Firebase listener triggered!');

            // Skip first trigger (already loaded in init)
            if (isFirstLoad) {
                console.log('[SYNC] ⏭️ Skip first listener trigger (initial data already loaded)');
                isFirstLoad = false;
                return;
            }

            // Read Firebase data
            const firebaseData = snapshot.val();

            console.log('[SYNC] 🔄 Firebase data changed, updating UI...');

            // Handle new format
            if (firebaseData && firebaseData.assignments && Array.isArray(firebaseData.assignments)) {
                // Update display using filtered assignments
                const assignmentsWithSTT = firebaseData.assignments.filter(a => a.sttList?.length > 0);
                assignments = assignmentsWithSTT;

                groupBySessionIndex();
                renderTable();
                updateTotalCount();

                console.log('[SYNC] ✅ Updated from Firebase:', assignmentsWithSTT.length, 'products with STT');
            }
            // Handle empty/null data
            else if (firebaseData === null || (firebaseData && (!firebaseData.assignments || firebaseData.assignments.length === 0))) {
                console.log('[SYNC] 🗑️ Firebase is empty, clearing assignments');

                assignments = [];
                groupBySessionIndex();
                renderTable();
                updateTotalCount();
            } else {
                console.log('[SYNC] ⚠️ Unexpected Firebase data format:', typeof firebaseData);
            }
        });

        console.log('[SYNC] ✅ Firebase real-time listener setup complete');
    }

    // REMOVED: syncFromFirebaseIfNewer
    // No longer needed - Firebase real-time listener handles all updates automatically

    // Load Orders Data from localStorage (user-specific)
    function loadOrdersData() {
        try {
            // Use user-specific localStorage key
            const localStorageKey = userStorageManager ? userStorageManager.getUserLocalStorageKey('ordersData') : 'ordersData_guest';
            console.log('[ORDERS] Loading from localStorage key:', localStorageKey);

            const cachedOrders = localStorage.getItem(localStorageKey);
            if (cachedOrders) {
                ordersData = JSON.parse(cachedOrders);
                console.log(`[ORDERS] 📦 Đã load ${ordersData.length} đơn hàng từ localStorage`);
            } else {
                console.log('[ORDERS] ⚠️ Chưa có orders data trong localStorage');
            }
        } catch (error) {
            console.error('[ORDERS] Error loading orders data:', error);
            ordersData = [];
        }
    }

    // REMOVED: No longer using localStorage sync
    // Firebase real-time listener handles all updates automatically

    // REMOVED: setupVisibilityListener and setupFocusListener
    // No longer needed - Firebase real-time listener handles all updates automatically
    // Firebase will trigger the listener callback when data changes, regardless of tab visibility

    // =====================================================
    // HISTORY & BACKUP SYSTEM
    // =====================================================

    /**
     * Create a backup snapshot before upload
     * @param {Array} uploadedSTTs - List of STTs being uploaded
     * @returns {Promise<string>} Upload ID (Backup ID)
     */
    async function createBackupBeforeUpload(uploadedSTTs) {
        try {
            console.log('[BACKUP] 📦 Creating backup before upload...');
            console.log('[BACKUP] STTs to upload:', uploadedSTTs);

            // 1. Get current data from LocalStorage
            const storedData = localStorage.getItem('productAssignments');
            let currentData = null;

            if (storedData) {
                currentData = JSON.parse(storedData);
            }

            if (!currentData || !currentData.assignments || currentData.assignments.length === 0) {
                console.log('[BACKUP] ⚠️ No assignments to backup');
                throw new Error('Không có dữ liệu để backup');
            }

            // Validate data structure
            if (!currentData.assignments || !Array.isArray(currentData.assignments)) {
                throw new Error('Invalid productAssignments structure');
            }

            // 2. Create unique upload ID
            const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('[BACKUP] Upload ID:', uploadId);

            // 3. Create backup snapshot
            const backupSnapshot = {
                uploadId: uploadId,
                timestamp: Date.now(),
                assignments: currentData.assignments,
                _timestamp: currentData._timestamp || Date.now(),
                _version: currentData._version || 1,
                uploadedSTTs: uploadedSTTs,
                expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
            };

            // 4. Save to LocalStorage (use uploadId as key)
            localStorage.setItem(`backup_${uploadId}`, JSON.stringify(backupSnapshot));

            console.log('[BACKUP] ✅ Backup created successfully in LocalStorage');
            console.log('[BACKUP] Backed up:', currentData.assignments.length, 'products');

            return uploadId;

        } catch (error) {
            console.error('[BACKUP] ❌ Error creating backup:', error);
            throw new Error(`Không thể tạo backup: ${error.message}`);
        }
    }

    /**
     * Load backup data from LocalStorage
     * @param {string} uploadId - Upload ID
     * @returns {Promise<Object>} Backup data
     */
    async function loadBackupData(uploadId) {
        try {
            console.log('[BACKUP] 📥 Loading backup:', uploadId);

            const backupData = localStorage.getItem(`backup_${uploadId}`);

            if (!backupData) {
                throw new Error('Backup not found in LocalStorage');
            }

            const backup = JSON.parse(backupData);

            console.log('[BACKUP] ✅ Backup loaded:', backup.assignments.length, 'products');
            return backup;

        } catch (error) {
            console.error('[BACKUP] ❌ Error loading backup:', error);
            throw error;
        }
    }

    /**
     * Save upload history to Firebase
     * @param {string} uploadId - Upload ID
     * @param {Array} results - Upload results
     * @param {string} status - Upload status
     * @param {Object} beforeSnapshot - Snapshot before upload
     * @param {Object|null} afterSnapshot - Snapshot after upload (null if failed)
     */
    async function saveToHistory(uploadId, results, status, beforeSnapshot, afterSnapshot) {
        try {
            console.log('[HISTORY] 💾 Saving upload history:', uploadId);
            console.log('[HISTORY] Status:', status);

            // Build history record
            const historyRecord = {
                uploadId: uploadId,
                timestamp: Date.now(),

                // Snapshots
                beforeSnapshot: {
                    assignments: beforeSnapshot.assignments || [],
                    _timestamp: beforeSnapshot._timestamp,
                    _version: beforeSnapshot._version
                },
                afterSnapshot: afterSnapshot ? {
                    assignments: afterSnapshot.assignments || [],
                    _timestamp: afterSnapshot._timestamp,
                    _version: afterSnapshot._version
                } : null,

                // Upload details
                uploadedSTTs: results.map(r => r.stt),
                uploadResults: results.map(r => ({
                    stt: r.stt,
                    orderId: r.orderId,
                    success: r.success,
                    error: r.error || null,
                    existingProducts: r.existingProducts || [] // Save existing products for comparison
                })),

                // Statistics
                totalSTTs: results.length,
                successCount: results.filter(r => r.success).length,
                failCount: results.filter(r => !r.success).length,

                // Status
                uploadStatus: status,
                canRestore: false, // Always false (restore happens immediately if needed)
                restoredAt: (status === 'failed') ? Date.now() : null,
                committedAt: null, // Will be set when marked as committed

                // Metadata
                note: ""
            };

            // Save history to Firebase
            const historyPath = getUserFirebasePath('productAssignments_history');
            await database.ref(`${historyPath}/${uploadId}`).set(historyRecord);

            // Delete backup from LocalStorage
            localStorage.removeItem(`backup_${uploadId}`);

            console.log('[HISTORY] ✅ History saved and backup cleaned');

        } catch (error) {
            console.error('[HISTORY] ❌ Error saving history:', error);
            // Don't throw - history is for audit, not critical for operation
            showNotification('⚠️ Không thể lưu lịch sử upload (không ảnh hưởng dữ liệu)', 'warning');
        }
    }

    /**
     * Mark history as committed (finalized, cannot restore)
     * @param {string} uploadId - Upload ID
     */
    async function markHistoryAsCommitted(uploadId) {
        try {
            console.log('[HISTORY] 🔒 Marking history as committed:', uploadId);

            const historyPath = getUserFirebasePath('productAssignments_history');
            await database.ref(`${historyPath}/${uploadId}`).update({
                canRestore: false,
                committedAt: Date.now()
            });

            console.log('[HISTORY] ✅ History marked as committed');

        } catch (error) {
            console.error('[HISTORY] ❌ Error marking history:', error);
            // Not critical, just log
        }
    }

    /**
     * Restore from backup when upload fails
     * @param {string} uploadId - Upload ID
     * @returns {Promise<boolean>} Success status
     */
    async function restoreFromBackup(uploadId) {
        try {
            console.log('[RESTORE] 🔄 Restoring from backup:', uploadId);

            // 1. Load backup from LocalStorage
            const backup = await loadBackupData(uploadId);

            // 2. Validate backup structure
            if (!backup.assignments || !Array.isArray(backup.assignments)) {
                throw new Error('Invalid backup structure');
            }

            // 3. Prepare restored data
            const restoredData = {
                assignments: backup.assignments,
                _timestamp: Date.now(), // New timestamp to trigger sync
                _version: backup._version || 1
            };

            console.log('[RESTORE] 📦 Restoring:', restoredData.assignments.length, 'products');

            // 4. Restore to LocalStorage
            localStorage.setItem('productAssignments', JSON.stringify(restoredData));
            console.log('[RESTORE] ✅ Restored to LocalStorage');

            // Dispatch storage event manually
            window.dispatchEvent(new Event('storage'));

            // Reload UI
            loadAssignmentsFromLocalStorage();

            console.log('[RESTORE] ✅ Restore completed successfully');
            return true;

        } catch (error) {
            console.error('[RESTORE] ❌ Error restoring from backup:', error);
            showNotification('❌ Lỗi khôi phục dữ liệu: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * Cleanup backup (delete from Firebase)
     * @param {string} uploadId - Upload ID
     */
    async function cleanupBackup(uploadId) {
        try {
            if (!uploadId) return;

            console.log('[CLEANUP] 🗑️ Cleaning up backup:', uploadId);
            const backupPath = getUserFirebasePath('productAssignments_backup');
            await database.ref(`${backupPath}/${uploadId}`).remove();
            console.log('[CLEANUP] ✅ Backup cleaned up');

        } catch (error) {
            console.error('[CLEANUP] ❌ Error cleaning up backup:', error);
            // Not critical, just log
        }
    }

    // Initialize on load
    window.addEventListener('load', async () => {
        try {
            console.log('[INIT] 🚀 Initializing Tab Upload TPOS...');

            // Initialize userStorageManager
            userStorageManager = window.userStorageManager;
            if (!userStorageManager) {
                console.warn('[INIT] ⚠️ UserStorageManager not available, creating fallback');
                userStorageManager = {
                    getUserFirebasePath: (path) => `${path}/guest`,
                    getUserLocalStorageKey: (key) => `${key}_guest`
                };
            }
            console.log('[INIT] 📱 User identifier:', userStorageManager.getUserIdentifier ? userStorageManager.getUserIdentifier() : 'guest');

            // Auth handled by tokenManager automatically when needed

            // 1. Load orders data from localStorage (backward compat)
            loadOrdersData();

            // 2. Load assignments from LocalStorage (SOURCE OF TRUTH)
            console.log('[INIT] 💾 Loading from LocalStorage (source of truth)...');
            loadAssignmentsFromLocalStorage();

            // 3. Setup LocalStorage listener for automatic updates
            console.log('[INIT] 🔧 Setting up LocalStorage listener...');
            setupLocalStorageListeners();       // Real-time LocalStorage sync

            // 4. Update UI
            updateSelectedCount();

            console.log('[INIT] ✅ Initialization complete!');
        } catch (error) {
            console.error('[INIT] ❌ Initialization error:', error);
            showNotification('Lỗi khởi tạo: ' + error.message, 'error');
        }
    });

    // =====================================================
    // UPLOAD HISTORY VIEWER
    // =====================================================

    // Global state for history viewer
    let uploadHistoryRecords = [];
    let filteredHistoryRecords = [];
    let currentHistoryPage = 1;
    const HISTORY_PAGE_SIZE = 20;

    /**
     * Get user display name from userId
     * @param {string} userId - User identifier
     * @returns {string} Display name
     */
    function getUserDisplayName(userId) {
        if (!userId) return 'Unknown';

        // Extract username from userId (format: username-shop or just username)
        if (userId.includes('-')) {
            return userId.split('-')[0];
        }
        return userId;
    }

    /**
     * Load all users who have upload history
     * @returns {Promise<Array>} Array of user IDs
     */
    async function loadAllUsersForFilter() {
        try {
            console.log('[HISTORY] 📥 Loading all users for filter...');

            // Query Firebase root path to get all users
            const historyRef = database.ref('productAssignments_history');
            const snapshot = await historyRef.once('value');

            const userIds = [];
            if (snapshot.exists()) {
                snapshot.forEach(childSnapshot => {
                    userIds.push(childSnapshot.key);
                });
            }

            // Sort alphabetically
            userIds.sort();

            console.log(`[HISTORY] ✅ Found ${userIds.length} users with upload history`);
            return userIds;
        } catch (error) {
            console.error('[HISTORY] ❌ Error loading users for filter:', error);
            return [];
        }
    }

    /**
     * Populate user filter dropdown with all users
     */
    async function populateUserFilter() {
        try {
            const userFilterSelect = document.getElementById('historyUserFilter');
            if (!userFilterSelect) {
                console.warn('[HISTORY] User filter select not found');
                return;
            }

            // Get current logged-in user
            const currentUser = userStorageManager ? userStorageManager.getUserIdentifier() : null;
            console.log('[HISTORY] Current user:', currentUser);

            // Load all users who have history
            const allUsers = await loadAllUsersForFilter();

            // Clear existing options and rebuild
            userFilterSelect.innerHTML = `
                <option value="current">👤 Lịch sử của tôi</option>
                <option value="all">👥 Tất cả người dùng</option>
            `;

            // Add separator if there are users
            if (allUsers.length > 0) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '───────────────';
                userFilterSelect.appendChild(separator);
            }

            // Add option for each user
            allUsers.forEach(userId => {
                const option = document.createElement('option');
                option.value = userId;
                option.textContent = `👤 ${getUserDisplayName(userId)}`;

                // Mark current user's option
                if (userId === currentUser) {
                    option.textContent += ' (bạn)';
                }

                userFilterSelect.appendChild(option);
            });

            console.log('[HISTORY] ✅ User filter populated with', allUsers.length, 'users');
        } catch (error) {
            console.error('[HISTORY] ❌ Error populating user filter:', error);
        }
    }

    /**
     * Open Upload History Modal
     */
    window.openUploadHistoryModal = async function () {
        console.log('[HISTORY] 📜 Opening upload history modal...');

        try {
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('uploadHistoryModal'));
            modal.show();

            // Show loading state
            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-info" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải lịch sử upload...</p>
                </div>
            `;

            // Populate user filter dropdown
            await populateUserFilter();

            // Load history from Firebase
            await loadUploadHistory();

            // Render history list
            renderUploadHistoryList();

        } catch (error) {
            console.error('[HISTORY] ❌ Error opening history modal:', error);
            showNotification('❌ Lỗi khi tải lịch sử upload', 'error');

            const container = document.getElementById('historyListContainer');
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Lỗi khi tải lịch sử upload</p>
                    <p class="small text-danger">${error.message}</p>
                    <button class="btn btn-sm btn-primary mt-2" onclick="openUploadHistoryModal()">
                        <i class="fas fa-redo"></i> Thử lại
                    </button>
                </div>
            `;
        }
    };

    /**
     * Load upload history from Firebase
     * Only loads summary fields for performance
     * Supports loading by user filter: current, all, or specific userId
     */
    async function loadUploadHistory() {
        try {
            console.log('[HISTORY] 📥 Loading history from Firebase...');

            // Get selected user filter
            const userFilterSelect = document.getElementById('historyUserFilter');
            const selectedUser = userFilterSelect ? userFilterSelect.value : 'current';
            console.log('[HISTORY] Selected user filter:', selectedUser);

            let historyPath;
            let snapshot;

            // Determine query path based on user filter
            if (selectedUser === 'current') {
                // Load current user's history (default behavior)
                historyPath = getUserFirebasePath('productAssignments_history');
                console.log('[HISTORY] Loading current user history from path:', historyPath);
                snapshot = await database.ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            } else if (selectedUser === 'all') {
                // Load ALL users' history from root path
                historyPath = 'productAssignments_history';
                console.log('[HISTORY] Loading ALL users history from path:', historyPath);
                snapshot = await database.ref(historyPath).once('value');
            } else {
                // Load specific user's history
                historyPath = `productAssignments_history/${selectedUser}`;
                console.log('[HISTORY] Loading specific user history from path:', historyPath);
                snapshot = await database.ref(historyPath)
                    .orderByChild('timestamp')
                    .limitToLast(100)
                    .once('value');
            }

            const data = snapshot.val();

            if (!data) {
                console.log('[HISTORY] ℹ️ No history records found');
                uploadHistoryRecords = [];
                filteredHistoryRecords = [];
                return;
            }

            // Convert to array based on data structure
            uploadHistoryRecords = [];

            if (selectedUser === 'all') {
                // Flatten data from all users
                Object.keys(data).forEach(userId => {
                    const userHistory = data[userId];
                    if (userHistory && typeof userHistory === 'object') {
                        Object.keys(userHistory).forEach(uploadKey => {
                            const record = userHistory[uploadKey];
                            uploadHistoryRecords.push({
                                uploadId: record.uploadId || uploadKey,
                                timestamp: record.timestamp || 0,
                                uploadStatus: record.uploadStatus || 'unknown',
                                totalSTTs: record.totalSTTs || 0,
                                successCount: record.successCount || 0,
                                failCount: record.failCount || 0,
                                uploadedSTTs: record.uploadedSTTs || [],
                                note: record.note || '',
                                committedAt: record.committedAt || null,
                                restoredAt: record.restoredAt || null,
                                userId: userId // Add userId for tracking
                            });
                        });
                    }
                });
            } else {
                // Single user data (current or specific user)
                uploadHistoryRecords = Object.keys(data).map(key => {
                    const record = data[key];
                    return {
                        uploadId: record.uploadId || key,
                        timestamp: record.timestamp || 0,
                        uploadStatus: record.uploadStatus || 'unknown',
                        totalSTTs: record.totalSTTs || 0,
                        successCount: record.successCount || 0,
                        failCount: record.failCount || 0,
                        uploadedSTTs: record.uploadedSTTs || [],
                        note: record.note || '',
                        committedAt: record.committedAt || null,
                        restoredAt: record.restoredAt || null,
                        userId: selectedUser !== 'current' ? selectedUser : undefined // Add userId only for non-current user
                    };
                });
            }

            // Sort by timestamp descending (newest first)
            uploadHistoryRecords.sort((a, b) => b.timestamp - a.timestamp);

            // Limit to 100 most recent records when loading all users
            if (selectedUser === 'all' && uploadHistoryRecords.length > 100) {
                uploadHistoryRecords = uploadHistoryRecords.slice(0, 100);
            }

            // Initialize filtered records (no filter yet)
            filteredHistoryRecords = [...uploadHistoryRecords];

            console.log(`[HISTORY] ✅ Loaded ${uploadHistoryRecords.length} history records`);

        } catch (error) {
            console.error('[HISTORY] ❌ Error loading history:', error);
            throw error;
        }
    }

    /**
     * Filter upload history based on user input
     */
    window.filterUploadHistory = function () {
        const status = document.getElementById('historyStatusFilter').value;
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;
        const searchSTT = document.getElementById('historySearchSTT').value.trim();

        console.log('[HISTORY] 🔍 Filtering history:', { status, dateFrom, dateTo, searchSTT });

        // Start with all records
        filteredHistoryRecords = [...uploadHistoryRecords];

        // Filter by status
        if (status && status !== 'all') {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.uploadStatus === status);
        }

        // Filter by date range
        if (dateFrom) {
            const fromTimestamp = new Date(dateFrom).getTime();
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp >= fromTimestamp);
        }

        if (dateTo) {
            const toTimestamp = new Date(dateTo).setHours(23, 59, 59, 999); // End of day
            filteredHistoryRecords = filteredHistoryRecords.filter(record => record.timestamp <= toTimestamp);
        }

        // Filter by STT search
        if (searchSTT) {
            filteredHistoryRecords = filteredHistoryRecords.filter(record => {
                return record.uploadedSTTs.some(stt => stt.toString().includes(searchSTT));
            });
        }

        // Reset to page 1
        currentHistoryPage = 1;

        // Re-render list
        renderUploadHistoryList();

        console.log(`[HISTORY] ✅ Filtered to ${filteredHistoryRecords.length} records`);
    };

    /**
     * Render upload history list with pagination
     */
    function renderUploadHistoryList() {
        const container = document.getElementById('historyListContainer');

        // Empty state
        if (filteredHistoryRecords.length === 0) {
            container.innerHTML = `
                <div class="history-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy lịch sử upload nào</p>
                    <p class="small">Lịch sử sẽ được lưu tự động sau mỗi lần upload</p>
                </div>
            `;
            document.getElementById('historyPagination').innerHTML = '';
            return;
        }

        // Calculate pagination
        const totalPages = Math.ceil(filteredHistoryRecords.length / HISTORY_PAGE_SIZE);
        const startIndex = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
        const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE, filteredHistoryRecords.length);
        const pageRecords = filteredHistoryRecords.slice(startIndex, endIndex);

        // Render history cards
        container.innerHTML = pageRecords.map(record => formatHistoryCard(record)).join('');

        // Render pagination
        renderHistoryPagination(totalPages);
    }

    /**
     * Format a single history card HTML
     */
    function formatHistoryCard(record) {
        // Status config
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công', class: 'completed' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'partial' },
            'failed': { icon: '❌', text: 'Thất bại', class: 'failed' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Xóa failed', class: 'deletion_failed' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'unknown' };

        // Format date
        const date = new Date(record.timestamp);
        const dateStr = date.toLocaleString('vi-VN');

        // Format uploadId (show last 8 chars)
        const shortId = record.uploadId.slice(-8);

        // Format user badge (show if userId is present)
        const userBadge = record.userId ? `<span class="user-badge">👤 ${getUserDisplayName(record.userId)}</span>` : '';

        // Format STTs list (limit to first 20, then "...")
        const sttList = record.uploadedSTTs.slice(0, 20).join(', ');
        const moreStt = record.uploadedSTTs.length > 20 ? ` và ${record.uploadedSTTs.length - 20} STT khác` : '';

        return `
            <div class="history-card ${config.class}">
                <div class="history-card-header">
                    <div>
                        <h6 class="history-card-title">
                            ${config.icon} Upload #${shortId} ${userBadge}
                            <span class="history-card-date">${dateStr}</span>
                        </h6>
                    </div>
                    <span class="history-status-badge ${config.class}">${config.text}</span>
                </div>

                <div class="history-stats">
                    <div class="history-stat-item history-stat-success">
                        <i class="fas fa-check-circle"></i>
                        <span><strong>${record.successCount}</strong> thành công</span>
                    </div>
                    <div class="history-stat-item history-stat-failed">
                        <i class="fas fa-times-circle"></i>
                        <span><strong>${record.failCount}</strong> thất bại</span>
                    </div>
                    <div class="history-stat-item history-stat-total">
                        <i class="fas fa-list"></i>
                        <span><strong>${record.totalSTTs}</strong> tổng STT</span>
                    </div>
                </div>

                <div class="history-stts">
                    <strong>STT:</strong> ${sttList}${moreStt}
                </div>

                <div class="history-actions">
                    <button class="btn btn-sm btn-info" onclick="compareCartHistory('${record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-balance-scale"></i> So Sánh Giỏ
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="viewUploadHistoryDetail('${record.uploadId}', '${record.userId || ''}')">
                        <i class="fas fa-eye"></i> Xem Chi Tiết
                    </button>
                </div>

                ${record.note ? `
                    <div class="history-note">
                        <i class="fas fa-sticky-note"></i>
                        ${record.note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Render pagination controls
     */
    function renderHistoryPagination(totalPages) {
        const pagination = document.getElementById('historyPagination');

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        let html = '';

        // Previous button
        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage - 1})"
                    ${currentHistoryPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Page numbers (show max 7 pages)
        const maxPageButtons = 7;
        let startPage = Math.max(1, currentHistoryPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

        // Adjust startPage if endPage is at max
        if (endPage - startPage < maxPageButtons - 1) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }

        // First page button
        if (startPage > 1) {
            html += `
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(1)">1</button>
                ${startPage > 2 ? '<span>...</span>' : ''}
            `;
        }

        // Page buttons
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="btn btn-sm ${i === currentHistoryPage ? 'btn-info active' : 'btn-outline-secondary'}"
                        onclick="changeHistoryPage(${i})">
                    ${i}
                </button>
            `;
        }

        // Last page button
        if (endPage < totalPages) {
            html += `
                ${endPage < totalPages - 1 ? '<span>...</span>' : ''}
                <button class="btn btn-sm btn-outline-secondary" onclick="changeHistoryPage(${totalPages})">${totalPages}</button>
            `;
        }

        // Next button
        html += `
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="changeHistoryPage(${currentHistoryPage + 1})"
                    ${currentHistoryPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        pagination.innerHTML = html;
    }

    /**
     * Change history page
     */
    window.changeHistoryPage = function (page) {
        currentHistoryPage = page;
        renderUploadHistoryList();

        // Scroll to top of list
        document.getElementById('historyListContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /**
     * View upload history detail
     * Lazy load uploadResults from Firebase
     */
    window.viewUploadHistoryDetail = async function (uploadId, userId = '') {
        console.log('[HISTORY] 👁️ Viewing detail for:', uploadId, 'userId:', userId);

        try {
            // Show detail modal with loading state
            const detailModal = new bootstrap.Modal(document.getElementById('uploadHistoryDetailModal'));
            detailModal.show();

            const titleEl = document.getElementById('historyDetailModalTitle');
            const bodyEl = document.getElementById('historyDetailModalBody');

            titleEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
            bodyEl.innerHTML = `
                <div class="history-loading">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải chi tiết upload...</p>
                </div>
            `;

            // Load full record from Firebase (with uploadResults)
            // If userId is provided, use that path; otherwise use current user's path
            let historyPath;
            if (userId && userId !== '') {
                historyPath = `productAssignments_history/${userId}`;
            } else {
                historyPath = getUserFirebasePath('productAssignments_history');
            }
            console.log('[HISTORY] Loading detail from path:', historyPath);
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record) {
                throw new Error('Không tìm thấy record');
            }

            // Update title
            const shortId = uploadId.slice(-8);
            const date = new Date(record.timestamp).toLocaleString('vi-VN');
            titleEl.innerHTML = `<i class="fas fa-info-circle"></i> Chi Tiết Upload #${shortId}`;

            // Render detail content
            bodyEl.innerHTML = renderUploadHistoryDetail(record);

        } catch (error) {
            console.error('[HISTORY] ❌ Error viewing detail:', error);
            showNotification('❌ Lỗi khi tải chi tiết upload', 'error');

            const bodyEl = document.getElementById('historyDetailModalBody');
            bodyEl.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Lỗi: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render upload history detail HTML
     * Shows products grouped by product code with aggregated quantities from all STTs
     */
    function renderUploadHistoryDetail(record) {
        // Status config
        const statusConfig = {
            'completed': { icon: '✅', text: 'Thành công hoàn toàn', class: 'success' },
            'partial': { icon: '⚠️', text: 'Thành công một phần', class: 'warning' },
            'failed': { icon: '❌', text: 'Thất bại hoàn toàn', class: 'danger' },
            'deletion_failed': { icon: '⚠️', text: 'Upload OK - Không xóa được', class: 'warning' }
        };

        const config = statusConfig[record.uploadStatus] || { icon: '❓', text: 'Unknown', class: 'secondary' };

        // Format date
        const date = new Date(record.timestamp).toLocaleString('vi-VN');

        // Build info section
        let html = `
            <div class="history-detail-info mb-4">
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Upload ID:</span>
                        <span class="history-detail-value">${record.uploadId}</span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Thời gian:</span>
                        <span class="history-detail-value">${date}</span>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <span class="history-detail-label">Trạng thái:</span>
                        <span class="history-detail-value">
                            <span class="badge bg-${config.class}">${config.icon} ${config.text}</span>
                        </span>
                    </div>
                    <div class="col-md-6">
                        <span class="history-detail-label">Tổng STT:</span>
                        <span class="history-detail-value">
                            <strong>${record.totalSTTs}</strong>
                            (✅ ${record.successCount} | ❌ ${record.failCount})
                        </span>
                    </div>
                </div>
            </div>
        `;

        // Group products by product code from beforeSnapshot.assignments
        const productsByCode = {};

        if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
            record.beforeSnapshot.assignments.forEach(assignment => {
                if (assignment.sttList && Array.isArray(assignment.sttList)) {
                    assignment.sttList.forEach(sttItem => {
                        // Handle both object {stt: "32"} and string "32" formats
                        const stt = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                        const productKey = assignment.productCode || assignment.productId;

                        if (!productsByCode[productKey]) {
                            productsByCode[productKey] = {
                                productId: assignment.productId,
                                productCode: assignment.productCode,
                                productName: assignment.productName,
                                imageUrl: assignment.imageUrl,
                                note: assignment.note || '',
                                count: 0,
                                sttList: []
                            };
                        }

                        productsByCode[productKey].count++;
                        productsByCode[productKey].sttList.push(stt);
                    });
                }
            });
        }

        // Create upload results map for quick lookup
        const uploadResultsMap = {};
        if (record.uploadResults) {
            record.uploadResults.forEach(result => {
                uploadResultsMap[result.stt] = result;
            });
        }

        // Get successful and failed STTs
        const successfulSTTs = [];
        const failedSTTs = [];
        Object.entries(uploadResultsMap).forEach(([stt, result]) => {
            if (result.success) {
                successfulSTTs.push(stt);
            } else {
                failedSTTs.push(stt);
            }
        });

        // Render products grouped by product code
        html += '<h6 class="mb-3"><i class="fas fa-box"></i> Sản phẩm đã upload</h6>';

        if (Object.keys(productsByCode).length === 0) {
            html += `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    Không có dữ liệu products trong beforeSnapshot
                </div>
            `;
        } else {
            // Determine overall status
            let cardClass = 'border-primary';

            html += `
                <div class="card mb-3 ${cardClass}">
                    <div class="card-body">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th style="width: 50%;">Sản phẩm</th>
                                    <th class="text-center" style="width: 15%;">Số lượng</th>
                                    <th class="text-center" style="width: 20%;">Mã đơn hàng</th>
                                    <th style="width: 15%;">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(productsByCode)
                                    .sort((a, b) => a.productName.localeCompare(b.productName))
                                    .map(product => `
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center gap-2">
                                                ${product.imageUrl
                                                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                                                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📦</div>'}
                                                <div>
                                                    <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                    <div style="font-size: 12px; color: #6b7280;">${product.productCode || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="text-center">
                                            <span class="badge bg-primary">${product.count}</span>
                                        </td>
                                        <td class="text-center">
                                            <span class="text-muted" style="font-size: 13px;">
                                                ${product.sttList.join(', ')}
                                            </span>
                                        </td>
                                        <td>
                                            ${formatNoteWithClickableEncoded(product.note)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // Show upload results summary
            if (successfulSTTs.length > 0 || failedSTTs.length > 0) {
                html += '<h6 class="mb-3 mt-4"><i class="fas fa-clipboard-check"></i> Kết quả upload</h6>';

                if (successfulSTTs.length > 0) {
                    html += `
                        <div class="alert alert-success" role="alert">
                            <strong><i class="fas fa-check-circle"></i> Thành công (${successfulSTTs.length} STT):</strong>
                            ${successfulSTTs.map(stt => {
                                return `${stt}`;
                            }).join(', ')}
                        </div>
                    `;
                }

                if (failedSTTs.length > 0) {
                    html += `
                        <div class="alert alert-danger" role="alert">
                            <strong><i class="fas fa-exclamation-circle"></i> Thất bại (${failedSTTs.length} STT):</strong>
                            ${failedSTTs.map(stt => {
                                const result = uploadResultsMap[stt];
                                return `STT ${stt} - ${result.error || 'Unknown error'}`;
                            }).join('<br>')}
                        </div>
                    `;
                }
            }
        }

        // Note section
        if (record.note) {
            html += `
                <div class="history-note mt-3">
                    <i class="fas fa-sticky-note"></i>
                    <strong>Ghi chú:</strong> ${record.note}
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // COMPARE CART HISTORY - Show comparison modal
    // =====================================================

    /**
     * Compare Cart History - Show preview comparison modal
     * Similar to previewModal but for history records
     */
    window.compareCartHistory = async function (uploadId, userId = '') {
        console.log('[HISTORY-COMPARE] 🔍 Comparing cart for uploadId:', uploadId, 'userId:', userId);

        try {
            // Show comparison modal with loading state
            const compareModal = new bootstrap.Modal(document.getElementById('compareCartHistoryModal'));
            compareModal.show();

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-2">Đang tải dữ liệu so sánh...</p>
                </div>
            `;

            // Load full record from Firebase (with beforeSnapshot)
            // If userId is provided, use that path; otherwise use current user's path
            let historyPath;
            if (userId && userId !== '') {
                historyPath = `productAssignments_history/${userId}`;
            } else {
                historyPath = getUserFirebasePath('productAssignments_history');
            }
            console.log('[HISTORY-COMPARE] Loading from path:', historyPath);
            const snapshot = await database.ref(`${historyPath}/${uploadId}`).once('value');
            const record = snapshot.val();

            if (!record || !record.beforeSnapshot) {
                throw new Error('Không tìm thấy dữ liệu snapshot');
            }

            console.log('[HISTORY-COMPARE] ✅ Loaded record:', record);

            // Render comparison content (similar to renderPreviewModal)
            modalBody.innerHTML = renderComparisonContent(record);

        } catch (error) {
            console.error('[HISTORY-COMPARE] ❌ Error:', error);
            showNotification('❌ Lỗi khi tải dữ liệu so sánh', 'error');

            const modalBody = document.getElementById('compareCartHistoryModalBody');
            modalBody.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Lỗi:</strong> ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render comparison content for history record
     * Format: Same as previewModal (2 columns: assigned products vs existing products)
     */
    function renderComparisonContent(record) {
        const beforeSnapshot = record.beforeSnapshot;
        const uploadResults = record.uploadResults || [];

        // Create map of upload results by STT for quick lookup
        const uploadResultsMap = {};
        uploadResults.forEach(result => {
            uploadResultsMap[result.stt] = result;
        });

        // Group products by STT from beforeSnapshot.assignments
        const productsBySTT = {};

        if (beforeSnapshot && beforeSnapshot.assignments) {
            beforeSnapshot.assignments.forEach(assignment => {
                if (!assignment.sttList || !Array.isArray(assignment.sttList)) return;

                assignment.sttList.forEach(sttItem => {
                    const stt = typeof sttItem === 'object' ? sttItem.stt : sttItem;

                    if (!productsBySTT[stt]) {
                        productsBySTT[stt] = {
                            assignedProducts: [],
                            orderInfo: typeof sttItem === 'object' ? sttItem.orderInfo : null
                        };
                    }

                    productsBySTT[stt].assignedProducts.push({
                        productId: assignment.productId,
                        productName: assignment.productName,
                        productCode: assignment.productCode,
                        imageUrl: assignment.imageUrl,
                        note: assignment.note || ''
                    });
                });
            });
        }

        // Render HTML for each STT
        let html = '';
        const sortedSTTs = Object.keys(productsBySTT).sort((a, b) => Number(a) - Number(b));

        sortedSTTs.forEach(stt => {
            const data = productsBySTT[stt];
            const uploadResult = uploadResultsMap[stt];

            // Count assigned products
            const assignedProductCounts = {};
            data.assignedProducts.forEach(product => {
                const key = product.productId;
                if (!assignedProductCounts[key]) {
                    assignedProductCounts[key] = { ...product, count: 0 };
                }
                assignedProductCounts[key].count++;
            });

            // Get existing products from upload result (if available)
            const existingProducts = uploadResult?.existingProducts || [];

            // Create map of existing products for highlighting
            const existingProductsMap = {};
            existingProducts.forEach(product => {
                if (product.productId) {
                    existingProductsMap[product.productId] = product;
                }
            });

            // Mark assigned products as new or existing
            Object.values(assignedProductCounts).forEach(product => {
                product.isExisting = !!existingProductsMap[product.productId];
            });

            // Card header with status badge
            let statusBadge = '';
            let cardClass = '';
            if (uploadResult) {
                if (uploadResult.success) {
                    statusBadge = `<span class="badge bg-success ms-2">✅ Upload thành công</span>`;
                    cardClass = 'border-success';
                } else {
                    statusBadge = `<span class="badge bg-danger ms-2">❌ Upload thất bại</span>`;
                    cardClass = 'border-danger';
                }
            }

            // Filter non-encoded notes for display
            const historyFilteredNote = data.orderInfo?.note ? filterNonEncodedNotes(data.orderInfo.note) : '';

            html += `
                <div class="card mb-4 ${cardClass}">
                    <div class="card-header bg-primary text-white">
                        <h5 class="mb-0">
                            <i class="fas fa-hashtag"></i> STT ${stt}
                            ${data.orderInfo?.customerName ? `- ${data.orderInfo.customerName}` : ''}
                            ${historyFilteredNote ? `, ${historyFilteredNote}` : ''}
                            ${statusBadge}
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <!-- Assigned Products (LEFT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-success">
                                    <i class="fas fa-plus-circle"></i> Sản phẩm đã upload (${Object.keys(assignedProductCounts).length})
                                </h6>
                                <table class="table table-sm table-bordered">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Sản phẩm</th>
                                            <th class="text-center">SL</th>
                                            <th>Note</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${Object.values(assignedProductCounts).map(product => {
                const statusBadge = product.isExisting
                    ? '<span class="badge bg-warning text-dark ms-2" title="Sản phẩm đã có trong đơn, đã cộng thêm số lượng"><i class="fas fa-plus"></i> Cộng SL</span>'
                    : '<span class="badge bg-success ms-2" title="Sản phẩm mới đã được thêm vào đơn"><i class="fas fa-star"></i> Mới</span>';

                return `
                                            <tr class="${product.isExisting ? 'table-warning' : 'table-success'}">
                                                <td>
                                                    <div class="d-flex align-items-center gap-2">
                                                        ${product.imageUrl
                        ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                        : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                        <div style="flex: 1;">
                                                            <div style="font-weight: 600; font-size: 14px;">${product.productName}</div>
                                                            <div style="font-size: 12px; color: #6b7280;">
                                                                ${product.productCode || 'N/A'}
                                                                ${statusBadge}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td class="text-center">
                                                    <span class="badge ${product.isExisting ? 'bg-warning text-dark' : 'bg-success'}">${product.count}</span>
                                                </td>
                                                <td>
                                                    ${formatNoteWithClickableEncoded(product.note)}
                                                </td>
                                            </tr>
                                        `}).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- Existing Products (RIGHT COLUMN) -->
                            <div class="col-md-6">
                                <h6 class="text-info">
                                    <i class="fas fa-box"></i> Sản phẩm có sẵn trong đơn (${existingProducts.length})
                                </h6>
                                ${existingProducts.length > 0 ? `
                                    <table class="table table-sm table-bordered">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Sản phẩm</th>
                                                <th class="text-center">SL</th>
                                                <th class="text-end">Giá</th>
                                                <th>Note</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${existingProducts.map(product => {
                            // Check if this product will be updated (exists in assigned products)
                            const willBeUpdated = !!assignedProductCounts[product.productId];
                            const updateBadge = willBeUpdated
                                ? '<span class="badge bg-warning text-dark ms-1" title="Sản phẩm này đã được cộng thêm số lượng"><i class="fas fa-arrow-up"></i></span>'
                                : '';

                            return `
                                                <tr class="${willBeUpdated ? 'table-warning' : ''}">
                                                    <td>
                                                        <div class="d-flex align-items-center gap-2">
                                                            ${product.imageUrl
                                    ? `<img src="${product.imageUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">`
                                    : '<div style="width: 40px; height: 40px; background: #e5e7eb; border-radius: 4px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                                                            <div style="flex: 1;">
                                                                <div style="font-weight: 600; font-size: 14px;">${product.nameGet || product.name || 'N/A'}</div>
                                                                <div style="font-size: 12px; color: #6b7280;">${product.code || 'N/A'}${updateBadge}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td class="text-center">
                                                        <span class="badge bg-info">${product.quantity}</span>
                                                    </td>
                                                    <td class="text-end">
                                                        <span style="font-weight: 600; color: #3b82f6;">${(product.price || 0).toLocaleString('vi-VN')}đ</span>
                                                    </td>
                                                    <td>
                                                        ${formatNoteWithClickableEncoded(product.note)}
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                ` : `
                                    <div class="text-center text-muted py-3 border rounded">
                                        <i class="fas fa-inbox fa-2x mb-2"></i>
                                        <p class="mb-0">Không có sản phẩm có sẵn</p>
                                        <small>(Tất cả sản phẩm đều là mới)</small>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (sortedSTTs.length === 0) {
            html = `
                <div class="alert alert-warning" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Không có dữ liệu để hiển thị</strong>
                    <p class="mb-0 mt-2">Bản ghi lịch sử này không chứa thông tin sản phẩm.</p>
                </div>
            `;
        }

        return html;
    }

    // =====================================================
    // DEBUG/TEST FUNCTIONS (Exposed to window for testing)
    // =====================================================
    window.testProductEncoding = function () {
        console.log('=== Testing Product Encoding (NEW FORMAT) ===\n');

        const testOrderId = 12345; // Test order ID

        // Test 1: Single product
        const products = [
            { productCode: 'SP001', quantity: 5, price: 100000 },
            { productCode: 'SP002', quantity: 3, price: 150000 },
            { productCode: 'ABC-123', quantity: 10, price: 50000 }
        ];

        console.log('Test Order ID:', testOrderId);
        console.log('Original products:', products);

        // Encode
        console.log('\n=== Testing Encoding ===\n');
        const encodedLines = products.map(p => {
            const encoded = encodeProductLine(testOrderId, p.productCode, p.quantity, p.price);
            console.log(`  Order ${testOrderId}: ${p.productCode}|${p.quantity}|${p.price} → ${encoded} (${encoded.length} chars)`);
            return encoded;
        });

        console.log('\n=== Testing Decoding (with correct orderId) ===\n');

        // Decode with correct orderId
        encodedLines.forEach((encoded, i) => {
            const decoded = decodeProductLine(encoded, testOrderId);
            console.log(`  ${encoded} → `, decoded);
            const original = products[i];
            const match = decoded &&
                decoded.orderId === testOrderId &&
                decoded.productCode === original.productCode &&
                decoded.quantity === original.quantity &&
                decoded.price === original.price;
            console.log(`  Match: ${match ? '✅' : '❌'}`);
        });

        console.log('\n=== Testing Decoding (with WRONG orderId - should fail) ===\n');

        // Decode with wrong orderId (should return null)
        const wrongOrderId = 99999;
        encodedLines.forEach((encoded, i) => {
            const decoded = decodeProductLine(encoded, wrongOrderId);
            console.log(`  ${encoded} with orderId=${wrongOrderId} → `, decoded);
            console.log(`  Expected to fail: ${decoded === null ? '✅' : '❌'}`);
        });

        console.log('\n=== Testing Note Append ===\n');

        const currentNote = 'Khách VIP - Giao gấp trước 5h';
        const updatedNote = appendEncodedProducts(testOrderId, currentNote, products);
        console.log('Original Note:', currentNote);
        console.log('Updated Note:', updatedNote);
        console.log('Note length:', updatedNote.length, 'chars');

        console.log('\n=== Testing Extract ===\n');

        const extracted = extractEncodedProducts(updatedNote);
        console.log('Extracted products:', extracted);
        console.log('Count matches:', extracted.length === products.length ? '✅' : '❌');

        console.log('\n=== Test Complete ===');
    };

    window.decodeOrderNote = function (note) {
        console.log('=== Decoding Order Note ===\n');
        console.log('Note:', note);

        const products = extractEncodedProducts(note);
        console.log('\nExtracted Products:', products);

        if (products.length > 0) {
            console.log('\nFormatted:');
            products.forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.productCode} x${p.quantity} - ${p.price.toLocaleString('vi-VN')}đ`);
            });
        } else {
            console.log('\nNo encoded products found in note.');
        }

        return products;
    };

    console.log('💡 Test functions available:');
    console.log('  - window.testProductEncoding() : Test encode/decode functionality');
    console.log('  - window.decodeOrderNote(note) : Decode products from order note');

    // =====================================================
    // EVENT DELEGATION FOR ENCODED STRING CLICKS
    // =====================================================
    document.addEventListener('click', function (event) {
        const target = event.target.closest('.encoded-string-clickable');
        if (target) {
            event.preventDefault();
            const encodedString = target.getAttribute('data-encoded');
            if (encodedString) {
                window.handleEncodedStringClick(encodedString);
            }
        }
    });

    console.log('✅ Event delegation for encoded strings initialized');

    // =====================================================
    // FINALIZE SESSION FUNCTIONALITY
    // =====================================================

    // State for finalize session
    let finalizeSessionData = {
        records: [],
        stats: null,
        lastFinalizeTimestamp: null
    };

    /**
     * Get last finalize timestamp from Firebase
     * @returns {Promise<number|null>} Timestamp of last finalize or null
     */
    async function getLastFinalizeTimestamp() {
        try {
            console.log('[FINALIZE] 📅 Getting last finalize timestamp...');

            const snapshot = await database.ref('uploadSessionFinalize')
                .orderByChild('timestamp')
                .limitToLast(1)
                .once('value');

            const data = snapshot.val();
            if (!data) {
                console.log('[FINALIZE] ℹ️ No previous finalize found');
                return null;
            }

            const lastRecord = Object.values(data)[0];
            console.log('[FINALIZE] ✅ Last finalize timestamp:', new Date(lastRecord.timestamp).toLocaleString('vi-VN'));
            return lastRecord.timestamp;

        } catch (error) {
            console.error('[FINALIZE] ❌ Error getting last finalize timestamp:', error);
            return null;
        }
    }

    /**
     * Load upload history from ALL users (admin view)
     * @param {number|null} sinceTimestamp - Only load records after this timestamp
     * @returns {Promise<Array>} Array of history records
     */
    async function loadAllUsersUploadHistory(sinceTimestamp = null) {
        try {
            console.log('[FINALIZE] 📥 Loading history from ALL users...');
            console.log('[FINALIZE] Since timestamp:', sinceTimestamp ? new Date(sinceTimestamp).toLocaleString('vi-VN') : 'Beginning');

            // Load from root productAssignments_history (all users)
            const snapshot = await database.ref('productAssignments_history')
                .once('value');

            const data = snapshot.val();
            console.log('[FINALIZE] Raw data from Firebase:', data);

            if (!data) {
                console.log('[FINALIZE] ℹ️ No history records found');
                return [];
            }

            // Flatten nested structure: productAssignments_history/{userId}/{uploadId}
            const allRecords = [];

            Object.keys(data).forEach(userId => {
                console.log('[FINALIZE] Processing userId:', userId);
                const userRecords = data[userId];

                if (typeof userRecords === 'object' && userRecords !== null) {
                    Object.keys(userRecords).forEach(uploadId => {
                        const record = userRecords[uploadId];
                        console.log('[FINALIZE] Record:', uploadId, {
                            timestamp: record?.timestamp,
                            uploadStatus: record?.uploadStatus,
                            hasBeforeSnapshot: !!record?.beforeSnapshot,
                            hasAssignments: !!record?.beforeSnapshot?.assignments,
                            assignmentsCount: record?.beforeSnapshot?.assignments?.length,
                            uploadedSTTs: record?.uploadedSTTs,
                            uploadResultsCount: record?.uploadResults?.length
                        });

                        if (record && record.timestamp) {
                            // Filter by timestamp if specified
                            if (!sinceTimestamp || record.timestamp > sinceTimestamp) {
                                // Only include successful uploads
                                if (record.uploadStatus === 'completed' || record.uploadStatus === 'partial') {
                                    allRecords.push({
                                        ...record,
                                        userId: userId,
                                        uploadId: uploadId
                                    });
                                    console.log('[FINALIZE] ✅ Added record:', uploadId);
                                } else {
                                    console.log('[FINALIZE] ⏭️ Skipped (status):', record.uploadStatus);
                                }
                            } else {
                                console.log('[FINALIZE] ⏭️ Skipped (timestamp)');
                            }
                        }
                    });
                }
            });

            // Sort by timestamp (oldest first for consistent processing)
            allRecords.sort((a, b) => a.timestamp - b.timestamp);

            console.log(`[FINALIZE] ✅ Loaded ${allRecords.length} records from all users`);
            return allRecords;

        } catch (error) {
            console.error('[FINALIZE] ❌ Error loading all users history:', error);
            throw error;
        }
    }

    /**
     * Calculate session statistics from history records
     * Uses beforeSnapshot.assignments for uploaded products (correct source)
     * @param {Array} records - Array of history records
     * @returns {Object} Statistics { uniqueSTTs, totalQuantity, uniqueProducts, productDetails }
     */
    function calculateSessionStats(records) {
        console.log('[FINALIZE] 📊 Calculating session stats from', records.length, 'records...');

        const uniqueSTTs = new Set();
        const productMap = new Map(); // productCode -> { details, totalQty, sttQuantities }

        records.forEach((record, idx) => {
            // Only log first 3 records
            if (idx < 3) {
                console.log(`[FINALIZE] Processing record ${idx + 1}:`, record.uploadId);
            }

            // Get list of successful STTs from uploadResults
            const successfulSTTs = new Set();
            if (record.uploadResults && Array.isArray(record.uploadResults)) {
                record.uploadResults.forEach(result => {
                    if (result.success) {
                        successfulSTTs.add(String(result.stt));
                    }
                });
            }

            if (idx < 3) {
                console.log('[FINALIZE] Successful STTs:', Array.from(successfulSTTs));
            }

            // PRIMARY METHOD: Use beforeSnapshot.assignments (this is the UPLOADED products)
            if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
                if (idx < 3) {
                    console.log('[FINALIZE] Using beforeSnapshot.assignments, count:', record.beforeSnapshot.assignments.length);
                    // Debug first assignment structure
                    if (record.beforeSnapshot.assignments.length > 0) {
                        console.log('[FINALIZE] First assignment:', JSON.stringify(record.beforeSnapshot.assignments[0]).substring(0, 500));
                    }
                }

                record.beforeSnapshot.assignments.forEach(assignment => {
                    const productCode = assignment.productCode;
                    const productId = assignment.productId;

                    if (assignment.sttList && Array.isArray(assignment.sttList)) {
                        assignment.sttList.forEach(sttItem => {
                            // Handle both object {stt: "32"} and string "32" formats
                            const sttStr = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);

                            if (idx < 3) {
                                console.log('[FINALIZE] Processing STT item:', sttItem, '-> sttStr:', sttStr);
                            }

                            // Only count if this STT was successfully uploaded
                            if (successfulSTTs.has(sttStr)) {
                                uniqueSTTs.add(sttStr);

                                if (!productMap.has(productCode)) {
                                    productMap.set(productCode, {
                                        productCode: productCode,
                                        productId: productId,
                                        productName: assignment.productName || productCode,
                                        imageUrl: assignment.imageUrl || '',
                                        totalQuantity: 0,
                                        sttQuantities: new Map() // Track quantity per STT
                                    });
                                }

                                const product = productMap.get(productCode);
                                product.totalQuantity += 1;

                                // Track quantity for each STT
                                const currentQty = product.sttQuantities.get(sttStr) || 0;
                                product.sttQuantities.set(sttStr, currentQty + 1);
                            }
                        });
                    }
                });
            }

            // FALLBACK: If no assignments, just count STTs
            if (uniqueSTTs.size === 0 && successfulSTTs.size > 0) {
                console.log('[FINALIZE] Fallback: only counting STTs');
                successfulSTTs.forEach(stt => uniqueSTTs.add(stt));
            }
        });

        console.log('[FINALIZE] Product map size:', productMap.size);
        console.log('[FINALIZE] Unique STTs:', uniqueSTTs.size);

        // Convert product map to array with STT quantities
        const productDetails = Array.from(productMap.values()).map(p => {
            // Convert sttQuantities Map to sorted array of {stt, quantity}
            const sttArray = Array.from(p.sttQuantities.entries())
                .map(([stt, qty]) => ({ stt, quantity: qty }))
                .sort((a, b) => parseInt(a.stt) - parseInt(b.stt));

            return {
                ...p,
                sttQuantities: sttArray,
                // Keep stts for backward compatibility
                stts: sttArray.map(item => item.stt)
            };
        });

        // Sort by total quantity descending
        productDetails.sort((a, b) => b.totalQuantity - a.totalQuantity);

        // Calculate total quantity (sum of all product quantities)
        const totalQuantity = productDetails.reduce((sum, p) => sum + p.totalQuantity, 0);

        const stats = {
            uniqueSTTs: uniqueSTTs.size,
            totalQuantity: totalQuantity,
            uniqueProducts: productMap.size,
            productDetails: productDetails
        };

        console.log('[FINALIZE] ✅ Stats calculated:', {
            uniqueSTTs: stats.uniqueSTTs,
            totalQuantity: stats.totalQuantity,
            uniqueProducts: stats.uniqueProducts
        });

        return stats;
    }

    /**
     * Open Finalize Session Modal
     */
    window.openFinalizeSessionModal = async function() {
        console.log('[FINALIZE] 🎯 Opening finalize session modal...');

        try {
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('finalizeSessionModal'));
            modal.show();

            // Show loading state
            const bodyEl = document.getElementById('finalizeSessionModalBody');
            bodyEl.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-success" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="text-muted mt-3">Đang tải thống kê từ tất cả users...</p>
                </div>
            `;

            // Disable save button
            document.getElementById('saveFinalizeBtn').disabled = true;

            // Get last finalize timestamp
            const lastTimestamp = await getLastFinalizeTimestamp();
            finalizeSessionData.lastFinalizeTimestamp = lastTimestamp;

            // Load all users history since last finalize
            const records = await loadAllUsersUploadHistory(lastTimestamp);
            finalizeSessionData.records = records;

            if (records.length === 0) {
                bodyEl.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                        <p class="text-muted">Không có upload nào từ ${lastTimestamp ? new Date(lastTimestamp).toLocaleString('vi-VN') : 'trước đó'} đến hiện tại</p>
                    </div>
                `;
                return;
            }

            // Calculate statistics
            const stats = calculateSessionStats(records);
            finalizeSessionData.stats = stats;

            // Render content
            bodyEl.innerHTML = renderFinalizeSessionContent(stats, lastTimestamp);

            // Enable save button
            document.getElementById('saveFinalizeBtn').disabled = false;

        } catch (error) {
            console.error('[FINALIZE] ❌ Error opening modal:', error);

            const bodyEl = document.getElementById('finalizeSessionModalBody');
            bodyEl.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Lỗi khi tải thống kê: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Render a product statistics table
     * @param {Object} stats - Statistics object
     * @param {string} title - Table title
     * @param {string} toggleId - ID for toggle icon
     * @param {string} bodyId - ID for tbody
     * @param {string} toggleFunction - Function name for toggle
     * @returns {string} HTML content
     */
    function renderProductStatsTable(stats, title, toggleId, bodyId, toggleFunction) {
        let html = `
            <div class="table-responsive mb-4">
                <table class="table table-bordered table-hover finalize-table">
                    <thead class="table-dark">
                        <tr>
                            <th colspan="3" class="text-center">
                                <i class="fas fa-shopping-cart"></i> ${title}
                            </th>
                        </tr>
                        <tr>
                            <th style="width: 50%">SẢN PHẨM</th>
                            <th style="width: 15%" class="text-center">SỐ LƯỢNG</th>
                            <th style="width: 35%">MÃ ĐƠN HÀNG (STT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Summary Row with Toggle Button -->
                        <tr class="finalize-summary-row" onclick="${toggleFunction}()" style="cursor: pointer;">
                            <td>
                                <strong>
                                    <i class="fas fa-chevron-right finalize-toggle-icon" id="${toggleId}"></i>
                                    <i class="fas fa-chart-bar"></i> TỔNG CỘNG: ${stats.uniqueProducts} sản phẩm
                                </strong>
                            </td>
                            <td class="text-center">
                                <strong>${stats.totalQuantity} món</strong>
                            </td>
                            <td>
                                <strong>${stats.uniqueSTTs} đơn hàng</strong>
                            </td>
                        </tr>
                    </tbody>
                    <tbody id="${bodyId}" class="finalize-details-collapsed">
        `;

        stats.productDetails.forEach(product => {
            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" alt="${product.productCode}" class="finalize-product-img">`
                : `<div class="finalize-product-img-placeholder"><i class="fas fa-box"></i></div>`;

            // Format STT list with quantities: "31, 32x2" (only show xN if N > 1)
            const sttList = product.sttQuantities && product.sttQuantities.length > 0
                ? product.sttQuantities.map(item =>
                    item.quantity > 1 ? `${item.stt}x${item.quantity}` : item.stt
                  ).join(', ')
                : product.stts.join(', '); // Fallback for backward compatibility

            html += `
                <tr class="finalize-detail-row">
                    <td>
                        <div class="d-flex align-items-center">
                            ${imageHtml}
                            <div class="ms-2">
                                <strong>[${product.productCode}]</strong>
                                ${product.productName ? `<div class="text-muted small">${product.productName}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="text-center align-middle">
                        <span class="badge bg-primary fs-6">${product.totalQuantity}</span>
                    </td>
                    <td class="align-middle">
                        <span class="text-muted small">${sttList}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    /**
     * Render finalize session content
     * @param {Object} stats - Statistics object
     * @param {number|null} lastTimestamp - Last finalize timestamp
     * @returns {string} HTML content
     */
    function renderFinalizeSessionContent(stats, lastTimestamp) {
        const fromDate = lastTimestamp
            ? new Date(lastTimestamp).toLocaleString('vi-VN')
            : 'Bắt đầu';
        const toDate = new Date().toLocaleString('vi-VN');

        let html = `
            <div class="finalize-session-info mb-4">
                <div class="alert alert-info">
                    <i class="fas fa-calendar-alt"></i>
                    <strong>Thống kê từ:</strong> ${fromDate} <i class="fas fa-arrow-right mx-2"></i> ${toDate}
                </div>
            </div>
        `;

        // Calculate cart statistics
        const cartStats = calculateCartStats();
        cartStatsData = cartStats; // Store in global state

        // Add cart statistics table
        html += renderProductStatsTable(
            cartStats,
            'THỐNG KÊ MÃ SP TRONG GIỎ HÀNG',
            'cartDetailsToggleIcon',
            'cartDetailsBody',
            'toggleCartDetails'
        );

        // Add uploaded statistics table (renamed from "SẢN PHẨM")
        html += renderProductStatsTable(
            stats,
            'THỐNG KÊ UPLOAD TPOS',
            'productDetailsToggleIcon',
            'productDetailsBody',
            'toggleProductDetails'
        );


        // Add comment analysis table
        const commentAnalysis = analyzeCommentMismatch(stats);
        html += renderCommentAnalysisTable(commentAnalysis);

        // Add product/STT discrepancy table (always show, with collapsible toggle)
        const productDiscrepancy = analyzeProductDiscrepancy(stats);
        productDiscrepancyData = productDiscrepancy; // Store in global state
        html += renderProductDiscrepancyTable(productDiscrepancy);

        return html;
    }

    /**
     * Toggle cart details visibility
     */
    window.toggleCartDetails = function() {
        const detailsBody = document.getElementById('cartDetailsBody');
        const toggleIcon = document.getElementById('cartDetailsToggleIcon');

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('finalize-details-collapsed');

        if (isCollapsed) {
            // Expand
            detailsBody.classList.remove('finalize-details-collapsed');
            detailsBody.classList.add('finalize-details-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            // Collapse
            detailsBody.classList.remove('finalize-details-expanded');
            detailsBody.classList.add('finalize-details-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Toggle product details visibility
     */
    window.toggleProductDetails = function() {
        const detailsBody = document.getElementById('productDetailsBody');
        const toggleIcon = document.getElementById('productDetailsToggleIcon');

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('finalize-details-collapsed');

        if (isCollapsed) {
            // Expand
            detailsBody.classList.remove('finalize-details-collapsed');
            detailsBody.classList.add('finalize-details-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            // Collapse
            detailsBody.classList.remove('finalize-details-expanded');
            detailsBody.classList.add('finalize-details-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Toggle comment analysis details visibility
     */
    window.toggleCommentAnalysis = function() {
        const detailsBody = document.getElementById('commentAnalysisBody');
        const toggleIcon = document.getElementById('commentAnalysisToggleIcon');

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('comment-analysis-collapsed');

        if (isCollapsed) {
            detailsBody.classList.remove('comment-analysis-collapsed');
            detailsBody.classList.add('comment-analysis-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            detailsBody.classList.remove('comment-analysis-expanded');
            detailsBody.classList.add('comment-analysis-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    // =====================================================
    // COMMENT ANALYSIS FUNCTIONS
    // =====================================================

    // State for comment analysis
    let commentAnalysisData = {
        totalComments: 0,
        totalProductEntries: 0,
        totalOrderQuantity: 0,
        duplicateEntries: [],
        missingEntries: []
    };

    // State for product discrepancy analysis
    let productDiscrepancyData = {
        hasDiscrepancy: false,
        totalExpected: 0,
        totalUploaded: 0,
        missingProducts: [],
        extraProducts: [],
        missingSTTs: [],
        extraSTTs: []
    };

    // State for cart statistics (from orders in tab1)
    let cartStatsData = {
        uniqueSTTs: 0,
        totalQuantity: 0,
        uniqueProducts: 0,
        productDetails: []
    };

    /**
     * Parse order.Note and extract clean comment lines (remove encoded strings)
     * @param {string} note - The order note
     * @returns {Array<string>} Array of clean comment lines
     */
    function parseOrderNoteClean(note) {
        if (!note || typeof note !== 'string') return [];

        const lines = note.split('\n');
        const cleanLines = [];

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            // Check if line is encoded (long string without spaces)
            const isEncoded = trimmed.length > 20 && !trimmed.includes(' ');
            if (!isEncoded) {
                cleanLines.push(trimmed);
            }
        });

        return cleanLines;
    }

    /**
     * Get ordersData from localStorage (loaded from Tab1)
     * @returns {Array} Array of orders
     */
    function getOrdersDataFromLocalStorage() {
        try {
            const localStorageKey = userStorageManager
                ? userStorageManager.getUserLocalStorageKey('ordersData')
                : 'ordersData_guest';

            const data = localStorage.getItem(localStorageKey);
            if (data) {
                return JSON.parse(data);
            }

            // Fallback to non-user-specific key
            const fallbackData = localStorage.getItem('ordersData');
            if (fallbackData) {
                return JSON.parse(fallbackData);
            }

            return [];
        } catch (error) {
            console.error('[COMMENT] Error loading ordersData:', error);
            return [];
        }
    }

    /**
     * Calculate cart statistics from sessionIndexData (product assignments grouped by STT)
     * @returns {Object} Cart statistics
     */
    function calculateCartStats() {
        console.log('[CART-STATS] 📊 Calculating cart statistics from sessionIndexData...');

        const uniqueSTTs = new Set();
        const productMap = new Map(); // productCode -> { details, totalQty, sttQuantities }

        // Iterate over sessionIndexData (products assigned to each STT)
        Object.entries(sessionIndexData).forEach(([stt, data]) => {
            uniqueSTTs.add(stt);

            // data.products contains all products assigned to this STT
            if (data.products && Array.isArray(data.products)) {
                data.products.forEach(product => {
                    const productCode = product.productCode || product.productName;
                    if (!productCode) return;

                    const productName = product.productName || productCode;
                    const imageUrl = product.imageUrl || '';

                    if (!productMap.has(productCode)) {
                        productMap.set(productCode, {
                            productCode: productCode,
                            productName: productName,
                            imageUrl: imageUrl,
                            totalQuantity: 0,
                            sttQuantities: new Map() // Track quantity per STT
                        });
                    }

                    const productData = productMap.get(productCode);
                    productData.totalQuantity += 1; // Each product entry = 1 quantity

                    // Track quantity for each STT
                    const currentQty = productData.sttQuantities.get(stt) || 0;
                    productData.sttQuantities.set(stt, currentQty + 1);
                });
            }
        });

        console.log('[CART-STATS] Product map size:', productMap.size);
        console.log('[CART-STATS] Unique STTs:', uniqueSTTs.size);

        // Convert product map to array with STT quantities
        const productDetails = Array.from(productMap.values()).map(p => {
            // Convert sttQuantities Map to sorted array of {stt, quantity}
            const sttArray = Array.from(p.sttQuantities.entries())
                .map(([stt, qty]) => ({ stt, quantity: qty }))
                .sort((a, b) => parseInt(a.stt) - parseInt(b.stt));

            return {
                ...p,
                sttQuantities: sttArray,
                // Keep stts for backward compatibility
                stts: sttArray.map(item => item.stt)
            };
        });

        // Sort by total quantity descending
        productDetails.sort((a, b) => b.totalQuantity - a.totalQuantity);

        // Calculate total quantity (sum of all product quantities)
        const totalQuantity = productDetails.reduce((sum, p) => sum + p.totalQuantity, 0);

        const stats = {
            uniqueSTTs: uniqueSTTs.size,
            totalQuantity: totalQuantity,
            uniqueProducts: productMap.size,
            productDetails: productDetails
        };

        console.log('[CART-STATS] ✅ Stats calculated:', {
            uniqueSTTs: stats.uniqueSTTs,
            totalQuantity: stats.totalQuantity,
            uniqueProducts: stats.uniqueProducts
        });

        return stats;
    }

    /**
     * Analyze comment mismatch between order notes and uploaded products
     * @param {Object} stats - Product statistics from calculateSessionStats
     * @returns {Object} Comment analysis data
     */
    function analyzeCommentMismatch(stats) {
        console.log('[COMMENT] 📊 Analyzing comment mismatch...');

        const ordersData = getOrdersDataFromLocalStorage();
        console.log('[COMMENT] Loaded ordersData:', ordersData.length, 'orders');

        // Count total comments from ALL orders
        let totalComments = 0;
        const allOrdersMap = new Map(); // stt -> { order, commentLines }

        ordersData.forEach(order => {
            const stt = String(order.stt);
            const commentLines = parseOrderNoteClean(order.note);
            totalComments += commentLines.length;

            allOrdersMap.set(stt, {
                order: order,
                commentLines: commentLines,
                commentCount: commentLines.length
            });
        });

        // Calculate total quantity from all orders in Tab1
        const totalOrderQuantity = ordersData.reduce((sum, o) => sum + (o.quantity || 0), 0);

        // Count STT occurrences in uploaded products (from stats.productDetails)
        const sttProductCount = new Map(); // stt -> count of product entries

        stats.productDetails.forEach(product => {
            product.stts.forEach(stt => {
                const count = sttProductCount.get(stt) || 0;
                sttProductCount.set(stt, count + product.totalQuantity / product.stts.length);
            });
        });

        // Recalculate from the raw data using beforeSnapshot.assignments (correct source)
        sttProductCount.clear();

        if (finalizeSessionData.records) {
            finalizeSessionData.records.forEach(record => {
                // Get successful STTs
                const successfulSTTs = new Set();
                if (record.uploadResults) {
                    record.uploadResults.forEach(result => {
                        if (result.success) {
                            successfulSTTs.add(String(result.stt));
                        }
                    });
                }

                // Count products per STT from beforeSnapshot.assignments
                if (record.beforeSnapshot && record.beforeSnapshot.assignments) {
                    record.beforeSnapshot.assignments.forEach(assignment => {
                        if (assignment.sttList && Array.isArray(assignment.sttList)) {
                            assignment.sttList.forEach(sttItem => {
                                // Handle both object {stt: "32"} and string "32" formats
                                const sttStr = String(typeof sttItem === 'object' ? sttItem.stt : sttItem);
                                if (successfulSTTs.has(sttStr)) {
                                    const count = sttProductCount.get(sttStr) || 0;
                                    sttProductCount.set(sttStr, count + 1);
                                }
                            });
                        }
                    });
                }
            });
        }

        console.log('[COMMENT] STT product counts:', Object.fromEntries(sttProductCount));

        // Compare and categorize
        const duplicateEntries = []; // commentCount < productCount (nhập trùng/thiếu ghi chú)
        const missingEntries = [];   // commentCount > productCount (nhập thiếu/thừa ghi chú)

        // Get all STTs that were uploaded
        const uploadedSTTs = new Set();
        stats.productDetails.forEach(p => p.stts.forEach(stt => uploadedSTTs.add(stt)));

        uploadedSTTs.forEach(stt => {
            const orderData = allOrdersMap.get(stt);
            const productCount = sttProductCount.get(stt) || 0;
            const commentCount = orderData ? orderData.commentCount : 0;

            if (commentCount < productCount) {
                // Nhập trùng: có ít comment hơn số sản phẩm
                duplicateEntries.push({
                    stt: stt,
                    customerName: orderData?.order?.customerName || '',
                    phone: orderData?.order?.phone || '',
                    commentLines: orderData?.commentLines || [],
                    commentCount: commentCount,
                    productCount: productCount,
                    difference: productCount - commentCount,
                    userNote: '',
                    checked: false
                });
            } else if (commentCount > productCount) {
                // Nhập thiếu: có nhiều comment hơn số sản phẩm
                missingEntries.push({
                    stt: stt,
                    customerName: orderData?.order?.customerName || '',
                    phone: orderData?.order?.phone || '',
                    commentLines: orderData?.commentLines || [],
                    commentCount: commentCount,
                    productCount: productCount,
                    difference: commentCount - productCount,
                    userNote: '',
                    checked: false
                });
            }
        });

        // Sort by difference (descending)
        duplicateEntries.sort((a, b) => b.difference - a.difference);
        missingEntries.sort((a, b) => b.difference - a.difference);

        const result = {
            totalComments: totalComments,
            totalProductEntries: stats.totalQuantity,
            totalOrderQuantity: totalOrderQuantity,
            duplicateEntries: duplicateEntries,
            missingEntries: missingEntries
        };

        console.log('[COMMENT] Analysis result:', {
            totalComments: result.totalComments,
            totalProductEntries: result.totalProductEntries,
            totalOrderQuantity: result.totalOrderQuantity,
            duplicateCount: duplicateEntries.length,
            missingCount: missingEntries.length
        });

        commentAnalysisData = result;
        return result;
    }

    /**
     * Render comment analysis table HTML
     * @param {Object} analysis - Comment analysis data
     * @returns {string} HTML string
     */
    function renderCommentAnalysisTable(analysis) {
        const { totalComments, totalProductEntries, totalOrderQuantity, duplicateEntries, missingEntries } = analysis;

        let html = `
            <div class="comment-analysis-section mt-4">
                <div class="table-responsive">
                    <table class="table table-bordered comment-analysis-table">
                        <thead class="table-dark">
                            <tr>
                                <th colspan="2" class="text-center">
                                    <i class="fas fa-comments"></i> KIỂM TRA COMMENT
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Summary Row -->
                            <tr class="comment-summary-row" onclick="toggleCommentAnalysis()" style="cursor: pointer;">
                                <td colspan="2">
                                    <strong>
                                        <i class="fas fa-chevron-right comment-toggle-icon" id="commentAnalysisToggleIcon"></i>
                                        <i class="fas fa-chart-pie"></i>
                                        Tổng: <span class="text-primary">${totalComments}</span> comment tạo đơn |
                                        <span class="text-success">${totalProductEntries}</span> số phiếu đã nhập |
                                        <span class="text-info">${totalOrderQuantity}</span> số món trong tất cả giỏ
                                    </strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Collapsible Details -->
                    <div id="commentAnalysisBody" class="comment-analysis-collapsed">
                        <div class="row">
                            <!-- Left Column: Comment nhập trùng -->
                            <div class="col-md-6">
                                <div class="comment-column comment-duplicate">
                                    <h6 class="comment-column-header bg-warning text-dark">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        COMMENT NHẬP TRÙNG (${duplicateEntries.length})
                                        <small class="d-block">Số comment < Số sản phẩm</small>
                                    </h6>
                                    <div class="comment-entries-list">
        `;

        if (duplicateEntries.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            duplicateEntries.forEach((entry, idx) => {
                html += renderCommentEntry(entry, idx, 'duplicate');
            });
        }

        html += `
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column: Comment nhập thiếu -->
                            <div class="col-md-6">
                                <div class="comment-column comment-missing">
                                    <h6 class="comment-column-header bg-danger text-white">
                                        <i class="fas fa-times-circle"></i>
                                        COMMENT NHẬP THIẾU (${missingEntries.length})
                                        <small class="d-block">Số comment > Số sản phẩm</small>
                                    </h6>
                                    <div class="comment-entries-list">
        `;

        if (missingEntries.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            missingEntries.forEach((entry, idx) => {
                html += renderCommentEntry(entry, idx, 'missing');
            });
        }

        html += `
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Render a single comment entry
     * @param {Object} entry - Entry data
     * @param {number} idx - Index
     * @param {string} type - 'duplicate' or 'missing'
     * @returns {string} HTML string
     */
    function renderCommentEntry(entry, idx, type) {
        const commentsHtml = entry.commentLines.length > 0
            ? entry.commentLines.map(c => `<div class="comment-line">• ${escapeHtml(c)}</div>`).join('')
            : '<div class="text-muted small">(Không có comment)</div>';

        const diffLabel = type === 'duplicate'
            ? `Thiếu ${entry.difference} ghi chú`
            : `Thừa ${entry.difference} ghi chú`;

        return `
            <div class="comment-entry" data-type="${type}" data-idx="${idx}">
                <div class="comment-entry-header">
                    <span class="stt-badge">STT ${entry.stt}</span>
                    <span class="customer-name">${escapeHtml(entry.customerName)}</span>
                    <span class="diff-badge ${type === 'duplicate' ? 'bg-warning' : 'bg-danger'}">${diffLabel}</span>
                </div>
                <div class="comment-entry-body">
                    <div class="comment-lines">${commentsHtml}</div>
                    <div class="comment-stats">
                        <small class="text-muted">
                            ${entry.commentCount} comment / ${entry.productCount} sản phẩm
                        </small>
                    </div>
                </div>
                <div class="comment-entry-footer">
                    <input type="text"
                           class="form-control form-control-sm comment-user-note"
                           placeholder="Ghi chú lý do..."
                           data-type="${type}"
                           data-idx="${idx}"
                           onchange="updateCommentNote(this, '${type}', ${idx})">
                    <label class="form-check comment-check">
                        <input type="checkbox"
                               class="form-check-input"
                               data-type="${type}"
                               data-idx="${idx}"
                               onchange="updateCommentChecked(this, '${type}', ${idx})">
                        <span class="form-check-label">Xác nhận</span>
                    </label>
                </div>
            </div>
        `;
    }

    /**
     * Escape HTML special characters
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update comment user note
     */
    window.updateCommentNote = function(input, type, idx) {
        const value = input.value;
        if (type === 'duplicate') {
            commentAnalysisData.duplicateEntries[idx].userNote = value;
        } else {
            commentAnalysisData.missingEntries[idx].userNote = value;
        }
    };

    /**
     * Update comment checked status
     */
    window.updateCommentChecked = function(checkbox, type, idx) {
        const checked = checkbox.checked;
        if (type === 'duplicate') {
            commentAnalysisData.duplicateEntries[idx].checked = checked;
        } else {
            commentAnalysisData.missingEntries[idx].checked = checked;
        }
    };

    // =====================================================
    // PRODUCT/STT DISCREPANCY ANALYSIS FUNCTIONS
    // =====================================================

    /**
     * Analyze product and STT discrepancies between uploaded data and original orders
     * @param {Object} stats - Product statistics from calculateSessionStats
     * @returns {Object} Discrepancy analysis data
     */
    function analyzeProductDiscrepancy(stats) {
        console.log('[DISCREPANCY] 📊 Analyzing product/STT discrepancies...');

        const ordersData = getOrdersDataFromLocalStorage();
        console.log('[DISCREPANCY] Loaded ordersData:', ordersData.length, 'orders');

        // Build map of products from orders (expected products)
        const expectedProductMap = new Map(); // productCode -> { totalQuantity, stts: [stt1, stt2, ...] }
        const expectedSTTMap = new Map(); // stt -> { productCodes: [code1, code2, ...], totalQuantity }

        ordersData.forEach(order => {
            const stt = String(order.stt);
            const quantity = order.quantity || 0;

            // Parse products from order
            if (order.products && Array.isArray(order.products) && order.products.length > 0) {
                order.products.forEach(product => {
                    const productCode = product.productCode || product.code;
                    if (!productCode) return;

                    const productQty = product.quantity || 1;

                    // Track by product code
                    if (!expectedProductMap.has(productCode)) {
                        expectedProductMap.set(productCode, {
                            productCode: productCode,
                            totalQuantity: 0,
                            stts: []
                        });
                    }
                    const expectedProduct = expectedProductMap.get(productCode);
                    expectedProduct.totalQuantity += productQty;
                    if (!expectedProduct.stts.includes(stt)) {
                        expectedProduct.stts.push(stt);
                    }

                    // Track by STT
                    if (!expectedSTTMap.has(stt)) {
                        expectedSTTMap.set(stt, {
                            stt: stt,
                            customerName: order.customerName || '',
                            productCodes: [],
                            totalQuantity: 0
                        });
                    }
                    const expectedSTT = expectedSTTMap.get(stt);
                    if (!expectedSTT.productCodes.includes(productCode)) {
                        expectedSTT.productCodes.push(productCode);
                    }
                    expectedSTT.totalQuantity += productQty;
                });
            } else if (quantity > 0) {
                // Fallback: If no products array, track quantity at STT level
                // This ensures totalExpected matches totalOrderQuantity from comment analysis
                if (!expectedSTTMap.has(stt)) {
                    expectedSTTMap.set(stt, {
                        stt: stt,
                        customerName: order.customerName || '',
                        productCodes: [],
                        totalQuantity: 0
                    });
                }
                expectedSTTMap.get(stt).totalQuantity += quantity;
            }
        });

        // Build map of uploaded products
        const uploadedProductMap = new Map(); // productCode -> { totalQuantity, stts: [stt1, stt2, ...] }
        const uploadedSTTMap = new Map(); // stt -> { productCodes: [code1, code2, ...], totalQuantity }

        stats.productDetails.forEach(product => {
            uploadedProductMap.set(product.productCode, {
                productCode: product.productCode,
                productName: product.productName,
                imageUrl: product.imageUrl,
                totalQuantity: product.totalQuantity,
                stts: product.stts
            });

            product.stts.forEach(stt => {
                if (!uploadedSTTMap.has(stt)) {
                    uploadedSTTMap.set(stt, {
                        stt: stt,
                        productCodes: [],
                        totalQuantity: 0
                    });
                }
                const uploadedSTT = uploadedSTTMap.get(stt);
                if (!uploadedSTT.productCodes.includes(product.productCode)) {
                    uploadedSTT.productCodes.push(product.productCode);
                }
                // Count the quantity for this STT from sttQuantities
                const sttQty = product.sttQuantities.find(sq => sq.stt === stt);
                uploadedSTT.totalQuantity += sttQty ? sttQty.quantity : 0;
            });
        });

        console.log('[DISCREPANCY] Expected products:', expectedProductMap.size);
        console.log('[DISCREPANCY] Uploaded products:', uploadedProductMap.size);
        console.log('[DISCREPANCY] Expected STTs:', expectedSTTMap.size);
        console.log('[DISCREPANCY] Uploaded STTs:', uploadedSTTMap.size);

        // Debug: Log total expected quantities
        const productMapTotal = Array.from(expectedProductMap.values()).reduce((sum, p) => sum + p.totalQuantity, 0);
        const sttMapTotal = Array.from(expectedSTTMap.values()).reduce((sum, s) => sum + s.totalQuantity, 0);
        console.log('[DISCREPANCY] Total from productMap:', productMapTotal);
        console.log('[DISCREPANCY] Total from sttMap:', sttMapTotal);

        // Compare and identify discrepancies
        const missingProducts = []; // Products in orders but not uploaded
        const extraProducts = [];   // Products uploaded but not in orders (or excess quantity)
        const missingSTTs = [];      // STTs in orders but not uploaded
        const extraSTTs = [];        // STTs uploaded but not in orders

        // Check for missing products
        expectedProductMap.forEach((expected, productCode) => {
            const uploaded = uploadedProductMap.get(productCode);
            if (!uploaded) {
                missingProducts.push({
                    productCode: productCode,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: 0,
                    difference: expected.totalQuantity,
                    stts: expected.stts.join(', ')
                });
            } else if (uploaded.totalQuantity < expected.totalQuantity) {
                missingProducts.push({
                    productCode: productCode,
                    productName: uploaded.productName,
                    imageUrl: uploaded.imageUrl,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: expected.totalQuantity - uploaded.totalQuantity,
                    stts: expected.stts.join(', ')
                });
            }
        });

        // Check for extra products
        uploadedProductMap.forEach((uploaded, productCode) => {
            const expected = expectedProductMap.get(productCode);
            if (!expected) {
                extraProducts.push({
                    productCode: productCode,
                    productName: uploaded.productName,
                    imageUrl: uploaded.imageUrl,
                    expectedQuantity: 0,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: uploaded.totalQuantity,
                    stts: uploaded.stts.join(', ')
                });
            } else if (uploaded.totalQuantity > expected.totalQuantity) {
                extraProducts.push({
                    productCode: productCode,
                    productName: uploaded.productName,
                    imageUrl: uploaded.imageUrl,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: uploaded.totalQuantity - expected.totalQuantity,
                    stts: uploaded.stts.join(', ')
                });
            }
        });

        // Check for missing STTs
        expectedSTTMap.forEach((expected, stt) => {
            const uploaded = uploadedSTTMap.get(stt);
            if (!uploaded) {
                missingSTTs.push({
                    stt: stt,
                    customerName: expected.customerName,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: 0,
                    difference: expected.totalQuantity,
                    productCodes: expected.productCodes.join(', ')
                });
            } else if (uploaded.totalQuantity < expected.totalQuantity) {
                missingSTTs.push({
                    stt: stt,
                    customerName: expected.customerName,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: expected.totalQuantity - uploaded.totalQuantity,
                    productCodes: expected.productCodes.join(', ')
                });
            }
        });

        // Check for extra STTs
        uploadedSTTMap.forEach((uploaded, stt) => {
            const expected = expectedSTTMap.get(stt);
            if (!expected) {
                extraSTTs.push({
                    stt: stt,
                    customerName: '',
                    expectedQuantity: 0,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: uploaded.totalQuantity,
                    productCodes: uploaded.productCodes.join(', ')
                });
            } else if (uploaded.totalQuantity > expected.totalQuantity) {
                extraSTTs.push({
                    stt: stt,
                    customerName: expected.customerName,
                    expectedQuantity: expected.totalQuantity,
                    uploadedQuantity: uploaded.totalQuantity,
                    difference: uploaded.totalQuantity - expected.totalQuantity,
                    productCodes: uploaded.productCodes.join(', ')
                });
            }
        });

        // Sort by difference (descending)
        missingProducts.sort((a, b) => b.difference - a.difference);
        extraProducts.sort((a, b) => b.difference - a.difference);
        missingSTTs.sort((a, b) => b.difference - a.difference);
        extraSTTs.sort((a, b) => b.difference - a.difference);

        const hasDiscrepancy = missingProducts.length > 0 || extraProducts.length > 0 ||
                               missingSTTs.length > 0 || extraSTTs.length > 0;

        // Calculate totalExpected from STT map
        // This matches the logic in comment analysis (totalOrderQuantity)
        // We use STT map because it includes both:
        // - Product quantities from orders WITH products array
        // - Order quantities from orders WITHOUT products array
        const totalExpected = Array.from(expectedSTTMap.values()).reduce((sum, s) => sum + s.totalQuantity, 0);

        const result = {
            hasDiscrepancy: hasDiscrepancy,
            totalExpected: totalExpected,
            totalUploaded: stats.totalQuantity,
            missingProducts: missingProducts,
            extraProducts: extraProducts,
            missingSTTs: missingSTTs,
            extraSTTs: extraSTTs
        };

        console.log('[DISCREPANCY] Analysis result:', {
            hasDiscrepancy: result.hasDiscrepancy,
            totalExpected: result.totalExpected,
            totalUploaded: result.totalUploaded,
            missingProducts: missingProducts.length,
            extraProducts: extraProducts.length,
            missingSTTs: missingSTTs.length,
            extraSTTs: extraSTTs.length
        });

        return result;
    }

    /**
     * Render product/STT discrepancy table HTML with collapsible toggle
     * @param {Object} discrepancy - Discrepancy analysis data
     * @returns {string} HTML string
     */
    function renderProductDiscrepancyTable(discrepancy) {
        const { totalExpected, totalUploaded, missingProducts, extraProducts, missingSTTs, extraSTTs } = discrepancy;

        const diffValue = totalUploaded - totalExpected;
        const diffClass = diffValue > 0 ? 'text-warning' : (diffValue < 0 ? 'text-danger' : 'text-success');
        const diffIcon = diffValue > 0 ? 'fa-exclamation-triangle' : (diffValue < 0 ? 'fa-times-circle' : 'fa-check-circle');
        const hasDiscrepancy = discrepancy.hasDiscrepancy;

        let html = `
            <div class="product-discrepancy-section mt-4">
                <div class="table-responsive">
                    <table class="table table-bordered discrepancy-table">
                        <thead class="table-dark">
                            <tr>
                                <th colspan="2" class="text-center">
                                    <i class="fas fa-clipboard-list"></i> PHÁT HIỆN CHÊNH LỆCH SỐ LƯỢNG
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Summary Row -->
                            <tr class="discrepancy-summary-row" onclick="toggleProductDiscrepancy()" style="cursor: pointer;">
                                <td colspan="2">
                                    <strong>
                                        <i class="fas fa-chevron-right discrepancy-toggle-icon" id="productDiscrepancyToggleIcon"></i>
                                        <i class="fas fa-chart-line"></i>
                                        Số món trong tất cả giỏ: <span class="badge bg-info">${totalExpected}</span>
                                        <i class="fas fa-arrow-right mx-2"></i>
                                        Số phiếu đã nhập: <span class="badge bg-primary">${totalUploaded}</span>
                                        <i class="fas fa-arrow-right mx-2"></i>
                                        Chênh lệch: <span class="badge bg-secondary ${diffClass}"><i class="fas ${diffIcon}"></i> ${diffValue > 0 ? '+' : ''}${diffValue}</span>
                                        ${hasDiscrepancy ? '<span class="badge bg-warning ms-2">Có chênh lệch!</span>' : '<span class="badge bg-success ms-2">Không chênh lệch</span>'}
                                    </strong>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Collapsible Details -->
                    <div id="productDiscrepancyBody" class="product-discrepancy-collapsed">
                        <div class="row">
                        <!-- Missing Products Column -->
                        <div class="col-md-6">
                            <div class="discrepancy-column">
                                <h6 class="discrepancy-column-header bg-danger text-white">
                                    <i class="fas fa-minus-circle"></i>
                                    SẢN PHẨM THIẾU (${missingProducts.length})
                                    <small class="d-block">Có trong giỏ nhưng chưa nhập đủ</small>
                                </h6>
                                <div class="discrepancy-entries-list">
        `;

        if (missingProducts.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            missingProducts.forEach(item => {
                const imageHtml = item.imageUrl
                    ? `<img src="${item.imageUrl}" alt="${item.productCode}" class="discrepancy-product-img">`
                    : `<div class="discrepancy-product-img-placeholder"><i class="fas fa-box"></i></div>`;

                html += `
                    <div class="discrepancy-entry bg-danger-subtle">
                        <div class="d-flex align-items-start">
                            ${imageHtml}
                            <div class="flex-grow-1 ms-2">
                                <div class="fw-bold">${escapeHtml(item.productCode)}</div>
                                ${item.productName ? `<div class="text-muted small">${escapeHtml(item.productName)}</div>` : ''}
                                <div class="discrepancy-stats mt-1">
                                    <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                    <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                    <span class="badge bg-danger">Thiếu: ${item.difference}</span>
                                </div>
                                <div class="text-muted small mt-1">
                                    <i class="fas fa-tags"></i> STT: ${item.stts}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                                </div>
                            </div>
                        </div>

                        <!-- Extra Products Column -->
                        <div class="col-md-6">
                            <div class="discrepancy-column">
                                <h6 class="discrepancy-column-header bg-warning text-dark">
                                    <i class="fas fa-plus-circle"></i>
                                    SẢN PHẨM THỪA (${extraProducts.length})
                                    <small class="d-block">Nhập nhiều hơn số lượng trong giỏ</small>
                                </h6>
                                <div class="discrepancy-entries-list">
        `;

        if (extraProducts.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            extraProducts.forEach(item => {
                const imageHtml = item.imageUrl
                    ? `<img src="${item.imageUrl}" alt="${item.productCode}" class="discrepancy-product-img">`
                    : `<div class="discrepancy-product-img-placeholder"><i class="fas fa-box"></i></div>`;

                html += `
                    <div class="discrepancy-entry bg-warning-subtle">
                        <div class="d-flex align-items-start">
                            ${imageHtml}
                            <div class="flex-grow-1 ms-2">
                                <div class="fw-bold">${escapeHtml(item.productCode)}</div>
                                ${item.productName ? `<div class="text-muted small">${escapeHtml(item.productName)}</div>` : ''}
                                <div class="discrepancy-stats mt-1">
                                    <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                    <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                    <span class="badge bg-warning">Thừa: ${item.difference}</span>
                                </div>
                                <div class="text-muted small mt-1">
                                    <i class="fas fa-tags"></i> STT: ${item.stts}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Missing STTs Section -->
                    <div class="row mt-3">
                        <div class="col-md-6">
                            <div class="discrepancy-column">
                                <h6 class="discrepancy-column-header bg-danger text-white">
                                    <i class="fas fa-receipt"></i>
                                    STT THIẾU (${missingSTTs.length})
                                    <small class="d-block">Có trong giỏ nhưng chưa nhập đủ sản phẩm</small>
                                </h6>
                                <div class="discrepancy-entries-list">
        `;

        if (missingSTTs.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            missingSTTs.forEach(item => {
                html += `
                    <div class="discrepancy-entry bg-danger-subtle">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <span class="badge bg-danger">STT ${item.stt}</span>
                                ${item.customerName ? `<span class="ms-2 text-muted">${escapeHtml(item.customerName)}</span>` : ''}
                            </div>
                            <div class="discrepancy-stats">
                                <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                <span class="badge bg-danger">Thiếu: ${item.difference}</span>
                            </div>
                        </div>
                        <div class="text-muted small mt-1">
                            <i class="fas fa-box"></i> Sản phẩm: ${item.productCodes}
                        </div>
                    </div>
                `;
            });
        }

        html += `
                                </div>
                            </div>
                        </div>

                        <!-- Extra STTs Section -->
                        <div class="col-md-6">
                            <div class="discrepancy-column">
                                <h6 class="discrepancy-column-header bg-warning text-dark">
                                    <i class="fas fa-receipt"></i>
                                    STT THỪA (${extraSTTs.length})
                                    <small class="d-block">Nhập nhiều hơn số lượng trong giỏ</small>
                                </h6>
                                <div class="discrepancy-entries-list">
        `;

        if (extraSTTs.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            extraSTTs.forEach(item => {
                html += `
                    <div class="discrepancy-entry bg-warning-subtle">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <span class="badge bg-warning text-dark">STT ${item.stt}</span>
                                ${item.customerName ? `<span class="ms-2 text-muted">${escapeHtml(item.customerName)}</span>` : ''}
                            </div>
                            <div class="discrepancy-stats">
                                <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                <span class="badge bg-warning text-dark">Thừa: ${item.difference}</span>
                            </div>
                        </div>
                        <div class="text-muted small mt-1">
                            <i class="fas fa-box"></i> Sản phẩm: ${item.productCodes}
                        </div>
                    </div>
                `;
            });
        }

        html += `
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        return html;
    }

    /**
     * Toggle product discrepancy details visibility
     */
    window.toggleProductDiscrepancy = function() {
        const detailsBody = document.getElementById('productDiscrepancyBody');
        const toggleIcon = document.getElementById('productDiscrepancyToggleIcon');

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('product-discrepancy-collapsed');

        if (isCollapsed) {
            detailsBody.classList.remove('product-discrepancy-collapsed');
            detailsBody.classList.add('product-discrepancy-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            detailsBody.classList.remove('product-discrepancy-expanded');
            detailsBody.classList.add('product-discrepancy-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Save finalize session to Firebase
     */
    window.saveFinalizeSession = async function() {
        console.log('[FINALIZE] 💾 Saving finalize session...');

        try {
            const saveBtn = document.getElementById('saveFinalizeBtn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

            const stats = finalizeSessionData.stats;
            if (!stats) {
                throw new Error('Không có dữ liệu thống kê');
            }

            // Validate all comment checkboxes are checked
            const hasCommentDiscrepancies =
                (commentAnalysisData.duplicateEntries && commentAnalysisData.duplicateEntries.length > 0) ||
                (commentAnalysisData.missingEntries && commentAnalysisData.missingEntries.length > 0);

            if (hasCommentDiscrepancies) {
                // Check duplicate entries
                const uncheckedDuplicate = commentAnalysisData.duplicateEntries.find(e => !e.checked);
                if (uncheckedDuplicate) {
                    throw new Error(`Vui lòng xác nhận tất cả các comment nhập trùng. STT ${uncheckedDuplicate.stt} chưa được xác nhận.`);
                }

                // Check missing entries
                const uncheckedMissing = commentAnalysisData.missingEntries.find(e => !e.checked);
                if (uncheckedMissing) {
                    throw new Error(`Vui lòng xác nhận tất cả các comment nhập thiếu. STT ${uncheckedMissing.stt} chưa được xác nhận.`);
                }
            }

            // Create finalize record
            const timestamp = Date.now();
            const finalizeRecord = {
                timestamp: timestamp,
                fromTimestamp: finalizeSessionData.lastFinalizeTimestamp || null,
                toTimestamp: timestamp,
                stats: {
                    uniqueSTTs: stats.uniqueSTTs,
                    totalQuantity: stats.totalQuantity,
                    uniqueProducts: stats.uniqueProducts
                },
                productSummary: stats.productDetails.map(p => ({
                    productCode: p.productCode,
                    productName: p.productName,
                    imageUrl: p.imageUrl,
                    quantity: p.totalQuantity,
                    sttCount: p.stts.length,
                    sttQuantities: p.sttQuantities // Save detailed STT quantities
                })),
                // Cart statistics (from orders in tab1)
                cartStats: {
                    uniqueSTTs: cartStatsData.uniqueSTTs,
                    totalQuantity: cartStatsData.totalQuantity,
                    uniqueProducts: cartStatsData.uniqueProducts,
                    productDetails: cartStatsData.productDetails.map(p => ({
                        productCode: p.productCode,
                        productName: p.productName,
                        imageUrl: p.imageUrl,
                        quantity: p.totalQuantity,
                        sttCount: p.stts.length,
                        sttQuantities: p.sttQuantities
                    }))
                },
                // Comment analysis data
                commentAnalysis: {
                    totalComments: commentAnalysisData.totalComments,
                    totalProductEntries: commentAnalysisData.totalProductEntries,
                    totalOrderQuantity: commentAnalysisData.totalOrderQuantity,
                    duplicateEntries: commentAnalysisData.duplicateEntries.map(e => ({
                        stt: e.stt,
                        customerName: e.customerName,
                        commentLines: e.commentLines || [],
                        commentCount: e.commentCount,
                        productCount: e.productCount,
                        difference: e.difference,
                        userNote: e.userNote,
                        checked: e.checked
                    })),
                    missingEntries: commentAnalysisData.missingEntries.map(e => ({
                        stt: e.stt,
                        customerName: e.customerName,
                        commentLines: e.commentLines || [],
                        commentCount: e.commentCount,
                        productCount: e.productCount,
                        difference: e.difference,
                        userNote: e.userNote,
                        checked: e.checked
                    }))
                },
                // Product discrepancy data
                productDiscrepancy: {
                    hasDiscrepancy: productDiscrepancyData.hasDiscrepancy,
                    totalExpected: productDiscrepancyData.totalExpected,
                    totalUploaded: productDiscrepancyData.totalUploaded,
                    missingProducts: productDiscrepancyData.missingProducts.map(p => ({
                        productCode: p.productCode,
                        productName: p.productName,
                        imageUrl: p.imageUrl,
                        expectedQuantity: p.expectedQuantity,
                        uploadedQuantity: p.uploadedQuantity,
                        difference: p.difference,
                        stts: p.stts
                    })),
                    extraProducts: productDiscrepancyData.extraProducts.map(p => ({
                        productCode: p.productCode,
                        productName: p.productName,
                        imageUrl: p.imageUrl,
                        expectedQuantity: p.expectedQuantity,
                        uploadedQuantity: p.uploadedQuantity,
                        difference: p.difference,
                        stts: p.stts
                    })),
                    missingSTTs: productDiscrepancyData.missingSTTs.map(s => ({
                        stt: s.stt,
                        customerName: s.customerName,
                        expectedQuantity: s.expectedQuantity,
                        uploadedQuantity: s.uploadedQuantity,
                        difference: s.difference,
                        productCodes: s.productCodes
                    })),
                    extraSTTs: productDiscrepancyData.extraSTTs.map(s => ({
                        stt: s.stt,
                        customerName: s.customerName,
                        expectedQuantity: s.expectedQuantity,
                        uploadedQuantity: s.uploadedQuantity,
                        difference: s.difference,
                        productCodes: s.productCodes
                    }))
                },
                recordCount: finalizeSessionData.records.length,
                createdBy: userStorageManager?.getUserIdentifier() || 'unknown',
                createdAt: new Date().toISOString()
            };

            // Save to Firebase
            await database.ref(`uploadSessionFinalize/${timestamp}`).set(finalizeRecord);

            console.log('[FINALIZE] ✅ Finalize session saved!');
            showNotification('✅ Đã lưu chốt đợt live thành công!', 'success');

            // Close modal
            const modalEl = document.getElementById('finalizeSessionModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) {
                modal.hide();
            }

            // Reset state
            finalizeSessionData = {
                records: [],
                stats: null,
                lastFinalizeTimestamp: null
            };

        } catch (error) {
            console.error('[FINALIZE] ❌ Error saving finalize session:', error);
            showNotification('❌ Lỗi khi lưu chốt đợt live: ' + error.message, 'error');

            const saveBtn = document.getElementById('saveFinalizeBtn');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu Chốt Đợt Live';
        }
    };

    console.log('✅ Finalize session functionality initialized');

})();

// ===== FINALIZE HISTORY FUNCTIONALITY =====
(function() {
    'use strict';

    // Get Firebase database reference
    const database = firebase.database();

    /**
     * Open finalize history modal
     */
    window.openFinalizeHistoryModal = async function() {
        console.log('[FINALIZE-HISTORY] 📋 Opening finalize history modal...');

        // Show modal
        const modalEl = document.getElementById('finalizeHistoryModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Show loading
        const modalBody = document.getElementById('finalizeHistoryModalBody');
        modalBody.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-purple" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="text-muted mt-2">Đang tải lịch sử chốt đợt live...</p>
            </div>
        `;

        try {
            // Load finalize history from Firebase
            const history = await loadFinalizeHistory();
            console.log('[FINALIZE-HISTORY] Loaded', history.length, 'finalize sessions');

            // Render history
            renderFinalizeHistoryList(history, modalBody);

        } catch (error) {
            console.error('[FINALIZE-HISTORY] ❌ Error loading history:', error);
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> Lỗi tải lịch sử: ${error.message}
                </div>
            `;
        }
    };

    /**
     * Load finalize history from Firebase
     */
    async function loadFinalizeHistory() {
        const snapshot = await database.ref('uploadSessionFinalize')
            .orderByChild('timestamp')
            .once('value');

        const history = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                history.push({
                    id: child.key,
                    ...child.val()
                });
            });
        }

        // Sort by timestamp descending (newest first)
        history.sort((a, b) => b.timestamp - a.timestamp);

        return history;
    }

    /**
     * Render finalize history list
     */
    function renderFinalizeHistoryList(history, container) {
        if (!history || history.length === 0) {
            container.innerHTML = `
                <div class="finalize-no-data">
                    <i class="fas fa-clipboard-list d-block"></i>
                    <p class="mb-0">Chưa có lịch sử chốt đợt live nào</p>
                </div>
            `;
            return;
        }

        let html = '<div class="finalize-history-list">';

        history.forEach((session, index) => {
            const time = new Date(session.timestamp);
            const timeStr = time.toLocaleString('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const stats = session.stats || {};
            const commentAnalysis = session.commentAnalysis || {};
            const productSummary = session.productSummary || [];

            html += `
                <div class="finalize-history-item">
                    <div class="finalize-history-header" onclick="toggleFinalizeHistoryItem(${index})">
                        <div class="session-info">
                            <div class="session-time">
                                <i class="fas fa-calendar-check me-2"></i>${timeStr}
                            </div>
                            <div class="session-by">
                                <i class="fas fa-user me-1"></i>${session.createdBy || 'Unknown'}
                            </div>
                        </div>
                        <div class="session-stats">
                            <div class="stat-item">
                                <div class="stat-value">${stats.uniqueSTTs || 0}</div>
                                <div class="stat-label">Đơn hàng</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.totalQuantity || 0}</div>
                                <div class="stat-label">Món</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-value">${stats.uniqueProducts || 0}</div>
                                <div class="stat-label">Sản phẩm</div>
                            </div>
                            <div class="stat-item">
                                <i class="fas fa-chevron-down toggle-icon" id="toggleIcon-${index}"></i>
                            </div>
                        </div>
                    </div>
                    <div class="finalize-history-body" id="historyBody-${index}">
                        ${renderFinalizeHistoryBody(session, productSummary, commentAnalysis)}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    /**
     * Render product stats table for history view
     */
    function renderHistoryProductStatsTable(stats, productDetails, title, sessionId, type) {
        const toggleId = `${type}ToggleIcon-${sessionId}`;
        const bodyId = `${type}Body-${sessionId}`;
        const toggleFunction = `toggleHistory${type.charAt(0).toUpperCase() + type.slice(1)}Details`;

        let html = `
            <div class="table-responsive mb-4">
                <table class="table table-bordered table-hover finalize-table">
                    <thead class="table-dark">
                        <tr>
                            <th colspan="3" class="text-center">
                                <i class="fas fa-shopping-cart"></i> ${title}
                            </th>
                        </tr>
                        <tr>
                            <th style="width: 50%">SẢN PHẨM</th>
                            <th style="width: 15%" class="text-center">SỐ LƯỢNG</th>
                            <th style="width: 35%">MÃ ĐƠN HÀNG (STT)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="finalize-summary-row" onclick="${toggleFunction}('${sessionId}')" style="cursor: pointer;">
                            <td>
                                <strong>
                                    <i class="fas fa-chevron-right finalize-toggle-icon" id="${toggleId}"></i>
                                    <i class="fas fa-chart-bar"></i> TỔNG CỘNG: ${stats.uniqueProducts || productDetails.length} sản phẩm
                                </strong>
                            </td>
                            <td class="text-center">
                                <strong>${stats.totalQuantity || 0} món</strong>
                            </td>
                            <td>
                                <strong>${stats.uniqueSTTs || 0} đơn hàng</strong>
                            </td>
                        </tr>
                    </tbody>
                    <tbody id="${bodyId}" class="finalize-details-collapsed">
        `;

        productDetails.forEach(product => {
            const imageHtml = product.imageUrl
                ? `<img src="${product.imageUrl}" alt="${product.productCode}" class="finalize-product-img">`
                : `<div class="finalize-product-img-placeholder"><i class="fas fa-box"></i></div>`;

            const sttList = product.sttQuantities && Array.isArray(product.sttQuantities) && product.sttQuantities.length > 0
                ? product.sttQuantities.map(item =>
                    item.quantity > 1 ? `${item.stt}x${item.quantity}` : item.stt
                  ).join(', ')
                : `${product.sttCount} STT`;

            html += `
                <tr class="finalize-detail-row">
                    <td>
                        <div class="d-flex align-items-center">
                            ${imageHtml}
                            <div class="ms-2">
                                <strong>[${product.productCode}]</strong>
                                ${product.productName ? `<div class="text-muted small">${product.productName}</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="text-center align-middle">
                        <span class="badge bg-primary fs-6">${product.quantity}</span>
                    </td>
                    <td class="align-middle">
                        <span class="text-muted small">${sttList}</span>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }

    /**
     * Render finalize history body content
     * Updated to match the layout of renderFinalizeSessionContent for consistency
     */
    function renderFinalizeHistoryBody(session, productSummary, commentAnalysis) {
        let html = '';

        // Time range info
        const fromDate = session.fromTimestamp
            ? new Date(session.fromTimestamp).toLocaleString('vi-VN')
            : 'Bắt đầu';
        const toDate = new Date(session.toTimestamp).toLocaleString('vi-VN');

        html += `
            <div class="finalize-session-info mb-4">
                <div class="alert alert-info">
                    <i class="fas fa-calendar-alt"></i>
                    <strong>Thống kê từ:</strong> ${fromDate} <i class="fas fa-arrow-right mx-2"></i> ${toDate}
                </div>
            </div>
        `;

        const sessionId = session.timestamp;
        const stats = session.stats || {};

        // Add cart statistics table (if available)
        if (session.cartStats && session.cartStats.productDetails && session.cartStats.productDetails.length > 0) {
            html += renderHistoryProductStatsTable(
                session.cartStats,
                session.cartStats.productDetails,
                'THỐNG KÊ MÃ SP TRONG GIỎ HÀNG',
                sessionId,
                'cart'
            );
        }

        // Add uploaded statistics table (renamed from "SẢN PHẨM")
        if (productSummary && productSummary.length > 0) {
            html += renderHistoryProductStatsTable(
                stats,
                productSummary,
                'THỐNG KÊ UPLOAD TPOS',
                sessionId,
                'product'
            );
        }

        // Comment analysis section with same layout as finalize session
        if (commentAnalysis) {
            const { totalComments, totalProductEntries, totalOrderQuantity, duplicateEntries, missingEntries } = commentAnalysis;
            const sessionId = session.timestamp;

            html += `
                <div class="comment-analysis-section mt-4">
                    <div class="table-responsive">
                        <table class="table table-bordered comment-analysis-table">
                            <thead class="table-dark">
                                <tr>
                                    <th colspan="2" class="text-center">
                                        <i class="fas fa-comments"></i> KIỂM TRA COMMENT
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Summary Row -->
                                <tr class="comment-summary-row" onclick="toggleHistoryCommentAnalysis('${sessionId}')" style="cursor: pointer;">
                                    <td colspan="2">
                                        <strong>
                                            <i class="fas fa-chevron-right comment-toggle-icon" id="commentAnalysisToggleIcon-${sessionId}"></i>
                                            <i class="fas fa-chart-pie"></i>
                                            Tổng: <span class="text-primary">${totalComments || 0}</span> comment tạo đơn |
                                            <span class="text-success">${totalProductEntries || 0}</span> số phiếu đã nhập |
                                            <span class="text-info">${totalOrderQuantity || 0}</span> số món trong tất cả giỏ
                                        </strong>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Collapsible Details -->
                        <div id="commentAnalysisBody-${sessionId}" class="comment-analysis-collapsed">
                            <div class="row">
                                <!-- Left Column: Comment nhập trùng -->
                                <div class="col-md-6">
                                    <div class="comment-column comment-duplicate">
                                        <h6 class="comment-column-header bg-warning text-dark">
                                            <i class="fas fa-exclamation-triangle"></i>
                                            COMMENT NHẬP TRÙNG (${duplicateEntries?.length || 0})
                                            <small class="d-block">Số comment < Số sản phẩm</small>
                                        </h6>
                                        <div class="comment-entries-list">
            `;

            if (!duplicateEntries || duplicateEntries.length === 0) {
                html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
            } else {
                duplicateEntries.forEach((entry, idx) => {
                    html += renderHistoryCommentEntry(entry, idx, 'duplicate');
                });
            }

            html += `
                                        </div>
                                    </div>
                                </div>

                                <!-- Right Column: Comment nhập thiếu -->
                                <div class="col-md-6">
                                    <div class="comment-column comment-missing">
                                        <h6 class="comment-column-header bg-danger text-white">
                                            <i class="fas fa-times-circle"></i>
                                            COMMENT NHẬP THIẾU (${missingEntries?.length || 0})
                                            <small class="d-block">Số comment > Số sản phẩm</small>
                                        </h6>
                                        <div class="comment-entries-list">
            `;

            if (!missingEntries || missingEntries.length === 0) {
                html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
            } else {
                missingEntries.forEach((entry, idx) => {
                    html += renderHistoryCommentEntry(entry, idx, 'missing');
                });
            }

            html += `
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Product discrepancy section with same layout as finalize session
        if (session.productDiscrepancy) {
            const productDiscrepancy = session.productDiscrepancy;
            const { totalExpected, totalUploaded, missingProducts, extraProducts, missingSTTs, extraSTTs } = productDiscrepancy;
            const sessionId = session.timestamp;

            const diffValue = totalUploaded - totalExpected;
            const diffClass = diffValue > 0 ? 'text-warning' : (diffValue < 0 ? 'text-danger' : 'text-success');
            const diffIcon = diffValue > 0 ? 'fa-exclamation-triangle' : (diffValue < 0 ? 'fa-times-circle' : 'fa-check-circle');
            const hasDiscrepancy = productDiscrepancy.hasDiscrepancy;

            html += `
                <div class="product-discrepancy-section mt-4">
                    <div class="table-responsive">
                        <table class="table table-bordered discrepancy-table">
                            <thead class="table-dark">
                                <tr>
                                    <th colspan="2" class="text-center">
                                        <i class="fas fa-clipboard-list"></i> PHÁT HIỆN CHÊNH LỆCH SỐ LƯỢNG
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- Summary Row -->
                                <tr class="discrepancy-summary-row" onclick="toggleHistoryProductDiscrepancy('${sessionId}')" style="cursor: pointer;">
                                    <td colspan="2">
                                        <strong>
                                            <i class="fas fa-chevron-right discrepancy-toggle-icon" id="productDiscrepancyToggleIcon-${sessionId}"></i>
                                            <i class="fas fa-chart-line"></i>
                                            Số món trong tất cả giỏ: <span class="badge bg-info">${totalExpected || 0}</span>
                                            <i class="fas fa-arrow-right mx-2"></i>
                                            Số phiếu đã nhập: <span class="badge bg-primary">${totalUploaded || 0}</span>
                                            <i class="fas fa-arrow-right mx-2"></i>
                                            Chênh lệch: <span class="badge bg-secondary ${diffClass}"><i class="fas ${diffIcon}"></i> ${diffValue > 0 ? '+' : ''}${diffValue}</span>
                                            ${hasDiscrepancy ? '<span class="badge bg-warning ms-2">Có chênh lệch!</span>' : '<span class="badge bg-success ms-2">Không chênh lệch</span>'}
                                        </strong>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Collapsible Details -->
                        <div id="productDiscrepancyBody-${sessionId}" class="product-discrepancy-collapsed">
            `;

            html += renderHistoryProductDiscrepancyDetails(missingProducts, extraProducts, missingSTTs, extraSTTs);

            html += `
                        </div>
                    </div>
                </div>
            `;
        }

        return html || '<div class="text-muted text-center py-3">Không có chi tiết</div>';
    }

    /**
     * Render product discrepancy details for history view
     */
    function renderHistoryProductDiscrepancyDetails(missingProducts, extraProducts, missingSTTs, extraSTTs) {
        let html = `
            <div class="row">
                <!-- Missing Products Column -->
                <div class="col-md-6">
                    <div class="discrepancy-column">
                        <h6 class="discrepancy-column-header bg-danger text-white">
                            <i class="fas fa-minus-circle"></i>
                            SẢN PHẨM THIẾU (${missingProducts?.length || 0})
                            <small class="d-block">Có trong giỏ nhưng chưa nhập đủ</small>
                        </h6>
                        <div class="discrepancy-entries-list">
        `;

        if (!missingProducts || missingProducts.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            missingProducts.forEach(item => {
                const imageHtml = item.imageUrl
                    ? `<img src="${item.imageUrl}" alt="${item.productCode}" class="discrepancy-product-img">`
                    : `<div class="discrepancy-product-img-placeholder"><i class="fas fa-box"></i></div>`;

                html += `
                    <div class="discrepancy-entry bg-danger-subtle">
                        <div class="d-flex align-items-start">
                            ${imageHtml}
                            <div class="flex-grow-1 ms-2">
                                <div class="fw-bold">${escapeHistoryHtml(item.productCode)}</div>
                                ${item.productName ? `<div class="text-muted small">${escapeHistoryHtml(item.productName)}</div>` : ''}
                                <div class="discrepancy-stats mt-1">
                                    <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                    <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                    <span class="badge bg-danger">Thiếu: ${item.difference}</span>
                                </div>
                                <div class="text-muted small mt-1">
                                    <i class="fas fa-tags"></i> STT: ${item.stts}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>
                </div>

                <!-- Extra Products Column -->
                <div class="col-md-6">
                    <div class="discrepancy-column">
                        <h6 class="discrepancy-column-header bg-warning text-dark">
                            <i class="fas fa-plus-circle"></i>
                            SẢN PHẨM THỪA (${extraProducts?.length || 0})
                            <small class="d-block">Nhập nhiều hơn số lượng trong giỏ</small>
                        </h6>
                        <div class="discrepancy-entries-list">
        `;

        if (!extraProducts || extraProducts.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            extraProducts.forEach(item => {
                const imageHtml = item.imageUrl
                    ? `<img src="${item.imageUrl}" alt="${item.productCode}" class="discrepancy-product-img">`
                    : `<div class="discrepancy-product-img-placeholder"><i class="fas fa-box"></i></div>`;

                html += `
                    <div class="discrepancy-entry bg-warning-subtle">
                        <div class="d-flex align-items-start">
                            ${imageHtml}
                            <div class="flex-grow-1 ms-2">
                                <div class="fw-bold">${escapeHistoryHtml(item.productCode)}</div>
                                ${item.productName ? `<div class="text-muted small">${escapeHistoryHtml(item.productName)}</div>` : ''}
                                <div class="discrepancy-stats mt-1">
                                    <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                    <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                    <span class="badge bg-warning">Thừa: ${item.difference}</span>
                                </div>
                                <div class="text-muted small mt-1">
                                    <i class="fas fa-tags"></i> STT: ${item.stts}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>
                </div>
            </div>

            <!-- Missing STTs Section -->
            <div class="row mt-3">
                <div class="col-md-6">
                    <div class="discrepancy-column">
                        <h6 class="discrepancy-column-header bg-danger text-white">
                            <i class="fas fa-receipt"></i>
                            STT THIẾU (${missingSTTs?.length || 0})
                            <small class="d-block">Có trong giỏ nhưng chưa nhập đủ sản phẩm</small>
                        </h6>
                        <div class="discrepancy-entries-list">
        `;

        if (!missingSTTs || missingSTTs.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            missingSTTs.forEach(item => {
                html += `
                    <div class="discrepancy-entry bg-danger-subtle">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <span class="badge bg-danger">STT ${item.stt}</span>
                                ${item.customerName ? `<span class="ms-2 text-muted">${escapeHistoryHtml(item.customerName)}</span>` : ''}
                            </div>
                            <div class="discrepancy-stats">
                                <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                <span class="badge bg-danger">Thiếu: ${item.difference}</span>
                            </div>
                        </div>
                        <div class="text-muted small mt-1">
                            <i class="fas fa-box"></i> Sản phẩm: ${item.productCodes}
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>
                </div>

                <!-- Extra STTs Section -->
                <div class="col-md-6">
                    <div class="discrepancy-column">
                        <h6 class="discrepancy-column-header bg-warning text-dark">
                            <i class="fas fa-receipt"></i>
                            STT THỪA (${extraSTTs?.length || 0})
                            <small class="d-block">Nhập nhiều hơn số lượng trong giỏ</small>
                        </h6>
                        <div class="discrepancy-entries-list">
        `;

        if (!extraSTTs || extraSTTs.length === 0) {
            html += `<div class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Không có</div>`;
        } else {
            extraSTTs.forEach(item => {
                html += `
                    <div class="discrepancy-entry bg-warning-subtle">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <span class="badge bg-warning text-dark">STT ${item.stt}</span>
                                ${item.customerName ? `<span class="ms-2 text-muted">${escapeHistoryHtml(item.customerName)}</span>` : ''}
                            </div>
                            <div class="discrepancy-stats">
                                <span class="badge bg-light text-dark">Cần: ${item.expectedQuantity}</span>
                                <span class="badge bg-light text-dark">Đã nhập: ${item.uploadedQuantity}</span>
                                <span class="badge bg-warning text-dark">Thừa: ${item.difference}</span>
                            </div>
                        </div>
                        <div class="text-muted small mt-1">
                            <i class="fas fa-box"></i> Sản phẩm: ${item.productCodes}
                        </div>
                    </div>
                `;
            });
        }

        html += `
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    /**
     * Toggle product discrepancy details visibility in history view
     */
    window.toggleHistoryProductDiscrepancy = function(sessionId) {
        const detailsBody = document.getElementById(`productDiscrepancyBody-${sessionId}`);
        const toggleIcon = document.getElementById(`productDiscrepancyToggleIcon-${sessionId}`);

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('product-discrepancy-collapsed');

        if (isCollapsed) {
            detailsBody.classList.remove('product-discrepancy-collapsed');
            detailsBody.classList.add('product-discrepancy-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            detailsBody.classList.remove('product-discrepancy-expanded');
            detailsBody.classList.add('product-discrepancy-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    }

    /**
     * Render a single comment entry for history view (read-only version)
     */
    function renderHistoryCommentEntry(entry, idx, type) {
        const commentsHtml = entry.commentLines && entry.commentLines.length > 0
            ? entry.commentLines.map(c => `<div class="comment-line">• ${escapeHistoryHtml(c)}</div>`).join('')
            : '<div class="text-muted small">(Không có comment)</div>';

        const diffLabel = type === 'duplicate'
            ? `Thiếu ${entry.difference} ghi chú`
            : `Thừa ${entry.difference} ghi chú`;

        return `
            <div class="comment-entry" data-type="${type}" data-idx="${idx}">
                <div class="comment-entry-header">
                    <span class="stt-badge">STT ${entry.stt}</span>
                    <span class="customer-name">${escapeHistoryHtml(entry.customerName || '')}</span>
                    <span class="diff-badge ${type === 'duplicate' ? 'bg-warning' : 'bg-danger'}">${diffLabel}</span>
                </div>
                <div class="comment-entry-body">
                    <div class="comment-lines">${commentsHtml}</div>
                    <div class="comment-stats">
                        <small class="text-muted">
                            ${entry.commentCount || 0} comment / ${entry.productCount || 0} sản phẩm
                        </small>
                    </div>
                </div>
                ${entry.userNote ? `
                    <div class="comment-entry-footer">
                        <div class="alert alert-info py-1 px-2 mb-0">
                            <i class="fas fa-sticky-note me-1"></i> ${escapeHistoryHtml(entry.userNote)}
                        </div>
                    </div>
                ` : ''}
                ${entry.checked ? `
                    <div class="text-success small mt-1">
                        <i class="fas fa-check-circle"></i> Đã xác nhận
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Escape HTML special characters for history view
     */
    function escapeHistoryHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Toggle cart details visibility in history view
     */
    window.toggleHistoryCartDetails = function(sessionId) {
        const detailsBody = document.getElementById(`cartBody-${sessionId}`);
        const toggleIcon = document.getElementById(`cartToggleIcon-${sessionId}`);

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('finalize-details-collapsed');

        if (isCollapsed) {
            detailsBody.classList.remove('finalize-details-collapsed');
            detailsBody.classList.add('finalize-details-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            detailsBody.classList.remove('finalize-details-expanded');
            detailsBody.classList.add('finalize-details-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Toggle product details visibility in history view
     */
    window.toggleHistoryProductDetails = function(sessionId) {
        const detailsBody = document.getElementById(`productBody-${sessionId}`);
        const toggleIcon = document.getElementById(`productToggleIcon-${sessionId}`);

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('finalize-details-collapsed');

        if (isCollapsed) {
            // Expand
            detailsBody.classList.remove('finalize-details-collapsed');
            detailsBody.classList.add('finalize-details-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            // Collapse
            detailsBody.classList.remove('finalize-details-expanded');
            detailsBody.classList.add('finalize-details-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Toggle comment analysis details visibility in history view
     */
    window.toggleHistoryCommentAnalysis = function(sessionId) {
        const detailsBody = document.getElementById(`commentAnalysisBody-${sessionId}`);
        const toggleIcon = document.getElementById(`commentAnalysisToggleIcon-${sessionId}`);

        if (!detailsBody || !toggleIcon) return;

        const isCollapsed = detailsBody.classList.contains('comment-analysis-collapsed');

        if (isCollapsed) {
            detailsBody.classList.remove('comment-analysis-collapsed');
            detailsBody.classList.add('comment-analysis-expanded');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
        } else {
            detailsBody.classList.remove('comment-analysis-expanded');
            detailsBody.classList.add('comment-analysis-collapsed');
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
        }
    };

    /**
     * Toggle finalize history item expand/collapse
     */
    window.toggleFinalizeHistoryItem = function(index) {
        const body = document.getElementById(`historyBody-${index}`);
        const icon = document.getElementById(`toggleIcon-${index}`);

        if (body.classList.contains('expanded')) {
            body.classList.remove('expanded');
            icon.classList.remove('expanded');
        } else {
            body.classList.add('expanded');
            icon.classList.add('expanded');
        }
    };

    console.log('✅ Finalize history functionality initialized');

})();
