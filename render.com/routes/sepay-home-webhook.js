// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// SEPAY HOME WEBHOOK ROUTES — /api/sepay-home/*
// SePay account #2 ("Home" — sổ thu/chi nội bộ theo phòng).
// Hoàn toàn độc lập với /api/sepay/* (account #1):
//   - Table:  balance_history_home (không phải balance_history)
//   - SSE buffer: app.locals.balanceHomeSseClients
//   - Env key: SEPAY_HOME_API_KEY (không phải SEPAY_API_KEY)
// Endpoints:
//   POST /webhook                      — nhận webhook SePay
//   GET  /history                      — list giao dịch (filter + paginate)
//   GET  /statistics                   — thống kê (in/out/net/latest_balance)
//   GET  /stream                       — SSE realtime
//   PUT  /transaction/:id/room         — gán mã phòng
//   PUT  /transaction/:id/hidden       — ẩn/hiện giao dịch
//   GET  /ping                         — health check
// =====================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// =====================================================
// SCHEMA BOOTSTRAP (chạy 1 lần khi module load, idempotent)
// =====================================================

let schemaBootstrapped = false;

async function ensureSchema(db) {
    if (schemaBootstrapped) return;
    try {
        const migrationPath = path.join(__dirname, '../migrations/070_balance_history_home.sql');
        if (!fs.existsSync(migrationPath)) {
            console.warn('[SEPAY-HOME] Migration file not found, skipping schema bootstrap');
            schemaBootstrapped = true;
            return;
        }
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await db.query(sql);
        schemaBootstrapped = true;
        console.log('[SEPAY-HOME] Schema bootstrapped (balance_history_home)');
    } catch (err) {
        console.error('[SEPAY-HOME] Schema bootstrap failed:', err.message);
        // Đừng crash server — sẽ retry ở request kế.
    }
}

// =====================================================
// HELPERS
// =====================================================

