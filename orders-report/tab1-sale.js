/**
 * TAB1-SALE.JS - Sale Modal & Fast Sale Module
 * Handles sale order creation, bill generation, fast sale
 * Depends on: tab1-core.js, tab1-qr-debt.js
 */

// =====================================================
// SALE MODAL STATE
// =====================================================
let currentSaleOrderData = null;
let currentSalePartnerData = null;
let isSaleModalOpen = false;

// =====================================================
// OPEN SALE MODAL
// =====================================================
async function openSaleModal(orderId) {
    console.log('[SALE] Opening sale modal for order:', orderId);

    const state = window.tab1State;
    const order = state.allData.find(o => o.Id === orderId);

    if (!order) {
        console.error('[SALE] Order not found:', orderId);
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }

    currentSaleOrderData = JSON.parse(JSON.stringify(order));

    // Convert Details to orderLines format
    if (order.Details && Array.isArray(order.Details)) {
        currentSaleOrderData.orderLines = order.Details.map(detail => ({
            Id: detail.Id,
            ProductId: detail.ProductId,
            ProductUOMId: detail.UOMId,
            ProductUOMQty: detail.Quantity,
            Quantity: detail.Quantity,
            PriceUnit: detail.Price,
            Price: detail.Price,
            ProductName: detail.ProductName,
            ProductNameGet: detail.ProductNameGet,
            ProductCode: detail.ProductCode,
            ProductUOMName: detail.UOMName,
            Note: detail.Note,
            Weight: detail.ProductWeight,
            Product: {
                Id: detail.ProductId,
                Name: detail.ProductName,
                DefaultCode: detail.ProductCode,
                NameGet: detail.ProductNameGet,
                ImageUrl: detail.ImageUrl
            },
            ProductUOM: {
                Id: detail.UOMId,
                Name: detail.UOMName
            }
        }));
    } else {
        currentSaleOrderData.orderLines = [];
    }

    // Show modal
    const modal = document.getElementById('saleButtonModal');
    if (modal) {
        modal.classList.add('show');
        isSaleModalOpen = true;
    }

    // Populate form
    populateSaleForm(currentSaleOrderData);

    // Load customer debt
    await loadCustomerDebtForSale();

    // Fetch default sale data
    await fetchDefaultSaleData();
}

function closeSaleButtonModal(clearSelection = false) {
    const modal = document.getElementById('saleButtonModal');
    if (modal) {
        modal.classList.remove('show');
    }

    isSaleModalOpen = false;
    currentSaleOrderData = null;
    currentSalePartnerData = null;

    if (clearSelection) {
        // Clear checkbox selection
        const state = window.tab1State;
        state.selectedOrderIds.clear();
        if (typeof updateActionButtons === 'function') {
            updateActionButtons();
        }
    }
}

// =====================================================
// POPULATE SALE FORM
// =====================================================
function populateSaleForm(order) {
    // Customer info
    const nameInput = document.getElementById('saleReceiverName');
    const phoneInput = document.getElementById('saleReceiverPhone');
    const addressInput = document.getElementById('saleReceiverAddress');
    const noteInput = document.getElementById('saleReceiverNote');

    if (nameInput) nameInput.value = order.PartnerName || order.Name || '';
    if (phoneInput) phoneInput.value = order.PartnerPhone || order.Telephone || '';
    if (addressInput) addressInput.value = order.PartnerAddress || order.Address || '';
    if (noteInput) noteInput.value = order.Note || '';

    // Products
    renderSaleProducts(order.orderLines || []);

    // Totals
    recalculateSaleTotals();

    // Default shipping fee
    const shippingInput = document.getElementById('saleShippingFee');
    if (shippingInput) shippingInput.value = 35000;

    // Update COD
    updateSaleCOD();

    // Load delivery carriers
    loadDeliveryCarriers();
}

