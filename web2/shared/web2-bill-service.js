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
                name: 'NHI JUDY',
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

        // Barcode — TPOS service yêu cầu type=Code%20128 (URL-encoded space).
        // Một số browser KHÔNG auto-encode space trong img src → image fail load
        // → barcode mất tích. Encode explicit ở đây.
        const billNumber = pbh.number || '';
        const barcodeUrl = billNumber
            ? `https://statics.tpos.vn/Web/Barcode?type=${encodeURIComponent('Code 128')}&value=${encodeURIComponent(billNumber)}&width=600&height=100`
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
    <td class="product-name word-break" colspan="3">
        ${_esc(name)}
        ${note ? `<div class="product-note">↳ ${_esc(note)}</div>` : ''}
    </td>
</tr>
<tr>
    <td class="product-qty"><span style="font-weight:bold;">${qty}</span> ${_esc(uom)}</td>
    <td class="product-price text-right">${_fmtMoney(price)}</td>
    <td class="product-total text-right"><strong>${_fmtMoney(total)}</strong></td>
</tr>`;
            })
            .join('\n');

        return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phiếu bán hàng ${_esc(billNumber)} - ${_esc(shop.name)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
@page { margin: 1mm 0; }
html, body {
    width: 80mm; margin: auto; color: #000 !important; font-size: 13px;
    font-family: Arial, Helvetica, sans-serif; line-height: 1.35;
}
*, *:before, *:after { box-sizing: border-box; }
.container { padding: 0 8px; margin: auto; }
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-left   { text-align: left; }
.word-break  { word-break: break-word; }
.font-bold   { font-weight: bold; }
.muted       { color: #444; }
table { width: 100%; max-width: 100%; border-collapse: collapse; }

/* ─── Section separators (dashed) ─────────────────────── */
.sep-dashed {
    border: 0; border-top: 1px dashed #000;
    margin: 6px 0; height: 0;
}
.sep-double {
    border: 0; border-top: 2px solid #000;
    margin: 6px 0; height: 0;
}
.sep-dotted {
    border: 0; border-top: 1px dotted #555;
    margin: 4px 0; height: 0;
}

/* ─── Shop header ────────────────────────────────────── */
.shop-name {
    font-size: 18px; font-weight: bold; letter-spacing: 0.5px;
    text-transform: uppercase;
}

/* ─── COD highlight box ──────────────────────────────── */
.cod-box {
    border: 2px solid #000; padding: 6px 8px;
    margin: 6px 0; text-align: center;
    background: #f0f0f0;
}
.cod-box .cod-label { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
.cod-box .cod-amount { font-size: 20px; font-weight: bold; margin-top: 2px; }

/* ─── Title ──────────────────────────────────────────── */
.bill-title {
    font-size: 16px; font-weight: bold; text-transform: uppercase;
    letter-spacing: 1.5px; text-align: center; margin: 4px 0;
}

/* ─── Barcode box (scan đối soát) ────────────────────── */
.barcode-box {
    text-align: center; margin: 6px 0; padding: 6px 4px;
    border: 1.5px solid #000; border-radius: 4px;
}
.barcode-box .barcode-svg {
    width: 95%; height: 70px; display: block; margin: 0 auto;
}
.barcode-box .barcode-number {
    font-family: 'Courier New', monospace; font-size: 14px;
    font-weight: bold; letter-spacing: 1px; margin-top: 4px;
}
.barcode-box .barcode-hint {
    font-size: 10px; color: #555; margin-top: 1px;
}

/* ─── Meta info (số phiếu, ngày, KH) ─────────────────── */
.meta-row { display: flex; justify-content: space-between; padding: 1px 0; }
.meta-row .meta-label { font-weight: bold; min-width: 70px; }
.meta-row .meta-value { text-align: right; flex: 1; }
.customer-block { padding: 2px 0; }
.customer-block .cb-row { padding: 1px 0; }
.customer-block .cb-row strong { display: inline-block; min-width: 72px; }

/* ─── Products table ─────────────────────────────────── */
.products-table thead th {
    padding: 4px 2px; font-size: 12px; font-weight: bold;
    text-transform: uppercase; letter-spacing: 0.5px;
    border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;
}
.products-table tbody td.product-name {
    padding: 4px 2px 1px 2px;
    border-bottom: none !important;
    font-weight: bold;
}
.products-table tbody td.product-qty,
.products-table tbody td.product-price,
.products-table tbody td.product-total {
    padding: 0 2px 4px 2px;
    border-top: none !important;
    border-bottom: 1px dotted #999;
    font-size: 12.5px;
}
.products-table .product-note {
    font-size: 11.5px; font-style: italic; color: #333;
    padding-left: 4px;
}

/* ─── Totals ─────────────────────────────────────────── */
.totals-table { margin-top: 4px; }
.totals-table td { padding: 2px 2px; }
.totals-table .total-label { font-weight: 600; }
.totals-table .total-value { text-align: right; font-weight: 600; }
.totals-table .total-final td {
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding-top: 4px; padding-bottom: 4px;
}
.totals-table .total-final .total-label,
.totals-table .total-final .total-value {
    font-weight: bold; font-size: 14px;
}
.totals-table .total-cod .total-value {
    font-weight: bold; font-size: 15px;
}

/* ─── Notes ──────────────────────────────────────────── */
.note-block {
    margin-top: 6px; padding: 4px 6px;
    border-left: 3px solid #000;
    background: #f8f8f8;
}
.note-block .note-label {
    font-weight: bold; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.5px; display: block; margin-bottom: 2px;
}
.note-block .note-content {
    white-space: pre-wrap; word-break: break-word;
    font-size: 12.5px;
}
.shop-footer {
    margin-top: 8px; padding-top: 6px;
    border-top: 1px dashed #000; text-align: center;
    font-size: 11px; color: #555;
}
.virtual-debt-banner {
    background: #000; color: #fff; padding: 4px 6px;
    text-align: center; font-weight: bold;
    margin: 4px 0; font-size: 12px;
    letter-spacing: 1px;
}
.page-break { display: block; height: 0; page-break-before: always; }
</style></head>
<body>
<div class="container">

    <!-- ═══════════ SHOP HEADER ═══════════ -->
    <div class="text-center shop-name">${_esc(shop.name)}</div>
    ${carrierName ? `<div class="text-center muted" style="font-size:12px;">📦 ${_esc(carrierName)}</div>` : ''}
    ${hasVirtualDebt ? `<div class="virtual-debt-banner">⚠ CÓ ĐƠN THU VỀ ⚠</div>` : ''}

    <!-- ═══════════ COD HIGHLIGHT ═══════════ -->
    <div class="cod-box">
        <div class="cod-label">Tiền thu hộ (COD)</div>
        <div class="cod-amount">${_fmtMoney(cod)} đ</div>
    </div>

    <!-- ═══════════ BILL TITLE + BARCODE ═══════════ -->
    <hr class="sep-double" />
    <div class="bill-title">Phiếu bán hàng</div>
    ${
        billNumber
            ? `<div class="barcode-box">
                  <svg class="barcode-svg" data-value="${_esc(billNumber)}"></svg>
                  <div class="barcode-number">${_esc(billNumber)}</div>
               </div>`
            : ''
    }
    <div class="meta-row"><span class="meta-label">Ngày:</span><span class="meta-value">${_esc(dateStr)}</span></div>

    <!-- ═══════════ CUSTOMER ═══════════ -->
    <hr class="sep-dashed" />
    <div class="customer-block">
        <div class="cb-row"><strong>Khách:</strong> ${_esc(recName)}${recPhone ? ` - ${_esc(recPhone)}` : ''}</div>
        ${recAddr ? `<div class="cb-row"><strong>Địa chỉ:</strong> ${_esc(recAddr)}</div>` : ''}
        ${sellerName ? `<div class="cb-row"><strong>Người bán:</strong> ${_esc(sellerName)}</div>` : ''}
        ${sttDisplay ? `<div class="cb-row"><strong>STT:</strong> <span style="font-weight:bold;font-size:14px;">${_esc(sttDisplay)}</span></div>` : ''}
    </div>

    <!-- ═══════════ PRODUCTS ═══════════ -->
    <hr class="sep-dashed" />
    <table class="products-table">
        <thead><tr>
            <th style="text-align:left;">Sản phẩm</th>
            <th class="text-right" style="width:60px;">Giá</th>
            <th class="text-right" style="width:70px;">Tổng</th>
        </tr></thead>
        <tbody>${productsHTML}</tbody>
    </table>

    <!-- ═══════════ TOTALS ═══════════ -->
    <table class="totals-table">
        <tr>
            <td class="total-label">Tổng SL:</td>
            <td class="total-value">${totalQty}</td>
        </tr>
        <tr>
            <td class="total-label">Tạm tính:</td>
            <td class="total-value">${_fmtMoney(subtotal)}</td>
        </tr>
        ${discount > 0 ? `<tr><td class="total-label">Giảm giá:</td><td class="total-value">- ${_fmtMoney(discount)}</td></tr>` : ''}
        <tr>
            <td class="total-label">Phí ship:</td>
            <td class="total-value">${_fmtMoney(shipping)}</td>
        </tr>
        <tr class="total-final">
            <td class="total-label">TỔNG TIỀN:</td>
            <td class="total-value">${_fmtMoney(finalTotal)} đ</td>
        </tr>
        ${
            prepaid > 0
                ? `
        <tr><td class="total-label">Đã trả trước:</td><td class="total-value">- ${_fmtMoney(prepaid)}</td></tr>
        <tr class="total-cod"><td class="total-label">Còn lại (COD):</td><td class="total-value">${_fmtMoney(cod)} đ</td></tr>
        `
                : ''
        }
    </table>

    <!-- ═══════════ NOTES ═══════════ -->
    ${
        orderComment
            ? `<div class="note-block">
        <span class="note-label">📝 Ghi chú đơn</span>
        <div class="note-content">${_esc(orderComment)}</div>
    </div>`
            : ''
    }

    <div class="note-block">
        <span class="note-label">🚚 Ghi chú giao hàng</span>
        <div class="note-content">${_esc(shopDeliveryNote)}</div>
    </div>

    <div class="note-block">
        <span class="note-label">🏦 Thông tin chuyển khoản</span>
        <div class="note-content">${_esc(shopComment)}</div>
    </div>

    <div class="shop-footer">
        ━━━ Cảm ơn quý khách! ━━━<br/>
        ${_esc(shop.name)}
    </div>
</div>
<script>
(function renderBarcodes(){
    function go(){
        if (!window.JsBarcode) return setTimeout(go, 80);
        document.querySelectorAll('svg.barcode-svg[data-value]').forEach(function(svg){
            try {
                window.JsBarcode(svg, svg.getAttribute('data-value'), {
                    format: 'CODE128',
                    width: 2,
                    height: 60,
                    displayValue: false,
                    margin: 0,
                    background: '#ffffff',
                    lineColor: '#000000'
                });
            } catch(e) { console.warn('[Web2Bill] barcode render fail:', e.message); }
        });
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') go();
    else document.addEventListener('DOMContentLoaded', go);
})();
</script>
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
        w.onload = () => setTimeout(trigger, 600);
        // Fallback đủ thời gian cho JsBarcode CDN load + render SVG ở browser chậm
        setTimeout(trigger, 4500);
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
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
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
        w.onload = () => setTimeout(trigger, 1000);
        // Fallback đủ thời gian cho JsBarcode CDN load + render N SVG
        setTimeout(trigger, 5000);
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
