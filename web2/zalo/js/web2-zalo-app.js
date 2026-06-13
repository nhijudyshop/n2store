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

    // ===================================================================
    // TABS
    // ===================================================================
    function switchTab(tab) {
        state.tab = tab;
        document
            .querySelectorAll('.wz-tab')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
        ['accounts', 'chat', 'lookup', 'zns'].forEach((t) => {
            const p = $('#wzPanel' + t[0].toUpperCase() + t.slice(1));
            if (p) p.hidden = t !== tab;
        });
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
    async function loadAccounts() {
        try {
            const res = await window.ZaloApi.status();
            state.zcaAvailable = res.zcaAvailable !== false;
            state.accounts = res.accounts || [];
            renderAccounts();
            renderStatusStrip(res);
        } catch (e) {
            $('#wzAccGrid').innerHTML = `<div class="wz-empty">✗ ${esc(e.message)}</div>`;
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
        const avatar = a.avatarUrl
            ? `<img class="wz-acc-avatar" src="${esc(a.avatarUrl)}" alt="">`
            : `<span class="wz-acc-avatar">${esc(initial(dn))}</span>`;
        const acts = [];
        if (t === 'personal') {
            if (a.status === 'connected') {
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="chat" data-key="${esc(a.accountKey)}"><i data-lucide="messages-square"></i> Chat</button>`
                );
                acts.push(
                    `<button class="wz-btn wz-btn-sm" data-act="disconnect" data-key="${esc(a.accountKey)}"><i data-lucide="power"></i></button>`
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
            `<button class="wz-btn wz-btn-sm" data-act="delete" data-key="${esc(a.accountKey)}" title="Xoá"><i data-lucide="trash-2"></i></button>`
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

    function renderAccounts() {
        const grid = $('#wzAccGrid');
        const cards = state.accounts.map(accCardHtml).join('');
        grid.innerHTML =
            cards +
            `<div class="wz-acc-card is-add" id="wzAddPersonal"><i data-lucide="user-plus"></i><div>Thêm tài khoản cá nhân</div></div>` +
            `<div class="wz-acc-card is-add" id="wzAddOa"><i data-lucide="badge-check"></i><div>Kết nối Zalo OA</div></div>`;
        if (window.lucide) lucide.createIcons();
    }

    async function onAccAction(act, key) {
        const a = state.accounts.find((x) => x.accountKey === key);
        try {
            if (act === 'qr') return startQr(key);
            if (act === 'reconnect') {
                notify('Đang kết nối lại…', 'info');
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
                notify('Đang đồng bộ template…', 'info');
                const r = await window.ZaloApi.syncTemplates(key);
                notify(`Đã đồng bộ ${r.synced || 0} template`, 'success');
            } else if (act === 'chat') {
                state.conv.accountKey = key;
                switchTab('chat');
            }
        } catch (e) {
            notify('✗ ' + e.message, 'error');
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
        state.qr.timer = setInterval(async () => {
            if (state.qr.key !== key) return clearInterval(state.qr.timer);
            try {
                const r = await window.ZaloApi.qr(key);
                if (r.image && $('#wzQrImg')) {
                    $('#wzQrImg').src = r.image;
                    $('#wzQrImg').style.visibility = 'visible';
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
            } catch {}
        }, 1500);
    }

    function openQrModal(msg) {
        $('#wzQrImg').src = '';
        $('#wzQrImg').style.visibility = 'hidden';
        $('#wzQrStatus').textContent = msg || '';
        $('#wzQrModal').hidden = false;
    }
    function closeQrModal() {
        clearInterval(state.qr.timer);
        state.qr.key = null;
        $('#wzQrModal').hidden = true;
    }

    async function addPersonal() {
        const label = (
            prompt('Tên gợi nhớ cho tài khoản Zalo (vd "Zalo shop phụ"):', 'Zalo shop') || ''
        ).trim();
        if (label === '') return;
        try {
            const r = await window.ZaloApi.createAccount(label);
            await loadAccounts();
            if (r.data?.accountKey) startQr(r.data.accountKey);
        } catch (e) {
            notify('✗ ' + e.message, 'error');
        }
    }

    // ── OA connect modal ─────────────────────────────────────────────────
    function openOaModal() {
        $('#wzOaModal').hidden = false;
    }
    function closeOaModal() {
        $('#wzOaModal').hidden = true;
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
        try {
            $('#wzOaSave').disabled = true;
            await window.ZaloApi.oaConnect(body);
            closeOaModal();
            notify('Đã kết nối Zalo OA', 'success');
            loadAccounts();
        } catch (e) {
            $('#wzOaErr').textContent = e.message;
        } finally {
            $('#wzOaSave').disabled = false;
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
                limit: 100,
            });
            state.conv.list = res.data || [];
            state.conv.total = res.total || 0;
            renderConvList();
        } catch (e) {
            $('#wzConvList').innerHTML = `<div class="wz-empty">✗ ${esc(e.message)}</div>`;
        }
    }

    function renderConvList() {
        const box = $('#wzConvList');
        const head = `<div class="wz-conv-search"><input id="wzConvSearch" type="search" placeholder="Tìm hội thoại…" value="${esc(state.conv.search)}"></div>`;
        if (!state.conv.list.length) {
            box.innerHTML =
                head +
                `<div class="wz-empty">Chưa có hội thoại.<br>Tin nhắn đến sẽ tự hiện ở đây.</div>`;
            bindConvSearch();
            return;
        }
        box.innerHTML =
            head +
            state.conv.list
                .map(
                    (
                        c
                    ) => `<div class="wz-conv-item ${c.id === state.conv.activeId ? 'is-active' : ''}" data-id="${c.id}">
                ${c.avatar_url ? `<img class="wz-conv-av" src="${esc(c.avatar_url)}">` : `<span class="wz-conv-av">${esc(initial(c.display_name))}</span>`}
                <div class="wz-conv-meta">
                    <div class="wz-conv-name">${esc(c.display_name || c.zalo_uid || c.thread_id)}</div>
                    <div class="wz-conv-last">${esc((c.last_msg_text || '').slice(0, 40))}</div>
                </div>
                ${c.unread_count > 0 ? `<span class="wz-conv-unread">${c.unread_count}</span>` : ''}
            </div>`
                )
                .join('');
        bindConvSearch();
    }

    function bindConvSearch() {
        const inp = $('#wzConvSearch');
        if (!inp) return;
        let t;
        inp.addEventListener('input', (e) => {
            clearTimeout(t);
            t = setTimeout(() => {
                state.conv.search = e.target.value.trim();
                loadConversations();
            }, 300);
        });
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
            state.conv.activeConv = res.conversation;
            state.conv.messages = res.data || [];
            renderChat();
            if (window.Web2SSE?.subscribe)
                _convUnsub = window.Web2SSE.subscribe(`web2:zalo:conv:${id}`, () =>
                    refreshActiveMessages()
                );
        } catch (e) {
            $('#wzChatMain').innerHTML = `<div class="wz-chat-empty">✗ ${esc(e.message)}</div>`;
        }
    }

    async function refreshActiveMessages() {
        if (!state.conv.activeId) return;
        try {
            const res = await window.ZaloApi.messages(state.conv.activeId, 100);
            state.conv.messages = res.data || [];
            renderChat(true);
        } catch {}
    }

    function renderChat(keepScroll) {
        const main = $('#wzChatMain');
        const c = state.conv.activeConv;
        if (!c) {
            main.innerHTML = `<div class="wz-chat-empty">Chọn một hội thoại để xem tin nhắn</div>`;
            return;
        }
        const bubbles = state.conv.messages
            .map(
                (m) => `<div class="wz-msg ${m.direction === 'out' ? 'out' : 'in'}">
            ${esc(m.content || '')}
            <div class="wz-msg-time">${fmtTime(m.sent_at)}</div>
        </div>`
            )
            .join('');
        main.innerHTML = `
            <div class="wz-chat-head">
                ${c.avatar_url ? `<img class="wz-conv-av" style="width:32px;height:32px" src="${esc(c.avatar_url)}">` : `<span class="wz-conv-av" style="width:32px;height:32px">${esc(initial(c.display_name))}</span>`}
                <span>${esc(c.display_name || c.zalo_uid || c.thread_id)}</span>
            </div>
            <div class="wz-chat-body" id="wzChatBody">${bubbles || '<div class="wz-chat-empty">Chưa có tin nhắn</div>'}</div>
            <div class="wz-chat-compose">
                <textarea id="wzComposeInput" rows="1" placeholder="Nhập tin nhắn… (Enter để gửi)"></textarea>
                <button class="wz-btn wz-btn-primary" id="wzComposeSend"><i data-lucide="send"></i></button>
            </div>`;
        if (window.lucide) lucide.createIcons();
        const body = $('#wzChatBody');
        if (body) body.scrollTop = body.scrollHeight;
        $('#wzComposeSend')?.addEventListener('click', sendChat);
        $('#wzComposeInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
            }
        });
    }

    async function sendChat() {
        const inp = $('#wzComposeInput');
        const text = inp.value.trim();
        const c = state.conv.activeConv;
        if (!text || !c) return;
        inp.value = '';
        // UI-first: append bubble ngay
        state.conv.messages.push({ direction: 'out', content: text, sent_at: Date.now() });
        renderChat();
        try {
            await window.ZaloApi.sendMessage({
                accountKey: c.account_key,
                threadId: c.thread_id,
                text,
                threadType: c.thread_type,
            });
        } catch (e) {
            notify('✗ Gửi lỗi: ' + e.message, 'error');
            refreshActiveMessages();
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
                ${u.avatar ? `<img src="${esc(u.avatar)}">` : `<span class="wz-acc-avatar" style="width:64px;height:64px;font-size:24px">${esc(initial(u.displayName || u.zaloName))}</span>`}
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
                ${u.avatar ? `<img src="${esc(u.avatar)}">` : `<span class="wz-acc-avatar" style="width:64px;height:64px;font-size:24px">${esc(initial(u.displayName))}</span>`}
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
        try {
            $('#wzZnsSend').disabled = true;
            const sentBy = window.Web2UserInfo?.get?.('web2/zalo')?.userName || null;
            await window.ZaloApi.sendZns({ phone, templateId, data, sentBy });
            notify('Đã gửi ZNS', 'success');
            $('#wzZnsPhone').value = '';
            loadZnsLog();
        } catch (e) {
            errEl.textContent = e.message;
        } finally {
            $('#wzZnsSend').disabled = false;
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
        document
            .querySelectorAll('.wz-tab')
            .forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

        // account grid (delegated)
        $('#wzAccGrid').addEventListener('click', (e) => {
            if (e.target.closest('#wzAddPersonal')) return addPersonal();
            if (e.target.closest('#wzAddOa')) return openOaModal();
            const btn = e.target.closest('[data-act]');
            if (btn) onAccAction(btn.dataset.act, btn.dataset.key);
        });

        // QR modal
        $('#wzQrClose').addEventListener('click', closeQrModal);
        $('#wzQrBackdrop').addEventListener('click', closeQrModal);

        // OA modal
        $('#wzOaClose').addEventListener('click', closeOaModal);
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
                if (!$('#wzQrModal').hidden) closeQrModal();
                if (!$('#wzOaModal').hidden) closeOaModal();
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
