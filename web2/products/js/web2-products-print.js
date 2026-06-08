// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — In tem mã vạch cho web2/products.
/**
 * Web2ProductsPrint — In tem mã vạch matching WEB2 100%.
 *
 * Mirror visual + structure của WEB2:
 *   - /Content/print_barcode.css (label sheet CSS)
 *   - /BarcodeProductLabel/Print Default template (vertical: name → barcode → code → price)
 *   - /BarcodeProductLabel/PrintNew (2-col: code+price | barcode)
 *   - /BarcodeProductLabel/FormModal (modal UI Bootstrap 3 style)
 *   - BarcodeProducLabelPrintController style_label() (dynamic margins)
 *   - /odata/ProductLabelPaper (3 paper presets)
 *
 * Barcode: JsBarcode CDN (jsdelivr) render Code128 SVG client-side. Code128 là
 *   chuẩn ISO/IEC 15417 → bars/spaces pattern identical với WEB2 rendering cho
 *   cùng input. Print size 25mm wide × 25px tall ngang nhau visually.
 *   KHÔNG request tpos.vn — đảm bảo Web 2.0 hoàn toàn độc lập.
 *
 * Strip-down từ purchase-orders/js/lib/barcode-label-dialog.js (1504 dòng):
 *   - BỎ WEB2Client OData lookup / useWeb2Template / printViaWeb2 / recheck
 *   - GIỮ visual + local HTML render path
 *
 * Font: Helvetica Neue/Arial 13px (modal), Arial (print labels) — WEB2 default,
 * KHÔNG dùng Inter (web2 dùng Inter cho UI khác, riêng print giữ WEB2 font).
 */
