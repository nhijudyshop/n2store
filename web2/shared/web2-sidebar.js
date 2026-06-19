// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * WEB2-clone sidebar for Web 2.0 pages.
 * Web 2.0 sidebar navigation (web2/<slug>/index.html).
 * Ours-counterpart routes go under /web2/<slug>/index.html.
 *
 * Usage (from /web2/<slug>/index.html):
 *   <link rel="stylesheet" href="../shared/web2-sidebar.css">
 *   <script src="../shared/web2-sidebar.js"></script>
 * Usage (from /native-orders/, /web2-pancake/, /so-order/):
 *   <link rel="stylesheet" href="../web2/shared/web2-sidebar.css">
 *   <script src="../web2/shared/web2-sidebar.js"></script>
 *   <body>
 *     <div class="web2-shell">
 *       <aside class="web2-aside" id="web2Aside"></aside>
 *       <main class="web2-main"> ... </main>
 *     </div>
 *   </body>
 *   <script>Web2Sidebar.mount('#web2Aside', { activeRoute: 'native-orders' });</script>
 */

(function (global) {
    'use strict';

    // Resolve this script's own directory so we can reference sibling assets
    // (logo image, sub-modules) regardless of which depth the host page sits at.
    const SCRIPT_BASE_URL = (() => {
        const cs = document.currentScript;
        if (cs && cs.src) return cs.src;
        const list = document.getElementsByTagName('script');
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].src && /web2-sidebar\.js(\?|#|$)/.test(list[i].src)) return list[i].src;
        }
        return location.href;
    })();
    const LOGO_URL = new URL('./img/logo-emblem.png?v=20260530', SCRIPT_BASE_URL).toString();

    // Auto-load shared Web 2.0 modules (popup + delivery picker).
    // Resolves URLs relative to this script so it works regardless of which
    // depth the host page sits at (/web2/foo/, /native-orders/, /web2-pancake/, etc.).
    (function autoLoadSharedModules() {
        const here = document.currentScript;
        if (!here) return;
        const inject = (relPath, version) => {
            try {
                const url = new URL(`./${relPath}?v=${version}`, here.src);
                const s = document.createElement('script');
                s.src = url.toString();
                s.async = false; // preserve load order
                (document.head || document.documentElement).appendChild(s);
            } catch {
                /* ignore */
            }
        };
        if (!global.Popup) inject('popup.js', '20260617');
        if (!global.DeliveryMethodPicker) inject('delivery-method-picker.js', '20260604nj4');
        if (!global.Web2Auth) inject('web2-auth.js', '20260518a');
        // Command palette toàn cục (Ctrl/Cmd+K) — có mặt mọi trang Web 2.0.
        if (!global.Web2CommandPalette) inject('web2-command-palette.js', '20260613a');
        // Lottie animation dùng chung (airbnb/lottie-web) — lazy, tự enhance
        // trạng thái rỗng + loading + feedback. Có mặt MỌI trang Web 2.0.
        if (!global.Web2Lottie) inject('web2-lottie.js', '20260615a');
        // Toast/notification dùng chung — đảm bảo MỌI trang có notificationManager
        // (audit: 3 trang thiếu → thao tác không có feedback). Guard theo script-tag.
        if (!document.querySelector('script[src*="notification-system"]')) {
            inject('../../shared/js/notification-system.js', '20260613a');
        }
        // Foundation utils dùng chung (codemap §4 dedup, 2026-06-18) — format tiền/
        // ngày-giờ GMT+7, fetch JSON+auth, toast, SĐT, text/tìm-kiếm, escape HTML.
        // Pure + nhẹ, có mặt MỌI trang Web 2.0 → trang adopt thay hàm copy cục bộ.
        if (!global.Web2Escape) inject('web2-escape.js', '20260612');
        if (!global.Web2Format) inject('web2-format.js', '20260618');
        if (!global.Web2ApiFetch) inject('web2-api-fetch.js', '20260618');
        if (!global.Web2Notify) inject('web2-notify.js', '20260618');
        if (!global.Web2PhoneUtils) inject('web2-phone-utils.js', '20260618');
        if (!global.Web2TextUtils) inject('web2-text-utils.js', '20260618');
        // Shared utils đợt 2 (dedup, 2026-06-19) — broadly-useful: giải mã JWT,
        // avatar (màu+chữ+proxy+HTML), lightbox xem ảnh. Pure/nhẹ, mọi trang dùng.
        // (canvas/so-order/pancake-import là feature-specific → trang tự load.)
        if (!global.Web2JwtUtils) inject('web2-jwt-utils.js', '20260619a');
        if (!global.Web2AvatarUtils) inject('web2-avatar-utils.js', '20260619a');
        if (!global.Web2ImageLightbox) inject('web2-image-lightbox.js', '20260619a');
    })();

    // Group definitions matching WEB2 sidebar structure.
    // For routes already implemented in our project: `our` field points to the URL.
    // Routes not yet implemented (placeholder): `our: null` — clicking shows "Coming soon".
    const NAV = [
        {
            label: 'Tổng quan',
            icon: 'home',
            single: true,
            our: '../web2/overview/index.html',
        },
        {
            label: 'Tính năng mới',
            icon: 'sparkles',
            children: [
                { label: 'Dashboard KPI', our: '../web2/dashboard/index.html' },
                { label: 'KPI Nhân viên', our: '../web2/kpi/index.html' },
                { label: 'Thông báo', our: '../web2/notifications/index.html' },
                { label: 'Lịch sử thao tác', our: '../web2/audit-log/index.html' },
                { label: 'Đối soát CK', our: '../web2/ck-dashboard/index.html' },
                { label: 'Zalo', our: '../web2/zalo/index.html' },
                { label: 'Phân quyền', our: '../web2/users-permissions/index.html' },
                {
                    label: 'Cấu hình & Hệ thống',
                    our: '../web2/system/index.html',
                },
            ],
        },
        {
            label: 'Đa dụng Web 2.0',
            icon: 'wrench',
            children: [
                {
                    label: 'Tăng số lượng comment',
                    our: '../web2/multi-tool/index.html',
                },
                {
                    label: 'Studio chụp tách nền',
                    our: '../web2/photo-studio/index.html',
                },
                {
                    label: 'Đếm SP qua camera 📷',
                    our: '../web2/product-counter/index.html',
                },
            ],
        },
        {
            label: 'Bán Hàng',
            icon: 'shopping-bag',
            children: [
                {
                    label: 'Bán hàng (HĐ)',
                    our: '../web2/fastsaleorder-invoice/index.html',
                },
                {
                    label: 'Đối soát đóng gói',
                    our: '../web2/reconcile/index.html',
                },
                {
                    label: 'Trả hàng',
                    our: '../web2/fastsaleorder-refund/index.html',
                },
                {
                    label: 'Thu về',
                    our: '../web2/returns/index.html',
                },
                {
                    label: 'Phiếu giao hàng',
                    our: '../web2/fastsaleorder-delivery/index.html',
                },
            ],
        },
        {
            label: 'Sale Online',
            icon: 'globe',
            children: [
                {
                    label: 'Đơn Web',
                    our: '../native-orders/index.html',
                },
                {
                    label: 'Sổ Order',
                    our: '../so-order/index.html',
                },
                { label: 'Live Chat', our: '../live-chat/index.html' },
                // Panel chat Pancake tách thành trang riêng (2026-06-11) —
                // live-chat/index.html giờ chỉ còn cột comment + capture.
                { label: 'Chat Pancake', our: '../live-chat/chat.html' },
                // Viewer comment livestream tối ưu ĐIỆN THOẠI (chỉ-xem) — 2026-06-14.
                { label: 'Comment Live 📱', our: '../live-chat/comments-mobile.html' },
            ],
        },
        {
            label: 'Mua hàng',
            icon: 'shopping-cart',
            children: [
                {
                    label: 'Sổ Order NCC',
                    our: '../so-order/index.html',
                },
                {
                    label: 'Trả hàng NCC',
                    our: '../web2/purchase-refund/index.html',
                },
                {
                    label: 'Công nợ NCC',
                    our: '../web2/supplier-debt/index.html',
                },
                {
                    label: 'Ví NCC',
                    our: '../web2/supplier-wallet/index.html',
                },
            ],
        },
        {
            label: 'Tài chính',
            icon: 'dollar-sign',
            children: [
                {
                    label: 'Lịch sử biến động số dư (SePay)',
                    our: '../web2/balance-history/index.html',
                },
            ],
        },
        {
            label: 'Khách hàng',
            icon: 'users',
            children: [
                {
                    label: 'Kho Khách Hàng (Web 2.0)',
                    our: '../web2/customers/index.html',
                },
                {
                    label: 'Ví Khách Hàng',
                    our: '../web2/customer-wallet/index.html',
                },
            ],
        },
        {
            label: 'Sản phẩm',
            icon: 'package',
            children: [
                { label: 'Kho SP Web 2.0', our: '../web2/products/index.html' },
                { label: 'Kho Biến Thể', our: '../web2/variants/index.html' },
                {
                    label: 'Nhóm sản phẩm',
                    our: '../web2/product-category/index.html',
                },
            ],
        },
        {
            label: 'Báo cáo',
            icon: 'bar-chart-3',
            children: [
                {
                    label: 'Thống kê doanh thu',
                    our: '../web2/report-revenue/index.html',
                },
                {
                    label: 'Thống kê giao hàng',
                    our: '../web2/report-delivery/index.html',
                },
                {
                    label: 'Tra cứu vận đơn J&T',
                    icon: 'package-search',
                    our: '../web2/jt-tracking/index.html',
                },
            ],
        },
        {
            label: 'Cấu hình',
            icon: 'settings',
            children: [
                {
                    label: 'Lấy comment Live (poller)',
                    icon: 'radio',
                    our: '../web2/livestream-poller/index.html',
                    // Web 2.0-only — bật/tắt trang server tự lấy comment livestream.
                },
                {
                    label: 'Người dùng (Web 2.0)',
                    our: '../web2/users/index.html',
                },
                {
                    label: 'Pancake (Token)',
                    icon: 'key-round',
                    our: '../web2/pancake-settings/index.html',
                    // Web 2.0-only page — no WEB2 counterpart.
                },
                {
                    label: 'Phương thức giao hàng',
                    icon: 'truck',
                    our: '../web2/delivery-zone/index.html',
                    // Web 2.0-only — quản lý vùng giao + phí + từ khoá auto-detect.
                },
                {
                    label: 'Máy in',
                    icon: 'printer',
                    our: '../web2/printer-settings/index.html',
                    // Web 2.0-only — danh sách máy in + gán theo chức năng (PBH/tem).
                },
            ],
        },
    ];

    // ---------- Helpers ----------
    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function isOurRoute(item) {
        return Boolean(item.our);
    }

    /**
     * Resolve `our` path relative to current page location.
     * NAV stores paths as `../web2/X/index.html` assuming caller is at depth 1
     * from project root (e.g. /native-orders/, /web2/products/, /web2-pancake/).
     * For pages inside /web2/<slug>/ (depth 2), prepend an extra `../` so the
     * link resolves to /web2/X/ instead of broken /web2/web2/X/.
     */
    function resolveOur(rawHref) {
        if (!rawHref || rawHref === '#') return rawHref;
        const projectRel = rawHref.replace(/^(\.\.\/)+/, '');
        const pn = window.location.pathname || '';
        // Caller is inside /web2/<slug>/ → depth 2 from project root
        if (/\/web2\/[^/]+\/[^/]*$/.test(pn)) {
            return '../../' + projectRel;
        }
        // Default: caller at depth 1 (native-orders/, web2/products/, web2-pancake/, web2/)
        return '../' + projectRel;
    }

    // Explicit allow-list: chỉ những page user MUỐN có "- WEB 2.0" badge.
    // KHÔNG auto-detect URL pattern (web2/*) vì nhiều trang dưới web2/ vẫn là
    // WEB2-clone (chưa code thật) — user chỉ muốn mark các trang user đã đầu tư
    // code thật + custom logic.
    //
    // Quy ước: path tương đối từ project root (bỏ leading ../../ hoặc ../).
    // Thêm vào set khi user code xong 1 trang mới. Page mới ban đầu KHÔNG có
    // badge — chỉ thêm vào set khi user xác nhận đã hoàn thành.
    const WEB2_PAGES = new Set([
        'web2/overview/index.html',
        'web2/fastsaleorder-invoice/index.html',
        'web2/reconcile/index.html',
        'native-orders/index.html',
        'so-order/index.html',
        'live-chat/index.html',
        'live-chat/comments-mobile.html',
        'web2/purchase-refund/index.html',
        'web2/supplier-debt/index.html',
        'web2/supplier-wallet/index.html',
        'web2/balance-history/index.html',
        'web2/products/index.html',
        'web2/variants/index.html',
        'web2/product-category/index.html',
        'web2/delivery-zone/index.html',
        'web2/printer-settings/index.html',
        'web2/users/index.html',
        'web2/customer-wallet/index.html',
        'web2/customers/index.html',
        // F01-F12 future-development pages
        'web2/dashboard/index.html',
        'web2/notifications/index.html',
        'web2/audit-log/index.html',
        'web2/photo-studio/index.html',
        'web2/product-counter/index.html',
        'web2/users-permissions/index.html',
        'web2/system/index.html',
        'web2/zalo/index.html',
    ]);
    function isWeb2Item(item) {
        if (!item || !item.our) return false;
        // Normalize: strip leading ../ or ../../ levels.
        const path = String(item.our).replace(/^(\.\.\/)+/, '');
        return WEB2_PAGES.has(path);
    }

    // Admin gating — items with `adminOnly: true` only render if current user is admin.
    // 3W6 (2026-06-13): Web 2.0 page → ƯU TIÊN role từ Web2Auth (hệ auth của Web
    // 2.0). Chỉ fallback sang auth Web 1.0 (loginindex_auth/userType) khi chưa có
    // Web2Auth user — tránh trộn 2 hệ auth cho UI gating. (Server vẫn gate độc lập
    // qua requireWeb2Admin nên đây chỉ là ẩn/hiện item.)
    function _isAdmin() {
        try {
            const w2user =
                typeof window !== 'undefined' && window.Web2Auth?.getStored
                    ? window.Web2Auth.getStored()?.user
                    : null;
            if (w2user && w2user.role) {
                return String(w2user.role).toLowerCase() === 'admin';
            }
            // Fallback Web 1.0 auth (khi Web2Auth chưa load / chưa login web2)
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
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

    function renderItem(item, activeUrl) {
        if (item.adminOnly && !_isAdmin()) return '';
        const isImpl = isOurRoute(item);
        const href = isImpl ? resolveOur(item.our) : '#';
        const isActive =
            isImpl && activeUrl && activeUrl.endsWith(item.our.replace(/^(\.\.\/)+/, ''));
        const cls = `web2-nav-sub-link${isActive ? ' active' : ''}`;
        const onclick = isImpl
            ? ''
            : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(item.label)}')"`;
        const soon = isImpl ? '' : ' <span class="web2-nav-soon">soon</span>';
        // Đuôi " - WEB 2.0" cho item có code thật trong project (per user request).
        const w2Tag = isWeb2Item(item) ? ' <span class="web2-nav-w2tag">- WEB 2.0</span>' : '';
        return `<li><a href="${escapeHtml(href)}" class="${cls}" ${onclick}>${escapeHtml(item.label)}${w2Tag}${soon}</a></li>`;
    }

    function renderGroup(g, activeUrl) {
        if (g.single) {
            const isImpl = isOurRoute(g);
            const href = isImpl ? resolveOur(g.our) : '#';
            const isActive =
                isImpl && activeUrl && activeUrl.endsWith(g.our.replace(/^(\.\.\/)+/, ''));
            const cls = `web2-nav-link${isActive ? ' active' : ''}`;
            const onclick = isImpl
                ? ''
                : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(g.label)}')"`;
            const w2Tag = isWeb2Item(g) ? ' <span class="web2-nav-w2tag">- WEB 2.0</span>' : '';
            return `<a href="${escapeHtml(href)}" class="${cls}" ${onclick}>
                <i data-lucide="${g.icon}" class="icon"></i>
                <span class="label">${escapeHtml(g.label)}${w2Tag}</span>
            </a>`;
        }
        const hasOurChild = (g.children || []).some(isOurRoute);
        const open = (g.children || []).some(
            (c) => isOurRoute(c) && activeUrl && activeUrl.endsWith(c.our.replace(/^(\.\.\/)+/, ''))
        );
        // Badge số trang Web 2.0 trong group — hiển thị bên cạnh chevron để user
        // biết group nào có page có code thật mà không cần expand.
        const web2Count = (g.children || []).filter(isWeb2Item).length;
        const web2Badge = web2Count
            ? ` <span class="web2-nav-w2badge" title="${web2Count} trang Web 2.0 có code thật">${web2Count}</span>`
            : '';
        return `
            <div class="web2-nav-group${open ? ' is-open' : ''}">
                <div class="web2-nav-group-head" onclick="this.parentElement.classList.toggle('is-open')">
                    <i data-lucide="${g.icon}" class="icon"></i>
                    <span class="label">${escapeHtml(g.label)}${hasOurChild ? '' : ' <span class="web2-nav-soon">soon</span>'}${web2Badge}</span>
                    <i data-lucide="chevron-right" class="caret"></i>
                </div>
                <ul class="web2-nav-sub">
                    ${(g.children || []).map((c) => renderItem(c, activeUrl)).join('')}
                </ul>
            </div>`;
    }

    const COLLAPSE_KEY = 'web2SidebarCollapsed';
    function isCollapsed() {
        try {
            return localStorage.getItem(COLLAPSE_KEY) === '1';
        } catch {
            return false;
        }
    }
    function setCollapsed(v) {
        document.body.classList.toggle('web2-sidebar-collapsed', !!v);
        try {
            localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
        } catch {
            /* ignore */
        }
    }

    function renderUserFooter(el) {
        if (!el) return;
        const stored =
            typeof window !== 'undefined' && window.Web2Auth ? window.Web2Auth.getStored() : null;
        const user = stored?.user || null;
        let footer = el.querySelector('.web2-user-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'web2-user-footer';
            el.appendChild(footer);
        }
        if (!user) {
            // Logged-out state: show "Chưa đăng nhập" + login button.
            footer.classList.add('is-logged-out');
            footer.innerHTML = `<div class="web2-user-header">
                    <div class="web2-user-avatar web2-user-avatar-anon" title="Chưa đăng nhập">
                        <i data-lucide="user"></i>
                    </div>
                    <div class="web2-user-info">
                        <div class="web2-user-name">Chưa đăng nhập</div>
                        <div class="web2-user-meta">
                            <span class="web2-user-anon-hint">Bấm để đăng nhập</span>
                        </div>
                    </div>
                </div>
                <button class="web2-user-login-btn" id="web2UserLogin" type="button">
                    <i data-lucide="log-in"></i>
                    <span class="web2-user-login-text">Đăng nhập</span>
                </button>`;
            footer.querySelector('#web2UserLogin')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const loginPath = window.Web2Auth?.loginUrl?.() || '../web2/login/index.html';
                const next = location.pathname + location.search;
                location.href = `${loginPath}?next=${encodeURIComponent(next)}`;
            });
            if (window.lucide) lucide.createIcons();
            return;
        }
        footer.classList.remove('is-logged-out');
        const initial = escapeHtml(
            (user.displayName || user.username || '?').slice(0, 1).toUpperCase()
        );
        const username = escapeHtml(user.username || '');
        const displayName = escapeHtml(user.displayName || user.username || '');
        const role = escapeHtml(user.role || '');
        footer.innerHTML = `<div class="web2-user-header">
                    <div class="web2-user-avatar" title="${username}">${initial}</div>
                    <div class="web2-user-info">
                        <div class="web2-user-name" title="${displayName} (${username})">${displayName}</div>
                        <div class="web2-user-meta">
                            <span class="web2-user-handle">@${username}</span>
                            <span class="web2-user-dot">·</span>
                            <span class="web2-user-role">${role}</span>
                        </div>
                    </div>
                </div>
                <button class="web2-user-logout-btn" id="web2UserLogout" type="button">
                    <i data-lucide="log-out"></i>
                    <span class="web2-user-logout-text">Đăng xuất</span>
                </button>`;
        footer.querySelector('#web2UserLogout')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.Web2Auth?.logout) window.Web2Auth.logout({ redirect: true });
        });
        if (window.lucide) lucide.createIcons();
    }

    const Web2Sidebar = {
        NAV,
        mount(selector, opts = {}) {
            const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
            if (!el) return;
            const activeUrl = opts.activeUrl || window.location.href;
            el.innerHTML = `
                <div class="web2-brand">
                    <img class="web2-brand-logo" src="${LOGO_URL}" alt="N2 Store" width="32" height="32" decoding="async">
                    <span class="web2-brand-text">Web 2.0</span>
                    <span class="web2-brand-sub">v${opts.version || '1.0'}</span>
                    <button class="web2-sidebar-toggle" id="web2SidebarToggle" type="button" title="Ẩn/hiện menu">
                        <i data-lucide="panel-left-close"></i>
                    </button>
                </div>
                <nav class="web2-nav">
                    ${NAV.map((g) => renderGroup(g, activeUrl)).join('')}
                </nav>
            `;
            // User footer: render now if Web2Auth loaded, else retry once Web2Auth available.
            renderUserFooter(el);
            if (!window.Web2Auth) {
                // Poll briefly waiting for web2-auth.js to load (max 2s)
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts++;
                    if (window.Web2Auth) {
                        clearInterval(timer);
                        renderUserFooter(el);
                    } else if (attempts > 20) {
                        clearInterval(timer);
                    }
                }, 100);
            }
            // Restore collapsed state from localStorage on mount
            setCollapsed(isCollapsed());
            const toggle = el.querySelector('#web2SidebarToggle');
            toggle?.addEventListener('click', (e) => {
                e.stopPropagation();
                setCollapsed(!isCollapsed());
            });
            if (window.lucide) lucide.createIcons();
            // F04 mobile: inject hamburger + scrim if <=900px
            if (!document.querySelector('.w2-mobile-menu-btn')) {
                const btn = document.createElement('button');
                btn.className = 'w2-mobile-menu-btn';
                btn.setAttribute('aria-label', 'Mở menu');
                document.body.appendChild(btn);
                const scrim = document.createElement('div');
                scrim.className = 'web2-aside-scrim';
                document.body.appendChild(scrim);
                btn.onclick = () => {
                    el.classList.add('w2-aside-open');
                    scrim.classList.add('show');
                };
                scrim.onclick = () => {
                    el.classList.remove('w2-aside-open');
                    scrim.classList.remove('show');
                };
                // Auto-close on nav click (mobile)
                el.addEventListener('click', (e) => {
                    if (e.target.closest('a') && window.innerWidth <= 900) {
                        el.classList.remove('w2-aside-open');
                        scrim.classList.remove('show');
                    }
                });
            }
        },
        renderUserFooter,
        alertSoon(label) {
            const msg = `"${label}" — chưa làm. Sẽ làm ở phase tiếp.`;
            if (window.notificationManager?.show) window.notificationManager.show(msg, 'info');
            else if (window.Popup) window.Popup.alert(msg, { type: 'info' });
            else alert(msg);
        },
        toggleCollapse: () => setCollapsed(!isCollapsed()),
        setCollapsed,
        isCollapsed,
    };

    global.Web2Sidebar = Web2Sidebar;
})(typeof window !== 'undefined' ? window : globalThis);

// --- Auto-load Service Health Monitor (idempotent, infra-level Web1+Web2) ---
(function () {
    if (typeof document === 'undefined' || window.__n2HealthMonitorLoaded) return;
    try {
        var cs = document.currentScript;
        var src = (cs && cs.src) || '';
        var m = src.match(/^(.*?)\/(?:shared|web2\/shared)\//);
        var root = m ? m[1] : location.origin || '';
        window.__n2HealthMonitorLoaded = true;
        var el = document.createElement('script');
        el.src = root + '/shared/js/service-health-monitor.js?v=20260615fix';
        el.async = true;
        (document.head || document.documentElement).appendChild(el);
    } catch (e) {
        /* non-fatal */
    }
})();
