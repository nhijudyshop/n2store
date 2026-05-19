// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bill Service (in PBH thermal 80mm + bulk + Messenger send)
// =====================================================
//
// Tách độc lập khỏi orders-report/js/utils/bill-service.js. Không depend
// TPOS data sources (lastDefaultSaleData, ProcessingTagState, WebWarehouseCache).
// Input: PBH object trả từ /api/fast-sale-orders/:number (đã có Partner,
// orderLines, totals, payment, delivery, sourceLink, etc.).
//
// Public API:
//   Web2Bill.generateHTML(pbh, opts) → string HTML 80mm template
//   Web2Bill.openPrint(pbh, opts)     → mở popup + auto-print
//   Web2Bill.openCombinedPrint(pbhs)  → 1 popup nhiều bills (page-break giữa)
//   Web2Bill.generateImage(pbh, opts) → Promise<Blob> JPEG < 480KB
//   Web2Bill.getMergedSttDisplay(pbh) → "84 + 313" nếu là merged order
//
// Convention:
// - PBH = Phiếu Bán Hàng (fast_sale_orders DB)
// - 80mm thermal printer template, font Arial 13px
// - Shop info từ window.WEB2_SHOP_CONFIG (settable global), fallback "NJD Live"
// - Source link (merge support): sourceLink.code có thể là "ORD-A+ORD-B" join

