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
                else if (action === 'receive') openReceiveShipmentModal(shId);
                else if (action === 'receive-ncc')
                    openReceiveShipmentModal(shId, {
                        supplier: btn.dataset.supplier || '',
                        invoiceGroupId: btn.dataset.invoiceGroup || '',
                    });
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
            });
        });
        tbody.querySelectorAll('img[data-zoomable]').forEach((img) => {
            img.addEventListener('click', () => openLightbox(img.src));
        });
        // Edit-image affordance: pencil overlay (and "—" placeholder).
        // Click bypasses lightbox + opens inline image modal so user can
        // replace/clear ngay cả khi cell đã có ảnh.
        tbody.querySelectorAll('[data-img-edit]').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const td = el.closest('td[data-cell-field]');
                if (!td) return;
                const field = td.dataset.cellField;
                const rowId = td.dataset.rowId;
                const shipmentId = td.dataset.shipmentId;
                if (!field || !rowId || !shipmentId) return;
                if (_isRowLocked(rowId, shipmentId)) {
                    notify('Dòng "Đã nhận" — không chỉnh sửa được', 'warning');
                    return;
                }
                openInlineImageModal(rowId, shipmentId, field);
            });
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
        const elVariant = e.target.closest('input[data-edit-field="variant"]');
        if (elVariant) attachVariantPickerOnDemand(elVariant);
        const elSupplier = e.target.closest('input[data-edit-field="supplier"]');
        if (elSupplier) {
            _ensureSupplierCacheSubscription();
            attachSupplierPickerOnDemand(elSupplier, {
                onPick: (val) => {
                    commitBulkEditField(
                        elSupplier.dataset.rowId,
                        elSupplier.dataset.shipmentId,
                        'supplier',
                        val
                    );
                    _ensureSupplierAsync(val);
                },
            });
        }
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
        if (_isRowLocked(rowId, shipmentId)) {
            notify('Dòng "Đã nhận" — không chỉnh sửa được', 'warning');
            return;
        }
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
            // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là
            // draft đơn, có thể gõ size mới chưa khai báo).
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
            if (field === 'supplier' && value) _ensureSupplierAsync(value);
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
        } else if (field === 'supplier') {
            inputHtml = `<div class="so-supplier-pick-wrap">
                <input class="so-edit-input" type="text" value="${escapeHtml(r.supplier || '')}" placeholder="Pick từ Ví NCC…" autocomplete="off" autofocus />
                <div class="so-supplier-dropdown" hidden></div>
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

        if (field === 'supplier') {
            _ensureSupplierCacheSubscription();
            attachSupplierPickerOnDemand(el, {
                onPick: (val) => {
                    el.value = val;
                    finish();
                    _ensureSupplierAsync(val);
                },
            });
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
        // P1 2026-05-30: pre-compute group spans cho NCC + Ảnh Hóa Đơn.
        // - NCC: consecutive rows cùng `supplier` → rowspan (cell render lần đầu).
        // - Ảnh Hóa Đơn: consecutive rows cùng `invoiceGroupId` → rowspan.
        // Map: rowIdx → { ncc: {render, span}, inv: {render, span} }
        const meta = _computeRowSpans(sh.rows);
        const rows = sh.rows.map((r, idx) => rowHtml(r, idx, tab, sh.id, meta[idx])).join('');
        return header + colHead + rows;
    }

    function _computeRowSpans(rows) {
        const out = rows.map(() => ({
            ncc: { render: true, span: 1 },
            inv: { render: true, span: 1 },
        }));
        // Walk groups: NCC merge consecutive rows có CÙNG supplier VÀ cùng
        // invoiceGroupId (đơn). Nếu cùng NCC nhưng khác đơn → tách cell ra
        // để mỗi đơn 1 ô riêng. Fallback `invoiceGroupId || id` giữ behavior
        // cũ cho rows pre-2026-05-30 chưa có invoiceGroupId.
        let i = 0;
        while (i < rows.length) {
            let j = i + 1;
            const sup = rows[i].supplier || '';
            const gid = rows[i].invoiceGroupId || rows[i].id;
            while (
                j < rows.length &&
                (rows[j].supplier || '') === sup &&
                (rows[j].invoiceGroupId || rows[j].id) === gid
            )
                j++;
            out[i].ncc = { render: true, span: j - i };
            for (let k = i + 1; k < j; k++) out[k].ncc = { render: false, span: 0 };
            i = j;
        }
        i = 0;
        while (i < rows.length) {
            let j = i + 1;
            const g = rows[i].invoiceGroupId || rows[i].id;
            while (j < rows.length && (rows[j].invoiceGroupId || rows[j].id) === g) j++;
            out[i].inv = { render: true, span: j - i };
            for (let k = i + 1; k < j; k++) out[k].inv = { render: false, span: 0 };
            i = j;
        }
        return out;
    }

    // ETA badge — "📦 còn N ngày" / "⚠️ quá hạn N ngày" / "✅ giao hôm nay"
    // P1 2026-05-29. Trả {html, color} hoặc null nếu không có ETA.
    function _etaBadgeHtml(etaStr) {
        if (!etaStr) return null;
        const eta = new Date(etaStr + 'T00:00:00');
        if (isNaN(eta.getTime())) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.round((eta.getTime() - today.getTime()) / 86400000);
        let text, color, icon;
        if (diffDays < 0) {
            text = `Quá hạn ${Math.abs(diffDays)} ngày`;
            color = '#dc2626';
            icon = 'alert-triangle';
        } else if (diffDays === 0) {
            text = 'Giao hôm nay';
            color = '#16a34a';
            icon = 'truck';
        } else if (diffDays <= 3) {
            text = `Còn ${diffDays} ngày`;
            color = '#f59e0b';
            icon = 'clock';
        } else {
            text = `Còn ${diffDays} ngày`;
            color = '#0284c7';
            icon = 'package';
        }
        const etaDisplay = formatDateVN(etaStr);
        return `<span class="so-shipment-eta" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:${color}1a;color:${color};border-radius:6px;font-size:11px;font-weight:600;" title="ETA giao hàng: ${etaDisplay}"><i data-lucide="${icon}" style="width:11px;height:11px;"></i>${text}</span>`;
    }

    function shipmentHeaderHtml(sh, tab, colSpan) {
        const dateText = sh.date ? formatDateVN(sh.date) : '—';
        const batchVal = sh.batch || '';
        const batchLabel = batchVal ? `Đợt ${escapeHtml(batchVal)}` : 'Chưa đặt đợt';
        const caseCount = Number(sh.caseCount) || 0;
        const weightKg = Number(sh.weightKg) || 0;
        const etaBadge = _etaBadgeHtml(sh.expectedDeliveryDate);
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
                    ${etaBadge ? `<span class="so-shipment-sep">—</span>${etaBadge}` : ''}
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
                    ${(() => {
                        // P1 2026-05-30: nếu mọi row hợp lệ đã received → disable
                        // button + đổi nhãn "ĐÃ NHẬN ĐỦ". Tránh user click rồi
                        // thấy popup rỗng.
                        const eligible = (sh.rows || []).filter(
                            (r) =>
                                (r.productName || '').trim() &&
                                Number(r.qty) > 0 &&
                                (r.supplier || '').trim()
                        );
                        const allReceived =
                            eligible.length > 0 && eligible.every((r) => r.status === 'received');
                        if (allReceived) {
                            return `<button class="so-action-btn so-action-btn-done" type="button" disabled title="Tất cả SP trong lô này đã nhận đủ">
                                <i data-lucide="check-circle-2"></i> Đã nhận đủ
                            </button>`;
                        }
                        return `<button class="so-action-btn" type="button" data-shipment-action="receive" data-shipment-id="${escapeHtml(sh.id)}" title="Nhận hàng từ NCC — mở modal nhập qty thực nhận, hỗ trợ mua đủ / mua 1 phần">
                            <i data-lucide="truck"></i> Nhận hàng
                        </button>`;
                    })()}
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

    // Lookup mã SP thật trong Kho theo tên (read-only, không đổi schema row).
    // Trả null nếu SP chưa có ở kho (chưa Lưu Nháp / chưa sync).
    function _lookupKhoCode(r) {
        try {
            const cache = window.Web2ProductsCache;
            if (!cache?.findByNameExact) return null;
            const p = cache.findByNameExact((r.productName || '').trim());
            return p?.code || null;
        } catch (_) {
            return null;
        }
    }

    function rowHtml(r, idx, tab, shipmentId, meta) {
        const rid = escapeHtml(r.id);
        const sid = escapeHtml(shipmentId);
        // Row đã nhận hàng → ép read-only ngay cả khi bulk edit mode bật.
        // Khoá toàn bộ field, hiển thị visual `is-locked` để user biết.
        const edit = editTableMode && r.status !== 'received';
        // Mã SP từ Kho (nếu đã sync) — hiện nhỏ dưới tên SP ở chế độ xem.
        const khoCode = _lookupKhoCode(r);
        const khoCodeHtml = khoCode
            ? `<div class="so-cell-code" title="Mã SP trong Kho SP Web 2.0">${escapeHtml(khoCode)}</div>`
            : '';
        // SL gộp vào cột Biến thể (chế độ xem). Không variant → chỉ "SL N".
        const variantView = (r.variant || '').trim();
        const qtyNum = Number(r.qty) || 0;
        const variantCellInner =
            (variantView ? escapeHtml(variantView) : '') +
            `<span class="so-cell-sl">${variantView ? ' · ' : ''}SL ${qtyNum}</span>`;
        // P1 2026-05-30: meta = { ncc: {render, span}, inv: {render, span} }.
        // Fallback nếu caller cũ chưa pass.
        const nccMeta = meta?.ncc || { render: true, span: 1 };
        const invMeta = meta?.inv || { render: true, span: 1 };
        const nccRowspanAttr = nccMeta.span > 1 ? ` rowspan="${nccMeta.span}"` : '';
        const invRowspanAttr = invMeta.span > 1 ? ` rowspan="${invMeta.span}"` : '';
        // Nút "Nhận hàng" theo NCC — render 1 lần ở ô NCC (đầu nhóm rowspan),
        // chế độ xem. Nhận toàn bộ hàng của NCC đó trong lô. Ẩn/disable nếu mọi
        // SP của NCC này trong lô đã received.
        const nccName = (r.supplier || '').trim();
        let nccReceiveBtn = '';
        if (nccMeta.render && nccName && !edit) {
            // Fix 2026-06-03: cell NCC render theo group (supplier + invoiceGroup)
            // nên `allRecv` phải tính trên ĐÚNG group này (rows.slice(idx, idx+span)),
            // KHÔNG phải toàn bộ rows cùng NCC trong lô. Trước đây 1 đơn đã nhận đủ
            // vẫn hiện "Nhận hàng" vì 1 đơn khác cùng NCC còn nháp → sai trạng thái.
            const shp = tab?.shipments?.find((s) => s.id === shipmentId);
            const groupSpan = nccMeta.span || 1;
            const groupRows = (shp?.rows || []).slice(idx, idx + groupSpan);
            const nccRows = groupRows.filter(
                (x) => (x.productName || '').trim() && Number(x.qty) > 0
            );
            const allRecv = nccRows.length > 0 && nccRows.every((x) => x.status === 'received');
            const groupId = r.invoiceGroupId || r.id;
            nccReceiveBtn = allRecv
                ? `<button class="so-ncc-receive-btn is-done" type="button" disabled title="Đơn này của NCC đã nhận đủ hàng"><i data-lucide="check-circle-2"></i> Đã nhận</button>`
                : `<button class="so-ncc-receive-btn" type="button" data-shipment-action="receive-ncc" data-shipment-id="${sid}" data-supplier="${escapeHtml(nccName)}" data-invoice-group="${escapeHtml(groupId)}" title="Nhận hàng của đơn NCC ${escapeHtml(nccName)} trong lô này"><i data-lucide="truck"></i> Nhận hàng</button>`;
        }
        const cells = {
            supplier: !nccMeta.render
                ? ''
                : edit
                  ? editableCellHtml('supplier', r, rid, sid, nccRowspanAttr)
                  : `<td class="so-cell-supplier${nccMeta.span > 1 ? ' so-cell-merged' : ''}" data-cell-field="supplier" data-row-id="${rid}" data-shipment-id="${sid}"${nccRowspanAttr}><div class="so-cell-supplier-name">${escapeHtml(r.supplier || '—')}</div>${nccReceiveBtn}</td>`,
            stt: `<td class="so-cell-stt">${idx + 1}</td>`,
            productName: edit
                ? editableCellHtml('productName', r, rid, sid)
                : `<td class="so-cell-product" data-cell-field="productName" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.productName || '—')}${khoCodeHtml}</td>`,
            variant: edit
                ? editableCellHtml('variant', r, rid, sid)
                : `<td class="so-cell-variant" data-cell-field="variant" data-row-id="${rid}" data-shipment-id="${sid}">${variantCellInner}</td>`,
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
            // P1 2026-05-30: invoiceImage cell merged khi invMeta.span > 1.
            // Skip render khi không phải dòng đầu group.
            invoiceImage: !invMeta.render
                ? ''
                : imgCell(r.invoiceImage, {
                      rid,
                      sid,
                      field: 'invoiceImage',
                      rowspan: invMeta.span,
                      invoiceGroupId: r.invoiceGroupId || '',
                      merged: invMeta.span > 1,
                  }),
            note: edit
                ? editableCellHtml('note', r, rid, sid)
                : `<td class="so-cell-note" data-cell-field="note" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.note || '')}</td>`,
            costNote: edit
                ? editableCellHtml('costNote', r, rid, sid)
                : `<td class="so-cell-note so-cell-note-cp" data-cell-field="costNote" data-row-id="${rid}" data-shipment-id="${sid}">${escapeHtml(r.costNote || '')}</td>`,
            status: edit
                ? editableCellHtml('status', r, rid, sid)
                : statusCell(r.status, { rid, sid }),
            actions: actionsCell(r.id, shipmentId, r.status),
        };
        const lockedClass = r.status === 'received' ? ' is-locked' : '';
        return (
            '<tr class="so-data-row' +
            lockedClass +
            '" data-row-id="' +
            rid +
            '" data-shipment-id="' +
            sid +
            '" data-row-status="' +
            escapeHtml(r.status || 'draft') +
            '">' +
            COLUMNS.filter((c) => activeColVis()[c.key])
                .map((c) => cells[c.key])
                .join('') +
            '</tr>'
        );
    }

    // Helper: check row status từ DOM (rẻ, tránh load lại state).
    function _isRowLocked(rowId, shipmentId) {
        const tr = document.querySelector(
            `#soTableBody tr.so-data-row[data-row-id="${CSS.escape(rowId)}"][data-shipment-id="${CSS.escape(shipmentId)}"]`
        );
        return tr?.dataset?.rowStatus === 'received';
    }

    // Tạo HTML <td> chứa input/select khi whole-table edit mode bật.
    // Field nào không có handler riêng → text input. Status → select.
    // Variant → wrapper với picker dropdown (lazy refresh khi focus/typing).
    function editableCellHtml(field, r, rid, sid, extraTdAttr) {
        const dataAttr = `data-cell-field="${field}" data-row-id="${rid}" data-shipment-id="${sid}"`;
        const extra = extraTdAttr || '';
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
            return `<td class="${tdClass} so-cell-edit" ${dataAttr}${extra}>
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
        if (field === 'supplier') {
            return `<td class="${tdClass} so-cell-edit so-cell-edit-supplier" ${dataAttr}${extra}>
                <div class="so-supplier-pick-wrap">
                    <input class="so-edit-input" type="text" value="${escapeHtml(r.supplier || '')}" placeholder="Pick từ Ví NCC…" autocomplete="off" data-edit-field="supplier" data-row-id="${rid}" data-shipment-id="${sid}" />
                    <div class="so-supplier-dropdown" hidden></div>
                </div>
            </td>`;
        }
        return `<td class="${tdClass} so-cell-edit" ${dataAttr}${extra}>
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
        // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là
        // draft đơn, có thể gõ size mới chưa khai báo).
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
        if (field === 'supplier' && value) _ensureSupplierAsync(value);
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

    // Thu thập danh sách supplier names có trong state hiện tại (mọi tab),
    // để merge vào dropdown gợi ý — đảm bảo tên đã dùng trong soOrder hiển thị
    // ngay cả khi cache Ví NCC chưa load xong / chưa có Firestore.
    function _currentStateSuppliers() {
        const names = new Set();
        const tabs = state?.tabs || [];
        for (const tab of tabs) {
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const s = (r.supplier || '').trim();
                    if (s) names.add(s);
                }
            }
        }
        return Array.from(names);
    }

    // Gắn dropdown gợi ý NCC cho 1 input. Idempotent (mỗi input chỉ gắn 1 lần).
    // Hỗ trợ:
    //   - Phím ↑↓ chọn item, Enter để commit (nếu có item active), Escape ẩn.
    //   - Hiển thị badge "Tạo mới" cho text chưa có trong Ví NCC.
    //   - opts.dropdownEl: element dropdown đi kèm (nếu input nằm sẵn trong
    //     `.so-supplier-pick-wrap > .so-supplier-dropdown`, tự dò bằng closest).
    //   - opts.onPick(name): callback khi user chọn item (mặc định chỉ set value).
    function attachSupplierPickerOnDemand(input, opts) {
        if (!input || input.__supplierPickerBound) return;
        input.__supplierPickerBound = true;
        const wrap = input.closest('.so-supplier-pick-wrap');
        const dropdown = opts?.dropdownEl || wrap?.querySelector('.so-supplier-dropdown');
        if (!dropdown) return;
        let activeIdx = -1;
        let lastItems = [];

        const renderDropdown = () => {
            const cache = window.Web2SuppliersCache;
            const q = (input.value || '').trim();
            const extras = _currentStateSuppliers();
            const items = cache ? cache.search(q, 10, extras) : extras.slice(0, 10);
            lastItems = items;
            activeIdx = -1;
            const isNew = q.length > 0 && !(cache?.has(q) || extras.some((n) => n === q));
            const itemsHtml = items
                .map(
                    (
                        name
                    ) => `<button type="button" class="so-supplier-item" data-val="${escapeHtml(name)}">
                        <span class="so-supplier-item-name">${escapeHtml(name)}</span>
                        <span class="so-supplier-item-existing">Ví NCC</span>
                    </button>`
                )
                .join('');
            const createHtml =
                isNew && q.length >= 1
                    ? `<button type="button" class="so-supplier-item is-create" data-val="${escapeHtml(q)}" data-create="1">
                        <span class="so-supplier-item-name">+ Tạo NCC "${escapeHtml(q)}"</span>
                        <span class="so-supplier-item-new">Mới</span>
                    </button>`
                    : '';
            if (!items.length && !createHtml) {
                dropdown.innerHTML = `<div class="so-supplier-empty">Chưa có NCC nào — gõ tên để tạo mới.</div>`;
            } else {
                dropdown.innerHTML = createHtml + itemsHtml;
            }
            dropdown.hidden = false;
            // Wire item clicks. mousedown preventDefault để input không blur
            // trước khi click register.
            dropdown.querySelectorAll('.so-supplier-item').forEach((btn) => {
                btn.addEventListener('mousedown', (e) => e.preventDefault());
                btn.addEventListener('click', () => {
                    const val = btn.dataset.val;
                    input.value = val;
                    dropdown.hidden = true;
                    if (opts?.onPick) opts.onPick(val);
                });
            });
        };

        const updateActiveHighlight = () => {
            const items = dropdown.querySelectorAll('.so-supplier-item');
            items.forEach((el, i) => el.classList.toggle('is-active', i === activeIdx));
            const el = items[activeIdx];
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ block: 'nearest' });
            }
        };

        input.addEventListener('focus', renderDropdown);
        input.addEventListener('input', renderDropdown);
        // Render ngay nếu input đã focus (vd: inline edit attach SAU khi focus
        // fired). Cho phép dropdown hiện ngay khi user dblclick để edit.
        if (document.activeElement === input) renderDropdown();
        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.so-supplier-item');
            if (!items.length) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = (activeIdx + 1) % items.length;
                updateActiveHighlight();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = activeIdx <= 0 ? items.length - 1 : activeIdx - 1;
                updateActiveHighlight();
            } else if (e.key === 'Enter') {
                if (activeIdx >= 0 && items[activeIdx]) {
                    e.preventDefault();
                    items[activeIdx].click();
                }
            } else if (e.key === 'Escape') {
                dropdown.hidden = true;
            }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (dropdown) dropdown.hidden = true;
            }, 150);
        });
    }

    // Subscribe to cache changes (only once) so any modal-open re-render
    // picks up newly-added suppliers. Lazy-bound to avoid running before
    // Web2SuppliersCache.init().
    let _supplierCacheSubscribed = false;
    function _ensureSupplierCacheSubscription() {
        if (_supplierCacheSubscribed) return;
        if (!window.Web2SuppliersCache?.subscribe) return;
        _supplierCacheSubscribed = true;
        window.Web2SuppliersCache.subscribe(() => {
            // Nếu modal đang mở, refresh dropdown của input đang focus.
            const focused = document.activeElement;
            if (focused?.matches?.('input[name="supplier"]')) {
                focused.dispatchEvent(new Event('input', { bubbles: false }));
            }
        });
    }

    // Fire-and-forget: đảm bảo NCC tồn tại trong Ví NCC (Firestore). Idempotent.
    function _ensureSupplierAsync(name) {
        if (!name) return;
        const cache = window.Web2SuppliersCache;
        if (!cache?.ensure) return;
        cache.ensure(name).catch((e) => {
            console.warn('[so-order] supplier ensure fail:', e?.message || e);
        });
    }

    function actionsCell(rowId, shipmentId, status) {
        // P1 2026-05-29: bỏ nút "Mua hàng" per row (đã thay bằng "Nhận hàng"
        // per shipment trên header — handle cả mua đủ lẫn mua 1 phần).
        // 2026-05-30: status='received' (Đã nhận) → khoá row, thay nút sửa/xoá
        // bằng icon lock. User muốn sửa lại phải dùng flow "trả hàng" hoặc
        // revert status từ UI khác.
        if (status === 'received') {
            return `<td class="so-cell-actions so-cell-actions-locked">
                <span class="so-action-btn so-action-locked" title="Đã nhận hàng — không thể chỉnh sửa">
                    <i data-lucide="lock"></i>
                </span>
            </td>`;
        }
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
        const rowspan = meta?.rowspan && meta.rowspan > 1 ? ` rowspan="${meta.rowspan}"` : '';
        const mergedClass = meta?.merged ? ' so-cell-merged' : '';
        const igAttr = meta?.invoiceGroupId
            ? ` data-invoice-group-id="${escapeHtml(meta.invoiceGroupId)}"`
            : '';
        const attrs = meta
            ? ` data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}"${igAttr}`
            : '';
        // Edit affordance: pencil button overlay top-right (always rendered;
        // CSS shows it on hover). Click → opens inline image modal so user
        // can replace/clear ngay cả khi cell đã có ảnh.
        const editBtn = meta
            ? `<button type="button" class="so-cell-img-edit" data-img-edit data-cell-field="${meta.field}" data-row-id="${meta.rid}" data-shipment-id="${meta.sid}" title="Sửa ảnh"><i data-lucide="pencil"></i></button>`
            : '';
        if (!url) {
            return `<td class="so-cell-img${mergedClass}"${attrs}${rowspan}><span class="so-cell-img-missing" data-img-edit>—</span>${editBtn}</td>`;
        }
        return `<td class="so-cell-img${mergedClass}"${attrs}${rowspan}><img src="${escapeHtml(url)}" alt="" data-zoomable loading="lazy" />${editBtn}</td>`;
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
        if (typeof updateTrashCountBadge === 'function') updateTrashCountBadge();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // ---------- Nhận hàng modal (partial-purchase support) — P1 2026-05-29 ----------
    // Click "Nhận hàng" button trên shipment header → modal liệt kê tất cả rows
    // trong shipment. Default qty_received = qty_ordered (mới) hoặc qty còn chờ
    // (sau partial-purchase). Submit → upsertPending → confirm-purchase-partial.
    //
    // PERF FIX 2026-05-29 (user feedback "modal bị lag"):
    //   - Modal mở NGAY với qty=qtyOrdered, không await API
    //   - Lookup product state CHẠY NGẦM sau khi modal render
    //   - Khi lookup xong → patch DOM rows có "đã nhận N · còn M chờ"
    //   - Cache 5s tránh re-fetch khi user mở/đóng modal liên tục
    let _receiveItems = []; // [{key, rowId, shipmentId, name, variant, supplier, qty, alreadyReceived, remainingPending, ...}]
    const _receiveLookupCache = new Map(); // shId → { stateByKey, fetchedAt }
    const RECEIVE_LOOKUP_TTL_MS = 5000;

    // Background lookup — return Map(rowId → {code, stock, pendingQty, status}).
    // P1 2026-05-30: dùng Web2ProductsCache thay N×HTTP fetch. Instant lookup
    // O(1) per row sau khi build HashMap key = normalize(name|variant) một lần.
    async function _lookupProductStateForRows(rows) {
        const stateByKey = new Map();
        const eligibleForLookup = rows.filter((r) => (r.productName || '').trim());
        if (!eligibleForLookup.length) return stateByKey;
        const cache = window.Web2ProductsCache;
        if (!cache) return stateByKey;
        try {
            await cache.init();
            const all = cache.getAll();
            const norm = cache._normalize;
            // Index toàn bộ SP (kể cả stock=0) — receive panel cần biết cả
            // pending của SP đang chờ mua, không lọc stock như _checkRowsHaveStock.
            const idx = new Map();
            for (const p of all) {
                const key = norm(p.name) + '|' + norm(p.variant || '');
                if (!idx.has(key)) idx.set(key, p); // first match wins
            }
            for (const r of eligibleForLookup) {
                const key = norm(r.productName) + '|' + norm(r.variant || '');
                const match = idx.get(key);
                if (match) {
                    stateByKey.set(r.id, {
                        code: match.code,
                        stock: Number(match.stock) || 0,
                        pendingQty: Number(match.pendingQty) || 0,
                        status: match.status,
                    });
                }
            }
        } catch (e) {
            console.warn('[so-order] lookupProductState cache fail:', e.message);
        }
        return stateByKey;
    }

    // Patch 1 row trong modal khi lookup data về (sau khi modal đã render).
    // Update: "Đã nhận: N · Còn chờ: M" + input default + max + badge fully-received.
    function _patchReceiveRowFromLookup(item, ps) {
        const rowEl = document.querySelector(`[data-receive-row="${CSS.escape(item.key)}"]`);
        if (!rowEl) return;
        const inp = rowEl.querySelector('input[data-receive-qty]');
        const qtyInfoEl = rowEl.querySelector('[data-receive-qtyinfo]');
        const badgeEl = rowEl.querySelector('[data-receive-status]');
        if (!inp || !qtyInfoEl || !badgeEl) return;
        const qtyOrdered = item.qty;
        const remainingPending = ps.pendingQty;
        const alreadyReceived = Math.max(0, qtyOrdered - remainingPending);
        const fullyReceived = remainingPending === 0;
        // Update item state (used by confirmReceiveFromModal)
        item.code = ps.code;
        item.alreadyReceived = alreadyReceived;
        item.remainingPending = remainingPending;
        item.currentStock = ps.stock;
        // Patch qty info display
        if (alreadyReceived > 0) {
            qtyInfoEl.innerHTML = `<span>Đã đặt: <strong>${qtyOrdered}</strong></span>
                <span style="color:#16a34a;">Đã nhận: <strong>${alreadyReceived}</strong></span>
                <span style="color:#f59e0b;">Còn chờ: <strong>${remainingPending}</strong></span>`;
            qtyInfoEl.style.cssText =
                'font-size:11px;color:#64748b;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;line-height:1.3;';
        }
        // Patch input
        inp.dataset.receiveQtyAlready = alreadyReceived;
        inp.dataset.receiveQtyMax = remainingPending;
        inp.max = remainingPending;
        if (fullyReceived) {
            inp.value = 0;
            inp.disabled = true;
            inp.style.background = '#f1f5f9';
            inp.style.color = '#94a3b8';
            inp.style.cursor = 'not-allowed';
            rowEl.classList.add('is-fully');
            badgeEl.textContent = 'ĐÃ NHẬN ĐỦ';
            badgeEl.style.background = '#dbeafe';
            badgeEl.style.color = '#1e40af';
        } else {
            inp.value = remainingPending;
        }
        _updateReceiveSummary();
    }

    // P1 2026-05-29: Khi panel Nhận hàng mở, ẩn các shipments khác để focus
    // vào shipment đang nhận. Walk tbody children, track active state qua
    // .so-shipment-head rows. Mọi row nằm trong shipment khác → add class
    // .so-receive-hidden (CSS display: none).
    function _hideOtherShipments(activeShId) {
        const tbody = document.getElementById('soTableBody');
        if (!tbody) return;
        let activeMode = false;
        for (const child of tbody.children) {
            if (child.classList.contains('so-shipment-head')) {
                activeMode = child.dataset.shipmentId === activeShId;
                if (!activeMode) child.classList.add('so-receive-hidden');
                continue;
            }
            if (child.classList.contains('so-receive-panel-row')) {
                // Panel row đã chèn cho active shipment → giữ visible
                continue;
            }
            if (!activeMode) {
                child.classList.add('so-receive-hidden');
            }
        }
    }
    function _showAllShipments() {
        document.querySelectorAll('.so-receive-hidden').forEach((el) => {
            el.classList.remove('so-receive-hidden');
        });
    }

    function openReceiveShipmentModal(shId, opts = {}) {
        if (!window.Web2ProductsApi) {
            notify('Web2ProductsApi chưa load', 'error');
            return;
        }
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab?.shipments.find((s) => s.id === shId);
        if (!sh) {
            notify('Không tìm thấy shipment', 'error');
            return;
        }
        const rate = Number(tab.rate) || 1;
        const ccy = tab.currency || 'VND';
        const tabLabel = (tab.label || '').trim();

        // Filter theo 1 NCC (khi bấm nút "Nhận hàng" ở ô NCC) — chỉ list SP của
        // NCC đó trong lô. Không truyền → nhận cả lô (nút cấp lô).
        const onlySupplier = (opts.supplier || '').trim();
        // Fix 2026-06-03: nút "Nhận hàng" ở ô NCC giờ scope theo ĐÚNG đơn
        // (supplier + invoiceGroup) khớp với cell render, không nhận lẫn đơn
        // khác cùng NCC. Fallback theo id giữ behavior cũ cho rows chưa có
        // invoiceGroupId. Không truyền → nhận cả lô (nút cấp lô).
        const onlyGroupId = (opts.invoiceGroupId || '').trim();
        const matchSupplier = (r) => {
            if (onlySupplier && (r.supplier || '').trim() !== onlySupplier) return false;
            if (onlyGroupId && String(r.invoiceGroupId || r.id) !== onlyGroupId) return false;
            return true;
        };

        // P1 2026-05-30: Loại bỏ rows đã nhận đủ (status='received') khỏi panel.
        // User feedback: "Nhận hàng đủ với SL sản phẩm -> không cho nhận hàng
        // sản phẩm đó nữa". Trước đây vẫn show row với input disabled "ĐÃ NHẬN
        // ĐỦ" gây nhiễu. Giờ ẩn hoàn toàn.
        const eligibleRows = (sh.rows || []).filter(
            (r) =>
                (r.productName || '').trim() &&
                Number(r.qty) > 0 &&
                (r.supplier || '').trim() &&
                matchSupplier(r) &&
                r.status !== 'received'
        );

        // Nếu shipment không còn row nào chưa nhận → báo notify + thoát.
        const totalRows = (sh.rows || []).filter(
            (r) =>
                (r.productName || '').trim() &&
                Number(r.qty) > 0 &&
                (r.supplier || '').trim() &&
                matchSupplier(r)
        ).length;
        if (totalRows > 0 && eligibleRows.length === 0) {
            notify('Tất cả SP trong lô này đã nhận đủ', 'info');
            return;
        }

        // PERF: dùng cache nếu có (TTL 5s) — tránh re-fetch khi user open/close
        // liên tục. Cache expires → background re-lookup.
        const cached = _receiveLookupCache.get(shId);
        const stateByKey =
            cached && Date.now() - cached.fetchedAt < RECEIVE_LOOKUP_TTL_MS
                ? cached.stateByKey
                : new Map();

        _receiveItems = eligibleRows.map((r) => {
            const qtyOrdered = Number(r.qty) || 0;
            const ps = stateByKey.get(r.id);
            // Nếu cache hit → dùng pendingQty thực. Cache miss → assume qtyOrdered
            // (modal hiển thị ngay, lookup background sẽ patch sau).
            const remainingPending = ps ? ps.pendingQty : qtyOrdered;
            const alreadyReceived = Math.max(0, qtyOrdered - remainingPending);
            return {
                key: r.id,
                rowId: r.id,
                shipmentId: sh.id,
                code: ps?.code || null,
                name: (r.productName || '').trim(),
                variant: (r.variant || '').trim() || null,
                qty: qtyOrdered, // qty đặt gốc (từ so-order row)
                alreadyReceived,
                remainingPending,
                currentStock: ps?.stock || 0,
                supplier: (r.supplier || '').trim(),
                costPriceRaw: Number(r.costPrice) || 0,
                sellPriceRaw: Number(r.sellPrice) || 0,
                costPriceVnd: Math.round((Number(r.costPrice) || 0) * rate),
                sellPriceVnd: Math.round((Number(r.sellPrice) || 0) * rate),
                imageUrl: r.productImage || null,
                note: tabLabel || null,
            };
        });

        // PERF 2026-05-29: Replace modal with INLINE EXPANSION trong tbody.
        // User báo "scroll modal lag không mượt" — modal có overlay + fixed
        // position + GPU layer + nested scroll → composite work nặng.
        // Inline panel chèn vào table flow → native page scroll, nhẹ + mượt nhất.
        // Remove old modal nếu còn từ version cũ
        const oldModal = document.getElementById('soReceiveModal');
        if (oldModal) oldModal.remove();

        // Close other open panels (chỉ 1 shipment receiving cùng lúc) + show
        // back các shipments đã ẩn trước đó.
        document.querySelectorAll('.so-receive-panel-row').forEach((row) => row.remove());
        _showAllShipments();

        // Tìm shipment header row để insert panel sau
        const shipHeaderRow = document.querySelector(
            `tr.so-shipment-head[data-shipment-id="${CSS.escape(shId)}"]`
        );
        if (!shipHeaderRow) {
            notify('Không tìm thấy shipment row để gắn panel', 'error');
            return;
        }
        const colSpan = shipHeaderRow.querySelector('td')?.getAttribute('colspan') || 12;

        const shipLabel = sh.batch
            ? `Đợt ${sh.batch} · ${formatDateVN(sh.date)}`
            : formatDateVN(sh.date);

        // Tạo panel row + chèn vào tbody sau header
        const panelRow = document.createElement('tr');
        panelRow.className = 'so-receive-panel-row';
        panelRow.dataset.receivePanelFor = shId;
        panelRow.innerHTML = `
            <td colspan="${colSpan}" style="padding:0;">
                <div class="so-receive-panel">
                    <header class="so-receive-panel-head">
                        <div class="so-receive-panel-title">
                            <i data-lucide="truck" style="width:18px;height:18px;color:#16a34a;"></i>
                            <strong>Nhận hàng — ${escapeHtml(shipLabel)}${onlySupplier ? ' · NCC ' + escapeHtml(onlySupplier) : ''}</strong>
                            <span style="font-size:11px;font-weight:500;color:#64748b;background:#fef3c7;padding:2px 8px;border-radius:4px;margin-left:8px;">
                                <i data-lucide="eye-off" style="width:11px;height:11px;vertical-align:-1px;"></i>
                                Các đợt khác tạm ẩn
                            </span>
                        </div>
                        <button type="button" class="so-receive-panel-close" data-so-receive-close title="Đóng (Esc)">
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-receive-panel-hint">
                        <strong>Hướng dẫn:</strong> Default qty nhận = số <strong>còn chờ</strong>.
                        Sửa qty nhận để chỉ nhận 1 phần. SP đã đủ tự disable.
                    </div>
                    <div class="so-receive-panel-toolbar">
                        <button type="button" class="btn-secondary btn-sm" id="soReceiveAllFull">
                            <i data-lucide="check-check" style="width:14px;height:14px;"></i> Tất cả mua đủ
                        </button>
                        <span class="so-receive-panel-summary" id="soReceiveSummary"></span>
                    </div>
                    <div class="so-receive-list" id="soReceiveList"></div>
                    <footer class="so-receive-panel-foot">
                        <button class="btn-secondary" type="button" data-so-receive-close>Hủy</button>
                        <button class="btn-secondary" type="button" id="soReceivePrintBtn" title="In tem QR theo SL (nhập / đã nhận / đặt) — không cần nhận lại">
                            <i data-lucide="printer"></i> In tem
                        </button>
                        <button class="btn-primary" type="button" id="soReceiveConfirmBtn">
                            <i data-lucide="check"></i> Xác nhận nhận hàng
                        </button>
                    </footer>
                </div>
            </td>`;
        shipHeaderRow.insertAdjacentElement('afterend', panelRow);

        // Ẩn các shipments khác để focus vào shipment đang nhận
        _hideOtherShipments(shId);

        // Wire close handlers — đóng panel + show lại các shipments khác
        const closePanel = () => {
            panelRow.remove();
            _showAllShipments();
        };
        panelRow.querySelectorAll('[data-so-receive-close]').forEach((el) => {
            el.addEventListener('click', closePanel);
        });
        // Esc closes panel
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closePanel();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Confirm button
        panelRow
            .querySelector('#soReceiveConfirmBtn')
            .addEventListener('click', confirmReceiveFromModal);

        // In tem button — in/in lại tem QR theo SL kể cả khi đã nhận đủ.
        panelRow
            .querySelector('#soReceivePrintBtn')
            ?.addEventListener('click', printLabelsFromReceivePanel);

        // Tất cả mua đủ button
        panelRow.querySelector('#soReceiveAllFull').addEventListener('click', () => {
            panelRow.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
                inp.value = Number(inp.dataset.receiveQtyMax) || 0;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });

        const listEl = panelRow.querySelector('#soReceiveList');
        if (!_receiveItems.length) {
            listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#94a3b8;">Shipment không có SP nào hợp lệ (cần NCC + tên SP + qty>0).</div>`;
        } else {
            // Group by supplier
            const bySupplier = new Map();
            for (const it of _receiveItems) {
                if (!bySupplier.has(it.supplier)) bySupplier.set(it.supplier, []);
                bySupplier.get(it.supplier).push(it);
            }
            const html = [];
            for (const [supplier, items] of bySupplier) {
                const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0);
                const totalVnd = items.reduce(
                    (s, it) => s + (it.qty || 0) * (it.costPriceVnd || 0),
                    0
                );
                html.push(
                    `<div class="so-receive-group-head">
                        <span style="display:flex;align-items:center;gap:8px;color:#0c4a6e;">
                            <i data-lucide="store" style="width:16px;height:16px;color:#0284c7;"></i>
                            ${escapeHtml(supplier)}
                            <span style="font-size:11px;font-weight:600;padding:2px 8px;background:#0284c7;color:#fff;border-radius:10px;">${items.length} SP</span>
                        </span>
                        <span style="font-size:12px;color:#64748b;font-weight:500;">${totalQty} cái · <strong style="color:#16a34a;">${totalVnd.toLocaleString('vi-VN')}₫</strong></span>
                    </div>`
                );
                for (const it of items) {
                    const hasPartial = it.alreadyReceived > 0;
                    const remaining = it.remainingPending;
                    const fullyReceived = remaining === 0;
                    const lineCostVnd = it.qty * it.costPriceVnd;
                    const qtyInfo = hasPartial
                        ? `<div data-receive-qtyinfo="${escapeHtml(it.key)}" style="font-size:12px;color:#64748b;white-space:nowrap;display:flex;flex-direction:column;align-items:flex-end;line-height:1.4;">
                            <span>Đã đặt: <strong style="color:#0f172a;">${it.qty}</strong></span>
                            <span style="color:#16a34a;">Đã nhận: <strong>${it.alreadyReceived}</strong></span>
                            <span style="color:#f59e0b;">Còn chờ: <strong>${remaining}</strong></span>
                          </div>`
                        : `<div data-receive-qtyinfo="${escapeHtml(it.key)}" style="font-size:13px;color:#64748b;white-space:nowrap;">Đã đặt: <strong style="color:#0f172a;font-size:15px;">${it.qty}</strong></div>`;
                    const defaultStatus = fullyReceived
                        ? `<span data-receive-status="${escapeHtml(it.key)}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;background:#dbeafe;color:#1e40af;white-space:nowrap;">ĐÃ NHẬN ĐỦ</span>`
                        : `<span data-receive-status="${escapeHtml(it.key)}" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;background:#dcfce7;color:#166534;white-space:nowrap;">MUA ĐỦ</span>`;
                    const inputAttrs = fullyReceived
                        ? `disabled value="0"`
                        : `value="${remaining}"`;
                    html.push(`<div class="so-receive-row${fullyReceived ? ' is-fully' : ''}" data-receive-row="${escapeHtml(it.key)}">
                        ${it.imageUrl ? `<img src="${escapeHtml(it.imageUrl)}" loading="lazy" decoding="async" alt="">` : '<div class="so-receive-img-fallback">no img</div>'}
                        <div style="min-width:0;">
                            <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;">${escapeHtml(it.name)}</div>
                            ${it.variant ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(it.variant)}</div>` : ''}
                        </div>
                        <div style="font-size:11px;color:#64748b;white-space:nowrap;text-align:right;">
                            <div>Giá: <strong style="color:#0f172a;">${it.costPriceVnd.toLocaleString('vi-VN')}₫</strong></div>
                            <div style="margin-top:2px;">Tổng: <strong style="color:#16a34a;">${lineCostVnd.toLocaleString('vi-VN')}₫</strong></div>
                        </div>
                        ${qtyInfo}
                        <div style="display:flex;align-items:center;gap:6px;">
                            <label style="font-size:12px;color:#0f172a;font-weight:600;">Nhận:</label>
                            <input type="number" min="0" max="${remaining}" ${inputAttrs} data-receive-qty="${escapeHtml(it.key)}" data-receive-qty-max="${remaining}" data-receive-qty-ordered="${it.qty}" data-receive-qty-already="${it.alreadyReceived}" style="width:80px;padding:8px 10px;border:2px solid #cbd5e1;border-radius:6px;text-align:center;font-weight:700;font-size:15px;${fullyReceived ? 'background:#f1f5f9;color:#94a3b8;cursor:not-allowed;' : 'background:#fff;'}" />
                        </div>
                        ${defaultStatus}
                    </div>`);
                }
            }
            listEl.innerHTML = html.join('');
            // Wire qty inputs → update status badge + summary
            listEl.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
                inp.addEventListener('input', () => _updateReceiveRowStatus(inp));
            });
        }
        _updateReceiveSummary();
        if (window.lucide?.createIcons) window.lucide.createIcons();

        // Smooth scroll panel into view (native scroll, không lag)
        panelRow.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // PERF: fire-and-forget background lookup (no await). Khi xong → patch
        // DOM rows có "đã nhận / còn chờ" từ web2_products thực tế. Panel đã
        // hiển thị ngay nên user không thấy lag. Cache hit (5s) → skip lookup.
        const hasCache = cached && Date.now() - cached.fetchedAt < RECEIVE_LOOKUP_TTL_MS;
        if (!hasCache && eligibleRows.length > 0) {
            const summaryEl = panelRow.querySelector('#soReceiveSummary');
            if (summaryEl) {
                const prevText = summaryEl.textContent;
                summaryEl.textContent = '⏳ Đang kiểm tra tình trạng đã nhận... · ' + prevText;
            }
            _lookupProductStateForRows(eligibleRows)
                .then((stateByKeyFresh) => {
                    _receiveLookupCache.set(shId, {
                        stateByKey: stateByKeyFresh,
                        fetchedAt: Date.now(),
                    });
                    // Panel còn trong DOM? Patch rows.
                    if (!document.body.contains(panelRow)) return;
                    let patched = 0;
                    for (const item of _receiveItems) {
                        const ps = stateByKeyFresh.get(item.rowId);
                        if (!ps) continue;
                        if (ps.pendingQty === item.remainingPending && ps.code === item.code) {
                            continue;
                        }
                        _patchReceiveRowFromLookup(item, ps);
                        patched++;
                    }
                    if (patched > 0 && window.lucide?.createIcons) {
                        window.lucide.createIcons();
                    }
                    _updateReceiveSummary();
                })
                .catch((e) => {
                    console.warn(
                        '[so-order] receive lookup fail (panel vẫn dùng được):',
                        e?.message
                    );
                    _updateReceiveSummary();
                });
        }
    }

    function _updateReceiveRowStatus(input) {
        if (input.disabled) return;
        const key = input.dataset.receiveQty;
        // max = remainingPending (số còn chờ thực tế).
        // qtyOrdered + qtyAlready = số gốc đặt + số đã nhận từ trước.
        const max = Number(input.dataset.receiveQtyMax) || 0;
        const qtyOrdered = Number(input.dataset.receiveQtyOrdered) || 0;
        const qtyAlready = Number(input.dataset.receiveQtyAlready) || 0;
        const val = Math.min(Math.max(0, Number(input.value) || 0), max);
        if (val !== Number(input.value)) input.value = val;
        const totalReceivedAfter = qtyAlready + val;
        const badge = document.querySelector(`[data-receive-status="${CSS.escape(key)}"]`);
        if (badge) {
            if (val === 0 && qtyAlready === 0) {
                badge.textContent = 'CHƯA NHẬN';
                badge.style.background = '#f1f5f9';
                badge.style.color = '#475569';
            } else if (totalReceivedAfter >= qtyOrdered) {
                badge.textContent = `MUA ĐỦ${qtyAlready > 0 ? ` (${qtyAlready}+${val}=${totalReceivedAfter}/${qtyOrdered})` : ''}`;
                badge.style.background = '#dcfce7';
                badge.style.color = '#166534';
            } else {
                badge.textContent = `MUA 1 PHẦN (${totalReceivedAfter}/${qtyOrdered})`;
                badge.style.background = '#fef3c7';
                badge.style.color = '#92400e';
            }
        }
        _updateReceiveSummary();
    }

    function _updateReceiveSummary() {
        // Scoped to active panel (inline expansion 2026-05-29)
        const panelRow = document.querySelector('.so-receive-panel-row');
        if (!panelRow) return;
        const inputs = panelRow.querySelectorAll('input[data-receive-qty]');
        let totalReceiving = 0,
            totalRemaining = 0,
            totalAlready = 0,
            partial = 0,
            full = 0,
            none = 0,
            alreadyFull = 0;
        inputs.forEach((inp) => {
            const max = Number(inp.dataset.receiveQtyMax) || 0;
            const qtyAlready = Number(inp.dataset.receiveQtyAlready) || 0;
            const qtyOrdered = Number(inp.dataset.receiveQtyOrdered) || 0;
            const val = inp.disabled ? 0 : Number(inp.value) || 0;
            totalRemaining += max;
            totalReceiving += val;
            totalAlready += qtyAlready;
            if (inp.disabled) alreadyFull++;
            else if (val === 0 && qtyAlready === 0) none++;
            else if (qtyAlready + val >= qtyOrdered) full++;
            else partial++;
        });
        const el = panelRow.querySelector('#soReceiveSummary');
        if (el) {
            const parts = [
                `Đang nhận: ${totalReceiving}/${totalRemaining} còn chờ`,
                totalAlready > 0 ? `đã nhận trước: ${totalAlready}` : null,
                `${full} mua đủ · ${partial} mua 1 phần · ${none} chưa nhận`,
                alreadyFull > 0 ? `${alreadyFull} đã đủ trước` : null,
            ].filter(Boolean);
            el.textContent = parts.join(' · ');
        }
    }

    // UI-first NOTE: GIỮ await + loading state (button spinner) — đây là NGOẠI
    // LỆ được ghi trong docs/web2/UI-FIRST.md: flow nhiều bước với validation
    // server-side strict (upsertPending lấy code → confirm-purchase-partial đổi
    // tồn thật nhiều SP → in tem barcode). Optimistic rollback ở đây quá rủi ro
    // (đã mutate tồn nhiều SP + đã in tem). User cần thấy spinner tới khi xong.
    async function confirmReceiveFromModal() {
        // Panel = inline expansion (replace modal 2026-05-29 for scroll perf)
        const panelRow = document.querySelector('.so-receive-panel-row');
        const btn = panelRow?.querySelector('#soReceiveConfirmBtn');
        if (!btn || btn.disabled) return;
        const inputs = panelRow.querySelectorAll('input[data-receive-qty]');
        if (!inputs.length) {
            notify('Không có SP nào', 'warning');
            return;
        }
        const receivedMap = new Map();
        inputs.forEach((inp) => {
            const key = inp.dataset.receiveQty;
            const val = Math.min(
                Math.max(0, Number(inp.value) || 0),
                Number(inp.dataset.receiveQtyMax) || 0
            );
            if (val > 0) receivedMap.set(key, val);
        });
        if (!receivedMap.size) {
            notify('Tất cả qty nhận đều = 0 → không có gì để xác nhận', 'warning');
            return;
        }
        const itemsToProcess = _receiveItems.filter((it) => receivedMap.has(it.key));
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            // 1. Upsert pending để có code DB (tạo SP nếu chưa có).
            // FIX H15 (2026-06-11): KHÔNG upsert mù qty đặt gốc — server cộng
            // pending VÔ ĐIỀU KIỆN, mà pending có thể ĐÃ được đẩy trước đó qua
            // Lưu Nháp (syncRowsToKho) hoặc đợt nhận trước → cộng LẶP = pending
            // ảo trong Kho SP. Đọc pending TƯƠI từ Kho ngay trước upsert:
            //   - SP đã có trong Kho → chỉ upsert phần CÒN THIẾU để
            //     confirm-partial trừ được: max(0, qtyNhận − pending hiện tại).
            //     Pending đã đủ → skip upsert, đi thẳng confirm-partial.
            //   - SP chưa có → upsert qty đặt gốc (tạo CHO_MUA, phần chưa nhận
            //     tiếp tục chờ — giữ behavior cũ).
            let freshState = new Map();
            try {
                if (window.Web2ProductsCache?.refresh) await window.Web2ProductsCache.refresh();
                freshState = await _lookupProductStateForRows(
                    itemsToProcess.map((it) => ({
                        id: it.key,
                        productName: it.name,
                        variant: it.variant,
                    }))
                );
            } catch (lkErr) {
                // Lookup fail → fallback behavior cũ (upsert qty gốc) bên dưới.
                console.warn('[so-order] fresh pending lookup fail:', lkErr?.message);
            }
            const upsertPayload = [];
            const upsertOwners = []; // song song payload — item chủ của từng dòng gửi đi
            for (const it of itemsToProcess) {
                const ps = freshState.get(it.key);
                if (ps?.code) it.code = ps.code; // code tươi (seed codeByKey bên dưới)
                const upsertQty = ps
                    ? Math.max(0, (receivedMap.get(it.key) || 0) - (Number(ps.pendingQty) || 0))
                    : it.qty;
                if (upsertQty <= 0) continue; // pending trong Kho đã đủ → không upsert
                upsertPayload.push({
                    name: it.name,
                    variant: it.variant,
                    qty: upsertQty,
                    costPrice: it.costPriceVnd,
                    sellPrice: it.sellPriceVnd,
                    supplier: it.supplier,
                    imageUrl: it.imageUrl,
                    note: it.note,
                });
                upsertOwners.push(it);
            }
            let upsertItems = [];
            if (upsertPayload.length) {
                // Mã SP theo rule cho SP mới (giống Lưu Nháp) — tránh KHO-rnd.
                _assignKhoCodes(upsertPayload);
                const upsertRes = await window.Web2ProductsApi.upsertPending(upsertPayload);
                upsertItems = (upsertRes && upsertRes.items) || [];
            }
            // FIX 1D (2026-06-11): ghép kết quả upsert theo VỊ TRÍ payload —
            // server trả result 1:1 đúng thứ tự payload (chỉ skip khi
            // !name||qty<=0, mà payload client đã loại các case đó) nên
            // upsertItems[i] ↔ upsertOwners[i] kể cả khi có row action='error'
            // chen giữa (row error GIỮ vị trí nhưng KHÔNG được map — vd Code
            // collision: code đó thuộc SP KHÁC). Lệch độ dài (server đổi
            // behavior) → fallback match name, an toàn hơn map mù theo index.
            const codeByKey = new Map();
            for (const it of itemsToProcess) {
                if (it.code) codeByKey.set(it.key, it.code);
            }
            if (upsertItems.length === upsertOwners.length) {
                upsertItems.forEach((ui, i) => {
                    if (!ui.code || ui.action === 'error') return;
                    codeByKey.set(upsertOwners[i].key, ui.code);
                });
            } else {
                const normName = (s) =>
                    String(s || '')
                        .trim()
                        .toLowerCase();
                for (const ui of upsertItems) {
                    if (!ui.code || ui.action === 'error') continue;
                    const owner = upsertOwners.find(
                        (it) => !codeByKey.has(it.key) && normName(it.name) === normName(ui.name)
                    );
                    if (owner) codeByKey.set(owner.key, ui.code);
                }
            }
            // 2. Confirm-purchase-partial với qtyReceived per code.
            const partialItems = itemsToProcess
                .filter((it) => codeByKey.has(it.key))
                .map((it) => ({
                    code: codeByKey.get(it.key),
                    qtyReceived: receivedMap.get(it.key),
                }));
            if (!partialItems.length) throw new Error('Không có code nào để confirm partial');
            const res = await fetch(
                'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-products/confirm-purchase-partial',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify({ items: partialItems }),
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            if (window.Web2ProductsCache) {
                window.Web2ProductsCache.pushTickle({ action: 'so-order-partial-receive' });
            }
            // 3. Update so-order row status. P1 2026-05-29: tính total đã nhận
            // (lần này + đã nhận trước đó) so với qty đặt gốc.
            //   - total >= qtyOrdered → 'received' (mua đủ qua N lần)
            //   - 0 < total < qtyOrdered → 'partial_received'
            //   - total == 0 → giữ status cũ
            const tab = window.SoOrderStorage.getActiveTab(state);
            for (const it of itemsToProcess) {
                const receivedThisTime = receivedMap.get(it.key) || 0;
                const totalReceived = (it.alreadyReceived || 0) + receivedThisTime;
                let newStatus;
                if (totalReceived >= it.qty) newStatus = 'received';
                else if (totalReceived > 0) newStatus = 'partial_received';
                else continue;
                window.SoOrderStorage.updateRow(state, tab.id, it.shipmentId, it.rowId, {
                    status: newStatus,
                });
            }
            pushSync();
            renderAll();
            const fullCount = (data.items || []).filter((r) => r.status === 'DANG_BAN').length;
            const partialCount = (data.items || []).filter((r) => r.status === 'MUA_1_PHAN').length;
            notify(
                `✅ Đã xử lý ${data.processed} SP — ${fullCount} mua đủ, ${partialCount} mua 1 phần`,
                'success'
            );
            panelRow.remove();
            // P1 2026-05-29: in barcode cho SP đã nhận (mua đủ hoặc mua 1 phần).
            // Merge variant + qty thực nhận từ itemsToProcess (server response
            // không trả variant). Skip SP qtyReceived=0.
            try {
                const printableItems = itemsToProcess
                    .filter((it) => receivedMap.has(it.key))
                    .map((it) => {
                        const code = codeByKey.get(it.key);
                        const serverRow = (data.items || []).find((r) => r.code === code);
                        if (!serverRow) return null;
                        return {
                            ...serverRow,
                            variant: it.variant,
                            qtyReceived: receivedMap.get(it.key),
                        };
                    })
                    .filter(Boolean);
                if (printableItems.length > 0) {
                    const uniqSuppliers = Array.from(
                        new Set(itemsToProcess.map((it) => it.supplier))
                    );
                    const supplierLabel =
                        uniqSuppliers.length === 1
                            ? uniqSuppliers[0]
                            : `${uniqSuppliers.length} NCC`;
                    openBarcodePrintModal(printableItems, supplierLabel);
                }
            } catch (printErr) {
                console.warn('[so-order] barcode print skip:', printErr.message);
            }
        } catch (e) {
            console.warn('[so-order] confirmReceive fail:', e);
            notify('Lỗi nhận hàng: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    // 2026-06-07: In tem QR theo SL — KHÔNG cần nhận lại (dùng cho SP đã nhận đủ
    // cần in/in lại tem, hoặc in trước khi xác nhận). SL mỗi SP = qty nhập (>0) →
    // else đã nhận → else qty đặt. Resolve code: dùng code có sẵn (server lookup),
    // thiếu thì upsertPending lấy code (KHÔNG đổi tồn — chỉ confirm-purchase mới đổi).
    async function printLabelsFromReceivePanel() {
        const panelRow = document.querySelector('.so-receive-panel-row');
        const btn = panelRow?.querySelector('#soReceivePrintBtn');
        if (!btn || btn.disabled) return;
        if (!_receiveItems.length) {
            notify('Không có SP để in tem', 'warning');
            return;
        }
        const inputByKey = new Map();
        panelRow.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
            inputByKey.set(inp.dataset.receiveQty, Math.max(0, Number(inp.value) || 0));
        });
        const items = _receiveItems.map((it) => {
            const entered = inputByKey.get(it.key) || 0;
            const printQty =
                entered > 0 ? entered : it.alreadyReceived > 0 ? it.alreadyReceived : it.qty;
            return { ...it, printQty: Math.max(1, Number(printQty) || 1) };
        });
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang tạo tem…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            const codeByKey = new Map();
            items.forEach((it) => {
                if (it.code) codeByKey.set(it.key, it.code);
            });
            const needCode = items.filter((it) => !codeByKey.has(it.key));
            if (needCode.length && window.Web2ProductsApi?.upsertPending) {
                const upsertPayload = needCode.map((it) => ({
                    name: it.name,
                    variant: it.variant,
                    qty: it.qty,
                    costPrice: it.costPriceVnd,
                    sellPrice: it.sellPriceVnd,
                    supplier: it.supplier,
                    imageUrl: it.imageUrl,
                    note: it.note,
                }));
                _assignKhoCodes(upsertPayload);
                const r = await window.Web2ProductsApi.upsertPending(upsertPayload);
                const ui = (r && r.items) || [];
                for (let i = 0; i < ui.length && i < needCode.length; i++) {
                    if (ui[i].code) codeByKey.set(needCode[i].key, ui[i].code);
                }
            }
            // openBarcodePrintModal map quantity = it.qtyReceived → đặt đúng field.
            const products = items
                .filter((it) => codeByKey.get(it.key))
                .map((it) => ({
                    code: codeByKey.get(it.key),
                    name: it.name,
                    variant: it.variant,
                    qtyReceived: Math.max(1, it.printQty),
                    price: it.sellPriceVnd,
                    sellPriceVnd: it.sellPriceVnd,
                    stock: it.currentStock,
                }));
            if (!products.length) {
                notify('Không có mã SP để in tem', 'warning');
                return;
            }
            const uniqSuppliers = Array.from(new Set(items.map((it) => it.supplier)));
            const supplierLabel =
                uniqSuppliers.length === 1 ? uniqSuppliers[0] : `${uniqSuppliers.length} NCC`;
            openBarcodePrintModal(products, supplierLabel);
        } catch (e) {
            console.warn('[so-order] print labels fail:', e);
            notify('Lỗi tạo tem: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    // ---------- Barcode print modal ----------
    function openBarcodePrintModal(items, supplier) {
        // P1 2026-05-30: delegate sang Web2ProductsPrint để dùng cùng modal
        // chọn giấy / SL / kiểu in / có giá... như trang web2/products.
        // Items đã có {code, name, variant, qtyReceived, sellPriceVnd, ...}
        // Map: quantity = qtyReceived (caller request "in theo SL nhận").
        if (window.Web2ProductsPrint?.open) {
            try {
                const products = items.map((it) => ({
                    code: it.code || '',
                    name: it.name || '',
                    variant: it.variant || '',
                    quantity: Math.max(1, Number(it.qtyReceived) || 1),
                    price: Number(it.price) || Number(it.sellPriceVnd) || 0,
                    stock: Number(it.stock) || 0,
                }));
                window.Web2ProductsPrint.open(products);
                return;
            } catch (e) {
                console.warn(
                    '[so-order] Web2ProductsPrint.open failed, fallback legacy modal:',
                    e?.message
                );
            }
        }
        // Fallback: legacy inline modal nếu Web2ProductsPrint chưa load
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
            // P1 2026-05-30: rowId track existing storage row id khi
            // modalMode='edit-shipment' để update không tạo mới.
            rowId: prefill.rowId || null,
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

    // P1 2026-05-30: paste image cell helper — show thumbnail card khi đã
    // có ảnh thay vì input "data:image/jpeg;base..." raw. User feedback
    // "area khi paste hình làm đẹp hơn".
    function _imgPasteCellHtml(row, fieldName) {
        const val = row[fieldName] || '';
        const isDataUrl = val.startsWith('data:');
        const inputValueDisplay = isDataUrl ? '' : val;
        const placeholderText = val ? 'Đổi URL (xóa input để thay ảnh)' : 'Hoặc dán URL';
        const hasImg = !!val;
        return `
            <div class="so-img-cell-v2${hasImg ? ' has-image' : ''}" tabindex="0" data-img-cell data-uid="${row.uid}" data-img-name="${fieldName}">
                ${
                    hasImg
                        ? `<div class="so-img-thumb-wrap">
                                <img class="so-img-thumb" src="${escapeHtml(val)}" alt="" />
                                <button type="button" class="so-img-thumb-clear" data-uid="${row.uid}" data-img-name="${fieldName}" title="Xóa ảnh"><i data-lucide="x"></i></button>
                                <div class="so-img-thumb-label"><i data-lucide="check-circle-2"></i> Đã có ảnh</div>
                           </div>`
                        : `<div class="so-img-cell-hint">
                                <i data-lucide="clipboard-paste"></i>
                                <span>Ctrl+V / Kéo thả ảnh</span>
                           </div>`
                }
                <input
                    type="text"
                    data-field="${fieldName}"
                    data-uid="${row.uid}"
                    placeholder="${placeholderText}"
                    class="so-input-v2 so-input-mini so-input-url"
                    value="${escapeHtml(inputValueDisplay)}"
                />
            </div>`;
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
            (modalMode === 'create' || modalMode === 'edit-shipment') && total > 1
                ? `<button type="button" class="so-action-btn so-row-del" data-action="remove-row" data-uid="${row.uid}" title="Xóa dòng">
                       <i data-lucide="x"></i>
                   </button>`
                : '';
        return `
        <tr class="so-modal-row modal-row" data-uid="${row.uid}">
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
                ${_imgPasteCellHtml(row, 'productImage')}
            </td>
            <td class="so-td-img">
                ${_imgPasteCellHtml(row, 'invoiceImage')}
            </td>
            <td class="so-td-row-actions">${delBtnHtml}</td>
        </tr>`;
    }

    function renderModalRows() {
        const tbody = document.getElementById('soModalProductsBody');
        if (!tbody) return;
        tbody.innerHTML = modalRows.map((r, i) => modalRowHtml(r, i, modalRows.length)).join('');
        // Show + button trong create mode VÀ edit-shipment mode (cho phép thêm
        // SP mới vào lô khi sửa nguyên lô).
        const addWrap = document.getElementById('soModalAddRowWrap');
        if (addWrap) addWrap.hidden = modalMode !== 'create' && modalMode !== 'edit-shipment';
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
        // Product name dropdown trigger.
        // P1 2026-05-30: bỏ trigger trên 'focus' — gây suggestion auto-bật
        // spam khi mở edit modal (input đã pre-fill tên SP). Chỉ trigger
        // khi user thực sự gõ ('input') hoặc nhấn ArrowDown chủ động.
        tbody.querySelectorAll('input[data-field="productName"]').forEach((input) => {
            input.addEventListener('input', () => {
                activeSuggestUid = input.dataset.uid;
                showSuggest(input.dataset.uid, input.value);
            });
            // ArrowDown khi focus → mở suggest dropdown thủ công.
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    activeSuggestUid = input.dataset.uid;
                    showSuggest(input.dataset.uid, input.value);
                }
            });
            input.addEventListener('blur', () => {
                // Delay so click on suggestion item registers first
                setTimeout(() => {
                    if (activeSuggestUid === input.dataset.uid) hideSuggest(input.dataset.uid);
                }, 180);
            });
        });
        // Variant picker per row — pick từ Kho Biến Thể.
        // P1 2026-05-30: cùng pattern — chỉ trigger trên 'input' / ArrowDown,
        // không trên focus.
        tbody.querySelectorAll('input[data-field="variant"]').forEach((input) => {
            input.addEventListener('input', () =>
                showVariantSuggest(input.dataset.uid, input.value)
            );
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    showVariantSuggest(input.dataset.uid, input.value);
                }
            });
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
        // Guard chống stale `change` event từ input đã bị detach (vd:
        // applySuggestionToRow rerender → renderModalRows replace tbody
        // → OLD input detached → browser async firebrate 'change' với value
        // user gõ TRƯỚC khi pick → handler cũ ghi đè row.productName về
        // text query → SAVE sai. Verified 2026-05-30.
        if (!input.isConnected) return;
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
        // P1 2026-05-30: position:fixed + JS anchor để không bị modal-body clip
        const inputEl = document.querySelector(
            `#soModalProductsBody input[data-field="productName"][data-uid="${uid}"]`
        );
        if (inputEl) _positionFixedDropdown(list, inputEl);
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

    // P1 2026-05-30: variant dropdown bị che bởi modal-body overflow:auto
    // dù z-index=80. Fix: dùng position:fixed + JS tính từ input rect (anchor
    // lên window). Dropdown bay ra khỏi clip của modal-body, hover/click OK.
    function _positionFixedDropdown(list, anchorInput) {
        const rect = anchorInput.getBoundingClientRect();
        list.style.position = 'fixed';
        list.style.top = rect.bottom + 4 + 'px';
        list.style.left = rect.left + 'px';
        list.style.width = Math.max(rect.width, 220) + 'px';
        list.style.right = 'auto';
        list.style.zIndex = '9999';
    }

    // Khi modal-body scroll, fixed dropdown sẽ stay lệch khỏi input → đóng
    // hết để user gõ tiếp thì popup mở lại đúng vị trí.
    let _modalScrollListenerBound = false;
    function _bindModalScrollCloseDropdowns() {
        if (_modalScrollListenerBound) return;
        const modal = document.getElementById('soOrderModal');
        const body = modal?.querySelector('.so-modal-body');
        if (!body) return;
        body.addEventListener(
            'scroll',
            () => {
                document
                    .querySelectorAll(
                        '.so-suggest-dropdown:not([hidden]), .so-variant-dropdown:not([hidden])'
                    )
                    .forEach((el) => {
                        el.hidden = true;
                    });
            },
            { passive: true }
        );
        _modalScrollListenerBound = true;
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
        } else {
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
        }
        // Anchor lên input bằng position:fixed để thoát khỏi modal-body overflow
        const inputEl = document.querySelector(
            `#soModalProductsBody input[data-field="variant"][data-uid="${uid}"]`
        );
        if (inputEl) _positionFixedDropdown(list, inputEl);
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
        // P1 2026-05-30: nếu dataUrl là blob/data → re-render row để show
        // thumbnail card thay vì input có raw data URL ugly text.
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            renderModalRows();
            return;
        }
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
            // Wire thumbnail clear button (P1 2026-05-30)
            const clearBtn = cell.querySelector('.so-img-thumb-clear');
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _applyImageToRow(uid, name, '');
                });
            }
        });
    }

    function openOrderModal(rowId, shipmentId) {
        const tab = window.SoOrderStorage.getActiveTab(state);
        // Guard: rows đã nhận → không mở modal edit. User phải revert status
        // (trả hàng / chuyển nháp) ở chỗ khác trước khi sửa.
        if (rowId && shipmentId) {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const r = sh?.rows.find((x) => x.id === rowId);
            if (r?.status === 'received') {
                notify('Dòng "Đã nhận" — không chỉnh sửa được', 'warning');
                return;
            }
        }
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
        if (form.elements.shipExpectedDeliveryDate) {
            form.elements.shipExpectedDeliveryDate.value = '';
        }

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
            if (form.elements.shipExpectedDeliveryDate) {
                form.elements.shipExpectedDeliveryDate.value = sh.expectedDeliveryDate || '';
            }
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
                    if (form.elements.shipExpectedDeliveryDate) {
                        form.elements.shipExpectedDeliveryDate.value =
                            sh.expectedDeliveryDate || '';
                    }
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
        _bindModalScrollCloseDropdowns();
        // Bind supplier picker (idempotent — chỉ bind 1 lần cho input cố định).
        _ensureSupplierCacheSubscription();
        if (form.elements.supplier) {
            attachSupplierPickerOnDemand(form.elements.supplier);
        }
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
            expectedDeliveryDate: form.elements.shipExpectedDeliveryDate?.value || null,
        };
        const sharedFields = {
            supplier: form.elements.supplier.value.trim(),
            note: form.elements.note.value.trim(),
            costNote: form.elements.costNote.value.trim(),
            status: form.elements.status.value,
        };
        // Auto-create NCC vào Ví NCC nếu tên chưa có. Fire-and-forget — không
        // chặn submit, lỗi Firestore chỉ console.warn (vẫn lưu row bình thường).
        _ensureSupplierAsync(sharedFields.supplier);
        // Validate at least 1 row có tên SP
        const validRows = modalRows.filter((r) => r.productName.trim());
        if (!validRows.length) {
            notify('Cần ít nhất 1 sản phẩm có tên', 'warning');
            return;
        }
        // Variant không bắt buộc tồn tại trong Kho Biến Thể (so-order là draft
        // đơn — user có thể gõ size/màu mới chưa khai báo). Validation cũ đã
        // gỡ vì block flow không cần thiết.
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
        } else if (modalMode === 'edit-shipment' && editingShipmentId) {
            // P1 2026-05-30: bulk update nguyên shipment.
            // Logic: rows có rowId → update tại chỗ; rows không có rowId →
            // addRow mới; rows từng có rowId trong sh nhưng modalRows không
            // còn → xóa (user đã click X xóa trong modal).
            const sh = tab.shipments.find((s) => s.id === editingShipmentId);
            if (!sh) {
                notify('Không tìm thấy lô để cập nhật', 'error');
                return;
            }
            window.SoOrderStorage.updateShipment(state, tab.id, sh.id, shipMeta);
            const keptIds = new Set(validRows.filter((r) => r.rowId).map((r) => r.rowId));
            // Xóa rows bị remove khỏi modal
            const toDelete = (sh.rows || []).filter((r) => !keptIds.has(r.id));
            for (const old of toDelete) {
                if (old.status === 'received') continue; // bảo vệ rows đã nhận
                window.SoOrderStorage.deleteRow(state, tab.id, sh.id, old.id);
            }
            // Update / add rows.
            // P1 2026-05-30: rows MỚI thêm trong cùng modal submit dùng
            // chung 1 invoiceGroupId — share Ảnh Hóa Đơn cell (rowspan).
            const addedRows = [];
            const newInvoiceGroupId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
            for (const r of validRows) {
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
                if (r.rowId) {
                    window.SoOrderStorage.updateRow(state, tab.id, sh.id, r.rowId, rowData);
                } else {
                    window.SoOrderStorage.addRow(state, tab.id, sh.id, {
                        ...rowData,
                        invoiceGroupId: newInvoiceGroupId,
                    });
                    addedRows.push(r);
                }
            }
            notify(
                `Đã cập nhật lô (${validRows.length} SP${toDelete.length ? `, xóa ${toDelete.length}` : ''})`,
                'success'
            );
            if (addedRows.length > 0) {
                syncRowsToKho(addedRows, tab).catch(() => {});
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
            // P1 2026-05-30: rows trong cùng modal submit dùng chung 1
            // invoiceGroupId → hóa đơn chung (cell rowspan + sync paste).
            const newInvoiceGroupId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
                    invoiceGroupId: newInvoiceGroupId,
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
    // Sinh mã SP theo rule (Web2ProductCode) cho danh sách items sắp upsert vào
    // Kho. Mỗi item cần {name, variant, supplier}. Gắn item.code = mã rule (vd
    // HNAODEN, HC1QUANXDS5). Mã CHỈ áp dụng khi server INSERT SP mới — SP đã có
    // (match name+variant) giữ mã cũ. Thiếu NCC / lỗi → bỏ code, server tự sinh.
    // Mirror logic getColorShortMap + suggestProductCode của web2-products-app.js.
    function _assignKhoCodes(items) {
        if (!window.Web2ProductCode || !Array.isArray(items) || !items.length) return items;
        // colorShortMap từ Kho Biến Thể (group "Màu" + shortCode locked)
        const colorShortMap = {};
        try {
            const vc = window.Web2VariantsCache;
            if (vc?.getAll) {
                for (const v of vc.getAll()) {
                    if (!/màu/i.test(v.groupName || '')) continue;
                    if (!v.shortCode) continue;
                    const stripped = String(v.value || '')
                        .replace(/^\s*M[àáạăâ]u\s+/iu, '')
                        .trim();
                    const key = window.Web2ProductCode.toAsciiUpper(stripped);
                    if (key) colorShortMap[key] = v.shortCode;
                }
            }
        } catch (_) {
            /* variants cache chưa sẵn — bỏ qua, suggest fallback extract từ tên */
        }
        // supplierPrefixMap từ list NCC + các NCC trong items
        const supplierNames = new Set();
        try {
            (window.Web2SuppliersCache?.getNames?.() || []).forEach(
                (n) => n && supplierNames.add(n)
            );
        } catch (_) {
            /* suppliers cache chưa sẵn */
        }
        for (const it of items) if (it && it.supplier) supplierNames.add(it.supplier);
        const supplierPrefixMap = window.Web2ProductCode.buildPrefixMap([...supplierNames]);
        // NCC "KHO" (SP tạo trực tiếp tại Kho) → prefix literal "KHO".
        supplierPrefixMap['KHO'] = 'KHO';
        // existingCodes từ Kho — push mã mới sinh vào để counter không trùng trong batch
        let existingCodes = [];
        try {
            existingCodes = (window.Web2ProductsCache?.getAll?.() || [])
                .map((p) => p.code)
                .filter(Boolean);
        } catch (_) {
            existingCodes = [];
        }
        for (const it of items) {
            if (!it || !it.name) continue;
            // SP không có NCC (user bỏ trống ô NCC) → default "KHO" giống trang
            // Kho SP (web2-products openCreate). Mã sẽ là KHO+LOẠI+MÀU+SIZE (vd
            // KHOAODEN) thay vì KHO-<rnd> do server sinh — đúng định dạng products.
            const supplierName = (it.supplier && String(it.supplier).trim()) || 'KHO';
            // override màu/size từ biến thể đã chọn (priority hơn extract từ tên SP)
            let overrideColorShort = null;
            let overrideSizeShort = null;
            if (it.variant && window.Web2VariantsCache?.findByValueExact) {
                const v = window.Web2VariantsCache.findByValueExact(it.variant);
                if (v && v.shortCode) {
                    const grp = (v.groupName || '').toLowerCase();
                    if (grp.includes('size') || grp.includes('cỡ') || grp.includes('co')) {
                        overrideSizeShort = v.shortCode.toUpperCase();
                    } else {
                        overrideColorShort = v.shortCode.toUpperCase();
                    }
                }
            }
            try {
                const result = window.Web2ProductCode.suggest({
                    supplierName,
                    productName: it.name,
                    variant: it.variant || '',
                    existingCodes,
                    supplierPrefixMap,
                    colorShortMap,
                    overrideColorShort,
                    overrideSizeShort,
                });
                if (result && result.code) {
                    it.code = result.code;
                    existingCodes.push(result.code);
                }
            } catch (_) {
                /* thiếu NCC / lỗi sinh mã → để server tự sinh (giữ hành vi cũ) */
            }
        }
        return items;
    }

    // UI-first NOTE: hàm này ĐÃ là background best-effort — caller cập nhật
    // local Sổ Order state + renderAll() + notify success NGAY (đồng bộ), rồi
    // mới gọi syncRowsToKho(...).catch(()=>{}) chạy nền. Local Sổ Order là source
    // of truth; Kho SP là mirror dẫn xuất. KHÔNG wrap qua Web2Optimistic.run:
    //   - UI đã apply trước khi gọi → không có gì để "apply optimistic" thêm.
    //   - Rollback push Kho không có ý nghĩa (không undo được row Sổ Order đã ghi).
    //   - Đổi return Promise→undefined sẽ phá hợp đồng .catch() của các call site.
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
        // Sinh mã SP theo rule (Web2ProductCode) trước khi upsert — SP mới sẽ có
        // mã dạng HNAODEN thay vì KHO-rnd ngẫu nhiên do server sinh.
        _assignKhoCodes(items);
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
     *
     * UI-first NOTE: như syncRowsToKho — đã là background best-effort, caller
     * cập nhật local + render TRƯỚC rồi mới gọi. KHÔNG wrap Web2Optimistic.run
     * (không có optimistic apply / rollback có nghĩa, giữ return Promise cho
     * các call site).
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
        // thuộc tên (WEB2-style) — sẽ unique cao, không trùng giữa nhiều
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

    /** Cache đã có data trong memory chưa? Dùng trước khi gọi async check
     *  để bỏ qua loading state nếu lookup sẽ instant.
     *  P1 2026-05-30: ưu tiên flag `isReady()` (init xong, kể cả kho rỗng).
     *  Fallback `getAll().length > 0` cho version cache cũ chưa expose flag. */
    function _isStockCacheReady() {
        const cache = window.Web2ProductsCache;
        if (!cache) return false;
        try {
            if (typeof cache.isReady === 'function' && cache.isReady()) return true;
            return cache.getAll().length > 0;
        } catch {
            return false;
        }
    }

    /** Sync version — chỉ chạy được khi cache ready. Trả null nếu không. */
    function _checkRowsHaveStockSync(rows) {
        if (!_isStockCacheReady()) return null;
        const matches = (rows || [])
            .map((r) => {
                const m = _rowToKhoMatch(r);
                return m.name ? { name: m.name, variant: m.variant || null } : null;
            })
            .filter(Boolean);
        if (!matches.length) return { hasStock: false, items: [] };
        const cache = window.Web2ProductsCache;
        const all = cache.getAll();
        const norm = cache._normalize;
        const stockIndex = new Map();
        for (const p of all) {
            if (Number(p.stock || 0) <= 0) continue;
            const key = norm(p.name) + '|' + norm(p.variant || '');
            const arr = stockIndex.get(key);
            if (arr) arr.push(p);
            else stockIndex.set(key, [p]);
        }
        const flagged = [];
        for (const m of matches) {
            const key = norm(m.name) + '|' + norm(m.variant || '');
            const hits = stockIndex.get(key);
            if (!hits) continue;
            for (const p of hits) {
                flagged.push({
                    code: p.code,
                    name: p.name,
                    variant: p.variant,
                    supplier: p.supplier,
                    stock: p.stock,
                    pending: p.pendingQty || 0,
                });
            }
        }
        return { hasStock: flagged.length > 0, items: flagged };
    }

    // P1 2026-05-30: kiểm tra rows sắp xóa có dính SP đã nhận hàng (stock>0)
    // không. TRƯỚC ĐÂY: N×HTTP fetch tuần tự (~300-800ms/SP) — vấn đề kiến
    // trúc, không phải search algo. BÂYGIỜ: dùng Web2ProductsCache (đã
    // pre-load TẤT CẢ SP vào in-memory Map khi page init, auto refresh qua
    // SSE web2:products), build HashMap O(1) key = normalize(name)+'|'+
    // normalize(variant), lookup instant. Tổng time: <1ms thay vì 2400ms.
    // Caller nên thử _checkRowsHaveStockSync() trước để bỏ qua loading state.
    async function _checkRowsHaveStock(rows) {
        const matches = (rows || [])
            .map((r) => {
                const m = _rowToKhoMatch(r);
                return m.name ? { name: m.name, variant: m.variant || null } : null;
            })
            .filter(Boolean);
        if (!matches.length) return { hasStock: false, items: [] };
        const cache = window.Web2ProductsCache;
        if (!cache) return { hasStock: false, items: [], skipped: true };
        try {
            // Idempotent — chỉ đợi nếu chưa init xong. Sau lần đầu là no-op.
            await cache.init();
            const all = cache.getAll();
            const norm = cache._normalize;
            // Build inverted index 1 lần per call: O(N) products → Map(key→[products]).
            // Group vì hiếm khi name+variant trùng nhưng vẫn handle. Chỉ index SP
            // còn stock > 0 → loại bỏ luôn 90% records cho lookup nhanh hơn.
            const stockIndex = new Map();
            for (const p of all) {
                if (Number(p.stock || 0) <= 0) continue;
                const key = norm(p.name) + '|' + norm(p.variant || '');
                const arr = stockIndex.get(key);
                if (arr) arr.push(p);
                else stockIndex.set(key, [p]);
            }
            const flagged = [];
            for (const m of matches) {
                const key = norm(m.name) + '|' + norm(m.variant || '');
                const hits = stockIndex.get(key);
                if (!hits) continue;
                for (const p of hits) {
                    flagged.push({
                        code: p.code,
                        name: p.name,
                        variant: p.variant,
                        supplier: p.supplier,
                        stock: p.stock,
                        pending: p.pendingQty || 0,
                    });
                }
            }
            return { hasStock: flagged.length > 0, items: flagged };
        } catch (e) {
            console.warn('[so-order] checkRowsStock cache fail:', e.message);
            return { hasStock: false, items: [], skipped: true };
        }
    }

    /** Build confirm opts từ stock-check kết quả cho 1 row. */
    function _buildRowDeleteConfirm(stockCheck) {
        if (stockCheck && stockCheck.hasStock) {
            const it = stockCheck.items[0];
            return {
                title: '⚠️ Sản phẩm còn tồn kho',
                message: `SP "${it.name}${it.variant ? ' (' + it.variant + ')' : ''}" còn ${it.stock} cái tồn kho từ NCC ${it.supplier || '?'}.`,
                footNote: 'Xóa dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.',
                confirmText: 'Vẫn xóa',
                cancelText: 'Hủy',
                danger: true,
            };
        }
        return {
            title: 'Xóa dòng order?',
            message: 'Bạn có chắc muốn xóa dòng order này?',
            confirmText: 'Xóa',
            cancelText: 'Hủy',
            danger: true,
        };
    }

    async function deleteRow(shipmentId, rowId) {
        const key = `row:${rowId}`;
        if (_pendingDeleteKeys.has(key)) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        if (r.status === 'received') {
            notify('Dòng "Đã nhận" — không xóa được', 'warning');
            return;
        }
        const btn = document.querySelector(
            `[data-row-action='delete'][data-row-id='${CSS.escape(rowId)}']`
        );
        _markDeletePending(key, btn);
        try {
            // Fast path: cache ready → sync lookup → open popup với final
            // content NGAY, no loading flash.
            const syncResult = _checkRowsHaveStockSync([r]);
            let ok;
            if (syncResult) {
                ok = await soConfirm(_buildRowDeleteConfirm(syncResult));
            } else {
                // Cold start fallback: cache đang load → mở popup với loading.
                // P1 2026-05-30: timeout 1.2s → bỏ qua check, dùng confirm
                // generic. User feedback "kiểm tra tồn kho quá lâu".
                const ctrl = soConfirmOpen({
                    ..._buildRowDeleteConfirm(null),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                const STOCK_CHECK_TIMEOUT_MS = 1200;
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({
                        ..._buildRowDeleteConfirm(stockCheck),
                        loading: false,
                    });
                };
                const timer = setTimeout(() => finishWith(null), STOCK_CHECK_TIMEOUT_MS);
                _checkRowsHaveStock([r])
                    .then((stockCheck) => {
                        clearTimeout(timer);
                        finishWith(stockCheck);
                    })
                    .catch((e) => {
                        console.warn('[so-order] stock check fail:', e.message);
                        clearTimeout(timer);
                        finishWith(null);
                    });
                ok = await ctrl.result;
            }
            if (!ok) return;
            const adj = { ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) };
            window.SoOrderStorage.deleteRow(state, tab.id, shipmentId, rowId);
            notify('Đã xóa dòng', 'info');
            if (adj.name && adj.delta !== 0) adjustKhoPending([adj]);
            pushSync();
            renderAll();
        } finally {
            _unmarkDeletePending(key, btn);
        }
    }

    /** Build confirm opts từ stock-check kết quả cho cả 1 lô. */
    function _buildShipmentDeleteConfirm(stockCheck, n) {
        if (stockCheck && stockCheck.hasStock) {
            const lines = stockCheck.items
                .slice(0, 5)
                .map(
                    (it) =>
                        `${it.name}${it.variant ? ' (' + it.variant + ')' : ''}: ${it.stock} tồn từ ${it.supplier || '?'}`
                );
            if (stockCheck.items.length > 5) {
                lines.push(`... +${stockCheck.items.length - 5} SP nữa`);
            }
            return {
                title: `⚠️ Lô này có ${stockCheck.items.length} SP còn tồn kho`,
                message: 'Các sản phẩm dưới đây đã nhận hàng và còn stock trong Kho:',
                items: lines,
                footNote: `Xóa lô + ${n} dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.`,
                confirmText: 'Vẫn xóa lô',
                cancelText: 'Hủy',
                danger: true,
            };
        }
        return {
            title: 'Xóa lô?',
            message: `Xóa lô này + ${n} dòng order bên trong?`,
            confirmText: 'Xóa lô',
            cancelText: 'Hủy',
            danger: true,
        };
    }

    async function deleteShipment(shipmentId) {
        const key = `ship:${shipmentId}`;
        if (_pendingDeleteKeys.has(key)) return;
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        const n = sh.rows.length;
        const btn = document.querySelector(
            `[data-shipment-action='delete-shipment'][data-shipment-id='${CSS.escape(shipmentId)}']`
        );
        _markDeletePending(key, btn);
        try {
            // Fast path: cache ready → sync lookup → final content luôn.
            const syncResult = _checkRowsHaveStockSync(sh.rows || []);
            let ok;
            if (syncResult) {
                ok = await soConfirm(_buildShipmentDeleteConfirm(syncResult, n));
            } else {
                // Cold start fallback — timeout 1.2s để không treo lâu.
                const ctrl = soConfirmOpen({
                    ..._buildShipmentDeleteConfirm(null, n),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({
                        ..._buildShipmentDeleteConfirm(stockCheck, n),
                        loading: false,
                    });
                };
                const timer = setTimeout(() => finishWith(null), 1200);
                _checkRowsHaveStock(sh.rows || [])
                    .then((stockCheck) => {
                        clearTimeout(timer);
                        finishWith(stockCheck);
                    })
                    .catch((e) => {
                        console.warn('[so-order] stock check fail:', e.message);
                        clearTimeout(timer);
                        finishWith(null);
                    });
                ok = await ctrl.result;
            }
            if (!ok) return;
            return _finalizeDeleteShipment(tab, sh, shipmentId);
        } finally {
            _unmarkDeletePending(key, btn);
        }
    }

    function _finalizeDeleteShipment(tab, sh, shipmentId) {
        // 2026-05-30: nếu MỌI rows trong lô đã nhận (status='received') → soft
        // delete vào trash với retention 7 ngày. User có thể restore trong
        // "Thùng rác". Lô có draft/ordered rows vẫn hard delete như cũ.
        const rows = sh.rows || [];
        const allReceived = rows.length > 0 && rows.every((r) => r.status === 'received');
        if (allReceived) {
            const entry = window.SoOrderStorage.softDeleteShipment(state, tab.id, shipmentId);
            if (entry) {
                notify(`Đã chuyển lô vào Thùng rác. Tự xoá vĩnh viễn sau 7 ngày.`, 'info');
                pushSync();
                renderAll();
                return;
            }
        }
        const adjustments = rows
            .map((r) => ({ ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) }))
            .filter((a) => a.name && a.delta !== 0);
        window.SoOrderStorage.deleteShipment(state, tab.id, shipmentId);
        notify('Đã xóa lô', 'info');
        if (adjustments.length) adjustKhoPending(adjustments);
        pushSync();
        renderAll();
    }

    // ---------- Trash UI ----------

    function _fmtTrashDate(ts) {
        const d = new Date(Number(ts) || 0);
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }

    function _daysUntilPurge(deletedAt) {
        const remainMs = 7 * 24 * 60 * 60 * 1000 - (Date.now() - Number(deletedAt));
        if (remainMs <= 0) return 0;
        return Math.ceil(remainMs / (24 * 60 * 60 * 1000));
    }

    function updateTrashCountBadge() {
        const badge = document.getElementById('soTrashCount');
        if (!badge) return;
        const trash = window.SoOrderStorage.getTrash(state);
        if (!trash.length) {
            badge.hidden = true;
            badge.textContent = '0';
        } else {
            badge.hidden = false;
            badge.textContent = String(trash.length);
        }
    }

    function openTrashModal() {
        renderTrashList();
        showModal('soTrashModal');
    }

    function renderTrashList() {
        const list = document.getElementById('soTrashList');
        if (!list) return;
        const trash = [...window.SoOrderStorage.getTrash(state)].sort(
            (a, b) => Number(b.deletedAt) - Number(a.deletedAt)
        );
        if (!trash.length) {
            list.innerHTML = `<div class="so-trash-empty">Thùng rác trống.</div>`;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        list.innerHTML = trash
            .map((entry) => {
                const sh = entry.shipment || {};
                const rows = sh.rows || [];
                const suppliers = Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean)));
                const supplierLabel = suppliers.join(', ') || '—';
                const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
                const daysLeft = _daysUntilPurge(entry.deletedAt);
                const dateLabel = sh.batch
                    ? `Đợt ${escapeHtml(sh.batch)}`
                    : formatDateVN(sh.date) || '—';
                return `<div class="so-trash-card" data-trash-id="${escapeHtml(entry.id)}">
                    <div class="so-trash-card-main">
                        <div class="so-trash-card-title">
                            <span class="so-trash-tab">${escapeHtml(entry.tabLabel || entry.tabId)}</span>
                            <span class="so-trash-batch">${dateLabel}</span>
                        </div>
                        <div class="so-trash-card-sub">
                            <span><i data-lucide="store"></i> ${escapeHtml(supplierLabel)}</span>
                            <span><i data-lucide="package"></i> ${rows.length} SP · ${totalQty} món</span>
                            <span><i data-lucide="clock"></i> Xoá ${escapeHtml(_fmtTrashDate(entry.deletedAt))}</span>
                            <span class="so-trash-countdown ${daysLeft <= 1 ? 'is-urgent' : ''}">
                                <i data-lucide="hourglass"></i> Còn ${daysLeft} ngày
                            </span>
                        </div>
                    </div>
                    <div class="so-trash-card-actions">
                        <button class="btn-secondary" type="button" data-trash-action="restore" data-trash-id="${escapeHtml(entry.id)}">
                            <i data-lucide="rotate-ccw"></i> Khôi phục
                        </button>
                        <button class="btn-danger" type="button" data-trash-action="purge" data-trash-id="${escapeHtml(entry.id)}">
                            <i data-lucide="trash-2"></i> Xoá vĩnh viễn
                        </button>
                    </div>
                </div>`;
            })
            .join('');
        list.querySelectorAll('[data-trash-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.trashAction;
                const id = btn.dataset.trashId;
                if (action === 'restore') handleTrashRestore(id);
                else if (action === 'purge') handleTrashPurge(id);
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function handleTrashRestore(id) {
        const ok = window.SoOrderStorage.restoreFromTrash(state, id);
        if (!ok) {
            notify('Không tìm thấy entry để khôi phục', 'error');
            return;
        }
        notify('Đã khôi phục lô', 'success');
        pushSync();
        renderAll();
        updateTrashCountBadge();
        renderTrashList();
    }

    async function handleTrashPurge(id) {
        const ok = await soConfirm({
            title: 'Xoá vĩnh viễn?',
            body: 'Lô này sẽ bị xoá hoàn toàn, không thể khôi phục.',
            confirmText: 'Xoá vĩnh viễn',
            cancelText: 'Huỷ',
            danger: true,
        });
        if (!ok) return;
        window.SoOrderStorage.purgeFromTrash(state, id);
        notify('Đã xoá vĩnh viễn', 'info');
        pushSync();
        updateTrashCountBadge();
        renderTrashList();
    }

    function openShipmentModal(shipmentId) {
        // P1 2026-05-30: trước chỉ load row đầu (sh.rows[0]) → user nói
        // "chỉ thấy 1 sản phẩm đầu". Giờ load TẤT CẢ rows của shipment
        // vào modal để user thấy + sửa nguyên lô.
        const tab = window.SoOrderStorage.getActiveTab(state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        if (!sh.rows.length) {
            openOrderModal(null, shipmentId);
            return;
        }
        // 2026-05-30: rows đã nhận (status='received') bị khoá. Nếu TẤT CẢ
        // rows đã nhận → không cho mở modal. Nếu có rows draft/ordered →
        // mở modal nhưng chỉ load rows editable (received rows giữ nguyên
        // trong storage, bảo vệ qua _finalizeShipmentSubmit toDelete loop).
        const editableRows = (sh.rows || []).filter((r) => r.status !== 'received');
        const skippedCount = (sh.rows || []).length - editableRows.length;
        if (!editableRows.length) {
            notify('Tất cả SP trong lô đã nhận — không sửa được. Xoá lô nếu muốn dọn.', 'warning');
            return;
        }
        if (skippedCount > 0) {
            notify(`Bỏ qua ${skippedCount} SP đã nhận khỏi modal (giữ nguyên trong lô).`, 'info');
        }
        openShipmentEditAllRows(sh, tab, editableRows);
    }

    // P1 2026-05-30: mở modal edit shipment với TẤT CẢ rows
    // (vs openOrderModal(rowId, ...) chỉ edit 1 row).
    // Modal mode = 'edit-shipment' — handleOrderSubmit handle update bulk rows.
    function openShipmentEditAllRows(sh, tab, rowsOverride) {
        editingRowId = null;
        editingShipmentId = sh.id;
        editingTabId = tab.id;
        modalMode = 'edit-shipment';
        const form = document.getElementById('soOrderForm');
        const titleEl = document.getElementById('soModalTitle');
        form.reset();
        titleEl.textContent = `Sửa lô — ${sh.batch ? 'Đợt ' + sh.batch : formatDateVN(sh.date)}`;
        form.elements.shipDate.value = sh.date || '';
        form.elements.shipBatch.value = sh.batch || '';
        form.elements.shipCaseCount.value = sh.caseCount || 0;
        form.elements.shipWeightKg.value = sh.weightKg || 0;
        form.elements.shipContractAmount.value = sh.contractAmount || 0;
        form.elements.shipContractCurrency.value = sh.contractCurrency || tab.currency || 'VND';
        if (form.elements.shipExpectedDeliveryDate) {
            form.elements.shipExpectedDeliveryDate.value = sh.expectedDeliveryDate || '';
        }
        // Shared fields lấy từ row đầu — user có thể sửa shipment-wide
        const r0 = sh.rows[0] || {};
        form.elements.supplier.value = r0.supplier || '';
        form.elements.status.value = r0.status || 'draft';
        form.elements.note.value = r0.note || '';
        form.elements.costNote.value = r0.costNote || '';
        // Load rows vào modal. rowsOverride filter rows đã nhận trước khi
        // vào modal — guarantee user không thấy/sửa được rows received.
        const rowsToLoad = rowsOverride || sh.rows;
        modalRows = rowsToLoad.map((r) =>
            _newModalRow({
                rowId: r.id, // track existing row id để update không tạo mới
                productName: r.productName || '',
                variant: r.variant || '',
                qty: r.qty,
                sellPrice: r.sellPrice,
                costPrice: r.costPrice,
                productImage: r.productImage || '',
                invoiceImage: r.invoiceImage || '',
            })
        );
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
        _bindModalScrollCloseDropdowns();
        _ensureSupplierCacheSubscription();
        if (form.elements.supplier) {
            attachSupplierPickerOnDemand(form.elements.supplier);
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

    async function handleTabDelete() {
        const form = document.getElementById('soTabSettingsForm');
        const tabId = form.dataset.tabId;
        if (!tabId) return;
        const key = `tab:${tabId}`;
        if (_pendingDeleteKeys.has(key)) return;
        const tab = state.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const allRows = [];
        for (const sh of tab.shipments || []) {
            for (const r of sh.rows || []) allRows.push(r);
        }
        const btn = document.getElementById('soTabDeleteBtn');
        _markDeletePending(key, btn);
        try {
            // P1 2026-05-29 fix orphan bug: trước đây deleteTab() bỏ qua adjust
            // pending qty của các rows trong tab → pending stuck ở web2_products.
            const buildOpts = (stockCheck) => {
                if (stockCheck && stockCheck.hasStock) {
                    const lines = stockCheck.items
                        .slice(0, 5)
                        .map((it) => `${it.name}: ${it.stock} tồn từ ${it.supplier || '?'}`);
                    if (stockCheck.items.length > 5) {
                        lines.push(`... +${stockCheck.items.length - 5} SP nữa`);
                    }
                    return {
                        title: `⚠️ Tab có ${stockCheck.items.length} SP còn tồn kho`,
                        message: `Tab này có ${allRows.length} dòng order và các SP dưới đây còn stock trong Kho:`,
                        items: lines,
                        footNote: 'Xóa tab sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.',
                        confirmText: 'Vẫn xóa tab',
                        cancelText: 'Hủy',
                        danger: true,
                    };
                }
                return {
                    title: 'Xóa tab?',
                    message: `Xóa tab và toàn bộ ${allRows.length} order trong tab này?`,
                    confirmText: 'Xóa tab',
                    cancelText: 'Hủy',
                    danger: true,
                };
            };
            const syncResult = _checkRowsHaveStockSync(allRows);
            let ok;
            if (syncResult) {
                ok = await soConfirm(buildOpts(syncResult));
            } else {
                const ctrl = soConfirmOpen({
                    ...buildOpts(null),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({ ...buildOpts(stockCheck), loading: false });
                };
                const timer = setTimeout(() => finishWith(null), 1200);
                _checkRowsHaveStock(allRows)
                    .then((stockCheck) => {
                        clearTimeout(timer);
                        finishWith(stockCheck);
                    })
                    .catch((e) => {
                        console.warn('[so-order] stock check fail:', e.message);
                        clearTimeout(timer);
                        finishWith(null);
                    });
                ok = await ctrl.result;
            }
            if (!ok) return;
            // Trừ pending cho rows trước khi delete tab.
            const adjustments = allRows
                .map((r) => ({ ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) }))
                .filter((a) => a.name && a.delta !== 0);
            if (window.SoOrderStorage.deleteTab(state, tabId)) {
                if (adjustments.length) adjustKhoPending(adjustments);
                notify('Đã xóa tab', 'info');
                hideModal('soTabSettingsModal');
                pushSync();
                renderAll();
            } else {
                notify('Cần giữ lại ít nhất 1 tab', 'warning');
            }
        } finally {
            _unmarkDeletePending(key, btn);
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

    /**
     * Open confirm dialog instantly + return controller cho late update.
     * Khắc phục delay khi caller cần chạy async check (vd: stock check)
     * trước khi populate full content — popup hiện ngay với loading state,
     * caller chạy check trong nền, gọi ctrl.update() khi xong.
     *
     * @param {Object} opts
     * @param {string} [opts.title='Xác nhận']
     * @param {string} [opts.message='']
     * @param {string[]} [opts.items=null] - list rendered as <ul>
     * @param {string} [opts.footNote=''] - red foot warning box
     * @param {string} [opts.confirmText='OK']
     * @param {string} [opts.cancelText='Hủy']
     * @param {boolean} [opts.danger=true]
     * @param {boolean} [opts.loading=false] - show spinner + disable OK
     * @param {string} [opts.loadingText='Đang kiểm tra...']
     * @returns {{ result: Promise<boolean>, update: (patch) => void, close: (val?: boolean) => void, closed: boolean }}
     */
    function soConfirmOpen(opts = {}) {
        let modal = document.getElementById('soConfirmModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'soConfirmModal';
            modal.className = 'so-modal so-confirm-modal';
            modal.hidden = true;
            modal.innerHTML = `
                <div class="so-modal-backdrop" data-so-confirm-cancel></div>
                <div class="so-modal-panel so-modal-panel-narrow" role="dialog" aria-modal="true" aria-labelledby="soConfirmTitle">
                    <header class="so-modal-head">
                        <h2 id="soConfirmTitle" data-so-confirm-title></h2>
                        <button class="so-modal-close" type="button" data-so-confirm-cancel aria-label="Hủy">
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-modal-body so-confirm-body">
                        <p data-so-confirm-message></p>
                        <ul data-so-confirm-items hidden></ul>
                        <div class="so-confirm-foot-note" data-so-confirm-foot hidden></div>
                        <div class="so-confirm-loading" data-so-confirm-loading hidden>
                            <span class="so-confirm-spinner"></span>
                            <span data-so-confirm-loading-text>Đang kiểm tra...</span>
                        </div>
                    </div>
                    <footer class="so-modal-foot">
                        <span class="so-modal-foot-spacer"></span>
                        <button type="button" class="so-btn-confirm-cancel" data-so-confirm-cancel></button>
                        <button type="button" data-so-confirm-ok></button>
                    </footer>
                </div>
            `;
            document.body.appendChild(modal);
        }
        const titleEl = modal.querySelector('[data-so-confirm-title]');
        const msgEl = modal.querySelector('[data-so-confirm-message]');
        const itemsEl = modal.querySelector('[data-so-confirm-items]');
        const footEl = modal.querySelector('[data-so-confirm-foot]');
        const loadingEl = modal.querySelector('[data-so-confirm-loading]');
        const loadingTextEl = modal.querySelector('[data-so-confirm-loading-text]');
        const okBtn = modal.querySelector('[data-so-confirm-ok]');
        const cancelBtn = modal.querySelector('.so-btn-confirm-cancel');

        let current = {
            title: 'Xác nhận',
            message: '',
            items: null,
            footNote: '',
            confirmText: 'OK',
            cancelText: 'Hủy',
            danger: true,
            loading: false,
            loadingText: 'Đang kiểm tra...',
            ...opts,
        };

        const render = () => {
            titleEl.textContent = current.title;
            msgEl.textContent = current.message;
            msgEl.hidden = !current.message;
            if (Array.isArray(current.items) && current.items.length) {
                itemsEl.innerHTML = current.items
                    .map((it) => `<li>${escapeHtml(String(it))}</li>`)
                    .join('');
                itemsEl.hidden = false;
            } else {
                itemsEl.innerHTML = '';
                itemsEl.hidden = true;
            }
            if (current.footNote) {
                footEl.textContent = current.footNote;
                footEl.hidden = false;
            } else {
                footEl.textContent = '';
                footEl.hidden = true;
            }
            if (current.loading) {
                loadingTextEl.textContent = current.loadingText;
                loadingEl.hidden = false;
                okBtn.disabled = true;
            } else {
                loadingEl.hidden = true;
                okBtn.disabled = false;
            }
            okBtn.textContent = current.confirmText;
            okBtn.className = current.danger ? 'so-btn-confirm-danger' : 'so-btn-confirm-primary';
            cancelBtn.textContent = current.cancelText;
            modal.classList.toggle('is-danger', !!current.danger);
        };

        render();
        modal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();

        let closed = false;
        let resolveFn;
        const result = new Promise((r) => {
            resolveFn = r;
        });
        const finish = (val) => {
            if (closed) return;
            closed = true;
            modal.hidden = true;
            modal.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey);
            resolveFn(val);
        };
        const onClick = (e) => {
            const okEl = e.target.closest('[data-so-confirm-ok]');
            if (okEl) {
                if (!okBtn.disabled) finish(true);
                return;
            }
            if (e.target.closest('[data-so-confirm-cancel]')) finish(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(false);
            else if (e.key === 'Enter' && !okBtn.disabled) finish(true);
        };
        modal.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        setTimeout(() => {
            if (closed) return;
            if (!okBtn.disabled) okBtn.focus();
            else cancelBtn.focus();
        }, 30);

        return {
            result,
            get closed() {
                return closed;
            },
            update(patch) {
                if (closed) return;
                current = { ...current, ...(patch || {}) };
                render();
            },
            close(val = false) {
                finish(val);
            },
        };
    }

    /** Drop-in cho window.confirm() — returns Promise<boolean> trực tiếp. */
    function soConfirm(opts = {}) {
        return soConfirmOpen(opts).result;
    }

    // Spam guard: track delete actions đang pending. Click lần 2 trên cùng
    // target → bỏ qua. CSS [data-pending-delete='1'] làm icon mờ.
    const _pendingDeleteKeys = new Set();
    function _markDeletePending(key, btn) {
        _pendingDeleteKeys.add(key);
        if (btn) btn.dataset.pendingDelete = '1';
    }
    function _unmarkDeletePending(key, btn) {
        _pendingDeleteKeys.delete(key);
        if (btn) delete btn.dataset.pendingDelete;
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
        document.getElementById('soTrashBtn')?.addEventListener('click', openTrashModal);
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
        // P1 2026-05-30: invoiceImage = share toàn group → broadcast tất cả
        // rows cùng invoiceGroupId trong shipment. productImage vẫn per-row.
        if (field === 'invoiceImage') {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const row = sh?.rows.find((r) => r.id === rowId);
            const gid = row?.invoiceGroupId;
            if (gid && window.SoOrderStorage.updateInvoiceImageForGroup) {
                const n = window.SoOrderStorage.updateInvoiceImageForGroup(
                    state,
                    tab.id,
                    shipmentId,
                    gid,
                    newUrl
                );
                notify(
                    n > 1 ? `Đã lưu ảnh hóa đơn cho ${n} SP cùng nhóm` : 'Đã lưu ảnh hóa đơn',
                    'success'
                );
            } else {
                window.SoOrderStorage.updateRow(state, tab.id, shipmentId, rowId, {
                    [field]: newUrl,
                });
                notify('Đã lưu ảnh', 'success');
            }
        } else {
            window.SoOrderStorage.updateRow(state, tab.id, shipmentId, rowId, {
                [field]: newUrl,
            });
            notify('Đã lưu ảnh', 'success');
        }
        pushSync();
        renderAll();
        flashRow(rowId);
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
        // P1 2026-05-30: load() giờ async (IDB read). Await trước khi render.
        state = await window.SoOrderStorage.load();
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
        //
        // SSE NOTE: KHÔNG cần subscribe trực tiếp 'web2:products' ở đây — cache
        // đã tự subscribe topic đó (web2-products-cache _setupRealtime) và emit
        // cho subscriber bên dưới. Badge tồn/"Đã có ở kho" tự cập nhật realtime
        // xuyên máy qua đúng 1 nguồn (cache), tránh double-listen.
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

        // Web2SuppliersCache — bật picker NCC cho input modal + inline edit.
        // Idempotent, fail-safe: nếu Firestore offline → cache rỗng, dropdown
        // chỉ gợi ý từ supplier names có trong state hiện tại.
        if (window.Web2SuppliersCache) {
            window.Web2SuppliersCache.init().catch(() => {});
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
            const remoteHandler = async () => {
                state = await window.SoOrderStorage.load();
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
                state = await window.SoOrderStorage.load();
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
