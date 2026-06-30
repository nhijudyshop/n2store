// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — Web2Zalo helper (single-source Zalo).
// =====================================================================
// Web2Zalo — cổng DUY NHẤT để mọi trang Web 2.0 dùng Zalo.
// KHÔNG trang nào gọi Zalo API trực tiếp — tất cả qua /api/web2-zalo/* (nguồn
// duy nhất = trang web2/zalo/). Mirror pattern Web2WalletBalance.attachBalances.
//
// API:
//   Web2Zalo.sendZNS({ phone, templateId, data, orderRef })   → Promise
//   Web2Zalo.sendMessage({ accountKey, threadId, text })      → Promise (zca)
//   Web2Zalo.getConversation(phone)                           → Promise (DB)
//   Web2Zalo.openChat(phoneOrId)                              → mở trang web2/zalo
//   Web2Zalo.attachZaloButtons(root)                          → quét [data-w2zalo-phone]
//   Web2Zalo.status()                                         → Promise
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2Zalo) return;

    // Thư mục shared (suy từ src của chính script này) → load engine chat động.
    const _selfSrc = (document.currentScript && document.currentScript.src) || '';
    const SHARED_BASE = _selfSrc.replace(/\/web2-zalo\.js(?:\?.*)?$/, '') || '../shared';
    const ENGINE_VER = '20260622p6';

    const WORKER =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER + '/api/web2-zalo';
    const DIRECT_BASE = 'https://web2-api-kv04.onrender.com/api/web2-zalo';

    // GLOBAL (2026-06-29): 1 tài khoản Zalo dùng chung cả dự án (bỏ per-máy). owner =
    // hằng số '__global__' → mọi trang/máy tính ra cùng SSE topic (kể cả chat nhúng).
    function _zaloOwner() {
        if (global.Web2ZaloOwner) return global.Web2ZaloOwner();
        return '__global__';
    }
    function _authHeaders() {
        const h = { 'x-web2-zalo-owner': _zaloOwner() };
        if (global.Web2Auth?.authHeaders) return Object.assign(h, global.Web2Auth.authHeaders());
        try {
            const t =
                global.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_auth') || '{}')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {}
        return h;
    }

    async function _fetch(path, options = {}) {
        const headers = {
            Accept: 'application/json',
            ..._authHeaders(),
            ...(options.headers || {}),
        };
        let lastErr = null;
        for (const base of [BASE, DIRECT_BASE]) {
            let res;
            try {
                res = await fetch(base + path, { ...options, headers });
            } catch (e) {
                lastErr = e; // lỗi mạng/CORS → thử base kế
                continue;
            }
            let data = {};
            try {
                data = (await res.json()) || {};
            } catch {}
            if (res.status >= 500) {
                lastErr = new Error(data.error || `HTTP ${res.status}`);
                continue; // server lỗi → thử fallback base
            }
            // 4xx HOẶC 200 {success:false} → throw (caller catch xử lý), KHÔNG double-hit
            if (!res.ok || data.success === false) {
                throw new Error(data.error || `HTTP ${res.status}`);
            }
            return data;
        }
        console.warn('[Web2Zalo] fetch fail', path, lastErr?.message);
        throw lastErr || new Error('Network error');
    }

    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        let s = String(p || '').replace(/\D/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    // ── Public API ────────────────────────────────────────────────────────
    async function sendZNS({ phone, templateId, data, orderRef, customerId } = {}) {
        const p = normPhone(phone);
        if (!p || p.length < 9) throw new Error('Web2Zalo.sendZNS: SĐT không hợp lệ');
        if (!templateId) throw new Error('Web2Zalo.sendZNS: thiếu templateId');
        return _fetch('/send-zns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: p, templateId, data: data || {}, orderRef, customerId }),
        });
    }

    async function sendMessage({ accountKey, threadId, text, threadType } = {}) {
        if (!accountKey || !threadId || !text)
            throw new Error('Web2Zalo.sendMessage: thiếu accountKey/threadId/text');
        return _fetch('/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountKey, threadId, text: String(text).trim(), threadType }),
        });
    }

    async function getConversation(phone, accountKey) {
        const p = normPhone(phone);
        if (!p) throw new Error('Web2Zalo.getConversation: SĐT không hợp lệ');
        // accountKey → ?account= ưu tiên hội thoại dưới TK đó (TK cookie). Không → TK chính.
        const qs = accountKey ? '?account=' + encodeURIComponent(accountKey) : '';
        return _fetch('/conversation/' + encodeURIComponent(p) + qs);
    }

    async function status() {
        return _fetch('/status');
    }

    // Mở trang Zalo (NGUỒN DUY NHẤT), focus theo SĐT — không deep-link ngoài.
    function openChat(phoneOrId) {
        const p = normPhone(phoneOrId) || String(phoneOrId || '').trim();
        const url =
            `${global.location.origin}/web2/zalo/index.html` +
            (p ? `?focus=${encodeURIComponent(p)}` : '');
        global.open(url, '_blank', 'noopener,noreferrer');
    }

    // ── attachZaloButtons(root) — drop-in nút Zalo (giống wallet pill) ──────
    function ensureStyles() {
        if (document.getElementById('w2z-styles')) return;
        const s = document.createElement('style');
        s.id = 'w2z-styles';
        s.textContent = `
            .w2z-btn{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;
                font-size:11px;font-weight:600;line-height:1.5;white-space:nowrap;cursor:pointer;
                background:#e1f0ff;color:#0068ff;border:1px solid #b6dbff;text-decoration:none;
                transition:filter .12s ease,box-shadow .12s ease}
            .w2z-btn:hover{filter:brightness(.97);box-shadow:0 1px 4px rgba(0,104,255,.22)}
            .w2z-btn svg{flex-shrink:0}`;
        document.head.appendChild(s);
    }

    function _btnHtml(phone) {
        return `<span class="w2z-btn" role="button" tabindex="0" data-w2z-phone="${phone}" title="Zalo: ${phone}" aria-label="Zalo ${phone}">
            <svg width="13" height="13" viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M24 4C12.4 4 3 12.7 3 23.4c0 6 3 11.3 7.7 14.8L9 44l6.6-2.8c2.6.9 5.4 1.4 8.4 1.4 11.6 0 21-8.7 21-19.2S35.6 4 24 4z"/></svg>
            Zalo</span>`;
    }

    function attachZaloButtons(root) {
        const r = root || document;
        ensureStyles();
        const els = Array.from(r.querySelectorAll('[data-w2zalo-phone]')).filter(
            (el) => !el.dataset.w2zDone
        );
        els.forEach((el) => {
            const phone = normPhone(el.getAttribute('data-w2zalo-phone'));
            el.dataset.w2zDone = '1';
            if (phone && phone.length >= 9) el.innerHTML = _btnHtml(phone);
        });
    }

    function _wireClick() {
        if (global.__w2zClickWired) return;
        global.__w2zClickWired = true;
        document.addEventListener(
            'click',
            (e) => {
                const btn = e.target.closest?.('.w2z-btn');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const phone = btn.dataset.w2zPhone || '';
                if (phone) openChat(phone);
            },
            true
        );
    }
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', _wireClick);
    else _wireClick();

    // ── Chat engine loader (cho trang khác chỉ include web2-zalo.js) ───────
    const ENGINE_JS = [
        'web2-zalo-api.js',
        'zalo-chat/chat-store.js',
        'zalo-chat/lightbox.js',
        'zalo-chat/emoji-picker.js',
        'zalo-chat/sticker-picker.js',
        'zalo-chat/reactions.js',
        'zalo-chat/bubbles.js',
        'zalo-chat/composer.js',
        'zalo-chat/realtime.js',
        'zalo-chat/chat-actions.js',
        'zalo-chat/chat-view.js',
    ];
    const ENGINE_CSS = [
        'zalo-chat/chat-bubbles.css',
        'zalo-chat/chat-composer.css',
        'zalo-chat/chat-lightbox.css',
    ];
    function _hasScript(url) {
        const base = url.split('?')[0];
        return Array.from(document.scripts).some((s) => s.src && s.src.indexOf(base) !== -1);
    }
    function _loadScript(url) {
        return new Promise((res, rej) => {
            if (_hasScript(url)) return res();
            const el = document.createElement('script');
            el.src = url;
            el.onload = res;
            el.onerror = () => rej(new Error('Không tải được ' + url));
            document.head.appendChild(el);
        });
    }
    function _loadCss(url) {
        const base = url.split('?')[0];
        const has = Array.from(document.querySelectorAll('link[rel=stylesheet]')).some(
            (l) => l.href && l.href.indexOf(base) !== -1
        );
        if (has) return;
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = url;
        document.head.appendChild(l);
    }
    let _enginePromise = null;
    function loadChatEngine() {
        if (global.WZChat && global.WZChat.mountConversation) return Promise.resolve();
        if (_enginePromise) return _enginePromise;
        _enginePromise = (async () => {
            // deps tuỳ chọn: lucide (icon), SSE bridge (realtime)
            if (!global.lucide)
                await _loadScript('https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js').catch(
                    () => {}
                );
            if (!global.Web2SSE)
                await _loadScript(`${SHARED_BASE}/web2-sse-bridge.js?v=${ENGINE_VER}`).catch(
                    () => {}
                );
            ENGINE_CSS.forEach((c) => _loadCss(`${SHARED_BASE}/${c}?v=${ENGINE_VER}`));
            for (const j of ENGINE_JS) await _loadScript(`${SHARED_BASE}/${j}?v=${ENGINE_VER}`);
            if (global.lucide)
                try {
                    global.lucide.createIcons();
                } catch {}
        })();
        return _enginePromise;
    }

    // ── mountChat(container, opts) — nhúng 1 hội thoại Zalo vào trang khác ──
    //   opts: { conv } | { convId } | { phone }  (+ getForwardTargets?)
    async function mountChat(container, opts = {}) {
        const el = typeof container === 'string' ? document.querySelector(container) : container;
        if (!el) throw new Error('Web2Zalo.mountChat: container không tồn tại');
        el.innerHTML = '<div class="wz-chat-empty">Đang tải hội thoại…</div>';
        await loadChatEngine();
        let conv = opts.conv || null;
        if (!conv && opts.phone) {
            // preferAccountKey (TK cookie) → resolve hội thoại 1-1 dưới TK đó để gửi
            // từ đúng TK đang đăng nhập chat.zalo.me. Không có → backend dùng TK chính.
            const prefer = opts.preferAccountKey || null;
            const r = await getConversation(opts.phone, prefer).catch(() => ({}));
            conv = r.data || null;
            // Chưa từng chat → tìm user Zalo theo SĐT + tạo hội thoại rỗng để chat ngay.
            if (!conv && opts.ensure !== false) {
                const e = await _fetch('/conversation/ensure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: normPhone(opts.phone),
                        accountKey: prefer || undefined,
                    }),
                }).catch(() => ({}));
                conv = (e && e.data) || null;
                if (!conv && e && e.error) opts._ensureErr = e.error;
                if (!conv && e && e.needLogin) opts._needLogin = true;
            }
        }
        if (!conv && opts.convId) {
            const r = await global.ZaloApi.messages(opts.convId, 1).catch(() => ({}));
            conv = r.conversation || null;
        }
        if (!conv || !conv.id) {
            // Per-máy: máy chưa đăng nhập Zalo → hướng dẫn mở chat.zalo.me + Đăng nhập Zalo.
            el.innerHTML = opts._needLogin
                ? '<div class="wz-chat-empty"><b>Máy này chưa đăng nhập Zalo.</b><br>Mở <a href="https://chat.zalo.me/" target="_blank" rel="noopener">chat.zalo.me</a> + đăng nhập, rồi vào trang <a href="../web2/zalo/index.html" target="_blank">Zalo</a> bấm <b>Đăng nhập Zalo</b> trên máy này.</div>'
                : '<div class="wz-chat-empty">Chưa có hội thoại Zalo' +
                  (opts.phone ? ' với SĐT ' + normPhone(opts.phone) : '') +
                  (opts._ensureErr ? ' — ' + opts._ensureErr : '') +
                  '.</div>';
            return null;
        }
        return global.WZChat.mountConversation(el, conv, {
            getForwardTargets: opts.getForwardTargets,
            autoSeen: opts.autoSeen,
        });
    }

    // 2026-06-20: TK web2 ĐANG KẾT NỐI khớp TK đang đăng nhập chat.zalo.me (cookie)
    // → caller ưu tiên dùng TK này để gửi tin (thay vì luôn is_primary). Chưa kết nối
    // nhưng có cookie → tự cookie-login (reconnect slot cũ / tạo slot mới — user chốt).
    // Không có ext/cookie/uid → null (caller fallback TK chính). Cache 30s.
    let _cookieAcc = { ts: 0, key: undefined };
    async function getCookieAccountKey(opts = {}) {
        const now = Date.now();
        if (!opts.force && _cookieAcc.key !== undefined && now - _cookieAcc.ts < 30000) {
            return _cookieAcc.key;
        }
        let key = null;
        try {
            const ext = global.Web2Ext;
            if (ext?.hasExtension?.()) {
                const r = await ext.request('GET_ZALO_CREDS', {}, 12000);
                const d = (r && r.data) || {};
                const uid = d.uid ? String(d.uid) : null;
                if (uid) {
                    await loadChatEngine(); // đảm bảo ZaloApi có mặt
                    const Api = global.ZaloApi;
                    const st = await status().catch(() => null);
                    const accs = (st && st.accounts) || [];
                    const byUid = accs.filter(
                        (a) =>
                            (a.accountType || a.account_type) === 'personal' &&
                            String(a.zaloUid || a.zalo_uid || '') === uid
                    );
                    const connected = byUid.find((a) => a.status === 'connected');
                    if (connected) {
                        key = connected.accountKey || connected.account_key;
                    } else if (Api && d.cookie && d.imei) {
                        const creds = {
                            cookie: d.cookie,
                            imei: d.imei,
                            userAgent: d.userAgent,
                            expectedUid: uid,
                        };
                        if (byUid[0]) {
                            // slot tồn tại nhưng chưa kết nối → cookie-login lại slot đó.
                            const slot = byUid[0].accountKey || byUid[0].account_key;
                            await Api.loginCookie(slot, creds).catch(() => {});
                            key = slot;
                        } else if (opts.autoLogin !== false) {
                            // chưa có slot cho uid → tạo mới + cookie-login (tự đăng nhập).
                            const cr = await Api.createAccount('Zalo (cookie)').catch(() => null);
                            const nk = cr && cr.data && cr.data.accountKey;
                            if (nk) {
                                await Api.loginCookie(nk, {
                                    cookie: d.cookie,
                                    imei: d.imei,
                                    userAgent: d.userAgent,
                                }).catch(() => {});
                                key = nk;
                            }
                        }
                    }
                }
            }
        } catch (_) {}
        _cookieAcc = { ts: now, key };
        return key;
    }

    global.Web2Zalo = {
        sendZNS,
        sendMessage,
        getConversation,
        status,
        openChat,
        attachZaloButtons,
        normPhone,
        loadChatEngine,
        mountChat,
        getCookieAccountKey,
    };
})(window);
