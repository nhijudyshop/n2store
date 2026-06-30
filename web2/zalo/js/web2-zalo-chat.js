// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang Zalo — tab Hội thoại: fill account select, load/render danh sách
// hội thoại, đồng bộ danh bạ, mở hội thoại (WZChat shared engine).
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { $, esc, notify, avatarHtml, setBusy, state, _autoSynced } = WZApp;

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
        else if (list.length === 1) {
            // Chỉ 1 tài khoản cá nhân được gán → tự chọn, khỏi bắt user pick.
            // loadConversations gọi hàm này TRƯỚC khi fetch nên set state ngay là kịp.
            state.conv.accountKey = list[0].accountKey;
            el.value = list[0].accountKey;
        }
    }

    let _firstConvLoad = true;
    async function loadConversations() {
        if (!state.accounts.length) await WZApp.loadAccounts();
        fillAccountSelect('#wzChatAccount');
        // Snapshot unread TRƯỚC khi ghi đè list → thông báo tin mới. Bỏ qua lần đầu
        // (tránh báo loạt khi mới mở trang) + khi đang tìm kiếm (list bị lọc).
        const prevMap =
            window.WZApp.zaloNotify && !_firstConvLoad && !state.conv.search
                ? WZApp.zaloNotify.snapshot()
                : null;
        // Lần đầu nạp (container rỗng) → skeleton GitHub-style trong lúc fetch.
        if (_firstConvLoad && !state.conv.list.length && window.Web2Skeleton) {
            window.Web2Skeleton.list('#wzConvList', { count: 8, avatar: true });
        }
        try {
            const res = await window.ZaloApi.conversations({
                accountKey: state.conv.accountKey,
                search: state.conv.search,
                limit: 200,
            });
            state.conv.list = res.data || [];
            state.conv.total = res.total || 0;
            renderConvList();
            if (window.WZApp.zaloNotify) {
                if (prevMap) WZApp.zaloNotify.notify(prevMap);
                else WZApp.zaloNotify.setTabBadge();
            }
            _firstConvLoad = false;
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
                    const group = c.thread_type === 'group';
                    // Chưa có tên (đang chờ heal từ zca) → placeholder, KHÔNG lộ id số.
                    const name = c.display_name || (group ? 'Nhóm Zalo' : 'Khách Zalo');
                    // Nhóm: hiện "Người gửi cuối: tin" → KHÔNG nhầm tên nhóm với người nhắn.
                    let preview = c.last_msg_text || '';
                    if (group && preview) {
                        const who =
                            c.last_msg_sender_uid === 'me' ? 'Bạn' : c.last_sender_name || '';
                        if (who && who !== name) preview = `${who}: ${preview}`;
                    }
                    return `<div class="wz-conv-item ${String(c.id) === String(state.conv.activeId) ? 'is-active' : ''}${c.is_muted ? ' is-muted' : ''}" data-id="${c.id}" role="button" tabindex="0" aria-label="Hội thoại với ${esc(name)}">
                ${avatarHtml(c.avatar_url, name, 'wz-conv-av' + (group ? ' is-group' : ''))}
                <div class="wz-conv-meta">
                    <div class="wz-conv-name">${c.is_pinned ? '<i data-lucide="pin" class="wz-conv-ic"></i>' : ''}<span class="wz-conv-nametext">${esc(name)}</span>${c.is_muted ? '<i data-lucide="bell-off" class="wz-conv-ic"></i>' : ''}</div>
                    <div class="wz-conv-last">${preview ? esc(preview.slice(0, 52)) : '<span class="wz-conv-empty">Chưa có tin nhắn</span>'}</div>
                </div>
                <div class="wz-conv-side">
                    ${c.unread_count > 0 ? `<span class="wz-conv-unread">${c.unread_count}</span>` : ''}
                    <button class="wz-conv-menu" data-id="${c.id}" type="button" title="Tùy chọn" aria-label="Tùy chọn hội thoại"><i data-lucide="more-horizontal"></i></button>
                </div>
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

    let _view = null; // controller hội thoại đang mở (WZChat.mountConversation — shared)

    async function openConversation(id) {
        window.WZApp.zaloNotify?.ensurePermission(); // user gesture → xin quyền Web Notification
        state.conv.activeId = id;
        if (_view) {
            _view.destroy();
            _view = null;
        }
        renderConvList(); // highlight hội thoại active
        // id từ dataset (Number) vs c.id (BIGINT → string từ pg) → so sánh dạng String.
        const conv = state.conv.list.find((c) => String(c.id) === String(id));
        if (!conv) {
            $('#wzChatMain').innerHTML =
                `<div class="wz-chat-empty">Không tìm thấy hội thoại</div>`;
            renderInfoPanel(null);
            return;
        }
        state.conv.activeConv = conv;
        if (window.WZChat && window.WZChat.mountConversation) {
            // Toàn bộ khung chat (tin/composer/realtime/tools) do controller shared lo.
            _view = window.WZChat.mountConversation($('#wzChatMain'), conv, {
                getForwardTargets: () => state.conv.list,
            });
        } else {
            $('#wzChatMain').innerHTML = `<div class="wz-chat-empty">Đang tải khung chat…</div>`;
        }
        renderInfoPanel(conv);
    }

    // ── Cột thông tin (panel phải, giống Zalo PC) ───────────────────────────
    // Hiện avatar/tên/loại + SĐT/UID/tài khoản. Pin/mute/media tabs sẽ bổ sung
    // ở bước conv-mgmt (Phase 2). Toggle ẩn/hiện qua nút trên header panel.
    function renderInfoPanel(conv) {
        const box = $('#wzInfoPanel');
        if (!box) return;
        if (!conv) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        const group = conv.thread_type === 'group';
        const name = conv.display_name || (group ? 'Nhóm Zalo' : 'Khách Zalo');
        const acc = state.accounts.find((a) => a.accountKey === conv.account_key);
        const accName = acc ? acc.displayName || acc.label || 'Tài khoản' : conv.account_key || '—';
        const row = (ic, label, val) =>
            val
                ? `<div class="wz-info-row"><i data-lucide="${ic}"></i><span class="wz-info-k">${esc(label)}</span><span class="wz-info-v">${esc(String(val))}</span></div>`
                : '';
        box.hidden = false;
        box.innerHTML = `
            <div class="wz-info-top">
                <button class="wz-iconbtn wz-info-x" type="button" data-act="info-close" aria-label="Ẩn thông tin" title="Ẩn"><i data-lucide="panel-right-close"></i></button>
            </div>
            <div class="wz-info-hd">
                ${avatarHtml(conv.avatar_url, name, 'wz-info-av' + (group ? ' is-group' : ''))}
                <div class="wz-info-name">${esc(name)}</div>
                <div class="wz-info-type">${group ? '<i data-lucide="users"></i> Nhóm' : '<i data-lucide="user"></i> Cá nhân'}</div>
            </div>
            <div class="wz-info-rows">
                ${row('phone', 'SĐT', conv.phone)}
                ${row('hash', 'UID', conv.zalo_uid || conv.thread_id)}
                ${row('at-sign', 'Tài khoản', accName)}
            </div>`;
        const x = box.querySelector('[data-act="info-close"]');
        if (x) x.addEventListener('click', () => renderInfoPanel(null));
        if (window.lucide) lucide.createIcons();
    }

    // ── Context menu hội thoại: ghim / tắt thông báo / đánh dấu chưa đọc ────
    function _closeConvMenu() {
        document.querySelector('.wz-ctx-menu')?.remove();
        document.removeEventListener('click', _closeConvMenu, true);
    }
    function openConvMenu(btn, id) {
        _closeConvMenu();
        const conv = state.conv.list.find((c) => String(c.id) === String(id));
        if (!conv) return;
        const pinned = !!conv.is_pinned;
        const muted = !!conv.is_muted;
        const unread = (conv.unread_count || 0) > 0;
        const menu = document.createElement('div');
        menu.className = 'wz-ctx-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = `
            <button data-mact="pin" role="menuitem"><i data-lucide="pin"></i> ${pinned ? 'Bỏ ghim' : 'Ghim hội thoại'}</button>
            <button data-mact="mute" role="menuitem"><i data-lucide="${muted ? 'bell' : 'bell-off'}"></i> ${muted ? 'Bật thông báo' : 'Tắt thông báo'}</button>
            <button data-mact="mark" role="menuitem"><i data-lucide="${unread ? 'mail-open' : 'mail'}"></i> ${unread ? 'Đánh dấu đã đọc' : 'Đánh dấu chưa đọc'}</button>`;
        document.body.appendChild(menu);
        const r = btn.getBoundingClientRect();
        menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
        menu.style.left = Math.min(r.left - 40, window.innerWidth - menu.offsetWidth - 8) + 'px';
        if (window.lucide) lucide.createIcons();
        menu.addEventListener('click', (e) => {
            const b = e.target.closest('[data-mact]');
            if (!b) return;
            e.stopPropagation();
            _convAction(b.dataset.mact, conv);
            _closeConvMenu();
        });
        setTimeout(() => document.addEventListener('click', _closeConvMenu, true), 0);
    }
    // UI-first (Web2Optimistic) — đổi cờ + render ngay, gọi API nền, rollback nếu lỗi.
    function _convAction(act, conv) {
        const api = window.ZaloApi;
        const snap = {
            is_pinned: conv.is_pinned,
            is_muted: conv.is_muted,
            unread_count: conv.unread_count,
        };
        const apply = () => {
            if (act === 'pin') conv.is_pinned = !conv.is_pinned;
            else if (act === 'mute') conv.is_muted = !conv.is_muted;
            else if (act === 'mark') conv.unread_count = (conv.unread_count || 0) > 0 ? 0 : 1;
            renderConvList();
        };
        const run = () =>
            act === 'pin'
                ? api.pinConversation(conv.id, !snap.is_pinned)
                : act === 'mute'
                  ? api.muteConversation(conv.id, !snap.is_muted)
                  : api.markConversation(conv.id, !((snap.unread_count || 0) > 0));
        const rollback = () => {
            Object.assign(conv, snap);
            renderConvList();
        };
        if (window.Web2Optimistic?.run) {
            window.Web2Optimistic.run({
                snapshot: snap,
                apply,
                run,
                onSuccess: () => loadConversations(),
                rollback,
                errLabel: 'Cập nhật hội thoại',
            });
        } else {
            apply();
            run()
                .then(() => loadConversations())
                .catch((e) => {
                    rollback();
                    notify('✗ ' + e.message, 'error');
                });
        }
    }

    // ── Export ─────────────────────────────────────────────────────────────
    WZApp.fillAccountSelect = fillAccountSelect;
    WZApp.loadConversations = loadConversations;
    WZApp.openConversation = openConversation;
    WZApp.openConvMenu = openConvMenu;
})();
