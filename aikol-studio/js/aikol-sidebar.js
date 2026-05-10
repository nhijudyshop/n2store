// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — persistent left sidebar (Sprint 5).
//
// Auto-injects on any /aikol-studio/* page. Reads URL to set active item, calls
// AikolAPI.getCredits()/listModels() for live bottom-dock data. Mobile (≤880px):
// hidden by default, toggled by a hamburger button in the page header.

(function (global) {
    'use strict';

    if (global.AikolSidebar && global.AikolSidebar._loaded) return;

    const ITEMS = [
        { href: 'index.html', label: 'Dashboard', icon: 'layout-dashboard' },
        { href: 'models.html', label: 'Models', icon: 'user-circle' },
        { href: 'products.html', label: 'Products', icon: 'shirt' },
        { href: 'channels.html', label: 'Source channels', icon: 'tv' },
        { href: 'library.html', label: 'Clip Library', icon: 'film' },
        { href: 'bulk.html', label: 'Bulk generate', icon: 'sparkles' },
        { href: 'campaigns.html', label: 'Campaigns', icon: 'rocket' },
        // 'images' is not in lucide 0.294 — use 'image' for the gallery slot.
        { href: 'history.html', label: 'Outputs', icon: 'image' },
        { href: 'settings.html', label: 'Settings', icon: 'settings' },
    ];

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function currentPage() {
        const path = location.pathname.split('/').pop() || 'index.html';
        return path;
    }

    function buildHtml() {
        const cur = currentPage();
        const items = ITEMS.map((it) => {
            const active = it.href === cur ? ' aikol-side__item--active' : '';
            return `
                <a class="aikol-side__item${active}" href="${escapeHtml(it.href)}" data-side="${escapeHtml(it.href)}">
                    <i data-lucide="${escapeHtml(it.icon)}" aria-hidden="true"></i>
                    <span>${escapeHtml(it.label)}</span>
                </a>`;
        }).join('');

        return `
        <aside class="aikol-side" id="aikol-sidebar" aria-label="AI KOL Studio navigation">
            <a class="aikol-side__brand" href="index.html">
                <span class="aikol-side__logo" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </span>
                <span class="aikol-side__title">AI KOL Studio</span>
            </a>
            <nav class="aikol-side__nav">${items}</nav>
            <div class="aikol-side__dock">
                <div class="aikol-side__model" id="aikol-side-model">
                    <span class="aikol-side__model-label">MODEL</span>
                    <span class="aikol-side__model-name">— chưa chọn</span>
                </div>
                <div class="aikol-side__credits-row">
                    <span class="aikol-side__credits" id="aikol-side-credits">
                        <span class="aikol-side__bolt" aria-hidden="true">⚡</span>
                        <span class="aikol-side__credits-num">—</span>
                        <span class="aikol-side__credits-label">credits</span>
                    </span>
                    <a class="aikol-btn aikol-side__topup" href="settings.html">Top up</a>
                </div>
                <div class="aikol-side__user" id="aikol-side-user">
                    <span class="aikol-side__email">—</span>
                    <button type="button" class="aikol-side__logout" id="aikol-side-logout" aria-label="Logout">
                        <i data-lucide="log-out" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        </aside>
        <button type="button" class="aikol-side__burger" id="aikol-side-burger" aria-label="Toggle navigation" aria-expanded="false">
            <span></span><span></span><span></span>
        </button>
        <div class="aikol-side__scrim" id="aikol-side-scrim" aria-hidden="true"></div>`;
    }

    async function fillDock() {
        try {
            const credits = await global.AikolAPI?.getCredits();
            if (credits) {
                document.querySelector('.aikol-side__credits-num').textContent = credits.balance;
            }
        } catch (_) {}
        try {
            const r = await global.AikolAPI?.listModels();
            const m = r?.models?.[0];
            const slot = document.querySelector('.aikol-side__model-name');
            if (slot && m) slot.textContent = m.name || 'Untitled';
        } catch (_) {}

        // Email from authData (loginindex_auth)
        try {
            const raw =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth');
            const a = raw ? JSON.parse(raw) : null;
            if (a) {
                const email = a.email || a.username || a.userId || '';
                const slot = document.querySelector('.aikol-side__email');
                if (slot) slot.textContent = String(email).slice(0, 28);
            }
        } catch (_) {}
    }

    function bindBurger() {
        const burger = document.getElementById('aikol-side-burger');
        const scrim = document.getElementById('aikol-side-scrim');
        const side = document.getElementById('aikol-sidebar');
        if (!burger || !side) return;

        function setOpen(open) {
            side.classList.toggle('aikol-side--open', open);
            scrim.classList.toggle('aikol-side__scrim--show', open);
            burger.setAttribute('aria-expanded', String(open));
        }
        burger.addEventListener('click', () =>
            setOpen(!side.classList.contains('aikol-side--open'))
        );
        scrim.addEventListener('click', () => setOpen(false));
        // Esc closes drawer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setOpen(false);
        });
    }

    function bindLogout() {
        const btn = document.getElementById('aikol-side-logout');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const ok = window.aikolConfirm
                ? await window.aikolConfirm({
                      title: 'Đăng xuất?',
                      body: '<p style="margin:0">Bạn sẽ được đưa về trang đăng nhập n2store.</p>',
                      confirmLabel: 'Đăng xuất',
                      cancelLabel: 'Ở lại',
                      danger: true,
                  })
                : confirm('Đăng xuất?');
            if (!ok) return;
            try {
                localStorage.removeItem('loginindex_auth');
                sessionStorage.removeItem('loginindex_auth');
                localStorage.removeItem('isLoggedIn');
            } catch (_) {}
            location.href = '../index.html';
        });
    }

    function renderIcons() {
        if (global.lucide?.createIcons) {
            try {
                global.lucide.createIcons();
            } catch (_) {}
        }
    }

    function waitForLucide(maxMs = 4000) {
        const start = Date.now();
        return new Promise((resolve) => {
            (function check() {
                if (global.lucide?.createIcons) return resolve(true);
                if (Date.now() - start > maxMs) return resolve(false);
                setTimeout(check, 60);
            })();
        });
    }

    function inject() {
        if (document.getElementById('aikol-sidebar')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = buildHtml();
        // Insert at body start so it sits left of <main>.
        document.body.insertBefore(wrap.firstElementChild, document.body.firstChild);
        // Insert burger + scrim too.
        for (const el of Array.from(wrap.children)) {
            document.body.appendChild(el);
        }
        // Lucide is loaded with defer — wait for it before rendering icons.
        renderIcons();
        waitForLucide().then(renderIcons);
        bindBurger();
        bindLogout();
        fillDock();

        // Re-poll dock every 30s so credits stay fresh on long sessions.
        setInterval(fillDock, 30000);
    }

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(inject);

    global.AikolSidebar = {
        _loaded: true,
        refresh: fillDock,
    };
})(typeof window !== 'undefined' ? window : globalThis);
