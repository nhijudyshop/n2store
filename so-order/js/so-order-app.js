// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Sổ Order — page controller: tab strip, table render, modals.

(function () {
    'use strict';

    const COLUMNS = [
        { key: 'supplier', label: 'NCC' },
        { key: 'stt', label: 'STT' },
        { key: 'productName', label: 'Tên SP' },
        { key: 'variant', label: 'Biến Thể' },
        { key: 'qty', label: 'SL' },
        { key: 'sellPrice', label: 'Giá Bán' },
        { key: 'costPrice', label: 'Giá Nhập' },
        { key: 'productImage', label: 'Ảnh SP' },
        { key: 'invoiceImage', label: 'Ảnh Hóa Đơn' },
        { key: 'note', label: 'Ghi Chú' },
        { key: 'costNote', label: 'Ghi Chú CP' },
        { key: 'status', label: 'Trạng Thái' },
        { key: 'actions', label: 'Thao Tác' },
    ];

    const STATUS_LABELS = {
        draft: 'Nháp',
        ordered: 'Đã Đặt',
        received: 'Đã Nhận',
        cancelled: 'Đã Hủy',
    };

    let state = null;
    let editingRowId = null;
    let editingShipmentId = null;
    let editingTabId = null;

    // ---------- helpers ----------

    function fmtVnd(n) {
        const v = Math.round(Number(n) || 0);
        return v.toLocaleString('vi-VN') + '₫';
    }

    function fmtCurrency(n, currency) {
        const v = Number(n) || 0;
        if (currency === 'VND') return Math.round(v).toLocaleString('vi-VN') + '₫';
        // Plain decimal with currency suffix for FX
        const decimals = currency === 'JPY' || currency === 'KRW' ? 0 : 2;
        return (
            v.toLocaleString('vi-VN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }) +
            ' ' +
            currency
        );
    }

    function toVnd(amount, tab) {
        return Math.round((Number(amount) || 0) * (Number(tab.rate) || 1));
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }

    // Per-tab column visibility helper. Active tab's settings are
    // what every renderer reads from.
    function activeColVis() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        return window.SoOrderStorage.getColumnVisibility(tab);
    }

    // ---------- rendering ----------

    function renderTabStrip() {
        const strip = document.getElementById('soTabStrip');
        if (!strip) return;
        const html = state.tabs
            .map((t) => {
                const cur = t.currency === 'VND' ? '₫' : t.currency;
                const active = t.id === state.activeTabId ? 'is-active' : '';
                return `<button class="so-tab-pill ${active}" data-tab-id="${escapeHtml(t.id)}" type="button">
                    <span>${escapeHtml(t.label)}</span>
                    <span class="so-tab-pill-cur">${escapeHtml(cur)}</span>
                </button>`;
            })
            .join('');
        strip.innerHTML = html;
        strip.querySelectorAll('.so-tab-pill').forEach((el) => {
            el.addEventListener('click', () => {
                state.activeTabId = el.dataset.tabId;
                window.SoOrderStorage.save(state);
                pushSync();
                renderAll();
            });
        });
        const tab = window.SoOrderStorage.getActiveTab(state);
        const lbl = document.getElementById('soActiveTabLabel');
        if (lbl) lbl.textContent = tab.label;
    }

    function renderTableHead() {
        // Column header row no longer lives in the global <thead> — each
        // shipment renders its own header row inside its expand area,
        // so a sticky top header isn't needed (and would duplicate the
        // per-shipment one). Keep <thead> empty to preserve table layout.
        const tr = document.getElementById('soTableHeadRow');
        if (tr) tr.innerHTML = '';
    }

    function columnHeaderRowHtml() {
        return (
            '<tr class="so-shipment-colhead">' +
            COLUMNS.filter((c) => activeColVis()[c.key])
                .map(
                    (c) =>
                        `<th class="so-shipment-colhead-cell" data-col="${escapeHtml(c.key)}">${escapeHtml(c.label)}</th>`
                )
                .join('') +
            '</tr>'
        );
    }

    function renderTableBody() {
        const tbody = document.getElementById('soTableBody');
        const empty = document.getElementById('soEmptyState');
        if (!tbody) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const shipments = tab.shipments || [];
        if (!shipments.length) {
            tbody.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        // Sort shipments by date desc so newest is on top
        const sorted = [...shipments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const visibleColCount = COLUMNS.filter((c) => activeColVis()[c.key]).length;
        tbody.innerHTML = sorted.map((sh) => shipmentHtml(sh, tab, visibleColCount)).join('');

        // Wire shipment-header click → toggle collapsed
        tbody.querySelectorAll('[data-toggle-shipment]').forEach((el) => {
            el.addEventListener('click', () => {
                const shId = el.dataset.toggleShipment;
                const sh = shipments.find((s) => s.id === shId);
                if (!sh) return;
                window.SoOrderStorage.updateShipment(state, tab.id, shId, {
                    collapsed: !sh.collapsed,
                });
                pushSync();
                renderAll();
            });
        });
        // Edit / delete shipment from header
        tbody.querySelectorAll('[data-shipment-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.shipmentAction;
                const shId = btn.dataset.shipmentId;
                if (action === 'edit-shipment') openShipmentModal(shId);
                else if (action === 'delete-shipment') deleteShipment(shId);
                else if (action === 'add-row') openOrderModal(null, shId);
            });
        });
        // Row actions
        tbody.querySelectorAll('[data-row-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.rowAction;
                const rowId = btn.dataset.rowId;
                const shId = btn.dataset.shipmentId;
                if (action === 'edit') openOrderModal(rowId, shId);
                else if (action === 'delete') deleteRow(shId, rowId);
            });
        });
        tbody.querySelectorAll('img[data-zoomable]').forEach((img) => {
            img.addEventListener('click', () => openLightbox(img.src));
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function shipmentHtml(sh, tab, colSpan) {
        const header = shipmentHeaderHtml(sh, tab, colSpan);
        if (sh.collapsed) return header;
        // Expanded → emit column header row, then data rows.
        const colHead = columnHeaderRowHtml();
        const rows = sh.rows.map((r, idx) => rowHtml(r, idx, tab, sh.id)).join('');
        return header + colHead + rows;
    }

    function shipmentHeaderHtml(sh, tab, colSpan) {
        const dateText = sh.date ? formatDateVN(sh.date) : '—';
        const batchText = sh.batch ? `Đợt ${escapeHtml(sh.batch)}` : 'Chưa đặt đợt';
        const caseCount = Number(sh.caseCount) || 0;
        const weightKg = Number(sh.weightKg) || 0;
        // Contract amount: always rendered in the tab's currency.
        // Legacy data may store shipment.contractCurrency != tab.currency
        // (e.g. recorded in CNY while the tab is VND); convert through VND
        // so the displayed value matches the tab's setting.
        const contractRaw = Number(sh.contractAmount) || 0;
        const contractCur = sh.contractCurrency || tab.currency || 'VND';
        const rawVnd = contractRaw * currencyToVndRate(contractCur, tab);
        const tabToVnd = currencyToVndRate(tab.currency, tab) || 1;
        const displayAmount = rawVnd / tabToVnd;
        const contractDisplayText = fmtCurrency(displayAmount, tab.currency || 'VND');
        const caret = sh.collapsed ? 'chevron-right' : 'chevron-down';
        return `<tr class="so-shipment-head ${sh.collapsed ? 'is-collapsed' : ''}" data-shipment-id="${escapeHtml(sh.id)}">
            <td colspan="${colSpan}">
                <div class="so-shipment-row">
                    <button class="so-shipment-toggle" type="button" data-toggle-shipment="${escapeHtml(sh.id)}" title="Đóng/mở">
                        <i data-lucide="${caret}"></i>
                    </button>
                    <span class="so-shipment-meta">
                        <i data-lucide="calendar"></i>
                        <strong>Ngày giao:</strong> ${escapeHtml(dateText)}
                    </span>
                    <span class="so-shipment-sep">—</span>
                    <span class="so-shipment-meta so-shipment-batch">${escapeHtml(batchText)}</span>
                    <span class="so-shipment-sep">—</span>
                    <span class="so-shipment-meta">
                        <i data-lucide="package"></i>
                        <strong>${caseCount} Kiện</strong> :
                        <span class="so-shipment-kg-strike">${weightKg.toLocaleString('vi-VN')} KG</span>
                    </span>
                    <span class="so-shipment-sep">|</span>
                    <span class="so-shipment-meta">Tổng <strong>${weightKg.toLocaleString('vi-VN')} KG</strong></span>
                    <span class="so-shipment-sep">|</span>
                    <span class="so-shipment-meta">
                        <strong>Tổng HĐ:</strong>
                        <span class="so-shipment-contract-raw">${escapeHtml(contractDisplayText)}</span>
                    </span>
                    <span class="so-shipment-spacer"></span>
                    <button class="so-action-btn" type="button" data-shipment-action="add-row" data-shipment-id="${escapeHtml(sh.id)}" title="Thêm dòng vào lô này">
                        <i data-lucide="plus-circle"></i>
                    </button>
                    <button class="so-action-btn" type="button" data-shipment-action="edit-shipment" data-shipment-id="${escapeHtml(sh.id)}" title="Sửa thông tin lô">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <button class="so-action-btn" type="button" data-shipment-action="delete-shipment" data-shipment-id="${escapeHtml(sh.id)}" title="Xóa lô">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }

    function rowHtml(r, idx, tab, shipmentId) {
        const cells = {
            supplier: `<td class="so-cell-supplier">${escapeHtml(r.supplier || '—')}</td>`,
            stt: `<td class="so-cell-stt">${idx + 1}</td>`,
            productName: `<td class="so-cell-product">${escapeHtml(r.productName || '—')}</td>`,
            variant: `<td class="so-cell-variant">${escapeHtml(r.variant || '—')}</td>`,
            qty: `<td class="so-cell-qty">${Number(r.qty) || 0}</td>`,
            sellPrice: priceCell(r.sellPrice, tab),
            costPrice: priceCell(r.costPrice, tab),
            productImage: imgCell(r.productImage),
            invoiceImage: imgCell(r.invoiceImage),
            note: `<td class="so-cell-note">${escapeHtml(r.note || '')}</td>`,
            costNote: `<td class="so-cell-note so-cell-note-cp">${escapeHtml(r.costNote || '')}</td>`,
            status: statusCell(r.status),
            actions: actionsCell(r.id, shipmentId),
        };
        return (
            '<tr class="so-data-row" data-row-id="' +
            escapeHtml(r.id) +
            '" data-shipment-id="' +
            escapeHtml(shipmentId) +
            '">' +
            COLUMNS.filter((c) => activeColVis()[c.key])
                .map((c) => cells[c.key])
                .join('') +
            '</tr>'
        );
    }

    function actionsCell(rowId, shipmentId) {
        return `<td class="so-cell-actions">
            <button class="so-action-btn" type="button" data-row-action="edit" data-row-id="${escapeHtml(rowId)}" data-shipment-id="${escapeHtml(shipmentId)}" title="Sửa">
                <i data-lucide="edit-2"></i>
            </button>
            <button class="so-action-btn" type="button" data-row-action="delete" data-row-id="${escapeHtml(rowId)}" data-shipment-id="${escapeHtml(shipmentId)}" title="Xóa">
                <i data-lucide="trash-2"></i>
            </button>
        </td>`;
    }

    // Resolve a currency code to a "→ VND multiplier" using the tab's
    // own rate as the default. CNY→VND comes from tab.rate when the tab
    // is CNY; for any other currency we fall back to a small built-in
    // rate table so contracts in USD/JPY/KRW/etc. still convert.
    const FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };
    function currencyToVndRate(currency, tab) {
        if (!currency || currency === 'VND') return 1;
        if (tab && tab.currency === currency)
            return Number(tab.rate) || FALLBACK_RATES[currency] || 1;
        return FALLBACK_RATES[currency] || 1;
    }

    function formatDateVN(iso) {
        // Accept YYYY-MM-DD → D/M/YYYY
        if (!iso) return '';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return iso;
        return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`;
    }

    function priceCell(amount, tab) {
        const raw = Number(amount) || 0;
        const isVnd = tab.currency === 'VND';
        const rawText = isVnd ? '' : fmtCurrency(raw, tab.currency);
        const vndText = fmtVnd(toVnd(raw, tab));
        return `<td class="so-cell-money">
            ${rawText ? '<span class="so-cell-money-raw">' + escapeHtml(rawText) + '</span>' : '<span class="so-cell-money-raw">' + escapeHtml(vndText) + '</span>'}
            ${!isVnd ? '<span class="so-cell-money-vnd">≈ ' + escapeHtml(vndText) + '</span>' : ''}
        </td>`;
    }

    function imgCell(url) {
        if (!url) {
            return `<td class="so-cell-img"><span class="so-cell-img-missing">—</span></td>`;
        }
        return `<td class="so-cell-img"><img src="${escapeHtml(url)}" alt="" data-zoomable loading="lazy" /></td>`;
    }

    function statusCell(status) {
        const lbl = STATUS_LABELS[status] || status;
        return `<td class="so-cell-status"><span class="so-status-pill" data-status="${escapeHtml(status || 'draft')}">${escapeHtml(lbl)}</span></td>`;
    }

    function renderFooterTotals() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        // Flatten rows across all shipments for tab-wide totals
        const allRows = (tab.shipments || []).flatMap((s) => s.rows);
        const totalQty = allRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const subtotalVnd = allRows.reduce(
            (s, r) => s + toVnd(Number(r.sellPrice) || 0, tab) * (Number(r.qty) || 0),
            0
        );
        const grandTotal =
            subtotalVnd - (Number(tab.footer.discount) || 0) + (Number(tab.footer.shipping) || 0);

        document.getElementById('soFootTotalQty').textContent = totalQty.toLocaleString('vi-VN');
        document.getElementById('soFootDiscount').value = tab.footer.discount || 0;
        document.getElementById('soFootShipping').value = tab.footer.shipping || 0;
        document.getElementById('soFootGrandTotal').textContent = fmtVnd(grandTotal);

        // Topbar counter — show row count + shipment count
        const shipCount = (tab.shipments || []).length;
        document.getElementById('soTotalRows').textContent =
            `${shipCount} lô · ${allRows.length} dòng`;
        document.getElementById('soTotalQty').textContent = `SL: ${totalQty}`;
    }

    function renderAll() {
        renderTabStrip();
        renderTableHead();
        renderTableBody();
        renderFooterTotals();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // ---------- modals ----------

    function openOrderModal(rowId, shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        editingRowId = rowId || null;
        editingShipmentId = shipmentId || null;
        editingTabId = tab.id;
        const form = document.getElementById('soOrderForm');
        const titleEl = document.getElementById('soModalTitle');
        form.reset();
        clearImgPreview('productImage');
        clearImgPreview('invoiceImage');
        // Defaults for shipment metadata
        form.elements.shipDate.value = new Date().toISOString().slice(0, 10);
        form.elements.shipBatch.value = '';
        form.elements.shipCaseCount.value = 0;
        form.elements.shipWeightKg.value = 0;
        form.elements.shipContractAmount.value = 0;
        form.elements.shipContractCurrency.value = tab.currency || 'VND';

        if (rowId && shipmentId) {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const r = sh?.rows.find((x) => x.id === rowId);
            if (!r) return;
            titleEl.textContent = 'Sửa dòng order';
            form.elements.shipDate.value = sh.date || '';
            form.elements.shipBatch.value = sh.batch || '';
            form.elements.shipCaseCount.value = sh.caseCount || 0;
            form.elements.shipWeightKg.value = sh.weightKg || 0;
            form.elements.shipContractAmount.value = sh.contractAmount || 0;
            form.elements.shipContractCurrency.value = sh.contractCurrency || tab.currency || 'VND';
            form.elements.supplier.value = r.supplier || '';
            form.elements.productName.value = r.productName || '';
            form.elements.variant.value = r.variant || '';
            form.elements.qty.value = r.qty;
            form.elements.sellPrice.value = r.sellPrice;
            form.elements.costPrice.value = r.costPrice;
            form.elements.productImage.value = r.productImage || '';
            form.elements.invoiceImage.value = r.invoiceImage || '';
            form.elements.status.value = r.status || 'draft';
            form.elements.note.value = r.note || '';
            form.elements.costNote.value = r.costNote || '';
            if (r.productImage) updateImgPreview('productImage', r.productImage);
            if (r.invoiceImage) updateImgPreview('invoiceImage', r.invoiceImage);
        } else if (shipmentId) {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            if (sh) {
                titleEl.textContent = `Thêm dòng vào ${sh.batch ? 'Đợt ' + sh.batch : formatDateVN(sh.date)}`;
                form.elements.shipDate.value = sh.date || '';
                form.elements.shipBatch.value = sh.batch || '';
                form.elements.shipCaseCount.value = sh.caseCount || 0;
                form.elements.shipWeightKg.value = sh.weightKg || 0;
                form.elements.shipContractAmount.value = sh.contractAmount || 0;
                form.elements.shipContractCurrency.value =
                    sh.contractCurrency || tab.currency || 'VND';
            }
            form.elements.status.value = 'draft';
        } else {
            titleEl.textContent = 'Tạo Đơn Hàng (Nháp)';
            form.elements.status.value = 'draft';
        }
        const curHint =
            tab.currency === 'VND'
                ? 'VNĐ'
                : `${tab.currency} (≈ ${Number(tab.rate).toLocaleString('vi-VN')} ₫)`;
        document.getElementById('soSellCurHint').textContent = `[${curHint}]`;
        document.getElementById('soCostCurHint').textContent = `[${curHint}]`;
        const updateContractHint = () => {
            const cur = form.elements.shipContractCurrency.value;
            const rate = currencyToVndRate(cur, tab);
            const text = cur === 'VND' ? 'VNĐ' : `${cur} (≈ ${rate.toLocaleString('vi-VN')} ₫)`;
            const el = document.getElementById('soContractCurHint');
            if (el) el.textContent = `[${text}]`;
        };
        updateContractHint();
        form.elements.shipContractCurrency.onchange = updateContractHint;
        updateModalTotals();
        showModal('soOrderModal');
        setTimeout(() => form.elements.productName.focus(), 80);
    }

    function clearImgPreview(name) {
        const el = document.querySelector(`[data-preview-for="${name}"]`);
        if (el) el.innerHTML = '';
    }

    function updateImgPreview(name, url) {
        const el = document.querySelector(`[data-preview-for="${name}"]`);
        if (!el) return;
        el.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="" />` : '';
    }

    function handleOrderSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const shipMeta = {
            date: form.elements.shipDate.value || new Date().toISOString().slice(0, 10),
            batch: form.elements.shipBatch.value.trim(),
            caseCount: Number(form.elements.shipCaseCount.value) || 0,
            weightKg: Number(form.elements.shipWeightKg.value) || 0,
            contractAmount: Number(form.elements.shipContractAmount.value) || 0,
            contractCurrency: form.elements.shipContractCurrency.value,
        };
        const rowData = {
            supplier: form.elements.supplier.value.trim(),
            productName: form.elements.productName.value.trim(),
            variant: form.elements.variant.value.trim(),
            qty: Number(form.elements.qty.value) || 0,
            sellPrice: Number(form.elements.sellPrice.value) || 0,
            costPrice: Number(form.elements.costPrice.value) || 0,
            productImage: form.elements.productImage.value.trim(),
            invoiceImage: form.elements.invoiceImage.value.trim(),
            note: form.elements.note.value.trim(),
            costNote: form.elements.costNote.value.trim(),
            status: form.elements.status.value,
        };
        if (editingRowId && editingShipmentId) {
            // Update existing row; if shipment meta changed (date or batch),
            // either update shipment in place or move row to matching one.
            const sh = tab.shipments.find((s) => s.id === editingShipmentId);
            const dateOrBatchChanged =
                sh && (sh.date !== shipMeta.date || (sh.batch || '') !== shipMeta.batch);
            if (dateOrBatchChanged) {
                const existing = window.SoOrderStorage.findShipment(tab, shipMeta);
                if (existing && existing.id !== editingShipmentId) {
                    window.SoOrderStorage.moveRow(
                        state,
                        tab.id,
                        editingShipmentId,
                        existing.id,
                        editingRowId
                    );
                    window.SoOrderStorage.updateRow(
                        state,
                        tab.id,
                        existing.id,
                        editingRowId,
                        rowData
                    );
                } else {
                    // No other shipment with this date+batch — mutate
                    // current shipment in place
                    window.SoOrderStorage.updateShipment(
                        state,
                        tab.id,
                        editingShipmentId,
                        shipMeta
                    );
                    window.SoOrderStorage.updateRow(
                        state,
                        tab.id,
                        editingShipmentId,
                        editingRowId,
                        rowData
                    );
                }
            } else {
                window.SoOrderStorage.updateRow(
                    state,
                    tab.id,
                    editingShipmentId,
                    editingRowId,
                    rowData
                );
                // Allow editing shipment fields like caseCount, weight,
                // contractAmount via the same form
                window.SoOrderStorage.updateShipment(state, tab.id, editingShipmentId, shipMeta);
            }
            notify('Đã cập nhật dòng order', 'success');
        } else {
            // New row: find or create shipment by date+batch
            let sh = window.SoOrderStorage.findShipment(tab, shipMeta);
            if (!sh) {
                sh = window.SoOrderStorage.addShipment(state, tab.id, shipMeta);
            } else {
                // Update shipment-level fields (caseCount, weightKg, contractAmount)
                // when user provides non-zero values on a re-entry.
                const merged = {
                    caseCount: shipMeta.caseCount || sh.caseCount,
                    weightKg: shipMeta.weightKg || sh.weightKg,
                    contractAmount: shipMeta.contractAmount || sh.contractAmount,
                    contractCurrency: shipMeta.contractCurrency || sh.contractCurrency,
                };
                window.SoOrderStorage.updateShipment(state, tab.id, sh.id, merged);
            }
            window.SoOrderStorage.addRow(state, tab.id, sh.id, rowData);
            notify('Đã thêm dòng order (Nháp)', 'success');
        }
        hideModal('soOrderModal');
        pushSync();
        renderAll();
    }

    function deleteRow(shipmentId, rowId) {
        if (!confirm('Xóa dòng order này?')) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        window.SoOrderStorage.deleteRow(state, tab.id, shipmentId, rowId);
        notify('Đã xóa dòng', 'info');
        pushSync();
        renderAll();
    }

    function deleteShipment(shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        const n = sh.rows.length;
        if (!confirm(`Xóa lô này + ${n} dòng order bên trong?`)) return;
        window.SoOrderStorage.deleteShipment(state, tab.id, shipmentId);
        notify('Đã xóa lô', 'info');
        pushSync();
        renderAll();
    }

    function openShipmentModal(shipmentId) {
        // Reuse order modal but only let user touch shipment fields.
        // Simpler: open order modal preloaded with first row of the
        // shipment (or empty if no rows). User can hit Lưu — submit
        // logic above handles the in-place shipment update.
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        if (sh.rows.length) {
            openOrderModal(sh.rows[0].id, shipmentId);
        } else {
            openOrderModal(null, shipmentId);
        }
    }

    // Tab settings modal — currency + rate
    function openTabSettingsModal(forNew) {
        const form = document.getElementById('soTabSettingsForm');
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (forNew) {
            form.elements.label.value = '';
            form.elements.currency.value = 'VND';
            form.elements.rate.value = 1;
            form.dataset.mode = 'create';
            document.getElementById('soTabDeleteBtn').style.display = 'none';
        } else {
            form.elements.label.value = tab.label;
            form.elements.currency.value = tab.currency;
            form.elements.rate.value = tab.rate;
            form.dataset.mode = 'edit';
            form.dataset.tabId = tab.id;
            // Don't allow deleting last tab
            document.getElementById('soTabDeleteBtn').style.display =
                state.tabs.length > 1 ? '' : 'none';
        }
        showModal('soTabSettingsModal');
        setTimeout(() => form.elements.label.focus(), 80);
    }

    function handleTabSettingsSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const mode = form.dataset.mode;
        const patch = {
            label: form.elements.label.value.trim() || 'Tab',
            currency: form.elements.currency.value,
            rate: Number(form.elements.rate.value) || 1,
        };
        if (mode === 'create') {
            window.SoOrderStorage.addTab(state, patch);
            notify('Đã thêm tab', 'success');
        } else {
            window.SoOrderStorage.updateTab(state, form.dataset.tabId, patch);
            notify('Đã cập nhật tab', 'success');
        }
        hideModal('soTabSettingsModal');
        pushSync();
        renderAll();
    }

    function handleTabDelete() {
        if (!confirm('Xóa tab và toàn bộ order trong tab này?')) return;
        const form = document.getElementById('soTabSettingsForm');
        const tabId = form.dataset.tabId;
        if (!tabId) return;
        if (window.SoOrderStorage.deleteTab(state, tabId)) {
            notify('Đã xóa tab', 'info');
            hideModal('soTabSettingsModal');
            pushSync();
            renderAll();
        } else {
            notify('Cần giữ lại ít nhất 1 tab', 'warning');
        }
    }

    // Column visibility modal (per-tab — title shows which tab the
    // settings apply to so user doesn't think it's global).
    function openColumnModal() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const colVis = window.SoOrderStorage.getColumnVisibility(tab);
        const list = document.getElementById('soColumnList');
        // Update modal heading to reflect per-tab scope
        const modalHead = document.querySelector('#soColumnModal .so-modal-head h2');
        if (modalHead) modalHead.textContent = `Ẩn / hiện cột — tab "${tab.label}"`;
        list.innerHTML = COLUMNS.map(
            (c) => `<label class="so-col-toggle">
                <input type="checkbox" data-col-key="${escapeHtml(c.key)}" ${colVis[c.key] ? 'checked' : ''} />
                <span>${escapeHtml(c.label)}</span>
            </label>`
        ).join('');
        list.querySelectorAll('input[type=checkbox]').forEach((input) => {
            input.addEventListener('change', () => {
                window.SoOrderStorage.setColumnVisibility(
                    state,
                    tab.id,
                    input.dataset.colKey,
                    input.checked
                );
                pushSync();
                renderAll();
            });
        });
        showModal('soColumnModal');
    }

    // Helper — fan a save back to Firestore after every local mutation.
    // Sync layer's own echo-guard handles re-entrance.
    function pushSync() {
        window.SoOrderStorage.Sync?.pushToFirestore?.(state);
    }

    function showModal(id) {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = false;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    function hideModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }

    function openLightbox(src) {
        const lb = document.getElementById('soLightbox');
        const img = document.getElementById('soLightboxImg');
        if (lb && img) {
            img.src = src;
            lb.hidden = false;
        }
    }

    function hideLightbox() {
        const lb = document.getElementById('soLightbox');
        if (lb) lb.hidden = true;
    }

    // ---------- image upload (base64) ----------

    function wireImageUpload() {
        document.querySelectorAll('[data-upload]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const name = btn.dataset.upload;
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = async () => {
                    const f = input.files?.[0];
                    if (!f) return;
                    // Soft limit 2MB to stay friendly with localStorage quota
                    if (f.size > 2 * 1024 * 1024) {
                        notify('Ảnh > 2MB — nên paste URL CDN thay vì upload base64', 'warning');
                    }
                    const dataUrl = await fileToDataUrl(f);
                    const formInput = document.querySelector(`#soOrderForm [name="${name}"]`);
                    if (formInput) {
                        formInput.value = dataUrl;
                        updateImgPreview(name, dataUrl);
                    }
                };
                input.click();
            });
        });
        // Also live-preview when user pastes URL
        ['productImage', 'invoiceImage'].forEach((name) => {
            const input = document.querySelector(`#soOrderForm [name="${name}"]`);
            if (input) {
                input.addEventListener('input', () => {
                    if (input.value && input.value.length < 4096) {
                        updateImgPreview(name, input.value);
                    } else {
                        clearImgPreview(name);
                    }
                });
            }
        });
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    // ---------- wiring ----------

    function wireFooterInputs() {
        document.getElementById('soFootDiscount').addEventListener('change', (e) => {
            const tab = window.SoOrderStorage.getActiveTab(state);
            window.SoOrderStorage.updateFooter(state, tab.id, {
                discount: Number(e.target.value) || 0,
            });
            pushSync();
            renderFooterTotals();
        });
        document.getElementById('soFootShipping').addEventListener('change', (e) => {
            const tab = window.SoOrderStorage.getActiveTab(state);
            window.SoOrderStorage.updateFooter(state, tab.id, {
                shipping: Number(e.target.value) || 0,
            });
            pushSync();
            renderFooterTotals();
        });
    }

    function wireToolbar() {
        document
            .getElementById('soAddTabBtn')
            .addEventListener('click', () => openTabSettingsModal(true));
        document
            .getElementById('soTabSettingsBtn')
            .addEventListener('click', () => openTabSettingsModal(false));
        document
            .getElementById('soCreateOrderBtn')
            .addEventListener('click', () => openOrderModal(null));
        document.getElementById('soColumnSettingsBtn').addEventListener('click', openColumnModal);
        document.getElementById('soTabDeleteBtn').addEventListener('click', handleTabDelete);

        document.getElementById('soOrderForm').addEventListener('submit', handleOrderSubmit);
        document
            .getElementById('soTabSettingsForm')
            .addEventListener('submit', handleTabSettingsSubmit);

        // Generic close handlers
        document.querySelectorAll('[data-so-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.so-modal, .so-lightbox')?.setAttribute('hidden', '');
            });
        });

        // ESC closes any open modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.so-modal:not([hidden]), .so-lightbox:not([hidden])')
                    .forEach((m) => {
                        m.hidden = true;
                    });
            }
        });
    }

    // Recompute "Thành tiền" + footer totals inside the create/edit modal
    // whenever qty/sellPrice/contract currency change. Display amounts are
    // converted to the active tab's currency to stay consistent with the
    // shipment header logic.
    function updateModalTotals() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (!tab) return;
        const form = document.getElementById('soOrderForm');
        if (!form) return;
        const qty = Number(form.elements.qty?.value) || 0;
        const sellPrice = Number(form.elements.sellPrice?.value) || 0;
        const subtotal = qty * sellPrice;
        const rowEl = document.getElementById('soRowThanhTien');
        if (rowEl) rowEl.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
        const qtyEl = document.getElementById('soModalTotalQty');
        if (qtyEl) qtyEl.textContent = qty.toLocaleString('vi-VN');
        const sumEl = document.getElementById('soModalTotalAmount');
        if (sumEl) sumEl.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
        const finalEl = document.getElementById('soModalFinalAmount');
        if (finalEl) finalEl.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
    }

    function wireModalTotals() {
        const form = document.getElementById('soOrderForm');
        if (!form) return;
        ['qty', 'sellPrice', 'costPrice'].forEach((name) => {
            const input = form.elements[name];
            if (input) input.addEventListener('input', updateModalTotals);
        });
    }

    async function init() {
        state = window.SoOrderStorage.load();
        renderAll();
        wireToolbar();
        wireImageUpload();
        wireModalTotals();
        wireFooterInputs();
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Firestore sync — per CLAUDE.md DATA-SYNCHRONIZATION.md:
        //   1. Firestore = source of truth
        //   2. localStorage = offline fallback / warm cache
        //   3. Real-time listener for cross-device sync
        // The `onRemoteUpdate` callback re-reads from localStorage
        // (which Sync just wrote) so the page reflects remote changes.
        if (window.SoOrderStorage.Sync) {
            // Remote handler re-loads via SoOrderStorage.load() so the
            // migration (uiInitialized default-collapse, columnVisibility
            // back-fill, shipment shape heal) is always applied to any
            // FB-sourced data — otherwise raw payload would clobber the
            // post-migration state with un-migrated fields.
            const remoteHandler = () => {
                state = window.SoOrderStorage.load();
                renderAll();
            };
            const ok = await window.SoOrderStorage.Sync.init(remoteHandler);
            if (ok) {
                state = window.SoOrderStorage.load();
                renderAll();
                // Push back so Firestore picks up the first-visit
                // migration (uiInitialized = true, default collapses)
                // — otherwise every fresh device would re-flip these.
                pushSync();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
