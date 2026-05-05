// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TPOS CREDENTIALS API — multi-account version
// Mỗi (username + company_id) có thể có NHIỀU account, một trong số đó
// được đánh dấu `is_active=true` (= active account dùng mặc định).
// Backwards compat: GET /api/tpos-credentials (không truyền label) trả
// về active account (giữ shape cũ).
// =====================================================

const express = require('express');
const router = express.Router();

let _migrationDone = false;
async function ensureSchema(db) {
    if (_migrationDone) return;
    try {
        // Idempotent migration: thêm cột account_label + is_active
        await db.query(
            `ALTER TABLE tpos_credentials ADD COLUMN IF NOT EXISTS account_label TEXT NOT NULL DEFAULT 'Mặc định'`
        );
        await db.query(
            `ALTER TABLE tpos_credentials ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`
        );

        // Đổi PK: cũ (username, company_id) → mới (username, company_id, account_label)
        // Chỉ chạy nếu PK cũ vẫn còn
        const pkInfo = await db.query(`
            SELECT a.attname AS column_name
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'tpos_credentials'::regclass AND i.indisprimary
            ORDER BY array_position(i.indkey, a.attnum)
        `);
        const pkCols = pkInfo.rows.map((r) => r.column_name);
        const isOldPk =
            pkCols.length === 2 && pkCols[0] === 'username' && pkCols[1] === 'company_id';
        if (isOldPk) {
            await db.query(
                `ALTER TABLE tpos_credentials DROP CONSTRAINT IF EXISTS tpos_credentials_pkey`
            );
            await db.query(
                `ALTER TABLE tpos_credentials ADD PRIMARY KEY (username, company_id, account_label)`
            );
            console.log('[TPOS-CREDS] Migrated PK to (username, company_id, account_label)');
        }
        _migrationDone = true;
    } catch (err) {
        console.error('[TPOS-CREDS] Schema migration error:', err.message);
        // Don't block requests if migration fails — just log and continue.
    }
}

router.use(async (req, res, next) => {
    const db = req.app.locals.chatDb;
    if (db) await ensureSchema(db);
    next();
});

// =====================================================
// Helpers
// =====================================================
function rowToAccount(row) {
    return {
        label: row.account_label,
        authType: row.auth_type,
        username: row.tpos_username,
        password: row.tpos_password,
        bearerToken: row.bearer_token,
        refreshToken: row.refresh_token,
        isActive: !!row.is_active,
        updatedAt: row.updated_at,
    };
}

