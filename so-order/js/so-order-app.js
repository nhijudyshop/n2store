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
    // Inline cell edit state (per-cell dblclick mode) — track ô đang edit
    // để 2 lần dblclick nhanh không clobber input đang gõ.
    let inlineCellEditingKey = null; // `${rowId}|${field}`

    // Whole-table edit toggle. Khi BẬT, mọi ô editable render thành input/select
    // sẵn để gõ nhanh nhiều ô liên tục. Khi TẮT vẫn double-click ô để sửa lẻ.
    // Per-device preference → tách khỏi state đồng bộ Firestore.
    const EDIT_TABLE_MODE_KEY = 'soOrder_editTableMode_v1';
    let editTableMode = (() => {
        try {
            return localStorage.getItem(EDIT_TABLE_MODE_KEY) === 'true';
        } catch {
            return false;
        }
    })();
    function setEditTableMode(on) {
        editTableMode = !!on;
        try {
            localStorage.setItem(EDIT_TABLE_MODE_KEY, editTableMode ? 'true' : 'false');
        } catch {
            /* quota / disabled */
        }
        applyEditTableModeUi();
    }
    function applyEditTableModeUi() {
        document.body.classList.toggle('so-edit-table-mode', editTableMode);
        const btn = document.getElementById('soEditTableBtn');
        if (btn) {
            btn.classList.toggle('is-active', editTableMode);
            btn.setAttribute('aria-pressed', editTableMode ? 'true' : 'false');
        }
    }
    // Inline image modal state — track row đang sửa ảnh nào.
    let inlineImageCtx = null; // { rowId, shipmentId, field, currentUrl }
    // Multi-row modal state. Each entry is { uid, productName, variant, qty,
    // costPrice, sellPrice, productImage, invoiceImage, matchedCode }.
    // `matchedCode` is set when the user picks a suggestion or the typed
    // name exactly matches an existing kho SP.
    let modalRows = [];
    let modalRowCounter = 0;
    let modalMode = 'create'; // 'create' (multi-row) | 'edit' (single-row)
    let activeSuggestUid = null;

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
        // Inline-edit pills in shipment header (date / batch / caseCount / weightKg)
        tbody.querySelectorAll('[data-shipment-edit]').forEach((pill) => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                beginShipmentFieldEdit(pill);
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
                else if (action === 'buy')
                    openPurchaseModal({ scope: 'row', rowId, shipmentId: shId });
            });
        });
        tbody.querySelectorAll('img[data-zoomable]').forEach((img) => {
            img.addEventListener('click', () => openLightbox(img.src));
        });
        // Inline dblclick-to-edit per cell — đăng ký 1 lần ở tbody level
        if (!tbody.__inlineEditBound) {
            tbody.addEventListener('dblclick', onCellDoubleClick);
            tbody.__inlineEditBound = true;
        }
        // Bulk edit mode — delegated handlers cho input/select trong table.
        // Bound 1 lần; chỉ active khi editTableMode = true (DOM có input).
        if (!tbody.__bulkEditBound) {
            tbody.addEventListener('change', onBulkEditChange);
            tbody.addEventListener('keydown', onBulkEditKeydown);
            tbody.addEventListener('focusin', onBulkEditFocusIn);
            tbody.__bulkEditBound = true;
        }
        applyEditTableModeUi();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function onBulkEditChange(e) {
        const el = e.target.closest('[data-edit-field]');
        if (!el) return;
        const field = el.dataset.editField;
        const rowId = el.dataset.rowId;
        const shipmentId = el.dataset.shipmentId;
        if (!field || !rowId || !shipmentId) return;
        commitBulkEditField(rowId, shipmentId, field, el.value);
    }
    function onBulkEditKeydown(e) {
        if (e.key !== 'Enter') return;
        const el = e.target.closest('input[data-edit-field]');
        if (!el || el.tagName !== 'INPUT') return;
        e.preventDefault();
        el.blur(); // triggers change
    }
    function onBulkEditFocusIn(e) {
        const el = e.target.closest('input[data-edit-field="variant"]');
        if (el) attachVariantPickerOnDemand(el);
    }

    function onCellDoubleClick(e) {
        // Bỏ qua dblclick lên image (đã có click-mở-lightbox riêng cho preview;
        // image cells trống và non-empty đều cần mở image modal — handle qua TD).
        const td = e.target.closest('td[data-cell-field]');
        if (!td) return;
        const field = td.dataset.cellField;
        const rowId = td.dataset.rowId;
        const shipmentId = td.dataset.shipmentId;
        if (!field || !rowId || !shipmentId) return;
        if (INLINE_IMAGE_FIELDS.has(field)) {
            // Don't trigger lightbox — preventDefault on image bubbling
            e.preventDefault();
            e.stopPropagation();
            openInlineImageModal(rowId, shipmentId, field);
            return;
        }
        if (!INLINE_EDIT_FIELDS.has(field)) return;
        // Guard: nếu cell đang trong inline edit mode → kệ
        const key = `${rowId}|${field}`;
        if (inlineCellEditingKey === key) return;
        inlineCellEditingKey = key;
        beginInlineCellEdit(td, rowId, shipmentId, field);
    }

    function beginInlineCellEdit(td, rowId, shipmentId, field) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        const origHtml = td.innerHTML;
        const restore = () => {
            td.innerHTML = origHtml;
            inlineCellEditingKey = null;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        };
        const commit = (rawValue) => {
            let value = rawValue;
            if (field === 'qty' || field === 'sellPrice' || field === 'costPrice') {
                value = Number(value) || 0;
                if (field === 'sellPrice' || field === 'costPrice') {
                    value = _maybeExpandVndShorthand(value, tab);
                }
            } else if (typeof value === 'string') {
                value = value.trim();
            }
            // Variant validation
            if (field === 'variant' && value) {
                const cache = window.Web2VariantsCache;
                if (cache && !cache.findByValueExact(value)) {
                    notify(
                        `Biến thể "${value}" chưa có trong Kho Biến Thể — thêm trước rồi pick lại.`,
                        'error'
                    );
                    restore();
                    return;
                }
            }
            // Capture delta TRƯỚC khi update (cho qty change → sync Kho).
            let pendingAdj = null;
            if (field === 'qty') {
                const oldQty = Number(r.qty) || 0;
                const delta = (Number(value) || 0) - oldQty;
                if (delta !== 0) {
                    pendingAdj = { ..._rowToKhoMatch(r), delta };
                }
            }
            window.SoOrderStorage.updateRow(state, tab.id, shipmentId, rowId, { [field]: value });
            if (pendingAdj && pendingAdj.name) adjustKhoPending([pendingAdj]);
            pushSync();
            inlineCellEditingKey = null;
            renderAll();
            flashRow(rowId);
        };

        let inputHtml;
        if (field === 'qty') {
            inputHtml = `<input class="so-edit-input so-edit-num" type="number" min="0" step="1" value="${Number(r.qty) || 0}" autofocus />`;
        } else if (field === 'sellPrice' || field === 'costPrice') {
            inputHtml = `<input class="so-edit-input so-edit-num" type="number" min="0" step="any" value="${Number(r[field]) || 0}" autofocus />`;
        } else if (field === 'status') {
            const opts = Object.entries(STATUS_LABELS)
                .map(
                    ([val, lbl]) =>
                        `<option value="${val}" ${val === (r.status || 'draft') ? 'selected' : ''}>${escapeHtml(lbl)}</option>`
                )
                .join('');
            inputHtml = `<select class="so-edit-select" autofocus>${opts}</select>`;
        } else if (field === 'variant') {
            inputHtml = `<div class="so-edit-variant-wrap">
                <input class="so-edit-input" type="text" value="${escapeHtml(r.variant || '')}" placeholder="Pick từ kho…" autocomplete="off" autofocus />
                <div class="so-edit-variant-dropdown" hidden></div>
            </div>`;
        } else {
            inputHtml = `<input class="so-edit-input" type="text" value="${escapeHtml(r[field] || '')}" autofocus />`;
        }
        td.innerHTML = inputHtml;
        const el = td.querySelector('input, select');
        if (!el) {
            restore();
            return;
        }
        el.focus();
        if (typeof el.select === 'function' && el.tagName === 'INPUT') el.select();

        let committed = false;
        const finish = () => {
            if (committed) return;
            committed = true;
            commit(el.value);
        };
        el.addEventListener('change', finish);
        el.addEventListener('blur', () => {
            // Delay nhẹ để click trên dropdown picker register trước
            setTimeout(() => {
                if (!committed) finish();
            }, 150);
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true; // skip blur commit
                restore();
            }
        });

        if (field === 'variant') {
            const dropdown = td.querySelector('.so-edit-variant-dropdown');
            const refresh = () => {
                const cache = window.Web2VariantsCache;
                if (!cache) {
                    dropdown.hidden = true;
                    return;
                }
                const items = cache.findByValue((el.value || '').trim(), 10);
                if (!items.length) {
                    dropdown.innerHTML = `<div class="so-variant-empty">
                        Kho rỗng. <a href="../web2/variants/index.html" target="_blank">Thêm →</a>
                    </div>`;
                    dropdown.hidden = false;
                    return;
                }
                dropdown.innerHTML = items
                    .map((v) => {
                        const grp = v.groupName
                            ? `<span class="so-variant-group">${escapeHtml(v.groupName)}</span>`
                            : '';
                        return `<button type="button" class="so-variant-item" data-val="${escapeHtml(v.value)}">
                            <span class="so-variant-val">${escapeHtml(v.value)}</span>${grp}
                        </button>`;
                    })
                    .join('');
                dropdown.hidden = false;
                dropdown.querySelectorAll('.so-variant-item').forEach((btn) => {
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('click', () => {
                        el.value = btn.dataset.val;
                        finish();
                    });
                });
            };
            el.addEventListener('focus', refresh);
            el.addEventListener('input', refresh);
            refresh();
        }
    }

    function beginShipmentFieldEdit(pill) {
        const shId = pill.dataset.shipmentId;
        const field = pill.dataset.shipmentEdit;
        if (!shId || !field) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab?.shipments.find((s) => s.id === shId);
        if (!sh) return;
        if (pill.classList.contains('is-editing')) return;
        pill.classList.add('is-editing');
        const origHtml = pill.innerHTML;

        let inputHtml;
        if (field === 'date') {
            const v = sh.date || '';
            inputHtml = `<input class="so-shipment-edit-input" type="date" value="${escapeHtml(v)}" />`;
        } else if (field === 'batch') {
            const v = sh.batch || '';
            inputHtml = `<input class="so-shipment-edit-input" type="text" value="${escapeHtml(v)}" placeholder="Số đợt…" />`;
        } else if (field === 'caseCount' || field === 'weightKg') {
            const v = Number(sh[field]) || 0;
            const step = field === 'weightKg' ? 'any' : '1';
            inputHtml = `<input class="so-shipment-edit-input so-shipment-edit-num" type="number" min="0" step="${step}" value="${v}" />`;
        } else {
            pill.classList.remove('is-editing');
            return;
        }
        pill.innerHTML = inputHtml;
        const el = pill.querySelector('input');
        if (!el) {
            pill.innerHTML = origHtml;
            pill.classList.remove('is-editing');
            return;
        }
        el.focus();
        if (typeof el.select === 'function') el.select();

        let committed = false;
        const restore = () => {
            pill.innerHTML = origHtml;
            pill.classList.remove('is-editing');
            if (window.lucide?.createIcons) window.lucide.createIcons();
        };
        const commit = () => {
            if (committed) return;
            committed = true;
            let value = el.value;
            if (field === 'caseCount' || field === 'weightKg') value = Number(value) || 0;
            else if (typeof value === 'string') value = value.trim();
            window.SoOrderStorage.updateShipment(state, tab.id, shId, { [field]: value });
            pushSync();
            renderAll();
        };
        el.addEventListener('change', commit);
        el.addEventListener('blur', () => {
            if (!committed) commit();
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                restore();
            }
            e.stopPropagation();
        });
        // Prevent click bubbling that would trigger shipment-toggle.
        el.addEventListener('click', (e) => e.stopPropagation());
    }

    function flashRow(rowId) {
        const tr = document.querySelector(`#soTableBody tr.so-data-row[data-row-id="${rowId}"]`);
        if (!tr) return;
        tr.classList.add('is-saved-flash');
        setTimeout(() => tr.classList.remove('is-saved-flash'), 600);
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
        const batchVal = sh.batch || '';
        const batchLabel = batchVal ? `Đợt ${escapeHtml(batchVal)}` : 'Chưa đặt đợt';
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
        const shId = escapeHtml(sh.id);
        const pill = (field, label, title) =>
            `<button type="button" class="so-shipment-edit-pill" data-shipment-edit="${field}" data-shipment-id="${shId}" title="${title}">${label}</button>`;
        return `<tr class="so-shipment-head ${sh.collapsed ? 'is-collapsed' : ''}" data-shipment-id="${shId}">
            <td colspan="${colSpan}">
                <div class="so-shipment-row">
                    <button class="so-shipment-toggle" type="button" data-toggle-shipment="${shId}" title="Đóng/mở">
                        <i data-lucide="${caret}"></i>
                    </button>
                    <span class="so-shipment-meta">
                        <i data-lucide="calendar"></i>
                        <strong>Ngày giao:</strong>
                        ${pill('date', escapeHtml(dateText), 'Click để sửa ngày giao')}
                    </span>
                    <span class="so-shipment-sep">—</span>
                    <span class="so-shipment-meta so-shipment-batch">
                        ${pill('batch', escapeHtml(batchLabel), 'Click để sửa số đợt')}
                    </span>
                    <span class="so-shipment-sep">—</span>
                    <span class="so-shipment-meta">
                        <i data-lucide="package"></i>
                        <strong>${pill('caseCount', `${caseCount} Kiện`, 'Click để sửa số kiện')}</strong> :
                        <span class="so-shipment-kg-strike">${pill('weightKg', `${weightKg.toLocaleString('vi-VN')} KG`, 'Click để sửa số KG')}</span>
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

    // Field nào dblclick được edit inline. STT auto-tính, ảnh có modal riêng,
    // actions là buttons → bỏ qua.
    const INLINE_EDIT_FIELDS = new Set([
        'supplier',
        'productName',
        'variant',
        'qty',
        'sellPrice',
        'costPrice',
        'note',
        'costNote',
        'status',
    ]);
    const INLINE_IMAGE_FIELDS = new Set(['productImage', 'invoiceImage']);

    function rowHtml(r, idx, tab, shipmentId) {
        const rid = escapeHtml(r.id);
        const sid = escapeHtml(shipmentId);
        const edit = editTableMode;
        const cells = {
            supplier: edit
                ? editableCellHtml('supplier', r, rid, sid)
                : `<td class="so-cell-supplier" data-cell-field="supplier" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.supplier || '—')}</td>`,
            stt: `<td class="so-cell-stt">${idx + 1}</td>`,
            productName: edit
                ? editableCellHtml('productName', r, rid, sid)
                : `<td class="so-cell-product" data-cell-field="productName" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.productName || '—')}</td>`,
            variant: edit
                ? editableCellHtml('variant', r, rid, sid)
                : `<td class="so-cell-variant" data-cell-field="variant" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.variant || '—')}</td>`,
            qty: edit
                ? editableCellHtml('qty', r, rid, sid)
                : `<td class="so-cell-qty" data-cell-field="qty" data-row-id="${rid}" data-shipment-id="${sid}">${Number(r.qty) || 0}</td>`,
            sellPrice: edit
                ? editableCellHtml('sellPrice', r, rid, sid)
                : priceCell(r.sellPrice, tab, { rid, sid, field: 'sellPrice' }),
            costPrice: edit
                ? editableCellHtml('costPrice', r, rid, sid)
                : priceCell(r.costPrice, tab, { rid, sid, field: 'costPrice' }),
            productImage: imgCell(r.productImage, { rid, sid, field: 'productImage' }),
            invoiceImage: imgCell(r.invoiceImage, { rid, sid, field: 'invoiceImage' }),
            note: edit
                ? editableCellHtml('note', r, rid, sid)
                : `<td class="so-cell-note" data-cell-field="note" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.note || '')}</td>`,
            costNote: edit
                ? editableCellHtml('costNote', r, rid, sid)
                : `<td class="so-cell-note so-cell-note-cp" data-cell-field="costNote" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.costNote || '')}</td>`,
            status: edit
                ? editableCellHtml('status', r, rid, sid)
                : statusCell(r.status, { rid, sid }),
            actions: actionsCell(r.id, shipmentId),
        };
        return (
            '<tr class="so-data-row" data-row-id="' +
            rid +
            '" data-shipment-id="' +
            sid +
            '">' +
            COLUMNS.filter((c) => activeColVis()[c.key])
                .map((c) => cells[c.key])
                .join('') +
            '</tr>'
        );
    }

    // Tạo HTML <td> chứa input/select khi whole-table edit mode bật.
    // Field nào không có handler riêng → text input. Status → select.
    // Variant → wrapper với picker dropdown (lazy refresh khi focus/typing).
    function editableCellHtml(field, r, rid, sid) {
        const dataAttr = `data-cell-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}"`;
        const tdClass =
            {
                qty: 'so-cell-qty',
                sellPrice: 'so-cell-money',
                costPrice: 'so-cell-money',
                note: 'so-cell-note',
                costNote: 'so-cell-note so-cell-note-cp',
                status: 'so-cell-status',
                variant: 'so-cell-variant',
                supplier: 'so-cell-supplier',
                productName: 'so-cell-product',
            }[field] || '';
        if (field === 'qty') {
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
                <input class="so-edit-input so-edit-num" type="number" min="0" step="1" value="${Number(r.qty) || 0}" data-edit-field="qty" data-row-id="${rid}" data-shipment-id="${sid}" />
            </td>`;
        }
        if (field === 'sellPrice' || field === 'costPrice') {
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
                <input class="so-edit-input so-edit-num" type="number" min="0" step="any" value="${Number(r[field]) || 0}" data-edit-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}" />
            </td>`;
        }
        if (field === 'status') {
            const opts = Object.entries(STATUS_LABELS)
                .map(
                    ([val, lbl]) =>
                        `<option value="${val}" ${val === (r.status || 'draft') ? 'selected' : ''}>${escapeHtml(lbl)}</option>`
                )
                .join('');
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
                <select class="so-edit-select" data-edit-field="status" data-row-id="${rid}" data-shipment-id="${sid}">${opts}</select>
            </td>`;
        }
        if (field === 'variant') {
            return `<td class="${tdClass} so-cell-edit so-cell-edit-variant" ${dataAttr}>
                <div class="so-edit-variant-wrap">
                    <input class="so-edit-input" type="text" value="${escapeHtml(r.variant || '')}" placeholder="Pick từ kho…" autocomplete="off" data-edit-field="variant" data-row-id="${rid}" data-shipment-id="${sid}" />
                    <div class="so-edit-variant-dropdown" hidden></div>
                </div>
            </td>`;
        }
        return `<td class="${tdClass} so-cell-edit" ${dataAttr}>
            <input class="so-edit-input" type="text" value="${escapeHtml(r[field] || '')}" data-edit-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}" />
        </td>`;
    }

    // Commit 1 field từ bulk edit mode. Re-use validation (variant) +
    // pushSync + flashRow giống dblclick path để hành vi nhất quán.
    // Quick-input shorthand: gõ "100" cho VND tự hiểu là 100.000.
    // Chỉ áp dụng khi tiền tệ tab là VND và giá > 0 và giá < 1000.
    function _maybeExpandVndShorthand(value, tab) {
        const v = Number(value) || 0;
        if (!tab || tab.currency !== 'VND') return v;
        if (v > 0 && v < 1000) return v * 1000;
        return v;
    }

    function commitBulkEditField(rowId, shipmentId, field, rawValue) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        let value = rawValue;
        if (field === 'qty' || field === 'sellPrice' || field === 'costPrice') {
            value = Number(value) || 0;
            if (field === 'sellPrice' || field === 'costPrice') {
                const expanded = _maybeExpandVndShorthand(value, tab);
                if (expanded !== value) {
                    value = expanded;
                    const input = document.querySelector(
                        `#soTableBody input[data-edit-field="${field}"][data-row-id="${rowId}"]`
                    );
                    if (input) input.value = String(value);
                }
            }
        } else if (typeof value === 'string') {
            value = value.trim();
        }
        if (field === 'variant' && value) {
            const cache = window.Web2VariantsCache;
            if (cache && !cache.findByValueExact(value)) {
                notify(
                    `Biến thể "${value}" chưa có trong Kho Biến Thể — thêm trước rồi pick lại.`,
                    'error'
                );
                // Revert input value
                const input = document.querySelector(
                    `#soTableBody [data-edit-field="variant"][data-row-id="${rowId}"]`
                );
                if (input) input.value = r.variant || '';
                return;
            }
        }
        if (r[field] === value) return; // no-op skip
        // Capture delta cho qty change → sync Kho.
        let pendingAdj = null;
        if (field === 'qty') {
            const oldQty = Number(r.qty) || 0;
            const delta = (Number(value) || 0) - oldQty;
            if (delta !== 0) {
                pendingAdj = { ..._rowToKhoMatch(r), delta };
            }
        }
        window.SoOrderStorage.updateRow(state, tab.id, shipmentId, rowId, { [field]: value });
        if (pendingAdj && pendingAdj.name) adjustKhoPending([pendingAdj]);
        pushSync();
        renderFooterTotals();
        flashRow(rowId);
    }

    // Variant picker dropdown — chỉ kích hoạt khi user thực sự focus vào input
    // variant trong bulk edit mode. Tránh build dropdown cho tất cả rows upfront.
    function attachVariantPickerOnDemand(input) {
        if (input.__variantPickerBound) return;
        input.__variantPickerBound = true;
        const wrap = input.closest('.so-edit-variant-wrap');
        const dropdown = wrap?.querySelector('.so-edit-variant-dropdown');
        if (!dropdown) return;
        const refresh = () => {
            const cache = window.Web2VariantsCache;
            if (!cache) {
                dropdown.hidden = true;
                return;
            }
            const items = cache.findByValue((input.value || '').trim(), 10);
            if (!items.length) {
                dropdown.innerHTML = `<div class="so-variant-empty">
                    Kho rỗng. <a href="../web2/variants/index.html" target="_blank">Thêm →</a>
                </div>`;
                dropdown.hidden = false;
                return;
            }
            dropdown.innerHTML = items
                .map((v) => {
                    const grp = v.groupName
                        ? `<span class="so-variant-group">${escapeHtml(v.groupName)}</span>`
                        : '';
                    return `<button type="button" class="so-variant-item" data-val="${escapeHtml(v.value)}">
                        <span class="so-variant-val">${escapeHtml(v.value)}</span>${grp}
                    </button>`;
                })
                .join('');
            dropdown.hidden = false;
            dropdown.querySelectorAll('.so-variant-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    input.value = btn.dataset.val;
                    dropdown.hidden = true;
                    commitBulkEditField(
                        input.dataset.rowId,
                        input.dataset.shipmentId,
                        'variant',
                        input.value
                    );
                });
            });
        };
        input.addEventListener('focus', refresh);
        input.addEventListener('input', refresh);
        input.addEventListener('blur', () => {
            // Delay nhẹ để click button trên dropdown register trước khi ẩn
            setTimeout(() => {
                if (dropdown) dropdown.hidden = true;
            }, 150);
        });
    }

    function actionsCell(rowId, shipmentId) {
        return `<td class="so-cell-actions">
            <button class="so-action-btn so-action-btn-buy" type="button" data-row-action="buy" data-row-id="${escapeHtml(rowId)}" data-shipment-id="${escapeHtml(shipmentId)}" title="Mua hàng dòng này">
                <i data-lucide="shopping-cart"></i>
            </button>
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

    function priceCell(amount, tab, meta) {
        const raw = Number(amount) || 0;
        const isVnd = tab.currency === 'VND';
        const rawText = isVnd ? '' : fmtCurrency(raw, tab.currency);
        const vndText = fmtVnd(toVnd(raw, tab));
        const attrs = meta
            ? ` data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"`
            : '';
        return `<td class="so-cell-money"${attrs}>
            ${rawText ? '<span class="so-cell-money-raw">' + escapeHtml(rawText) + '</span>' : '<span class="so-cell-money-raw">' + escapeHtml(vndText) + '</span>'}
            ${!isVnd ? '<span class="so-cell-money-vnd">≈ ' + escapeHtml(vndText) + '</span>' : ''}
        </td>`;
    }

    function imgCell(url, meta) {
        const attrs = meta
            ? ` data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"`
            : '';
        if (!url) {
            return `<td class="so-cell-img"${attrs}><span class="so-cell-img-missing">—</span></td>`;
        }
        return `<td class="so-cell-img"${attrs}><img src="${escapeHtml(url)}" alt="" data-zoomable loading="lazy" /></td>`;
    }

    function statusCell(status, meta) {
        const lbl = STATUS_LABELS[status] || status;
        const attrs = meta
            ? ` data-cell-field="status" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"`
            : '';
        return `<td class="so-cell-status"${attrs}><span class="so-status-pill" data-status="${escapeHtml(status || 'draft')}">${escapeHtml(lbl)}</span></td>`;
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
        renderPurchasePanel();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // ---------- Purchase drawer (Mua hàng per NCC + global, right-side toggle) ----------
    function _ensurePurchaseDrawer() {
        // Cleanup any legacy inline panel (created bởi version cũ).
        const oldInline = document.getElementById('soPurchasePanel');
        if (oldInline && !oldInline.classList.contains('so-purchase-drawer')) {
            oldInline.remove();
        }
        let drawer = document.getElementById('soPurchaseDrawer');
        if (drawer) {
            return {
                drawer,
                body: drawer.querySelector('.so-purchase-drawer-body'),
                toggle: document.getElementById('soPurchaseToggle'),
            };
        }
        // Inline SVG — không phụ thuộc lucide CDN, hoạt động ngay cả offline.
        const cartSvg = `<svg class="so-purchase-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
        const xSvg = `<svg class="so-purchase-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

        // FAB toggle button (right edge, mặc định ẩn khi không có NCC nào).
        const toggle = document.createElement('button');
        toggle.id = 'soPurchaseToggle';
        toggle.type = 'button';
        toggle.className = 'so-purchase-toggle';
        toggle.hidden = true;
        toggle.title = 'Mua hàng theo NCC';
        toggle.innerHTML =
            cartSvg +
            '<span class="so-purchase-toggle-label">Mua hàng</span>' +
            '<span class="so-purchase-toggle-badge">0</span>';
        document.body.appendChild(toggle);

        drawer = document.createElement('aside');
        drawer.id = 'soPurchaseDrawer';
        drawer.className = 'so-purchase-drawer';
        drawer.innerHTML = `
            <div class="so-purchase-drawer-backdrop" data-so-drawer-close></div>
            <div class="so-purchase-drawer-panel">
                <header class="so-purchase-drawer-head">
                    <span class="so-purchase-drawer-title">
                        ${cartSvg}
                        <strong>Mua hàng theo NCC</strong>
                    </span>
                    <button class="so-purchase-drawer-close" type="button" data-so-drawer-close title="Đóng">
                        ${xSvg}
                    </button>
                </header>
                <div class="so-purchase-drawer-body"></div>
            </div>`;
        document.body.appendChild(drawer);
        toggle.addEventListener('click', () => {
            drawer.classList.toggle('is-open');
        });
        drawer.querySelectorAll('[data-so-drawer-close]').forEach((el) => {
            el.addEventListener('click', () => drawer.classList.remove('is-open'));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
                drawer.classList.remove('is-open');
            }
        });
        return {
            drawer,
            body: drawer.querySelector('.so-purchase-drawer-body'),
            toggle,
        };
    }

    function renderPurchasePanel() {
        const els = _ensurePurchaseDrawer();
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (!tab) {
            els.toggle.hidden = true;
            els.drawer.classList.remove('is-open');
            return;
        }
        const groups = {};
        let totalAllRows = 0;
        let totalAllValue = 0;
        for (const sh of tab.shipments || []) {
            for (const r of sh.rows || []) {
                const supplier = (r.supplier || '').trim();
                if (!supplier) continue;
                const name = (r.productName || '').trim();
                const qty = Number(r.qty) || 0;
                if (!name || qty <= 0) continue;
                if (!groups[supplier]) {
                    groups[supplier] = { supplier, rows: [], total: 0 };
                }
                groups[supplier].rows.push(r);
                const cost = Number(r.costPrice) || 0;
                groups[supplier].total += qty * cost;
                totalAllRows += 1;
                totalAllValue += qty * cost;
            }
        }
        const suppliers = Object.values(groups).sort((a, b) =>
            a.supplier.localeCompare(b.supplier)
        );
        if (!suppliers.length) {
            els.toggle.hidden = true;
            els.drawer.classList.remove('is-open');
            return;
        }
        els.toggle.hidden = false;
        const badge = els.toggle.querySelector('.so-purchase-toggle-badge');
        if (badge) badge.textContent = String(suppliers.length);

        const rate = Number(tab.rate) || 1;
        const ccy = tab.currency || 'VND';
        const totalAllValueVnd = Math.round(totalAllValue * rate);
        els.body.innerHTML = `<div class="so-purchase-head">
                <span class="so-purchase-hint">${suppliers.length} NCC trong ${escapeHtml(tab.label || '')}</span>
                <button class="so-purchase-btn so-purchase-btn-all" type="button" data-purchase-all>
                    <i data-lucide="shopping-bag"></i>
                    Mua hàng tất cả (${totalAllRows} SP · ${ccy !== 'VND' ? totalAllValueVnd.toLocaleString('vi-VN') + '₫' : totalAllValue.toLocaleString('vi-VN') + '₫'})
                </button>
            </div>
            <div class="so-purchase-grid">
                ${suppliers
                    .map((g) => {
                        const totalVnd = Math.round(g.total * rate);
                        return `<div class="so-purchase-card">
                        <div class="so-purchase-card-head">
                            <span class="so-purchase-ncc">${escapeHtml(g.supplier)}</span>
                            <span class="so-purchase-count">${g.rows.length} SP</span>
                        </div>
                        <div class="so-purchase-totals">
                            <span class="so-purchase-currency">${escapeHtml(ccy)}: ${g.total.toLocaleString('vi-VN')}</span>
                            ${ccy !== 'VND' ? `<span class="so-purchase-vnd">≈ ${totalVnd.toLocaleString('vi-VN')}₫</span>` : ''}
                        </div>
                        <button class="so-purchase-btn" type="button" data-purchase-supplier="${escapeHtml(g.supplier)}">
                            <i data-lucide="check-circle"></i> Mua hàng
                        </button>
                    </div>`;
                    })
                    .join('')}
            </div>`;
        els.body.querySelectorAll('[data-purchase-supplier]').forEach((btn) => {
            btn.addEventListener('click', () =>
                openPurchaseModal({ scope: 'supplier', supplier: btn.dataset.purchaseSupplier })
            );
        });
        const allBtn = els.body.querySelector('[data-purchase-all]');
        if (allBtn) {
            allBtn.addEventListener('click', () => openPurchaseModal({ scope: 'all' }));
        }
    }

    // ---------- Purchase modal (lấy SP trực tiếp từ rows local) ----------
    // _currentPurchaseItems: items đang hiển thị trong modal (1 item = 1 row trong tab).
    // Confirm flow: upsertPending (auto Lưu Nháp) → confirmPurchase với codes trả về.
    let _currentPurchaseItems = [];

    /**
     * Mở modal mua hàng.
     * opts:
     *   - scope: 'all' | 'supplier' | 'row'
     *   - supplier?: string (cho scope='supplier')
     *   - rowId?: string, shipmentId?: string (cho scope='row')
     */
    function openPurchaseModal(opts) {
        if (!window.Web2ProductsApi) {
            notify('Web2ProductsApi chưa load', 'error');
            return;
        }
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (!tab) {
            notify('Không có tab active', 'error');
            return;
        }
        const scope = (opts && opts.scope) || 'all';
        const rate = Number(tab.rate) || 1;
        const ccy = tab.currency || 'VND';
        const tabLabel = (tab.label || '').trim();

        const items = [];
        for (const sh of tab.shipments || []) {
            for (const r of sh.rows || []) {
                const supplier = (r.supplier || '').trim();
                const name = (r.productName || '').trim();
                const qty = Number(r.qty) || 0;
                if (!name || qty <= 0) continue;
                if (scope === 'supplier' && supplier !== opts.supplier) continue;
                if (scope === 'row' && r.id !== opts.rowId) continue;
                if (scope !== 'row' && !supplier) continue;
                items.push({
                    key: r.id,
                    rowId: r.id,
                    shipmentId: sh.id,
                    name,
                    variant: (r.variant || '').trim() || null,
                    qty,
                    supplier: supplier || null,
                    costPriceRaw: Number(r.costPrice) || 0,
                    sellPriceRaw: Number(r.sellPrice) || 0,
                    costPriceVnd: Math.round((Number(r.costPrice) || 0) * rate),
                    sellPriceVnd: Math.round((Number(r.sellPrice) || 0) * rate),
                    imageUrl: r.productImage || null,
                    note: tabLabel || null,
                });
            }
        }
        _currentPurchaseItems = items;

        let title;
        if (scope === 'supplier') title = `Mua hàng từ ${opts.supplier}`;
        else if (scope === 'row') title = items[0] ? `Mua hàng SP: ${items[0].name}` : 'Mua hàng';
        else title = `Mua hàng tất cả NCC — ${tabLabel || tab.id}`;

        let modal = document.getElementById('soPurchaseModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'soPurchaseModal';
            modal.className = 'so-modal';
            modal.hidden = true;
            modal.innerHTML = `
                <div class="so-modal-backdrop" data-so-purchase-close></div>
                <div class="so-modal-panel so-modal-panel-narrow">
                    <header class="so-modal-head">
                        <h2 id="soPurchaseTitle">Mua hàng</h2>
                        <button class="so-modal-close" type="button" data-so-purchase-close>
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-modal-body">
                        <div class="so-purchase-toolbar">
                            <label><input type="checkbox" id="soPurchaseCheckAll" checked /> Chọn tất cả</label>
                            <span class="so-purchase-summary" id="soPurchaseSummary"></span>
                        </div>
                        <div class="so-purchase-list" id="soPurchaseList"></div>
                    </div>
                    <footer class="so-modal-foot">
                        <button class="btn-secondary" type="button" data-so-purchase-close>Hủy</button>
                        <button class="btn-primary" type="button" id="soPurchaseConfirmBtn">
                            <i data-lucide="check"></i> Xác nhận mua hàng
                        </button>
                    </footer>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-so-purchase-close]').forEach((el) => {
                el.addEventListener('click', () => {
                    modal.hidden = true;
                });
            });
            document.getElementById('soPurchaseCheckAll').addEventListener('change', (e) => {
                document.querySelectorAll('#soPurchaseList input[type=checkbox]').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
                _updatePurchaseSummary();
            });
            document
                .getElementById('soPurchaseConfirmBtn')
                .addEventListener('click', confirmPurchaseFromModal);
        }
        document.getElementById('soPurchaseTitle').textContent = title;
        const listEl = document.getElementById('soPurchaseList');
        const checkAll = document.getElementById('soPurchaseCheckAll');
        if (checkAll) checkAll.checked = true;

        if (!items.length) {
            listEl.innerHTML = `<div class="so-purchase-empty">Không có SP hợp lệ. Kiểm tra cột NCC, Tên SP, SL.</div>`;
            _updatePurchaseSummary();
            modal.hidden = false;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        const showSupplier = scope !== 'supplier';
        listEl.innerHTML = items
            .map((it) => {
                const lineCost = it.qty * it.costPriceRaw;
                const lineCostVnd = it.qty * it.costPriceVnd;
                return `<label class="so-purchase-row">
                    <input type="checkbox" data-purchase-key="${escapeHtml(it.key)}" data-purchase-qty="${it.qty}" data-purchase-cost-vnd="${lineCostVnd}" checked />
                    ${showSupplier && it.supplier ? `<span class="so-purchase-supplier-tag">${escapeHtml(it.supplier)}</span>` : ''}
                    <span class="so-purchase-name">${escapeHtml(it.name)}</span>
                    ${it.variant ? `<span class="so-purchase-variant">${escapeHtml(it.variant)}</span>` : ''}
                    <span class="so-purchase-qty">×${it.qty}</span>
                    <span class="so-purchase-line-cost">${ccy !== 'VND' ? `${lineCost.toLocaleString('vi-VN')} ${ccy} · ` : ''}${lineCostVnd.toLocaleString('vi-VN')}₫</span>
                </label>`;
            })
            .join('');
        listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => {
            cb.addEventListener('change', _updatePurchaseSummary);
        });
        _updatePurchaseSummary();
        modal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function _updatePurchaseSummary() {
        const checks = document.querySelectorAll('#soPurchaseList input[type=checkbox]:checked');
        let totalQty = 0;
        let totalCostVnd = 0;
        checks.forEach((cb) => {
            totalQty += Number(cb.dataset.purchaseQty) || 0;
            totalCostVnd += Number(cb.dataset.purchaseCostVnd) || 0;
        });
        const el = document.getElementById('soPurchaseSummary');
        if (el) {
            el.textContent = `${checks.length} SP · ${totalQty} cái · ${totalCostVnd.toLocaleString('vi-VN')}₫`;
        }
    }

    async function confirmPurchaseFromModal() {
        const modal = document.getElementById('soPurchaseModal');
        const btn = document.getElementById('soPurchaseConfirmBtn');
        if (!btn || btn.disabled) return;
        const selectedKeys = new Set(
            Array.from(document.querySelectorAll('#soPurchaseList input[type=checkbox]:checked'))
                .map((cb) => cb.dataset.purchaseKey)
                .filter(Boolean)
        );
        const selectedItems = _currentPurchaseItems.filter((it) => selectedKeys.has(it.key));
        if (!selectedItems.length) {
            notify('Chưa chọn SP nào', 'warning');
            return;
        }
        const missingSupplier = selectedItems.filter((it) => !it.supplier);
        if (missingSupplier.length) {
            notify(
                `${missingSupplier.length} SP chưa có NCC: ${missingSupplier.map((it) => it.name).join(', ')}`,
                'error'
            );
            return;
        }
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            // 1. Auto Lưu Nháp: upsertPending để có code trong DB.
            const upsertPayload = selectedItems.map((it) => ({
                name: it.name,
                variant: it.variant,
                qty: it.qty,
                costPrice: it.costPriceVnd,
                sellPrice: it.sellPriceVnd,
                supplier: it.supplier,
                imageUrl: it.imageUrl,
                note: it.note,
            }));
            const upsertRes = await window.Web2ProductsApi.upsertPending(upsertPayload);
            const upsertItems = (upsertRes && upsertRes.items) || [];
            const codes = upsertItems.map((i) => i.code).filter(Boolean);
            if (!codes.length) {
                throw new Error('Không tạo/cập nhật được SP nào trong Kho');
            }
            if (window.Web2ProductsCache) {
                window.Web2ProductsCache.pushTickle({ action: 'so-order-buy' });
            }

            // 2. Confirm purchase: status='DANG_BAN', stock += pending_qty.
            const confirmRes = await window.Web2ProductsApi.confirmPurchase({ codes });
            const confirmedItems = (confirmRes && confirmRes.items) || [];

            // Merge variant info từ selectedItems (confirmRes ko trả variant).
            const variantByCode = new Map();
            for (let i = 0; i < upsertItems.length && i < selectedItems.length; i++) {
                if (upsertItems[i].code) {
                    variantByCode.set(upsertItems[i].code, selectedItems[i].variant);
                }
            }
            const enriched = confirmedItems.map((p) => ({
                ...p,
                variant: variantByCode.get(p.code) || null,
            }));

            const supplierLabel = (() => {
                const uniq = Array.from(new Set(selectedItems.map((it) => it.supplier)));
                return uniq.length === 1 ? uniq[0] : `${uniq.length} NCC`;
            })();
            notify(`Đã mua ${confirmedItems.length} SP từ ${supplierLabel}`, 'success');
            modal.hidden = true;
            openBarcodePrintModal(enriched, supplierLabel);
        } catch (e) {
            notify('Lỗi mua hàng: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    // ---------- Barcode print modal ----------
    function openBarcodePrintModal(items, supplier) {
        let modal = document.getElementById('soBarcodeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'soBarcodeModal';
            modal.className = 'so-modal';
            modal.hidden = true;
            modal.innerHTML = `
                <div class="so-modal-backdrop" data-so-barcode-close></div>
                <div class="so-modal-panel">
                    <header class="so-modal-head">
                        <h2>In mã vạch — <span id="soBarcodeSupplier">—</span></h2>
                        <button class="so-modal-close" type="button" data-so-barcode-close>
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-modal-body">
                        <div class="so-barcode-toolbar">
                            <label><input type="checkbox" id="soBarcodeCheckAll" checked /> Chọn tất cả</label>
                            <span class="so-barcode-summary" id="soBarcodeSummary"></span>
                        </div>
                        <div class="so-barcode-list" id="soBarcodeList"></div>
                    </div>
                    <footer class="so-modal-foot">
                        <button class="btn-secondary" type="button" data-so-barcode-close>Bỏ qua</button>
                        <button class="btn-primary" type="button" id="soBarcodePrintBtn">
                            <i data-lucide="printer"></i> In mã vạch
                        </button>
                    </footer>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-so-barcode-close]').forEach((el) => {
                el.addEventListener('click', () => {
                    modal.hidden = true;
                });
            });
            document.getElementById('soBarcodeCheckAll').addEventListener('change', (e) => {
                document.querySelectorAll('#soBarcodeList input[type=checkbox]').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
                _updateBarcodeSummary();
            });
            document.getElementById('soBarcodePrintBtn').addEventListener('click', printBarcodes);
        }
        document.getElementById('soBarcodeSupplier').textContent = supplier;
        const listEl = document.getElementById('soBarcodeList');
        listEl.innerHTML = items
            .map((p) => {
                return `<label class="so-barcode-row">
                <input type="checkbox" data-bc-code="${escapeHtml(p.code)}" data-bc-name="${escapeHtml(p.name)}" checked />
                <span class="so-barcode-code">[${escapeHtml(p.code)}]</span>
                <span class="so-barcode-name">${escapeHtml(p.name)}</span>
                ${p.variant ? `<span class="so-barcode-variant">${escapeHtml(p.variant)}</span>` : ''}
            </label>`;
            })
            .join('');
        listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => {
            cb.addEventListener('change', _updateBarcodeSummary);
        });
        _updateBarcodeSummary();
        modal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function _updateBarcodeSummary() {
        const checks = document.querySelectorAll('#soBarcodeList input[type=checkbox]:checked');
        const el = document.getElementById('soBarcodeSummary');
        if (el) el.textContent = `${checks.length} mã sẽ in`;
    }

    function printBarcodes() {
        const selected = Array.from(
            document.querySelectorAll('#soBarcodeList input[type=checkbox]:checked')
        ).map((cb) => ({
            code: cb.dataset.bcCode,
            name: cb.dataset.bcName,
        }));
        if (!selected.length) {
            notify('Chưa chọn mã nào', 'warning');
            return;
        }
        // Open print window with barcode layout
        const w = window.open('', '_blank', 'width=700,height=900');
        if (!w) {
            notify('Trình duyệt chặn popup — cho phép popup rồi thử lại', 'warning');
            return;
        }
        const labels = selected
            .map(
                (p) => `
            <div class="bc-label">
                <div class="bc-svg-wrap"><svg class="bc-svg" data-bc="${escapeHtml(p.code)}"></svg></div>
                <div class="bc-code">${escapeHtml(p.code)}</div>
                <div class="bc-name">${escapeHtml(p.name)}</div>
            </div>`
            )
            .join('');
        w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>In mã vạch</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
body{font-family:'Inter',sans-serif;margin:0;padding:8mm;background:#fff;color:#000}
.bc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
.bc-label{border:1px dashed #999;border-radius:4px;padding:6mm 4mm;text-align:center;page-break-inside:avoid}
.bc-svg-wrap{display:flex;justify-content:center}
.bc-svg{max-width:100%;height:auto}
.bc-code{font-family:'SF Mono',monospace;font-size:11px;color:#475569;margin-top:2mm}
.bc-name{font-size:12px;font-weight:600;margin-top:1mm;line-height:1.3}
@media print {.no-print{display:none}}
.no-print{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:8px 0 12px;margin-bottom:10px;display:flex;gap:8px;justify-content:center}
.btn{background:#4338ca;color:#fff;border:0;padding:8px 18px;border-radius:6px;font-weight:600;cursor:pointer}
.btn-2{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}
</style></head><body>
<div class="no-print">
    <button class="btn" onclick="window.print()">🖨 In</button>
    <button class="btn btn-2" onclick="window.close()">Đóng</button>
</div>
<div class="bc-grid">${labels}</div>
<script>
window.addEventListener('load', () => {
    document.querySelectorAll('.bc-svg').forEach(el => {
        try {
            JsBarcode(el, el.dataset.bc, { format: 'CODE128', width: 1.6, height: 50, fontSize: 11, margin: 4 });
        } catch (e) { el.outerHTML = '<div style="color:red">Lỗi: ' + e.message + '</div>'; }
    });
});
</script>
</body></html>`);
        w.document.close();
        notify(`Đã mở cửa sổ in ${selected.length} mã vạch`, 'success');
    }

    // ---------- modals ----------

    // ---------- modal multi-row helpers ----------

    function _newModalRow(prefill = {}) {
        modalRowCounter += 1;
        return {
            uid: 'r' + modalRowCounter + '-' + Math.random().toString(36).slice(2, 7),
            productName: prefill.productName || '',
            variant: prefill.variant || '',
            qty: Number.isFinite(Number(prefill.qty)) ? Number(prefill.qty) : 1,
            costPrice: Number(prefill.costPrice) || 0,
            sellPrice: Number(prefill.sellPrice) || 0,
            productImage: prefill.productImage || '',
            invoiceImage: prefill.invoiceImage || '',
            matchedCode: prefill.matchedCode || null,
        };
    }

    function modalRowHtml(row, idx, total) {
        const matched = row.matchedCode
            ? window.Web2ProductsCache?.findByCode?.(row.matchedCode) || null
            : window.Web2ProductsCache?.findByNameExact?.(row.productName) || null;
        const stockText = matched
            ? `<span class="so-row-stock ${(matched.stock || 0) <= 0 ? 'is-zero' : (matched.stock || 0) < 5 ? 'is-low' : ''}">
                   <i data-lucide="package-check"></i> Tồn: <strong>${matched.stock ?? 0}</strong>
               </span>`
            : '';
        const badge = matched
            ? `<span class="so-row-kho-badge" title="Đã có trong Kho SP Web 2.0 — mã ${escapeHtml(matched.code)}">
                   <i data-lucide="check-circle-2"></i> Đã có ở kho
               </span>`
            : `<span class="so-row-kho-badge so-row-kho-new" title="Sẽ tự thêm vào Kho SP Web 2.0 khi lưu">
                   <i data-lucide="plus-circle"></i> SP mới
               </span>`;
        const delBtnHtml =
            modalMode === 'create' && total > 1
                ? `<button type="button" class="so-action-btn so-row-del" data-action="remove-row" data-uid="${row.uid}" title="Xóa dòng">
                       <i data-lucide="x"></i>
                   </button>`
                : '';
        return `
        <tr class="so-modal-row" data-uid="${row.uid}">
            <td class="so-td-stt">${idx + 1}</td>
            <td class="so-td-product">
                <div class="so-product-input-wrap">
                    <input
                        type="text"
                        data-field="productName"
                        data-uid="${row.uid}"
                        required
                        placeholder="VD: 2003 B5 SET ÁO DÀI"
                        class="so-input-v2 so-input-product-name"
                        autocomplete="off"
                        value="${escapeHtml(row.productName)}"
                    />
                    <div class="so-row-meta">
                        ${badge}
                        ${stockText}
                    </div>
                    <div class="so-suggest-dropdown" data-suggest-for="${row.uid}" hidden></div>
                </div>
            </td>
            <td class="so-td-variant">
                <div class="so-variant-picker-wrap">
                    <input
                        type="text"
                        data-field="variant"
                        data-uid="${row.uid}"
                        placeholder="Pick từ kho..."
                        class="so-input-v2"
                        value="${escapeHtml(row.variant)}"
                        autocomplete="off"
                    />
                    <div class="so-variant-dropdown" data-variant-for="${row.uid}" hidden></div>
                </div>
            </td>
            <td class="so-td-qty">
                <input
                    type="number"
                    data-field="qty"
                    data-uid="${row.uid}"
                    min="0"
                    value="${row.qty}"
                    required
                    class="so-input-v2 so-input-num"
                />
            </td>
            <td class="so-td-money">
                <input
                    type="number"
                    data-field="costPrice"
                    data-uid="${row.uid}"
                    min="0"
                    step="any"
                    value="${row.costPrice}"
                    class="so-input-v2 so-input-num so-input-money"
                />
            </td>
            <td class="so-td-money">
                <input
                    type="number"
                    data-field="sellPrice"
                    data-uid="${row.uid}"
                    min="0"
                    step="any"
                    value="${row.sellPrice}"
                    class="so-input-v2 so-input-num so-input-money"
                />
            </td>
            <td class="so-td-money so-td-total">
                <span data-total-for="${row.uid}">0₫</span>
            </td>
            <td class="so-td-img">
                <div class="so-img-cell-v2" tabindex="0" data-img-cell data-uid="${row.uid}" data-img-name="productImage">
                    <div class="so-img-cell-hint">
                        <i data-lucide="clipboard-paste"></i>
                        <span>Ctrl+V / Kéo thả</span>
                    </div>
                    <input
                        type="url"
                        data-field="productImage"
                        data-uid="${row.uid}"
                        placeholder="hoặc dán URL"
                        class="so-input-v2 so-input-mini so-input-url"
                        value="${escapeHtml(row.productImage)}"
                    />
                </div>
                <div class="so-img-preview" data-preview-uid="${row.uid}" data-img-name="productImage">${
                    row.productImage ? `<img src="${escapeHtml(row.productImage)}" alt="" />` : ''
                }</div>
            </td>
            <td class="so-td-img">
                <div class="so-img-cell-v2" tabindex="0" data-img-cell data-uid="${row.uid}" data-img-name="invoiceImage">
                    <div class="so-img-cell-hint">
                        <i data-lucide="clipboard-paste"></i>
                        <span>Ctrl+V / Kéo thả</span>
                    </div>
                    <input
                        type="url"
                        data-field="invoiceImage"
                        data-uid="${row.uid}"
                        placeholder="hoặc dán URL"
                        class="so-input-v2 so-input-mini so-input-url"
                        value="${escapeHtml(row.invoiceImage)}"
                    />
                </div>
                <div class="so-img-preview" data-preview-uid="${row.uid}" data-img-name="invoiceImage">${
                    row.invoiceImage ? `<img src="${escapeHtml(row.invoiceImage)}" alt="" />` : ''
                }</div>
            </td>
            <td class="so-td-row-actions">${delBtnHtml}</td>
        </tr>`;
    }

    function renderModalRows() {
        const tbody = document.getElementById('soModalProductsBody');
        if (!tbody) return;
        tbody.innerHTML = modalRows.map((r, i) => modalRowHtml(r, i, modalRows.length)).join('');
        // Show + button only in create mode
        const addWrap = document.getElementById('soModalAddRowWrap');
        if (addWrap) addWrap.hidden = modalMode !== 'create';
        wireModalRowInputs();
        wireModalImagePasteDrop();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        updateModalTotals();
    }

    function wireModalRowInputs() {
        const tbody = document.getElementById('soModalProductsBody');
        if (!tbody) return;
        // Generic field input listener — update modalRows + re-render targeted bits.
        tbody.querySelectorAll('input[data-field]').forEach((input) => {
            input.addEventListener('input', onModalRowFieldInput);
            input.addEventListener('change', onModalRowFieldInput);
        });
        // Price shorthand: gõ "100" tự hiểu là 100.000 cho VND khi blur.
        tbody
            .querySelectorAll('input[data-field="costPrice"], input[data-field="sellPrice"]')
            .forEach((input) => {
                input.addEventListener('blur', onModalPriceBlur);
            });
        // Product name dropdown trigger
        tbody.querySelectorAll('input[data-field="productName"]').forEach((input) => {
            input.addEventListener('focus', () => {
                activeSuggestUid = input.dataset.uid;
                showSuggest(input.dataset.uid, input.value);
            });
            input.addEventListener('input', () => {
                activeSuggestUid = input.dataset.uid;
                showSuggest(input.dataset.uid, input.value);
            });
            input.addEventListener('blur', () => {
                // Delay so click on suggestion item registers first
                setTimeout(() => {
                    if (activeSuggestUid === input.dataset.uid) hideSuggest(input.dataset.uid);
                }, 180);
            });
        });
        // Variant picker per row — pick từ Kho Biến Thể
        tbody.querySelectorAll('input[data-field="variant"]').forEach((input) => {
            input.addEventListener('focus', () =>
                showVariantSuggest(input.dataset.uid, input.value)
            );
            input.addEventListener('input', () =>
                showVariantSuggest(input.dataset.uid, input.value)
            );
            input.addEventListener('blur', () => {
                setTimeout(() => hideVariantSuggest(input.dataset.uid), 180);
            });
        });
        // + Thêm SP
        const addBtn = document.getElementById('soModalAddRowBtn');
        if (addBtn) {
            addBtn.onclick = () => {
                modalRows.push(_newModalRow());
                renderModalRows();
            };
        }
        // Delete row + image upload via event delegation
        tbody.querySelectorAll('[data-action="remove-row"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                modalRows = modalRows.filter((r) => r.uid !== uid);
                if (!modalRows.length) modalRows.push(_newModalRow());
                renderModalRows();
            });
        });
        // (Upload button đã bỏ — chỉ dùng Ctrl+V / kéo thả)
    }

    function onModalPriceBlur(e) {
        const input = e.currentTarget;
        const uid = input.dataset.uid;
        const field = input.dataset.field;
        if (field !== 'costPrice' && field !== 'sellPrice') return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const raw = Number(input.value) || 0;
        const expanded = _maybeExpandVndShorthand(raw, tab);
        if (expanded === raw) return;
        input.value = String(expanded);
        const row = modalRows.find((r) => r.uid === uid);
        if (row) row[field] = expanded;
        updateRowTotal(uid);
        updateModalGrandTotals();
    }

    function onModalRowFieldInput(e) {
        const input = e.currentTarget;
        const uid = input.dataset.uid;
        const field = input.dataset.field;
        const row = modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const v = input.value;
        if (field === 'qty' || field === 'costPrice' || field === 'sellPrice') {
            row[field] = Number(v) || 0;
        } else {
            row[field] = v;
        }
        if (field === 'productName') {
            // Clear matched code if the typed text no longer matches.
            const match =
                window.Web2ProductsCache?.findByNameExact?.(v) ||
                (row.matchedCode && window.Web2ProductsCache?.findByCode?.(row.matchedCode));
            row.matchedCode = match?.code || null;
            // Refresh meta inline without rebuilding entire row (to keep focus).
            updateRowMeta(uid);
        }
        if (field === 'productImage' || field === 'invoiceImage') {
            updateRowImagePreview(uid, field, v);
        }
        if (field === 'qty' || field === 'sellPrice') {
            updateRowTotal(uid);
            updateModalGrandTotals();
        }
    }

    function updateRowMeta(uid) {
        const row = modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const tr = document
            .getElementById('soModalProductsBody')
            ?.querySelector(`tr[data-uid="${uid}"]`);
        if (!tr) return;
        const metaEl = tr.querySelector('.so-row-meta');
        if (!metaEl) return;
        const matched =
            (row.matchedCode && window.Web2ProductsCache?.findByCode?.(row.matchedCode)) ||
            window.Web2ProductsCache?.findByNameExact?.(row.productName) ||
            null;
        row.matchedCode = matched?.code || null;
        const stockText = matched
            ? `<span class="so-row-stock ${(matched.stock || 0) <= 0 ? 'is-zero' : (matched.stock || 0) < 5 ? 'is-low' : ''}">
                   <i data-lucide="package-check"></i> Tồn: <strong>${matched.stock ?? 0}</strong>
               </span>`
            : '';
        const badge = matched
            ? `<span class="so-row-kho-badge" title="Đã có trong Kho SP Web 2.0 — mã ${escapeHtml(matched.code)}">
                   <i data-lucide="check-circle-2"></i> Đã có ở kho
               </span>`
            : `<span class="so-row-kho-badge so-row-kho-new" title="Sẽ tự thêm vào Kho SP Web 2.0 khi lưu">
                   <i data-lucide="plus-circle"></i> SP mới
               </span>`;
        metaEl.innerHTML = badge + stockText;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function updateRowImagePreview(uid, name, url) {
        const el = document.querySelector(`[data-preview-uid="${uid}"][data-img-name="${name}"]`);
        if (!el) return;
        el.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="" />` : '';
    }

    function updateRowTotal(uid) {
        const row = modalRows.find((r) => r.uid === uid);
        if (!row) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const subtotal = (Number(row.qty) || 0) * (Number(row.sellPrice) || 0);
        const el = document.querySelector(`[data-total-for="${uid}"]`);
        if (el) el.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
    }

    function showSuggest(uid, query) {
        const list = document.querySelector(`.so-suggest-dropdown[data-suggest-for="${uid}"]`);
        if (!list) return;
        const cache = window.Web2ProductsCache;
        if (!cache) return;
        const q = (query || '').trim();
        // Chỉ gợi ý khi user đã gõ ≥ 1 ký tự — tránh popup mặc định khi focus.
        if (!q) {
            list.hidden = true;
            list.innerHTML = '';
            return;
        }
        const items = cache.findByName(q, 8);
        if (!items.length) {
            list.hidden = true;
            list.innerHTML = '';
            return;
        }
        list.innerHTML = items
            .map((p) => {
                const img = p.imageUrl
                    ? `<img src="${escapeHtml(p.imageUrl)}" alt="" />`
                    : `<span class="so-suggest-img-placeholder"><i data-lucide="image"></i></span>`;
                const variantBadge = p.variant
                    ? `<span class="so-suggest-variant">${escapeHtml(p.variant)}</span>`
                    : '';
                return `<button type="button" class="so-suggest-item" data-suggest-code="${escapeHtml(p.code)}" data-suggest-uid="${uid}">
                    <div class="so-suggest-img">${img}</div>
                    <div class="so-suggest-text">
                        <div class="so-suggest-name">${escapeHtml(p.name)}${variantBadge}</div>
                        <div class="so-suggest-sub">
                            <span class="so-suggest-code">${escapeHtml(p.code)}</span>
                            <span class="so-suggest-stock">Tồn: ${p.stock ?? 0}</span>
                            <span class="so-suggest-price">${fmtVnd(p.price || 0)}</span>
                        </div>
                    </div>
                </button>`;
            })
            .join('');
        list.hidden = false;
        list.querySelectorAll('.so-suggest-item').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus
            btn.addEventListener('click', () => {
                const code = btn.dataset.suggestCode;
                applySuggestionToRow(uid, code);
                hideSuggest(uid);
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function hideSuggest(uid) {
        const list = document.querySelector(`.so-suggest-dropdown[data-suggest-for="${uid}"]`);
        if (list) {
            list.hidden = true;
            list.innerHTML = '';
        }
    }

    function showVariantSuggest(uid, query) {
        const list = document.querySelector(`.so-variant-dropdown[data-variant-for="${uid}"]`);
        if (!list) return;
        const cache = window.Web2VariantsCache;
        if (!cache) return;
        const items = cache.findByValue((query || '').trim(), 10);
        if (!items.length) {
            list.innerHTML = `<div class="so-variant-empty">
                Kho Biến Thể chưa có giá trị nào khớp.
                <a href="../web2/variants/index.html" target="_blank">Thêm mới →</a>
            </div>`;
            list.hidden = false;
            return;
        }
        list.innerHTML = items
            .map((v) => {
                const grp = v.groupName
                    ? `<span class="so-variant-group">${escapeHtml(v.groupName)}</span>`
                    : '';
                return `<button type="button" class="so-variant-item" data-uid="${uid}" data-val="${escapeHtml(v.value)}">
                    <span class="so-variant-val">${escapeHtml(v.value)}</span>
                    ${grp}
                </button>`;
            })
            .join('');
        list.hidden = false;
        list.querySelectorAll('.so-variant-item').forEach((btn) => {
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                const row = modalRows.find((r) => r.uid === uid);
                if (!row) return;
                row.variant = btn.dataset.val;
                const input = document.querySelector(
                    `#soModalProductsBody input[data-field="variant"][data-uid="${uid}"]`
                );
                if (input) input.value = btn.dataset.val;
                list.hidden = true;
            });
        });
    }

    function hideVariantSuggest(uid) {
        const list = document.querySelector(`.so-variant-dropdown[data-variant-for="${uid}"]`);
        if (list) {
            list.hidden = true;
            list.innerHTML = '';
        }
    }

    function applySuggestionToRow(uid, code) {
        const p = window.Web2ProductsCache?.findByCode?.(code);
        if (!p) return;
        const row = modalRows.find((r) => r.uid === uid);
        if (!row) return;
        row.productName = p.name || '';
        row.matchedCode = p.code;
        // Autofill variant từ Kho SP (field độc lập, không lấy từ note).
        // Chỉ ghi đè nếu user chưa nhập variant — tránh nuốt input đang gõ.
        if (p.variant && !row.variant) row.variant = p.variant;
        // Map giá mua → costPrice; giá bán → sellPrice (VND values). When the
        // active tab is not VND, we leave the prices as-is so the user can
        // convert manually — kho SP lưu VNĐ, tab có thể là CNY.
        if (Number(p.originalPrice)) row.costPrice = Number(p.originalPrice);
        if (Number(p.price)) row.sellPrice = Number(p.price);
        if (p.imageUrl && !row.productImage) row.productImage = p.imageUrl;
        renderModalRows();
        // Re-focus name input after rerender
        setTimeout(() => {
            const inp = document.querySelector(
                `#soModalProductsBody input[data-field="productName"][data-uid="${uid}"]`
            );
            if (inp) inp.focus();
        }, 30);
    }

    function _applyImageToRow(uid, name, dataUrl) {
        const row = modalRows.find((r) => r.uid === uid);
        if (!row) return;
        row[name] = dataUrl;
        const formInput = document.querySelector(
            `#soModalProductsBody input[data-field="${name}"][data-uid="${uid}"]`
        );
        if (formInput) formInput.value = dataUrl;
        updateRowImagePreview(uid, name, dataUrl);
    }

    // (pickImageForRow / file picker đã bỏ — chỉ dùng Ctrl+V / kéo thả qua
    // attachImageDropTarget. Ảnh tự động được resize + nén JPEG.)

    function wireModalImagePasteDrop() {
        const cells = document.querySelectorAll('#soModalProductsBody [data-img-cell]');
        cells.forEach((cell) => {
            const uid = cell.dataset.uid;
            const name = cell.dataset.imgName;
            if (!uid || !name) return;
            // Click vào cell (vùng trống, không phải input/button con) → focus
            // để Ctrl+V land vào đây. Còn click → mở file picker được bỏ qua
            // (`noClickPicker`) vì caller đã có nút upload riêng.
            if (window.Web2Effects?.attachImageDropTarget) {
                window.Web2Effects.attachImageDropTarget(cell, {
                    noClickPicker: true,
                    onResult(dataUrl) {
                        _applyImageToRow(uid, name, dataUrl);
                    },
                    notify,
                });
            }
        });
    }

    function openOrderModal(rowId, shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        editingRowId = rowId || null;
        editingShipmentId = shipmentId || null;
        editingTabId = tab.id;
        modalMode = rowId ? 'edit' : 'create';
        modalRows = [];
        const form = document.getElementById('soOrderForm');
        const titleEl = document.getElementById('soModalTitle');
        form.reset();
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
            form.elements.status.value = r.status || 'draft';
            form.elements.note.value = r.note || '';
            form.elements.costNote.value = r.costNote || '';
            modalRows = [
                _newModalRow({
                    productName: r.productName || '',
                    variant: r.variant || '',
                    qty: r.qty,
                    sellPrice: r.sellPrice,
                    costPrice: r.costPrice,
                    productImage: r.productImage || '',
                    invoiceImage: r.invoiceImage || '',
                }),
            ];
        } else {
            if (shipmentId) {
                const sh = tab.shipments.find((s) => s.id === shipmentId);
                if (sh) {
                    titleEl.textContent = `Thêm SP vào ${sh.batch ? 'Đợt ' + sh.batch : formatDateVN(sh.date)}`;
                    form.elements.shipDate.value = sh.date || '';
                    form.elements.shipBatch.value = sh.batch || '';
                    form.elements.shipCaseCount.value = sh.caseCount || 0;
                    form.elements.shipWeightKg.value = sh.weightKg || 0;
                    form.elements.shipContractAmount.value = sh.contractAmount || 0;
                    form.elements.shipContractCurrency.value =
                        sh.contractCurrency || tab.currency || 'VND';
                }
            } else {
                titleEl.textContent = 'Tạo Đơn Hàng (Nháp)';
            }
            form.elements.status.value = 'draft';
            modalRows = [_newModalRow()];
        }
        const curHint =
            tab.currency === 'VND'
                ? 'VNĐ · gõ 100 = 100k'
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
        renderModalRows();
        showModal('soOrderModal');
        setTimeout(() => {
            const firstNameInput = document.querySelector(
                '#soModalProductsBody input[data-field="productName"]'
            );
            firstNameInput?.focus();
        }, 80);
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
        const sharedFields = {
            supplier: form.elements.supplier.value.trim(),
            note: form.elements.note.value.trim(),
            costNote: form.elements.costNote.value.trim(),
            status: form.elements.status.value,
        };
        // Validate at least 1 row có tên SP
        const validRows = modalRows.filter((r) => r.productName.trim());
        if (!validRows.length) {
            notify('Cần ít nhất 1 sản phẩm có tên', 'warning');
            return;
        }
        // Validate variant: từng row nếu có variant phải tồn tại trong Kho Biến Thể
        const variantCache = window.Web2VariantsCache;
        if (variantCache) {
            for (const r of validRows) {
                const v = (r.variant || '').trim();
                if (v && !variantCache.findByValueExact(v)) {
                    notify(
                        `Biến thể "${v}" chưa có trong Kho Biến Thể — vui lòng thêm trước rồi chọn lại.`,
                        'error'
                    );
                    return;
                }
            }
        }
        if (modalMode === 'edit' && editingRowId && editingShipmentId) {
            const r = validRows[0];
            const rowData = {
                ...sharedFields,
                productName: r.productName.trim(),
                variant: r.variant.trim(),
                qty: Number(r.qty) || 0,
                sellPrice: Number(r.sellPrice) || 0,
                costPrice: Number(r.costPrice) || 0,
                productImage: r.productImage.trim(),
                invoiceImage: r.invoiceImage.trim(),
            };
            // Capture OLD row TRƯỚC khi update để tính delta sync Kho.
            const editSh = tab.shipments.find((s) => s.id === editingShipmentId);
            const oldRow = editSh?.rows.find((x) => x.id === editingRowId);
            const oldMatch = oldRow ? _rowToKhoMatch(oldRow) : null;
            const oldQty = Number(oldRow?.qty) || 0;
            const newMatch = _rowToKhoMatch({
                productName: rowData.productName,
                variant: rowData.variant,
                supplier: rowData.supplier,
            });
            const newQty = rowData.qty;
            const sameSp =
                oldMatch &&
                oldMatch.name.toLowerCase() === newMatch.name.toLowerCase() &&
                (oldMatch.variant || '').toLowerCase() === (newMatch.variant || '').toLowerCase();
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
                window.SoOrderStorage.updateShipment(state, tab.id, editingShipmentId, shipMeta);
            }
            notify('Đã cập nhật dòng order', 'success');
            // Sync Kho:
            //   - SP cùng name+variant với row cũ → adjust pending delta.
            //   - Rename → giảm pending SP cũ qty rồi upsert SP mới.
            if (sameSp) {
                const delta = newQty - oldQty;
                if (delta !== 0 && newMatch.name) {
                    adjustKhoPending([{ ...newMatch, delta }]);
                }
            } else {
                if (oldMatch?.name && oldQty > 0) {
                    adjustKhoPending([{ ...oldMatch, delta: -oldQty }]);
                }
                syncRowsToKho([r], tab).catch(() => {});
            }
        } else {
            let sh = window.SoOrderStorage.findShipment(tab, shipMeta);
            if (!sh) {
                sh = window.SoOrderStorage.addShipment(state, tab.id, shipMeta);
            } else {
                const merged = {
                    caseCount: shipMeta.caseCount || sh.caseCount,
                    weightKg: shipMeta.weightKg || sh.weightKg,
                    contractAmount: shipMeta.contractAmount || sh.contractAmount,
                    contractCurrency: shipMeta.contractCurrency || sh.contractCurrency,
                };
                window.SoOrderStorage.updateShipment(state, tab.id, sh.id, merged);
            }
            for (const r of validRows) {
                window.SoOrderStorage.addRow(state, tab.id, sh.id, {
                    ...sharedFields,
                    productName: r.productName.trim(),
                    variant: r.variant.trim(),
                    qty: Number(r.qty) || 0,
                    sellPrice: Number(r.sellPrice) || 0,
                    costPrice: Number(r.costPrice) || 0,
                    productImage: r.productImage.trim(),
                    invoiceImage: r.invoiceImage.trim(),
                });
            }
            notify(`Đã thêm ${validRows.length} dòng order (Nháp)`, 'success');
            syncRowsToKho(validRows, tab).catch(() => {});
        }
        hideModal('soOrderModal');
        pushSync();
        renderAll();
    }

    /**
     * Đối chiếu các dòng vừa lưu với Kho SP Web 2.0:
     *   - SP đã có (matched theo code hoặc tên chuẩn hóa) → bổ sung tab.label
     *     vào trường `note` nếu chưa có (sticky tag), không ghi đè.
     *   - SP chưa có → POST tạo mới với note = tab.label (HÀ NỘI / HƯƠNG CHÂU).
     * Best-effort: lỗi network không chặn flow chính, chỉ warn.
     */
    async function syncRowsToKho(rows, tab) {
        if (!window.Web2ProductsApi || !window.Web2ProductsCache) return;
        const cache = window.Web2ProductsCache;
        await cache.init();
        const label = (tab && tab.label) || '';
        const trimLabel = label.trim();
        if (!trimLabel) return;
        // Lưu Nháp → upsert-pending: SP mới = CHO_MUA, SP cũ stock=0 → CHO_MUA,
        // pending_qty += qty trong cả 2 case.
        const items = rows
            .map((r) => {
                const name = (r.productName || '').trim();
                const qty = Number(r.qty) || 0;
                if (!name || qty <= 0) return null;
                const variant = (r.variant || '').trim();
                const sellVnd = Math.round((Number(r.sellPrice) || 0) * (Number(tab.rate) || 1));
                const costVnd = Math.round((Number(r.costPrice) || 0) * (Number(tab.rate) || 1));
                return {
                    name,
                    variant: variant || null,
                    qty,
                    sellPrice: sellVnd,
                    costPrice: costVnd,
                    supplier: (r.supplier || '').trim() || null,
                    imageUrl: r.productImage || null,
                    note: trimLabel,
                };
            })
            .filter(Boolean);
        if (!items.length) return;
        try {
            const res = await window.Web2ProductsApi.upsertPending(items);
            const created = res?.created || 0;
            const updated = res?.updated || 0;
            cache.pushTickle({ action: 'sync-from-so-order' });
            if (created) {
                notify(`Đã tạo ${created} SP CHỜ MUA vào Kho SP`, 'info');
            }
            if (updated) {
                notify(`Đã cập nhật ${updated} SP (pending qty)`, 'info');
            }
        } catch (e) {
            console.warn('[so-order] syncRowsToKho upsertPending:', e.message);
            notify('Lỗi sync SP vào Kho: ' + e.message, 'error');
        }
    }

    /**
     * Đẩy delta pending_qty về Kho khi user xóa/sửa qty của row đã từng được
     * Lưu Nháp (đã sync vào Kho).
     *   adjustments = [{ name, variant, supplier, delta }]
     * Best-effort: lỗi network không chặn flow chính, chỉ warn.
     */
    async function adjustKhoPending(adjustments) {
        if (!window.Web2ProductsApi || !adjustments?.length) return;
        const items = adjustments.filter(
            (a) => a && a.name && Number.isFinite(Number(a.delta)) && Number(a.delta) !== 0
        );
        if (!items.length) return;
        try {
            const res = await window.Web2ProductsApi.adjustPending(items);
            if (window.Web2ProductsCache) {
                window.Web2ProductsCache.pushTickle({ action: 'adjust-from-so-order' });
            }
            const deleted = (res?.results || []).filter((r) => r.action === 'deleted').length;
            if (deleted) {
                notify(`Đã dọn ${deleted} SP ghost (pending=0, stock=0) khỏi Kho`, 'info');
            }
            if (res?.warnings?.length) {
                console.warn('[so-order] adjustKhoPending warnings:', res.warnings);
            }
        } catch (e) {
            console.warn('[so-order] adjustKhoPending error:', e.message);
            notify('Lỗi sync giảm pending về Kho: ' + e.message, 'error');
        }
    }

    function _rowToKhoMatch(r) {
        return {
            name: (r.productName || '').trim(),
            variant: (r.variant || '').trim() || null,
            supplier: (r.supplier || '').trim() || null,
        };
    }

    function _noteHasLabel(note, label) {
        if (!note || !label) return false;
        const parts = String(note)
            .split('|')
            .map((s) => s.trim().toLowerCase());
        return parts.includes(label.toLowerCase());
    }

    function _generateKhoCode(name) {
        // Sinh mã ngắn dạng KHO-<short hash>-<timestamp36>. Mã không phụ
        // thuộc tên (TPOS-style) — sẽ unique cao, không trùng giữa nhiều
        // máy nhờ phần timestamp + random.
        const base =
            String(name || '')
                .normalize('NFD')
                .replace(/[̀-ͯ]/g, '')
                .replace(/đ/g, 'd')
                .replace(/[^a-zA-Z0-9]/g, '')
                .toUpperCase()
                .slice(0, 6) || 'SP';
        const ts = Date.now().toString(36).toUpperCase().slice(-5);
        const rnd = Math.random().toString(36).toUpperCase().slice(2, 5);
        return `${base}-${ts}${rnd}`;
    }

    function deleteRow(shipmentId, rowId) {
        if (!confirm('Xóa dòng order này?')) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        // Capture row TRƯỚC khi xóa để sync pending về Kho.
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        const adj = r ? { ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) } : null;
        window.SoOrderStorage.deleteRow(state, tab.id, shipmentId, rowId);
        notify('Đã xóa dòng', 'info');
        if (adj && adj.name && adj.delta !== 0) adjustKhoPending([adj]);
        pushSync();
        renderAll();
    }

    function deleteShipment(shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        const n = sh.rows.length;
        if (!confirm(`Xóa lô này + ${n} dòng order bên trong?`)) return;
        // Capture rows TRƯỚC khi xóa.
        const adjustments = (sh.rows || [])
            .map((r) => ({ ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) }))
            .filter((a) => a.name && a.delta !== 0);
        window.SoOrderStorage.deleteShipment(state, tab.id, shipmentId);
        notify('Đã xóa lô', 'info');
        if (adjustments.length) adjustKhoPending(adjustments);
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
    // Multi-row modal: image picker/paste/drop wiring now lives per-row in
    // wireModalRowInputs() + wireModalImagePasteDrop(). The helpers below
    // are shared between rows.

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
        const editBtn = document.getElementById('soEditTableBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                setEditTableMode(!editTableMode);
                renderAll();
            });
        }

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

    // Recompute per-row "Thành tiền" + footer totals for the multi-row modal.
    function updateModalTotals() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (!tab) return;
        for (const r of modalRows) updateRowTotal(r.uid);
        updateModalGrandTotals();
    }

    function updateModalGrandTotals() {
        const tab = window.SoOrderStorage.getActiveTab(state);
        if (!tab) return;
        const totalQty = modalRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const subtotal = modalRows.reduce(
            (s, r) => s + (Number(r.qty) || 0) * (Number(r.sellPrice) || 0),
            0
        );
        const qtyEl = document.getElementById('soModalTotalQty');
        if (qtyEl) qtyEl.textContent = totalQty.toLocaleString('vi-VN');
        const sumEl = document.getElementById('soModalTotalAmount');
        if (sumEl) sumEl.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
        const finalEl = document.getElementById('soModalFinalAmount');
        if (finalEl) finalEl.textContent = fmtCurrency(subtotal, tab.currency || 'VND');
    }

    function wireModalTotals() {
        // Multi-row inputs auto-wired in wireModalRowInputs via onModalRowFieldInput.
    }

    // ---------- Inline image edit modal ----------

    function openInlineImageModal(rowId, shipmentId, field) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        const currentUrl = r[field] || '';
        inlineImageCtx = { rowId, shipmentId, field, currentUrl, newUrl: currentUrl };
        const title = field === 'productImage' ? 'Sửa ảnh sản phẩm' : 'Sửa ảnh hóa đơn';
        const titleEl = document.getElementById('soInlineImageTitle');
        if (titleEl) titleEl.textContent = title;
        const urlInput = document.getElementById('soInlineImageUrl');
        if (urlInput) urlInput.value = currentUrl;
        _refreshInlineImagePreview(currentUrl);
        showModal('soInlineImageModal');
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => {
            document.getElementById('soInlineImageDrop')?.focus();
        }, 60);
    }

    function _refreshInlineImagePreview(url) {
        const prev = document.getElementById('soInlineImagePreview');
        if (!prev) return;
        if (url && url.length < 1024 * 1024 * 3) {
            prev.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" />`;
        } else if (url) {
            prev.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" />`;
        } else {
            prev.innerHTML = `<div class="so-inline-img-empty">Chưa có ảnh — paste/drop/click để thêm</div>`;
        }
    }

    function _saveInlineImage() {
        if (!inlineImageCtx) return hideModal('soInlineImageModal');
        const { rowId, shipmentId, field } = inlineImageCtx;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const urlInput = document.getElementById('soInlineImageUrl');
        const newUrl = (urlInput?.value || inlineImageCtx.newUrl || '').trim();
        window.SoOrderStorage.updateRow(state, tab.id, shipmentId, rowId, {
            [field]: newUrl,
        });
        pushSync();
        renderAll();
        flashRow(rowId);
        notify('Đã lưu ảnh', 'success');
        hideModal('soInlineImageModal');
        inlineImageCtx = null;
    }

    function _clearInlineImage() {
        const urlInput = document.getElementById('soInlineImageUrl');
        if (urlInput) urlInput.value = '';
        if (inlineImageCtx) inlineImageCtx.newUrl = '';
        _refreshInlineImagePreview('');
    }

    function wireInlineImageModal() {
        const drop = document.getElementById('soInlineImageDrop');
        if (drop && window.Web2Effects?.attachImageDropTarget) {
            window.Web2Effects.attachImageDropTarget(drop, {
                onResult(url) {
                    const urlInput = document.getElementById('soInlineImageUrl');
                    if (urlInput) urlInput.value = url;
                    if (inlineImageCtx) inlineImageCtx.newUrl = url;
                    _refreshInlineImagePreview(url);
                },
                notify,
            });
        }
        const urlInput = document.getElementById('soInlineImageUrl');
        urlInput?.addEventListener('input', () => {
            const v = urlInput.value.trim();
            if (inlineImageCtx) inlineImageCtx.newUrl = v;
            _refreshInlineImagePreview(v);
        });
        document
            .getElementById('soInlineImageSaveBtn')
            ?.addEventListener('click', _saveInlineImage);
        document
            .getElementById('soInlineImageClearBtn')
            ?.addEventListener('click', _clearInlineImage);
    }

    async function init() {
        state = window.SoOrderStorage.load();
        applyEditTableModeUi();
        renderAll();
        wireToolbar();
        wireInlineImageModal();
        wireModalTotals();
        wireFooterInputs();
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Web2ProductsCache — bật suggestion + badge cho modal tạo đơn.
        // Re-render modal rows nếu cache cập nhật (kho SP của máy khác)
        // để badge "Đã có ở kho" và tồn kho luôn đồng bộ realtime.
        if (window.Web2ProductsCache) {
            window.Web2ProductsCache.init().then(() => {
                window.Web2ProductsCache.subscribe(() => {
                    if (modalRows.length) {
                        // Chỉ cập nhật meta để không mất focus đang nhập
                        for (const r of modalRows) updateRowMeta(r.uid);
                    }
                });
            });
        }

        // Web2VariantsCache — bật picker cho cột Biến Thể.
        if (window.Web2VariantsCache) {
            window.Web2VariantsCache.init();
        }

        // Firestore sync — local-first (so-order only):
        //   1. Init load Firestore once → seed localStorage + state
        //   2. Mutations: pushSync() debounced 400ms (no realtime listener)
        //   3. Pull-on-focus: visibilitychange/focus → Sync.pullOnce()
        //   4. Flush pending push on hide/unload
        // No onSnapshot — avoids re-render flicker on every local write.
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
            const conflictHandler = (loaded) => {
                // Local push pending while a newer remote arrived. Tell user
                // — let them choose to refresh (drop local edits) or keep
                // typing (their flush will overwrite remote).
                notify(
                    'Có thay đổi từ máy khác. Refresh để xem (mất các sửa chưa lưu) hoặc giữ chỉnh sửa hiện tại.',
                    'warning'
                );
            };
            const ok = await window.SoOrderStorage.Sync.init(remoteHandler, conflictHandler);
            if (ok) {
                state = window.SoOrderStorage.load();
                renderAll();
                // Push back so Firestore picks up the first-visit
                // migration (uiInitialized = true, default collapses).
                pushSync();
            }

            // Pull when tab becomes visible (returning from another tab);
            // flush pending push when tab hides (so closing doesn't drop
            // the last debounced write).
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    window.SoOrderStorage.Sync.pullOnce();
                } else {
                    window.SoOrderStorage.Sync.flush();
                }
            });
            window.addEventListener('focus', () => {
                window.SoOrderStorage.Sync.pullOnce();
            });
            window.addEventListener('beforeunload', () => {
                window.SoOrderStorage.Sync.flush();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
