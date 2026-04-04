// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'n2store-jwt-secret-2026';

function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token required' });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function requireUserMgmt(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin bypass
    if (req.user.isAdmin || req.user.roleTemplate === 'admin') {
        return next();
    }

    // Check user-management permission
    const perms = req.user.detailedPermissions;
    if (perms && perms['user-management']) {
        const hasAccess = Object.values(perms['user-management']).some(v => v === true);
        if (hasAccess) return next();
    }

    return res.status(403).json({ error: 'User management permission required' });
}

module.exports = { verifyToken, requireUserMgmt, JWT_SECRET };
