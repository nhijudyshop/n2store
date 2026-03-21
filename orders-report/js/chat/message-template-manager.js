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
                if (window.notificationManager) {
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
    // EXPOSE GLOBALLY
    // =====================================================

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

        // Cleanup
        cleanup,
    };

})();

console.log('[TemplateMgr] Loaded.');
