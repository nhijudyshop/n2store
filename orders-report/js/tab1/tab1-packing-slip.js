// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PACKING SLIP MODULE (Phiếu Soạn Hàng)
// =====================================================

let packingSlipOrderData = null;
let packingSlipOrderLines = [];

/**
 * Open Packing Slip Modal - validates selection, fetches order lines, renders modal
 */
async function openPackingSlipModal() {
    if (selectedOrderIds.size !== 1) {
        if (window.notificationManager) {
            window.notificationManager.warning('Vui lòng chọn đúng 1 đơn hàng');
        }
        return;
    }

    const orderId = Array.from(selectedOrderIds)[0];
    const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);

    if (!order) {
        if (window.notificationManager) {
            window.notificationManager.error('Không tìm thấy đơn hàng');
        }
        return;
    }

    packingSlipOrderData = order;
    packingSlipOrderLines = [];

    // Show modal
    const modal = document.getElementById('packingSlipModal');
    modal.style.display = 'flex';

    // Show customer info
    const customerInfo = document.getElementById('packingSlipCustomerInfo');
    const customerName = order.PartnerName || order.Name || '';
    const phone = order.Telephone || order.PartnerPhone || '';
    const address = order.PartnerAddress || order.Address || '';
    const stt = order.SessionIndex || '';

    // Get nhân viên from employee assignment (based on SessionIndex)
    const nhanVien = (typeof getEmployeeName === 'function' && getEmployeeName(order.SessionIndex)) || '';

    customerInfo.innerHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div><b>Khách hàng:</b> ${customerName}</div>
            <div><b>SĐT:</b> ${phone}${nhanVien ? ` &nbsp;-&nbsp; <b>Nhân viên:</b> ${nhanVien}` : ''}</div>
            ${stt ? `<div><b>STT:</b> ${stt}</div>` : ''}
        </div>
        ${address ? `<div style="margin-top:4px;"><b>Địa chỉ:</b> ${address}</div>` : ''}
    `;

    // Show loading, hide table body
    document.getElementById('packingSlipLoading').style.display = 'block';
    document.getElementById('packingSlipProductBody').innerHTML = '';

    // Fetch order details from API
    try {
        const orderDetails = await fetchOrderDetailsForSale(orderId);

        if (orderDetails && orderDetails.orderLines && orderDetails.orderLines.length > 0) {
            packingSlipOrderLines = orderDetails.orderLines;

            // Update customer info with partner data if available
            if (orderDetails.partner) {
                const p = orderDetails.partner;
                const updatedName = p.Name || p.DisplayName || customerName;
                const updatedPhone = p.Phone || phone;
                const updatedAddress = p.Street || address;

                customerInfo.innerHTML = `
                    <div style="display:flex; gap:20px; flex-wrap:wrap;">
                        <div><b>Khách hàng:</b> ${updatedName}</div>
                        <div><b>SĐT:</b> ${updatedPhone}${nhanVien ? ` &nbsp;-&nbsp; <b>Nhân viên:</b> ${nhanVien}` : ''}</div>
                        ${stt ? `<div><b>STT:</b> ${stt}</div>` : ''}
                    </div>
                    ${updatedAddress ? `<div style="margin-top:4px;"><b>Địa chỉ:</b> ${updatedAddress}</div>` : ''}
                `;
            }
        } else {
            // Fallback: use order's existing product info if available
            if (window.notificationManager) {
                window.notificationManager.warning('Không thể tải chi tiết sản phẩm');
            }
        }
    } catch (e) {
        console.error('[PACKING-SLIP] Error fetching order details:', e);
    }

    // Hide loading
    document.getElementById('packingSlipLoading').style.display = 'none';

    // Render product rows
    renderPackingSlipProducts();
}

/**
 * Render product rows in the packing slip modal
 */
function renderPackingSlipProducts() {
    const tbody = document.getElementById('packingSlipProductBody');

    if (packingSlipOrderLines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Không có sản phẩm</td></tr>';
        return;
    }

    let totalQty = 0;
    let totalAmount = 0;

    const rows = packingSlipOrderLines.map((line, idx) => {
        const productName = line.ProductName || line.ProductNameGet || line.Product?.Name || '';
        const khoDiChoSTT = window.KhoDiChoCache ? window.KhoDiChoCache.getSTT(line) : 0;
        const displayName = `${khoDiChoSTT} - ${productName}`;
        const productNote = line.Note || '';
        const qty = line.ProductUOMQty || line.Quantity || 1;

        totalQty += qty;

        return `
            <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:8px 6px; text-align:center;">${idx + 1}</td>
                <td style="padding:8px 6px; text-align:center;">
                    <label style="display:flex; align-items:center; justify-content:center; cursor:pointer; margin:0;">
                        <input type="checkbox" data-line-index="${idx}" class="packing-slip-wait-cb"
                            style="width:18px; height:18px; cursor:pointer; accent-color:#f59e0b;" />
                    </label>
                </td>
                <td style="padding:8px 6px; text-align:left; word-break:break-word;">
                    ${displayName}
                    ${productNote ? `<div style="font-size:11px; color:#f59e0b; margin-top:2px;"><i>${productNote}</i></div>` : ''}
                </td>
                <td style="padding:8px 6px; text-align:center;">${qty}</td>
                <td style="padding:8px 6px;">
                    <input type="text" data-note-index="${idx}" class="packing-slip-note"
                        placeholder="Nhập ghi chú..."
                        style="width:100%; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px; font-size:12px; outline:none;" />
                </td>
            </tr>
        `;
    }).join('');

    // Add total row
    const totalRow = `
        <tr style="border-top:2px solid #e5e7eb; font-weight:bold; background:#f9fafb;">
            <td colspan="3" style="padding:8px 6px; text-align:right;">Tổng:</td>
            <td style="padding:8px 6px; text-align:center;">${totalQty}</td>
            <td style="padding:8px 6px;"></td>
        </tr>
    `;

    tbody.innerHTML = rows + totalRow;
}

/**
 * Close the packing slip modal
 */
function closePackingSlipModal() {
    const modal = document.getElementById('packingSlipModal');
    modal.style.display = 'none';
    packingSlipOrderData = null;
    packingSlipOrderLines = [];
}

/**
 * Generate and print the packing slip
 */
function printPackingSlip() {
    if (!packingSlipOrderData || packingSlipOrderLines.length === 0) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không có dữ liệu để in');
        }
        return;
    }

    // Collect "Chờ Hàng" selections
    const checkboxes = document.querySelectorAll('.packing-slip-wait-cb');
    const waitingIndices = new Set();
    checkboxes.forEach(cb => {
        if (cb.checked) {
            waitingIndices.add(parseInt(cb.dataset.lineIndex));
        }
    });

    // Collect notes
    const noteInputs = document.querySelectorAll('.packing-slip-note');
    const notes = {};
    noteInputs.forEach(input => {
        const idx = parseInt(input.dataset.noteIndex);
        const val = input.value.trim();
        if (val) notes[idx] = val;
    });

    // Build print HTML
    const html = generatePackingSlipHTML(waitingIndices, notes);

    // Open print window
    const printWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!printWindow) {
        if (window.notificationManager) {
            window.notificationManager.warning('Không thể mở cửa sổ in. Vui lòng cho phép popup.');
        }
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = function () {
        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
        }, 500);
    };

    // Auto-tag "CHỜ HÀNG VỀ" after printing
    autoTagChoHangVe();

    // Auto-transition processing tag to "Phiếu Soạn Hàng"
    const saleOnlineId = packingSlipOrderData.SaleOnlineIds?.[0] || packingSlipOrderData.Id;
    if (saleOnlineId && window.onPtagPackingSlipPrinted) {
        window.onPtagPackingSlipPrinted(String(saleOnlineId));
    }

    // Clear bulk selection after printing
    if (typeof deselectAllOrders === 'function') {
        deselectAllOrders();
    }

    // Close the packing slip modal
    closePackingSlipModal();
}

/**
 * Auto-tag the current packing slip order with "CHỜ HÀNG VỀ"
 */
async function autoTagChoHangVe() {
    try {
        const order = packingSlipOrderData;
        if (!order) return;

        const saleOnlineId = order.SaleOnlineIds?.[0] || order.Id;
        if (!saleOnlineId) return;

        if (window.findOrCreateTag && window.addTagToOrder) {
            const tag = await window.findOrCreateTag('CHỜ HÀNG VỀ');
            if (tag) {
                const success = await window.addTagToOrder(saleOnlineId, {
                    Id: tag.Id,
                    Name: tag.Name,
                    Color: tag.Color || '#6366f1'
                });
                if (success) {
                    console.log('[PACKING-SLIP] Auto-tagged order with "CHỜ HÀNG VỀ"');
                    // Update local data and UI row
                    const localOrder = window.OrderStore?.get(saleOnlineId) || allData?.find(o => o.Id === saleOnlineId);
                    if (localOrder) {
                        let currentTags = [];
                        try {
                            currentTags = typeof localOrder.Tags === 'string' ? JSON.parse(localOrder.Tags) : (localOrder.Tags || []);
                        } catch (e) { currentTags = []; }
                        if (!currentTags.some(t => t.Id === tag.Id)) {
                            currentTags.push({ Id: tag.Id, Name: tag.Name, Color: tag.Color || '#6366f1' });
                        }
                        const newTagsJson = JSON.stringify(currentTags);
                        localOrder.Tags = newTagsJson;
                        if (window.OrderStore?.get(saleOnlineId)) {
                            window.OrderStore.get(saleOnlineId).Tags = newTagsJson;
                        }
                        if (typeof updateRowTagsOnly === 'function') {
                            updateRowTagsOnly(saleOnlineId, newTagsJson, localOrder.Code);
                        } else if (typeof window.updateOrderInTable === 'function') {
                            window.updateOrderInTable(saleOnlineId, { Tags: newTagsJson });
                        }
                    }
                    if (window.notificationManager) {
                        window.notificationManager.success('Đã gắn tag "CHỜ HÀNG VỀ"');
                    }
                }
            }
        }
    } catch (e) {
        console.error('[PACKING-SLIP] Error auto-tagging:', e);
    }
}

/**
 * Generate packing slip HTML for printing (A4 format, similar to Phiếu Đặt Hàng)
 * @param {Set} waitingIndices - Set of line indices marked as "Chờ Hàng"
 * @param {Object} notes - Map of line index to note string
 */
function generatePackingSlipHTML(waitingIndices, notes = {}) {
    const order = packingSlipOrderData;
    const lines = packingSlipOrderLines;

    // Customer info
    const customerName = order.PartnerName || order.Name || '';
    const phone = order.Telephone || order.PartnerPhone || '';
    const address = order.PartnerAddress || order.Address || '';
    const stt = order.SessionIndex || '';

    // Nhân viên from employee assignment (based on SessionIndex)
    const nhanVien = (typeof getEmployeeName === 'function' && getEmployeeName(order.SessionIndex)) || '';

    // Bill number uses the order's STT
    const billNumber = stt || '';
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Product rows
    let totalQty = 0;

    const productRows = lines.map((line, idx) => {
        const productName = line.ProductName || line.ProductNameGet || line.Product?.Name || '';
        const khoDiChoSTT = window.KhoDiChoCache ? window.KhoDiChoCache.getSTT(line) : 0;
        const displayName = `${khoDiChoSTT} - ${productName}`;
        const productNote = line.Note || '';
        const qty = line.ProductUOMQty || line.Quantity || 1;
        const price = line.PriceUnit || line.Price || 0;
        const isWaiting = waitingIndices.has(idx);
        const note = notes[idx] || '';

        totalQty += qty;

        const priceShort = Math.round(price / 1000);

        // Build ghi chú: nếu Chờ Hàng thì thêm "CH" in đậm lớn
        let ghiChu = '';
        if (isWaiting) {
            ghiChu += '<b style="font-size:18px;">CH</b>';
        }
        if (note) {
            ghiChu += (ghiChu ? ' ' : '') + `<span style="font-size:12px;">${note}</span>`;
        }

        return `
            <tr>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:left; word-break:break-word; font-size:14px; font-weight:bold;">
                    ${displayName}
                    ${productNote ? `<div style="font-size:14px; font-weight:bold; margin-top:2px;">${productNote}</div>` : ''}
                </td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${qty}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:right; font-size:11px;">${priceShort}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${ghiChu}</td>
            </tr>`;
    }).join('');

    // Total row
    const totalRow = `
        <tr>
            <td colspan="2" style="border:1px solid #000; padding:5px 4px; text-align:right; font-weight:bold;">Tổng:</td>
            <td style="border:1px solid #000; padding:5px 4px; text-align:center; font-weight:bold;">${totalQty}</td>
            <td style="border:1px solid #000; padding:5px 4px;"></td>
            <td style="border:1px solid #000; padding:5px 4px;"></td>
        </tr>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Phiếu Soạn Hàng</title>
    <style>
        @page { margin: 5mm 3mm; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            color: #000;
            margin: 0;
            padding: 0;
        }
        .container { width: 100%; margin: 0; padding: 3px; }
        h2 { text-align: center; margin: 10px 0 5px 0; font-size: 20px; text-transform: uppercase; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 13px; }
        .info-row div { flex: 1; }
        .info-row .right { text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: auto; }
        th { border: 1px solid #000; padding: 4px 3px; text-align: center; background: #f5f5f5; font-size: 11px; }
        td { padding: 4px 3px; }
        .footer-sign { display: flex; justify-content: space-around; margin-top: 30px; text-align: center; }
        .footer-sign div { width: 40%; }
        .footer-sign b { font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Phiếu Soạn Hàng</h2>
        <div style="text-align:center; margin-bottom:10px;">
            <span style="font-size:22px; font-weight:bold;">${billNumber}</span>
            <span style="font-size:12px; margin-left:10px;">${dateStr}</span>
        </div>

        <div style="margin-bottom:3px; font-size:13px;"><b>Khách hàng:</b> ${customerName}</div>
        <div style="margin-bottom:3px; font-size:13px;"><b>SĐT:</b> ${phone}${nhanVien ? ` &nbsp;-&nbsp; <b>Nhân viên:</b> ${nhanVien}` : ''}</div>
        ${address ? `<div style="margin-bottom:3px; font-size:13px;"><b>Địa chỉ:</b> ${address}</div>` : ''}

        <table>
            <thead>
                <tr>
                    <th style="width:15px; font-size:9px;">STT</th>
                    <th>Sản phẩm</th>
                    <th style="width:15px; font-size:6px;">SL</th>
                    <th style="width:22px; font-size:6px;">Giá</th>
                    <th style="width:40px; font-size:9px;">Ghi chú</th>
                </tr>
            </thead>
            <tbody>
                ${productRows}
                ${totalRow}
            </tbody>
        </table>

    </div>
</body>
</html>`;
}

// Close modal when clicking outside
document.getElementById('packingSlipModal')?.addEventListener('click', function (e) {
    if (e.target === this) {
        closePackingSlipModal();
    }
});

// Close with Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('packingSlipModal');
        if (modal && modal.style.display === 'flex') {
            closePackingSlipModal();
        }
    }
});

// Export functions
window.openPackingSlipModal = openPackingSlipModal;
window.closePackingSlipModal = closePackingSlipModal;
window.printPackingSlip = printPackingSlip;
