// ====================================
// #region IMAGE ZOOM
// ====================================

/**
 * Show image zoom overlay
 * @param {string} imageUrl - URL of the image to zoom
 * @param {string} productName - Name of the product (for caption)
 */
window.showImageZoom = function (imageUrl, productName = '') {
    const overlay = document.getElementById('imageZoomOverlay');
    const img = document.getElementById('imageZoomImg');
    const caption = document.getElementById('imageZoomCaption');

    if (!overlay || !img) {
        console.error('[IMAGE-ZOOM] Overlay elements not found');
        return;
    }

    // Set image source
    img.src = imageUrl;

    // Set caption if provided
    if (caption && productName) {
        caption.textContent = productName;
        caption.style.display = 'block';
    } else if (caption) {
        caption.style.display = 'none';
    }

    // Show overlay with animation
    overlay.classList.add('show');

    // Prevent body scroll when overlay is open
    document.body.style.overflow = 'hidden';

    console.log('[IMAGE-ZOOM] Showing image:', imageUrl);
};

/**
 * Close image zoom overlay
 */
window.closeImageZoom = function () {
    const overlay = document.getElementById('imageZoomOverlay');
    if (!overlay) return;

    // Hide overlay
    overlay.classList.remove('show');

    // Restore body scroll
    document.body.style.overflow = '';

    console.log('[IMAGE-ZOOM] Closed');
};

// Close on ESC key
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const overlay = document.getElementById('imageZoomOverlay');
        if (overlay && overlay.classList.contains('show')) {
            window.closeImageZoom();
        }
    }
});

// #endregion IMAGE ZOOM

// =====================================================
// FAST SALE MODAL (Tạo nhanh PBH)
// =====================================================

let fastSaleOrdersData = [];

/**
 * Show Fast Sale Modal and fetch data for selected orders
 */
async function showFastSaleModal() {
    const modal = document.getElementById('fastSaleModal');
    const modalBody = document.getElementById('fastSaleModalBody');
    const subtitle = document.getElementById('fastSaleModalSubtitle');

    // Reset state
    fastSaleOrdersData = [];

    // Show modal with loading state
    modal.classList.add('show');
    modalBody.innerHTML = `
        <div class="merge-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Đang tải dữ liệu đơn hàng...</p>
        </div>
    `;

    try {
        // Get selected order IDs
        const selectedIds = Array.from(selectedOrderIds);

        if (selectedIds.length === 0) {
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Vui lòng chọn ít nhất một đơn hàng.</p>
                </div>
            `;
            return;
        }

        subtitle.textContent = `Đã chọn ${selectedIds.length} đơn hàng`;

        // Fetch FastSaleOrder data using batch API
        fastSaleOrdersData = await fetchFastSaleOrdersData(selectedIds);

        if (fastSaleOrdersData.length === 0) {
            modalBody.innerHTML = `
                <div class="merge-no-duplicates">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Không thể tải dữ liệu đơn hàng. Vui lòng thử lại.</p>
                </div>
            `;
            return;
        }

        // Render modal body
        renderFastSaleModalBody();

    } catch (error) {
        console.error('[FAST-SALE] Error loading data:', error);
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-exclamation-circle"></i>
                <p>Đã xảy ra lỗi khi tải dữ liệu: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Close Fast Sale Modal
 */
function closeFastSaleModal() {
    const modal = document.getElementById('fastSaleModal');
    modal.classList.remove('show');

    // Reset state
    fastSaleOrdersData = [];
}

/**
 * Fetch FastSaleOrder data for multiple orders (batch)
 * @param {Array<string>} orderIds - Array of Order IDs
 * @returns {Promise<Array<Object>>} Array of FastSaleOrder data
 */
async function fetchFastSaleOrdersData(orderIds) {
    try {
        const headers = await window.tokenManager.getAuthHeader();

        // Fetch FastSaleOrder using POST with order IDs
        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.GetListOrderIds?$expand=OrderLines,Partner,Carrier`;

        console.log(`[FAST-SALE] Fetching ${orderIds.length} orders from API...`);

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ids: orderIds
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.value && data.value.length > 0) {
            console.log(`[FAST-SALE] Successfully fetched ${data.value.length} FastSaleOrders`);
            return data.value;
        } else {
            console.warn(`[FAST-SALE] No FastSaleOrder found for ${orderIds.length} orders`);
            return [];
        }
    } catch (error) {
        console.error(`[FAST-SALE] Error fetching orders:`, error);

        // Fallback: return basic data from displayedData
        console.warn('[FAST-SALE] Using fallback data from displayedData');
        return orderIds.map(orderId => {
            // O(1) via OrderStore with fallback
            const order = window.OrderStore?.get(orderId) || displayedData.find(o => o.Id === orderId);
            if (!order) return null;

            return {
                Id: null,
                Reference: order.Code,
                PartnerDisplayName: order.Name || order.PartnerName,
                PartnerPhone: order.Telephone,
                PartnerAddress: order.Address,
                DeliveryPrice: 35000,
                CarrierName: 'SHIP TỈNH',
                SaleOnlineOrder: order,
                OrderLines: order.Details || [],
                NotFound: true
            };
        }).filter(o => o !== null);
    }
}

/**
 * Render Fast Sale Modal Body
 */
async function renderFastSaleModalBody() {
    const modalBody = document.getElementById('fastSaleModalBody');

    if (fastSaleOrdersData.length === 0) {
        modalBody.innerHTML = `
            <div class="merge-no-duplicates">
                <i class="fas fa-inbox"></i>
                <p>Không có dữ liệu để hiển thị.</p>
            </div>
        `;
        return;
    }

    // Fetch delivery carriers first
    const carriers = await fetchDeliveryCarriers();
    console.log(`[FAST-SALE] Fetched ${carriers.length} delivery carriers`);

    // Render table similar to the image provided
    const html = `
        <div class="fast-sale-container">
            <div class="fast-sale-header">
                <div class="fast-sale-partner-select">
                    <label for="fastSalePartner">Đối tác giao hàng</label>
                    <select id="fastSalePartner" class="form-control">
                        <option value="">-- Chọn mặc định --</option>
                        ${carriers.map(c => {
        const fee = c.Config_DefaultFee || c.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        return `<option value="${c.Id}" data-fee="${fee}" data-name="${c.Name}">${c.Name}${feeText}</option>`;
    }).join('')}
                    </select>
                </div>
                <div class="fast-sale-search">
                    <label>Nhập từ khóa tìm kiếm</label>
                    <select class="form-control">
                        <option>Nhập từ khóa tìm kiếm</option>
                    </select>
                </div>
                <div class="fast-sale-note">
                    <p style="color: #dc2626; font-size: 13px; margin: 0;">
                        <i class="fas fa-exclamation-triangle"></i>
                        Phần mềm sẽ tự chọn với số tiền ship thấp nhất
                    </p>
                    <p style="color: #dc2626; font-size: 13px; margin: 4px 0 0 0;">
                        <i class="fas fa-info-circle"></i>
                        Lưu ý: Chỉ có thể tìm kiếm đơn hàng phát sinh trong 2 tháng vừa qua!
                    </p>
                </div>
            </div>
            <div class="fast-sale-table-wrapper">
                <table class="fast-sale-table">
                    <thead>
                        <tr>
                            <th>STT</th>
                            <th>Sản phẩm</th>
                            <th>Số lượng</th>
                            <th>Số tiền</th>
                            <th>Tổng tiền</th>
                            <th>Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fastSaleOrdersData.map((order, index) => renderFastSaleOrderRow(order, index, carriers)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    modalBody.innerHTML = html;

    // Auto-select carriers for each order based on address
    setTimeout(() => {
        fastSaleOrdersData.forEach((order, index) => {
            const rowCarrierSelect = document.querySelector(`#fastSaleCarrier_${index}`);
            if (rowCarrierSelect && rowCarrierSelect.options.length > 1) {
                // Get address from SaleOnlineOrder
                let address = '';
                let saleOnlineOrder = null;
                if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
                    const saleOnlineId = order.SaleOnlineIds[0];
                    // O(1) via OrderStore with fallback
                    saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
                    address = saleOnlineOrder?.Address || '';
                }

                if (address) {
                    console.log(`[FAST-SALE] Auto-selecting carrier for order ${index} with address: ${address}`);
                    smartSelectCarrierForRow(rowCarrierSelect, address, null);
                }
            }
        });
    }, 100);
}

