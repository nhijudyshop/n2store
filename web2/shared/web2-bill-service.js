// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bill Service (in PBH thermal 80mm + bulk + Messenger send)
// =====================================================
//
// Tách độc lập khỏi orders-report/js/utils/bill-service.js. Không depend
// WEB2 data sources (lastDefaultSaleData, ProcessingTagState, WebWarehouseCache).
// Input: PBH object trả từ /api/fast-sale-orders/:number (đã có Partner,
// orderLines, totals, payment, delivery, sourceLink, etc.).
//
// Public API:
//   Web2Bill.generateHTML(pbh, opts) → string HTML 80mm template
//   Web2Bill.openPrint(pbh, opts)     → mở popup + auto-print
//   Web2Bill.openCombinedPrint(pbhs)  → 1 popup nhiều bills (page-break giữa)
//   Web2Bill.openPreview(pbh, opts)   → modal XEM bill (no auto-print, no count)
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

    // 2026-06-07: PBH dùng QR Code (2D) thay barcode 1D — quét bằng máy 2D, gọn,
    // đọc mọi độ dài mã. Pre-render canvas→PNG dataURL trong parent (cần host load
    // <script src="../web2/shared/qrcode.min.js">). Số PBH in dưới QR (HRI).
    // Fallback Code128 nếu QR lib thiếu (giữ tương thích).
    function _renderCodeMarkup(value) {
        if (!value) return '';
        // 2026-06-09: route qua NGUỒN CHUNG Web2QR (QR "trang trí" đen trắng —
        // module bo góc + mắt finder styled, vẫn quét nhạy). toSvg() đồng bộ →
        // nhúng SVG vào <img src=data:svg> giữ nguyên layout .b-qr. Fallback
        // davidshimjs canvas / Code128 nếu Web2QR hoặc QR lib thiếu.
        try {
            if (global.Web2QR && typeof global.QRCode === 'function') {
                // 2026-06-25: QR SẠCH — KHÔNG bake mã PBH vào GIỮA QR nữa (user yêu
                // cầu). Mã PBH in DƯỚI QR (HRI mono, .b-qr-num) cho dễ đọc + đối chiếu.
                // QR sạch ⇒ EC mặc định 'M' (module to hơn 'H') ⇒ quét nhạy hơn + đẹp.
                const svg = global.Web2QR.toSvg(String(value), {
                    style: 'rounded',
                    margin: 2,
                });
                // NHÚNG SVG vector TRỰC TIẾP (thay <img src=data:svg>): html2canvas
                // raster vector ở đúng độ phân giải in (72mm→576 chấm) → module bo góc
                // + mắt finder SẮC NÉT. Kích thước do CSS .b-qr (38mm) điều khiển.
                return (
                    svg.replace(/^<svg /, '<svg class="b-qr" ') +
                    `<div class="b-qr-num">${_esc(value)}</div>`
                );
            }
        } catch (e) {
            console.warn('[Web2Bill] Web2QR render failed, fallback:', e.message);
        }
        try {
            if (typeof global.QRCode === 'function') {
                const tmp = document.createElement('div');
                // eslint-disable-next-line no-new
                new global.QRCode(tmp, {
                    text: String(value),
                    width: 320,
                    height: 320,
                    correctLevel: global.QRCode.CorrectLevel.M,
                });
                const c = tmp.querySelector('canvas');
                const src = c
                    ? c.toDataURL('image/png')
                    : (tmp.querySelector('img') || {}).src || '';
                if (src) {
                    return (
                        `<img class="b-qr" src="${src}" alt="" />` +
                        `<div class="b-qr-num">${_esc(value)}</div>`
                    );
                }
            }
        } catch (e) {
            console.warn('[Web2Bill] renderQr failed:', e.message);
        }
        // Fallback: Code128 (cũ) nếu QR lib chưa load.
        return _renderBarcodeSvg(value);
    }

    // ── CSS bill thiết kế (thermal 72mm B&W) — tham khảo pattern receipt phổ
    // biến (parzibyte/print-receipt-thermal-printer, paper-css): dashed/double
    // dividers, framed boxes, monospace cho mã, hierarchy cỡ chữ. KHÔNG dùng
    // màu/shadow/gradient (máy in nhiệt trắng đen). Width 72mm → raster 576 chấm. ──
    const BILL_CSS = `
@page { margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
.receipt-wrap { width: 72mm; margin: 0 auto; }
.bill {
    width: 72mm; padding: 8px 10px 14px;
    font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
    color: #000; font-size: 13px; line-height: 1.35;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: none;
}
/* Chữ NHỎ giảm độ đậm (700 thay 800, 600 cho label) → in nhiệt KHÔNG nhòe/dồn
   mực. Chữ TO (shop/COD/tổng) giữ đậm vì nét xa nhau, in vẫn sắc. */
.bill b, .bill strong { font-weight: 700; }
.b-shop { text-align: center; font-size: 26px; font-weight: 800; letter-spacing: 1px; line-height: 1.1; }
.b-sub { text-align: center; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px; }
.b-flag { text-align: center; margin-top: 5px; }
.b-flag::before { content: ''; }
.b-flag { font-size: 11px; font-weight: 800; letter-spacing: 1px; border: 1.5px solid #000; border-radius: 4px; padding: 2px 8px; display: inline-block; }
.b-flag-wrap { text-align: center; }
/* ── Khung COD: viền dày, số to nổi bật ── */
.b-cod { border: 2.5px solid #000; border-radius: 9px; text-align: center; padding: 7px 6px 8px; margin: 10px 0; }
.b-cod-due { border-style: double; border-width: 5px; margin: 6px 0 2px; }
.b-cod-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; }
.b-cod-amount { font-size: 30px; font-weight: 800; line-height: 1.05; margin-top: 2px; }
.b-cod-amount.sm { font-size: 23px; }
.b-dvt { font-size: 0.5em; font-weight: 700; margin-left: 3px; }
/* ── Tên phiếu + STT ── */
.b-title { text-align: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 6px 0 4px; }
.b-stt { display: inline-block; border: 1.5px solid #000; border-radius: 4px; padding: 0 6px; margin-left: 2px; font-weight: 700; }
/* ── Khung mã vạch ── */
.b-bc { border: 1.5px solid #000; border-radius: 6px; padding: 5px 6px 3px; text-align: center; margin: 4px 0 6px; }
.b-bc svg { display: block; width: 100%; height: auto; max-height: 66px; margin: 0 auto; }
/* QR Code (2D) — vuông, canh giữa, in sắc (pixelated). Số PBH dưới QR. */
.b-qr { display: block; width: 38mm; height: 38mm; margin: 0 auto; image-rendering: pixelated; }
.b-qr-num { text-align: center; font-family: monospace; font-weight: 700; font-size: 15px; letter-spacing: 0.5px; margin-top: 3px; }
.b-meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; margin-top: 2px; }
/* ── Đường trang trí ── */
.b-div-dash { border-top: 1.5px dashed #000; margin: 7px 0; }
.b-div-solid { border-top: 2px solid #000; margin: 7px 0; }
.b-div-double { border-top: 4px double #000; margin: 7px 0; }
/* ── Khách hàng ── */
.b-cust { font-size: 12.5px; line-height: 1.45; }
.b-lbl { font-weight: 600; }
/* ── Sản phẩm: HÀNG 1 = tên (đầy đủ); HÀNG 2 = SL + đơn giá + thành tiền (cột
   canh thẳng dưới header) ── */
.b-ih { display: flex; align-items: baseline; gap: 4px; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 2px solid #000; padding-bottom: 3px; margin-bottom: 1px; }
.c-name { flex: 1; min-width: 0; }
.c-qty { width: 22px; text-align: center; flex-shrink: 0; }
.c-price { width: 64px; text-align: right; flex-shrink: 0; }
.c-total { width: 70px; text-align: right; flex-shrink: 0; }
.b-it { margin-top: 4px; }
.b-it-name { font-weight: 600; font-size: 12.5px; line-height: 1.25; }
.b-it-nums { display: flex; justify-content: flex-end; gap: 4px; margin-top: 1px; font-size: 11.5px; }
.b-it-nums .c-total { font-weight: 700; }
.b-it-note { font-size: 10.5px; padding-left: 13px; margin-top: 1px; }
.b-it-variant { font-size: 11px; font-style: italic; padding-left: 13px; margin-top: 1px; }
/* ── THU VỀ (shipper thu lại từ khách) — nổi bật để shipper KHÔNG bỏ sót ── */
.b-return-box { border: 2px solid #000; border-radius: 6px; padding: 6px 8px; margin-top: 8px; }
.b-return-hd { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; text-align: center; border-bottom: 1.5px dashed #000; padding-bottom: 3px; margin-bottom: 4px; }
.b-return-sub { font-size: 10px; font-weight: 700; text-align: center; margin-bottom: 4px; }
.b-return-it { display: flex; justify-content: space-between; gap: 6px; font-size: 12.5px; font-weight: 700; margin-top: 2px; }
.b-return-qty { flex-shrink: 0; }
/* ── Tổng tiền ── */
.b-tot { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; margin-top: 2px; }
.b-tot-final { font-size: 17px; font-weight: 800; }
/* ── Ghi chú ── */
.b-notes { font-size: 10.5px; line-height: 1.42; }
.b-note-row { margin-top: 4px; }
/* ── Footer ── */
.b-foot { text-align: center; margin-top: 9px; }
.b-ty { font-size: 13px; font-weight: 700; }
.b-foot-shop { font-size: 16px; font-weight: 800; letter-spacing: 1px; margin-top: 2px; }
.page-break { display: block; page-break-before: always; }
@media print {
    html, body, .receipt-wrap, .bill { width: 72mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

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

    // ── BILL HTML/CSS tự thiết kế (thay ReceiptLine) ───────────────────────
    // ReceiptLine KHÔNG kẻ khung/box được. Chuyển sang HTML → đóng khung COD +
    // đóng khung mã vạch + kẻ đường trang trí (đôi/dashed/solid). In qua raster
    // vật-lý-mm (72mm → 576 chấm) — cùng 1 thiết kế cho bridge lẫn hộp thoại.
    function _nl2br(s) {
        return _esc(s).replace(/\n+/g, '<br>');
    }
    // Dựng phần thân bill (bên trong .bill). d = dữ liệu đã chuẩn hoá.
    function _buildBillBody(d) {
        const m = _fmtMoney;
        const rows = [];

        // ── HEADER: tên shop ──
        rows.push(`<div class="b-shop">${_esc(d.shop.name)}</div>`);
        const subParts = [];
        if (d.isShop) subParts.push('BÁN TẠI SHOP');
        else if (d.carrierName) subParts.push(_esc(d.carrierName));
        if (subParts.length) rows.push(`<div class="b-sub">${subParts.join(' · ')}</div>`);
        if (d.hasVirtualDebt)
            rows.push(`<div class="b-flag-wrap"><span class="b-flag">CÓ ĐƠN THU VỀ</span></div>`);

        // ── KHUNG COD: con số quan trọng nhất, đóng khung nổi bật ──
        rows.push(
            `<div class="b-cod">` +
                `<div class="b-cod-label">Tiền thu hộ (COD)</div>` +
                `<div class="b-cod-amount">${m(d.cod)}<span class="b-dvt">đ</span></div>` +
                `</div>`
        );

        // ── TÊN PHIẾU + STT ──
        //   shop  → "PBH SHOP" | "PBH SHOP INBOX"
        //   thường → "Phiếu Bán Hàng" (livestream) | "PBH INBOX" (inbox)
        const billBase = d.isShop ? 'PBH SHOP' : d.isInbox ? 'PBH' : 'Phiếu Bán Hàng';
        const billTitle = billBase + (d.isInbox ? ' INBOX' : '');
        rows.push(
            `<div class="b-title">${billTitle}` +
                (d.sttDisplay ? ` <span class="b-stt">#${_esc(d.sttDisplay)}</span>` : '') +
                (d.printCount > 0 ? ` <span class="b-stt">In ${d.printCount}</span>` : '') +
                `</div>`
        );

        // ── KHUNG MÃ VẠCH (JsBarcode đã có mã số HRI dưới vạch) ──
        if (d.barcodeSvg) {
            rows.push(`<div class="b-bc">${d.barcodeSvg}</div>`);
        }

        // ── META: ngày (lần in gắn cạnh #STT ở dòng tiêu đề, không tốn dòng riêng) ──
        rows.push(`<div class="b-meta"><span>Ngày</span><b>${_esc(d.dateStr)}</b></div>`);

        // ── KHÁCH HÀNG ──
        rows.push('<div class="b-div-dash"></div>');
        const cust = [`<div class="b-cust">`];
        cust.push(`<div><span class="b-lbl">Khách:</span> <b>${_esc(d.recName)}</b></div>`);
        if (d.recPhone) cust.push(`<div><span class="b-lbl">SĐT:</span> ${_esc(d.recPhone)}</div>`);
        if (d.recAddr) cust.push(`<div><span class="b-lbl">Đ/c:</span> ${_nl2br(d.recAddr)}</div>`);
        if (d.sellerName)
            cust.push(`<div><span class="b-lbl">NV bán:</span> ${_esc(d.sellerName)}</div>`);
        cust.push('</div>');
        rows.push(cust.join(''));

        // ── SẢN PHẨM — mỗi SP 1 HÀNG: tên | SL | đơn giá | thành tiền (4 cột) ──
        rows.push(
            `<div class="b-ih">` +
                `<span class="c-name">SẢN PHẨM</span>` +
                `<span class="c-qty">SL</span>` +
                `<span class="c-price">ĐƠN GIÁ</span>` +
                `<span class="c-total">T.TIỀN</span>` +
                `</div>`
        );
        // Tách dòng BÁN (giao cho khách) vs dòng THU VỀ (shipper thu LẠI từ khách —
        // đổi/trả từ đơn trước, giá 0đ note 'Thu về'). Thu về KHÔNG tính vào SL giao +
        // được in ở KHUNG RIÊNG nổi bật để shipper không nhầm là quà tặng phải giao.
        // Ưu tiên CỜ tường minh (it.isReturn) từ _buildPbhShape. Fallback note: khớp
        // CHÍNH XÁC chuỗi server ghi cố định 'Thu về 0đ' (fast-sale-orders.js) — KHÔNG
        // substring /thu về/ vì note bán tự do có thể chứa "thu về" (vd "nhắc khách thu
        // về cọc") → xếp nhầm vào khung THU LẠI + lệch SL giao (audit MEDIUM).
        const isReturnLine = (it) => {
            if (it.isReturn === true) return true;
            const note = String(it.note || it.Note || '')
                .trim()
                .toLowerCase();
            return note === 'thu về 0đ' || note === 'thu về 0d';
        };
        let totalQty = 0;
        const items = [];
        const returnItems = [];
        d.lines.forEach((it) => {
            const qty = Number(it.quantity || it.Quantity || 0);
            const name = it.productName || it.ProductName || '';
            if (isReturnLine(it)) {
                returnItems.push({ name, qty, code: it.productCode || it.ProductCode || '' });
                return;
            }
            const price = Number(it.priceUnit || it.PriceUnit || 0);
            const total = qty * price;
            const note = it.note || it.Note || '';
            const variant = it.variant || it.Variant || '';
            totalQty += qty;
            items.push(
                `<div class="b-it">` +
                    `<div class="b-it-name">${items.length + 1}. ${_esc(name)}</div>` +
                    (variant ? `<div class="b-it-variant">${_esc(variant)}</div>` : '') +
                    `<div class="b-it-nums">` +
                    `<span class="c-qty">${qty}</span>` +
                    `<span class="c-price">${m(price)}</span>` +
                    `<span class="c-total">${m(total)}</span>` +
                    `</div>` +
                    (note ? `<div class="b-it-note">↳ ${_esc(note)}</div>` : '') +
                    `</div>`
            );
        });
        rows.push(items.join(''));

        // ── TỔNG TIỀN ──
        rows.push('<div class="b-div-solid"></div>');
        const tot = [];
        tot.push(`<div class="b-tot"><span>Tổng số lượng</span><b>${totalQty} sp</b></div>`);
        tot.push(`<div class="b-tot"><span>Tạm tính</span><b>${m(d.subtotal)}</b></div>`);
        if (d.discount > 0)
            tot.push(`<div class="b-tot"><span>Giảm giá</span><b>-${m(d.discount)}</b></div>`);
        tot.push(`<div class="b-tot"><span>Phí ship</span><b>${m(d.shipping)}</b></div>`);
        rows.push(tot.join(''));
        rows.push('<div class="b-div-double"></div>');
        rows.push(
            `<div class="b-tot b-tot-final"><span>TỔNG TIỀN</span><b>${m(d.finalTotal)} đ</b></div>`
        );
        if (d.prepaid > 0) {
            rows.push(`<div class="b-tot"><span>Đã trả trước</span><b>-${m(d.prepaid)}</b></div>`);
            rows.push(
                `<div class="b-cod b-cod-due">` +
                    `<div class="b-cod-label">Còn thu (COD)</div>` +
                    `<div class="b-cod-amount sm">${m(d.cod)}<span class="b-dvt">đ</span></div>` +
                    `</div>`
            );
        }

        // ── KHUNG THU VỀ — shipper THU LẠI món này từ khách (đổi/trả đơn trước) ──
        // Đặt DƯỚI "TỔNG TIỀN" để không chen giữa dòng bán và phần tổng (user 2026-07-01).
        if (returnItems.length) {
            const retQty = returnItems.reduce((s, r) => s + (Number(r.qty) || 0), 0);
            const retRows = returnItems
                .map(
                    (r) =>
                        `<div class="b-return-it"><span>${_esc(r.code ? r.code + ' · ' : '')}${_esc(r.name)}</span><span class="b-return-qty">×${r.qty}</span></div>`
                )
                .join('');
            rows.push(
                `<div class="b-return-box">` +
                    `<div class="b-return-hd">⟲ THU LẠI TỪ KHÁCH (${retQty} món)</div>` +
                    `<div class="b-return-sub">Shipper thu lại các món dưới đây (hàng đổi/trả đơn trước)</div>` +
                    retRows +
                    `</div>`
            );
        }

        // ── GHI CHÚ ──
        rows.push('<div class="b-div-dash"></div>');
        const notes = ['<div class="b-notes">'];
        if (d.orderComment)
            notes.push(
                `<div class="b-note-row"><b>Ghi chú đơn:</b> ${_esc(
                    String(d.orderComment).replace(/\n+/g, ' ')
                )}</div>`
            );
        if (d.shopDeliveryNote)
            notes.push(
                `<div class="b-note-row"><b>Giao hàng:</b> ${_nl2br(d.shopDeliveryNote)}</div>`
            );
        if (d.shopComment)
            notes.push(
                `<div class="b-note-row"><b>Chuyển khoản:</b> ${_nl2br(d.shopComment)}</div>`
            );
        notes.push('</div>');
        rows.push(notes.join(''));

        // ── FOOTER ──
        rows.push('<div class="b-div-solid"></div>');
        rows.push(
            `<div class="b-foot"><div class="b-ty">Cảm ơn Quý khách!</div>` +
                `<div class="b-foot-shop">${_esc(d.shop.name)}</div></div>`
        );

        return rows.join('\n');
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
        // Người bán = USER ĐANG ĐĂNG NHẬP (Web2UserInfo) — ưu tiên; fallback tên
        // NV gắn đơn (createdByName). Mọi loại bill đều hiện "NV bán: ...".
        let sellerName = pbh.createdByName || pbh.assignedUser?.name || '';
        try {
            const u = global.Web2UserInfo && global.Web2UserInfo.get && global.Web2UserInfo.get();
            if (u && u.userName && u.userName !== '(ẩn danh)') sellerName = u.userName;
        } catch (e) {
            /* Web2UserInfo chưa load → giữ fallback */
        }

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
        // 2026-06-05: kênh INBOX → tiêu đề "PBH INBOX" / "PBH SHOP INBOX" (phân
        // biệt với đơn Livestream). Channel native order: 'web2_inbox'/'web2_livestream'.
        const isInbox = /inbox/i.test(pbh.channel || '') || opts.isInbox === true;

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

        // ── Dựng bill HTML/CSS thiết kế (khung COD + khung mã vạch + đường trang trí) ──
        const billNumber = pbh.number || '';
        const barcodeSvg = _renderCodeMarkup(billNumber);
        const body = _buildBillBody({
            shop,
            isShop,
            isInbox,
            carrierName,
            hasVirtualDebt,
            cod,
            billNumber,
            barcodeSvg,
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
            printCount: Number(pbh.printCount) || 0,
        });

        return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phiếu bán hàng ${_esc(billNumber)} - ${_esc(shop.name)}</title>
