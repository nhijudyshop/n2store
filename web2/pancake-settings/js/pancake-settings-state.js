// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — Pancake settings: shared state + constants + utils
// =====================================================
//
// Manages the localStorage keys that Web2Chat reads:
//   pancake_jwt_token         (string)
//   pancake_jwt_token_expiry  (epoch seconds)
//   pancake_page_access_tokens ({ pageId: { token, ... } })
//
// All operations go through window.Web2Chat — no shared code
// with the web2-pancake module.
//
// Internal namespace `window.__PancakeSettings` (NS) holds the single
// source-of-truth mutable state + utilities. Loaded FIRST so the api/
// render/actions/app modules can attach onto it. Page exposes no public
// window.* API — the IIFE in pancake-settings.js wires DOM events only.

(function () {
    'use strict';

    const NS = (window.__PancakeSettings = window.__PancakeSettings || {});

    // ---- Shared mutable state (SINGLE source of truth) ----
    NS.state = {
        _pagesCache: null,
        _accountsCache: [],
        _refreshStatus: {}, // accountId → { has_creds, auto_refresh, login_identity, last_refresh_status }
        _credsKeyConfigured: false,
        _refreshStatusLoaded: false, // true once getRefreshStatus() đã resolve (tránh race "Gia hạn")
        _refreshStatusPromise: null, // promise đang load để await khi cần
        _credsAccountId: null,
        _relayAccounts: [],
    };

    // ---- Constants ----
    NS.REASON_MSG = {
        no_extension: 'Chưa phát hiện extension N2Store trong trình duyệt này',
        timeout: 'Extension không phản hồi (thử lại hoặc mở pancake.vn)',
        not_logged_in: 'Chưa đăng nhập pancake.vn trong trình duyệt này',
        apply_decode: 'Token lấy về không hợp lệ',
        apply_expired: 'Token trên pancake.vn cũng đã hết hạn — đăng nhập lại pancake.vn',
    };

    NS.RELAY_WORKER =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    // ---- Utils ----
    function $(id) {
        return document.getElementById(id);
    }

    function notify(msg, type) {
        if (window.notificationManager) {
            window.notificationManager[type || 'info'](msg);
        } else {
            console.log('[notify]', type, msg);
        }
    }

    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function shortToken(t) {
        if (!t) return '';
        return t.length > 40 ? t.slice(0, 20) + '…' + t.slice(-12) : t;
    }

    function formatExpiry(epochSec) {
        if (!epochSec) return 'không rõ';
        const d = new Date(epochSec * 1000);
        const now = Date.now() / 1000;
        const diff = epochSec - now;
        const days = Math.floor(diff / 86400);
        if (diff < 0) return `Hết hạn (${d.toLocaleString('vi-VN')})`;
        if (days < 30) return `${d.toLocaleString('vi-VN')} (còn ${days} ngày)`;
        return d.toLocaleString('vi-VN') + ' (còn ' + days + ' ngày)';
    }

    function _setBtnLoading(btn, label) {
        if (!btn) return;
        btn.dataset._html = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> ${escapeHtml(label)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function _restoreBtn(btn) {
        if (!btn || !btn.dataset._html) return;
        btn.disabled = false;
        btn.innerHTML = btn.dataset._html;
        delete btn.dataset._html;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Expose utils on namespace for sibling modules.
    NS.$ = $;
    NS.notify = notify;
    NS.escapeHtml = escapeHtml;
    NS.shortToken = shortToken;
    NS.formatExpiry = formatExpiry;
    NS._setBtnLoading = _setBtnLoading;
    NS._restoreBtn = _restoreBtn;
})();