/**
 * Render a single order row in Fast Sale Modal
 * @param {Object} order - FastSaleOrder data
 * @param {number} index - Row index
 * @param {Array} carriers - Array of delivery carriers
 * @returns {string} HTML string
 */
function renderFastSaleOrderRow(order, index, carriers = []) {
    // Get SaleOnlineOrder from displayedData to get phone and address - O(1) via OrderStore
    let saleOnlineOrder = null;
    if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
        const saleOnlineId = order.SaleOnlineIds[0];
        saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
    }

    const customerName = order.PartnerDisplayName || order.Partner?.PartnerDisplayName || saleOnlineOrder?.Name || 'N/A';
    const customerCode = order.Reference || 'N/A';

    // Get phone from SaleOnlineOrder first, then fallback to FastSaleOrder
    const customerPhone = saleOnlineOrder?.Telephone || order.PartnerPhone || order.Partner?.PartnerPhone || 'N/A';

    // Get address from SaleOnlineOrder first, then fallback to FastSaleOrder
    const customerAddress = saleOnlineOrder?.Address || order.Partner?.PartnerAddress || '*Chưa có địa chỉ';

    // Get products from OrderLines or SaleOnlineOrder Details
    const products = order.OrderLines || saleOnlineOrder?.Details || [];

    // Build carrier options
    const carrierOptions = carriers.map(c => {
        const fee = c.Config_DefaultFee || c.FixedPrice || 0;
        const feeText = fee > 0 ? ` (${formatCurrencyVND(fee)})` : '';
        return `<option value="${c.Id}" data-fee="${fee}" data-name="${c.Name}">${c.Name}${feeText}</option>`;
    }).join('');

    // Get default shipping fee from order or use 35000
    const defaultShippingFee = order.DeliveryPrice || 35000;

    // Build product rows
    const productRows = products.map((product, pIndex) => {
        const productName = product.ProductName || 'N/A';
        const quantity = product.ProductUOMQty || product.Quantity || 0;
        const price = product.PriceUnit || product.Price || 0;
        const total = product.PriceSubTotal || (quantity * price) || 0;
        const note = product.Note || '';

        return `
            <tr>
                ${pIndex === 0 ? `
                    <td rowspan="${products.length}" style="vertical-align: top;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-weight: 600;">${customerName}</div>
                            <div style="font-size: 12px; color: #6b7280;">${customerCode}</div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <i class="fas fa-phone" style="font-size: 10px; color: #9ca3af;"></i>
                                <span style="font-size: 12px;">${customerPhone}</span>
                            </div>
                            ${order.ShowShipStatus ? `<span class="badge" style="background: #10b981; color: white; font-size: 11px; padding: 2px 6px; border-radius: 4px;">Bom hàng</span>` : ''}
                            <div style="font-size: 12px; color: #6b7280;">
                                <i class="fas fa-map-marker-alt" style="font-size: 10px;"></i>
                                ${customerAddress}
                            </div>
                            <div style="font-size: 11px; color: #9ca3af;">
                                Chiến dịch Live: ${order.SaleOnlineNames || 'N/A'}
                            </div>
                            <div style="margin-top: 8px;">
                                <div style="font-size: 11px; color: #6b7280;">Đối tác:</div>
                                <select id="fastSaleCarrier_${index}" class="form-control form-control-sm fast-sale-carrier-select"
                                        data-row-index="${index}"
                                        style="font-size: 12px; margin-top: 4px;"
                                        onchange="updateFastSaleShippingFee(${index})">
                                    <option value="">-- Chọn --</option>
                                    ${carrierOptions}
                                </select>
                            </div>
                            <div style="margin-top: 4px;">
                                <div style="font-size: 11px; color: #6b7280;">Tiền ship:</div>
                                <input id="fastSaleShippingFee_${index}" type="number" class="form-control form-control-sm"
                                       value="${defaultShippingFee}" style="font-size: 12px; margin-top: 4px;" />
                            </div>
                            <div style="margin-top: 4px;">
                                <div style="font-size: 11px; color: #6b7280;">KL (g)</div>
                                <input id="fastSaleWeight_${index}" type="number" class="form-control form-control-sm" value="100" style="font-size: 12px; margin-top: 4px;" />
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 8px;">
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều dài:</div>
                                    <input id="fastSaleLength_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều rộng:</div>
                                    <input id="fastSaleWidth_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                                <div style="flex: 1;">
                                    <div style="font-size: 11px; color: #6b7280;">Chiều cao:</div>
                                    <input id="fastSaleHeight_${index}" type="number" class="form-control form-control-sm" value="0.00" style="font-size: 12px; margin-top: 4px;" step="0.01" />
                                </div>
                            </div>
                        </div>
                    </td>
                ` : ''}
                <td>
                    <div style="font-weight: 500; font-size: 13px;">${productName}</div>
                </td>
                <td style="text-align: center;">${quantity}</td>
                <td style="text-align: right;">${price.toLocaleString('vi-VN')}</td>
                <td style="text-align: right; font-weight: 600;">${total.toLocaleString('vi-VN')}</td>
                <td>${note}</td>
            </tr>
        `;
    }).join('');

    return productRows;
}

/**
 * Update shipping fee when carrier is selected for a row
 * @param {number} index - Row index
 */
function updateFastSaleShippingFee(index) {
    const carrierSelect = document.getElementById(`fastSaleCarrier_${index}`);
    const shippingFeeInput = document.getElementById(`fastSaleShippingFee_${index}`);

    if (carrierSelect && shippingFeeInput) {
        const selectedOption = carrierSelect.options[carrierSelect.selectedIndex];
        const fee = parseFloat(selectedOption.dataset.fee) || 0;
        shippingFeeInput.value = fee;
    }
}

/**
 * Smart select carrier for a specific row based on address
 * @param {HTMLSelectElement} select - The carrier dropdown for this row
 * @param {string} address - Customer address
 * @param {object} extraAddress - Optional ExtraAddress object
 */
function smartSelectCarrierForRow(select, address, extraAddress = null) {
    if (!select || select.options.length <= 1) {
        return;
    }

    // Extract district info
    const districtInfo = extractDistrictFromAddress(address, extraAddress);

    if (!districtInfo) {
        console.log('[FAST-SALE] Could not extract district, selecting default carrier');
        selectCarrierByName(select, 'SHIP TỈNH', false);
        return;
    }

    // Find matching carrier
    const matchedCarrier = findMatchingCarrier(select, districtInfo);

    if (matchedCarrier) {
        console.log('[FAST-SALE] ✅ Auto-selected carrier:', matchedCarrier.name);
        select.value = matchedCarrier.id;
        select.dispatchEvent(new Event('change'));
    } else {
        console.log('[FAST-SALE] No matching carrier, selecting SHIP TỈNH');
        selectCarrierByName(select, 'SHIP TỈNH', false);
    }
}

