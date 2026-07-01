// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — phân quyền (enforcement).
// =====================================================================
// Web2Perm — kiểm tra quyền truy cập trang/action Web 2.0 (1 NGUỒN).
//
// Mô hình AN TOÀN "default-open, explicit-deny":
//   • admin            → LUÔN cho phép (không bao giờ bị chặn).
//   • không có dữ liệu quyền (chưa login / lỗi) → CHO PHÉP (không khoá nhầm).
//   • trang KHÔNG có trong permissions của user (vd trang mới) → CHO PHÉP.
//   • CHỈ chặn khi user có entry quyền RÕ RÀNG cho slug đó mà KHÔNG chứa action.
// → Mặc định KHÔNG đổi hành vi (mọi người vẫn xem hết). Chỉ khi admin CHỦ ĐỘNG
//   bỏ tick 'view' của 1 trang cho 1 user thì trang đó mới bị ẩn/chặn với user ấy.
//
// permissions resolved = role-default (staff/manager/viewer mặc định có 'view'
// mọi trang) ∪ custom override. Lưu ở web2_users.permissions, trả trong user.
//
// API:
//   Web2Perm.isAdmin()
//   Web2Perm.slugFromUrl(url?)        → slug trang (folder-based, khớp registry)
//   Web2Perm.can(slug, action='view') → boolean
//   Web2Perm.canView(slug) / canViewUrl(url)
// Tự chạy PAGE GUARD khi load: trang Web 2.0 mà user bị bỏ 'view' → phủ overlay
// "Không có quyền" + nút về Tổng quan (KHÔNG redirect loop, KHÔNG chặn admin).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Perm) return;

    function _user() {
        try {
            return (
                (global.Web2Auth &&
                    global.Web2Auth.getStored &&
                    global.Web2Auth.getStored()?.user) ||
                null
            );
        } catch (_) {
            return null;
        }
    }
    function isAdmin() {
        const u = _user();
        return !!u && String(u.role || '').toLowerCase() === 'admin';
    }

    // ── ADMIN-ONLY PAGES (1 NGUỒN) ──────────────────────────────────
    // Danh sách slug trang CHỈ admin được vào. Dùng CHUNG cho:
    //   • Page guard (chặn truy cập trực tiếp URL khi không phải admin) — bên dưới.
    //   • Sidebar menu (ẩn item khỏi menu nhân viên) — web2-sidebar.js đọc
    //     Web2Perm.isAdminOnlyUrl() làm backstop bên cạnh flag NAV adminOnly.
    // Khác với per-user 'view' revoke (default-open): admin-only là FAIL-CLOSED —
    // mặc định CHẶN mọi non-admin, không phụ thuộc dữ liệu permissions.
    // Slug = tên folder (khớp slugFromUrl). Thêm trang admin-only mới vào đây.
    const ADMIN_ONLY_SLUGS = new Set([
        'system', // Cấu hình & Hệ thống (web2/system)
        'pancake-settings', // Pancake (Token)
        'delivery-zone', // Phương thức giao hàng
        'audit-log', // Lịch sử thao tác
        'order-tags', // TAG đơn hàng
        'livestream-poller', // Lấy comment Live (poller)
        'cham-cong', // Chấm công (group Quản trị viên)
        'chi-tieu', // Quản lý chi tiêu (group Quản trị viên)
        'users', // Người dùng (group Quản trị viên)
    ]);
    function isAdminOnlySlug(slug) {
        return !!slug && ADMIN_ONLY_SLUGS.has(slug);
    }
    function isAdminOnlyUrl(url) {
        return isAdminOnlySlug(slugFromUrl(url));
    }

    // Slug từ URL/path — khớp slug folder ở backend WEB2_PAGES.
    function slugFromUrl(url) {
        try {
            const path = String(url || global.location.pathname)
                .split('?')[0]
                .split('#')[0]
                .replace(/^(\.\.\/)+/, '');
            const m = path.match(/(?:^|\/)([^/]+)\/([^/]+)\.html?$/);
            if (!m) return '';
            const folder = m[1];
            const file = m[2];
            if (folder === 'overview') return 'tongquan'; // overview → slug 'tongquan'
            if (folder === 'web2') return file === 'index' ? '' : file;
            if (file === 'index') return folder;
            // file riêng trong folder (live-chat/chat.html, comments-mobile.html)
            if (file === 'comments-mobile') return 'comments-mobile';
            if (folder === 'live-chat') return 'live-chat'; // chat.html cũng thuộc live-chat
            return file;
        } catch (_) {
            return '';
        }
    }

    function can(slug, action) {
        if (!slug) return true;
        if (isAdmin()) return true;
        const u = _user();
        const perms = u && u.permissions;
        if (!perms || typeof perms !== 'object') return true; // chưa có dữ liệu → cho phép
        const entry = perms[slug];
        if (entry == null || !Array.isArray(entry)) return true; // trang không cấu hình → cho phép
        return entry.indexOf(action || 'view') !== -1;
    }
    function canView(slug) {
        return can(slug, 'view');
    }
    function canViewUrl(url) {
        return canView(slugFromUrl(url));
    }

    // Resolve NAV `our` (dạng `../web2/X/index.html`, giả định caller depth 1) theo
    // độ sâu trang hiện tại — mirror web2-sidebar.resolveOur.
    function _resolveOur(rawHref) {
        if (!rawHref || rawHref === '#') return rawHref;
        var projectRel = rawHref.replace(/^(\.\.\/)+/, '');
        var pn = (global.location && global.location.pathname) || '';
        if (/\/web2\/[^/]+\/[^/]*$/.test(pn)) return '../../' + projectRel;
        return '../' + projectRel;
    }

    // Trang ĐẦU TIÊN user có quyền mở (bỏ Tổng quan) — dùng để redirect khi bị chặn,
    // thay vì luôn quăng về Tổng quan. Nguồn = Web2Sidebar.NAV (catalog trang canonical;
    // có mặt trên mọi trang vận hành vì sidebar auto-load web2-perm). Trả URL đã resolve
    // theo độ sâu, hoặc null nếu không có (caller fallback về Tổng quan).
    function firstPermittedUrl() {
        try {
            var nav = global.Web2Sidebar && global.Web2Sidebar.NAV;
            if (!Array.isArray(nav)) return null;
            var admin = isAdmin();
            for (var i = 0; i < nav.length; i++) {
                var g = nav[i];
                if (g.adminOnly && !admin) continue;
                var items = g.single ? [g] : g.children || [];
                for (var j = 0; j < items.length; j++) {
                    var it = items[j];
                    if (!it.our) continue; // placeholder "soon"
                    var slug = slugFromUrl(it.our);
                    if (!slug || slug === 'tongquan') continue; // bỏ Tổng quan
                    if (it.adminOnly && !admin) continue;
                    if (isAdminOnlySlug(slug) && !admin) continue; // backstop
                    if (!canView(slug)) continue; // trang bị thu hồi 'view'
                    return _resolveOur(it.our);
                }
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    global.Web2Perm = {
        isAdmin,
        slugFromUrl,
        can,
        canView,
        canViewUrl,
        isAdminOnlySlug,
        isAdminOnlyUrl,
        firstPermittedUrl,
        _user,
    };

    // ── PAGE GUARD ──────────────────────────────────────────────────
    // Chặn truy cập trực tiếp URL trang mà user bị thu hồi 'view'. Soft-block
    // (overlay), không redirect (tránh loop). Đợi Web2Auth load tối đa 2.5s.
    function _block(slugLabel) {
        if (document.getElementById('web2PermBlock')) return;
        // Path tới Tổng quan tuỳ độ sâu trang (mirror resolveOur của sidebar):
        // trong /web2/<slug>/ → ../overview/; còn lại (native-orders/…) → ../web2/overview/.
        const pn = (global.location && global.location.pathname) || '';
        const overviewUrl = /\/web2\/[^/]+\/[^/]*$/.test(pn)
            ? '../overview/index.html'
            : '../web2/overview/index.html';
        // Ưu tiên đưa user về TRANG HỌ CÓ QUYỀN (không phải luôn về Tổng quan).
        const permittedUrl = firstPermittedUrl();
        const dest = permittedUrl || overviewUrl;
        const destLabel = permittedUrl ? 'Đến trang bạn có quyền →' : '← Về Tổng quan';
        const ov = document.createElement('div');
        ov.id = 'web2PermBlock';
        ov.style.cssText =
            'position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;' +
            'align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;' +
            'background:rgba(15,23,42,0.96);color:#fff;font-family:Inter,system-ui,sans-serif;';
        ov.innerHTML =
            '<div style="font-size:46px;">🔒</div>' +
            '<h2 style="margin:0;font-size:20px;">Bạn không có quyền xem trang này</h2>' +
            '<p style="margin:0;color:#cbd5e1;font-size:14px;max-width:420px;">Liên hệ quản trị viên để được cấp quyền truy cập.</p>' +
            '<a href="' +
            dest +
            '" style="margin-top:6px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">' +
            destLabel +
            '</a>';
        (document.body || document.documentElement).appendChild(ov);
    }
    function _runGuard() {
        try {
            if (isAdmin()) return; // admin không bao giờ bị chặn
            const slug = slugFromUrl(global.location.href);
            if (!slug) return;
            // Admin-only page: FAIL-CLOSED — chặn mọi non-admin (kể cả khi chưa có
            // dữ liệu permissions). web2-auth.js đã redirect user chưa đăng nhập về
            // login, nên tới đây luôn có user; getStored() đọc localStorage đồng bộ.
            if (isAdminOnlySlug(slug)) {
                _block(slug);
                return;
            }
            // Per-user 'view' revoke (default-open): chỉ chặn khi có user + có dữ
            // liệu quyền RÕ RÀNG bỏ 'view'.
            const u = _user();
            if (!u || !u.permissions) return; // chưa có dữ liệu → cho qua
            if (!canView(slug)) _block(slug);
        } catch (_) {
            /* fail-open */
        }
    }
    function _waitAndGuard() {
        let tries = 0;
        const t = setInterval(function () {
            tries++;
            if (_user() || tries > 25) {
                clearInterval(t);
                _runGuard();
            }
        }, 100);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _waitAndGuard);
    } else {
        _waitAndGuard();
    }
})(typeof window !== 'undefined' ? window : globalThis);
