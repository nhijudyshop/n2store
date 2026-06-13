// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Custom Popup (alert / confirm / prompt)
// =====================================================
//
// Replaces native window.alert / confirm / prompt with a styled modal that
// matches the Web 2.0 theme. Promise-based API so callers must use await.
//
// Public API (window.Popup):
//   await Popup.alert(message, opts?)               → Promise<void>
//   await Popup.confirm(message, opts?)             → Promise<boolean>
//   await Popup.prompt(message, opts?)              → Promise<string|null>
//
// opts:
//   title?: string           — header text (defaults by kind)
//   type?: 'info'|'success'|'warning'|'error'  — color + icon
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
            @keyframes w2pFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes w2pPop {
                from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)     scale(1); }
            }
            #web2-popup-root.is-closing .w2p-backdrop { animation: w2pFadeIn 100ms ease-in reverse; }

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

    // Shared modal renderer. `kind` = 'alert' | 'confirm' | 'prompt'.
    function open(kind, message, opts = {}) {
        ensureStyles();
        const root = ensureRoot();
        const type = opts.type || (kind === 'confirm' ? 'question' : 'info');
        const colors = TYPE_COLORS[type] || TYPE_COLORS.info;
        const iconName = ICONS[type] || ICONS.info;
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
        modal.style.setProperty('--w2p-accent', colors.accent);

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
                <button type="button" class="w2p-btn w2p-btn-primary" data-action="ok"></button>
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
        if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
        if (inputEl) setTimeout(() => inputEl.focus(), 30);
        else setTimeout(() => modal.querySelector('[data-action="ok"]').focus(), 30);

        return new Promise((resolve) => {
            const cleanup = () => {
                if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
                document.removeEventListener('keydown', onKey);
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
                if (e.key === 'Escape') {
                    e.preventDefault();
                    finishCancel();
                } else if (
                    e.key === 'Enter' &&
                    !(opts.multiline && e.target === inputEl && !e.metaKey && !e.ctrlKey)
                ) {
                    // For multiline, only Ctrl/Cmd+Enter submits — plain Enter inserts newline
                    e.preventDefault();
                    finishOk();
                }
            };
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
        // Convenience for the most common pattern: try/catch wrapping success/error toasts.
        error: (msg, opts) => open('alert', msg, { ...opts, type: 'error' }),
        success: (msg, opts) => open('alert', msg, { ...opts, type: 'success' }),
        warning: (msg, opts) => open('alert', msg, { ...opts, type: 'warning' }),
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
