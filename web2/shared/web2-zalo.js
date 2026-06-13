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

    const WORKER =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = WORKER + '/api/web2-zalo';
    const DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2-zalo';

    function _authHeaders() {
        try {
            const t =
                global.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_auth') || '{}')?.token;
            return t ? { 'x-web2-token': t } : {};
        } catch {
            return {};
        }
    }

    async function _fetch(path, options = {}) {
        const run = async (base) => {
            const res = await fetch(base + path, {
                ...options,
                headers: {
                    Accept: 'application/json',
                    ..._authHeaders(),
                    ...(options.headers || {}),
                },
            });
            let data = null;
            try {
                data = await res.json();
            } catch {}
            if (!res.ok && data?.success !== true) {
                if (res.status >= 400 && res.status < 500 && data?.error) return data;
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
            return data;
        };
        try {
            return await run(BASE);
        } catch (e) {
            try {
                return await run(DIRECT_BASE);
            } catch (e2) {
                console.warn('[Web2Zalo] fetch fail', path, e2.message);
                throw e2;
            }
        }
    }

    function normPhone(p) {
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

    async function getConversation(phone) {
        const p = normPhone(phone);
        if (!p) throw new Error('Web2Zalo.getConversation: SĐT không hợp lệ');
        return _fetch('/conversation/' + encodeURIComponent(p));
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

    global.Web2Zalo = {
        sendZNS,
        sendMessage,
        getConversation,
        status,
        openChat,
        attachZaloButtons,
        normPhone,
    };
})(window);