async function logWebhook(db, sepayId, req, statusCode, responseBody, errorMessage) {
    try {
        await db.query(
            `INSERT INTO sepay_home_webhook_logs (
                sepay_id, request_method, request_headers, request_body,
                response_status, response_body, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                sepayId,
                req.method,
                JSON.stringify(req.headers),
                JSON.stringify(req.body),
                statusCode,
                JSON.stringify(responseBody),
                errorMessage,
            ]
        );
    } catch (err) {
        console.error('[SEPAY-HOME] Failed to log webhook:', err.message);
    }
}

function broadcastUpdate(app, event, data) {
    if (!app.locals.balanceHomeSseClients) return;
    app.locals.balanceHomeSseClients.forEach((client) => {
        try {
            client.write(`event: ${event}\n`);
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            console.error('[SEPAY-HOME-SSE] Failed to send to client:', err.message);
        }
    });
}

function computeRunningBalance(rows) {
    // rows đã sort DESC theo transaction_date. running_balance = accumulated tại thời điểm đó.
    // SePay đã cung cấp `accumulated` (số dư sau giao dịch) → chỉ cần map sang `running_balance`.
    return rows.map((r) => ({
        ...r,
        running_balance: r.accumulated != null ? Number(r.accumulated) : null,
        amount: r.transfer_amount != null ? Number(r.transfer_amount) : null,
    }));
}

// =====================================================
// HEALTH CHECK
// =====================================================

router.get('/ping', (req, res) => {
    res.json({ success: true, service: 'sepay-home', timestamp: new Date().toISOString() });
});

// =====================================================
// WEBHOOK HANDLER
// POST /api/sepay-home/webhook
// SePay gửi: Authorization: Apikey <SEPAY_HOME_API_KEY>
// Body: { id, gateway, transactionDate, accountNumber, code, content,
//         transferType, transferAmount, accumulated, subAccount, referenceCode, description }
// =====================================================

router.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    const db = req.app.locals.chatDb;

    console.log('[SEPAY-HOME-WEBHOOK] ========================================');
    console.log('[SEPAY-HOME-WEBHOOK] Received at:', new Date().toISOString());
    console.log('[SEPAY-HOME-WEBHOOK] Body:', JSON.stringify(req.body).substring(0, 500));

    await ensureSchema(db);

    // Auth check
    const SEPAY_HOME_API_KEY = process.env.SEPAY_HOME_API_KEY;
    if (SEPAY_HOME_API_KEY) {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            await logWebhook(
                db,
                null,
                req,
                401,
                { error: 'Missing Authorization' },
                'Missing auth'
            );
            return res
                .status(401)
                .json({ success: false, error: 'Unauthorized - Missing Authorization header' });
        }
        const apiKey = authHeader.replace(/^Apikey\s+/i, '').trim();
        if (apiKey !== SEPAY_HOME_API_KEY) {
            await logWebhook(db, null, req, 401, { error: 'Invalid API Key' }, 'Invalid key');
            return res
                .status(401)
                .json({ success: false, error: 'Unauthorized - Invalid API Key' });
        }
    } else {
        console.warn(
            '[SEPAY-HOME-WEBHOOK] SEPAY_HOME_API_KEY env var not set — running without auth (DEV ONLY)'
        );
    }

    try {
        const w = req.body;
        if (!w || typeof w !== 'object') {
            await logWebhook(
                db,
                null,
                req,
                400,
                { error: 'Invalid data type' },
                'Invalid data type'
            );
            return res
                .status(400)
                .json({ success: false, error: 'Invalid data - expected JSON object' });
        }

        const required = [
            'id',
            'gateway',
            'transactionDate',
            'accountNumber',
            'transferType',
            'transferAmount',
            'accumulated',
        ];
        const missing = required.filter((f) => w[f] === undefined || w[f] === null);
        if (missing.length > 0) {
            await logWebhook(
                db,
                w.id,
                req,
                400,
                { error: 'Missing fields', missing },
                `Missing: ${missing.join(',')}`
            );
            return res
                .status(400)
                .json({ success: false, error: 'Missing required fields', missing });
        }

        if (!['in', 'out'].includes(w.transferType)) {
            await logWebhook(
                db,
                w.id,
                req,
                400,
                { error: 'Invalid transfer_type' },
                'Bad transfer_type'
            );
            return res
                .status(400)
                .json({ success: false, error: 'Invalid transfer_type - must be "in" or "out"' });
        }

        const insertResult = await db.query(
            `INSERT INTO balance_history_home (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, webhook_received_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)
            ON CONFLICT (sepay_id) DO NOTHING
            RETURNING id`,
            [
                w.id,
                w.gateway,
                w.transactionDate,
                w.accountNumber,
                w.code || null,
                w.content || null,
                w.transferType,
                w.transferAmount,
                w.accumulated,
                w.subAccount || null,
                w.referenceCode || null,
                w.description || null,
                JSON.stringify(w),
            ]
        );

        if (insertResult.rows.length === 0) {
            await logWebhook(db, w.id, req, 200, { success: true, duplicate: true }, null);
            return res
                .status(200)
                .json({ success: true, message: 'Duplicate transaction - already processed' });
        }

        const insertedId = insertResult.rows[0].id;

        console.log('[SEPAY-HOME-WEBHOOK] Saved:', {
            id: insertedId,
            sepay_id: w.id,
            type: w.transferType,
            amount: w.transferAmount,
            gateway: w.gateway,
        });

        await logWebhook(db, w.id, req, 200, { success: true, id: insertedId }, null);

        // Broadcast realtime
        broadcastUpdate(req.app, 'new-transaction', {
            id: insertedId,
            sepay_id: w.id,
            gateway: w.gateway,
            transaction_date: w.transactionDate,
            account_number: w.accountNumber,
            code: w.code || null,
            content: w.content || null,
            transfer_type: w.transferType,
            transfer_amount: Number(w.transferAmount),
            amount: Number(w.transferAmount),
            accumulated: Number(w.accumulated),
            running_balance: Number(w.accumulated),
            sub_account: w.subAccount || null,
            reference_code: w.referenceCode || null,
            description: w.description || null,
            room_code: null,
            is_hidden: false,
            created_at: new Date().toISOString(),
        });

        const ms = Date.now() - startTime;
        console.log('[SEPAY-HOME-WEBHOOK] Completed in', ms, 'ms');

        res.status(200).json({
            success: true,
            id: insertedId,
            message: 'Transaction recorded successfully',
            processing_time_ms: ms,
        });
    } catch (err) {
        console.error('[SEPAY-HOME-WEBHOOK] Error:', err.message);
        await logWebhook(db, req.body?.id, req, 500, { error: 'Internal error' }, err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to process webhook',
            message: err.message,
        });
    }
});

// =====================================================
// HISTORY
// GET /api/sepay-home/history?page=&limit=&type=&startDate=&endDate=&search=&amount=&showHidden=
// =====================================================

router.get('/history', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureSchema(db);

    try {
        const {
            page = 1,
            limit = 50,
            type,
            startDate,
            endDate,
            search,
            amount,
            gateway,
            showHidden = 'true', // home page mặc định show all (FE chia view)
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        let p = 1;

        if (showHidden !== 'true') {
            conds.push(`(is_hidden = FALSE OR is_hidden IS NULL)`);
        }

        if (type && ['in', 'out'].includes(type)) {
            conds.push(`transfer_type = $${p++}`);
            params.push(type);
        }
        if (gateway) {
            conds.push(`gateway ILIKE $${p++}`);
            params.push(`%${gateway}%`);
        }
        if (startDate) {
            conds.push(`transaction_date >= $${p++}`);
            params.push(startDate);
        }
        if (endDate) {
            conds.push(`transaction_date <= $${p++}`);
            params.push(`${endDate} 23:59:59`);
        }
        if (search) {
            conds.push(`(content ILIKE $${p} OR reference_code ILIKE $${p} OR code ILIKE $${p})`);
            params.push(`%${search}%`);
            p++;
        }
        if (amount) {
            const amtNum = parseInt(String(amount).replace(/[^0-9]/g, ''), 10);
            if (Number.isFinite(amtNum) && amtNum > 0) {
                conds.push(`transfer_amount = $${p++}`);
                params.push(amtNum);
            }
        }

        const whereClause = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const countResult = await db.query(
            `SELECT COUNT(*)::int AS total FROM balance_history_home ${whereClause}`,
            params
        );
        const total = countResult.rows[0].total;
        const totalPages = Math.max(1, Math.ceil(total / limitNum));

        const dataResult = await db.query(
            `SELECT id, sepay_id, gateway, transaction_date, account_number,
                    code, content, transfer_type, transfer_amount, accumulated,
                    sub_account, reference_code, description, room_code, is_hidden,
                    created_at, updated_at
             FROM balance_history_home
             ${whereClause}
             ORDER BY transaction_date DESC, id DESC
             LIMIT $${p} OFFSET $${p + 1}`,
            [...params, limitNum, offset]
        );

        res.json({
            success: true,
            data: computeRunningBalance(dataResult.rows),
            pagination: { page: pageNum, limit: limitNum, total, totalPages },
        });
    } catch (err) {
        console.error('[SEPAY-HOME-HISTORY] Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch history',
            message: err.message,
        });
    }
});

// =====================================================
// STATISTICS
// GET /api/sepay-home/statistics?startDate=&endDate=&gateway=
// =====================================================

router.get('/statistics', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureSchema(db);

    try {
        const { startDate, endDate, gateway } = req.query;

        const conds = [];
        const params = [];
        let p = 1;

        if (startDate) {
            conds.push(`transaction_date >= $${p++}`);
            params.push(startDate);
        }
        if (endDate) {
            conds.push(`transaction_date <= $${p++}`);
            params.push(`${endDate} 23:59:59`);
        }
        if (gateway) {
            conds.push(`gateway ILIKE $${p++}`);
            params.push(`%${gateway}%`);
        }
        // Stats không tính giao dịch đã ẩn
        conds.push(`(is_hidden = FALSE OR is_hidden IS NULL)`);

        const whereClause = `WHERE ${conds.join(' AND ')}`;

        const result = await db.query(
            `SELECT
                COUNT(*)::int AS total_transactions,
                COUNT(*) FILTER (WHERE transfer_type = 'in')::int AS total_in_count,
                COUNT(*) FILTER (WHERE transfer_type = 'out')::int AS total_out_count,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'in'), 0)::bigint AS total_in,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'out'), 0)::bigint AS total_out,
                COALESCE(
                    SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE -transfer_amount END),
                    0
                )::bigint AS net_change,
                (
                    SELECT accumulated
                    FROM balance_history_home
                    ORDER BY transaction_date DESC, id DESC
                    LIMIT 1
                ) AS latest_balance
             FROM balance_history_home
             ${whereClause}`,
            params
        );

        const s = result.rows[0];
        res.json({
            success: true,
            statistics: {
                total_transactions: Number(s.total_transactions),
                total_in_count: Number(s.total_in_count),
                total_out_count: Number(s.total_out_count),
                total_in: Number(s.total_in),
                total_out: Number(s.total_out),
                net_change: Number(s.net_change),
                latest_balance: Number(s.latest_balance) || 0,
            },
        });
    } catch (err) {
        console.error('[SEPAY-HOME-STATS] Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            message: err.message,
        });
    }
});

// =====================================================
// SSE STREAM
// GET /api/sepay-home/stream
// =====================================================

router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders?.();

    if (!req.app.locals.balanceHomeSseClients) {
        req.app.locals.balanceHomeSseClients = new Set();
    }
    req.app.locals.balanceHomeSseClients.add(res);
    console.log(`[SEPAY-HOME-SSE] Connected (total: ${req.app.locals.balanceHomeSseClients.size})`);

    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
        try {
            res.write(': keep-alive\n\n');
        } catch (_) {}
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
        req.app.locals.balanceHomeSseClients.delete(res);
        console.log(
            `[SEPAY-HOME-SSE] Disconnected (total: ${req.app.locals.balanceHomeSseClients.size})`
        );
        try {
            res.end();
        } catch (_) {}
    });
});

// =====================================================
// UPDATE ROOM CODE
// PUT /api/sepay-home/transaction/:id/room  { room_code: string|null }
// =====================================================

router.put('/transaction/:id/room', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureSchema(db);

    try {
        const txId = parseInt(req.params.id, 10);
        if (!Number.isFinite(txId)) {
            return res.status(400).json({ success: false, error: 'Invalid transaction id' });
        }

        const { room_code } = req.body || {};
        const normalized =
            room_code === '' || room_code == null ? null : String(room_code).slice(0, 50);

        const result = await db.query(
            `UPDATE balance_history_home
             SET room_code = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, room_code`,
            [normalized, txId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        broadcastUpdate(req.app, 'room-code-updated', {
            transaction_id: txId,
            room_code: normalized,
        });

        res.json({ success: true, transaction_id: txId, room_code: normalized });
    } catch (err) {
        console.error('[SEPAY-HOME-ROOM] Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update room code',
            message: err.message,
        });
    }
});

// =====================================================
// HIDE/SHOW TRANSACTION
// PUT /api/sepay-home/transaction/:id/hidden  { is_hidden: boolean }
// =====================================================

router.put('/transaction/:id/hidden', async (req, res) => {
    const db = req.app.locals.chatDb;
    await ensureSchema(db);

    try {
        const txId = parseInt(req.params.id, 10);
        if (!Number.isFinite(txId)) {
            return res.status(400).json({ success: false, error: 'Invalid transaction id' });
        }

        const isHidden = Boolean(req.body?.is_hidden);

        const result = await db.query(
            `UPDATE balance_history_home
             SET is_hidden = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING id, is_hidden`,
            [isHidden, txId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        broadcastUpdate(req.app, 'visibility-updated', {
            transaction_id: txId,
            is_hidden: isHidden,
        });

        res.json({ success: true, transaction_id: txId, is_hidden: isHidden });
    } catch (err) {
        console.error('[SEPAY-HOME-HIDDEN] Error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update visibility',
            message: err.message,
        });
    }
});

module.exports = router;
