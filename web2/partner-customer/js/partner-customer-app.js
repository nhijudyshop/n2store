// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — sync 2-way TPOS.
// =====================================================================
// partner-customer-app.js — UI controller cho web2/partner-customer
// =====================================================================
// State: search, status filter, pagination, page size, group filter, tag.
// Mọi action mutate (create/update/delete/status) đi thẳng TPOS qua API,
// sau đó refresh list + stats để 2 chiều luôn nhất quán.
// =====================================================================

(function () {
    'use strict';

    const Api = window.PartnerCustomerApi;
    if (!Api) {
        console.error('[PartnerCustomer] PartnerCustomerApi chưa load');
        return;
    }

    // ───────── State ─────────
    const state = {
        rows: [],
        count: 0,
        page: 1,
        pageSize: 50,
        search: '',
        emailFilter: '',
        tagFilter: '',
        activeFilter: '',
        statusFilter: 'all',
        groupId: '',
        stats: { all: 0, Normal: 0, BomHang: 0, Warning: 0, Danger: 0, VIP: 0 },
        loading: false,
        editingId: null,
    };

    // ───────── DOM ─────────
    const $ = (sel) => document.querySelector(sel);
    const dom = {};

    function cacheDom() {
        dom.tableBody = $('#pcTableBody');
        dom.selectAll = $('#pcSelectAll');
        dom.paginationInfo = $('#pcPaginationInfo');
        dom.paginationButtons = $('#pcPaginationButtons');
        dom.pageSize = $('#pcPageSize');

        dom.searchInput = $('#pcSearchInput');
        dom.searchBtn = $('#pcSearchBtn');
        dom.emailFilter = $('#pcEmailFilter');
        dom.tagFilter = $('#pcTagSearch');
        dom.activeFilter = $('#pcActiveFilter');
        dom.groupFilter = $('#pcGroupFilter');

        dom.statsBar = $('#pcStatsBar');
        dom.statAll = $('#pcStatAll');
        dom.statNormal = $('#pcStatNormal');
        dom.statBomb = $('#pcStatBomb');
        dom.statWarning = $('#pcStatWarning');
        dom.statDanger = $('#pcStatDanger');
        dom.statVip = $('#pcStatVip');
        dom.birthdayCount = $('#pcBirthdayCount');

        dom.addBtn = $('#pcAddBtn');
        dom.exportBtn = $('#pcExportBtn');
        dom.actionsMenu = $('#pcActionsMenu');
        dom.columnsMenu = $('#pcColumnsMenu');

        // Modal
        dom.modal = $('#pcModal');
        dom.modalTitle = $('#pcModalTitle');
        dom.modalClose = $('#pcModalClose');
        dom.modalBackdrop = $('#pcModalBackdrop');
        dom.modalCancel = $('#pcModalCancel');
        dom.modalSave = $('#pcModalSave');
        dom.modalError = $('#pcModalError');
        dom.fName = $('#pcFieldName');
        dom.fPhone = $('#pcFieldPhone');
        dom.fEmail = $('#pcFieldEmail');
        dom.fStreet = $('#pcFieldStreet');
        dom.fStatus = $('#pcFieldStatus');
        dom.fTaxCode = $('#pcFieldTaxCode');
        dom.fActive = $('#pcFieldActive');
        dom.fNote = $('#pcFieldNote');
    }

    // ───────── Utils ─────────
    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            const ctx = this;
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(ctx, args), delay);
        };
    }

    function notify(msg, type) {
        try {
            if (
                window.notificationManager &&
                typeof window.notificationManager.show === 'function'
            ) {
                window.notificationManager.show(msg, type || 'info');
                return;
            }
        } catch (_) {}
        console.log(`[notify:${type || 'info'}]`, msg);
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fullAddress(p) {
        if (!p) return '';
        if (p.FullAddress) return p.FullAddress;
        return [p.Street, p.Ward, p.District, p.City].filter(Boolean).join(', ');
    }

    // ───────── Render ─────────
    function render() {
        renderStats();
        renderTable();
        renderPagination();
    }

    function renderStats() {
        dom.statAll.textContent = formatCount(state.stats.all);
        dom.statNormal.textContent = formatCount(state.stats.Normal);
        dom.statBomb.textContent = formatCount(state.stats.BomHang);
        dom.statWarning.textContent = formatCount(state.stats.Warning);
        dom.statDanger.textContent = formatCount(state.stats.Danger);
        dom.statVip.textContent = formatCount(state.stats.VIP);

        for (const btn of dom.statsBar.querySelectorAll('.pc-stat')) {
            const s = btn.getAttribute('data-status');
            btn.classList.toggle('is-active', s === state.statusFilter);
        }
    }

    function formatCount(n) {
        return Number(n || 0).toLocaleString('vi-VN');
    }

    function renderTable() {
        if (state.loading) {
            dom.tableBody.innerHTML =
                '<tr><td colspan="9"><div class="pc-loading">Đang tải…</div></td></tr>';
            return;
        }
        if (!state.rows.length) {
            dom.tableBody.innerHTML =
                '<tr><td colspan="9"><div class="pc-empty"><i data-lucide="user-x"></i>Không có khách hàng phù hợp</div></td></tr>';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const html = state.rows.map((p) => renderRow(p)).join('');
        dom.tableBody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
        // Số dư ví Web 2.0 cạnh SĐT (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(dom.tableBody);
    }

    function renderRow(p) {
        const id = p.Id;
        const status = p.Status || 'Normal';
        const statusText = Api.statusText(p) || Api.statusText(status);
        const statusClass = Api.statusClass(status);
        const phone = p.Phone || p.Mobile || '';
        const carrier = phone ? Api.detectCarrier(phone) || p.NameNetwork || '' : '';
        const address = fullAddress(p);
        const credit = Number(p.Credit || p.AmountDebit || 0);
        const active = p.Active !== false;

        return `
            <tr data-id="${escapeHtml(id)}">
                <td class="pc-col-check">
                    <input type="checkbox" class="pc-row-check" value="${escapeHtml(id)}" aria-label="Chọn" />
                </td>
                <td class="pc-col-name">
                    <div class="pc-cell-name">
                        <span class="pc-name">${escapeHtml(p.Name || '(không tên)')}</span>
                        <span class="pc-status ${statusClass}" data-action="status" data-id="${escapeHtml(id)}" data-current="${escapeHtml(status)}" title="Đổi trạng thái">${escapeHtml(statusText)}</span>
                    </div>
                </td>
                <td class="pc-col-phone">
                    ${phone ? `<div class="pc-cell-phone"><span class="pc-phone">${escapeHtml(phone)}</span>${carrier ? `<span class="pc-carrier">${escapeHtml(carrier)}</span>` : ''}<span class="pc-wallet-pill" data-w2wallet-phone="${escapeHtml(phone)}"></span></div>` : ''}
                </td>
                <td class="pc-col-email" data-col="email">${escapeHtml(p.Email || '')}</td>
                <td class="pc-col-address" data-col="address">${escapeHtml(address)}</td>
                <td class="pc-col-tags" data-col="tags">
                    <button type="button" class="pc-tags-btn" data-action="tags" data-id="${escapeHtml(id)}" title="Quản lý nhãn">
                        <i data-lucide="tag"></i>
                    </button>
                </td>
                <td class="pc-col-credit" data-col="credit">${Api.formatCurrency(credit)}</td>
                <td class="pc-col-active" data-col="active">
                    <i data-lucide="${active ? 'check' : 'minus'}" class="pc-active-icon ${active ? '' : 'is-off'}"></i>
                </td>
                <td class="pc-col-actions">
                    <button type="button" class="pc-btn pc-btn-icon pc-btn-qr" data-action="qr" data-id="${escapeHtml(id)}" data-phone="${escapeHtml(phone)}" data-name="${escapeHtml(p.Name || '')}" title="QR VietQR" ${!phone ? 'disabled' : ''}>
                        <i data-lucide="qr-code"></i>
                    </button>
                    <button type="button" class="pc-btn pc-btn-icon pc-btn-edit" data-action="edit" data-id="${escapeHtml(id)}" title="Sửa">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button type="button" class="pc-btn pc-btn-icon pc-btn-delete" data-action="delete" data-id="${escapeHtml(id)}" title="Xóa">
                        <i data-lucide="trash-2"></i>
                    </button>
                </td>
            </tr>
        `;
    }

    function renderPagination() {
        const total = state.count;
        const size = state.pageSize;
        const pages = Math.max(1, Math.ceil(total / size));
        const page = Math.min(Math.max(1, state.page), pages);

        const start = total === 0 ? 0 : (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        dom.paginationInfo.textContent = `${formatCount(start)}–${formatCount(end)} / ${formatCount(total)}`;

        const btns = [];
        const pushBtn = (label, target, opts) => {
            const disabled = opts && opts.disabled ? 'disabled' : '';
            const active = opts && opts.active ? 'class="is-active"' : '';
            btns.push(
                `<button type="button" data-page="${target}" ${disabled} ${active}>${label}</button>`
            );
        };

        pushBtn('«', 1, { disabled: page <= 1 });
        pushBtn('‹', page - 1, { disabled: page <= 1 });

        const windowSize = 5;
        let from = Math.max(1, page - 2);
        let to = Math.min(pages, from + windowSize - 1);
        from = Math.max(1, to - windowSize + 1);
        for (let i = from; i <= to; i++) {
            pushBtn(String(i), i, { active: i === page });
        }

        pushBtn('›', page + 1, { disabled: page >= pages });
        pushBtn('»', pages, { disabled: page >= pages });

        dom.paginationButtons.innerHTML = btns.join('');
    }

    // ───────── Data loading ─────────
    let _loadSeq = 0;
    let _statsSeq = 0;
    // Stats cache by filter signature (5s TTL). Pagination within the
    // same filter set shouldn't refetch 7 $count queries.
    const _statsCache = { sig: null, ts: 0, data: null };
    const STATS_TTL_MS = 5_000;

    function statsSignature() {
        return JSON.stringify({
            search: state.search,
            status: state.statusFilter,
            email: state.emailFilter,
            tag: state.tagFilter,
            active: state.activeFilter,
            group: state.groupId,
        });
    }

    async function loadStats() {
        const sig = statsSignature();
        if (_statsCache.sig === sig && Date.now() - _statsCache.ts < STATS_TTL_MS) {
            state.stats = _statsCache.data;
            renderStats();
            return;
        }
        const mySeq = ++_statsSeq;
        try {
            const stats = await Api.getStats(state.search);
            if (mySeq !== _statsSeq) return; // stale
            _statsCache.sig = sig;
            _statsCache.ts = Date.now();
            _statsCache.data = stats;
            state.stats = stats;
            renderStats();
        } catch (e) {
            // silent — stats are optional
        }
    }

    async function load() {
        const mySeq = ++_loadSeq;
        state.loading = true;
        renderTable();

        try {
            const opts = {
                top: state.pageSize,
                skip: (state.page - 1) * state.pageSize,
                search: state.search,
                status: state.statusFilter === 'all' ? null : state.statusFilter,
                active: state.activeFilter || null,
                email: state.emailFilter || null,
                tag: state.tagFilter || null,
                partnerCategoryId: state.groupId ? Number(state.groupId) : null,
            };
            // Render list ASAP — stats fetch in background. At 100k records,
            // the 7 $count queries can take 2-4s each; pagination changes
            // should NOT block on them.
            const listResult = await Api.list(opts);
            if (mySeq !== _loadSeq) return; // stale, ignore
            state.rows = listResult.value;
            state.count = listResult.count;
            state.loading = false;
            render();
            // Fire-and-forget stats (uses TTL cache for repeat calls)
            loadStats().catch(() => {});
        } catch (err) {
            if (mySeq !== _loadSeq) return;
            state.loading = false;
            state.rows = [];
            dom.tableBody.innerHTML = `<tr><td colspan="9"><div class="pc-error">Lỗi tải dữ liệu: ${escapeHtml((err && err.message) || err)}</div></td></tr>`;
            notify('Lỗi tải khách hàng: ' + (err.message || err), 'error');
        }
    }

    const loadDebounced = debounce(load, 300);

    // ───────── Categories (Nhóm KH) ─────────
    async function loadCategories() {
        try {
            const cats = await Api.listCategories();
            for (const c of cats) {
                const opt = document.createElement('option');
                opt.value = c.Id;
                opt.textContent = c.Name;
                dom.groupFilter.appendChild(opt);
            }
        } catch (e) {
            console.warn('[PartnerCustomer] loadCategories failed:', e.message);
        }
    }

    // ───────── Modal ─────────
    function openModalForCreate() {
        state.editingId = null;
        dom.modalTitle.textContent = 'Thêm khách hàng';
        dom.fName.value = '';
        dom.fPhone.value = '';
        dom.fEmail.value = '';
        dom.fStreet.value = '';
        dom.fStatus.value = 'Normal';
        dom.fTaxCode.value = '';
        dom.fActive.checked = true;
        dom.fNote.value = '';
        showModalError(null);
        showModal();
        setTimeout(() => dom.fName.focus(), 80);
    }

    async function openModalForEdit(id) {
        state.editingId = id;
        dom.modalTitle.textContent = 'Sửa khách hàng';
        showModalError(null);

        try {
            // optimistic show with row data first
            const row = state.rows.find((r) => String(r.Id) === String(id));
            if (row) fillModalFromPartner(row);

            const fresh = await Api.getOne(id);
            fillModalFromPartner(fresh);
            showModal();
            setTimeout(() => dom.fName.focus(), 80);
        } catch (e) {
            notify('Không tải được khách hàng: ' + (e.message || e), 'error');
        }
    }

    function fillModalFromPartner(p) {
        dom.fName.value = p.Name || '';
        dom.fPhone.value = p.Phone || p.Mobile || '';
        dom.fEmail.value = p.Email || '';
        dom.fStreet.value = p.Street || '';
        dom.fStatus.value = Api.STATUS_VALUES.includes(p.Status) ? p.Status : 'Normal';
        dom.fTaxCode.value = p.TaxCode || '';
        dom.fActive.checked = p.Active !== false;
        dom.fNote.value = p.Comment || '';
    }

    function readModalForm() {
        return {
            Name: dom.fName.value.trim(),
            Phone: dom.fPhone.value.trim(),
            Email: dom.fEmail.value.trim(),
            Street: dom.fStreet.value.trim(),
            Status: dom.fStatus.value,
            TaxCode: dom.fTaxCode.value.trim(),
            Active: dom.fActive.checked,
            Comment: dom.fNote.value.trim(),
        };
    }

    function showModal() {
        dom.modal.hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }
    function hideModal() {
        dom.modal.hidden = true;
        state.editingId = null;
    }
    function showModalError(msg) {
        if (!msg) {
            dom.modalError.classList.remove('is-visible');
            dom.modalError.textContent = '';
        } else {
            dom.modalError.classList.add('is-visible');
            dom.modalError.textContent = msg;
        }
    }

    async function saveModal() {
        const payload = readModalForm();
        if (!payload.Name) {
            showModalError('Tên khách hàng không được trống');
            dom.fName.focus();
            return;
        }
        showModalError(null);
        dom.modalSave.disabled = true;
        try {
            if (state.editingId) {
                await Api.update(state.editingId, payload);
                notify('Đã cập nhật khách hàng', 'success');
            } else {
                await Api.create(payload);
                notify('Đã thêm khách hàng', 'success');
            }
            hideModal();
            await load();
        } catch (e) {
            showModalError('Lỗi lưu: ' + (e.message || e));
        } finally {
            dom.modalSave.disabled = false;
        }
    }

    // ───────── Actions ─────────
    async function deleteOne(id) {
        const row = state.rows.find((r) => String(r.Id) === String(id));
        const name = row ? row.Name : `#${id}`;
        if (!confirm(`Xóa khách hàng "${name}"? Hành động sẽ xóa cả trên TPOS.`)) return;
        try {
            await Api.remove(id);
            notify('Đã xóa', 'success');
            await load();
        } catch (e) {
            notify('Lỗi xóa: ' + (e.message || e), 'error');
        }
    }

    async function bulk(action) {
        const ids = getSelectedIds();
        if (!ids.length) {
            notify('Chưa chọn khách hàng nào', 'warning');
            return;
        }
        const verb =
            action === 'delete'
                ? `Xóa ${ids.length} khách hàng (cả trên TPOS)?`
                : action === 'active'
                  ? `Bật hiệu lực cho ${ids.length} khách?`
                  : `Tắt hiệu lực cho ${ids.length} khách?`;
        if (!confirm(verb)) return;

        let ok = 0;
        let fail = 0;
        for (const id of ids) {
            try {
                if (action === 'delete') await Api.remove(id);
                else if (action === 'active') await Api.setActive(id, true);
                else await Api.setActive(id, false);
                ok++;
            } catch (_) {
                fail++;
            }
        }
        notify(`Hoàn tất: ${ok} thành công, ${fail} lỗi`, fail ? 'warning' : 'success');
        await load();
    }

    function getSelectedIds() {
        return Array.from(document.querySelectorAll('.pc-row-check'))
            .filter((cb) => cb.checked)
            .map((cb) => cb.value);
    }

    // ───────── Excel export ─────────
    const XLSX_CDNS = [
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    ];
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('script load failed: ' + src));
            document.head.appendChild(s);
        });
    }
    async function loadSheetJS() {
        if (window.XLSX) return window.XLSX;
        let lastErr = null;
        for (const cdn of XLSX_CDNS) {
            try {
                await loadScript(cdn);
                if (window.XLSX) return window.XLSX;
            } catch (e) {
                lastErr = e;
            }
        }
        throw new Error('Không tải được SheetJS' + (lastErr ? ' (' + lastErr.message + ')' : ''));
    }

    async function exportExcel() {
        if (!state.count) {
            notify('Không có dữ liệu để xuất', 'warning');
            return;
        }
        notify('Đang chuẩn bị Excel…', 'info');
        try {
            const XLSX = await loadSheetJS();
            // Lấy tối đa 5000 record theo filter hiện tại
            const limit = Math.min(5000, state.count);
            const batchSize = 200;
            const rows = [];
            for (let skip = 0; skip < limit; skip += batchSize) {
                const result = await Api.list({
                    top: batchSize,
                    skip,
                    search: state.search,
                    status: state.statusFilter === 'all' ? null : state.statusFilter,
                    active: state.activeFilter || null,
                    email: state.emailFilter || null,
                    tag: state.tagFilter || null,
                    partnerCategoryId: state.groupId ? Number(state.groupId) : null,
                });
                rows.push(...result.value);
                if (result.value.length < batchSize) break;
            }
            const headers = [
                'STT',
                'Tên',
                'Trạng thái',
                'Điện thoại',
                'Nhà mạng',
                'Email',
                'Địa chỉ',
                'Nợ hiện tại',
                'Hiệu lực',
                'Mã số thuế',
                'Ghi chú',
            ];
            const aoa = [headers];
            rows.forEach((p, i) => {
                const phone = p.Phone || p.Mobile || '';
                aoa.push([
                    i + 1,
                    p.Name || '',
                    Api.statusText(p),
                    phone,
                    phone ? Api.detectCarrier(phone) || p.NameNetwork || '' : '',
                    p.Email || '',
                    fullAddress(p),
                    Number(p.Credit || 0),
                    p.Active !== false ? 'Hoạt động' : 'Ngưng',
                    p.TaxCode || '',
                    p.Comment || '',
                ]);
            });
            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [
                { wch: 5 },
                { wch: 28 },
                { wch: 14 },
                { wch: 14 },
                { wch: 12 },
                { wch: 24 },
                { wch: 40 },
                { wch: 14 },
                { wch: 12 },
                { wch: 16 },
                { wch: 24 },
            ];
            // Format L column (Nợ hiện tại) as number
            for (let r = 1; r < aoa.length; r++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })];
                if (cell) cell.z = '#,##0';
            }
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
            const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            const blob = new Blob([buf], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify(`Đã xuất ${rows.length} dòng`, 'success');
        } catch (e) {
            notify('Lỗi xuất Excel: ' + (e.message || e), 'error');
        }
    }

    // ───────── Status popover (quick edit) ─────────
    let _statusPopover = null;
    function closeStatusPopover() {
        if (_statusPopover) {
            _statusPopover.remove();
            _statusPopover = null;
        }
    }
    function openStatusPopover(anchor) {
        closeStatusPopover();
        const id = anchor.getAttribute('data-id');
        const current = anchor.getAttribute('data-current') || 'Normal';
        if (!id) return;

        const pop = document.createElement('div');
        pop.className = 'pc-status-popover';
        pop.innerHTML = Api.STATUS_VALUES.map(
            (s) =>
                `<button type="button" data-status="${s}" class="${s === current ? 'is-current' : ''}"><span class="pc-status-dot"></span>${Api.STATUS_TEXT[s]}</button>`
        ).join('');
        document.body.appendChild(pop);

        const rect = anchor.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;
        const popW = pop.offsetWidth;
        const popH = pop.offsetHeight;
        if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
        if (top + popH > window.innerHeight - 8) top = rect.top - popH - 6;
        pop.style.top = top + 'px';
        pop.style.left = left + 'px';

        pop.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-status]');
            if (!btn) return;
            const newStatus = btn.getAttribute('data-status');
            closeStatusPopover();
            if (newStatus === current) return;
            await changeStatus(id, newStatus);
        });
        _statusPopover = pop;
        // Close on outside click / scroll / escape
        setTimeout(() => {
            document.addEventListener('click', _outsideStatusClick, { once: true });
        }, 0);
    }
    function _outsideStatusClick(e) {
        if (_statusPopover && !_statusPopover.contains(e.target)) closeStatusPopover();
    }
    // UI-first: badge status đổi NGAY + render table, PATCH background.
    // Rollback nếu lỗi.
    function changeStatus(id, newStatus) {
        const row = state.rows.find((r) => String(r.Id) === String(id));
        if (!row) return;
        const prevStatus = row.Status;
        const prevText = row.StatusText;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => ({ status: prevStatus, text: prevText }),
                apply: () => {
                    row.Status = newStatus;
                    row.StatusText = Api.STATUS_TEXT[newStatus];
                    renderTable();
                },
                run: () => Api.updateStatus(id, newStatus),
                onSuccess: async () => {
                    try {
                        state.stats = await Api.getStats(state.search);
                        renderStats();
                    } catch (_) {}
                },
                rollback: (snap) => {
                    row.Status = snap.status;
                    row.StatusText = snap.text;
                    renderTable();
                },
                successMsg: `Đã chuyển sang "${Api.STATUS_TEXT[newStatus]}"`,
                errLabel: 'đổi trạng thái KH',
            });
        } else {
            (async () => {
                try {
                    await Api.updateStatus(id, newStatus);
                    notify(`Đã chuyển sang "${Api.STATUS_TEXT[newStatus]}"`, 'success');
                    row.Status = newStatus;
                    row.StatusText = Api.STATUS_TEXT[newStatus];
                    renderTable();
                    try {
                        state.stats = await Api.getStats(state.search);
                        renderStats();
                    } catch (_) {}
                } catch (e) {
                    notify('Lỗi đổi trạng thái: ' + (e.message || e), 'error');
                }
            })();
        }
    }
    window.addEventListener('scroll', closeStatusPopover, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeStatusPopover();
    });

    // ───────── Events ─────────
    function bindEvents() {
        // Search
        dom.searchBtn.addEventListener('click', () => {
            state.search = dom.searchInput.value.trim();
            state.page = 1;
            load();
        });
        dom.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                state.search = dom.searchInput.value.trim();
                state.page = 1;
                load();
            }
        });
        dom.searchInput.addEventListener(
            'input',
            debounce(() => {
                state.search = dom.searchInput.value.trim();
                state.page = 1;
                load();
            }, 500)
        );

        // Header filters
        dom.emailFilter.addEventListener(
            'input',
            debounce(() => {
                state.emailFilter = dom.emailFilter.value.trim();
                state.page = 1;
                load();
            }, 400)
        );
        dom.tagFilter.addEventListener(
            'input',
            debounce(() => {
                state.tagFilter = dom.tagFilter.value.trim();
                state.page = 1;
                load();
            }, 400)
        );
        dom.activeFilter.addEventListener('change', () => {
            state.activeFilter = dom.activeFilter.value;
            state.page = 1;
            load();
        });
        dom.groupFilter.addEventListener('change', () => {
            state.groupId = dom.groupFilter.value;
            state.page = 1;
            load();
        });

        // Status pills
        dom.statsBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.pc-stat');
            if (!btn) return;
            state.statusFilter = btn.getAttribute('data-status') || 'all';
            state.page = 1;
            load();
        });

        // Pagination
        dom.paginationButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-page]');
            if (!btn || btn.disabled) return;
            const target = Number(btn.getAttribute('data-page'));
            if (!Number.isFinite(target)) return;
            state.page = Math.max(1, target);
            load();
        });
        dom.pageSize.addEventListener('change', () => {
            state.pageSize = Number(dom.pageSize.value) || 50;
            state.page = 1;
            load();
        });

        // Add button
        dom.addBtn.addEventListener('click', () => openModalForCreate());

        // Export
        dom.exportBtn.addEventListener('click', () => exportExcel());

        // Table row actions (event delegation)
        dom.tableBody.addEventListener('click', (e) => {
            const qrBtn = e.target.closest('[data-action="qr"]');
            const editBtn = e.target.closest('[data-action="edit"]');
            const delBtn = e.target.closest('[data-action="delete"]');
            const tagBtn = e.target.closest('[data-action="tags"]');
            const statusBtn = e.target.closest('[data-action="status"]');
            if (qrBtn) {
                if (qrBtn.disabled) return;
                const phone = qrBtn.getAttribute('data-phone');
                const customerId = Number(qrBtn.getAttribute('data-id'));
                const customerName = qrBtn.getAttribute('data-name');
                if (window.Web2QrModal?.open) {
                    window.Web2QrModal.open(phone, { customerId, customerName });
                } else {
                    notify('QR modal chưa load — refresh trang', 'warning');
                }
            } else if (editBtn) {
                openModalForEdit(editBtn.getAttribute('data-id'));
            } else if (delBtn) {
                deleteOne(delBtn.getAttribute('data-id'));
            } else if (tagBtn) {
                notify('Quản lý nhãn TPOS sẽ sớm có', 'info');
            } else if (statusBtn) {
                e.stopPropagation();
                openStatusPopover(statusBtn);
            }
        });

        // Select all
        dom.selectAll.addEventListener('change', () => {
            const checked = dom.selectAll.checked;
            for (const cb of document.querySelectorAll('.pc-row-check')) {
                cb.checked = checked;
                cb.closest('tr')?.classList.toggle('is-selected', checked);
            }
        });
        dom.tableBody.addEventListener('change', (e) => {
            const cb = e.target.closest('.pc-row-check');
            if (!cb) return;
            cb.closest('tr')?.classList.toggle('is-selected', cb.checked);
        });

        // Modal
        dom.modalClose.addEventListener('click', hideModal);
        dom.modalBackdrop.addEventListener('click', hideModal);
        dom.modalCancel.addEventListener('click', hideModal);
        dom.modalSave.addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !dom.modal.hidden) hideModal();
        });

        // Dropdowns
        for (const trigger of document.querySelectorAll('[data-toggle]')) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = trigger.getAttribute('data-toggle');
                const target = document.getElementById(targetId);
                if (!target) return;
                const isHidden = target.hidden;
                // close other menus
                for (const m of document.querySelectorAll('.pc-dropdown-menu')) m.hidden = true;
                target.hidden = !isHidden;
            });
        }
        document.addEventListener('click', () => {
            for (const m of document.querySelectorAll('.pc-dropdown-menu')) m.hidden = true;
        });
        for (const m of document.querySelectorAll('.pc-dropdown-menu')) {
            m.addEventListener('click', (e) => e.stopPropagation());
        }

        // Bulk actions
        if (dom.actionsMenu) {
            dom.actionsMenu.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-bulk-action]');
                if (!btn) return;
                dom.actionsMenu.hidden = true;
                bulk(btn.getAttribute('data-bulk-action'));
            });
        }

        // Column hide/show
        if (dom.columnsMenu) {
            dom.columnsMenu.addEventListener('change', (e) => {
                const cb = e.target.closest('input[type="checkbox"][data-col]');
                if (!cb) return;
                const col = cb.getAttribute('data-col');
                const visible = cb.checked;
                for (const cell of document.querySelectorAll(`[data-col="${col}"]`)) {
                    cell.style.display = visible ? '' : 'none';
                }
            });
        }
    }

    // ───────── Init ─────────
    async function init() {
        cacheDom();
        bindEvents();
        // Deep-link support: ?id=<partnerId> mở edit modal sau khi load list,
        // ?search=<phone|tên> prefill search box.
        const url = new URL(window.location.href);
        const deepId = url.searchParams.get('id');
        const deepSearch = url.searchParams.get('search');
        if (deepSearch) {
            state.search = deepSearch;
            dom.searchInput.value = deepSearch;
        }
        await Promise.all([load(), loadCategories()]);
        if (deepId) {
            openModalForEdit(deepId);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
