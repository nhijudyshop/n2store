// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 USERS — user account system riêng cho Web 2.0
// Tách biệt với legacy users (routes/users.js + table `users`).
// Schema riêng `web2_users`, role-based, bcrypt password, JWT-less (token UUID).
//
// Endpoints:
//   GET    /api/web2-users/list         — list users (with pagination)
//   GET    /api/web2-users/:id          — get one user
//   POST   /api/web2-users              — create (body: username, password, displayName, role, ...)
//   PATCH  /api/web2-users/:id          — update (any field except password)
//   POST   /api/web2-users/:id/password — change password
//   DELETE /api/web2-users/:id          — soft delete (is_active=false)
//   POST   /api/web2-users/login        — verify credentials, return token
//   GET    /api/web2-users/me?token=    — return user info from token
// =====================================================

const express = require('express');
const router = express.Router();
const {
    requireWeb2Auth,
    requireWeb2Admin,
    hashWeb2Token,
    resolveWeb2User,
} = require('../middleware/web2-auth');
// EVENT-SINK audit toàn bộ (2026-06-22): mọi thao tác tài khoản (tạo/sửa/quyền/
// đổi mật khẩu/khoá) lên Lịch sử thao tác. entity='web2-user', actor=admin thực hiện.
const { recordAuditEvent } = require('../services/web2-audit-sink');
function _auditUser(req, action, id, changes) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    recordAuditEvent(pool, {
        entity: 'web2-user',
        entityId: id != null ? String(id) : null,
        action,
        userId: req.web2User?.id ?? null,
        userName: req.web2User?.display_name || req.web2User?.username || null,
        sourcePage: 'users',
        changes: changes || {},
    });
}

// -----------------------------------------------------
// SSE notifier — broadcast topic 'web2:users' sau mỗi DB mutation
// (create/update/delete/password change). Xem docs/web2/SSE-REALTIME.md.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:users', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-USERS] _notify failed:', e.message);
    }
}
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ── Password reversible encryption (AES-256-GCM) ─────────────────────
// Web 2.0 internal tool: admin cần đọc lại mật khẩu NV để cấp phát. Lưu THÊM
// một bản mã hoá 2 chiều `password_enc` (KHÔNG thay bcrypt — bcrypt vẫn là
// nguồn verify login). Chỉ admin được giải mã để hiện lên bảng; KHÔNG lộ mật
// khẩu của account role 'admin'. Key từ env WEB2_USER_PWD_KEY (khuyến nghị set
// trên Render). Mất/đổi key → mất khả năng giải mã các bản cũ (login bcrypt vẫn
// chạy bình thường). Mật khẩu cũ (chỉ có bcrypt, password_enc NULL) sẽ KHÔNG
// hiện được — phải đổi/tạo mới mới có bản mã.
const PWD_ENC_KEY = crypto
    .createHash('sha256')
    .update(String(process.env.WEB2_USER_PWD_KEY || 'web2-user-pwd-default-key-v1'))
    .digest(); // 32 bytes

function encryptPassword(plain) {
    try {
        if (plain == null || plain === '') return null;
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', PWD_ENC_KEY, iv);
        const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        // format: v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
        return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
    } catch (e) {
        console.error('[WEB2-USERS] encryptPassword error:', e.message);
        return null;
    }
}

function decryptPassword(blob) {
    try {
        if (!blob || typeof blob !== 'string') return null;
        const parts = blob.split(':');
        if (parts.length !== 4 || parts[0] !== 'v1') return null;
        const iv = Buffer.from(parts[1], 'base64');
        const tag = Buffer.from(parts[2], 'base64');
        const data = Buffer.from(parts[3], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', PWD_ENC_KEY, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(data), decipher.final()]);
        return dec.toString('utf8');
    } catch (e) {
        return null; // sai key / hỏng dữ liệu → không trả plaintext
    }
}

const ROLES = ['admin', 'manager', 'staff', 'viewer'];
const DAY_MS = 24 * 60 * 60 * 1000;
// TTL phiên Web 2.0 theo role: admin dùng lâu → 90 ngày; user thường → 14 ngày.
// (Trước đây cố định 7 ngày → active user vẫn bị "Phiên hết hạn" khá thường.)
const ADMIN_TOKEN_TTL_MS = 90 * DAY_MS;
const USER_TOKEN_TTL_MS = 14 * DAY_MS;
const tokenTtlFor = (role) => (role === 'admin' ? ADMIN_TOKEN_TTL_MS : USER_TOKEN_TTL_MS);

// ── Login rate-limit (in-memory, no dependency) ─────────────────────
// Theo IP: > LOGIN_MAX_FAILS lần thất bại trong LOGIN_WINDOW_MS → 429.
// Reset bộ đếm khi login thành công. Cleanup định kỳ tránh memory leak.
const LOGIN_MAX_FAILS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const _loginFails = new Map(); // ip → { count, firstAt }

function _loginClientIp(req) {
    // Ưu tiên cf-connecting-ip (Cloudflare set, client KHÔNG spoof được qua CF).
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf).trim();
    // XFF: proxy APPEND vào cuối → phần tử CUỐI là IP do proxy gần nhất ghi,
    // phần tử đầu là client-controlled (spoof để né rate-limit).
    const xf = req.headers['x-forwarded-for'];
    if (xf) {
        const parts = String(xf)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length) return parts[parts.length - 1];
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

// true → đang bị chặn (vượt ngưỡng trong cửa sổ).
function _loginIsBlocked(ip) {
    const e = _loginFails.get(ip);
    if (!e) return false;
    if (Date.now() - e.firstAt > LOGIN_WINDOW_MS) {
        _loginFails.delete(ip);
        return false;
    }
    return e.count >= LOGIN_MAX_FAILS;
}

function _loginRecordFail(ip) {
    const now = Date.now();
    const e = _loginFails.get(ip);
    if (!e || now - e.firstAt > LOGIN_WINDOW_MS) {
        _loginFails.set(ip, { count: 1, firstAt: now });
    } else {
        e.count++;
    }
}

function _loginRecordSuccess(ip) {
    _loginFails.delete(ip);
}

// Cleanup expired buckets every 15 min (unref → không giữ process sống).
setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of _loginFails) {
        if (now - e.firstAt > LOGIN_WINDOW_MS) _loginFails.delete(ip);
    }
}, LOGIN_WINDOW_MS).unref?.();

