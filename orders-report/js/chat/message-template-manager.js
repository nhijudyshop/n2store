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
    // MESSAGE TEMPLATE MODAL UI
    // =====================================================

    /**
     * Open the message template modal for bulk sending to selected orders.
     * Called from "Gửi tin nhắn" button in action bar.
     */
    function openMessageTemplateModal() {
        const selectedIds = window.selectedOrderIds;
        if (!selectedIds || selectedIds.size === 0) {
            if (window.notificationManager) window.notificationManager.show('Chưa chọn đơn hàng nào', 'warning');
            return;
        }

        // Gather order data from table rows
        const orders = [];
        selectedIds.forEach(orderId => {
            const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
            if (!row) return;
            orders.push({
                orderId,
                pageId: row.dataset.pageId || '',
                psid: row.dataset.psid || '',
                customerName: row.querySelector('.customer-name')?.textContent?.trim() || '',
            });
        });

        if (orders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Không tìm thấy thông tin đơn hàng', 'error');
            return;
        }

        // Create or reuse modal
        let modal = document.getElementById('messageTemplateModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'messageTemplateModal';
            modal.className = 'chat-modal-overlay';
            document.body.appendChild(modal);
        }

        // Load templates and render
        loadTemplates().then(templates => {
            const templateOptions = templates.map((t, i) =>
                `<div class="tpl-option" data-idx="${i}" onclick="window._selectTemplate(${i})">
                    <strong>${_escHtml(t.name || t.title || 'Mẫu ' + (i+1))}</strong>
                    <p>${_escHtml((t.content || t.text || '').substring(0, 80))}${(t.content || t.text || '').length > 80 ? '...' : ''}</p>
                </div>`
            ).join('');

            modal.innerHTML = `
                <div class="chat-modal-content" style="max-width:520px;max-height:80vh;">
                    <div class="chat-modal-header">
                        <div class="chat-header-info">
                            <span class="customer-name">Gửi tin nhắn (${orders.length} đơn)</span>
                        </div>
                        <div class="chat-header-controls">
                            <button class="close-btn" onclick="document.getElementById('messageTemplateModal').style.display='none'">&times;</button>
                        </div>
                    </div>
                    <div style="padding:16px;overflow-y:auto;flex:1;">
                        <label style="font-weight:600;font-size:13px;margin-bottom:8px;display:block;">Chọn mẫu tin nhắn:</label>
                        <div id="tplOptionsList" style="max-height:180px;overflow-y:auto;margin-bottom:12px;border:1px solid #e5e7eb;border-radius:8px;">
                            ${templateOptions || '<div style="padding:12px;color:#9ca3af;text-align:center;">Chưa có mẫu tin nhắn. Nhập nội dung bên dưới.</div>'}
                        </div>
                        <label style="font-weight:600;font-size:13px;margin-bottom:6px;display:block;">Nội dung tin nhắn:</label>
                        <textarea id="tplMessageText" rows="4" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;resize:vertical;font-family:inherit;" placeholder="Nhập nội dung... Biến: {customerName}, {orderId}"></textarea>
                        <div style="margin-top:8px;font-size:11px;color:#9ca3af;">
                            Biến hỗ trợ: <code>{customerName}</code>, <code>{orderId}</code>, <code>{phone}</code>, <code>{total}</code>, <code>{products}</code>
                        </div>
                        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                            <label style="display:flex;align-items:center;gap:4px;font-size:12px;margin-right:auto;color:#6b7280;">
                                <input type="checkbox" id="tplViaComment"> Gửi qua Comment
                            </label>
                            <button onclick="document.getElementById('messageTemplateModal').style.display='none'"
                                style="padding:8px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">Hủy</button>
                            <button id="tplSendBtn" onclick="window._startBulkSend()"
                                style="padding:8px 20px;border:none;border-radius:6px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;cursor:pointer;font-weight:600;font-size:13px;">
                                Gửi (${orders.length})
                            </button>
                        </div>
                        <div id="tplSendProgress" style="display:none;margin-top:12px;padding:10px;background:#f3f4f6;border-radius:8px;font-size:12px;">
                        </div>
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

            // Store orders for send
            window._tplBulkOrders = orders;
        });
    }

    function _escHtml(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // Template selection handler
    window._selectTemplate = function(idx) {
        const templates = getTemplates();
        if (!templates[idx]) return;
        const textarea = document.getElementById('tplMessageText');
        if (textarea) textarea.value = templates[idx].content || templates[idx].text || '';
        // Highlight selected
        document.querySelectorAll('#tplOptionsList .tpl-option').forEach((el, i) => {
            el.style.background = i === idx ? '#eef2ff' : '';
            el.style.borderLeft = i === idx ? '3px solid #667eea' : '3px solid transparent';
        });
    };

    // Bulk send handler
    window._startBulkSend = async function() {
        const textarea = document.getElementById('tplMessageText');
        const text = textarea?.value?.trim();
        if (!text) {
            if (window.notificationManager) window.notificationManager.show('Nhập nội dung tin nhắn', 'warning');
            return;
        }

        const orders = window._tplBulkOrders || [];
        if (!orders.length) return;

        const viaComment = document.getElementById('tplViaComment')?.checked || false;
        const sendBtn = document.getElementById('tplSendBtn');
        const progressEl = document.getElementById('tplSendProgress');

        if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Đang gửi...'; }
        if (progressEl) { progressEl.style.display = 'block'; progressEl.textContent = 'Bắt đầu gửi...'; }

        const result = await bulkSendTemplate(orders, text, {
            viaComment,
            onProgress: (sent, failed, total) => {
                if (progressEl) {
                    progressEl.innerHTML = `Đã gửi: <strong>${sent}</strong>/${total} | Lỗi: <strong style="color:#ef4444">${failed}</strong>`;
                }
            }
        });

        if (progressEl) {
            progressEl.innerHTML = `<strong>Hoàn tất:</strong> Gửi thành công ${result.sent}/${orders.length}` +
                (result.failed > 0 ? ` | Lỗi: <strong style="color:#ef4444">${result.failed}</strong>` : '');
        }

        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = `Gửi (${orders.length})`; }

        // Refresh table badges after 1s
        setTimeout(() => {
            if (window.notificationManager) {
                window.notificationManager.show(
                    `Đã gửi ${result.sent}/${orders.length} tin nhắn` + (result.failed > 0 ? `, ${result.failed} lỗi` : ''),
                    result.failed > 0 ? 'warning' : 'success'
                );
            }
        }, 500);
    };

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

        // Cleanup
        cleanup,
    };

})();

console.log('[TemplateMgr] Loaded.');
