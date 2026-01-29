/**
 * Fast Sale Workflow Module
 * - Xử lý quy trình sau khi đi đơn hàng loạt
 * - Nút "Nhờ hủy đơn" cho đơn thành công
 * - Gắn tag "Âm Mã" cho đơn thất bại
 * - Gỡ tag "OK + NV" cho đơn khách OK
 * - Toggle auto gửi bill sau khi thành công
 *
 * @version 1.0.0
 */

(function () {
    'use strict';

    // =====================================================
    // INVOICE STATUS DELETE STORE
    // Lưu trữ thông tin đơn hủy với lý do
    // =====================================================

    const DELETE_STORAGE_KEY = 'invoiceStatusDelete';
    const DELETE_FIRESTORE_COLLECTION = 'invoice_status_delete';

    const InvoiceStatusDeleteStore = {
        _data: new Map(),
        _initialized: false,

        /**
         * Initialize store from localStorage + Firestore
         */
        async init() {
            if (this._initialized) return;

            try {
                // Load from localStorage
                const saved = localStorage.getItem(DELETE_STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.data) {
                        if (Array.isArray(parsed.data)) {
                            this._data = new Map(parsed.data);
                        } else {
                            this._data = new Map(Object.entries(parsed.data));
                        }
                    }
                }
                console.log(`[INVOICE-DELETE] Loaded ${this._data.size} entries from localStorage`);

                // Load from Firestore
                await this._loadFromFirestore();

                this._initialized = true;
            } catch (e) {
                console.error('[INVOICE-DELETE] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Get Firestore doc reference
         */
        _getDocRef() {
            const db = firebase.firestore();
            const authState = window.authManager?.getAuthState();
            const username = authState?.username || 'default';
            return db.collection(DELETE_FIRESTORE_COLLECTION).doc(username);
        },

        /**
         * Load from Firestore
         */
        async _loadFromFirestore() {
            try {
                const docRef = this._getDocRef();
                const doc = await docRef.get();

                if (doc.exists) {
                    const firestoreData = doc.data();
                    if (firestoreData.data) {
                        const entries = Object.entries(firestoreData.data);
                        entries.forEach(([key, value]) => {
                            // Merge: Firestore wins for newer data
                            const existing = this._data.get(key);
                            if (!existing || (value.deletedAt > (existing.deletedAt || 0))) {
                                this._data.set(key, value);
                            }
                        });
                    }
                    console.log(`[INVOICE-DELETE] Merged ${this._data.size} entries from Firestore`);
                }
            } catch (e) {
                console.error('[INVOICE-DELETE] Error loading from Firestore:', e);
            }
        },

        /**
         * Save to localStorage and sync to Firestore
         */
        async _save() {
            try {
                // Save to localStorage
                const dataObj = Object.fromEntries(this._data);
                localStorage.setItem(DELETE_STORAGE_KEY, JSON.stringify({ data: dataObj }));

                // Sync to Firestore
                const docRef = this._getDocRef();
                await docRef.set({ data: dataObj }, { merge: true });

                console.log(`[INVOICE-DELETE] Saved ${this._data.size} entries`);
            } catch (e) {
                console.error('[INVOICE-DELETE] Error saving:', e);
            }
        },

        /**
         * Add a cancelled order with reason
         * @param {string} saleOnlineId - SaleOnline order ID
         * @param {object} invoiceData - Full invoice data from invoiceStatusStore
         * @param {string} reason - Cancellation reason
         */
        async add(saleOnlineId, invoiceData, reason) {
            const key = String(saleOnlineId);
            const entry = {
                ...invoiceData,
                cancelReason: reason,
                deletedAt: Date.now(),
                deletedBy: window.authManager?.getAuthState()?.username || 'unknown',
                isOldVersion: false // Đánh dấu version mới
            };

            this._data.set(key, entry);
            await this._save();

            console.log(`[INVOICE-DELETE] Added cancelled order: ${saleOnlineId}, reason: ${reason}`);
            return entry;
        },

        /**
         * Get cancelled order data
         */
        get(saleOnlineId) {
            return this._data.get(String(saleOnlineId));
        },

        /**
         * Get all cancelled orders
         */
        getAll() {
            return Array.from(this._data.entries());
        }
    };

    // =====================================================
    // AUTO SEND BILL SETTINGS
    // =====================================================

    const WORKFLOW_SETTINGS_KEY = 'fastSaleWorkflowSettings';

    const WorkflowSettings = {
        _settings: {
            autoSendBillOnSuccess: false // Mặc định tắt
        },

        load() {
            try {
                const saved = localStorage.getItem(WORKFLOW_SETTINGS_KEY);
                if (saved) {
                    this._settings = { ...this._settings, ...JSON.parse(saved) };
                }
            } catch (e) {
                console.error('[WORKFLOW] Error loading settings:', e);
            }
            return this._settings;
        },

        save() {
            localStorage.setItem(WORKFLOW_SETTINGS_KEY, JSON.stringify(this._settings));
        },

        get autoSendBillOnSuccess() {
            return this._settings.autoSendBillOnSuccess;
        },

        set autoSendBillOnSuccess(value) {
            this._settings.autoSendBillOnSuccess = value;
            this.save();
        }
    };

    // Initialize settings
    WorkflowSettings.load();

    // =====================================================
    // CANCEL ORDER MODAL
    // =====================================================

    /**
     * Show modal to enter cancellation reason
     * @param {object} order - Success order data
     * @param {number} index - Index in success orders array
     */
    function showCancelOrderModal(order, index) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            window.notificationManager?.error('Không tìm thấy SaleOnline ID');
            return;
        }

        // Get invoice data from InvoiceStatusStore
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);
        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Create modal HTML
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nhờ Hủy Đơn
                        </h3>
                        <button onclick="closeCancelOrderModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <p style="margin: 0 0 8px 0; font-weight: 600;">Thông tin đơn:</p>
                        <p style="margin: 0; font-size: 14px;">
                            <strong>Mã:</strong> ${order.Reference || order.Code || 'N/A'}<br>
                            <strong>Số phiếu:</strong> ${order.Number || invoiceData.Number || 'N/A'}<br>
                            <strong>Khách:</strong> ${order.PartnerDisplayName || order.Partner?.PartnerDisplayName || 'N/A'}<br>
                            <strong>Trạng thái:</strong> ${order.ShowState || invoiceData.ShowState || 'N/A'}
                        </p>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">Lý do hủy đơn:</label>
                        <textarea id="cancelReasonInput" rows="3" placeholder="Nhập lý do khách hủy / đổi ý..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px;"></textarea>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button onclick="closeCancelOrderModal()" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer;">
                            Đóng
                        </button>
                        <button onclick="confirmCancelOrder(${index})" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            <i class="fas fa-check"></i> Xác nhận hủy
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('cancelOrderModal');
        if (existingModal) existingModal.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    /**
     * Close cancel order modal
     */
    function closeCancelOrderModal() {
        const modal = document.getElementById('cancelOrderModal');
        if (modal) modal.remove();
    }

    /**
     * Confirm cancel order - save to invoiceStatusDelete
     * @param {number} index - Index in success orders array
     */
    async function confirmCancelOrder(index) {
        const reason = document.getElementById('cancelReasonInput')?.value?.trim();
        if (!reason) {
            window.notificationManager?.warning('Vui lòng nhập lý do hủy đơn');
            return;
        }

        const order = window.fastSaleResultsData?.success?.[index];
        if (!order) {
            window.notificationManager?.error('Không tìm thấy đơn hàng');
            closeCancelOrderModal();
            return;
        }

        const saleOnlineId = order.SaleOnlineIds?.[0];
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);

        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu');
            closeCancelOrderModal();
            return;
        }

        try {
            // Save to delete store
            await InvoiceStatusDeleteStore.add(saleOnlineId, {
                ...invoiceData,
                ...order,
                SaleOnlineId: saleOnlineId
            }, reason);

            // TODO: Chuyển đơn về Nháp (nếu có API)

            window.notificationManager?.success(`Đã lưu yêu cầu hủy đơn: ${order.Number || order.Reference}`);
            closeCancelOrderModal();

            // Update UI - mark as cancelled
            const row = document.querySelector(`.success-order-checkbox[data-order-id="${order.Id}"]`)?.closest('tr');
            if (row) {
                row.style.backgroundColor = '#fef2f2';
                row.style.opacity = '0.7';

                // Update cancel button to show cancelled
                const cancelBtn = row.querySelector('.btn-cancel-order');
                if (cancelBtn) {
                    cancelBtn.innerHTML = '<i class="fas fa-check"></i> Đã nhờ hủy';
                    cancelBtn.disabled = true;
                    cancelBtn.style.background = '#9ca3af';
                }
            }
        } catch (e) {
            console.error('[WORKFLOW] Error confirming cancel:', e);
            window.notificationManager?.error('Lỗi khi lưu yêu cầu hủy đơn');
        }
    }

    // =====================================================
    // TAG MANAGEMENT FUNCTIONS
    // =====================================================

    /**
     * Find tag by name pattern (case insensitive, supports prefix)
     * @param {string} namePattern - Tag name pattern (e.g., "OK" to find "OK Hạnh", "OK Huyên")
     * @param {boolean} exactMatch - If true, match exact name; if false, match prefix
     */
    function findTagByPattern(namePattern, exactMatch = false) {
        if (!window.availableTags) return null;

        const pattern = namePattern.toUpperCase();

        return window.availableTags.find(tag => {
            const tagName = (tag.Name || '').toUpperCase();
            if (exactMatch) {
                return tagName === pattern;
            }
            return tagName.startsWith(pattern);
        });
    }

    /**
     * Find tag by exact name
     */
    function findTagByName(name) {
        if (!window.availableTags) return null;
        return window.availableTags.find(tag =>
            (tag.Name || '').toUpperCase() === name.toUpperCase()
        );
    }

    /**
     * Assign tag to order via API
     * @param {string} orderId - Order ID
     * @param {array} tags - Array of tags to assign [{Id, Name, Color}]
     */
    async function assignTagsToOrder(orderId, tags) {
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/TagSaleOnlineOrder/ODataService.AssignTag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        Tags: tags.map(t => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                        OrderId: orderId
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            console.log(`[WORKFLOW] Assigned tags to order ${orderId}:`, tags.map(t => t.Name));
            return true;
        } catch (e) {
            console.error(`[WORKFLOW] Error assigning tags to order ${orderId}:`, e);
            return false;
        }
    }

    /**
     * Remove tag from order (by assigning all other tags except the one to remove)
     * @param {string} orderId - Order ID
     * @param {string} tagNamePattern - Tag name pattern to remove (e.g., "OK " to remove "OK Hạnh")
     */
    async function removeTagFromOrder(orderId, tagNamePattern) {
        // Get current order tags from OrderStore or displayedData
        const order = window.OrderStore?.get(orderId) || window.displayedData?.find(o => o.Id === orderId);
        if (!order) {
            console.error(`[WORKFLOW] Order not found: ${orderId}`);
            return false;
        }

        let currentTags = [];
        try {
            if (typeof order.Tags === 'string') {
                currentTags = JSON.parse(order.Tags);
            } else if (Array.isArray(order.Tags)) {
                currentTags = order.Tags;
            }
        } catch (e) {
            currentTags = [];
        }

        // Filter out tags matching the pattern
        const pattern = tagNamePattern.toUpperCase();
        const newTags = currentTags.filter(tag => {
            const tagName = (tag.Name || '').toUpperCase();
            return !tagName.startsWith(pattern);
        });

        // Assign new tags (without the removed one)
        return await assignTagsToOrder(orderId, newTags);
    }

    /**
     * Add tag to order (keeping existing tags)
     * @param {string} orderId - Order ID
     * @param {object} tagToAdd - Tag to add {Id, Name, Color}
     */
    async function addTagToOrder(orderId, tagToAdd) {
        // Get current order tags
        const order = window.OrderStore?.get(orderId) || window.displayedData?.find(o => o.Id === orderId);
        if (!order) {
            console.error(`[WORKFLOW] Order not found: ${orderId}`);
            return false;
        }

        let currentTags = [];
        try {
            if (typeof order.Tags === 'string') {
                currentTags = JSON.parse(order.Tags);
            } else if (Array.isArray(order.Tags)) {
                currentTags = order.Tags;
            }
        } catch (e) {
            currentTags = [];
        }

        // Check if tag already exists
        if (currentTags.some(t => t.Id === tagToAdd.Id)) {
            console.log(`[WORKFLOW] Tag "${tagToAdd.Name}" already exists on order ${orderId}`);
            return true;
        }

        // Add new tag
        const newTags = [...currentTags, tagToAdd];
        return await assignTagsToOrder(orderId, newTags);
    }

    // =====================================================
    // WORKFLOW ACTIONS
    // =====================================================

    /**
     * Handle "Khách OK" - Remove "OK + NV" tag from order
     * @param {object} order - Success order data
     */
    async function handleCustomerOK(order) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            console.error('[WORKFLOW] No SaleOnlineId found');
            return false;
        }

        // Remove tag starting with "OK " (OK Hạnh, OK Huyên, etc.)
        const success = await removeTagFromOrder(saleOnlineId, 'OK ');

        if (success) {
            window.notificationManager?.success(`Đã gỡ tag OK cho đơn ${order.Number || order.Reference}`);
        } else {
            window.notificationManager?.error(`Lỗi gỡ tag OK cho đơn ${order.Number || order.Reference}`);
        }

        return success;
    }

    /**
     * Handle failed order - Add "Âm Mã" tag
     * @param {object} order - Failed order data
     */
    async function handleFailedOrder(order) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            console.error('[WORKFLOW] No SaleOnlineId found for failed order');
            return false;
        }

        // Find or create "Âm Mã" tag
        let amMaTag = findTagByName('Âm Mã');

        if (!amMaTag) {
            console.warn('[WORKFLOW] Tag "Âm Mã" not found in system');
            // TODO: Có thể tạo tag mới nếu cần
            return false;
        }

        const success = await addTagToOrder(saleOnlineId, {
            Id: amMaTag.Id,
            Name: amMaTag.Name,
            Color: amMaTag.Color
        });

        if (success) {
            console.log(`[WORKFLOW] Added "Âm Mã" tag to failed order: ${order.Reference || saleOnlineId}`);
        }

        return success;
    }

    /**
     * Process all failed orders - Add "Âm Mã" tag
     * @param {array} failedOrders - Array of failed order data
     */
    async function processFailedOrders(failedOrders) {
        if (!failedOrders || failedOrders.length === 0) return;

        console.log(`[WORKFLOW] Processing ${failedOrders.length} failed orders...`);

        let successCount = 0;
        let failCount = 0;

        for (const order of failedOrders) {
            const success = await handleFailedOrder(order);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        if (successCount > 0) {
            window.notificationManager?.info(`Đã gắn tag "Âm Mã" cho ${successCount} đơn thất bại`);
        }

        console.log(`[WORKFLOW] Failed orders processed: ${successCount} success, ${failCount} failed`);
    }

    /**
     * Auto send bill for successful orders (if enabled)
     * @param {array} successOrders - Array of success order data
     */
    async function autoSendBillsIfEnabled(successOrders) {
        if (!WorkflowSettings.autoSendBillOnSuccess) {
            console.log('[WORKFLOW] Auto send bill is disabled');
            return;
        }

        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToSend = successOrders.filter(order =>
            order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );

        if (ordersToSend.length === 0) {
            console.log('[WORKFLOW] No orders eligible for auto bill sending');
            return;
        }

        console.log(`[WORKFLOW] Auto sending bills for ${ordersToSend.length} orders...`);
        window.notificationManager?.info(`Đang tự động gửi bill cho ${ordersToSend.length} đơn...`);

        // Use existing sendBillManually function for each order
        let sentCount = 0;
        for (let i = 0; i < ordersToSend.length; i++) {
            const order = ordersToSend[i];
            const originalIndex = successOrders.indexOf(order);

            try {
                if (typeof window.sendBillManually === 'function') {
                    await window.sendBillManually(originalIndex);
                    sentCount++;
                }
            } catch (e) {
                console.error(`[WORKFLOW] Error auto-sending bill for order ${order.Number}:`, e);
            }

            // Small delay between sends
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (sentCount > 0) {
            window.notificationManager?.success(`Đã gửi ${sentCount} bill thành công`);
        }
    }

    // =====================================================
    // UI ENHANCEMENTS
    // =====================================================

    /**
     * Add cancel button to success orders table row
     * Called when rendering success orders
     */
    function getCancelButtonHtml(order, index) {
        // Only show for "Đã thanh toán" or "Đã xác nhận"
        const showState = order.ShowState || '';
        if (showState !== 'Đã thanh toán' && showState !== 'Đã xác nhận') {
            return '';
        }

        return `
            <button class="btn-cancel-order"
                    onclick="window.showCancelOrderModal(window.fastSaleResultsData.success[${index}], ${index}); event.stopPropagation();"
                    title="Nhờ hủy đơn"
                    style="background: #dc2626; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; margin-left: 4px;">
                <i class="fas fa-times"></i>
            </button>
        `;
    }

    /**
     * Add "Khách OK" button to success orders table row
     */
    function getCustomerOKButtonHtml(order, index) {
        // Only show for "Đã thanh toán" or "Đã xác nhận"
        const showState = order.ShowState || '';
        if (showState !== 'Đã thanh toán' && showState !== 'Đã xác nhận') {
            return '';
        }

        return `
            <button class="btn-customer-ok"
                    onclick="window.handleCustomerOKClick(${index}); event.stopPropagation();"
                    title="Khách OK - Gỡ tag OK NV"
                    style="background: #10b981; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; margin-left: 4px;">
                <i class="fas fa-check"></i> OK
            </button>
        `;
    }

    /**
     * Handle "Khách OK" button click
     */
    async function handleCustomerOKClick(index) {
        const order = window.fastSaleResultsData?.success?.[index];
        if (!order) return;

        const confirmed = confirm(`Xác nhận khách OK cho đơn ${order.Number || order.Reference}?\nSẽ gỡ tag "OK + NV" khỏi đơn này.`);
        if (!confirmed) return;

        const success = await handleCustomerOK(order);

        if (success) {
            // Update UI
            const row = document.querySelector(`.success-order-checkbox[value="${index}"]`)?.closest('tr');
            if (row) {
                const okBtn = row.querySelector('.btn-customer-ok');
                if (okBtn) {
                    okBtn.innerHTML = '<i class="fas fa-check"></i> Done';
                    okBtn.disabled = true;
                    okBtn.style.background = '#9ca3af';
                }
            }
        }
    }

    /**
     * Inject auto send bill toggle into Bill Settings modal
     */
    function injectAutoSendBillToggle() {
        // Find the bill settings modal content
        const billSettingsModal = document.getElementById('billSettingsModal');
        if (!billSettingsModal) return;

        // Check if already injected
        if (document.getElementById('autoSendBillToggle')) return;

        // Find insertion point (after existing settings)
        const modalBody = billSettingsModal.querySelector('.modal-body');
        if (!modalBody) return;

        const toggleHtml = `
            <div class="setting-group" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <h4 style="margin: 0 0 12px 0; color: #374151; font-size: 14px;">
                    <i class="fas fa-paper-plane"></i> Tự động gửi bill
                </h4>
                <label class="toggle-switch" style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="autoSendBillToggle"
                           ${WorkflowSettings.autoSendBillOnSuccess ? 'checked' : ''}
                           onchange="window.WorkflowSettings.autoSendBillOnSuccess = this.checked"
                           style="margin-right: 8px;">
                    <span>Tự động gửi bill sau khi đơn "Đã thanh toán" hoặc "Đã xác nhận"</span>
                </label>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">
                    Mặc định: Tắt. Khi bật sẽ gửi bill ngay sau khi đi đơn thành công.
                </p>
            </div>
        `;

        modalBody.insertAdjacentHTML('beforeend', toggleHtml);
        console.log('[WORKFLOW] Injected auto send bill toggle into Bill Settings');
    }

    // =====================================================
    // INITIALIZATION & EXPORTS
    // =====================================================

    async function initWorkflow() {
        await InvoiceStatusDeleteStore.init();
        console.log('[WORKFLOW] Fast Sale Workflow initialized');

        // Try to inject toggle after a delay (modal may not exist yet)
        setTimeout(injectAutoSendBillToggle, 2000);
    }

    // Initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWorkflow);
    } else {
        initWorkflow();
    }

    // Export to window
    window.InvoiceStatusDeleteStore = InvoiceStatusDeleteStore;
    window.WorkflowSettings = WorkflowSettings;
    window.showCancelOrderModal = showCancelOrderModal;
    window.closeCancelOrderModal = closeCancelOrderModal;
    window.confirmCancelOrder = confirmCancelOrder;
    window.handleCustomerOK = handleCustomerOK;
    window.handleCustomerOKClick = handleCustomerOKClick;
    window.handleFailedOrder = handleFailedOrder;
    window.processFailedOrders = processFailedOrders;
    window.autoSendBillsIfEnabled = autoSendBillsIfEnabled;
    window.getCancelButtonHtml = getCancelButtonHtml;
    window.getCustomerOKButtonHtml = getCustomerOKButtonHtml;
    window.removeTagFromOrder = removeTagFromOrder;
    window.addTagToOrder = addTagToOrder;
    window.assignTagsToOrder = assignTagsToOrder;

})();
