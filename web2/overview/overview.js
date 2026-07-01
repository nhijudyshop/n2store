// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — trang giới thiệu (landing) Web 2.0, phong cách Framer.
//
// Trang giới thiệu toàn bộ Web 2.0 = landing page sau khi đăng nhập (login → overview).
// Nguồn module = catalog CHÍNH XÁC theo sidebar (web2-sidebar.js NAV), KHÔNG dùng
// modules-manifest.js (đã stale).
// Hiệu ứng = NHẸ & MƯỢT: thuần CSS (entrance hero, marquee, reveal qua
// IntersectionObserver) + count-up rAF + magnetic buttons. KHÔNG còn GSAP/
// ScrollTrigger/SplitText/Lenis (gây nặng/jank — đã gỡ 2026-06-28). Native scroll.
// Tôn trọng prefers-reduced-motion.

(function () {
    'use strict';

    var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- Module catalog (mirror of web2-sidebar.js NAV; admin groups/items flagged) -----
    var CATALOG = [
        {
            group: 'Bán Hàng',
            icon: 'shopping-bag',
            g: '#0068ff',
            items: [
                { l: 'Bán hàng (HĐ)', h: '../web2/fastsaleorder-invoice/index.html', i: 'receipt' },
                { l: 'Đối soát đóng gói', h: '../web2/reconcile/index.html', i: 'package-check' },
                { l: 'Trả hàng', h: '../web2/fastsaleorder-refund/index.html', i: 'undo-2' },
                { l: 'Thu về', h: '../web2/returns/index.html', i: 'banknote' },
                {
                    l: 'Phiếu giao hàng',
                    h: '../web2/fastsaleorder-delivery/index.html',
                    i: 'truck',
                },
            ],
        },
        {
            group: 'Sale Online',
            icon: 'globe',
            g: '#06b6d4',
            items: [
                { l: 'Đơn Web', h: '../native-orders/index.html', i: 'globe' },
                { l: 'Live Chat', h: '../live-chat/index.html', i: 'messages-square' },
            ],
        },
        {
            group: 'Mua hàng',
            icon: 'shopping-cart',
            g: '#8b5cf6',
            items: [
                { l: 'Sổ Order NCC', h: '../so-order/index.html', i: 'notebook-pen' },
                { l: 'Trả hàng NCC', h: '../web2/purchase-refund/index.html', i: 'undo-2' },
                { l: 'Công nợ NCC', h: '../web2/supplier-debt/index.html', i: 'scale' },
                { l: 'Ví NCC', h: '../web2/supplier-wallet/index.html', i: 'wallet' },
            ],
        },
        {
            group: 'Khách hàng',
            icon: 'users',
            g: '#ec4899',
            items: [
                { l: 'Kho Khách Hàng', h: '../web2/customers/index.html', i: 'users' },
                { l: 'Ví Khách Hàng', h: '../web2/customer-wallet/index.html', i: 'wallet' },
                { l: 'Chat Pancake', h: '../live-chat/chat.html', i: 'message-circle' },
                { l: 'Zalo', h: '../web2/zalo/index.html', i: 'message-square-text' },
            ],
        },
        {
            group: 'Sản phẩm',
            icon: 'package',
            g: '#f59e0b',
            items: [
                { l: 'Kho SP Web 2.0', h: '../web2/products/index.html', i: 'box' },
                { l: 'Kho Biến Thể', h: '../web2/variants/index.html', i: 'boxes' },
            ],
        },
        {
            group: 'Báo cáo',
            icon: 'bar-chart-3',
            g: '#10b981',
            items: [
                { l: 'Dashboard KPI', h: '../web2/dashboard/index.html', i: 'layout-dashboard' },
                {
                    l: 'Thống kê doanh thu',
                    h: '../web2/report-revenue/index.html',
                    i: 'trending-up',
                },
                { l: 'Thống kê giao hàng', h: '../web2/report-delivery/index.html', i: 'truck' },
                { l: 'Báo cáo kho', h: '../web2/report-warehouse/index.html', i: 'warehouse' },
                {
                    l: 'Tra cứu vận đơn J&T',
                    h: '../web2/jt-tracking/index.html',
                    i: 'package-search',
                },
            ],
        },
        {
            group: 'Chuyển khoản KH',
            icon: 'dollar-sign',
            g: '#14b8a6',
            items: [
                {
                    l: 'Biến động số dư (SePay)',
                    h: '../web2/balance-history/index.html',
                    i: 'arrow-left-right',
                },
                { l: 'Đối soát CK', h: '../web2/ck-dashboard/index.html', i: 'landmark' },
            ],
        },
        {
            group: 'Facebook',
            icon: 'facebook',
            g: '#1877f2',
            items: [
                { l: 'Đăng bài', h: '../web2/fb-posts/index.html', i: 'megaphone' },
                { l: 'Thống kê tương tác', h: '../web2/fb-insights/index.html', i: 'bar-chart-2' },
                { l: 'Thống kê quảng cáo', h: '../web2/fb-ads-stats/index.html', i: 'dollar-sign' },
                {
                    l: 'Tăng số lượng comment',
                    h: '../web2/multi-tool/index.html',
                    i: 'message-square-plus',
                },
                { l: 'Comment Live', h: '../live-chat/comments-mobile.html', i: 'smartphone' },
                {
                    l: 'Điều khiển TV',
                    h: '../web2/live-control/index.html',
                    i: 'sliders-horizontal',
                },
                { l: 'TV Livestream', h: '../web2/live-tv/index.html', i: 'tv' },
            ],
        },
        {
            group: 'AI',
            icon: 'bot',
            g: '#7c3aed',
            items: [
                { l: 'Trợ lý AI', h: '../web2/ai-hub/index.html', i: 'bot' },
                { l: 'Xưởng Video AI', h: '../web2/video-maker/index.html', i: 'clapperboard' },
                { l: 'Trợ lý AI theo trang', h: '../web2/ai-assistant/index.html', i: 'sparkles' },
                { l: 'Sửa ảnh AI', h: '../web2/ai-photo/index.html', i: 'wand-2' },
            ],
        },
        {
            group: 'Đa dụng',
            icon: 'wrench',
            g: '#f97316',
            items: [
                { l: 'Studio chụp tách nền', h: '../web2/photo-studio/index.html', i: 'scissors' },
                { l: 'Đếm SP qua camera', h: '../web2/product-counter/index.html', i: 'scan-line' },
                { l: 'Tạo card sản phẩm', h: '../web2/product-card/index.html', i: 'image' },
                { l: 'Làm đẹp video', h: '../web2/video-beauty/index.html', i: 'wand' },
            ],
        },
        {
            group: 'Tính năng mới',
            icon: 'sparkles',
            g: '#eab308',
            items: [
                { l: 'KPI Nhân viên', h: '../web2/kpi/index.html', i: 'target' },
                { l: 'Thông báo', h: '../web2/notifications/index.html', i: 'bell' },
            ],
        },
        {
            group: 'Cấu hình',
            icon: 'settings',
            g: '#64748b',
            items: [
                { l: 'Loại sản phẩm', h: '../web2/product-types/index.html', i: 'shirt' },
                { l: 'Lấy comment Live', h: '../web2/livestream-poller/index.html', i: 'radio' },
                { l: 'Pancake (Token)', h: '../web2/pancake-settings/index.html', i: 'key-round' },
                { l: 'Phương thức giao hàng', h: '../web2/delivery-zone/index.html', i: 'truck' },
                { l: 'TAG đơn hàng', h: '../web2/order-tags/index.html', i: 'tags' },
                { l: 'Máy in', h: '../web2/printer-settings/index.html', i: 'printer' },
                { l: 'Lịch sử thao tác', h: '../web2/audit-log/index.html', i: 'history' },
                {
                    l: 'Cấu hình & Hệ thống',
                    h: '../web2/system/index.html',
                    i: 'sliders-horizontal',
                    admin: true,
                },
            ],
        },
        {
            group: 'Quản trị viên',
            icon: 'shield',
            g: '#ef4444',
            admin: true,
            items: [
                { l: 'Chấm công', h: '../web2/cham-cong/index.html', i: 'fingerprint' },
                { l: 'Quản lý chi tiêu', h: '../web2/chi-tieu/index.html', i: 'wallet' },
                { l: 'Người dùng', h: '../web2/users/index.html', i: 'user-cog' },
            ],
        },
    ];

    // ----- helpers -----
    function isAdmin() {
        try {
            var u =
                window.Web2Auth && window.Web2Auth.getStored ? window.Web2Auth.getStored() : null;
            var role = u && u.user ? u.user.role : '';
            return String(role || '').toLowerCase() === 'admin';
        } catch (e) {
            return false;
        }
    }

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    // Catalog href dùng convention sidebar (`our`, giả định caller depth 1 từ root).
    // Overview ở /web2/overview/ = depth 2 → cần `../../` + path-gốc, nếu không sẽ
    // ra /web2/web2/X (404) hoặc /web2/native-orders (404). Logic khớp web2-sidebar.resolveOur.
    function resolveHref(rawHref) {
        if (!rawHref || rawHref === '#') return rawHref;
        var projectRel = rawHref.replace(/^(\.\.\/)+/, '');
        var pn = window.location.pathname || '';
        if (/\/web2\/[^/]+\/[^/]*$/.test(pn)) return '../../' + projectRel;
        return '../' + projectRel;
    }

    // Trang này có mở được không: catalog admin-flag + phân quyền thật (Web2Perm).
    // Mirror sidebar renderItem: ẩn admin-only-URL với non-admin + ẩn trang bị thu
    // hồi 'view'. Web2Perm sync (đọc permissions trong localStorage), admin luôn true.
    function canOpen(h, itemAdmin) {
        var admin = isAdmin();
        if (itemAdmin && !admin) return false;
        if (!window.Web2Perm) return true; // chưa load → default-open (giữ hành vi cũ)
        if (window.Web2Perm.isAdminOnlyUrl(h) && !admin) return false;
        return window.Web2Perm.canViewUrl(h);
    }

    function visibleGroups() {
        var admin = isAdmin();
        return CATALOG.filter(function (grp) {
            return admin || !grp.admin;
        })
            .map(function (grp) {
                return {
                    group: grp.group,
                    icon: grp.icon,
                    g: grp.g,
                    items: grp.items.filter(function (it) {
                        return canOpen(it.h, it.admin);
                    }),
                };
            })
            .filter(function (grp) {
                return grp.items.length > 0;
            });
    }

    // ----- render account chip (avatar + name → account modal) -----
    // Avatar = DiceBear via Web2UserProfile.avatarUrlFor (cùng nguồn footer sidebar
    // + bảng users). Click chip → mở modal tài khoản/đổi avatar. KHÔNG còn nút
    // Đăng xuất ở đây (landing chỉ giữ 1 nút → Dashboard).
    function renderAccount() {
        var box = document.getElementById('ovAccount');
        if (!box) return;
        var stored =
            window.Web2Auth && window.Web2Auth.getStored ? window.Web2Auth.getStored() : null;
        var user = stored && stored.user ? stored.user : null;
        var name = user ? user.displayName || user.username || 'Người dùng' : 'Khách';
        var role = user ? user.role || '' : '';
        var initial = (name || '?').slice(0, 1).toUpperCase();

        var avUrl = '';
        try {
            if (user && window.Web2UserProfile && window.Web2UserProfile.avatarUrlFor) {
                avUrl = window.Web2UserProfile.avatarUrlFor(user) || '';
            }
        } catch (e) {
            /* fallback to initial */
        }
        var avInner = avUrl
            ? '<img src="' + esc(avUrl) + '" alt="" referrerpolicy="no-referrer" />'
            : esc(initial);

        box.innerHTML =
            '<button class="ov-user' +
            (avUrl ? ' has-img' : '') +
            '" id="ovUser" type="button" title="Tài khoản · đổi avatar">' +
            '<span class="ov-user-av">' +
            avInner +
            '</span><span class="ov-user-meta"><span class="ov-user-name">' +
            esc(name) +
            '</span>' +
            (role ? '<span class="ov-user-role">' + esc(role) + '</span>' : '') +
            '</span></button>';

        var btn = document.getElementById('ovUser');
        if (btn)
            btn.addEventListener('click', function () {
                if (window.Web2UserProfile && window.Web2UserProfile.open) {
                    window.Web2UserProfile.open();
                }
            });
    }

    // ----- logout button → invalidate server session + clear + redirect login -----
    function wireLogout() {
        var btn = document.getElementById('ovLogoutBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (window.Web2Auth && window.Web2Auth.logout) {
                window.Web2Auth.logout();
            } else {
                location.href = '../auth/login.html';
            }
        });
    }

    // ----- single CTA → first page the user is allowed to open -----
    // "Trang đầu tiên user có quyền" = item ĐẦU TIÊN của nhóm hiển thị ĐẦU TIÊN
    // (visibleGroups đã lọc theo role/admin). Admin & NV hiện cùng nhóm đầu (Bán Hàng)
    // trừ khi nhóm đó bị ẩn cho user → tự rớt xuống nhóm kế tiếp.
    function firstAccessiblePage() {
        var groups = visibleGroups();
        for (var i = 0; i < groups.length; i++) {
            if (groups[i].items && groups[i].items.length) return groups[i].items[0];
        }
        return null;
    }

    function renderEnterButton() {
        var btn = document.getElementById('ovEnterBtn');
        if (!btn) return;
        var page = firstAccessiblePage();
        if (!page) {
            btn.style.display = 'none';
            return;
        }
        btn.setAttribute('href', resolveHref(page.h));
        btn.setAttribute('title', 'Vào ' + page.l);
        btn.innerHTML =
            '<i data-lucide="' +
            esc(page.i || 'arrow-right') +
            '"></i> Vào ' +
            esc(page.l) +
            ' <i data-lucide="arrow-right"></i>';
    }

    // ----- render hero stats -----
    function renderStats() {
        var groups = visibleGroups();
        var modCount = groups.reduce(function (n, grp) {
            return n + grp.items.length;
        }, 0);
        var grpCount = groups.length;
        var el = document.getElementById('ovStats');
        if (!el) return;
        el.innerHTML = [
            ['count', modCount, '+', 'Module vận hành'],
            ['count', grpCount, '', 'Nhóm chức năng'],
            ['text', 'SSE', '', 'Realtime, không refresh'],
            ['text', 'AI', '', 'Tích hợp khắp nơi'],
        ]
            .map(function (s) {
                var n =
                    s[0] === 'count'
                        ? '<span class="n" data-count="' +
                          s[1] +
                          '" data-suffix="' +
                          s[2] +
                          '">0' +
                          s[2] +
                          '</span>'
                        : '<span class="n ov-grad-text">' + esc(s[1]) + '</span>';
                return '<div class="ov-stat">' + n + '<div class="l">' + esc(s[3]) + '</div></div>';
            })
            .join('');
    }

    // ----- render module showcase (chips + grid) -----
    function renderModules() {
        var groups = visibleGroups();
        var chipBox = document.getElementById('ovChips');
        var root = document.getElementById('ovModules');
        var countEl = document.getElementById('ovModCount');
        if (!root) return;

        var totalMods = groups.reduce(function (n, grp) {
            return n + grp.items.length;
        }, 0);
        if (countEl) countEl.textContent = totalMods + ' module · ' + groups.length + ' nhóm';

        // chips
        if (chipBox) {
            chipBox.innerHTML =
                '<button class="ov-chip is-active" data-filter="*">Tất cả</button>' +
                groups
                    .map(function (grp) {
                        return (
                            '<button class="ov-chip" data-filter="' +
                            esc(grp.group) +
                            '">' +
                            esc(grp.group) +
                            '</button>'
                        );
                    })
                    .join('');
        }

        // groups + cards
        root.innerHTML = groups
            .map(function (grp) {
                var cards = grp.items
                    .map(function (it, idx) {
                        var delay = Math.min(idx, 7) * 45;
                        return (
                            '<a class="ov-card" data-rise style="--g:' +
                            grp.g +
                            ';transition-delay:' +
                            delay +
                            'ms" href="' +
                            esc(resolveHref(it.h)) +
                            '">' +
                            '<span class="ov-card-ic"><i data-lucide="' +
                            esc(it.i || 'circle') +
                            '"></i></span>' +
                            '<span class="ov-card-body"><span class="ov-card-title">' +
                            esc(it.l) +
                            '</span><span class="ov-card-grp">' +
                            esc(grp.group) +
                            '</span></span>' +
                            '<i class="ov-card-go" data-lucide="arrow-up-right"></i>' +
                            '</a>'
                        );
                    })
                    .join('');
                return (
                    '<div class="ov-mod-group" data-group="' +
                    esc(grp.group) +
                    '">' +
                    '<div class="ov-mod-group-head"><span class="gic" style="--g:' +
                    grp.g +
                    '"><i data-lucide="' +
                    esc(grp.icon) +
                    '"></i></span><h3>' +
                    esc(grp.group) +
                    '</h3><span class="gc">' +
                    grp.items.length +
                    '</span></div>' +
                    '<div class="ov-grid">' +
                    cards +
                    '</div></div>'
                );
            })
            .join('');

        wireFilters();
        observeRise();
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    // ----- search + chip filter -----
    function wireFilters() {
        var search = document.getElementById('ovSearch');
        var chips = Array.prototype.slice.call(document.querySelectorAll('.ov-chip'));
        var activeFilter = '*';

        function apply() {
            var q = (search && search.value ? search.value : '').toLowerCase().trim();
            var shownGroups = 0;
            Array.prototype.forEach.call(
                document.querySelectorAll('.ov-mod-group'),
                function (grpEl) {
                    var grpName = grpEl.getAttribute('data-group');
                    var groupMatch = activeFilter === '*' || activeFilter === grpName;
                    var anyCard = 0;
                    Array.prototype.forEach.call(
                        grpEl.querySelectorAll('.ov-card'),
                        function (card) {
                            var txt = (
                                card.querySelector('.ov-card-title').textContent +
                                ' ' +
                                grpName
                            ).toLowerCase();
                            var show = groupMatch && (!q || txt.indexOf(q) !== -1);
                            card.style.display = show ? '' : 'none';
                            if (show) anyCard++;
                        }
                    );
                    grpEl.style.display = anyCard > 0 ? '' : 'none';
                    if (anyCard > 0) shownGroups++;
                }
            );
            var empty = document.getElementById('ovEmpty');
            if (empty) empty.style.display = shownGroups === 0 ? '' : 'none';
        }

        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                chips.forEach(function (c) {
                    c.classList.remove('is-active');
                });
                chip.classList.add('is-active');
                activeFilter = chip.getAttribute('data-filter');
                apply();
            });
        });
        if (search) search.addEventListener('input', apply);
    }

    // ----- reveal on scroll (IntersectionObserver — works without GSAP) -----
    function observeRise() {
        var els = Array.prototype.slice.call(document.querySelectorAll('[data-rise]:not(.is-in)'));
        if (REDUCED || !('IntersectionObserver' in window)) {
            els.forEach(function (el) {
                el.classList.add('is-in');
            });
            return;
        }
        var io = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) {
                        e.target.classList.add('is-in');
                        io.unobserve(e.target);
                    }
                });
            },
            { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
        );
        els.forEach(function (el) {
            io.observe(el);
        });
    }

    // ----- count-up stats -----
    function countUp() {
        var nums = Array.prototype.slice.call(document.querySelectorAll('.n[data-count]'));
        if (!nums.length) return;
        function run(el) {
            var target = parseInt(el.getAttribute('data-count'), 10) || 0;
            var suffix = el.getAttribute('data-suffix') || '';
            if (REDUCED) {
                el.textContent = target + suffix;
                return;
            }
            var start = null;
            var dur = 1100;
            function step(ts) {
                if (start === null) start = ts;
                var p = Math.min((ts - start) / dur, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased) + suffix;
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        if (!('IntersectionObserver' in window)) {
            nums.forEach(run);
            return;
        }
        var io = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) {
                        run(e.target);
                        io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.5 }
        );
        nums.forEach(function (el) {
            io.observe(el);
        });
    }

    // ----- magnetic buttons -----
    function magnetic() {
        if (REDUCED) return;
        Array.prototype.forEach.call(document.querySelectorAll('[data-magnetic]'), function (el) {
            var strength = 0.35;
            el.addEventListener('mousemove', function (ev) {
                var r = el.getBoundingClientRect();
                var x = ev.clientX - r.left - r.width / 2;
                var y = ev.clientY - r.top - r.height / 2;
                el.style.transform = 'translate(' + x * strength + 'px,' + y * strength + 'px)';
            });
            el.addEventListener('mouseleave', function () {
                el.style.transform = '';
            });
        });
    }

    // ----- nav scrolled state + scroll-to anchors -----
    function navState() {
        var nav = document.getElementById('ovNav');
        function onScroll() {
            if (!nav) return;
            if (window.scrollY > 24) nav.classList.add('is-scrolled');
            else nav.classList.remove('is-scrolled');
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        // smooth anchor scroll — native, with offset for the floating nav.
        Array.prototype.forEach.call(document.querySelectorAll('a[data-scroll]'), function (a) {
            a.addEventListener('click', function (e) {
                var id = a.getAttribute('href');
                if (id && id.charAt(0) === '#') {
                    var t = document.querySelector(id);
                    if (t) {
                        e.preventDefault();
                        var top = t.getBoundingClientRect().top + window.pageYOffset - 80;
                        window.scrollTo({ top: top, behavior: REDUCED ? 'auto' : 'smooth' });
                    }
                }
            });
        });
    }

    // ----- boot -----
    function boot() {
        renderAccount();
        renderEnterButton();
        wireLogout();
        renderStats();
        renderModules();
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
        observeRise();
        countUp();
        magnetic();
        navState();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
