// =====================================================
// ATTENDANCE REST API
// Replaces Firestore: attendance_* collections
// Used by soquy/attendance module for payroll/timekeeping
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// AUTO-CREATE TABLES ON FIRST REQUEST
// =====================================================

let _tablesCreated = false;

async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendance_device_users (
                user_id VARCHAR(20) PRIMARY KEY,
                uid VARCHAR(20),
                name VARCHAR(255),
                display_name VARCHAR(255),
                role INTEGER DEFAULT 0,
                daily_rate INTEGER DEFAULT 200000,
                work_start INTEGER DEFAULT 8,
                work_end INTEGER DEFAULT 20,
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS attendance_records (
                id VARCHAR(100) PRIMARY KEY,
                device_user_id VARCHAR(20) NOT NULL,
                check_time TIMESTAMPTZ NOT NULL,
                date_key VARCHAR(10) NOT NULL,
                type INTEGER DEFAULT 0,
                source VARCHAR(20) DEFAULT 'device',
                synced_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_att_records_date_key ON attendance_records(date_key);
            CREATE INDEX IF NOT EXISTS idx_att_records_user_date ON attendance_records(device_user_id, date_key);

            CREATE TABLE IF NOT EXISTS attendance_payroll (
                id VARCHAR(50) PRIMARY KEY,
                emp_id VARCHAR(20) NOT NULL,
                month_key VARCHAR(7) NOT NULL,
                thuong_items JSONB DEFAULT '[]',
                giam_tru_items JSONB DEFAULT '[]',
                da_tra_items JSONB DEFAULT '[]',
                allowances JSONB DEFAULT '[]',
                ghi_chu TEXT DEFAULT '',
                salary_days_override JSONB,
                ot_hours_override JSONB,
                giam_tru_late_override INTEGER,
                giam_tru_note TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_att_payroll_month ON attendance_payroll(month_key);

            CREATE TABLE IF NOT EXISTS attendance_fullday (
                id VARCHAR(50) PRIMARY KEY,
                emp_id VARCHAR(20) NOT NULL,
                date_key VARCHAR(10) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS attendance_allowances (
                id VARCHAR(50) PRIMARY KEY,
                emp_id VARCHAR(20) NOT NULL,
                month_key VARCHAR(7) NOT NULL,
                amount INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_att_allowances_month ON attendance_allowances(month_key);

            CREATE TABLE IF NOT EXISTS attendance_sync_status (
                id VARCHAR(20) PRIMARY KEY DEFAULT 'current',
                connected BOOLEAN DEFAULT FALSE,
                last_sync_time TIMESTAMP,
                last_error TEXT,
                updated_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS attendance_commands (
                id SERIAL PRIMARY KEY,
                action VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                employee_name VARCHAR(255),
                device_user_id VARCHAR(20),
                created_by VARCHAR(50) DEFAULT 'web_admin',
                result TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                processed_at TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_att_commands_status ON attendance_commands(status);
        `);
        _tablesCreated = true;
        console.log('[ATTENDANCE] Tables created/verified');
    } catch (error) {
        console.error('[ATTENDANCE] Table creation error:', error.message);
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

router.use(async (req, res, next) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    await ensureTables(pool);
    req.pool = pool;
    next();
});

// =====================================================
// DEVICE USERS (employees)
// =====================================================

/** GET /device-users — List all employees */
router.get('/device-users', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM attendance_device_users ORDER BY user_id');
        res.json({ success: true, rows: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /device-users error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** POST /device-users/bulk — Bulk upsert from sync service */
router.post('/device-users/bulk', async (req, res) => {
    try {
        const { users } = req.body;
        if (!Array.isArray(users) || !users.length) {
            return res.json({ success: true, count: 0 });
        }
        let count = 0;
        for (const u of users) {
            if (!u.user_id) continue;
            await req.pool.query(`
                INSERT INTO attendance_device_users (user_id, uid, name, role, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    uid = COALESCE(EXCLUDED.uid, attendance_device_users.uid),
                    name = COALESCE(EXCLUDED.name, attendance_device_users.name),
                    role = COALESCE(EXCLUDED.role, attendance_device_users.role),
                    updated_at = NOW()
            `, [u.user_id, u.uid || '', u.name || '', u.role || 0]);
            count++;
        }
        res.json({ success: true, count });
    } catch (error) {
        console.error('[ATTENDANCE] POST /device-users/bulk error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** PATCH /device-users/:userId — Update employee fields */
router.patch('/device-users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const fields = req.body;
        const allowed = ['display_name', 'daily_rate', 'work_start', 'work_end'];
        const sets = [];
        const vals = [];
        let i = 1;
        for (const [key, val] of Object.entries(fields)) {
            if (allowed.includes(key)) {
                sets.push(`${key} = $${i}`);
                vals.push(val);
                i++;
            }
        }
        if (!sets.length) return res.status(400).json({ error: 'No valid fields' });
        sets.push(`updated_at = NOW()`);
        vals.push(userId);
        await req.pool.query(
            `UPDATE attendance_device_users SET ${sets.join(', ')} WHERE user_id = $${i}`,
            vals
        );
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] PATCH /device-users error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// RECORDS (attendance check-in/out)
// =====================================================

/** GET /records?start=YYYY-MM-DD&end=YYYY-MM-DD — Records by date range */
router.get('/records', async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) return res.status(400).json({ error: 'start and end required' });
        const result = await req.pool.query(
            'SELECT * FROM attendance_records WHERE date_key >= $1 AND date_key <= $2 ORDER BY check_time',
            [start, end]
        );
        res.json({ success: true, rows: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /records error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** POST /records/bulk — Bulk upsert from sync service */
router.post('/records/bulk', async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records) || !records.length) {
            return res.json({ success: true, count: 0 });
        }
        // Batch insert with ON CONFLICT
        const client = await req.pool.connect();
        try {
            await client.query('BEGIN');
            let count = 0;
            for (const r of records) {
                if (!r.id || !r.device_user_id) continue;
                await client.query(`
                    INSERT INTO attendance_records (id, device_user_id, check_time, date_key, type, source, synced_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        check_time = EXCLUDED.check_time,
                        date_key = EXCLUDED.date_key,
                        type = EXCLUDED.type,
                        synced_at = NOW()
                `, [r.id, r.device_user_id, r.check_time, r.date_key, r.type || 0, r.source || 'device']);
                count++;
            }
            await client.query('COMMIT');
            res.json({ success: true, count });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[ATTENDANCE] POST /records/bulk error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** POST /records — Add single record (manual edit) */
router.post('/records', async (req, res) => {
    try {
        const { device_user_id, check_time, date_key, type, source } = req.body;
        if (!device_user_id || !check_time || !date_key) {
            return res.status(400).json({ error: 'device_user_id, check_time, date_key required' });
        }
        const id = `${device_user_id}_${new Date(check_time).getTime()}`;
        await req.pool.query(`
            INSERT INTO attendance_records (id, device_user_id, check_time, date_key, type, source, synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (id) DO UPDATE SET check_time = EXCLUDED.check_time, type = EXCLUDED.type, synced_at = NOW()
        `, [id, device_user_id, check_time, date_key, type || 0, source || 'manual_edit']);
        res.json({ success: true, id });
    } catch (error) {
        console.error('[ATTENDANCE] POST /records error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /records/:id — Delete single record */
router.delete('/records/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM attendance_records WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] DELETE /records error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PAYROLL (monthly payroll data)
// =====================================================

/** GET /payroll?monthKey=YYYY-MM — Get payroll for a month */
router.get('/payroll', async (req, res) => {
    try {
        const { monthKey } = req.query;
        if (!monthKey) return res.status(400).json({ error: 'monthKey required' });
        const result = await req.pool.query(
            'SELECT * FROM attendance_payroll WHERE month_key = $1',
            [monthKey]
        );
        res.json({ success: true, rows: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /payroll error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** PUT /payroll/:docId — Upsert payroll (merge semantics) */
router.put('/payroll/:docId', async (req, res) => {
    try {
        const { docId } = req.params;
        const body = req.body;
        const empId = body.empId || body.emp_id || docId.split('_')[0];
        const monthKey = body.monthKey || body.month_key || docId.substring(docId.indexOf('_') + 1);

        // Build merge: only update provided fields
        await req.pool.query(`
            INSERT INTO attendance_payroll (id, emp_id, month_key, thuong_items, giam_tru_items, da_tra_items, allowances, ghi_chu, salary_days_override, ot_hours_override, giam_tru_late_override, giam_tru_note, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT (id) DO UPDATE SET
                thuong_items = COALESCE($4, attendance_payroll.thuong_items),
                giam_tru_items = COALESCE($5, attendance_payroll.giam_tru_items),
                da_tra_items = COALESCE($6, attendance_payroll.da_tra_items),
                allowances = COALESCE($7, attendance_payroll.allowances),
                ghi_chu = COALESCE($8, attendance_payroll.ghi_chu),
                salary_days_override = CASE WHEN $13 THEN $9 ELSE attendance_payroll.salary_days_override END,
                ot_hours_override = CASE WHEN $14 THEN $10 ELSE attendance_payroll.ot_hours_override END,
                giam_tru_late_override = CASE WHEN $15 THEN $11 ELSE attendance_payroll.giam_tru_late_override END,
                giam_tru_note = CASE WHEN $16 THEN $12 ELSE attendance_payroll.giam_tru_note END,
                updated_at = NOW()
        `, [
            docId, empId, monthKey,
            body.thuongItems !== undefined ? JSON.stringify(body.thuongItems) : null,
            body.giamTruItems !== undefined ? JSON.stringify(body.giamTruItems) : null,
            body.daTraItems !== undefined ? JSON.stringify(body.daTraItems) : null,
            body.allowances !== undefined ? JSON.stringify(body.allowances) : null,
            body.ghiChu !== undefined ? body.ghiChu : null,
            body.salaryDaysOverride !== undefined ? JSON.stringify(body.salaryDaysOverride) : null,
            body.otHoursOverride !== undefined ? JSON.stringify(body.otHoursOverride) : null,
            body.giamTruLateOverride !== undefined ? body.giamTruLateOverride : null,
            body.giamTruNote !== undefined ? body.giamTruNote : null,
            // Boolean flags: was this field provided?
            body.salaryDaysOverride !== undefined,
            body.otHoursOverride !== undefined,
            body.giamTruLateOverride !== undefined,
            body.giamTruNote !== undefined,
        ]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] PUT /payroll error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// FULLDAY OVERRIDES
// =====================================================

/** GET /fullday — Get all fullday overrides */
router.get('/fullday', async (req, res) => {
    try {
        const result = await req.pool.query('SELECT * FROM attendance_fullday');
        res.json({ success: true, rows: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /fullday error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** POST /fullday/:id — Create fullday override */
router.post('/fullday/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const parts = id.split('_');
        const empId = parts[0];
        const dateKey = parts.slice(1).join('-');
        await req.pool.query(`
            INSERT INTO attendance_fullday (id, emp_id, date_key, created_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (id) DO NOTHING
        `, [id, empId, dateKey]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] POST /fullday error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /fullday/:id — Delete fullday override */
router.delete('/fullday/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM attendance_fullday WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] DELETE /fullday error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ALLOWANCES (legacy per-month)
// =====================================================

/** GET /allowances?monthKey=YYYY-MM */
router.get('/allowances', async (req, res) => {
    try {
        const { monthKey } = req.query;
        if (!monthKey) return res.status(400).json({ error: 'monthKey required' });
        const result = await req.pool.query(
            'SELECT * FROM attendance_allowances WHERE month_key = $1',
            [monthKey]
        );
        res.json({ success: true, rows: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /allowances error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** PUT /allowances/:id — Upsert allowance */
router.put('/allowances/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { empId, monthKey, amount } = req.body;
        await req.pool.query(`
            INSERT INTO attendance_allowances (id, emp_id, month_key, amount, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (id) DO UPDATE SET amount = $4, updated_at = NOW()
        `, [id, empId || id.split('_')[0], monthKey || id.substring(id.indexOf('_') + 1), amount || 0]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] PUT /allowances error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** DELETE /allowances/:id */
router.delete('/allowances/:id', async (req, res) => {
    try {
        await req.pool.query('DELETE FROM attendance_allowances WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] DELETE /allowances error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// SYNC STATUS
// =====================================================

/** GET /sync-status */
router.get('/sync-status', async (req, res) => {
    try {
        const result = await req.pool.query(
            "SELECT * FROM attendance_sync_status WHERE id = 'current'"
        );
        res.json({ success: true, row: result.rows[0] || null });
    } catch (error) {
        console.error('[ATTENDANCE] GET /sync-status error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** PUT /sync-status — Update from sync service */
router.put('/sync-status', async (req, res) => {
    try {
        const { connected, last_sync_time, last_error } = req.body;
        await req.pool.query(`
            INSERT INTO attendance_sync_status (id, connected, last_sync_time, last_error, updated_at)
            VALUES ('current', $1, $2, $3, NOW())
            ON CONFLICT (id) DO UPDATE SET
                connected = $1,
                last_sync_time = COALESCE($2, attendance_sync_status.last_sync_time),
                last_error = $3,
                updated_at = NOW()
        `, [connected || false, last_sync_time || null, last_error || null]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] PUT /sync-status error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// COMMANDS (remote commands to sync service)
// =====================================================

/** POST /commands — Create command (from web frontend) */
router.post('/commands', async (req, res) => {
    try {
        const { action, employee_name, device_user_id, created_by } = req.body;
        if (!action) return res.status(400).json({ error: 'action required' });
        const result = await req.pool.query(`
            INSERT INTO attendance_commands (action, status, employee_name, device_user_id, created_by, created_at)
            VALUES ($1, 'pending', $2, $3, $4, NOW())
            RETURNING id
        `, [action, employee_name || null, device_user_id || null, created_by || 'web_admin']);
        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('[ATTENDANCE] POST /commands error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** GET /commands/pending — Poll pending commands (sync service) */
router.get('/commands/pending', async (req, res) => {
    try {
        // Atomic claim: mark as processing and return
        const result = await req.pool.query(`
            UPDATE attendance_commands
            SET status = 'processing', processed_at = NOW()
            WHERE id IN (
                SELECT id FROM attendance_commands
                WHERE status = 'pending'
                ORDER BY created_at
                LIMIT 10
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `);
        res.json({ success: true, commands: result.rows });
    } catch (error) {
        console.error('[ATTENDANCE] GET /commands/pending error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/** PATCH /commands/:id — Update command result (sync service) */
router.patch('/commands/:id', async (req, res) => {
    try {
        const { status, result } = req.body;
        await req.pool.query(`
            UPDATE attendance_commands SET status = $1, result = $2, processed_at = NOW()
            WHERE id = $3
        `, [status || 'completed', result || '', req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('[ATTENDANCE] PATCH /commands error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
