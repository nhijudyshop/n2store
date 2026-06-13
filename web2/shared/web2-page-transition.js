// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — barba-style page transition (curtain wipe, KHÔNG PJAX). Tái dùng mọi trang web2.
// =====================================================================
// Web2PageTransition — hiệu ứng chuyển trang kiểu barba.js NHƯNG KHÔNG
// PJAX/AJAX (an toàn cho app nặng: Firebase/SSE/Pancake init bình thường).
// Cơ chế: chặn click link nội bộ → kéo "màn" che (transform) → mới
// window.location điều hướng thật → trang mới load → màn trượt ra (reveal).
// Liên tục = cảm giác wipe mượt như barba. CSS ở web2-effects.css (.w2fx-curtain).
// Anti-lag: chỉ animate transform. Tôn trọng prefers-reduced-motion + bfcache.
// Dùng: <script src="../shared/web2-page-transition.js?v=..."></script> (sau web2-effects.css)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2PageTransition) return;

    var DURATION = 380; // khớp transition .w2fx-curtain trong CSS (0.4s)
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var curtain = null;
    var navigating = false;

    function ensureCurtain() {
        if (curtain && document.body.contains(curtain)) return curtain;
        curtain = document.createElement('div');
        curtain.className = 'w2fx-curtain';
        curtain.setAttribute('aria-hidden', 'true');
        document.body.appendChild(curtain);
        return curtain;
    }

    // Reveal khi vào trang: màn đang che (cover) → trượt xuống biến mất (reveal) → reset.
    function reveal() {
        if (reduce) return;
        var c = ensureCurtain();
        // đặt trạng thái "che" tức thì (không transition) để nối tiếp lúc rời trang trước
        c.style.transition = 'none';
        c.classList.add('cover');
        c.classList.remove('reveal');
        void c.offsetWidth; // reflow
        c.style.transition = '';
        requestAnimationFrame(function () {
            c.classList.remove('cover');
            c.classList.add('reveal'); // 0 → +100% trượt xuống lộ trang
        });
        // sau khi lộ xong → reset về mặc định (ẩn trên đỉnh) KHÔNG transition để lần rời sau sạch
        global.setTimeout(function () {
            c.style.transition = 'none';
            c.classList.remove('reveal');
            void c.offsetWidth;
            c.style.transition = '';
        }, DURATION + 60);
    }

    // Leave khi rời trang: kéo màn từ đỉnh xuống che → điều hướng thật.
    function leave(url) {
        if (navigating) return;
        navigating = true;
        if (reduce) {
            global.location.href = url;
            return;
        }
        var c = ensureCurtain();
        c.classList.remove('reveal');
        // từ mặc định (-100%) → cover (0): trượt xuống che
        requestAnimationFrame(function () {
            c.classList.add('cover');
        });
        global.setTimeout(function () {
            global.location.href = url;
        }, DURATION);
        // fallback: nếu điều hướng bị chặn, mở khoá sau 1.2s
        global.setTimeout(function () {
            navigating = false;
        }, 1200);
    }

    function shouldIntercept(a, e) {
        if (e.defaultPrevented || e.button !== 0) return false;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
        if (a.target && a.target !== '_self') return false;
        if (a.hasAttribute('download')) return false;
        if (a.getAttribute('data-no-transition') != null) return false;
        var href = a.getAttribute('href');
        if (!href) return false;
        if (
            href[0] === '#' ||
            href.indexOf('mailto:') === 0 ||
            href.indexOf('tel:') === 0 ||
            href.indexOf('javascript:') === 0
        )
            return false;
        var dest;
        try {
            dest = new URL(href, global.location.href);
        } catch (_) {
            return false;
        }
        if (dest.origin !== global.location.origin) return false; // chỉ same-origin
        // cùng trang (chỉ đổi hash) → bỏ qua
        if (dest.pathname === global.location.pathname && dest.search === global.location.search)
            return false;
        return dest.href;
    }

    function onClick(e) {
        var a = e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        var url = shouldIntercept(a, e);
        if (!url) return;
        e.preventDefault();
        leave(url);
    }

    function init() {
        if (reduce) return; // không gắn gì khi user tắt motion
        ensureCurtain();
        reveal();
        document.addEventListener('click', onClick, true);
        // bfcache: back/forward khôi phục → reveal lại (tránh kẹt màn che)
        global.addEventListener('pageshow', function (ev) {
            navigating = false;
            if (ev.persisted) reveal();
        });
        global.addEventListener('pagehide', function () {
            navigating = false;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2PageTransition = { leave: leave, reveal: reveal, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