// ── Permission registry ─────────────────────────────────────────────
// Each Web 2.0 page declares supported actions. Used by:
//   - Backend: validate role-based defaults
//   - Frontend: render permission matrix editor
// Mỗi page có set action thực tế user có thể làm.
// `view` = quyền truy cập trang. Không có `view` → page bị chặn / sidebar ẩn.
const WEB2_PAGES = [
    { slug: 'tongquan', label: 'Tổng quan', group: 'Dashboard', actions: ['view'] },

    // ─── Mua hàng ──────────────────────────────────────────────────
    {
        slug: 'so-order',
        label: 'Sổ Order (mua từ NCC)',
        group: 'Mua hàng',
        actions: [
            'view',
            'createShipment',
            'editRow',
            'deleteRow',
            'syncToKho',
            'uploadImage',
            'editTable',
            'paste',
        ],
    },
    {
        slug: 'supplier-debt',
        label: 'Công nợ NCC',
        group: 'Mua hàng',
        actions: ['view', 'createNcc', 'editNote', 'pay', 'sort', 'export', 'expandDetail'],
    },
    {
        slug: 'supplier-wallet',
        label: 'Ví NCC',
        group: 'Mua hàng',
        actions: ['view', 'search', 'sort', 'openDetail', 'return', 'pay', 'refresh'],
    },

    // ─── Khách hàng ────────────────────────────────────────────────
    {
        slug: 'customer-wallet',
        label: 'Ví KH',
        group: 'Khách hàng',
        actions: ['view', 'search', 'sort', 'openDetail', 'return', 'pay', 'refresh'],
    },

    // ─── Bán hàng ──────────────────────────────────────────────────
    {
        slug: 'native-orders',
        label: 'Đơn Web',
        group: 'Bán hàng',
        actions: ['view', 'create', 'edit', 'delete', 'createPBH', 'search', 'switchPage'],
    },
    {
        slug: 'fastsaleorder-invoice',
        label: 'Phiếu Bán Hàng (PBH)',
        group: 'Bán hàng',
        actions: ['view', 'editStatus', 'cancel'],
    },
    {
        slug: 'unit-scan',
        label: 'Quét tem đóng gói',
        group: 'Bán hàng',
        actions: ['view', 'scan', 'assign', 'reprint'],
    },

    // ─── Sản phẩm ──────────────────────────────────────────────────
    {
        slug: 'products',
        label: 'Kho SP',
        group: 'Sản phẩm',
        actions: ['view', 'create', 'edit', 'delete', 'adjustStock', 'uploadImage', 'editVariant'],
    },
    {
        slug: 'variants',
        label: 'Kho Biến Thể',
        group: 'Sản phẩm',
        actions: ['view', 'create', 'edit', 'delete'],
    },
    {
        slug: 'clearance',
        label: 'Kho rớt xả',
        group: 'Sản phẩm',
        actions: ['view', 'keep'],
    },

    // ─── Tích hợp ──────────────────────────────────────────────────
    {
        slug: 'live-chat',
        label: 'Live Chat (Pancake)',
        group: 'Tích hợp',
        actions: ['view', 'syncPancake'],
    },

    // ─── Cấu hình ──────────────────────────────────────────────────
    {
        slug: 'users',
        label: 'Người dùng Web 2.0',
        group: 'Cấu hình',
        actions: ['view', 'create', 'edit', 'delete', 'changePassword', 'changePermissions'],
    },
    {
        slug: 'pancake-settings',
        label: 'Cấu hình Pancake',
        group: 'Cấu hình',
        actions: ['view', 'edit'],
    },
    {
        slug: 'delivery-zone',
        label: 'Khu vực giao hàng',
        group: 'Cấu hình',
        actions: ['view'],
    },
    {
        slug: 'printer-settings',
        label: 'Cấu hình máy in',
        group: 'Cấu hình',
        actions: ['view'],
    },

    // ─── Báo cáo ───────────────────────────────────────────────────
    {
        slug: 'report-revenue',
        label: 'Báo cáo doanh thu',
        group: 'Báo cáo',
        actions: ['view'],
    },
    {
        slug: 'report-delivery',
        label: 'Báo cáo giao hàng',
        group: 'Báo cáo',
        actions: ['view'],
    },

    // ─── Hệ thống ──────────────────────────────────────────────────
    {
        slug: 'system',
        label: 'Cấu hình & Hệ thống',
        group: 'Hệ thống',
        actions: ['view'],
    },

    // ─── Tính năng mới ─────────────────────────────────────────────
    {
        slug: 'photo-studio',
        label: 'Studio chụp tách nền',
        group: 'Đa dụng',
        actions: ['view'],
    },

    // ════════════════════════════════════════════════════════════════
    // 2026-06-24: BỔ SUNG đủ 50 trang (trước chỉ 18 → matrix STALE). Mỗi
    // trang ≥ 'view'. Khi thêm TRANG MỚI → thêm 1 entry ở đây (slug = tên
    // folder). Matrix frontend cũng tự bổ sung trang có trong sidebar NAV
    // mà thiếu ở registry (chỉ 'view') → trang mới auto hiện để admin chặn.
    // ════════════════════════════════════════════════════════════════
    // ─── AI ────────────────────────────────────────────────────────
    {
        slug: 'ai-hub',
        label: 'Trợ lý AI',
        group: 'AI',
        actions: ['view', 'generate', 'nanobanana'],
    },
    {
        slug: 'video-maker',
        label: 'Xưởng Video AI',
        group: 'AI',
        actions: ['view', 'generate', 'export'],
    },
    { slug: 'ai-assistant', label: 'Trợ lý AI theo trang', group: 'AI', actions: ['view'] },
    { slug: 'ai-photo', label: 'Sửa ảnh AI', group: 'AI', actions: ['view'] },
    // ─── Đa dụng ───────────────────────────────────────────────────
    { slug: 'multi-tool', label: 'Tăng số lượng comment', group: 'Facebook', actions: ['view'] },
    { slug: 'product-counter', label: 'Đếm SP qua camera', group: 'Đa dụng', actions: ['view'] },
    { slug: 'product-card', label: 'Tạo card sản phẩm', group: 'Đa dụng', actions: ['view'] },
    { slug: 'photo-editor', label: 'Chỉnh sửa ảnh', group: 'Đa dụng', actions: ['view'] },
    { slug: 'video-beauty', label: 'Làm đẹp video', group: 'Đa dụng', actions: ['view'] },
    // ─── Bán hàng (thêm) ───────────────────────────────────────────
    {
        slug: 'reconcile',
        label: 'Đối soát đóng gói',
        group: 'Bán hàng',
        actions: ['view', 'scan', 'pack', 'returnFailed'],
    },
    {
        slug: 'fastsaleorder-refund',
        label: 'Trả hàng',
        group: 'Bán hàng',
        actions: ['view', 'create'],
    },
    { slug: 'returns', label: 'Thu về', group: 'Bán hàng', actions: ['view', 'create', 'delete'] },
    {
        slug: 'fastsaleorder-delivery',
        label: 'Phiếu giao hàng',
        group: 'Bán hàng',
        actions: ['view'],
    },
    // ─── Facebook / Sale Online ────────────────────────────────────
    {
        slug: 'comments-mobile',
        label: 'Comment Live (mobile)',
        group: 'Facebook',
        actions: ['view'],
    },
    { slug: 'live-control', label: 'Điều khiển TV', group: 'Facebook', actions: ['view', 'edit'] },
    { slug: 'live-tv', label: 'TV Livestream', group: 'Facebook', actions: ['view'] },
    {
        slug: 'fb-posts',
        label: 'Đăng bài Facebook',
        group: 'Facebook',
        actions: ['view', 'create', 'edit', 'delete', 'publish'],
    },
    { slug: 'fb-insights', label: 'Thống kê tương tác FB', group: 'Facebook', actions: ['view'] },
    { slug: 'fb-ads-stats', label: 'Thống kê quảng cáo FB', group: 'Facebook', actions: ['view'] },
    // ─── Mua hàng (thêm) ───────────────────────────────────────────
    {
        slug: 'purchase-refund',
        label: 'Trả hàng NCC',
        group: 'Mua hàng',
        actions: ['view', 'create'],
    },
    // ─── Chuyển khoản KH ───────────────────────────────────────────
    {
        slug: 'balance-history',
        label: 'Lịch sử biến động số dư (SePay)',
        group: 'Chuyển khoản KH',
        actions: ['view'],
    },
    {
        slug: 'ck-dashboard',
        label: 'Đối soát CK',
        group: 'Chuyển khoản KH',
        actions: ['view', 'confirm'],
    },
    // ─── Khách hàng (thêm) ─────────────────────────────────────────
    {
        slug: 'customers',
        label: 'Kho Khách Hàng',
        group: 'Khách hàng',
        actions: ['view', 'edit', 'export'],
    },
    { slug: 'zalo', label: 'Zalo', group: 'Khách hàng', actions: ['view'] },
    // ─── Báo cáo (thêm) ────────────────────────────────────────────
    { slug: 'dashboard', label: 'Dashboard KPI', group: 'Báo cáo', actions: ['view'] },
    { slug: 'jt-tracking', label: 'Tra cứu vận đơn J&T', group: 'Báo cáo', actions: ['view'] },
    // ─── Cấu hình (thêm) ───────────────────────────────────────────
    { slug: 'audit-log', label: 'Lịch sử thao tác', group: 'Cấu hình', actions: ['view'] },
    { slug: 'order-tags', label: 'TAG đơn hàng', group: 'Cấu hình', actions: ['view', 'edit'] },
    {
        slug: 'livestream-poller',
        label: 'Lấy comment Live (poller)',
        group: 'Cấu hình',
        actions: ['view', 'edit'],
    },
    // ─── Tính năng mới (thêm) ──────────────────────────────────────
    { slug: 'kpi', label: 'KPI Nhân viên', group: 'Tính năng mới', actions: ['view'] },
    { slug: 'notifications', label: 'Thông báo', group: 'Tính năng mới', actions: ['view'] },
    // ─── Quản trị viên (admin-only, gate qua requireWeb2Admin) ─────
    { slug: 'cham-cong', label: 'Chấm công', group: 'Quản trị viên', actions: ['view', 'edit'] },
    {
        slug: 'chi-tieu',
        label: 'Quản lý chi tiêu',
        group: 'Quản trị viên',
        actions: ['view', 'create', 'edit', 'delete'],
    },
];

