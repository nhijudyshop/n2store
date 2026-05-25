// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — sync 2-way TPOS.
// =====================================================================
// LiveCampaignApp — UI controller cho trang "Chiến dịch Live"
// =====================================================================
// Architecture:
//  - STATE giữ filter + pagination + last data
//  - render() build lại bảng từ STATE
//  - Tất cả mutation gọi LiveCampaignApi (→ TPOS) rồi reload list
//  - Chú ý: không có offline mode — TPOS là source of truth
// =====================================================================

(function () {
    'use strict';

    const PAGE_SIZE = 20;

    const STATE = {
        loading: false,
        items: [],
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        filters: {
            search: '',
            status: 'all',
            dateFrom: '',
            dateTo: '',
        },
        // Track in-flight toggles to avoid double-click
        togglingIds: new Set(),
        // Active row dropdown
        openMenuId: null,
    };

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (s) => {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    const fmtDateTime = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const notify = (msg, type) => {
        if (window.notificationManager && window.notificationManager.show) {
            window.notificationManager.show(msg, type || 'info');
        } else {
            // eslint-disable-next-line no-alert
            console[type === 'error' ? 'error' : 'log']('[LiveCampaign]', msg);
        }
    };
    const initials = (name) => {
        if (!name) return '?';
        const parts = String(name).trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    // ── Data loading ────────────────────────────────────────────────────
    async function loadData() {
        if (STATE.loading) return;
        STATE.loading = true;
        renderSyncPill('loading');
        renderTable();
        try {
            const opts = {
                top: STATE.pageSize,
                skip: (STATE.page - 1) * STATE.pageSize,
                orderby: 'DateCreated desc',
                search: STATE.filters.search,
                status: STATE.filters.status,
                dateFrom: STATE.filters.dateFrom,
                dateTo: STATE.filters.dateTo,
            };
            const result = await window.LiveCampaignApi.list(opts);
            STATE.items = result.value;
            STATE.total = result.count;
            renderSyncPill('ok');
        } catch (e) {
            console.warn('[LiveCampaign] load fail', e);
            notify('Lỗi tải danh sách: ' + e.message, 'error');
            STATE.items = [];
            STATE.total = 0;
            renderSyncPill('error');
        } finally {
            STATE.loading = false;
            renderTable();
            renderPagination();
            renderCount();
        }
    }

    // ── Rendering ───────────────────────────────────────────────────────
    function renderSyncPill(state) {
        const pill = $('lcSyncPill');
        if (!pill) return;
        pill.classList.remove('is-error');
        if (state === 'loading') {
            pill.innerHTML = '<i data-lucide="refresh-cw"></i> Đang đồng bộ TPOS…';
        } else if (state === 'error') {
            pill.classList.add('is-error');
            pill.innerHTML = '<i data-lucide="alert-triangle"></i> Lỗi đồng bộ TPOS';
        } else {
            pill.innerHTML = '<i data-lucide="refresh-cw"></i> Đồng bộ 2 chiều TPOS';
        }
        if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
    }

    function renderCount() {
        const el = $('lcCountBadge');
        if (el) el.textContent = STATE.total;
    }

    function renderTable() {
        const tbody = $('lcTableBody');
        if (!tbody) return;

        if (STATE.loading) {
            tbody.innerHTML =
                '<tr><td colspan="8"><div class="lc-loading"><i data-lucide="loader-2"></i><br/>Đang tải…</div></td></tr>';
            if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
            return;
        }
        if (!STATE.items.length) {
            tbody.innerHTML =
                '<tr><td colspan="8"><div class="lc-empty"><i data-lucide="inbox"></i><br/>Không có chiến dịch nào</div></td></tr>';
            if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
            return;
        }

        const rows = STATE.items.map((c) => {
            const statusBadge =
                c.ShowConfig === 'Nháp' || c.Config === 'Draft'
                    ? '<span class="badge-status draft">Nháp</span>'
                    : c.Config === 'Active'
                      ? '<span class="badge-status active">Live</span>'
                      : c.Config
                        ? `<span class="badge-status ended">${escapeHtml(c.ShowConfig || c.Config)}</span>`
                        : '';
            const fbName = c.Facebook_UserName ? escapeHtml(c.Facebook_UserName) : '';
            const fbHtml = fbName
                ? `<div class="lc-fb-cell"><span class="lc-fb-avatar">${escapeHtml(initials(c.Facebook_UserName))}</span><span class="lc-fb-name">${fbName}</span></div>`
                : '<span style="color:#a4adba">—</span>';
            const liveHtml = c.Facebook_LiveId
                ? `<span class="lc-live-cell" title="${escapeHtml(c.Facebook_LiveId)}">${escapeHtml(c.Facebook_LiveId)}</span>`
                : '<span style="color:#a4adba">—</span>';
            const noteHtml = c.Note
                ? `<span class="lc-note-cell" title="${escapeHtml(c.Note)}">${escapeHtml(c.Note)}</span>`
                : '<span style="color:#a4adba">—</span>';
            const loadingToggle = STATE.togglingIds.has(c.Id) ? 'is-loading' : '';
            const isMenuOpen = STATE.openMenuId === c.Id ? 'is-open' : '';
            return `
              <tr data-id="${escapeHtml(c.Id)}">
                <td class="lc-col-name">${escapeHtml(c.Name || '')}${statusBadge}</td>
                <td>${fbHtml}</td>
                <td>${liveHtml}</td>
                <td>${noteHtml}</td>
                <td>
                  <button class="lc-btn lc-btn-sm" data-act="export" title="Xuất Excel từ Đơn Web (native-orders), không gọi TPOS">
                    <i data-lucide="download"></i> Tải về
                  </button>
                </td>
                <td>
                  <label class="lc-toggle ${loadingToggle}">
                    <input type="checkbox" data-act="toggle" ${c.IsActive ? 'checked' : ''} ${loadingToggle ? 'disabled' : ''}/>
                    <span class="lc-toggle-track"></span>
                  </label>
                </td>
                <td>${fmtDateTime(c.DateCreated)}</td>
                <td class="lc-col-actions">
                  <div class="lc-row-menu ${isMenuOpen}">
                    <button class="lc-btn lc-btn-ghost lc-btn-sm" data-act="menu" title="Thao tác">
                      <i data-lucide="more-vertical"></i>
                    </button>
                    <div class="lc-row-menu-list">
                      <button data-act="edit"><i data-lucide="pencil"></i> Sửa</button>
                      <button class="danger" data-act="delete"><i data-lucide="trash-2"></i> Xóa</button>
                    </div>
                  </div>
                </td>
              </tr>`;
        });
        tbody.innerHTML = rows.join('');
        if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
    }

    function renderPagination() {
        const info = $('lcPaginationInfo');
        const buttons = $('lcPaginationButtons');
        if (!info || !buttons) return;
        const total = STATE.total;
        const pages = Math.max(1, Math.ceil(total / STATE.pageSize));
        const start = total === 0 ? 0 : (STATE.page - 1) * STATE.pageSize + 1;
        const end = Math.min(STATE.page * STATE.pageSize, total);
        info.textContent = `Hiển thị ${start}–${end} / ${total} chiến dịch`;
        const html = [];
        html.push(
            `<button class="lc-page-btn" data-page="prev" ${STATE.page <= 1 ? 'disabled' : ''}>‹</button>`
        );
        // Show up to 7 page buttons centred on current
        const win = 3;
        const lo = Math.max(1, STATE.page - win);
        const hi = Math.min(pages, STATE.page + win);
        if (lo > 1) {
            html.push('<button class="lc-page-btn" data-page="1">1</button>');
            if (lo > 2) html.push('<span class="lc-page-btn" disabled>…</span>');
        }
        for (let p = lo; p <= hi; p++) {
            html.push(
                `<button class="lc-page-btn ${p === STATE.page ? 'is-active' : ''}" data-page="${p}">${p}</button>`
            );
        }
        if (hi < pages) {
            if (hi < pages - 1) html.push('<span class="lc-page-btn" disabled>…</span>');
            html.push(`<button class="lc-page-btn" data-page="${pages}">${pages}</button>`);
        }
        html.push(
            `<button class="lc-page-btn" data-page="next" ${STATE.page >= pages ? 'disabled' : ''}>›</button>`
        );
        buttons.innerHTML = html.join('');
    }

    // ── Event handlers ──────────────────────────────────────────────────
    function bindEvents() {
        $('lcRefreshBtn').addEventListener('click', () => loadData());
        $('lcAddBtn').addEventListener('click', () => openCreateModal());
        $('lcSearchInput').addEventListener(
            'input',
            debounce(() => {
                STATE.filters.search = $('lcSearchInput').value;
                STATE.page = 1;
                loadData();
            }, 350)
        );
        $('lcStatusSelect').addEventListener('change', () => {
            STATE.filters.status = $('lcStatusSelect').value;
            STATE.page = 1;
            loadData();
        });
        $('lcDateFrom').addEventListener('change', () => {
            STATE.filters.dateFrom = $('lcDateFrom').value;
            STATE.page = 1;
            loadData();
        });
        $('lcDateTo').addEventListener('change', () => {
            STATE.filters.dateTo = $('lcDateTo').value;
            STATE.page = 1;
            loadData();
        });
        $('lcClearFiltersBtn').addEventListener('click', () => {
            STATE.filters = { search: '', status: 'all', dateFrom: '', dateTo: '' };
            $('lcSearchInput').value = '';
            $('lcStatusSelect').value = 'all';
            $('lcDateFrom').value = '';
            $('lcDateTo').value = '';
            STATE.page = 1;
            loadData();
        });

        // Pagination — event delegation
        $('lcPaginationButtons').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn) return;
            const v = btn.getAttribute('data-page');
            const pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
            if (v === 'prev') STATE.page = Math.max(1, STATE.page - 1);
            else if (v === 'next') STATE.page = Math.min(pages, STATE.page + 1);
            else STATE.page = parseInt(v, 10) || 1;
            loadData();
        });

        // Table row actions — delegation
        $('lcTableBody').addEventListener('click', async (e) => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            const id = tr.getAttribute('data-id');
            const actionEl = e.target.closest('[data-act]');
            if (!actionEl) return;
            const action = actionEl.getAttribute('data-act');
            if (action === 'export') {
                await exportRow(id, tr);
            } else if (action === 'menu') {
                e.stopPropagation();
                STATE.openMenuId = STATE.openMenuId === id ? null : id;
                renderTable();
            } else if (action === 'edit') {
                STATE.openMenuId = null;
                openEditModal(id);
            } else if (action === 'delete') {
                STATE.openMenuId = null;
                await deleteRow(id);
            }
        });
        $('lcTableBody').addEventListener('change', async (e) => {
            const toggle = e.target.closest('input[data-act="toggle"]');
            if (!toggle) return;
            const tr = toggle.closest('tr[data-id]');
            if (!tr) return;
            const id = tr.getAttribute('data-id');
            await toggleActive(id, toggle.checked);
        });

        // Close row menu on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.lc-row-menu')) {
                if (STATE.openMenuId) {
                    STATE.openMenuId = null;
                    renderTable();
                }
            }
        });
    }

    function debounce(fn, ms) {
        let t = null;
        return function () {
            const args = arguments;
            const self = this;
            clearTimeout(t);
            t = setTimeout(() => fn.apply(self, args), ms);
        };
    }

    // ── Actions ─────────────────────────────────────────────────────────
    async function toggleActive(id, isActive) {
        if (STATE.togglingIds.has(id)) return;
        STATE.togglingIds.add(id);
        renderTable();
        try {
            await window.LiveCampaignApi.setActive(id, isActive);
            // Update local cache so UI doesn't flicker before reload
            const idx = STATE.items.findIndex((x) => x.Id === id);
            if (idx >= 0) STATE.items[idx].IsActive = isActive;
            notify(
                isActive ? 'Đã bật chiến dịch trên TPOS' : 'Đã tắt chiến dịch trên TPOS',
                'success'
            );
        } catch (e) {
            console.warn('[LiveCampaign] toggle fail', e);
            notify('Lỗi đổi trạng thái: ' + e.message, 'error');
        } finally {
            STATE.togglingIds.delete(id);
            renderTable();
        }
    }

    async function deleteRow(id) {
        const item = STATE.items.find((x) => x.Id === id);
        const name = item ? item.Name : id;
        // eslint-disable-next-line no-alert
        if (
            !window.confirm(`Xóa chiến dịch "${name}" trên TPOS?\nThao tác này không thể hoàn tác.`)
        )
            return;
        try {
            await window.LiveCampaignApi.remove(id);
            notify('Đã xóa chiến dịch trên TPOS', 'success');
            loadData();
        } catch (e) {
            console.warn('[LiveCampaign] delete fail', e);
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    async function exportRow(id, tr) {
        const btn = tr.querySelector('[data-act="export"]');
        if (btn) btn.setAttribute('disabled', 'true');
        const item = STATE.items.find((x) => x.Id === id);
        const displayName = item && item.Name ? item.Name : 'campaign';
        try {
            const { blob, count } = await window.LiveCampaignApi.exportExcel(id, displayName);
            const safeName = displayName.replace(/[^\w\-]+/g, '_');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            notify(`Đã tải Excel (${count} Đơn Web)`, 'success');
        } catch (e) {
            console.warn('[LiveCampaign] export fail', e);
            notify(e.message || 'Lỗi xuất Excel', 'error');
        } finally {
            if (btn) btn.removeAttribute('disabled');
        }
    }

    // ── Modal: Create / Edit ────────────────────────────────────────────
    let modalMode = 'create'; // 'create' | 'edit'
    let modalEditingId = null;

    function openCreateModal() {
        modalMode = 'create';
        modalEditingId = null;
        $('lcModalTitle').textContent = 'Thêm chiến dịch Live';
        $('lcFieldName').value = '';
        $('lcFieldNote').value = '';
        $('lcFieldFbPage').value = '';
        $('lcFieldLiveId').value = '';
        $('lcFieldActive').checked = true;
        clearModalError();
        showModal();
    }

    async function openEditModal(id) {
        modalMode = 'edit';
        modalEditingId = id;
        $('lcModalTitle').textContent = 'Sửa chiến dịch Live';
        // Pre-fill from cached row to render fast; then refresh from TPOS
        const cached = STATE.items.find((x) => x.Id === id);
        if (cached) fillModalFromRecord(cached);
        clearModalError();
        showModal();
        try {
            const fresh = await window.LiveCampaignApi.getOne(id);
            fillModalFromRecord(fresh);
        } catch (e) {
            console.warn('[LiveCampaign] getOne fail', e);
            notify('Lỗi tải dữ liệu mới nhất: ' + e.message, 'error');
        }
    }

    function fillModalFromRecord(r) {
        $('lcFieldName').value = r.Name || '';
        $('lcFieldNote').value = r.Note || '';
        $('lcFieldFbPage').value = r.Facebook_UserName || '';
        $('lcFieldLiveId').value = r.Facebook_LiveId || '';
        $('lcFieldActive').checked = !!r.IsActive;
    }

    function showModal() {
        const modal = $('lcModal');
        modal.removeAttribute('hidden');
        setTimeout(() => $('lcFieldName').focus(), 30);
        if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
    }
    function hideModal() {
        $('lcModal').setAttribute('hidden', '');
    }
    function clearModalError() {
        const el = $('lcModalError');
        el.classList.remove('is-visible');
        el.textContent = '';
    }
    function showModalError(msg) {
        const el = $('lcModalError');
        el.textContent = msg;
        el.classList.add('is-visible');
    }

    function bindModal() {
        $('lcModalClose').addEventListener('click', hideModal);
        $('lcModalCancel').addEventListener('click', hideModal);
        $('lcModalBackdrop').addEventListener('click', hideModal);
        $('lcModalSave').addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('lcModal').hasAttribute('hidden')) hideModal();
        });
    }

    async function saveModal() {
        const name = $('lcFieldName').value.trim();
        if (!name) {
            showModalError('Tên chiến dịch không được trống');
            return;
        }
        const payload = {
            Name: name,
            Note: $('lcFieldNote').value.trim() || null,
            Facebook_UserName: $('lcFieldFbPage').value.trim() || null,
            Facebook_LiveId: $('lcFieldLiveId').value.trim() || null,
            IsActive: $('lcFieldActive').checked,
        };
        const saveBtn = $('lcModalSave');
        saveBtn.setAttribute('disabled', 'true');
        clearModalError();
        try {
            if (modalMode === 'create') {
                await window.LiveCampaignApi.create(payload);
                notify('Đã tạo chiến dịch trên TPOS', 'success');
            } else {
                await window.LiveCampaignApi.update(modalEditingId, payload);
                notify('Đã cập nhật chiến dịch trên TPOS', 'success');
            }
            hideModal();
            loadData();
        } catch (e) {
            console.warn('[LiveCampaign] save fail', e);
            showModalError(e.message || 'Lỗi không xác định');
        } finally {
            saveBtn.removeAttribute('disabled');
        }
    }

    // ── Bootstrap ───────────────────────────────────────────────────────
    function waitForToken(maxTries) {
        return new Promise((resolve, reject) => {
            let tries = 0;
            const tick = () => {
                if (
                    window.tokenManager &&
                    typeof window.tokenManager.authenticatedFetch === 'function'
                ) {
                    resolve();
                    return;
                }
                if (++tries >= (maxTries || 80)) {
                    reject(new Error('TokenManager không khởi tạo được'));
                    return;
                }
                setTimeout(tick, 100);
            };
            tick();
        });
    }

    async function bootstrap() {
        bindEvents();
        bindModal();
        renderSyncPill('loading');
        try {
            await waitForToken();
            await loadData();
        } catch (e) {
            console.error('[LiveCampaign] bootstrap fail', e);
            notify(e.message || 'Lỗi khởi tạo', 'error');
            renderSyncPill('error');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
