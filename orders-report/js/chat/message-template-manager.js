/* =====================================================
   MESSAGE TEMPLATE MANAGER - Rebuilt
   Bulk send templates, track sent/failed orders
   ===================================================== */

console.log('[TemplateMgr] Loading...');

(function() {
    'use strict';

    // =====================================================
    // STORAGE KEYS
    // =====================================================
    const SENT_KEY = 'sent_message_orders';
    const FAILED_KEY = 'failed_message_orders';
    const TEMPLATES_KEY = 'message_templates_cache';
    const TTL_24H = 24 * 60 * 60 * 1000;

    // In-memory sets for fast lookup
    let _sentOrders = new Map();      // orderId → { viaComment, timestamp }
    let _failedOrders = new Map();    // orderId → { timestamp, error }

    // =====================================================
    // PERSISTENCE (localStorage)
    // =====================================================

    function _loadFromStorage() {
        try {
            const sentRaw = localStorage.getItem(SENT_KEY);
            if (sentRaw) {
                const arr = JSON.parse(sentRaw);
                const now = Date.now();
                arr.forEach(item => {
                    if (now - item.timestamp < TTL_24H) {
                        _sentOrders.set(item.orderId, { viaComment: item.viaComment || false, timestamp: item.timestamp });
                    }
                });
            }
        } catch (e) { /* ignore */ }

        try {
            const failedRaw = localStorage.getItem(FAILED_KEY);
            if (failedRaw) {
                const arr = JSON.parse(failedRaw);
                arr.forEach(item => {
                    _failedOrders.set(item.orderId, { timestamp: item.timestamp, error: item.error || '' });
                });
            }
        } catch (e) { /* ignore */ }
    }

    function _saveToStorage() {
        try {
            const sentArr = [];
            _sentOrders.forEach((v, k) => sentArr.push({ orderId: k, viaComment: v.viaComment, timestamp: v.timestamp }));
            localStorage.setItem(SENT_KEY, JSON.stringify(sentArr));
        } catch (e) { /* ignore */ }

        try {
            const failedArr = [];
            _failedOrders.forEach((v, k) => failedArr.push({ orderId: k, timestamp: v.timestamp, error: v.error }));
            localStorage.setItem(FAILED_KEY, JSON.stringify(failedArr));
        } catch (e) { /* ignore */ }
    }

    // Load on init
    _loadFromStorage();

    // =====================================================
    // STATUS CHECK METHODS (called by tab1-table.js)
    // =====================================================

    function isOrderSent(orderId) {
        if (!orderId) return false;
        const entry = _sentOrders.get(orderId);
        if (!entry) return false;
        // Check TTL
        if (Date.now() - entry.timestamp > TTL_24H) {
            _sentOrders.delete(orderId);
            return false;
        }
        return true;
    }

    function isOrderSentViaComment(orderId) {
        if (!orderId) return false;
        const entry = _sentOrders.get(orderId);
        if (!entry) return false;
        if (Date.now() - entry.timestamp > TTL_24H) {
            _sentOrders.delete(orderId);
            return false;
        }
        return entry.viaComment === true;
    }

    function isOrderFailed(orderId) {
        if (!orderId) return false;
        return _failedOrders.has(orderId);
    }

    // =====================================================
    // MARK METHODS
    // =====================================================

    function markOrderSent(orderId, viaComment) {
        _sentOrders.set(orderId, { viaComment: viaComment || false, timestamp: Date.now() });
        _failedOrders.delete(orderId); // remove from failed if was there
        _saveToStorage();

        // Dispatch event for tab1-table.js badge updates (mirrors failedOrdersUpdated)
        const sentIds = [], commentIds = [];
        for (const [id, data] of _sentOrders) {
            sentIds.push(id);
            if (data.viaComment) commentIds.push(id);
        }
        window.dispatchEvent(new CustomEvent('sentOrdersUpdated', {
            detail: { sentOrderIds: sentIds, sentViaCommentIds: commentIds }
        }));
    }

    function markOrderFailed(orderId, error) {
        _failedOrders.set(orderId, { timestamp: Date.now(), error: error || '' });
        _saveToStorage();

        // Dispatch event for tab1-table.js badge updates
        window.dispatchEvent(new CustomEvent('failedOrdersUpdated', {
            detail: { failedOrderIds: Array.from(_failedOrders.keys()) }
        }));
    }

    function clearOrderStatus(orderId) {
        _sentOrders.delete(orderId);
        _failedOrders.delete(orderId);
        _saveToStorage();
    }

    // =====================================================
    // QUICK COMMENT REPLY (openQuickCommentReply)
    // =====================================================

    function openQuickCommentReply(orderId) {
        if (!orderId) return;

        // Find order row to get psid/pageId
        const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (!row) {
            console.warn('[TemplateMgr] Order row not found:', orderId);
            if (window.notificationManager) window.notificationManager.show('Không tìm thấy đơn hàng', 'error');
            return;
        }

        const pageId = row.dataset.pageId || row.dataset.channelId || '';
        const psid = row.dataset.psid || row.dataset.fbId || '';

        if (!pageId || !psid) {
            console.warn('[TemplateMgr] Missing pageId/psid for order:', orderId);
            if (window.notificationManager) window.notificationManager.show('Thiếu thông tin khách hàng', 'error');
            return;
        }

        // Open comment modal (which is now the chat modal in COMMENT mode)
        if (window.openCommentModal) {
            window.openCommentModal(orderId, pageId, psid);
        } else if (window.openChatModal) {
            window.openChatModal(orderId, pageId, psid, 'COMMENT');
        }
    }

    // =====================================================
    // BULK SEND (Templates)
    // =====================================================

    /**
     * Send message to multiple orders using template
     * @param {Array} orders - [{orderId, pageId, psid, customerName}]
     * @param {string} templateText - Message template with placeholders
     * @param {Object} options - { viaComment, useExtensionFallback }
     */
    async function bulkSendTemplate(orders, templateText, options = {}) {
        if (!orders?.length || !templateText) return { sent: 0, failed: 0 };

        const pdm = window.pancakeDataManager;
        if (!pdm) {
            console.error('[TemplateMgr] pancakeDataManager not available');
            return { sent: 0, failed: 0 };
        }

        const viaComment = options.viaComment || false;
        const results = { sent: 0, failed: 0, errors: [] };

        // Enable bulk mode for parallel sending
        if (pdm.requestQueue) {
            pdm.requestQueue.enableBulkMode(6, 200);
        }

        try {
            // Process in chunks
            const chunkSize = 10;
            for (let i = 0; i < orders.length; i += chunkSize) {
                const chunk = orders.slice(i, i + chunkSize);

                const promises = chunk.map(async (order) => {
                    try {
                        const text = _fillTemplate(templateText, order);
                        const pageId = order.pageId;

                        if (viaComment) {
                            // Find conversation and send as comment
                            await _sendAsComment(pageId, order.psid, text, order.orderId);
                        } else {
                            // Send as inbox message
                            await _sendAsInbox(pageId, order.psid, text, order.orderId);
                        }

                        markOrderSent(order.orderId, viaComment);
                        results.sent++;
                    } catch (e) {
                        markOrderFailed(order.orderId, e.message);
                        results.failed++;
                        results.errors.push({ orderId: order.orderId, error: e.message });
                    }
                });

                await Promise.allSettled(promises);

                // Progress update
                if (typeof options.onProgress === 'function') {
                    options.onProgress(results.sent, results.failed, orders.length);
                } else if (window.notificationManager) {
                    window.notificationManager.show(
                        `Đã gửi ${results.sent}/${orders.length}, lỗi: ${results.failed}`,
                        results.failed > 0 ? 'warning' : 'info'
                    );
                }
            }
        } finally {
            if (pdm.requestQueue) {
                pdm.requestQueue.disableBulkMode();
            }
        }

        console.log('[TemplateMgr] Bulk send complete:', results);
        return results;
    }

    async function _sendAsInbox(pageId, psid, text, orderId) {
        const pdm = window.pancakeDataManager;

        // First find conversation
        const conv = pdm.inboxMapByPSID?.get(String(psid));
        if (!conv) {
            throw new Error('Không tìm thấy cuộc hội thoại INBOX');
        }

        try {
            // Try Pancake API first
            await pdm.sendMessage(pageId, conv.id, {
                message: text,
                type: 'reply_inbox'
            });
        } catch (apiErr) {
            // Fallback to extension if 24h error
            if (window.sendViaExtension && window.pancakeExtension?.connected) {
                const convData = window.buildConvData ? window.buildConvData(pageId, psid) : { pageId, psid };
                await window.sendViaExtension(text, convData);
            } else {
                throw apiErr;
            }
        }
    }

    async function _sendAsComment(pageId, psid, text, orderId) {
        const pdm = window.pancakeDataManager;

        // Find COMMENT conversation
        const conv = pdm.commentMapByPSID?.get(String(psid));
        if (!conv) {
            throw new Error('Không tìm thấy cuộc hội thoại COMMENT');
        }

        await pdm.sendMessage(pageId, conv.id, {
            message: text,
            type: 'reply_comment'
        });
    }

    function _fillTemplate(template, order) {
        if (!template) return '';
        return template
            .replace(/\{customerName\}/g, order.customerName || '')
            .replace(/\{orderId\}/g, order.orderId || '')
            .replace(/\{phone\}/g, order.phone || '')
            .replace(/\{total\}/g, order.total || '')
            .replace(/\{products\}/g, order.products || '');
    }

    // =====================================================
    // TEMPLATE CRUD (Firebase Firestore)
    // =====================================================

    let _templates = [];

    async function loadTemplates() {
        try {
            // Try localStorage cache first
            const cached = localStorage.getItem(TEMPLATES_KEY);
            if (cached) {
                _templates = JSON.parse(cached);
            }

            // Load from Firestore
            if (window.db) {
                const snap = await window.db.collection('message_templates').orderBy('order', 'asc').get();
                _templates = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                localStorage.setItem(TEMPLATES_KEY, JSON.stringify(_templates));

                // Seed defaults if empty
                if (_templates.length === 0) {
                    await _seedDefaultTemplates();
                    const snap2 = await window.db.collection('message_templates').orderBy('order', 'asc').get();
                    _templates = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(_templates));
                }
            }
        } catch (e) {
            console.warn('[TemplateMgr] Load templates error:', e);
        }
        return _templates;
    }

    async function saveTemplate(template) {
        if (!window.db || !template) return null;
        try {
            if (template.id) {
                await window.db.collection('message_templates').doc(template.id).set(template, { merge: true });
            } else {
                const ref = await window.db.collection('message_templates').add({
                    ...template,
                    createdAt: Date.now(),
                    order: _templates.length
                });
                template.id = ref.id;
            }
            await loadTemplates();
            return template;
        } catch (e) {
            console.error('[TemplateMgr] Save template error:', e);
            return null;
        }
    }

    async function deleteTemplate(templateId) {
        if (!window.db || !templateId) return;
        try {
            await window.db.collection('message_templates').doc(templateId).delete();
            await loadTemplates();
        } catch (e) {
            console.error('[TemplateMgr] Delete template error:', e);
        }
    }

    function getTemplates() {
        return [..._templates];
    }

    // =====================================================
    // CLEANUP (auto-expire old entries)
    // =====================================================

    function cleanup() {
        const now = Date.now();
        let changed = false;

        _sentOrders.forEach((v, k) => {
            if (now - v.timestamp > TTL_24H) {
                _sentOrders.delete(k);
                changed = true;
            }
        });

        // Clean failed orders older than 7 days
        const TTL_7D = 7 * 24 * 60 * 60 * 1000;
        _failedOrders.forEach((v, k) => {
            if (now - v.timestamp > TTL_7D) {
                _failedOrders.delete(k);
                changed = true;
            }
        });

        if (changed) _saveToStorage();
    }

    // Run cleanup on load
    cleanup();

    // =====================================================
    // RICH PLACEHOLDER SYSTEM (replicates copy-template-helper.js logic)
    // =====================================================

    function _formatCurrency(amount) {
        if (!amount && amount !== 0) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
    }

    function _parseDiscountPrice(note) {
        if (!note || typeof note !== 'string') return null;
        const trimmedNote = note.trim();
        if (!trimmedNote) return null;

        const kPattern = /^(\d+)k\b\s*(.*)/i;
        const numPattern = /^(\d+)\b\s*(.*)/;
        let match = null, priceValue = null, remainingNote = '';

        match = trimmedNote.match(kPattern);
        if (match) { priceValue = parseInt(match[1], 10); remainingNote = (match[2] || '').trim(); }

        if (!priceValue) {
            match = trimmedNote.match(numPattern);
            if (match) { priceValue = parseInt(match[1], 10); remainingNote = (match[2] || '').trim(); }
        }

        if (priceValue && priceValue > 0) {
            return { discountPrice: priceValue * 1000, displayText: priceValue.toString(), remainingNote };
        }
        return null;
    }

    function _formatProductLine(product) {
        const discountInfo = _parseDiscountPrice(product.note);
        if (discountInfo) {
            const discountPerItem = product.price - discountInfo.discountPrice;
            const totalDiscount = discountPerItem * product.quantity;
            let line = `- ${product.name} x${product.quantity} = ${_formatCurrency(product.total)}`;
            let saleLine = `  📝Sale ${discountInfo.displayText}`;
            if (discountInfo.remainingNote) saleLine += ` (${discountInfo.remainingNote})`;
            return {
                line: line + '\n' + saleLine,
                hasDiscount: true,
                discountData: { originalTotal: product.total, discountPerItem, totalDiscount, finalTotal: product.total - totalDiscount }
            };
        } else {
            const noteText = product.note ? ` (${product.note})` : '';
            return {
                line: `- ${product.name} x${product.quantity} = ${_formatCurrency(product.total)}${noteText}`,
                hasDiscount: false,
                discountData: null
            };
        }
    }

    function _convertOrderData(fullOrderData) {
        if (!fullOrderData) return null;
        const products = (fullOrderData.Details || [])
            .filter(d => !d.IsHeld)
            .map(d => ({
                name: d.ProductNameGet || d.ProductName || 'Sản phẩm',
                quantity: d.Quantity || 1,
                price: d.Price || 0,
                total: (d.Quantity || 1) * (d.Price || 0),
                note: d.Note || ''
            }));
        const calculatedTotal = products.reduce((sum, p) => sum + p.total, 0);
        return {
            code: fullOrderData.Code || '',
            customerName: fullOrderData.Partner?.Name || fullOrderData.PartnerName || fullOrderData.CustomerName || '',
            phone: fullOrderData.Partner?.Telephone || fullOrderData.ReceiverPhone || fullOrderData.Telephone || '',
            address: fullOrderData.Partner?.Address || fullOrderData.ReceiverAddress || fullOrderData.Address || '',
            extraAddress: fullOrderData.ReceiverAddress2 || '',
            totalAmount: calculatedTotal,
            products: products
        };
    }

    function _needsFullData(content) {
        return content.includes('{order.details}') ||
               content.includes('{order.totalAmount}') ||
               content.includes('{order.total}') ||
               content.includes('{partner.address}');
    }

    function _replacePlaceholders(content, orderData) {
        let result = content;

        // {partner.name}
        if (orderData.customerName && orderData.customerName.trim()) {
            result = result.replace(/{partner\.name}/g, orderData.customerName);
        } else {
            result = result.replace(/{partner\.name}/g, '(Khách hàng)');
        }

        // {partner.address} - kèm SĐT
        if (orderData.address && orderData.address.trim()) {
            const phone = orderData.phone && orderData.phone.trim() ? orderData.phone : '';
            const addressWithPhone = phone ? `${orderData.address} - SĐT: ${phone}` : orderData.address;
            result = result.replace(/{partner\.address}/g, addressWithPhone);
        } else {
            result = result.replace(/"\{partner\.address\}"/g, '(Chưa có địa chỉ)');
            result = result.replace(/\{partner\.address\}/g, '(Chưa có địa chỉ)');
        }

        // {partner.phone}
        if (orderData.phone && orderData.phone.trim()) {
            result = result.replace(/{partner\.phone}/g, orderData.phone);
        } else {
            result = result.replace(/{partner\.phone}/g, '(Chưa có SĐT)');
        }

        // {order.details} - danh sách SP + tổng tiền + phí ship + freeship
        if (orderData.products && Array.isArray(orderData.products) && orderData.products.length > 0) {
            let totalDiscountAmount = 0;
            let hasAnyDiscount = false;
            const formattedProducts = orderData.products.map(p => {
                const fp = _formatProductLine(p);
                if (fp.hasDiscount && fp.discountData) {
                    hasAnyDiscount = true;
                    totalDiscountAmount += fp.discountData.totalDiscount;
                }
                return fp;
            });
            const productList = formattedProducts.map(fp => fp.line).join('\n');

            let totalSection;
            if (hasAnyDiscount) {
                const originalTotal = orderData.totalAmount || 0;
                const afterDiscount = originalTotal - totalDiscountAmount;
                totalSection = [
                    `Tổng : ${_formatCurrency(originalTotal)}`,
                    `Giảm giá: ${_formatCurrency(totalDiscountAmount)}`,
                    `Tổng tiền: ${_formatCurrency(afterDiscount)}`
                ].join('\n');
            } else {
                const totalAmount = orderData.totalAmount || 0;
                totalSection = `Tổng tiền: ${_formatCurrency(totalAmount)}`;
            }
            result = result.replace(/{order\.details}/g, `${productList}\n\n${totalSection}`);
        } else {
            result = result.replace(/{order\.details}/g, '(Chưa có sản phẩm)');
        }

        // {order.code}
        if (orderData.code && orderData.code.trim()) {
            result = result.replace(/{order\.code}/g, orderData.code);
        } else {
            result = result.replace(/{order\.code}/g, '(Không có mã)');
        }

        // {order.total} / {order.totalAmount}
        if (orderData.totalAmount) {
            result = result.replace(/{order\.total}/g, _formatCurrency(orderData.totalAmount));
            result = result.replace(/{order\.totalAmount}/g, _formatCurrency(orderData.totalAmount));
        } else {
            result = result.replace(/{order\.total}/g, '0đ');
            result = result.replace(/{order\.totalAmount}/g, '0đ');
        }

        // {order.phone}
        if (orderData.phone && orderData.phone.trim()) {
            result = result.replace(/{order\.phone}/g, orderData.phone);
        } else {
            result = result.replace(/{order\.phone}/g, '(Chưa có SĐT)');
        }

        // {order.customerName}
        result = result.replace(/{order\.customerName}/g, orderData.customerName || '(Khách hàng)');

        // {order.address}
        result = result.replace(/{order\.address}/g, orderData.address || '(Chưa có địa chỉ)');

        return result;
    }

    function _splitMessageIntoParts(message, maxLength) {
        if (!maxLength) maxLength = 2000;
        if (!message || message.length <= maxLength) return [message];

        const parts = [];
        let remaining = message;
        while (remaining.length > maxLength) {
            let cutAt = remaining.lastIndexOf('\n', maxLength);
            if (cutAt <= 0) cutAt = remaining.lastIndexOf(' ', maxLength);
            if (cutAt <= 0) cutAt = maxLength;
            parts.push(remaining.substring(0, cutAt));
            remaining = remaining.substring(cutAt).trimStart();
        }
        if (remaining) parts.push(remaining);
        return parts;
    }

    // =====================================================
    // MULTI-ACCOUNT SEND ENGINE
    // =====================================================

    function _distributeOrdersToAccounts(orders, accounts) {
        const queues = accounts.map(() => []);
        let rrIndex = 0;

        for (const order of orders) {
            const pageId = order.channelId || order.pageId;
            // Find account with access to this page
            let preferredIdx = -1;
            if (pageId && window.pancakeTokenManager) {
                preferredIdx = accounts.findIndex(acc =>
                    window.pancakeTokenManager.accountHasPageAccess(acc.accountId, pageId)
                );
            }
            if (preferredIdx >= 0) {
                queues[preferredIdx].push(order);
            } else {
                queues[rrIndex % accounts.length].push(order);
                rrIndex++;
            }
        }
        return queues;
    }

    async function _prefetchPageAccessTokens(orders) {
        if (!window.pancakeTokenManager) return;

        // Ensure page access tokens are loaded from IndexedDB/Firestore into memory cache
        // These tokens are already saved via "Quản lý tài khoản Pancake" UI
        try {
            await window.pancakeTokenManager.loadPageAccessTokens();
        } catch (e) {
            console.warn('[TemplateMgr] Failed to load page access tokens from storage:', e);
        }

        // Just verify tokens exist - DO NOT auto-generate (requires subscription)
        const uniquePageIds = [...new Set(orders.map(o => o.channelId || o.pageId).filter(Boolean))];
        const missingPages = [];
        for (const pid of uniquePageIds) {
            const token = window.pancakeTokenManager.getPageAccessToken(pid);
            if (token) {
                console.log('[TemplateMgr] ✅ PAT cached for page:', pid);
            } else {
                missingPages.push(pid);
                console.warn('[TemplateMgr] ⚠️ No PAT found for page:', pid, '- Admin cần thêm token qua "Quản lý Pancake Accounts"');
            }
        }

        if (missingPages.length > 0) {
            window.notificationManager?.show(
                `${missingPages.length} page chưa có Page Access Token. Vào "Quản lý Pancake Accounts" để thêm.`,
                'warning'
            );
        }
    }

    function _is24HourPolicyError(result) {
        const errorCode = result?.error?.code || result?.error_code;
        const subCode = result?.error?.error_subcode || result?.error_subcode;
        return errorCode === 10 || subCode === 2018278 ||
            (result?.error?.message || '').includes('24');
    }

    function _isUserUnavailableError(result) {
        const errorCode = result?.error?.code || result?.error_code;
        return errorCode === 551 ||
            (result?.error?.message || '').includes('not available');
    }

    async function _sendViaFacebookTag(order, messageContent, channelId, psid) {
        // Get page token from multiple sources
        let pageToken = null;

        if (window.currentCRMTeam?.Facebook_PageToken &&
            window.currentCRMTeam?.Facebook_PageId === channelId) {
            pageToken = window.currentCRMTeam.Facebook_PageToken;
        }
        if (!pageToken && window.currentOrder?.CRMTeam?.Facebook_PageToken) {
            pageToken = window.currentOrder.CRMTeam.Facebook_PageToken;
        }
        if (!pageToken && window.cachedChannelsData) {
            const ch = window.cachedChannelsData.find(c => c.channelId === channelId);
            if (ch) pageToken = ch.pageToken;
        }
        if (!pageToken) throw new Error('Không tìm thấy Facebook Page Token');

        const url = window.API_CONFIG ? window.API_CONFIG.buildUrl.facebookSend() : null;
        if (!url) throw new Error('API_CONFIG.buildUrl.facebookSend not available');

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pageId: channelId,
                psid: psid,
                message: messageContent,
                pageToken: pageToken,
                useTag: true,
                imageUrls: [],
                postId: order.Facebook_PostId || '',
                customerName: order.customerName || ''
            })
        });
        return await response.json();
    }

    async function _processSingleOrder(order, template, account, sendingState) {
        const pdm = window.pancakeDataManager;
        if (!pdm) throw new Error('pancakeDataManager not available');

        console.log('[TemplateMgr] Processing order:', order.orderId, order.Code, {
            channelId: order.channelId, pageId: order.pageId, psid: order.psid,
            customerName: order.customerName
        });

        // 1. Get full order data if needed
        let orderData;
        const templateContent = template.Content || template.BodyPlain || template.content || '';
        if (_needsFullData(templateContent)) {
            // OrderStore only has list-level data (no Details/line items).
            // Fetch full order with $expand=Details via getOrderDetails API.
            let fullOrder = null;
            if (window.getOrderDetails) {
                try {
                    fullOrder = await window.getOrderDetails(order.orderId);
                } catch (e) {
                    console.warn('[TemplateMgr] getOrderDetails failed:', e.message);
                }
            }
            // Fallback to OrderStore if API failed
            if (!fullOrder || !fullOrder.Details?.length) {
                const storeOrder = window.OrderStore ? window.OrderStore.get(order.orderId) : null;
                if (storeOrder?.Details?.length) fullOrder = storeOrder;
            }
            orderData = fullOrder ? _convertOrderData(fullOrder) : {
                code: order.Code || '', customerName: order.customerName || '',
                phone: order.Phone || '', address: order.Address || '',
                totalAmount: order.AmountTotal || 0, products: []
            };
        } else {
            orderData = {
                code: order.Code || '', customerName: order.customerName || '',
                phone: order.Phone || '', address: order.Address || '',
                totalAmount: order.AmountTotal || 0, products: []
            };
        }

        // 2. Replace placeholders
        let messageContent = _replacePlaceholders(templateContent, orderData);

        // 4. Get chat info
        const channelId = order.channelId || order.pageId;
        const psid = order.psid;
        if (!channelId || !psid) {
            console.error('[TemplateMgr] ❌ Missing chat info:', { channelId, psid, orderId: order.orderId });
            throw new Error(`Thiếu thông tin chat (channelId=${channelId || 'N/A'}, psid=${psid || 'N/A'})`);
        }

        // 5. Find conversation
        let conv = pdm.inboxMapByPSID?.get(String(psid));

        // If not found in inbox, try fetching conversations for this customer
        if (!conv) {
            console.warn('[TemplateMgr] ⚠️ Conversation not in inboxMapByPSID for psid:', psid, '- trying fetch...');
            try {
                if (pdm.fetchConversationsByCustomerFbId) {
                    await pdm.fetchConversationsByCustomerFbId(channelId, psid);
                    conv = pdm.inboxMapByPSID?.get(String(psid));
                }
            } catch (e) {
                console.warn('[TemplateMgr] fetchConversationsByCustomerFbId failed:', e.message);
            }
        }

        if (!conv) {
            console.error('[TemplateMgr] ❌ No conversation found for psid:', psid, 'in page:', channelId);
            console.log('[TemplateMgr] inboxMapByPSID size:', pdm.inboxMapByPSID?.size || 0);
            throw new Error('Không tìm thấy cuộc hội thoại INBOX cho psid: ' + psid);
        }

        console.log('[TemplateMgr] ✅ Found conversation:', conv.id, 'for psid:', psid);

        // 6. Split message if too long
        const parts = _splitMessageIntoParts(messageContent);

        // 7. Send via Pancake API
        let sendSuccess = false;
        let lastError = null;
        // Lazily fetched: messages data to enrich conv with thread_id + global_id for extension
        let _extConvData = null;

        for (const part of parts) {
            // [Primary] Pancake Official API
            try {
                const result = await pdm.sendMessage(channelId, conv.id, { action: 'reply_inbox', message: part });
                // sendMessage returns { success, error } instead of throwing
                if (result && result.success !== false && !result.error) {
                    sendSuccess = true;
                    console.log('[TemplateMgr] ✅ Message sent via Pancake API');
                    continue;
                }
                // API returned error — Pancake uses flat { message, e_code, e_subcode } format
                const errMsg = result?.error?.message || result?.message || result?.error || 'Pancake API error';
                const is24h = result?.e_code === 10 || result?.e_subcode === 2018278 || (errMsg || '').includes('khoảng thời gian cho phép');
                console.warn('[TemplateMgr] Pancake API error:', errMsg, is24h ? '(24h policy)' : '', result);
                lastError = new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
                lastError.is24HourError = is24h;
            } catch (apiErr) {
                console.warn('[TemplateMgr] Pancake API exception:', apiErr.message);
                lastError = apiErr;
            }

            // [Fallback 1] Extension Bypass → queue for background (don't block main loop)
            // Queue ALL failed orders for extension (not just 24h — user: "bị lỗi gì cứ đưa vào queue")
            if (lastError && window.sendViaExtension && window.pancakeExtension?.connected) {
                // Lazily build ext conv data (fetch messages for thread_id & global_id)
                if (!_extConvData) {
                    const raw = { from_psid: psid };
                    try {
                        const msgData = await pdm.fetchMessages(channelId, conv.id);
                        if (msgData.conversation) {
                            const mc = msgData.conversation;
                            if (mc.thread_id) raw.thread_id = mc.thread_id;
                            if (mc.page_customer) raw.page_customer = mc.page_customer;
                        }
                        if (!raw.thread_id && conv.thread_id) raw.thread_id = conv.thread_id;
                        if (!raw.page_customer?.global_id && conv.page_customer?.global_id) {
                            if (!raw.page_customer) raw.page_customer = {};
                            raw.page_customer.global_id = conv.page_customer.global_id;
                        }
                        _extConvData = {
                            pageId: channelId, psid, conversationId: conv.id, _raw: raw,
                            customers: msgData.customers || [],
                            _messagesData: { customers: msgData.customers || [] },
                            updated_at: conv.updated_at || null,
                            customerName: order.customerName || conv.from?.name || '',
                            type: conv.type || 'INBOX', from: conv.from || null,
                        };
                    } catch (e) {
                        console.warn('[TemplateMgr] Messages fetch for extension data failed:', e.message);
                        _extConvData = {
                            pageId: channelId, psid, conversationId: conv.id, _raw: raw,
                            customers: [], _messagesData: { customers: [] },
                            updated_at: conv.updated_at || null,
                            customerName: order.customerName || conv.from?.name || '',
                            type: conv.type || 'INBOX', from: conv.from || null,
                        };
                    }
                    console.log('[TemplateMgr] Extension conv data:', {
                        thread_id: _extConvData._raw.thread_id || null,
                        global_id: _extConvData._raw.page_customer?.global_id || null,
                    });
                }
                // Queue ALL remaining parts for background extension processing
                const partIndex = parts.indexOf(part);
                sendingState.extQueue.push({
                    order, parts: parts.slice(partIndex), convData: _extConvData
                });
                sendSuccess = true; // tentatively mark success (extension will confirm later)
                console.log('[TemplateMgr] 📋 Queued for extension bypass:', order.Code, `(${parts.length - partIndex} parts)`);
                break; // exit parts loop — all remaining parts handled by extension queue
            }

            // [Fallback 2] Facebook Tag
            try {
                const tagResult = await _sendViaFacebookTag(order, part, channelId, psid);
                if (tagResult.success) {
                    sendSuccess = true;
                    lastError = null;
                    order._usedTag = tagResult.used_tag;
                    console.log('[TemplateMgr] ✅ Message sent via Facebook Tag:', tagResult.used_tag);
                    continue;
                }
                console.warn('[TemplateMgr] Facebook Tag failed:', tagResult.error || tagResult);
            } catch (tagErr) {
                console.warn('[TemplateMgr] Facebook Tag exception:', tagErr.message);
                lastError = tagErr;
            }

            // All fallbacks failed for this part
            if (lastError) throw lastError;
        }

        if (!sendSuccess && lastError) throw lastError;

        // 8. Track success
        return {
            Id: order.orderId,
            code: order.Code || '',
            customerName: order.customerName || '',
            account: account?.name || 'default',
            usedTag: order._usedTag || null
        };
    }

    async function _processAccountQueue(orders, account, template, delay, sendingState) {
        const CONCURRENCY = 3;
        const pending = new Set();

        for (const order of orders) {
            if (!sendingState.isSending) break;

            const task = (async () => {
                try {
                    const result = await _processSingleOrder(order, template, account, sendingState);
                    sendingState.successOrders.push(result);
                    markOrderSent(order.orderId, false);
                } catch (error) {
                    console.error('[TemplateMgr] ❌ Order failed:', order.Code, '-', error.message);

                    // Try extension bypass for ANY error (user: "bị lỗi gì cứ đưa vào queue extension")
                    if (window.sendViaExtension && window.pancakeExtension?.connected && order.psid && order.channelId) {
                        try {
                            const pdm = window.pancakeDataManager;
                            const raw = { from_psid: order.psid };
                            let extConvData;
                            // Try to fetch thread_id/global_id for extension
                            const conv = pdm?.inboxMapByPSID?.get(String(order.psid));
                            if (conv && pdm?.fetchMessages) {
                                try {
                                    const msgData = await pdm.fetchMessages(order.channelId, conv.id);
                                    if (msgData.conversation) {
                                        if (msgData.conversation.thread_id) raw.thread_id = msgData.conversation.thread_id;
                                        if (msgData.conversation.page_customer) raw.page_customer = msgData.conversation.page_customer;
                                    }
                                    extConvData = {
                                        pageId: order.channelId, psid: order.psid, conversationId: conv.id, _raw: raw,
                                        customers: msgData.customers || [], _messagesData: { customers: msgData.customers || [] },
                                        updated_at: conv.updated_at || null, customerName: order.customerName || '',
                                        type: conv.type || 'INBOX', from: conv.from || null,
                                    };
                                } catch (e) { /* fallback below */ }
                            }
                            if (!extConvData) {
                                extConvData = {
                                    pageId: order.channelId, psid: order.psid, conversationId: conv?.id || '', _raw: raw,
                                    customers: [], _messagesData: { customers: [] },
                                    updated_at: null, customerName: order.customerName || '',
                                    type: 'INBOX', from: null,
                                };
                            }

                            // Build message content for extension queue
                            const tplContent = template.Content || template.BodyPlain || template.content || '';
                            let msgContent = _replacePlaceholders(tplContent, {
                                code: order.Code || '', customerName: order.customerName || '',
                                phone: order.Phone || '', address: order.Address || '',
                                totalAmount: order.AmountTotal || 0, products: []
                            });
                            const parts = _splitMessageIntoParts(msgContent);

                            sendingState.extQueue.push({ order, parts, convData: extConvData });
                            sendingState.successOrders.push({
                                Id: order.orderId, code: order.Code || '',
                                customerName: order.customerName || '',
                                account: account?.name || 'default', usedTag: null
                            });
                            console.log('[TemplateMgr] 📋 Error → queued for extension:', order.Code, '-', error.message);
                        } catch (extBuildErr) {
                            console.warn('[TemplateMgr] Extension queue build failed:', extBuildErr.message);
                            sendingState.errorOrders.push({
                                orderId: order.orderId, code: order.Code || '',
                                customerName: order.customerName || '',
                                error: error.message || 'Lỗi không xác định',
                                is24HourError: false,
                                Facebook_PostId: order.Facebook_PostId || '',
                                Facebook_CommentId: order.Facebook_CommentId || ''
                            });
                            markOrderFailed(order.orderId, error.message);
                        }
                    } else {
                        sendingState.errorOrders.push({
                            orderId: order.orderId, code: order.Code || '',
                            customerName: order.customerName || '',
                            error: error.message || 'Lỗi không xác định',
                            is24HourError: error.is24HourError || (error.message || '').includes('24'),
                            Facebook_PostId: order.Facebook_PostId || '',
                            Facebook_CommentId: order.Facebook_CommentId || ''
                        });
                        markOrderFailed(order.orderId, error.message);
                    }
                }

                sendingState.totalProcessed++;
                if (typeof sendingState.onProgress === 'function') {
                    sendingState.onProgress(
                        sendingState.totalProcessed,
                        sendingState.totalToProcess,
                        sendingState.totalToProcess,
                        sendingState.successOrders.length,
                        sendingState.errorOrders.length
                    );
                }
            })();

            pending.add(task);
            task.finally(() => pending.delete(task));

            // Wait if pool is full (max CONCURRENCY concurrent tasks)
            if (pending.size >= CONCURRENCY) {
                await Promise.race(pending);
            }

            // Delay between starting new tasks
            if (delay > 0 && sendingState.isSending) {
                await new Promise(r => setTimeout(r, delay * 1000));
            }
        }

        // Wait for remaining tasks to complete
        if (pending.size > 0) {
            await Promise.allSettled([...pending]);
        }
    }

    // =====================================================
    // EXTENSION QUEUE - Background processing (sequential)
    // Extension processes one message at a time, so run after all API sends complete.
    // =====================================================

    async function _processExtensionQueue(sendingState) {
        const queue = sendingState.extQueue || [];
        if (queue.length === 0) return;

        const extTotal = queue.length;
        let extDone = 0;
        console.log(`[TemplateMgr] 🔄 Processing extension queue: ${extTotal} orders`);

        for (const item of queue) {
            if (!sendingState.isSending) break;

            try {
                for (const part of item.parts) {
                    await window.sendViaExtension(part, item.convData);
                }
                console.log('[TemplateMgr] ✅ Extension sent:', item.order.Code);
                markOrderSent(item.order.orderId, false);
            } catch (extErr) {
                console.error('[TemplateMgr] ❌ Extension failed:', item.order.Code, extErr.message);
                // Move from success to error
                const idx = sendingState.successOrders.findIndex(s => s.Id === item.order.orderId);
                if (idx >= 0) sendingState.successOrders.splice(idx, 1);
                sendingState.errorOrders.push({
                    orderId: item.order.orderId,
                    code: item.order.Code || '',
                    customerName: item.order.customerName || '',
                    error: extErr.message || 'Extension gửi thất bại',
                    is24HourError: true,
                    Facebook_PostId: item.order.Facebook_PostId || '',
                    Facebook_CommentId: item.order.Facebook_CommentId || ''
                });
                markOrderFailed(item.order.orderId, extErr.message);
            }

            extDone++;
            sendingState.totalProcessed++;

            // Update progress with extension-specific text
            const progressText = document.getElementById('msgProgressText');
            if (progressText) {
                progressText.textContent = `Extension: ${extDone}/${extTotal} (✓${sendingState.successOrders.length} ✗${sendingState.errorOrders.length})`;
            }
            if (typeof sendingState.onProgress === 'function') {
                sendingState.onProgress(
                    sendingState.totalProcessed, sendingState.totalToProcess, sendingState.totalToProcess,
                    sendingState.successOrders.length, sendingState.errorOrders.length
                );
            }
        }

        console.log(`[TemplateMgr] ✅ Extension queue done: ${extTotal} processed`);
    }

    // =====================================================
    // CAMPAIGN RESULTS SAVING
    // =====================================================

    async function _saveCampaignResults(template, accounts, delay, successOrders, errorOrders) {
        // 1. Save to Firestore
        try {
            if (window.db) {
                await window.db.collection('message_campaigns').add({
                    templateName: template.Name || template.name || '',
                    templateId: template.id || '',
                    templateContent: template.Content || template.BodyPlain || '',
                    totalOrders: successOrders.length + errorOrders.length,
                    successCount: successOrders.length,
                    errorCount: errorOrders.length,
                    successOrders: successOrders,
                    errorOrders: errorOrders,
                    accountsUsed: accounts.map(a => a.name || a.accountId),
                    delay: delay,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    localCreatedAt: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error('[TemplateMgr] Save campaign error:', e);
        }

        // 2. Save to localStorage backup (max 100)
        try {
            const history = JSON.parse(localStorage.getItem('messageSendHistory') || '[]');
            history.unshift({
                templateName: template.Name || template.name || '',
                templateId: template.id || '',
                totalOrders: successOrders.length + errorOrders.length,
                successCount: successOrders.length,
                errorCount: errorOrders.length,
                errorOrders: errorOrders,
                localCreatedAt: new Date().toISOString()
            });
            if (history.length > 100) history.length = 100;
            localStorage.setItem('messageSendHistory', JSON.stringify(history));
        } catch (e) { /* ignore */ }

        // 3. KPI integration
        if (window.kpiManager?.saveAutoBaseSnapshot && successOrders.length > 0) {
            try {
                const campaignName = window.currentCampaignName || '';
                const userId = window.authManager?.getUserInfo()?.uid || '';
                await window.kpiManager.saveAutoBaseSnapshot(successOrders, campaignName, userId);
            } catch (e) { /* ignore */ }
        }
    }

    // =====================================================
    // DEFAULT TEMPLATE SEEDING
    // =====================================================

    async function _seedDefaultTemplates() {
        if (!window.db) return;
        try {
            const batch = window.db.batch();
            const ref = window.db.collection('message_templates');
            const defaults = [
                {
                    Name: 'Chốt đơn',
                    Content: 'Dạ chào chị {partner.name},\n\nEm gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:\n\n{order.details}\n\nĐơn hàng của mình sẽ được gửi về địa chỉ \"{partner.address}\"\n\nChị xác nhận giúp em để em gửi hàng nha ạ! 🙏',
                    order: 1, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                },
                {
                    Name: 'Xác nhận địa chỉ',
                    Content: 'Dạ chị {partner.name} ơi,\n\nEm xác nhận lại địa chỉ nhận hàng của chị là:\n📍 {partner.address}\n\nChị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?',
                    order: 2, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                },
                {
                    Name: 'Thông báo giao hàng',
                    Content: 'Dạ chị {partner.name} ơi,\n\nĐơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.\n\nChị chú ý điện thoại để nhận hàng nha! 📦',
                    order: 3, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                },
                {
                    Name: 'Cảm ơn khách hàng',
                    Content: 'Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️\n\nChị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.\n\nChúc chị một ngày vui vẻ! 😊',
                    order: 4, active: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }
            ];
            defaults.forEach(t => { batch.set(ref.doc(), t); });
            await batch.commit();
            console.log('[TemplateMgr] Seeded 4 default templates');
        } catch (e) {
            console.error('[TemplateMgr] Seed error:', e);
        }
    }

    // =====================================================
    // HISTORY MODAL
    // =====================================================

    let _historyCampaigns = [];

    async function _openHistoryModal() {
        // Load from Firestore
        try {
            if (window.db) {
                const snap = await window.db.collection('message_campaigns')
                    .orderBy('createdAt', 'desc')
                    .limit(50)
                    .get();
                _historyCampaigns = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else {
                _historyCampaigns = JSON.parse(localStorage.getItem('messageSendHistory') || '[]');
            }
        } catch (e) {
            console.warn('[TemplateMgr] Load history error:', e);
            _historyCampaigns = JSON.parse(localStorage.getItem('messageSendHistory') || '[]');
        }
        _renderHistoryModal(_historyCampaigns);
    }

    function _renderHistoryModal(campaigns) {
        let overlay = document.getElementById('messageHistoryModal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'message-modal-overlay';
            overlay.id = 'messageHistoryModal';
            overlay.innerHTML = `
                <div class="message-modal" style="max-width:700px;">
                    <div class="message-modal-header">
                        <h3><i class="fas fa-history"></i> Lịch sử gửi tin nhắn</h3>
                        <button class="message-modal-close" id="msgHistoryCloseBtn">&times;</button>
                    </div>
                    <div class="message-modal-body" id="msgHistoryBody"></div>
                </div>`;
            document.body.appendChild(overlay);

            // Close events
            document.getElementById('msgHistoryCloseBtn').onclick = () => overlay.classList.remove('active');
            overlay.onclick = (e) => {
                if (e.target.classList.contains('message-modal-overlay')) overlay.classList.remove('active');
            };
        }

        const body = document.getElementById('msgHistoryBody');
        if (campaigns.length === 0) {
            body.innerHTML = '<div class="message-no-results"><i class="fas fa-inbox"></i><p>Chưa có lịch sử gửi tin.</p></div>';
        } else {
            body.innerHTML = campaigns.map((c, i) => `
                <div class="msg-history-card">
                    <div class="msg-history-header">
                        <strong>${_escHtml(c.templateName || 'Template')}</strong>
                        <span class="msg-history-time">${c.localCreatedAt ? new Date(c.localCreatedAt).toLocaleString('vi-VN') : ''}</span>
                    </div>
                    <div class="msg-history-stats">
                        <span class="msg-history-success">✓ ${c.successCount || 0} thành công</span>
                        <span class="msg-history-error">✗ ${c.errorCount || 0} thất bại</span>
                        <span class="msg-history-total">Tổng: ${c.totalOrders || 0}</span>
                    </div>
                    ${c.errorCount > 0 ? `
                        <div class="msg-history-actions">
                            <button class="message-send-btn msg-retry-comment-btn" data-campaign-index="${i}">
                                <i class="fas fa-comment"></i> Gửi ${c.errorCount} đơn thất bại qua Comment
                            </button>
                        </div>
                    ` : ''}
                </div>
            `).join('');

            // Bind retry buttons
            body.querySelectorAll('.msg-retry-comment-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(btn.dataset.campaignIndex);
                    _sendFailedOrdersViaComment(idx);
                });
            });
        }

        overlay.classList.add('active');
    }

    async function _sendFailedOrdersViaComment(campaignIndex) {
        const campaign = _historyCampaigns[campaignIndex];
        if (!campaign || !campaign.errorOrders || campaign.errorOrders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Không có đơn thất bại', 'info');
            return;
        }

        const pdm = window.pancakeDataManager;
        if (!pdm) {
            if (window.notificationManager) window.notificationManager.show('pancakeDataManager chưa sẵn sàng', 'error');
            return;
        }

        let successCount = 0, failCount = 0;

        for (const errOrder of campaign.errorOrders) {
            try {
                const psid = errOrder.psid || '';
                const conv = pdm.commentMapByPSID?.get(String(psid));
                if (!conv) {
                    failCount++;
                    continue;
                }

                const pageId = conv.page_id || errOrder.pageId || '';
                // Rebuild message from template
                let msg = campaign.templateContent || '';
                const fullOrder = window.OrderStore ? window.OrderStore.get(errOrder.orderId) : null;
                if (fullOrder) {
                    const od = _convertOrderData(fullOrder);
                    msg = _replacePlaceholders(msg, od);
                }
                await pdm.sendMessage(pageId, conv.id, { message: msg, type: 'reply_comment' });
                successCount++;
                markOrderSent(errOrder.orderId, true);
            } catch (e) {
                failCount++;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (window.notificationManager) {
            window.notificationManager.show(
                `Comment: ${successCount} thành công, ${failCount} thất bại`,
                failCount === 0 ? 'success' : 'warning'
            );
        }
    }

    // =====================================================
    // MESSAGE TEMPLATE MODAL UI
    // =====================================================

    let _selectedTemplateId = null;
    let _filteredTemplates = [];
    let _modalOrders = [];       // Orders to send in current session
    let _modalCreated = false;

    function _escHtml(s) {
        const div = document.createElement('div');
        div.textContent = s || '';
        return div.innerHTML;
    }

    function _formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('vi-VN');
    }

    // ----- Create Modal DOM -----
    function _createModalDOM() {
        if (_modalCreated) return;

        const overlay = document.createElement('div');
        overlay.className = 'message-modal-overlay';
        overlay.id = 'messageTemplateModal';
        overlay.innerHTML = `
            <div class="message-modal">
                <!-- Header -->
                <div class="message-modal-header">
                    <h3><i class="fab fa-facebook-messenger"></i> Gửi tin nhắn Facebook</h3>
                    <button class="message-modal-close" id="msgCloseBtn">&times;</button>
                </div>

                <!-- Search -->
                <div class="message-search-section">
                    <div class="message-search-wrapper">
                        <div class="message-search-input-wrapper">
                            <i class="fas fa-search message-search-icon"></i>
                            <input type="text" class="message-search-input" id="msgSearchInput" placeholder="Tìm kiếm template...">
                            <button class="message-clear-search" id="msgClearSearch">&times;</button>
                        </div>
                        <button class="message-new-template-btn" id="msgNewTemplate">
                            <i class="fas fa-plus"></i> Mẫu mới
                        </button>
                    </div>
                </div>

                <!-- Body -->
                <div class="message-modal-body" id="msgModalBody">
                    <div class="message-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Đang tải templates...</p>
                    </div>
                </div>

                <!-- Footer -->
                <div class="message-modal-footer">
                    <div class="message-footer-info">
                        <span class="message-result-count">
                            <strong id="msgResultCount">0</strong> template
                        </span>
                        <span class="message-setting-item">
                            <i class="fas fa-users"></i> ACCOUNTS
                            <strong id="msgThreadCount">0</strong>
                        </span>
                        <span class="message-setting-item">
                            <i class="fas fa-clock"></i> DELAY
                            <input type="number" id="msgSendDelay" value="1" min="0" max="30"> giây
                        </span>
                        <span class="message-setting-item">
                            <i class="fas fa-plug"></i> API
                            <strong>Pancake</strong>
                        </span>
                        <button class="message-btn-history" id="msgBtnHistory">
                            <i class="fas fa-history"></i> Lịch sử
                        </button>
                    </div>

                    <div class="message-progress-container" id="msgProgressContainer" style="display:none">
                        <div class="message-progress-info">
                            <span id="msgProgressText">Đang gửi...</span>
                            <span id="msgProgressPercent">0%</span>
                        </div>
                        <div class="message-progress-bar-bg">
                            <div class="message-progress-bar" id="msgProgressBar"></div>
                        </div>
                    </div>

                    <div class="message-modal-actions">
                        <button class="message-btn-cancel" id="msgBtnCancel">Hủy</button>
                        <button class="message-btn-send" id="msgBtnSend" disabled>
                            <i class="fas fa-paper-plane"></i> Gửi tin nhắn
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        _modalCreated = true;
        _bindModalEvents();
    }

    // ----- Bind Events -----
    function _bindModalEvents() {
        // Close
        document.getElementById('msgCloseBtn').onclick = () => _closeModal();
        document.getElementById('msgBtnCancel').onclick = () => _closeModal();

        // Click outside
        document.getElementById('messageTemplateModal').onclick = (e) => {
            if (e.target.classList.contains('message-modal-overlay')) _closeModal();
        };

        // Search
        document.getElementById('msgSearchInput').oninput = (e) => {
            _handleSearch(e.target.value);
            document.getElementById('msgClearSearch').classList.toggle('show', e.target.value.length > 0);
        };

        document.getElementById('msgClearSearch').onclick = () => {
            document.getElementById('msgSearchInput').value = '';
            document.getElementById('msgClearSearch').classList.remove('show');
            _handleSearch('');
        };

        // New template
        document.getElementById('msgNewTemplate').onclick = () => _openNewTemplateForm();

        // Send
        document.getElementById('msgBtnSend').onclick = () => _handleSend();

        // History
        document.getElementById('msgBtnHistory').onclick = () => _openHistoryModal();
    }

    // ----- Render Template Cards -----
    function _renderTemplateCards() {
        const container = document.getElementById('msgModalBody');
        const countEl = document.getElementById('msgResultCount');

        if (_filteredTemplates.length === 0) {
            container.innerHTML = `
                <div class="message-no-results">
                    <i class="fas fa-search"></i>
                    <p>Không tìm thấy template nào</p>
                </div>`;
            countEl.textContent = '0';
            return;
        }

        countEl.textContent = _filteredTemplates.length;

        container.innerHTML = `<div class="message-template-list">
            ${_filteredTemplates.map(t => _renderSingleCard(t)).join('')}
        </div>`;

        // Bind click events for cards
        container.querySelectorAll('.message-template-item').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                _selectTemplate(card.dataset.templateId);
            });
        });

        // Bind expand buttons
        container.querySelectorAll('.message-expand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const content = btn.closest('.message-template-item').querySelector('.message-template-content');
                content.classList.toggle('expanded');
                btn.innerHTML = content.classList.contains('expanded')
                    ? '<i class="fas fa-chevron-up"></i> Thu gọn'
                    : '<i class="fas fa-chevron-down"></i> Xem thêm';
            });
        });

        // Bind edit buttons
        container.querySelectorAll('.message-template-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.templateId;
                const template = _templates.find(t => t.id === id);
                if (template) _openNewTemplateForm(template);
            });
        });
    }

    function _renderSingleCard(template) {
        const contentHtml = _escHtml(template.Content || template.BodyPlain || template.content || template.text || '')
            .replace(/\n/g, '<br>')
            .substring(0, 500);

        const dateStr = template.DateCreated ||
            (template.createdAt ? _formatDate(template.createdAt) : '');

        const name = template.Name || template.name || template.title || 'Không tên';
        const typeId = template.TypeId || 'MESSENGER';

        return `
            <div class="message-template-item ${_selectedTemplateId === template.id ? 'selected' : ''}"
                 data-template-id="${template.id}">
                <div class="message-template-header">
                    <div class="message-template-name">${_escHtml(name)}</div>
                    <button class="message-template-edit-btn" data-template-id="${template.id}" title="Sửa template">
                        <i class="fas fa-edit"></i>
                    </button>
                    <span class="message-template-type">${_escHtml(typeId)}</span>
                </div>
                <div class="message-template-content">${contentHtml}</div>
                <div class="message-template-actions">
                    <button class="message-expand-btn">
                        <i class="fas fa-chevron-down"></i> Xem thêm
                    </button>
                    <div class="message-template-meta">
                        <span><i class="fas fa-calendar"></i> ${dateStr}</span>
                    </div>
                </div>
            </div>`;
    }

    // ----- Select Template -----
    function _selectTemplate(templateId) {
        _selectedTemplateId = templateId;

        document.querySelectorAll('.message-template-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.templateId === templateId);
        });

        document.getElementById('msgBtnSend').disabled = false;
    }

    // ----- Search -----
    function _handleSearch(query) {
        const q = (query || '').toLowerCase().trim();

        if (!q) {
            _filteredTemplates = [..._templates];
        } else {
            _filteredTemplates = _templates.filter(t => {
                const name = (t.Name || t.name || t.title || '').toLowerCase();
                const content = (t.Content || t.BodyPlain || t.content || t.text || '').toLowerCase();
                const type = (t.TypeId || '').toLowerCase();
                return name.includes(q) || content.includes(q) || type.includes(q);
            });
        }

        _renderTemplateCards();
    }

    // ----- New/Edit Template Form -----
    function _openNewTemplateForm(templateToEdit) {
        const isEdit = !!templateToEdit;
        const container = document.getElementById('msgModalBody');

        const nameValue = isEdit ? _escHtml(templateToEdit.Name || templateToEdit.name || templateToEdit.title || '') : '';
        const contentValue = isEdit ? _escHtml(templateToEdit.Content || templateToEdit.BodyPlain || templateToEdit.content || templateToEdit.text || '') : '';

        container.innerHTML = `
            <div class="message-template-form">
                <h4>${isEdit ? 'Sửa' : 'Tạo'} Template</h4>
                <div class="message-form-group">
                    <label>Tên template</label>
                    <input type="text" id="msgTemplateNameInput" value="${nameValue}" placeholder="VD: Chốt đơn">
                </div>
                <div class="message-form-group">
                    <label>Nội dung</label>
                    <textarea id="msgTemplateContentInput" rows="8"
                        placeholder="VD: Dạ chào chị {partner.name}...">${contentValue}</textarea>
                    <p class="message-form-hint">
                        Placeholders: {partner.name}, {partner.address}, {order.code}, {order.phone}, {order.totalAmount}, {order.details}
                    </p>
                </div>
                <div class="message-form-actions">
                    ${isEdit ? `<button class="message-form-delete-btn" id="msgTemplateDeleteBtn">
                        <i class="fas fa-trash"></i> Xóa
                    </button>` : ''}
                    <button class="message-btn-cancel" id="msgTemplateCancelBtn">Hủy</button>
                    <button class="message-btn-send" id="msgTemplateSaveBtn">
                        <i class="fas fa-save"></i> Lưu
                    </button>
                </div>
            </div>
        `;

        // Bind form events
        document.getElementById('msgTemplateCancelBtn').onclick = () => {
            _filteredTemplates = [..._templates];
            _renderTemplateCards();
        };

        document.getElementById('msgTemplateSaveBtn').onclick = async () => {
            const name = document.getElementById('msgTemplateNameInput').value.trim();
            const content = document.getElementById('msgTemplateContentInput').value.trim();

            if (!name || !content) {
                if (window.notificationManager) window.notificationManager.show('Vui lòng nhập tên và nội dung template!', 'warning');
                return;
            }

            const data = {
                Name: name,
                Content: content,
                TypeId: 'MESSENGER',
                active: true
            };

            if (isEdit && templateToEdit.id) {
                data.id = templateToEdit.id;
            } else {
                data.order = _templates.length + 1;
                data.DateCreated = new Date().toLocaleDateString('vi-VN');
            }

            await saveTemplate(data);
            _filteredTemplates = [..._templates];
            _renderTemplateCards();
            if (window.notificationManager) window.notificationManager.show('Đã lưu template', 'success');
        };

        if (isEdit) {
            const deleteBtn = document.getElementById('msgTemplateDeleteBtn');
            if (deleteBtn) {
                deleteBtn.onclick = async () => {
                    if (!confirm('Bạn có chắc muốn xóa template này?')) return;
                    await deleteTemplate(templateToEdit.id);
                    _filteredTemplates = [..._templates];
                    _renderTemplateCards();
                    if (window.notificationManager) window.notificationManager.show('Đã xóa template', 'success');
                };
            }
        }
    }

    // ----- Open Modal -----
    function openMessageTemplateModal() {
        const selectedIds = window.selectedOrderIds;
        if (!selectedIds || selectedIds.size === 0) {
            if (window.notificationManager) window.notificationManager.show('Chưa chọn đơn hàng nào', 'warning');
            return;
        }

        // Gather enriched order data from OrderStore + table rows
        const allOrders = [];
        let filteredCount = 0;
        selectedIds.forEach(orderId => {
            // Skip orders already sent in 24h
            if (isOrderSent(orderId)) {
                filteredCount++;
                return;
            }

            // Get data from DOM row (if visible) and/or OrderStore
            const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
            const storeOrder = window.OrderStore ? window.OrderStore.get(orderId) : null;
            const pdm = window.pancakeDataManager;

            // Skip if neither row nor store data exists
            if (!row && !storeOrder) return;

            let pageId = row?.dataset?.pageId || '';
            let psid = row?.dataset?.psid || '';

            // Try getChatInfoForOrder for better data
            if (storeOrder && pdm?.getChatInfoForOrder) {
                try {
                    const chatInfo = pdm.getChatInfoForOrder(storeOrder);
                    if (chatInfo.channelId) pageId = chatInfo.channelId;
                    if (chatInfo.psid) psid = chatInfo.psid;
                } catch (e) { /* use row data */ }
            }

            // Additional fallbacks from storeOrder
            if (!psid && storeOrder?.Facebook_ASUserId) psid = storeOrder.Facebook_ASUserId;
            if (!pageId && storeOrder?.Facebook_PostId) pageId = storeOrder.Facebook_PostId.split('_')[0];

            // Skip orders where psid = pageId (page messaging itself — no real customer)
            if (psid && pageId && psid === pageId) {
                console.warn(`[TemplateMgr] ⚠️ Skipping order ${storeOrder?.Code || orderId}: psid === pageId (${psid}) — không có PSID khách hàng`);
                filteredCount++;
                return;
            }

            allOrders.push({
                orderId,
                pageId,
                channelId: pageId,
                psid,
                customerName: storeOrder?.PartnerName || storeOrder?.CustomerName || row?.querySelector('.customer-name')?.textContent?.trim() || '',
                Code: storeOrder?.Code || '',
                Phone: storeOrder?.ReceiverPhone || storeOrder?.Partner?.Telephone || '',
                Address: storeOrder?.ReceiverAddress || storeOrder?.Partner?.Address || '',
                AmountTotal: storeOrder?.AmountTotal || 0,
                Facebook_PostId: storeOrder?.Facebook_PostId || '',
                Facebook_CommentId: storeOrder?.Facebook_CommentId || '',
                raw: storeOrder || null
            });
        });

        if (filteredCount > 0 && window.notificationManager) {
            window.notificationManager.show(`Đã bỏ qua ${filteredCount} đơn (đã gửi hoặc thiếu PSID khách hàng)`, 'info');
        }

        if (allOrders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Không tìm thấy thông tin đơn hàng (hoặc đã gửi hết)', 'error');
            return;
        }

        _modalOrders = allOrders;

        // Debug: log order data for troubleshooting
        console.log('[TemplateMgr] Modal orders prepared:', allOrders.length);
        allOrders.forEach((o, i) => {
            console.log(`[TemplateMgr] Order ${i + 1}:`, {
                orderId: o.orderId, Code: o.Code,
                pageId: o.pageId, channelId: o.channelId,
                psid: o.psid, customerName: o.customerName
            });
        });

        // Create modal DOM if needed
        _createModalDOM();

        // Reset state
        _selectedTemplateId = null;
        document.getElementById('msgBtnSend').disabled = true;
        document.getElementById('msgSearchInput').value = '';
        document.getElementById('msgClearSearch').classList.remove('show');
        document.getElementById('msgProgressContainer').style.display = 'none';
        document.getElementById('msgBtnCancel').disabled = false;

        // Show loading
        document.getElementById('msgModalBody').innerHTML = `
            <div class="message-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Đang tải templates...</p>
            </div>`;

        // Show modal
        document.getElementById('messageTemplateModal').classList.add('active');

        // Update account count
        if (window.pancakeTokenManager) {
            try {
                const accounts = window.pancakeTokenManager.getValidAccountsForSending();
                document.getElementById('msgThreadCount').textContent = accounts.length;
            } catch (e) {
                document.getElementById('msgThreadCount').textContent = '0';
            }
        }

        // Load templates and render
        loadTemplates().then(() => {
            _filteredTemplates = [..._templates];
            _renderTemplateCards();
        });
    }

    // ----- Handle Send -----
    async function _handleSend() {
        if (!_selectedTemplateId) {
            if (window.notificationManager) window.notificationManager.show('Chọn một template trước', 'warning');
            return;
        }

        const template = _templates.find(t => t.id === _selectedTemplateId);
        if (!template) return;

        const orders = _modalOrders;
        if (!orders || orders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Không có đơn hàng nào để gửi!', 'warning');
            return;
        }

        const templateText = template.Content || template.BodyPlain || template.content || template.text || '';
        if (!templateText) {
            if (window.notificationManager) window.notificationManager.show('Template không có nội dung', 'warning');
            return;
        }

        // Get accounts
        let accounts = [];
        if (window.pancakeTokenManager) {
            try {
                accounts = window.pancakeTokenManager.getValidAccountsForSending();
            } catch (e) { /* fallback to empty */ }
        }
        if (accounts.length === 0) {
            accounts = [{ accountId: 'default', name: 'Default' }];
        }

        // Get delay
        const delay = parseInt(document.getElementById('msgSendDelay').value) || 1;

        // Disable UI
        const sendBtn = document.getElementById('msgBtnSend');
        const cancelBtn = document.getElementById('msgBtnCancel');
        const progressContainer = document.getElementById('msgProgressContainer');

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        cancelBtn.disabled = true;
        progressContainer.style.display = 'block';
        _updateProgress(0, 0, orders.length);

        // Sending state
        const sendingState = {
            isSending: true,
            successOrders: [],
            errorOrders: [],
            extQueue: [],           // Extension bypass queue (processed after all API sends)
            totalProcessed: 0,
            totalToProcess: orders.length,
            onProgress: (processed, total, totalToProcess, sent, failed) => {
                _updateProgress(processed, total, totalToProcess, sent, failed);
            }
        };

        try {
            // Pre-fetch page access tokens
            await _prefetchPageAccessTokens(orders);

            // Distribute orders to accounts (page-aware round-robin)
            const accountQueues = _distributeOrdersToAccounts(orders, accounts);

            // Phase 1: Concurrent API sends (up to 3 orders per account in parallel)
            const workers = accounts.map((account, idx) =>
                _processAccountQueue(accountQueues[idx] || [], account, template, delay, sendingState)
            );
            await Promise.all(workers);

            // Phase 2: Extension bypass queue (sequential — extension processes one at a time)
            if (sendingState.extQueue.length > 0) {
                const extCount = sendingState.extQueue.length;
                console.log(`[TemplateMgr] 📋 Extension queue: ${extCount} orders pending`);

                // Adjust progress: subtract ext-queued orders so bar reflects real completion
                sendingState.totalProcessed = Math.max(0, sendingState.totalProcessed - extCount);
                _updateProgress(
                    sendingState.totalProcessed, sendingState.totalToProcess, sendingState.totalToProcess,
                    sendingState.successOrders.length - extCount, sendingState.errorOrders.length
                );
                document.getElementById('msgProgressText').textContent =
                    `Extension: 0/${extCount}...`;
                await _processExtensionQueue(sendingState);
            }
        } catch (error) {
            console.error('[TemplateMgr] Send error:', error);
        }

        // Show completion
        const successCount = sendingState.successOrders.length;
        const errorCount = sendingState.errorOrders.length;
        _updateProgress(successCount + errorCount, orders.length, orders.length, successCount, errorCount);
        document.getElementById('msgProgressText').textContent =
            `Hoàn tất: ✓${successCount} ✗${errorCount}`;

        // Save campaign results
        sendingState.isSending = false;
        await _saveCampaignResults(template, accounts, delay, sendingState.successOrders, sendingState.errorOrders);

        // Re-enable UI
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
        cancelBtn.disabled = false;

        // Notification
        if (window.notificationManager) {
            window.notificationManager.show(
                `Đã gửi ${successCount}/${orders.length} tin nhắn` + (errorCount > 0 ? `, ${errorCount} lỗi` : ''),
                errorCount > 0 ? 'warning' : 'success'
            );
        }

        // Hide progress after 3s and close modal
        setTimeout(() => {
            progressContainer.style.display = 'none';
            _closeModal();
        }, 3000);
    }

    function _updateProgress(processed, total, totalToProcess, sent, failed) {
        const percent = totalToProcess > 0 ? Math.round((processed / totalToProcess) * 100) : 0;
        const progressText = document.getElementById('msgProgressText');
        const progressPercent = document.getElementById('msgProgressPercent');
        const progressBar = document.getElementById('msgProgressBar');

        if (progressText) {
            if (sent !== undefined) {
                progressText.textContent = `Đang gửi... ${processed}/${totalToProcess} (✓${sent} ✗${failed || 0})`;
            } else {
                progressText.textContent = `Đang gửi... ${processed}/${totalToProcess}`;
            }
        }
        if (progressPercent) progressPercent.textContent = `${percent}%`;
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    // ----- Close Modal -----
    function _closeModal() {
        const modal = document.getElementById('messageTemplateModal');
        if (modal) modal.classList.remove('active');
        _selectedTemplateId = null;
    }

    // =====================================================
    // EXPOSE GLOBALLY
    // =====================================================

    window.openMessageTemplateModal = openMessageTemplateModal;

    window.messageTemplateManager = {
        // Status checks (used by tab1-table.js)
        isOrderSent,
        isOrderSentViaComment,
        isOrderFailed,

        // Mark methods
        markOrderSent,
        markOrderFailed,
        clearOrderStatus,

        // Quick reply
        openQuickCommentReply,

        // Bulk send
        bulkSendTemplate,

        // Templates CRUD
        loadTemplates,
        saveTemplate,
        deleteTemplate,
        getTemplates,

        // Data access
        getSentOrders: () => new Map(_sentOrders),
        getFailedOrders: () => new Map(_failedOrders),

        // History & retry
        openHistoryModal: _openHistoryModal,
        sendFailedOrdersViaComment: _sendFailedOrdersViaComment,

        // Cleanup
        cleanup,
    };

})();

console.log('[TemplateMgr] Loaded.');
