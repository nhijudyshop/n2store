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
    // Persists to PostgreSQL via REST API
    // =====================================================

    const DELETE_API_BASE = (window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-status/delete';

    const InvoiceStatusDeleteStore = {
        _data: new Map(),
        _initialized: false,

        /**
         * Get current username for API calls
         */
        _getUsername() {
            const authData =
                window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            const userType = authData?.userType || localStorage.getItem('userType') || '';
            return authData?.username || userType.split('-')[0] || 'default';
        },

        /**
         * Initialize store from PostgreSQL API
         */
        async init() {
            if (this._initialized) return;

            try {
                await this._loadFromAPI();
                this._initialized = true;
            } catch (e) {
                console.error('[INVOICE-DELETE] Error initializing store:', e);
                this._initialized = true;
            }
        },

        /**
         * Load from API (source of truth)
         */
        async _loadFromAPI() {
            try {
                const response = await fetch(`${DELETE_API_BASE}/load`);
                if (!response.ok) throw new Error(`API load failed: ${response.status}`);

                const result = await response.json();
                if (!result.success) throw new Error(result.error || 'Load failed');

                this._data.clear();
                (result.entries || []).forEach(row => {
                    const key = row.compound_key;
                    const value = {
                        SaleOnlineId: row.sale_online_id,
                        cancelReason: row.cancel_reason,
                        deletedAt: parseInt(row.deleted_at) || 0,
                        deletedBy: row.deleted_by,
                        deletedByDisplayName: row.deleted_by_display_name,
                        isOldVersion: row.is_old_version || false,
                        hidden: row.hidden || false,
                        ...(row.invoice_data || {}),
                    };
                    this._data.set(key, value);
                });

                return true;
            } catch (e) {
                console.error('[INVOICE-DELETE] API load error:', e);
                return false;
            }
        },

        /**
         * Cleanup store resources
         */
        destroy() {
            this._data.clear();
            this._initialized = false;
        },

        /**
         * Add a cancelled order with reason
         * @param {string} saleOnlineId - SaleOnline order ID
         * @param {object} invoiceData - Full invoice data from invoiceStatusStore
         * @param {string} reason - Cancellation reason
         */
        async add(saleOnlineId, invoiceData, reason) {
            const timestamp = Date.now();
            const key = `${String(saleOnlineId)}_${timestamp}`;

            const authData =
                window.authManager?.getAuthData?.() || window.authManager?.getAuthState?.();
            const username =
                authData?.username ||
                (authData?.userType ? authData.userType.split('-')[0] : 'unknown');
            const displayName = window.currentUserIdentifier || username;

            const entry = {
                ...invoiceData,
                SaleOnlineId: String(saleOnlineId),
                cancelReason: reason,
                deletedAt: timestamp,
                deletedBy: username,
                deletedByDisplayName: displayName,
                isOldVersion: false,
                hidden: false,
            };

            this._data.set(key, entry);

            // Save to API
            try {
                await fetch(`${DELETE_API_BASE}/entries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        compoundKey: key,
                        username,
                        saleOnlineId: String(saleOnlineId),
                        cancelReason: reason,
                        deletedAt: timestamp,
                        deletedBy: username,
                        deletedByDisplayName: displayName,
                        invoiceData: invoiceData || {},
                    }),
                });
            } catch (e) {
                console.error('[INVOICE-DELETE] API save error:', e);
            }

            return entry;
        },

        /**
         * Toggle hidden status of an entry
         * @param {string} key - Entry key (saleOnlineId_timestamp)
         * @returns {boolean} - New hidden status
         */
        async toggleHidden(key) {
            const entry = this._data.get(key);
            if (!entry) {
                console.warn(`[INVOICE-DELETE] Entry not found: ${key}`);
                return null;
            }

            entry.hidden = !entry.hidden;
            this._data.set(key, entry);

            try {
                await fetch(`${DELETE_API_BASE}/entries/${encodeURIComponent(key)}/toggle-hidden`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hidden: entry.hidden }),
                });
            } catch (e) {
                console.error('[INVOICE-DELETE] API toggle-hidden error:', e);
            }

            return entry.hidden;
        },

        /**
         * Delete an entry from the store
         * @param {string} key - Entry key (saleOnlineId_timestamp)
         */
        async delete(key) {
            if (!this._data.has(key)) {
                console.warn(`[INVOICE-DELETE] Entry not found for deletion: ${key}`);
                return false;
            }

            this._data.delete(key);

            try {
                await fetch(`${DELETE_API_BASE}/entries/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
                });
            } catch (e) {
                console.error('[INVOICE-DELETE] API delete error:', e);
            }

            return true;
        },

        /**
         * Get all cancelled orders
         */
        getAll() {
            return Array.from(this._data.entries());
        },

        /**
         * Reload data from API (manual refresh)
         */
        async reload() {
            this._data.clear();
            await this._loadFromAPI();
        },
    };

    // =====================================================
    // AUTO SEND BILL SETTINGS
    // =====================================================

    const WORKFLOW_SETTINGS_KEY = 'fastSaleWorkflowSettings';

    const WorkflowSettings = {
        _settings: {
            autoSendBillOnSuccess: false, // Mặc định tắt
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
        },
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
        // Block double-click: check if button is already disabled
        const confirmBtn = document.querySelector(
            '#cancelOrderModal button[onclick*="confirmCancelOrder"]'
        );
        if (confirmBtn?.disabled) {
            console.warn('[WORKFLOW] ⚠️ Cancel button already disabled, ignoring duplicate click');
            return;
        }

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

        // Disable button to prevent double-click
        const originalBtnText = confirmBtn?.innerHTML;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        try {
            // Step 1: Call TPOS API to cancel the order
            // Parse ID to integer - API requires Int64, not string
            const fastSaleOrderId = parseInt(order.Id, 10);
            if (fastSaleOrderId && !isNaN(fastSaleOrderId)) {
                const cancelResponse = await window.tokenManager.authenticatedFetch(
                    'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.ActionCancel',
                    {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ ids: [fastSaleOrderId] }),
                    }
                );

                if (!cancelResponse.ok) {
                    const errorText = await cancelResponse.text();
                    console.error(
                        '[WORKFLOW] TPOS cancel API error:',
                        cancelResponse.status,
                        errorText
                    );
                    window.notificationManager?.error(
                        `Lỗi hủy đơn trên TPOS: ${cancelResponse.status}`
                    );
                    return;
                }

                // Handle empty response (API may return 200/204 with no body)
                const responseText = await cancelResponse.text();
                const cancelResult = responseText ? JSON.parse(responseText) : { success: true };
            } else {
                console.warn(
                    '[WORKFLOW] No valid FastSaleOrder ID found, skipping TPOS cancel API'
                );
            }

            // Step 2: Save to delete store
            await InvoiceStatusDeleteStore.add(
                saleOnlineId,
                {
                    ...invoiceData,
                    ...order,
                    SaleOnlineId: saleOnlineId,
                },
                reason
            );

            // Trả lại sản phẩm vào Kho Đi Chợ nếu đã hoàn thành đối soát (non-blocking)
            if (invoiceData.StateCode === 'CrossCheckComplete' && invoiceData.OrderLines?.length) {
                try {
                    const restoreItems = invoiceData.OrderLines.map(line => {
                        const nameStr = line.ProductName || line.Name || '';
                        const codeMatch = nameStr.match(/\[([^\]]+)\]/);
                        const productCode = codeMatch ? codeMatch[1].trim() : '';
                        return {
                            product_code: productCode,
                            parent_product_code: null,
                            product_name: nameStr,
                            variant: null,
                            quantity: Math.floor(line.ProductUOMQty || 1),
                            purchase_price: line.PriceUnit || 0,
                            source_po_id: 'cancel_' + (order.Number || order.Reference || saleOnlineId)
                        };
                    }).filter(i => i.product_code);

                    if (restoreItems.length > 0) {
                        fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/kho-di-cho/batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: restoreItems })
                        }).then(r => r.json()).then(res => {
                            if (res.success) console.log('[KhoDiCho] Đã trả kho:', restoreItems.length, 'SP');
                        }).catch(err => console.warn('[KhoDiCho] Trả kho lỗi:', err));
                    }
                } catch (err) {
                    console.warn('[KhoDiCho] Restore error:', err);
                }
            }

            // Step 3: Delete from InvoiceStatusStore (localStorage + Firebase)
            if (window.InvoiceStatusStore?.delete) {
                await window.InvoiceStatusStore.delete(saleOnlineId);
                // Hook: Processing tag rollback to previous position
                if (window.onPtagBillCancelled) window.onPtagBillCancelled(saleOnlineId);
            }

            // Re-add "OK + định danh" tag using quickAssignTag (same as quick-tag-ok button)
            const orderCode = order.Reference || order.Number || '';
            if (typeof window.quickAssignTag === 'function') {
                await window.quickAssignTag(saleOnlineId, orderCode, 'ok');
            } else {
                console.warn('[WORKFLOW] quickAssignTag function not available');
            }

            // Step 5: Update SaleOnline order status to "Nháp"
            if (typeof window.updateOrderStatus === 'function') {
                await window.updateOrderStatus(saleOnlineId, 'Nháp', 'Nháp', '#f0ad4e');
            } else {
                console.warn('[WORKFLOW] updateOrderStatus function not available');
            }

            // Step 6: Log cancel activity & refund wallet
            const orderNumber = order.Number || order.Reference || '';
            const customerPhone =
                order.Partner?.Phone ||
                order.PartnerPhone ||
                order.Partner?.PartnerPhone ||
                order.ReceiverPhone ||
                order.Phone ||
                '';
            if (customerPhone) {
                try {
                    await logCancelOrderActivity(customerPhone, orderNumber, order, reason, invoiceData?.Comment);
                } catch (refundErr) {
                    console.error('[WORKFLOW] ❌ Wallet refund/activity failed:', refundErr.message);
                    window.notificationManager?.error(
                        `⚠️ Đơn đã hủy nhưng hoàn ví thất bại. Liên hệ admin để hoàn ví thủ công cho đơn ${orderNumber}`
                    );
                }
            } else {
                console.warn(
                    `[WORKFLOW] No phone found for cancel activity, order: ${orderNumber}`
                );
            }

            window.notificationManager?.success(
                `Đã lưu yêu cầu hủy đơn + gắn lại tag OK: ${order.Number || order.Reference}`
            );
            closeCancelOrderModal();

            // Update results modal UI - mark as cancelled
            const row = document
                .querySelector(`.success-order-checkbox[data-order-id="${order.Id}"]`)
                ?.closest('tr');
            if (row) {
                row.style.backgroundColor = '#fef2f2';
                row.style.opacity = '0.7';

                // Update cancel button to show cancelled
                const rowCancelBtn = row.querySelector('.btn-cancel-order');
                if (rowCancelBtn) {
                    rowCancelBtn.innerHTML = '<i class="fas fa-check"></i> Đã nhờ hủy';
                    rowCancelBtn.disabled = true;
                    rowCancelBtn.style.background = '#9ca3af';
                }
            }

            // Update main table UI - show "−" since invoice was deleted
            const mainRow = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
            if (mainRow) {
                const invoiceCell = mainRow.querySelector('td[data-column="invoice-status"]');
                if (invoiceCell) {
                    invoiceCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }

                // Update fulfillment ("Ra đơn") cell immediately
                const fd = window.parent?.FulfillmentData || window.FulfillmentData;
                if (fd?.injectDeleteEntry) {
                    fd.injectDeleteEntry(saleOnlineId, {
                        ...invoiceData,
                        ...order,
                        SaleOnlineId: saleOnlineId,
                        cancelReason: reason,
                        deletedAt: Date.now(),
                    });
                }
                const fulfillmentCell = mainRow.querySelector('td[data-column="fulfillment"]');
                if (fulfillmentCell && typeof window.renderFulfillmentCell === 'function') {
                    fulfillmentCell.innerHTML = window.renderFulfillmentCell({ Id: saleOnlineId });
                }
            }
        } catch (e) {
            console.error('[WORKFLOW] Error confirming cancel:', e);
            window.notificationManager?.error('Lỗi khi lưu yêu cầu hủy đơn');

            // Re-enable button on error
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML =
                    originalBtnText || '<i class="fas fa-check"></i> Xác nhận hủy';
            }
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

        return window.availableTags.find((tag) => {
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
        return window.availableTags.find(
            (tag) => (tag.Name || '').toUpperCase() === name.toUpperCase()
        );
    }

    /**
     * Generate random color for new tag
     */
    function generateRandomColor() {
        const colors = [
            '#ef4444',
            '#f97316',
            '#f59e0b',
            '#eab308',
            '#84cc16',
            '#22c55e',
            '#10b981',
            '#14b8a6',
            '#06b6d4',
            '#0ea5e9',
            '#3b82f6',
            '#6366f1',
            '#8b5cf6',
            '#a855f7',
            '#d946ef',
            '#ec4899',
            '#f43f5e',
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
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const color = generateRandomColor();

            const response = await API_CONFIG.smartFetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/Tag',
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        accept: 'application/json, text/plain, */*',
                        'content-type': 'application/json;charset=UTF-8',
                    },
                    body: JSON.stringify({
                        Name: tagName.toUpperCase(),
                        Color: color,
                    }),
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
            // Remove @odata.context
            if (newTag['@odata.context']) {
                delete newTag['@odata.context'];
            }

            // Update local tags list
            if (Array.isArray(window.availableTags)) {
                window.availableTags.push(newTag);
                window.cacheManager?.set('tags', window.availableTags, 'tags');
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
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        Tags: tags.map((t) => ({ Id: t.Id, Color: t.Color, Name: t.Name })),
                        OrderId: orderId,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

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
        const order =
            window.OrderStore?.get(orderId) || window.displayedData?.find((o) => o.Id === orderId);
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
        const newTags = currentTags.filter((tag) => {
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
        const order =
            window.OrderStore?.get(orderId) || window.displayedData?.find((o) => o.Id === orderId);
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
        if (currentTags.some((t) => t.Id === tagToAdd.Id)) {
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
            Color: amMaTag.Color,
        });

        if (success) {
        }

        return success;
    }

    /**
     * Process all failed orders - Add "Âm Mã" tag
     * @param {array} failedOrders - Array of failed order data
     */
    async function processFailedOrders(failedOrders) {
        if (!failedOrders || failedOrders.length === 0) return;

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

    }

    /**
     * Process successful orders - Auto remove "OK + NV" tag
     * @param {array} successOrders - Array of success order data
     */
    async function processSuccessOrders(successOrders) {
        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToProcess = successOrders.filter(
            (order) => order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );

        if (ordersToProcess.length === 0) {
            return;
        }

        let successCount = 0;
        for (const order of ordersToProcess) {
            const saleOnlineId = order.SaleOnlineIds?.[0];
            if (!saleOnlineId) continue;

            // Store the removed tag info for potential re-add on cancel
            const orderData =
                window.OrderStore?.get(saleOnlineId) ||
                window.displayedData?.find((o) => o.Id === saleOnlineId);
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
            const okTag = currentTags.find((t) => (t.Name || '').toUpperCase().startsWith('OK '));
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
            window.notificationManager?.success(
                `Đã gỡ tag "OK + NV" cho ${successCount} đơn thành công`
            );
        }

    }

    /**
     * Auto send bill for successful orders (if enabled)
     * @param {array} successOrders - Array of success order data
     */
    async function autoSendBillsIfEnabled(successOrders) {
        // Check setting from Bill Template Settings
        const billSettings = window.getBillTemplateSettings ? window.getBillTemplateSettings() : {};
        if (!billSettings.autoSendOnSuccess) {
            return;
        }

        if (!successOrders || successOrders.length === 0) return;

        // Filter orders with "Đã thanh toán" or "Đã xác nhận"
        const ordersToSend = successOrders.filter(
            (order) => order.ShowState === 'Đã thanh toán' || order.ShowState === 'Đã xác nhận'
        );
        if (ordersToSend.length === 0) {
            return;
        }

        window.notificationManager?.info(`Đang tự động gửi bill cho ${ordersToSend.length} đơn...`);

        // Use existing sendBillManually function for each order
        let sentCount = 0;
        for (let i = 0; i < ordersToSend.length; i++) {
            const order = ordersToSend[i];
            const originalIndex = successOrders.indexOf(order);

            try {
                if (typeof window.sendBillManually === 'function') {
                    // Pass skipPreview=true for auto-send to bypass preview modal
                    await window.sendBillManually(originalIndex, true);
                    sentCount++;
                }
            } catch (e) {
                console.error(`[WORKFLOW] Error auto-sending bill for order ${order.Number}:`, e);
            }

            // Small delay between sends
            await new Promise((resolve) => setTimeout(resolve, 500));
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
        const orderData = window.displayedData?.find((o) => o.Id === orderId);

        // Create a compatible order object using invoiceData as primary source
        const order = {
            Id: invoiceData.Id, // FastSaleOrder ID for TPOS API calls (e.g., 419211)
            SaleOnlineIds: [orderId], // Main table: orderId IS the SaleOnlineId (e.g., 15810000-5d48-...)
            Reference: invoiceData.Reference || orderData?.Code || orderData?.Reference,
            Number: invoiceData.Number,
            PartnerDisplayName:
                invoiceData.PartnerDisplayName ||
                invoiceData.ReceiverName ||
                orderData?.PartnerDisplayName,
            ShowState: invoiceData.ShowState,
            // Phone fields for wallet refund on cancel
            ReceiverPhone: invoiceData.ReceiverPhone || orderData?.Telephone || '',
            Phone: invoiceData.ReceiverPhone || orderData?.Telephone || '',
            AmountTotal: invoiceData.AmountTotal || orderData?.AmountTotal || 0,
        };

        // Store in a temporary global for confirmCancelOrder to access
        window._cancelOrderFromMain = order;

        // Auto-detect carrier from address if CarrierName is empty
        // Maps to correct fee tier based on CARRIER-AUTO-SELECTION.md
        let carrierName = invoiceData.CarrierName;
        if (!carrierName && invoiceData.ReceiverAddress) {
            const normalized = invoiceData.ReceiverAddress.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            // District mappings
            const districts20k = ['1', '3', '4', '5', '6', '7', '8', '10', '11'];
            const named20k = ['phu nhuan', 'binh thanh', 'tan phu', 'tan binh', 'go vap'];
            const districts30k = ['2', '12'];
            const named30k = ['binh tan', 'thu duc'];
            const districts35kTP = ['9'];
            const named35kTP = ['binh chanh', 'nha be', 'hoc mon'];
            const shipTinh = ['cu chi', 'can gio'];
            const provinceKeywords = [
                'tinh',
                'province',
                'binh duong',
                'dong nai',
                'long an',
                'tay ninh',
                'ba ria',
                'can tho',
            ];

            // Use extractDistrictFromAddress if available
            if (typeof window.extractDistrictFromAddress === 'function') {
                const districtInfo = window.extractDistrictFromAddress(
                    invoiceData.ReceiverAddress,
                    null
                );
                if (districtInfo.isProvince) {
                    carrierName = 'SHIP TỈNH';
                } else if (districtInfo.districtNumber) {
                    const num = districtInfo.districtNumber;
                    if (districts20k.includes(num)) carrierName = 'THÀNH PHỐ (20.000 đ)';
                    else if (districts30k.includes(num)) carrierName = 'THÀNH PHỐ (30.000 đ)';
                    else if (districts35kTP.includes(num)) carrierName = 'THÀNH PHỐ (35.000 đ)';
                }
            }

            // Fallback pattern matching if not detected yet
            if (!carrierName) {
                if (
                    shipTinh.some((kw) => normalized.includes(kw)) ||
                    provinceKeywords.some((kw) => normalized.includes(kw))
                ) {
                    carrierName = 'SHIP TỈNH';
                } else if (named35kTP.some((kw) => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (35.000 đ)';
                } else if (named30k.some((kw) => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (30.000 đ)';
                } else if (named20k.some((kw) => normalized.includes(kw))) {
                    carrierName = 'THÀNH PHỐ (20.000 đ)';
                } else {
                    // Check district number pattern
                    const distMatch = normalized.match(/(?:q|quan|quận)\s*\.?\s*(\d+)/);
                    if (distMatch) {
                        const num = distMatch[1];
                        if (districts20k.includes(num)) carrierName = 'THÀNH PHỐ (20.000 đ)';
                        else if (districts30k.includes(num)) carrierName = 'THÀNH PHỐ (30.000 đ)';
                        else if (districts35kTP.includes(num)) carrierName = 'THÀNH PHỐ (35.000 đ)';
                    }
                }
            }

            // Default
            if (!carrierName) carrierName = 'SHIP TỈNH';
        }

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
            CarrierName: carrierName,
            UserName: invoiceData.UserName,
            SessionIndex: invoiceData.SessionIndex,
            Comment: invoiceData.Comment,
            DeliveryNote: invoiceData.DeliveryNote,
            SaleOnlineIds: [orderId],
            OrderLines: invoiceData.OrderLines || [],
            Partner: {
                Name: invoiceData.ReceiverName,
                Phone: invoiceData.ReceiverPhone,
                Street: invoiceData.ReceiverAddress,
            },
        };

        // Create modal HTML with bill preview section
        const modalHtml = `
            <div id="cancelOrderModal" class="modal-overlay" style="display: flex; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: white; border-radius: 12px; padding: 24px; max-width: 1200px; width: 98%; max-height: 95vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="margin: 0; color: #dc2626;">
                            <i class="fas fa-times-circle"></i> Nhờ Hủy Đơn
                        </h3>
                        <button onclick="closeCancelOrderModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                    </div>

                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                        <!-- Left: Bill Preview -->
                        <div style="flex: 1.2; min-width: 400px;">
                            <div id="cancelBillPreview" style="border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; min-height: 600px; max-height: 75vh; overflow: auto;">
                                <p style="color: #9ca3af; padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i> Đang tạo bill...</p>
                            </div>
                        </div>

                        <!-- Right: Order Info & Reason -->
                        <div style="flex: 0.8; min-width: 320px;">
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
                    iframe.style.cssText =
                        'width: 100%; height: 600px; border: none; background: white;';
                    previewContainer.innerHTML = '';
                    previewContainer.appendChild(iframe);

                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iframeDoc.open();
                    iframeDoc.write(billHTML);
                    iframeDoc.close();
                } else {
                    previewContainer.innerHTML =
                        '<p style="color: #9ca3af; padding: 20px; text-align: center;">Không thể tạo bill preview</p>';
                }
            } catch (e) {
                console.error('[WORKFLOW] Error generating bill preview:', e);
                previewContainer.innerHTML =
                    '<p style="color: #ef4444; padding: 20px; text-align: center;">Lỗi tạo bill</p>';
            }
        }
    }

    /**
     * Confirm cancel order from main table
     */
    async function confirmCancelOrderFromMain() {
        // Block double-click: check if button is already disabled
        const cancelBtn = document.querySelector(
            '#cancelOrderModal button[onclick*="confirmCancelOrderFromMain"]'
        );
        if (cancelBtn?.disabled) {
            console.warn('[WORKFLOW] ⚠️ Cancel button already disabled, ignoring duplicate click');
            return;
        }

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

        // Disable button to prevent double-click
        const originalBtnText = cancelBtn?.innerHTML;
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        }

        try {
            // Step 1: Call TPOS API to cancel the order
            // Parse ID to integer - API requires Int64, not string
            const fastSaleOrderId = parseInt(order.Id, 10);
            if (fastSaleOrderId && !isNaN(fastSaleOrderId)) {
                const cancelResponse = await window.tokenManager.authenticatedFetch(
                    'https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.ActionCancel',
                    {
                        method: 'POST',
                        headers: {
                            accept: 'application/json',
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ ids: [fastSaleOrderId] }),
                    }
                );

                if (!cancelResponse.ok) {
                    const errorText = await cancelResponse.text();
                    console.error(
                        '[WORKFLOW] TPOS cancel API error:',
                        cancelResponse.status,
                        errorText
                    );
                    window.notificationManager?.error(
                        `Lỗi hủy đơn trên TPOS: ${cancelResponse.status}`
                    );
                    return;
                }

                // Handle empty response (API may return 200/204 with no body)
                const responseText = await cancelResponse.text();
                const cancelResult = responseText ? JSON.parse(responseText) : { success: true };
            } else {
                console.warn(
                    '[WORKFLOW] No valid FastSaleOrder ID found, skipping TPOS cancel API'
                );
            }

            // Step 2: Save to delete store
            await InvoiceStatusDeleteStore.add(
                saleOnlineId,
                {
                    ...invoiceData,
                    ...order,
                    SaleOnlineId: saleOnlineId,
                },
                reason
            );

            // Trả lại sản phẩm vào Kho Đi Chợ nếu đã hoàn thành đối soát (non-blocking)
            if (invoiceData.StateCode === 'CrossCheckComplete' && invoiceData.OrderLines?.length) {
                try {
                    const restoreItems = invoiceData.OrderLines.map(line => {
                        const nameStr = line.ProductName || line.Name || '';
                        const codeMatch = nameStr.match(/\[([^\]]+)\]/);
                        const productCode = codeMatch ? codeMatch[1].trim() : '';
                        return {
                            product_code: productCode,
                            parent_product_code: null,
                            product_name: nameStr,
                            variant: null,
                            quantity: Math.floor(line.ProductUOMQty || 1),
                            purchase_price: line.PriceUnit || 0,
                            source_po_id: 'cancel_' + (order.Number || order.Reference || saleOnlineId)
                        };
                    }).filter(i => i.product_code);

                    if (restoreItems.length > 0) {
                        fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/kho-di-cho/batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: restoreItems })
                        }).then(r => r.json()).then(res => {
                            if (res.success) console.log('[KhoDiCho] Đã trả kho:', restoreItems.length, 'SP');
                        }).catch(err => console.warn('[KhoDiCho] Trả kho lỗi:', err));
                    }
                } catch (err) {
                    console.warn('[KhoDiCho] Restore error:', err);
                }
            }

            // Step 3: Delete from InvoiceStatusStore (localStorage + Firebase)
            if (window.InvoiceStatusStore?.delete) {
                await window.InvoiceStatusStore.delete(saleOnlineId);
                // Hook: Processing tag rollback to previous position
                if (window.onPtagBillCancelled) window.onPtagBillCancelled(saleOnlineId);
            }

            // Step 4: Add "OK + định danh" tag using quickAssignTag
            const orderCode = order.Reference || order.Number || '';
            if (typeof window.quickAssignTag === 'function') {
                await window.quickAssignTag(saleOnlineId, orderCode, 'ok');
            } else {
                console.warn('[WORKFLOW] quickAssignTag function not available');
            }

            // Step 5: Update SaleOnline order status to "Nháp"
            if (typeof window.updateOrderStatus === 'function') {
                await window.updateOrderStatus(saleOnlineId, 'Nháp', 'Nháp', '#f0ad4e');
            } else {
                console.warn('[WORKFLOW] updateOrderStatus function not available');
            }

            // Step 6: Log cancel activity & refund wallet
            const orderNumber = order.Number || order.Reference || '';
            const customerPhone =
                order.Partner?.Phone ||
                order.PartnerPhone ||
                order.Partner?.PartnerPhone ||
                order.ReceiverPhone ||
                order.Phone ||
                '';
            if (customerPhone) {
                try {
                    await logCancelOrderActivity(customerPhone, orderNumber, order, reason, invoiceData?.Comment);
                } catch (refundErr) {
                    console.error('[WORKFLOW] ❌ Wallet refund/activity failed:', refundErr.message);
                    window.notificationManager?.error(
                        `⚠️ Đơn đã hủy nhưng hoàn ví thất bại. Liên hệ admin để hoàn ví thủ công cho đơn ${orderNumber}`
                    );
                }
            } else {
                console.warn(
                    `[WORKFLOW] No phone found for cancel activity, order: ${orderNumber}`
                );
            }

            window.notificationManager?.success(
                `Đã lưu yêu cầu hủy đơn: ${order.Number || order.Reference}`
            );
            closeCancelOrderModal();

            // Update main table UI - show "−" since invoice was deleted
            const row = document.querySelector(`tr[data-order-id="${saleOnlineId}"]`);
            if (row) {
                const invoiceCell = row.querySelector('td[data-column="invoice-status"]');
                if (invoiceCell) {
                    invoiceCell.innerHTML = '<span style="color: #9ca3af;">−</span>';
                }

                // Update fulfillment ("Ra đơn") cell immediately
                const fd = window.parent?.FulfillmentData || window.FulfillmentData;
                if (fd?.injectDeleteEntry) {
                    fd.injectDeleteEntry(saleOnlineId, {
                        ...invoiceData,
                        ...order,
                        SaleOnlineId: saleOnlineId,
                        cancelReason: reason,
                        deletedAt: Date.now(),
                    });
                }
                const fulfillmentCell = row.querySelector('td[data-column="fulfillment"]');
                if (fulfillmentCell && typeof window.renderFulfillmentCell === 'function') {
                    fulfillmentCell.innerHTML = window.renderFulfillmentCell({ Id: saleOnlineId });
                }
            }

            // Clear temp data
            delete window._cancelOrderFromMain;
        } catch (error) {
            console.error('[WORKFLOW] Error saving cancel order:', error);
            window.notificationManager?.error('Lỗi lưu yêu cầu hủy đơn');

            // Re-enable button on error
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.innerHTML =
                    originalBtnText || '<i class="fas fa-check"></i> Xác nhận hủy';
            }
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
    // CUSTOMER ACTIVITY LOGGING & WALLET REFUND
    // =====================================================

    /**
     * Log cancel order activity to Customer 360 and refund wallet if debt was used
     * @param {string} phone - Customer phone number
     * @param {string} orderNumber - Order number (e.g., "NJD/2026/45068")
     * @param {Object} order - Order data
     * @param {string} reason - Cancellation reason
     */
    async function logCancelOrderActivity(phone, orderNumber, order, reason, originalNote) {
        const RENDER_API_URL = 'https://n2store-fallback.onrender.com';
        const performedBy = window.authManager?.getAuthState()?.username || 'system';

        try {
            let normalizedPhone = String(phone).replace(/\D/g, '');
            if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
                normalizedPhone = '0' + normalizedPhone.substring(2);
            }

            const amountTotal = parseFloat(order.AmountTotal) || 0;
            const customerName = order.Partner?.Name || order.PartnerDisplayName || '';

            // Step 1: Try to refund wallet if debt was used
            let refundResult = null;
            try {
                const refundResponse = await fetch(
                    `${RENDER_API_URL}/api/v2/wallets/refund-by-order`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            order_id: orderNumber,
                            phone: normalizedPhone,
                            reason: reason,
                            created_by: performedBy,
                            original_note: originalNote || '',
                        }),
                    }
                );

                if (!refundResponse.ok) {
                    const errText = await refundResponse.text().catch(() => '');
                    console.error(
                        `[WORKFLOW] ❌ Refund API error ${refundResponse.status}:`,
                        errText
                    );
                } else {
                    refundResult = await refundResponse.json();

                    if (refundResult.success && refundResult.refunded) {
                        window.notificationManager?.info(
                            `Đã hoàn ${refundResult.data.refund_amount.toLocaleString('vi-VN')}đ vào ví khách (Thật: ${refundResult.data.real_refunded.toLocaleString('vi-VN')}đ, CN: ${refundResult.data.virtual_refunded.toLocaleString('vi-VN')}đ)`,
                            5000
                        );
                    } else if (refundResult.success && refundResult.cancelled_pending) {
                        window.notificationManager?.info('Đã hủy giao dịch trừ ví chờ xử lý');
                    } else {
                    }
                }
            } catch (refundError) {
                console.error('[WORKFLOW] ❌ Wallet refund failed:', refundError.message);
            }

            // Step 2: Log ORDER_CANCELLED activity
            let description = `Hủy đơn hàng #${orderNumber}`;
            if (customerName) description += ` - ${customerName}`;
            description += `. Tổng: ${amountTotal.toLocaleString('vi-VN')}đ. Lý do: ${reason}`;

            if (refundResult?.refunded && refundResult?.data) {
                description += `. Hoàn ví: ${refundResult.data.refund_amount.toLocaleString('vi-VN')}đ (Thật: ${refundResult.data.real_refunded.toLocaleString('vi-VN')}đ, Công nợ: ${refundResult.data.virtual_refunded.toLocaleString('vi-VN')}đ)`;
            }

            const metadata = {
                order_number: orderNumber,
                order_id: order.Id,
                amount_total: amountTotal,
                cancel_reason: reason,
                source: 'FAST_SALE_CANCEL',
            };
            if (refundResult?.refunded && refundResult?.data) {
                metadata.wallet_refunded = true;
                metadata.refund_amount = refundResult.data.refund_amount;
                metadata.real_refunded = refundResult.data.real_refunded;
                metadata.virtual_refunded = refundResult.data.virtual_refunded;
            }

            const activityResponse = await fetch(
                `${RENDER_API_URL}/api/v2/customers/${normalizedPhone}/activities`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        activity_type: 'ORDER_CANCELLED',
                        title: `Hủy đơn #${orderNumber}`,
                        description,
                        reference_type: 'order',
                        reference_id: orderNumber,
                        metadata,
                        icon: 'cancel',
                        color: 'red',
                        created_by: performedBy,
                    }),
                }
            );

            if (!activityResponse.ok) {
                const errText = await activityResponse.text().catch(() => '');
                console.error(
                    `[WORKFLOW] ❌ Activity API error ${activityResponse.status}:`,
                    errText
                );
            } else {
            }
        } catch (error) {
            console.error('[WORKFLOW] ❌ Error logging cancel activity:', error.message);
        }
    }

    // =====================================================
    // INITIALIZATION & EXPORTS
    // =====================================================

    async function initWorkflow() {
        await InvoiceStatusDeleteStore.init();
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
    window.findOrCreateTag = findOrCreateTag;
    window.assignTagsToOrder = assignTagsToOrder;
    window.logCancelOrderActivity = logCancelOrderActivity;
})();
