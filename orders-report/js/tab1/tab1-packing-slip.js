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

    // Get nhân viên from tags
    let nhanVien = '';
    try {
        const tags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : (order.Tags || []);
        if (Array.isArray(tags)) {
            const nvTag = tags.find(t => {
                const name = (t.Name || '').toUpperCase();
                return name.startsWith('OK ') || name.includes('HUYỀN') || name.includes('NHỎ') || name.includes('NHI');
            });
            if (nvTag) nhanVien = nvTag.Name;
        }
    } catch (e) { }

    customerInfo.innerHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap;">
            <div><b>Khách hàng:</b> ${customerName}</div>
            <div><b>SĐT:</b> ${phone}</div>
            ${stt ? `<div><b>STT:</b> ${stt}</div>` : ''}
            ${nhanVien ? `<div><b>Nhân viên:</b> ${nhanVien}</div>` : ''}
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
                        <div><b>SĐT:</b> ${updatedPhone}</div>
                        ${stt ? `<div><b>STT:</b> ${stt}</div>` : ''}
                        ${nhanVien ? `<div><b>Nhân viên:</b> ${nhanVien}</div>` : ''}
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#9ca3af;">Không có sản phẩm</td></tr>';
        return;
    }

    let totalQty = 0;
    let totalAmount = 0;

    const rows = packingSlipOrderLines.map((line, idx) => {
        const productName = line.ProductName || line.ProductNameGet || line.Product?.Name || '';
        const uom = line.ProductUOMName || line.ProductUOM?.Name || 'Cái';
        const qty = line.ProductUOMQty || line.Quantity || 1;
        const price = line.PriceUnit || line.Price || 0;
        const total = qty * price;

        totalQty += qty;
        totalAmount += total;

        return `
            <tr style="border-bottom:1px solid #f3f4f6;">
                <td style="padding:8px 6px; text-align:center;">${idx + 1}</td>
                <td style="padding:8px 6px; text-align:center;">
                    <label style="display:flex; align-items:center; justify-content:center; cursor:pointer; margin:0;">
                        <input type="checkbox" data-line-index="${idx}" class="packing-slip-wait-cb"
                            style="width:18px; height:18px; cursor:pointer; accent-color:#f59e0b;" />
                    </label>
                </td>
                <td style="padding:8px 6px; text-align:left; word-break:break-word;">${productName}</td>
                <td style="padding:8px 6px; text-align:center;">${uom}</td>
                <td style="padding:8px 6px; text-align:center;">${qty}</td>
                <td style="padding:8px 6px; text-align:right;">${price.toLocaleString('vi-VN')}</td>
                <td style="padding:8px 6px; text-align:right;">${total.toLocaleString('vi-VN')}</td>
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
            <td colspan="4" style="padding:8px 6px; text-align:right;">Tổng:</td>
            <td style="padding:8px 6px; text-align:center;">${totalQty}</td>
            <td style="padding:8px 6px;"></td>
            <td style="padding:8px 6px; text-align:right;">${totalAmount.toLocaleString('vi-VN')}</td>
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

    setTimeout(() => {
        if (printWindow && !printWindow.closed) {
            printWindow.focus();
            printWindow.print();
        }
    }, 1500);
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

    // Nhân viên
    let nhanVien = '';
    try {
        const tags = typeof order.Tags === 'string' ? JSON.parse(order.Tags) : (order.Tags || []);
        if (Array.isArray(tags)) {
            const nvTag = tags.find(t => {
                const name = (t.Name || '').toUpperCase();
                return name.startsWith('OK ') || name.includes('HUYỀN') || name.includes('NHỎ') || name.includes('NHI');
            });
            if (nvTag) nhanVien = nvTag.Name;
        }
    } catch (e) { }

    // Bill number & date
    const billNumber = `SO${stt || ''}`;
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Product rows
    let totalQty = 0;
    let totalAmount = 0;

    const productRows = lines.map((line, idx) => {
        const productName = line.ProductName || line.ProductNameGet || line.Product?.Name || '';
        const uom = line.ProductUOMName || line.ProductUOM?.Name || 'Cái';
        const qty = line.ProductUOMQty || line.Quantity || 1;
        const price = line.PriceUnit || line.Price || 0;
        const total = qty * price;
        const isWaiting = waitingIndices.has(idx);
        const note = notes[idx] || '';

        totalQty += qty;
        totalAmount += total;

        return `
            <tr>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center; font-size:15px;">
                    ${isWaiting ? '<b style="color:#c00;">✗</b>' : ''}
                </td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:left; word-break:break-word;">
                    ${productName}${note ? `<br/><i style="font-size:11px; color:#555;">Ghi chú: ${note}</i>` : ''}
                </td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${uom}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${qty}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:right;">${price.toLocaleString('vi-VN')}</td>
                <td style="border:1px solid #000; padding:5px 4px; text-align:right;">${total.toLocaleString('vi-VN')}</td>
            </tr>`;
    }).join('');

    // Total row
    const totalRow = `
        <tr>
            <td colspan="4" style="border:1px solid #000; padding:5px 4px; text-align:right; font-weight:bold;">Tổng:</td>
            <td style="border:1px solid #000; padding:5px 4px; text-align:center; font-weight:bold;">${totalQty}</td>
            <td style="border:1px solid #000; padding:5px 4px;"></td>
            <td style="border:1px solid #000; padding:5px 4px; text-align:right; font-weight:bold;">${totalAmount.toLocaleString('vi-VN')}</td>
        </tr>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Phiếu Soạn Hàng</title>
    <style>
        @page { margin: 10mm 8mm; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            color: #000;
            margin: 0;
            padding: 0;
        }
        .container { max-width: 210mm; margin: 0 auto; padding: 10px; }
        h2 { text-align: center; margin: 10px 0 5px 0; font-size: 20px; text-transform: uppercase; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 13px; }
        .info-row div { flex: 1; }
        .info-row .right { text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { border: 1px solid #000; padding: 6px 4px; text-align: center; background: #f5f5f5; font-size: 12px; }
        .footer-sign { display: flex; justify-content: space-around; margin-top: 30px; text-align: center; }
        .footer-sign div { width: 40%; }
        .footer-sign b { font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Phiếu Soạn Hàng</h2>
        <div style="text-align:center; margin-bottom:10px; font-size:12px;">
            <b>Số phiếu:</b> ${billNumber} - <b>Date:</b> ${dateStr}
        </div>

        <div class="info-row">
            <div><b>Khách hàng:</b> ${customerName}</div>
            <div class="right"><b>Điện thoại:</b> ${phone}</div>
        </div>
        <div class="info-row">
            <div><b>Địa chỉ:</b> ${address}</div>
            <div class="right"><b>Nhân viên:</b> ${nhanVien}</div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width:35px;">STT</th>
                    <th style="width:55px;">Chờ Hàng</th>
                    <th>Product</th>
                    <th style="width:50px;">Đơn vị</th>
                    <th style="width:45px;">Số lượng</th>
                    <th style="width:80px;">Giá</th>
                    <th style="width:90px;">Tổng</th>
                </tr>
            </thead>
            <tbody>
                ${productRows}
                ${totalRow}
            </tbody>
        </table>

        <div class="footer-sign">
            <div>
                <b>NGƯỜI MUA</b>
                <br/><br/><br/><br/>
            </div>
            <div>
                <b>NGƯỜI BÁN</b>
                <br/><br/><br/><br/>
            </div>
        </div>
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
