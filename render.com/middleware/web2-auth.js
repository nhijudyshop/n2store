// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 AUTH MIDDLEWARE — token-based, dùng bảng web2_user_sessions.
// TÁCH HOÀN TOÀN khỏi middleware/auth.js (Web 1.0 JWT).
//
// Token resolve order: header `x-web2-token` → query `?token=` → body.token.
// Token do POST /api/web2-users/login cấp (crypto.randomBytes 32 hex), lưu
// web2_user_sessions(token, user_id, expires_at). Frontend gửi qua
// Web2Auth.getStored().token (localStorage 'web2_auth').
//
// requireWeb2Auth  — chỉ cần đăng nhập (any active user).
// requireWeb2Admin — bắt buộc role='admin'.
// Cả 2 gắn req.web2User = row user nếu hợp lệ.
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (web2_user_sessions ở web2Db).
// =====================================================

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

function extractToken(req) {
    return String(
        req.headers['x-web2-token'] ||
            (req.query && req.query.token) ||
            (req.body && req.body.token) ||
            ''
    ).trim();
}

// Resolve token → user row (or null). Trả null nếu thiếu token / token sai / hết hạn.
async function resolveWeb2User(req) {
    const token = extractToken(req);
    if (!token) return null;
    const pool = getPool(req);
    if (!pool) return null;
    const r = await pool.query(
        `SELECT u.* FROM web2_user_sessions s
            JOIN web2_users u ON u.id = s.user_id
          WHERE s.token = $1 AND s.expires_at > $2 AND u.is_active = TRUE`,
        [token, Date.now()]
    );
    return r.rows[0] || null;
}

function requireWeb2Auth(req, res, next) {
    resolveWeb2User(req)
        .then((user) => {
            if (!user) {
                return res
                    .status(401)
                    .json({ success: false, error: 'Cần đăng nhập Web 2.0 (thiếu/sai token)' });
            }
            req.web2User = user;
            next();
        })
        .catch((e) => {
            console.error('[WEB2-AUTH] requireWeb2Auth error:', e.message);
            res.status(500).json({ success: false, error: 'Lỗi xác thực' });
        });
}

function requireWeb2Admin(req, res, next) {
    resolveWeb2User(req)
        .then((user) => {
            if (!user) {
                return res
                    .status(401)
                    .json({ success: false, error: 'Cần đăng nhập Web 2.0 (thiếu/sai token)' });
            }
            if (user.role !== 'admin') {
                return res.status(403).json({ success: false, error: 'Cần quyền admin Web 2.0' });
            }
            req.web2User = user;
            next();
        })
        .catch((e) => {
            console.error('[WEB2-AUTH] requireWeb2Admin error:', e.message);
            res.status(500).json({ success: false, error: 'Lỗi xác thực' });
        });
}

module.exports = { requireWeb2Auth, requireWeb2Admin, resolveWeb2User, extractToken };
