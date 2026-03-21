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
    // MODAL UI
    // =====================================================

    let _modalCreated = false;
    let _selectedTemplate = null;
    let _selectedOrders = [];
    let _isSending = false;

    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function _createModalDOM() {
        if (_modalCreated) return;
        _modalCreated = true;

        const html = `
        <div class="msg-tpl-overlay" id="msgTplOverlay">
            <div class="msg-tpl-modal">
                <div class="msg-tpl-header">
                    <h3><i class="fab fa-facebook-messenger"></i> Gửi tin nhắn Facebook</h3>
                    <button class="msg-tpl-close" id="msgTplClose"><i class="fas fa-times"></i></button>
                </div>
                <div class="msg-tpl-search">
                    <div class="msg-tpl-search-wrap">
                        <i class="fas fa-search msg-tpl-search-icon"></i>
                        <input type="text" id="msgTplSearchInput" placeholder="Tìm kiếm template..." autocomplete="off" />
                    </div>
                    <button class="msg-tpl-btn-new" id="msgTplNewBtn"><i class="fas fa-plus"></i> Mẫu mới</button>
                </div>
                <div class="msg-tpl-body" id="msgTplBody">
                    <div class="msg-tpl-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang tải template...</p></div>
                </div>
                <div class="msg-tpl-footer">
                    <div class="msg-tpl-footer-row">
                        <div class="msg-tpl-info" id="msgTplInfo"><strong>0</strong> template</div>
                        <div class="msg-tpl-settings">
                            <div class="msg-tpl-settings-item">
                                <div class="icon purple"><i class="fas fa-users"></i></div>
                                <div><label>Accounts</label><div class="value" id="msgTplAccounts">0</div></div>
                            </div>
                            <div class="msg-tpl-settings-divider"></div>
                            <div class="msg-tpl-settings-item">
                                <div class="icon green"><i class="fas fa-clock"></i></div>
                                <div><label>Delay</label><div style="display:flex;align-items:baseline;gap:2px"><input type="number" id="msgTplDelay" value="1" min="0" step="0.5" style="width:35px;border:none;background:transparent;font-size:14px;font-weight:700;color:#1e293b;padding:0"><span style="font-size:12px;color:#64748b">giây</span></div></div>
                            </div>
                        </div>
                    </div>
                    <div class="msg-tpl-progress" id="msgTplProgress">
                        <div class="msg-tpl-progress-header">
                            <span class="msg-tpl-progress-text" id="msgTplProgressText">Đang gửi...</span>
                            <span class="msg-tpl-progress-pct" id="msgTplProgressPct">0%</span>
                        </div>
                        <div class="msg-tpl-progress-bar"><div class="msg-tpl-progress-fill" id="msgTplProgressFill"></div></div>
                    </div>
                    <div class="msg-tpl-actions">
                        <button class="msg-tpl-btn-cancel" id="msgTplCancelBtn">Hủy</button>
                        <button class="msg-tpl-btn-send" id="msgTplSendBtn" disabled><i class="fas fa-paper-plane"></i> Gửi tin nhắn</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="msg-tpl-editor-overlay" id="msgTplEditorOverlay">
            <div class="msg-tpl-editor">
                <div class="msg-tpl-editor-header">
                    <h4 id="msgTplEditorTitle">Tạo template mới</h4>
                    <button class="msg-tpl-close" id="msgTplEditorClose"><i class="fas fa-times"></i></button>
                </div>
                <div class="msg-tpl-editor-body">
                    <div>
                        <label>Tên template</label>
                        <input type="text" id="msgTplEditorName" placeholder="VD: Xác nhận đơn hàng" />
                    </div>
                    <div>
                        <label>Nội dung</label>
                        <textarea id="msgTplEditorContent" placeholder="Nội dung tin nhắn..."></textarea>
                        <div class="msg-tpl-placeholders">
                            <span onclick="document.getElementById('msgTplEditorContent').value+='{customerName}'">{customerName}</span>
                            <span onclick="document.getElementById('msgTplEditorContent').value+='{orderId}'">{orderId}</span>
                            <span onclick="document.getElementById('msgTplEditorContent').value+='{phone}'">{phone}</span>
                            <span onclick="document.getElementById('msgTplEditorContent').value+='{total}'">{total}</span>
                            <span onclick="document.getElementById('msgTplEditorContent').value+='{products}'">{products}</span>
                        </div>
                    </div>
                </div>
                <div class="msg-tpl-editor-footer">
                    <button class="msg-tpl-btn-cancel" id="msgTplEditorCancelBtn">Hủy</button>
                    <button class="msg-tpl-btn-send" id="msgTplEditorSaveBtn"><i class="fas fa-save"></i> Lưu</button>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        _attachEvents();
    }

    function _attachEvents() {
        // Close modal
        document.getElementById('msgTplClose').addEventListener('click', _closeModal);
        document.getElementById('msgTplCancelBtn').addEventListener('click', _closeModal);
        document.getElementById('msgTplOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'msgTplOverlay') _closeModal();
        });

        // Search
        document.getElementById('msgTplSearchInput').addEventListener('input', (e) => {
            _renderTemplateList(e.target.value.trim().toLowerCase());
        });

        // New template
        document.getElementById('msgTplNewBtn').addEventListener('click', () => _openEditor());

        // Send
        document.getElementById('msgTplSendBtn').addEventListener('click', _handleSend);

        // Editor close
        document.getElementById('msgTplEditorClose').addEventListener('click', _closeEditor);
        document.getElementById('msgTplEditorCancelBtn').addEventListener('click', _closeEditor);
        document.getElementById('msgTplEditorOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'msgTplEditorOverlay') _closeEditor();
        });

        // Editor save
        document.getElementById('msgTplEditorSaveBtn').addEventListener('click', _handleEditorSave);

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (document.getElementById('msgTplEditorOverlay')?.classList.contains('active')) {
                    _closeEditor();
                } else if (document.getElementById('msgTplOverlay')?.classList.contains('active')) {
                    _closeModal();
                }
            }
        });
    }

    // =====================================================
    // COLLECT SELECTED ORDERS FROM TABLE
    // =====================================================

    function _getSelectedOrdersFromTable() {
        const orders = [];
        const allOrders = window.getAllOrders ? window.getAllOrders() : [];
        const checkboxes = document.querySelectorAll('tbody input[type="checkbox"]:checked');

        checkboxes.forEach(cb => {
            const orderId = cb.value;
            const fullOrder = allOrders.find(o => o.Id === orderId);

            if (fullOrder) {
                const pageId = fullOrder.Facebook_PostId ? fullOrder.Facebook_PostId.split('_')[0] : '';
                orders.push({
                    orderId: fullOrder.Id,
                    code: fullOrder.Code,
                    pageId: pageId,
                    psid: fullOrder.Facebook_ASUserId || '',
                    customerName: fullOrder.Partner?.Name || fullOrder.Name || '',
                    phone: fullOrder.Partner?.Telephone || fullOrder.Telephone || '',
                    total: fullOrder.TotalAmount ? Number(fullOrder.TotalAmount).toLocaleString('vi-VN') + 'đ' : '',
                    products: (fullOrder.Details || []).map(d => d.ProductName || d.ProductNameGet || '').filter(Boolean).join(', '),
                });
            } else {
                // Fallback: scrape from DOM
                const row = cb.closest('tr');
                if (row) {
                    orders.push({
                        orderId: orderId,
                        code: '',
                        pageId: row.dataset.pageId || '',
                        psid: row.dataset.psid || '',
                        customerName: row.querySelector('.customer-name')?.textContent?.trim() || '',
                        phone: '',
                        total: '',
                        products: '',
                    });
                }
            }
        });

        return orders;
    }

    // =====================================================
    // OPEN / CLOSE MODAL
    // =====================================================

    async function openMessageTemplateModal() {
        _createModalDOM();

        // Collect orders
        _selectedOrders = _getSelectedOrdersFromTable();

        if (_selectedOrders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Chưa chọn đơn hàng nào', 'warning');
            return;
        }

        // Filter already-sent orders
        const alreadySent = _selectedOrders.filter(o => isOrderSent(o.orderId));
        if (alreadySent.length > 0) {
            _selectedOrders = _selectedOrders.filter(o => !isOrderSent(o.orderId));
            const names = alreadySent.map(o => o.customerName || o.code || o.orderId).slice(0, 3).join(', ');
            const extra = alreadySent.length > 3 ? ` và ${alreadySent.length - 3} đơn khác` : '';
            if (window.notificationManager) window.notificationManager.show(
                `Đã loại ${alreadySent.length} đơn đã gửi: ${names}${extra}`, 'warning'
            );
        }

        if (_selectedOrders.length === 0) {
            if (window.notificationManager) window.notificationManager.show('Tất cả đơn đã được gửi tin nhắn', 'info');
            return;
        }

        // Update header with order count
        const header = document.querySelector('#msgTplOverlay .msg-tpl-header h3');
        if (header) {
            header.innerHTML = `<i class="fab fa-facebook-messenger"></i> Gửi tin nhắn (${_selectedOrders.length} đơn)`;
        }

        // Update account count
        const accEl = document.getElementById('msgTplAccounts');
        if (accEl) {
            let count = 0;
            if (window.pancakeTokenManager?.getValidAccountsForSending) {
                count = window.pancakeTokenManager.getValidAccountsForSending().length;
            }
            accEl.textContent = count;
        }

        // Reset state
        _selectedTemplate = null;
        _isSending = false;
        document.getElementById('msgTplSendBtn').disabled = true;
        document.getElementById('msgTplSendBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
        document.getElementById('msgTplProgress').classList.remove('active');
        document.getElementById('msgTplSearchInput').value = '';

        // Show modal
        document.getElementById('msgTplOverlay').classList.add('active');
        document.body.style.overflow = 'hidden';

        // Load and render templates
        const body = document.getElementById('msgTplBody');
        body.innerHTML = '<div class="msg-tpl-loading"><i class="fas fa-spinner fa-spin"></i><p>Đang tải template...</p></div>';

        await loadTemplates();
        _renderTemplateList();
    }

    function _closeModal() {
        if (_isSending) return; // Don't close while sending
        document.getElementById('msgTplOverlay')?.classList.remove('active');
        document.body.style.overflow = '';
        _selectedTemplate = null;
        _selectedOrders = [];
    }

    // =====================================================
    // RENDER TEMPLATES
    // =====================================================

    function _renderTemplateList(searchQuery) {
        const body = document.getElementById('msgTplBody');
        const info = document.getElementById('msgTplInfo');
        let templates = getTemplates();

        // Filter by search
        if (searchQuery) {
            templates = templates.filter(t =>
                (t.Name || t.name || '').toLowerCase().includes(searchQuery) ||
                (t.Content || t.BodyPlain || t.content || '').toLowerCase().includes(searchQuery)
            );
        }

        if (info) info.innerHTML = `<strong>${templates.length}</strong> template`;

        if (templates.length === 0) {
            body.innerHTML = `<div class="msg-tpl-empty">
                <i class="fas fa-inbox" style="font-size:40px;color:#d1d5db;margin-bottom:12px"></i>
                <p>${searchQuery ? 'Không tìm thấy template' : 'Chưa có template nào'}</p>
                ${!searchQuery ? '<p style="font-size:13px;color:#9ca3af;margin-top:8px">Nhấn "Mẫu mới" để tạo template đầu tiên</p>' : ''}
            </div>`;
            return;
        }

        const listHtml = templates.map(t => {
            const name = _escapeHtml(t.Name || t.name || 'Không tên');
            const content = _escapeHtml(t.Content || t.BodyPlain || t.content || '');
            const id = t.id || t.Id;
            const selected = _selectedTemplate?.id === id || _selectedTemplate?.Id === id;

            return `<div class="msg-tpl-item ${selected ? 'selected' : ''}" data-tpl-id="${id}">
                <div class="msg-tpl-item-name">
                    <span>${name}</span>
                    <div class="msg-tpl-item-actions">
                        <button onclick="event.stopPropagation(); window.messageTemplateManager._editTemplate('${id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                        <button class="delete" onclick="event.stopPropagation(); window.messageTemplateManager._deleteTemplate('${id}', '${_escapeHtml(name)}')" title="Xóa"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="msg-tpl-item-content">${content.replace(/\n/g, '<br>')}</div>
            </div>`;
        }).join('');

        body.innerHTML = `<div class="msg-tpl-list">${listHtml}</div>`;

        // Attach click to select
        body.querySelectorAll('.msg-tpl-item').forEach(item => {
            item.addEventListener('click', () => {
                const tplId = item.dataset.tplId;
                const tpl = _templates.find(t => (t.id || t.Id) === tplId);
                if (!tpl) return;

                _selectedTemplate = tpl;

                // Update selected state
                body.querySelectorAll('.msg-tpl-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');

                // Enable send button
                document.getElementById('msgTplSendBtn').disabled = false;
            });
        });
    }

    // =====================================================
    // TEMPLATE EDITOR
    // =====================================================

    let _editingTemplate = null;

    function _openEditor(template) {
        _createModalDOM();
        _editingTemplate = template || null;

        document.getElementById('msgTplEditorTitle').textContent = template ? 'Sửa template' : 'Tạo template mới';
        document.getElementById('msgTplEditorName').value = template ? (template.Name || template.name || '') : '';
        document.getElementById('msgTplEditorContent').value = template ? (template.Content || template.BodyPlain || template.content || '') : '';

        document.getElementById('msgTplEditorOverlay').classList.add('active');
    }

    function _closeEditor() {
        document.getElementById('msgTplEditorOverlay')?.classList.remove('active');
        _editingTemplate = null;
    }

    async function _handleEditorSave() {
        const name = document.getElementById('msgTplEditorName').value.trim();
        const content = document.getElementById('msgTplEditorContent').value.trim();

        if (!name || !content) {
            if (window.notificationManager) window.notificationManager.show('Vui lòng nhập tên và nội dung', 'warning');
            return;
        }

        const saveBtn = document.getElementById('msgTplEditorSaveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';

        const templateData = {
            Name: name,
            Content: content,
            BodyPlain: content,
            active: true,
        };

        if (_editingTemplate) {
            templateData.id = _editingTemplate.id || _editingTemplate.Id;
        }

        await saveTemplate(templateData);
        _closeEditor();
        _renderTemplateList();

        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Lưu';

        if (window.notificationManager) window.notificationManager.show(
            _editingTemplate ? 'Đã cập nhật template' : 'Đã tạo template mới', 'success'
        );
    }

    function _editTemplateById(templateId) {
        const tpl = _templates.find(t => (t.id || t.Id) === templateId);
        if (tpl) _openEditor(tpl);
    }

    async function _deleteTemplateById(templateId, templateName) {
        if (!confirm(`Xóa template "${templateName}"?`)) return;
        await deleteTemplate(templateId);
        _renderTemplateList();
        if (window.notificationManager) window.notificationManager.show('Đã xóa template', 'success');
    }

    // =====================================================
    // HANDLE SEND
    // =====================================================

    async function _handleSend() {
        if (!_selectedTemplate || _selectedOrders.length === 0 || _isSending) return;

        const templateText = _selectedTemplate.Content || _selectedTemplate.BodyPlain || _selectedTemplate.content || '';
        if (!templateText) {
            if (window.notificationManager) window.notificationManager.show('Template không có nội dung', 'error');
            return;
        }

        _isSending = true;

        const sendBtn = document.getElementById('msgTplSendBtn');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';

        // Show progress
        const progressEl = document.getElementById('msgTplProgress');
        const progressText = document.getElementById('msgTplProgressText');
        const progressPct = document.getElementById('msgTplProgressPct');
        const progressFill = document.getElementById('msgTplProgressFill');
        progressEl.classList.add('active');
        progressFill.style.width = '0%';

        // Use a wrapper around bulkSendTemplate with progress tracking
        const total = _selectedOrders.length;
        let completed = 0;

        // Override notification to update progress bar
        const origNotify = window.notificationManager?.show;
        if (window.notificationManager) {
            window.notificationManager.show = (msg, type) => {
                // Parse progress from message "Đã gửi X/Y, lỗi: Z"
                const match = msg.match(/Đã gửi (\d+)\/(\d+)/);
                if (match) {
                    completed = parseInt(match[1]) + (parseInt(msg.match(/lỗi: (\d+)/)?.[1]) || 0);
                    const pct = Math.round((completed / total) * 100);
                    progressText.textContent = msg;
                    progressPct.textContent = pct + '%';
                    progressFill.style.width = pct + '%';
                }
                // Also call original
                if (origNotify) origNotify.call(window.notificationManager, msg, type);
            };
        }

        try {
            const results = await bulkSendTemplate(_selectedOrders, templateText);

            // Final progress
            progressFill.style.width = '100%';
            progressPct.textContent = '100%';

            const summaryMsg = `Hoàn tất: Gửi thành công ${results.sent}/${total}` +
                (results.failed > 0 ? `, lỗi ${results.failed}` : '');
            progressText.textContent = summaryMsg;

            if (window.notificationManager && origNotify) {
                origNotify.call(window.notificationManager, summaryMsg, results.failed > 0 ? 'warning' : 'success');
            }

            // Auto close after 2s if all success
            if (results.failed === 0) {
                setTimeout(() => _closeModal(), 2000);
            }
        } catch (e) {
            console.error('[TemplateMgr] Send error:', e);
            if (window.notificationManager && origNotify) {
                origNotify.call(window.notificationManager, 'Lỗi gửi tin nhắn: ' + e.message, 'error');
            }
        } finally {
            // Restore notification
            if (window.notificationManager && origNotify) {
                window.notificationManager.show = origNotify;
            }
            _isSending = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
        }
    }

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

        // UI (exposed for inline onclick handlers)
        _editTemplate: _editTemplateById,
        _deleteTemplate: _deleteTemplateById,
    };

    // Global function for onclick in HTML
    window.openMessageTemplateModal = openMessageTemplateModal;

})();

console.log('[TemplateMgr] Loaded.');
