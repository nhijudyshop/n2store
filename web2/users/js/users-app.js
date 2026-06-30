// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Web 2.0 user management page.

(function () {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${WORKER}/api/web2-users`;

    const MIN_PWD_LEN = 6; // độ dài mật khẩu tối thiểu (đồng bộ với backend validatePassword)

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
        pwdUser: null, // user đang đổi mật khẩu (modal riêng)
        permsUser: null,
        permsDraft: null, // { [slug]: [actions] }
        filters: { search: '', includeInactive: false },
    };
    // Expose FULL dataset cho widget AI (Web2AiPageRegistry) — không chỉ DOM phân trang.
    window.Web2UsersApp = { STATE };

    // ---------- helpers ----------
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtTs(ts) {
        if (!ts) return '—';
        const d = new Date(typeof ts === 'number' ? ts : String(ts));
        if (isNaN(d.getTime())) return '—';
        const TZ = { timeZone: 'Asia/Ho_Chi_Minh' };
        return (
            d.toLocaleDateString('vi-VN', TZ) +
            ' ' +
            d.toLocaleTimeString('vi-VN', { ...TZ, hour: '2-digit', minute: '2-digit' })
        );
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    // Avatar DiceBear cho 1 user — nguồn URL 1 chỗ qua Web2UserProfile (auto-load qua
    // sidebar). User chưa đặt avatar → sinh avatar mặc định từ username (đồng nhất mọi
    // trang). Trả '' nếu module chưa sẵn sàng (cell sẽ rỗng, không vỡ layout).
    function userAvatarUrl(u) {
        const up = window.Web2UserProfile;
        if (!up) return '';
        // Nguồn 1 chỗ: avatarUrlFor (custom nếu đặt, không thì mặc định từ username).
        if (up.avatarUrlFor) return up.avatarUrlFor(u) || '';
        if (!up.avatarUrl) return '';
        return (
            (u.avatar && up.avatarUrl(u.avatar)) ||
            up.avatarUrl({ style: 'lorelei', seed: u.username || 'user', bg: 'transparent' }) ||
            ''
        );
    }
    // Token cho các route admin (create/update/delete/password/permissions).
    // Web2Auth lưu token ở localStorage 'web2_auth'; fallback session JSON cũ.
    function authToken() {
        try {
            const t = window.Web2Auth?.getStored?.()?.token;
            if (t) return t;
            const raw = localStorage.getItem('web2_users_session');
            if (raw) return JSON.parse(raw)?.token || '';
        } catch (_) {}
        return '';
    }

    async function api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', 'x-web2-token': authToken() },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(`${API}${path}`, opts);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) {
            if (r.status === 401 || r.status === 403) {
                throw new Error(data?.error || 'Cần đăng nhập admin');
            }
            throw new Error(data?.error || `HTTP ${r.status}`);
        }
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
                // Avatar: chỉ render <img> khi có URL — src="" rỗng sẽ trỏ về URL trang
                // hiện tại (1 GET rác/row + ảnh vỡ). Thiếu URL → placeholder span.
                const avatarSrc = userAvatarUrl(u);
                const avatarHtml = avatarSrc
                    ? `<img class="u-avatar" src="${escapeHtml(avatarSrc)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
                    : `<span class="u-avatar" aria-hidden="true"></span>`;
                return `<tr class="${inactiveCls}" data-user-id="${u.id}">
                    <td class="u-col-stt">${i + 1}</td>
                    <td>
                        <div class="u-user-cell">
                            ${avatarHtml}
                            <strong>${escapeHtml(u.username)}</strong>
                        </div>
                    </td>
                    <td class="u-col-pwd">${renderPasswordCell(u)}</td>
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
                        <button class="u-icon-btn" type="button" title="Phân công KPI (khoảng STT đơn theo chiến dịch)" data-act="kpi" data-id="${u.id}">
                            <i data-lucide="trophy"></i>
                        </button>
                        <button class="u-icon-btn" type="button" title="Lịch sử thao tác" data-act="history" data-id="${u.id}">
                            <i data-lucide="history"></i>
                        </button>
                        ${
                            u.isActive
                                ? `<button class="u-icon-btn u-icon-btn-danger" type="button" title="Vô hiệu" data-act="delete" data-id="${u.id}">
                            <i data-lucide="trash-2"></i>
                        </button>`
                                : `<button class="u-icon-btn" type="button" title="Khôi phục (kích hoạt lại)" data-act="restore" data-id="${u.id}">
                            <i data-lucide="rotate-ccw"></i>
                        </button>
                        <button class="u-icon-btn u-icon-btn-danger" type="button" title="Xoá vĩnh viễn (đã vô hiệu)" data-act="purge" data-id="${u.id}">
                            <i data-lucide="trash"></i>
                        </button>`
                        }
                    </td>
                </tr>`;
            })
            .join('');
        // Search active → "khớp/tổng" để admin không nhầm tổng số user.
        document.getElementById('uCount').textContent = search
            ? `${rows.length}/${STATE.users.length} user`
            : `${STATE.users.length} user`;
        tbody.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', () =>
                handleAction(btn.dataset.act, Number(btn.dataset.id))
            );
        });
        // Nút "Xoá hẳn user vô hiệu" chỉ hiện khi có user vô hiệu trong danh sách.
        const purgeAllBtn = document.getElementById('uPurgeAllBtn');
        if (purgeAllBtn) {
            const nInactive = STATE.users.filter((u) => !u.isActive).length;
            purgeAllBtn.hidden = nInactive === 0;
            if (nInactive && purgeAllBtn.lastChild)
                purgeAllBtn.lastChild.textContent = ` Xoá hẳn ${nInactive} user vô hiệu`;
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Ô "Mật khẩu" trên bảng: chỉ admin xem được (backend trả u.passwordPlain).
    // - account admin (role==='admin'): backend KHÔNG trả passwordPlain → khoá 🔒.
    // - mật khẩu cũ chỉ có bcrypt (chưa mã hoá): passwordPlain === '' → gợi ý đổi MK.
    function renderPasswordCell(u) {
        if (u.role === 'admin') {
            return `<span class="u-pwd-locked" title="Không hiển thị mật khẩu quản trị viên"><i data-lucide="lock"></i></span>`;
        }
        if (typeof u.passwordPlain !== 'string') {
            // viewer không phải admin → không có quyền xem
            return `<span class="u-muted">••••••</span>`;
        }
        if (u.passwordPlain === '') {
            // Mật khẩu cũ chỉ lưu bcrypt (1 chiều) → không đọc lại được. Cho nút
            // "Đặt MK" mở modal đổi mật khẩu; sau khi đặt sẽ hiện plaintext ở đây.
            return `<button class="u-icon-btn u-pwd-set" type="button" title="Mật khẩu cũ chỉ lưu dạng mã hoá 1 chiều — không đọc lại được. Bấm để đặt mật khẩu mới (sẽ hiện ở đây)." data-act="pwd" data-id="${u.id}">
                        <i data-lucide="key-round"></i> Đặt MK
                    </button>`;
        }
        return `<span class="u-pwd-wrap">
                    <code class="u-pwd-text">${escapeHtml(u.passwordPlain)}</code>
                    <button class="u-icon-btn u-pwd-copy" type="button" title="Sao chép mật khẩu" data-act="copypwd" data-id="${u.id}">
                        <i data-lucide="copy"></i>
                    </button>
                </span>`;
    }

    async function copyUserPassword(user) {
        const pwd = user?.passwordPlain || '';
        if (!pwd) return;
        try {
            await navigator.clipboard.writeText(pwd);
            notify(`Đã sao chép mật khẩu của ${user.username}`, 'success');
        } catch (e) {
            notify('Không sao chép được — hãy bôi đen để copy thủ công', 'warning');
        }
    }

    function handleAction(act, id) {
        const user = STATE.users.find((u) => u.id === id);
        if (!user) return;
        if (act === 'edit') openUserModal(user);
        else if (act === 'pwd') openPasswordModal(user);
        else if (act === 'perms') openPermsModal(user);
        else if (act === 'kpi') openKpiAssignments(user);
        else if (act === 'history') openUserHistory(user);
        else if (act === 'delete') deactivateUser(user);
        else if (act === 'restore') restoreUser(user);
        else if (act === 'purge') purgeUser(user);
        else if (act === 'copypwd') copyUserPassword(user);
    }

    // Lịch sử thao tác per-tài khoản — module shared auto-load qua sidebar.
    function openUserHistory(user) {
        window.Web2AuditLog?.openRecord?.({
            entity: 'web2-user',
            entityId: user.id,
            title: 'Lịch sử tài khoản: ' + (user.displayName || user.username || user.id),
        });
    }

    // Mở page Phân công KPI ở tab mới (Sprint 2). User pick campaign rồi
    // chia khoảng STT — page tự load existing ranges qua /api/campaigns/employee-ranges.
    function openKpiAssignments(user) {
        const url = '../kpi/assignments.html';
        window.open(url, '_blank');
    }

    // ---------- gợi ý mật khẩu: 1 từ tiếng Anh 9 chữ cái ----------
    // Danh sách từ thường gặp, dễ nhớ, dễ đọc — lọc đúng 9 ký tự ở runtime
    // để chống lỗi gõ nhầm độ dài.
    const PASS_WORDS = [
        'adventure',
        'beautiful',
        'chocolate',
        'wonderful',
        'knowledge',
        'breakfast',
        'celebrate',
        'dangerous',
        'education',
        'furniture',
        'gardening',
        'happiness',
        'important',
        'jellyfish',
        'lightning',
        'marketing',
        'necessary',
        'operation',
        'paragraph',
        'sometimes',
        'telephone',
        'vegetable',
        'waterfall',
        'xylophone',
        'yesterday',
        'butterfly',
        'cardboard',
        'challenge',
        'character',
        'chemistry',
        'community',
        'companion',
        'corporate',
        'dimension',
        'direction',
        'discovery',
        'elephants',
        'emergency',
        'equipment',
        'excellent',
        'existence',
        'favourite',
        'framework',
        'freshness',
        'guarantee',
        'handshake',
        'highlight',
        'household',
        'hurricane',
        'influence',
        'insurance',
        'invention',
        'landscape',
        'lifestyle',
        'limestone',
        'magnitude',
        'mechanism',
        'microwave',
        'milkshake',
        'moonlight',
        'mountains',
        'newspaper',
        'nightfall',
        'nutrition',
        'objective',
        'offspring',
        'orchestra',
        'packaging',
        'pineapple',
        'pollution',
        'porcelain',
        'portfolio',
        'president',
        'principle',
        'promotion',
        'quotation',
        'recognize',
        'rectangle',
        'represent',
        'resources',
        'riverside',
        'saxophone',
        'september',
        'signature',
        'snowflake',
        'spaceship',
        'spotlight',
        'staircase',
        'statement',
        'structure',
        'substance',
        'sunflower',
        'sweetness',
        'synthetic',
        'territory',
        'therefore',
        'thumbnail',
        'timetable',
        'tradition',
        'treasures',
        'treatment',
        'triangles',
        'universal',
        'variation',
        'viewpoint',
        'volunteer',
        'warehouse',
        'whirlwind',
        'wholesome',
        'wondering',
        'yardstick',
    ].filter((w) => w.length === 9);

    function genPassword() {
        const list = PASS_WORDS.length ? PASS_WORDS : ['wonderful'];
        return list[Math.floor(Math.random() * list.length)];
    }

    // Sinh mật khẩu vào ô input + để type=text cho admin đọc/copy đưa NV.
    function fillGenPassword(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        const pwd = genPassword();
        el.type = 'text';
        el.value = pwd;
        el.focus();
        el.select?.();
        notify('Mật khẩu gợi ý: ' + pwd, 'info');
    }

    // ---------- user modal (create + edit) ----------
    function openUserModal(user) {
        STATE.editingUser = user || null;
        document.getElementById('uUserModalTitle').textContent = user
            ? 'Sửa người dùng'
            : 'Tạo người dùng';
        // Mật khẩu: hiện ô ở CẢ create lẫn edit. Tạo = bắt buộc; Sửa = tùy chọn
        // (để trống → giữ nguyên). Trước đây ẩn khi edit nhưng dính bug CSS
        // `.u-field{display:flex}` đè UA `[hidden]{display:none}` → ô vẫn hiện mà
        // KHÔNG lưu (gốc bug "đổi mật khẩu ở đây không được" 2026-06-24).
        document.getElementById('uPasswordField').hidden = false;
        const pwLabel = document.getElementById('uPasswordLabel');
        const pwHint = document.getElementById('uPasswordHint');
        if (pwLabel) pwLabel.innerHTML = user ? 'Đổi mật khẩu' : 'Mật khẩu <em>*</em>';
        if (pwHint)
            pwHint.textContent = user
                ? `Để trống nếu giữ mật khẩu hiện tại. Đặt mới: tối thiểu ${MIN_PWD_LEN} ký tự (sẽ hiện ở cột Mật khẩu).`
                : `Tối thiểu ${MIN_PWD_LEN} ký tự. Bấm "Tạo" để sinh 1 từ tiếng Anh dễ nhớ.`;
        document.getElementById('uFormUsername').value = user?.username || '';
        document.getElementById('uFormUsername').disabled = !!user; // không cho đổi username
        document.getElementById('uFormPassword').value = '';
        document.getElementById('uFormPassword').type = 'text';
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
        const pwdInput = document.getElementById('uFormPassword').value;
        if (!isEdit) {
            body.password = pwdInput;
        }
        if (!body.username || !body.displayName) {
            notify('Username + Họ tên bắt buộc', 'warning');
            return;
        }
        if (!isEdit && (!body.password || body.password.length < MIN_PWD_LEN)) {
            notify(`Mật khẩu phải ≥ ${MIN_PWD_LEN} ký tự`, 'warning');
            return;
        }
        // Edit: mật khẩu tùy chọn — nếu admin nhập thì phải đủ độ dài tối thiểu.
        const pwdToChange = isEdit && pwdInput ? pwdInput : '';
        if (isEdit && pwdInput && pwdInput.length < MIN_PWD_LEN) {
            notify(`Mật khẩu mới phải ≥ ${MIN_PWD_LEN} ký tự (để trống nếu không đổi)`, 'warning');
            return;
        }
        // Không cho tự hạ quyền admin của CHÍNH MÌNH → tránh tự khoá quyền quản trị
        // (token còn sống nhưng request kế 403). Hạ quyền user khác thì OK.
        if (
            isEdit &&
            Number(STATE.editingUser.id) === Number(_currentSessionUserId()) &&
            STATE.editingUser.role === 'admin' &&
            body.role !== 'admin'
        ) {
            notify('Không thể tự hạ quyền admin của chính bạn.', 'error');
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
                if (pwdToChange) {
                    // Đổi mật khẩu ngay trong modal Sửa (endpoint riêng /password).
                    const user = STATE.editingUser;
                    const isSelf = Number(user.id) === Number(_currentSessionUserId());
                    await api('POST', `/${user.id}/password`, { password: pwdToChange });
                    if (isSelf) {
                        // Backend xoá hết session của user này → re-login ngay để giữ phiên.
                        _selfPwdChangeAt = Date.now();
                        await _reauthSelf(user.username, pwdToChange);
                    }
                    notify(`Đã cập nhật ${body.username} + đổi mật khẩu`, 'success');
                } else {
                    notify(`Đã cập nhật ${body.username}`, 'success');
                }
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
    // Dùng slot RIÊNG (STATE.pwdUser), KHÔNG share STATE.editingUser với modal Sửa —
    // tránh cross-contamination khi mở 2 modal liên tiếp (đổi MK nhầm user).
    function openPasswordModal(user) {
        STATE.pwdUser = user;
        document.getElementById('uPwdUsername').textContent = user.username;
        document.getElementById('uPwdNew').value = '';
        document.getElementById('uPasswordModal').hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => document.getElementById('uPwdNew')?.focus(), 30);
    }

    async function confirmPasswordSave() {
        const btn = document.getElementById('uPwdSaveBtn');
        if (btn.disabled) return;
        const user = STATE.pwdUser;
        if (!user) return;
        const pwd = document.getElementById('uPwdNew').value;
        if (!pwd || pwd.length < MIN_PWD_LEN) {
            notify(`Mật khẩu phải ≥ ${MIN_PWD_LEN} ký tự`, 'warning');
            return;
        }
        const isSelf = Number(user.id) === Number(_currentSessionUserId());
        btn.disabled = true;
        try {
            await api('POST', `/${user.id}/password`, { password: pwd });
            if (isSelf) {
                // Backend xoá HẾT session của user này (kể cả token đang dùng) →
                // request kế sẽ 401 và admin bị "đá" ra login → cảm giác "đổi không
                // ăn". Re-login NGAY bằng mật khẩu mới để giữ phiên sống + xác nhận
                // mật khẩu mới hoạt động. (Gốc bug "đổi mật khẩu admin lưu nhưng không đổi".)
                _selfPwdChangeAt = Date.now();
                const ok = await _reauthSelf(user.username, pwd);
                notify(
                    ok
                        ? 'Đã đổi mật khẩu của bạn. Phiên hiện tại vẫn đăng nhập; lần sau dùng mật khẩu mới.'
                        : 'Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.',
                    'success'
                );
            } else {
                notify(`Đã đổi mật khẩu cho ${user.username}`, 'success');
            }
            document.getElementById('uPasswordModal').hidden = true;
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi đổi mật khẩu', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // Re-login chính mình bằng mật khẩu mới → lấy token mới + cập nhật localStorage,
    // tránh bị logout sau khi tự đổi mật khẩu. Trả true nếu thành công.
    async function _reauthSelf(username, password) {
        try {
            const r = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const j = await r.json().catch(() => ({}));
            if (!j || !j.success || !j.token) return false;
            if (window.Web2Auth?.storeLogin) {
                window.Web2Auth.storeLogin({
                    token: j.token,
                    expiresAt: j.expiresAt,
                    user: j.user,
                });
            } else {
                const raw = JSON.parse(localStorage.getItem('web2_auth') || '{}');
                localStorage.setItem(
                    'web2_auth',
                    JSON.stringify({
                        ...raw,
                        token: j.token,
                        expiresAt: j.expiresAt,
                        user: j.user,
                    })
                );
            }
            return true;
        } catch (_) {
            return false; // re-login lỗi → SSE handler sẽ reload về login như cũ
        }
    }

    // ---------- delete (deactivate) ----------
    // UI-first: mark user disabled NGAY, DELETE background. Rollback nếu lỗi.
    async function deactivateUser(user) {
        // Không cho tự vô hiệu chính mình → tránh tự khoá tài khoản đang đăng nhập
        // (backend chỉ chặn admin CUỐI; còn admin khác thì vẫn cho self-deactivate).
        if (Number(user.id) === Number(_currentSessionUserId())) {
            notify('Không thể vô hiệu chính tài khoản bạn đang đăng nhập.', 'error');
            return;
        }
        if (
            !(await Popup.danger(`Vô hiệu user "${user.username}"? Các session sẽ bị logout.`, {
                okText: 'Vô hiệu',
            }))
        )
            return;
        const prevActive = user.isActive;
        if (window.Web2Optimistic?.run) {
            Web2Optimistic.run({
                snapshot: () => prevActive,
                apply: () => {
                    user.isActive = false;
                    renderList();
                },
                run: () => api('DELETE', `/${user.id}`),
                onSuccess: async () => {
                    await loadAll();
                    renderList();
                },
                rollback: (prev) => {
                    user.isActive = prev;
                    renderList();
                },
                successMsg: `Đã vô hiệu ${user.username}`,
                errLabel: `vô hiệu ${user.username}`,
            });
        } else {
            (async () => {
                try {
                    await api('DELETE', `/${user.id}`);
                    notify(`Đã vô hiệu ${user.username}`, 'success');
                    await loadAll();
                    renderList();
                } catch (e) {
                    notify(e.message || 'Lỗi vô hiệu', 'error');
                }
            })();
        }
    }

    // ---------- restore (kích hoạt lại user đã vô hiệu) ----------
    async function restoreUser(user) {
        try {
            await api('PATCH', `/${user.id}`, { isActive: true });
            notify(`Đã khôi phục ${user.username}`, 'success');
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi khôi phục', 'error');
        }
    }

    // ---------- purge (xoá VĨNH VIỄN user đã vô hiệu) ----------
    async function purgeUser(user) {
        const ok = await Popup.danger(
            `Xoá VĨNH VIỄN user "${user.username}"? Không thể hoàn tác — toàn bộ phiên & dữ liệu định danh sẽ bị xoá khỏi DB.`,
            { okText: 'Xoá vĩnh viễn' }
        );
        if (!ok) return;
        try {
            await api('DELETE', `/${user.id}/purge`);
            notify(`Đã xoá vĩnh viễn ${user.username}`, 'success');
            await loadAll();
            renderList();
        } catch (e) {
            notify(e.message || 'Lỗi xoá vĩnh viễn', 'error');
        }
    }

    // Bulk purge: xoá vĩnh viễn TẤT CẢ user đang vô hiệu (đang hiển thị).
    async function purgeAllInactive() {
        const inactive = STATE.users.filter((u) => !u.isActive);
        if (!inactive.length) {
            notify('Không có user vô hiệu nào để xoá', 'info');
            return;
        }
        const ok = await Popup.danger(
            `Xoá VĨNH VIỄN toàn bộ ${inactive.length} user đã vô hiệu? Không thể hoàn tác.`,
            { okText: `Xoá ${inactive.length} user` }
        );
        if (!ok) return;
        let done = 0;
        const fails = [];
        for (const u of inactive) {
            try {
                await api('DELETE', `/${u.id}/purge`);
                done++;
            } catch (e) {
                fails.push(u.username);
            }
        }
        await loadAll();
        renderList();
        if (fails.length) {
            notify(`Đã xoá ${done}, lỗi ${fails.length}: ${fails.join(', ')}`, 'warning');
        } else {
            notify(`Đã xoá vĩnh viễn ${done} user`, 'success');
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
        if (!user) return;
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
        document.getElementById('uPurgeAllBtn')?.addEventListener('click', purgeAllInactive);
        document.getElementById('uUserSaveBtn').addEventListener('click', confirmUserSave);
        document.getElementById('uPwdSaveBtn').addEventListener('click', confirmPasswordSave);
        document
            .getElementById('uFormPassGen')
            ?.addEventListener('click', () => fillGenPassword('uFormPassword'));
        document
            .getElementById('uPwdGen')
            ?.addEventListener('click', () => fillGenPassword('uPwdNew'));
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
        // Skeleton trên lần tải đầu (tbody rỗng) trong khi chờ loadAll() — bị
        // renderList() ghi đè innerHTML sau khi fetch xong. Match 9 cột thead.
        const _tb = document.getElementById('uTableBody');
        if (window.Web2Skeleton && _tb && !_tb.children.length) {
            window.Web2Skeleton.rows(_tb, { rows: 8, cols: 9 });
        }
        await loadAll();
        renderList();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: refresh khi user khác create/update/delete user qua trang khác.
    // PHASE A5: nếu action ảnh hưởng QUYỀN của session current user
    // (update-permissions hoặc role change cho chính mình) → toast cảnh báo
    // + force-reload sau 3s để áp dụng quyền mới.
    let _sseUnsubscribe = null;
    let _sseReloadTimer = null;
    let _selfPwdChangeAt = 0; // ta vừa tự đổi MK (re-auth xong) → SSE bỏ qua auto-reload
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) return;
        if (_sseUnsubscribe) return;
        _sseUnsubscribe = window.Web2SSE.subscribe('web2:users', (msg) => {
            const action = msg.data?.action;
            const targetId = msg.data?.id;

            // PHASE A5: check if event affects current session user's permission
            // → force F5 sau khi cảnh báo.
            const myId = _currentSessionUserId();
            const sensitiveActions = new Set([
                'update-permissions',
                'update',
                'change-password',
                'deactivate',
            ]);
            if (myId && Number(targetId) === Number(myId) && sensitiveActions.has(action)) {
                // CHÍNH TA vừa tự đổi mật khẩu (đã re-auth giữ phiên) → KHÔNG reload,
                // tránh gián đoạn + cảm giác "bị đá ra". Chỉ reload khi NGƯỜI KHÁC đổi.
                if (action === 'change-password' && Date.now() - _selfPwdChangeAt < 8000) {
                    return;
                }
                notify(
                    `⚠️ Quyền/thông tin tài khoản của bạn vừa thay đổi (${action}). Trang sẽ tự reload sau 3s.`,
                    'warning'
                );
                setTimeout(() => window.location.reload(), 3000);
                return;
            }

            // Normal: reload user list — nhưng KHÔNG reload khi đang mở modal
            // (Sửa/Đổi MK/Phân quyền) để tránh loadAll() thay STATE.users làm
            // STATE.editingUser/pwdUser/permsUser trỏ object cũ → lưu nhầm/stale.
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(async () => {
                _sseReloadTimer = null;
                if (document.querySelector('.u-modal:not([hidden])')) return;
                console.log('[users-app-SSE] event:', action, targetId || '');
                await loadAll();
                renderList();
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }, 600);
        });
    }

    function _currentSessionUserId() {
        // Nguồn chuẩn Web 2.0: localStorage 'web2_auth' qua Web2Auth.
        // KHÔNG dùng authManager Web 1.0 — khác id-space web2_users → false-positive.
        try {
            return window.Web2Auth?.getStored?.()?.user?.id || null;
        } catch (_) {}
        return null;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