/**
 * Collect Fast Sale data from modal inputs
 * @returns {Array<Object>} Array of order models
 */
function collectFastSaleData() {
    const models = [];

    fastSaleOrdersData.forEach((order, index) => {
        // Get input values
        const carrierSelect = document.getElementById(`fastSaleCarrier_${index}`);
        const shippingFeeInput = document.getElementById(`fastSaleShippingFee_${index}`);
        const weightInput = document.getElementById(`fastSaleWeight_${index}`);
        const lengthInput = document.getElementById(`fastSaleLength_${index}`);
        const widthInput = document.getElementById(`fastSaleWidth_${index}`);
        const heightInput = document.getElementById(`fastSaleHeight_${index}`);

        // Get carrier info
        const carrierId = parseInt(carrierSelect?.value) || 0;
        const carrierName = carrierSelect?.options[carrierSelect.selectedIndex]?.dataset?.name || '';

        // Get SaleOnlineOrder for phone and address - O(1) via OrderStore
        let saleOnlineOrder = null;
        if (order.SaleOnlineIds && order.SaleOnlineIds.length > 0) {
            const saleOnlineId = order.SaleOnlineIds[0];
            saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);
        }

        // Get dimensions
        const packageLength = parseFloat(lengthInput?.value) || 0;
        const packageWidth = parseFloat(widthInput?.value) || 0;
        const packageHeight = parseFloat(heightInput?.value) || 0;

        // Get current user ID from token or global context
        const currentUserId = window.tokenManager?.userId || window.currentUser?.Id || null;

        // Build order model matching exact API structure
        const model = {
            Id: 0,
            Name: null,
            PrintShipCount: 0,
            PrintDeliveryCount: 0,
            PaymentMessageCount: 0,
            MessageCount: 0,
            PartnerId: order.PartnerId || 0,
            PartnerDisplayName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
            PartnerEmail: null,
            PartnerFacebookId: null,
            PartnerFacebook: null,
            PartnerPhone: null,
            Reference: order.Reference || '',
            PriceListId: 0,
            AmountTotal: order.AmountTotal || 0,
            TotalQuantity: 0,
            Discount: 0,
            DiscountAmount: 0,
            DecreaseAmount: 0,
            DiscountLoyaltyTotal: null,
            WeightTotal: 0,
            AmountTax: null,
            AmountUntaxed: null,
            TaxId: null,
            MoveId: null,
            UserId: currentUserId,
            UserName: null,
            DateInvoice: new Date().toISOString(),
            DateCreated: order.DateCreated || new Date().toISOString(),
            CreatedById: null,
            State: "draft",
            ShowState: "Nháp",
            CompanyId: 0,
            Comment: "",
            WarehouseId: 0,
            SaleOnlineIds: order.SaleOnlineIds || [],
            SaleOnlineNames: Array.isArray(order.SaleOnlineNames) ? order.SaleOnlineNames : [order.SaleOnlineNames || ''],
            Residual: null,
            Type: null,
            RefundOrderId: null,
            ReferenceNumber: null,
            AccountId: 0,
            JournalId: 0,
            Number: null,
            MoveName: null,
            PartnerNameNoSign: null,
            DeliveryPrice: parseFloat(shippingFeeInput?.value) || 0,
            CustomerDeliveryPrice: null,
            CarrierId: carrierId,
            CarrierName: carrierName,
            CarrierDeliveryType: null,
            DeliveryNote: null,
            ReceiverName: null,
            ReceiverPhone: null,
            ReceiverAddress: null,
            ReceiverDate: null,
            ReceiverNote: null,
            CashOnDelivery: 0,
            TrackingRef: null,
            TrackingArea: null,
            TrackingTransport: null,
            TrackingSortLine: null,
            TrackingUrl: "",
            IsProductDefault: false,
            TrackingRefSort: null,
            ShipStatus: "none",
            ShowShipStatus: order.ShowShipStatus || "Chưa tiếp nhận",
            SaleOnlineName: order.Reference || '',
            PartnerShippingId: null,
            PaymentJournalId: null,
            PaymentAmount: 0,
            SaleOrderId: null,
            SaleOrderIds: [],
            FacebookName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
            FacebookNameNosign: null,
            FacebookId: null,
            DisplayFacebookName: null,
            Deliver: null,
            ShipWeight: parseFloat(weightInput?.value) || 100,
            ShipPaymentStatus: null,
            ShipPaymentStatusCode: null,
            OldCredit: 0,
            NewCredit: 0,
            Phone: null,
            Address: null,
            AmountTotalSigned: null,
            ResidualSigned: null,
            Origin: null,
            AmountDeposit: 0,
            CompanyName: null,
            PreviousBalance: null,
            ToPay: null,
            NotModifyPriceFromSO: false,
            Ship_ServiceId: null,
            Ship_ServiceName: null,
            Ship_ServiceExtrasText: null,
            Ship_ExtrasText: null,
            Ship_InsuranceFee: null,
            CurrencyName: null,
            TeamId: null,
            TeamOrderCode: null,
            TeamOrderId: null,
            TeamType: null,
            Revenue: null,
            SaleOrderDeposit: null,
            Seri: null,
            NumberOrder: null,
            DateOrderRed: null,
            ApplyPromotion: null,
            TimeLock: null,
            PageName: null,
            Tags: null,
            IRAttachmentUrl: null,
            IRAttachmentUrls: [],
            SaleOnlinesOfPartner: null,
            IsDeposited: null,
            LiveCampaignName: order.LiveCampaignName || '',
            LiveCampaignId: order.LiveCampaignId || null,
            Source: null,
            CartNote: null,
            ExtraPaymentAmount: null,
            QuantityUpdateDeposit: null,
            IsMergeCancel: null,
            IsPickUpAtShop: null,
            DateDeposit: null,
            IsRefund: null,
            StateCode: "None",
            ActualPaymentAmount: null,
            RowVersion: null,
            ExchangeRate: null,
            DestConvertCurrencyUnitId: null,
            WiPointQRCode: null,
            WiInvoiceId: null,
            WiInvoiceChannelId: null,
            WiInvoiceStatus: null,
            WiInvoiceTrackingUrl: "",
            WiInvoiceIsReplate: false,
            FormAction: null,
            Ship_Receiver: null,
            Ship_Extras: null,
            PaymentInfo: [],
            Search: null,
            ShipmentDetailsAship: {
                PackageInfo: {
                    PackageLength: packageLength,
                    PackageWidth: packageWidth,
                    PackageHeight: packageHeight
                }
            },
            OrderMergeds: [],
            OrderAfterMerged: null,
            TPayment: null,
            ExtraUpdateCODCarriers: [],
            AppliedPromotionLoyalty: null,
            FastSaleOrderOmniExtras: null,
            Billing: null,
            PackageInfo: {
                PackageLength: packageLength,
                PackageWidth: packageWidth,
                PackageHeight: packageHeight
            },
            Error: null,
            OrderLines: (order.OrderLines || []).map(line => ({
                Id: 0,
                OrderId: 0,
                ProductId: line.ProductId,
                ProductUOMId: line.ProductUOMId || 1,
                PriceUnit: line.PriceUnit || 0,
                ProductUOMQty: line.ProductUOMQty || 0,
                ProductUOMQtyAvailable: 0,
                UserId: null,
                Discount: 0,
                Discount_Fixed: 0,
                DiscountTotalLoyalty: null,
                PriceTotal: line.PriceTotal || line.PriceSubTotal || 0,
                PriceSubTotal: line.PriceSubTotal || 0,
                Weight: 0,
                WeightTotal: null,
                AccountId: 0,
                PriceRecent: null,
                Name: null,
                IsName: false,
                ProductName: line.ProductName || '',
                ProductUOMName: line.ProductUOMName || 'Cái',
                SaleLineIds: [],
                ProductNameGet: null,
                SaleLineId: null,
                Type: "fixed",
                PromotionProgramId: null,
                Note: line.Note || null,
                FacebookPostId: null,
                ChannelType: null,
                ProductBarcode: null,
                CompanyId: null,
                PartnerId: null,
                PriceSubTotalSigned: null,
                PromotionProgramComboId: null,
                LiveCampaign_DetailId: null,
                LiveCampaignQtyChange: 0,
                ProductImageUrl: "",
                SaleOnlineDetailId: null,
                PriceCheck: null,
                IsNotEnoughInventory: null,
                Tags: [],
                CreatedById: null,
                TrackingRef: null,
                ReturnTotal: 0,
                ConversionPrice: null
            })),
            Partner: order.Partner || {
                Id: order.PartnerId || 0,
                Name: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
                DisplayName: order.PartnerDisplayName || saleOnlineOrder?.Name || '',
                Street: saleOnlineOrder?.Address || order.Partner?.Street || null,
                Phone: saleOnlineOrder?.Telephone || order.Partner?.Phone || '',
                Customer: true,
                Type: "contact",
                CompanyType: "person",
                DateCreated: new Date().toISOString(),
                ExtraAddress: order.Partner?.ExtraAddress || null
            },
            Carrier: order.Carrier || {
                Id: carrierId,
                Name: carrierName,
                DeliveryType: "fixed",
                Config_DefaultFee: parseFloat(shippingFeeInput?.value) || 0
            }
        };

        models.push(model);
    });

    return models;
}

