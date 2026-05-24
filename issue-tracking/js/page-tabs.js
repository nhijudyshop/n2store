// #Note: Page-level tabs (CSKH / BÁN HÀNG / TRẢ HÀNG). Lazy-loads iframes, syncs URL hash, suppresses iframe's own sidebar.

(function () {
    'use strict';

    const TABS = ['cskh', 'ban-hang', 'tra-hang'];
    const DEFAULT_TAB = 'cskh';

    const EMBED_SRC = {
        'ban-hang': '../web2/fastsaleorder-invoice/',
        'tra-hang': '../web2/fastsaleorder-refund/',
    };

    const EMBED_TITLES = {
        cskh: 'CSKH và Quản Lý',
        'ban-hang': 'Bán hàng (Hóa đơn)',
        'tra-hang': 'Trả hàng',
    };

    // CSS injected into iframe to hide its built-in sidebar (we already have one in parent)
    // and stretch its content to full iframe viewport.
    const EMBED_OVERRIDE_CSS = `
        .web2-aside { display: none !important; }
        .web2-shell { display: block !important; }
        .web2-shell > .main-content { height: 100vh !important; max-width: 100% !important; }
        body { margin: 0; }
    `;

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

        // Lazy-load iframe for embed tabs
        if (EMBED_SRC[tabId]) {
            ensureIframeLoaded(tabId);
            document.body.classList.add('pt-embed-active');
        } else {
            document.body.classList.remove('pt-embed-active');
        }

        // Update document title for clarity
        const subtitle = EMBED_TITLES[tabId];
        if (subtitle && /^CSKH/.test(document.title)) {
            // keep original title structure; just append subtitle on switch (cheap, idempotent)
        }

        // Sync URL hash without jumping
        if (updateHash) {
            const next = '#' + tabId;
            if (location.hash !== next) {
                history.replaceState(null, '', next);
            }
        }
    }

    function ensureIframeLoaded(tabId) {
        const pane = document.querySelector(`.page-tab-pane[data-tab="${tabId}"]`);
        if (!pane) return;
        let iframe = pane.querySelector('iframe.embed-iframe');
        if (!iframe) return;

        if (iframe.dataset.src && !iframe.src) {
            iframe.addEventListener(
                'load',
                () => {
                    injectEmbedCss(iframe);
                    const sk = pane.querySelector('.embed-skeleton');
                    if (sk) sk.classList.add('hidden');
                },
                { once: true }
            );
            iframe.src = iframe.dataset.src;
        }
    }

    function injectEmbedCss(iframe) {
        const apply = () => {
            try {
                const doc = iframe.contentDocument;
                if (!doc || !doc.head) return false;
                if (doc.getElementById('pt-embed-override')) return true;
                const style = doc.createElement('style');
                style.id = 'pt-embed-override';
                style.textContent = EMBED_OVERRIDE_CSS;
                doc.head.appendChild(style);
                return true;
            } catch (e) {
                console.warn('[page-tabs] cannot inject override CSS:', e);
                return false;
            }
        };

        // First pass immediately; second pass on DOMContentLoaded inside iframe (in case head not ready)
        if (!apply()) {
            try {
                iframe.contentWindow?.addEventListener('DOMContentLoaded', apply, { once: true });
            } catch (_) {}
        }
        // Final retry after a short delay (web2 scripts may swap head content)
        setTimeout(apply, 400);
        setTimeout(apply, 1200);
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
