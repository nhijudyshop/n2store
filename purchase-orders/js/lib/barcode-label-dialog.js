// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * BarcodeLabelDialog - Barcode label printing matching TPOS format
 * Supports 3 paper sizes and 2 print types (Default, New)
 * Default paper: "2 Tem" (66mm × 21mm, 2 labels per row)
 */
window.BarcodeLabelDialog = (function () {
    let overlay = null;

    // Paper presets matching TPOS ProductLabelPaper
    const PAPERS = [
        { id: 7, name: '2 Tem (66×21mm)', sheetW: 66, sheetH: 21, labelW: 25, labelH: 21, cols: 2, fontSize: 6, topMargin: 0.5, leftMargin: 0.5, bottomMargin: 0.5, rightMargin: 0.5, hSpacing: 8, vSpacing: 0 },
        { id: 8, name: '1 Tem (65×22mm)', sheetW: 65, sheetH: 22, labelW: 27, labelH: 21, cols: 2, fontSize: 7, topMargin: 0.5, leftMargin: 0.5, bottomMargin: 0.5, rightMargin: 0.5, hSpacing: 5, vSpacing: 0 },
        { id: 9, name: 'Tem 35×22mm', sheetW: 70, sheetH: 22, labelW: 35, labelH: 22, cols: 2, fontSize: 8, topMargin: 0.5, leftMargin: 0.5, bottomMargin: 0.5, rightMargin: 0.5, hSpacing: 0, vSpacing: 0 }
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

        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;width:90%;max-width:750px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = `
            <h3 style="margin:0;font-size:16px;font-weight:600;">In tem Barcode</h3>
            <button id="bld-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;padding:4px 8px;">✕</button>
        `;

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

        // Settings row (paper, print type, options)
        const settingsRow = document.createElement('div');
        settingsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;';
        settingsRow.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Khổ giấy</label>
                <select id="bld-paper" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;min-width:160px;">
                    ${PAPERS.map((p, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;">Kiểu in</label>
                <select id="bld-print-type" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;min-width:140px;">
                    ${PRINT_TYPES.map((t, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
            </div>
            <div style="display:flex;align-items:flex-end;gap:12px;padding-bottom:2px;">
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" id="bld-show-price" checked style="width:15px;height:15px;cursor:pointer;">
                    Hiện giá
                </label>
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;">
                    <input type="checkbox" id="bld-show-bold" checked style="width:15px;height:15px;cursor:pointer;">
                    In đậm
                </label>
            </div>
        `;
        body.appendChild(settingsRow);

        // Select all checkbox
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'margin-bottom:8px;padding:8px 0;border-bottom:1px solid #f3f4f6;';
        selectAllDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:14px;">
                <input type="checkbox" id="bld-select-all" checked style="width:16px;height:16px;cursor:pointer;">
                Chọn tất cả
            </label>
        `;
        body.appendChild(selectAllDiv);

        // Items table
        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
        table.innerHTML = `
            <thead>
                <tr style="background:#f9fafb;">
                    <th style="padding:8px 6px;text-align:center;width:36px;"></th>
                    <th style="padding:8px 6px;text-align:left;">Sản phẩm</th>
                    <th style="padding:8px 6px;text-align:left;width:80px;">Mã SP</th>
                    <th style="padding:8px 6px;text-align:center;width:50px;">SL</th>
                    <th style="padding:8px 6px;text-align:right;width:90px;">Giá bán</th>
                </tr>
            </thead>
            <tbody id="bld-items-body"></tbody>
        `;

        const tbody = table.querySelector('#bld-items-body');
        items.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom:1px solid #f3f4f6;';
            const variantText = item.variant ? `<span style="color:#6b7280;font-size:11px;display:block;">${item.variant}</span>` : '';
            tr.innerHTML = `
                <td style="padding:6px;text-align:center;">
                    <input type="checkbox" class="bld-item-check" data-index="${i}" checked style="width:15px;height:15px;cursor:pointer;">
                </td>
                <td style="padding:6px;">
                    <span style="font-weight:500;">${stripBrackets(item.name)}</span>
                    ${variantText}
                </td>
                <td style="padding:6px;font-family:monospace;font-size:12px;">${escapeHtml(item.code)}</td>
                <td style="padding:6px;text-align:center;"><input type="number" class="bld-qty" data-index="${i}" value="${item.quantity}" min="1" max="999" style="width:45px;text-align:center;border:1px solid #d1d5db;border-radius:4px;padding:2px;font-size:13px;"></td>
                <td style="padding:6px;text-align:right;">${formatPrice(item.price)}</td>
            `;
            tbody.appendChild(tr);
        });
        body.appendChild(table);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:8px;';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Hủy';
        btnCancel.style.cssText = 'padding:8px 16px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;';

        const btnPrint = document.createElement('button');
        btnPrint.id = 'bld-btn-print';
        btnPrint.style.cssText = 'padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;';

        footer.appendChild(btnCancel);
        footer.appendChild(btnPrint);

        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Update button text
        function updateCount() {
            const checked = items.filter(it => it.checked);
            const totalLabels = checked.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = `In tem (${totalLabels})`;
        }
        updateCount();

        // Settings events
        settingsRow.querySelector('#bld-paper').addEventListener('change', (e) => {
            selectedPaper = PAPERS[parseInt(e.target.value)];
        });
        settingsRow.querySelector('#bld-print-type').addEventListener('change', (e) => {
            selectedPrintType = PRINT_TYPES[parseInt(e.target.value)];
        });
        settingsRow.querySelector('#bld-show-price').addEventListener('change', (e) => {
            showPrice = e.target.checked;
        });
        settingsRow.querySelector('#bld-show-bold').addEventListener('change', (e) => {
            showBold = e.target.checked;
        });

        // Select all
        const selectAllCheckbox = document.getElementById('bld-select-all');
        selectAllCheckbox.addEventListener('change', () => {
            const val = selectAllCheckbox.checked;
            items.forEach(it => it.checked = val);
            body.querySelectorAll('.bld-item-check').forEach(cb => cb.checked = val);
            updateCount();
        });

        // Individual checkboxes
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

        // Close
        const closeModal = () => { overlay.remove(); overlay = null; };
        header.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        // Print
        btnPrint.addEventListener('click', () => {
            const selected = items.filter(it => it.checked);
            if (!selected.length) return;
            closeModal();
            generateAndPrint(selected, selectedPaper, selectedPrintType.id, showPrice, showBold);
        });
    }

    function generateAndPrint(items, paper, printType, showPrice, showBold) {
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

        const html = buildLabelHTML(labels, paper, printType, showPrice, showBold);
        showPrintOverlay(html);
    }

    function buildLabelHTML(labels, paper, printType, showPrice, showBold) {
        const { sheetW, sheetH, labelW, labelH, cols, fontSize, topMargin, leftMargin, bottomMargin, rightMargin, hSpacing, vSpacing } = paper;

        // Group labels into sheets
        const sheets = [];
        for (let i = 0; i < labels.length; i += cols) {
            const sheet = labels.slice(i, i + cols);
            sheets.push(sheet);
        }

        const nameMaxH = fontSize * 2;
        const lineH = fontSize + 1;
        const bTag = showBold ? 'strong' : 'span';

        let sheetsHTML = '';
        for (const sheet of sheets) {
            sheetsHTML += `<div class="barcode-sheet">`;
            for (const label of sheet) {
                const displayPrice = formatPrice(label.price);

                if (printType === 'new') {
                    // 2-column layout: left=text+price, right=barcode image
                    sheetsHTML += `
                        <div class="barcode_label">
                            <table border="0" style="width:100%;height:100%;">
                                <tr>
                                    <td style="width:50%;text-align:center;vertical-align:middle;">
                                        <div class="barcode-pname">${escapeHtml(label.code)}</div>
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
                    // Default vertical layout (TPOS Default)
                    sheetsHTML += `
                        <div class="barcode_label" style="text-align:center;margin-top:1px;">
                            <div class="barcode-pname">
                                <${bTag}>${escapeHtml(label.name)}</${bTag}>
                            </div>
                            <div class="barcode-image">
                                <svg class="barcode" data-code="${escapeHtml(label.code)}"></svg>
                            </div>
                            <div>
                                <${bTag}>${escapeHtml(label.code)}</${bTag}>
                            </div>
                            ${showPrice ? `<div><strong class="barcode-price">${displayPrice}</strong></div>` : ''}
                        </div>
                    `;
                }
            }
            sheetsHTML += '</div>';
        }

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcode Labels</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
        size: ${sheetW}mm ${sheetH}mm;
        margin: 0;
    }

    body {
        font-family: 'Times New Roman', Times, serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    .barcode-sheet {
        width: ${sheetW}mm;
        height: ${sheetH}mm;
        display: flex;
        page-break-after: always;
        overflow: hidden;
    }

    .barcode-sheet:last-child {
        page-break-after: auto;
    }

    .barcode_label {
        width: ${labelW}mm;
        height: ${labelH}mm;
        overflow: hidden;
        padding-top: ${topMargin}mm;
        padding-left: ${leftMargin}mm;
        padding-bottom: ${bottomMargin}mm;
        padding-right: ${rightMargin}mm;
        margin-right: ${hSpacing}mm;
        margin-bottom: ${vSpacing}mm;
        font-size: ${fontSize}px;
        line-height: ${lineH}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .barcode-pname {
        max-height: ${nameMaxH}px;
        overflow: hidden;
        margin-bottom: 2px;
        text-align: center;
        width: 100%;
        word-break: break-word;
    }

    .barcode-image {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        flex: 1;
        min-height: 0;
    }

    .barcode-image svg {
        width: 80%;
        height: 100%;
        max-height: ${Math.floor(labelH * 0.4)}mm;
    }

    .barcode-price {
        font-size: ${Math.max(fontSize, 7)}px;
    }

    /* Screen preview */
    @media screen {
        body {
            background: #e5e7eb;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .barcode-sheet {
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            border: 1px solid #d1d5db;
        }
    }
</style>
</head>
<body>
${sheetsHTML}
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<script>
    document.querySelectorAll('.barcode').forEach(function(svg) {
        var code = svg.getAttribute('data-code');
        if (code) {
            try {
                JsBarcode(svg, code, {
                    format: 'CODE128',
                    width: 1,
                    height: 30,
                    displayValue: false,
                    margin: 0
                });
                var w = svg.getAttribute('width');
                var h = svg.getAttribute('height');
                svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                svg.setAttribute('preserveAspectRatio', 'none');
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                svg.style.width = '80%';
                svg.style.height = '100%';
            } catch(e) {
                console.warn('Barcode error for:', code, e);
            }
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
        toolbar.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:8px 16px;background:#1f2937;';

        const btnPrint = document.createElement('button');
        btnPrint.innerHTML = '🖨 In';
        btnPrint.style.cssText = 'padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;';

        const btnClose = document.createElement('button');
        btnClose.textContent = 'Đóng';
        btnClose.style.cssText = 'padding:8px 16px;background:#4b5563;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;';

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
