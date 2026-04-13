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

        // === TPOS-matching settings layout ===

        // Row 1: Bảng giá (left) + Áp dụng nhanh SL (right)
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;align-items:flex-end;gap:16px;margin-bottom:12px;';
        row1.innerHTML = `
            <div style="flex:1;">
                <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Bảng giá</label>
                <select id="bld-price-list" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;background:#eef2ff;color:#374151;">
                    <option>Bảng giá mặc định</option>
                </select>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <button id="bld-apply-qty" style="padding:8px 16px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;">Áp dụng nhanh số lượng</button>
                <input type="number" id="bld-quick-qty" value="1" min="1" max="999" style="width:60px;text-align:center;border:1px solid #d1d5db;border-radius:4px;padding:8px 4px;font-size:13px;">
            </div>
        `;
        body.appendChild(row1);

        // Row 2: Giấy in
        const row2 = document.createElement('div');
        row2.style.cssText = 'margin-bottom:12px;';
        row2.innerHTML = `
            <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:4px;">Giấy in</label>
            <select id="bld-paper" style="width:100%;max-width:300px;padding:8px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;background:#eef2ff;color:#374151;">
                ${PAPERS.map((p, i) => `<option value="${i}" ${i === 0 ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
        `;
        body.appendChild(row2);

        // Row 3: Checkboxes (matching TPOS exactly)
        const row3 = document.createElement('div');
        row3.style.cssText = 'display:flex;flex-wrap:wrap;gap:20px;margin-bottom:10px;';
        row3.innerHTML = `
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" id="bld-show-price" checked style="width:16px;height:16px;accent-color:#2563eb;"> Hiện giá
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" id="bld-show-bold" checked style="width:16px;height:16px;accent-color:#2563eb;"> Chữ đậm
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" id="bld-show-currency" style="width:16px;height:16px;accent-color:#2563eb;"> Hiện đơn vị tiền tệ
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" id="bld-show-name" checked style="width:16px;height:16px;accent-color:#2563eb;"> Hiển thị Tên sản phẩm
            </label>
        `;
        body.appendChild(row3);

        // Row 4: Ẩn mã vạch
        const row4 = document.createElement('div');
        row4.style.cssText = 'margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;';
        row4.innerHTML = `
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
                <input type="checkbox" id="bld-hide-barcode" style="width:16px;height:16px;accent-color:#2563eb;"> Ẩn mã vạch (Khuyến nghị dùng cho loại in mặc định)
            </label>
        `;
        body.appendChild(row4);

        // Tabs: "Sản phẩm có mã vạch" | "Sản phẩm không có mã vạch"
        const withBarcode = items.filter(i => i.code);
        const withoutBarcode = items.filter(i => !i.code);
        let activeTab = 'barcode';

        const tabBar = document.createElement('div');
        tabBar.style.cssText = 'display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid #e5e7eb;';
        tabBar.innerHTML = `
            <button class="bld-tab active" data-tab="barcode" style="padding:8px 16px;font-size:13px;font-weight:500;border:none;background:none;cursor:pointer;border-bottom:2px solid #374151;color:#374151;">Sản phẩm có mã vạch</button>
            <button class="bld-tab" data-tab="nobarcode" style="padding:8px 16px;font-size:13px;font-weight:500;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;color:#22c55e;">Sản phẩm không có mã vạch</button>
        `;
        body.appendChild(tabBar);

        // Table: Sản phẩm | Số lượng | (delete icon)
        // Select all
        const selectAllDiv = document.createElement('div');
        selectAllDiv.style.cssText = 'margin-bottom:4px;';
        selectAllDiv.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500;">
                <input type="checkbox" id="bld-select-all" checked style="width:16px;height:16px;accent-color:#2563eb;"> Chọn tất cả
            </label>
        `;
        body.appendChild(selectAllDiv);

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
        table.innerHTML = `
            <thead>
                <tr style="border-bottom:1px solid #e5e7eb;">
                    <th style="padding:10px 6px;width:32px;"></th>
                    <th style="padding:10px 8px;text-align:left;font-weight:600;color:#374151;">Sản phẩm</th>
                    <th style="padding:10px 8px;text-align:center;width:120px;font-weight:600;color:#374151;">Số lượng</th>
                    <th style="width:40px;"></th>
                </tr>
            </thead>
            <tbody id="bld-items-body"></tbody>
        `;

        function renderTableRows() {
            const tbody = table.querySelector('#bld-items-body');
            tbody.innerHTML = '';
            const displayItems = activeTab === 'barcode' ? withBarcode : withoutBarcode;
            displayItems.forEach((item) => {
                const origIdx = items.indexOf(item);
                const variantText = item.variant ? ` (${item.variant})` : '';
                const isChecked = item.checked !== false;
                const tr = document.createElement('tr');
                tr.style.cssText = `border-bottom:1px solid #f3f4f6;${!isChecked ? 'opacity:0.45;' : ''}`;
                tr.innerHTML = `
                    <td style="padding:8px 6px;text-align:center;">
                        <input type="checkbox" class="bld-item-check" data-index="${origIdx}" ${isChecked ? 'checked' : ''} style="width:16px;height:16px;accent-color:#2563eb;cursor:pointer;">
                    </td>
                    <td style="padding:10px 8px;">
                        [${escapeHtml(item.code || '?')}] ${escapeHtml(stripBrackets(item.name))}${escapeHtml(variantText)}
                    </td>
                    <td style="padding:8px;text-align:center;">
                        <input type="number" class="bld-qty" data-index="${origIdx}" value="${item.quantity}" min="1" max="999" style="width:80px;text-align:center;border:1px solid #d1d5db;border-radius:4px;padding:6px;font-size:13px;" ${!isChecked ? 'disabled' : ''}>
                    </td>
                    <td style="padding:8px;text-align:center;">
                        <button class="bld-remove" data-index="${origIdx}" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px;padding:4px;" title="Xóa">🗑</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            if (displayItems.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">Không có sản phẩm</td>`;
                tbody.appendChild(tr);
            }
            // Update select-all state
            const allChecked = displayItems.length > 0 && displayItems.every(i => i.checked !== false);
            const selectAll = document.getElementById('bld-select-all');
            if (selectAll) selectAll.checked = allChecked;
        }
        renderTableRows();
        body.appendChild(table);

        // Tab switching
        tabBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.bld-tab');
            if (!btn) return;
            activeTab = btn.dataset.tab;
            tabBar.querySelectorAll('.bld-tab').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#374151' : 'transparent';
                b.style.color = b === btn ? '#374151' : '#22c55e';
            });
            renderTableRows();
        });

        // Separator
        const sep = document.createElement('hr');
        sep.style.cssText = 'border:none;border-top:3px solid #2563eb;margin:16px 0 12px;';
        body.appendChild(sep);

        // Footer (matching TPOS: "In bằng pdf" green/blue button + "Đóng" gray button)
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;';

        const btnPrint = document.createElement('button');
        btnPrint.id = 'bld-btn-print';
        btnPrint.style.cssText = 'padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;';

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Đóng';
        btnCancel.style.cssText = 'padding:8px 20px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:13px;';

        footer.appendChild(btnPrint);
        footer.appendChild(btnCancel);

        modal.append(header, body, footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Count + update button
        let showCurrency = false;
        let hideBarcode = false;

        function updateCount() {
            const checked = items.filter(i => i.code && i.checked !== false);
            const totalLabels = checked.reduce((sum, it) => sum + it.quantity, 0);
            btnPrint.textContent = totalLabels > 0 ? `In bằng pdf (${totalLabels})` : 'In bằng pdf';
        }
        updateCount();

        // Settings events
        body.querySelector('#bld-paper').addEventListener('change', (e) => { selectedPaper = PAPERS[parseInt(e.target.value)]; });
        body.querySelector('#bld-show-price').addEventListener('change', (e) => { showPrice = e.target.checked; });
        body.querySelector('#bld-show-bold').addEventListener('change', (e) => { showBold = e.target.checked; });
        body.querySelector('#bld-show-name').addEventListener('change', (e) => { showProductName = e.target.checked; });
        body.querySelector('#bld-show-currency').addEventListener('change', (e) => { showCurrency = e.target.checked; });
        body.querySelector('#bld-hide-barcode').addEventListener('change', (e) => { hideBarcode = e.target.checked; });

        // Quick apply qty
        body.querySelector('#bld-apply-qty').addEventListener('click', () => {
            const qty = Math.max(1, parseInt(body.querySelector('#bld-quick-qty').value) || 1);
            items.forEach(it => { it.quantity = qty; });
            renderTableRows();
            updateCount();
        });

        // Select all
        document.getElementById('bld-select-all').addEventListener('change', (e) => {
            const val = e.target.checked;
            const displayItems = activeTab === 'barcode' ? withBarcode : withoutBarcode;
            displayItems.forEach(it => { it.checked = val; });
            renderTableRows();
            updateCount();
        });

        // Checkbox, qty, remove in table
        body.addEventListener('change', (e) => {
            if (e.target.classList.contains('bld-item-check')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].checked = e.target.checked;
                renderTableRows();
                updateCount();
            }
            if (e.target.classList.contains('bld-qty')) {
                const idx = parseInt(e.target.dataset.index);
                items[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                updateCount();
            }
        });
        body.addEventListener('click', (e) => {
            if (e.target.classList.contains('bld-remove')) {
                const idx = parseInt(e.target.dataset.index);
                items.splice(idx, 1);
                // Rebuild withBarcode/withoutBarcode
                withBarcode.length = 0;
                withoutBarcode.length = 0;
                items.forEach(i => { (i.code ? withBarcode : withoutBarcode).push(i); });
                renderTableRows();
                updateCount();
            }
        });

        // Close
        const closeModal = () => { overlay.remove(); overlay = null; };
        header.querySelector('#bld-close').addEventListener('click', closeModal);
        btnCancel.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        // Preview area (below separator, above footer)
        const previewArea = document.createElement('div');
        previewArea.id = 'bld-preview';
        previewArea.style.cssText = 'margin-top:12px;';
        body.appendChild(previewArea);

        function updatePreview() {
            const printItems = items.filter(it => it.code && it.checked !== false && it.quantity > 0);
            if (!printItems.length) {
                previewArea.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:12px;font-size:13px;">Không có sản phẩm để in</div>';
                return;
            }
            // Build labels (max 4 for preview)
            const previewLabels = [];
            for (const item of printItems) {
                for (let i = 0; i < Math.min(item.quantity, 2); i++) {
                    previewLabels.push({ name: stripBrackets(item.name), code: item.code, price: item.price });
                    if (previewLabels.length >= 4) break;
                }
                if (previewLabels.length >= 4) break;
            }
            const html = buildLabelHTML(previewLabels, selectedPaper, selectedPrintType.id, showPrice, showBold, showProductName, showCurrency, hideBarcode);

            // Show in inline iframe
            previewArea.innerHTML = `
                <div style="font-size:11px;color:#6b7280;margin-bottom:6px;font-weight:600;">XEM TRƯỚC TEM:</div>
                <div style="background:#e5e7eb;border-radius:6px;padding:12px;display:flex;justify-content:center;overflow:auto;">
                    <iframe id="bld-preview-iframe" style="border:none;width:${selectedPaper.sheetW * 3}px;height:${selectedPaper.sheetH * 3 + 20}px;transform:scale(1);transform-origin:top center;" sandbox="allow-same-origin"></iframe>
                </div>
            `;
            const iframe = previewArea.querySelector('#bld-preview-iframe');
            iframe.onload = () => {
                try {
                    iframe.contentDocument.open();
                    iframe.contentDocument.write(html);
                    iframe.contentDocument.close();
                } catch(e) {}
            };
            // Trigger load
            iframe.src = 'about:blank';
        }
        // Initial preview
        setTimeout(updatePreview, 100);

        // Re-preview on settings change
        const refreshPreview = () => setTimeout(updatePreview, 50);
        body.querySelector('#bld-paper').addEventListener('change', refreshPreview);
        body.querySelector('#bld-show-price').addEventListener('change', refreshPreview);
        body.querySelector('#bld-show-bold').addEventListener('change', refreshPreview);
        body.querySelector('#bld-show-name').addEventListener('change', refreshPreview);
        body.querySelector('#bld-show-currency').addEventListener('change', refreshPreview);
        body.querySelector('#bld-hide-barcode').addEventListener('change', refreshPreview);

        // Print
        btnPrint.addEventListener('click', () => {
            const printItems = items.filter(it => it.code && it.checked !== false && it.quantity > 0);
            if (!printItems.length) return;
            closeModal();
            generateAndPrint(printItems, selectedPaper, selectedPrintType.id, showPrice, showBold, showProductName, showCurrency, hideBarcode);
        });
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
            `line-height:${lineH}px`
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
                    // TPOS Template: /BarcodeProductLabel/PrintNew
                    sheetsHTML += `<div class="barcode_label" style="${labelStyle}"><table border="0"><tr style="text-align:center;"><td style="width:50%; text-align:center; vertical-align:middle"><div class="barcode-pname" style="${nameStyle}"><${bTag}>${escapeHtml(label.code)}</${bTag}></div>${showPrice ? `<div><strong class="barcode-price">${displayPrice}${currencyStr}</strong></div>` : ''}</td><td style="width:50%; text-align:center; vertical-align:middle;"><div class="barcode-image" style="width:100%; padding:2px">${!hideBarcode ? barcodeImg : ''}</div></td></tr></table></div>`;
                } else {
                    // TPOS Template: /BarcodeProductLabel/Print (Default)
                    sheetsHTML += `<div class="barcode_label" style="${labelStyle}text-align: center;margin-top:1px">`;
                    if (showProductName) {
                        sheetsHTML += `<div class="barcode-pname" style="${nameStyle}"><${bTag}>${escapeHtml(label.name)}</${bTag}></div>`;
                    }
                    if (!hideBarcode && label.code) {
                        sheetsHTML += `<div class="barcode-image">${barcodeImg}</div>`;
                    }
                    sheetsHTML += `<div><${bTag}>${escapeHtml(label.code)}</${bTag}></div>`;
                    if (showPrice) {
                        sheetsHTML += `<div><strong class="barcode-price">${displayPrice}${currencyStr}</strong></div>`;
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
/* === TPOS /Content/print_barcode.css — COMPLETE, UNMODIFIED === */
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
}

.barcodeCustom-sheet {
    page-break-after: always;
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
    height: 25px;
}

.fill-height-flex {
    display: flex;
    flex-direction: column;
}

.fill-height-flex > div {
    flex: 1;
    display: flex;
    justify-content: center;
    flex-direction: column;
}
/* === END TPOS CSS === */

/* Screen preview only (not printed) */
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
        box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        border: 1px solid #ccc;
    }
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
