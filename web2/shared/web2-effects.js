// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Web 2.0 — Effects / animations library
// =====================================================
//
// Standalone helper exposing common UI animations for the
// Web 2.0 layer. Uses the native Web Animations API (no
// 3rd-party JS dep) so the whole module weighs <8 KB.
//
// Reference docs/web2-effects.md for the catalogue of effects
// + usage examples + recipe pages.
//
// Quick API (window.Web2Effects):
//
//   fadeIn(el, opts?)       fadeOut(el, opts?)
//   slideIn(el, dir, opts?) slideOut(el, dir, opts?)   dir: 'top'|'right'|'bottom'|'left'
//   pulse(el)               shake(el)                  bounce(el)
//   flash(el, color?)       highlightRow(el)
//   staggerIn(els, opts?)   countUp(el, from, to, dur?)
//   ripple(event, el?)      typewriter(el, text, speed?)
//   morphHeight(el, fromH, toH, opts?)
//   smoothScroll(el)
//   confetti(opts?)         loadConfetti()
//   animate(el, keyframes, opts)
//   stop(el)
//
// Declarative usage via attributes:
//
//   <div data-w2-effect="fade-in" data-w2-delay="200">…</div>
//   <button data-w2-effect="ripple">Click</button>
//   <tr data-w2-effect="stagger" data-w2-effect-group="rows">…</tr>
//
// On DOMContentLoaded + after every render via .scan(root),
// the scanner applies effects matching data attributes.
//
// Respects user's prefers-reduced-motion setting: when enabled,
// all durations are clamped to 0 and motion effects become near-
// instant (still triggers callbacks/cleanup).

