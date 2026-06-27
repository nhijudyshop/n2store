// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — bảng chính: tab strip, table body, shipment header/html, row html, footer totals, edit-table toggle. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.setEditTableMode = function setEditTableMode(on) {
        SO.editTableMode = !!on;
        try {
            localStorage.setItem(SO.EDIT_TABLE_MODE_KEY, SO.editTableMode ? 'true' : 'false');
        } catch {
            /* quota / disabled */
        }
        SO.applyEditTableModeUi();
    };
    SO.applyEditTableModeUi = function applyEditTableModeUi() {
        document.body.classList.toggle('so-edit-table-mode', SO.editTableMode);
        const btn = document.getElementById('soEditTableBtn');
        if (btn) {
            btn.classList.toggle('is-active', SO.editTableMode);
            btn.setAttribute('aria-pressed', SO.editTableMode ? 'true' : 'false');
        }
    };
    SO.renderTabStrip = function renderTabStrip() {
        const strip = document.getElementById('soTabStrip');
        if (!strip) return;
        const html = SO.state.tabs
            .map((t) => {
                const cur = t.currency === 'VND' ? '₫' : t.currency;
                const active = t.id === SO.state.activeTabId ? 'is-active' : '';
                return `<button class="so-tab-pill ${active}" data-tab-id="${SO.escapeHtml(t.id)}" type="button">
                    <span>${SO.escapeHtml(t.label)}</span>
                    <span class="so-tab-pill-cur">${SO.escapeHtml(cur)}</span>
                </button>`;
            })
            .join('');
        strip.innerHTML = html;
        strip.querySelectorAll('.so-tab-pill').forEach((el) => {
            el.addEventListener('click', () => {
                SO.state.activeTabId = el.dataset.tabId;
                window.SoOrderStorage.save(SO.state);
                SO.pushSync();
                SO.renderAll();
            });
        });
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const lbl = document.getElementById('soActiveTabLabel');
        if (lbl) lbl.textContent = tab.label;
    };

    SO.renderTableHead = function renderTableHead() {
        // Column header row no longer lives in the global <thead> — each
        // shipment renders its own header row inside its expand area,
        // so a sticky top header isn't needed (and would duplicate the
        // per-shipment one). Keep <thead> empty to preserve table layout.
        const tr = document.getElementById('soTableHeadRow');
        if (tr) tr.innerHTML = '';
    };

    SO.columnHeaderRowHtml = function columnHeaderRowHtml() {
        return (
            '<tr class="so-shipment-colhead">' +
            SO.COLUMNS.filter((c) => SO.activeColVis()[c.key])
                .map(
                    (c) =>
                        `<th class="so-shipment-colhead-cell" data-col="${SO.escapeHtml(c.key)}">${SO.escapeHtml(c.label)}</th>`
                )
                .join('') +
            '</tr>'
        );
    };

    SO.renderTableBody = function renderTableBody() {
        const tbody = document.getElementById('soTableBody');
        const empty = document.getElementById('soEmptyState');
        if (!tbody) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const shipments = tab.shipments || [];
        if (!shipments.length) {
            tbody.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        // Sort shipments by date desc so newest is on top
        const sorted = [...shipments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const visibleColCount = SO.COLUMNS.filter((c) => SO.activeColVis()[c.key]).length;
        tbody.innerHTML = sorted.map((sh) => SO.shipmentHtml(sh, tab, visibleColCount)).join('');

        // Wire shipment-header click → toggle collapsed
        tbody.querySelectorAll('[data-toggle-shipment]').forEach((el) => {
            el.addEventListener('click', () => {
                const shId = el.dataset.toggleShipment;
                const sh = shipments.find((s) => s.id === shId);
                if (!sh) return;
                window.SoOrderStorage.updateShipment(SO.state, tab.id, shId, {
                    collapsed: !sh.collapsed,
                });
                SO.pushSync();
                SO.renderAll();
            });
        });
        // Edit / delete shipment from header
        tbody.querySelectorAll('[data-shipment-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.shipmentAction;
                const shId = btn.dataset.shipmentId;
                if (action === 'edit-shipment') SO.openShipmentModal(shId);
                else if (action === 'delete-shipment') SO.deleteShipment(shId);
                else if (action === 'add-row') SO.openOrderModal(null, shId);
                else if (action === 'receive') SO.openReceiveShipmentModal(shId);
                else if (action === 'receive-ncc')
                    SO.openReceiveShipmentModal(shId, {
                        supplier: btn.dataset.supplier || '',
                        invoiceGroupId: btn.dataset.invoiceGroup || '',
                    });
            });
        });
        // Inline-edit pills in shipment header (date / batch / caseCount / weightKg)
        tbody.querySelectorAll('[data-shipment-edit]').forEach((pill) => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                SO.beginShipmentFieldEdit(pill);
            });
        });
        // Row actions
        tbody.querySelectorAll('[data-row-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.rowAction;
                const rowId = btn.dataset.rowId;
                const shId = btn.dataset.shipmentId;
                if (action === 'edit') SO.openOrderModal(rowId, shId);
                else if (action === 'delete') SO.deleteRow(shId, rowId);
            });
        });
        tbody.querySelectorAll('img[data-zoomable]').forEach((img) => {
            img.addEventListener('click', () => SO.openLightbox(img.src));
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
                if (SO._isRowLocked(rowId, shipmentId)) {
                    SO.notify('Dòng "Đã nhận" — không chỉnh sửa được', 'warning');
                    return;
                }
                SO.openInlineImageModal(rowId, shipmentId, field);
            });
        });
        // Inline dblclick-to-edit per cell — đăng ký 1 lần ở tbody level
        if (!tbody.__inlineEditBound) {
            tbody.addEventListener('dblclick', SO.onCellDoubleClick);
            tbody.__inlineEditBound = true;
        }
        // Bulk edit mode — delegated handlers cho input/select trong table.
        // Bound 1 lần; chỉ active khi editTableMode = true (DOM có input).
        if (!tbody.__bulkEditBound) {
            tbody.addEventListener('change', SO.onBulkEditChange);
            tbody.addEventListener('keydown', SO.onBulkEditKeydown);
            tbody.addEventListener('focusin', SO.onBulkEditFocusIn);
            tbody.__bulkEditBound = true;
        }
        SO.applyEditTableModeUi();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO.beginShipmentFieldEdit = function beginShipmentFieldEdit(pill) {
        const shId = pill.dataset.shipmentId;
        const field = pill.dataset.shipmentEdit;
        if (!shId || !field) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab?.shipments.find((s) => s.id === shId);
        if (!sh) return;
        if (pill.classList.contains('is-editing')) return;
        pill.classList.add('is-editing');
        const origHtml = pill.innerHTML;

        let inputHtml;
        if (field === 'date') {
            const v = sh.date || '';
            inputHtml = `<input class="so-shipment-edit-input" type="date" value="${SO.escapeHtml(v)}" />`;
        } else if (field === 'batch') {
            const v = sh.batch || '';
            inputHtml = `<input class="so-shipment-edit-input" type="text" value="${SO.escapeHtml(v)}" placeholder="Số đợt…" />`;
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
            window.SoOrderStorage.updateShipment(SO.state, tab.id, shId, { [field]: value });
            SO.pushSync();
            SO.renderAll();
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
    };

    SO.flashRow = function flashRow(rowId) {
        const tr = document.querySelector(`#soTableBody tr.so-data-row[data-row-id="${rowId}"]`);
        if (!tr) return;
        tr.classList.add('is-saved-flash');
        setTimeout(() => tr.classList.remove('is-saved-flash'), 600);
    };

    // 2026-06-16: NHÓM NCC đã NHẬN ĐỦ (mọi SP received) dồn xuống CUỐI lô, nhóm
    // còn chờ nhận giữ lên trên → user thấy việc cần làm trước. Render-only (KHÔNG
    // mutate storage). Giữ nguyên từng nhóm (supplier + invoiceGroupId liên tiếp)
    // để rowspan ô NCC/Ảnh HĐ không vỡ; chỉ đổi thứ tự GIỮA các nhóm (stable).
    SO._orderReceivedGroupsLast = function _orderReceivedGroupsLast(rows) {
        if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? [...rows] : [];
        const groups = [];
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
            const groupRows = rows.slice(i, j);
            const meaningful = groupRows.filter(
                (x) => (x.productName || '').trim() && Number(x.qty) > 0
            );
            // "Đã nhận đủ" = có SP thật & MỌI SP thật đều received → dồn xuống cuối.
            const done = meaningful.length > 0 && meaningful.every((x) => x.status === 'received');
            groups.push({ rows: groupRows, done });
            i = j;
        }
        const pending = groups.filter((g) => !g.done);
        const finished = groups.filter((g) => g.done);
        return [...pending, ...finished].flatMap((g) => g.rows);
    };

    // 2026-06-16: nhập nhanh nhiều biến thể — 1 dòng modal có variant dạng
    // "Đen / S / M / L" → tách thành N dòng SP (mỗi variant 1 dòng), copy mọi
    // field khác qua spread. Dùng shared Web2VariantMulti. Chỉ explode dòng MỚI
    // (rowId == null) — KHÔNG đụng dòng đã có (tránh nhân bản khi edit).
    SO._explodeVariants = function _explodeVariants(rows) {
        if (!window.Web2VariantMulti || !window.Web2VariantMulti.expand) return rows;
        const out = [];
        for (const r of rows) {
            if (r.rowId) {
                out.push(r);
                continue;
            }
            // SET (biến thể nhiều món, có " + ") → KHÔNG expand (expand split theo
            // "/" sẽ băm nhầm "Trắng / M + Đen / L"). 1 món mới cartesian theo "/".
            const vstr = (r.variant || '').trim();
            const variants = vstr.includes('+') ? [] : window.Web2VariantMulti.expand(vstr);
            if (variants.length > 1) {
                // SP nhiều biến thể → N dòng CON cùng productGroupId (Kho tạo 1 CHA +
                // N con). SL từng biến thể từ r.variantQtys (picker withQty), fallback r.qty.
                const groupId =
                    'pg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
                const qtyMap = {};
                for (const vq of r.variantQtys || []) {
                    if (vq && vq.variant != null) qtyMap[String(vq.variant)] = Number(vq.qty) || 0;
                }
                for (const v of variants) {
                    const q = Object.prototype.hasOwnProperty.call(qtyMap, v)
                        ? qtyMap[v]
                        : Number(r.qty) || 0;
                    out.push({ ...r, variant: v, qty: q, productGroupId: groupId });
                }
            } else {
                out.push(r);
            }
        }
        return out;
    };

    // Live preview dưới ô variant modal: gõ multi-variant → hiện N chip SP sẽ tạo.
    SO._updateVariantMultiPreview = function _updateVariantMultiPreview(uid, value) {
        const el = document.querySelector(`[data-multi-preview-uid="${uid}"]`);
        if (!el) return;
        const M = window.Web2VariantMulti;
        if (!M || !String(value || '').includes('/')) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        const r = M.parse(value);
        if (!r || !r.ok || r.variants.length <= 1) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        const chips = r.variants
            .map((v) => `<span class="so-vm-chip">${SO.escapeHtml(v)}</span>`)
            .join('');
        const tag = r.mode === 'cartesian' ? ' (kết hợp màu × size)' : '';
        el.innerHTML =
            `<div class="so-vm-head"><i data-lucide="layers"></i> Tách ${r.variants.length} SP${tag}:</div>` +
            `<div class="so-vm-chips">${chips}</div>`;
        el.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    // 2026-06-17: dòng phụ (sub-header) đầu mỗi ĐƠN trong lô — hiện meta riêng
    // của NCC đó: KG · HĐ · Giảm · Ship. KG/Kiện/HĐ chỉ hiện nếu tab bật field
    // tương ứng (thông tin lô); Giảm/Ship hiện khi > 0. Rỗng hết → bỏ qua dòng.
    SO._groupMetaSubHeaderHtml = function _groupMetaSubHeaderHtml(
        sh,
        firstRow,
        tab,
        colSpan,
        _flags
    ) {
        const gid = firstRow.invoiceGroupId || firstRow.id;
        const m = window.SoOrderStorage.getOrderAdjustment(sh, gid);
        const cur = tab.currency || 'VND';
        // Value-driven: hiện field nào CÓ giá trị (>0). Rỗng hết → bỏ qua dòng
        // (không bày "0 KG · HĐ 0" rác). Tổng cả lô luôn ở header lô.
        const parts = [];
        if (m.caseCount) parts.push(`<span class="so-grpmeta-item">${m.caseCount} Kiện</span>`);
        if (m.weightKg)
            parts.push(
                `<span class="so-grpmeta-item"><i data-lucide="weight"></i> ${m.weightKg.toLocaleString('vi-VN')} KG</span>`
            );
        if (m.contractAmount)
            parts.push(
                `<span class="so-grpmeta-item">HĐ <strong>${SO.escapeHtml(SO.fmtCurrency(m.contractAmount, cur))}</strong></span>`
            );
        if (m.discount)
            parts.push(
                `<span class="so-grpmeta-item so-grpmeta-disc">Giảm ${SO.escapeHtml(SO.fmtCurrency(m.discount, cur))}</span>`
            );
        if (m.shipping)
            parts.push(
                `<span class="so-grpmeta-item so-grpmeta-ship">Ship ${SO.escapeHtml(SO.fmtCurrency(m.shipping, cur))}</span>`
            );
        if (!parts.length) return '';
        const ncc = SO.escapeHtml(firstRow.supplier || '—');
        return `<tr class="so-grpmeta-row" data-grpmeta-gid="${SO.escapeHtml(gid)}">
            <td colspan="${colSpan}">
                <div class="so-grpmeta">
                    <span class="so-grpmeta-ncc"><i data-lucide="store"></i> ${ncc}</span>
                    ${parts.join('<span class="so-grpmeta-sep">·</span>')}
                </div>
            </td>
        </tr>`;
    };

    SO.shipmentHtml = function shipmentHtml(sh, tab, colSpan) {
        const header = SO.shipmentHeaderHtml(sh, tab, colSpan);
        if (sh.collapsed) return header;
        // Expanded → emit column header row, then data rows.
        const colHead = SO.columnHeaderRowHtml();
        // P1 2026-05-30: pre-compute group spans cho NCC + Ảnh Hóa Đơn.
        // - NCC: consecutive rows cùng `supplier` → rowspan (cell render lần đầu).
        // - Ảnh Hóa Đơn: consecutive rows cùng `invoiceGroupId` → rowspan.
        // Map: rowIdx → { ncc: {render, span}, inv: {render, span} }
        // displayRows: nhóm đã nhận đủ dồn cuối (render-only). _computeRowSpans +
        // rowHtml dùng CHUNG displayRows để idx/rowspan/receive-slice khớp nhau.
        const displayRows = SO._orderReceivedGroupsLast(sh.rows);
        const meta = SO._computeRowSpans(displayRows);
        // 2026-06-17: dòng phụ đầu MỖI ĐƠN (invoiceGroupId) hiện KG · HĐ · Giảm ·
        // Ship riêng của NCC đó. meta.inv.render = true ở row đầu mỗi đơn.
        const flags = SO._shipMetaFlags(tab);
        const rows = displayRows
            .map((r, idx) => {
                const sub = meta[idx]?.inv?.render
                    ? SO._groupMetaSubHeaderHtml(sh, r, tab, colSpan, flags)
                    : '';
                return sub + SO.rowHtml(r, idx, tab, sh.id, meta[idx], displayRows);
            })
            .join('');
        return header + colHead + rows;
    };

    SO._computeRowSpans = function _computeRowSpans(rows) {
        const out = rows.map(() => ({
            ncc: { render: true, span: 1 },
            inv: { render: true, span: 1 },
        }));
        // Walk groups: NCC merge consecutive rows có CÙNG supplier VÀ cùng
        // invoiceGroupId (đơn). Nếu cùng NCC nhưng khác đơn → tách cell ra
        // để mỗi đơn 1 ô riêng. Fallback `invoiceGroupId || id` giữ behavior
        // cũ cho rows pre-2026-05-30 chưa có invoiceGroupId.
        // grp parity 0/1 luân phiên theo từng NHÓM NCC (đơn) → CSS tô nền xen kẽ
        // trắng/nhạt cho dễ phân biệt khối. Thay zebra :nth-child cũ (đếm cả row
        // header → parity lệch nhóm, trông random).
        let i = 0;
        let grp = 0;
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
            const parity = grp % 2;
            for (let k = i; k < j; k++) out[k].nccParity = parity;
            for (let k = i + 1; k < j; k++) out[k].ncc = { render: false, span: 0 };
            grp++;
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
    };

    // ETA badge — "📦 còn N ngày" / "⚠️ quá hạn N ngày" / "✅ giao hôm nay"
    // P1 2026-05-29. Trả {html, color} hoặc null nếu không có ETA.
    SO._etaBadgeHtml = function _etaBadgeHtml(etaStr) {
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
        const etaDisplay = SO.formatDateVN(etaStr);
        return `<span class="so-shipment-eta" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:${color}1a;color:${color};border-radius:6px;font-size:11px;font-weight:600;" title="ETA giao hàng: ${etaDisplay}"><i data-lucide="${icon}" style="width:11px;height:11px;"></i>${text}</span>`;
    };

    SO.shipmentHeaderHtml = function shipmentHeaderHtml(sh, tab, colSpan) {
        const dateText = sh.date ? SO.formatDateVN(sh.date) : '—';
        const batchVal = sh.batch || '';
        const batchLabel = batchVal ? `Đợt ${SO.escapeHtml(batchVal)}` : 'Chưa đặt đợt';
        const etaBadge = SO._etaBadgeHtml(sh.expectedDeliveryDate);
        // 2026-06-17: KG / số kiện / Tiền HĐ / giảm / ship giờ PER-ĐƠN (mỗi NCC
        // riêng). Lô header = TỔNG các đơn (read-only). Sửa từng giá trị trong
        // modal "Sửa lô" theo từng NCC, hoặc dòng phụ đầu mỗi khối.
        const adjTot = window.SoOrderStorage.getShipmentAdjustTotals(sh);
        const caseCount = adjTot.caseCount;
        const weightKg = adjTot.weightKg;
        const contractDisplayText = SO.fmtCurrency(adjTot.contractAmount, tab.currency || 'VND');
        const caret = sh.collapsed ? 'chevron-right' : 'chevron-down';
        const shId = SO.escapeHtml(sh.id);
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
                        ${pill('date', SO.escapeHtml(dateText), 'Click để sửa ngày giao')}
                    </span>
                    <span class="so-shipment-sep">—</span>
                    <span class="so-shipment-meta so-shipment-batch">
                        ${pill('batch', SO.escapeHtml(batchLabel), 'Click để sửa số đợt')}
                    </span>
                    ${etaBadge ? `<span class="so-shipment-sep">—</span>${etaBadge}` : ''}
                    <span class="so-shipment-sep">|</span>
                    <span class="so-shipment-meta" title="Tổng các NCC trong lô — sửa từng NCC trong modal Sửa lô">
                        <i data-lucide="package"></i>
                        Tổng <strong>${caseCount} Kiện</strong> : <strong>${weightKg.toLocaleString('vi-VN')} KG</strong>
                    </span>
                    <span class="so-shipment-sep">|</span>
                    <span class="so-shipment-meta">
                        <strong>Tổng HĐ:</strong>
                        <span class="so-shipment-contract-raw">${SO.escapeHtml(contractDisplayText)}</span>
                    </span>
                    ${(() => {
                        // 2026-06-16: giảm giá / phí ship = TỔNG các đơn trong lô.
                        const disc = adjTot.discount;
                        const ship = adjTot.shipping;
                        if (!disc && !ship) return '';
                        const parts = [];
                        if (disc) parts.push(`Giảm ${SO.fmtCurrency(disc, tab.currency || 'VND')}`);
                        if (ship) parts.push(`Ship ${SO.fmtCurrency(ship, tab.currency || 'VND')}`);
                        return `<span class="so-shipment-sep">|</span><span class="so-shipment-meta so-shipment-adjust">${SO.escapeHtml(parts.join(' · '))}</span>`;
                    })()}
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
                        return `<button class="so-action-btn" type="button" data-shipment-action="receive" data-shipment-id="${SO.escapeHtml(sh.id)}" title="Nhận hàng từ NCC — mở modal nhập qty thực nhận, hỗ trợ mua đủ / mua 1 phần">
                            <i data-lucide="truck"></i> Nhận hàng
                        </button>`;
                    })()}
                    <button class="so-action-btn" type="button" data-shipment-action="add-row" data-shipment-id="${SO.escapeHtml(sh.id)}" title="Thêm dòng vào lô này">
                        <i data-lucide="plus-circle"></i>
                    </button>
                    <button class="so-action-btn" type="button" data-shipment-action="edit-shipment" data-shipment-id="${SO.escapeHtml(sh.id)}" title="Sửa thông tin lô">
                        <i data-lucide="edit-2"></i>
                    </button>
                    <button class="so-action-btn" type="button" data-shipment-action="delete-shipment" data-shipment-id="${SO.escapeHtml(sh.id)}" title="Xóa lô">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    };

    // Lookup mã SP thật trong Kho theo tên (read-only, không đổi schema row).
    // Trả null nếu SP chưa có ở kho (chưa Lưu Nháp / chưa sync).
    SO._lookupKhoCode = function _lookupKhoCode(r) {
        try {
            const cache = window.Web2ProductsCache;
            // Variant-aware: CHỈ trả mã khi SP khớp ĐÚNG tên + biến thể. Trước đây
            // findByNameExact (chỉ tên) → hàng biến thể "Đỏ" mượn nhầm mã SP "Trắng"
            // cùng tên (vd HNMMTRANG). SP chưa có đúng biến thể → null (badge để
            // trống tới khi nhận hàng). Cache cũ chưa có method → cũng trả null.
            if (!cache?.findByNameVariant) return null;
            const p = cache.findByNameVariant(
                (r.productName || '').trim(),
                (r.variant || '').trim()
            );
            return p?.code || null;
        } catch (_) {
            return null;
        }
    };

    SO.rowHtml = function rowHtml(r, idx, tab, shipmentId, meta, rowsArr) {
        const rid = SO.escapeHtml(r.id);
        const sid = SO.escapeHtml(shipmentId);
        // Row đã nhận hàng → ép read-only ngay cả khi bulk edit mode bật.
        // Khoá toàn bộ field, hiển thị visual `is-locked` để user biết.
        const edit = SO.editTableMode && r.status !== 'received';
        // Mã SP từ Kho (nếu đã sync) — hiện nhỏ dưới tên SP ở chế độ xem.
        const khoCode = SO._lookupKhoCode(r);
        const khoCodeHtml = khoCode
            ? `<div class="so-cell-code" title="Mã SP trong Kho SP Web 2.0">${SO.escapeHtml(khoCode)}</div>`
            : '';
        // SL gộp vào cột Biến thể (chế độ xem). Không variant → chỉ "SL N".
        // ZIP loại↔biến thể theo MÓN: category "Áo + Quần" + variant "Trắng + Đen"
        // → hiển thị "Áo Trắng, Quần Đen" (mỗi món = badge loại + biến thể, ngăn ', ').
        const variantView = (r.variant || '').trim();
        const catView = (r.category || '').trim();
        const qtyNum = Number(r.qty) || 0;
        const _sp = (s) => s.split('+').map((x) => x.trim());
        const catParts = catView ? _sp(catView) : [];
        const varParts = variantView ? _sp(variantView) : [];
        let bodyHtml;
        if (catParts.filter(Boolean).length) {
            const n = Math.max(catParts.length, varParts.length);
            const parts = [];
            for (let i = 0; i < n; i++) {
                const t = (catParts[i] || '').trim();
                const v = (varParts[i] || '').trim();
                if (!t && !v) continue;
                const tHtml = t
                    ? `<span class="so-cell-cat" title="Loại sản phẩm">${SO.escapeHtml(t)}</span>`
                    : '';
                parts.push(tHtml + (v ? SO.escapeHtml(v) : ''));
            }
            bodyHtml = parts.join('<span class="so-cell-pair-sep">, </span>');
        } else {
            bodyHtml = variantView ? SO.escapeHtml(variantView) : '';
        }
        const variantCellInner =
            bodyHtml + `<span class="so-cell-sl">${bodyHtml ? ' · ' : ''}SL ${qtyNum}</span>`;
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
            // rowsArr = displayRows (đã reorder received-last) để slice theo idx
            // khớp với thứ tự render; fallback shp.rows nếu caller cũ không truyền.
            const shp = tab?.shipments?.find((s) => s.id === shipmentId);
            const sliceSrc = rowsArr || shp?.rows || [];
            const groupSpan = nccMeta.span || 1;
            const groupRows = sliceSrc.slice(idx, idx + groupSpan);
            const nccRows = groupRows.filter(
                (x) => (x.productName || '').trim() && Number(x.qty) > 0
            );
            const allRecv = nccRows.length > 0 && nccRows.every((x) => x.status === 'received');
            const groupId = r.invoiceGroupId || r.id;
            nccReceiveBtn = allRecv
                ? `<button class="so-ncc-receive-btn is-done" type="button" disabled title="Đơn này của NCC đã nhận đủ hàng"><i data-lucide="check-circle-2"></i> Đã nhận</button>`
                : `<button class="so-ncc-receive-btn" type="button" data-shipment-action="receive-ncc" data-shipment-id="${sid}" data-supplier="${SO.escapeHtml(nccName)}" data-invoice-group="${SO.escapeHtml(groupId)}" title="Nhận hàng của đơn NCC ${SO.escapeHtml(nccName)} trong lô này"><i data-lucide="truck"></i> Nhận hàng</button>`;
        }
        const cells = {
            supplier: !nccMeta.render
                ? ''
                : edit
                  ? SO.editableCellHtml('supplier', r, rid, sid, nccRowspanAttr)
                  : `<td class="so-cell-supplier${nccMeta.span > 1 ? ' so-cell-merged' : ''}" data-cell-field="supplier" data-row-id="${rid}" data-shipment-id="${sid}"${nccRowspanAttr}><div class="so-cell-supplier-name">${SO.escapeHtml(r.supplier || '—')}</div>${nccReceiveBtn}</td>`,
            stt: `<td class="so-cell-stt">${idx + 1}</td>`,
            productName: edit
                ? SO.editableCellHtml('productName', r, rid, sid)
                : `<td class="so-cell-product" data-cell-field="productName" data-row-id="${rid}" data-shipment-id="${sid}">${SO.escapeHtml(r.productName || '—')}${khoCodeHtml}${khoCode && window.Web2Deeplink ? '<span class="so-kho-link">' + window.Web2Deeplink.linkBtn({ label: '', icon: 'package', url: window.Web2Deeplink.url.product(khoCode), title: 'Mở trong Kho SP' }) + '</span>' : ''}</td>`,
            variant: edit
                ? SO.editableCellHtml('variant', r, rid, sid)
                : `<td class="so-cell-variant" data-cell-field="variant" data-row-id="${rid}" data-shipment-id="${sid}">${variantCellInner}</td>`,
            qty: edit
                ? SO.editableCellHtml('qty', r, rid, sid)
                : `<td class="so-cell-qty" data-cell-field="qty" data-row-id="${rid}" data-shipment-id="${sid}">${Number(r.qty) || 0}</td>`,
            sellPrice: edit
                ? SO.editableCellHtml('sellPrice', r, rid, sid)
                : SO.priceCell(r.sellPrice, tab, { rid, sid, field: 'sellPrice' }),
            costPrice: edit
                ? SO.editableCellHtml('costPrice', r, rid, sid)
                : SO.priceCell(r.costPrice, tab, { rid, sid, field: 'costPrice' }),
            productImage: SO.imgCell(r.productImage, { rid, sid, field: 'productImage' }),
            // P1 2026-05-30: invoiceImage cell merged khi invMeta.span > 1.
            // Skip render khi không phải dòng đầu group.
            invoiceImage: !invMeta.render
                ? ''
                : SO.imgCell(r.invoiceImage, {
                      rid,
                      sid,
                      field: 'invoiceImage',
                      rowspan: invMeta.span,
                      invoiceGroupId: r.invoiceGroupId || '',
                      merged: invMeta.span > 1,
                  }),
            note: edit
                ? SO.editableCellHtml('note', r, rid, sid)
                : `<td class="so-cell-note" data-cell-field="note" data-row-id="${rid}" data-shipment-id="${sid}">${SO.escapeHtml(r.note || '')}</td>`,
            costNote: edit
                ? SO.editableCellHtml('costNote', r, rid, sid)
                : `<td class="so-cell-note so-cell-note-cp" data-cell-field="costNote" data-row-id="${rid}" data-shipment-id="${sid}">${SO.escapeHtml(r.costNote || '')}</td>`,
            // 2026-06-16: status LUÔN render pill chỉ-đọc (kể cả bulk-edit mode) —
            // không cho đổi tay, chỉ auto qua "Nhận hàng".
            status: SO.statusCell(r.status, { rid, sid }),
            actions: SO.actionsCell(r.id, shipmentId, r.status),
        };
        const lockedClass = r.status === 'received' ? ' is-locked' : '';
        // Nền xen kẽ theo NHÓM NCC (đơn): nhóm lẻ thêm .so-grp-alt (CSS tô nhạt).
        const grpAltClass = meta?.nccParity === 1 ? ' so-grp-alt' : '';
        return (
            '<tr class="so-data-row' +
            lockedClass +
            grpAltClass +
            '" data-row-id="' +
            rid +
            '" data-shipment-id="' +
            sid +
            '" data-row-status="' +
            SO.escapeHtml(r.status || 'draft') +
            '" data-supplier="' +
            SO.escapeHtml((r.supplier || '').trim()) +
            '">' +
            SO.COLUMNS.filter((c) => SO.activeColVis()[c.key])
                .map((c) => cells[c.key])
                .join('') +
            '</tr>'
        );
    };

    SO.renderFooterTotals = function renderFooterTotals() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        // Flatten rows across all shipments for tab-wide totals
        const allRows = (tab.shipments || []).flatMap((s) => s.rows);
        const totalQty = allRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        // Tổng tiền footer = Σ(SL × GIÁ NHẬP) — đơn MUA NCC tính theo giá nhập, KHỚP
        // modal updateModalTotals (so-order-modal-core:456-458). Trước dùng sellPrice
        // → footer phồng theo giá bán, lệch tổng tiền thật (audit r3 CRITICAL 2026-06-21).
        const subtotalVnd = allRows.reduce(
            (s, r) => s + SO.toVnd(Number(r.costPrice) || 0, tab) * (Number(r.qty) || 0),
            0
        );
        // 2026-06-16: footer giảm giá / phí ship = TỔNG các ĐƠN (orderAdjustments)
        // qua mọi lô của tab, quy đổi VND (toVnd theo tab.rate). DERIVED — readonly,
        // không nhập tay (đã bỏ `tab.footer` thủ công).
        let footDiscVnd = 0;
        let footShipVnd = 0;
        for (const s of tab.shipments || []) {
            const t = window.SoOrderStorage.getShipmentAdjustTotals(s);
            footDiscVnd += SO.toVnd(t.discount, tab);
            footShipVnd += SO.toVnd(t.shipping, tab);
        }
        const grandTotal = subtotalVnd - footDiscVnd + footShipVnd;

        document.getElementById('soFootTotalQty').textContent = totalQty.toLocaleString('vi-VN');
        document.getElementById('soFootDiscount').value = Math.round(footDiscVnd);
        document.getElementById('soFootShipping').value = Math.round(footShipVnd);
        document.getElementById('soFootGrandTotal').textContent = SO.fmtVnd(grandTotal);

        // Topbar counter — show row count + shipment count
        const shipCount = (tab.shipments || []).length;
        document.getElementById('soTotalRows').textContent =
            `${shipCount} lô · ${allRows.length} dòng`;
        document.getElementById('soTotalQty').textContent = `SL: ${totalQty}`;
    };

    SO.renderAll = function renderAll() {
        SO.renderTabStrip();
        SO.renderTableHead();
        SO.renderTableBody();
        SO.renderFooterTotals();
        if (typeof SO.updateTrashCountBadge === 'function') SO.updateTrashCountBadge();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };
})();
