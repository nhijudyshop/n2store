// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2ProductsPrint — MODAL / DIALOG module.
 * [SPLIT 2026-06-18] Tách từ web2-products-print.js. Module này: open (entry
 *   nội bộ), showSelectionModal (UI chọn SP + qty/paper/print-type controls),
 *   closeModal, generateAndPrint (pipeline QR → buildLabelHTML → in), và
 *   showPrintOverlay (iframe preview). Cross-module qua window.W2PP (load SAU
 *   utils + barcode + render). overlay state nằm ở W2PP._state.overlay.
 */
(function () {
    'use strict';

    const W2PP = (window.W2PP = window.W2PP || {});
    const {
        PAPERS,
        DEFAULT_PAPER_IDX,
        PRINT_TYPES,
        escapeHtml,
        stripBrackets,
        formatPrice,
        notify,
        _qrKey,
        genQrDataUrl,
        loadQrLib,
        buildLabelHTML,
        _markProductsPrinted,
    } = W2PP;

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
            // PER-UNIT (2026-06-28): mỗi tem 1 mã đơn vị + QR URL riêng (đã mint sẵn).
            // Thiếu units → hành vi cũ (lặp mã SP). units[i] khớp tem thứ i.
            units: Array.isArray(p.units) ? p.units : undefined,
            // STT KỆ (2026-06-30): fallback cấp SP (nếu caller in không qua units mà
            // muốn đóng dấu 1 STT chung). Ưu tiên units[i].orderStt khi có.
            stt: p.stt != null ? p.stt : null,
            selected: true,
        }));

        showSelectionModal(items);
    }

    function showSelectionModal(items) {
        if (W2PP._state.overlay) W2PP._state.overlay.remove();

        let selectedPaper = PAPERS[DEFAULT_PAPER_IDX];
        let selectedPrintType = PRINT_TYPES[0];
        let showPrice = true;
        let showBold = true;
        let showProductName = true;
        let showVariant = true;
        let showCurrency = false;
        let hideBarcode = false;

        const withBarcode = items.filter((i) => i.code);
        const withoutBarcode = items.filter((i) => !i.code);
        let activeTab = 0;

        const overlay = document.createElement('div');
        overlay.className = 'w2p-print-overlay';
        W2PP._state.overlay = overlay;

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
/* WEB2 primary — Zalo blue #0068ff (re-skin 2026-06-13) */
.w2p-print-btn-primary{display:inline-block;padding:5px 10px;font-size:12px;font-weight:400;color:#fff;background:#0068ff;border:1px solid #0068ff;border-radius:3px;cursor:pointer;line-height:1.5;margin-right:5px}
.w2p-print-btn-primary:hover{background:#6457a8;border-color:#6457a8}
.w2p-print-btn-primary:disabled{opacity:.65;cursor:not-allowed}
.w2p-print-btn-default{display:inline-block;padding:6px 12px;font-size:12px;font-weight:400;color:#333;background:#fff;border:1px solid #ccc;border-radius:3px;cursor:pointer;line-height:1.5}
.w2p-print-btn-default:hover{background:#e6e6e6;border-color:#adadad}
/* Tab content area */
.w2p-print-tab-content{padding:8px 0 0}
</style>
<div class="w2p-print-modal" role="dialog" aria-labelledby="w2pPrintTitle">
    <div class="w2p-print-header">
        <h4 id="w2pPrintTitle">In mã sản phẩm</h4>
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
                    <div class="w2p-print-checkbox-item">
                        <label for="w2p-show-variant">Hiển thị Biến thể</label>
                        <input type="checkbox" id="w2p-show-variant" checked>
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
        $('#w2p-show-variant').addEventListener('change', (e) => (showVariant = e.target.checked));
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
                showVariant,
                showCurrency,
                hideBarcode,
                symbology: 'qr',
            });
        });
    }

    function closeModal() {
        if (W2PP._state.overlay) {
            W2PP._state.overlay.remove();
            W2PP._state.overlay = null;
        }
    }

    async function generateAndPrint(items, paper, printType, opts) {
        _markProductsPrinted(items);
        const labels = [];
        for (const item of items) {
            // PER-UNIT (2026-06-28): nếu item.units có (mỗi món 1 mã riêng + QR URL),
            // mỗi tem lấy unitCode + qrUrl riêng. KHÔNG có units → hành vi cũ (lặp mã,
            // QR mã hóa chính chuỗi mã). units[i] khớp tem thứ i của vòng quantity.
            const units = Array.isArray(item.units) ? item.units : null;
            // CLAMP (2026-06-30): SP có units → in ĐÚNG units.length tem (mỗi tem 1 mã
            // đơn vị + QR riêng). KHÔNG để quantity > units.length sinh tem thừa rơi về
            // mã SP → trộn lẫn tem-unit và tem-mã-SP. SP không có units → giữ quantity.
            const count = units ? Math.min(item.quantity, units.length) : item.quantity;
            for (let i = 0; i < count; i++) {
                const u = units && units[i] ? units[i] : null;
                const unitCode = u ? u.unitCode || u.unit_code : null;
                const qrUrl = u ? u.qrUrl || u.qr_url : null;
                // STT KỆ per-tem = order_stt của unit (sau reconcile) → fallback stt cấp SP.
                const unitStt =
                    u && (u.orderStt ?? u.order_stt) != null ? (u.orderStt ?? u.order_stt) : null;
                labels.push({
                    name: stripBrackets(item.name),
                    code: unitCode || item.code, // chữ DƯỚI QR = mã đơn vị (vd KHOAODEN-017)
                    qrText: qrUrl || item.code, // NỘI DUNG QR = URL trace (per-unit) / mã SP (cũ)
                    price: item.price,
                    variant: item.variant || '',
                    stt: unitStt != null ? unitStt : item.stt != null ? item.stt : null,
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
                // P1 (2026-06-25): QR SẠCH — biến thể KHÔNG bake giữa QR nữa mà
                // thành DÒNG RIÊNG ở cột chữ (xem buildLabelHTML). QR sạch = đẹp hơn
                // + EC mặc định 'M' (module TO hơn 'H') = quét nhạy hơn trên tem 25mm.
                // Key vẫn theo code+variant để khớp render (nội dung QR = mã SP, giống
                // nhau giữa các biến thể nên render ra QR như nhau — vô hại).
                // Key qrMap = NỘI DUNG QR (l.qrText) — unique/đơn-vị (URL ?u=<id>) hoặc
                // mã SP (hành vi cũ). Mỗi nội dung QR render 1 lần.
                const seen = new Set();
                for (const l of labels) {
                    const qrText = l.qrText || l.code;
                    if (!qrText) continue;
                    if (seen.has(qrText)) continue;
                    seen.add(qrText);
                    if (window.Web2QR) {
                        try {
                            qrMap[qrText] = {
                                src: await window.Web2QR.toDataUrl(qrText, {
                                    style: 'rounded',
                                    margin: 2,
                                    pxPerCell: 12,
                                }),
                                baked: false,
                            };
                            continue;
                        } catch (e) {
                            /* fallthrough → davidshimjs */
                        }
                    }
                    qrMap[qrText] = { src: genQrDataUrl(qrText), baked: false };
                }
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

    // Export ra namespace shared (entry module wires window.Web2ProductsPrint).
    W2PP.open = open;
    W2PP.showSelectionModal = showSelectionModal;
    W2PP.closeModal = closeModal;
    W2PP.generateAndPrint = generateAndPrint;
    W2PP.showPrintOverlay = showPrintOverlay;
})();
