// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo single-source page app.
// =====================================================================
// Trang Zalo (NGUỒN DUY NHẤT) — orchestrator. 4 tab: Tài khoản / Hội thoại / Tra cứu / ZNS.
// personal (zca-js): đăng nhập QR, chat 2 chiều, xem thông tin người dùng/khác.
// oa (official): kết nối OA, ZNS, template, log.
// Realtime SSE: web2:zalo:messages / :accounts / :conv:<id>. Giờ GMT+7.
// Logic tách module: web2-zalo-utils / -accounts / -chat / -lookup-zns (window.WZApp).
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { $, state } = WZApp;

    // ===================================================================
    // TABS
    // ===================================================================
    function switchTab(tab, focusPanel) {
        if (tab === 'accounts' && !isAdmin()) tab = 'chat'; // tab Tài khoản chỉ admin
        state.tab = tab;
        document.querySelectorAll('.wz-rail-tab').forEach((b) => {
            const on = b.dataset.tab === tab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        ['accounts', 'chat', 'lookup', 'zns'].forEach((t) => {
            const p = $('#wzPanel' + t[0].toUpperCase() + t.slice(1));
            if (p) p.hidden = t !== tab;
        });
        if (focusPanel) $('#wzPanel' + tab[0].toUpperCase() + tab.slice(1))?.focus();
        if (tab === 'accounts') WZApp.loadAccounts();
        else if (tab === 'chat') WZApp.loadConversations();
        else if (tab === 'lookup') WZApp.fillAccountSelect('#wzLookupAccount');
        else if (tab === 'zns') {
            WZApp.loadTemplates();
            WZApp.loadZnsLog();
        }
    }

    // ===================================================================
    // BIND + INIT
    // ===================================================================
    function bind() {
        // Tabs: click + keyboard (←/→/Home/End) theo ARIA APG tablist
        // APG manual-activation: ←/→/Home/End CHỈ di chuyển focus (roving tabindex);
        // Enter/Space (hoặc click) mới kích hoạt panel → không fetch mỗi lần bấm mũi tên.
        const tabs = Array.from(document.querySelectorAll('.wz-rail-tab'));
        const focusTab = (j) => {
            tabs.forEach((t, k) => (t.tabIndex = k === j ? 0 : -1));
            tabs[j].focus();
        };
        tabs.forEach((b, i) => {
            b.addEventListener('click', () => switchTab(b.dataset.tab));
            b.addEventListener('keydown', (e) => {
                let j = null;
                // Rail dọc: ↑/↓ (giữ ←/→ cho thân thiện) di chuyển focus; Enter/Space kích hoạt.
                if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % tabs.length;
                else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
                    j = (i - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') j = 0;
                else if (e.key === 'End') j = tabs.length - 1;
                if (j !== null) {
                    e.preventDefault();
                    focusTab(j);
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    switchTab(b.dataset.tab, true);
                }
            });
        });

        // account grid (delegated click + keyboard cho choice cards)
        const grid = $('#wzAccGrid');
        const gridActivate = (e) => {
            if (e.target.closest('#wzHeroLogin')) return WZApp.openLogin(null);
            if (e.target.closest('#wzAddOa')) return WZApp.openOaModal();
            const btn = e.target.closest('[data-act]');
            if (btn) WZApp.onAccAction(btn.dataset.act, btn.dataset.key, btn);
        };
        grid.addEventListener('click', gridActivate);
        grid.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.wz-choice')) {
                e.preventDefault();
                gridActivate(e);
            }
        });

        // Login modal (2 lựa chọn: cookie tự động / quét QR)
        $('#wzLoginClose').addEventListener('click', WZApp.closeLogin);
        $('#wzLoginBackdrop').addEventListener('click', WZApp.closeLogin);
        $('#wzLoginCookie').addEventListener('click', () => WZApp.doCookieLogin(WZApp._loginKey()));
        $('#wzLoginQrBtn').addEventListener('click', () => WZApp.startQrLogin(WZApp._loginKey()));
        $('#wzQrBack').addEventListener('click', WZApp.showLoginOpts);

        // OA modal
        $('#wzOaClose').addEventListener('click', WZApp.closeOaModal);
        $('#wzOaCancel').addEventListener('click', WZApp.closeOaModal);
        $('#wzOaBackdrop').addEventListener('click', WZApp.closeOaModal);
        $('#wzOaSave').addEventListener('click', WZApp.saveOa);

        // chat
        $('#wzChatAccount').addEventListener('change', (e) => {
            state.conv.accountKey = e.target.value;
            WZApp.loadConversations();
        });
        $('#wzConvList').addEventListener('click', (e) => {
            // Nút "⋯" mở menu hội thoại (ghim/mute/mark) — KHÔNG mở hội thoại.
            const menuBtn = e.target.closest('.wz-conv-menu');
            if (menuBtn) {
                e.stopPropagation();
                WZApp.openConvMenu?.(menuBtn, Number(menuBtn.dataset.id));
                return;
            }
            const item = e.target.closest('.wz-conv-item');
            if (item) WZApp.openConversation(Number(item.dataset.id));
        });
        $('#wzConvList').addEventListener('keydown', (e) => {
            const item = e.target.closest('.wz-conv-item');
            if (item && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                WZApp.openConversation(Number(item.dataset.id));
            }
        });

        // lookup
        $('#wzLookupBtn').addEventListener('click', WZApp.doLookup);
        $('#wzLookupSelf').addEventListener('click', WZApp.showSelf);
        $('#wzLookupPhone').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') WZApp.doLookup();
        });

        // zns
        $('#wzZnsSend').addEventListener('click', WZApp.sendZns);
        $('#wzZnsReloadLog').addEventListener('click', WZApp.loadZnsLog);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!$('#wzLoginModal').hidden) WZApp.closeLogin();
                else if (!$('#wzOaModal').hidden) WZApp.closeOaModal();
            }
        });
    }

    // ── Admin gating: tab Tài khoản CHỈ admin (2026-06-29) ──────────────────
    // Ưu tiên role Web2Auth; fallback auth Web 1.0 (giống web2-sidebar._isAdmin).
    function isAdmin() {
        try {
            const u = window.Web2Auth?.getStored?.()?.user;
            if (u && u.role) return String(u.role).toLowerCase() === 'admin';
            const auth = JSON.parse(
                localStorage.getItem('loginindex_auth') ||
                    sessionStorage.getItem('loginindex_auth') ||
                    '{}'
            );
            const userType = localStorage.getItem('userType') || '';
            return (
                auth.isAdmin === true ||
                auth.roleTemplate === 'admin' ||
                userType.startsWith('admin')
            );
        } catch {
            return false;
        }
    }
    function applyAdminGate() {
        if (isAdmin()) return;
        const tab = document.getElementById('wzTabAccounts');
        if (tab) tab.hidden = true; // ẩn nút rail "Tài khoản"
        if (state.tab === 'accounts') switchTab('chat'); // lỡ đang ở accounts → về chat
    }

    function subscribeSse() {
        if (!window.Web2SSE?.subscribe) return;
        // Per-máy: topic owner-scoped (TK cá nhân + tin của MÁY này) + topic global
        // (OA dùng chung + admin reset). owner = UUID trình duyệt.
        const own = (window.Web2ZaloOwner && window.Web2ZaloOwner()) || '_none';
        // Debounce refAcc: loadAccounts() là full fetch (status + render + autoCookie);
        // burst (login/status flip liên tiếp) gom lại để tránh phí fetch.
        let _accT;
        const refAcc = () => {
            clearTimeout(_accT);
            _accT = setTimeout(() => WZApp.loadAccounts(), 500);
        };
        window.Web2SSE.subscribe(`web2:zalo:${own}:accounts`, refAcc);
        window.Web2SSE.subscribe('web2:zalo:accounts', refAcc); // OA/reset chung
        // CHỈ refresh DANH SÁCH hội thoại ở đây (debounce). Tin của hội thoại
        // đang mở do subscribeRealtime (thread topic) lo → tránh double refetch.
        let _listT;
        const refList = () => {
            if (state.tab !== 'chat') return;
            clearTimeout(_listT);
            _listT = setTimeout(() => WZApp.loadConversations(), 600);
        };
        window.Web2SSE.subscribe(`web2:zalo:${own}:messages`, refList);
        window.Web2SSE.subscribe('web2:zalo:messages', refList); // pin/mute/reset chung
    }

    function init() {
        bind();
        subscribeSse();
        // focus theo ?focus=<phone> (từ Web2Zalo.openChat của trang khác)
        const focus = new URLSearchParams(location.search).get('focus');
        if (focus) state.conv.search = focus;
        // Mặc định mở khu vực Chat (giống app Zalo). switchTab('chat') → loadConversations()
        // → loadAccounts() nếu rỗng → đèn sức khoẻ rail cũng được render.
        switchTab('chat');
        applyAdminGate(); // ẩn tab Tài khoản nếu không phải admin
    }

    // ── Export orchestrator API (switchTab dùng cross-module bởi accounts) ──
    WZApp.switchTab = switchTab;
    WZApp.isAdmin = isAdmin;
    WZApp.init = init;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