(function () {
    'use strict';

    // ---------- Paper presets — exact mirror WEB2 /odata/ProductLabelPaper ----------
    const PAPERS = [
        {
            // P1 2026-05-30: WEB2 spec chuẩn (user paste settings).
            // Sheet 66×21mm, 2 nhãn × 25mm = 50mm + 0.5mm margin × 4 lề = 2mm.
            // → còn dư 14mm là khoảng cách physical giữa 2 con tem trên roll
            //   nhãn. Trước đây float:left dồn 2 nhãn về trái, gap dư ở phải.
            // → Refactor: sheet dùng flex space-evenly để chia 14mm dư thành
            //   3 vùng đều (~4.7mm/vùng) — 2 tem CHIA ĐỀU + CANH GIỮA trên
            //   sheet. CSS handle bên dưới (.barcode-sheet flex space-evenly).
            // FontSize giữ 6 đúng WEB2 preset 7.
            id: 7,
            name: '2 Tem (66×21mm)',
            sheetW: 66,
            sheetH: 21,
            labelW: 25,
            labelH: 21,
            cols: 2,
            fontSize: 6,
            topMargin: 0.5,
            leftMargin: 0.5,
            bottomMargin: 0.5,
            rightMargin: 0.5,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            id: 8,
            name: '1 Tem (65×22mm)',
            sheetW: 65,
            sheetH: 22,
            labelW: 27,
            labelH: 21,
            cols: 2,
            fontSize: 7,
            topMargin: 0,
            leftMargin: 0,
            bottomMargin: 0,
            rightMargin: 0,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            id: 9,
            name: 'Tem 35×22mm',
            sheetW: 70,
            sheetH: 22,
            labelW: 35,
            labelH: 22,
            cols: 2,
            fontSize: 8,
            topMargin: 0,
            leftMargin: 0,
            bottomMargin: 0,
            rightMargin: 0,
            hSpacing: 0,
            vSpacing: 0,
        },
        {
            // 2026-06-06: tem RỘNG 1 con cho MÃ DÀI (≥7 ký tự). Trên tem 25mm,
            // Code128 ~10 ký tự → vạch ~0.15mm (dưới ngưỡng quét ~0.2mm) → không
            // quét được. Tem 50mm 1-con → vạch ~0.3mm → quét tốt mọi mã.
            id: 10,
            name: 'Tem rộng 50×30mm (mã dài)',
            sheetW: 50,
            sheetH: 30,
            labelW: 50,
            labelH: 30,
            cols: 1,
            fontSize: 9,
            topMargin: 1,
            leftMargin: 1,
            bottomMargin: 1,
            rightMargin: 1,
            hSpacing: 0,
            vSpacing: 0,
        },
    ];

    // 2026-06-06: khổ tem MẶC ĐỊNH = "2 Tem (66×21mm)" (id 7) — đúng khổ tem vật lý
    // chuẩn WEB2 user đang dùng (cuộn 2-con 25mm). Tem rộng 50mm chỉ là option.
    const DEFAULT_PAPER_IDX = Math.max(
        0,
        PAPERS.findIndex((p) => p.id === 7)
    );

    const PRINT_TYPES = [
        { id: 'default', name: 'Mặc định (dọc)' },
        { id: 'new', name: '2 cột (ngang)' },
    ];

    // 2026-06-07: CHỈ DÙNG QR Code cho tem SP (user bỏ barcode 1D). QR (2D) quét
    // được mọi độ dài mã trên tem 25mm/203DPI (decoder ZXing xác nhận). Máy quét
    // 2D (imager) — user XP-470B + máy quét 2D. Code128 path giữ làm fallback nội
    // bộ nếu QR lib lỗi, KHÔNG cho user chọn nữa.

    // JsBarcode CDN — Code 128 generator (chuẩn ISO/IEC 15417 identical WEB2 visual).
    // Lazy load lần đầu mở print modal. Inline trong iframe print thay vì script
    // src CDN để tránh load latency lúc print (đã được pre-loaded trên parent page).
    const JSBARCODE_URL = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    let jsBarcodeLoadPromise = null;
    function loadJsBarcode() {
        if (window.JsBarcode) return Promise.resolve();
        if (jsBarcodeLoadPromise) return jsBarcodeLoadPromise;
        jsBarcodeLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = JSBARCODE_URL;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('JsBarcode load failed'));
            document.head.appendChild(s);
        });
        return jsBarcodeLoadPromise;
    }

    // QR generator (davidshimjs/qrcodejs) — render QR ra canvas. Pre-render dataURL
    // trên parent (KHÔNG cần CDN trong cửa sổ in → robust cho in nhiệt timing).
    const QR_URL = 'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js';
    let qrLoadPromise = null;
    function loadQrLib() {
        if (window.QRCode && window.QRCode.CorrectLevel) return Promise.resolve();
        if (qrLoadPromise) return qrLoadPromise;
        qrLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = QR_URL;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('QR lib load failed'));
            document.head.appendChild(s);
        });
        return qrLoadPromise;
    }
    // Tạo dataURL PNG của QR cho 1 mã (canvas, correctLevel M).
    function genQrDataUrl(code) {
        try {
            const tmp = document.createElement('div');
            // eslint-disable-next-line no-new
            new window.QRCode(tmp, {
                text: String(code),
                width: 320,
                height: 320,
                correctLevel: window.QRCode.CorrectLevel.M,
            });
            const c = tmp.querySelector('canvas');
            if (c) return c.toDataURL('image/png');
            const im = tmp.querySelector('img');
            return im ? im.src : '';
        } catch (e) {
            console.warn('[w2p-print] QR gen fail', code, e.message);
            return '';
        }
    }

    let overlay = null;

    // ---------- Helpers ----------
    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : String(s);
        return div.innerHTML;
    }

    function stripBrackets(str) {
        return String(str || '')
            .replace(/\[[^\]]*\]\s*/g, '')
            .trim();
    }

    function formatPrice(n) {
        const num = parseInt(n) || 0;
        return num.toLocaleString('de-DE');
    }

    function notify(msg, type = 'info') {
        if (window.notificationManager?.show) window.notificationManager.show(msg, type);
        else console.log(`[w2p-print:${type}]`, msg);
    }

    /**
     * Entry — open print dialog for 1+ products.
     * @param {Array} products — [{ code, name, price, variant, stock, imageUrl }]
     */
    function open(products) {
        if (!Array.isArray(products) || !products.length) {
            notify('Vui lòng chọn sản phẩm để in', 'error');
            return;
        }

        const items = products.map((p, idx) => ({
            id: p.code || idx,
            name: p.name || '',
            code: p.code || '',
            variant: p.variant || '',
            // P1 2026-05-30: caller có thể preset qty (vd so-order pass qtyReceived
            // → in đúng số lượng nhận hàng). Default = 1.
            quantity: Math.max(1, Math.round(Number(p.quantity) || 1)),
            qtyActual: Math.max(0, Math.round(p.stock || 0)), // for "Gán tồn"
            price: Number(p.price) || 0,
            selected: true,
        }));

        showSelectionModal(items);
    }

    function showSelectionModal(items) {
        if (overlay) overlay.remove();

        let selectedPaper = PAPERS[DEFAULT_PAPER_IDX];
        let selectedPrintType = PRINT_TYPES[0];
        let showPrice = true;
        let showBold = true;
        let showProductName = true;
        let showCurrency = false;
        let hideBarcode = false;

        const withBarcode = items.filter((i) => i.code);
        const withoutBarcode = items.filter((i) => !i.code);
        let activeTab = 0;

        overlay = document.createElement('div');
        overlay.className = 'w2p-print-overlay';

        const warningHTML =
            withoutBarcode.length > 0
                ? `<div class="w2p-print-warning"><span class="w2p-print-warn-icon">⚠</span> Sản phẩm không có mã vạch sẽ không được in: ${withoutBarcode.map((i) => escapeHtml(stripBrackets(i.name))).join(', ')}</div>`
                : '';

        overlay.innerHTML = `
<style>
/* WEB2 FormModal — exact mirror /BarcodeProductLabel/FormModal */
.w2p-print-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center}
.w2p-print-modal{background:#fff;border:1px solid rgba(0,0,0,.2);border-radius:6px;box-shadow:0 5px 15px rgba(0,0,0,.5);width:900px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:13px;color:#333}
/* Header — Bootstrap .modal-header */
.w2p-print-header{padding:15px;border-bottom:1px solid #e5e5e5;display:flex;align-items:center;justify-content:space-between;min-height:16.43px}
.w2p-print-header h4{margin:0;font-size:18px;font-weight:500;line-height:1.4;color:#333}
.w2p-print-close{background:none;border:none;font-size:21px;font-weight:700;line-height:1;color:#000;opacity:.2;cursor:pointer;padding:0}
.w2p-print-close:hover{opacity:.5}
/* Body — .modal-body .o_act_window */
.w2p-print-body{padding:15px;overflow-y:auto;flex:1}
/* o_form_sheet_bg → gray bg, o_form_sheet → white card */
.w2p-print-sheet-bg{background:#eee;padding:16px;margin-bottom:0}
.w2p-print-sheet{background:#fff;padding:16px 16px 8px;border:1px solid #ccc;min-height:80px}
/* o_group — 2-column table layout */
.w2p-print-group{display:table;width:100%;table-layout:fixed}
.w2p-print-group-col{display:table-cell;vertical-align:top;padding:0 8px;width:50%}
.w2p-print-group-col:first-child{padding-left:0}
.w2p-print-group-col:last-child{padding-right:0}
/* o_inner_group — label:field pairs */
.w2p-print-field-row{display:flex;align-items:center;margin-bottom:10px}
.w2p-print-field-label{color:#666;font-weight:400;font-size:13px;padding-right:10px;white-space:nowrap;min-width:70px}
.w2p-print-field-value{flex:1}
.w2p-print-field-value select,.w2p-print-field-value input[type="text"]{width:100%;height:30px;padding:4px 8px;border:1px solid #ccc;border-radius:0;font-size:13px;color:#555;background:#fff;box-shadow:inset 0 1px 1px rgba(0,0,0,.075);outline:none}
.w2p-print-field-value select:focus,.w2p-print-field-value input:focus{border-color:#7c7bad;box-shadow:inset 0 1px 1px rgba(0,0,0,.075),0 0 8px rgba(124,123,173,.6)}
/* Quick apply — btn-success */
.w2p-print-btn-success{display:inline-block;padding:5px 10px;font-size:12px;font-weight:400;color:#fff;background:#5cb85c;border:1px solid #4cae4c;border-radius:3px;cursor:pointer;line-height:1.5;white-space:nowrap}
.w2p-print-btn-success:hover{background:#449d44;border-color:#398439}
.w2p-print-quick-input{width:80px;height:30px;padding:4px 8px;border:1px solid #ccc;font-size:13px;text-align:right;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
/* Checkboxes — o_checkbox row */
.w2p-print-checkbox-row{display:flex;flex-wrap:wrap;gap:0;margin-bottom:4px;min-height:41.5px;align-items:center}
.w2p-print-checkbox-item{display:flex;align-items:center;gap:6px;padding:8px 16px 8px 0;cursor:pointer;font-size:13px;color:#666;white-space:nowrap}
.w2p-print-checkbox-item input[type="checkbox"]{margin:0;cursor:pointer}
.w2p-print-checkbox-item label{margin:0;font-weight:400;cursor:pointer;color:#666}
/* Warning */
.w2p-print-warning{color:#8a6d3b;background:#fcf8e3;border:1px solid #faebcc;padding:8px 12px;border-radius:4px;margin-top:8px;font-size:12px}
.w2p-print-warn-icon{margin-right:4px}
/* Tabs — uib-tabset (Bootstrap nav-tabs) */
.w2p-print-tabs{border-bottom:1px solid #ddd;margin-bottom:0;padding-left:0;list-style:none;display:flex}
.w2p-print-tabs li{margin-bottom:-1px}
.w2p-print-tabs li a{display:block;padding:10px 15px;border:1px solid transparent;border-radius:4px 4px 0 0;color:#2a6496;cursor:pointer;font-size:13px;text-decoration:none;line-height:1.4}
.w2p-print-tabs li a:hover{border-color:#eee #eee #ddd;background:#eee}
.w2p-print-tabs li.active a{color:#555;background:#fff;border:1px solid #ddd;border-bottom-color:#fff;cursor:default;font-weight:400}
/* Table — table-condensed table-striped */
.w2p-print-table{width:100%;border-collapse:collapse;margin-bottom:0}
.w2p-print-table th{padding:5px;text-align:left;font-weight:700;border-bottom:1px solid #ddd;font-size:13px;color:#333;background:#fff}
.w2p-print-table td{padding:5px;border-bottom:1px solid #ddd;font-size:13px;vertical-align:middle}
.w2p-print-table tbody tr:nth-child(odd){background:#f9f9f9}
.w2p-print-table tbody tr:nth-child(even){background:#fff}
.w2p-print-table .w2p-print-qty-input{width:100%;height:28px;padding:2px 8px;border:1px solid #ccc;font-size:13px;text-align:right;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
.w2p-print-table .w2p-print-barcode-input{width:100%;height:28px;padding:2px 8px;border:1px solid #ccc;font-size:13px;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
.w2p-print-table .w2p-print-del-btn{background:none;border:1px solid #ccc;border-radius:3px;padding:4px 8px;cursor:pointer;color:#666;font-size:12px;line-height:1}
.w2p-print-table .w2p-print-del-btn:hover{background:#e6e6e6;border-color:#adadad}
.w2p-print-table td.w2p-print-check-cell{text-align:center}
.w2p-print-table td.w2p-print-check-cell input[type=checkbox]{cursor:pointer;margin:0}
/* Footer — .modal-footer */
.w2p-print-footer{padding:15px;border-top:1px solid #e5e5e5;text-align:left}
/* WEB2 purple primary — verified rgb(114,102,186) từ tomato.tpos.vn */
.w2p-print-btn-primary{display:inline-block;padding:5px 10px;font-size:12px;font-weight:400;color:#fff;background:#7266ba;border:1px solid #7266ba;border-radius:3px;cursor:pointer;line-height:1.5;margin-right:5px}
.w2p-print-btn-primary:hover{background:#6457a8;border-color:#6457a8}
.w2p-print-btn-primary:disabled{opacity:.65;cursor:not-allowed}
.w2p-print-btn-default{display:inline-block;padding:6px 12px;font-size:12px;font-weight:400;color:#333;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer;line-height:1.5}
.w2p-print-btn-default:hover{background:#e6e6e6;border-color:#adadad}
/* Tab content area */
.w2p-print-tab-content{padding:8px 0 0}
</style>
<div class="w2p-print-modal" role="dialog" aria-labelledby="w2pPrintTitle">
    <div class="w2p-print-header">
        <h4 id="w2pPrintTitle">In mã vạch</h4>
        <button class="w2p-print-close" id="w2p-close" type="button" aria-label="Đóng">&times;</button>
    </div>
    <div class="w2p-print-body">
        <div class="w2p-print-sheet-bg">
            <div class="w2p-print-sheet">
                <div class="w2p-print-group">
                    <div class="w2p-print-group-col">
                        <div class="w2p-print-field-row">
                            <span class="w2p-print-field-label">Bảng giá</span>
                            <div class="w2p-print-field-value">
                                <select id="w2p-price-list">
                                    <option selected>Bảng giá mặc định</option>
                                </select>
                            </div>
                        </div>
                        <div class="w2p-print-field-row">
                            <span class="w2p-print-field-label">Giấy in</span>
                            <div class="w2p-print-field-value">
                                <select id="w2p-paper">
                                    ${PAPERS.map((p, i) => `<option value="${i}" ${i === DEFAULT_PAPER_IDX ? 'selected' : ''}>${p.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="w2p-print-field-row">
                            <span class="w2p-print-field-label">Loại in</span>
                            <div class="w2p-print-field-value">
                                <select id="w2p-print-type">
                                    ${PRINT_TYPES.map((t, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${t.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="w2p-print-group-col">
                        <div class="w2p-print-field-row">
                            <span class="w2p-print-field-label">Kho/Kho hàng</span>
                            <div class="w2p-print-field-value">
                                <select id="w2p-warehouse">
                                    <option selected>[WH] Kho Web 2.0</option>
                                </select>
                            </div>
                        </div>
                        <div class="w2p-print-field-row" style="justify-content:flex-end;gap:8px;">
                            <button class="w2p-print-btn-success" id="w2p-apply-qty" type="button">Áp dụng nhanh số lượng</button>
                            <input type="number" id="w2p-quick-qty" class="w2p-print-quick-input" value="1" min="1" max="999">
                        </div>
                    </div>
                </div>
                <div class="w2p-print-checkbox-row">
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-show-price">Hiện giá</label>
                        <input type="checkbox" id="w2p-show-price" checked>
                    </div>
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-show-bold">Chữ đậm</label>
                        <input type="checkbox" id="w2p-show-bold" checked>
                    </div>
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-show-currency">Hiện đơn vị tiền tệ</label>
                        <input type="checkbox" id="w2p-show-currency">
                    </div>
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-show-name">Hiển thị Tên sản phẩm</label>
                        <input type="checkbox" id="w2p-show-name" checked>
                    </div>
                </div>
                <div class="w2p-print-checkbox-row">
                    <div class="w2p-print-checkbox-item" title="Gán số lượng tồn kho vào số lượng in (WEB2-compat)">
                        <label for="w2p-gan-ton">Gán tồn</label>
                        <input type="checkbox" id="w2p-gan-ton">
                    </div>
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-hide-barcode">Ẩn mã QR</label>
                        <input type="checkbox" id="w2p-hide-barcode">
                    </div>
                </div>
                ${warningHTML}
            </div>
        </div>
        <div style="padding:0;">
            <ul class="w2p-print-tabs" id="w2p-tab-bar">
                <li class="active"><a data-tab="0">Sản phẩm có mã vạch</a></li>
                <li><a data-tab="1">Sản phẩm không có mã vạch</a></li>
            </ul>
            <div class="w2p-print-tab-content">
                <div class="table-responsive">
                    <table class="w2p-print-table">
                        <thead>
                            <tr>
                                <th id="w2p-col-check" style="width:40px;text-align:center">
                                    <input type="checkbox" id="w2p-select-all" checked title="Chọn tất cả">
                                </th>
                                <th>Sản phẩm</th>
                                <th id="w2p-col2-header" style="width:140px">Số lượng</th>
                                <th style="width:40px"></th>
                            </tr>
                        </thead>
                        <tbody id="w2p-items-body"></tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    <div class="w2p-print-footer">
        <button class="w2p-print-btn-primary" id="w2p-btn-print" type="button">In bằng pdf</button>
        <button class="w2p-print-btn-default" id="w2p-btn-cancel" type="button">Đóng</button>
    </div>
</div>`;

        document.body.appendChild(overlay);

        const $ = (sel) => overlay.querySelector(sel);
        const btnPrint = $('#w2p-btn-print');

        function renderTableRows() {
            const tbody = $('#w2p-items-body');
            const col2Header = $('#w2p-col2-header');
            const checkCol = $('#w2p-col-check');
            tbody.innerHTML = '';

            if (activeTab === 0) {
                col2Header.textContent = 'Số lượng';
                col2Header.style.width = '140px';
                if (checkCol) checkCol.style.display = '';
                withBarcode.forEach((item) => {
                    const origIdx = items.indexOf(item);
                    const variantText = item.variant ? ` (${item.variant})` : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="w2p-print-check-cell"><input type="checkbox" class="w2p-select" data-index="${origIdx}" ${item.selected ? 'checked' : ''}></td>
                        <td>${escapeHtml(item.code ? `[${item.code}] ` : '')}${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}</td>
                        <td><input type="number" class="w2p-print-qty-input w2p-qty" data-index="${origIdx}" value="${item.quantity}" min="0" max="999"></td>
                        <td><button class="w2p-print-del-btn w2p-remove" data-index="${origIdx}" type="button">🗑</button></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (withBarcode.length === 0) {
                    tbody.innerHTML =
                        '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
                updateSelectAllState();
            } else {
                col2Header.textContent = 'Mã vạch';
                col2Header.style.width = '200px';
                if (checkCol) checkCol.style.display = 'none';
                withoutBarcode.forEach((item) => {
                    const origIdx = items.indexOf(item);
                    const variantText = item.variant ? ` (${item.variant})` : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}</td>
                        <td><input type="text" class="w2p-print-barcode-input w2p-barcode-edit" data-index="${origIdx}" value="${escapeHtml(item.code)}" placeholder="Nhập mã vạch..."></td>
                        <td></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (withoutBarcode.length === 0) {
                    tbody.innerHTML =
                        '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
            }
            updateCount();
        }

        function updateSelectAllState() {
            const master = $('#w2p-select-all');
            if (!master || activeTab !== 0) return;
            if (withBarcode.length === 0) {
                master.checked = false;
                master.indeterminate = false;
                return;
            }
            const selectedCount = withBarcode.filter((it) => it.selected).length;
            master.checked = selectedCount === withBarcode.length;
            master.indeterminate = selectedCount > 0 && selectedCount < withBarcode.length;
        }

        function updateCount() {
            const total = items
                .filter((it) => it.selected && it.code)
                .reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
            btnPrint.textContent = `In bằng pdf (${total})`;
            btnPrint.disabled = total === 0;
        }

        renderTableRows();

        // ---------- Events ----------
        $('#w2p-close').addEventListener('click', closeModal);
        $('#w2p-btn-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Tabs
        $('#w2p-tab-bar').addEventListener('click', (e) => {
            const a = e.target.closest('a[data-tab]');
            if (!a) return;
            e.preventDefault();
            activeTab = Number(a.dataset.tab);
            overlay.querySelectorAll('#w2p-tab-bar li').forEach((li, i) => {
                li.classList.toggle('active', i === activeTab);
            });
            renderTableRows();
        });

        // Paper change
        $('#w2p-paper').addEventListener('change', (e) => {
            selectedPaper = PAPERS[Number(e.target.value)] || PAPERS[0];
        });

        // Print type change
        $('#w2p-print-type').addEventListener('change', (e) => {
            selectedPrintType = PRINT_TYPES[Number(e.target.value)] || PRINT_TYPES[0];
        });

        // Option checkboxes
        $('#w2p-show-price').addEventListener('change', (e) => (showPrice = e.target.checked));
        $('#w2p-show-bold').addEventListener('change', (e) => (showBold = e.target.checked));
        $('#w2p-show-currency').addEventListener(
            'change',
            (e) => (showCurrency = e.target.checked)
        );
        $('#w2p-show-name').addEventListener('change', (e) => (showProductName = e.target.checked));
        $('#w2p-hide-barcode').addEventListener('change', (e) => (hideBarcode = e.target.checked));

        // Quick apply qty
        $('#w2p-apply-qty').addEventListener('click', () => {
            const q = Math.max(1, parseInt($('#w2p-quick-qty').value) || 1);
            items.forEach((it) => (it.quantity = q));
            renderTableRows();
        });

        // Gán tồn — qty = stock per item
        $('#w2p-gan-ton').addEventListener('change', (e) => {
            if (!e.target.checked) return;
            items.forEach((it) => {
                if (it.qtyActual > 0) it.quantity = it.qtyActual;
            });
            renderTableRows();
        });

        // Select all
        $('#w2p-select-all').addEventListener('change', (e) => {
            withBarcode.forEach((it) => (it.selected = e.target.checked));
            renderTableRows();
        });

        // Row events delegation
        $('#w2p-items-body').addEventListener('change', (e) => {
            const idx = Number(e.target.dataset.index);
            if (!items[idx]) return;
            if (e.target.classList.contains('w2p-qty')) {
                items[idx].quantity = Math.max(0, parseInt(e.target.value) || 0);
                updateCount();
            } else if (e.target.classList.contains('w2p-select')) {
                items[idx].selected = e.target.checked;
                updateSelectAllState();
                updateCount();
            } else if (e.target.classList.contains('w2p-barcode-edit')) {
                items[idx].code = e.target.value.trim();
            }
        });

        $('#w2p-items-body').addEventListener('click', (e) => {
            const btn = e.target.closest('.w2p-remove');
            if (!btn) return;
            const idx = Number(btn.dataset.index);
            const item = items[idx];
            if (!item) return;
            const wbIdx = withBarcode.indexOf(item);
            if (wbIdx >= 0) withBarcode.splice(wbIdx, 1);
            const wobIdx = withoutBarcode.indexOf(item);
            if (wobIdx >= 0) withoutBarcode.splice(wobIdx, 1);
            const i = items.indexOf(item);
            if (i >= 0) items.splice(i, 1);
            renderTableRows();
        });

        // Print
        btnPrint.addEventListener('click', () => {
            const printItems = items.filter((it) => it.selected && it.code && it.quantity > 0);
            if (!printItems.length) {
                notify('Không có sản phẩm để in', 'error');
                return;
            }
            closeModal();
            generateAndPrint(printItems, selectedPaper, selectedPrintType.id, {
                showPrice,
                showBold,
                showProductName,
                showCurrency,
                hideBarcode,
                symbology: 'qr',
            });
        });
    }

    function closeModal() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }

    // ---------- Label HTML generator — exact WEB2 mirror ----------
    // [2026-06-05] Ghi số lần in tem (print_count) cho SP → tránh in tem trùng.
    // 1 lần in = +1 cho mỗi mã SP (unique), không tính theo số tem. Lỗi → bỏ qua.
    function _markProductsPrinted(items) {
        try {
            const codes = [...new Set((items || []).map((it) => it.code).filter(Boolean))];
            if (!codes.length) return;
            const base =
                (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            fetch(base + '/api/web2-products/mark-printed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codes }),
            }).catch(() => {});
        } catch (e) {
            /* noop */
        }
    }

    async function generateAndPrint(items, paper, printType, opts) {
        _markProductsPrinted(items);
        const labels = [];
        for (const item of items) {
            for (let i = 0; i < item.quantity; i++) {
                labels.push({
                    name: stripBrackets(item.name),
                    code: item.code,
                    price: item.price,
                });
            }
        }
        // QR: pre-render dataURL trên parent (robust, không phụ thuộc CDN/timing
        // trong cửa sổ in nhiệt). Mỗi mã unique render 1 lần.
        let qrMap = null;
        if (opts.symbology === 'qr' && !opts.hideBarcode) {
            try {
                await loadQrLib();
                qrMap = {};
                const uniq = [...new Set(labels.map((l) => l.code).filter(Boolean))];
                for (const code of uniq) qrMap[code] = genQrDataUrl(code);
            } catch (e) {
                notify('Lỗi tạo QR, in tạm mã 1D: ' + e.message, 'warning');
                opts = { ...opts, symbology: 'code128' };
            }
        }
        const html = buildLabelHTML(labels, paper, printType, opts, qrMap);
        // 2026-06-04: nếu chức năng 'label' (tem mã SP) đã gán máy in IP (bridge)
        // → in THẲNG ra máy tem, không hộp thoại. Lỗi/bridge tắt → fallback overlay.
        const P = window.Web2Printer;
        if (P && P.roleIsBridge && P.roleIsBridge('label')) {
            P.bridgeAlive(P.getPrinterFor('label'))
                .then((alive) => {
                    if (!alive) return showPrintOverlay(html);
                    P.printHtml(html, 'label')
                        .then(() => {
                            if (window.notificationManager)
                                window.notificationManager.show('Đã in tem mã SP', 'success');
                        })
                        .catch((e) => {
                            console.warn('[products-print] in thẳng lỗi → overlay:', e.message);
                            if (window.notificationManager)
                                window.notificationManager.show(
                                    'Máy tem lỗi (' + e.message + ') — mở hộp thoại',
                                    'warning'
                                );
                            showPrintOverlay(html);
                        });
                })
                .catch(() => showPrintOverlay(html));
            return;
        }
        showPrintOverlay(html);
    }

    /**
     * Build label HTML matching WEB2 exactly:
     *   - Font: Arial (WEB2 default)
     *   - CSS from /Content/print_barcode.css
     *   - Dynamic styles from BarcodeProducLabelPrintController.style_label()
     *   - Barcode: JsBarcode Code128 SVG client-side (chuẩn ISO/IEC 15417 →
     *     bars/spaces identical WEB2 render cho cùng input). KHÔNG request tpos.vn.
     */
    function buildLabelHTML(labels, paper, printType, opts, qrMap) {
        const isQr = opts.symbology === 'qr' && qrMap;
        const { showPrice, showBold, showProductName, showCurrency, hideBarcode } = opts;
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
        // preset WEB2: font ×1.3, barcode cao 46% tem + bars rộng gần full. Content
        // CANH GIỮA dọc tem (justify-content:center) — khối to nhưng không sát mép.
        // Barcode 46% (không 55%) để tên 2 dòng vẫn đủ chỗ, GIÁ không bị cắt.
        const fsBase = fontSize || Math.max(5, Math.round(labelW * 0.24));
        const fs = Math.round(fsBase * 1.3);
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
            `word-wrap:break-word;overflow:hidden;margin-bottom:1px;line-height:${nameLineH}px;` +
            `max-height:${nameLineH * 2}px;`;

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
                // unique để JsBarcode đỡ nhầm. KHÔNG request tpos.vn.
                // 2026-06-06: QR (2D) → ảnh QR pre-render (quét mọi độ dài mã trên
                // tem 25mm); hoặc Code128 PNG canvas crisp giống WEB2 (/Web/Barcode).
                const barcodeImg = isQr
                    ? `<img class="qrimg" src="${escapeHtml(qrMap[label.code] || '')}" alt="" />`
                    : `<img class="bcimg" data-code="${escapeHtml(label.code)}" alt="" />`;
                const labelStyle = labelStyleParts.join(';') + ';';

                // Mỗi tem build vào `labelInner` rồi bọc trong .barcode-cell rộng
                // cellW (cột die-cut) → tem canh GIỮA trong cột vật lý của nó.
                let labelInner = '';
                if (isQr && !hideBarcode) {
                    // 2026-06-06: layout QR — QR vuông BÊN TRÁI, tên+mã+giá BÊN PHẢI.
                    // QR cạnh = min(45% rộng tem, ~92% cao tem) → đủ to để quét, chừa
                    // ~nửa tem cho chữ. Áp dụng cho MỌI con tem (2 tem đều QR).
                    const qrMm =
                        Math.round(
                            Math.min(labelW * 0.45, (labelH - padTop - padBottom) * 0.96) * 10
                        ) / 10;
                    const rowStyle =
                        labelStyle +
                        'flex-direction:row;align-items:center;justify-content:flex-start;text-align:left;';
                    const qrBox = `flex:0 0 ${qrMm}mm;height:${qrMm}mm;display:flex;align-items:center;justify-content:center;margin-right:1mm;`;
                    const txtCol =
                        'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;text-align:left;overflow:hidden;';
                    // ql-code: nowrap + auto thu nhỏ font (script fitText) để mã DÀI
                    // (vd ADQUANDENM) hiện ĐỦ, không bị cắt mép phải.
                    const codeLeft = `flex:0 0 auto;font-size:${fsCode}px;line-height:${lineHCode}px;text-align:left;white-space:nowrap;`;
                    labelInner += `<div class="barcode_label" style="${rowStyle}">`;
                    labelInner += `<div class="barcode-image ql-qr" style="${qrBox}">${barcodeImg}</div>`;
                    labelInner += `<div class="ql-text" style="${txtCol}">`;
                    if (showProductName) {
                        labelInner += `<div class="barcode-pname" style="${nameStyle}text-align:left;"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>`;
                    }
                    labelInner += `<div class="ql-code" style="${codeLeft}"><${bTag}>${escapeHtml(label.code)}</${bTag}></div>`;
                    if (showPrice) {
                        labelInner += `<div style="${codeLeft}"><${bTag} class="barcode-price">${displayPrice}${currencyStr}</${bTag}></div>`;
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
        // từ tomato.tpos.vn). TUYỆT ĐỐI không thêm/sửa rules ngoài screen preview
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
   (gc-statics.tpos.vn/Web/Barcode). Nguồn ~600px module nguyên ≥2px → downscale
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
    // (gc-statics.tpos.vn/Web/Barcode?type=Code128&width=600&height=100). WEB2 in
    // tem 25mm quét tốt vì dùng PNG raster sắc nét. Bản web2 trước render SVG vector
    // kéo giãn (preserveAspectRatio=none) → khử răng cưa + scale 2 lần khi raster
    // nhiệt → vạch nhoè/lệch tỉ lệ → mã dài không quét (đơn Hạnh Trần). Dựng PNG
    // riêng bằng JsBarcode→canvas (KHÔNG gọi tpos.vn) ở ~600px (module nguyên px)
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
    // 2026-06-06: thu nhỏ font mã (.ql-code, layout QR) cho tới khi VỪA bề ngang
    // cột chữ → mã dài (ADQUANDENM…) hiện đủ, không cắt mép. nowrap để scrollWidth
    // phản ánh tràn. Giảm dần 0.5px, min 4px.
    function fitText(){
        document.querySelectorAll('.ql-code').forEach(function(el){
            var guard=0, fs=parseFloat(getComputedStyle(el).fontSize)||8;
            while(el.scrollWidth > el.clientWidth + 0.5 && fs > 4 && guard < 40){
                fs -= 0.5; el.style.fontSize = fs + 'px'; guard++;
            }
        });
    }
    function init(){ draw(); fitText(); }
    document.addEventListener('DOMContentLoaded', init);
    if (document.readyState !== 'loading') init();
})();
${SCRIPT_CLOSE}
</body>
</html>`;
    }

    // Fullscreen overlay với iframe + toolbar (mirror BarcodeLabelDialog flow).
    function showPrintOverlay(html) {
        const printOverlay = document.createElement('div');
        printOverlay.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText =
            'display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;background:#1f2937;';

        const btnPrint = document.createElement('button');
        btnPrint.textContent = 'In bằng pdf';
        btnPrint.style.cssText =
            'padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;';

        const btnClose = document.createElement('button');
        btnClose.textContent = 'Đóng';
        btnClose.style.cssText =
            'padding:8px 20px;background:#4b5563;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'flex:1;border:none;background:#e5e7eb;';

        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;

        btnPrint.onclick = () => {
            try {
                iframe.contentWindow.print();
            } catch (e) {
                console.error('[w2p-print] Print error:', e);
            }
        };
        const closePrint = () => {
            printOverlay.remove();
            URL.revokeObjectURL(blobUrl);
        };
        btnClose.onclick = closePrint;
        printOverlay.onclick = (e) => {
            if (e.target === printOverlay) closePrint();
        };

        toolbar.append(btnPrint, btnClose);
        printOverlay.append(toolbar, iframe);
        document.body.appendChild(printOverlay);
    }

    // ---------- Public API ----------
    window.Web2ProductsPrint = { open };
})();