function renderSaleProducts(products) {
    const container = document.getElementById('saleProductsBody');
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = `
            <div class="sale-products-empty">
                <i class="fas fa-box-open"></i>
                <p>Chưa có sản phẩm</p>
            </div>`;
        return;
    }

    const html = products.map((product, index) => {
        const imgUrl = product.Product?.ImageUrl || product.ImageUrl || '';
        const name = product.ProductName || product.Product?.Name || '';
        const code = product.ProductCode || product.Product?.DefaultCode || '';
        const qty = product.ProductUOMQty || product.Quantity || 1;
        const price = product.PriceUnit || product.Price || 0;
        const total = qty * price;

        return `
            <div class="sale-product-row" data-index="${index}">
                <div class="sale-product-img">
                    ${imgUrl ? `<img src="${imgUrl}" alt="">` : '<i class="fas fa-box"></i>'}
                </div>
                <div class="sale-product-info">
                    <div class="sale-product-name">${escapeHtml(name)}</div>
                    <div class="sale-product-code">${escapeHtml(code)}</div>
                </div>
                <div class="sale-product-qty">
                    <button class="btn-qty" onclick="changeSaleProductQty(${index}, -1)">-</button>
                    <input type="number" value="${qty}" min="1" onchange="setSaleProductQty(${index}, this.value)">
                    <button class="btn-qty" onclick="changeSaleProductQty(${index}, 1)">+</button>
                </div>
                <div class="sale-product-price">${price.toLocaleString('vi-VN')}đ</div>
                <div class="sale-product-total">${total.toLocaleString('vi-VN')}đ</div>
                <button class="btn-remove-product" onclick="removeSaleProduct(${index})" title="Xóa">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
    }).join('');

    container.innerHTML = html;
}

// =====================================================
// PRODUCT MANAGEMENT
// =====================================================
function changeSaleProductQty(index, delta) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    const product = currentSaleOrderData.orderLines[index];
    if (!product) return;

    const currentQty = product.ProductUOMQty || product.Quantity || 1;
    const newQty = Math.max(1, currentQty + delta);

    product.ProductUOMQty = newQty;
    product.Quantity = newQty;

    renderSaleProducts(currentSaleOrderData.orderLines);
    recalculateSaleTotals();
    updateSaleCOD();
}

function setSaleProductQty(index, value) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    const product = currentSaleOrderData.orderLines[index];
    if (!product) return;

    const newQty = Math.max(1, parseInt(value) || 1);
    product.ProductUOMQty = newQty;
    product.Quantity = newQty;

    recalculateSaleTotals();
    updateSaleCOD();
}

function removeSaleProduct(index) {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    currentSaleOrderData.orderLines.splice(index, 1);

    renderSaleProducts(currentSaleOrderData.orderLines);
    recalculateSaleTotals();
    updateSaleCOD();
}

// =====================================================
// TOTALS CALCULATION
// =====================================================
function recalculateSaleTotals() {
    if (!currentSaleOrderData || !currentSaleOrderData.orderLines) return;

    let totalQuantity = 0;
    let totalAmount = 0;

    currentSaleOrderData.orderLines.forEach(item => {
        const qty = item.ProductUOMQty || item.Quantity || 1;
        const price = item.PriceUnit || item.Price || 0;
        totalQuantity += qty;
        totalAmount += qty * price;
    });

    updateSaleTotals(totalQuantity, totalAmount);
}

function updateSaleTotals(qty, amount) {
    const qtyEl = document.getElementById('saleTotalQty');
    const amountEl = document.getElementById('saleTotalAmount');

    if (qtyEl) qtyEl.textContent = qty;
    if (amountEl) amountEl.textContent = amount.toLocaleString('vi-VN') + 'đ';
}

function updateSaleCOD() {
    const totalAmountEl = document.getElementById('saleTotalAmount');
    const shippingEl = document.getElementById('saleShippingFee');
    const prepaidEl = document.getElementById('salePrepaidAmount');
    const codEl = document.getElementById('saleCOD');

    const totalAmount = parseFloat(totalAmountEl?.textContent?.replace(/[^\d]/g, '')) || 0;
    const shipping = parseFloat(shippingEl?.value) || 0;
    const prepaid = parseFloat(prepaidEl?.value) || 0;

    const cod = Math.max(0, totalAmount + shipping - prepaid);

    if (codEl) codEl.value = cod;
}

// =====================================================
// CUSTOMER DEBT
// =====================================================
async function loadCustomerDebtForSale() {
    const phone = document.getElementById('saleReceiverPhone')?.value;
    if (!phone) return;

    const debt = await fetchCustomerDebt(phone);

    const prepaidEl = document.getElementById('salePrepaidAmount');
    if (prepaidEl && debt && debt > 0) {
        prepaidEl.value = debt;
        prepaidEl.title = `Công nợ: ${debt.toLocaleString('vi-VN')}đ`;
    }

    updateSaleCOD();
}

// =====================================================
// DELIVERY CARRIERS
// =====================================================
let cachedDeliveryCarriers = null;

async function loadDeliveryCarriers() {
    const select = document.getElementById('saleDeliveryPartner');
    if (!select) return;

    // Use cache if available
    if (cachedDeliveryCarriers) {
        renderDeliveryCarrierOptions(select, cachedDeliveryCarriers);
        return;
    }

    select.innerHTML = '<option value="">Đang tải...</option>';

    try {
        const headers = await window.tokenManager.getAuthHeader();

        const response = await fetch('https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/DeliveryCarrier?$format=json&$top=100', {
            method: 'GET',
            headers: { ...headers, Accept: 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            cachedDeliveryCarriers = data.value || [];
            renderDeliveryCarrierOptions(select, cachedDeliveryCarriers);
        } else {
            select.innerHTML = '<option value="">Lỗi tải</option>';
        }

    } catch (error) {
        console.error('[SALE] Error loading carriers:', error);
        select.innerHTML = '<option value="">Lỗi tải</option>';
    }
}

function renderDeliveryCarrierOptions(select, carriers) {
    const defaultCarriers = [
        { Id: 7, Name: 'SHIP TỈNH', FixedPrice: 35000 },
        { Id: 1, Name: 'Tự vận chuyển', FixedPrice: 0 }
    ];

    const allCarriers = [...defaultCarriers];

    carriers.forEach(c => {
        if (!allCarriers.find(dc => dc.Id === c.Id)) {
            allCarriers.push(c);
        }
    });

    const options = allCarriers.map(c => {
        const fee = c.FixedPrice || c.DefaultFee || 0;
        const feeStr = fee > 0 ? ` (${fee.toLocaleString('vi-VN')}đ)` : ' (Miễn phí)';
        return `<option value="${c.Id}" data-name="${escapeHtml(c.Name)}" data-fee="${fee}">${escapeHtml(c.Name)}${feeStr}</option>`;
    }).join('');

    select.innerHTML = options;
}

function getCachedDeliveryCarriers() {
    return cachedDeliveryCarriers;
}

// =====================================================
// CONFIRM & PRINT
// =====================================================
async function confirmAndPrintSale() {
    console.log('[SALE] Starting confirm and print...');

    if (!currentSaleOrderData) {
        if (window.notificationManager) {
            window.notificationManager.error('Không có dữ liệu đơn hàng');
        }
        return;
    }

    // Show loading
    const confirmBtn = document.querySelector('.sale-btn-teal');
    const originalText = confirmBtn?.textContent;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        // Step 1: Update order products if changed
        await updateSaleOrderWithAPI();

        // Step 2: Build FastSaleOrder payload
        const payload = buildFastSaleOrderPayload();

        // Step 3: Create FastSaleOrder
        const token = await window.tokenManager.getToken();

        const createResponse = await fetch('https://tomato.tpos.vn/odata/FastSaleOrder', {
            method: 'POST',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json;charset=UTF-8',
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1',
                'x-tpos-lang': 'vi'
            },
            body: JSON.stringify(payload)
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Lỗi tạo đơn: ${createResponse.status} - ${errorText}`);
        }

        const createResult = await createResponse.json();
        console.log('[SALE] FastSaleOrder created:', createResult);

        const orderId = createResult.Id;
        const orderNumber = createResult.Number || orderId;

        // Step 4: Handle debt payment
        await handleDebtPaymentAfterSale(orderNumber);

        // Step 5: Open print popup
        openPrintPopup(createResult, { currentSaleOrderData });

        // Step 6: Send bill to customer
        await sendBillToCustomerIfPossible(createResult);

        // Success notification
        if (window.notificationManager) {
            window.notificationManager.success(`Đã tạo đơn hàng ${orderNumber}`);
        }

        // Close modal
        setTimeout(() => {
            closeSaleButtonModal(true);
        }, 500);

    } catch (error) {
        console.error('[SALE] Error:', error);
        if (window.notificationManager) {
            window.notificationManager.error(error.message || 'Lỗi xác nhận đơn hàng');
        }
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalText || 'Xác nhận và in (F9)';
        }
    }
}

