// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * ADMS (Automatic Data Master Server) Protocol Handler v2
 * Receives push data from ZKTeco DG-600 (Ronald Jack) timekeeping machine.
 *
 * Protocol spec: ZKTeco PUSH SDK Communication Protocol V2.0.1
 *
 * Endpoints:
 *   GET  /iclock/cdata       — Device heartbeat / registration
 *   POST /iclock/cdata       — Device pushes attendance/operation data
 *   GET  /iclock/getrequest  — Device polls for commands
 *   POST /iclock/devicecmd   — Device reports command results
 *   POST /iclock/querydata   — Device reports DATA QUERY results
 */

const express = require('express');
const router = express.Router();

// Parse raw text body (machine sends text/plain, not JSON)
router.use(express.text({ type: '*/*', limit: '1mb' }));

// Track command state per device (reset on heartbeat)
let checkSent = false;
let dataQuerySent = false;
// Cached stamp value (loaded from DB on first heartbeat)
let cachedStamp = null;

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

// Parse and insert ATTLOG records (shared between /cdata and /querydata)
async function parseAndInsertAttlog(body, pool) {
    const lines = body.trim().split(/\r?\n/);
    let inserted = 0;
    let skipped = 0;
    const validStart = new Date('2020-01-01').getTime();
    const validEnd = Date.now() + 86400000;
    const samples = [];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const line of lines) {
            const parts = line.trim().split('\t');
            if (parts.length < 2) { skipped++; continue; }

            const pin = parts[0].trim();
            const datetime = parts[1].trim();
            const status = parseInt(parts[2]) || 0;

            // Log first 3 records for debug
            if (samples.length < 3) {
                samples.push({ pin, datetime, status, fields: parts.length });
            }

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
        await client.query('ROLLBACK').catch(() => {});
        console.error('[ADMS] Insert error:', e.message);
    } finally {
        client.release();
    }

    console.log('[ADMS] ATTLOG result:', inserted, 'inserted,', skipped, 'skipped, total lines:', lines.length);
    if (samples.length > 0) {
        console.log('[ADMS] Sample records:', JSON.stringify(samples));
    }

    // Update sync status
    try {
        await pool.query(`
            INSERT INTO attendance_sync_status (id, connected, last_sync_time, updated_at)
            VALUES ('current', TRUE, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET connected = TRUE, last_sync_time = NOW(), updated_at = NOW()
        `);
    } catch (e) { /* ignore */ }

    return inserted;
}

/**
 * GET /iclock/cdata — Device heartbeat / registration
 * Machine sends: ?SN=<serial>&options=all&pushver=2.4.1&language=XX
 * Server responds with configuration options (CRLF separated)
 */
router.get('/cdata', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const pushver = req.query.pushver || '?';
    console.log('[ADMS] === HEARTBEAT ===');
    console.log('[ADMS] Device SN:', sn, '| pushver:', pushver);
    console.log('[ADMS] Full query:', JSON.stringify(req.query));
    console.log('[ADMS] Headers:', JSON.stringify(req.headers));

    await ensureTables(req.pool);

    // Reset command flags on new heartbeat (device just connected/reconnected)
    checkSent = false;
    dataQuerySent = false;

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

    // Get last stamp from sync_status (incremental mode)
    let attlogStamp = 0;
    try {
        const r = await req.pool.query(`SELECT last_stamp FROM attendance_sync_status WHERE id = 'current'`);
        if (r.rows.length > 0 && r.rows[0].last_stamp) {
            attlogStamp = parseInt(r.rows[0].last_stamp) || 0;
        }
    } catch (e) { /* column may not exist yet */ }

    cachedStamp = attlogStamp;
    console.log('[ADMS] Using ATTLOGStamp:', attlogStamp);

    // Respond with device configuration per ZKTeco PUSH Protocol spec
    const config = [
        `GET OPTION FROM: ${sn}`,
        `ATTLOGStamp=${attlogStamp}`,       // 0 = re-send ALL, >0 = incremental
        'OPERLOGStamp=9999',               // Don't need operation logs
        'ATTPHOTOStamp=9999',              // Don't need photos
        'ErrorDelay=30',                   // Retry after 30s on error
        'Delay=10',                        // Poll getrequest every 10s
        'TransTimes=00:00;14:05',          // Scheduled upload times
        'TransInterval=1',                 // Upload interval in minutes
        'TransFlag=1111000000',            // Bitmask: TransData|AttLog|OpLog|Photo enabled
        'Realtime=1',                      // Push immediately on new scan
        'Encrypt=0',                       // No encryption
        'ServerVer=3.4.1 2020-06-07',      // MANDATORY: server version string
        'PushProtVer=2.4.1',               // Protocol version negotiation
        'TimeZone=7',                      // UTC+7 Vietnam
        'ResLogDay=18250',                 // Max log retention days
        'ResLogDelCount=10000',            // Delete count when full
        'ResLogCount=50000',               // Max log count
    ].join('\r\n');

    console.log('[ADMS] Sending config:\n' + config);

    res.set('Content-Type', 'text/plain');
    res.send(config);
});

