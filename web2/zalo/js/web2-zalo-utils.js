// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Trang Zalo — base namespace (WZApp): DOM shorts, esc, avatar, modal a11y,
// constants (TZ, image regexes, STATUS_LABEL), shared mutable state.
// 4 tab: Tài khoản / Hội thoại / Tra cứu / ZNS. Giờ GMT+7.
// Các sub-module (accounts/chat/lookup-zns/app) extend window.WZApp.
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});

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
        disconnected: 'Ngắt kết nối',
        banned: 'Bị khoá',
        kicked: 'Bị giành phiên (mở nơi khác?)',
        reconnecting: 'Đang kết nối lại…',
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
    };
    const _autoSynced = new Set(); // account đã auto seed danh bạ (tránh lặp)

    // ── Export base API cho sub-modules ────────────────────────────────────
    WZApp.TZ = TZ;
    WZApp.$ = $;
    WZApp.esc = esc;
    WZApp.notify = notify;
    WZApp.initial = initial;
    WZApp.avatarHtml = avatarHtml;
    WZApp.IMG_URL_RE = IMG_URL_RE;
    WZApp.ZDN_IMG_RE = ZDN_IMG_RE;
    WZApp.URL_RE = URL_RE;
    WZApp.showModal = showModal;
    WZApp.hideModal = hideModal;
    WZApp.setBusy = setBusy;
    WZApp.fmtTime = fmtTime;
    WZApp.STATUS_LABEL = STATUS_LABEL;
    WZApp.state = state;
    WZApp._autoSynced = _autoSynced;
})();