async function updateSaleOrderWithAPI() {
    if (!currentSaleOrderData || !currentSaleOrderData.Id) return;

    try {
        const headers = await window.tokenManager.getAuthHeader();

        // Fetch full order
        const getUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentSaleOrderData.Id})?$expand=Details,Partner,User,CRMTeam`;
        const getResponse = await fetch(getUrl, {
            method: 'GET',
            headers: { ...headers, Accept: 'application/json' }
        });

        if (!getResponse.ok) throw new Error('Failed to fetch order');

        const fullOrder = await getResponse.json();

        // Prepare payload with updated products
        const payload = JSON.parse(JSON.stringify(fullOrder));

        if (!payload["@odata.context"]) {
            payload["@odata.context"] = "http://tomato.tpos.vn/odata/$metadata#SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity";
        }

        // Convert orderLines to Details
        if (currentSaleOrderData.orderLines) {
            payload.Details = currentSaleOrderData.orderLines.map(line => ({
                ProductId: line.ProductId || line.Product?.Id,
                Quantity: line.ProductUOMQty || line.Quantity || 1,
                Price: line.PriceUnit || line.Price || 0,
                Note: line.Note || null,
                UOMId: line.ProductUOMId || line.ProductUOM?.Id || 1,
                Factor: 1,
                Priority: 0,
                OrderId: currentSaleOrderData.Id,
                ProductName: line.Product?.Name || line.ProductName || '',
                ProductNameGet: line.Product?.NameGet || line.ProductNameGet || '',
                ProductCode: line.Product?.DefaultCode || line.ProductCode || '',
                UOMName: line.ProductUOMName || line.ProductUOM?.Name || 'Cái',
                ...(line.Id ? { Id: line.Id } : {})
            }));
        }

        // Calculate totals
        let totalQty = 0, totalAmount = 0;
        payload.Details?.forEach(d => {
            totalQty += d.Quantity || 0;
            totalAmount += (d.Quantity || 0) * (d.Price || 0);
        });
        payload.TotalQuantity = totalQty;
        payload.TotalAmount = totalAmount;

        // PUT updated order
        const putResponse = await fetch(`https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${currentSaleOrderData.Id})`, {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!putResponse.ok) throw new Error('Failed to update order');

        console.log('[SALE] Order updated successfully');

    } catch (error) {
        console.error('[SALE] Error updating order:', error);
        // Continue with sale creation even if update fails
    }
}

function buildFastSaleOrderPayload() {
    const order = currentSaleOrderData;
    const partner = currentSalePartnerData;
    const defaultData = window.lastDefaultSaleData || {};

    // Get form values
    const receiverName = document.getElementById('saleReceiverName')?.value || '';
    const receiverPhone = document.getElementById('saleReceiverPhone')?.value || '';
    const receiverAddress = document.getElementById('saleReceiverAddress')?.value || null;
    const comment = document.getElementById('saleReceiverNote')?.value || '';

    const shippingFee = parseFloat(document.getElementById('saleShippingFee')?.value) || 35000;
    const codValue = parseFloat(document.getElementById('saleCOD')?.value) || 0;
    const prepaidAmount = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;

    // Carrier
    const carrierSelect = document.getElementById('saleDeliveryPartner');
    const carrierId = carrierSelect?.value ? parseInt(carrierSelect.value) : 7;
    const selectedOption = carrierSelect?.selectedOptions[0];
    const carrierName = selectedOption?.dataset?.name || 'SHIP TỈNH';

    // Build order lines
    const orderLines = (order.orderLines || []).map(line => ({
        ProductId: line.ProductId || line.Product?.Id,
        ProductUOMQty: line.ProductUOMQty || line.Quantity || 1,
        PriceUnit: line.PriceUnit || line.Price || 0,
        PriceTotal: (line.ProductUOMQty || 1) * (line.PriceUnit || line.Price || 0),
        ProductUOMId: line.ProductUOMId || 1,
        Note: line.Note || null,
        Product: line.Product,
        ProductUOM: line.ProductUOM,
        SaleOnlineDetailId: line.Id || null
    }));

    // Calculate totals
    const amountTotal = orderLines.reduce((sum, l) => sum + (l.PriceTotal || 0), 0);
    const totalQuantity = orderLines.reduce((sum, l) => sum + (l.ProductUOMQty || 0), 0);

    const now = new Date();
    const user = defaultData.User || null;

    return {
        Id: 0,
        PartnerId: partner?.Id || order.PartnerId || 0,
        PartnerDisplayName: partner?.DisplayName || receiverName,
        PartnerPhone: receiverPhone,
        Reference: order.Code || '',
        AmountTotal: amountTotal,
        TotalQuantity: totalQuantity,
        AmountUntaxed: amountTotal,
        UserId: user?.Id || null,
        UserName: user?.Name || null,
        DateInvoice: now.toISOString(),
        State: 'draft',
        ShowState: 'Nháp',
        CompanyId: 1,
        Comment: comment,
        WarehouseId: 1,
        SaleOnlineIds: order.Id ? [order.Id] : [],
        Type: 'invoice',
        DeliveryPrice: shippingFee,
        CarrierId: carrierId,
        CarrierName: carrierName,
        CashOnDelivery: prepaidAmount < codValue ? (codValue - prepaidAmount) : 0,
        Address: receiverAddress,
        ReceiverName: receiverName,
        ReceiverPhone: receiverPhone,
        ReceiverAddress: receiverAddress,
        ReceiverNote: comment,
        OrderLines: orderLines
    };
}

async function handleDebtPaymentAfterSale(orderNumber) {
    const currentDebt = parseFloat(document.getElementById('salePrepaidAmount')?.value) || 0;
    const codAmount = parseFloat(document.getElementById('saleCOD')?.value) || 0;

    if (currentDebt <= 0) return;

    const phone = document.getElementById('saleReceiverPhone')?.value;
    if (!phone) return;

    const actualPayment = Math.min(currentDebt, codAmount);
    const remainingDebt = Math.max(0, currentDebt - codAmount);

    const reason = `Thanh toán công nợ ${actualPayment.toLocaleString('vi-VN')}đ qua đơn hàng #${orderNumber}${remainingDebt > 0 ? ` (còn nợ ${remainingDebt.toLocaleString('vi-VN')}đ)` : ''}`;

    await updateCustomerDebt(phone, remainingDebt, currentDebt, reason);

    // Update prepaid input
    const prepaidInput = document.getElementById('salePrepaidAmount');
    if (prepaidInput) {
        prepaidInput.value = remainingDebt;
        updateSaleCOD();
    }
}