/**
 * Confirm and save Fast Sale (Lưu button)
 */
async function confirmFastSale() {
    await saveFastSaleOrders(false);
}

/**
 * Confirm and check Fast Sale (Lưu xác nhận button)
 */
async function confirmAndCheckFastSale() {
    await saveFastSaleOrders(true);
}

/**
 * Save Fast Sale orders to backend
 * @param {boolean} isApprove - Whether to approve orders (Lưu xác nhận)
 */
async function saveFastSaleOrders(isApprove = false) {
    try {
        console.log(`[FAST-SALE] Saving Fast Sale orders (is_approve: ${isApprove})...`);

        // Collect data from modal
        const models = collectFastSaleData();

        if (models.length === 0) {
            window.notificationManager.error('Không có dữ liệu để lưu', 'Lỗi');
            return;
        }

        // Validate required fields
        const invalidOrders = models.filter((m, index) => {
            if (!m.CarrierId || m.CarrierId === 0) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing carrier`);
                return true;
            }
            if (!m.Partner || !m.Partner.Phone) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing phone`);
                return true;
            }
            if (!m.Partner || !m.Partner.Street) {
                console.error(`[FAST-SALE] Order ${index} (${m.Reference}) missing address`);
                return true;
            }
            return false;
        });

        if (invalidOrders.length > 0) {
            window.notificationManager.error(
                `Có ${invalidOrders.length} đơn hàng thiếu thông tin bắt buộc (đối tác ship, SĐT, địa chỉ)`,
                'Lỗi validation'
            );
            return;
        }

        // Show loading notification with timeout
        const loadingNotif = window.notificationManager.info(
            `Đang ${isApprove ? 'lưu và xác nhận' : 'lưu'} ${models.length} đơn hàng...`,
            3000 // Auto-dismiss after 3 seconds
        );

        // Build request body
        const requestBody = {
            is_approve: isApprove,
            model: models
        };

        console.log('[FAST-SALE] Request body:', requestBody);

        // Call API
        const headers = await window.tokenManager.getAuthHeader();

        // Use different endpoint based on isApprove
        // "Lưu xác nhận" uses isForce=true endpoint with is_approve: true
        // "Lưu" uses normal endpoint with is_approve: false
        let url;
        if (isApprove) {
            url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner),OrdersSucessed($expand=Partner)`;
        } else {
            url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/ODataService.InsertListOrderModel?$expand=DataErrorFast($expand=Partner,OrderLines),OrdersError($expand=Partner),OrdersSucessed($expand=Partner)`;
        }

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] Save result:', result);

        // Close loading notification
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        // Show results modal
        showFastSaleResultsModal(result);

        // Note: Bill sending is handled manually via "In hóa đơn" button in printSuccessOrders()

    } catch (error) {
        console.error('[FAST-SALE] Error saving orders:', error);

        // Close loading notification on error
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        window.notificationManager.error(
            `Lỗi khi lưu đơn hàng: ${error.message}`,
            'Lỗi hệ thống'
        );
    }
}

/**
 * Store Fast Sale results data
 */
let fastSaleResultsData = {
    forced: [],
    failed: [],
    success: []
};

/**
 * Cache for pre-generated bill images and send tasks
 * Key: order ID or order Number
 * Value: { imageBlob, contentUrl, contentId, enrichedOrder, sendTask }
 */
window.preGeneratedBillData = new Map();

/**
 * Flag to track if pre-generation is in progress
 */
window.isPreGeneratingBills = false;

/**
 * Pre-generate bill images in background after orders are created
 * This runs automatically when success orders are available
 */
async function preGenerateBillImages() {
    const successOrders = fastSaleResultsData.success;
    if (!successOrders || successOrders.length === 0) {
        console.log('[FAST-SALE] No success orders to pre-generate bills for');
        return;
    }

    window.isPreGeneratingBills = true;
    // Run in background - don't disable print button

    console.log(`[FAST-SALE] 🎨 Pre-generating ${successOrders.length} bill images in background...`);
    window.preGeneratedBillData.clear();

    for (let i = 0; i < successOrders.length; i++) {
        const order = successOrders[i];

        try {
            // Find original order by matching SaleOnlineIds or Reference (same logic as printSuccessOrders)
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            // Find saleOnline order from displayedData - O(1) via OrderStore
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const saleOnlineOrderForData = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            // Get CarrierName from form dropdown
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

            // Get OrderLines
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

            // Create enriched order
            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
            };

            // Find saleOnline order for chat info
            let saleOnlineOrder = saleOnlineOrderForData;
            const saleOnlineName = order.SaleOnlineNames?.[0];
            if (!saleOnlineOrder && saleOnlineName) {
                saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find(o => o.PartnerId === order.PartnerId);
            }

            // Prepare send task
            let sendTask = null;
            if (saleOnlineOrder) {
                const psid = saleOnlineOrder.Facebook_ASUserId;
                const postId = saleOnlineOrder.Facebook_PostId;
                const channelId = postId ? postId.split('_')[0] : null;

                if (psid && channelId) {
                    sendTask = {
                        channelId,
                        psid,
                        customerName: saleOnlineOrder.Name,
                        orderNumber: order.Number
                    };
                }
            }

            // Generate bill image in background
            const imageBlob = await generateBillImage(enrichedOrder, {});

            // Upload image to Pancake immediately if we have sendTask
            let contentUrl = null;
            let contentId = null;
            if (sendTask && window.pancakeDataManager) {
                const imageFile = new File([imageBlob], `bill_${order.Number || Date.now()}.png`, { type: 'image/png' });
                const uploadResult = await window.pancakeDataManager.uploadImage(sendTask.channelId, imageFile);
                contentUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult.content_url;
                // IMPORTANT: Use content_id (hash), not id (UUID) - Pancake API expects content_id
                contentId = typeof uploadResult === 'object' ? (uploadResult.content_id || uploadResult.id) : null;
                console.log(`[FAST-SALE] 📤 Pre-uploaded bill image for ${order.Number}: ${contentUrl}, content_id: ${contentId}`);
            }

            // Cache the data
            const cacheKey = order.Id || order.Number;
            window.preGeneratedBillData.set(cacheKey, {
                imageBlob,
                contentUrl,
                contentId,
                enrichedOrder,
                sendTask
            });

            console.log(`[FAST-SALE] ✅ Pre-generated bill ${i + 1}/${successOrders.length}: ${order.Number}`);

        } catch (error) {
            console.error(`[FAST-SALE] ❌ Error pre-generating bill for ${order.Number}:`, error);
        }
    }

    console.log(`[FAST-SALE] 🎨 Pre-generation complete: ${window.preGeneratedBillData.size}/${successOrders.length} bills ready`);
    window.notificationManager.success(`Đã tạo sẵn ${window.preGeneratedBillData.size} bill images`, 2000);

    window.isPreGeneratingBills = false;
}