// Vietnamese label for each action (used by permission editor UI).
const ACTION_LABELS = {
    view: 'Xem trang',
    create: 'Tạo mới',
    edit: 'Chỉnh sửa',
    delete: 'Xóa',
    sort: 'Sắp xếp',
    search: 'Tìm kiếm',
    export: 'Xuất CSV/Excel',
    refresh: 'Tải lại',
    expandDetail: 'Xem chi tiết (expand row)',
    openDetail: 'Mở chi tiết',
    uploadImage: 'Upload ảnh',
    // mua hàng
    createShipment: 'Tạo phiếu nhập / shipment',
    editRow: 'Chỉnh sửa dòng',
    deleteRow: 'Xóa dòng',
    syncToKho: 'Sync vào Kho SP',
    editTable: 'Bật chế độ sửa toàn bảng',
    paste: 'Dán dữ liệu (paste)',
    createNcc: 'Tạo NCC',
    editNote: 'Sửa ghi chú NCC',
    pay: 'Ghi thanh toán',
    return: 'Ghi trả hàng',
    // bán hàng
    createPBH: 'Tạo Phiếu Bán Hàng',
    switchPage: 'Đổi page Pancake',
    editStatus: 'Sửa trạng thái PBH',
    cancel: 'Hủy đơn',
    // sản phẩm
    adjustStock: 'Điều chỉnh tồn kho',
    editVariant: 'Sửa biến thể',
    // tích hợp
    syncPancake: 'Sync Pancake',
    // users
    changePassword: 'Đổi mật khẩu',
    changePermissions: 'Đổi phân quyền',
    // 2026-06-24 thêm
    generate: 'Tạo nội dung (AI)',
    nanobanana: 'Dùng Nano Banana (ảnh AI trả phí)',
    scan: 'Quét đóng gói',
    pack: 'Xác nhận đóng gói',
    returnFailed: 'Giao thất bại / trả kho',
    publish: 'Đăng / lên lịch',
    confirm: 'Xác nhận',
};

// Hành động "đắt"/nhạy cảm KHÔNG cấp mặc định cho non-admin (admin luôn pass qua userCan;
// admin có thể cấp thủ công cho từng user ở trang Phân quyền). 'nanobanana' = model tạo ảnh
// TRẢ PHÍ → mặc định CHẶN để kiểm soát chi phí (2026-06-24, user request).
const RESTRICTED_ACTIONS = new Set(['nanobanana']);
const _allow = (actions) => actions.filter((a) => !RESTRICTED_ACTIONS.has(a));

