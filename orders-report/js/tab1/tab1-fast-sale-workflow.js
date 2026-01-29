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

            // Re-add "OK + NV" tag (was removed on success)
            const removedOkTag = order._removedOkTag;
            if (removedOkTag) {
                console.log(`[WORKFLOW] Re-adding tag "${removedOkTag.Name}" to cancelled order`);
                await addTagToOrder(saleOnlineId, {
                    Id: removedOkTag.Id,
                    Name: removedOkTag.Name,
                    Color: removedOkTag.Color
                });
            } else {
                // Try to find an "OK + NV" tag from the user's current identifier
                const authState = window.authManager?.getAuthState();
                const username = authState?.username || '';
                if (username) {
                    // Find tag matching "OK " + username pattern
                    const okTagForUser = window.availableTags?.find(t =>
                        (t.Name || '').toUpperCase() === `OK ${username}`.toUpperCase()
                    );
                    if (okTagForUser) {
                        console.log(`[WORKFLOW] Re-adding tag "${okTagForUser.Name}" based on current user`);
                        await addTagToOrder(saleOnlineId, {
                            Id: okTagForUser.Id,
                            Name: okTagForUser.Name,
                            Color: okTagForUser.Color
                        });
                    }
                }
            }

            window.notificationManager?.success(`Đã lưu yêu cầu hủy đơn + gắn lại tag OK: ${order.Number || order.Reference}`);
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
     * Generate random color for new tag
     */
    function generateRandomColor() {
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
            '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
            '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
            '#ec4899', '#f43f5e'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Find or create tag by name
     * @param {string} tagName - Tag name to find or create
     * @returns {object|null} - Tag object {Id, Name, Color}
     */
    async function findOrCreateTag(tagName) {
        // Try to find existing tag first
        let tag = findTagByName(tagName);
        if (tag) {
            return tag;
        }

        // Tag not found - create new one
        console.log(`[WORKFLOW] Tag "${tagName}" not found, creating...`);

        try {
            const headers = await window.tokenManager.getAuthHeader();
            const color = generateRandomColor();

            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'accept': 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({
                        Name: tagName.toUpperCase(),
                        Color: color
                    })
                }
            );

            if (!response.ok) {
                // Tag might already exist (race condition)
                if (response.status === 400) {
                    // Refresh tags and try to find again
                    if (typeof loadTags === 'function') {
                        await loadTags();
                    }
                    return findTagByName(tagName);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const newTag = await response.json();
            console.log(`[WORKFLOW] Created tag "${tagName}":`, newTag);

            // Remove @odata.context
            if (newTag['@odata.context']) {
                delete newTag['@odata.context'];
            }

            // Update local tags list
            if (Array.isArray(window.availableTags)) {
                window.availableTags.push(newTag);
                window.cacheManager?.set("tags", window.availableTags, "tags");
            }

            return newTag;
        } catch (error) {
            console.error(`[WORKFLOW] Error creating tag "${tagName}":`, error);
            return null;
        }
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
     * Handle failed order - Add "Âm Mã" tag (auto-create if not exists)
     * @param {object} order - Failed order data
     */
    async function handleFailedOrder(order) {
        const saleOnlineId = order.SaleOnlineIds?.[0];
        if (!saleOnlineId) {
            console.error('[WORKFLOW] No SaleOnlineId found for failed order');
            return false;
        }

        // Find or create "Âm Mã" tag
        const amMaTag = await findOrCreateTag('ÂM MÃ');

        if (!amMaTag) {
            console.error('[WORKFLOW] Could not find or create tag "Âm Mã"');
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
     * Process successful orders - Auto remove "OK + NV" tag
     * @param {array} successOrders - Array of success order data
     */
    async function processSuccessOrders(successOrders) {
        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToProcess = successOrders.filter(order =>
            order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );

        if (ordersToProcess.length === 0) {
            console.log('[WORKFLOW] No successful orders to remove OK tag');
            return;
        }

        console.log(`[WORKFLOW] Auto removing "OK + NV" tag from ${ordersToProcess.length} successful orders...`);

        let successCount = 0;
        for (const order of ordersToProcess) {
            const saleOnlineId = order.SaleOnlineIds?.[0];
            if (!saleOnlineId) continue;

            // Store the removed tag info for potential re-add on cancel
            const orderData = window.OrderStore?.get(saleOnlineId) || window.displayedData?.find(o => o.Id === saleOnlineId);
            let currentTags = [];
            try {
                if (typeof orderData?.Tags === 'string') {
                    currentTags = JSON.parse(orderData.Tags);
                } else if (Array.isArray(orderData?.Tags)) {
                    currentTags = orderData.Tags;
                }
            } catch (e) {
                currentTags = [];
            }

            // Find "OK + NV" tag to store for later re-add
            const okTag = currentTags.find(t => (t.Name || '').toUpperCase().startsWith('OK '));
            if (okTag) {
                // Store in order object for re-add on cancel
                order._removedOkTag = okTag;
            }

            const success = await removeTagFromOrder(saleOnlineId, 'OK ');
            if (success) {
                successCount++;
            }
        }

        if (successCount > 0) {
            window.notificationManager?.success(`Đã gỡ tag "OK + NV" cho ${successCount} đơn thành công`);
        }

        console.log(`[WORKFLOW] Success orders processed: ${successCount} tags removed`);
    }

    /**
     * Auto send bill for successful orders (if enabled)
     * @param {array} successOrders - Array of success order data
     */
    async function autoSendBillsIfEnabled(successOrders) {
        // Check setting from Bill Template Settings
        const billSettings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};
        if (!billSettings.autoSendOnSuccess) {
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
     * Show cancel order modal from main table
     * @param {string} orderId - SaleOnlineOrder ID (same as saleOnlineId in main table)
     */
    function showCancelOrderModalFromMain(orderId) {
        if (!orderId) {
            window.notificationManager?.error('Không tìm thấy Order ID');
            return;
        }

        // Get invoice data from InvoiceStatusStore (primary source)
        const invoiceData = window.InvoiceStatusStore?.get(orderId);
        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
            return;
        }

        // Try to find order from displayedData for additional info (optional)
        const orderData = window.displayedData?.find(o => o.Id === orderId);

        // Create a compatible order object using invoiceData as primary source
        const order = {
            Id: orderId,
            SaleOnlineIds: [orderId], // Main table: orderId IS the SaleOnlineId
            Reference: invoiceData.Reference || orderData?.Code || orderData?.Reference,
            Number: invoiceData.Number,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName || orderData?.PartnerDisplayName,
            ShowState: invoiceData.ShowState,
            Tags: orderData?.Tags || invoiceData.Tags
        };

        // Store in a temporary global for confirmCancelOrder to access
        window._cancelOrderFromMain = order;

        // Create enriched order for bill generation
        const enrichedOrder = {
            Id: invoiceData.Id,
            Number: invoiceData.Number,
            Reference: invoiceData.Reference,
            PartnerDisplayName: invoiceData.PartnerDisplayName || invoiceData.ReceiverName,
            DeliveryPrice: invoiceData.DeliveryPrice,
            CashOnDelivery: invoiceData.CashOnDelivery,
            PaymentAmount: invoiceData.PaymentAmount,
            Discount: invoiceData.Discount,
            AmountTotal: invoiceData.AmountTotal,
            AmountUntaxed: invoiceData.AmountUntaxed,
            CarrierName: invoiceData.CarrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress
            }
        };

        // Create modal HTML with bill preview section
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 900px; width: 95%; max-height: 90vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nhờ Hủy Đơn
                        </h3>
                        <button onclick="closeCancelOrderModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <!-- Left: Bill Preview -->
                        <div style="flex: 1; min-width: 300px;">
                            <div id="cancelBillPreview" style="border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; min-height: 400px; max-height: 500px; overflow: auto;">
                                <p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>
                            </div>
                        </div>

                        <!-- Right: Order Info & Reason -->
                        <div style="flex: 1; min-width: 280px;">
                            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                                <p style="margin: 0 0 8px 0; font-weight: 600;">Thông tin đơn:</p>
                                <p style="margin: 0; font-size: 14px;">
                                    <strong>Mã:</strong> ${order.Reference || 'N/A'}<br>
                                    <strong>Số phiếu:</strong> ${order.Number || 'N/A'}<br>
                                    <strong>Khách:</strong> ${order.PartnerDisplayName || 'N/A'}<br>
                                    <strong>Trạng thái:</strong> ${order.ShowState || 'N/A'}
                                </p>
                            </div>

                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-weight: 600; margin-bottom: 8px;">Lý do hủy đơn:</label>
                                <textarea id="cancelReasonInput" rows="4" placeholder="Nhập lý do khách hủy / đổi ý..." style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; font-size: 14px;"></textarea>
                            </div>

                            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                <button onclick="closeCancelOrderModal()" style="padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer;">
                                    Đóng
                                </button>
                                <button onclick="confirmCancelOrderFromMain()" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                                    <i class="fas fa-check"></i> Xác nhận hủy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('cancelOrderModal');
        if (existingModal) existingModal.remove();

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Generate bill preview
        const previewContainer = document.getElementById('cancelBillPreview');
        if (previewContainer && typeof window.generateCustomBillHTML === 'function') {
            try {
                const walletBalance = invoiceData.PaymentAmount || 0;
                const billHTML = window.generateCustomBillHTML(enrichedOrder, { walletBalance });

                if (billHTML) {
                    // Use iframe to display bill
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'width: 100%; height: 450px; border: none; background: white;';
                    previewContainer.innerHTML = '';
                    previewContainer.appendChild(iframe);

                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(billHTML);
                    iframeDoc.close();
                } else {
                    previewContainer.innerHTML = '<p style="color: #9ca3af; padding: 20px; text-align: center;">Không thể tạo bill preview</p>';
                }
            } catch (e) {
                console.error('[WORKFLOW] Error generating bill preview:', e);
                previewContainer.innerHTML = '<p style="color: #ef4444; padding: 20px; text-align: center;">Lỗi tạo bill</p>';
            }
        }
    }

    /**
     * Confirm cancel order from main table
     */
    async function confirmCancelOrderFromMain() {
        const reason = document.getElementById('cancelReasonInput')?.value?.trim();
        if (!reason) {
            window.notificationManager?.warning('Vui lòng nhập lý do hủy đơn');
            return;
        }

        const order = window._cancelOrderFromMain;
        if (!order) {
            window.notificationManager?.error('Không tìm thấy dữ liệu đơn hủy');
            closeCancelOrderModal();
            return;
        }

        const saleOnlineId = order.SaleOnlineIds?.[0];
        const invoiceData = window.InvoiceStatusStore?.get(saleOnlineId);

        if (!invoiceData) {
            window.notificationManager?.error('Không tìm thấy dữ liệu phiếu bán hàng');
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

            // Re-add "OK + NV" tag
            // Parse current tags
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

            // Find OK tag from current tags or from user
            let okTag = currentTags.find(t => (t.Name || '').toUpperCase().startsWith('OK '));

            if (!okTag) {
                // Try to find from user's current identifier
                const authState = window.authManager?.getAuthState();
                const username = authState?.username || '';
                if (username) {
                    okTag = window.availableTags?.find(t =>
                        (t.Name || '').toUpperCase() === `OK ${username}`.toUpperCase()
                    );
                }
            }

            if (okTag) {
                console.log(`[WORKFLOW] Re-adding tag "${okTag.Name}" to cancelled order from main table`);
                await addTagToOrder(saleOnlineId, {
                    Id: okTag.Id,
                    Name: okTag.Name,
                    Color: okTag.Color
                });
            }

            window.notificationManager?.success(`Đã lưu yêu cầu hủy đơn: ${order.Number || order.Reference}`);
            closeCancelOrderModal();

            // Update main table UI
            const cell = document.querySelector(`.btn-cancel-order-main[data-order-id="${order.Id}"]`)?.closest('td');
            if (cell) {
                const cancelBtn = cell.querySelector('.btn-cancel-order-main');
                if (cancelBtn) {
                    cancelBtn.innerHTML = '✓';
                    cancelBtn.style.background = '#9ca3af';
                    cancelBtn.disabled = true;
                    cancelBtn.title = 'Đã yêu cầu hủy';
                }
            }

            // Clear temp data
            delete window._cancelOrderFromMain;

        } catch (error) {
            console.error('[WORKFLOW] Error saving cancel order:', error);
            window.notificationManager?.error('Lỗi lưu yêu cầu hủy đơn');
        }
    }

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


    // =====================================================
    // INITIALIZATION & EXPORTS
    // =====================================================

    async function initWorkflow() {
        await InvoiceStatusDeleteStore.init();
        console.log('[WORKFLOW] Fast Sale Workflow initialized');
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
    window.showCancelOrderModalFromMain = showCancelOrderModalFromMain;
    window.closeCancelOrderModal = closeCancelOrderModal;
    window.confirmCancelOrder = confirmCancelOrder;
    window.confirmCancelOrderFromMain = confirmCancelOrderFromMain;
    window.handleFailedOrder = handleFailedOrder;
    window.processFailedOrders = processFailedOrders;
    window.processSuccessOrders = processSuccessOrders;
    window.autoSendBillsIfEnabled = autoSendBillsIfEnabled;
    window.getCancelButtonHtml = getCancelButtonHtml;
    window.removeTagFromOrder = removeTagFromOrder;
    window.addTagToOrder = addTagToOrder;
    window.assignTagsToOrder = assignTagsToOrder;

})();
