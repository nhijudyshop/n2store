// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// PACKING SLIP MODULE FOR DON-INBOX (Phiếu Soạn Hàng)
//
// Clone 100% chức năng từ orders-report/js/tab1/tab1-packing-slip.js
// nhưng adapt cho social order (data shape khác):
// - orders-report: order.PartnerName, order.Telephone, order.PartnerAddress, OrderLine[].ProductName/PriceUnit/ProductUOMQty
// - don-inbox:    order.customerName, order.phone, order.address, products[].productName/sellingPrice/quantity
//
// Workflow giống hệt: chỉ chọn 1 đơn → mở modal → chọn "Chờ Hàng" / ghi chú
// → in qua iframe → close modal.
// =====================================================

(function () {
    'use strict';

    let packingSlipOrderData = null;
    let packingSlipProducts = [];

    function _getSelectedOrderId() {
        const sel = window.SocialOrderState?.selectedOrders;
        if (!sel || sel.size !== 1) return null;
        return Array.from(sel)[0];
    }

    function _findOrder(orderId) {
        const list = window.SocialOrderState?.orders || [];
        return list.find((o) => o.id === orderId) || null;
    }

    function _showNotice(msg, type) {
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, type || 'info');
            return;
        }
        if (window.notificationManager) {
            const fn = window.notificationManager[type] || window.notificationManager.show;
            if (typeof fn === 'function') fn.call(window.notificationManager, msg);
        } else {
            console.log('[PACKING-SLIP][' + (type || 'info') + ']', msg);
        }
    }

    /**
     * Mở modal Phiếu Soạn Hàng
     */
    async function openPackingSlipModal() {
        const orderId = _getSelectedOrderId();
        if (!orderId) {
            _showNotice('Vui lòng chọn đúng 1 đơn hàng', 'warning');
            return;
        }

        const order = _findOrder(orderId);
        if (!order) {
            _showNotice('Không tìm thấy đơn hàng', 'error');
            return;
        }

        packingSlipOrderData = order;
        packingSlipProducts = Array.isArray(order.products) ? order.products.slice() : [];

        const modal = document.getElementById('packingSlipModal');
        if (!modal) {
            _showNotice('Modal không tồn tại', 'error');
            return;
        }
        modal.style.display = 'flex';

        const customerInfo = document.getElementById('packingSlipCustomerInfo');
        const customerName = order.customerName || '';
        const phone = order.phone || '';
        const address = order.address || '';

        customerInfo.innerHTML = `
            <div style="display:flex; gap:20px; flex-wrap:wrap;">
                <div><b>Khách hàng:</b> ${_escape(customerName)}</div>
                <div><b>SĐT:</b> ${_escape(phone)}</div>
            </div>
            ${address ? `<div style="margin-top:4px;"><b>Địa chỉ:</b> ${_escape(address)}</div>` : ''}
        `;

        document.getElementById('packingSlipLoading').style.display = 'none';
        renderPackingSlipProducts();
    }

    function _escape(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderPackingSlipProducts() {
        const tbody = document.getElementById('packingSlipProductBody');
        if (!tbody) return;

        if (packingSlipProducts.length === 0) {
            tbody.innerHTML =
                '<tr><td colspan="5" style="text-align:center; padding:20px; color:#9ca3af;">Không có sản phẩm</td></tr>';
            return;
        }

        let totalQty = 0;

        const rows = packingSlipProducts
            .map((p, idx) => {
                const productName = p.productName || p.name || '';
                const variant = p.variant || '';
                const displayName = variant ? `${productName} - ${variant}` : productName;
                const productNote = p.note || p.productNote || '';
                const qty = parseFloat(p.quantity) || 1;

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
                        ${_escape(displayName)}
                        ${productNote ? `<div style="font-size:11px; color:#f59e0b; margin-top:2px;"><i>${_escape(productNote)}</i></div>` : ''}
                    </td>
                    <td style="padding:8px 6px; text-align:center;">${qty}</td>
                    <td style="padding:8px 6px;">
                        <input type="text" data-note-index="${idx}" class="packing-slip-note"
                            placeholder="Nhập ghi chú..."
                            style="width:100%; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px; font-size:12px; outline:none;" />
                    </td>
                </tr>
            `;
            })
            .join('');

        const totalRow = `
            <tr style="border-top:2px solid #e5e7eb; font-weight:bold; background:#f9fafb;">
                <td colspan="3" style="padding:8px 6px; text-align:right;">Tổng:</td>
                <td style="padding:8px 6px; text-align:center;">${totalQty}</td>
                <td style="padding:8px 6px;"></td>
            </tr>
        `;

        tbody.innerHTML = rows + totalRow;
    }

    function closePackingSlipModal() {
        const modal = document.getElementById('packingSlipModal');
        if (modal) modal.style.display = 'none';
        packingSlipOrderData = null;
        packingSlipProducts = [];
    }

    function printPackingSlip() {
        if (!packingSlipOrderData || packingSlipProducts.length === 0) {
            _showNotice('Không có dữ liệu để in', 'warning');
            return;
        }

        const checkboxes = document.querySelectorAll('.packing-slip-wait-cb');
        const waitingIndices = new Set();
        checkboxes.forEach((cb) => {
            if (cb.checked) {
                waitingIndices.add(parseInt(cb.dataset.lineIndex, 10));
            }
        });

        const noteInputs = document.querySelectorAll('.packing-slip-note');
        const notes = {};
        noteInputs.forEach((input) => {
            const idx = parseInt(input.dataset.noteIndex, 10);
            const val = input.value.trim();
            if (val) notes[idx] = val;
        });

        const html = generatePackingSlipHTML(waitingIndices, notes);

        const oldFrame = document.getElementById('packingSlipPrintFrame');
        if (oldFrame) oldFrame.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'packingSlipPrintFrame';
        iframe.style.cssText =
            'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        const triggerPrint = () => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error('[PACKING-SLIP] Print error:', e);
            }
            const cleanup = () => setTimeout(() => iframe.remove(), 100);
            if (iframe.contentWindow.matchMedia) {
                const mql = iframe.contentWindow.matchMedia('print');
                mql.addEventListener('change', (e) => {
                    if (!e.matches) cleanup();
                });
            }
            iframe.contentWindow.onafterprint = cleanup;
            setTimeout(() => {
                if (document.getElementById('packingSlipPrintFrame')) iframe.remove();
            }, 60000);
        };

        iframe.onload = () => setTimeout(triggerPrint, 300);

        // Clear bulk selection (giống tab1 sau khi in)
        if (window.SocialOrderState?.selectedOrders) {
            window.SocialOrderState.selectedOrders.clear();
        }
        if (typeof window.updateSelectionUI === 'function') {
            window.updateSelectionUI();
        }
        if (typeof window.performTableSearch === 'function') {
            window.performTableSearch();
        }

        closePackingSlipModal();
    }

    function generatePackingSlipHTML(waitingIndices, notes) {
        const order = packingSlipOrderData;
        const lines = packingSlipProducts;

        const customerName = order.customerName || '';
        const phone = order.phone || '';
        const address = order.address || '';

        const stt = order.stt || order.id || '';
        const billNumber = stt;

        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let totalQty = 0;

        const productRows = lines
            .map((p, idx) => {
                const productName = p.productName || p.name || '';
                const variant = p.variant || '';
                const displayName = variant ? `${productName} - ${variant}` : productName;
                const productNote = p.note || p.productNote || '';
                const qty = parseFloat(p.quantity) || 1;
                const price = parseFloat(p.sellingPrice) || parseFloat(p.price) || 0;
                const isWaiting = waitingIndices.has(idx);
                const note = notes[idx] || '';

                totalQty += qty;

                const priceShort = Math.round(price / 1000);

                let ghiChu = '';
                if (isWaiting) ghiChu += '<b style="font-size:18px;">CH</b>';
                if (note)
                    ghiChu +=
                        (ghiChu ? ' ' : '') +
                        `<span style="font-size:12px;">${_escape(note)}</span>`;

                return `
                <tr>
                    <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${idx + 1}</td>
                    <td style="border:1px solid #000; padding:5px 4px; text-align:left; word-break:break-word; font-size:14px; font-weight:bold;">
                        ${_escape(displayName)}
                        ${productNote ? `<div style="font-size:14px; font-weight:bold; margin-top:2px;">${_escape(productNote)}</div>` : ''}
                    </td>
                    <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${qty}</td>
                    <td style="border:1px solid #000; padding:5px 4px; text-align:right; font-size:11px;">${priceShort}</td>
                    <td style="border:1px solid #000; padding:5px 4px; text-align:center;">${ghiChu}</td>
                </tr>`;
            })
            .join('');

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
        body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000; margin: 0; padding: 0; }
        .container { width: 100%; margin: 0; padding: 3px; }
        h2 { text-align: center; margin: 10px 0 5px 0; font-size: 20px; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; table-layout: auto; }
        th { border: 1px solid #000; padding: 4px 3px; text-align: center; background: #f5f5f5; font-size: 11px; }
        td { padding: 4px 3px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Phiếu Soạn Hàng</h2>
        <div style="text-align:center; margin-bottom:10px;">
            <span style="font-size:22px; font-weight:bold;">${_escape(billNumber)}</span>
            <span style="font-size:12px; margin-left:10px;">${dateStr}</span>
        </div>

        <div style="margin-bottom:3px; font-size:13px;"><b>Khách hàng:</b> ${_escape(customerName)}</div>
        <div style="margin-bottom:3px; font-size:13px;"><b>SĐT:</b> ${_escape(phone)}</div>
        ${address ? `<div style="margin-bottom:3px; font-size:13px;"><b>Địa chỉ:</b> ${_escape(address)}</div>` : ''}

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

    // Wire close-on-backdrop + ESC
    document.addEventListener('DOMContentLoaded', () => {
        const modal = document.getElementById('packingSlipModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closePackingSlipModal();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const m = document.getElementById('packingSlipModal');
                if (m && m.style.display === 'flex') closePackingSlipModal();
            }
        });
    });

    // Expose
    window.openPackingSlipModal = openPackingSlipModal;
    window.closePackingSlipModal = closePackingSlipModal;
    window.printPackingSlip = printPackingSlip;
})();
