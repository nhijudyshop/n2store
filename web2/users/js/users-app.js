// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web 2.0 user management page.

(function () {
    'use strict';

    const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/web2-users`;

    const ROLE_LABELS = {
        admin: 'Admin',
        manager: 'Quản lý',
        staff: 'Nhân viên',
        viewer: 'Chỉ xem',
    };

    const STATE = {
        users: [],
        pages: [],
        actionLabels: {},
        editingUser: null, // null = create mode
        permsUser: null,
        permsDraft: null, // { [slug]: [actions] }
        filters: { search: '', includeInactive: false },
    };

    // ---------- helpers ----------
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtTs(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    async function api(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(`${API}${path}`, opts);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    // ---------- load ----------
    async function loadAll() {
        try {
            const [usersRes, pagesRes] = await Promise.all([
                api(
                    'GET',
                    `/list?limit=200&includeInactive=${STATE.filters.includeInactive ? 1 : 0}`
                ),
                api('GET', '/pages'),
            ]);
            STATE.users = usersRes.users || [];
            STATE.pages = pagesRes.pages || [];
            STATE.actionLabels = pagesRes.actionLabels || {};
        } catch (e) {
            console.warn('[web2-users] load fail:', e.message);
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
    }

    // ---------- render list ----------
    function renderList() {
        const tbody = document.getElementById('uTableBody');
        const empty = document.getElementById('uEmpty');
        const search = (STATE.filters.search || '').trim().toLowerCase();
        let rows = STATE.users;
        if (search) {
            rows = rows.filter((u) => {
                const blob = [u.username, u.displayName, u.email, u.phone, u.role]
                    .join(' ')
                    .toLowerCase();
                return blob.includes(search);
            });
        }
        if (!rows.length) {
            tbody.innerHTML = '';
            empty.hidden = false;
            document.getElementById('uCount').textContent = '0 user';
            return;
        }
        empty.hidden = true;
        tbody.innerHTML = rows
            .map((u, i) => {
                const inactiveCls = u.isActive ? '' : 'is-inactive';
                const stateBadge = u.isActive
                    ? `<span class="u-badge u-badge-active">Hoạt động</span>`
                    : `<span class="u-badge u-badge-inactive">Đã vô hiệu</span>`;
                const customMark = u.customPermissions
                    ? ` <span class="u-custom-mark" title="Có phân quyền tùy chỉnh">●</span>`
                    : '';
                return `<tr class="${inactiveCls}" data-user-id="${u.id}">
                    <td class="u-col-stt">${i + 1}</td>
                    <td><strong>${escapeHtml(u.username)}</strong></td>
                    <td>${escapeHtml(u.displayName || '—')}</td>
                    <td>
                        ${u.email ? `<div>${escapeHtml(u.email)}</div>` : ''}
                        ${u.phone ? `<div class="u-muted">${escapeHtml(u.phone)}</div>` : ''}
                        ${!u.email && !u.phone ? '<span class="u-muted">—</span>' : ''}
                    </td>
                    <td><span class="u-role-pill u-role-${u.role}">${escapeHtml(ROLE_LABELS[u.role] || u.role)}</span>${customMark}</td>
                    <td>${stateBadge}</td>
                    <td>${escapeHtml(fmtTs(u.lastLoginAt))}</td>
                    <td class="u-col-actions">
                        <button class="u-icon-btn" type="button" title="Sửa thông tin" data-act="edit" data-id="${u.id}">
                            <i data-lucide="pencil"></i>
                        </button>
                        <button class="u-icon-btn" type="button" title="Đổi mật khẩu" data-act="pwd" data-id="${u.id}">
                            <i data-lucide="key"></i>
                        </button>
                        <button class="u-icon-btn" type="button" title="Phân quyền" data-act="perms" data-id="${u.id}">
                            <i data-lucide="shield-check"></i>
                        </button>
                        <button class="u-icon-btn u-icon-btn-danger" type="button" title="${u.isActive ? 'Vô hiệu' : 'Đã vô hiệu'}" data-act="delete" data-id="${u.id}" ${u.isActive ? '' : 'disabled'}>
                            <i data-lucide="trash-2"></i>
                        </button>
                    </td>
                </tr>`;
            })
            .join('');
        document.getElementById('uCount').textContent = `${rows.length} user`;
        tbody.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', () =>
                handleAction(btn.dataset.act, Number(btn.dataset.id))
            );
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function handleAction(act, id) {
        const user = STATE.users.find((u) => u.id === id);
        if (!user) return;
        if (act === 'edit') openUserModal(user);
        else if (act === 'pwd') openPasswordModal(user);
        else if (act === 'perms') openPermsModal(user);
        else if (act === 'delete') deactivateUser(user);
    }

    // ---------- user modal (create + edit) ----------
    function openUserModal(user) {
        STATE.editingUser = user || null;
        document.getElementById('uUserModalTitle').textContent = user
            ? 'Sửa người dùng'
            : 'Tạo người dùng';
        document.getElementById('uPasswordField').hidden = !!user;
        document.getElementById('uFormUsername').value = user?.username || '';
        document.getElementById('uFormUsername').disabled = !!user; // không cho đổi username
        document.getElementById('uFormPassword').value = '';
        document.getElementById('uFormDisplayName').value = user?.displayName || '';
        document.getElementById('uFormEmail').value = user?.email || '';
        document.getElementById('uFormPhone').value = user?.phone || '';
        document.getElementById('uFormRole').value = user?.role || 'staff';
        document.getElementById('uFormNote').value = user?.note || '';
        document.getElementById('uUserModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(
            () => document.getElementById(user ? 'uFormDisplayName' : 'uFormUsername')?.focus(),
            30
        );
    }

    async function confirmUserSave() {
        const btn = document.getElementById('uUserSaveBtn');
        if (btn.disabled) return;
        const body = {
            username: document.getElementById('uFormUsername').value.trim(),
            displayName: document.getElementById('uFormDisplayName').value.trim(),
            email: document.getElementById('uFormEmail').value.trim(),
            phone: document.getElementById('uFormPhone').value.trim(),
            role: document.getElementById('uFormRole').value,
            note: document.getElementById('uFormNote').value.trim(),
        };
        const isEdit = !!STATE.editingUser;
        if (!isEdit) {
            body.password = document.getElementById('uFormPassword').value;
        }
        if (!body.username || !body.displayName) {
            notify('Username + Họ tên bắt buộc', 'warning');
            return;
        }
        if (!isEdit && (!body.password || body.password.length < 6)) {
            notify('Mật khẩu phải ≥ 6 ký tự', 'warning');
            return;
        }
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang lưu…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            if (isEdit) {
                await api('PATCH', `/${STATE.editingUser.id}`, {
                    displayName: body.displayName,
                    email: body.email,
                    phone: body.phone,
                    role: body.role,
                    note: body.note,
                });
                notify(`Đã cập nhật ${body.username}`, 'success');
            } else {
                await api('POST', '/', body);
                notify(`Đã tạo user ${body.username}`, 'success');
            }
            document.getElementById('uUserModal').hidden = true;
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi lưu', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    }

    // ---------- password modal ----------
    function openPasswordModal(user) {
        STATE.editingUser = user;
        document.getElementById('uPwdUsername').textContent = user.username;
        document.getElementById('uPwdNew').value = '';
        document.getElementById('uPasswordModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => document.getElementById('uPwdNew')?.focus(), 30);
    }

    async function confirmPasswordSave() {
        const btn = document.getElementById('uPwdSaveBtn');
        if (btn.disabled) return;
        const user = STATE.editingUser;
        const pwd = document.getElementById('uPwdNew').value;
        if (!pwd || pwd.length < 6) {
            notify('Mật khẩu phải ≥ 6 ký tự', 'warning');
            return;
        }
        btn.disabled = true;
        try {
            await api('POST', `/${user.id}/password`, { password: pwd });
            notify(`Đã đổi mật khẩu cho ${user.username}`, 'success');
            document.getElementById('uPasswordModal').hidden = true;
        } catch (e) {
            notify(e.message || 'Lỗi đổi mật khẩu', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- delete (deactivate) ----------
    async function deactivateUser(user) {
        if (!confirm(`Vô hiệu user "${user.username}"? Các session sẽ bị logout.`)) return;
        try {
            await api('DELETE', `/${user.id}`);
            notify(`Đã vô hiệu ${user.username}`, 'success');
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi vô hiệu', 'error');
        }
    }

    // ---------- permissions modal ----------
    function openPermsModal(user) {
        STATE.permsUser = user;
        // Draft = current effective permissions (deep copy)
        STATE.permsDraft = JSON.parse(JSON.stringify(user.permissions || {}));
        document.getElementById('uPermsUsername').textContent =
            `${user.username} (${ROLE_LABELS[user.role] || user.role})`;
        renderPermsGrid();
        document.getElementById('uPermsModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderPermsGrid() {
        const grid = document.getElementById('uPermsGrid');
        const groups = {};
        for (const p of STATE.pages) {
            const g = p.group || 'Khác';
            if (!groups[g]) groups[g] = [];
            groups[g].push(p);
        }
        const html = Object.entries(groups)
            .map(([group, pages]) => {
                return `<div class="u-perms-group">
                    <h3>${escapeHtml(group)}</h3>
                    ${pages
                        .map((p) => {
                            const granted = new Set(STATE.permsDraft[p.slug] || []);
                            const actionsHtml = p.actions
                                .map((a) => {
                                    const lbl = STATE.actionLabels[a] || a;
                                    const checked = granted.has(a) ? 'checked' : '';
                                    return `<label class="u-perms-action">
                                        <input type="checkbox" data-slug="${p.slug}" data-action="${a}" ${checked} />
                                        <span>${escapeHtml(lbl)}</span>
                                    </label>`;
                                })
                                .join('');
                            return `<div class="u-perms-page">
                                <div class="u-perms-page-head">
                                    <strong>${escapeHtml(p.label)}</strong>
                                    <code>${escapeHtml(p.slug)}</code>
                                </div>
                                <div class="u-perms-actions">${actionsHtml}</div>
                            </div>`;
                        })
                        .join('')}
                </div>`;
            })
            .join('');
        grid.innerHTML = html;
        grid.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const slug = cb.dataset.slug;
                const action = cb.dataset.action;
                const set = new Set(STATE.permsDraft[slug] || []);
                if (cb.checked) set.add(action);
                else set.delete(action);
                STATE.permsDraft[slug] = Array.from(set);
            });
        });
    }

    async function confirmPermsSave() {
        const btn = document.getElementById('uPermsSaveBtn');
        if (btn.disabled) return;
        const user = STATE.permsUser;
        btn.disabled = true;
        try {
            await api('PUT', `/${user.id}/permissions`, { permissions: STATE.permsDraft });
            notify(`Đã lưu phân quyền cho ${user.username}`, 'success');
            document.getElementById('uPermsModal').hidden = true;
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi lưu phân quyền', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    async function resetPermsToRoleDefaults() {
        const user = STATE.permsUser;
        try {
            const r = await api('GET', `/role-defaults/${user.role}`);
            STATE.permsDraft = r.permissions || {};
            renderPermsGrid();
            notify('Đã reset về mặc định của vai trò', 'info');
        } catch (e) {
            notify('Không tải được defaults: ' + e.message, 'error');
        }
    }

    function bulkCheck(checked) {
        document.querySelectorAll('#uPermsGrid input[type="checkbox"]').forEach((cb) => {
            cb.checked = checked;
            cb.dispatchEvent(new Event('change'));
        });
    }

    // ---------- wire ----------
    function wireUi() {
        document.getElementById('uCreateBtn').addEventListener('click', () => openUserModal(null));
        document.getElementById('uRefreshBtn').addEventListener('click', async () => {
            await loadAll();
            renderList();
            notify('Đã tải lại', 'success');
        });
        document.getElementById('uSearch').addEventListener('input', (e) => {
            STATE.filters.search = e.target.value;
            renderList();
        });
        document.getElementById('uShowInactive').addEventListener('change', async (e) => {
            STATE.filters.includeInactive = e.target.checked;
            await loadAll();
            renderList();
        });
        document.getElementById('uUserSaveBtn').addEventListener('click', confirmUserSave);
        document.getElementById('uPwdSaveBtn').addEventListener('click', confirmPasswordSave);
        document.getElementById('uPermsSaveBtn').addEventListener('click', confirmPermsSave);
        document
            .getElementById('uPermsResetDefaults')
            .addEventListener('click', resetPermsToRoleDefaults);
        document.getElementById('uPermsCheckAll').addEventListener('click', () => bulkCheck(true));
        document
            .getElementById('uPermsUncheckAll')
            .addEventListener('click', () => bulkCheck(false));
        document.querySelectorAll('[data-u-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.u-modal')?.setAttribute('hidden', '');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.u-modal:not([hidden])')
                    .forEach((m) => (m.hidden = true));
            }
        });
    }

    async function init() {
        wireUi();
        await loadAll();
        renderList();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: refresh khi user khác create/update/delete user qua trang khác
    let _sseUnsubscribe = null;
    let _sseReloadTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) return;
        if (_sseUnsubscribe) return;
        _sseUnsubscribe = window.Web2SSE.subscribe('web2:users', (msg) => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(async () => {
                _sseReloadTimer = null;
                console.log('[users-app-SSE] event:', msg.data?.action, msg.data?.id || '');
                await loadAll();
                renderList();
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }, 600);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
