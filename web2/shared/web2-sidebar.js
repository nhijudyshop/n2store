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
    const LOGO_URL = new URL('./web2-logo.svg?v=20260628b', SCRIPT_BASE_URL).toString();

    // Mobile responsive overlay DÙNG CHUNG (web2-mobile.css) — nạp SAU web2-theme.css
    // (theme là <link> trong <head> trước sidebar.js → link này chèn cuối head =
    // cascade-last → override grid/width cứng của trang trên màn nhỏ). Có mặt MỌI trang Web 2.0,
    // KHÔNG cần sửa HTML từng trang. 1 nguồn responsive duy nhất.
    (function injectMobileCss() {
        try {
            if (document.querySelector('link[data-w2-mobile-css]')) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = new URL('./web2-mobile.css?v=20260624mob2', SCRIPT_BASE_URL).toString();
            link.setAttribute('data-w2-mobile-css', '1');
            (document.head || document.documentElement).appendChild(link);
        } catch (_) {
            /* ignore */
        }
    })();

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
        if (!global.Popup) inject('popup.js', '20260621r6');
        if (!global.DeliveryMethodPicker) inject('delivery-method-picker.js', '20260604nj4');
        if (!global.Web2Auth) inject('web2-auth.js', '20260621r7');
        // Command palette toàn cục (Ctrl/Cmd+K) — có mặt mọi trang Web 2.0.
        if (!global.Web2CommandPalette) inject('web2-command-palette.js', '20260613a');
        // Lottie animation dùng chung (airbnb/lottie-web) — lazy, tự enhance
        // trạng thái rỗng + loading + feedback. Có mặt MỌI trang Web 2.0.
        if (!global.Web2Lottie) inject('web2-lottie.js', '20260615a');
        // Lịch sử thao tác per-record (Web2AuditLog.openRecord) — MỌI trang Web 2.0
        // dùng để hiện lịch sử 1 record. page-builder + custom pages đều gọi được.
        if (!global.Web2AuditLog) inject('web2-audit-log.js', '20260622al4');
        // PWA — "Thêm vào Màn hình chính" (iOS/Android), không cần App Store/dev account.
        // Inject manifest + apple meta + apple-touch-icon vào MỌI trang Web 2.0.
        if (!global.Web2PWA) inject('web2-pwa.js', '20260620a');
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
        // Phân trang 1 nguồn (thuật toán window + …) — thay ~10 bản copy-paste.
        if (!global.Web2Pagination) inject('web2-pagination.js', '20260701');
        if (!global.Web2Notify) inject('web2-notify.js', '20260618');
        if (!global.Web2PhoneUtils) inject('web2-phone-utils.js', '20260618');
        if (!global.Web2TextUtils) inject('web2-text-utils.js', '20260618');
        // Shared utils đợt 2 (dedup, 2026-06-19) — broadly-useful: giải mã JWT,
        // avatar (màu+chữ+proxy+HTML), lightbox xem ảnh. Pure/nhẹ, mọi trang dùng.
        // (canvas/so-order/pancake-import là feature-specific → trang tự load.)
        if (!global.Web2JwtUtils) inject('web2-jwt-utils.js', '20260619a');
        if (!global.Web2AvatarUtils) inject('web2-avatar-utils.js', '20260619a');
        // Hồ sơ user + đổi avatar DiceBear (mở từ footer sidebar) — mọi trang.
        if (!global.Web2UserProfile) inject('web2-user-profile.js', '20260624d');
        // Ảnh dùng chung (gom 1 nguồn, 2026-06-23):
        //  - canvas-utils: nén/convert ảnh↔canvas↔blob (image-paste phụ thuộc).
        //  - image-lightbox: xem ảnh full-screen + CLICK PHÓNG TO catch-all + con trỏ zoom-in.
        //  - image-paste: ô NHẬP ẢNH dùng chung (paste/kéo-thả/chọn file + nén + preview).
        //  - effects: HOVER ZOOM ảnh nội dung (+ ripple/confetti…) — cặp với click-phóng-to.
        if (!global.Web2CanvasUtils) inject('web2-canvas-utils.js', '20260619a');
        if (!global.Web2ImageLightbox) inject('web2-image-lightbox.js', '20260624b');
        if (!global.Web2ImagePaste) inject('web2-image-paste.js', '20260623b');
        if (!global.Web2Effects) inject('web2-effects.js', '20260625a');
        // Dịch thuật dùng chung (LLM free + fallback Google) — mọi trang gọi Web2Translate.translate.
        if (!global.Web2Translate) inject('web2-translate.js', '20260622a');
        // Smart cache dùng chung (2026-06-23) — primitive stale-while-revalidate:
        // IDB persist + TTL + SWR + Web2SSE invalidate + dedup + LRU. Gom 1 nguồn
        // bộ máy mà products/variants/suppliers/customer cache tự lặp. Trang/feature
        // mới chỉ cần Web2SmartCache.create({ name, fetcher, topic }) là có cache đầy đủ.
        if (!global.Web2SmartCache) inject('web2-smart-cache.js', '20260623a');
        // Phân quyền (enforcement) — ẩn menu + page-guard theo quyền 'view' của user.
        // Default-open: admin/không-có-dữ-liệu/trang-mới → cho phép; chỉ chặn khi
        // admin chủ động bỏ 'view'. Có mặt MỌI trang Web 2.0.
        if (!global.Web2Perm) inject('web2-perm.js', '20260701perm');
        // Thư viện mẫu câu lệnh AI (ảnh + vai trò chat) — Web2AiPresets.pickImage/pickRole.
        // Dùng chung: ai-hub, fb-posts (caption), video-maker (kịch bản)… gọi được luôn.
        if (!global.Web2AiPresets) inject('web2-ai-presets.js', '20260624h');
        // Tách nền ảnh dùng máy shop tự host (free) — Web2BgRemover.removeBgAuto(input).
        if (!global.Web2BgRemover) inject('web2-bgremover.js', '20260624a');
        // Trợ lý AI theo trang (nút nổi ✨) — đọc dữ liệu đang hiển thị → AI free rà soát
        // số liệu/phép tính, phân tích cảm xúc khách, soát đơn. Cấu hình ở web2/ai-assistant.
        // Registry THEO TRANG (gợi ý + accessor đọc data sâu + model auto) — load TRƯỚC widget.
        if (!global.Web2AiPageRegistry) inject('web2-ai-page-registry.js', '20260626sys');
        // Widget ✨ giờ có thêm 3 công cụ (Ghép đồ · Card/Video · Viết mô tả) lazy-load
        // module shared khi mở — không nạp sẵn ở boot. Bump version để cache mới.
        if (!global.Web2AiAssistant) inject('web2-ai-assistant.js', '20260629b');
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
                { label: 'KPI Nhân viên', our: '../web2/kpi/index.html' },
                { label: 'Thông báo', our: '../web2/notifications/index.html' },
                // 2026-06-24 reorg: Dashboard KPI → Báo cáo; Lịch sử thao tác + Cấu hình
                // & Hệ thống → Cấu hình; Đối soát CK → Chuyển khoản KH; Zalo → Khách hàng;
                // Phân quyền → gộp vào trang Người dùng (web2/users).
            ],
        },
        {
            label: 'AI',
            icon: 'bot',
            children: [
                {
                    label: 'Trợ lý AI 🤖',
                    our: '../web2/ai-hub/index.html',
                },
                {
                    label: 'Xưởng Video AI 🎬',
                    our: '../web2/video-maker/index.html',
                },
                {
                    label: 'Trợ lý AI theo trang ✨',
                    our: '../web2/ai-assistant/index.html',
                },
                {
                    label: 'Sửa ảnh AI 🪄',
                    our: '../web2/ai-photo/index.html',
                },
            ],
        },
        {
            label: 'Đa dụng Web 2.0',
            icon: 'wrench',
            children: [
                {
                    label: 'Studio chụp tách nền',
                    our: '../web2/photo-studio/index.html',
                },
                {
                    label: 'Đếm SP qua camera 📷',
                    our: '../web2/product-counter/index.html',
                },
                {
                    label: 'Tạo card sản phẩm 🖼️',
                    our: '../web2/product-card/index.html',
                },
                {
                    label: 'Làm đẹp video ✨',
                    our: '../web2/video-beauty/index.html',
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
                    label: 'Quét tem 📱',
                    our: '../web2/unit-scan/index.html',
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
                // "Sổ Order" đã gỡ khỏi Sale Online (2026-06-22) — chỉ giữ 1 entry
                // "Sổ Order NCC" bên group Mua hàng (cùng trang ../so-order/index.html).
                { label: 'Live Chat', our: '../live-chat/index.html' },
                // 2026-06-24 reorg: Chat Pancake → Khách hàng; Comment Live + Điều khiển
                // TV + TV Livestream → Facebook.
            ],
        },
        {
            label: 'Facebook',
            icon: 'facebook',
            children: [
                {
                    label: 'Đăng bài 📢',
                    our: '../web2/fb-posts/index.html',
                },
                {
                    label: 'Thống kê tương tác 📊',
                    our: '../web2/fb-insights/index.html',
                },
                {
                    label: 'Thống kê quảng cáo 💰',
                    our: '../web2/fb-ads-stats/index.html',
                },
                // 2026-06-24 reorg: chuyển từ Đa dụng / Sale Online sang đây.
                {
                    label: 'Tăng số lượng comment',
                    our: '../web2/multi-tool/index.html',
                },
                { label: 'Comment Live 📱', our: '../live-chat/comments-mobile.html' },
                { label: 'Điều khiển TV 🎛️', our: '../web2/live-control/index.html' },
                { label: 'TV Livestream 📺', our: '../web2/live-tv/index.html' },
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
                    label: 'Cân Nặng Hàng ⚖️',
                    our: '../web2/goods-weight/index.html',
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
            label: 'Chuyển khoản KH',
            icon: 'dollar-sign',
            children: [
                {
                    label: 'Lịch sử biến động số dư (SePay)',
                    our: '../web2/balance-history/index.html',
                },
                // 2026-06-24 reorg: Đối soát CK chuyển từ "Tính năng mới" sang đây.
                { label: 'Đối soát CK', our: '../web2/ck-dashboard/index.html' },
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
                // 2026-06-24 reorg: Chat Pancake (live-chat/chat.html) + Zalo chuyển vào đây.
                { label: 'Chat Pancake', our: '../live-chat/chat.html' },
                { label: 'Zalo', our: '../web2/zalo/index.html' },
            ],
        },
        {
            label: 'Sản phẩm',
            icon: 'package',
            children: [
                { label: 'Kho SP Web 2.0', our: '../web2/products/index.html' },
                { label: 'Kho Biến Thể', our: '../web2/variants/index.html' },
                { label: 'Kho rớt xả 🏷️', our: '../web2/clearance/index.html' },
            ],
        },
        {
            label: 'Báo cáo',
            icon: 'bar-chart-3',
            children: [
                // 2026-06-24 reorg: Dashboard KPI chuyển từ "Tính năng mới" sang đây.
                { label: 'Dashboard KPI', our: '../web2/dashboard/index.html' },
                {
                    label: 'Thống kê doanh thu',
                    our: '../web2/report-revenue/index.html',
                },
                {
                    label: 'Thống kê giao hàng',
                    our: '../web2/report-delivery/index.html',
                },
                {
                    label: 'Báo cáo kho',
                    icon: 'warehouse',
                    our: '../web2/report-warehouse/index.html',
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
                    label: 'Loại sản phẩm',
                    icon: 'shirt',
                    our: '../web2/product-types/index.html',
                    // Web 2.0-only — quản lý loại SP (Áo/Quần/Đầm…); chọn khi nhập SP,
                    // chọn nhiều loại = bộ. Dùng ở Kho SP + Sổ Order.
                },
                {
                    label: 'Quản lý chiến dịch',
                    icon: 'megaphone',
                    our: '../web2/campaign-manager/index.html',
                    adminOnly: true,
                    // Web 2.0-only — CRUD chiến dịch CHA (span 2 page) + gán bài FB 1 luồng.
                },
                // GỠ 2026-07-01: "Lấy comment Live (poller)" — poll nền đã tắt sẵn,
                // comment realtime vào qua WS relay → /ingest; fetch bài/comment lấy
                // trực tiếp Pancake post trong browser. Trang cấu hình không còn cần.
                {
                    label: 'Pancake (Token)',
                    icon: 'key-round',
                    our: '../web2/pancake-settings/index.html',
                    adminOnly: true,
                    // Web 2.0-only page — no WEB2 counterpart.
                },
                {
                    label: 'Phương thức giao hàng',
                    icon: 'truck',
                    our: '../web2/delivery-zone/index.html',
                    adminOnly: true,
                    // Web 2.0-only — quản lý vùng giao + phí + từ khoá auto-detect.
                },
                {
                    label: 'TAG đơn hàng',
                    icon: 'tags',
                    our: '../web2/order-tags/index.html',
                    adminOnly: true,
                    // Web 2.0-only — thẻ auto theo trigger, hiện ở cột "Thẻ" Đơn Web.
                },
                {
                    label: 'Máy in',
                    icon: 'printer',
                    our: '../web2/printer-settings/index.html',
                    // Web 2.0-only — danh sách máy in + gán theo chức năng (PBH/tem).
                },
                // 2026-06-24 reorg: Lịch sử thao tác chuyển từ "Tính năng mới" sang đây.
                {
                    label: 'Lịch sử thao tác',
                    icon: 'history',
                    our: '../web2/audit-log/index.html',
                    adminOnly: true,
                },
                // 2026-06-24 reorg: Cấu hình & Hệ thống chuyển vào đây + CHỈ ADMIN
                // (item-level adminOnly → renderItem ẩn nếu không phải admin).
                {
                    label: 'Cấu hình & Hệ thống',
                    icon: 'sliders-horizontal',
                    our: '../web2/system/index.html',
                    adminOnly: true,
                },
            ],
        },
        {
            // Group CHỈ ADMIN — gating group-level (adminOnly) + server gate riêng
            // (requireWeb2Admin) trên mọi route. Nhân viên không thấy group này.
            label: 'Quản trị viên',
            icon: 'shield',
            adminOnly: true,
            children: [
                {
                    label: 'Chấm công',
                    icon: 'fingerprint',
                    our: '../web2/cham-cong/index.html',
                },
                {
                    label: 'Quản lý chi tiêu',
                    icon: 'wallet',
                    our: '../web2/chi-tieu/index.html',
                },
                {
                    label: 'Người dùng',
                    icon: 'user-cog',
                    our: '../web2/users/index.html',
                },
            ],
        },
    ];

    // ---------- Helpers ----------
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        // Full escape of & < > " ' / — safe for both element-content AND
        // attribute-value context (textContent round-trip does NOT escape quotes).
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#47;');
    }

    // 2026-06-24: avatar DiceBear inline — footer render TRƯỚC khi web2-user-profile.js
    // load xong (autoload async) → trước đây fallback chữ cái = "mất avatar" ở 1 số
    // trang. Tính URL ngay tại sidebar (không phụ thuộc timing Web2UserProfile).
    function _avatarUrlInline(stored) {
        try {
            if (window.Web2UserProfile && window.Web2UserProfile.avatarUrl) {
                return window.Web2UserProfile.avatarUrl(stored);
            }
            if (!stored) return null;
            let cfg = stored;
            if (typeof stored === 'string') {
                if (/^https?:\/\//.test(stored)) return stored;
                cfg = JSON.parse(stored);
            }
            if (!cfg || !cfg.style || !cfg.seed) return null;
            const p = new URLSearchParams({ seed: String(cfg.seed) });
            if (cfg.bg && cfg.bg !== 'transparent' && /^[0-9a-fA-F]{3,8}$/.test(cfg.bg)) {
                p.set('backgroundColor', cfg.bg);
            }
            return `https://api.dicebear.com/10.x/${encodeURIComponent(cfg.style)}/svg?${p.toString()}`;
        } catch (_) {
            return null;
        }
    }

    // 2026-06-24: bỏ icon emoji ở cuối tên trang trong menu (user yêu cầu menu gọn).
    // Cắt emoji + khoảng trắng thừa ở cuối label (giữ chữ + dấu tiếng Việt).
    function cleanLabel(s) {
        return String(s == null ? '' : s)
            .replace(
                /\s*(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]|️|‍)+\s*$/gu,
                ''
            )
            .trim();
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
        'web2/product-types/index.html',
        'web2/delivery-zone/index.html',
        'web2/order-tags/index.html',
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
        'web2/product-card/index.html',
        'web2/video-maker/index.html',
        'web2/ai-photo/index.html',
        'web2/video-beauty/index.html',
        'web2/ai-hub/index.html',
        'web2/users-permissions/index.html',
        'web2/system/index.html',
        'web2/zalo/index.html',
        'web2/cham-cong/index.html',
        'web2/chi-tieu/index.html',
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
        // Admin-only: ẩn item nếu user không phải admin. 2 nguồn:
        //  • flag NAV `adminOnly` (timing-independent, không phụ thuộc Web2Perm load).
        //  • backstop danh sách 1-nguồn Web2Perm.ADMIN_ONLY_SLUGS (web2-perm.js) —
        //    phòng khi quên gắn flag; cũng đồng bộ với page-guard chặn URL trực tiếp.
        const adminOnly =
            item.adminOnly ||
            (item.our && global.Web2Perm && global.Web2Perm.isAdminOnlyUrl
                ? global.Web2Perm.isAdminOnlyUrl(item.our)
                : false);
        if (adminOnly && !_isAdmin()) return '';
        // Ẩn item nếu user bị thu hồi 'view' trang này (default-open: admin / chưa
        // có dữ liệu / trang mới → vẫn hiện). Server vẫn gate độc lập.
        if (item.our && global.Web2Perm && !global.Web2Perm.canViewUrl(item.our)) return '';
        const isImpl = isOurRoute(item);
        const href = isImpl ? resolveOur(item.our) : '#';
        const isActive =
            isImpl && activeUrl && activeUrl.endsWith(item.our.replace(/^(\.\.\/)+/, ''));
        const cls = `web2-nav-sub-link${isActive ? ' active' : ''}`;
        const onclick = isImpl
            ? ''
            : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(item.label)}')"`;
        const soon = isImpl ? '' : ' <span class="web2-nav-soon">soon</span>';
        // 2026-06-24 (user request): bỏ badge "- WEB 2.0" + emoji cuối tên trang.
        return `<li><a href="${escapeHtml(href)}" class="${cls}" ${onclick}>${escapeHtml(cleanLabel(item.label))}${soon}</a></li>`;
    }

    function renderGroup(g, activeUrl) {
        // Group-level admin gating — cả group ẩn nếu adminOnly và user không phải
        // admin (mirror renderItem cho item-level). Server vẫn gate độc lập.
        if (g.adminOnly && !_isAdmin()) return '';
        if (g.single) {
            const isImpl = isOurRoute(g);
            const href = isImpl ? resolveOur(g.our) : '#';
            const isActive =
                isImpl && activeUrl && activeUrl.endsWith(g.our.replace(/^(\.\.\/)+/, ''));
            const cls = `web2-nav-link${isActive ? ' active' : ''}`;
            const onclick = isImpl
                ? ''
                : `onclick="event.preventDefault();Web2Sidebar.alertSoon('${escapeHtml(g.label)}')"`;
            return `<a href="${escapeHtml(href)}" class="${cls}" ${onclick}>
                <i data-lucide="${g.icon}" class="icon"></i>
                <span class="label">${escapeHtml(cleanLabel(g.label))}</span>
            </a>`;
        }
        const hasOurChild = (g.children || []).some(isOurRoute);
        const open = (g.children || []).some(
            (c) => isOurRoute(c) && activeUrl && activeUrl.endsWith(c.our.replace(/^(\.\.\/)+/, ''))
        );
        return `
            <div class="web2-nav-group${open ? ' is-open' : ''}">
                <div class="web2-nav-group-head" onclick="Web2Sidebar.onGroupHead(this)">
                    <i data-lucide="${g.icon}" class="icon"></i>
                    <span class="label">${escapeHtml(g.label)}${hasOurChild ? '' : ' <span class="web2-nav-soon">soon</span>'}</span>
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
        // Avatar DiceBear: custom nếu đã đặt, KHÔNG thì sinh MẶC ĐỊNH từ username (đồng
        // nhất với bảng users + preview hồ sơ). Trước đây footer fallback chữ cái khi user
        // chưa đổi avatar → "không load avatar mặc định". Tính inline (không chờ
        // Web2UserProfile load) → không mất avatar trên trang load module avatar trễ.
        const defStyle =
            (window.Web2UserProfile && window.Web2UserProfile.DEFAULT_STYLE) || 'lorelei';
        const avUrl =
            _avatarUrlInline(user.avatar) ||
            (user.username
                ? _avatarUrlInline({ style: defStyle, seed: user.username, bg: 'transparent' })
                : null);
        const avatarInner = avUrl
            ? `<img src="${escapeHtml(avUrl)}" alt="${displayName}" referrerpolicy="no-referrer">`
            : initial;
        footer.innerHTML = `<div class="web2-user-header" role="button" tabindex="0" title="Xem thông tin tài khoản / đổi avatar">
                    <div class="web2-user-avatar${avUrl ? ' has-img' : ''}" title="${username}">${avatarInner}</div>
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
        const openProfile = () => window.Web2UserProfile?.open();
        const header = footer.querySelector('.web2-user-header');
        header?.addEventListener('click', openProfile);
        header?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProfile();
            }
        });
        footer.querySelector('#web2UserLogout')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.Web2Auth?.logout) window.Web2Auth.logout({ redirect: true });
        });
        if (window.lucide) lucide.createIcons();
    }

    // 2026-06-24: Bottom sheet "Tài khoản" cho ĐIỆN THOẠI — mở từ thanh menu dưới
    // cùng (w2-mobile-bottombar). Có Hồ sơ + Đăng xuất → fix "điện thoại không có
    // nút đăng xuất" (footer drawer hay khuất sau thanh trình duyệt). Chưa đăng
    // nhập → chuyển trang login.
    function openAccountSheet() {
        const stored = window.Web2Auth ? window.Web2Auth.getStored() : null;
        const user = stored?.user || null;
        if (!user) {
            const loginPath = window.Web2Auth?.loginUrl?.() || '../web2/login/index.html';
            const next = location.pathname + location.search;
            location.href = `${loginPath}?next=${encodeURIComponent(next)}`;
            return;
        }
        document.querySelector('.w2-acct-sheet')?.remove(); // rebuild với user mới nhất
        const displayName = escapeHtml(user.displayName || user.username || '');
        const username = escapeHtml(user.username || '');
        const role = escapeHtml(user.role || '');
        const defStyle =
            (window.Web2UserProfile && window.Web2UserProfile.DEFAULT_STYLE) || 'lorelei';
        const avUrl =
            _avatarUrlInline(user.avatar) ||
            (user.username
                ? _avatarUrlInline({ style: defStyle, seed: user.username, bg: 'transparent' })
                : null);
        const avatarInner = avUrl
            ? `<img src="${escapeHtml(avUrl)}" alt="" referrerpolicy="no-referrer">`
            : escapeHtml((displayName || '?').slice(0, 1).toUpperCase());
        const sheet = document.createElement('div');
        sheet.className = 'w2-acct-sheet show';
        sheet.innerHTML = `
            <div class="w2-acct-scrim"></div>
            <div class="w2-acct-panel" role="dialog" aria-label="Tài khoản">
                <div class="w2-acct-grip"></div>
                <div class="w2-acct-head">
                    <div class="w2-acct-av${avUrl ? ' has-img' : ''}">${avatarInner}</div>
                    <div class="w2-acct-id">
                        <div class="w2-acct-name">${displayName}</div>
                        <div class="w2-acct-sub">@${username}${role ? ' · ' + role : ''}</div>
                    </div>
                </div>
                <button class="w2-acct-row" data-act="profile" type="button">
                    <i data-lucide="user-cog"></i><span>Hồ sơ tài khoản</span>
                </button>
                <button class="w2-acct-row w2-acct-logout" data-act="logout" type="button">
                    <i data-lucide="log-out"></i><span>Đăng xuất</span>
                </button>
            </div>`;
        document.body.appendChild(sheet);
        const close = () => sheet.remove();
        sheet.querySelector('.w2-acct-scrim').addEventListener('click', close);
        sheet.querySelector('[data-act="profile"]').addEventListener('click', () => {
            close();
            window.Web2UserProfile?.open();
        });
        sheet.querySelector('[data-act="logout"]').addEventListener('click', () => {
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
            // F04b mobile (2026-06-24): thanh menu DƯỚI CÙNG cho điện thoại (≤600px).
            // Tổng quan · Menu (mở drawer) · Thông báo · Tài khoản (sheet Hồ sơ +
            // Đăng xuất). Thay nút ☰ nổi (ẩn ở phone) → điều hướng 1 chạm + luôn có
            // Đăng xuất. CSS ở web2-mobile.css (.w2-mobile-bottombar / .w2-acct-sheet).
            if (!document.querySelector('.w2-mobile-bottombar')) {
                const here2 = window.location.pathname || '';
                const homeHref = resolveOur('../web2/overview/index.html');
                const notiHref = resolveOur('../web2/notifications/index.html');
                const bar = document.createElement('nav');
                bar.className = 'w2-mobile-bottombar';
                bar.setAttribute('aria-label', 'Điều hướng nhanh');
                bar.innerHTML = `
                    <a class="w2-bb-item${here2.endsWith('web2/overview/index.html') ? ' is-active' : ''}" href="${escapeHtml(homeHref)}">
                        <i data-lucide="home"></i><span>Tổng quan</span></a>
                    <button class="w2-bb-item" data-act="menu" type="button">
                        <i data-lucide="menu"></i><span>Menu</span></button>
                    <a class="w2-bb-item${here2.endsWith('web2/notifications/index.html') ? ' is-active' : ''}" href="${escapeHtml(notiHref)}">
                        <i data-lucide="bell"></i><span>Thông báo</span></a>
                    <button class="w2-bb-item" data-act="acct" type="button">
                        <i data-lucide="user"></i><span>Tài khoản</span></button>`;
                document.body.appendChild(bar);
                bar.querySelector('[data-act="menu"]').addEventListener('click', () => {
                    el.classList.add('w2-aside-open');
                    document.querySelector('.web2-aside-scrim')?.classList.add('show');
                });
                bar.querySelector('[data-act="acct"]').addEventListener('click', openAccountSheet);
                if (window.lucide) lucide.createIcons();
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
        // Click group-head: khi sidebar đang THU GỌN (icon-only) → bung sidebar ra +
        // mở (expand) group đó luôn. Khi đang mở rộng → toggle bình thường.
        onGroupHead(headEl) {
            const group = headEl?.parentElement;
            if (!group) return;
            if (isCollapsed()) {
                setCollapsed(false);
                group.classList.add('is-open');
            } else {
                group.classList.toggle('is-open');
            }
        },
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
