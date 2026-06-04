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

    // Pre-render barcode SVG ngay trong parent context — bill HTML thuần static,
    // không cần JsBarcode/CDN trong print window → in nhanh, no fixed delays.
    // Yêu cầu host page load: <script src="../web2/shared/jsbarcode-code128.min.js"></script>
    function _renderBarcodeSvg(value) {
        if (!value) return '';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        try {
            if (typeof global.JsBarcode !== 'function') return '';
            // Style chuẩn JsBarcode (lindell/JsBarcode — lib barcode phổ biến nhất
            // trên GitHub): value render thẳng DƯỚI vạch bằng monospace đậm, căn
            // giữa — look retail nhận diện ngay, quét máy chuẩn CODE128.
            global.JsBarcode(svg, value, {
                format: 'CODE128',
                width: 2,
                height: 80,
                displayValue: true,
                font: 'monospace',
                fontOptions: 'bold',
                fontSize: 18,
                textAlign: 'center',
                textMargin: 2,
                margin: 8,
                background: '#ffffff',
                lineColor: '#000000',
            });
            svg.setAttribute('class', 'barcode-svg');
            return new XMLSerializer().serializeToString(svg);
        } catch (e) {
            console.warn('[Web2Bill] renderBarcodeSvg failed:', e.message);
            return '';
        }
    }

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
            // Extract number tail (vd "NJ-20260513-0084" → "0084" → 84)
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

    // ── ReceiptLine (lib bill phổ biến nhất GitHub, 740★) → SVG vector ──────
    // In ra SẮC NÉT tuyệt đối (vector, không rasterize) — fix triệt để mờ nhiệt.
    // Escape ký tự đặc biệt ReceiptLine trong text động.
    function _rlEsc(s) {
        return String(s == null ? '' : s).replace(/([\\|{}~_"`^])/g, '\\$1');
    }
    // Dựng ReceiptLine markup từ data PBH. Quy ước canh lề: bare=giữa, `|x`=trái,
    // `x|`=phải, `A|B`=2 cột (trái|phải). `…` = invert (nền đen) cho ô COD.
    function _buildReceiptDoc(d) {
        const m = _fmtMoney;
        const L = [];
        const left = (s) => L.push('|' + s); // canh trái
        const gap = () => L.push(' '); // dòng trống tạo khoảng thở
        const rule = () => L.push('-'); // kẻ ngang
        // Bố cục 80mm — phân cấp rõ: shop → COD → phiếu+barcode → khách → SP →
        // tổng → ghi chú → footer. KHÔNG invert (máy in trắng đen) — dùng cỡ + đậm.

        // ── HEADER: tên shop to nhất ──
        L.push('^^^' + _rlEsc(d.shop.name));
        if (d.isShop) L.push('"PBH SHOP - BÁN TẠI SHOP"');
        else if (d.carrierName) L.push('"' + _rlEsc(d.carrierName) + '"');
        if (d.hasVirtualDebt) L.push('^^"CÓ ĐƠN THU VỀ"');

        // ── COD: con số quan trọng nhất, to nhất trong phiếu ──
        rule();
        L.push('Tiền thu hộ (COD)');
        L.push('^^^' + m(d.cod) + ' đ');
        rule();

        // ── TÊN PHIẾU + MÃ VẠCH ──
        L.push('^^"Phiếu Bán Hàng' + (d.isShop ? ' (SHOP)' : '') + '"');
        if (d.billNumber) {
            gap();
            L.push('{code:' + d.billNumber + ';option:code128,3,80,hri}');
        }
        rule();

        // ── META: chỉ còn Ngày (STT chuyển lên cạnh tên khách) ──
        L.push('Ngày|' + _rlEsc(d.dateStr));
        rule();

        // ── KHÁCH HÀNG — STT đứng cạnh tên khách (canh phải, đậm) ──
        if (d.sttDisplay)
            L.push('"Khách:" ' + _rlEsc(d.recName) + '|^"STT ' + _rlEsc(d.sttDisplay) + '"');
        else left('"Khách:" ' + _rlEsc(d.recName));
        if (d.recPhone) left('"SĐT:" ' + _rlEsc(d.recPhone));
        if (d.recAddr)
            String(d.recAddr)
                .split('\n')
                .forEach((ln, i) => left((i ? '   ' : '"Đ/c:" ') + _rlEsc(ln)));
        if (d.sellerName) left('"NV bán:" ' + _rlEsc(d.sellerName));
        rule();

        // ── SẢN PHẨM — đánh số thứ tự cho dễ đếm khi nhiều SP ──
        L.push('^"SẢN PHẨM"|^"THÀNH TIỀN"');
        gap();
        let totalQty = 0;
        d.lines.forEach((it, idx) => {
            const qty = Number(it.quantity || it.Quantity || 0);
            const price = Number(it.priceUnit || it.PriceUnit || 0);
            const total = qty * price;
            const name = it.productName || it.ProductName || '';
            const uom = it.uomName || it.ProductUOMName || 'Cái';
            const note = it.note || it.Note || '';
            totalQty += qty;
            // Tên SP: "N. <tên>" đậm; dòng kế: SL × đơn giá (trái) | thành tiền (phải)
            left('"' + (idx + 1) + '. ' + _rlEsc(name) + '"');
            if (note) left('   ↳ ' + _rlEsc(note));
            L.push('   ' + qty + ' ' + _rlEsc(uom) + ' x ' + m(price) + '|' + m(total));
            if (idx < d.lines.length - 1) gap(); // cách giữa các SP cho dễ đọc
        });
        rule();

        // ── TỔNG TIỀN (2 cột) ──
        L.push('Tổng số lượng|' + totalQty + ' sp');
        L.push('Tạm tính|' + m(d.subtotal));
        if (d.discount > 0) L.push('Giảm giá|-' + m(d.discount));
        L.push('Phí ship|' + m(d.shipping));
        L.push('^"TỔNG TIỀN"|^"' + m(d.finalTotal) + ' đ"');
        if (d.prepaid > 0) {
            L.push('Đã trả trước|-' + m(d.prepaid));
            L.push('^^"CÒN THU (COD)"|^^"' + m(d.cod) + '"');
        }
        rule();

        // ── GHI CHÚ ──
        if (d.orderComment) {
            left('"Ghi chú đơn:" ' + _rlEsc(String(d.orderComment).replace(/\n+/g, ' ')));
            gap();
        }
        left('"Giao hàng:"');
        String(d.shopDeliveryNote)
            .split('\n')
            .forEach((ln) => ln.trim() && left(_rlEsc(ln)));
        gap();
        left('"Chuyển khoản:"');
        String(d.shopComment)
            .split('\n')
            .forEach((ln) => ln.trim() && left(_rlEsc(ln)));
        rule();

        // ── FOOTER ──
        L.push('Cảm ơn Quý khách!');
        L.push('^"' + _rlEsc(d.shop.name) + '"');
        gap();
        return L.join('\n');
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
        // 2026-06-04: bán tại shop → tiêu đề + nhãn "PBH SHOP" rõ ràng trên phiếu.
        const isShop = /pbh\s*shop|shop/i.test(carrierName);

        // Has virtual debt (return ticket consumed)
        const hasVirtualDebt = !!(opts.hasVirtualDebt || pbh.hasVirtualDebt);

        // Date
        const billDate = pbh.dateInvoice || pbh.dateCreated || new Date().toISOString();
        const dateStr = _fmtDate(billDate);

        // Comment + delivery note
        const orderComment = pbh.comment || '';
        let shopDeliveryNote = shop.deliveryNote;
        if (/thu\s*về/i.test(orderComment)) {
            shopDeliveryNote = shopDeliveryNote.trimEnd() + ' Thu về';
        }
        const shopComment = shop.comment;

        // ── Dựng ReceiptLine markup → SVG vector (in sắc nét, hết mờ nhiệt) ──
        const billNumber = pbh.number || '';
        const doc = _buildReceiptDoc({
            shop,
            isShop,
            carrierName,
            hasVirtualDebt,
            cod,
            billNumber,
            dateStr,
            recName,
            recPhone,
            recAddr,
            sellerName,
            sttDisplay,
            lines,
            subtotal,
            discount,
            shipping,
            finalTotal,
            prepaid,
            orderComment,
            shopDeliveryNote,
            shopComment,
        });
        let svg = '';
        try {
            if (global.receiptline && typeof global.receiptline.transform === 'function') {
                svg = global.receiptline.transform(doc, { cpl: 42 });
            }
        } catch (e) {
            console.warn('[Web2Bill] receiptline transform failed:', e.message);
        }
        if (!svg) {
            // Fallback nếu chưa load receiptline.js — vẫn ra text đọc được.
            svg =
                '<pre style="font-family:monospace;white-space:pre-wrap;font-size:12px;line-height:1.4;margin:0;">' +
                _esc(doc) +
                '</pre>';
        }

        return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phiếu bán hàng ${_esc(billNumber)} - ${_esc(shop.name)}</title>
<style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.receipt-wrap { width: 80mm; margin: 0 auto; padding: 2mm 0; }
.receipt-wrap svg { display: block; width: 100%; height: auto; }
/* ĐẬM HƠN cho máy in nhiệt: chữ ReceiptLine mặc định mảnh → in bị đứt/mờ.
   font-weight bold + viền stroke quanh glyph (paint-order) để "béo" nét, đầu
   in nhiệt ăn mực rõ. Áp cho mọi text/tspan trong SVG. */
.receipt-wrap svg text,
.receipt-wrap svg tspan {
    font-weight: 900 !important;
    stroke: #000;
    stroke-width: 0.9px;
    paint-order: stroke fill;
}
.page-break { display: block; page-break-before: always; }
@media print {
    html, body { width: 80mm; }
    .receipt-wrap { width: 80mm; }
    .receipt-wrap svg text, .receipt-wrap svg tspan { stroke-width: 1.1px; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
</style></head>
<body><div class="receipt-wrap">${svg}</div></body></html>`;
    }

    // In qua IFRAME ẩn TÁI SỬ DỤNG — KHÔNG mở popup window mỗi lần (popup tạo
    // cửa sổ mới rất chậm + dễ bị chặn). Iframe tạo 1 lần, các lần in sau chỉ
    // ghi lại nội dung → in bật ngay. Đây là nguyên nhân chính "in bill lâu".
    let _printFrame = null;
    function _printViaIframe(html) {
        let f = _printFrame;
        if (!f || !f.isConnected) {
            f = document.createElement('iframe');
            f.setAttribute('aria-hidden', 'true');
            f.style.cssText =
                'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
            document.body.appendChild(f);
            _printFrame = f;
        }
        const win = f.contentWindow;
        let printed = false;
        const go = () => {
            if (printed) return;
            printed = true;
            try {
                win.focus();
                win.print();
            } catch (e) {
                // Fallback popup nếu iframe print bị chặn (hiếm).
                console.warn('[Web2Bill] iframe print lỗi, fallback popup:', e.message);
                const w = global.open('', '_blank');
                if (w) {
                    w.document.write(html);
                    w.document.close();
                    w.onload = () => {
                        w.focus();
                        w.print();
                    };
                }
            }
        };
        win.onload = go;
        const doc = win.document;
        doc.open();
        doc.write(html);
        doc.close();
        // document.write không phải lúc nào cũng fire onload → 2 rAF làm fallback
        // nhanh (in ngay khi layout xong, không chờ timeout cố định dài).
        if (typeof win.requestAnimationFrame === 'function') {
            win.requestAnimationFrame(() => win.requestAnimationFrame(go));
        } else {
            setTimeout(go, 50);
        }
        return f;
    }

    function openPrint(pbh, opts = {}) {
        const html = generateHTML(pbh, opts);
        // Nếu đã gán máy in IP cho chức năng PBH → in THẲNG (không hộp thoại).
        // Lỗi bridge/máy in → tự fallback về hộp thoại iframe.
        const P = global.Web2Printer;
        if (P && opts.method !== 'dialog') {
            const printer = P.getPrinterFor('pbh');
            if (printer && printer.method === 'bridge' && printer.ip) {
                P.printSvg(html, 'pbh')
                    .then(() => {
                        if (global.notificationManager)
                            global.notificationManager.show('Đã in bill', 'success');
                    })
                    .catch((e) => {
                        console.warn('[Web2Bill] in thẳng lỗi → hộp thoại:', e.message);
                        if (global.notificationManager)
                            global.notificationManager.show(
                                'Máy in IP lỗi (' + e.message + ') — mở hộp thoại',
                                'warning'
                            );
                        _printViaIframe(html);
                    });
                return null;
            }
        }
        return _printViaIframe(html);
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
            const pageBreak = idx < pbhs.length - 1 ? '<div class="page-break"></div>' : '';
            return `<div class="bill-container">${body}</div>${pageBreak}`;
        });
        const combined = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>In ${pbhs.length} phiếu bán hàng</title>
<style>${styles}
.bill-container { page-break-inside: avoid; }
</style></head><body>${bodies.join('\n')}</body></html>`;
        return _printViaIframe(combined);
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
        // Bill HTML giờ thuần static (barcode pre-rendered) — chỉ cần 1 frame để layout
        await new Promise((r) => setTimeout(r, 100));
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
