/**
 * Fast Sale Invoice Status Module
 * - Adds "Phiếu bán hàng" column with StateCode display
 * - Manual bill sending via Messenger button
 * - Disables auto-send bill feature
 *
 * @version 1.0.0
 * @author Claude
 */

(function() {
    'use strict';

    // Track orders that have sent bills successfully
    const sentBillOrders = new Set();

    /**
     * StateCode configuration mapping
     * Based on TPOS API response StateCode values
     */
    const STATE_CODE_CONFIG = {
        'draft': {
            label: 'Nháp',
            cssClass: 'text-info-lt badge badge-empty',
            color: '#17a2b8'
        },
        'NotEnoughInventory': {
            label: 'Chờ nhập hàng',
            cssClass: 'text-warning-dk',
            color: '#e67e22'
        },
        'cancel': {
            label: 'Bao gồm hủy do gộp đơn',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'IsMergeCancel': {
            label: 'Bao gồm hủy do gộp đơn',
            cssClass: 'text-danger',
            color: '#6c757d',
            style: 'text-decoration: line-through;'
        },
        'CrossCheckingError': {
            label: 'Lỗi đối soát',
            cssClass: 'text-danger-dker',
            color: '#c0392b'
        },
        'CrossCheckComplete': {
            label: 'Đã đối soát xong',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossCheckSuccess': {
            label: 'Đối soát thành công',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'CrossChecking': {
            label: 'Đang đối soát theo vận đơn',
            cssClass: 'text-success-dk',
            color: '#27ae60'
        },
        'None': {
            label: 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        }
    };

    /**
     * Get StateCode display configuration
     * @param {string} stateCode - StateCode from API
     * @param {boolean} isMergeCancel - IsMergeCancel flag
     * @returns {Object} Configuration object with label, cssClass, color, style
     */
    function getStateCodeConfig(stateCode, isMergeCancel) {
        // Handle IsMergeCancel special case
        if (isMergeCancel) {
            return STATE_CODE_CONFIG['IsMergeCancel'];
        }

        // Handle cancel state
        if (stateCode === 'cancel') {
            return STATE_CODE_CONFIG['cancel'];
        }

        // Get config or default
        const config = STATE_CODE_CONFIG[stateCode];
        if (config) {
            return config;
        }

        // Default for unknown states
        return {
            label: stateCode || 'Chưa đối soát',
            cssClass: 'text-secondary',
            color: '#6c757d'
        };
    }

    /**
     * Render StateCode badge HTML
     * @param {Object} order - Order object from API response
     * @returns {string} HTML string for badge
     */
    function renderStateCodeBadge(order) {
        const stateCode = order.StateCode || 'None';
        const isMergeCancel = order.IsMergeCancel === true;
        const config = getStateCodeConfig(stateCode, isMergeCancel);

        const style = config.style || '';
        return `<span class="state-code-badge ${config.cssClass}" style="color: ${config.color}; font-weight: 500; ${style}">${config.label}</span>`;
    }

    /**
     * Render Messenger send button
     * @param {number} index - Order index in the results array
     * @param {Object} order - Order object
     * @returns {string} HTML string for button
     */
    function renderMessengerButton(index, order) {
        const orderId = order.Id;
        const orderNumber = order.Number || order.Reference;

        // Check if already sent
        if (sentBillOrders.has(orderId) || sentBillOrders.has(orderNumber)) {
            return `<span class="bill-sent-badge" style="color: #27ae60; font-size: 12px;" title="Đã gửi bill">✓</span>`;
        }

        return `
            <button type="button"
                class="btn-send-bill-messenger"
                data-index="${index}"
                data-order-id="${orderId}"
                data-order-number="${orderNumber}"
                onclick="window.sendBillManually(${index})"
                title="Gửi bill qua Messenger"
                style="background: #0084ff; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/>
                </svg>
            </button>
        `;
    }

    /**
     * Override renderSuccessOrdersTable to add "Phiếu bán hàng" column
     * This replaces the original function from tab1-fast-sale.js
     */
    function renderSuccessOrdersTableWithInvoiceStatus() {
        const container = document.getElementById('successOrdersTable');
        if (!container) return;

        // Access global fastSaleResultsData
        const resultsData = window.fastSaleResultsData;
        if (!resultsData || resultsData.success.length === 0) {
            container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thành công</p>';
            return;
        }

        const html = `
            <table class="fast-sale-results-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="width: 40px;"><input type="checkbox" id="selectAllSuccess" onchange="toggleAllSuccessOrders(this.checked)"></th>
                        <th>Mã</th>
                        <th>Số phiếu</th>
                        <th>Trạng thái</th>
                        <th>Phiếu bán hàng</th>
                        <th>Khách hàng</th>
                        <th>Mã vận đơn</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultsData.success.map((order, index) => `
                        <tr data-order-id="${order.Id}" data-order-index="${index}">
                            <td>${index + 1}</td>
                            <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                            <td>${order.Reference || 'N/A'}</td>
                            <td>${order.Number || ''}</td>
                            <td><span style="color: #10b981; font-weight: 600;">✓ ${order.ShowState || 'Nhập'}</span></td>
                            <td class="invoice-status-cell" data-order-id="${order.Id}">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    ${renderStateCodeBadge(order)}
                                    ${renderMessengerButton(index, order)}
                                </div>
                            </td>
                            <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                            <td>${order.TrackingRef || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    }

    /**
     * Send bill manually for a specific order
     * @param {number} index - Order index in fastSaleResultsData.success
     */
    async function sendBillManually(index) {
        const resultsData = window.fastSaleResultsData;
        if (!resultsData || !resultsData.success[index]) {
            window.notificationManager.error('Không tìm thấy đơn hàng', 'Lỗi');
            return;
        }

        const order = resultsData.success[index];
        const orderNumber = order.Number || order.Reference;

        // Confirm before sending
        const confirmed = confirm(`Xác nhận gửi bill cho đơn hàng ${orderNumber}?`);
        if (!confirmed) {
            return;
        }

        // Find button and show loading
        const button = document.querySelector(`button.btn-send-bill-messenger[data-index="${index}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
        }

        try {
            // Find original order data
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            // Find saleOnline order for chat info
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const displayedData = window.displayedData || [];
            let saleOnlineOrder = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            if (!saleOnlineOrder) {
                const saleOnlineName = order.SaleOnlineNames?.[0];
                if (saleOnlineName) {
                    saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
                }
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find(o => o.PartnerId === order.PartnerId);
            }

            if (!saleOnlineOrder) {
                throw new Error('Không tìm thấy thông tin khách hàng để gửi bill');
            }

            const psid = saleOnlineOrder.Facebook_ASUserId;
            const postId = saleOnlineOrder.Facebook_PostId;
            const channelId = postId ? postId.split('_')[0] : null;

            if (!psid || !channelId) {
                throw new Error('Không có thông tin Messenger của khách hàng');
            }

            // Get CarrierName and OrderLines
            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            const carrierName = carrierNameFromDropdown ||
                originalOrder?.Carrier?.Name ||
                originalOrder?.CarrierName ||
                order.CarrierName ||
                order.Carrier?.Name ||
                '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrder?.Details) {
                orderLines = saleOnlineOrder.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    Quantity: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            // Enriched order for bill generation
            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
            };

            console.log('[INVOICE-STATUS] Sending bill manually for order:', orderNumber);

            // Check for pre-generated bill data
            const cachedData = window.preGeneratedBillData?.get(order.Id) ||
                window.preGeneratedBillData?.get(orderNumber);

            const sendOptions = {};
            if (cachedData && cachedData.contentUrl && cachedData.contentId) {
                console.log(`[INVOICE-STATUS] Using pre-generated bill for ${orderNumber}`);
                sendOptions.preGeneratedContentUrl = cachedData.contentUrl;
                sendOptions.preGeneratedContentId = cachedData.contentId;
            }

            // Send bill using existing function from bill-service.js
            const result = await window.sendBillToCustomer(enrichedOrder, channelId, psid, sendOptions);

            if (result.success) {
                console.log(`[INVOICE-STATUS] ✅ Bill sent successfully for ${orderNumber}`);

                // Mark as sent
                sentBillOrders.add(order.Id);
                sentBillOrders.add(orderNumber);

                // Update UI - replace button with checkmark
                const cell = document.querySelector(`.invoice-status-cell[data-order-id="${order.Id}"]`);
                if (cell) {
                    const buttonContainer = cell.querySelector('.btn-send-bill-messenger')?.parentElement;
                    if (buttonContainer) {
                        const btn = buttonContainer.querySelector('.btn-send-bill-messenger');
                        if (btn) {
                            btn.outerHTML = `<span class="bill-sent-badge" style="color: #27ae60; font-size: 14px;" title="Đã gửi bill">✓ Đã gửi</span>`;
                        }
                    }
                }

                window.notificationManager.success(`Đã gửi bill cho đơn ${orderNumber}`, 'Thành công');
            } else {
                throw new Error(result.error || 'Gửi bill thất bại');
            }

        } catch (error) {
            console.error('[INVOICE-STATUS] Error sending bill:', error);
            window.notificationManager.error(`Lỗi gửi bill: ${error.message}`, 'Lỗi');

            // Restore button
            if (button) {
                button.disabled = false;
                button.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm6 7.46l-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.69-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.69.63z"/>
                    </svg>
                `;
            }
        }
    }

    /**
     * Modified printSuccessOrders to disable auto-send
     * Only opens print popup, does NOT send bills automatically
     */
    async function printSuccessOrdersWithoutAutoSend(type) {
        const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
            .map(cb => parseInt(cb.value));

        if (selectedIndexes.length === 0) {
            window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng để in', 'Thông báo');
            return;
        }

        const resultsData = window.fastSaleResultsData;
        const selectedOrders = selectedIndexes.map(i => resultsData.success[i]);
        const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

        if (orderIds.length === 0) {
            window.notificationManager.error('Không tìm thấy ID đơn hàng để in', 'Lỗi');
            return;
        }

        console.log(`[INVOICE-STATUS] Printing ${type} for ${orderIds.length} orders (auto-send DISABLED)`);

        // For invoice type, use custom bill WITHOUT auto-send
        if (type === 'invoice') {
            const fastSaleOrdersData = window.fastSaleOrdersData || [];
            const displayedData = window.displayedData || [];
            const enrichedOrders = [];

            for (let i = 0; i < selectedOrders.length; i++) {
                const order = selectedOrders[i];

                const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                    (o.SaleOnlineIds && order.SaleOnlineIds &&
                        JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                    (o.Reference && o.Reference === order.Reference)
                );
                const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

                const saleOnlineId = order.SaleOnlineIds?.[0];
                const saleOnlineOrderForData = saleOnlineId
                    ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                    : null;

                const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
                const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
                const carrierName = carrierNameFromDropdown ||
                    originalOrder?.Carrier?.Name ||
                    originalOrder?.CarrierName ||
                    order.CarrierName ||
                    order.Carrier?.Name ||
                    '';
                const shippingFee = originalOrderIndex >= 0
                    ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                    : order.DeliveryPrice || 0;

                let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
                if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                    orderLines = saleOnlineOrderForData.Details.map(d => ({
                        ProductName: d.ProductName || d.ProductNameGet || '',
                        ProductNameGet: d.ProductNameGet || d.ProductName || '',
                        ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                        Quantity: d.Quantity || d.ProductUOMQty || 1,
                        PriceUnit: d.Price || d.PriceUnit || 0,
                        Note: d.Note || ''
                    }));
                }

                const enrichedOrder = {
                    ...order,
                    OrderLines: orderLines,
                    CarrierName: carrierName,
                    DeliveryPrice: shippingFee,
                    PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
                };

                enrichedOrders.push(enrichedOrder);
            }

            // Only open print popup - NO auto-send
            if (enrichedOrders.length > 0) {
                console.log('[INVOICE-STATUS] Opening combined print popup for', enrichedOrders.length, 'bills (NO auto-send)');
                window.openCombinedPrintPopup(enrichedOrders);
            }

            // Clear checkboxes
            window.selectedOrderIds?.clear();
            document.querySelectorAll('#ordersTable input[type="checkbox"]:checked').forEach(cb => {
                cb.checked = false;
            });
            const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"]');
            if (headerCheckbox) headerCheckbox.checked = false;
            if (typeof window.updateActionButtons === 'function') {
                window.updateActionButtons();
            }

            // Show notification that auto-send is disabled
            window.notificationManager.info(
                `Đã mở in ${enrichedOrders.length} bill. Bấm nút Messenger để gửi bill thủ công.`,
                4000
            );

            return;
        }

        // For shipping and picking types, use original logic
        // Call original function for non-invoice types
        if (window._originalPrintSuccessOrders) {
            return window._originalPrintSuccessOrders(type);
        }
    }

    /**
     * Initialize module - override functions
     */
    function init() {
        console.log('[INVOICE-STATUS] Initializing Fast Sale Invoice Status module...');

        // Save original function reference
        if (typeof window.printSuccessOrders === 'function' && !window._originalPrintSuccessOrders) {
            window._originalPrintSuccessOrders = window.printSuccessOrders;
        }

        // Override renderSuccessOrdersTable
        window.renderSuccessOrdersTable = renderSuccessOrdersTableWithInvoiceStatus;

        // Override printSuccessOrders to disable auto-send
        window.printSuccessOrders = printSuccessOrdersWithoutAutoSend;

        // Expose manual send function
        window.sendBillManually = sendBillManually;

        // Expose StateCode config for external use
        window.getStateCodeConfig = getStateCodeConfig;
        window.renderStateCodeBadge = renderStateCodeBadge;

        console.log('[INVOICE-STATUS] Module initialized successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also initialize after a short delay to ensure tab1-fast-sale.js is loaded
    setTimeout(init, 100);

})();
