/**
 * ADMS (Automatic Data Master Server) Protocol Handler
 * Receives push data from ZKTeco DG-600 timekeeping machine.
 *
 * The machine pushes attendance logs via HTTP instead of
 * needing a PC to poll via ZK protocol.
 *
 * Protocol endpoints:
 *   GET  /iclock/cdata       — Device heartbeat / registration
 *   POST /iclock/cdata       — Device pushes attendance data
 *   GET  /iclock/getrequest  — Device polls for commands
 *   POST /iclock/devicecmd   — Device reports command results
 */

const express = require('express');
const router = express.Router();

// Parse raw text body (machine sends text/plain, not JSON)
router.use(express.text({ type: '*/*', limit: '1mb' }));

// Ensure attendance tables exist
let tablesReady = false;
async function ensureTables(pool) {
    if (tablesReady) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS attendance_records (
                id VARCHAR(100) PRIMARY KEY,
                device_user_id VARCHAR(20) NOT NULL,
                check_time TIMESTAMPTZ NOT NULL,
                date_key VARCHAR(10) NOT NULL,
                type INTEGER DEFAULT 0,
                source VARCHAR(20) DEFAULT 'device',
                synced_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_att_records_date_key ON attendance_records(date_key)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_att_records_user_date ON attendance_records(device_user_id, date_key)`);
        tablesReady = true;
    } catch (e) {
        console.error('[ADMS] ensureTables error:', e.message);
    }
}

function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * GET /iclock/cdata — Device heartbeat / registration
 * Machine sends: ?SN=<serial>&options=all&pushver=2.4.1&language=XX
 * Server responds with configuration options
 */
router.get('/cdata', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    console.log('[ADMS] Heartbeat from device:', sn, 'query:', JSON.stringify(req.query));

    await ensureTables(req.pool);

    // Update sync status
    try {
        await req.pool.query(`
            INSERT INTO attendance_sync_status (id, connected, last_sync_time, last_error, updated_at)
            VALUES ('current', TRUE, NOW(), NULL, NOW())
            ON CONFLICT (id) DO UPDATE SET
                connected = TRUE,
                last_sync_time = NOW(),
                last_error = NULL,
                updated_at = NOW()
        `);
    } catch (e) { /* ignore */ }

    // Respond with device configuration
    // Realtime=1 → push data immediately when someone checks in
    // TransFlag=TransData AttLog → push attendance logs
    // TimeZone=7 → UTC+7 (Vietnam)
    res.set('Content-Type', 'text/plain');
    res.send([
        `GET OPTION FROM: ${sn}`,
        'Stamp=0',
        'OpStamp=0',
        'PhotoStamp=0',
        'ErrorDelay=60',
        'Delay=10',
        'TransTimes=00:00;14:05',
        'TransInterval=1',
        'TransFlag=TransData AttLog',
        'Realtime=1',
        'TimeZone=7',
    ].join('\r\n'));
});

/**
 * POST /iclock/cdata — Device pushes attendance data
 * Machine sends: ?SN=<serial>&table=ATTLOG&Stamp=<stamp>
 * Body (tab-separated lines):
 *   PIN\tDatetime\tStatus\tVerify\tWorkcode\tReserved1\tReserved2
 *   Example: 1\t2026-04-01 08:00:00\t0\t1\t0\t0\t0
 */
router.post('/cdata', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const table = req.query.table || '';
    const stamp = req.query.Stamp || '';

    const body = typeof req.body === 'string' ? req.body : '';
    console.log('[ADMS] Push from', sn, '| table:', table, '| stamp:', stamp, '| body length:', body.length);

    await ensureTables(req.pool);

    if (table.toUpperCase() === 'ATTLOG' && body.trim()) {
        const lines = body.trim().split('\n');
        let inserted = 0;
        let skipped = 0;
        const validStart = new Date('2020-01-01').getTime();
        const validEnd = Date.now() + 86400000;

        const client = await req.pool.connect();
        try {
            await client.query('BEGIN');

            for (const line of lines) {
                const parts = line.trim().split('\t');
                if (parts.length < 2) continue;

                const pin = parts[0].trim(); // Employee PIN/ID
                const datetime = parts[1].trim(); // "2026-04-01 08:00:00"
                const status = parseInt(parts[2]) || 0; // Check-in/out status

                if (!pin || pin === '0') { skipped++; continue; }

                // Parse datetime — machine sends LOCAL time (Vietnam UTC+7)
                const checkTime = new Date(datetime + '+07:00');
                if (isNaN(checkTime.getTime()) || checkTime.getTime() < validStart || checkTime.getTime() > validEnd) {
                    skipped++;
                    continue;
                }

                const dk = dateKey(checkTime);
                const id = pin + '_' + checkTime.getTime();

                await client.query(`
                    INSERT INTO attendance_records (id, device_user_id, check_time, date_key, type, source, synced_at)
                    VALUES ($1, $2, $3, $4, $5, 'adms', NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        check_time = EXCLUDED.check_time,
                        date_key = EXCLUDED.date_key,
                        type = EXCLUDED.type,
                        synced_at = NOW()
                `, [id, pin, checkTime.toISOString(), dk, status]);
                inserted++;
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            console.error('[ADMS] Insert error:', e.message);
        } finally {
            client.release();
        }

        console.log('[ADMS] ATTLOG:', inserted, 'inserted,', skipped, 'skipped');

        // Update sync status
        try {
            await req.pool.query(`
                INSERT INTO attendance_sync_status (id, connected, last_sync_time, updated_at)
                VALUES ('current', TRUE, NOW(), NOW())
                ON CONFLICT (id) DO UPDATE SET connected = TRUE, last_sync_time = NOW(), updated_at = NOW()
            `);
        } catch (e) { /* ignore */ }
    } else if (table.toUpperCase() === 'OPERLOG' && body.trim()) {
        // Operation logs (user add/delete, etc.) — log but don't process
        console.log('[ADMS] OPERLOG:', body.substring(0, 200));
    } else {
        console.log('[ADMS] Unknown table:', table, '| body:', body.substring(0, 200));
    }

    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

/**
 * GET /iclock/getrequest — Device polls for commands
 * Server responds with pending commands or empty string
 */
router.get('/getrequest', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';

    // Check for pending commands
    try {
        const result = await req.pool.query(`
            UPDATE attendance_commands
            SET status = 'processing', processed_at = NOW()
            WHERE id IN (
                SELECT id FROM attendance_commands
                WHERE status = 'pending'
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        `);

        if (result.rows.length > 0) {
            const cmd = result.rows[0];
            console.log('[ADMS] Sending command to', sn, ':', cmd.action);
            // Format: C:<id>:<command>
            res.set('Content-Type', 'text/plain');
            res.send(`C:${cmd.id}:${cmd.action}`);
            return;
        }
    } catch (e) {
        console.error('[ADMS] getrequest error:', e.message);
    }

    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

/**
 * POST /iclock/devicecmd — Device reports command execution results
 */
router.post('/devicecmd', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const body = typeof req.body === 'string' ? req.body : '';
    console.log('[ADMS] Command result from', sn, ':', body.substring(0, 200));

    // Parse result: ID=<id>&Return=<code>&CMD=<command>
    const idMatch = body.match(/ID=(\d+)/);
    if (idMatch) {
        try {
            await req.pool.query(
                `UPDATE attendance_commands SET status = 'completed', result = $2, processed_at = NOW() WHERE id = $1`,
                [idMatch[1], body]
            );
        } catch (e) { /* ignore */ }
    }

    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

module.exports = router;
