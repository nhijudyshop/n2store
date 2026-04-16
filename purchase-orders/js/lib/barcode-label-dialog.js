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
        { id: 7, name: '2 Tem (66×21mm)', sheetW: 66, sheetH: 21, labelW: 25, labelH: 21, cols: 2, fontSize: 6, topMargin: 0.5, leftMargin: 0.5, bottomMargin: 0.5, rightMargin: 0.5, hSpacing: 0, vSpacing: 0 },
        { id: 8, name: '1 Tem (65×22mm)', sheetW: 65, sheetH: 22, labelW: 27, labelH: 21, cols: 2, fontSize: 7, topMargin: 0, leftMargin: 0, bottomMargin: 0, rightMargin: 0, hSpacing: 0, vSpacing: 0 },
        { id: 9, name: 'Tem 35×22mm', sheetW: 70, sheetH: 22, labelW: 35, labelH: 22, cols: 2, fontSize: 8, topMargin: 0, leftMargin: 0, bottomMargin: 0, rightMargin: 0, hSpacing: 0, vSpacing: 0 }
    ];

    const PRINT_TYPES = [
        { id: 'default', name: 'Mặc định (dọc)' },
        { id: 'new', name: '2 cột (ngang)' }
    ];

    function open(order) {
        if (!order?.items?.length) return;

        const items = order.items.map((item, idx) => ({
            id: item.id || idx,
            name: item.productName || '',
            code: item.productCode || '',
            variant: item.variant || '',
            quantity: item.quantity || 1,
            price: item.sellingPrice || 0,
            purchasePrice: item.purchasePrice || 0,
            tposProductId: item.tposProductId || null,
            tposProductTmplId: item.tposProductTmplId || null,
            checked: true
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

        const withBarcode = items.filter(i => i.code);
        const withoutBarcode = items.filter(i => !i.code);
        let activeTab = 0; // 0 = có mã vạch, 1 = không có mã vạch

        overlay = document.createElement('div');
        overlay.className = 'bld-overlay';

        const warningHTML = withoutBarcode.length > 0
            ? `<div class="bld-warning"><span class="bld-warning-icon">⚠</span> Sản phẩm không có mã vạch sẽ không được in${withoutBarcode.length > 0 ? ': ' + withoutBarcode.map(i => stripBrackets(i.name)).join(', ') : ''}</div>`
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
                </div>
                ${warningHTML}
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
                                <th>Sản phẩm</th>
                                <th id="bld-col2-header" style="width:140px">Số lượng</th>
                                <th style="width:40px"></th>
                            </tr>
                        </thead>
                        <tbody id="bld-items-body"></tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" style="padding:8px 5px;">
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
            tbody.innerHTML = '';

            if (activeTab === 0) {
                // Tab: Sản phẩm có mã vạch — columns: Sản phẩm | Số lượng | delete
                col2Header.textContent = 'Số lượng';
                col2Header.style.width = '140px';
                addLink.textContent = 'Thêm sản phẩm';
                withBarcode.forEach((item) => {
                    const origIdx = items.indexOf(item);
                    const variantText = item.variant ? ` (${item.variant})` : '';
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${escapeHtml(item.code ? `[${item.code}] ` : '')}${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}</td>
                        <td><input type="number" class="bld-qty-input bld-qty" data-index="${origIdx}" value="${item.quantity}" min="0" max="999"></td>
                        <td><button class="bld-delete-btn bld-remove" data-index="${origIdx}"><span>🗑</span></button></td>
                    `;
                    tbody.appendChild(tr);
                });
                if (withBarcode.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
            } else {
                // Tab: Sản phẩm không có mã vạch — columns: Sản phẩm | Mã vạch (input) | (empty)
                col2Header.textContent = 'Mã vạch';
                col2Header.style.width = '200px';
                addLink.textContent = 'Cập nhật mã vạch';
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
                    tbody.innerHTML = '<tr><td colspan="3" style="padding:12px;text-align:center;color:#999;">Không có sản phẩm</td></tr>';
                }
            }
        }
        renderTableRows();

        // Update print button count
        function updateCount() {
            const checked = items.filter(i => i.code && i.quantity > 0);
            const totalLabels = checked.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = totalLabels > 0 ? `In bằng pdf (${totalLabels})` : 'In bằng pdf';
        }
        updateCount();

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

        // Settings events
        overlay.querySelector('#bld-paper').addEventListener('change', (e) => { selectedPaper = PAPERS[parseInt(e.target.value)]; });
        overlay.querySelector('#bld-show-price').addEventListener('change', (e) => { showPrice = e.target.checked; });
        overlay.querySelector('#bld-show-bold').addEventListener('change', (e) => { showBold = e.target.checked; });
        overlay.querySelector('#bld-show-name').addEventListener('change', (e) => { showProductName = e.target.checked; });
        overlay.querySelector('#bld-show-currency').addEventListener('change', (e) => { showCurrency = e.target.checked; });
        overlay.querySelector('#bld-hide-barcode').addEventListener('change', (e) => { hideBarcode = e.target.checked; });

        // Quick apply qty
        overlay.querySelector('#bld-apply-qty').addEventListener('click', () => {
            const qty = Math.max(1, parseInt(overlay.querySelector('#bld-quick-qty').value) || 1);
            items.forEach(it => { it.quantity = qty; });
            renderTableRows();
            updateCount();
        });

        // Qty change, remove, barcode edit in table
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
        });
        overlay.querySelector('.bld-modal-body').addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.bld-remove');
            if (removeBtn) {
                const idx = parseInt(removeBtn.dataset.index);
                items.splice(idx, 1);
                withBarcode.length = 0;
                withoutBarcode.length = 0;
                items.forEach(i => { (i.code ? withBarcode : withoutBarcode).push(i); });
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
                items.forEach(i => { (i.code ? withBarcode : withoutBarcode).push(i); });
                activeTab = 0;
                overlay.querySelectorAll('#bld-tab-bar li').forEach((li, i) => {
                    li.className = i === 0 ? 'active' : '';
                });
                renderTableRows();
                updateCount();
            }
        });

        // Close
        const closeModal = () => { overlay.remove(); overlay = null; };
        overlay.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        // Print via TPOS API
        btnPrint.addEventListener('click', async () => {
            const printItems = items.filter(it => it.code && it.quantity > 0);
            if (!printItems.length) return;

            const hasTposIds = printItems.some(it => it.tposProductId);

            if (hasTposIds && window.TPOSClient?.authenticatedFetch) {
                btnPrint.disabled = true;
                btnPrint.textContent = 'Đang tạo PDF...';
                try {
                    await printViaTPOS(printItems, selectedPaper, showPrice, showBold, showCurrency, showProductName, hideBarcode);
                    closeModal();
                    return;
                } catch (err) {
                    console.warn('[Barcode] TPOS PDF failed, falling back to local:', err.message);
                } finally {
                    btnPrint.disabled = false;
                    updateCount();
                }
            }

            // Fallback: local HTML print
            closeModal();
            generateAndPrint(printItems, selectedPaper, selectedPrintType.id, showPrice, showBold, showProductName, showCurrency, hideBarcode);
        });
    }

    /**
     * Print via TPOS API — exact same PDF output as TPOS.
     * Flow: POST /odata/BarcodeProductLabel (full payload) → GET /BarcodeProductLabel/PrintBarcodePDF?id=N → PDF
     * Payload matched from TPOS network capture (2026-04-15).
     */
    /**
     * Print via TPOS API — exact same PDF output as TPOS.
     * Flow: POST /odata/BarcodeProductLabel → GET /BarcodeProductLabel/PrintBarcodePDF?id=N
     *
     * Payload reverse-engineered from TPOS network capture.
     * TPOS requires Lines[].Product with at least Id, DefaultCode, Barcode, NameGet, ProductTmplId.
     * BarcodeTemplateIds must contain the ProductTmplIds (template, not variant).
     */
    async function printViaTPOS(items, paper, showPrice, showBold, showCurrency, showProductName, hideBarcode) {
        const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const tposFetch = window.TPOSClient.authenticatedFetch.bind(window.TPOSClient);

        const validItems = items.filter(it => it.tposProductId);
        if (!validItems.length) throw new Error('No items with TPOS product ID');

        // Lookup missing ProductTmplId from TPOS by DefaultCode
        const needTmpl = validItems.filter(it => !it.tposProductTmplId && it.code);
        if (needTmpl.length > 0) {
            const uniqueCodes = [...new Set(needTmpl.map(it => it.code))];
            const filter = uniqueCodes.map(c => `DefaultCode eq '${c}'`).join(' or ');
            try {
                const resp = await tposFetch(
                    `${PROXY}/api/odata/Product?$filter=${encodeURIComponent(filter)}&$top=${uniqueCodes.length}&$select=Id,DefaultCode,ProductTmplId`
                );
                const data = await resp.json();
                const tposProducts = data.value || [];
                const codeToTmpl = new Map();
                for (const p of tposProducts) {
                    if (p.DefaultCode && p.ProductTmplId) codeToTmpl.set(p.DefaultCode, p.ProductTmplId);
                }
                for (const it of validItems) {
                    if (!it.tposProductTmplId && codeToTmpl.has(it.code)) {
                        it.tposProductTmplId = codeToTmpl.get(it.code);
                    }
                }
                console.log(`[Barcode] Resolved ${codeToTmpl.size} ProductTmplIds from TPOS`);
            } catch (err) {
                console.warn('[Barcode] ProductTmplId lookup failed:', err.message);
            }
        }

        const tmplIds = [...new Set(validItems.map(it => it.tposProductTmplId).filter(Boolean))];
        if (tmplIds.length === 0) throw new Error('No ProductTmplIds found — cannot generate barcode PDF');

        // Warehouse per company
        const companyId = window.ShopConfig?.getConfig()?.CompanyId || 1;
        const whMap = {
            1: { Id: 1, Code: 'WH', Name: 'Nhi Judy Store', NameGet: '[WH] Nhi Judy Store' },
            2: { Id: 2, Code: 'WH2', Name: 'Shop NJD', NameGet: '[WH2] Shop NJD' }
        };

        // Build Lines with full Product object (matched from TPOS network capture)
        const lines = validItems.map(it => {
            const name = stripBrackets(it.name);
            return {
                Id: 0, ProductId: it.tposProductId, ProductTmplId: 0, Quantity: it.quantity, Price: 0,
                Product: {
                    Id: it.tposProductId, EAN13: null,
                    DefaultCode: it.code, NameTemplate: name, NameNoSign: null,
                    ProductTmplId: it.tposProductTmplId || 0,
                    UOMId: 1, UOMName: 'Cái', UOMPOId: 0,
                    QtyAvailable: 0, VirtualAvailable: 0, OutgoingQty: null, IncomingQty: null,
                    NameGet: `[${it.code}] ${name}`,
                    POSCategId: null, Price: null, Barcode: it.code,
                    Image: null, ImageUrl: null, Thumbnails: [],
                    PriceVariant: it.price || 0,
                    SaleOK: true, PurchaseOK: true,
                    DisplayAttributeValues: null,
                    LstPrice: 0, Active: true, ListPrice: 0,
                    PurchasePrice: null, DiscountSale: null, DiscountPurchase: null,
                    StandardPrice: it.price || 0,
                    Weight: 0, Volume: null, OldPrice: null, IsDiscount: false,
                    ProductTmplEnableAll: false, Version: 0, Description: null, LastUpdated: null,
                    Type: 'product', CategId: 0, CostMethod: null,
                    InvoicePolicy: 'order', Variant_TeamId: 0, Name: name,
                    PropertyCostMethod: null, PropertyValuation: null,
                    PurchaseMethod: 'receive', SaleDelay: 0, Tracking: null, Valuation: null,
                    AvailableInPOS: true, CompanyId: null, IsCombo: null,
                    NameTemplateNoSign: null, TaxesIds: [],
                    StockValue: null, SaleValue: null, PosSalesCount: null,
                    Factor: null, CategName: null, AmountTotal: null, NameCombos: [],
                    RewardName: null, Product_UOMId: null, Tags: null,
                    DateCreated: null, InitInventory: null, OrderTag: null,
                    StringExtraProperties: null, CreatedById: null,
                    TaxAmount: null, YearOfManufacture: null, Error: null
                }
            };
        });

        const payload = {
            '@odata.context': 'http://tomato.tpos.vn/odata/$metadata#BarcodeProductLabel(Warehouse())/$entity',
            Id: 0, PaperId: paper.id, PriceListId: 1,
            ShowCurrency: showCurrency, ShowBold: showBold, ShowPrice: showPrice, ShowProductName: showProductName,
            IsInventory: null, ShowCompany: null,
            BarcodeTemplateIds: tmplIds,
            FastPurchaseOrderId: null, IsHideBarcode: hideBarcode || null, ExtraProperty: null,
            Warehouse: { ...(whMap[companyId] || whMap[1]), CompanyId: 0, LocationId: 0, CompanyName: null, LocationActive: true },
            PriceList: { Id: 1, Name: 'Bảng giá mặc định', CurrencyId: 1, CurrencyName: 'VND', Active: true, CompanyId: null, PartnerCateName: null, Sequence: 1, DateStart: null, DateEnd: null, CreatedById: null },
            Paper: {
                Id: paper.id, Name: paper.name,
                SheetWidth: paper.sheetW, SheetHeight: paper.sheetH,
                LabelWidth: paper.labelW, LabelHeight: paper.labelH,
                LabelsPerSheet: paper.cols,
                TopMargin: paper.topMargin, LeftMargin: paper.leftMargin,
                BottomMargin: paper.bottomMargin, RightMargin: paper.rightMargin,
                HSpacing: null, VSpacing: null,
                TypePrint: 'Default', FontSize: paper.fontSize, TypePrintText: null, LabelsPerRow: 3
            },
            Lines: lines
        };

        console.log('[Barcode] TPOS payload:', { items: validItems.length, tmplIds, paperId: paper.id });

        const labelIds = [];

        // Attempt 1: all-in-one request
        const saveResp = await tposFetch(`${PROXY}/api/odata/BarcodeProductLabel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
            body: JSON.stringify(payload)
        });
        const saveData = await saveResp.json();
        if (saveData.Id) {
            labelIds.push(saveData.Id);
            console.log('[Barcode] All-in-one OK, Id:', saveData.Id);
        } else {
            // Attempt 2: per-template with retry
            console.warn('[Barcode] All-in-one failed, trying per-template...', saveData.error?.message);
            for (const tmplId of tmplIds) {
                const tmplItems = validItems.filter(it => it.tposProductTmplId === tmplId);
                const perTmplPayload = { ...payload, BarcodeTemplateIds: [tmplId], Lines: tmplItems.map(it => lines.find(l => l.ProductId === it.tposProductId)).filter(Boolean) };

                let success = false;
                for (let attempt = 0; attempt < 2 && !success; attempt++) {
                    try {
                        if (attempt > 0) await new Promise(r => setTimeout(r, 800));
                        const r = await tposFetch(`${PROXY}/api/odata/BarcodeProductLabel`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                            body: JSON.stringify(perTmplPayload)
                        });
                        const d = await r.json();
                        if (d.Id) {
                            labelIds.push(d.Id);
                            success = true;
                            console.log(`[Barcode] Template ${tmplId}: label ${d.Id} (${tmplItems.length} items)`);
                        }
                    } catch (e) {
                        console.warn(`[Barcode] Template ${tmplId} attempt ${attempt + 1} failed:`, e.message);
                    }
                }
            }
        }

        if (labelIds.length === 0) throw new Error('TPOS barcode label creation failed');

        // Fetch PDF for each label and merge into one blob
        console.log('[Barcode] Fetching PDFs for', labelIds.length, 'labels:', labelIds);
        const pdfBlobs = [];
        for (const id of labelIds) {
            try {
                const pdfResp = await tposFetch(`${PROXY}/api/BarcodeProductLabel/PrintBarcodePDF?id=${id}`);
                if (pdfResp.ok) {
                    pdfBlobs.push(await pdfResp.arrayBuffer());
                }
            } catch (e) {
                console.warn('[Barcode] PDF fetch failed for label', id);
            }
        }

        if (pdfBlobs.length === 0) throw new Error('No PDFs generated');

        if (pdfBlobs.length === 1) {
            // Single PDF — open directly
            window.open(URL.createObjectURL(new Blob([pdfBlobs[0]], { type: 'application/pdf' })), '_blank');
        } else {
            // Multiple PDFs — merge by concatenating (basic merge, works for simple label PDFs)
            // Open each in separate tab since proper PDF merge needs a library
            for (let i = 0; i < pdfBlobs.length; i++) {
                window.open(URL.createObjectURL(new Blob([pdfBlobs[i]], { type: 'application/pdf' })), '_blank');
            }
        }
        console.log(`[Barcode] Opened ${pdfBlobs.length} TPOS PDF(s), total labels from ${labelIds.length} requests`);
    }

    function generateAndPrint(items, paper, printType, showPrice, showBold, showProductName, showCurrency, hideBarcode) {
        const labels = [];
        for (const item of items) {
            for (let i = 0; i < item.quantity; i++) {
                labels.push({
                    name: stripBrackets(item.name),
                    code: item.code,
                    price: item.price
                });
            }
        }
        const html = buildLabelHTML(labels, paper, printType, showPrice, showBold, showProductName, showCurrency, hideBarcode);
        showPrintOverlay(html);
    }

    /**
     * Build label HTML matching TPOS exactly:
     * - Font: Arial (TPOS default)
     * - CSS from /Content/print_barcode.css
     * - Dynamic styles from BarcodeProducLabelPrintController
     * - Barcode: JsBarcode CODE128 (instead of TPOS server /Web/Barcode)
     */
    function buildLabelHTML(labels, paper, printType, showPrice, showBold, showProductName, showCurrency, hideBarcode) {
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
            `margin-top:1px`
        ];
        if (paper.topMargin != null) labelStyleParts.push(`padding-top:${paper.topMargin}mm`);
        if (paper.leftMargin != null) labelStyleParts.push(`padding-left:${paper.leftMargin}mm`);
        if (paper.bottomMargin != null) labelStyleParts.push(`padding-bottom:${paper.bottomMargin}mm`);
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
        printOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;flex-direction:column;';

        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:10px 16px;background:#1f2937;';

        const btnPrint = document.createElement('button');
        btnPrint.textContent = 'In bằng pdf';
        btnPrint.style.cssText = 'padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;';

        const btnClose = document.createElement('button');
        btnClose.textContent = 'Đóng';
        btnClose.style.cssText = 'padding:8px 20px;background:#4b5563;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;';

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'flex:1;border:none;background:#e5e7eb;';

        const blob = new Blob([html], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;

        btnPrint.onclick = () => {
            try { iframe.contentWindow.print(); } catch (e) { console.error('Print error:', e); }
        };
        const closePrint = () => { printOverlay.remove(); URL.revokeObjectURL(blobUrl); };
        btnClose.onclick = closePrint;
        printOverlay.onclick = (e) => { if (e.target === printOverlay) closePrint(); };

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
