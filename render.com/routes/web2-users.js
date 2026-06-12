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
const { requireWeb2Auth, requireWeb2Admin } = require('../middleware/web2-auth');

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

const ROLES = ['admin', 'manager', 'staff', 'viewer'];
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
        actions: [
            'view',
            'createNcc',
            'editNote',
            'pay',
            'sort',
            'export',
            'expandDetail',
            'loadTpos',
        ],
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

    // ─── Tích hợp ──────────────────────────────────────────────────
    {
        slug: 'tpos-pancake',
        label: 'TPOS × Pancake',
        group: 'Tích hợp',
        actions: ['view', 'syncPancake', 'syncTpos'],
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
        slug: 'admin-sse-monitor',
        label: 'SSE Monitor (Admin)',
        group: 'Hệ thống',
        actions: ['view'],
    },
    {
        slug: 'services-dashboard',
        label: 'Services Dashboard',
        group: 'Hệ thống',
        actions: ['view'],
    },

    // ─── Tính năng mới ─────────────────────────────────────────────
    {
        slug: 'photo-studio',
        label: 'Photo Studio',
        group: 'Tính năng mới',
        actions: ['view'],
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
    loadTpos: 'Load dữ liệu TPOS legacy',
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
    syncTpos: 'Sync TPOS',
    // users
    changePassword: 'Đổi mật khẩu',
    changePermissions: 'Đổi phân quyền',
};

// Role-based default permissions.
const ROLE_DEFAULTS = {
    admin: () => {
        // All actions on all pages
        const out = {};
        for (const p of WEB2_PAGES) out[p.slug] = [...p.actions];
        return out;
    },
    manager: () => {
        // All pages, all actions EXCEPT user delete + changePermissions
        const out = {};
        for (const p of WEB2_PAGES) {
            if (p.slug === 'users') {
                out[p.slug] = p.actions.filter((a) => a !== 'delete' && a !== 'changePermissions');
            } else {
                out[p.slug] = [...p.actions];
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
                out[p.slug] = p.actions.filter((a) => a !== 'delete' && a !== 'cancel');
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

// ── Schema bootstrap ────────────────────────────────────────────────
let tablesReady = false;
async function ensureTables(pool) {
    if (tablesReady) return;
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
        CREATE INDEX IF NOT EXISTS idx_web2_users_username ON web2_users(username);
        CREATE INDEX IF NOT EXISTS idx_web2_users_active   ON web2_users(is_active);

        CREATE TABLE IF NOT EXISTS web2_user_sessions (
            token         VARCHAR(64) PRIMARY KEY,
            user_id       INTEGER NOT NULL REFERENCES web2_users(id) ON DELETE CASCADE,
            created_at    BIGINT NOT NULL,
            expires_at    BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_user ON web2_user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_exp  ON web2_user_sessions(expires_at);
    `);

    // Seed default admin if table is empty.
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_users');
    if (r.rows[0].n === 0) {
        const hash = await bcrypt.hash('admin@@', 10);
        const now = Date.now();
        await pool.query(
            `INSERT INTO web2_users
                (username, password_hash, display_name, role, is_active, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, TRUE, $5, $6, $6)`,
            ['admin', hash, 'Quản trị viên', 'admin', 'Auto-seeded on first boot', now]
        );
        console.log('[WEB2-USERS] Created default admin user (username: admin)');
    }
    tablesReady = true;
}

function mapRow(row) {
    if (!row) return null;
    const customPerms = row.permissions || null;
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        email: row.email || '',
        phone: row.phone || '',
        role: row.role,
        isActive: row.is_active,
        note: row.note || '',
        customPermissions: customPerms, // null if using role defaults
        permissions: effectivePermissions(row.role, customPerms), // resolved final
        lastLoginAt: row.last_login_at ? Number(row.last_login_at) : null,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
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
    if (!/^[a-z0-9_.-]{3,40}$/.test(s)) {
        throw Object.assign(new Error('Username phải 3-40 ký tự, chỉ chứa a-z, 0-9, _ . -'), {
            status: 400,
        });
    }
    return s;
}

function validatePassword(p) {
    if (!p || String(p).length < 8) {
        throw Object.assign(new Error('Mật khẩu phải >= 8 ký tự'), { status: 400 });
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
        res.json({
            success: true,
            users: r.rows.map(mapRow),
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
        res.json({ success: true, user: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-USERS] get error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Create ─────────────────────────────────────────────────────────
router.post('/', requireWeb2Admin, async (req, res) => {
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
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_users
                    (username, password_hash, display_name, email, phone, role, is_active, note, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $8)
                 RETURNING *`,
                [
                    username,
                    hash,
                    displayName,
                    b.email || null,
                    b.phone || null,
                    role,
                    b.note || null,
                    now,
                ]
            );
            _notify('create', r.rows[0].id);
            res.json({ success: true, user: mapRow(r.rows[0]) });
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
router.patch('/:id(\\d+)', requireWeb2Admin, async (req, res) => {
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
        res.json({ success: true, user: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-USERS] update error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Update permissions (admin only) ────────────────────────────────
// body: { permissions: { [slug]: [actions] } | null }
//   null → revert to role defaults
router.put('/:id(\\d+)/permissions', requireWeb2Admin, async (req, res) => {
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
                if (!knownSlugs.has(slug))
                    throw Object.assign(new Error(`Page "${slug}" không tồn tại`), { status: 400 });
                if (!Array.isArray(perms[slug]))
                    throw Object.assign(new Error(`permissions.${slug} phải là array`), {
                        status: 400,
                    });
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
        res.json({ success: true, user: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-USERS] update permissions error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Change password ────────────────────────────────────────────────
router.post('/:id(\\d+)/password', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const id = Number(req.params.id);
        const password = validatePassword((req.body || {}).password);
        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            `UPDATE web2_users SET password_hash = $1, updated_at = $2 WHERE id = $3 RETURNING id`,
            [hash, Date.now(), id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
        // Invalidate all sessions for this user
        await pool.query('DELETE FROM web2_user_sessions WHERE user_id = $1', [id]);
        _notify('change-password', id);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-USERS] change-password error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

// ── Soft delete (deactivate) ───────────────────────────────────────
router.delete('/:id(\\d+)', requireWeb2Admin, async (req, res) => {
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
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-USERS] delete error:', e.message);
        res.status(e.status || 500).json({ error: e.message });
    }
});

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
        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        await pool.query(
            `INSERT INTO web2_user_sessions (token, user_id, created_at, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [token, user.id, now, now + TOKEN_TTL_MS]
        );
        await pool.query('UPDATE web2_users SET last_login_at = $1 WHERE id = $2', [now, user.id]);
        // Cleanup expired sessions opportunistically (cheap query)
        pool.query('DELETE FROM web2_user_sessions WHERE expires_at < $1', [now]).catch(() => {});
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
router.get('/me', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const token = String(req.query.token || req.headers['x-web2-token'] || '');
        if (!token) return res.status(401).json({ error: 'Thiếu token' });
        const r = await pool.query(
            `SELECT u.* FROM web2_user_sessions s
                JOIN web2_users u ON u.id = s.user_id
              WHERE s.token = $1 AND s.expires_at > $2 AND u.is_active = TRUE`,
            [token, Date.now()]
        );
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
        await pool.query('DELETE FROM web2_user_sessions WHERE token = $1', [token]);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-USERS] logout error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
