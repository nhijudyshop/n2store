// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo single-source page app.
// =====================================================================
// Trang Zalo (NGUỒN DUY NHẤT). 4 tab: Tài khoản / Hội thoại / Tra cứu / ZNS.
// personal (zca-js): đăng nhập QR, chat 2 chiều, xem thông tin người dùng/khác.
// oa (official): kết nối OA, ZNS, template, log.
// Realtime SSE: web2:zalo:messages / :accounts / :conv:<id>. Giờ GMT+7.
// =====================================================================

(function () {
    'use strict';

    const TZ = 'Asia/Ho_Chi_Minh';
    const $ = (s) => document.querySelector(s);
    const esc = (v) =>
        String(v == null ? '' : v).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const notify = (m, t) => window.notificationManager?.show?.(m, t || 'info');
    const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

    // ── Avatar: <img> với fallback chữ cái đầu khi ảnh Zalo lỗi (CDN chặn / hết hạn).
    //    referrerpolicy=no-referrer cần cho zdn.vn / zaloapp.com.
    window.__wzAvErr = function (img) {
        try {
            const span = document.createElement('span');
            span.className = img.className;
            const st = img.getAttribute('style');
            if (st) span.setAttribute('style', st);
            span.textContent = img.getAttribute('data-init') || '?';
            img.replaceWith(span);
        } catch {}
    };
    function avatarHtml(url, name, cls, style) {
        const init = esc(initial(name));
        const st = style ? ` style="${style}"` : '';
        if (url)
            return `<img class="${cls}"${st} src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-init="${init}" onerror="window.__wzAvErr(this)">`;
        return `<span class="${cls}"${st}>${init}</span>`;
    }

    // URL ảnh trần (legacy: tin cũ lưu URL ảnh dưới dạng text → vẫn render ảnh).
    const IMG_URL_RE = /^https?:\/\/\S+\.(?:jpe?g|png|gif|webp|bmp|heic)(?:\?\S*)?$/i;
    const ZDN_IMG_RE = /^https?:\/\/[^\s]*\b(?:zdn\.vn|zadn\.vn|zaloapp\.com)\/[^\s]+$/i;
    const URL_RE = /^https?:\/\/\S+$/i;

    // Modal a11y: lưu focus, focus vào field đầu, trả focus khi đóng (Esc/backdrop bound riêng).
    let _lastFocus = null;
    const FOCUSABLE =
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
    function showModal(sel) {
        _lastFocus = document.activeElement;
        const m = $(sel);
        if (!m) return;
        m.hidden = false;
        // Focus vào field đầu (bỏ qua nút đóng); QR modal không có input → focus nút đóng.
        const first =
            m.querySelector('input,select,textarea,button:not(.wz-modal-close)') ||
            m.querySelector('.wz-modal-close');
        first?.focus();
        // Focus trap: Tab/Shift+Tab xoay vòng trong modal (WCAG 2.1.2 / APG dialog).
        m._trap = (e) => {
            if (e.key !== 'Tab') return;
            const f = m.querySelectorAll(FOCUSABLE);
            if (!f.length) return;
            const a = f[0],
                z = f[f.length - 1];
            if (e.shiftKey && document.activeElement === a) {
                e.preventDefault();
                z.focus();
            } else if (!e.shiftKey && document.activeElement === z) {
                e.preventDefault();
                a.focus();
            }
        };
        m.addEventListener('keydown', m._trap);
    }
    function hideModal(sel) {
        const m = $(sel);
        if (m) {
            m.hidden = true;
            if (m._trap) {
                m.removeEventListener('keydown', m._trap);
                m._trap = null;
            }
        }
        if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
    }
    function setBusy(btn, on) {
        if (!btn) return;
        btn.classList.toggle('is-busy', !!on);
        btn.disabled = !!on;
    }

    function fmtTime(ms) {
        if (!ms) return '';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: TZ,
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
            }).format(new Date(Number(ms)));
        } catch {
            return '';
        }
    }
    const STATUS_LABEL = {
        connected: 'Đã kết nối',
        token_ok: 'Token OK',
        connecting: 'Đang kết nối…',
        qr_pending: 'Chờ quét QR',
        scanned: 'Đã quét — chờ xác nhận',
        disconnected: 'Ngắt kết nối',
        declined: 'Bị từ chối',
        qr_expired: 'QR hết hạn',
        banned: 'Bị khoá',
        error: 'Lỗi',
        offline: 'Offline',
    };

    const state = {
        tab: 'accounts',
        zcaAvailable: true,
        accounts: [],
        conv: {
            list: [],
            total: 0,
            activeId: null,
            activeConv: null,
            messages: [],
            accountKey: '',
            search: '',
        },
        zns: { templates: [], log: [] },
        qr: { key: null, timer: null },
    };
    let _convUnsub = null;
    const _autoSynced = new Set(); // account đã auto seed danh bạ (tránh lặp)

    // ===================================================================
    // TABS
    // ===================================================================
    function switchTab(tab, focusPanel) {
        state.tab = tab;
        document.querySelectorAll('.wz-tab').forEach((b) => {
            const on = b.dataset.tab === tab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        ['accounts', 'chat', 'lookup', 'zns'].forEach((t) => {
            const p = $('#wzPanel' + t[0].toUpperCase() + t.slice(1));
            if (p) p.hidden = t !== tab;
        });
        if (focusPanel) $('#wzPanel' + tab[0].toUpperCase() + tab.slice(1))?.focus();
        if (tab === 'accounts') loadAccounts();
        else if (tab === 'chat') loadConversations();
        else if (tab === 'lookup') fillAccountSelect('#wzLookupAccount');
        else if (tab === 'zns') {
            loadTemplates();
            loadZnsLog();
        }
    }

    // ===================================================================
    // ACCOUNTS
    // ===================================================================
    function skelCards(n) {
        return Array.from({ length: n || 2 })
            .map(
                () => `<div class="wz-skel-card">
                    <div class="wz-skel-row"><div class="wz-skel" style="width:48px;height:48px;border-radius:14px"></div>
                        <div style="flex:1"><div class="wz-skel" style="width:60%;height:14px;margin-bottom:7px"></div><div class="wz-skel" style="width:40%;height:11px"></div></div></div>
                    <div class="wz-skel" style="width:45%;height:12px"></div>
                    <div class="wz-skel" style="width:100%;height:30px;border-radius:9px"></div>
                </div>`
            )
            .join('');
    }

    async function loadAccounts() {
        const grid = $('#wzAccGrid');
        if (!state.accounts.length) grid.innerHTML = skelCards(2);
        try {
            const res = await window.ZaloApi.status();
            state.zcaAvailable = res.zcaAvailable !== false;
            state.accounts = res.accounts || [];
            renderAccounts();
            renderStatusStrip(res);
        } catch (e) {
            // Backend chưa deploy / lỗi mạng → vẫn cho onboarding (2 lựa chọn) thay vì màn lỗi cụt
            state.accounts = [];
            renderAccounts();
            renderStatusStrip({ zcaAvailable: false });
        } finally {
            grid.setAttribute('aria-busy', 'false');
        }
    }

    function renderStatusStrip(res) {
        const strip = $('#wzStatusStrip');
        if (!strip) return;
        const conn = state.accounts.filter(
            (a) => a.status === 'connected' || a.status === 'token_ok'
        ).length;
        strip.innerHTML =
            `<span class="wz-statustxt"><span class="wz-dot ${conn ? 'connected' : ''}"></span>${conn}/${state.accounts.length} kết nối</span>` +
            (res && res.zcaAvailable === false
                ? ` · <span class="wz-err">zca-js chưa sẵn sàng trên server</span>`
                : '');
    }

    function accCardHtml(a) {
        const t = a.accountType;
        const dn = a.displayName || a.label || (t === 'oa' ? 'Zalo OA' : 'Tài khoản Zalo');
        const sub =
            t === 'oa'
                ? `OA${a.oaId ? ' · ' + esc(a.oaId) : ''}`
                : a.zaloUid
                  ? 'UID ' + esc(a.zaloUid)
                  : 'Cá nhân';
        const avatar = avatarHtml(a.avatarUrl, dn, 'wz-acc-avatar');
        const acts = [];
        if (t === 'personal') {
            if (a.status === 'connected') {
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="chat" data-key="${esc(a.accountKey)}"><i data-lucide="messages-square"></i> Chat</button>`
                );
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="disconnect" data-key="${esc(a.accountKey)}" aria-label="Ngắt kết nối ${esc(dn)}" title="Ngắt kết nối"><i data-lucide="power"></i></button>`
                );
            } else if (a.hasSession) {
                acts.push(
                    `<button class="wz-btn wz-btn-sm wz-btn-primary" data-act="reconnect" data-key="${esc(a.accountKey)}"><i data-lucide="refresh-cw"></i> Kết nối lại</button>`
                );
            } else {
                acts.push(
                    `<button class="wz-btn wz-btn-sm wz-btn-primary" data-act="qr" data-key="${esc(a.accountKey)}"><i data-lucide="qr-code"></i> Đăng nhập QR</button>`
                );
            }
        } else {
            acts.push(
                `<button class="wz-btn wz-btn-sm" data-act="sync" data-key="${esc(a.accountKey)}"><i data-lucide="refresh-cw"></i> Đồng bộ template</button>`
            );
        }
        acts.push(
            `<button class="wz-btn wz-btn-sm" data-act="delete" data-key="${esc(a.accountKey)}" aria-label="Xoá tài khoản ${esc(dn)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
        );
        return `<div class="wz-acc-card">
            <div class="wz-acc-top">
                ${avatar}
                <div style="min-width:0;flex:1">
                    <div class="wz-acc-name">${esc(dn)}</div>
                    <div class="wz-acc-sub">${sub}</div>
                </div>
                <span class="wz-acc-type ${t}">${t === 'oa' ? 'OA' : 'Cá nhân'}</span>
            </div>
            <div class="wz-statustxt"><span class="wz-dot ${esc(a.status)}"></span>${esc(STATUS_LABEL[a.status] || a.status)}${a.statusMsg ? ' · <span class="wz-err" style="font-weight:400">' + esc(String(a.statusMsg).slice(0, 60)) + '</span>' : ''}</div>
            <div class="wz-acc-actions">${acts.join('')}</div>
        </div>`;
    }

    function choiceCardsHtml() {
        return (
            `<div class="wz-acc-card wz-choice" id="wzAddPersonal" role="button" tabindex="0" aria-label="Thêm tài khoản cá nhân">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic personal"><i data-lucide="user-plus"></i></span>
                    <div><h3>Tài khoản cá nhân</h3></div>
                </div>
                <p>Đăng nhập bằng QR → chat 2 chiều với khách như người thật, không giới hạn 24h như Facebook.</p>
                <span class="wz-choice-cta">Thêm & quét QR <i data-lucide="arrow-right"></i></span>
            </div>` +
            `<div class="wz-acc-card wz-choice" id="wzAddOa" role="button" tabindex="0" aria-label="Kết nối Zalo OA">
                <div class="wz-acc-top">
                    <span class="wz-choice-ic oa"><i data-lucide="badge-check"></i></span>
                    <div><h3>Zalo OA <span class="wz-tag-safe">An toàn</span></h3></div>
                </div>
                <p>Tài khoản chính thức → gửi ZNS thông báo đơn (~200đ/tin) tới mọi SĐT. Không rủi ro khoá.</p>
                <span class="wz-choice-cta">Kết nối OA <i data-lucide="arrow-right"></i></span>
            </div>`
        );
    }

    function renderAccounts() {
        const grid = $('#wzAccGrid');
        const cards = state.accounts.map(accCardHtml).join('');
        grid.innerHTML = cards + choiceCardsHtml();
        if (window.lucide) lucide.createIcons();
    }

    async function onAccAction(act, key, btn) {
        const a = state.accounts.find((x) => x.accountKey === key);
        try {
            if (act === 'qr') return startQr(key);
            if (act === 'reconnect') {
                setBusy(btn, true);
                await window.ZaloApi.reconnect(key);
                notify('Đã gửi yêu cầu kết nối lại', 'success');
                setTimeout(loadAccounts, 1500);
            } else if (act === 'disconnect') {
                await window.ZaloApi.disconnect(key);
                notify('Đã ngắt kết nối', 'success');
                loadAccounts();
            } else if (act === 'delete') {
                if (!confirm(`Xoá tài khoản "${a?.displayName || key}"?`)) return;
                await window.ZaloApi.deleteAccount(key);
                notify('Đã xoá', 'success');
                loadAccounts();
            } else if (act === 'sync') {
                setBusy(btn, true);
                const r = await window.ZaloApi.syncTemplates(key);
                notify(`Đã đồng bộ ${r.synced || 0} template`, 'success');
            } else if (act === 'chat') {
                state.conv.accountKey = key;
                switchTab('chat');
            }
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // ── QR login flow ──────────────────────────────────────────────────
    async function startQr(key) {
        openQrModal('Đang tạo mã QR…');
        state.qr.key = key;
        try {
            const r = await window.ZaloApi.loginQr(key);
            if (r.alreadyConnected) {
                closeQrModal();
                notify('Tài khoản đã kết nối', 'success');
                return loadAccounts();
            }
            pollQr(key);
        } catch (e) {
            $('#wzQrStatus').innerHTML = `<span class="wz-err">${esc(e.message)}</span>`;
        }
    }

    function pollQr(key) {
        clearInterval(state.qr.timer);
        let errCount = 0;
        state.qr.timer = setInterval(async () => {
            if (state.qr.key !== key) return clearInterval(state.qr.timer);
            try {
                const r = await window.ZaloApi.qr(key);
                errCount = 0;
                if (r.image && $('#wzQrImg')) {
                    $('#wzQrImg').src = r.image;
                    $('#wzQrImg').style.visibility = 'visible';
                    $('#wzQrFrame')?.classList.remove('is-waiting'); // tắt vòng xoay khi đã có QR
                }
                const lbl = STATUS_LABEL[r.status] || r.status || '';
                $('#wzQrStatus').innerHTML = r.scanned?.name
                    ? `Đã quét: <b>${esc(r.scanned.name)}</b> — xác nhận trên điện thoại`
                    : r.status === 'error'
                      ? `<span class="wz-err">${esc(r.error || 'Lỗi đăng nhập')}</span>`
                      : esc(lbl);
                if (r.status === 'connected') {
                    clearInterval(state.qr.timer);
                    closeQrModal();
                    notify('Đăng nhập Zalo thành công!', 'success');
                    loadAccounts();
                } else if (r.status === 'qr_expired' || r.status === 'declined') {
                    clearInterval(state.qr.timer);
                }
            } catch (e) {
                // chịu được vài lần lỗi mạng tạm thời; quá ngưỡng thì dừng + báo
                if (++errCount >= 4) {
                    clearInterval(state.qr.timer);
                    const el = $('#wzQrStatus');
                    if (el)
                        el.innerHTML = `<span class="wz-err">${esc(e.message || 'Lỗi mạng — đóng và thử lại')}</span>`;
                }
            }
        }, 1500);
    }

    function openQrModal(msg) {
        $('#wzQrImg').src = '';
        $('#wzQrImg').style.visibility = 'hidden';
        $('#wzQrFrame')?.classList.add('is-waiting');
        $('#wzQrStatus').textContent = msg || '';
        showModal('#wzQrModal');
    }
    function closeQrModal() {
        clearInterval(state.qr.timer);
        state.qr.key = null;
        hideModal('#wzQrModal');
    }

    // ── Add personal account modal (thay prompt() — thân thiện hơn) ────────
    function addPersonal() {
        $('#wzAddLabel').value = 'Zalo shop';
        showModal('#wzAddModal');
    }
    async function saveAddPersonal() {
        const label = ($('#wzAddLabel').value || '').trim() || 'Zalo shop';
        const btn = $('#wzAddSave');
        setBusy(btn, true);
        try {
            const r = await window.ZaloApi.createAccount(label);
            hideModal('#wzAddModal');
            await loadAccounts();
            if (r.data?.accountKey) startQr(r.data.accountKey);
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        } finally {
            setBusy(btn, false);
        }
    }

    // ── OA connect modal ─────────────────────────────────────────────────
    function openOaModal() {
        showModal('#wzOaModal');
    }
    function closeOaModal() {
        hideModal('#wzOaModal');
    }
    async function saveOa() {
        const body = {
            appId: $('#wzOaAppId').value.trim(),
            secret: $('#wzOaSecret').value.trim(),
            code: $('#wzOaCode').value.trim(),
            oaId: $('#wzOaId').value.trim(),
            oaName: $('#wzOaName').value.trim(),
        };
        if (!body.appId || !body.secret || !body.code) {
            $('#wzOaErr').textContent = 'Cần App ID, Secret và Authorization Code';
            return;
        }
        $('#wzOaErr').textContent = '';
        const btn = $('#wzOaSave');
        setBusy(btn, true);
        try {
            await window.ZaloApi.oaConnect(body);
            closeOaModal();
            notify('Đã kết nối Zalo OA', 'success');
            loadAccounts();
        } catch (e) {
            $('#wzOaErr').textContent = e.message;
        } finally {
            setBusy(btn, false);
        }
    }

    // ===================================================================
    // CHAT
    // ===================================================================
    function fillAccountSelect(sel, onlyConnected) {
        const el = $(sel);
        if (!el) return;
        const accs = state.accounts.length ? state.accounts : [];
        const list = accs.filter(
            (a) => a.accountType === 'personal' && (!onlyConnected || a.status === 'connected')
        );
        const prev = el.value;
        el.innerHTML =
            `<option value="">— Chọn tài khoản —</option>` +
            list
                .map(
                    (a) =>
                        `<option value="${esc(a.accountKey)}">${esc(a.displayName || a.label)}${a.status !== 'connected' ? ' (offline)' : ''}</option>`
                )
                .join('');
        if (prev) el.value = prev;
        else if (state.conv.accountKey) el.value = state.conv.accountKey;
    }

    async function loadConversations() {
        if (!state.accounts.length) await loadAccounts();
        fillAccountSelect('#wzChatAccount');
        try {
            const res = await window.ZaloApi.conversations({
                accountKey: state.conv.accountKey,
                search: state.conv.search,
                limit: 200,
            });
            state.conv.list = res.data || [];
            state.conv.total = res.total || 0;
            renderConvList();
            maybeAutoSync();
        } catch (e) {
            $('#wzConvList').innerHTML = `<div class="wz-empty">✗ ${esc(e.message)}</div>`;
        }
    }

    // Lần đầu chọn 1 acc đã kết nối mà danh sách rỗng → tự seed danh bạ (1 lần).
    function maybeAutoSync() {
        const key = state.conv.accountKey;
        if (!key || state.conv.list.length || state.conv.search || _autoSynced.has(key)) return;
        const acc = state.accounts.find((a) => a.accountKey === key);
        if (acc && acc.status === 'connected') {
            _autoSynced.add(key);
            syncConversations(true);
        }
    }

    async function syncConversations(silent) {
        const key = state.conv.accountKey;
        if (!key) {
            if (!silent) notify('Chọn tài khoản cá nhân đã kết nối trước', 'warning');
            return;
        }
        _autoSynced.add(key);
        const btn = $('#wzConvSync');
        setBusy(btn, true);
        try {
            const r = await window.ZaloApi.syncConversations(key);
            if (!silent)
                notify(
                    `Đã đồng bộ ${r.synced || 0} hội thoại (${r.users || 0} bạn · ${r.groups || 0} nhóm)`,
                    'success'
                );
            await loadConversations();
        } catch (e) {
            if (!silent) notify('✗ ' + e.message, 'error');
            else $('#wzConvSync')?.classList.remove('is-busy');
        } finally {
            setBusy($('#wzConvSync'), false);
        }
    }

    function renderConvList() {
        const box = $('#wzConvList');
        const canSync = !!state.conv.accountKey;
        const head = `<div class="wz-conv-head">
            <div class="wz-conv-search"><input id="wzConvSearch" type="search" placeholder="Tìm hội thoại…" value="${esc(state.conv.search)}"></div>
            <button class="wz-iconbtn" id="wzConvSync" type="button" ${canSync ? '' : 'disabled'} title="Đồng bộ danh bạ (bạn bè + nhóm) thành hội thoại" aria-label="Đồng bộ danh bạ"><i data-lucide="refresh-cw"></i></button>
        </div>`;
        if (!state.conv.list.length) {
            const acc = state.conv.accountKey;
            box.innerHTML =
                head +
                `<div class="wz-empty">
                    <span class="wz-empty-ic"><i data-lucide="messages-square"></i></span>
                    <span class="wz-empty-title">${acc ? 'Chưa có hội thoại' : 'Chọn tài khoản'}</span>
                    <span class="wz-empty-sub">${acc ? 'Bấm <b>Đồng bộ</b> để nạp danh bạ &amp; nhóm. Tin khách gửi tới sẽ tự hiện theo thời gian thực.' : 'Chọn một tài khoản cá nhân đã kết nối ở trên để xem hội thoại.'}</span>
                </div>`;
            if (window.lucide) lucide.createIcons();
            bindConvHead();
            return;
        }
        box.innerHTML =
            head +
            state.conv.list
                .map((c) => {
                    const name = c.display_name || c.zalo_uid || c.thread_id;
                    const group = c.thread_type === 'group';
                    return `<div class="wz-conv-item ${c.id === state.conv.activeId ? 'is-active' : ''}" data-id="${c.id}" role="button" tabindex="0" aria-label="Hội thoại với ${esc(name)}">
                ${avatarHtml(c.avatar_url, name, 'wz-conv-av' + (group ? ' is-group' : ''))}
                <div class="wz-conv-meta">
                    <div class="wz-conv-name">${esc(name)}</div>
                    <div class="wz-conv-last">${c.last_msg_text ? esc(c.last_msg_text.slice(0, 48)) : '<span class="wz-conv-empty">Chưa có tin nhắn</span>'}</div>
                </div>
                ${c.unread_count > 0 ? `<span class="wz-conv-unread">${c.unread_count}</span>` : ''}
            </div>`;
                })
                .join('');
        if (window.lucide) lucide.createIcons();
        bindConvHead();
    }

    function bindConvHead() {
        const inp = $('#wzConvSearch');
        if (inp) {
            let t;
            inp.addEventListener('input', (e) => {
                clearTimeout(t);
                t = setTimeout(() => {
                    state.conv.search = e.target.value.trim();
                    loadConversations();
                }, 300);
            });
        }
        $('#wzConvSync')?.addEventListener('click', () => syncConversations(false));
    }

    async function openConversation(id) {
        state.conv.activeId = id;
        if (_convUnsub) {
            _convUnsub();
            _convUnsub = null;
        }
        renderConvList();
        try {
            const res = await window.ZaloApi.messages(id, 100);
            const conv = res.conversation;
            state.conv.activeConv = conv;
            state.conv.messages = res.data || [];
            state.conv.hasMore = !!res.hasMore;
            window.WZChat?.store?.setConversation(conv, conv.account_key, state.conv.messages);
            renderChat();
            // realtime: tin mới + reaction/recall/seen + typing
            if (window.WZChat?.subscribeRealtime) {
                _convUnsub = window.WZChat.subscribeRealtime(id, conv.thread_id, {
                    refetch: () => refreshActiveMessages(),
                    onTyping: (on) => setTyping(on),
                });
            } else if (window.Web2SSE?.subscribe) {
                _convUnsub = window.Web2SSE.subscribe(`web2:zalo:conv:${id}`, () =>
                    refreshActiveMessages()
                );
            }
            // báo đã xem (best-effort)
            window.WZChat?.actions?.markSeen(conv.account_key, conv);
        } catch (e) {
            $('#wzChatMain').innerHTML = `<div class="wz-chat-empty">✗ ${esc(e.message)}</div>`;
        }
    }

    async function refreshActiveMessages() {
        if (!state.conv.activeId) return;
        try {
            // giữ các tin đang gửi optimistic (chưa có msg_id) khi đồng bộ lại
            const pending = state.conv.messages.filter(
                (m) => m.send_status === 'sending' || m.send_status === 'failed'
            );
            const res = await window.ZaloApi.messages(state.conv.activeId, 100);
            const fresh = res.data || [];
            const ids = new Set(fresh.map((m) => String(m.msg_id)));
            const stillPending = pending.filter((p) => !p.msg_id || !ids.has(String(p.msg_id)));
            state.conv.messages = fresh.concat(stillPending);
            window.WZChat?.store?.setMessages(state.conv.messages);
            renderBody({ keepScroll: true });
        } catch {}
    }

    // URL hữu ích nhất của 1 message (attachment hoặc content nếu là URL trần).
    function _msgUrl(m) {
        const a = (Array.isArray(m.attachments) ? m.attachments : [])[0] || {};
        return String(a.href || a.url || a.thumb || m.content || '').trim();
    }
    // Loại hiển thị thực tế (ổn định cho class + body). Bắt cả legacy: msg_type
    // 'link'/'text' nhưng content là URL ảnh → render ảnh.
    function bubbleKind(m) {
        const type = m.msg_type || 'text';
        const a = (Array.isArray(m.attachments) ? m.attachments : [])[0] || {};
        const hasMedia = !!(a.url || a.thumb || a.href);
        if (type === 'image' || type === 'gif') return hasMedia ? 'image' : _legacyKind(m);
        if (type === 'sticker') return hasMedia ? 'sticker' : _legacyKind(m);
        if (type === 'video') return hasMedia ? 'video' : _legacyKind(m);
        if (type === 'file') return hasMedia ? 'file' : 'text';
        return _legacyKind(m);
    }
    function _legacyKind(m) {
        const t = _msgUrl(m);
        if (t && (IMG_URL_RE.test(t) || ZDN_IMG_RE.test(t))) return 'image';
        if ((m.msg_type === 'link' || (t && URL_RE.test(t))) && !/\s/.test(t)) return 'link';
        return 'text';
    }

    // 1 bong bóng theo kind đã tính (ảnh / sticker / video / file / link / text).
    function bubbleBody(m, kind) {
        const a = (Array.isArray(m.attachments) ? m.attachments : [])[0] || {};
        const cap =
            m.content && kind !== 'link' && _msgUrl(m) !== (m.content || '').trim()
                ? `<div class="wz-msg-cap">${esc(m.content)}</div>`
                : '';
        const url = _msgUrl(m);

        if (kind === 'image') {
            const src = a.thumb || a.url || url;
            const full = a.url || a.href || url || src;
            return `<a class="wz-msg-media" href="${esc(full)}" target="_blank" rel="noopener noreferrer">
                <img src="${esc(src)}" alt="${esc(a.title || 'Hình ảnh')}" loading="lazy" referrerpolicy="no-referrer"></a>${cap}`;
        }
        if (kind === 'sticker') {
            return `<img class="wz-msg-sticker" src="${esc(a.url || a.thumb || url)}" alt="sticker" loading="lazy" referrerpolicy="no-referrer">`;
        }
        if (kind === 'video') {
            return `<a class="wz-msg-media wz-msg-video" href="${esc(a.url || a.href || a.thumb || url)}" target="_blank" rel="noopener noreferrer">
                ${a.thumb ? `<img src="${esc(a.thumb)}" alt="video" loading="lazy" referrerpolicy="no-referrer">` : ''}
                <span class="wz-msg-play"><i data-lucide="play"></i></span></a>${cap}`;
        }
        if (kind === 'file') {
            return `<a class="wz-msg-file" href="${esc(a.url || a.href || '#')}" target="_blank" rel="noopener noreferrer"><i data-lucide="file"></i><span>${esc(a.title || 'Tệp đính kèm')}</span></a>${cap}`;
        }
        if (kind === 'link') {
            const href = a.href || a.url || m.content || '';
            return `<a class="wz-msg-linkbox" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(m.content || href)}</a>`;
        }
        return esc(m.content || '') || '<span class="wz-msg-muted">[Tin nhắn]</span>';
    }

    // Fallback render khi module WZChat chưa load (giữ tương thích).
    function _legacyBubbles() {
        return state.conv.messages
            .map((m) => {
                const kind = bubbleKind(m);
                const media = kind !== 'text' && kind !== 'link';
                return `<div class="wz-msg ${m.direction === 'out' ? 'out' : 'in'}${media ? ' has-media' : ''}${kind === 'sticker' ? ' is-sticker' : ''}">
                    <div class="wz-msg-bubble">${bubbleBody(m, kind)}</div>
                    <div class="wz-msg-meta">${fmtTime(m.sent_at)}</div></div>`;
            })
            .join('');
    }

    // Shell khung chat (head + body + composer) — dựng 1 lần mỗi lần mở hội thoại.
    function renderChat() {
        const main = $('#wzChatMain');
        const c = state.conv.activeConv;
        if (!c) {
            main.innerHTML = `<div class="wz-chat-empty">Chọn một hội thoại để xem tin nhắn</div>`;
            return;
        }
        const name = c.display_name || c.zalo_uid || c.thread_id;
        main.innerHTML = `
            <div class="wz-chat-head">
                ${avatarHtml(c.avatar_url, name, 'wz-conv-av' + (c.thread_type === 'group' ? ' is-group' : ''), 'width:34px;height:34px')}
                <span class="wz-chat-head-name">${esc(name)}</span>
            </div>
            <div class="wz-chat-body" id="wzChatBody"></div>
            <button class="wz-scroll-fab" id="wzScrollFab" hidden aria-label="Cuộn xuống cuối"><i data-lucide="chevron-down"></i></button>
            <div id="wzComposeRoot"></div>`;
        if (window.lucide) lucide.createIcons();

        // composer (module) hoặc fallback tối giản
        const composeRoot = $('#wzComposeRoot');
        if (window.WZChat?.mountComposer) {
            window.WZChat.mountComposer(composeRoot, {
                conv: c,
                account: c.account_key,
                onSendText,
                onSendMedia,
                onSendFile,
                onSendSticker,
            });
            const ci = composeRoot.querySelector('.wz-compose-input');
            ci?.addEventListener('input', () =>
                window.WZChat.actions?.emitTyping(c.account_key, c)
            );
        } else {
            composeRoot.outerHTML = `<div class="wz-chat-compose"><textarea id="wzComposeInput" rows="1" placeholder="Nhập tin nhắn…"></textarea><button class="wz-btn wz-btn-primary" id="wzComposeSend"><i data-lucide="send"></i></button></div>`;
            $('#wzComposeSend')?.addEventListener('click', () => {
                const t = $('#wzComposeInput').value.trim();
                if (t) {
                    $('#wzComposeInput').value = '';
                    onSendText(t);
                }
            });
        }
        _bindChatBody();
        renderBody();
    }

    // Render lại danh sách tin (không đụng composer → giữ state soạn).
    function renderBody(opts) {
        const body = $('#wzChatBody');
        if (!body) return;
        const o = opts || {};
        const wasNear = _nearBottom(body);
        const prevH = body.scrollHeight;
        const prevTop = body.scrollTop;

        const c = state.conv.activeConv;
        const list =
            window.WZChat?.renderMessages?.(state.conv.messages, c) ??
            _legacyBubbles() ??
            '<div class="wz-chat-empty">Chưa có tin nhắn</div>';
        const older =
            state.conv.hasMore && state.conv.messages.length
                ? `<button class="wz-load-older" id="wzLoadOlder">Tải tin cũ hơn</button>`
                : '';
        body.innerHTML = older + list;
        if (window.lucide) lucide.createIcons();

        if (o.prepend) {
            // giữ vị trí khi nạp tin cũ ở đầu
            body.scrollTop = prevTop + (body.scrollHeight - prevH);
        } else if (o.keepScroll && !wasNear) {
            body.scrollTop = prevTop;
        } else {
            body.scrollTop = body.scrollHeight;
        }
    }

    function _nearBottom(el) {
        return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    }

    function setTyping(on) {
        const body = $('#wzChatBody');
        if (!body) return;
        let t = body.querySelector('.wz-typing');
        if (on && !t) {
            t = document.createElement('div');
            t.className = 'wz-typing';
            t.innerHTML = '<span></span><span></span><span></span>';
            body.appendChild(t);
            if (_nearBottom(body)) body.scrollTop = body.scrollHeight;
        } else if (!on && t) {
            t.remove();
        }
    }

    // ── optimistic out ─────────────────────────────────────────────────
    let _tempId = 0;
    function _optimisticOut(msg) {
        msg.cli_msg_id = msg.cli_msg_id || 'temp_' + ++_tempId;
        msg.send_status = 'sending';
        msg.sent_at = msg.sent_at || Date.now();
        msg.reactions = msg.reactions || {};
        state.conv.messages.push(msg);
        renderBody();
        return msg;
    }
    function _reconcile(tempCli, patch, ok) {
        const m = state.conv.messages.find((x) => x.cli_msg_id === tempCli);
        if (m) {
            Object.assign(m, patch);
            m.send_status = ok ? 'sent' : 'failed';
        }
        renderBody({ keepScroll: true });
    }
    function _findMsg(id, cli) {
        return state.conv.messages.find(
            (m) => String(m.msg_id) === String(id) || String(m.cli_msg_id) === String(cli || id)
        );
    }

    async function onSendText(text) {
        const c = state.conv.activeConv;
        if (!c || !text) return;
        const reply = window.WZChat?.store?.getReplyTarget?.() || null;
        const temp = _optimisticOut({
            direction: 'out',
            msg_type: 'text',
            content: text,
            reply_to_preview: reply ? reply.content || window.WZChat?._previewOf?.(reply) : null,
        });
        temp._retry = () => _sendTextRaw(text, reply, temp.cli_msg_id);
        await _sendTextRaw(text, reply, temp.cli_msg_id);
    }
    async function _sendTextRaw(text, reply, tempCli) {
        const c = state.conv.activeConv;
        try {
            const r = await window.ZaloApi.sendMessage({
                accountKey: c.account_key,
                threadId: c.thread_id,
                text,
                threadType: c.thread_type,
                replyTo: reply ? { msgId: reply.msg_id, preview: reply.content || '' } : null,
            });
            _reconcile(tempCli, { msg_id: r.msgId, cli_msg_id: r.cliMsgId || tempCli }, true);
        } catch (e) {
            notify('✗ Gửi lỗi: ' + e.message, 'error');
            _reconcile(tempCli, {}, false);
        }
    }

    async function onSendMedia(items, caption) {
        const c = state.conv.activeConv;
        if (!c || !items?.length) return;
        const atts = items.map((it) => ({ type: 'image', url: it.dataUrl, thumb: it.dataUrl }));
        const temp = _optimisticOut({
            direction: 'out',
            msg_type: 'image',
            content: caption || '',
            attachments: atts,
        });
        const files = items.map((it) => ({ base64: it.dataUrl, filename: it.name, mime: it.mime }));
        temp._retry = () => _sendMediaRaw(files, caption, temp.cli_msg_id, atts);
        await _sendMediaRaw(files, caption, temp.cli_msg_id, atts);
    }
    async function _sendMediaRaw(files, caption, tempCli, atts) {
        const c = state.conv.activeConv;
        try {
            const r = await window.ZaloApi.sendImage({
                accountKey: c.account_key,
                threadId: c.thread_id,
                threadType: c.thread_type,
                caption,
                files,
            });
            _reconcile(tempCli, { msg_id: r.msgId, attachments: r.attachments || atts }, true);
        } catch (e) {
            notify('✗ Gửi ảnh lỗi: ' + e.message, 'error');
            _reconcile(tempCli, {}, false);
        }
    }

    async function onSendFile(item) {
        const c = state.conv.activeConv;
        if (!c || !item) return;
        const temp = _optimisticOut({
            direction: 'out',
            msg_type: 'file',
            content: '',
            attachments: [{ type: 'file', title: item.name }],
        });
        try {
            const r = await window.ZaloApi.sendFile({
                accountKey: c.account_key,
                threadId: c.thread_id,
                threadType: c.thread_type,
                file: { base64: item.dataUrl, filename: item.name, mime: item.mime },
            });
            _reconcile(temp.cli_msg_id, { msg_id: r.msgId, attachments: r.attachments }, true);
        } catch (e) {
            notify('✗ Gửi tệp lỗi: ' + e.message, 'error');
            _reconcile(temp.cli_msg_id, {}, false);
        }
    }

    async function onSendSticker(s) {
        const c = state.conv.activeConv;
        if (!c || !s) return;
        const temp = _optimisticOut({
            direction: 'out',
            msg_type: 'sticker',
            attachments: [{ type: 'sticker', url: s.url }],
        });
        try {
            const r = await window.ZaloApi.sendSticker({
                accountKey: c.account_key,
                threadId: c.thread_id,
                threadType: c.thread_type,
                sticker: s,
            });
            _reconcile(temp.cli_msg_id, { msg_id: r.msgId }, true);
        } catch (e) {
            notify('✗ ' + e.message, 'error');
            _reconcile(temp.cli_msg_id, {}, false);
        }
    }

    // ── delegated handlers trên khung tin (lightbox + tools + load older) ──
    function _bindChatBody() {
        const body = $('#wzChatBody');
        if (!body) return;
        body.addEventListener('click', (e) => {
            if (e.target.closest('#wzLoadOlder')) return _loadOlder();
            const lb = e.target.closest('[data-lb]');
            if (lb && window.WZChat?.openLightbox) {
                const imgs = window.WZChat.collectThreadImages(body);
                const img = lb.querySelector('img');
                const full = img?.dataset.full || img?.src;
                window.WZChat.openLightbox(
                    imgs.length ? imgs : [full],
                    Math.max(0, imgs.indexOf(full))
                );
                return;
            }
            const tool = e.target.closest('[data-act]');
            if (!tool) return;
            const msgEl = tool.closest('.wz-msg');
            const m = _findMsg(msgEl?.dataset.msgid, msgEl?.dataset.cli);
            const act = tool.dataset.act;
            if (act === 'retry') return m?._retry?.();
            if (!m) return;
            if (act === 'reply') return window.WZChat?.composer?.setReply(m);
            if (act === 'react')
                return window.WZChat?.openReactionBar(tool, (key) => _doReact(m, key));
            if (act === 'recall') return _doRecall(m);
            if (act === 'forward') return _doForward(m, tool);
        });
        // scroll FAB hiện khi cuộn lên
        body.addEventListener(
            'scroll',
            () => {
                const fab = $('#wzScrollFab');
                if (fab) fab.hidden = _nearBottom(body);
            },
            { passive: true }
        );
        $('#wzScrollFab')?.addEventListener('click', () => {
            body.scrollTop = body.scrollHeight;
        });
    }

    function _doReact(m, key) {
        const c = state.conv.activeConv;
        const emoji = window.WZChat.reactionEmoji(key);
        window.WZChat.store.patchReaction(m.msg_id || m.cli_msg_id, emoji, 'me');
        renderBody({ keepScroll: true });
        window.WZChat.actions
            .react(c.account_key, c, m, key)
            .catch((e) => notify('✗ ' + e.message, 'error'));
    }
    function _doRecall(m) {
        if (!confirm('Thu hồi tin nhắn này?')) return;
        const c = state.conv.activeConv;
        m.recalled = true;
        renderBody({ keepScroll: true });
        window.WZChat.actions.recall(c.account_key, c, m).catch((e) => {
            m.recalled = false;
            renderBody({ keepScroll: true });
            notify('✗ Thu hồi lỗi: ' + e.message, 'error');
        });
    }
    function _doForward(m, anchor) {
        const c = state.conv.activeConv;
        const items = state.conv.list
            .filter((x) => x.id !== state.conv.activeId)
            .slice(0, 40)
            .map((x) => ({ label: x.display_name || x.thread_id, value: x.thread_id }));
        if (!items.length) return notify('Không có hội thoại để chuyển tiếp', 'warning');
        window.WZChat.openMenu(anchor, items, (threadId) => {
            if (!threadId) return;
            window.WZChat.actions
                .forward(c.account_key, c, m, [threadId])
                .then(() => notify('Đã chuyển tiếp', 'success'))
                .catch((e) => notify('✗ ' + e.message, 'error'));
        });
    }

    async function _loadOlder() {
        const c = state.conv.activeConv;
        const oldest = state.conv.messages[0]?.sent_at;
        if (!c || !oldest) return;
        const btn = $('#wzLoadOlder');
        if (btn) btn.textContent = 'Đang tải…';
        try {
            const res = await window.ZaloApi.loadHistory(state.conv.activeId, {
                limit: 50,
                before: oldest,
            });
            const older = res.data || [];
            state.conv.messages = older.concat(state.conv.messages);
            state.conv.hasMore = res.hasMore;
            renderBody({ prepend: true });
        } catch (e) {
            notify('✗ ' + e.message, 'error');
            if (btn) btn.textContent = 'Tải tin cũ hơn';
        }
    }

    // ===================================================================
    // LOOKUP (xem thông tin người khác)
    // ===================================================================
    async function doLookup() {
        const accountKey = $('#wzLookupAccount').value;
        const phone = $('#wzLookupPhone').value.trim();
        const box = $('#wzLookupResult');
        if (!accountKey) return notify('Chọn tài khoản Zalo (cá nhân, đã kết nối)', 'warning');
        if (!phone) return notify('Nhập SĐT cần tra cứu', 'warning');
        box.innerHTML = `<div class="wz-loading">Đang tra cứu…</div>`;
        try {
            const res = await window.ZaloApi.lookup({ accountKey, phone });
            const u = res.data?.profile || res.data || {};
            if (!u || (!u.displayName && !u.zaloName && !u.uid && !u.userId)) {
                box.innerHTML = `<div class="wz-empty">Không tìm thấy người dùng Zalo với SĐT này</div>`;
                return;
            }
            box.innerHTML = `<div class="wz-lookup-result">
                ${avatarHtml(u.avatar, u.displayName || u.zaloName, 'wz-acc-avatar', 'width:64px;height:64px;font-size:24px;border-radius:18px')}
                <div>
                    <div style="font-weight:700;font-size:16px">${esc(u.displayName || u.zaloName || '—')}</div>
                    <div class="wz-acc-sub">UID: ${esc(u.userId || u.uid || '—')}</div>
                    ${u.phoneNumber ? `<div class="wz-acc-sub">SĐT: ${esc(u.phoneNumber)}</div>` : ''}
                    ${u.gender != null ? `<div class="wz-acc-sub">Giới tính: ${u.gender === 0 ? 'Nam' : 'Nữ'}</div>` : ''}
                    ${u.sdob || u.dob ? `<div class="wz-acc-sub">Sinh nhật: ${esc(u.sdob || u.dob)}</div>` : ''}
                </div>
            </div>`;
        } catch (e) {
            box.innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    async function showSelf() {
        const accountKey = $('#wzLookupAccount').value;
        const box = $('#wzLookupResult');
        if (!accountKey) return notify('Chọn tài khoản', 'warning');
        box.innerHTML = `<div class="wz-loading">Đang tải…</div>`;
        try {
            const res = await window.ZaloApi.self(accountKey);
            const u = res.data?.profile || res.data || {};
            box.innerHTML = `<div class="wz-lookup-result">
                ${avatarHtml(u.avatar, u.displayName || u.zaloName || 'Tôi', 'wz-acc-avatar', 'width:64px;height:64px;font-size:24px;border-radius:18px')}
                <div>
                    <div style="font-weight:700;font-size:16px">${esc(u.displayName || u.zaloName || 'Tôi')}</div>
                    <div class="wz-acc-sub">UID: ${esc(u.userId || u.uid || '—')}</div>
                    ${u.phoneNumber ? `<div class="wz-acc-sub">SĐT: ${esc(u.phoneNumber)}</div>` : ''}
                </div>
            </div>`;
        } catch (e) {
            box.innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    // ===================================================================
    // ZNS
    // ===================================================================
    async function loadTemplates() {
        try {
            const res = await window.ZaloApi.znsTemplates();
            state.zns.templates = res.data || [];
            const sel = $('#wzZnsTemplate');
            sel.innerHTML =
                `<option value="">— Chọn template —</option>` +
                state.zns.templates
                    .map(
                        (t) =>
                            `<option value="${esc(t.template_id)}">${esc(t.template_name)} (${esc(t.template_id)})</option>`
                    )
                    .join('');
            $('#wzZnsTplCount').textContent = state.zns.templates.length;
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    async function sendZns() {
        const phone = $('#wzZnsPhone').value.trim();
        const templateId = $('#wzZnsTemplate').value;
        const raw = $('#wzZnsData').value.trim();
        const errEl = $('#wzZnsErr');
        errEl.textContent = '';
        if (!phone || !templateId) {
            errEl.textContent = 'Cần SĐT và template';
            return;
        }
        let data = {};
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch {
                errEl.textContent = 'template_data phải là JSON hợp lệ';
                return;
            }
        }
        const btn = $('#wzZnsSend');
        setBusy(btn, true);
        try {
            const sentBy = window.Web2UserInfo?.get?.('web2/zalo')?.userName || null;
            await window.ZaloApi.sendZns({ phone, templateId, data, sentBy });
            notify('Đã gửi ZNS', 'success');
            $('#wzZnsPhone').value = '';
            loadZnsLog();
        } catch (e) {
            errEl.textContent = e.message;
        } finally {
            setBusy(btn, false);
        }
    }

    async function loadZnsLog() {
        try {
            const res = await window.ZaloApi.znsLog({ limit: 50 });
            const rows = res.data || [];
            $('#wzZnsLog').innerHTML = !rows.length
                ? `<div class="wz-empty">Chưa có log ZNS</div>`
                : `<table class="wz-table"><thead><tr><th>Thời gian</th><th>SĐT</th><th>Template</th><th>Trạng thái</th></tr></thead><tbody>` +
                  rows
                      .map(
                          (r) => `<tr>
                    <td>${fmtTime(r.created_at)}</td>
                    <td>${esc(r.phone)}</td>
                    <td>${esc(r.template_id)}</td>
                    <td><span class="wz-chip ${esc(r.status)}">${esc(r.status)}</span>${r.error_msg ? ' <span class="wz-err" style="font-size:11px">' + esc(String(r.error_msg).slice(0, 40)) + '</span>' : ''}</td>
                </tr>`
                      )
                      .join('') +
                  `</tbody></table>`;
        } catch (e) {
            $('#wzZnsLog').innerHTML = `<div class="wz-err">✗ ${esc(e.message)}</div>`;
        }
    }

    // ===================================================================
    // BIND + INIT
    // ===================================================================
    function bind() {
        // Tabs: click + keyboard (←/→/Home/End) theo ARIA APG tablist
        // APG manual-activation: ←/→/Home/End CHỈ di chuyển focus (roving tabindex);
        // Enter/Space (hoặc click) mới kích hoạt panel → không fetch mỗi lần bấm mũi tên.
        const tabs = Array.from(document.querySelectorAll('.wz-tab'));
        const focusTab = (j) => {
            tabs.forEach((t, k) => (t.tabIndex = k === j ? 0 : -1));
            tabs[j].focus();
        };
        tabs.forEach((b, i) => {
            b.addEventListener('click', () => switchTab(b.dataset.tab));
            b.addEventListener('keydown', (e) => {
                let j = null;
                if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') j = 0;
                else if (e.key === 'End') j = tabs.length - 1;
                if (j !== null) {
                    e.preventDefault();
                    focusTab(j);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchTab(b.dataset.tab, true);
                }
            });
        });

        // account grid (delegated click + keyboard cho choice cards)
        const grid = $('#wzAccGrid');
        const gridActivate = (e) => {
            if (e.target.closest('#wzAddPersonal')) return addPersonal();
            if (e.target.closest('#wzAddOa')) return openOaModal();
            const btn = e.target.closest('[data-act]');
            if (btn) onAccAction(btn.dataset.act, btn.dataset.key, btn);
        };
        grid.addEventListener('click', gridActivate);
        grid.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.wz-choice')) {
                e.preventDefault();
                gridActivate(e);
            }
        });

        // Add-personal modal
        $('#wzAddSave').addEventListener('click', saveAddPersonal);
        $('#wzAddCancel').addEventListener('click', () => hideModal('#wzAddModal'));
        $('#wzAddClose').addEventListener('click', () => hideModal('#wzAddModal'));
        $('#wzAddBackdrop').addEventListener('click', () => hideModal('#wzAddModal'));
        $('#wzAddLabel').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveAddPersonal();
        });

        // QR modal
        $('#wzQrClose').addEventListener('click', closeQrModal);
        $('#wzQrBackdrop').addEventListener('click', closeQrModal);

        // OA modal
        $('#wzOaClose').addEventListener('click', closeOaModal);
        $('#wzOaCancel').addEventListener('click', closeOaModal);
        $('#wzOaBackdrop').addEventListener('click', closeOaModal);
        $('#wzOaSave').addEventListener('click', saveOa);

        // chat
        $('#wzChatAccount').addEventListener('change', (e) => {
            state.conv.accountKey = e.target.value;
            loadConversations();
        });
        $('#wzConvList').addEventListener('click', (e) => {
            const item = e.target.closest('.wz-conv-item');
            if (item) openConversation(Number(item.dataset.id));
        });
        $('#wzConvList').addEventListener('keydown', (e) => {
            const item = e.target.closest('.wz-conv-item');
            if (item && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                openConversation(Number(item.dataset.id));
            }
        });

        // lookup
        $('#wzLookupBtn').addEventListener('click', doLookup);
        $('#wzLookupSelf').addEventListener('click', showSelf);
        $('#wzLookupPhone').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doLookup();
        });

        // zns
        $('#wzZnsSend').addEventListener('click', sendZns);
        $('#wzZnsReloadLog').addEventListener('click', loadZnsLog);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!$('#wzAddModal').hidden) hideModal('#wzAddModal');
                else if (!$('#wzQrModal').hidden) closeQrModal();
                else if (!$('#wzOaModal').hidden) closeOaModal();
            }
        });
    }

    function subscribeSse() {
        if (!window.Web2SSE?.subscribe) return;
        window.Web2SSE.subscribe('web2:zalo:accounts', () => {
            if (state.tab === 'accounts') loadAccounts();
        });
        window.Web2SSE.subscribe('web2:zalo:messages', () => {
            if (state.tab === 'chat') {
                loadConversations();
                refreshActiveMessages();
            }
        });
    }

    function init() {
        bind();
        loadAccounts();
        subscribeSse();
        // focus theo ?focus=<phone> (từ Web2Zalo.openChat của trang khác)
        const focus = new URLSearchParams(location.search).get('focus');
        if (focus) {
            switchTab('chat');
            state.conv.search = focus;
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
