// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2Lottie — lớp animation Lottie (airbnb/lottie-web) DÙNG CHUNG cho
// TOÀN BỘ Web 2.0. Auto-load qua web2-sidebar.js nên có mặt mọi trang.
//
// Triết lý "thông minh" (subtle):
//   1. Lazy: KHÔNG tải thư viện lottie-web cho tới khi animation đầu tiên
//      thực sự cần (tiết kiệm bandwidth — trang đủ data sẽ không tải lib).
//   2. Auto-enhance trạng thái RỖNG: scanner + MutationObserver tự thay
//      icon `.empty-state-icon` (lucide) bằng Lottie tương ứng — toàn site,
//      KHÔNG cần sửa từng trang.
//   3. Declarative: <div data-w2-lottie="loading"></div> → tự mount.
//   4. Feedback THÀNH CÔNG/LỖI subtle qua Web2Optimistic (đã wire), throttle.
//   5. Tôn trọng prefers-reduced-motion → tắt hoàn toàn (no-op).
//   6. Graceful: CDN fail → no-op, UI vẫn bình thường.
//
// API (window.Web2Lottie):
//   play(elOrId, name, {loop, autoplay, onComplete}) -> anim | placeholder
//   destroy(elOrId)
//   success()  error()          // burst feedback giữa-trên màn hình (throttled)
//   burst(name, {size})         // 1-shot rồi tự dọn
//   loadingOverlay(show, {label})
//   scan(root=document)         // quét lại sau khi render (observer đã tự chạy)
//   config { autoFeedback:true, emptyDelayMs:350 }
//   enabled                     // false nếu reduced-motion
//
// Asset chung: web2/shared/lottie/<name>.json (loading, success, error, empty).
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2Lottie) return;

    const doc = global.document;
    if (!doc) return;

    // ── Resolve đường dẫn asset + CSS theo vị trí script này ─────────
    const SCRIPT_SRC = (() => {
        const cs = doc.currentScript;
        if (cs && cs.src) return cs.src;
        const list = doc.getElementsByTagName('script');
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].src && /web2-lottie\.js(\?|#|$)/.test(list[i].src)) return list[i].src;
        }
        return global.location ? global.location.href : '';
    })();
    const ASSET_BASE = (() => {
        try {
            return new URL('./lottie/', SCRIPT_SRC).toString();
        } catch {
            return '../shared/lottie/';
        }
    })();
    // lottie_light = renderer SVG-only, nhẹ hơn full (~150KB). Đủ cho mọi asset của ta.
    const LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js';

    // ── Reduced-motion → tắt toàn bộ ─────────────────────────────────
    const REDUCE = !!(
        global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    const ENABLED = !REDUCE;

    // ── Inject CSS đồng hành (1 lần) ─────────────────────────────────
    (function injectCss() {
        if (doc.querySelector('link[data-w2lottie-css]')) return;
        try {
            const href = new URL('./web2-lottie.css?v=20260615a', SCRIPT_SRC).toString();
            const link = doc.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-w2lottie-css', '1');
            (doc.head || doc.documentElement).appendChild(link);
        } catch {
            /* ignore */
        }
    })();

    // ── Map lucide icon (trong .empty-state-icon) → asset Lottie ─────
    // Trạng thái rỗng "không lỗi" → box "empty"; ngữ cảnh lỗi → "error".
    const ICON_MAP = {
        inbox: 'empty',
        package: 'empty',
        'package-x': 'empty',
        'package-open': 'empty',
        box: 'empty',
        archive: 'empty',
        'file-text': 'empty',
        files: 'empty',
        folder: 'empty',
        'folder-open': 'empty',
        database: 'empty',
        search: 'empty',
        'search-x': 'empty',
        'shopping-cart': 'empty',
        users: 'empty',
        'alert-triangle': 'error',
        'alert-circle': 'error',
        'alert-octagon': 'error',
        'x-circle': 'error',
        'wifi-off': 'error',
        ban: 'error',
        'check-circle': 'success',
        'check-circle-2': 'success',
        check: 'success',
    };

    // ── Lazy load thư viện ───────────────────────────────────────────
    let _libPromise = null;
    function ensureLib() {
        if (global.lottie) return Promise.resolve(global.lottie);
        if (_libPromise) return _libPromise;
        _libPromise = new Promise((resolve, reject) => {
            const s = doc.createElement('script');
            s.src = LIB_URL;
            s.async = true;
            s.onload = () => resolve(global.lottie || null);
            s.onerror = () => {
                _libPromise = null; // cho phép thử lại sau
                reject(new Error('[Web2Lottie] CDN load failed'));
            };
            (doc.head || doc.documentElement).appendChild(s);
        });
        return _libPromise;
    }

    // ── Registry: el → anim (Map để reap detached, tránh leak RAF) ───
    const _registry = new Map();
    function _resolveEl(target) {
        if (!target) return null;
        if (typeof target === 'string') {
            return doc.getElementById(target) || doc.querySelector(target);
        }
        return target;
    }
    // Dọn anim của element đã rời DOM (gọi mỗi lần scan — rẻ).
    function _reap() {
        _registry.forEach((anim, el) => {
            if (!el || !el.isConnected) {
                try {
                    anim && typeof anim.destroy === 'function' && anim.destroy();
                } catch {
                    /* ignore */
                }
                _registry.delete(el);
            }
        });
    }

    function play(target, name, opts = {}) {
        if (!ENABLED) return null;
        const el = _resolveEl(target);
        if (!el || !name) return null;
        const existing = _registry.get(el);
        if (existing && !existing._pending) return existing; // đã mount
        if (existing && existing._pending) return existing;
        const placeholder = { _pending: true };
        _registry.set(el, placeholder);
        ensureLib()
            .then((lottie) => {
                if (!lottie || !el.isConnected) {
                    _registry.delete(el);
                    return;
                }
                try {
                    const anim = lottie.loadAnimation({
                        container: el,
                        renderer: 'svg',
                        loop: opts.loop !== false,
                        autoplay: opts.autoplay !== false,
                        path: `${ASSET_BASE}${name}.json`,
                    });
                    _registry.set(el, anim);
                    if (typeof opts.onComplete === 'function') {
                        anim.addEventListener('complete', opts.onComplete);
                    }
                } catch {
                    _registry.delete(el);
                }
            })
            .catch(() => _registry.delete(el));
        return placeholder;
    }

    function destroy(target) {
        const el = _resolveEl(target);
        if (!el) return;
        const anim = _registry.get(el);
        if (anim && typeof anim.destroy === 'function') {
            try {
                anim.destroy();
            } catch {
                /* ignore */
            }
        }
        _registry.delete(el);
        try {
            el.innerHTML = '';
        } catch {
            /* ignore */
        }
    }

    // ── Burst 1-shot (success/error feedback) ────────────────────────
    let _lastBurst = 0;
    const BURST_THROTTLE_MS = 1000;
    function burst(name, opts = {}) {
        if (!ENABLED) return;
        const now = Date.now();
        if (now - _lastBurst < BURST_THROTTLE_MS) return; // chống spam khi thao tác nhanh
        _lastBurst = now;
        const host = doc.createElement('div');
        host.className = 'w2lot-burst';
        const size = opts.size || (name === 'error' ? 112 : 96);
        host.style.width = host.style.height = size + 'px';
        (doc.body || doc.documentElement).appendChild(host);
        let anim = null;
        const cleanup = () => {
            try {
                anim && anim.destroy();
            } catch {
                /* ignore */
            }
            host.remove();
        };
        ensureLib()
            .then((lottie) => {
                if (!lottie) {
                    host.remove();
                    return;
                }
                try {
                    anim = lottie.loadAnimation({
                        container: host,
                        renderer: 'svg',
                        loop: false,
                        autoplay: true,
                        path: `${ASSET_BASE}${name}.json`,
                    });
                    anim.addEventListener('complete', () => {
                        host.classList.add('is-out');
                        setTimeout(cleanup, 240);
                    });
                } catch {
                    host.remove();
                }
            })
            .catch(() => host.remove());
        setTimeout(cleanup, 2600); // safety net
    }
    const success = (opts) => burst('success', opts);
    const error = (opts) => burst('error', opts);

    // ── Loading overlay toàn trang ───────────────────────────────────
    let _overlay = null;
    function loadingOverlay(show, opts = {}) {
        if (!ENABLED) return;
        if (show) {
            if (_overlay) return;
            _overlay = doc.createElement('div');
            _overlay.className = 'w2lot-loading-overlay';
            const box = doc.createElement('div');
            box.className = 'w2lot-loading-box';
            const lot = doc.createElement('div');
            lot.className = 'w2lot-loading-anim';
            box.appendChild(lot);
            if (opts.label) {
                const lab = doc.createElement('div');
                lab.className = 'w2lot-loading-label';
                lab.textContent = opts.label;
                box.appendChild(lab);
            }
            _overlay.appendChild(box);
            (doc.body || doc.documentElement).appendChild(_overlay);
            play(lot, 'loading', { loop: true });
        } else if (_overlay) {
            destroy(_overlay.querySelector('.w2lot-loading-anim'));
            _overlay.remove();
            _overlay = null;
        }
    }

    // ── Scanner: declarative + auto-enhance empty-state ──────────────
    function _enhanceDeclarative(root) {
        root.querySelectorAll('[data-w2-lottie]').forEach((el) => {
            if (el.dataset.w2lottieMounted) return;
            const name = el.getAttribute('data-w2-lottie');
            if (!name) return;
            el.dataset.w2lottieMounted = '1';
            play(el, name, { loop: el.dataset.w2LottieLoop !== 'false' });
        });
    }

    function _enhanceOneEmptyIcon(iconEl) {
        if (!iconEl || iconEl.dataset.w2lottieMounted) return;
        // Opt-out: data-w2-lottie-skip, hoặc tổ tiên đánh dấu noempty.
        if (iconEl.dataset.w2LottieSkip || iconEl.closest('[data-w2-lottie-noempty]')) return;
        // Trễ rồi check còn-trong-DOM: trạng thái rỗng tạm (đang tải) sẽ biến
        // mất trước → không tải lib vô ích.
        if (!iconEl.isConnected) return;
        const lucideName = iconEl.getAttribute('data-lucide') || '';
        const isError =
            !!iconEl.closest('.empty-state-error') ||
            /alert|ban|x-circle|wifi-off/.test(lucideName);
        const anim = ICON_MAP[lucideName] || (isError ? 'error' : 'empty');
        const holder = doc.createElement('div');
        holder.className = 'w2lot-empty-icon';
        if (anim === 'error') holder.classList.add('is-error');
        iconEl.dataset.w2lottieMounted = '1';
        iconEl.style.display = 'none';
        iconEl.insertAdjacentElement('afterend', holder);
        // success/error vẽ 1 lần; empty loop êm.
        play(holder, anim, { loop: anim === 'empty' });
    }

    let _pendingIcons = new Set();
    let _emptyTimer = null;
    function _enhanceEmptyStates(root) {
        root.querySelectorAll('.empty-state-icon:not([data-w2lotticed])').forEach((iconEl) => {
            iconEl.setAttribute('data-w2lotticed', '1');
            _pendingIcons.add(iconEl);
        });
        if (_pendingIcons.size && !_emptyTimer) {
            const delay = Web2Lottie.config.emptyDelayMs;
            _emptyTimer = setTimeout(() => {
                _emptyTimer = null;
                const batch = _pendingIcons;
                _pendingIcons = new Set();
                batch.forEach(_enhanceOneEmptyIcon);
            }, delay);
        }
    }

    function scan(root) {
        if (!ENABLED) return;
        const r = root || doc;
        _reap();
        _enhanceDeclarative(r);
        _enhanceEmptyStates(r);
    }

    // ── MutationObserver: tự áp dụng sau mỗi lần render (debounced) ───
    let _moTimer = null;
    let _dirty = false;
    function _startObserver() {
        if (!ENABLED || !global.MutationObserver || !doc.body) return;
        const obs = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.addedNodes && m.addedNodes.length) {
                    _dirty = true;
                    break;
                }
            }
            if (!_dirty || _moTimer) return;
            _moTimer = setTimeout(() => {
                _moTimer = null;
                if (_dirty) {
                    _dirty = false;
                    scan(doc);
                }
            }, 150);
        });
        obs.observe(doc.body, { childList: true, subtree: true });
    }

    const Web2Lottie = {
        enabled: ENABLED,
        config: { autoFeedback: true, emptyDelayMs: 350 },
        play,
        destroy,
        burst,
        success,
        error,
        loadingOverlay,
        scan,
        ensureLib,
    };
    global.Web2Lottie = Web2Lottie;

    // ── Bootstrap ────────────────────────────────────────────────────
    function boot() {
        if (!ENABLED) return;
        scan(doc);
        _startObserver();
    }
    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})(typeof window !== 'undefined' ? window : globalThis);
