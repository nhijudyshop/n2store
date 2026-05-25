// #Note: Page-level tabs (CSKH / BÁN HÀNG / TRẢ HÀNG). Lazy-loads iframes, syncs URL hash, suppresses iframe's own sidebar.

(function () {
    'use strict';

    const TABS = ['cskh', 'ban-hang', 'tra-hang', 'mua-hang-ncc', 'tra-hang-ncc'];
    const DEFAULT_TAB = 'cskh';

    // Tabs that fetch from TPOS directly (handled by tpos-fastsale-tab.js).
    // page-tabs.js delegates first-load to window.TposFastSaleTabs.activate(tabId).
    const TPOS_TABS = new Set(['ban-hang', 'tra-hang', 'mua-hang-ncc', 'tra-hang-ncc']);

    function activate(tabId, { updateHash = true } = {}) {
        if (!TABS.includes(tabId)) tabId = DEFAULT_TAB;

        // Toggle buttons
        document.querySelectorAll('.page-tab-btn').forEach((btn) => {
            const on = btn.dataset.tab === tabId;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
            btn.setAttribute('tabindex', on ? '0' : '-1');
        });

        // Toggle panes
        document.querySelectorAll('.page-tab-pane').forEach((pane) => {
            pane.classList.toggle('active', pane.dataset.tab === tabId);
        });

        // For TPOS tabs, trigger first-load (idempotent — module handles dedupe).
        if (TPOS_TABS.has(tabId)) {
            try {
                window.TposFastSaleTabs?.activate?.(tabId);
            } catch (e) {
                console.warn('[page-tabs] TPOS activate failed:', e);
            }
        }

        // Sync URL hash without jumping
        if (updateHash) {
            const next = '#' + tabId;
            if (location.hash !== next) {
                history.replaceState(null, '', next);
            }
        }
    }

    function readInitialTab() {
        const hash = (location.hash || '').replace(/^#/, '');
        return TABS.includes(hash) ? hash : DEFAULT_TAB;
    }

    function bindEvents() {
        document.querySelectorAll('.page-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => activate(btn.dataset.tab));
            btn.addEventListener('keydown', (e) => {
                const idx = TABS.indexOf(btn.dataset.tab);
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const dir = e.key === 'ArrowRight' ? 1 : -1;
                    const next = TABS[(idx + dir + TABS.length) % TABS.length];
                    activate(next);
                    document.querySelector(`.page-tab-btn[data-tab="${next}"]`)?.focus();
                }
            });
        });

        window.addEventListener('hashchange', () => {
            activate(readInitialTab(), { updateHash: false });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindEvents();
        activate(readInitialTab(), { updateHash: false });
    });
})();
