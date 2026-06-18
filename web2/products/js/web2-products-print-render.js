// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2ProductsPrint — RENDER module (label HTML generation).
 * [SPLIT 2026-06-18] Tách từ web2-products-print.js. Module này: buildLabelHTML
 *   (layout math + style building + print_barcode.css verbatim + embedded
 *   JsBarcode/fit-text iife). Cross-module qua window.W2PP (load SAU utils +
 *   barcode). Behavior identical với bản gốc — chỉ đổi tham chiếu sang W2PP.*.
 */
(function () {
    'use strict';

    const W2PP = (window.W2PP = window.W2PP || {});
    const escapeHtml = W2PP.escapeHtml;
    const formatPrice = W2PP.formatPrice;
    const _qrKey = W2PP._qrKey;
    const JSBARCODE_URL = W2PP.JSBARCODE_URL;

    /**
     * Build label HTML matching WEB2 exactly:
     *   - Font: Arial (WEB2 default)
     *   - CSS from /Content/print_barcode.css
     *   - Dynamic styles from BarcodeProducLabelPrintController.style_label()
     *   - Barcode: JsBarcode Code128 SVG client-side (chuẩn ISO/IEC 15417 →
     *     bars/spaces identical WEB2 render cho cùng input). KHÔNG gọi API ngoài.
     */
    function buildLabelHTML(labels, paper, printType, opts, qrMap) {
        const isQr = opts.symbology === 'qr' && qrMap;
        const { showPrice, showBold, showProductName, showVariant, showCurrency, hideBarcode } =
            opts;
        const { sheetW, sheetH, labelW, labelH, cols, fontSize } = paper;

        // Scale font + spacing theo label dimensions (user feedback: scale theo
        // độ rộng/dài tem). Paper preset fontSize làm base; tỷ lệ với labelW so
        // các paper khác tự scale proportional.
        //
        // Reference proportions (paper 7 "2 Tem", labelW=25mm, labelH=21mm):
        //   - fontSize (WEB2) = 6 → font/labelW ≈ 0.24
        //   - lineH = fs + 1
        //   - nameFont = base, codeFont = base * 0.9 (slightly smaller cho code/price)
        //   - barcodeH = labelH * 0.45 (~9.5mm cho 21mm label)
        //   - padding ≈ labelW * 0.02 (~0.5mm cho 25mm — match WEB2 paper 7)
        //
        // Khi đổi paper → labelW thay đổi → tất cả scale theo.
        // 2026-06-05: user muốn mã in ra GẦN ĐẦY con tem cho đẹp → scale to hơn
        // preset WEB2: font ×1.55, barcode cao 46% tem + bars rộng gần full. Content
        // CANH GIỮA dọc tem (justify-content:center) — khối to nhưng không sát mép.
        // Barcode 46% (không 55%) để tên 2 dòng vẫn đủ chỗ, GIÁ không bị cắt.
        // 2026-06-09: ×1.3 → ×1.55 → ×1.75 → ×2.0 — user muốn QR + tên + mã + biến
        // thể + giá TO HƠN NỮA. Layout QR (mã SP dưới QR) chừa nhiều chỗ dọc cho cột
        // tên+giá nên phóng to mạnh được. QR cũng to thêm (0.48→0.52, xem qrMm). Tên
        // 3 dòng (nameStyleQr) + auto-fit (fitName) → tên dài tự thu nhỏ vừa, không cắt.
        const fsBase = fontSize || Math.max(5, Math.round(labelW * 0.24));
        const fs = Math.round(fsBase * 2.0);
        const fsCode = Math.max(5, Math.round(fs * 0.9));
        const lineH = fs + 1;
        const lineHCode = fsCode + 1;
        const padScaled = Math.round(labelW * 0.02 * 10) / 10; // mm — fallback nếu paper.*Margin null
        // 0.46 (giảm từ 0.55): tên 2 dòng + barcode + code + giá phải vừa 21mm,
        // barcode cao quá → đẩy GIÁ ra ngoài bị cắt (overflow:hidden). 0.46 chừa
        // đủ chỗ cho tên 2 dòng mà giá không mất.
        const barcodeH = Math.round(labelH * 0.46 * 10) / 10; // mm

        // style_label() — only include props when not null (mirror WEB2 controller).
        // Padding fallback từ padScaled nếu paper config null (Paper 8 "1 Tem" có
        // *Margin null nhưng vẫn cần padding nhỏ để content không sát mép).
        const labelStyleParts = [
            `width:${labelW}mm`,
            `height:${labelH}mm`,
            `overflow:hidden`,
            `font-size:${fs}px`,
            `line-height:${lineH}px`,
            `text-align:center`,
            `margin-top:1px`,
        ];
        const padTop = paper.topMargin != null ? paper.topMargin : padScaled;
        const padLeft = paper.leftMargin != null ? paper.leftMargin : padScaled;
        const padBottom = paper.bottomMargin != null ? paper.bottomMargin : padScaled;
        const padRight = paper.rightMargin != null ? paper.rightMargin : padScaled;
        labelStyleParts.push(
            `padding-top:${padTop}mm`,
            `padding-left:${padLeft}mm`,
            `padding-bottom:${padBottom}mm`,
            `padding-right:${padRight}mm`
        );
        if (paper.hSpacing != null) labelStyleParts.push(`margin-right:${paper.hSpacing}mm`);
        if (paper.vSpacing != null) labelStyleParts.push(`margin-bottom:${paper.vSpacing}mm`);

        // Tên SP TỐI ĐA 2 DÒNG (user 2026-06-05): block thuần + max-height = 2×lineH
        // + overflow:hidden → cắt cứng từ dòng 3. KHÔNG dùng -webkit-box/line-clamp
        // vì html2canvas (raster in TSPL) KHÔNG tôn trọng line-clamp → vẫn ra 3 dòng;
        // max-height clip thì raster cắt đúng 2 dòng → barcode/giá luôn đủ chỗ.
        // line-height name cao hơn lineH +2 cho dấu tiếng Việt 2 tầng (ậ, ọ, ộ…)
        // không bị cắt ở đáy dòng 2. max-height = 2×nameLineH → clip đúng 2 dòng.
        const nameLineH = lineH + 2;
        const nameStyle =
            `overflow-wrap:normal;word-break:keep-all;overflow:hidden;margin-bottom:1px;line-height:${nameLineH}px;` +
            `max-height:${nameLineH * 2}px;`;
        // 2026-06-09: layout QR có cột chữ CAO (full chiều cao tem) + font to → cho
        // tên TỐI ĐA 3 DÒNG (không phải 2) để tên dài (Áo Khoác Dạ Tweed) không bị
        // cắt khi cột hẹp. Default vertical vẫn 2 dòng (ít chỗ dọc vì có barcode).
        const nameStyleQr =
            `overflow-wrap:normal;word-break:keep-all;overflow:hidden;margin-bottom:1px;line-height:${nameLineH}px;` +
            `max-height:${nameLineH * 3}px;`;

        // Group labels into sheets (cols labels per sheet)
        const sheets = [];
        for (let i = 0; i < labels.length; i += cols) {
            sheets.push(labels.slice(i, i + cols));
        }

        const bTag = showBold ? 'strong' : 'span';

        // 2026-06-05: mỗi tem bọc trong 1 CỘT die-cut rộng sheetW/cols (vd 33mm
        // cho 2-up 66mm) + canh giữa trong cột → tem ĐÚNG TÂM con tem vật lý.
        // Thay space-evenly cũ (3 gap đều → dồn 2 tem về giữa sheet → lệch tâm
        // cột, tem bên PHẢI in lệch vào trong — verified qua TSPL raster repro).
        // Sheet thiếu label (partial) → ít cột hơn nhưng cột giữ thứ tự trái→phải
        // (flex-start) nên tem lẻ nằm đúng cột 1 (không cần singleGap nữa).
        const cellW = Math.round((sheetW / cols) * 100) / 100; // mm — bề rộng cột die-cut
        // 2026-06-05: user muốn tem bên PHẢI đẩy sang phải 1 ít. Mỗi cột sau cột
        // đầu lệch phải `ci * RIGHT_NUDGE_MM` (2-up → cột phải +1mm). padding-left
        // = 2×nudge (box-sizing border-box → center dịch phải = padding/2). Cap
        // theo slack còn lại (cellW-labelW)/2 để KHÔNG tràn/cắt mép phải con tem.
        const RIGHT_NUDGE_MM = 1;
        const maxNudge = Math.max(0, (cellW - labelW) / 2 - 0.2);
        let sheetsHTML = '';
        for (const sheet of sheets) {
            // WEB2: ng-style="data.style_sheet()" → {width: SheetWidth+"mm", height: SheetHeight+"mm"}
            sheetsHTML += `<div class="barcode-sheet" style="width:${sheetW}mm;height:${sheetH}mm;">`;
            sheet.forEach((label, ci) => {
                const displayPrice = formatPrice(label.price);
                const currencyStr = showCurrency ? ' đ' : '';
                // JsBarcode Code128 SVG placeholder — script ở cuối <body> sẽ
                // populate qua window.JsBarcode(svg, code, {...}). Mỗi SVG ID
                // unique để JsBarcode đỡ nhầm. KHÔNG gọi API ngoài.
                // 2026-06-06: QR (2D) → ảnh QR pre-render (quét mọi độ dài mã trên
                // tem 25mm); hoặc Code128 PNG canvas crisp giống WEB2 (/Web/Barcode).
                // QR entry theo code+biến thể (biến thể bake giữa QR khi baked=true).
                const qrVariant = showVariant && label.variant ? String(label.variant) : '';
                const qrEntry = isQr ? qrMap[_qrKey(label.code, qrVariant)] || {} : {};
                const barcodeImg = isQr
                    ? `<img class="qrimg" src="${escapeHtml(qrEntry.src || '')}" alt="" />`
                    : `<img class="bcimg" data-code="${escapeHtml(label.code)}" alt="" />`;
                const labelStyle = labelStyleParts.join(';') + ';';

                // Mỗi tem build vào `labelInner` rồi bọc trong .barcode-cell rộng
                // cellW (cột die-cut) → tem canh GIỮA trong cột vật lý của nó.
                let labelInner = '';
                if (isQr && !hideBarcode) {
                    // 2026-06-09: layout QR — cột TRÁI = QR + mã SP DƯỚI QR:
                    //   • BIẾN THỂ canh GIỮA QR (logo-style, nền trắng cho dễ đọc).
                    //   • MÃ SP nằm NGAY DƯỚI QR, canh giữa, BỀ RỘNG = bề rộng QR
                    //     (margin trái/phải trùng mép QR). Auto thu nhỏ font cho vừa.
                    // EC=H bù lại module biến thể che giữa. Tên + giá ở cột BÊN PHẢI.
                    const qrMm =
                        Math.round(
                            Math.min(labelW * 0.52, (labelH - padTop - padBottom) * 0.96) * 10
                        ) / 10;
                    const rowStyle =
                        labelStyle +
                        'flex-direction:row;align-items:center;justify-content:flex-start;text-align:left;';
                    // Cột QR: QR vuông + mã SP dưới, cả 2 rộng đúng qrMm → mã canh
                    // giữa & 2 mép trùng mép QR.
                    const qrColStyle = `flex:0 0 ${qrMm}mm;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-right:0.6mm;`;
                    const qrBox = `position:relative;width:${qrMm}mm;height:${qrMm}mm;display:flex;align-items:center;justify-content:center;`;
                    const codeUnder = `width:${qrMm}mm;`;
                    const txtCol =
                        'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;text-align:left;overflow:hidden;';
                    const codeLeft = `flex:0 0 auto;font-size:${fsCode}px;line-height:${lineHCode}px;text-align:left;white-space:nowrap;`;
                    // Overlay/under fonts: nhỏ hơn fsCode để biến thể che ít module
                    // + mã SP dưới gọn. Biến thể hơi to + đậm cho rõ.
                    const fsVarOv = Math.max(5, Math.round(fsCode * 0.85));
                    // Mã SP dưới QR to hơn (0.72→0.9 × fsCode); auto-fit fitText vẫn
                    // thu nhỏ nếu mã dài tràn bề rộng QR.
                    const fsCodeOv = Math.max(5, Math.round(fsCode * 0.9));
                    labelInner += `<div class="barcode_label" style="${rowStyle}">`;
                    labelInner += `<div class="ql-qr-col" style="${qrColStyle}">`;
                    labelInner += `<div class="barcode-image ql-qr" style="${qrBox}">${barcodeImg}`;
                    // Biến thể: nếu đã BAKE vào giữa QR (Web2QR.centerLabel) thì KHÔNG
                    // vẽ overlay HTML nữa. Chỉ fallback overlay khi QR davidshimjs
                    // (baked=false) — giữ biến thể hiển thị dù lib chính lỗi.
                    if (showVariant && label.variant && !qrEntry.baked) {
                        labelInner += `<div class="ql-qr-variant" style="font-size:${fsVarOv}px;line-height:1;">${escapeHtml(label.variant)}</div>`;
                    }
                    labelInner += `</div>`;
                    // Mã SP DƯỚI QR — canh giữa, rộng = QR, nowrap, auto thu nhỏ.
                    labelInner += `<div class="ql-qr-code" style="${codeUnder}font-size:${fsCodeOv}px;line-height:1;"><${bTag}>${escapeHtml(label.code)}</${bTag}></div>`;
                    labelInner += `</div>`;
                    labelInner += `<div class="ql-text" style="${txtCol}">`;
                    if (showProductName) {
                        labelInner += `<div class="barcode-pname" style="${nameStyleQr}text-align:left;"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>`;
                    }
                    if (showPrice) {
                        // class ql-qr-price → fitText auto thu nhỏ cho VỪA bề ngang
                        // cột chữ (giá dài 1.081.500 không bị cắt mất số/“đ”).
                        labelInner += `<div class="ql-qr-price" style="${codeLeft}"><${bTag} class="barcode-price">${displayPrice}${currencyStr}</${bTag}></div>`;
                    }
                    labelInner += `</div></div>`;
                } else if (printType === 'new') {
                    // PrintNew — 2-column table
                    labelInner = `<div class="barcode_label" style="${labelStyle}"><table border="0" style="width:100%;height:100%;"><tr><td style="width:50%;text-align:center;vertical-align:middle"><div class="barcode-code">${escapeHtml(label.code)}</div>${showPrice ? `<div class="barcode-price">${displayPrice}${currencyStr}</div>` : ''}</td><td style="width:50%;text-align:center;vertical-align:middle"><div class="barcode-image">${!hideBarcode ? barcodeImg : ''}</div></td></tr></table></div>`;
                } else {
                    // Default vertical — proportional scaling theo label size:
                    //   - Title: word-wrap multi-line, font = paper.fontSize (WEB2)
                    //   - Barcode: 45% label height (labelH * 0.45)
                    //   - Code + price: font = fs * 0.9 (slightly smaller), tight
                    //   - P1 2026-05-30: justify-content center (was flex-start)
                    //     để content (title + barcode + code) canh GIỮA dọc tem
                    //     thay vì dồn lên top. User ask "canh giữa".
                    const labelStyleFinal = labelStyle + 'justify-content:center;';
                    const tightFlex = 'flex:0 0 auto;';
                    const barcodeFlex = `flex:0 0 ${barcodeH}mm;height:${barcodeH}mm;display:flex;align-items:center;justify-content:center;min-height:0;`;
                    const codeStyle = `${tightFlex}font-size:${fsCode}px;line-height:${lineHCode}px;`;
                    labelInner += `<div class="barcode_label" style="${labelStyleFinal}">`;
                    if (showProductName) {
                        labelInner += `<div class="barcode-pname" style="${tightFlex}${nameStyle}"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>`;
                    }
                    if (showVariant && label.variant) {
                        labelInner += `<div class="barcode-variant" style="${codeStyle}font-style:italic;">${escapeHtml(label.variant)}</div>`;
                    }
                    if (!hideBarcode && label.code) {
                        labelInner += `<div class="barcode-image" style="${barcodeFlex}">${barcodeImg}</div>`;
                    }
                    labelInner += `<div style="${codeStyle}"><${bTag}>${escapeHtml(label.code)}</${bTag}></div>`;
                    if (showPrice) {
                        labelInner += `<div style="${codeStyle}"><${bTag} class="barcode-price">${displayPrice}${currencyStr}</${bTag}></div>`;
                    }
                    labelInner += `</div>`;
                }
                const nudge = Math.min(ci * RIGHT_NUDGE_MM, maxNudge);
                const cellPad = nudge > 0 ? `padding-left:${(nudge * 2).toFixed(2)}mm;` : '';
                sheetsHTML += `<div class="barcode-cell" style="width:${cellW}mm;height:${labelH}mm;${cellPad}">${labelInner}</div>`;
            });
            sheetsHTML += '</div>';
        }

        // Script tag literals — tách `<` + `script` để parser của trang chính
        // không cắt nhầm khi script này được serve via Blob URL (an toàn cả 2 hướng).
        const SCRIPT_OPEN = '<' + 'script';
        const SCRIPT_CLOSE = '<' + '/script>';

        // CSS = WEB2 /Content/print_barcode.css verbatim (fetched 2026-05-25
        // (render local). TUYỆT ĐỐI không thêm/sửa rules ngoài screen preview
        // block — WEB2 print phải identical với Web 2.0 cùng @page handling.
        // @page KHÔNG có `size:` — WEB2 để printer driver auto-detect từ
        // .barcode-sheet inline width/height. Forcing @page size có thể gây
        // printer driver scale lệch khi paper khác mặc định.
        return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>In mã vạch</title>
<style>
/* === WEB2 /Content/print_barcode.css verbatim === */
* {
    box-sizing: border-box;
}

@page {
    margin: 0 !important;
}

html, body {
    padding: 0 !important;
    margin: 0 !important;
    font-family: Arial, Helvetica, sans-serif;
}

.barcode-sheet {
    page-break-after: always;
    /* 2026-06-05: mỗi tem nằm trong 1 .barcode-cell rộng sheetW/cols (cột
     * die-cut). cells xếp trái→phải, không gap → tem canh GIỮA trong cột vật
     * lý của nó. Thay space-evenly cũ (3 gap đều → dồn 2 tem về tâm sheet →
     * tem bên phải in lệch vào trong, verified qua TSPL raster repro). */
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
}

/* Cột die-cut — bọc 1 tem, canh giữa cả 2 trục trong cột. */
.barcode-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    overflow: hidden;
}
.barcodeCustom-sheet {
    page-break-after: always;
}

.barcode_label {
    box-sizing: border-box;
    text-align: center;
    /* float: left bỏ vì .barcode-sheet giờ flex (P1 2026-05-30 canh giữa) */
    display: flex;
    flex-flow: column;
    overflow: hidden;
    font-size: 10px;
    padding: 5px;
    line-height: 10px;
    flex: 0 0 auto;
}

.barcodeCustom_label {
    box-sizing: border-box;
    text-align: left;
    display: flex;
    overflow: hidden;
    font-size: 5px;
}

.barcode_label div {
    flex: 1 auto;
}

.barcodeCustom_label div {
    flex: 1 auto;
    font-size: 5px;
    line-height: 5px;
}

.barcode-image img {
    width: 100%;
    height: 100%;
    display: block;
}
/* 2026-06-06: barcode = PNG (canvas) crisp giống WEB2 — width:100% như WEB2
   (barcode render local). Nguồn ~600px module nguyên ≥2px → downscale
   về khổ tem vẫn nét, quét được mã dài. KHÔNG còn SVG vector kéo giãn. */
.barcode-image .bcimg {
    width: 100%;
    height: 100%;
    display: block;
}
/* 2026-06-06: QR (2D) — ô vuông, fit chiều cao vùng barcode, canh giữa. QR nhỏ
   ~7-10mm là quét tốt mọi độ dài mã (decoder xác nhận). image-rendering pixelated
   giữ ô QR sắc khi scale. */
.barcode-image .qrimg {
    height: 100%;
    width: auto;
    max-width: 100%;
    display: block;
    margin: 0 auto;
    image-rendering: pixelated;
}
/* 2026-06-09: biến thể overlay GIỮA QR (nền trắng đục, che gọn module — EC=H bù
   lại); mã SP nằm DƯỚI QR, canh giữa, bề rộng = bề rộng QR (2 mép trùng mép QR). */
.ql-qr {
    position: relative;
}
.ql-qr-variant {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 64%;
    padding: 0 1px;
    background: #fff;
    color: #000;
    font-weight: 700;
    font-style: italic;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 1px;
    z-index: 2;
}
.ql-qr-code {
    margin-top: 0.3mm;
    color: #000;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
}

/* === Screen preview only (không in) === */
@media screen {
    body {
        background: #e5e7eb;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }
    .barcode-sheet {
        background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,.15);
        border: 1px solid #ccc;
    }
}
@media print {
    body { background: none !important; display: block !important; padding: 0 !important; margin: 0 !important; }
    .barcode-sheet { border: none !important; box-shadow: none !important; margin: 0 !important; }
}
</style>
</head>
<body>
${sheetsHTML}
${SCRIPT_OPEN} src="${JSBARCODE_URL}">${SCRIPT_CLOSE}
${SCRIPT_OPEN}>
(function(){
    // 2026-06-06: render barcode = ẢNH PNG (canvas) crisp, GIỐNG WEB2
    // (barcode Code128 ~600x100 render local). WEB2 in
    // tem 25mm quét tốt vì dùng PNG raster sắc nét. Bản web2 trước render SVG vector
    // kéo giãn (preserveAspectRatio=none) → khử răng cưa + scale 2 lần khi raster
    // nhiệt → vạch nhoè/lệch tỉ lệ → mã dài không quét (đơn Hạnh Trần). Dựng PNG
    // riêng bằng JsBarcode→canvas (render local) ở ~600px (module nguyên px)
    // rồi hiển thị width:100% giống WEB2 → quét như WEB2, vẫn độc lập.
    var WEB2_PNG_W = 600; // bề ngang nguồn PNG ~ giống WEB2 (600×100)
    function draw(){
        if(!window.JsBarcode){ setTimeout(draw, 30); return; }
        document.querySelectorAll('.bcimg').forEach(function(img){
            try {
                var code = img.dataset.code;
                if(!code) return;
                // Đo số module: render canvas tạm width=1.
                var probe = document.createElement('canvas');
                window.JsBarcode(probe, code, {format:'CODE128', width:1, height:1, displayValue:false, margin:0});
                var modules = probe.width || 0;
                // module = SỐ NGUYÊN px sao cho tổng ~600px (nguồn nét cao như WEB2),
                // tối thiểu 2px/module (chuẩn ngành: KHÔNG dùng px lẻ, width≥2).
                var modPx = Math.max(2, Math.round(WEB2_PNG_W / (modules || WEB2_PNG_W)));
                var canvas = document.createElement('canvas');
                window.JsBarcode(canvas, code, {
                    format:'CODE128', width:modPx, height:100, displayValue:false,
                    margin:0, marginLeft:10*modPx, marginRight:10*modPx
                });
                img.src = canvas.toDataURL('image/png');
            } catch(e) { console.warn('[w2p-print] barcode error', img.dataset.code, e); }
        });
    }
    // 2026-06-09: thu nhỏ font các overlay TRÊN QR (.ql-qr-variant GIỮA,
    // .ql-qr-code GÓC PHẢI DƯỚI) cho tới khi VỪA bề ngang cho phép (max-width
    // theo % cạnh QR) → mã/biến thể DÀI hiện đủ, không tràn che thêm module QR.
    // nowrap để scrollWidth phản ánh tràn. Giảm dần 0.5px, min 3.5px.
    function fitText(){
        document.querySelectorAll('.ql-qr-variant, .ql-qr-code, .ql-qr-price').forEach(function(el){
            var guard=0, fs=parseFloat(getComputedStyle(el).fontSize)||6;
            while(el.scrollWidth > el.clientWidth + 0.5 && fs > 3.5 && guard < 40){
                fs -= 0.5; el.style.fontSize = fs + 'px'; guard++;
            }
        });
    }
    // 2026-06-09: TÊN SP để font TO (giao diện to hơn) nhưng tên DÀI thì tự thu nhỏ
    // cho VỪA hộp 3 dòng (max-height) → không cắt chữ. Tên ngắn giữ font to. Giảm
    // font + line-height đồng bộ 0.5px tới khi scrollHeight<=clientHeight, min 6px.
    function fitName(){
        var MIN_FS = 6; // sàn font dễ đọc cho raster nhiệt
        document.querySelectorAll('.barcode-pname').forEach(function(el){
            var guard=0, fs=parseFloat(getComputedStyle(el).fontSize)||10;
            var lh=parseFloat(getComputedStyle(el).lineHeight)||fs+2;
            var ratio = lh/fs;
            function tooTall(){ return el.scrollHeight > el.clientHeight + 0.5; }
            // tooWide: 1 từ đơn rộng hơn cột (overflow-wrap:normal nên KHÔNG bẻ
            // giữa từ → từ tràn ngang) → scrollWidth > clientWidth.
            function tooWide(){ return el.scrollWidth > el.clientWidth + 0.5; }
            // Thu nhỏ khi tràn CHIỀU CAO (quá số dòng max-height) HOẶC CHIỀU NGANG
            // (1 từ rộng hơn cột). guard 60 cho 2 chiều cùng cần giảm.
            while((tooTall() || tooWide()) && fs > MIN_FS && guard < 60){
                fs -= 0.5; el.style.fontSize = fs + 'px';
                el.style.lineHeight = (fs*ratio).toFixed(1) + 'px';
                guard++;
            }
            // CỨU CÁNH CUỐI: font đã chạm sàn mà 1 token bệnh lý (không khoảng
            // trắng, vd SKU/từ dài) vẫn rộng hơn cột → cho phép bẻ giữa từ còn hơn
            // bị cắt cụt mép phải (overflow:hidden). Bật break rồi chạy lại pass
            // chiều cao vì bẻ thêm dòng có thể vượt max-height.
            if (tooWide()){
                el.style.overflowWrap = 'anywhere';
                el.style.wordBreak = 'break-word';
                guard = 0;
                while(tooTall() && fs > MIN_FS && guard < 60){
                    fs -= 0.5; el.style.fontSize = fs + 'px';
                    el.style.lineHeight = (fs*ratio).toFixed(1) + 'px';
                    guard++;
                }
            }
        });
    }
    function init(){ draw(); fitText(); fitName(); }
    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();
})();
${SCRIPT_CLOSE}
</body>
</html>`;
    }

    // Export ra namespace shared.
    W2PP.buildLabelHTML = buildLabelHTML;
})();
