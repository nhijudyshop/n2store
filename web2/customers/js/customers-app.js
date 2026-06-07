// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse UI. KHÔNG TPOS.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — list/search/filter/paginate + CRUD.
// Nguyên tắc: 1 SĐT (10 số) = 1 KH (phone UNIQUE). 1 KH có thể nhiều FB
// account (fb_id/global_id + aliases). Đọc/ghi /api/web2/customers/* —
// ĐỘC LẬP TPOS. Realtime SSE web2:customers. UI-first qua Web2Optimistic.
// =====================================================================

(function () {
    'use strict';

    const STATUS = {
        Normal: { label: 'Bình thường', cls: 'normal' },
        Bom: { label: 'Bom hàng', cls: 'bomb' },
        Warning: { label: 'Cảnh báo', cls: 'warning' },
        Danger: { label: 'Nguy hiểm', cls: 'danger' },
        VIP: { label: 'VIP', cls: 'vip' },
    };

    const state = {
        rows: [],
        total: 0,
        page: 1,
        limit: 50,
        search: '',
        status: '',
        source: '',
        loading: false,
        selected: new Set(),
        editing: null, // row đang sửa, null = tạo mới
    };

    let _sseUnsub = null;
    let _reloadTimer = null;

    // ─── DOM helpers ────────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
    const notify = (msg, type) => window.notificationManager?.show?.(msg, type || 'info');

    // ─── Load + render ──────────────────────────────────────────────────
    async function load() {
        if (state.loading) return;
        state.loading = true;
        const body = $('#wcTableBody');
        try {
            const res = await window.CustomersApi.list({
                search: state.search,
                status: state.status,
                source: state.source,
                page: state.page,
                limit: state.limit,
            });
            if (!res.success) throw new Error(res.error || 'Lỗi tải');
            state.rows = res.data || [];
            state.total = res.total || 0;
            renderTable();
            renderPagination();
            $('#wcStatAll').textContent = state.total.toLocaleString('vi-VN');
        } catch (e) {
            body.innerHTML = `<tr><td colspan="8"><div class="wc-empty">✗ ${esc(e.message)}</div></td></tr>`;
        } finally {
            state.loading = false;
        }
    }

    function scheduleReload() {
        clearTimeout(_reloadTimer);
        _reloadTimer = setTimeout(load, 500);
    }

    function fbBadges(r) {
        const b = [];
        if (r.globalId)
            b.push(`<span class="wc-fb wc-fb-gid" title="Global ID (gửi tin)">GID</span>`);
        if (r.fbId)
            b.push(`<span class="wc-fb wc-fb-psid" title="PSID ${esc(r.fbId)}">PSID</span>`);
        if (r.fbPageId)
            b.push(`<span class="wc-fb wc-fb-page" title="Page ${esc(r.fbPageId)}">Page</span>`);
        const acc = Array.isArray(r.aliases) ? r.aliases.length : 0;
        if (acc > 0)
            b.push(`<span class="wc-fb wc-fb-acc" title="Nhiều tài khoản FB">+${acc} acc</span>`);
        return b.length ? b.join('') : '<span class="wc-muted">—</span>';
    }

    function renderTable() {
        const body = $('#wcTableBody');
        if (!state.rows.length) {
            body.innerHTML = `<tr><td colspan="8"><div class="wc-empty">Chưa có khách hàng nào</div></td></tr>`;
            return;
        }
        body.innerHTML = state.rows
            .map((r) => {
                const st = STATUS[r.status] || STATUS.Normal;
                const checked = state.selected.has(r.id) ? 'checked' : '';
                const src = r.source
                    ? `<span class="wc-src" title="Nguồn">${esc(r.source)}</span>`
                    : '';
                return `
                <tr data-id="${r.id}" data-phone="${esc(r.phone)}">
                    <td class="wc-col-check"><input type="checkbox" class="wc-row-check" ${checked} /></td>
                    <td class="wc-col-name">
                        <div class="wc-name">${esc(r.name) || '<span class="wc-muted">(không tên)</span>'} ${src}</div>
                        ${r.note ? `<div class="wc-note" title="${esc(r.note)}">${esc(r.note)}</div>` : ''}
                    </td>
                    <td class="wc-col-phone">
                        ${r.phone ? `<span class="wc-phone" data-w2wallet-phone="${esc(r.phone)}" data-w2wallet-name="${esc(r.name)}">${esc(r.phone)}</span>` : '<span class="wc-muted">—</span>'}
                    </td>
                    <td class="wc-col-fb">${fbBadges(r)}</td>
                    <td class="wc-col-address">${esc(r.address) || '<span class="wc-muted">—</span>'}</td>
                    <td class="wc-col-status"><span class="wc-badge wc-badge-${st.cls}">${st.label}</span></td>
                    <td class="wc-col-stats">
                        <span title="Số đơn">${r.totalOrders || 0} đơn</span>
                        ${r.totalSpent ? `<span class="wc-spent">${fmtMoney(r.totalSpent)}</span>` : ''}
                        ${r.bomCount ? `<span class="wc-bom" title="Bom">⚠${r.bomCount}</span>` : ''}
                    </td>
                    <td class="wc-col-actions">
                        <button class="wc-act" data-act="detail" title="Chi tiết / chat / đơn"><i data-lucide="eye"></i></button>
                        <button class="wc-act" data-act="qr" title="QR chuyển khoản"><i data-lucide="qr-code"></i></button>
                        <button class="wc-act" data-act="edit" title="Sửa"><i data-lucide="pencil"></i></button>
                        <button class="wc-act wc-act-danger" data-act="delete" title="Xóa"><i data-lucide="trash-2"></i></button>
                    </td>
                </tr>`;
            })
            .join('');
        if (window.lucide) window.lucide.createIcons();
        // Pill số dư ví (shared) — quét row vừa render.
        window.Web2WalletBalance?.attachBalances?.(body);
    }

    function renderPagination() {
        const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
        const from = state.total ? (state.page - 1) * state.limit + 1 : 0;
        const to = Math.min(state.page * state.limit, state.total);
        $('#wcPaginationInfo').textContent =
            `${from}–${to} / ${state.total.toLocaleString('vi-VN')}`;
        const btns = [];
        const mk = (p, label, disabled, active) =>
            `<button class="wc-page-btn ${active ? 'is-active' : ''}" ${disabled ? 'disabled' : ''} data-page="${p}">${label}</button>`;
        btns.push(mk(state.page - 1, '‹', state.page <= 1, false));
        const win = 2;
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || (p >= state.page - win && p <= state.page + win)) {
                btns.push(mk(p, p, false, p === state.page));
            } else if (p === state.page - win - 1 || p === state.page + win + 1) {
                btns.push('<span class="wc-page-ellipsis">…</span>');
            }
        }
        btns.push(mk(state.page + 1, '›', state.page >= totalPages, false));
        $('#wcPaginationButtons').innerHTML = btns.join('');
    }

    // ─── Modal Thêm/Sửa ─────────────────────────────────────────────────
    function openModal(row) {
        state.editing = row || null;
        $('#wcModalTitle').textContent = row ? 'Sửa khách hàng' : 'Thêm khách hàng';
        const g = (id) => $('#' + id);
        g('wcfName').value = row?.name || '';
        g('wcfPhone').value = row?.phone || '';
        g('wcfEmail').value = row?.email || '';
        g('wcfStatus').value = row?.status || 'Normal';
        g('wcfTier').value = row?.tier || '';
        g('wcfAddress').value = row?.address || '';
        g('wcfWard').value = row?.ward || '';
        g('wcfDistrict').value = row?.district || '';
        g('wcfCity').value = row?.city || '';
        g('wcfCarrier').value = row?.carrier || '';
        g('wcfNote').value = row?.note || '';
        g('wcfFbId').value = row?.fbId || '';
        g('wcfGlobalId').value = row?.globalId || '';
        g('wcfFbPageId').value = row?.fbPageId || '';
        g('wcfTags').value = Array.isArray(row?.tags) ? row.tags.join(', ') : '';
        $('#wcModalError').textContent = '';
        // History timeline (chỉ khi sửa)
        const histWrap = $('#wcModalHistory');
        if (row && Array.isArray(row.history) && row.history.length && window.Web2HistoryTimeline) {
            histWrap.innerHTML = window.Web2HistoryTimeline.render(row.history);
            histWrap.hidden = false;
        } else {
            histWrap.hidden = true;
            histWrap.innerHTML = '';
        }
        $('#wcModal').hidden = false;
        setTimeout(() => g('wcfName').focus(), 50);
    }
    function closeModal() {
        $('#wcModal').hidden = true;
        state.editing = null;
    }

    function collectForm() {
        const v = (id) => $('#' + id).value.trim();
        const tags = v('wcfTags')
            ? v('wcfTags')
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
            : [];
        return {
            name: v('wcfName'),
            phone: v('wcfPhone'),
            email: v('wcfEmail'),
            status: v('wcfStatus'),
            tier: v('wcfTier'),
            address: v('wcfAddress'),
            ward: v('wcfWard'),
            district: v('wcfDistrict'),
            city: v('wcfCity'),
            carrier: v('wcfCarrier'),
            note: v('wcfNote'),
            fbId: v('wcfFbId'),
            globalId: v('wcfGlobalId'),
            fbPageId: v('wcfFbPageId'),
            tags,
        };
    }

    async function saveModal() {
        const body = collectForm();
        if (!body.name) {
            $('#wcModalError').textContent = 'Tên khách hàng bắt buộc';
            return;
        }
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        body.userId = actor.userId;
        body.userName = actor.userName;
        const editing = state.editing;
        closeModal();
        // Money/validation-strict? Không — KH info, dùng UI-first.
        const runFn = editing
            ? () => window.CustomersApi.update(editing.id, body)
            : () => window.CustomersApi.create(body);
        try {
            const res = await runFn();
            if (res.success === false) throw new Error(res.error || 'Lưu thất bại');
            notify(editing ? 'Đã cập nhật KH' : 'Đã thêm KH', 'success');
            load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
            // Mở lại modal để user sửa (giữ data đã nhập là khó — báo lỗi là đủ).
        }
    }

    // ─── Row actions ────────────────────────────────────────────────────
    async function onAction(act, row) {
        if (act === 'edit') return openModal(row);
        if (act === 'detail') {
            if (window.Web2CustomerDetailModal?.open) {
                window.Web2CustomerDetailModal.open(row.phone || '', row.name || '');
            } else {
                notify('Module chi tiết chưa load', 'warning');
            }
            return;
        }
        if (act === 'qr') {
            if (!row.phone) return notify('KH chưa có SĐT để tạo QR', 'warning');
            window.Web2QrModal?.open?.(row.phone, { name: row.name });
            return;
        }
        if (act === 'delete') {
            if (!confirm(`Xóa khách hàng "${row.name || row.phone}"?`)) return;
            try {
                const res = await window.CustomersApi.remove(row.id);
                if (res.success === false) throw new Error(res.error || 'Xóa thất bại');
                notify(
                    res.archived ? `KH có ${res.orderCount} đơn → đã lưu trữ (ẩn)` : 'Đã xóa KH',
                    'success'
                );
                load();
            } catch (e) {
                notify('✗ ' + e.message, 'error');
            }
        }
    }

    // ─── Merge mode ─────────────────────────────────────────────────────
    async function doMerge() {
        const ids = Array.from(state.selected);
        if (ids.length !== 2) return notify('Chọn ĐÚNG 2 KH để gộp', 'warning');
        const [a, b] = ids;
        const ra = state.rows.find((r) => r.id === a);
        const rb = state.rows.find((r) => r.id === b);
        const primary = confirm(
            `Gộp 2 KH:\n  A: ${ra?.name} (${ra?.phone || '—'})\n  B: ${rb?.name} (${rb?.phone || '—'})\n\nOK = giữ A làm chính (B gộp vào A).\nCancel = giữ B làm chính.`
        );
        const primaryId = primary ? a : b;
        const secondaryId = primary ? b : a;
        try {
            const res = await window.CustomersApi.merge(primaryId, secondaryId);
            if (res.success === false) throw new Error(res.error || 'Gộp thất bại');
            notify('Đã gộp 2 KH', 'success');
            state.selected.clear();
            load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    // ─── Export CSV (client-side, trang hiện tại) ───────────────────────
    function exportCsv() {
        const cols = [
            'name',
            'phone',
            'email',
            'address',
            'status',
            'tier',
            'fbId',
            'globalId',
            'totalOrders',
            'totalSpent',
        ];
        const head = cols.join(',');
        const lines = state.rows.map((r) =>
            cols.map((c) => `"${String(r[c] == null ? '' : r[c]).replace(/"/g, '""')}"`).join(',')
        );
        const blob = new Blob(['﻿' + head + '\n' + lines.join('\n')], {
            type: 'text/csv;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `web2-customers-p${state.page}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ─── Bind events ────────────────────────────────────────────────────
    function bind() {
        // Search (debounce)
        let st;
        $('#wcSearchInput').addEventListener('input', (e) => {
            clearTimeout(st);
            st = setTimeout(() => {
                state.search = e.target.value.trim();
                state.page = 1;
                load();
            }, 350);
        });
        $('#wcSearchBtn').addEventListener('click', () => {
            state.search = $('#wcSearchInput').value.trim();
            state.page = 1;
            load();
        });
        // Status stats filter
        $('#wcStatsBar').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-stat');
            if (!btn) return;
            $('#wcStatsBar')
                .querySelectorAll('.wc-stat')
                .forEach((b) => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            state.status = btn.dataset.status === 'all' ? '' : btn.dataset.status;
            state.page = 1;
            load();
        });
        // Source filter
        $('#wcSourceFilter').addEventListener('change', (e) => {
            state.source = e.target.value;
            state.page = 1;
            load();
        });
        // Page size
        $('#wcPageSize').addEventListener('change', (e) => {
            state.limit = parseInt(e.target.value, 10) || 50;
            state.page = 1;
            load();
        });
        // Pagination
        $('#wcPaginationButtons').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-page-btn');
            if (!btn || btn.disabled) return;
            state.page = parseInt(btn.dataset.page, 10);
            load();
        });
        // Toolbar
        $('#wcAddBtn').addEventListener('click', () => openModal(null));
        $('#wcExportBtn').addEventListener('click', exportCsv);
        $('#wcMergeBtn').addEventListener('click', doMerge);
        // Table delegation (row checkbox + actions)
        $('#wcTableBody').addEventListener('click', (e) => {
            const tr = e.target.closest('tr[data-id]');
            if (!tr) return;
            const id = Number(tr.dataset.id);
            const row = state.rows.find((r) => r.id === id);
            const chk = e.target.closest('.wc-row-check');
            if (chk) {
                if (chk.checked) state.selected.add(id);
                else state.selected.delete(id);
                $('#wcMergeBtn').disabled = state.selected.size !== 2;
                return;
            }
            const actBtn = e.target.closest('.wc-act');
            if (actBtn && row) onAction(actBtn.dataset.act, row);
        });
        // Select all
        $('#wcSelectAll').addEventListener('change', (e) => {
            const on = e.target.checked;
            state.selected.clear();
            if (on) state.rows.forEach((r) => state.selected.add(r.id));
            $('#wcTableBody')
                .querySelectorAll('.wc-row-check')
                .forEach((c) => (c.checked = on));
            $('#wcMergeBtn').disabled = state.selected.size !== 2;
        });
        // Modal
        $('#wcModalClose').addEventListener('click', closeModal);
        $('#wcModalCancel').addEventListener('click', closeModal);
        $('#wcModalBackdrop').addEventListener('click', closeModal);
        $('#wcModalSave').addEventListener('click', saveModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('#wcModal').hidden) closeModal();
        });
    }

    // ─── SSE realtime ───────────────────────────────────────────────────
    function subscribeSse() {
        if (!window.Web2SSE?.subscribe) return;
        _sseUnsub = window.Web2SSE.subscribe('web2:customers', () => scheduleReload());
    }

    // ─── Init ───────────────────────────────────────────────────────────
    function init() {
        bind();
        load();
        subscribeSse();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('beforeunload', () => {
        if (typeof _sseUnsub === 'function') _sseUnsub();
    });
})();
