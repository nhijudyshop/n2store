// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Custom Popup (alert / confirm / prompt)
// =====================================================
//
// Replaces native window.alert / confirm / prompt with a styled modal that
// matches the Web 2.0 theme. Promise-based API so callers must use await.
//
// Public API (window.Popup) — TẤT CẢ trang Web 2.0 tham chiếu nguồn DUY NHẤT này
// (auto-load qua web2-sidebar.js). KHÔNG tự build alert/confirm/popup riêng.
//   await Popup.alert(message, opts?)               → Promise<void>
//   await Popup.success(message, opts?)             → Promise<void>   (type=success)
//   await Popup.error(message, opts?)               → Promise<void>   (type=error)
//   await Popup.warning(message, opts?)             → Promise<void>   (type=warning)
//   await Popup.info(message, opts?)                → Promise<void>   (type=info)
//   await Popup.confirm(message, opts?)             → Promise<boolean>
//   await Popup.danger(message, opts?)              → Promise<boolean> (confirm phá huỷ, nút đỏ)
//   await Popup.exit(message, opts?)                → Promise<boolean> (rời/thoát, "Thoát"/"Ở lại")
//   await Popup.prompt(message, opts?)              → Promise<string|null>
//
// opts:
//   title?: string           — header text (defaults by kind)
//   type?: 'info'|'success'|'warning'|'error'|'question'  — color + icon + hiệu ứng
//   danger?: boolean         — nút chính màu đỏ (thao tác phá huỷ; mặc định true cho danger/exit)
//   okText?: string          — primary button label
//   cancelText?: string      — secondary button label (confirm + prompt only)
//   defaultValue?: string    — prefilled input value (prompt only)
//   placeholder?: string     — input placeholder (prompt only)
//   multiline?: boolean      — render textarea (prompt only)
//
// Keyboard:
//   Enter        → confirm/submit
//   Escape       → cancel (resolves false / null / void)
//   Backdrop click → cancel
//
// Hiệu ứng: spring entrance, icon pop, ring pulse theo type, + burst Lottie
// (Web2Lottie.success()/error() khi có) — tự tắt khi prefers-reduced-motion.
//
// Backward-compat: window.alert / window.confirm / window.prompt are NOT
// overridden — call sites must explicitly switch to Popup.* so we keep a
// clear migration boundary.

