// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * BarcodeLabelDialog - Barcode label printing matching TPOS exactly
 *
 * CSS/layout replicated from TPOS:
 *   - /Content/print_barcode.css
 *   - /BarcodeProductLabel/Print (Default template)
 *   - /BarcodeProductLabel/PrintNew (New template)
 *   - Dynamic styles from BarcodeProducLabelPrintController
 *
 * Font: Arial (TPOS default), Code 128 barcode via JsBarcode
 * Paper "2 Tem": 66mm × 21mm sheet, 25mm × 21mm labels, 2 per row
 */
window.BarcodeLabelDialog = (function () {
    let overlay = null;

    // Paper presets matching TPOS /odata/ProductLabelPaper exactly
    const PAPERS = [
        {
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
    ];

    const PRINT_TYPES = [
        { id: 'default', name: 'Mặc định (dọc)' },
        { id: 'new', name: '2 cột (ngang)' },
    ];

    function open(order) {
        if (!order?.items?.length) return;

        const items = order.items.map((item, idx) => ({
            id: item.id || idx,
            name: item.productName || '',
            code: item.productCode || '',
            // Parent template code — cần cho recheck TPOS variants
            // (variants nhiều khi không có DefaultCode riêng → phải tra Template).
            parentCode: item.parentProductCode || item.productCode || '',
            variant: item.variant || '',
            quantity: item.quantity || 1,
            price: item.sellingPrice || 0,
            purchasePrice: item.purchasePrice || 0,
            tposProductId: item.tposProductId || null,
            tposProductTmplId: item.tposProductTmplId || null,
            checked: true,
            // Mặc định tick chọn để in. User có thể bỏ tick row hoặc dùng
            // "Chọn tất cả" trong header để bỏ chọn hàng loạt. Print path chỉ
            // in những item `selected = true` + `quantity > 0`.
            selected: true,
        }));

        showSelectionModal(order, items);
    }

    function showSelectionModal(order, items) {
        if (overlay) overlay.remove();

        let selectedPaper = PAPERS[0];
        let selectedPrintType = PRINT_TYPES[0];
        let showPrice = true;
        let showBold = true;
        let showProductName = true;
        let showCurrency = false;
        let hideBarcode = false;
        // TPOS mode toggle — checked: items đã sync TPOS in qua mẫu PDF của TPOS;
        // unchecked: in HTML local cho tất cả items (kể cả chưa sync).
        let useTposTemplate = true;
        // Set chứa product codes đã sync về kho TPOS, populated bởi pre-fetch
        // ngay khi dialog mở. Items không trong set sẽ bị TPOS print drop silent
        // → ta show warning trong dialog để user biết trước.
        let tposCodeSet = null; // null = chưa fetch, Set = fetched
        // Cache product data fetched trực tiếp từ TPOS OData khi user click
        // "Kiểm lại TPOS". Dùng để in TPOS template cho các mã KHÔNG có trong
        // local web_warehouse nhưng có thật trên TPOS (mapping local bị thiếu).
        // Key = product_code (DefaultCode), value = mapped product row.
        let liveTposCache = new Map();
        let recheckInFlight = false;

        const withBarcode = items.filter((i) => i.code);
        const withoutBarcode = items.filter((i) => !i.code);
        let activeTab = 0; // 0 = có mã vạch, 1 = không có mã vạch

        overlay = document.createElement('div');
        overlay.className = 'bld-overlay';

        const warningHTML =
            withoutBarcode.length > 0
                ? `<div class="bld-warning"><span class="bld-warning-icon">⚠</span> Sản phẩm không có mã vạch sẽ không được in${withoutBarcode.length > 0 ? ': ' + withoutBarcode.map((i) => stripBrackets(i.name)).join(', ') : ''}</div>`
                : '';

        overlay.innerHTML = `
<style>
/* TPOS Modal — matched to /BarcodeProductLabel/FormModal */
.bld-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center}
.bld-modal{background:#fff;border:1px solid rgba(0,0,0,.2);border-radius:6px;box-shadow:0 5px 15px rgba(0,0,0,.5);width:900px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:13px;color:#333}
/* Header — Bootstrap .modal-header */
.bld-modal-header{padding:15px;border-bottom:1px solid #e5e5e5;display:flex;align-items:center;justify-content:space-between;min-height:16.43px}
.bld-modal-header h4{margin:0;font-size:18px;font-weight:500;line-height:1.4}
.bld-modal-header .bld-close{background:none;border:none;font-size:21px;font-weight:700;line-height:1;color:#000;opacity:.2;cursor:pointer;padding:0;float:right}
.bld-modal-header .bld-close:hover{opacity:.5}
/* Body — .modal-body .o_act_window */
.bld-modal-body{padding:15px;overflow-y:auto;flex:1}
/* o_form_sheet_bg → gray bg, o_form_sheet → white card */
.bld-sheet-bg{background:#eee;padding:16px;margin-bottom:0}
.bld-sheet{background:#fff;padding:16px 16px 8px;border:1px solid #ccc;min-height:80px}
/* o_group — 2-column table layout */
.bld-group{display:table;width:100%;table-layout:fixed}
.bld-group-col{display:table-cell;vertical-align:top;padding:0 8px;width:50%}
.bld-group-col:first-child{padding-left:0}
.bld-group-col:last-child{padding-right:0}
/* o_inner_group table rows — label:field pairs */
.bld-field-row{display:flex;align-items:center;margin-bottom:10px}
.bld-field-label{color:#666;font-weight:400;font-size:13px;padding-right:10px;white-space:nowrap;min-width:70px}
.bld-field-value{flex:1}
.bld-field-value select,.bld-field-value input[type="text"]{width:100%;height:30px;padding:4px 8px;border:1px solid #ccc;border-radius:0;font-size:13px;color:#555;background:#fff;box-shadow:inset 0 1px 1px rgba(0,0,0,.075);outline:none}
.bld-field-value select:focus,.bld-field-value input:focus{border-color:#7c7bad;box-shadow:inset 0 1px 1px rgba(0,0,0,.075),0 0 8px rgba(124,123,173,.6)}
/* Quick apply — btn-success */
.bld-btn-success{display:inline-block;padding:5px 10px;font-size:12px;font-weight:400;color:#fff;background:#5cb85c;border:1px solid #4cae4c;border-radius:3px;cursor:pointer;line-height:1.5;white-space:nowrap}
.bld-btn-success:hover{background:#449d44;border-color:#398439}
.bld-quick-input{width:80px;height:30px;padding:4px 8px;border:1px solid #ccc;font-size:13px;text-align:right;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
/* Checkboxes — o_checkbox row */
.bld-checkbox-row{display:flex;flex-wrap:wrap;gap:0;margin-bottom:4px;min-height:41.5px;align-items:center}
.bld-checkbox-item{display:flex;align-items:center;gap:6px;padding:8px 16px 8px 0;cursor:pointer;font-size:13px;color:#666;white-space:nowrap}
.bld-checkbox-item input[type="checkbox"]{margin:0;cursor:pointer}
.bld-checkbox-item label{margin:0;font-weight:400;cursor:pointer;color:#666}
/* Warning */
.bld-warning{color:#8a6d3b;background:#fcf8e3;border:1px solid #faebcc;padding:8px 12px;border-radius:4px;margin-top:8px;font-size:12px}
.bld-warning-icon{margin-right:4px}
.bld-recheck-btn{display:inline-block;margin-left:8px;padding:3px 10px;font-size:12px;color:#fff;background:#8a6d3b;border:1px solid #6e552a;border-radius:3px;cursor:pointer;line-height:1.4}
.bld-recheck-btn:hover{background:#6e552a}
.bld-recheck-btn:disabled{opacity:.6;cursor:wait}
.bld-recheck-result{display:block;margin-top:6px;font-size:12px}
.bld-recheck-result.ok{color:#3c763d}
.bld-recheck-result.err{color:#a94442}
/* Tabs — uib-tabset (Bootstrap nav-tabs) */
.bld-tabs{border-bottom:1px solid #ddd;margin-bottom:0;padding-left:0;list-style:none;display:flex}
.bld-tabs li{margin-bottom:-1px}
.bld-tabs li a{display:block;padding:10px 15px;border:1px solid transparent;border-radius:4px 4px 0 0;color:#2a6496;cursor:pointer;font-size:13px;text-decoration:none;line-height:1.4}
.bld-tabs li a:hover{border-color:#eee #eee #ddd;background:#eee}
.bld-tabs li.active a{color:#555;background:#fff;border:1px solid #ddd;border-bottom-color:#fff;cursor:default;font-weight:400}
/* Table — table-condensed table-striped */
.bld-table{width:100%;border-collapse:collapse;margin-bottom:0}
.bld-table th{padding:5px;text-align:left;font-weight:700;border-bottom:1px solid #ddd;font-size:13px;color:#333;background:#fff}
.bld-table td{padding:5px;border-bottom:1px solid #ddd;font-size:13px;vertical-align:middle}
.bld-table tbody tr:nth-child(odd){background:#f9f9f9}
.bld-table tbody tr:nth-child(even){background:#fff}
.bld-table .bld-qty-input{width:100%;height:28px;padding:2px 8px;border:1px solid #ccc;font-size:13px;text-align:right;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
.bld-table .bld-barcode-input{width:100%;height:28px;padding:2px 8px;border:1px solid #ccc;font-size:13px;box-shadow:inset 0 1px 1px rgba(0,0,0,.075)}
.bld-table .bld-delete-btn{background:none;border:1px solid #ccc;border-radius:3px;padding:4px 8px;cursor:pointer;color:#666;font-size:12px;line-height:1}
.bld-table .bld-delete-btn:hover{background:#e6e6e6;border-color:#adadad}
.bld-table td.bld-check-cell{text-align:center}
.bld-table td.bld-check-cell input[type=checkbox]{cursor:pointer;margin:0}
.bld-row-unsync td{background:#fcf8e3 !important}
.bld-row-unsync td:first-child{border-left:3px solid #faebcc}
.bld-unsync-badge{display:inline-block;background:#f0ad4e;color:#fff;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;margin-left:6px;vertical-align:middle}
.bld-add-row{color:#2a6496;cursor:pointer;font-size:13px;text-decoration:none}
.bld-add-row:hover{text-decoration:underline}
/* Footer — .modal-footer */
.bld-modal-footer{padding:15px;border-top:1px solid #e5e5e5;text-align:left}
.bld-btn-primary{display:inline-block;padding:6px 12px;font-size:12px;font-weight:400;color:#fff;background:#337ab7;border:1px solid #2e6da4;border-radius:3px;cursor:pointer;line-height:1.5;margin-right:5px}
.bld-btn-primary:hover{background:#286090;border-color:#204d74}
.bld-btn-primary:disabled{opacity:.65;cursor:not-allowed}
.bld-btn-default{display:inline-block;padding:6px 12px;font-size:12px;font-weight:400;color:#333;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer;line-height:1.5}
.bld-btn-default:hover{background:#e6e6e6;border-color:#adadad}
/* Tab content area */
.bld-tab-content{padding:8px 0 0}
</style>
<div class="bld-modal">
    <!-- Header -->
    <div class="bld-modal-header">
        <h4>In mã vạch</h4>
        <button class="bld-close" id="bld-close">&times;</button>
    </div>
    <!-- Body -->
    <div class="bld-modal-body">
        <div class="bld-sheet-bg">
            <div class="bld-sheet">
                <div class="bld-group">
                    <!-- Left column: Bảng giá + Giấy in -->
                    <div class="bld-group-col">
                        <div class="bld-field-row">
                            <span class="bld-field-label">Bảng giá</span>
                            <div class="bld-field-value">
                                <select id="bld-price-list">
                                    <option selected>Bảng giá mặc định</option>
                                </select>
                            </div>
                        </div>
                        <div class="bld-field-row">
                            <span class="bld-field-label">Giấy in</span>
                            <div class="bld-field-value">
                                <select id="bld-paper">
                                    ${PAPERS.map((p, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${p.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    </div>
                    <!-- Right column: Áp dụng nhanh số lượng -->
                    <div class="bld-group-col">
                        <div class="bld-field-row" style="justify-content:flex-end;gap:8px;">
                            <button class="bld-btn-success" id="bld-apply-qty">Áp dụng nhanh số lượng</button>
                            <input type="number" id="bld-quick-qty" class="bld-quick-input" value="1" min="1" max="999">
                        </div>
                    </div>
                </div>
                <!-- Checkboxes row 1 -->
                <div class="bld-checkbox-row">
                    <div class="bld-checkbox-item">
                        <label for="bld-show-price">Hiện giá</label>
                        <input type="checkbox" id="bld-show-price" checked>
                    </div>
                    <div class="bld-checkbox-item">
                        <label for="bld-show-bold">Chữ đậm</label>
                        <input type="checkbox" id="bld-show-bold" checked>
                    </div>
                    <div class="bld-checkbox-item">
                        <label for="bld-show-currency">Hiện đơn vị tiền tệ</label>
                        <input type="checkbox" id="bld-show-currency">
                    </div>
                    <div class="bld-checkbox-item">
                        <label for="bld-show-name">Hiển thị Tên sản phẩm</label>
                        <input type="checkbox" id="bld-show-name" checked>
                    </div>
                </div>
                <!-- Checkboxes row 2 -->
                <div class="bld-checkbox-row">
                    <div class="bld-checkbox-item">
                        <label for="bld-hide-barcode">Ẩn mã vạch (Khuyến nghị dùng cho loại in mặc định)</label>
                        <input type="checkbox" id="bld-hide-barcode">
                    </div>
                    <div class="bld-checkbox-item" title="Bật: in PDF qua TPOS cho sản phẩm đã sync. Tắt: in HTML local cho tất cả sản phẩm.">
                        <label for="bld-use-tpos">In theo mẫu TPOS</label>
                        <input type="checkbox" id="bld-use-tpos" checked>
                    </div>
                </div>
                ${warningHTML}
                <div class="bld-warning bld-warning-tpos" id="bld-warning-tpos" style="display:none"></div>
            </div>
        </div>
        <!-- Tabs + Table section -->
        <div style="padding:0;">
            <ul class="bld-tabs" id="bld-tab-bar">
                <li class="active"><a data-tab="0">Sản phẩm có mã vạch</a></li>
                <li><a data-tab="1">Sản phẩm không có mã vạch</a></li>
            </ul>
            <div class="bld-tab-content">
                <div class="table-responsive">
                    <table class="bld-table">
                        <thead>
                            <tr>
                                <th id="bld-col-check" style="width:40px;text-align:center">
                                    <input type="checkbox" id="bld-select-all" checked title="Chọn tất cả">
                                </th>
                                <th>Sản phẩm</th>
                                <th id="bld-col2-header" style="width:140px">Số lượng</th>
                                <th style="width:40px"></th>
                            </tr>
                        </thead>
                        <tbody id="bld-items-body"></tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="padding:8px 5px;">
                                    <a class="bld-add-row" id="bld-add-link">Thêm sản phẩm</a>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    </div>
    <!-- Footer -->
    <div class="bld-modal-footer">
        <button class="bld-btn-primary" id="bld-btn-print">In bằng pdf</button>
        <button class="bld-btn-default" id="bld-btn-cancel">Đóng</button>
    </div>
</div>`;

        document.body.appendChild(overlay);

        // DOM refs
        const modal = overlay.querySelector('.bld-modal');
        const btnPrint = overlay.querySelector('#bld-btn-print');
        const btnCancel = overlay.querySelector('#bld-btn-cancel');

        // Render table
        function renderTableRows() {
            const tbody = overlay.querySelector('#bld-items-body');
            const col2Header = overlay.querySelector('#bld-col2-header');
            const addLink = overlay.querySelector('#bld-add-link');
            const checkCol = overlay.querySelector('#bld-col-check');
            tbody.innerHTML = '';

            if (activeTab === 0) {
                // Tab: Sản phẩm có mã vạch — Check | SP | Số lượng | Xoá
                col2Header.textContent = 'Số lượng';
                col2Header.style.width = '140px';
                addLink.textContent = 'Thêm sản phẩm';
                if (checkCol) checkCol.style.display = '';
                withBarcode.forEach((item) => {
                    const origIdx = items.indexOf(item);
                    const variantText = item.variant ? ` (${item.variant})` : '';
                    // Hàng chưa sync TPOS chỉ được đánh dấu khi TPOS mode bật
                    // VÀ pre-fetch đã xong (tposCodeSet ≠ null). Khi TPOS off,
                    // tất cả đều in được qua HTML local → không cần badge.
                    const unsync = useTposTemplate && tposCodeSet && !tposCodeSet.has(item.code);
                    const badge = unsync
                        ? '<span class="bld-unsync-badge" title="Không tìm thấy trên TPOS — sẽ KHÔNG in được qua mẫu TPOS. Bỏ tick hoặc tắt &quot;In theo mẫu TPOS&quot; để in HTML local.">Không có trên TPOS</span>'
                        : '';
                    const tr = document.createElement('tr');
                    if (unsync) tr.className = 'bld-row-unsync';
                    tr.innerHTML = `
                        <td class="bld-check-cell"><input type="checkbox" class="bld-select" data-index="${origIdx}" ${item.selected ? 'checked' : ''}></td>
                        <td>${escapeHtml(item.code ? `[${item.code}] ` : '')}${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}${badge}</td>
                        <td><input type="number" class="bld-qty-input bld-qty" data-index="${origIdx}" value="${item.quantity}" min="0" max="999"></td>
                        <td><button class="bld-delete-btn bld-remove" data-index="${origIdx}"><span>🗑</span></button></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (withBarcode.length === 0) {
                    tbody.innerHTML =
                        '<tr><td colspan="4" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
                updateSelectAllState();
            } else {
                // Tab: Sản phẩm không có mã vạch — SP | Mã vạch (input) | (empty)
                col2Header.textContent = 'Mã vạch';
                col2Header.style.width = '200px';
                addLink.textContent = 'Cập nhật mã vạch';
                if (checkCol) checkCol.style.display = 'none';
                withoutBarcode.forEach((item) => {
                    const origIdx = items.indexOf(item);
                    const variantText = item.variant ? ` (${item.variant})` : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}</td>
                        <td><input type="text" class="bld-barcode-input bld-barcode-edit" data-index="${origIdx}" value="${escapeHtml(item.code)}" placeholder="Nhập mã vạch..."></td>
                        <td></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (withoutBarcode.length === 0) {
                    tbody.innerHTML =
                        '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
            }
        }

        // Đồng bộ trạng thái checkbox "Chọn tất cả" theo các row hiện tại:
        // - all checked → checked
        // - mixed → indeterminate
        // - all unchecked → unchecked
        function updateSelectAllState() {
            const master = overlay.querySelector('#bld-select-all');
            if (!master || activeTab !== 0) return;
            const rows = withBarcode;
            if (rows.length === 0) {
                master.checked = false;
                master.indeterminate = false;
                return;
            }
            const selectedCount = rows.filter((it) => it.selected).length;
            master.checked = selectedCount === rows.length;
            master.indeterminate = selectedCount > 0 && selectedCount < rows.length;
        }

        // Kiểm tra trực tiếp trên TPOS các mã đang bị flag "Chưa sync TPOS"
        // (nghĩa là local web_warehouse không có row hoặc row có tpos_product_id=null).
        // Query OData /Product?$filter=DefaultCode eq 'X' or DefaultCode eq 'Y' …
        // Nếu TPOS có sản phẩm → add code vào tposCodeSet + cache full row data
        // vào liveTposCache để printViaTPOS dùng được mà không cần phụ thuộc local DB.
        async function recheckTposForMissingCodes() {
            if (recheckInFlight) return;
            const checked = items.filter((i) => i.selected && i.code && i.quantity > 0);
            const missingItems = checked.filter((it) => !tposCodeSet || !tposCodeSet.has(it.code));
            if (missingItems.length === 0) return;

            recheckInFlight = true;
            updateTposWarning();
            const setStatus = (text, cls = '') => {
                const el = overlay.querySelector('#bld-recheck-result');
                if (!el) return;
                el.className = 'bld-recheck-result' + (cls ? ' ' + cls : '');
                if (text.startsWith('<')) el.innerHTML = text;
                else el.textContent = text;
            };

            try {
                if (!window.TPOSClient?.authenticatedFetch) {
                    throw new Error('TPOSClient chưa sẵn sàng');
                }
                const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
                const tposFetch = window.TPOSClient.authenticatedFetch.bind(window.TPOSClient);

                const missingCodes = [...new Set(missingItems.map((it) => it.code))];
                const safeCodes = missingCodes.filter((c) => /^[A-Za-z0-9_-]+$/.test(c));
                const foundCodes = [];

                // ---------- STRATEGY A: Direct variant DefaultCode lookup ----------
                // Works khi TPOS variant có DefaultCode trùng mã n2store (vd MM139A2
                // — variant của template MM139 — vẫn có DefaultCode riêng).
                // QUAN TRỌNG:
                //   - KHÔNG dùng $select — combined với filter có nhiều `or`
                //     gây 502 Bad Gateway từ TPOS origin (test 2026-05-14).
                //   - BATCH 20 mã/query — filter với >20 `or DefaultCode eq ...`
                //     làm TPOS OData trả 400 Bad Request (test 2026-05-15, fail
                //     ở N=25, ok ở N=20). Trước đó 1-query-all với 38 codes
                //     khiến toàn bộ recheck báo "0 found" → 38/38 missing.
                if (safeCodes.length > 0) {
                    const BATCH_SIZE = 20;
                    const batches = [];
                    for (let i = 0; i < safeCodes.length; i += BATCH_SIZE) {
                        batches.push(safeCodes.slice(i, i + BATCH_SIZE));
                    }
                    setStatus(
                        `Đang tra trực tiếp TPOS Product cho ${safeCodes.length} mã (${batches.length} batch × ≤${BATCH_SIZE})…`
                    );
                    for (let bi = 0; bi < batches.length; bi++) {
                        const batch = batches[bi];
                        const filter = batch.map((c) => `DefaultCode eq '${c}'`).join(' or ');
                        const url = `${PROXY}/api/odata/Product?$filter=${encodeURIComponent(filter)}&$top=${batch.length}`;
                        console.log(
                            `[Barcode][Recheck] Strategy A batch ${bi + 1}/${batches.length}:`,
                            { codes: batch, url }
                        );
                        try {
                            const resp = await tposFetch(url, {
                                headers: { Accept: 'application/json' },
                            });
                            if (!resp.ok) {
                                console.warn(
                                    `[Barcode][Recheck] Strategy A batch ${bi + 1} HTTP ${resp.status}`
                                );
                                continue;
                            }
                            const data = await resp.json();
                            const found = Array.isArray(data.value) ? data.value : [];
                            console.log(
                                `[Barcode][Recheck] Strategy A batch ${bi + 1} returned ${found.length}/${batch.length}:`,
                                found.map((p) => ({
                                    code: p.DefaultCode,
                                    id: p.Id,
                                    tmplId: p.ProductTmplId,
                                }))
                            );
                            for (const p of found) {
                                if (!p?.Id || !p?.DefaultCode) continue;
                                cacheLiveProduct(p);
                                foundCodes.push(p.DefaultCode);
                            }
                        } catch (err) {
                            console.warn(
                                `[Barcode][Recheck] Strategy A batch ${bi + 1} threw:`,
                                err?.message || err
                            );
                        }
                    }
                }

                // ---------- STRATEGY B: ProductTemplate by parentCode + variant match ----------
                // Cho các mã variants không có DefaultCode riêng trên TPOS.
                // Query ProductTemplate by parentCode (item.parentProductCode), expand
                // ProductVariants, rồi match từng variant theo DefaultCode / Barcode /
                // tên thuộc tính so với item.variant.
                const stillMissing = missingItems.filter((it) => !foundCodes.includes(it.code));
                if (stillMissing.length > 0) {
                    const byParent = new Map();
                    for (const it of stillMissing) {
                        const parent = (it.parentCode || it.code || '').trim();
                        if (!parent || !/^[A-Za-z0-9_-]+$/.test(parent)) continue;
                        if (!byParent.has(parent)) byParent.set(parent, []);
                        byParent.get(parent).push(it);
                    }

                    if (byParent.size > 0) {
                        setStatus(
                            `Strategy A xong (${foundCodes.length}/${safeCodes.length}). Đang tra ProductTemplate cho ${byParent.size} mã cha…`
                        );
                    }

                    for (const [parentCode, parentItems] of byParent.entries()) {
                        try {
                            // 2-step query — combined $filter + $expand=ProductVariants
                            // gây 502 từ TPOS origin (verified 2026-05-14). Tách:
                            //   1) ProductTemplate?$filter=DefaultCode eq '<parent>'&$top=1 → Id
                            //   2) ProductTemplate(<id>)?$expand=ProductVariants(...)  → variants
                            const tmplFilter = `DefaultCode eq '${parentCode}'`;
                            const findUrl = `${PROXY}/api/odata/ProductTemplate?$filter=${encodeURIComponent(tmplFilter)}&$top=1`;
                            console.log(
                                `[Barcode][Recheck] Strategy B step1 (find tmplId) for "${parentCode}":`,
                                findUrl
                            );
                            const findResp = await tposFetch(findUrl, {
                                headers: { Accept: 'application/json' },
                            });
                            if (!findResp.ok) {
                                console.warn(
                                    `[Barcode][Recheck] Template find HTTP ${findResp.status} for "${parentCode}"`
                                );
                                continue;
                            }
                            const findData = await findResp.json();
                            const tmplHeader = findData.value?.[0];
                            if (!tmplHeader?.Id) {
                                console.warn(
                                    `[Barcode][Recheck] Template "${parentCode}" not found on TPOS`
                                );
                                continue;
                            }
                            // Step 2: expand variants by template ID
                            const tmplUrl = `${PROXY}/api/odata/ProductTemplate(${tmplHeader.Id})?$expand=${encodeURIComponent('ProductVariants($expand=AttributeValues)')}`;
                            console.log(
                                `[Barcode][Recheck] Strategy B step2 (expand variants) tmplId=${tmplHeader.Id}:`,
                                tmplUrl
                            );
                            const tmplResp = await tposFetch(tmplUrl, {
                                headers: { Accept: 'application/json' },
                            });
                            if (!tmplResp.ok) {
                                console.warn(
                                    `[Barcode][Recheck] Template expand HTTP ${tmplResp.status} for "${parentCode}"`
                                );
                                continue;
                            }
                            const tmpl = await tmplResp.json();
                            const variants = tmpl?.ProductVariants || [];
                            console.log(`[Barcode][Recheck] Strategy B template "${parentCode}":`, {
                                tmplId: tmpl?.Id,
                                variantsCount: variants.length,
                                variantCodes: variants.map((v) => v.DefaultCode),
                            });
                            if (!tmpl?.Id || variants.length === 0) continue;

                            for (const it of parentItems) {
                                const v = matchTposVariant(it, variants);
                                if (!v) {
                                    console.warn(
                                        `[Barcode][Recheck] No variant match for "${it.code}" under template "${parentCode}". Variants:`,
                                        variants.map((vv) => ({
                                            code: vv.DefaultCode,
                                            name: vv.NameGet,
                                        }))
                                    );
                                    continue;
                                }
                                console.log(
                                    `[Barcode][Recheck] ✓ Matched "${it.code}" → variant Id=${v.Id} DefaultCode=${v.DefaultCode} NameGet=${v.NameGet}`
                                );
                                cacheLiveProduct({
                                    Id: v.Id,
                                    // QUAN TRỌNG: dùng mã n2store làm DefaultCode để
                                    // codeMap[code] trong printViaTPOS hit. Variant
                                    // TPOS có thể có DefaultCode rỗng hoặc khác.
                                    DefaultCode: it.code,
                                    NameTemplate: tmpl.Name || tmpl.NameGet,
                                    NameGet: v.NameGet || tmpl.NameGet,
                                    Barcode: v.Barcode || v.DefaultCode || it.code,
                                    ProductTmplId: tmpl.Id,
                                    PriceVariant: v.PriceVariant || tmpl.ListPrice || 0,
                                    StandardPrice: v.StandardPrice || tmpl.StandardPrice || 0,
                                    PurchasePrice: v.PurchasePrice || tmpl.PurchasePrice || 0,
                                    UOMName: v.UOMName || tmpl.UOMName || 'Cái',
                                    ImageUrl: v.ImageUrl || tmpl.ImageUrl || null,
                                });
                                foundCodes.push(it.code);
                            }
                        } catch (e) {
                            console.warn(
                                `[Barcode] Template lookup failed for ${parentCode}:`,
                                e.message
                            );
                        }
                    }
                }

                if (foundCodes.length > 0) {
                    if (!tposCodeSet) tposCodeSet = new Set();
                    foundCodes.forEach((c) => tposCodeSet.add(c));
                }
                const notFound = missingCodes.filter((c) => !foundCodes.includes(c));

                renderTableRows();
                updateCount();

                if (foundCodes.length > 0 && notFound.length === 0) {
                    setStatus(
                        `✓ Tất cả ${foundCodes.length} mã đã có trên TPOS — đã sẵn sàng in.`,
                        'ok'
                    );
                } else if (foundCodes.length > 0) {
                    setStatus(
                        `✓ ${foundCodes.length} mã có trên TPOS: <strong>${foundCodes.join(', ')}</strong>. ✗ ${notFound.length} mã không tìm thấy (cả Product lẫn ProductTemplate): <strong>${notFound.join(', ')}</strong> — cần tạo SP trên TPOS hoặc bỏ tick.`,
                        'ok'
                    );
                } else {
                    setStatus(
                        `✗ Không tìm thấy mã nào trên TPOS (đã thử cả mã cha): ${notFound.join(', ')}. Cần tạo SP trên TPOS trước.`,
                        'err'
                    );
                }
            } catch (err) {
                console.warn('[Barcode] Recheck TPOS failed:', err);
                setStatus(`Lỗi kiểm tra TPOS: ${err.message || err}`, 'err');
            } finally {
                recheckInFlight = false;
                updateTposWarning();
            }
        }

        // Cache TPOS Product/Variant data vào liveTposCache theo shape của
        // web_warehouse row (để printViaTPOS dùng đồng nhất với batch-lookup).
        function cacheLiveProduct(p) {
            const code = p.DefaultCode;
            liveTposCache.set(code, {
                product_code: code,
                product_name: p.NameTemplate || p.NameGet || code,
                name_get: p.NameGet || `[${code}] ${p.NameTemplate || ''}`.trim(),
                barcode: p.Barcode || code,
                uom_name: p.UOMName || 'Cái',
                image_url: p.ImageUrl || null,
                selling_price: p.PriceVariant || 0,
                standard_price: p.StandardPrice || 0,
                purchase_price: p.PurchasePrice || 0,
                tpos_product_id: p.Id,
                tpos_template_id: p.ProductTmplId || 0,
            });
        }

        // Match 1 item missing với mảng variants từ ProductTemplate.ProductVariants.
        // Ưu tiên: DefaultCode → Barcode → tên thuộc tính so với item.variant →
        // single-variant fallback. Trả về variant matched hoặc null.
        function matchTposVariant(it, variants) {
            const code = it.code;
            let m = variants.find((v) => v.DefaultCode && v.DefaultCode === code);
            if (m) return m;
            m = variants.find((v) => v.Barcode && v.Barcode === code);
            if (m) return m;
            const variantText = stripDiacritics((it.variant || it.name || '').toLowerCase());
            if (variantText) {
                m = variants.find((v) => {
                    const nameGet = stripDiacritics((v.NameGet || '').toLowerCase());
                    if (nameGet && nameGet.includes(variantText)) return true;
                    const attrs = (v.AttributeValues || [])
                        .map((a) => stripDiacritics((a.Name || a.NameGet || '').toLowerCase()))
                        .filter(Boolean);
                    return attrs.length > 0 && attrs.every((a) => variantText.includes(a));
                });
                if (m) return m;
            }
            if (variants.length === 1) return variants[0];
            return null;
        }

        function stripDiacritics(s) {
            return (s || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D');
        }

        renderTableRows();

        // Update print button count + TPOS warning visibility
        function updateCount() {
            // Chỉ tính items đã được user tick + có code + qty > 0
            const checked = items.filter((i) => i.selected && i.code && i.quantity > 0);
            // Khi TPOS mode + đã pre-fetched → chỉ đếm items có trong TPOS warehouse
            const printable =
                useTposTemplate && tposCodeSet
                    ? checked.filter((it) => tposCodeSet.has(it.code))
                    : checked;
            const totalLabels = printable.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = totalLabels > 0 ? `In bằng pdf (${totalLabels})` : 'In bằng pdf';
            btnPrint.disabled = totalLabels === 0;
            updateTposWarning();
        }
        function updateTposWarning() {
            const el = overlay.querySelector('#bld-warning-tpos');
            if (!el) return;
            // Chỉ hiển thị khi: TPOS mode + đã pre-fetched + có items selected mà thiếu sync
            if (!useTposTemplate || !tposCodeSet) {
                el.style.display = 'none';
                return;
            }
            const checked = items.filter((i) => i.selected && i.code && i.quantity > 0);
            const missing = checked.filter((it) => !tposCodeSet.has(it.code));
            if (missing.length === 0) {
                el.style.display = 'none';
                return;
            }
            const missingCodes = [...new Set(missing.map((it) => it.code))];
            const list =
                missingCodes.slice(0, 8).join(', ') +
                (missingCodes.length > 8 ? `, +${missingCodes.length - 8} mã khác` : '');
            el.style.display = '';
            el.innerHTML = `<span class="bld-warning-icon">⚠</span> ${missing.length}/${checked.length} sản phẩm KHÔNG tìm thấy trên TPOS, sẽ KHÔNG in được qua mẫu TPOS: <strong>${list}</strong>. Tắt "In theo mẫu TPOS" để in HTML local, bỏ tick, hoặc bấm nút bên để kiểm tra lại.
                <button class="bld-recheck-btn" id="bld-recheck-tpos" ${recheckInFlight ? 'disabled' : ''}>${recheckInFlight ? 'Đang kiểm…' : '🔄 Kiểm lại TPOS'}</button>
                <span class="bld-recheck-result" id="bld-recheck-result"></span>`;
        }
        updateCount();

        // Pre-fetch: query TRỰC TIẾP TPOS (không qua local web_warehouse) để
        // populate tposCodeSet + liveTposCache. Strategy 2-stage:
        //   A) Product?$filter=DefaultCode eq … cho từng mã item
        //   B) ProductTemplate?$filter=DefaultCode eq <parent>&$expand=ProductVariants
        //      cho các mã còn miss (variants không có DefaultCode riêng)
        // Items có code đều set tposCodeSet = empty Set ngay → renderTableRows
        // hiển thị badge "Đang kiểm TPOS" loading. Khi recheck xong update.
        (async function preFetchTpos() {
            const checkedItems = items.filter((it) => it.code && it.quantity > 0);
            if (checkedItems.length === 0) return;
            if (!window.TPOSClient?.authenticatedFetch) {
                console.warn('[Barcode] TPOSClient chưa sẵn sàng — bỏ qua pre-fetch TPOS');
                return;
            }
            // Khởi tạo tposCodeSet rỗng — sẽ populate khi recheck xong.
            tposCodeSet = new Set();
            renderTableRows();
            updateCount();
            try {
                await recheckTposForMissingCodes();
            } catch (err) {
                console.warn('[Barcode] TPOS pre-fetch failed:', err);
            }
        })();

        // Tab switching
        overlay.querySelector('#bld-tab-bar').addEventListener('click', (e) => {
            const a = e.target.closest('a[data-tab]');
            if (!a) return;
            e.preventDefault();
            activeTab = parseInt(a.dataset.tab);
            overlay.querySelectorAll('#bld-tab-bar li').forEach((li, i) => {
                li.className = i === activeTab ? 'active' : '';
            });
            renderTableRows();
        });

        // "Kiểm lại TPOS" — query TPOS OData trực tiếp cho các mã đang bị flag
        // "Chưa sync TPOS" (theo local web_warehouse). Đây là escape hatch khi
        // local sync bị thiếu nhưng TPOS thực sự có sản phẩm.
        overlay.addEventListener('click', async (e) => {
            const btn = e.target.closest('#bld-recheck-tpos');
            if (!btn || recheckInFlight) return;
            await recheckTposForMissingCodes();
        });

        // Settings events
        overlay.querySelector('#bld-paper').addEventListener('change', (e) => {
            selectedPaper = PAPERS[parseInt(e.target.value)];
        });
        overlay.querySelector('#bld-show-price').addEventListener('change', (e) => {
            showPrice = e.target.checked;
        });
        overlay.querySelector('#bld-show-bold').addEventListener('change', (e) => {
            showBold = e.target.checked;
        });
        overlay.querySelector('#bld-show-name').addEventListener('change', (e) => {
            showProductName = e.target.checked;
        });
        overlay.querySelector('#bld-show-currency').addEventListener('change', (e) => {
            showCurrency = e.target.checked;
        });
        overlay.querySelector('#bld-hide-barcode').addEventListener('change', (e) => {
            hideBarcode = e.target.checked;
        });
        overlay.querySelector('#bld-use-tpos').addEventListener('change', (e) => {
            useTposTemplate = e.target.checked;
            // Re-render để show/hide badge "Chưa sync TPOS" theo trạng thái toggle.
            renderTableRows();
            updateCount();
        });

        // Master "Chọn tất cả" — bulk toggle tất cả row trong tab "có mã vạch"
        overlay.querySelector('#bld-select-all').addEventListener('change', (e) => {
            const checked = e.target.checked;
            withBarcode.forEach((it) => {
                it.selected = checked;
            });
            // Refresh checkbox states trong row mà không re-render full table.
            overlay.querySelectorAll('.bld-select').forEach((cb) => {
                cb.checked = checked;
            });
            e.target.indeterminate = false;
            updateCount();
        });

        // Quick apply qty
        overlay.querySelector('#bld-apply-qty').addEventListener('click', () => {
            const qty = Math.max(1, parseInt(overlay.querySelector('#bld-quick-qty').value) || 1);
            items.forEach((it) => {
                it.quantity = qty;
            });
            renderTableRows();
            updateCount();
        });

        // Qty change, remove, barcode edit, row-select trong table
        overlay.querySelector('.bld-modal-body').addEventListener('change', (e) => {
            if (e.target.classList.contains('bld-qty')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].quantity = Math.max(0, parseInt(e.target.value) || 0);
                updateCount();
            }
            if (e.target.classList.contains('bld-barcode-edit')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].code = e.target.value.trim();
            }
            if (e.target.classList.contains('bld-select')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].selected = e.target.checked;
                updateSelectAllState();
                updateCount();
            }
        });
        overlay.querySelector('.bld-modal-body').addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.bld-remove');
            if (removeBtn) {
                const idx = parseInt(removeBtn.dataset.index);
                items.splice(idx, 1);
                withBarcode.length = 0;
                withoutBarcode.length = 0;
                items.forEach((i) => {
                    (i.code ? withBarcode : withoutBarcode).push(i);
                });
                renderTableRows();
                updateCount();
            }
        });

        // "Cập nhật mã vạch" / "Thêm sản phẩm" link
        overlay.querySelector('#bld-add-link').addEventListener('click', (e) => {
            e.preventDefault();
            if (activeTab === 1) {
                // Update barcodes: move items with new barcodes to withBarcode
                withBarcode.length = 0;
                withoutBarcode.length = 0;
                items.forEach((i) => {
                    (i.code ? withBarcode : withoutBarcode).push(i);
                });
                activeTab = 0;
                overlay.querySelectorAll('#bld-tab-bar li').forEach((li, i) => {
                    li.className = i === 0 ? 'active' : '';
                });
                renderTableRows();
                updateCount();
            }
        });

        // Close
        const closeModal = () => {
            overlay.remove();
            overlay = null;
        };
        overlay.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Print: TPOS PDF (đẹp, cần đã sync) hoặc HTML local — chọn theo checkbox.
        // Chỉ in các item được user tick (it.selected) + có code + qty > 0.
        btnPrint.addEventListener('click', async () => {
            const printItems = items.filter((it) => it.selected && it.code && it.quantity > 0);
            if (!printItems.length) return;

            // Path 1: TPOS template — chỉ in items đã xác nhận trên TPOS qua
            // liveTposCache (đã được populate từ pre-fetch / recheck trực tiếp
            // tới TPOS OData). Item nào tposCodeSet không có → drop và báo user.
            if (useTposTemplate && window.TPOSClient?.authenticatedFetch) {
                btnPrint.disabled = true;
                btnPrint.textContent = 'Đang tạo PDF...';
                try {
                    // Nếu pre-fetch chưa xong (race rare) → chạy recheck sync ngay
                    if (!tposCodeSet || tposCodeSet.size === 0) {
                        await recheckTposForMissingCodes();
                    }
                    const matched = printItems.filter((it) => tposCodeSet.has(it.code));
                    if (matched.length === 0) {
                        window.notificationManager?.warning?.(
                            'Không có sản phẩm nào tìm thấy trên TPOS. Tắt "In theo mẫu TPOS" để in HTML local cho tất cả.'
                        );
                        return;
                    }
                    await printViaTPOS(
                        matched,
                        selectedPaper,
                        showPrice,
                        showBold,
                        showCurrency,
                        showProductName,
                        hideBarcode,
                        liveTposCache
                    );
                    closeModal();
                    return;
                } catch (err) {
                    console.warn('[Barcode] TPOS PDF failed, falling back to local:', err.message);
                    // Fall through to local print
                } finally {
                    btnPrint.disabled = false;
                    updateCount();
                }
            }

            // Path 2: Local HTML — toggle off OR TPOS path errored. In tất cả.
            closeModal();
            generateAndPrint(
                printItems,
                selectedPaper,
                selectedPrintType.id,
                showPrice,
                showBold,
                showProductName,
                showCurrency,
                hideBarcode
            );
        });
    }

    /**
     * Print via TPOS API — exact same PDF output as TPOS.
     * Flow: POST /odata/BarcodeProductLabel → GET /BarcodeProductLabel/PrintBarcodePDF?id=N
     *
     * Payload reverse-engineered from TPOS network capture.
     * TPOS requires Lines[].Product with at least Id, DefaultCode, Barcode, NameGet, ProductTmplId.
     * BarcodeTemplateIds must contain the ProductTmplIds (template, not variant).
     */
    async function printViaTPOS(
        items,
        paper,
        showPrice,
        showBold,
        showCurrency,
        showProductName,
        hideBarcode,
        liveTposCache
    ) {
        const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const tposFetch = window.TPOSClient.authenticatedFetch.bind(window.TPOSClient);

        const validItems = items.filter((it) => it.code);
        if (!validItems.length) throw new Error('No items with product code');

        // Data source: chỉ dùng liveTposCache (đã được populate từ TPOS OData
        // trực tiếp khi pre-fetch + recheck). KHÔNG dùng local web_warehouse
        // batch-lookup nữa — đảm bảo data luôn tươi từ TPOS, không phụ thuộc
        // local sync.
        const codeMap = new Map();
        if (liveTposCache && liveTposCache.size > 0) {
            for (const [code, row] of liveTposCache.entries()) {
                codeMap.set(code, row);
            }
        }
        if (codeMap.size === 0) {
            throw new Error(
                'Không có dữ liệu TPOS cho các mã đã chọn. Tắt "In theo mẫu TPOS" để in HTML local.'
            );
        }

        // Build Lines + BarcodeTemplateIds
        const tmplIdSet = new Set();
        const lines = [];
        for (const it of validItems) {
            const p = codeMap.get(it.code);
            if (!p || !p.tpos_product_id) continue;
            tmplIdSet.add(p.tpos_template_id);
            lines.push({
                Id: 0,
                ProductId: p.tpos_product_id,
                ProductTmplId: 0,
                Quantity: it.quantity,
                Price: 0,
                Product: {
                    Id: p.tpos_product_id,
                    EAN13: null,
                    DefaultCode: p.product_code,
                    NameTemplate: p.product_name,
                    NameNoSign: null,
                    ProductTmplId: p.tpos_template_id || 0,
                    UOMId: 1,
                    UOMName: p.uom_name || 'Cái',
                    UOMPOId: 0,
                    QtyAvailable: 0,
                    VirtualAvailable: 0,
                    OutgoingQty: null,
                    IncomingQty: null,
                    NameGet: p.name_get || `[${p.product_code}] ${p.product_name}`,
                    POSCategId: null,
                    Price: null,
                    Barcode: p.barcode || p.product_code,
                    Image: null,
                    ImageUrl: p.image_url || null,
                    Thumbnails: [],
                    PriceVariant: parseFloat(p.selling_price) || 0,
                    SaleOK: true,
                    PurchaseOK: true,
                    DisplayAttributeValues: null,
                    LstPrice: 0,
                    Active: true,
                    ListPrice: 0,
                    PurchasePrice: null,
                    DiscountSale: null,
                    DiscountPurchase: null,
                    StandardPrice:
                        parseFloat(p.standard_price) || parseFloat(p.purchase_price) || 0,
                    Weight: 0,
                    Volume: null,
                    OldPrice: null,
                    IsDiscount: false,
                    ProductTmplEnableAll: false,
                    Version: 0,
                    Description: null,
                    LastUpdated: null,
                    Type: 'product',
                    CategId: 0,
                    CostMethod: null,
                    InvoicePolicy: 'order',
                    Variant_TeamId: 0,
                    Name: p.product_name,
                    PropertyCostMethod: null,
                    PropertyValuation: null,
                    PurchaseMethod: 'receive',
                    SaleDelay: 0,
                    Tracking: null,
                    Valuation: null,
                    AvailableInPOS: true,
                    CompanyId: null,
                    IsCombo: null,
                    NameTemplateNoSign: null,
                    TaxesIds: [],
                    StockValue: null,
                    SaleValue: null,
                    PosSalesCount: null,
                    Factor: null,
                    CategName: null,
                    AmountTotal: null,
                    NameCombos: [],
                    RewardName: null,
                    Product_UOMId: null,
                    Tags: null,
                    DateCreated: null,
                    InitInventory: null,
                    OrderTag: null,
                    StringExtraProperties: null,
                    CreatedById: null,
                    TaxAmount: null,
                    YearOfManufacture: null,
                    Error: null,
                },
            });
        }

        const tmplIds = [...tmplIdSet].filter(Boolean);
        if (!tmplIds.length || !lines.length) throw new Error('No valid products with TPOS IDs');

        // Step 2: Build payload (exact TPOS format from network capture)
        const companyId = window.ShopConfig?.getConfig()?.CompanyId || 1;
        const whMap = {
            1: {
                Id: 1,
                Code: 'WH',
                Name: 'Nhi Judy Store',
                CompanyId: 0,
                LocationId: 0,
                NameGet: '[WH] Nhi Judy Store',
                CompanyName: null,
                LocationActive: true,
            },
            2: {
                Id: 2,
                Code: 'WH2',
                Name: 'Shop NJD',
                CompanyId: 0,
                LocationId: 0,
                NameGet: '[WH2] Shop NJD',
                CompanyName: null,
                LocationActive: true,
            },
        };

        const payload = {
            '@odata.context':
                'http://tomato.tpos.vn/odata/$metadata#BarcodeProductLabel(Warehouse())/$entity',
            Id: 0,
            PaperId: paper.id,
            PriceListId: 1,
            ShowCurrency: showCurrency,
            ShowBold: showBold,
            ShowPrice: showPrice,
            ShowProductName: showProductName,
            IsInventory: null,
            ShowCompany: null,
            BarcodeTemplateIds: tmplIds,
            FastPurchaseOrderId: null,
            IsHideBarcode: hideBarcode || null,
            ExtraProperty: null,
            Warehouse: whMap[companyId] || whMap[1],
            PriceList: {
                Id: 1,
                Name: 'Bảng giá mặc định',
                CurrencyId: 1,
                CurrencyName: 'VND',
                Active: true,
                CompanyId: null,
                PartnerCateName: null,
                Sequence: 1,
                DateStart: null,
                DateEnd: null,
                CreatedById: null,
            },
            Paper: {
                Id: paper.id,
                Name: paper.name,
                SheetWidth: paper.sheetW,
                SheetHeight: paper.sheetH,
                LabelWidth: paper.labelW,
                LabelHeight: paper.labelH,
                LabelsPerSheet: paper.cols,
                TopMargin: paper.topMargin,
                LeftMargin: paper.leftMargin,
                BottomMargin: paper.bottomMargin,
                RightMargin: paper.rightMargin,
                HSpacing: null,
                VSpacing: null,
                TypePrint: 'Default',
                FontSize: paper.fontSize,
                TypePrintText: null,
                LabelsPerRow: 3,
            },
            Lines: lines,
        };

        console.log('[Barcode] TPOS payload:', { items: lines.length, tmplIds, paperId: paper.id });

        // Step 3: POST to TPOS
        const saveResp = await tposFetch(`${PROXY}/api/odata/BarcodeProductLabel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify(payload),
        });
        const saveData = await saveResp.json();
        if (!saveData.Id) {
            console.error('[Barcode] TPOS save failed:', saveData);
            throw new Error(saveData?.error?.message || 'TPOS save failed');
        }
        console.log('[Barcode] TPOS label saved, Id:', saveData.Id);

        // Step 4: GET PDF
        const pdfResp = await tposFetch(
            `${PROXY}/api/BarcodeProductLabel/PrintBarcodePDF?id=${saveData.Id}`
        );
        if (!pdfResp.ok) throw new Error('PDF generation failed: ' + pdfResp.status);

        const pdfBlob = await pdfResp.blob();
        window.open(
            URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' })),
            '_blank'
        );
        console.log('[Barcode] TPOS PDF opened, size:', pdfBlob.size);
    }

    function generateAndPrint(
        items,
        paper,
        printType,
        showPrice,
        showBold,
        showProductName,
        showCurrency,
        hideBarcode
    ) {
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
        const html = buildLabelHTML(
            labels,
            paper,
            printType,
            showPrice,
            showBold,
            showProductName,
            showCurrency,
            hideBarcode
        );
        showPrintOverlay(html);
    }

    /**
     * Build label HTML matching TPOS exactly:
     * - Font: Arial (TPOS default)
     * - CSS from /Content/print_barcode.css
     * - Dynamic styles from BarcodeProducLabelPrintController
     * - Barcode: JsBarcode CODE128 (instead of TPOS server /Web/Barcode)
     */
    function buildLabelHTML(
        labels,
        paper,
        printType,
        showPrice,
        showBold,
        showProductName,
        showCurrency,
        hideBarcode
    ) {
        const { sheetW, sheetH, labelW, labelH, cols, fontSize } = paper;

        // TPOS style_label() only sets padding/margin when value is not null
        const fs = fontSize || 9;
        const lineH = fs + 1; // TPOS: FontSize * 1 + 1
        const nameMaxH = fs * 2; // TPOS: FontSize * 2

        // Build style_label() exactly like TPOS controller
        // Only include properties when not null (TPOS skips null values)
        let labelStyleParts = [
            `width:${labelW}mm`,
            `height:${labelH}mm`,
            `overflow:hidden`,
            `font-size:${fs}px`,
            `line-height:${lineH}px`,
            `text-align:center`,
            `margin-top:1px`,
        ];
        if (paper.topMargin != null) labelStyleParts.push(`padding-top:${paper.topMargin}mm`);
        if (paper.leftMargin != null) labelStyleParts.push(`padding-left:${paper.leftMargin}mm`);
        if (paper.bottomMargin != null)
            labelStyleParts.push(`padding-bottom:${paper.bottomMargin}mm`);
        if (paper.rightMargin != null) labelStyleParts.push(`padding-right:${paper.rightMargin}mm`);
        if (paper.hSpacing != null) labelStyleParts.push(`margin-right:${paper.hSpacing}mm`);
        if (paper.vSpacing != null) labelStyleParts.push(`margin-bottom:${paper.vSpacing}mm`);

        // TPOS style_name
        const nameStyle = `max-height:${nameMaxH}px;overflow:hidden;margin-bottom:2px;`;

        // Group labels into sheets (cols labels per sheet)
        const sheets = [];
        for (let i = 0; i < labels.length; i += cols) {
            sheets.push(labels.slice(i, i + cols));
        }

        const bTag = showBold ? 'strong' : 'span';

        let sheetsHTML = '';
        for (const sheet of sheets) {
            // TPOS: ng-style="data.style_sheet()" → {width: SheetWidth+"mm", height: SheetHeight+"mm"}
            sheetsHTML += `<div class="barcode-sheet" style="width:${sheetW}mm;height:${sheetH}mm;">`;
            for (const label of sheet) {
                const displayPrice = formatPrice(label.price);
                const currencyStr = showCurrency ? ' đ' : '';

                // TPOS barcode image: /Web/Barcode?type=Code 128&value={code}&width=600&height=100
                const barcodeImg = `<img src="https://gc-statics.tpos.vn/Web/Barcode?type=Code%20128&value=${encodeURIComponent(label.code)}&width=600&height=100" onerror="this.style.display='none'" />`;

                // TPOS: ng-style="data.style_label()"
                const labelStyle = labelStyleParts.join(';') + ';';

                if (printType === 'new') {
                    // PrintNew — 2-column table
                    sheetsHTML += `<div class="barcode_label" style="${labelStyle}"><table border="0" style="width:100%;height:100%;"><tr><td style="width:50%;text-align:center;vertical-align:middle"><div class="barcode-code">${escapeHtml(label.code)}</div>${showPrice ? `<div class="barcode-price">${displayPrice}${currencyStr}</div>` : ''}</td><td style="width:50%;text-align:center;vertical-align:middle"><div class="barcode-image">${!hideBarcode ? barcodeImg : ''}</div></td></tr></table></div>`;
                } else {
                    // Default — vertical: name → barcode → code → price (matching TPOS exactly)
                    // Structure from TPOS /BarcodeProductLabel/Print: <strong> tags, no class on code/price divs
                    sheetsHTML += `<div class="barcode_label" style="${labelStyle}">`;
                    if (showProductName) {
                        sheetsHTML += `<div class="barcode-pname" style="${nameStyle}"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>`;
                    }
                    if (!hideBarcode && label.code) {
                        sheetsHTML += `<div class="barcode-image">${barcodeImg}</div>`;
                    }
                    sheetsHTML += `<div><${bTag}>${escapeHtml(label.code)}</${bTag}></div>`;
                    if (showPrice) {
                        sheetsHTML += `<div><${bTag} class="barcode-price">${displayPrice}${currencyStr}</${bTag}></div>`;
                    }
                    sheetsHTML += `</div>`;
                }
            }
            sheetsHTML += '</div>';
        }

        // TPOS print iframe structure (exact):
        // <!doctype html><html><head>
        //   <link href="/Content/themes/angulr/bower_components/bootstrap/dist/css/bootstrap.css" /> (404 on tomato.tpos.vn)
        //   <link href="/Content/print_barcode.css" />
        // </head><body onload="printAndRemove();">{html}</body></html>
        //
        // We inline the CSS since we can't link to TPOS server.
        // CSS below is the COMPLETE /Content/print_barcode.css from tomato.tpos.vn (verified 2026-04-13)
        return `<!doctype html>
<html>
<head>
<style>
/*
 * Barcode label CSS — matched to TPOS /Content/print_barcode.css
 * Verified against: label-test.html (TPOS original structure)
 * Font: Arial (TPOS default), layout: float-based
 */
* { box-sizing: border-box; }
@page { size: ${sheetW}mm ${sheetH}mm; margin: 0 !important; }
html, body {
    margin: 0 !important;
    padding: 0 !important;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.barcode-sheet {
    width: ${sheetW}mm;
    height: ${sheetH}mm;
    page-break-after: always;
    overflow: hidden;
}
.barcode-sheet:last-child { page-break-after: auto; }

.barcode_label {
    box-sizing: border-box;
    text-align: center;
    float: left;
    display: flex;
    flex-flow: column;
    overflow: hidden;
}
.barcode_label div { flex: 1 auto; }

.barcode-pname {
    overflow: hidden;
}

.barcode-image img {
    width: 100%;
    height: 25px;
}

/* Screen preview only */
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
</body>
</html>`;
    }

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
                console.error('Print error:', e);
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

    function formatPrice(price) {
        const num = parseInt(price) || 0;
        return num.toLocaleString('de-DE');
    }

    function stripBrackets(str) {
        return (str || '').replace(/\[[^\]]*\]\s*/g, '').trim();
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    return { open };
})();