// Role-based default permissions.
const ROLE_DEFAULTS = {
    admin: () => {
        // All actions on all pages
        const out = {};
        for (const p of WEB2_PAGES) out[p.slug] = [...p.actions];
        return out;
    },
    manager: () => {
        // All pages, all actions EXCEPT user delete + changePermissions + restricted (paid) actions
        const out = {};
        for (const p of WEB2_PAGES) {
            if (p.slug === 'users') {
                out[p.slug] = _allow(
                    p.actions.filter((a) => a !== 'delete' && a !== 'changePermissions')
                );
            } else {
                out[p.slug] = _allow([...p.actions]);
            }
        }
        return out;
    },
    staff: () => {
        // View + create + edit on operational pages; view-only for users
        const out = {};
        for (const p of WEB2_PAGES) {
            if (p.slug === 'users') {
                out[p.slug] = []; // no access
            } else {
                out[p.slug] = _allow(p.actions.filter((a) => a !== 'delete' && a !== 'cancel'));
            }
        }
        return out;
    },
    viewer: () => {
        // View only, no users access
        const out = {};
        for (const p of WEB2_PAGES) {
            if (p.slug === 'users') {
                out[p.slug] = [];
            } else {
                out[p.slug] = p.actions.includes('view') ? ['view'] : [];
            }
        }
        return out;
    },
};

function effectivePermissions(role, customPerms) {
    const defaults = (ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer)();
    if (!customPerms || typeof customPerms !== 'object') return defaults;
    // Merge: custom OVERRIDES default per page
    const out = { ...defaults };
    for (const slug of Object.keys(customPerms)) {
        if (Array.isArray(customPerms[slug])) {
            out[slug] = [...customPerms[slug]];
        }
    }
    return out;
}

// ── Server-side granular permission enforcement ─────────────────────
// Audit (WEB2-FULL-REVIEW-20260620 #8/#24): effectivePermissions was computed
// + returned to client but NEVER enforced server-side → broken access control
// (OWASP A01). This middleware factory closes that gap by deriving the caller's
// effective permissions from req.web2User (role + permissions JSONB, SAME logic
// as mapRow → zero drift) and 403-ing when the action is absent.
//
// Exported (module.exports below) so middleware/web2-auth.js and OTHER web2
// routers can reuse it WITHOUT duplicating the role-defaults logic. Apply AFTER
// requireWeb2Auth / requireWeb2Admin so req.web2User is populated; if it is not
// (e.g. used standalone), it resolves the token itself.
//
// admin always passes (defensive — ROLE_DEFAULTS.admin already grants all).
function userCan(user, slug, action) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perms = effectivePermissions(user.role, user.permissions || null);
    const actions = perms[slug];
    return Array.isArray(actions) && actions.includes(action);
}

function requireWeb2Permission(slug, action) {
    return (req, res, next) => {
        const proceed = (user) => {
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Cần đăng nhập Web 2.0 (thiếu/sai token)',
                });
            }
            req.web2User = user;
            if (!userCan(user, slug, action)) {
                return res.status(403).json({
                    success: false,
                    error: `Không có quyền "${action}" trên trang "${slug}"`,
                });
            }
            next();
        };
        // Reuse req.web2User if an upstream gate (requireWeb2Auth/Admin) already
        // resolved it; otherwise resolve from the token ourselves.
        if (req.web2User) return proceed(req.web2User);
        resolveWeb2User(req)
            .then(proceed)
            .catch((e) => {
                console.error('[WEB2-USERS] requireWeb2Permission error:', e.message);
                res.status(500).json({ success: false, error: 'Lỗi xác thực' });
            });
    };
}