(function () {
    'use strict';

    if (window.Popup) return; // idempotent

    const ICONS = {
        info: 'info',
        success: 'check-circle',
        warning: 'alert-triangle',
        error: 'alert-octagon',
        question: 'help-circle',
    };
    const TYPE_COLORS = {
        info: { bg: '#dbeafe', fg: '#1e40af', accent: '#3b82f6' },
        success: { bg: '#d1fae5', fg: '#065f46', accent: '#10b981' },
        warning: { bg: '#fef3c7', fg: '#92400e', accent: '#f59e0b' },
        error: { bg: '#fee2e2', fg: '#991b1b', accent: '#ef4444' },
        question: { bg: '#e8f2ff', fg: '#004bb5', accent: '#0068ff' },
    };
    const DANGER_ACCENT = '#ef4444';

    // audit r6 (2026-06-21): stack popup đang mở → onKey CHỈ xử lý popup trên cùng.
    // TRƯỚC đây mỗi open() gắn keydown trên document; 2 popup mở cùng lúc (vd confirm
    // huỷ đang chờ + 1 error popup async bật lên) thì Enter/Escape kích HOẠT cả hai →
    // resolve nhầm confirm (true) → chạy thao tác xoá/reset ngoài ý muốn.
    const _popupStack = [];

    // Body scroll-lock đếm chồng (nhiều popup lồng nhau) — iOS-safe pattern.
    let _openCount = 0;
    let _savedScrollY = 0;
    function lockScroll() {
        if (_openCount === 0) {
            _savedScrollY = window.scrollY || window.pageYOffset || 0;
            document.body.style.top = `-${_savedScrollY}px`;
            document.body.classList.add('w2p-scroll-lock');
        }
        _openCount++;
    }
    function unlockScroll() {
        _openCount = Math.max(0, _openCount - 1);
        if (_openCount === 0) {
            document.body.classList.remove('w2p-scroll-lock');
            document.body.style.top = '';
            window.scrollTo(0, _savedScrollY);
        }
    }

    function ensureRoot() {
        let root = document.getElementById('web2-popup-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'web2-popup-root';
            document.body.appendChild(root);
        }
        return root;
    }

    function ensureStyles() {
        if (document.getElementById('web2-popup-styles')) return;
        const style = document.createElement('style');
        style.id = 'web2-popup-styles';
        style.textContent = `
            #web2-popup-root .w2p-backdrop {
                position: fixed; inset: 0; z-index: 99999;
                /* Solid rgba — no backdrop-filter blur: blur recomputes per paint frame
                   when inner content scrolls, making nested-scroll modals feel laggy. */
                background: rgba(15, 23, 42, 0.65);
                display: flex; align-items: center; justify-content: center;
                padding: 16px;
                contain: layout style;
                animation: w2pFadeIn 120ms ease-out;
            }
            #web2-popup-root .w2p-modal {
                background: #fff;
                border-radius: 12px;
                max-width: 460px; width: 100%;
                box-shadow: 0 24px 64px rgba(0,0,0,0.25);
                overflow: hidden;
                font-family: Inter, system-ui, -apple-system, sans-serif;
                animation: w2pPop 180ms cubic-bezier(0.16, 1, 0.3, 1);
                transform: translateZ(0); /* own compositor layer */
                will-change: transform;
            }
            #web2-popup-root .w2p-header {
                display: flex; align-items: center; gap: 12px;
                padding: 18px 20px 14px;
                border-bottom: 1px solid #f1f5f9;
            }
            #web2-popup-root .w2p-icon {
                flex-shrink: 0;
                width: 40px; height: 40px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
            }
            #web2-popup-root .w2p-icon i { width: 22px; height: 22px; }
            #web2-popup-root .w2p-title {
                font-size: 15px; font-weight: 700; color: #0f172a;
                line-height: 1.3; margin: 0;
            }
            #web2-popup-root .w2p-body {
                padding: 14px 20px 8px;
                font-size: 14px; color: #334155; line-height: 1.55;
                white-space: pre-wrap; word-break: break-word;
            }
            #web2-popup-root .w2p-input,
            #web2-popup-root .w2p-textarea {
                width: 100%;
                margin-top: 12px;
                padding: 10px 12px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                font-size: 14px; font-family: inherit; color: #0f172a;
                background: #f8fafc;
                box-sizing: border-box;
                outline: none;
                transition: border-color 120ms, background 120ms;
            }
            #web2-popup-root .w2p-input:focus,
            #web2-popup-root .w2p-textarea:focus {
                border-color: var(--w2p-accent, #0068ff);
                background: #fff;
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--w2p-accent, #0068ff) 18%, transparent);
            }
            #web2-popup-root .w2p-textarea { resize: vertical; min-height: 90px; }
            #web2-popup-root .w2p-actions {
                padding: 12px 20px 18px;
                display: flex; justify-content: flex-end; gap: 8px;
            }
            #web2-popup-root .w2p-btn {
                padding: 8px 16px;
                border-radius: 8px;
                border: 1px solid transparent;
                font-size: 13px; font-weight: 600;
                cursor: pointer;
                transition: filter 100ms, transform 60ms;
                font-family: inherit;
            }
            #web2-popup-root .w2p-btn:hover { filter: brightness(0.95); }
            #web2-popup-root .w2p-btn:active { transform: translateY(1px); }
            #web2-popup-root .w2p-btn-primary {
                background: var(--w2p-accent, #0068ff);
                color: #fff;
            }
            #web2-popup-root .w2p-btn-secondary {
                background: #fff; color: #475569;
                border-color: #e2e8f0;
            }
            #web2-popup-root .w2p-btn-secondary:hover { background: #f8fafc; }
            #web2-popup-root .w2p-btn-danger {
                background: ${DANGER_ACCENT}; color: #fff;
            }
            #web2-popup-root .w2p-btn-primary:focus-visible,
            #web2-popup-root .w2p-btn-danger:focus-visible,
            #web2-popup-root .w2p-btn-secondary:focus-visible {
                outline: 2px solid var(--w2p-accent, #0068ff);
                outline-offset: 2px;
            }
            /* Icon ring pulse — nhịp nhẹ theo accent type */
            #web2-popup-root .w2p-icon {
                position: relative;
                animation: w2pIconPop 320ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
            }
            #web2-popup-root .w2p-icon::after {
                content: ''; position: absolute; inset: 0;
                border-radius: 50%;
                box-shadow: 0 0 0 0 var(--w2p-ring, rgba(0,104,255,0.35));
                animation: w2pRing 1400ms ease-out 200ms 1;
            }
            body.w2p-scroll-lock { position: fixed; left: 0; right: 0; width: 100%; overflow: hidden; }
            @keyframes w2pFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes w2pPop {
                from { opacity: 0; transform: translateY(-8px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0)     scale(1); }
            }
            @keyframes w2pIconPop {
                0%   { transform: scale(0.3); opacity: 0; }
                100% { transform: scale(1);   opacity: 1; }
            }
            @keyframes w2pRing {
                0%   { box-shadow: 0 0 0 0 var(--w2p-ring, rgba(0,104,255,0.35)); }
                100% { box-shadow: 0 0 0 14px rgba(0,0,0,0); }
            }
            #web2-popup-root.is-closing .w2p-backdrop { animation: w2pFadeIn 100ms ease-in reverse; }
            @media (prefers-reduced-motion: reduce) {
                #web2-popup-root .w2p-backdrop,
                #web2-popup-root .w2p-modal,
                #web2-popup-root .w2p-icon,
                #web2-popup-root .w2p-icon::after { animation: none !important; }
            }

            /* =====================================================
             * Reusable utility classes for ANY heavy / interactive modal
             * (not just Popup.alert/confirm/prompt). Use these instead of
             * inline styles when building custom popup forms so we keep
             * GPU-friendly layering everywhere.
             *
             *   .w2p-overlay        — full-screen backdrop (solid, no blur)
             *   .w2p-card           — white card on its own compositor layer
             *   .w2p-scroll-area    — overflow:auto container, contained paint
             *   .w2p-form-grid      — auto-responsive 2-col input grid
             *   .w2p-input          — standard input style
             *   .w2p-textarea       — standard textarea style
             *   .w2p-btn / -primary / -secondary  — buttons
             *
             * Why no backdrop-filter:blur:
             *   Blur recomputes on every paint frame when nested content
             *   scrolls — that's what made bulk-PBH modal feel laggy. A
             *   solid rgba background gives the same focus at near-zero cost.
             *   See docs/web2-modal-conventions.md for the full convention.
             * ===================================================== */
            .w2p-overlay {
                position: fixed; inset: 0; z-index: 99999;
                background: rgba(15, 23, 42, 0.65);
                display: flex; align-items: center; justify-content: center;
                padding: 16px;
                contain: layout style;
                animation: w2pFadeIn 120ms ease-out;
            }
            .w2p-card {
                background: #fff;
                border-radius: 12px;
                width: 100%;
                box-shadow: 0 24px 64px rgba(0,0,0,0.25);
                overflow: hidden;
                font-family: Inter, system-ui, -apple-system, sans-serif;
                transform: translateZ(0);
                will-change: transform;
            }
            .w2p-scroll-area {
                overflow-y: auto;
                overflow-x: hidden;
                contain: layout paint;
                transform: translateZ(0);
                -webkit-overflow-scrolling: touch;
            }
            .w2p-form-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px;
            }
            .w2p-input,
            .w2p-textarea,
            .w2p-select {
                width: 100%;
                padding: 8px 10px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                font-size: 13px;
                font-family: inherit;
                background: #fff;
                box-sizing: border-box;
                outline: none;
                transition: border-color 120ms, background 120ms;
            }
            .w2p-textarea { resize: vertical; min-height: 80px; }
            .w2p-input:focus, .w2p-textarea:focus, .w2p-select:focus {
                border-color: #0068ff;
                box-shadow: 0 0 0 3px rgba(0, 104, 255, 0.18);
            }
        `;
        document.head.appendChild(style);
    }

    function hexToRgba(hex, a) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
        if (!m) return `rgba(0,104,255,${a})`;
        return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
    }

    // Shared modal renderer. `kind` = 'alert' | 'confirm' | 'prompt'.
    function open(kind, message, opts = {}) {
        ensureStyles();
        const root = ensureRoot();
        const type = opts.type || (kind === 'confirm' ? 'question' : 'info');
        const colors = TYPE_COLORS[type] || TYPE_COLORS.info;
        const iconName = ICONS[type] || ICONS.info;
        const isDanger = !!opts.danger;
        const primaryAccent = isDanger ? DANGER_ACCENT : colors.accent;
        const defaultTitle =
            opts.title ||
            (kind === 'confirm' ? 'Xác nhận' : kind === 'prompt' ? 'Nhập thông tin' : 'Thông báo');
        const okText = opts.okText || (kind === 'confirm' ? 'Đồng ý' : 'OK');
        const cancelText = opts.cancelText || 'Huỷ';

        const backdrop = document.createElement('div');
        backdrop.className = 'w2p-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');

        const modal = document.createElement('div');
        modal.className = 'w2p-modal';
        modal.style.setProperty('--w2p-accent', primaryAccent);
        modal.style.setProperty('--w2p-ring', hexToRgba(colors.accent, 0.35));

        // Allow opts.message to be HTML-escaped — we always treat the message
        // as plain text (textContent) to avoid XSS surprises.
        const messageText = String(message ?? '');
        const showCancel = kind === 'confirm' || kind === 'prompt';
        const showInput = kind === 'prompt';

        modal.innerHTML = `
            <div class="w2p-header">
                <div class="w2p-icon" style="background:${colors.bg};color:${colors.fg};">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="w2p-title"></div>
            </div>
            <div class="w2p-body"></div>
            <div class="w2p-actions">
                ${showCancel ? `<button type="button" class="w2p-btn w2p-btn-secondary" data-action="cancel"></button>` : ''}
                <button type="button" class="w2p-btn ${isDanger ? 'w2p-btn-danger' : 'w2p-btn-primary'}" data-action="ok"></button>
            </div>
        `;
        modal.querySelector('.w2p-title').textContent = defaultTitle;
        const bodyEl = modal.querySelector('.w2p-body');
        bodyEl.textContent = messageText;

        let inputEl = null;
        if (showInput) {
            inputEl = document.createElement(opts.multiline ? 'textarea' : 'input');
            inputEl.className = opts.multiline ? 'w2p-textarea' : 'w2p-input';
            if (!opts.multiline) inputEl.type = 'text';
            if (opts.placeholder) inputEl.placeholder = opts.placeholder;
            if (opts.defaultValue != null) inputEl.value = String(opts.defaultValue);
            bodyEl.appendChild(inputEl);
        }

        if (showCancel) {
            modal.querySelector('[data-action="cancel"]').textContent = cancelText;
        }
        modal.querySelector('[data-action="ok"]').textContent = okText;

        backdrop.appendChild(modal);
        root.appendChild(backdrop);
        lockScroll();
        if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
        if (inputEl) setTimeout(() => inputEl.focus(), 30);
        else setTimeout(() => modal.querySelector('[data-action="ok"]').focus(), 30);

        // Hiệu ứng burst Lottie cho success/error (decorative, throttled, tự tắt
        // khi reduced-motion). Không chặn — chỉ tô điểm.
        try {
            if (window.Web2Lottie && window.Web2Lottie.enabled) {
                if (type === 'success') window.Web2Lottie.success();
                else if (type === 'error') window.Web2Lottie.error();
            }
        } catch (_) {
            /* lottie optional */
        }

        return new Promise((resolve) => {
            const cleanup = () => {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                document.removeEventListener('keydown', onKey);
                const si = _popupStack.indexOf(backdrop);
                if (si !== -1) _popupStack.splice(si, 1);
                unlockScroll();
            };
            const finishOk = () => {
                if (showInput) resolve(inputEl.value);
                else if (kind === 'confirm') resolve(true);
                else resolve();
                cleanup();
            };
            const finishCancel = () => {
                if (showInput) resolve(null);
                else if (kind === 'confirm') resolve(false);
                else resolve();
                cleanup();
            };
            const onKey = (e) => {
                // Chỉ popup TRÊN CÙNG nhận phím — tránh Enter/Escape resolve nhầm
                // popup phía dưới khi nhiều popup mở chồng.
                if (_popupStack[_popupStack.length - 1] !== backdrop) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    finishCancel();
                } else if (
                    e.key === 'Enter' &&
                    // Bỏ qua Enter khi đang gõ IME tiếng Việt (isComposing/keyCode 229):
                    // nhấn Enter xác nhận ứng viên bộ gõ sẽ submit prompt với chữ soạn dở.
                    !(e.isComposing || e.keyCode === 229) &&
                    !(opts.multiline && e.target === inputEl && !e.metaKey && !e.ctrlKey)
                ) {
                    // For multiline, only Ctrl/Cmd+Enter submits — plain Enter inserts newline
                    e.preventDefault();
                    finishOk();
                }
            };
            _popupStack.push(backdrop);
            document.addEventListener('keydown', onKey);
            modal.querySelector('[data-action="ok"]').addEventListener('click', finishOk);
            if (showCancel) {
                modal
                    .querySelector('[data-action="cancel"]')
                    .addEventListener('click', finishCancel);
            }
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) finishCancel();
            });
        });
    }

    window.Popup = {
        alert: (msg, opts) => open('alert', msg, opts),
        confirm: (msg, opts) => open('confirm', msg, opts),
        prompt: (msg, opts) => open('prompt', msg, opts),
        // Typed alerts (OK đơn) — màu + icon + hiệu ứng theo loại.
        info: (msg, opts) => open('alert', msg, { ...opts, type: 'info' }),
        error: (msg, opts) => open('alert', msg, { ...opts, type: 'error' }),
        success: (msg, opts) => open('alert', msg, { ...opts, type: 'success' }),
        warning: (msg, opts) => open('alert', msg, { ...opts, type: 'warning' }),
        // Confirm phá huỷ (nút đỏ). okText mặc định giữ 'Đồng ý' — caller có thể đổi 'Xoá'.
        danger: (msg, opts) => open('confirm', msg, { type: 'error', danger: true, ...opts }),
        // Xác nhận RỜI/THOÁT (rời trang, bỏ thay đổi…). "Thoát"/"Ở lại".
        exit: (msg, opts) =>
            open('confirm', msg, {
                type: 'warning',
                danger: true,
                title: 'Rời khỏi trang?',
                okText: 'Thoát',
                cancelText: 'Ở lại',
                ...opts,
            }),
        // Expose helper so custom modals can ensure utility classes are ready
        // before they render their own markup.
        ensureStyles,
    };

    // Inject utility classes immediately so any modal (even ones built outside
    // the Popup.* API) can use .w2p-overlay / .w2p-card / .w2p-scroll-area
    // without waiting for the first Popup call.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureStyles, { once: true });
    } else {
        ensureStyles();
    }
})();