(function (global) {
    'use strict';

    if (global.Web2Effects) return;

    const prefersReducedMotion =
        typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // -----------------------------------------------------
    // Defaults & easings
    // -----------------------------------------------------
    const EASE = {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)', // ease-out-expo
        inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot
        linear: 'linear',
    };

    function _dur(ms) {
        return prefersReducedMotion ? 0 : ms;
    }

    function _animate(el, keyframes, opts = {}) {
        if (!el || !el.animate) return null;
        const duration = _dur(opts.duration || 300);
        try {
            const a = el.animate(keyframes, {
                duration,
                easing: opts.easing || EASE.out,
                delay: _dur(opts.delay || 0),
                fill: opts.fill || 'forwards',
                iterations: opts.iterations || 1,
                composite: opts.composite || 'replace',
            });
            if (opts.onFinish) a.finished?.then(opts.onFinish).catch(() => {});
            return a;
        } catch {
            return null;
        }
    }

    function stop(el) {
        if (!el?.getAnimations) return;
        for (const a of el.getAnimations()) {
            try {
                a.cancel();
            } catch {
                /* ignore */
            }
        }
    }

    // -----------------------------------------------------
    // Fade
    // -----------------------------------------------------
    function fadeIn(el, opts = {}) {
        return _animate(
            el,
            [
                { opacity: 0, transform: opts.translate || 'translateY(6px)' },
                { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 240, ...opts }
        );
    }
    function fadeOut(el, opts = {}) {
        return _animate(
            el,
            [
                { opacity: 1, transform: 'translateY(0)' },
                { opacity: 0, transform: opts.translate || 'translateY(-4px)' },
            ],
            { duration: 200, ...opts }
        );
    }

    // -----------------------------------------------------
    // Slide (4 directions)
    // -----------------------------------------------------
    const _slideStart = {
        top: 'translate3d(0,-20px,0)',
        right: 'translate3d(20px,0,0)',
        bottom: 'translate3d(0,20px,0)',
        left: 'translate3d(-20px,0,0)',
    };
    function slideIn(el, dir = 'bottom', opts = {}) {
        return _animate(
            el,
            [
                { opacity: 0, transform: _slideStart[dir] || _slideStart.bottom },
                { opacity: 1, transform: 'translate3d(0,0,0)' },
            ],
            { duration: 320, easing: EASE.out, ...opts }
        );
    }
    function slideOut(el, dir = 'top', opts = {}) {
        return _animate(
            el,
            [
                { opacity: 1, transform: 'translate3d(0,0,0)' },
                { opacity: 0, transform: _slideStart[dir] || _slideStart.top },
            ],
            { duration: 220, ...opts }
        );
    }

    // -----------------------------------------------------
    // Micro-interactions
    // -----------------------------------------------------
    function pulse(el) {
        return _animate(
            el,
            [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
            { duration: 360, easing: EASE.bounce }
        );
    }
    function shake(el) {
        return _animate(
            el,
            [
                { transform: 'translateX(0)' },
                { transform: 'translateX(-6px)' },
                { transform: 'translateX(6px)' },
                { transform: 'translateX(-4px)' },
                { transform: 'translateX(4px)' },
                { transform: 'translateX(0)' },
            ],
            { duration: 420 }
        );
    }
    function bounce(el) {
        return _animate(
            el,
            [
                { transform: 'translateY(0)' },
                { transform: 'translateY(-10px)' },
                { transform: 'translateY(0)', easing: EASE.bounce },
            ],
            { duration: 460, easing: EASE.out }
        );
    }
    function flash(el, color = '#fef9c3') {
        if (!el) return null;
        const prevBg = el.style.backgroundColor;
        const prevTransition = el.style.transition;
        el.style.transition = 'background-color 0.18s ease-out';
        el.style.backgroundColor = color;
        setTimeout(() => {
            el.style.transition = 'background-color 0.6s ease-out';
            el.style.backgroundColor = prevBg || '';
            setTimeout(() => {
                el.style.transition = prevTransition;
            }, 650);
        }, 220);
    }
    function highlightRow(el) {
        return flash(el, 'rgba(254, 240, 138, 0.55)');
    }

    // -----------------------------------------------------
    // Stagger — animate a list of elements with offset delays
    // -----------------------------------------------------
    function staggerIn(elements, opts = {}) {
        const list = Array.from(elements || []);
        const step = opts.stagger ?? 40;
        const base = opts.delay ?? 0;
        list.forEach((el, i) =>
            fadeIn(el, {
                duration: opts.duration ?? 320,
                delay: base + i * step,
                translate: opts.translate || 'translateY(8px)',
            })
        );
    }

    // -----------------------------------------------------
    // Count-up — animate a number in an element
    // -----------------------------------------------------
    function countUp(el, from, to, duration = 700) {
        if (!el) return;
        const start = performance.now();
        const delta = to - from;
        const dur = _dur(duration) || 1;
        const isInt = Number.isInteger(from) && Number.isInteger(to);
        function step(now) {
            const t = Math.min(1, (now - start) / dur);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - t, 3);
            const val = from + delta * eased;
            el.textContent = isInt
                ? Math.round(val).toLocaleString('vi-VN')
                : val.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
            if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // -----------------------------------------------------
    // Ripple — material-style click feedback
    // -----------------------------------------------------
    function _ensureRippleStyle() {
        if (document.getElementById('w2fx-ripple-css')) return;
        const css = `
            .w2fx-ripple-host { position: relative; overflow: hidden; }
            .w2fx-ripple {
                position: absolute;
                border-radius: 50%;
                background: currentColor;
                opacity: 0.35;
                transform: scale(0);
                pointer-events: none;
                animation: w2fxRipple 600ms ease-out forwards;
            }
            @keyframes w2fxRipple {
                to { transform: scale(2.6); opacity: 0; }
            }`;
        const el = document.createElement('style');
        el.id = 'w2fx-ripple-css';
        el.textContent = css;
        document.head.appendChild(el);
    }
    function ripple(event, hostEl) {
        const host = hostEl || event?.currentTarget;
        if (!host) return;
        _ensureRippleStyle();
        host.classList.add('w2fx-ripple-host');
        const rect = host.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const r = document.createElement('span');
        r.className = 'w2fx-ripple';
        r.style.width = `${size}px`;
        r.style.height = `${size}px`;
        r.style.left = `${(event?.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2}px`;
        r.style.top = `${(event?.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2}px`;
        host.appendChild(r);
        setTimeout(() => r.remove(), 650);
    }

    // -----------------------------------------------------
    // Typewriter (for hero/banner text)
    // -----------------------------------------------------
    function typewriter(el, text, speed = 28) {
        if (!el) return;
        el.textContent = '';
        if (prefersReducedMotion) {
            el.textContent = text;
            return;
        }
        let i = 0;
        const id = setInterval(() => {
            el.textContent += text[i++];
            if (i >= text.length) clearInterval(id);
        }, speed);
    }

    // -----------------------------------------------------
    // Morph-height (smooth collapse/expand)
    // -----------------------------------------------------
    function morphHeight(el, fromH, toH, opts = {}) {
        return _animate(
            el,
            [
                { height: `${fromH}px`, overflow: 'hidden' },
                { height: `${toH}px`, overflow: 'hidden' },
            ],
            { duration: 260, easing: EASE.inOut, ...opts }
        );
    }

    function smoothScroll(el, opts = {}) {
        if (!el) return;
        el.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: opts.block || 'nearest',
        });
    }

    // -----------------------------------------------------
    // Confetti — lazy-load canvas-confetti from CDN on first use
    // -----------------------------------------------------
    let _confettiPromise = null;
    function loadConfetti() {
        if (global.confetti) return Promise.resolve(global.confetti);
        if (_confettiPromise) return _confettiPromise;
        _confettiPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src =
                'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
            s.onload = () => resolve(global.confetti);
            s.onerror = () => reject(new Error('confetti load failed'));
            document.head.appendChild(s);
        });
        return _confettiPromise;
    }
    async function confetti(opts = {}) {
        if (prefersReducedMotion) return;
        try {
            const c = await loadConfetti();
            if (!c) return;
            c({
                particleCount: opts.particleCount ?? 90,
                spread: opts.spread ?? 75,
                origin: opts.origin || { y: 0.7 },
                colors: opts.colors || ['#0068ff', '#2a96ff', '#fbbf24', '#10b981', '#3b82f6'],
                ...opts,
            });
        } catch {
            /* offline */
        }
    }

    // -----------------------------------------------------
    // Declarative attribute scanner
    // -----------------------------------------------------
    const _scanned = new WeakSet();
    function scan(root) {
        const scope = root || document;
        const targets = scope.querySelectorAll('[data-w2-effect]');
        targets.forEach((el) => {
            if (_scanned.has(el)) return;
            _scanned.add(el);
            const name = el.dataset.w2Effect;
            const delay = Number(el.dataset.w2Delay || 0);
            const duration = Number(el.dataset.w2Duration || 0) || undefined;
            switch (name) {
                case 'fade-in':
                    fadeIn(el, { delay, duration });
                    break;
                case 'slide-in':
                    slideIn(el, el.dataset.w2Dir || 'bottom', { delay, duration });
                    break;
                case 'pulse':
                    pulse(el);
                    break;
                case 'shake':
                    shake(el);
                    break;
                case 'bounce':
                    bounce(el);
                    break;
                case 'flash':
                    flash(el, el.dataset.w2Color);
                    break;
                case 'ripple':
                    el.addEventListener('pointerdown', (ev) => ripple(ev, el));
                    break;
                case 'count-up': {
                    const to = Number(el.textContent.replace(/[^\d.-]/g, '')) || 0;
                    countUp(el, 0, to, duration || 700);
                    break;
                }
                case 'stagger':
                    // Skip — group-staggered via .staggerIn from caller
                    break;
                default:
                    break;
            }
        });
    }

    // -----------------------------------------------------
    // Global hover-zoom for content images
    // -----------------------------------------------------
    //
    // Floats a large preview of any hovered "content image"
    // (product/invoice/chat/preview etc.) near the cursor.
    // Uses a position:fixed clone so table cells / cards
    // can't clip the preview.
    //
    // **Catch-all behavior** (2026-05-17): every <img> inside a
    // Web 2.0 container (`.web2-shell`, `body.web2-theme`,
    // `body.web2-clone`) auto-zooms unless explicitly excluded.
    // The previous opt-in selector list (`.product-image`,
    // `.so-cell-img img`, …) is kept as legacy whitelist for
    // pages without the Web 2.0 container wrapper.
    //
    // Exclusions:
    //   - data-w2-no-zoom on the <img> OR ancestor
    //   - inside .web2-sidebar / .sidebar / .so-tab-strip /
    //     button / a / nav (icon-only contexts)
    //   - intrinsic size < 32 px (likely an icon/avatar)
    //   - parent is a button/anchor (treat as icon)

    const HOVER_ZOOM_INCLUDE_LEGACY = [
        '.so-cell-img img',
        '.so-img-preview img',
        '.so-modal-table img',
        '.expand-img',
        '.line-img',
        '.pick-img',
        '.pk-image-preview img',
        '.pk-message-image',
        '.pk-preview-img',
        '.product-image',
        '.image-preview',
        '.image-preview img',
        '.preview img',
        '[data-w2-zoom]',
        'img[data-w2-zoom]',
    ].join(',');

    const HOVER_ZOOM_CONTAINER = '.web2-shell, body.web2-theme, body.web2-clone';

    const HOVER_ZOOM_EXCLUDE_CONTAINER = [
        '.web2-sidebar',
        '.sidebar',
        '.web2-aside',
        '.so-tab-strip',
        '[data-w2-no-zoom]',
        // Buttons/anchors/avatars — treat as icon
        'button',
        'a',
        '.btn-icon-round',
        '.w2-avatar',
        '.avatar',
        '.icon',
    ].join(',');

    let _zoomPopup = null;
    let _zoomTarget = null;

    function _isZoomable(img) {
        if (!img || img.tagName !== 'IMG') return false;
        if (img.hasAttribute('data-w2-no-zoom')) return false;
        if (img.closest(HOVER_ZOOM_EXCLUDE_CONTAINER)) return false;
        // Skip too-small (icons, mini badges)
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w && w < 32) return false;
        if (h && h < 32) return false;
        // Either: matches legacy include OR sits inside a Web 2.0 container.
        const inWeb2 = img.closest(HOVER_ZOOM_CONTAINER);
        if (inWeb2) return true;
        if (img.matches(HOVER_ZOOM_INCLUDE_LEGACY)) return true;
        return false;
    }

    // Guard CSS cho popup hover-zoom — TỰ inject (không phụ thuộc trang có <link>
    // web2-effects.css hay không). Trang KHÔNG nạp web2-effects.css (vd ai-hub) trước
    // đây bị bug "ảnh to hiện dưới footer": JS tạo .w2fx-zoom-popup nhưng thiếu
    // position:fixed → div rớt về document flow, ảnh hiện full-size cuối trang. web2-effects.js
    // được autoload MỌI trang qua sidebar → CSS thiết yếu phải đi kèm để luôn đúng.
    function _ensureZoomStyle() {
        if (document.getElementById('w2fx-zoom-css')) return;
        const el = document.createElement('style');
        el.id = 'w2fx-zoom-css';
        el.textContent =
            '.w2fx-zoom-popup{position:fixed;z-index:99999;pointer-events:none;background:#fff;' +
            'border-radius:12px;box-shadow:0 18px 48px rgba(15,23,42,.35),0 0 0 1px rgba(15,23,42,.06);' +
            'padding:6px;opacity:0;transform:scale(.96);transition:opacity .12s ease-out,' +
            'transform .16s cubic-bezier(.2,.9,.3,1.2);left:-9999px;top:-9999px}' +
            '.w2fx-zoom-popup.is-visible{opacity:1;transform:scale(1)}' +
            '.w2fx-zoom-popup img{display:block;max-width:min(420px,60vw);max-height:min(420px,70vh);' +
            'width:auto;height:auto;border-radius:8px;object-fit:contain;background:#f8fafc}';
        (document.head || document.documentElement).appendChild(el);
    }

    function _ensureZoomPopup() {
        if (_zoomPopup) return _zoomPopup;
        _ensureZoomStyle();
        const p = document.createElement('div');
        p.className = 'w2fx-zoom-popup';
        p.setAttribute('aria-hidden', 'true');
        document.body.appendChild(p);
        _zoomPopup = p;
        return p;
    }

    function _positionZoomPopup(p, e) {
        const margin = 16;
        const rect = p.getBoundingClientRect();
        const w = rect.width || 360;
        const h = rect.height || 360;
        let x = e.clientX + 20;
        let y = e.clientY + 20;
        if (x + w > window.innerWidth - margin) x = e.clientX - w - 20;
        if (y + h > window.innerHeight - margin) y = e.clientY - h - 20;
        if (x < margin) x = margin;
        if (y < margin) y = margin;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
    }

    function _showZoom(img, e) {
        const p = _ensureZoomPopup();
        const src = img.currentSrc || img.src;
        if (!src) return;
        // Reuse <img> child to avoid GC churn on rapid hover.
        let child = p.firstElementChild;
        if (!child || child.tagName !== 'IMG') {
            child = document.createElement('img');
            p.innerHTML = '';
            p.appendChild(child);
        }
        if (child.src !== src) child.src = src;
        p.classList.add('is-visible');
        _positionZoomPopup(p, e);
    }

    function _hideZoom() {
        if (_zoomPopup) _zoomPopup.classList.remove('is-visible');
        _zoomTarget = null;
    }

    function attachHoverZoom() {
        document.addEventListener('mouseover', (e) => {
            const img = e.target.closest && e.target.closest('img');
            if (!img || !_isZoomable(img)) {
                if (_zoomTarget) _hideZoom();
                return;
            }
            _zoomTarget = img;
            _showZoom(img, e);
        });
        document.addEventListener('mousemove', (e) => {
            if (_zoomTarget && _zoomPopup && _zoomPopup.classList.contains('is-visible')) {
                _positionZoomPopup(_zoomPopup, e);
            }
        });
        document.addEventListener('mouseout', (e) => {
            if (!_zoomTarget) return;
            const next = e.relatedTarget;
            if (next && _zoomTarget.contains(next)) return;
            _hideZoom();
        });
        // Scrolling while zoom open → hide (cursor position invalid).
        window.addEventListener('scroll', _hideZoom, { passive: true, capture: true });
    }

    // -----------------------------------------------------
    // attachImageDropTarget — reusable upload-area helper
    // -----------------------------------------------------
    //
    // Bật khả năng nhận ảnh cho 1 element trong toàn bộ Web 2.0:
    //   - Click → mở file picker
    //   - Ctrl+V khi focus → paste ảnh từ clipboard
    //   - Kéo thả file ảnh → drop
    //
    // Result trả về dataURL (base64). Caller tự quyết định lưu vào input,
    // upload CDN, hay đưa vào preview.
    //
    // opts:
    //   onResult(url, file): callback bắt buộc
    //   maxSizeMB: cảnh báo (không reject) khi vượt — mặc định 2
    //   noClickPicker: bỏ qua wiring click → file picker (khi caller có
    //     button riêng đã wire). Mặc định false.
    //   accept: accept attr cho input file, mặc định 'image/*'
    //   notify: fn(msg, type) — không bắt buộc, fallback console.warn
    //
    // Trả về {detach} để có thể tháo listeners khi destroy element.

    function _w2Notify(notifyFn, msg, type) {
        if (typeof notifyFn === 'function') {
            try {
                notifyFn(msg, type);
                return;
            } catch {
                /* fall through */
            }
        }
        if (global.notificationManager?.show) {
            try {
                global.notificationManager.show(msg, type || 'info');
                return;
            } catch {
                /* fall through */
            }
        }
        // eslint-disable-next-line no-console
        console.warn('[Web2Effects]', msg);
    }

    function _fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    // Compress + resize image. Mục tiêu output < targetKB. Resize tối đa
    // maxDim (default 1200px). Output luôn là JPEG quality giảm dần.
    // Trả về { dataUrl, sizeKB, w, h, compressed: bool }.
    function _compressImage(file, opts = {}) {
        const maxDim = opts.maxDim || 1200;
        const targetKB = opts.targetKB || 500;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    let { width: w, height: h } = img;
                    const scale = Math.min(1, maxDim / Math.max(w, h));
                    const newW = Math.round(w * scale);
                    const newH = Math.round(h * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = newW;
                    canvas.height = newH;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff'; // bg cho JPEG (xử lý alpha PNG)
                    ctx.fillRect(0, 0, newW, newH);
                    ctx.drawImage(img, 0, 0, newW, newH);
                    let quality = 0.85;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    let sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
                    // Iterate down quality if still too large (max 4 tries)
                    let tries = 0;
                    while (sizeKB > targetKB && quality > 0.4 && tries < 4) {
                        quality -= 0.15;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                        sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
                        tries += 1;
                    }
                    resolve({
                        dataUrl,
                        sizeKB,
                        w: newW,
                        h: newH,
                        compressed: scale < 1 || quality < 0.85,
                        quality: Math.round(quality * 100),
                    });
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function attachImageDropTarget(element, opts = {}) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return { detach() {} };
        if (el.__w2DropAttached) return el.__w2DropAttached;

        const hardLimitMB = opts.hardLimitMB ?? 10; // reject file lớn hơn
        const maxDim = opts.maxDim || 1200;
        const targetKB = opts.targetKB || 500;
        const onResult = opts.onResult || (() => {});
        const notify = (msg, type) => _w2Notify(opts.notify, msg, type);

        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
        el.classList.add('w2fx-drop-target');

        const apply = async (file) => {
            if (!file) return;
            if (!file.type || !file.type.startsWith('image/')) {
                notify('File không phải là ảnh', 'warning');
                return;
            }
            if (file.size > hardLimitMB * 1024 * 1024) {
                notify(`Ảnh > ${hardLimitMB}MB — quá lớn, từ chối`, 'error');
                return;
            }
            try {
                const result = await _compressImage(file, { maxDim, targetKB });
                if (result.compressed) {
                    notify(
                        `Đã nén ảnh xuống ${result.sizeKB}KB (${result.w}×${result.h}, JPEG ${result.quality}%)`,
                        'info'
                    );
                }
                onResult(result.dataUrl, file, result);
            } catch (e) {
                notify('Đọc/nén ảnh lỗi: ' + e.message, 'error');
            }
        };

        // BỎ click → mở file picker. User chỉ dùng Ctrl+V hoặc kéo thả.

        // Hover-to-focus: chuột vào area → auto focus → Ctrl+V land vào đây
        // mà không cần click trước.
        const onMouseEnter = () => {
            // Chỉ focus nếu user chưa typing vào input khác
            const active = document.activeElement;
            if (active && active !== document.body && active !== el) {
                // Nếu đang typing trong input/textarea ở chỗ khác, không cướp focus
                const tag = (active.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) return;
            }
            try {
                el.focus({ preventScroll: true });
            } catch {
                el.focus();
            }
        };

        const onPaste = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const it of items) {
                if (it.kind === 'file' && it.type.startsWith('image/')) {
                    e.preventDefault();
                    await apply(it.getAsFile());
                    return;
                }
            }
        };

        const onDragover = (e) => {
            e.preventDefault();
            el.classList.add('is-dragover');
        };
        const onDragleave = () => el.classList.remove('is-dragover');
        const onDrop = async (e) => {
            e.preventDefault();
            el.classList.remove('is-dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file) await apply(file);
        };

        el.addEventListener('mouseenter', onMouseEnter);
        el.addEventListener('paste', onPaste);
        el.addEventListener('dragover', onDragover);
        el.addEventListener('dragleave', onDragleave);
        el.addEventListener('drop', onDrop);

        const handle = {
            detach() {
                el.removeEventListener('mouseenter', onMouseEnter);
                el.removeEventListener('paste', onPaste);
                el.removeEventListener('dragover', onDragover);
                el.removeEventListener('dragleave', onDragleave);
                el.removeEventListener('drop', onDrop);
                el.classList.remove('w2fx-drop-target');
                delete el.__w2DropAttached;
            },
            apply, // expose for programmatic call
        };
        el.__w2DropAttached = handle;
        return handle;
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                scan(document);
                attachHoverZoom();
            });
        } else {
            scan(document);
            attachHoverZoom();
        }
    }

    init();

    global.Web2Effects = {
        EASE,
        fadeIn,
        fadeOut,
        slideIn,
        slideOut,
        pulse,
        shake,
        bounce,
        flash,
        highlightRow,
        staggerIn,
        countUp,
        ripple,
        typewriter,
        morphHeight,
        smoothScroll,
        confetti,
        loadConfetti,
        animate: _animate,
        stop,
        scan,
        attachHoverZoom,
        attachImageDropTarget,
        prefersReducedMotion,
    };
})(window);