/**
 * Show Fast Sale Results Modal
 * @param {Object} results - API response with OrdersSucessed, OrdersError, DataErrorFast
 */
function showFastSaleResultsModal(results) {
    // Store results
    fastSaleResultsData = {
        forced: results.DataErrorFast || [],
        failed: results.OrdersError || [],
        success: results.OrdersSucessed || []
    };

    // Update counts
    document.getElementById('forcedCount').textContent = fastSaleResultsData.forced.length;
    document.getElementById('failedCount').textContent = fastSaleResultsData.failed.length;
    document.getElementById('successCount').textContent = fastSaleResultsData.success.length;

    // Render tables
    renderForcedOrdersTable();
    renderFailedOrdersTable();
    renderSuccessOrdersTable();

    // Show modal
    const modal = document.getElementById('fastSaleResultsModal');
    if (modal) {
        modal.style.display = 'flex';
    }

    // Switch to appropriate tab
    if (fastSaleResultsData.forced.length > 0) {
        switchResultsTab('forced');
    } else if (fastSaleResultsData.failed.length > 0) {
        switchResultsTab('failed');
    } else {
        switchResultsTab('success');
    }

    // Pre-generate bill images in background (don't await - run async)
    if (fastSaleResultsData.success.length > 0) {
        setTimeout(() => preGenerateBillImages(), 100);
    }
}

/**
 * Close Fast Sale Results Modal
 */
