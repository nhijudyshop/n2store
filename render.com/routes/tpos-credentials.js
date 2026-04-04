// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TPOS CREDENTIALS API
// Store/retrieve TPOS account credentials per user per company
// Replaces localStorage + Firestore for TPOS bill credentials
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// GET /api/tpos-credentials?username=xxx&company_id=1
// Load credentials for a user + company
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, company_id = 1 } = req.query;

        if (!username) {
            return res.status(400).json({ success: false, message: 'username is required' });
        }

        const result = await db.query(
            `SELECT auth_type, tpos_username, tpos_password, bearer_token, refresh_token, updated_at
             FROM tpos_credentials
             WHERE username = $1 AND company_id = $2`,
            [username, parseInt(company_id)]
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        const row = result.rows[0];
        res.json({
            success: true,
            data: {
                authType: row.auth_type,
                username: row.tpos_username,
                password: row.tpos_password,
                bearerToken: row.bearer_token,
                refreshToken: row.refresh_token,
                updatedAt: row.updated_at
            }
        });
    } catch (error) {
        console.error('[TPOS-CREDS] Error loading credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// POST /api/tpos-credentials
// Save credentials for a user + company
// Body: { username, companyId, authType, tposUsername, tposPassword, bearerToken, refreshToken }
// =====================================================
router.post('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, companyId = 1, authType, tposUsername, tposPassword, bearerToken, refreshToken } = req.body;

        if (!username) {
            return res.status(400).json({ success: false, message: 'username is required' });
        }

        if (!authType || !['password', 'bearer'].includes(authType)) {
            return res.status(400).json({ success: false, message: 'authType must be "password" or "bearer"' });
        }

        await db.query(
            `INSERT INTO tpos_credentials (username, company_id, auth_type, tpos_username, tpos_password, bearer_token, refresh_token, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (username, company_id) DO UPDATE SET
                auth_type = EXCLUDED.auth_type,
                tpos_username = EXCLUDED.tpos_username,
                tpos_password = EXCLUDED.tpos_password,
                bearer_token = EXCLUDED.bearer_token,
                refresh_token = EXCLUDED.refresh_token,
                updated_at = NOW()`,
            [username, parseInt(companyId), authType, tposUsername || null, tposPassword || null, bearerToken || null, refreshToken || null]
        );

        console.log(`[TPOS-CREDS] Saved credentials for ${username} (company ${companyId}, type: ${authType})`);

        res.json({ success: true, message: 'Credentials saved' });
    } catch (error) {
        console.error('[TPOS-CREDS] Error saving credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// PATCH /api/tpos-credentials/refresh-token
// Update only the refresh_token (called after successful token fetch)
// Body: { username, companyId, refreshToken }
// =====================================================
router.patch('/refresh-token', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, companyId = 1, refreshToken } = req.body;

        if (!username || !refreshToken) {
            return res.status(400).json({ success: false, message: 'username and refreshToken required' });
        }

        const result = await db.query(
            `UPDATE tpos_credentials SET refresh_token = $1, updated_at = NOW()
             WHERE username = $2 AND company_id = $3`,
            [refreshToken, username, parseInt(companyId)]
        );

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
// DELETE /api/tpos-credentials?username=xxx&company_id=1
// Delete credentials for a user + company
// =====================================================
router.delete('/', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        const { username, company_id = 1 } = req.query;

        if (!username) {
            return res.status(400).json({ success: false, message: 'username is required' });
        }

        await db.query(
            `DELETE FROM tpos_credentials WHERE username = $1 AND company_id = $2`,
            [username, parseInt(company_id)]
        );

        console.log(`[TPOS-CREDS] Deleted credentials for ${username} (company ${company_id})`);

        res.json({ success: true, message: 'Credentials deleted' });
    } catch (error) {
        console.error('[TPOS-CREDS] Error deleting credentials:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
