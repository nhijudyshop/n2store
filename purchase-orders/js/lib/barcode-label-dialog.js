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

        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;width:92%;max-width:780px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = `
            <h3 style="margin:0;font-size:16px;font-weight:600;">In mã vạch</h3>
            <button id="bld-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;padding:4px 8px;">✕</button>
        `;

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

        // Settings (matching TPOS layout)
        const settingsRow = document.createElement('div');
        settingsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;';
        settingsRow.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:4px;min-width:160px;">
                <label style="font-size:12px;font-weight:600;color:#374151;">Giấy in</label>
                <select id="bld-paper" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;">
                    ${PAPERS.map((p, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;min-width:140px;">
                <label style="font-size:12px;font-weight:600;color:#374151;">Kiểu in</label>
                <select id="bld-print-type" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff;">
                    ${PRINT_TYPES.map((t, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;padding-bottom:2px;">
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" id="bld-show-price" checked style="width:15px;height:15px;accent-color:#2563eb;">
                    Hiện giá
                </label>
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" id="bld-show-bold" checked style="width:15px;height:15px;accent-color:#2563eb;">
                    Chữ đậm
                </label>
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" id="bld-show-name" checked style="width:15px;height:15px;accent-color:#2563eb;">
                    Hiển thị Tên sản phẩm
                </label>
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px;margin-left:auto;">
                <button id="bld-apply-qty" style="padding:7px 14px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">Áp dụng nhanh SL</button>
                <input type="number" id="bld-quick-qty" value="1" min="1" max="999" style="width:55px;text-align:center;border:1px solid #d1d5db;border-radius:6px;padding:7px 4px;font-size:13px;">
            </div>
        `;
        body.appendChild(settingsRow);

        // Tabs (matching TPOS: "Sản phẩm có mã vạch" / "Sản phẩm không có mã vạch")
        const withBarcode = items.filter(i => i.code);
        const withoutBarcode = items.filter(i => !i.code);

        // Items table
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'margin-bottom:8px;padding:6px 0;';
        selectAllDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:13px;">
                <input type="checkbox" id="bld-select-all" checked style="width:16px;height:16px;accent-color:#2563eb;">
                Chọn tất cả
            </label>
        `;
        body.appendChild(selectAllDiv);

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
        table.innerHTML = `
            <thead>
                <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
                    <th style="padding:8px 6px;text-align:center;width:32px;"></th>
                    <th style="padding:8px 6px;text-align:left;">Sản phẩm</th>
                    <th style="padding:8px 6px;text-align:left;width:80px;">Mã SP</th>
                    <th style="padding:8px 6px;text-align:center;width:70px;">Số lượng</th>
                    <th style="padding:8px 6px;text-align:right;width:90px;">Giá</th>
                </tr>
            </thead>
            <tbody id="bld-items-body"></tbody>
        `;

        const tbody = table.querySelector('#bld-items-body');
        items.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid #f3f4f6;';
            const variantText = item.variant ? ` <span style="color:#6b7280;font-size:11px;">(${item.variant})</span>` : '';
            tr.innerHTML = `
                <td style="padding:6px;text-align:center;">
                    <input type="checkbox" class="bld-item-check" data-index="${i}" ${item.code ? 'checked' : ''} style="width:15px;height:15px;accent-color:#2563eb;">
                </td>
                <td style="padding:8px 6px;">
                    <span style="font-weight:500;">[${escapeHtml(item.code)}] ${escapeHtml(stripBrackets(item.name))}</span>${variantText}
                </td>
                <td style="padding:6px;font-family:monospace;font-size:12px;color:#6b7280;">${escapeHtml(item.code)}</td>
                <td style="padding:6px;text-align:center;">
                    <input type="number" class="bld-qty" data-index="${i}" value="${item.quantity}" min="1" max="999" style="width:55px;text-align:center;border:1px solid #d1d5db;border-radius:4px;padding:4px;font-size:13px;">
                </td>
                <td style="padding:6px;text-align:right;font-weight:500;">${formatPrice(item.price)}</td>
            `;
            if (!item.code) {
                items[i].checked = false;
            } else {
                items[i].checked = true;
            }
            tbody.appendChild(tr);
        });
        body.appendChild(table);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;';
        footer.innerHTML = `
            <span style="font-size:12px;color:#6b7280;" id="bld-no-barcode-info">${withoutBarcode.length > 0 ? `⚠ ${withoutBarcode.length} SP không có mã vạch` : ''}</span>
            <div style="display:flex;gap:8px;"></div>
        `;
        const footerActions = footer.querySelector('div:last-child');

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Đóng';
        btnCancel.style.cssText = 'padding:8px 20px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;';

        const btnPrint = document.createElement('button');
        btnPrint.id = 'bld-btn-print';
        btnPrint.style.cssText = 'padding:8px 24px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;';

        footerActions.appendChild(btnCancel);
        footerActions.appendChild(btnPrint);

        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Count
        function updateCount() {
            const checked = items.filter(it => it.checked);
            const totalLabels = checked.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = `In bằng pdf (${totalLabels})`;
        }
        updateCount();

        // Events
        settingsRow.querySelector('#bld-paper').addEventListener('change', (e) => { selectedPaper = PAPERS[parseInt(e.target.value)]; });
        settingsRow.querySelector('#bld-print-type').addEventListener('change', (e) => { selectedPrintType = PRINT_TYPES[parseInt(e.target.value)]; });
        settingsRow.querySelector('#bld-show-price').addEventListener('change', (e) => { showPrice = e.target.checked; });
        settingsRow.querySelector('#bld-show-bold').addEventListener('change', (e) => { showBold = e.target.checked; });
        settingsRow.querySelector('#bld-show-name').addEventListener('change', (e) => { showProductName = e.target.checked; });

        // Quick apply qty
        settingsRow.querySelector('#bld-apply-qty').addEventListener('click', () => {
            const qty = Math.max(1, parseInt(settingsRow.querySelector('#bld-quick-qty').value) || 1);
            items.forEach((it, i) => { it.quantity = qty; });
            body.querySelectorAll('.bld-qty').forEach(input => { input.value = qty; });
            updateCount();
        });

        const selectAllCheckbox = document.getElementById('bld-select-all');
        selectAllCheckbox.addEventListener('change', () => {
            const val = selectAllCheckbox.checked;
            items.forEach(it => it.checked = val);
            body.querySelectorAll('.bld-item-check').forEach(cb => cb.checked = val);
            updateCount();
        });

        body.addEventListener('change', (e) => {
            if (e.target.classList.contains('bld-item-check')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].checked = e.target.checked;
                selectAllCheckbox.checked = items.every(it => it.checked);
                updateCount();
            }
            if (e.target.classList.contains('bld-qty')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                updateCount();
            }
        });

        const closeModal = () => { overlay.remove(); overlay = null; };
        header.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        btnPrint.addEventListener('click', () => {
            const selected = items.filter(it => it.checked && it.code);
            if (!selected.length) return;
            closeModal();
            generateAndPrint(selected, selectedPaper, selectedPrintType.id, showPrice, showBold, showProductName);
        });
    }

    function generateAndPrint(items, paper, printType, showPrice, showBold, showProductName) {
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
        const html = buildLabelHTML(labels, paper, printType, showPrice, showBold, showProductName);
        showPrintOverlay(html);
    }

    /**
     * Build label HTML matching TPOS exactly:
     * - Font: Arial (TPOS default)
     * - CSS from /Content/print_barcode.css
     * - Dynamic styles from BarcodeProducLabelPrintController
     * - Barcode: JsBarcode CODE128 (instead of TPOS server /Web/Barcode)
     */
    function buildLabelHTML(labels, paper, printType, showPrice, showBold, showProductName) {
        const { sheetW, sheetH, labelW, labelH, cols, fontSize } = paper;
        const topMargin = paper.topMargin || 0;
        const leftMargin = paper.leftMargin || 0;
        const bottomMargin = paper.bottomMargin || 0;
        const rightMargin = paper.rightMargin || 0;
        const hSpacing = paper.hSpacing || 0;
        const vSpacing = paper.vSpacing || 0;

        const lineH = fontSize + 1;
        const nameMaxH = fontSize * 2;
        const fs = fontSize || 9;

        // Group labels into sheets (cols labels per sheet)
        const sheets = [];
        for (let i = 0; i < labels.length; i += cols) {
            sheets.push(labels.slice(i, i + cols));
        }

        const bTag = showBold ? 'strong' : 'span';

        let sheetsHTML = '';
        for (const sheet of sheets) {
            sheetsHTML += `<div class="barcode-sheet" style="width:${sheetW}mm;height:${sheetH}mm;">`;
            for (const label of sheet) {
                const displayPrice = formatPrice(label.price);

                // Dynamic inline style matching TPOS style_label()
                const labelStyle = `width:${labelW}mm;height:${labelH}mm;overflow:hidden;padding-top:${topMargin}mm;padding-left:${leftMargin}mm;padding-bottom:${bottomMargin}mm;padding-right:${rightMargin}mm;margin-right:${hSpacing}mm;margin-bottom:${vSpacing}mm;font-size:${fs}px;line-height:${lineH}px;`;

                // Dynamic name style matching TPOS style_name
                const nameStyle = `max-height:${nameMaxH}px;overflow:hidden;margin-bottom:2px;`;

                if (printType === 'new') {
                    sheetsHTML += `
                        <div class="barcode_label" style="${labelStyle}">
                            <table border="0" style="width:100%;height:100%;">
                                <tr style="text-align:center;">
                                    <td style="width:50%;text-align:center;vertical-align:middle;">
                                        <div class="barcode-pname" style="${nameStyle}"><${bTag}>${escapeHtml(label.code)}</${bTag}></div>
                                        ${showPrice ? `<div><strong class="barcode-price">${displayPrice}</strong></div>` : ''}
                                    </td>
                                    <td style="width:50%;text-align:center;vertical-align:middle;">
                                        <div class="barcode-image" style="width:100%;padding:2px;">
                                            <svg class="barcode" data-code="${escapeHtml(label.code)}"></svg>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    `;
                } else {
                    // Default template — matches TPOS /BarcodeProductLabel/Print exactly
                    sheetsHTML += `
                        <div class="barcode_label" style="${labelStyle}text-align:center;margin-top:1px;">
                            ${showProductName ? `<div class="barcode-pname" style="${nameStyle}"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>` : ''}
                            <div class="barcode-image">
                                <svg class="barcode" data-code="${escapeHtml(label.code)}"></svg>
                            </div>
                            <div><${bTag}>${escapeHtml(label.code)}</${bTag}></div>
                            ${showPrice ? `<div><strong class="barcode-price">${displayPrice}</strong></div>` : ''}
                        </div>
                    `;
                }
            }
            sheetsHTML += '</div>';
        }

        // Full HTML document matching TPOS print iframe structure
        // CSS from TPOS /Content/print_barcode.css (exact copy)
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>In mã vạch</title>
<style>
    /* === TPOS /Content/print_barcode.css (exact) === */
    * { box-sizing: border-box; }
    @page { margin: 0 !important; }
    html, body {
        padding: 0 !important;
        margin: 0 !important;
        font-family: Arial, Helvetica, sans-serif;
    }
    .barcode-sheet {
        page-break-after: always;
    }
    .barcode-sheet:last-child {
        page-break-after: auto;
    }
    .barcode_label {
        box-sizing: border-box;
        text-align: center;
        float: left;
        display: flex;
        flex-flow: column;
        overflow: hidden;
        font-size: 10px;
        padding: 5px;
        line-height: 10px;
    }
    .barcode_label div {
        flex: 1 auto;
    }
    .barcode-image img,
    .barcode-image svg {
        width: 100%;
        height: 25px;
    }

    /* === Screen preview === */
    @media screen {
        body {
            background: #e5e7eb;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        .barcode-sheet {
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
            border: 1px solid #ccc;
            display: flex;
            overflow: hidden;
        }
    }

    @media print {
        body { background: none; display: block; padding: 0; }
        .barcode-sheet { display: block; }
    }
</style>
</head>
<body>
${sheetsHTML}
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script>
    // Generate Code 128 barcodes (replaces TPOS server-side /Web/Barcode endpoint)
    document.querySelectorAll('.barcode').forEach(function(svg) {
        var code = svg.getAttribute('data-code');
        if (!code) return;
        try {
            JsBarcode(svg, code, {
                format: 'CODE128',
                width: 1,
                height: 25,
                displayValue: false,
                margin: 0,
                background: 'transparent'
            });
            // Match TPOS: img { width: 100%; height: 25px }
            var w = svg.getAttribute('width');
            var h = svg.getAttribute('height');
            svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.style.width = '100%';
            svg.style.height = '25px';
        } catch(e) {
            console.warn('Barcode error:', code, e);
        }
    });
<\/script>
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
