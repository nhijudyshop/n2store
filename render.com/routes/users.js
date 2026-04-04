// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// USERS API - User Management, Auth, Templates, Settings
// Replaces Firebase Firestore for user management
// =====================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { verifyToken, requireUserMgmt, JWT_SECRET } = require('../middleware/auth');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');

// =====================================================
// HELPERS
// =====================================================

/** Verify PBKDF2 password (CryptoJS 4.1.1 compatibility - SHA256, 1000 iterations, 32 bytes) */
function verifyPBKDF2(password, hash, salt) {
    const computed = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
    return computed === hash;
}

/** Hash password with bcrypt */
async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

/** Generate JWT token */
function generateToken(user, rememberMe = false) {
    const payload = {
        username: user.username,
        isAdmin: user.is_admin,
        roleTemplate: user.role_template,
        detailedPermissions: user.detailed_permissions
    };
    const expiresIn = rememberMe ? '30d' : '8h';
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/** Format user row for API response (never expose password or TOTP secret) */
function formatUser(row) {
    return {
        id: row.username,
        username: row.username,
        displayName: row.display_name,
        identifier: row.identifier || '',
        roleTemplate: row.role_template || 'custom',
        isAdmin: row.is_admin || false,
        detailedPermissions: row.detailed_permissions || {},
        userId: row.user_id || null,
        totpEnabled: row.totp_enabled || false,
        twoFaEnabledAt: row.two_fa_enabled_at || null,
        createdAt: row.created_at,
        createdBy: row.created_by,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by
    };
}

// =====================================================
// AUTH ENDPOINTS
// =====================================================

// POST /login
router.post('/login', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { username, password, rememberMe } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const normalizedUsername = username.trim().toLowerCase();

        const result = await pool.query(
            'SELECT * FROM app_users WHERE username = $1',
            [normalizedUsername]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password based on hash algorithm
        let passwordValid = false;
        if (user.hash_algorithm === 'bcrypt') {
            passwordValid = await bcrypt.compare(password, user.password_hash);
        } else {
            // PBKDF2 (CryptoJS format)
            if (user.salt) {
                passwordValid = verifyPBKDF2(password, user.password_hash, user.salt);
            } else {
                // Plain text fallback (legacy)
                passwordValid = user.password_hash === password;
            }
        }

        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Transparent password upgrade: re-hash PBKDF2 to bcrypt on successful login
        if (user.hash_algorithm !== 'bcrypt') {
            const newHash = await hashPassword(password);
            await pool.query(
                'UPDATE app_users SET password_hash = $1, salt = NULL, hash_algorithm = $2, updated_at = NOW() WHERE username = $3',
                [newHash, 'bcrypt', normalizedUsername]
            );
            console.log(`[USERS] Upgraded password hash for ${normalizedUsername} to bcrypt`);
        }

        // Check if 2FA is enabled
        if (user.totp_enabled && user.totp_secret) {
            // Generate a short-lived temp token (5 min) for 2FA verification step
            const tempToken = jwt.sign(
                { username: normalizedUsername, purpose: '2fa_verify', rememberMe: !!rememberMe },
                JWT_SECRET,
                { expiresIn: '5m' }
            );
            return res.json({
                success: true,
                requires2FA: true,
                tempToken
            });
        }

        // Generate or ensure userId for chat system
        let userId = user.user_id;
        if (!userId) {
            userId = `user_${normalizedUsername}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await pool.query(
                'UPDATE app_users SET user_id = $1, user_id_created_at = NOW() WHERE username = $2',
                [userId, normalizedUsername]
            );
        }

        const token = generateToken(user, rememberMe);

        res.json({
            success: true,
            token,
            user: {
                ...formatUser(user),
                userId
            }
        });

    } catch (error) {
        console.error('[USERS] Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /verify-session
router.post('/verify-session', verifyToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// =====================================================
// USER CRUD ENDPOINTS
// =====================================================

// GET / - List all users
router.get('/', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query(
            `SELECT username, display_name, identifier, role_template, is_admin,
                    detailed_permissions, user_id, created_at, created_by, updated_at, updated_by
             FROM app_users ORDER BY
                CASE WHEN role_template = 'admin' THEN 0 ELSE 1 END,
                display_name`
        );

        res.json({
            success: true,
            users: result.rows.map(formatUser)
        });
    } catch (error) {
        console.error('[USERS] List error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /:username - Get single user
router.get('/:username', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query(
            `SELECT username, display_name, identifier, role_template, is_admin,
                    detailed_permissions, user_id, created_at, created_by, updated_at, updated_by
             FROM app_users WHERE username = $1`,
            [req.params.username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: formatUser(result.rows[0]) });
    } catch (error) {
        console.error('[USERS] Get error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST / - Create user
router.post('/', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { username, password, displayName, identifier, roleTemplate, isAdmin, detailedPermissions } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const normalizedUsername = username.trim().toLowerCase();

        if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
            return res.status(400).json({ error: 'Username only allows lowercase letters, numbers and underscores' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if exists
        const existing = await pool.query('SELECT username FROM app_users WHERE username = $1', [normalizedUsername]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const passwordHash = await hashPassword(password);

        await pool.query(
            `INSERT INTO app_users (username, display_name, identifier, password_hash, hash_algorithm, role_template, is_admin, detailed_permissions, created_by, updated_at)
             VALUES ($1, $2, $3, $4, 'bcrypt', $5, $6, $7, $8, NOW())`,
            [
                normalizedUsername,
                displayName || normalizedUsername.charAt(0).toUpperCase() + normalizedUsername.slice(1),
                identifier || '',
                passwordHash,
                roleTemplate || 'custom',
                isAdmin || false,
                JSON.stringify(detailedPermissions || {}),
                req.user.username
            ]
        );

        res.json({ success: true, message: 'User created', username: normalizedUsername });

    } catch (error) {
        console.error('[USERS] Create error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /:username - Update user
router.put('/:username', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { displayName, identifier, roleTemplate, isAdmin, detailedPermissions, password } = req.body;
        const username = req.params.username;

        // Check user exists
        const existing = await pool.query('SELECT username FROM app_users WHERE username = $1', [username]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        let query, params;

        if (password) {
            const passwordHash = await hashPassword(password);
            query = `UPDATE app_users SET
                display_name = $1, identifier = $2, role_template = $3, is_admin = $4,
                detailed_permissions = $5, password_hash = $6, salt = NULL, hash_algorithm = 'bcrypt',
                updated_at = NOW(), updated_by = $7
                WHERE username = $8`;
            params = [displayName, identifier || '', roleTemplate || 'custom', isAdmin || false,
                      JSON.stringify(detailedPermissions || {}), passwordHash, req.user.username, username];
        } else {
            query = `UPDATE app_users SET
                display_name = $1, identifier = $2, role_template = $3, is_admin = $4,
                detailed_permissions = $5, updated_at = NOW(), updated_by = $6
                WHERE username = $7`;
            params = [displayName, identifier || '', roleTemplate || 'custom', isAdmin || false,
                      JSON.stringify(detailedPermissions || {}), req.user.username, username];
        }

        await pool.query(query, params);

        res.json({ success: true, message: 'User updated' });

    } catch (error) {
        console.error('[USERS] Update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /:username - Delete user
router.delete('/:username', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const username = req.params.username;

        // Check if last admin
        const adminCount = await pool.query("SELECT COUNT(*) FROM app_users WHERE role_template = 'admin'");
        const userToDelete = await pool.query('SELECT role_template FROM app_users WHERE username = $1', [username]);

        if (userToDelete.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userToDelete.rows[0].role_template === 'admin' && parseInt(adminCount.rows[0].count) <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }

        await pool.query('DELETE FROM app_users WHERE username = $1', [username]);

        res.json({ success: true, message: 'User deleted' });

    } catch (error) {
        console.error('[USERS] Delete error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /batch-template - Apply template to multiple users
router.post('/batch-template', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { userIds, templateId, permissions } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'userIds array required' });
        }

        const permissionsJson = JSON.stringify(permissions || {});

        // Use a transaction for batch update
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const userId of userIds) {
                await client.query(
                    `UPDATE app_users SET
                        detailed_permissions = $1, role_template = $2,
                        updated_at = NOW(), updated_by = $3
                     WHERE username = $4`,
                    [permissionsJson, templateId, req.user.username, userId]
                );
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, message: `Template applied to ${userIds.length} users` });

    } catch (error) {
        console.error('[USERS] Batch template error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// =====================================================
// PERMISSION TEMPLATE ENDPOINTS
// =====================================================

// GET /templates - List all templates
router.get('/templates/list', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query('SELECT * FROM permission_templates ORDER BY is_system_default DESC, name');

        res.json({
            success: true,
            templates: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                icon: row.icon,
                color: row.color,
                description: row.description,
                detailedPermissions: row.detailed_permissions || {},
                isSystemDefault: row.is_system_default,
                permissionsVersion: row.permissions_version,
                createdAt: row.created_at,
                createdBy: row.created_by,
                updatedAt: row.updated_at,
                updatedBy: row.updated_by
            }))
        });
    } catch (error) {
        console.error('[USERS] List templates error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /templates - Create template
router.post('/templates', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { id, name, icon, color, description, detailedPermissions, isSystemDefault, permissionsVersion } = req.body;

        if (!id || !name) {
            return res.status(400).json({ error: 'Template id and name required' });
        }

        await pool.query(
            `INSERT INTO permission_templates (id, name, icon, color, description, detailed_permissions, is_system_default, permissions_version, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color,
                description = EXCLUDED.description, detailed_permissions = EXCLUDED.detailed_permissions,
                is_system_default = EXCLUDED.is_system_default, permissions_version = EXCLUDED.permissions_version,
                updated_at = NOW(), updated_by = EXCLUDED.created_by`,
            [id, name, icon || 'sliders', color || '#6366f1', description || '',
             JSON.stringify(detailedPermissions || {}), isSystemDefault || false,
             permissionsVersion || 1, req.user.username]
        );

        res.json({ success: true, message: 'Template saved' });

    } catch (error) {
        console.error('[USERS] Create template error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /templates/:id - Update template
router.put('/templates/:id', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { name, icon, color, description, detailedPermissions, permissionsVersion } = req.body;

        const result = await pool.query(
            `UPDATE permission_templates SET
                name = COALESCE($1, name), icon = COALESCE($2, icon), color = COALESCE($3, color),
                description = COALESCE($4, description), detailed_permissions = COALESCE($5, detailed_permissions),
                permissions_version = COALESCE($6, permissions_version),
                updated_at = NOW(), updated_by = $7
             WHERE id = $8`,
            [name, icon, color, description,
             detailedPermissions ? JSON.stringify(detailedPermissions) : null,
             permissionsVersion, req.user.username, req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true, message: 'Template updated' });

    } catch (error) {
        console.error('[USERS] Update template error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /templates/:id - Delete template
router.delete('/templates/:id', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query('DELETE FROM permission_templates WHERE id = $1', [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true, message: 'Template deleted' });

    } catch (error) {
        console.error('[USERS] Delete template error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// =====================================================
// SETTINGS ENDPOINTS
// =====================================================

// GET /settings/:key
router.get('/settings/:key', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query('SELECT value FROM app_settings WHERE key = $1', [req.params.key]);

        if (result.rows.length === 0) {
            return res.json({ success: true, value: {} });
        }

        res.json({ success: true, value: result.rows[0].value });
    } catch (error) {
        console.error('[USERS] Get settings error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /settings/:key
router.put('/settings/:key', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { value } = req.body;

        await pool.query(
            `INSERT INTO app_settings (key, value, updated_by, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [req.params.key, JSON.stringify(value || {}), req.user.username]
        );

        res.json({ success: true, message: 'Setting saved' });

    } catch (error) {
        console.error('[USERS] Put settings error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// =====================================================
// MIGRATION ENDPOINT (temporary)
// =====================================================

// POST /migrate/bulk - Bulk import from Firebase
router.post('/migrate/bulk', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { users, templates, settings } = req.body;
        let userCount = 0, templateCount = 0, settingCount = 0;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Import users
            if (users && Array.isArray(users)) {
                for (const u of users) {
                    await client.query(
                        `INSERT INTO app_users (username, display_name, identifier, password_hash, salt, hash_algorithm,
                            role_template, is_admin, detailed_permissions, user_id, user_id_created_at, created_at, created_by, updated_at, updated_by)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                         ON CONFLICT (username) DO UPDATE SET
                            display_name = EXCLUDED.display_name, identifier = EXCLUDED.identifier,
                            password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt, hash_algorithm = EXCLUDED.hash_algorithm,
                            role_template = EXCLUDED.role_template, is_admin = EXCLUDED.is_admin,
                            detailed_permissions = EXCLUDED.detailed_permissions, user_id = EXCLUDED.user_id,
                            updated_at = NOW()`,
                        [
                            u.username || u.id,
                            u.displayName || u.display_name || u.username || u.id,
                            u.identifier || '',
                            u.passwordHash || u.password_hash || '',
                            u.salt || null,
                            u.hashAlgorithm || u.hash_algorithm || 'pbkdf2',
                            u.roleTemplate || u.role_template || 'custom',
                            u.isAdmin || u.is_admin || false,
                            JSON.stringify(u.detailedPermissions || u.detailed_permissions || {}),
                            u.userId || u.user_id || null,
                            u.userIdCreatedAt ? new Date(u.userIdCreatedAt) : null,
                            u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000) : (u.createdAt ? new Date(u.createdAt) : new Date()),
                            u.createdBy || u.created_by || 'migration',
                            new Date(),
                            'migration'
                        ]
                    );
                    userCount++;
                }
            }

            // Import templates
            if (templates && Array.isArray(templates)) {
                for (const t of templates) {
                    await client.query(
                        `INSERT INTO permission_templates (id, name, icon, color, description, detailed_permissions, is_system_default, permissions_version, created_by)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color,
                            description = EXCLUDED.description, detailed_permissions = EXCLUDED.detailed_permissions,
                            is_system_default = EXCLUDED.is_system_default, permissions_version = EXCLUDED.permissions_version,
                            updated_at = NOW()`,
                        [
                            t.id,
                            t.name || t.id,
                            t.icon || 'sliders',
                            t.color || '#6366f1',
                            t.description || '',
                            JSON.stringify(t.detailedPermissions || t.detailed_permissions || {}),
                            t.isSystemDefault || t.is_system_default || false,
                            t.permissionsVersion || t.permissions_version || 1,
                            'migration'
                        ]
                    );
                    templateCount++;
                }
            }

            // Import settings
            if (settings && typeof settings === 'object') {
                for (const [key, value] of Object.entries(settings)) {
                    await client.query(
                        `INSERT INTO app_settings (key, value, updated_by, updated_at)
                         VALUES ($1, $2, 'migration', NOW())
                         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                        [key, JSON.stringify(value)]
                    );
                    settingCount++;
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({
            success: true,
            message: `Migration complete: ${userCount} users, ${templateCount} templates, ${settingCount} settings`
        });

    } catch (error) {
        console.error('[USERS] Migration error:', error);
        res.status(500).json({ error: 'Migration failed: ' + error.message });
    }
});

// =====================================================
// 2FA (TOTP) ENDPOINTS
// =====================================================

/** Verify TOTP code against secret */
function verifyTOTP(secret, token) {
    const totp = new OTPAuth.TOTP({
        issuer: 'N2Store',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret)
    });
    // Allow 1 step window (±30s) for clock drift
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
}

// POST /login/verify-totp - Verify TOTP after password login
router.post('/login/verify-totp', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { tempToken, totpCode } = req.body;

        if (!tempToken || !totpCode) {
            return res.status(400).json({ error: 'tempToken and totpCode required' });
        }

        // Verify temp token
        let decoded;
        try {
            decoded = jwt.verify(tempToken, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Token expired or invalid. Please login again.' });
        }

        if (decoded.purpose !== '2fa_verify') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        const username = decoded.username;
        const rememberMe = decoded.rememberMe;

        // Get user
        const result = await pool.query('SELECT * FROM app_users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        const code = totpCode.replace(/\s/g, '');

        // Try TOTP verification
        let verified = false;
        if (code.length === 6 && verifyTOTP(user.totp_secret, code)) {
            verified = true;
        }

        // Try backup codes if TOTP failed
        if (!verified && user.totp_backup_codes && Array.isArray(user.totp_backup_codes)) {
            const backupIndex = user.totp_backup_codes.findIndex(bc => bc === code);
            if (backupIndex !== -1) {
                verified = true;
                // Remove used backup code
                const updatedCodes = [...user.totp_backup_codes];
                updatedCodes.splice(backupIndex, 1);
                await pool.query(
                    'UPDATE app_users SET totp_backup_codes = $1 WHERE username = $2',
                    [updatedCodes, username]
                );
                console.log(`[2FA] Backup code used by ${username}. ${updatedCodes.length} remaining.`);
            }
        }

        if (!verified) {
            return res.status(401).json({ error: 'Invalid verification code' });
        }

        // Generate userId if missing
        let userId = user.user_id;
        if (!userId) {
            userId = `user_${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await pool.query(
                'UPDATE app_users SET user_id = $1, user_id_created_at = NOW() WHERE username = $2',
                [userId, username]
            );
        }

        const token = generateToken(user, rememberMe);

        res.json({
            success: true,
            token,
            user: {
                ...formatUser(user),
                userId
            }
        });

    } catch (error) {
        console.error('[2FA] TOTP verify error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /2fa/setup - Start 2FA setup (returns QR code)
router.post('/2fa/setup', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const username = req.user.username;

        // Check if already enabled
        const result = await pool.query('SELECT totp_enabled FROM app_users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (result.rows[0].totp_enabled) {
            return res.status(400).json({ error: '2FA is already enabled. Disable first to re-setup.' });
        }

        // Generate new TOTP secret
        const secret = new OTPAuth.Secret({ size: 20 });
        const totp = new OTPAuth.TOTP({
            issuer: 'N2Store',
            label: username,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret
        });

        const otpauthUrl = totp.toString();
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        // Store secret temporarily (not enabled yet until verify-setup)
        await pool.query(
            'UPDATE app_users SET totp_secret = $1 WHERE username = $2',
            [secret.base32, username]
        );

        res.json({
            success: true,
            qrCode: qrCodeDataUrl,
            secret: secret.base32,
            otpauthUrl
        });

    } catch (error) {
        console.error('[2FA] Setup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /2fa/verify-setup - Confirm 2FA setup with a TOTP code
router.post('/2fa/verify-setup', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const username = req.user.username;
        const { totpCode } = req.body;

        if (!totpCode) {
            return res.status(400).json({ error: 'TOTP code required' });
        }

        // Get user's pending secret
        const result = await pool.query(
            'SELECT totp_secret, totp_enabled FROM app_users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        if (!user.totp_secret) {
            return res.status(400).json({ error: 'No 2FA setup in progress. Call /2fa/setup first.' });
        }

        if (user.totp_enabled) {
            return res.status(400).json({ error: '2FA is already enabled' });
        }

        // Verify the code
        const code = totpCode.replace(/\s/g, '');
        if (!verifyTOTP(user.totp_secret, code)) {
            return res.status(400).json({ error: 'Invalid code. Please try again.' });
        }

        // Generate 10 backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex'));
        }

        // Enable 2FA
        await pool.query(
            `UPDATE app_users SET totp_enabled = true, totp_backup_codes = $1, two_fa_enabled_at = NOW(), updated_at = NOW() WHERE username = $2`,
            [backupCodes, username]
        );

        console.log(`[2FA] Enabled for user: ${username}`);

        res.json({
            success: true,
            message: '2FA enabled successfully',
            backupCodes
        });

    } catch (error) {
        console.error('[2FA] Verify setup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /2fa/disable - Disable 2FA (requires current TOTP code)
router.post('/2fa/disable', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const username = req.user.username;
        const { totpCode } = req.body;

        if (!totpCode) {
            return res.status(400).json({ error: 'TOTP code required to disable 2FA' });
        }

        const result = await pool.query(
            'SELECT totp_secret, totp_enabled FROM app_users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        if (!user.totp_enabled) {
            return res.status(400).json({ error: '2FA is not enabled' });
        }

        // Verify the code
        const code = totpCode.replace(/\s/g, '');
        if (!verifyTOTP(user.totp_secret, code)) {
            return res.status(401).json({ error: 'Invalid code' });
        }

        // Disable 2FA
        await pool.query(
            'UPDATE app_users SET totp_enabled = false, totp_secret = NULL, totp_backup_codes = NULL, two_fa_enabled_at = NULL, updated_at = NOW() WHERE username = $1',
            [username]
        );

        console.log(`[2FA] Disabled for user: ${username}`);

        res.json({ success: true, message: '2FA disabled successfully' });

    } catch (error) {
        console.error('[2FA] Disable error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /2fa/reset - Admin resets 2FA for another user
router.post('/2fa/reset', verifyToken, requireUserMgmt, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        await pool.query(
            'UPDATE app_users SET totp_enabled = false, totp_secret = NULL, totp_backup_codes = NULL, two_fa_enabled_at = NULL, updated_at = NOW() WHERE username = $1',
            [username.trim().toLowerCase()]
        );

        console.log(`[2FA] Admin ${req.user.username} reset 2FA for user: ${username}`);

        res.json({ success: true, message: `2FA reset for ${username}` });

    } catch (error) {
        console.error('[2FA] Reset error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /2fa/status - Get current user's 2FA status
router.get('/2fa/status', verifyToken, async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const result = await pool.query(
            'SELECT totp_enabled, two_fa_enabled_at, totp_backup_codes FROM app_users WHERE username = $1',
            [req.user.username]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        res.json({
            enabled: user.totp_enabled || false,
            enabledAt: user.two_fa_enabled_at,
            backupCodesRemaining: user.totp_backup_codes ? user.totp_backup_codes.length : 0
        });

    } catch (error) {
        console.error('[2FA] Status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
