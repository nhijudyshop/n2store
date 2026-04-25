// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 page shell — DRY helper.
 * Một file HTML page chỉ cần:
 *
 *   <!DOCTYPE html>
 *   <html lang="vi">
 *   <head>
 *     <meta charset="UTF-8">
 *     <title>Nhóm sản phẩm — Web 2.0</title>
 *     <script src="../../web2-shared/page-shell.js"></script>
 *   </head>
 *   <body>
 *     <script>
 *       Web2Shell.bootstrap({
 *         slug: 'productcategory',
 *         title: 'Nhóm sản phẩm',
 *         breadcrumb: ['App', 'Sản phẩm'],
 *         columns: [...],
 *         fields:  [...],
 *       });
 *     </script>
 *   </body>
 *   </html>
 *
 * Phần còn lại (CSS, sidebar, page-builder, body shell) được inject động.
 */
(function (global) {
    'use strict';

    const ASSET_VERSION = 'v=20260425k';

    // CSS files cần load
    const CSS_FILES = [
        '../../web2-shared/tpos-sidebar.css',
        '../../native-orders/css/native-orders.css',
        '../../native-orders/css/tpos-theme.css',
        '../../web2-shared/page-builder-tpos.css',
    ];

    // Script tags cần load TRƯỚC khi mount (theo thứ tự)
    const SCRIPTS_PRELOAD = [
        'https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
        '../../shared/js/firebase-config.js',
        '../../shared/js/shared-auth-manager.js',
        '../../shared/js/notification-system.js',
    ];

    // Scripts mount sidebar + page-builder
    const SCRIPTS_MOUNT = [
        '../../web2-shared/tpos-sidebar.js',
        '../../web2-shared/web2-api.js',
        '../../web2-shared/page-builder.js',
    ];

    function injectFontPreconnect() {
        const head = document.head;
        const links = [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap',
            },
        ];
        for (const cfg of links) {
            const l = document.createElement('link');
            for (const [k, v] of Object.entries(cfg)) l.setAttribute(k, v);
            head.appendChild(l);
        }
    }

    function injectCss() {
        for (const path of CSS_FILES) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = `${path}?${ASSET_VERSION}`;
            document.head.appendChild(l);
        }
        // Local layout overrides
        const style = document.createElement('style');
        style.textContent = `
            body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #ecf0f5; }
            .web2-shell { display: flex; min-height: 100vh; }
            .web2-aside { flex-shrink: 0; }
            .web2-main { flex: 1; overflow: auto; height: 100vh; }
            #pageRoot { padding: 12px 16px 32px; }
            .web2-main-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
            .web2-breadcrumb { font-size: 13px; color: #777; flex: 1; }
            .web2-breadcrumb-sep { margin: 0 6px; color: #ccc; }
            .web2-breadcrumb-current { color: #444; font-weight: 600; }
            .web2-breadcrumb-item { color: #777; }
        `;
        document.head.appendChild(style);
    }

    function injectShell() {
        // body class for theme inheritance
        document.body.classList.add('tpos-theme');
        const shell = document.createElement('div');
        shell.className = 'web2-shell';
        shell.innerHTML = `
            <aside class="web2-aside" id="web2Aside"></aside>
            <main class="web2-main">
                <div id="pageRoot"></div>
            </main>
        `;
        // Insert as first child so user scripts run after
        document.body.insertBefore(shell, document.body.firstChild);
    }

    function loadScript(src, opts = {}) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src.startsWith('http') ? src : `${src}?${ASSET_VERSION}`;
            if (opts.defer) s.defer = true;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Failed: ' + src));
            document.head.appendChild(s);
        });
    }

    async function loadScriptsSequential(list) {
        for (const src of list) {
            await loadScript(src).catch((e) => console.warn('[page-shell]', e.message));
        }
    }

    /**
     * Bootstrap a page from config. Call once at page load.
     */
    async function bootstrap(config) {
        if (!config?.slug || !config?.title) {
            throw new Error('page-shell: slug + title required');
        }

        // 1. CSS first (head must be ready)
        injectFontPreconnect();
        injectCss();

        // 2. Wait for body
        if (!document.body) {
            await new Promise((r) =>
                document.addEventListener('DOMContentLoaded', r, { once: true })
            );
        }

        // 3. Inject body shell
        injectShell();

        // 4. Load preload scripts (lucide, firebase, shared/*)
        await loadScriptsSequential(SCRIPTS_PRELOAD);

        // 5. Load mount scripts (sidebar + api + page-builder)
        await loadScriptsSequential(SCRIPTS_MOUNT);

        // 6. Mount sidebar
        if (window.Web2Sidebar) {
            try {
                Web2Sidebar.mount('#web2Aside', { activeRoute: config.slug });
            } catch (e) {
                console.warn('[page-shell] sidebar mount failed', e);
            }
        }

        // 7. Mount page-builder
        if (window.Web2Page) {
            try {
                Web2Page.mount('#pageRoot', config);
            } catch (e) {
                console.error('[page-shell] page-builder mount failed', e);
            }
        }

        // 8. Re-init lucide for any deferred icons
        if (window.lucide) {
            try {
                window.lucide.createIcons();
            } catch {}
        }
    }

    global.Web2Shell = { bootstrap, ASSET_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