(function (global) {
    'use strict';

    if (global.Web2Bill) return;

    function _shop() {
        return (
            global.WEB2_SHOP_CONFIG || {
                name: 'NJD Live',
                deliveryNote:
                    'KHÔNG ĐƯỢC TỰ Ý HOÀN ĐƠN CÓ GÌ LIÊN HỆ HOTLINE CỦA SHOP 090 8888 674 ĐỂ ĐƯỢC HỖ TRỢ.\n\nSản phẩm nhận đổi trả trong vòng 2-4 ngày kể từ ngày nhận hàng, "ĐỐI VỚI SẢN PHẨM BỊ LỖI HOẶC SẢN PHẨM SHOP GIAO SAI".',
                comment: 'STK ngân hàng Lại Thụy Yến Nhi\n75918 (ACB)',
            }
        );
    }

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _fmtMoney(n) {
        return (Number(n) || 0).toLocaleString('vi-VN');
    }

    function _fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return (
            String(d.getDate()).padStart(2, '0') +
            '/' +
            String(d.getMonth() + 1).padStart(2, '0') +
            '/' +
            d.getFullYear() +
            ' ' +
            String(d.getHours()).padStart(2, '0') +
            ':' +
            String(d.getMinutes()).padStart(2, '0')
        );
    }

    // Tính STT hiển thị — support merged order (source_code = "ORD-A+ORD-B")
    // hoặc displayStt array. Return "84 + 313" nếu merge, "313" nếu single.
    function getMergedSttDisplay(pbh) {
        if (!pbh) return '';
        // Priority 1: sourceLink.code có ký tự "+" → merged order
        const src = pbh.sourceLink || {};
        if (src.code && String(src.code).includes('+')) {
            const codes = String(src.code)
                .split('+')
                .map((c) => c.trim());
            // Extract number tail (vd "NW-20260513-0084" → "0084" → 84)
            const stts = codes
                .map((c) => {
                    const m = c.match(/(\d+)$/);
                    return m ? parseInt(m[1], 10) : null;
                })
                .filter((n) => n != null)
                .sort((a, b) => a - b);
            if (stts.length > 1) return stts.join(' + ');
        }
        // Priority 2: mergedDisplayStt array (server có thể trả về)
        if (Array.isArray(pbh.mergedDisplayStt) && pbh.mergedDisplayStt.length > 1) {
            return pbh.mergedDisplayStt
                .map((n) => parseInt(n, 10))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b)
                .join(' + ');
        }
        // Fallback: displayStt single
        return String(pbh.displayStt || pbh.display_stt || '');
    }

    function generateHTML(pbh, opts = {}) {
        if (!pbh) return '';
        const shop = _shop();
        const partner = pbh.partner || {};
        const totals = pbh.totals || {};
        const payment = pbh.payment || {};
        const delivery = pbh.delivery || {};
        const lines = pbh.orderLines || [];

        // Customer info
        const recName = partner.name || '';
        const recPhone = partner.phone || '';
        const recAddr = partner.address || '';
        const sellerName = pbh.createdByName || pbh.assignedUser?.name || '';

        // Money
        const subtotal = Number(totals.untaxed) || 0;
        const discount = Number(totals.discount) || 0;
        const shipping = Number(delivery.price) || 0;
        const finalTotal = Number(totals.total) || subtotal - discount + shipping;
        const prepaid = Number(payment.amount) || 0;
        const cod = Number(payment.residual) || Math.max(0, finalTotal - prepaid);

        // STT (merge-aware)
        const sttDisplay = getMergedSttDisplay(pbh);

        // Carrier
        const carrierName = delivery.carrierName || pbh.carrierName || '';

        // Has virtual debt (return ticket consumed)
        const hasVirtualDebt = !!(opts.hasVirtualDebt || pbh.hasVirtualDebt);

        // Date
        const billDate = pbh.dateInvoice || pbh.dateCreated || new Date().toISOString();
        const dateStr = _fmtDate(billDate);

        // Barcode
        const billNumber = pbh.number || '';
        const barcodeUrl = billNumber
            ? `https://statics.tpos.vn/Web/Barcode?type=Code 128&value=${encodeURIComponent(billNumber)}&width=600&height=100`
            : '';

        // Comment + delivery note
        const orderComment = pbh.comment || '';
        let shopDeliveryNote = shop.deliveryNote;
        if (/thu\s*về/i.test(orderComment)) {
            shopDeliveryNote = shopDeliveryNote.trimEnd() + ' Thu về';
        }
        const shopComment = shop.comment;

        // Products HTML
        let totalQty = 0;
        const productsHTML = lines
            .map((it) => {
                const qty = Number(it.quantity || it.Quantity || 0);
                const price = Number(it.priceUnit || it.PriceUnit || 0);
                const total = qty * price;
                const name = it.productName || it.ProductName || '';
                const uom = it.uomName || it.ProductUOMName || 'Cái';
                const note = it.note || it.Note || '';
                totalQty += qty;
                return `<tr>
    <td class="PaddingProduct word-break" colspan="3" style="border-bottom:none">
        <label>${_esc(name)}${note ? ` <span style="font-weight:bold">(${_esc(note)})</span>` : ''}</label>
    </td>
</tr>
<tr>
    <td class="text-center numberPadding">${qty} ${_esc(uom)}</td>
    <td class="text-right numberPadding">${_fmtMoney(price)}</td>
    <td class="text-right numberPadding">${_fmtMoney(total)}</td>
</tr>`;
            })
            .join('\n');

        return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phiếu bán hàng - ${_esc(shop.name)}</title>
<style>
@page { margin: 1mm 0; }
html, body { width: 80mm; margin: auto; color: #000 !important; font-size: 13px;
    font-family: Arial, Helvetica, sans-serif; line-height: 1.2; }
*, *:before, *:after { box-sizing: border-box; }
.container { padding: 0 10px; margin: auto; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-left { text-align: left; }
.word-break { word-break: break-word; }
.font-bold { font-weight: bold; }
.hidden { display: none !important; }
label { font-weight: bold; display: inline-block; margin-bottom: 5px; }
h3 { font-size: 15px !important; font-weight: bold; margin: 0.5em 0; }
table { width: 100%; max-width: 100%; border-collapse: collapse; }
.table { width: 100%; margin-bottom: 10px; }
.table thead > tr > th { padding: 1px; vertical-align: middle; }
.table tbody > tr > td { padding: 1px; }
.table tfoot > tr > td { padding: 1px; }
.table tbody > tr > td.numberPadding { padding-top: 0; padding-bottom: 2px; border-top: none !important; }
.table tbody > tr > td.PaddingProduct { padding-top: 2px; padding-bottom: 2px; border-bottom: none !important; }
.table-bordered { border: 1px solid #000; }
.table-bordered > thead > tr > th { border: 1px solid #000; padding: 2px; }
.table-cs > thead > tr > th { padding: 2px 4px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
.print-header, .print-header td, .print-header th { border: none !important; padding: 0 !important; }
.size-16 { font-size: 16px; }
hr.dash-cs { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
.page-break { display: block; height: 0; page-break-before: always; }
</style></head>
<body>
<div class="container">
<div class="text-center"><span style="font-size:16px;font-weight:bold">${_esc(shop.name)}</span></div>
<table class="table print-header">
<thead>
<tr><th class="text-center">
    ${carrierName ? `<span>${_esc(carrierName)}</span><br/>` : ''}
    ${hasVirtualDebt ? `<span style="font-weight:bold;color:#c00;">** CÓ ĐƠN THU VỀ **</span><br/>` : ''}
    <p class="size-16 font-bold">Tiền thu hộ: ${_fmtMoney(cod)}</p>
    <hr class="dash-cs" />
</th></tr>
<tr><th class="text-center"><h3 style="text-transform:uppercase">Phiếu bán hàng</h3></th></tr>
<tr><th><div class="text-center">
    ${barcodeUrl ? `<div><img src="${barcodeUrl}" style="width:95%" onerror="this.style.display='none'" /></div>` : ''}
    <strong>Số phiếu</strong>: ${_esc(billNumber)}
    <div><strong>Ngày</strong>: ${_esc(dateStr)}</div>
    <hr class="dash-cs" />
</div></th></tr>
<tr><th class="text-left">
    <div><strong>Khách hàng:</strong> ${_esc(recName)}</div>
    ${recAddr ? `<div><strong>Địa chỉ:</strong> ${_esc(recAddr)}</div>` : ''}
    <div><strong>Điện thoại:</strong> ${_esc(recPhone)}</div>
    ${sellerName ? `<div><strong>Người bán:</strong> ${_esc(sellerName)}</div>` : ''}
    ${sttDisplay ? `<div><strong>STT:</strong> ${_esc(sttDisplay)}</div>` : ''}
</th></tr>
</thead></table>

<table class="table table-cs">
<thead><tr>
    <th width="80">Sản phẩm</th>
    <th class="text-right" width="80">Giá</th>
    <th class="text-right" width="80">Tổng</th>
</tr></thead>
<tbody>${productsHTML}</tbody>
<tfoot class="word-break">
<tr><td colspan="1"><strong>Tổng:</strong></td>
    <td><strong>SL: ${totalQty}</strong></td>
    <td class="text-right"><strong>${_fmtMoney(subtotal)}</strong></td></tr>
${
    discount > 0
        ? `<tr><td colspan="2" class="text-right" style="border-right:none !important"><strong>Giảm giá:</strong></td>
    <td style="border-left:none !important" class="text-right">${_fmtMoney(discount)}</td></tr>`
        : ''
}
<tr><td colspan="2" class="text-right" style="border-right:none !important"><strong>Tiền ship:</strong></td>
    <td style="border-left:none !important" class="text-right">${_fmtMoney(shipping)}</td></tr>
<tr><td colspan="2" class="text-right"><strong>Tổng tiền:</strong></td>
    <td class="text-right">${_fmtMoney(finalTotal)}</td></tr>
${
    prepaid > 0
        ? `<tr><td colspan="2" class="text-right" style="border-right:none !important"><strong>Trả trước:</strong></td>
    <td style="border-left:none !important" class="text-right">${_fmtMoney(prepaid)}</td></tr>
<tr><td colspan="2" class="text-right"><strong>Còn lại:</strong></td>
    <td class="text-right">${_fmtMoney(cod)}</td></tr>`
        : ''
}
</tfoot></table>

${orderComment ? `<div style="word-wrap:break-word"><strong>Ghi chú:</strong> ${_esc(orderComment)}</div>` : ''}
<div style="word-wrap:break-word"><strong>Ghi chú giao hàng:</strong>
    <span style="white-space:pre-wrap;word-break:break-word">${_esc(shopDeliveryNote)}</span></div>
<div style="word-wrap:break-word"><strong>Ghi chú:</strong>
    <p>${_esc(shopComment).replace(/\n/g, '<br/>')}</p></div>
</div>
</body></html>`;
    }

    function openPrint(pbh, opts = {}) {
        const html = generateHTML(pbh, opts);
        const w = global.open('', '_blank', 'width=800,height=600,scrollbars=yes');
        if (!w) {
            console.warn('[Web2Bill] popup blocked');
            return null;
        }
        w.document.write(html);
        w.document.close();
        let printed = false;
        const trigger = () => {
            if (printed || !w || w.closed) return;
            printed = true;
            w.focus();
            w.print();
        };
        w.onafterprint = () => w.close();
        w.onload = () => setTimeout(trigger, 500);
        setTimeout(trigger, 1500);
        return w;
    }

    function openCombinedPrint(pbhs, opts = {}) {
        if (!Array.isArray(pbhs) || !pbhs.length) return null;
        const first = generateHTML(pbhs[0], opts);
        const styleMatch = first.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const styles = styleMatch ? styleMatch[1] : '';
        const bodies = pbhs.map((pbh, idx) => {
            const html = generateHTML(pbh, opts);
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            const body = bodyMatch ? bodyMatch[1] : html;
            const pageBreak =
                idx < pbhs.length - 1
                    ? '<div style="page-break-after:always;border-top:2px dashed #999;margin:20px 0"></div>'
                    : '';
            return `<div class="bill-container" data-bill-index="${idx}">${body}</div>${pageBreak}`;
        });
        const combined = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>In ${pbhs.length} phiếu bán hàng</title>
<style>${styles}
.bill-container { margin-bottom: 20px; }
@media print { .bill-container { page-break-inside: avoid; } }
</style></head><body>${bodies.join('\n')}</body></html>`;

        const w = global.open('', '_blank', 'width=800,height=800,scrollbars=yes');
        if (!w) return null;
        w.document.write(combined);
        w.document.close();
        let printed = false;
        const trigger = () => {
            if (printed || !w || w.closed) return;
            printed = true;
            w.focus();
            w.print();
        };
        w.onafterprint = () => w.close();
        w.onload = () => setTimeout(trigger, 800);
        setTimeout(trigger, 2000);
        return w;
    }

    async function generateImage(pbh, opts = {}) {
        const html = generateHTML(pbh, opts);
        const iframe = document.createElement('iframe');
        iframe.style.cssText =
            'position:fixed;left:-9999px;top:0;width:400px;height:auto;border:none';
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        await new Promise((r) => setTimeout(r, 1500));
        try {
            const body = doc.body;
            const contentHeight = body.scrollHeight + 20;
            if (typeof global.html2canvas === 'undefined') {
                throw new Error(
                    'html2canvas not loaded — add <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js">'
                );
            }
            const canvas = await global.html2canvas(body, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                windowWidth: 400,
                windowHeight: contentHeight,
                height: contentHeight,
            });
            document.body.removeChild(iframe);
            const MAX = 480 * 1024;
            let blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
            if (blob.size > MAX)
                blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.65));
            if (blob.size > MAX) {
                const sc = document.createElement('canvas');
                sc.width = Math.round(canvas.width * 0.7);
                sc.height = Math.round(canvas.height * 0.7);
                sc.getContext('2d').drawImage(canvas, 0, 0, sc.width, sc.height);
                blob = await new Promise((r) => sc.toBlob(r, 'image/jpeg', 0.6));
            }
            return blob;
        } catch (e) {
            if (iframe.parentNode) document.body.removeChild(iframe);
            throw e;
        }
    }

    global.Web2Bill = {
        generateHTML,
        openPrint,
        openCombinedPrint,
        generateImage,
        getMergedSttDisplay,
    };
})(typeof window !== 'undefined' ? window : globalThis);
