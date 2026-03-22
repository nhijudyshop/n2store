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

        // History (placeholder - not implemented yet)
        document.getElementById('msgBtnHistory').onclick = () => {
            if (window.notificationManager) window.notificationManager.show('Tính năng lịch sử sẽ được bổ sung sau', 'info');
        };
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

        _modalOrders = orders;

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

        // Disable UI
        const sendBtn = document.getElementById('msgBtnSend');
        const cancelBtn = document.getElementById('msgBtnCancel');
        const progressContainer = document.getElementById('msgProgressContainer');

        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
        cancelBtn.disabled = true;
        progressContainer.style.display = 'block';
        _updateProgress(0, 0, orders.length);

        // Send using existing bulkSendTemplate
        const result = await bulkSendTemplate(orders, templateText, {
            viaComment: false,
            onProgress: (sent, failed, total) => {
                _updateProgress(sent + failed, total, total, sent, failed);
            }
        });

        // Show completion
        const totalProcessed = result.sent + result.failed;
        _updateProgress(totalProcessed, orders.length, orders.length, result.sent, result.failed);
        document.getElementById('msgProgressText').textContent =
            `Hoàn tất: ✓${result.sent} ✗${result.failed}`;

        // Re-enable UI
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi tin nhắn';
        cancelBtn.disabled = false;

        // Notification
        if (window.notificationManager) {
            window.notificationManager.show(
                `Đã gửi ${result.sent}/${orders.length} tin nhắn` + (result.failed > 0 ? `, ${result.failed} lỗi` : ''),
                result.failed > 0 ? 'warning' : 'success'
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

        // Cleanup
        cleanup,
    };

})();

console.log('[TemplateMgr] Loaded.');