async function sendBillToCustomerIfPossible(orderResult) {
    const chatInfo = window.chatDataManager?.getChatInfoForOrder(currentSaleOrderData);

    if (!chatInfo && currentSaleOrderData) {
        const psid = currentSaleOrderData.Facebook_ASUserId;
        const postId = currentSaleOrderData.Facebook_PostId;
        const channelId = postId ? postId.split('_')[0] : null;

        if (psid && channelId) {
            try {
                await sendBillToCustomer(orderResult, channelId, psid, { currentSaleOrderData });
                console.log('[SALE] Bill sent to customer');
            } catch (e) {
                console.warn('[SALE] Could not send bill:', e);
            }
        }
    } else if (chatInfo?.hasChat) {
        try {
            await sendBillToCustomer(orderResult, chatInfo.channelId, chatInfo.psid, { currentSaleOrderData });
            console.log('[SALE] Bill sent to customer');
        } catch (e) {
            console.warn('[SALE] Could not send bill:', e);
        }
    }
}

// =====================================================
// FETCH DEFAULT SALE DATA
// =====================================================
async function fetchDefaultSaleData() {
    try {
        const token = await window.tokenManager.getToken();

        const response = await fetch('https://tomato.tpos.vn/odata/FastSaleOrder/ODataService.DefaultGet?$expand=Warehouse,User,PriceList,Company,Journal,PaymentJournal,Partner,Carrier,Tax,SaleOrder', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json;charset=UTF-8',
                'tposappversion': window.TPOS_CONFIG?.tposAppVersion || '5.11.16.1',
                'x-tpos-lang': 'vi'
            },
            body: JSON.stringify({ model: { Type: 'invoice' } })
        });

        if (response.ok) {
            window.lastDefaultSaleData = await response.json();
            console.log('[SALE] Default data loaded');
        }

    } catch (error) {
        console.error('[SALE] Error fetching default data:', error);
    }
}