// =====================================================
// GET /api/tpos-credentials/list?username=xxx&company_id=1
// Trả về toàn bộ accounts của user
// =====================================================
router.get('/list', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, company_id = 1 } = req.query;
        if (!username)
            return res.status(400).json({ success: false, message: 'username is required' });

        const result = await db.query(
            `SELECT account_label, auth_type, tpos_username, tpos_password, bearer_token, refresh_token, is_active, updated_at
             FROM tpos_credentials
             WHERE username = $1 AND company_id = $2
             ORDER BY is_active DESC, account_label ASC`,
            [username, parseInt(company_id)]
        );

        res.json({ success: true, data: result.rows.map(rowToAccount) });
    } catch (error) {
        console.error('[TPOS-CREDS] Error listing credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// GET /api/tpos-credentials?username=xxx&company_id=1[&label=xxx]
// Không có label → active account; có label → account đó.
// Backwards compat: shape cũ { authType, username, password, ... }
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, company_id = 1, label } = req.query;
        if (!username)
            return res.status(400).json({ success: false, message: 'username is required' });

        let result;
        if (label) {
            result = await db.query(
                `SELECT account_label, auth_type, tpos_username, tpos_password, bearer_token, refresh_token, is_active, updated_at
                 FROM tpos_credentials
                 WHERE username = $1 AND company_id = $2 AND account_label = $3`,
                [username, parseInt(company_id), label]
            );
        } else {
            result = await db.query(
                `SELECT account_label, auth_type, tpos_username, tpos_password, bearer_token, refresh_token, is_active, updated_at
                 FROM tpos_credentials
                 WHERE username = $1 AND company_id = $2 AND is_active = TRUE
                 LIMIT 1`,
                [username, parseInt(company_id)]
            );
            if (result.rows.length === 0) {
                // Fallback: nếu chưa có row is_active, lấy row đầu tiên
                result = await db.query(
                    `SELECT account_label, auth_type, tpos_username, tpos_password, bearer_token, refresh_token, is_active, updated_at
                     FROM tpos_credentials
                     WHERE username = $1 AND company_id = $2
                     ORDER BY updated_at DESC
                     LIMIT 1`,
                    [username, parseInt(company_id)]
                );
            }
        }

        if (result.rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        const acc = rowToAccount(result.rows[0]);
        res.json({ success: true, data: acc });
    } catch (error) {
        console.error('[TPOS-CREDS] Error loading credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// POST /api/tpos-credentials
// Body: { username, companyId, label?, authType, tposUsername, tposPassword,
//          bearerToken, refreshToken, setActive? }
// Tạo / cập nhật 1 account. setActive=true → đánh dấu active (clear cờ
// trên các account khác cùng user+company).
// Backwards compat: nếu thiếu label → label = 'Mặc định' và setActive mặc định true
// nếu chưa có account nào.
// =====================================================
router.post('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const {
            username,
            companyId = 1,
            label,
            authType,
            tposUsername,
            tposPassword,
            bearerToken,
            refreshToken,
            setActive,
        } = req.body;

        if (!username)
            return res.status(400).json({ success: false, message: 'username is required' });
        if (!authType || !['password', 'bearer'].includes(authType)) {
            return res
                .status(400)
                .json({ success: false, message: 'authType must be "password" or "bearer"' });
        }

        const accountLabel = (label || 'Mặc định').toString().trim() || 'Mặc định';

        // Đếm xem đã có account nào chưa
        const countResult = await db.query(
            `SELECT COUNT(*)::int AS n FROM tpos_credentials WHERE username = $1 AND company_id = $2`,
            [username, parseInt(companyId)]
        );
        const isFirstAccount = countResult.rows[0].n === 0;
        const shouldSetActive = setActive === true || isFirstAccount;

        await db.query(
            `INSERT INTO tpos_credentials
                (username, company_id, account_label, auth_type, tpos_username, tpos_password,
                 bearer_token, refresh_token, is_active, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (username, company_id, account_label) DO UPDATE SET
                auth_type = EXCLUDED.auth_type,
                tpos_username = EXCLUDED.tpos_username,
                tpos_password = EXCLUDED.tpos_password,
                bearer_token = EXCLUDED.bearer_token,
                refresh_token = COALESCE(EXCLUDED.refresh_token, tpos_credentials.refresh_token),
                is_active = CASE WHEN $9 THEN TRUE ELSE tpos_credentials.is_active END,
                updated_at = NOW()`,
            [
                username,
                parseInt(companyId),
                accountLabel,
                authType,
                tposUsername || null,
                tposPassword || null,
                bearerToken || null,
                refreshToken || null,
                shouldSetActive,
            ]
        );

        if (shouldSetActive) {
            // Clear is_active trên các account khác
            await db.query(
                `UPDATE tpos_credentials
                 SET is_active = FALSE
                 WHERE username = $1 AND company_id = $2 AND account_label <> $3`,
                [username, parseInt(companyId), accountLabel]
            );
        }

        res.json({
            success: true,
            message: 'Credentials saved',
            label: accountLabel,
            isActive: shouldSetActive,
        });
    } catch (error) {
        console.error('[TPOS-CREDS] Error saving credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// PUT /api/tpos-credentials/active
// Body: { username, companyId, label }
// Đánh dấu account label làm active.
// =====================================================
router.put('/active', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, companyId = 1, label } = req.body;
        if (!username || !label) {
            return res.status(400).json({ success: false, message: 'username and label required' });
        }

        const upd = await db.query(
            `UPDATE tpos_credentials
             SET is_active = TRUE, updated_at = NOW()
             WHERE username = $1 AND company_id = $2 AND account_label = $3`,
            [username, parseInt(companyId), label]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Account not found' });
        }
        await db.query(
            `UPDATE tpos_credentials
             SET is_active = FALSE
             WHERE username = $1 AND company_id = $2 AND account_label <> $3`,
            [username, parseInt(companyId), label]
        );
        res.json({ success: true, label });
    } catch (error) {
        console.error('[TPOS-CREDS] Error switching active account:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// PATCH /api/tpos-credentials/refresh-token
// Body: { username, companyId, refreshToken, label? }
// Update refresh_token (gọi sau khi fetch token thành công).
// Nếu không truyền label → cập nhật cho active account.
// =====================================================
router.patch('/refresh-token', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, companyId = 1, refreshToken, label } = req.body;
        if (!username || !refreshToken) {
            return res
                .status(400)
                .json({ success: false, message: 'username and refreshToken required' });
        }

        let result;
        if (label) {
            result = await db.query(
                `UPDATE tpos_credentials SET refresh_token = $1, updated_at = NOW()
                 WHERE username = $2 AND company_id = $3 AND account_label = $4`,
                [refreshToken, username, parseInt(companyId), label]
            );
        } else {
            result = await db.query(
                `UPDATE tpos_credentials SET refresh_token = $1, updated_at = NOW()
                 WHERE username = $2 AND company_id = $3 AND is_active = TRUE`,
                [refreshToken, username, parseInt(companyId)]
            );
        }

        if (result.rowCount === 0) {
            return res.json({ success: false, message: 'No credentials found to update' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[TPOS-CREDS] Error updating refresh token:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// DELETE /api/tpos-credentials?username=xxx&company_id=1[&label=xxx]
// Không có label → xóa toàn bộ accounts (giữ behavior cũ)
// Có label → xóa 1 account. Nếu xóa active account, promote account khác (nếu có).
// =====================================================
router.delete('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, company_id = 1, label } = req.query;
        if (!username)
            return res.status(400).json({ success: false, message: 'username is required' });

        if (label) {
            const wasActive = await db.query(
                `SELECT is_active FROM tpos_credentials
                 WHERE username = $1 AND company_id = $2 AND account_label = $3`,
                [username, parseInt(company_id), label]
            );
            const isActive = wasActive.rows[0]?.is_active === true;

            await db.query(
                `DELETE FROM tpos_credentials
                 WHERE username = $1 AND company_id = $2 AND account_label = $3`,
                [username, parseInt(company_id), label]
            );

            if (isActive) {
                // Promote account khác làm active (nếu có)
                await db.query(
                    `UPDATE tpos_credentials
                     SET is_active = TRUE
                     WHERE (username, company_id, account_label) = (
                         SELECT username, company_id, account_label
                         FROM tpos_credentials
                         WHERE username = $1 AND company_id = $2
                         ORDER BY updated_at DESC
                         LIMIT 1
                     )`,
                    [username, parseInt(company_id)]
                );
            }
        } else {
            await db.query(`DELETE FROM tpos_credentials WHERE username = $1 AND company_id = $2`, [
                username,
                parseInt(company_id),
            ]);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[TPOS-CREDS] Error deleting credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
