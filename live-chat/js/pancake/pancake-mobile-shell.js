// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — mobile shell cho Chat Pancake: app-height keyboard-aware + single-pane swap (list↔chat) + swipe-back. KHÔNG đụng data layer.
// =====================================================================
// Web2PancakeMobile — chỉ xử lý LAYOUT/VIEWPORT cho mobile (≤767px). Không
// fetch/send gì. Set CSS var --pkr-app-h (chiều cao thật, trừ bàn phím) + --pkr-kb,
// quản state data-view trên .pancake-chat-container (list ↔ chat full-screen),
// swipe-right = back về list. Wire vào conversation open/back ở pancake-init +
// mode-switcher (đợt 5). Idempotent, an toàn gọi nhiều lần.
// =====================================================================
(function (global) {
    'use strict';

    var MOBILE_MAX = 767;
    var _bound = false;

    function isMobile() {
        return global.matchMedia && global.matchMedia('(max-width: ' + MOBILE_MAX + 'px)').matches;
    }

    function container() {
        return document.querySelector('.pancake-chat-container');
    }

    // ── Viewport: chiều cao thật + chiều cao bàn phím (iOS/Android) ──
    function applyViewport() {
        var vv = global.visualViewport;
        var root = document.documentElement;
        if (vv) {
            // bàn phím mở → vv.height < innerHeight; phần chênh = --pkr-kb
            var kb = Math.max(0, global.innerHeight - vv.height - (vv.offsetTop || 0));
            root.style.setProperty('--pkr-app-h', vv.height + 'px');
            root.style.setProperty('--pkr-kb', kb + 'px');
        } else {
            root.style.setProperty('--pkr-app-h', global.innerHeight + 'px');
            root.style.setProperty('--pkr-kb', '0px');
        }
    }

    // ── Single-pane swap (mobile): list ↔ chat ──
    function setView(view) {
        var c = container();
        if (!c) return;
        if (view === 'chat') {
            c.setAttribute('data-view', 'chat');
            c.classList.add('pk-view-chat');
        } else {
            c.setAttribute('data-view', 'list');
            c.classList.remove('pk-view-chat');
        }
    }
    function showChat() {
        if (isMobile()) setView('chat');
    }
    function showList() {
        if (isMobile()) setView('list');
    }
    function currentView() {
        var c = container();
        return c ? c.getAttribute('data-view') || 'list' : 'list';
    }

    // ── Swipe-right trên vùng chat = back về list (mobile) ──
    function bindSwipeBack() {
        var startX = 0,
            startY = 0,
            tracking = false;
        document.addEventListener(
            'touchstart',
            function (e) {
                if (!isMobile() || currentView() !== 'chat') return;
                var t = e.touches[0];
                // chỉ nhận khi bắt đầu gần mép trái (edge-swipe, tránh xung đột scroll ngang)
                if (t.clientX > 40) return;
                startX = t.clientX;
                startY = t.clientY;
                tracking = true;
            },
            { passive: true }
        );
        document.addEventListener(
            'touchend',
            function (e) {
                if (!tracking) return;
                tracking = false;
                var t = e.changedTouches[0];
                var dx = t.clientX - startX;
                var dy = Math.abs(t.clientY - startY);
                if (dx > 70 && dy < 50) showList();
            },
            { passive: true }
        );
    }

    function init() {
        if (_bound) {
            applyViewport();
            return;
        }
        _bound = true;
        applyViewport();
        if (global.visualViewport) {
            global.visualViewport.addEventListener('resize', applyViewport);
            global.visualViewport.addEventListener('scroll', applyViewport);
        }
        global.addEventListener('resize', applyViewport);
        global.addEventListener('orientationchange', function () {
            setTimeout(applyViewport, 200);
        });
        bindSwipeBack();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2PancakeMobile = {
        isMobile: isMobile,
        showChat: showChat,
        showList: showList,
        currentView: currentView,
        applyViewport: applyViewport,
        init: init,
    };
})(window);