/**
 * POST /iclock/cdata — Device pushes attendance/operation data
 * Machine sends: ?SN=<serial>&table=ATTLOG&Stamp=<stamp>
 * Body (tab-separated lines, CRLF or LF):
 *   PIN\tDatetime\tStatus\tVerify\tWorkcode\tReserved1\tReserved2
 */
router.post('/cdata', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const table = req.query.table || '';
    const stamp = req.query.Stamp || '';

    const body = typeof req.body === 'string' ? req.body : '';
    console.log('[ADMS] === DATA PUSH ===');
    console.log('[ADMS] Device:', sn, '| table:', table, '| stamp:', stamp);
    console.log('[ADMS] Body length:', body.length, '| body preview:', body.substring(0, 500));

    await ensureTables(req.pool);

    let totalInserted = 0;

    if (table.toUpperCase() === 'ATTLOG' && body.trim()) {
        totalInserted = await parseAndInsertAttlog(body, req.pool);

        // Save stamp for incremental mode (device sends current stamp in query)
        if (stamp && totalInserted > 0) {
            try {
                await req.pool.query(`
                    UPDATE attendance_sync_status SET last_stamp = $1, updated_at = NOW() WHERE id = 'current'
                `, [stamp]);
                console.log('[ADMS] Saved stamp:', stamp);
            } catch (e) {
                // Column may not exist, add it
                try {
                    await req.pool.query(`ALTER TABLE attendance_sync_status ADD COLUMN IF NOT EXISTS last_stamp VARCHAR(50)`);
                    await req.pool.query(`UPDATE attendance_sync_status SET last_stamp = $1 WHERE id = 'current'`, [stamp]);
                } catch (e2) { /* ignore */ }
            }
        }
    } else if (table.toUpperCase() === 'OPERLOG' && body.trim()) {
        console.log('[ADMS] OPERLOG full body:', body.substring(0, 1000));
    } else {
        console.log('[ADMS] Other table:', table, '| body:', body.substring(0, 500));
    }

    const response = 'OK: ' + totalInserted;
    console.log('[ADMS] Response:', response);

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

/**
 * GET /iclock/getrequest — Device polls for commands
 * Server responds with command or "OK" (no pending commands)
 *
 * Command sequence after heartbeat:
 *   1st poll → CHECK (force device to re-evaluate and resync data)
 *   2nd poll → DATA QUERY ATTLOG (explicit query for all records)
 *   subsequent → check DB for user-queued commands, else OK
 */
router.get('/getrequest', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    console.log('[ADMS] getrequest from', sn, '| checkSent:', checkSent, '| dataQuerySent:', dataQuerySent);

    // Send CHECK once after heartbeat to force re-sync (only if stamp=0 / first time)
    if (!checkSent && cachedStamp === 0) {
        checkSent = true;
        const cmd = 'C:1:CHECK';
        console.log('[ADMS] Sending CHECK command to', sn);
        res.set('Content-Type', 'text/plain');
        res.send(cmd);
        return;
    }

    // Check for user-queued commands in DB
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
            console.log('[ADMS] Sending DB command to', sn, ':', cmd.action);
            res.set('Content-Type', 'text/plain');
            res.send(`C:${cmd.id}:${cmd.action}`);
            return;
        }
    } catch (e) {
        console.error('[ADMS] getrequest DB error:', e.message);
    }

    res.set('Content-Type', 'text/plain');
    res.send('OK');
});

/**
 * POST /iclock/devicecmd — Device reports command execution results
 * Body: ID=<cmd_id>&Return=<code>&CMD=<command>
 *   Return=0 → success, Return=-1 → failure
 */
router.post('/devicecmd', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const body = typeof req.body === 'string' ? req.body : '';
    console.log('[ADMS] === COMMAND RESULT ===');
    console.log('[ADMS] Device:', sn, '| result:', body);

    // Parse result: ID=<id>&Return=<code>&CMD=<command>
    const idMatch = body.match(/ID=(\d+)/);
    const returnMatch = body.match(/Return=(-?\d+)/);
    const returnCode = returnMatch ? parseInt(returnMatch[1]) : null;

    console.log('[ADMS] Command ID:', idMatch?.[1], '| Return code:', returnCode,
        returnCode === 0 ? '(SUCCESS)' : '(FAILED)');

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

/**
 * POST /iclock/querydata — Device reports DATA QUERY results
 * Machine sends query results here (separate from /cdata)
 * Body format same as ATTLOG: tab-separated records
 */
router.post('/querydata', async (req, res) => {
    const sn = req.query.SN || req.query.sn || 'unknown';
    const type = req.query.type || '';
    const cmdid = req.query.cmdid || '';
    const body = typeof req.body === 'string' ? req.body : '';

    console.log('[ADMS] === QUERY DATA RESULT ===');
    console.log('[ADMS] Device:', sn, '| type:', type, '| cmdid:', cmdid);
    console.log('[ADMS] Body length:', body.length, '| body preview:', body.substring(0, 500));

    await ensureTables(req.pool);

    let totalInserted = 0;
    if (body.trim()) {
        totalInserted = await parseAndInsertAttlog(body, req.pool);
    }

    const response = 'OK: ' + totalInserted;
    console.log('[ADMS] Response:', response);

    res.set('Content-Type', 'text/plain');
    res.send(response);
});

module.exports = router;