// ── Schema bootstrap ────────────────────────────────────────────────
// Audit #9/#18 (WEB2-FULL-REVIEW-20260620): the old plain-boolean guard let two
// concurrent cold-start requests both run the body (incl. the check-then-insert
// seed → TOCTOU). Cache a single in-flight promise so the body runs once; reset
// it on failure so a transient error can be retried. The seed INSERT is also
// made idempotent (ON CONFLICT) as belt-and-suspenders.
let tablesReady = false;
let _ensurePromise = null;
function ensureTables(pool) {
    if (tablesReady) return Promise.resolve();
    return (_ensurePromise ||= doEnsureTables(pool)
        .then(() => {
            tablesReady = true;
        })
        .catch((e) => {
            _ensurePromise = null; // allow retry on next request
            throw e;
        }));
}
async function doEnsureTables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_users (
            id              SERIAL PRIMARY KEY,
            username        VARCHAR(50) NOT NULL UNIQUE,
            password_hash   VARCHAR(200) NOT NULL,
            display_name    VARCHAR(120) NOT NULL,
            email           VARCHAR(120),
            phone           VARCHAR(30),
            role            VARCHAR(20) NOT NULL DEFAULT 'staff',
            is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
            note            TEXT,
            permissions     JSONB,
            last_login_at   BIGINT,
            created_at      BIGINT NOT NULL,
            updated_at      BIGINT NOT NULL
        );
        ALTER TABLE web2_users ADD COLUMN IF NOT EXISTS permissions JSONB;
        -- password_enc: bản mã hoá 2 chiều (AES-256-GCM) để admin đọc lại mật khẩu
        -- và hiện lên bảng users. NULL với mật khẩu cũ (chỉ có bcrypt) → không hiện.
        ALTER TABLE web2_users ADD COLUMN IF NOT EXISTS password_enc TEXT;
        -- avatar: cấu hình DiceBear dạng JSON '{"style","seed","bg"}' (self-service, mỗi user tự đổi).
        ALTER TABLE web2_users ADD COLUMN IF NOT EXISTS avatar TEXT;
        CREATE INDEX IF NOT EXISTS idx_web2_users_username ON web2_users(username);
        CREATE INDEX IF NOT EXISTS idx_web2_users_active   ON web2_users(is_active);

        CREATE TABLE IF NOT EXISTS web2_user_sessions (
            token         VARCHAR(64) PRIMARY KEY,
            user_id       INTEGER NOT NULL REFERENCES web2_users(id) ON DELETE CASCADE,
            created_at    BIGINT NOT NULL,
            expires_at    BIGINT NOT NULL
        );
        -- C7 (2026-06-13): token_hash để KHÔNG lưu token plaintext at-rest. Session
        -- MỚI lưu HASH (sha256) trong cả token (PK) lẫn token_hash; verify bằng hash.
        -- Session CŨ (token_hash NULL) vẫn match plaintext tới khi hết hạn (≤30d) →
        -- zero-lockout khi deploy, không cần backfill (tránh phụ thuộc pgcrypto).
        ALTER TABLE web2_user_sessions ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
        CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_user ON web2_user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_exp  ON web2_user_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_hash ON web2_user_sessions(token_hash) WHERE token_hash IS NOT NULL;

        -- Dọn quyền hệ cũ (2026-06-15): migrate saved permissions. Slug 'tpos-pancake'→'live-chat'
        -- (folder đã rename) + bỏ action chết loadTpos/syncTpos. Web 2.0 độc lập, không phụ thuộc hệ cũ.
        -- Idempotent: WHERE guard → re-run no-op.
        UPDATE web2_users
           SET permissions = (permissions - 'tpos-pancake')
               || jsonb_build_object('live-chat', COALESCE((
                    SELECT jsonb_agg(a) FROM jsonb_array_elements_text(permissions->'tpos-pancake') a
                    WHERE a <> 'syncTpos'), '[]'::jsonb))
         WHERE permissions ? 'tpos-pancake';
        UPDATE web2_users
           SET permissions = jsonb_set(permissions, '{supplier-debt}', COALESCE((
                    SELECT jsonb_agg(a) FROM jsonb_array_elements_text(permissions->'supplier-debt') a
                    WHERE a <> 'loadTpos'), '[]'::jsonb))
         WHERE permissions ? 'supplier-debt' AND permissions->'supplier-debt' @> '"loadTpos"';
    `);

    // Seed default admin if table is empty.
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_users');
    if (r.rows[0].n === 0) {
        const hash = await bcrypt.hash('admin@@', 10);
        const now = Date.now();
        // ON CONFLICT guards the TOCTOU window: if two cold-start callers race
        // the seed, the loser no-ops instead of erroring on the UNIQUE(username).
        await pool.query(
            `INSERT INTO web2_users
                (username, password_hash, display_name, role, is_active, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, TRUE, $5, $6, $6)
             ON CONFLICT (username) DO NOTHING`,
            ['admin', hash, 'Quản trị viên', 'admin', 'Auto-seeded on first boot', now]
        );
        console.log('[WEB2-USERS] Created default admin user (username: admin)');
    }
}

function mapRow(row, opts = {}) {
    if (!row) return null;
    const customPerms = row.permissions || null;
    const out = {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email || '',
        phone: row.phone || '',
        role: row.role,
        isActive: row.is_active,
        note: row.note || '',
        avatar: row.avatar || null, // DiceBear config JSON (self-service)
        customPermissions: customPerms, // null if using role defaults
        permissions: effectivePermissions(row.role, customPerms), // resolved final
        lastLoginAt: row.last_login_at ? Number(row.last_login_at) : null,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
    // Mật khẩu dạng đọc được: CHỈ admin xem (opts.reveal) và KHÔNG lộ account admin.
    // hasPassword: có bản mã để hiện hay chưa (giúp frontend phân biệt "chưa có" vs admin).
    if (opts.reveal && row.role !== 'admin') {
        out.passwordPlain = decryptPassword(row.password_enc) || '';
    }
    return out;
}

function validateRole(role) {
    if (!role) return 'staff';
    if (!ROLES.includes(role)) throw Object.assign(new Error(`role không hợp lệ`), { status: 400 });
    return role;
}

function validateUsername(u) {
    const s = String(u || '')
        .trim()
        .toLowerCase();
    if (!/^[a-z0-9_.-]{2,40}$/.test(s)) {
        throw Object.assign(new Error('Username phải 2-40 ký tự, chỉ chứa a-z, 0-9, _ . -'), {
            status: 400,
        });
    }
    return s;
}

const MIN_PWD_LEN = 6; // đồng bộ với frontend web2/users/js/users-app.js
function validatePassword(p) {
    if (!p || String(p).length < MIN_PWD_LEN) {
        throw Object.assign(new Error(`Mật khẩu phải >= ${MIN_PWD_LEN} ký tự`), { status: 400 });
    }
    return String(p);
}

// ── Permission registry ─────────────────────────────────────────────
router.get('/pages', (req, res) => {
    res.json({
        success: true,
        pages: WEB2_PAGES,
        roles: ROLES,
        actionLabels: ACTION_LABELS,
    });
});

router.get('/role-defaults/:role', (req, res) => {
    const role = req.params.role;
    if (!ROLE_DEFAULTS[role]) return res.status(404).json({ error: 'role không tồn tại' });
    res.json({ success: true, role, permissions: ROLE_DEFAULTS[role]() });
});

// ── List (gate CỨNG — chứa username/email/phone/permissions toàn bộ user) ──
router.get('/list', requireWeb2Auth, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const includeInactive = req.query.includeInactive === '1';
        const where = includeInactive ? '' : 'WHERE is_active = TRUE';
        const sql = `SELECT * FROM web2_users ${where} ORDER BY id ASC LIMIT $1 OFFSET $2`;
        const r = await pool.query(sql, [limit, offset]);
        const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM web2_users ${where}`);
        const reveal = req.web2User?.role === 'admin';
        // PII guard (2026-06-26): non-admin gọi /list CHỈ nhận field tối thiểu (id/tên/role/
        // active/avatar) — bỏ email/SĐT/note/permissions của NGƯỜI KHÁC. Admin thấy đủ.
        const project = (u) => {
            if (reveal || !u) return u;
            const { email, phone, note, permissions, customPermissions, passwordPlain, ...safe } =
                u;
            return safe;
        };
        res.json({
            success: true,
            users: r.rows.map((row) => project(mapRow(row, { reveal }))),
            total: cnt.rows[0].n,
            limit,
            offset,
        });
    } catch (e) {
        console.error('[WEB2-USERS] list error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/:id(\\d+)', requireWeb2Auth, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT * FROM web2_users WHERE id = $1', [
            Number(req.params.id),
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
        const reveal = req.web2User?.role === 'admin';
        res.json({ success: true, user: mapRow(r.rows[0], { reveal }) });
    } catch (e) {
        console.error('[WEB2-USERS] get error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Create ─────────────────────────────────────────────────────────
router.post('/', requireWeb2Admin, requireWeb2Permission('users', 'create'), async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const username = validateUsername(b.username);
        const password = validatePassword(b.password);
        const displayName = String(b.displayName || '').trim();
        if (!displayName) throw Object.assign(new Error('Họ tên bắt buộc'), { status: 400 });
        const role = validateRole(b.role);
        const hash = await bcrypt.hash(password, 10);
        const pwdEnc = encryptPassword(password); // bản đọc-được để admin xem trên bảng
        const now = Date.now();
        // DELETE là soft-delete (is_active=FALSE) → username vẫn chiếm chỗ. Nếu admin
        // "Tạo lại" 1 username đã bị vô hiệu → HỒI SINH bản cũ với thông tin mới thay vì
        // báo trùng (gốc bug "xóa user coi tạo lại báo trùng" 2026-06-24). Còn active
        // mới thật sự trùng → 409.
        const existing = await pool.query(
            'SELECT id, is_active FROM web2_users WHERE username = $1',
            [username]
        );
        if (existing.rows.length && existing.rows[0].is_active) {
            return res.status(409).json({ error: `Username "${username}" đã tồn tại` });
        }
        try {
            let r;
            if (existing.rows.length) {
                // Revive: reset toàn bộ về user "mới" (permissions/avatar/last_login về mặc định).
                // WHERE ... AND is_active=FALSE → atomic, đóng cửa sổ TOCTOU (nếu user vừa
                // được kích hoạt lại bởi request khác giữa SELECT↔UPDATE → rowCount=0 → 409).
                r = await pool.query(
                    `UPDATE web2_users SET
                        password_hash = $2, password_enc = $3, display_name = $4,
                        email = $5, phone = $6, role = $7, note = $8,
                        is_active = TRUE, permissions = NULL, avatar = NULL,
                        last_login_at = NULL, created_at = $9, updated_at = $9
                     WHERE id = $1 AND is_active = FALSE RETURNING *`,
                    [
                        existing.rows[0].id,
                        hash,
                        pwdEnc,
                        displayName,
                        b.email || null,
                        b.phone || null,
                        role,
                        b.note || null,
                        now,
                    ]
                );
                if (!r.rows.length) {
                    return res.status(409).json({ error: `Username "${username}" đã tồn tại` });
                }
                // Xoá MỌI session cũ của bản vừa hồi sinh → token cũ (trước khi xoá)
                // không thể tái dùng với mật khẩu mới. (DELETE soft-delete đã xoá session,
                // nhưng deactivate qua PATCH thì chưa → dọn ở đây cho chắc.)
                await pool.query('DELETE FROM web2_user_sessions WHERE user_id = $1', [
                    existing.rows[0].id,
                ]);
            } else {
                r = await pool.query(
                    `INSERT INTO web2_users
                        (username, password_hash, password_enc, display_name, email, phone, role, is_active, note, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $9)
                     RETURNING *`,
                    [
                        username,
                        hash,
                        pwdEnc,
                        displayName,
                        b.email || null,
                        b.phone || null,
                        role,
                        b.note || null,
                        now,
                    ]
                );
            }
            _notify('create', r.rows[0].id);
            _auditUser(req, 'create', r.rows[0].id, {
                username: r.rows[0].username,
                role: r.rows[0].role,
                revived: existing.rows.length > 0,
            });
            res.json({ success: true, user: mapRow(r.rows[0], { reveal: true }) });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: `Username "${username}" đã tồn tại` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-USERS] create error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Update (không cho đổi password qua endpoint này) ───────────────
router.patch(
    '/:id(\\d+)',
    requireWeb2Admin,
    requireWeb2Permission('users', 'edit'),
    async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensureTables(pool);
            const id = Number(req.params.id);
            const b = req.body || {};
            const sets = [];
            const vals = [];
            let i = 1;
            if (typeof b.displayName === 'string' && b.displayName.trim()) {
                sets.push(`display_name = $${i++}`);
                vals.push(b.displayName.trim());
            }
            if (typeof b.email === 'string') {
                sets.push(`email = $${i++}`);
                vals.push(b.email.trim() || null);
            }
            if (typeof b.phone === 'string') {
                sets.push(`phone = $${i++}`);
                vals.push(b.phone.trim() || null);
            }
            if (typeof b.role === 'string') {
                sets.push(`role = $${i++}`);
                vals.push(validateRole(b.role));
            }
            if (typeof b.isActive === 'boolean') {
                sets.push(`is_active = $${i++}`);
                vals.push(b.isActive);
            }
            if (typeof b.note === 'string') {
                sets.push(`note = $${i++}`);
                vals.push(b.note);
            }
            if (!sets.length) return res.status(400).json({ error: 'Không có gì để update' });
            // Guard "admin cuối cùng" (như DELETE): không cho set isActive=false hoặc
            // đổi role khỏi 'admin' nếu target là admin active CUỐI CÙNG.
            // 1D TOCTOU fix: gộp check + UPDATE thành 1 câu atomic (trước đây COUNT
            // rời rồi UPDATE → 2 request demote song song có thể về 0 admin).
            const demoting =
                (typeof b.isActive === 'boolean' && b.isActive === false) ||
                (typeof b.role === 'string' && b.role !== 'admin');
            sets.push(`updated_at = $${i++}`);
            vals.push(Date.now());
            vals.push(id);
            // Chỉ chặn khi target đang là admin active VÀ không còn admin active khác.
            const lastAdminGuard = demoting
                ? ` AND (NOT (role = 'admin' AND is_active = TRUE)
                 OR EXISTS (SELECT 1 FROM web2_users WHERE role = 'admin' AND is_active = TRUE AND id <> $${i}))`
                : '';
            const sql = `UPDATE web2_users SET ${sets.join(', ')} WHERE id = $${i}${lastAdminGuard} RETURNING *`;
            const r = await pool.query(sql, vals);
            if (!r.rows.length) {
                if (demoting) {
                    // rowCount=0: phân biệt "không tồn tại" vs "bị guard admin-cuối chặn".
                    const ex = await pool.query('SELECT 1 FROM web2_users WHERE id = $1', [id]);
                    if (ex.rows.length) {
                        return res
                            .status(400)
                            .json({ error: 'Không thể vô hiệu/hạ quyền admin cuối cùng' });
                    }
                }
                return res.status(404).json({ error: 'Không tìm thấy' });
            }
            _notify('update', r.rows[0].id);
            _auditUser(req, 'update', r.rows[0].id, {
                username: r.rows[0].username,
                role: r.rows[0].role,
            });
            res.json({ success: true, user: mapRow(r.rows[0]) });
        } catch (e) {
            console.error('[WEB2-USERS] update error:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    }
);

// ── Update permissions (admin only) ────────────────────────────────
// body: { permissions: { [slug]: [actions] } | null }
//   null → revert to role defaults
router.put(
    '/:id(\\d+)/permissions',
    requireWeb2Admin,
    requireWeb2Permission('users', 'changePermissions'),
    async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensureTables(pool);
            const id = Number(req.params.id);
            const perms = (req.body || {}).permissions;
            // Validate: keys must be known slugs; values must be arrays of known actions.
            if (perms !== null) {
                if (typeof perms !== 'object')
                    throw Object.assign(new Error('permissions phải object'), { status: 400 });
                const knownSlugs = new Set(WEB2_PAGES.map((p) => p.slug));
                const slugActions = new Map(WEB2_PAGES.map((p) => [p.slug, new Set(p.actions)]));
                for (const slug of Object.keys(perms)) {
                    if (!Array.isArray(perms[slug]))
                        throw Object.assign(new Error(`permissions.${slug} phải là array`), {
                            status: 400,
                        });
                    // Trang auto-discover từ sidebar NAV (chưa khai báo ở WEB2_PAGES) chỉ
                    // được FE cấp 'view'. Chấp nhận lưu nếu slug an toàn + chỉ action 'view'
                    // → khớp auto-discover, trang sidebar mới không vỡ lúc Save. Action
                    // khác hoặc slug lạ → từ chối.
                    if (!knownSlugs.has(slug)) {
                        const safeSlug = /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug);
                        const viewOnly = perms[slug].every((a) => a === 'view');
                        if (!safeSlug || !viewOnly)
                            throw Object.assign(new Error(`Page "${slug}" không tồn tại`), {
                                status: 400,
                            });
                        continue;
                    }
                    const allowed = slugActions.get(slug);
                    for (const a of perms[slug]) {
                        if (!allowed.has(a))
                            throw Object.assign(
                                new Error(`Action "${a}" không hợp lệ cho page "${slug}"`),
                                { status: 400 }
                            );
                    }
                }
            }
            const r = await pool.query(
                `UPDATE web2_users SET permissions = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
                [perms === null ? null : JSON.stringify(perms), Date.now(), id]
            );
            if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
            _notify('update-permissions', r.rows[0].id);
            _auditUser(req, 'update-permissions', r.rows[0].id, {});
            res.json({ success: true, user: mapRow(r.rows[0]) });
        } catch (e) {
            console.error('[WEB2-USERS] update permissions error:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    }
);

// ── Change password ────────────────────────────────────────────────
router.post(
    '/:id(\\d+)/password',
    requireWeb2Admin,
    requireWeb2Permission('users', 'changePassword'),
    async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensureTables(pool);
            const id = Number(req.params.id);
            const password = validatePassword((req.body || {}).password);
            const hash = await bcrypt.hash(password, 10);
            const pwdEnc = encryptPassword(password); // cập nhật bản đọc-được cho bảng
            const r = await pool.query(
                `UPDATE web2_users SET password_hash = $1, password_enc = $2, updated_at = $3 WHERE id = $4 RETURNING id`,
                [hash, pwdEnc, Date.now(), id]
            );
            if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
            // Invalidate all sessions for this user
            await pool.query('DELETE FROM web2_user_sessions WHERE user_id = $1', [id]);
            _notify('change-password', id);
            _auditUser(req, 'change-password', id, {});
            res.json({ success: true });
        } catch (e) {
            console.error('[WEB2-USERS] change-password error:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    }
);

// ── Soft delete (deactivate) ───────────────────────────────────────
router.delete(
    '/:id(\\d+)',
    requireWeb2Admin,
    requireWeb2Permission('users', 'delete'),
    async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensureTables(pool);
            const id = Number(req.params.id);
            // Don't allow deactivating the only active admin.
            // 1D TOCTOU fix: gộp check + UPDATE 1 câu atomic (như PATCH) — giữ semantics
            // cũ: chặn khi target role='admin' (kể cả đang inactive) và không còn admin
            // active khác.
            const r = await pool.query(
                `UPDATE web2_users SET is_active = FALSE, updated_at = $1
             WHERE id = $2
               AND (role IS DISTINCT FROM 'admin'
                    OR EXISTS (SELECT 1 FROM web2_users WHERE role = 'admin' AND is_active = TRUE AND id <> $2))
             RETURNING id`,
                [Date.now(), id]
            );
            if (!r.rows.length) {
                // rowCount=0: phân biệt "không tồn tại" vs "bị guard admin-cuối chặn".
                const ex = await pool.query('SELECT 1 FROM web2_users WHERE id = $1', [id]);
                if (ex.rows.length) {
                    return res.status(400).json({ error: 'Không thể vô hiệu admin cuối cùng' });
                }
                return res.status(404).json({ error: 'Không tìm thấy' });
            }
            await pool.query('DELETE FROM web2_user_sessions WHERE user_id = $1', [id]);
            _notify('deactivate', id);
            _auditUser(req, 'deactivate', id, {});
            res.json({ success: true });
        } catch (e) {
            console.error('[WEB2-USERS] delete error:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    }
);

// ── Hard delete (purge) — xoá VĨNH VIỄN khỏi DB ────────────────────
// Chỉ purge user ĐÃ vô hiệu (is_active=FALSE) → buộc "vô hiệu trước, xoá sau",
// tránh lỡ tay xoá user đang hoạt động. Session cascade theo FK; chỉ web2_user_sessions
// có FK tới web2_users nên không vỡ ràng buộc. Audit log/KPI chỉ lưu id rời (loose) →
// purge không lỗi FK, chấp nhận orphan id (dữ liệu test/đã ngừng dùng).
router.delete(
    '/:id(\\d+)/purge',
    requireWeb2Admin,
    requireWeb2Permission('users', 'delete'),
    async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'DB unavailable' });
        try {
            await ensureTables(pool);
            const id = Number(req.params.id);
            // Chỉ cho purge khi đang inactive → atomic, không cần check riêng.
            const r = await pool.query(
                'DELETE FROM web2_users WHERE id = $1 AND is_active = FALSE RETURNING id, username',
                [id]
            );
            if (!r.rows.length) {
                const ex = await pool.query('SELECT is_active FROM web2_users WHERE id = $1', [id]);
                if (ex.rows.length) {
                    return res.status(400).json({
                        error: 'Phải vô hiệu user trước khi xoá vĩnh viễn',
                    });
                }
                return res.status(404).json({ error: 'Không tìm thấy' });
            }
            // Session cascade theo FK ON DELETE CASCADE; xoá tường minh cho chắc.
            await pool
                .query('DELETE FROM web2_user_sessions WHERE user_id = $1', [id])
                .catch(() => {});
            _notify('purge', id);
            _auditUser(req, 'purge', id, { username: r.rows[0].username });
            res.json({ success: true });
        } catch (e) {
            console.error('[WEB2-USERS] purge error:', e.message);
            res.status(e.status || 500).json({ error: e.message });
        }
    }
);

// ── Login: verify password → issue token ───────────────────────────
router.post('/login', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const ip = _loginClientIp(req);
    if (_loginIsBlocked(ip)) {
        return res.status(429).json({
            error: 'Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau 15 phút.',
        });
    }
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const username = String(b.username || '')
            .trim()
            .toLowerCase();
        const password = String(b.password || '');
        if (!username || !password) {
            return res.status(400).json({ error: 'Thiếu username/password' });
        }
        const r = await pool.query(
            'SELECT * FROM web2_users WHERE username = $1 AND is_active = TRUE',
            [username]
        );
        if (!r.rows.length) {
            _loginRecordFail(ip);
            return res.status(401).json({ error: 'Sai thông tin đăng nhập' });
        }
        const user = r.rows[0];
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
            _loginRecordFail(ip);
            return res.status(401).json({ error: 'Sai thông tin đăng nhập' });
        }
        _loginRecordSuccess(ip);
        const token = crypto.randomBytes(32).toString('hex'); // raw — trả client, KHÔNG lưu
        const tokenHash = hashWeb2Token(token);
        const now = Date.now();
        const ttlMs = tokenTtlFor(user.role); // admin 90d, user 14d
        // C7: lưu HASH trong cả token (PK) lẫn token_hash → DB không có plaintext.
        // Client giữ raw token (localStorage); verify bằng hash(incoming)=token_hash.
        await pool.query(
            `INSERT INTO web2_user_sessions (token, token_hash, user_id, created_at, expires_at)
             VALUES ($1, $1, $2, $3, $4)`,
            [tokenHash, user.id, now, now + ttlMs]
        );
        await pool.query('UPDATE web2_users SET last_login_at = $1 WHERE id = $2', [now, user.id]);
        // Cleanup expired sessions opportunistically (cheap query).
        // Audit #17 (WEB2-FULL-REVIEW-20260620, low): log the swallowed error
        // instead of discarding it so silent cleanup failures stay visible.
        pool.query('DELETE FROM web2_user_sessions WHERE expires_at < $1', [now]).catch((e) =>
            console.warn('[WEB2-USERS] expired session cleanup failed:', e.message)
        );
        res.json({
            success: true,
            token,
            expiresAt: now + TOKEN_TTL_MS,
            user: mapRow(user),
        });
    } catch (e) {
        console.error('[WEB2-USERS] login error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Me: resolve token → user ───────────────────────────────────────
// ── Self-service: đổi avatar CỦA CHÍNH MÌNH (mọi user, KHÔNG cần admin) ──────
// Body: { avatar } — chuỗi JSON cấu hình DiceBear '{"style","seed","bg"}' (hoặc null = bỏ).
// Chỉ update đúng req.web2User.id → user không sửa được avatar người khác.
router.patch('/me/avatar', requireWeb2Auth, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const id = req.web2User && req.web2User.id;
        if (!id) return res.status(401).json({ error: 'Chưa đăng nhập' });
        let avatar = (req.body || {}).avatar;
        if (avatar != null && avatar !== '') {
            avatar = String(avatar).slice(0, 600); // cap; client gửi JSON nhỏ {style,seed,bg}
        } else {
            avatar = null; // reset về initials
        }
        const r = await pool.query(
            `UPDATE web2_users SET avatar = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
            [avatar, Date.now(), id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
        _notify('update-avatar', id);
        res.json({ success: true, user: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-USERS] me/avatar error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

router.get('/me', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const token = String(req.query.token || req.headers['x-web2-token'] || '');
        if (!token) return res.status(401).json({ error: 'Thiếu token' });
        let r;
        try {
            r = await pool.query(
                `SELECT u.* FROM web2_user_sessions s
                    JOIN web2_users u ON u.id = s.user_id
                  WHERE (s.token_hash = $1 OR (s.token_hash IS NULL AND s.token = $2))
                    AND s.expires_at > $3 AND u.is_active = TRUE`,
                [hashWeb2Token(token), token, Date.now()]
            );
        } catch (qe) {
            if (qe && qe.code === '42703') {
                // C7: cột token_hash chưa có (boot window) → verify plaintext.
                r = await pool.query(
                    `SELECT u.* FROM web2_user_sessions s
                        JOIN web2_users u ON u.id = s.user_id
                      WHERE s.token = $1 AND s.expires_at > $2 AND u.is_active = TRUE`,
                    [token, Date.now()]
                );
            } else throw qe;
        }
        if (!r.rows.length) return res.status(401).json({ error: 'Token không hợp lệ/hết hạn' });
        res.json({ success: true, user: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-USERS] me error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Logout: invalidate token ───────────────────────────────────────
router.post('/logout', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        const token = String((req.body || {}).token || req.headers['x-web2-token'] || '');
        if (!token) return res.json({ success: true });
        // C7: xoá session theo hash (session mới) HOẶC plaintext (session cũ).
        await pool.query('DELETE FROM web2_user_sessions WHERE token_hash = $1 OR token = $2', [
            hashWeb2Token(token),
            token,
        ]);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-USERS] logout error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
// Export permission helpers so middleware/web2-auth.js and OTHER web2 routers
// can enforce the SAME granular model server-side without duplicating the
// role-defaults logic (audit WEB2-FULL-REVIEW-20260620 #8/#24 — avoid drift).
// To enforce on a route in another router:
//   const { requireWeb2Permission } = require('./web2-users');
//   router.post('/x', requireWeb2AuthSoft, requireWeb2Permission('<slug>', '<action>'), handler)
router.effectivePermissions = effectivePermissions;
router.userCan = userCan;
router.requireWeb2Permission = requireWeb2Permission;
router.WEB2_PAGES = WEB2_PAGES;
module.exports = router;