<style>${BILL_CSS}</style></head>
<body><div class="receipt-wrap"><div class="bill">${body}</div></div></body></html>`;
    }

    // In qua IFRAME ẩn TÁI SỬ DỤNG — KHÔNG mở popup window mỗi lần (popup tạo
    // cửa sổ mới rất chậm + dễ bị chặn). Iframe tạo 1 lần, các lần in sau chỉ
    // ghi lại nội dung → in bật ngay. Đây là nguyên nhân chính "in bill lâu".
    function _printViaIframe(html) {
        // AUDIT 2026-06-20 #25: mỗi job in 1 iframe RIÊNG (không tái dùng singleton)
        // → 2 lệnh in song song KHÔNG ghi đè document của nhau. Gỡ iframe sau khi in
        // (afterprint) + fallback timeout xa để không cắt hộp thoại in đang mở.
        const f = document.createElement('iframe');
        f.setAttribute('aria-hidden', 'true');
        f.style.cssText =
            'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
        document.body.appendChild(f);
        const win = f.contentWindow;
        const cleanup = () => {
            try {
                f.remove();
            } catch (_) {}
        };
        let printed = false;
        const go = () => {
            if (printed) return;
            printed = true;
            try {
                win.addEventListener('afterprint', cleanup, { once: true });
            } catch (_) {}
            setTimeout(cleanup, 60000); // fallback xa, không cắt dialog in
            try {
                win.focus();
                win.print();
            } catch (e) {
                // Fallback popup nếu iframe print bị chặn (hiếm).
                console.warn('[Web2Bill] iframe print lỗi, fallback popup:', e.message);
                cleanup();
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

    // In 1 trang HTML 80mm — DÙNG CHUNG cho mọi loại phiếu (bill PBH, Phiếu Soạn Hàng…).
    // Role có máy bridge (IP) → in THẲNG ESC/POS (không hộp thoại = NHANH); chưa gán/lỗi
    // bridge → fallback hộp thoại iframe ẩn (hành vi cũ — không regression). 1 NGUỒN in,
    // không fork: openPrint + Phiếu Soạn Hàng đều gọi cái này.
    //   opts.role   : 'pbh' (mặc định) | 'label' | …
    //   opts.method : 'dialog' → ép hộp thoại, bỏ qua bridge
    //   opts.bill   : false → dùng printHtml (raster ss2) thay printBillHtml (ss3, sắc nét)
    //   opts.label  : nhãn thông báo (vd 'bill', 'Phiếu Soạn Hàng')
    function printDocHtml(html, opts = {}) {
        const role = opts.role || 'pbh';
        const label = opts.label || 'phiếu';
        const P = global.Web2Printer;
        if (P && opts.method !== 'dialog' && P.roleIsBridge && P.roleIsBridge(role)) {
            const fn = opts.bill === false ? P.printHtml : P.printBillHtml;
            return fn(html, role)
                .then(() => {
                    if (global.notificationManager)
                        global.notificationManager.show('Đã in ' + label, 'success');
                    return { mode: 'bridge' };
                })
                .catch((e) => {
                    console.warn('[Web2Bill] in thẳng lỗi → hộp thoại:', e.message);
                    if (global.notificationManager)
                        global.notificationManager.show(
                            'Máy in IP lỗi (' + e.message + ') — mở hộp thoại',
                            'warning'
                        );
                    _printViaIframe(html);
                    return { mode: 'dialog', error: e.message };
                });
        }
        _printViaIframe(html);
        return Promise.resolve({ mode: 'dialog' });
    }

    function openPrint(pbh, opts = {}) {
        const html = generateHTML(pbh, opts);
        return printDocHtml(html, { role: 'pbh', method: opts.method, label: 'bill' });
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

    // XEM bill (preview) — render HTML vào modal overlay, KHÔNG auto-print, KHÔNG
    // đụng print_count. Footer có nút "In bill" → khi bấm mới gọi opts.onPrint()
    // (host tự openPrint + markPrinted). Dùng cho icon 🖨 "xem bill" per-row.
    let _previewOverlay = null;
    function openPreview(pbh, opts = {}) {
        const html = generateHTML(pbh, opts);
        // Cleanup overlay cũ (tránh chồng nhiều preview)
        if (_previewOverlay && _previewOverlay.isConnected) _previewOverlay.remove();
        const overlay = document.createElement('div');
        _previewOverlay = overlay;
        overlay.className = 'web2-bill-preview-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.55);' +
            'display:flex;align-items:center;justify-content:center;padding:20px;';
        const title = _esc(pbh && pbh.number ? pbh.number : 'Xem bill');
        overlay.innerHTML =
            '<div class="web2-bill-preview-card" style="background:#fff;border-radius:12px;' +
            'width:360px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;' +
            'overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,0.25);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;' +
            'padding:12px 14px;border-bottom:1px solid #e2e8f0;">' +
            '<strong style="font-size:14px;color:#0f172a;">🧾 Xem bill — ' +
            title +
            '</strong>' +
            '<button type="button" data-bp-close aria-label="Đóng" style="border:0;background:#f1f5f9;' +
            'width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:15px;color:#475569;">✕</button>' +
            '</div>' +
            '<div style="flex:1;overflow:auto;background:#f8fafc;padding:12px;display:flex;justify-content:center;">' +
            '<iframe data-bp-frame title="Bill preview" style="width:320px;min-height:420px;border:0;' +
            'background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.12);"></iframe>' +
            '</div>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 14px;border-top:1px solid #e2e8f0;">' +
            '<button type="button" data-bp-close style="padding:8px 14px;border-radius:8px;border:1px solid #e2e8f0;' +
            'background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;">Đóng</button>' +
            '<button type="button" data-bp-print style="padding:8px 14px;border-radius:8px;border:0;' +
            'background:#0068ff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🖨 In bill</button>' +
            '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        // Render bill vào iframe (srcdoc đơn giản, an toàn)
        const frame = overlay.querySelector('[data-bp-frame]');
        try {
            const doc = frame.contentWindow.document;
            doc.open();
            doc.write(html);
            doc.close();
        } catch (e) {
            frame.srcdoc = html;
        }
        const close = () => {
            if (overlay.isConnected) overlay.remove();
            if (_previewOverlay === overlay) _previewOverlay = null;
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
            if (e.target.closest('[data-bp-close]')) close();
        });
        const printBtn = overlay.querySelector('[data-bp-print]');
        if (printBtn) {
            // Ẩn nút In nếu host không cho in từ preview (chỉ xem).
            if (opts.allowPrint === false) printBtn.style.display = 'none';
            printBtn.addEventListener('click', () => {
                close();
                if (typeof opts.onPrint === 'function') opts.onPrint(pbh);
                else openPrint(pbh, opts);
            });
        }
        const onKey = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);
        return overlay;
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
        printDocHtml, // in 1 trang HTML bất kỳ (bridge-or-dialog) — dùng chung Phiếu Soạn Hàng
        openCombinedPrint,
        openPreview,
        generateImage,
        getMergedSttDisplay,
    };
})(typeof window !== 'undefined' ? window : globalThis);
