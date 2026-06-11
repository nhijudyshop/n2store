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
// requireWeb2Auth     — chỉ cần đăng nhập (any active user).
// requireWeb2Admin    — bắt buộc role='admin'.
// requireWeb2AuthSoft — gate MỀM: resolve user nếu có token; thiếu/sai token chỉ
//                       chặn 401 khi env WEB2_AUTH_ENFORCE === '1', ngược lại
//                       console.warn rồi cho qua (transition: frontend chưa gửi token).
// Cả 3 gắn req.web2User = row user nếu hợp lệ.
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

// Warn throttle — soft mode hit liên tục từ frontend chưa gửi token → chỉ warn
// 1 lần / route / SOFT_WARN_INTERVAL_MS, tránh spam Render logs.
const SOFT_WARN_INTERVAL_MS = 60 * 1000;
const _softWarnLast = new Map(); // "METHOD path" → last warn ts

function _softWarn(req) {
    const key = `${req.method} ${(req.baseUrl || '') + (req.route?.path || req.path || '')}`;
    const now = Date.now();
    if (now - (_softWarnLast.get(key) || 0) < SOFT_WARN_INTERVAL_MS) return;
    if (_softWarnLast.size > 500) _softWarnLast.clear(); // bound memory
    _softWarnLast.set(key, now);
    console.warn(`[WEB2-AUTH][SOFT] unauthenticated ${req.method} ${req.originalUrl || req.path}`);
}

// Gate MỀM — dùng cho route mà trang frontend đang gọi nhưng CHƯA gửi x-web2-token.
// Có token hợp lệ → gắn req.web2User. Thiếu/sai token → chỉ 401 khi
// WEB2_AUTH_ENFORCE === '1'; ngược lại warn (throttled) rồi next() (sau này bật env là khoá).
function requireWeb2AuthSoft(req, res, next) {
    const enforce = process.env.WEB2_AUTH_ENFORCE === '1';
    resolveWeb2User(req)
        .then((user) => {
            if (user) {
                req.web2User = user;
                return next();
            }
            if (enforce) {
                return res
                    .status(401)
                    .json({ success: false, error: 'Cần đăng nhập Web 2.0 (thiếu/sai token)' });
            }
            _softWarn(req);
            next();
        })
        .catch((e) => {
            console.error('[WEB2-AUTH] requireWeb2AuthSoft error:', e.message);
            if (enforce) {
                return res.status(500).json({ success: false, error: 'Lỗi xác thực' });
            }
            next();
        });
}

module.exports = {
    requireWeb2Auth,
    requireWeb2Admin,
    requireWeb2AuthSoft,
    resolveWeb2User,
    extractToken,
};