// =====================================================
// PRINT POPUP
// =====================================================
function openPrintPopup(orderData, context) {
    // Use bill-service if available
    if (window.billService && typeof window.billService.openPrintPopup === 'function') {
        window.billService.openPrintPopup(orderData, context);
        return;
    }

    // Fallback: simple print popup
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
        }
        return;
    }

    const html = generateBillHTML(orderData, context);
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
        printWindow.print();
    }, 500);
}

function generateBillHTML(orderData, context) {
    const saleData = context?.currentSaleOrderData || orderData;
    const orderNumber = orderData.Number || orderData.Id;
    const customerName = document.getElementById('saleReceiverName')?.value || saleData.PartnerName || '';
    const phone = document.getElementById('saleReceiverPhone')?.value || saleData.PartnerPhone || '';
    const address = document.getElementById('saleReceiverAddress')?.value || saleData.PartnerAddress || '';

    const products = (saleData.orderLines || saleData.Details || []).map(p => {
        const name = p.ProductName || p.Product?.Name || '';
        const qty = p.ProductUOMQty || p.Quantity || 1;
        const price = p.PriceUnit || p.Price || 0;
        return `<tr><td>${escapeHtml(name)}</td><td>${qty}</td><td>${price.toLocaleString()}đ</td><td>${(qty * price).toLocaleString()}đ</td></tr>`;
    }).join('');

    const totalAmount = parseFloat(document.getElementById('saleTotalAmount')?.textContent?.replace(/[^\d]/g, '')) || orderData.AmountTotal || 0;
    const shipping = parseFloat(document.getElementById('saleShippingFee')?.value) || orderData.DeliveryPrice || 0;
    const cod = parseFloat(document.getElementById('saleCOD')?.value) || orderData.CashOnDelivery || 0;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Hóa đơn #${orderNumber}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 380px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; }
        .header h2 { margin: 0; font-size: 18px; }
        .info { margin-bottom: 15px; font-size: 13px; }
        .info-row { display: flex; justify-content: space-between; padding: 3px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 15px; }
        th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
        th { background: #f0f0f0; }
        .total-row { font-weight: bold; background: #f9f9f9; }
        .footer { text-align: center; font-size: 11px; color: #666; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>NHI JUDY SHOP</h2>
        <p>HÓA ĐƠN BÁN HÀNG</p>
        <p>#${orderNumber}</p>
    </div>
    <div class="info">
        <div class="info-row"><span>Khách hàng:</span><span>${escapeHtml(customerName)}</span></div>
        <div class="info-row"><span>Điện thoại:</span><span>${escapeHtml(phone)}</span></div>
        <div class="info-row"><span>Địa chỉ:</span><span>${escapeHtml(address)}</span></div>
    </div>
    <table>
        <thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>${products}</tbody>
        <tfoot>
            <tr><td colspan="3">Tổng tiền hàng:</td><td>${totalAmount.toLocaleString()}đ</td></tr>
            <tr><td colspan="3">Phí vận chuyển:</td><td>${shipping.toLocaleString()}đ</td></tr>
            <tr class="total-row"><td colspan="3">COD:</td><td>${cod.toLocaleString()}đ</td></tr>
        </tfoot>
    </table>
    <div class="footer">
        <p>Cảm ơn quý khách!</p>
        <p>${new Date().toLocaleString('vi-VN')}</p>
    </div>
</body>
</html>`;
}

// =====================================================
// SEND BILL TO CUSTOMER
// =====================================================
async function sendBillToCustomer(orderData, channelId, psid, context) {
    if (!window.pancakeDataManager) {
        return { success: false, error: 'No data manager' };
    }

    try {
        // Generate bill image
        const billHtml = generateBillHTML(orderData, context);

        // Use image generator if available
        if (window.orderImageGenerator) {
            const imageBlob = await window.orderImageGenerator.generateBillImage(billHtml);
            if (imageBlob) {
                const result = await window.pancakeDataManager.sendImage(channelId, psid, imageBlob);
                return { success: result };
            }
        }

        // Fallback: send text message
        const orderNumber = orderData.Number || orderData.Id;
        const cod = parseFloat(document.getElementById('saleCOD')?.value) || orderData.CashOnDelivery || 0;
        const message = `✅ Đơn hàng #${orderNumber} đã được xác nhận!\nCOD: ${cod.toLocaleString('vi-VN')}đ\nCảm ơn quý khách!`;

        const result = await window.pancakeDataManager.sendMessage(channelId, psid, message);
        return { success: result };

    } catch (error) {
        console.error('[SEND-BILL] Error:', error);
        return { success: false, error: error.message };
    }
}

// =====================================================
// KEYBOARD SHORTCUTS
// =====================================================
document.addEventListener('keydown', function(e) {
    if (!isSaleModalOpen) return;

    // F9 to confirm and print
    if (e.key === 'F9') {
        e.preventDefault();
        confirmAndPrintSale();
    }

    // ESC to close
    if (e.key === 'Escape') {
        closeSaleButtonModal(false);
    }
});

// =====================================================
// HELPER
// =====================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================================================
// EXPORTS
// =====================================================
window.openSaleModal = openSaleModal;
window.closeSaleButtonModal = closeSaleButtonModal;
window.changeSaleProductQty = changeSaleProductQty;
window.setSaleProductQty = setSaleProductQty;
window.removeSaleProduct = removeSaleProduct;
window.recalculateSaleTotals = recalculateSaleTotals;
window.updateSaleTotals = updateSaleTotals;
window.updateSaleCOD = updateSaleCOD;
window.loadDeliveryCarriers = loadDeliveryCarriers;
window.getCachedDeliveryCarriers = getCachedDeliveryCarriers;
window.confirmAndPrintSale = confirmAndPrintSale;
window.openPrintPopup = openPrintPopup;
window.sendBillToCustomer = sendBillToCustomer;
window.fetchDefaultSaleData = fetchDefaultSaleData;

console.log('[TAB1-SALE] Module loaded');