function closeFastSaleResultsModal() {
    const modal = document.getElementById('fastSaleResultsModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Close Fast Sale modal if still open
    closeFastSaleModal();

    // Refresh table
    selectedOrderIds.clear();
    updateActionButtons();
    if (typeof filterAndDisplayOrders === 'function') {
        filterAndDisplayOrders();
    }
}

/**
 * Switch between results tabs
 * @param {string} tabName - 'forced', 'failed', or 'success'
 */
function switchResultsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.fast-sale-results-tab').forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.fast-sale-results-content').forEach(content => {
        if (content.id === `${tabName}Tab`) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

/**
 * Render Forced Orders Table (Cưỡng bức)
 */
function renderForcedOrdersTable() {
    const container = document.getElementById('forcedOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.forced.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng cần cưỡng bức</p>';
        return;
    }

    const html = `
        <table class="fast-sale-results-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th style="width: 40px;"><input type="checkbox" id="selectAllForced" onchange="toggleAllForcedOrders(this.checked)"></th>
                    <th>Mã</th>
                    <th>Số phiếu</th>
                    <th>Khách hàng</th>
                    <th>Lỗi</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.forced.map((order, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="checkbox" class="forced-order-checkbox" value="${index}"></td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                        <td><div class="fast-sale-error-msg">${order.DeliveryNote || 'Lỗi không xác định'}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

/**
 * Render Failed Orders Table (Thất bại)
 */
function renderFailedOrdersTable() {
    const container = document.getElementById('failedOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.failed.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 40px;">Không có đơn hàng thất bại</p>';
        return;
    }

    const html = `
        <table class="fast-sale-results-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>Mã</th>
                    <th>Số phiếu</th>
                    <th>Khách hàng</th>
                    <th>Lỗi</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.failed.map((order, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td>${order.Partner?.PartnerDisplayName || order.PartnerDisplayName || 'N/A'}</td>
                        <td><div class="fast-sale-error-msg">${order.DeliveryNote || 'Lỗi không xác định'}</div></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

/**
 * Render Success Orders Table (Thành công)
 */
function renderSuccessOrdersTable() {
    const container = document.getElementById('successOrdersTable');
    if (!container) return;

    if (fastSaleResultsData.success.length === 0) {
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
                    <th>Khách hàng</th>
                    <th>Mã vận đơn</th>
                </tr>
            </thead>
            <tbody>
                ${fastSaleResultsData.success.map((order, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td><input type="checkbox" class="success-order-checkbox" value="${index}" data-order-id="${order.Id}"></td>
                        <td>${order.Reference || 'N/A'}</td>
                        <td>${order.Number || ''}</td>
                        <td><span style="color: #10b981; font-weight: 600;">✓ ${order.ShowState || 'Nhập'}</span></td>
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
 * Toggle all forced orders checkboxes
 * @param {boolean} checked
 */
function toggleAllForcedOrders(checked) {
    document.querySelectorAll('.forced-order-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Create Forced Orders (Tạo cưỡng bức)
 */
async function createForcedOrders() {
    const selectedIndexes = Array.from(document.querySelectorAll('.forced-order-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    if (selectedIndexes.length === 0) {
        window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng để tạo cưỡng bức', 'Thông báo');
        return;
    }

    const selectedOrders = selectedIndexes.map(i => fastSaleResultsData.forced[i]);

    try {
        const headers = await window.tokenManager.getAuthHeader();
        // Use isForce=true query parameter for forced creation
        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/FastSaleOrder/InsertListOrderModel?isForce=true&$expand=DataErrorFast($expand=Partner),OrdersError($expand=Partner),OrdersSucessed($expand=Partner)`;

        // Use is_approve: false with isForce=true for forced creation
        const requestBody = {
            is_approve: false,
            model: selectedOrders
        };

        const loadingNotif = window.notificationManager.info(
            `Đang tạo cưỡng bức ${selectedIndexes.length} đơn hàng...`,
            3000 // Auto-dismiss after 3 seconds
        );

        const response = await API_CONFIG.smartFetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] Force create result:', result);

        // Close loading notification
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        // Show results in the same modal
        showFastSaleResultsModal(result);

        // Auto-switch to Success tab if there are successful orders
        if (result.OrdersSucessed && result.OrdersSucessed.length > 0) {
            setTimeout(() => {
                switchResultsTab('success');
            }, 100);
        }

        window.notificationManager.success(
            `Đã tạo cưỡng bức ${result.OrdersSucessed?.length || 0} đơn hàng`,
            'Thành công'
        );

    } catch (error) {
        console.error('[FAST-SALE] Error creating forced orders:', error);

        // Close loading notification on error
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        window.notificationManager.error(`Lỗi khi tạo cưỡng bức: ${error.message}`, 'Lỗi');
    }
}

/**
 * Toggle all success orders checkboxes
 * @param {boolean} checked
 */
function toggleAllSuccessOrders(checked) {
    document.querySelectorAll('.success-order-checkbox').forEach(cb => {
        cb.checked = checked;
    });
}

/**
 * Print success orders (In hóa đơn, In phiếu ship, In soạn hàng)
 * @param {string} type - 'invoice', 'shipping', or 'picking'
 */
async function printSuccessOrders(type) {
    // Pre-generation runs in background - if cached data exists, use it; otherwise generate on-the-fly

    const selectedIndexes = Array.from(document.querySelectorAll('.success-order-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    if (selectedIndexes.length === 0) {
        window.notificationManager.warning('Vui lòng chọn ít nhất 1 đơn hàng để in', 'Thông báo');
        return;
    }

    const selectedOrders = selectedIndexes.map(i => fastSaleResultsData.success[i]);
    const orderIds = selectedOrders.map(o => o.Id).filter(id => id);

    if (orderIds.length === 0) {
        window.notificationManager.error('Không tìm thấy ID đơn hàng để in', 'Lỗi');
        return;
    }

    console.log(`[FAST-SALE] Printing ${type} for ${orderIds.length} orders:`, orderIds);

    // For invoice type, use custom bill and send to Messenger
    if (type === 'invoice') {
        console.log('[FAST-SALE] Using custom bill for invoice printing...');

        // Clear currentSaleOrderData to prevent old data interference
        currentSaleOrderData = null;

        // Collect all enriched orders and send tasks
        const enrichedOrders = [];
        const sendTasks = [];

        for (let i = 0; i < selectedOrders.length; i++) {
            const order = selectedOrders[i];

            // Find original order by matching SaleOnlineIds or Reference
            const originalOrderIndex = fastSaleOrdersData.findIndex(o =>
                (o.SaleOnlineIds && order.SaleOnlineIds &&
                    JSON.stringify(o.SaleOnlineIds) === JSON.stringify(order.SaleOnlineIds)) ||
                (o.Reference && o.Reference === order.Reference)
            );
            const originalOrder = originalOrderIndex >= 0 ? fastSaleOrdersData[originalOrderIndex] : null;

            // Also try to find saleOnline order from displayedData for additional data - O(1) via OrderStore
            const saleOnlineId = order.SaleOnlineIds?.[0];
            const saleOnlineOrderForData = saleOnlineId
                ? (window.OrderStore?.get(saleOnlineId) || window.OrderStore?.get(String(saleOnlineId)) || displayedData.find(o => o.Id === saleOnlineId || String(o.Id) === String(saleOnlineId)))
                : null;

            // Get CarrierName from form dropdown (same logic as collectFastSaleData)
            const carrierSelect = originalOrderIndex >= 0 ? document.getElementById(`fastSaleCarrier_${originalOrderIndex}`) : null;
            const carrierNameFromDropdown = carrierSelect?.options[carrierSelect.selectedIndex]?.text || '';
            // Fallback chain: dropdown > originalOrder.Carrier.Name > order.CarrierName > order.Carrier.Name
            const carrierName = carrierNameFromDropdown ||
                originalOrder?.Carrier?.Name ||
                originalOrder?.CarrierName ||
                order.CarrierName ||
                order.Carrier?.Name ||
                '';
            const shippingFee = originalOrderIndex >= 0
                ? parseFloat(document.getElementById(`fastSaleShippingFee_${originalOrderIndex}`)?.value) || 0
                : order.DeliveryPrice || 0;

            // Get OrderLines - priority: originalOrder (from FastSale API) > saleOnlineOrder.Details > order.OrderLines
            let orderLines = originalOrder?.OrderLines || order.OrderLines || [];
            if ((!orderLines || orderLines.length === 0) && saleOnlineOrderForData?.Details) {
                // Map saleOnline Details to OrderLines format
                orderLines = saleOnlineOrderForData.Details.map(d => ({
                    ProductName: d.ProductName || d.ProductNameGet || '',
                    ProductNameGet: d.ProductNameGet || d.ProductName || '',
                    ProductUOMQty: d.Quantity || d.ProductUOMQty || 1,
                    Quantity: d.Quantity || d.ProductUOMQty || 1,
                    PriceUnit: d.Price || d.PriceUnit || 0,
                    Note: d.Note || ''
                }));
            }

            // Merge data: API result + original OrderLines + form values
            const enrichedOrder = {
                ...order,
                OrderLines: orderLines,
                CarrierName: carrierName,
                DeliveryPrice: shippingFee,
                PartnerDisplayName: order.PartnerDisplayName || originalOrder?.PartnerDisplayName || '',
            };

            enrichedOrders.push(enrichedOrder);

            console.log('[FAST-SALE] Enriched order for bill:', {
                number: enrichedOrder.Number,
                carrierName: enrichedOrder.CarrierName,
                orderLinesCount: enrichedOrder.OrderLines?.length
            });

            // Find saleOnline order for chat info
            let saleOnlineOrder = saleOnlineOrderForData;
            const saleOnlineName = order.SaleOnlineNames?.[0];
            if (!saleOnlineOrder && saleOnlineName) {
                saleOnlineOrder = displayedData.find(o => o.Code === saleOnlineName);
            }
            if (!saleOnlineOrder && order.PartnerId) {
                saleOnlineOrder = displayedData.find(o => o.PartnerId === order.PartnerId);
            }

            // DEBUG: Log customer matching info
            console.log('[FAST-SALE] DEBUG - Customer matching for order:', order.Number, {
                saleOnlineId,
                saleOnlineName,
                partnerId: order.PartnerId,
                foundSaleOnlineOrder: !!saleOnlineOrder,
                saleOnlineOrderId: saleOnlineOrder?.Id,
                saleOnlineOrderName: saleOnlineOrder?.Name,
                saleOnlineOrderCode: saleOnlineOrder?.Code,
                Facebook_ASUserId: saleOnlineOrder?.Facebook_ASUserId,
                Facebook_PostId: saleOnlineOrder?.Facebook_PostId
            });

            // Prepare send task for this customer
            if (saleOnlineOrder) {
                const psid = saleOnlineOrder.Facebook_ASUserId;
                const postId = saleOnlineOrder.Facebook_PostId;
                const channelId = postId ? postId.split('_')[0] : null;

                console.log('[FAST-SALE] DEBUG - Send task check:', {
                    orderNumber: order.Number,
                    customerName: saleOnlineOrder.Name,
                    psid,
                    postId,
                    channelId,
                    willAddToSendTasks: !!(psid && channelId)
                });

                if (psid && channelId) {
                    console.log('[FAST-SALE] Will send bill to:', saleOnlineOrder.Name, 'for order:', order.Number);
                    sendTasks.push({
                        enrichedOrder,
                        channelId,
                        psid,
                        customerName: saleOnlineOrder.Name,
                        orderNumber: order.Number
                    });
                } else {
                    console.warn('[FAST-SALE] ⚠️ Missing psid or channelId for order:', order.Number, {
                        psid: psid || 'MISSING',
                        channelId: channelId || 'MISSING'
                    });
                }
            } else {
                console.warn('[FAST-SALE] ⚠️ No saleOnlineOrder found for order:', order.Number);
            }
        }

        // DEBUG: Summary of collected data
        console.log('[FAST-SALE] DEBUG - Collection summary:', {
            selectedOrdersCount: selectedOrders.length,
            enrichedOrdersCount: enrichedOrders.length,
            sendTasksCount: sendTasks.length,
            sendTasksDetails: sendTasks.map(t => ({ orderNumber: t.orderNumber, customer: t.customerName, psid: t.psid }))
        });

        // 1. Open ONE combined print popup with all bills
        if (enrichedOrders.length > 0) {
            console.log('[FAST-SALE] Opening combined print popup for', enrichedOrders.length, 'bills...');
            openCombinedPrintPopup(enrichedOrders);
        }

        // 3. Clear main table checkboxes after printing
        console.log('[FAST-SALE] Clearing main table checkboxes after print...');
        selectedOrderIds.clear();
        // Uncheck all checkboxes in main table
        document.querySelectorAll('#ordersTable input[type="checkbox"]:checked').forEach(cb => {
            cb.checked = false;
        });
        // Also uncheck header checkbox
        const headerCheckbox = document.querySelector('#ordersTable thead input[type="checkbox"]');
        if (headerCheckbox) headerCheckbox.checked = false;
        // Update action buttons visibility
        updateActionButtons();

        // 2. Send all bills to Messenger in PARALLEL
        if (sendTasks.length > 0) {
            console.log('[FAST-SALE] Sending', sendTasks.length, 'bills to Messenger in parallel...');
            window.notificationManager.info(`Đang gửi ${sendTasks.length} bill qua Messenger...`, 3000);

            const sendPromises = sendTasks.map(task => {
                // Check for pre-generated bill data
                const orderId = task.enrichedOrder?.Id;
                const orderNumber = task.enrichedOrder?.Number;
                const cachedData = window.preGeneratedBillData?.get(orderId) ||
                    window.preGeneratedBillData?.get(orderNumber);

                const sendOptions = {};
                if (cachedData && cachedData.contentUrl && cachedData.contentId) {
                    console.log(`[FAST-SALE] ⚡ Using pre-generated bill for ${task.orderNumber}`);
                    sendOptions.preGeneratedContentUrl = cachedData.contentUrl;
                    sendOptions.preGeneratedContentId = cachedData.contentId;
                }

                return sendBillToCustomer(task.enrichedOrder, task.channelId, task.psid, sendOptions)
                    .then(res => {
                        if (res.success) {
                            console.log(`[FAST-SALE] ✅ Bill sent for ${task.orderNumber} to ${task.customerName}`);
                            return { success: true, orderNumber: task.orderNumber, customerName: task.customerName };
                        } else {
                            console.warn(`[FAST-SALE] ⚠️ Failed to send bill for ${task.orderNumber}:`, res.error);
                            return { success: false, orderNumber: task.orderNumber, error: res.error };
                        }
                    })
                    .catch(err => {
                        console.error(`[FAST-SALE] ❌ Error sending bill for ${task.orderNumber}:`, err);
                        return { success: false, orderNumber: task.orderNumber, error: err.message };
                    });
            });

            // Wait for all sends to complete
            Promise.all(sendPromises).then(results => {
                const successCount = results.filter(r => r.success).length;
                const failCount = results.filter(r => !r.success).length;

                if (successCount > 0) {
                    window.notificationManager.success(`Đã gửi ${successCount}/${results.length} bill qua Messenger`, 3000);
                }
                if (failCount > 0) {
                    window.notificationManager.warning(`${failCount} bill gửi thất bại`, 3000);
                }
            });
        }

        return;
    }

    // For shipping and picking types, use TPOS API
    try {
        const headers = await window.tokenManager.getAuthHeader();
        const idsParam = orderIds.join(',');

        let printEndpoint = '';
        let printLabel = '';

        // Determine endpoint based on print type
        if (type === 'shipping') {
            printEndpoint = 'print2'; // In phiếu ship
            printLabel = 'phiếu ship';
        } else if (type === 'picking') {
            printEndpoint = 'print3'; // In soạn hàng
            printLabel = 'soạn hàng';
        }

        const url = `https://chatomni-proxy.nhijudyshop.workers.dev/api/fastsaleorder/${printEndpoint}?ids=${idsParam}`;

        console.log(`[FAST-SALE] Fetching print HTML from: ${url}`);

        // Show loading notification
        const loadingNotif = window.notificationManager.info(
            `Đang chuẩn bị in ${printLabel}...`,
            3000
        );

        // Fetch the print HTML
        const response = await API_CONFIG.smartFetch(url, {
            method: 'GET',
            headers: {
                ...headers,
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        console.log('[FAST-SALE] Print response:', result);

        // Close loading notification
        if (loadingNotif && typeof loadingNotif.close === 'function') {
            loadingNotif.close();
        }

        // Check for errors
        if (result.listErrors && result.listErrors.length > 0) {
            window.notificationManager.error(
                `Lỗi khi in: ${result.listErrors.join(', ')}`,
                'Lỗi'
            );
            return;
        }

        // Open new window and write HTML
        if (result.html) {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(result.html);
                printWindow.document.close();

                // Use both onload and setTimeout for reliability
                let printed = false;

                printWindow.onload = function () {
                    if (!printed) {
                        printed = true;
                        printWindow.focus();
                        printWindow.print();
                    }
                };

                // Fallback timeout in case onload doesn't fire
                setTimeout(() => {
                    if (!printed) {
                        printed = true;
                        printWindow.focus();
                        printWindow.print();
                    }
                }, 1000); // Increased to 1000ms for complex HTML

                window.notificationManager.success(
                    `Đã mở cửa sổ in ${printLabel} cho ${orderIds.length} đơn hàng`,
                    2000
                );
            } else {
                window.notificationManager.error(
                    'Không thể mở cửa sổ in. Vui lòng kiểm tra popup blocker',
                    'Lỗi'
                );
            }
        } else {
            window.notificationManager.error(
                'Không nhận được HTML để in',
                'Lỗi'
            );
        }

    } catch (error) {
        console.error('[FAST-SALE] Error printing orders:', error);

        // Better error message extraction
        let errorMessage = 'Không xác định';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && error.toString) {
            errorMessage = error.toString();
        }

        window.notificationManager.error(
            `Lỗi khi in: ${errorMessage}`,
            'Lỗi'
        );
    }
}

// Make functions globally accessible
window.showFastSaleModal = showFastSaleModal;
window.closeFastSaleModal = closeFastSaleModal;
window.confirmFastSale = confirmFastSale;
window.confirmAndCheckFastSale = confirmAndCheckFastSale;
window.updateFastSaleShippingFee = updateFastSaleShippingFee;
window.showFastSaleResultsModal = showFastSaleResultsModal;
window.closeFastSaleResultsModal = closeFastSaleResultsModal;
window.switchResultsTab = switchResultsTab;
window.toggleAllForcedOrders = toggleAllForcedOrders;
window.toggleAllSuccessOrders = toggleAllSuccessOrders;
window.createForcedOrders = createForcedOrders;
window.printSuccessOrders = printSuccessOrders;

// #endregion FAST SALE MODAL

// #region BILL TEMPLATE SETTINGS

/**
 * Default bill template settings
 */
const defaultBillSettings = {
    // General
    shopName: '',
    shopPhone: '',
    shopAddress: '',
    billTitle: 'PHIẾU BÁN HÀNG',
    footerText: 'Cảm ơn quý khách! Hẹn gặp lại!',
    // Sections visibility
    showHeader: true,
    showTitle: true,
    showSTT: true,
    showBarcode: true,
    showOrderInfo: true,
    showCarrier: true,
    showCustomer: true,
    showSeller: true,
    showProducts: true,
    showTotals: true,
    showCOD: true,
    showDeliveryNote: true,
    showFooter: true,
    // Style
    fontShopName: 18,
    fontTitle: 16,
    fontContent: 13,
    fontCOD: 18,
    billWidth: '80mm',
    billPadding: 20,
    codBackground: '#fef3c7',
    codBorder: '#f59e0b'
};

/**
 * Get bill template settings from localStorage
 */
function getBillTemplateSettings() {
    try {
        const saved = localStorage.getItem('billTemplateSettings');
        if (saved) {
            return { ...defaultBillSettings, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('[BILL-SETTINGS] Error loading settings:', e);
    }
    return { ...defaultBillSettings };
}

/**
 * Open bill template settings modal
 */
function openBillTemplateSettings() {
    const modal = document.getElementById('billTemplateSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadBillSettingsToForm();
    }
}

/**
 * Close bill template settings modal
 */
function closeBillTemplateSettings() {
    const modal = document.getElementById('billTemplateSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * Switch between settings tabs
 */
function switchBillSettingsTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.bill-settings-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    // Update content
    document.querySelectorAll('.bill-settings-content').forEach(content => {
        content.style.display = 'none';
    });
    const tabMap = {
        'general': 'billSettingsGeneral',
        'sections': 'billSettingsSections',
        'style': 'billSettingsStyle',
        'preview': 'billSettingsPreview'
    };
    const targetContent = document.getElementById(tabMap[tabName]);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

/**
 * Load settings to form
 */
function loadBillSettingsToForm() {
    const settings = getBillTemplateSettings();
    // General
    document.getElementById('billShopName').value = settings.shopName || '';
    document.getElementById('billShopPhone').value = settings.shopPhone || '';
    document.getElementById('billShopAddress').value = settings.shopAddress || '';
    document.getElementById('billTitle').value = settings.billTitle || 'PHIẾU BÁN HÀNG';
    document.getElementById('billFooterText').value = settings.footerText || '';
    // Sections
    document.getElementById('billShowHeader').checked = settings.showHeader !== false;
    document.getElementById('billShowTitle').checked = settings.showTitle !== false;
    document.getElementById('billShowSTT').checked = settings.showSTT !== false;
    document.getElementById('billShowBarcode').checked = settings.showBarcode !== false;
    document.getElementById('billShowOrderInfo').checked = settings.showOrderInfo !== false;
    document.getElementById('billShowCarrier').checked = settings.showCarrier !== false;
    document.getElementById('billShowCustomer').checked = settings.showCustomer !== false;
    document.getElementById('billShowSeller').checked = settings.showSeller !== false;
    document.getElementById('billShowProducts').checked = settings.showProducts !== false;
    document.getElementById('billShowTotals').checked = settings.showTotals !== false;
    document.getElementById('billShowCOD').checked = settings.showCOD !== false;
    document.getElementById('billShowDeliveryNote').checked = settings.showDeliveryNote !== false;
    document.getElementById('billShowFooter').checked = settings.showFooter !== false;
    // Style
    document.getElementById('billFontShopName').value = settings.fontShopName || 18;
    document.getElementById('billFontTitle').value = settings.fontTitle || 16;
    document.getElementById('billFontContent').value = settings.fontContent || 13;
    document.getElementById('billFontCOD').value = settings.fontCOD || 18;
    document.getElementById('billWidth').value = settings.billWidth || '80mm';
    document.getElementById('billPadding').value = settings.billPadding || 20;
    document.getElementById('billCODBackground').value = settings.codBackground || '#fef3c7';
    document.getElementById('billCODBorder').value = settings.codBorder || '#f59e0b';
}

/**
 * Save bill template settings
 */
function saveBillTemplateSettings() {
    const settings = {
        // General
        shopName: document.getElementById('billShopName').value.trim(),
        shopPhone: document.getElementById('billShopPhone').value.trim(),
        shopAddress: document.getElementById('billShopAddress').value.trim(),
        billTitle: document.getElementById('billTitle').value.trim() || 'PHIẾU BÁN HÀNG',
        footerText: document.getElementById('billFooterText').value.trim(),
        // Sections
        showHeader: document.getElementById('billShowHeader').checked,
        showTitle: document.getElementById('billShowTitle').checked,
        showSTT: document.getElementById('billShowSTT').checked,
        showBarcode: document.getElementById('billShowBarcode').checked,
        showOrderInfo: document.getElementById('billShowOrderInfo').checked,
        showCarrier: document.getElementById('billShowCarrier').checked,
        showCustomer: document.getElementById('billShowCustomer').checked,
        showSeller: document.getElementById('billShowSeller').checked,
        showProducts: document.getElementById('billShowProducts').checked,
        showTotals: document.getElementById('billShowTotals').checked,
        showCOD: document.getElementById('billShowCOD').checked,
        showDeliveryNote: document.getElementById('billShowDeliveryNote').checked,
        showFooter: document.getElementById('billShowFooter').checked,
        // Style
        fontShopName: parseInt(document.getElementById('billFontShopName').value) || 18,
        fontTitle: parseInt(document.getElementById('billFontTitle').value) || 16,
        fontContent: parseInt(document.getElementById('billFontContent').value) || 13,
        fontCOD: parseInt(document.getElementById('billFontCOD').value) || 18,
        billWidth: document.getElementById('billWidth').value || '80mm',
        billPadding: parseInt(document.getElementById('billPadding').value) || 20,
        codBackground: document.getElementById('billCODBackground').value || '#fef3c7',
        codBorder: document.getElementById('billCODBorder').value || '#f59e0b'
    };

    try {
        localStorage.setItem('billTemplateSettings', JSON.stringify(settings));
        window.notificationManager.success('Đã lưu cài đặt bill template', 2000);
        closeBillTemplateSettings();
    } catch (e) {
        console.error('[BILL-SETTINGS] Error saving settings:', e);
        window.notificationManager.error('Lỗi khi lưu cài đặt', 2000);
    }
}

/**
 * Reset bill template settings to default
 */
function resetBillTemplateSettings() {
    localStorage.removeItem('billTemplateSettings');
    loadBillSettingsToForm();
    window.notificationManager.info('Đã đặt lại cài đặt mặc định', 2000);
}

/**
 * Preview bill template with sample data
 */
function previewBillTemplate() {
    const sampleOrder = {
        Number: 'NJD/2026/SAMPLE',
        PartnerDisplayName: 'Nguyễn Văn A',
        Partner: { Name: 'Nguyễn Văn A', Phone: '0901234567', Street: '123 Đường ABC, Quận 1, TP.HCM' },
        CarrierName: 'Giao hàng nhanh (GHN)',
        DeliveryPrice: 25000,
        CashOnDelivery: 350000,
        AmountDeposit: 50000,
        Discount: 10000,
        Ship_Note: 'Gọi trước khi giao. Ship COD.',
        SessionIndex: '123',
        OrderLines: [
            { ProductName: 'Áo thun nam size L', Quantity: 2, PriceUnit: 150000 },
            { ProductName: 'Quần jean nữ size M', Quantity: 1, PriceUnit: 250000, Note: 'Màu xanh đậm' }
        ]
    };

    const html = window.generateCustomBillHTML(sampleOrder, {});
    const container = document.getElementById('billPreviewContainer');
    if (container) {
        container.innerHTML = `<div style="background: white; padding: 10px; max-width: 320px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">${html}</div>`;
    }
}

// Make functions globally accessible
window.openBillTemplateSettings = openBillTemplateSettings;
window.closeBillTemplateSettings = closeBillTemplateSettings;
window.switchBillSettingsTab = switchBillSettingsTab;
window.saveBillTemplateSettings = saveBillTemplateSettings;
window.resetBillTemplateSettings = resetBillTemplateSettings;
window.previewBillTemplate = previewBillTemplate;
window.getBillTemplateSettings = getBillTemplateSettings;

// #endregion BILL TEMPLATE SETTINGS
