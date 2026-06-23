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

    global.Web2Perm = { isAdmin, slugFromUrl, can, canView, canViewUrl, _user };

    // ── PAGE GUARD ──────────────────────────────────────────────────
    // Chặn truy cập trực tiếp URL trang mà user bị thu hồi 'view'. Soft-block
    // (overlay), không redirect (tránh loop). Đợi Web2Auth load tối đa 2.5s.
    function _block(slugLabel) {
        if (document.getElementById('web2PermBlock')) return;
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
            '<a href="../web2/overview/index.html" style="margin-top:6px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px;">← Về Tổng quan</a>';
        (document.body || document.documentElement).appendChild(ov);
    }
    function _runGuard() {
        try {
            if (isAdmin()) return; // admin không bao giờ bị chặn
            const slug = slugFromUrl(global.location.href);
            if (!slug) return;
            // Chỉ chặn khi có user + có dữ liệu quyền RÕ RÀNG bỏ 'view'.
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
