// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Kho KH warehouse UI. warehouse riêng.
// =====================================================================
// Kho Khách Hàng Web 2.0 (warehouse) — list/search/filter/paginate + CRUD.
// Nguyên tắc: 1 SĐT (10 số) = 1 KH (phone UNIQUE). 1 KH có thể nhiều FB
// account (fb_id/global_id + aliases). Đọc/ghi /api/web2/customers/* —
// ĐỘC LẬP. Realtime SSE web2:customers. UI-first qua Web2Optimistic.
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

    // Chuẩn hoá SĐT → 10 số đuôi (0xxxxxxxxx). Trả '' nếu không hợp lệ.
    const normPhone = (p) => {
        let s = String(p == null ? '' : p).replace(/\D/g, '');
        if (s.length > 10) s = s.slice(-10);
        if (s && !s.startsWith('0') && s.length === 9) s = '0' + s;
        return s.length === 10 ? s : '';
    };

    // SĐT phụ đang chỉnh trong modal (1 KH nhiều SĐT). phone chính tách riêng.
    let modalAltPhones = [];
    let modalAltAddresses = [];

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
            // Không có trong kho + có từ khoá tìm → fallback Pancake.
            if (state.search && state.total === 0) {
                runPancakeFallback(state.search);
            } else {
                hidePancakeResults();
            }
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
                        ${r.phone ? `<span class="wc-phone">${esc(r.phone)}</span><span class="wc-wallet" data-w2wallet-phone="${esc(r.phone)}" data-w2wallet-name="${esc(r.name)}"></span>` : '<span class="wc-muted">—</span>'}
                        ${Array.isArray(r.altPhones) && r.altPhones.length ? `<span class="wc-altphone-tag" title="SĐT phụ: ${esc(r.altPhones.join(', '))}">+${r.altPhones.length} SĐT</span>` : ''}
                    </td>
                    <td class="wc-col-fb">${fbBadges(r)}</td>
                    <td class="wc-col-address">${esc(r.address) || '<span class="wc-muted">—</span>'}${Array.isArray(r.altAddresses) && r.altAddresses.length ? ` <span class="wc-altaddr-tag" title="Địa chỉ phụ:&#10;${esc(r.altAddresses.join('\n'))}">+${r.altAddresses.length} địa chỉ</span>` : ''}</td>
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

    // ─── SĐT phụ trong modal ────────────────────────────────────────────
    function renderAltPhones() {
        const list = $('#wcAltPhoneList');
        if (!list) return;
        if (!modalAltPhones.length) {
            list.innerHTML = '<span class="wc-altphone-empty">Chưa có SĐT phụ</span>';
            return;
        }
        list.innerHTML = modalAltPhones
            .map(
                (p, i) =>
                    `<span class="wc-altphone-chip"><button type="button" class="wc-altphone-star" data-idx="${i}" title="Đặt làm SĐT chính (hiển thị)" aria-label="Đặt ${esc(p)} làm SĐT chính"><i data-lucide="star"></i></button><span>${esc(p)}</span><button type="button" class="wc-altphone-rm" data-idx="${i}" aria-label="Xóa SĐT ${esc(p)}"><i data-lucide="x"></i></button></span>`
            )
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // Đặt 1 SĐT phụ làm SĐT chính (hiển thị). SĐT chính cũ → về danh sách phụ.
    // Mọi SĐT vẫn cùng 1 KH (tham chiếu qua SĐT chính = khoá phone UNIQUE).
    function setPrimaryAltPhone(idx) {
        const inp = $('#wcfPhone');
        const chosen = modalAltPhones[idx];
        if (!chosen) return;
        const oldPrimary = normPhone(inp.value);
        modalAltPhones.splice(idx, 1);
        if (oldPrimary && oldPrimary !== chosen && !modalAltPhones.includes(oldPrimary)) {
            modalAltPhones.unshift(oldPrimary);
        }
        inp.value = chosen;
        renderAltPhones();
        notify('Đã đặt ' + chosen + ' làm SĐT chính', 'success');
    }

    function addAltPhone() {
        const inp = $('#wcfAltPhoneInput');
        const n = normPhone(inp.value);
        if (!n) {
            notify('SĐT phụ phải đủ 10 số', 'warning');
            return;
        }
        const primary = normPhone($('#wcfPhone').value);
        if (primary && n === primary) {
            notify('SĐT này trùng SĐT chính', 'warning');
            return;
        }
        if (modalAltPhones.includes(n)) {
            notify('SĐT phụ đã có trong danh sách', 'warning');
            return;
        }
        modalAltPhones.push(n);
        inp.value = '';
        renderAltPhones();
        inp.focus();
    }

    // ─── Địa chỉ phụ trong modal (1 KH nhiều địa chỉ) ───────────────────
    function renderAltAddresses() {
        const list = $('#wcAltAddrList');
        if (!list) return;
        if (!modalAltAddresses.length) {
            list.innerHTML = '<span class="wc-altaddr-empty">Chưa có địa chỉ phụ</span>';
            return;
        }
        list.innerHTML = modalAltAddresses
            .map(
                (a, i) =>
                    `<span class="wc-altaddr-chip"><button type="button" class="wc-altaddr-star" data-idx="${i}" title="Đặt làm địa chỉ chính (hiển thị)" aria-label="Đặt làm địa chỉ chính"><i data-lucide="star"></i></button><span class="wc-altaddr-text">${esc(a)}</span><button type="button" class="wc-altaddr-rm" data-idx="${i}" aria-label="Xóa địa chỉ"><i data-lucide="x"></i></button></span>`
            )
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // Đặt 1 địa chỉ phụ làm địa chỉ chính (hiển thị). Địa chỉ chính cũ → về phụ.
    function setPrimaryAltAddr(idx) {
        const inp = $('#wcfAddress');
        const chosen = modalAltAddresses[idx];
        if (!chosen) return;
        const oldPrimary = String(inp.value || '').trim();
        modalAltAddresses.splice(idx, 1);
        if (oldPrimary && oldPrimary !== chosen && !modalAltAddresses.includes(oldPrimary)) {
            modalAltAddresses.unshift(oldPrimary);
        }
        inp.value = chosen;
        renderAltAddresses();
        notify('Đã đặt địa chỉ chính', 'success');
    }

    function addAltAddress() {
        const inp = $('#wcfAltAddrInput');
        const a = String(inp.value || '').trim();
        if (!a) {
            notify('Nhập địa chỉ phụ', 'warning');
            return;
        }
        const primary = String($('#wcfAddress').value || '').trim();
        if (primary && a === primary) {
            notify('Địa chỉ này trùng địa chỉ chính', 'warning');
            return;
        }
        if (modalAltAddresses.includes(a)) {
            notify('Địa chỉ phụ đã có trong danh sách', 'warning');
            return;
        }
        modalAltAddresses.push(a);
        inp.value = '';
        renderAltAddresses();
        inp.focus();
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
        // SĐT phụ
        modalAltPhones = Array.isArray(row?.altPhones)
            ? row.altPhones.map(normPhone).filter(Boolean)
            : [];
        if ($('#wcfAltPhoneInput')) $('#wcfAltPhoneInput').value = '';
        renderAltPhones();
        // Địa chỉ phụ
        modalAltAddresses = Array.isArray(row?.altAddresses)
            ? row.altAddresses.map((a) => String(a || '').trim()).filter(Boolean)
            : [];
        if ($('#wcfAltAddrInput')) $('#wcfAltAddrInput').value = '';
        renderAltAddresses();
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
            altPhones: modalAltPhones.slice(),
            altAddresses: modalAltAddresses.slice(),
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
            window.Web2QrModal?.open?.(row.phone, {
                customerId: row.id,
                customerName: row.name,
            });
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
        // Pancake fallback: "Thêm vào kho"
        $('#wcPancakeList').addEventListener('click', (e) => {
            const btn = e.target.closest('.wc-pancake-add');
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (Number.isFinite(idx)) addPancakeToKho(idx);
        });
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
        // SĐT phụ: thêm + xóa
        $('#wcfAltPhoneAddBtn').addEventListener('click', addAltPhone);
        $('#wcfAltPhoneInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addAltPhone();
            }
        });
        $('#wcAltPhoneList').addEventListener('click', (e) => {
            const star = e.target.closest('.wc-altphone-star');
            if (star) {
                const i = Number(star.dataset.idx);
                if (Number.isFinite(i)) setPrimaryAltPhone(i);
                return;
            }
            const rm = e.target.closest('.wc-altphone-rm');
            if (!rm) return;
            const idx = Number(rm.dataset.idx);
            if (Number.isFinite(idx)) {
                modalAltPhones.splice(idx, 1);
                renderAltPhones();
            }
        });
        // Địa chỉ phụ: thêm + xóa + đặt chính
        $('#wcfAltAddrAddBtn')?.addEventListener('click', addAltAddress);
        $('#wcfAltAddrInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addAltAddress();
            }
        });
        $('#wcAltAddrList')?.addEventListener('click', (e) => {
            const star = e.target.closest('.wc-altaddr-star');
            if (star) {
                const i = Number(star.dataset.idx);
                if (Number.isFinite(i)) setPrimaryAltAddr(i);
                return;
            }
            const rm = e.target.closest('.wc-altaddr-rm');
            if (!rm) return;
            const idx = Number(rm.dataset.idx);
            if (Number.isFinite(idx)) {
                modalAltAddresses.splice(idx, 1);
                renderAltAddresses();
            }
        });
    }

    // ─── Pancake fallback (kho KH không có → tìm hội thoại Pancake) ─────
    // Mọi page user có token. Gom theo fbId, ưu tiên INBOX + có SĐT. Cho phép
    // "Thêm vào kho" → upsert/create vào web2_customers (warehouse).
    let _pancakeRows = [];
    let _pancakeSeq = 0;

    function hidePancakeResults() {
        const sec = $('#wcPancakeResults');
        if (sec) sec.hidden = true;
        _pancakeRows = [];
    }

    function _getPageIds() {
        const set = new Set();
        try {
            const accs = JSON.parse(localStorage.getItem('pancake_all_accounts') || '{}');
            for (const v of Object.values(accs)) {
                const pages = Array.isArray(v?.pages) ? v.pages : [];
                for (const p of pages) {
                    const pid = p?.id || p?.page_id || p?.pageId;
                    if (pid) set.add(String(pid));
                }
            }
        } catch {
            /* tolerate */
        }
        const pat = window.Web2Chat?.getAllPageAccessTokens?.() || {};
        for (const k of Object.keys(pat)) set.add(String(k));
        return [...set].filter(Boolean);
    }

    async function _searchPancake(query) {
        const q = String(query || '').trim();
        if (!q || !window.Web2Chat?.searchConversations) return [];
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* tolerate — vẫn thử với token hiện có */
            }
        }
        const pageIds = _getPageIds();
        if (!pageIds.length) return [];
        const settled = await Promise.allSettled(
            pageIds.map((pid) => window.Web2Chat.searchConversations(pid, q))
        );
        const byFbId = new Map();
        for (let i = 0; i < settled.length; i++) {
            const r = settled[i];
            if (r.status !== 'fulfilled' || !r.value?.ok) continue;
            for (const c of r.value.conversations || []) {
                const cust = c.customers?.[0] || c.from || {};
                const fbId = String(cust.fb_id || cust.id || c.from_customer_id || '');
                if (!fbId) continue;
                const isInbox = (c.type || '').toUpperCase() === 'INBOX';
                const phone = cust.phone || cust.phone_number || '';
                const cand = {
                    fbId,
                    pageId: String(c.page_id || c.fb_page_id || pageIds[i] || ''),
                    name: cust.name || cust.full_name || c.name || '',
                    phone,
                    avatarUrl: c.from?.avatar_url || cust.avatar_url || '',
                    isInbox,
                };
                const cur = byFbId.get(fbId);
                if (
                    !cur ||
                    (cand.isInbox && !cur.isInbox) ||
                    (cand.isInbox === cur.isInbox && cand.phone && !cur.phone)
                ) {
                    byFbId.set(fbId, cand);
                }
            }
        }
        return [...byFbId.values()]
            .sort(
                (a, b) =>
                    Number(b.isInbox) - Number(a.isInbox) || (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
            )
            .slice(0, 12);
    }

    function renderPancakeCards() {
        const list = $('#wcPancakeList');
        if (!list) return;
        if (!_pancakeRows.length) {
            list.innerHTML = '<div class="wc-pancake-empty">Không tìm thấy trên Pancake.</div>';
            return;
        }
        list.innerHTML = _pancakeRows
            .map((c, i) => {
                const ph = c.phone ? normPhone(c.phone) || esc(c.phone) : '';
                return `
                <div class="wc-pancake-card" data-idx="${i}">
                    <div class="wc-pancake-avatar">${
                        c.avatarUrl
                            ? `<img src="${esc(c.avatarUrl)}" alt="" loading="lazy" />`
                            : '<i data-lucide="user"></i>'
                    }</div>
                    <div class="wc-pancake-meta">
                        <div class="wc-pancake-name">${esc(c.name) || '(không tên)'}</div>
                        <div class="wc-pancake-sub">
                            ${ph ? `<span class="wc-phone">${ph}</span>` : '<span class="wc-muted">chưa có SĐT</span>'}
                            ${c.isInbox ? '<span class="wc-pancake-badge">💬 Nhắn được</span>' : ''}
                            <span class="wc-pancake-page" title="Page ${esc(c.pageId)}">page …${esc(String(c.pageId).slice(-5))}</span>
                        </div>
                    </div>
                    <button type="button" class="wc-btn wc-btn-primary wc-pancake-add" data-idx="${i}">
                        <i data-lucide="user-plus"></i> Thêm vào kho
                    </button>
                </div>`;
            })
            .join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // 3 TẦNG (user 2026-06-09): Kho KH (tier1, đã chạy ở load()) → web2_live_comments
    // DB (tier2) → live fetch (tier3: server poll livestream + browser search hội
    // thoại Pancake). Mọi tầng TỰ ĐỘNG import non-destructive (server lo merge SĐT/
    // địa chỉ phụ). Tìm thấy → reload kho, KH hiện ngay với badge nguồn.
    async function runPancakeFallback(query) {
        const sec = $('#wcPancakeResults');
        if (!sec) return;
        const seq = ++_pancakeSeq;
        $('#wcPancakeQuery').textContent = `“${query}”`;
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang tìm trong dữ liệu Pancake (livestream)…</div>';
        sec.hidden = false;
        _pancakeRows = [];

        const finishImported = (n, tierLabel) => {
            if (seq !== _pancakeSeq) return;
            notify(`Đã tự thêm ${n} KH vào kho (${tierLabel})`, 'success');
            $('#wcPancakeList').innerHTML =
                `<div class="wc-pancake-empty">✓ Tìm thấy & tự thêm ${n} KH từ ${tierLabel}. Đang tải lại…</div>`;
            load(); // KH mới khớp từ khoá → hiện trong kho, section tự ẩn (total>0)
        };

        // ── Tier 2: web2_live_comments (DB đã sync ~30s) ──
        try {
            const r2 = await window.CustomersApi.lookupDeep(query, { live: false });
            if (seq !== _pancakeSeq) return;
            if (r2?.success && r2.imported?.length) {
                return finishImported(r2.imported.length, 'comment livestream');
            }
        } catch {
            /* tolerate — sang tier 3 */
        }

        // ── Tier 3a: live fetch — server poll livestream ĐANG chạy ──
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang fetch livestream đang chạy…</div>';
        try {
            const r3 = await window.CustomersApi.lookupDeep(query, { live: true });
            if (seq !== _pancakeSeq) return;
            if (r3?.success && r3.imported?.length) {
                return finishImported(r3.imported.length, 'livestream đang chạy');
            }
        } catch {
            /* tolerate — sang tier 3b */
        }

        // ── Tier 3b: live fetch — search hội thoại Pancake qua browser (rộng nhất) ──
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đang tìm hội thoại Pancake…</div>';
        let rows = [];
        try {
            rows = await _searchPancake(query);
        } catch {
            rows = [];
        }
        if (seq !== _pancakeSeq) return;
        if (!rows.length) {
            $('#wcPancakeList').innerHTML =
                '<div class="wc-pancake-empty">Không tìm thấy trong Kho KH lẫn Pancake.</div>';
            return;
        }
        // Auto-import tất cả kết quả hội thoại (non-destructive).
        let added = 0;
        for (const c of rows) {
            if (await _importPancakeConv(c)) added++;
        }
        if (seq !== _pancakeSeq) return;
        if (added) return finishImported(added, 'hội thoại Pancake');
        $('#wcPancakeList').innerHTML =
            '<div class="wc-pancake-empty">Đã tìm thấy nhưng không thêm được KH nào.</div>';
    }

    // Import 1 hội thoại Pancake (tier 3b) vào kho — non-destructive qua upsert/create.
    async function _importPancakeConv(c) {
        const phone = normPhone(c.phone);
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        try {
            let res;
            if (phone) {
                res = await window.CustomersApi.upsert({
                    phone,
                    name: c.name || undefined,
                    fbId: c.fbId || undefined,
                    source: 'pancake',
                });
            } else {
                res = await window.CustomersApi.create({
                    name: c.name || 'Khách FB',
                    fbId: c.fbId || undefined,
                    fbPageId: c.pageId || undefined,
                    source: 'pancake',
                    userId: actor.userId,
                    userName: actor.userName,
                });
            }
            return res && res.success !== false;
        } catch {
            return false;
        }
    }

    async function addPancakeToKho(idx) {
        const c = _pancakeRows[idx];
        if (!c) return;
        const actor = window.Web2UserInfo?.get?.('web2/customers') || {};
        const phone = normPhone(c.phone);
        try {
            let res;
            if (phone) {
                res = await window.CustomersApi.upsert({
                    phone,
                    name: c.name || undefined,
                    fbId: c.fbId || undefined,
                    source: 'pancake',
                });
            } else {
                // KH FB-only (chưa có SĐT) → tạo với fb identity.
                res = await window.CustomersApi.create({
                    name: c.name || 'Khách FB',
                    fbId: c.fbId || undefined,
                    fbPageId: c.pageId || undefined,
                    source: 'pancake',
                    userId: actor.userId,
                    userName: actor.userName,
                });
            }
            if (res && res.success === false) throw new Error(res.error || 'Thêm thất bại');
            notify('Đã thêm KH vào kho', 'success');
            hidePancakeResults();
            // Reload kho — KH mới sẽ khớp từ khoá đang tìm.
            load();
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
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
