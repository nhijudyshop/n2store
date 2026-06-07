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
 *     <script src="../../web2/shared/page-shell.js"></script>
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

    const ASSET_VERSION = 'v=20260529a';

    // CSS files cần load
    const CSS_FILES = [
        '../../web2/shared/web2-sidebar.css',
        '../../native-orders/css/native-orders.css',
        '../../native-orders/css/web2-theme.css',
        '../../web2/shared/page-builder.css',
        '../../web2/shared/web2-effects.css',
    ];

    // Script tags cần load TRƯỚC khi mount (theo thứ tự).
    // web2-auth.js phải có TRƯỚC web2-sidebar.js để renderUserFooter()
    // có Web2Auth sẵn lúc mount → footer "Chưa đăng nhập" / user info hiện
    // ngay frame đầu, không có race window làm footer trống.
    const SCRIPTS_PRELOAD = [
        'https://unpkg.com/lucide@0.294.0/dist/umd/lucide.min.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
        '../../shared/js/firebase-config.js',
        '../../shared/js/shared-auth-manager.js',
        '../../shared/js/notification-system.js',
        '../../web2/shared/web2-auth.js',
        '../../web2/shared/web2-effects.js',
        // P1 2026-05-30: audit log helpers — Web2UserInfo + Web2HistoryTimeline.
        // Load AFTER web2-auth.js để pick up user correctly + AVAILABLE cho
        // page-builder gọi attachToPayload trong /create + /update.
        '../../web2/shared/web2-user-info.js?v=20260530a',
        '../../web2/shared/web2-history-timeline.js?v=20260530a',
        // P1 2026-05-30: DB badge ("DB Render 2.0" / "Firebase 2.0" / "Web 2.0")
        // kế bên h1. Pages khai báo qua bootstrap({dbBadge:'render'|'firebase'|'both'})
        // hoặc <meta name="web2-db" content="..."> (legacy).
        '../../web2/shared/web2-db-badge.js?v=20260530a',
        // 2026-06-01: Web2Optimistic.run({apply, rollback, run, ...}) helper
        // codifies UI-first pattern (apply optimistic → backend background →
        // rollback + notify nếu fail). Mục đích: mọi page Web 2.0 tương tác
        // tức thì, không chờ network. Pages dùng pattern này → import Web2Optimistic.
        '../../web2/shared/web2-optimistic.js?v=20260601a',
    ];

    // Scripts mount sidebar + SSE bridge + api + page-builder.
    // web2-sse-bridge MUST load before page-builder so generic pages can
    // subscribe topic 'web2:<entity-slug>' (xem docs/web2/SSE-REALTIME.md).
    const SCRIPTS_MOUNT = [
        '../../web2/shared/web2-sidebar.js',
        '../../web2/shared/web2-sse-bridge.js?v=20260526sse2',
        '../../web2/shared/web2-api.js',
        '../../web2/shared/page-builder.js',
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
        document.body.classList.add('web2-theme');
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

        // P1 2026-05-30: dbBadge — inject meta tag để web2-db-badge.js auto-render.
        // Default 'render' vì page-shell pages chỉ dùng /api/web2/<slug>/* (Render PG).
        // Pages override qua bootstrap({dbBadge:'firebase'|'both'|'render'}).
        const dbBadge = config.dbBadge || 'render';
        if (dbBadge && !document.head.querySelector('meta[name="web2-db"]')) {
            const m = document.createElement('meta');
            m.setAttribute('name', 'web2-db');
            m.setAttribute('content', dbBadge);
            document.head.appendChild(m);
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

        // 7. Mount page-builder (renders breadcrumb với title — anchor cho DB badge)
        if (window.Web2Page) {
            try {
                Web2Page.mount('#pageRoot', config);
            } catch (e) {
                console.error('[page-shell] page-builder mount failed', e);
            }
        }

        // 7b. Mount DB badge SAU page-builder để breadcrumb-current đã tồn tại
        // trong DOM. Auto-mount của web2-db-badge.js chạy quá sớm (DOMContentLoaded),
        // explicit re-mount đảm bảo pick up breadcrumb/h1.
        if (window.Web2DbBadge?.mount) {
            try {
                window.Web2DbBadge.mount();
            } catch (e) {
                console.warn('[page-shell] DB badge mount failed', e);
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
