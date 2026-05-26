// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — webhook retry queue khi Web 2.0 path fail.
// =====================================================================
// Web2WebhookRetry — khi _processWeb2Path fail (Web 2.0 path), push
// webhook payload vào queue và retry mỗi 2 phút với exponential backoff.
// Tối đa 5 lần retry → permanent_failure (alert).
// =====================================================================

let _ready = false;
async function ensureSchema(pool) {
    if (_ready || !pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_webhook_retry_queue (
                id BIGSERIAL PRIMARY KEY,
                sepay_id VARCHAR(100) UNIQUE NOT NULL,
                webhook_data JSONB NOT NULL,
                last_error TEXT,
                retry_count INT DEFAULT 0,
                last_retry_at TIMESTAMPTZ,
                next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                resolved_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS idx_w2wrq_pending
                ON web2_webhook_retry_queue(next_retry_at)
                WHERE status = 'pending';
            CREATE INDEX IF NOT EXISTS idx_w2wrq_status
                ON web2_webhook_retry_queue(status);
        `);
        _ready = true;
        console.log('[web2-webhook-retry] schema ready');
    } catch (e) {
        console.error('[web2-webhook-retry] ensureSchema failed:', e.message);
    }
}

async function enqueue(db, sepayId, webhookData, errorMessage) {
    if (!db || !sepayId) return;
    try {
        // Backoff: 2min, 5min, 15min, 60min, 4h
        const nextRetryDelaysMs = [2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 3600_000];
        const nextRetry = new Date(Date.now() + nextRetryDelaysMs[0]).toISOString();
        await db.query(
            `INSERT INTO web2_webhook_retry_queue (sepay_id, webhook_data, last_error, next_retry_at, status)
             VALUES ($1, $2, $3, $4, 'pending')
             ON CONFLICT (sepay_id) DO UPDATE SET
                last_error = EXCLUDED.last_error,
                retry_count = web2_webhook_retry_queue.retry_count + 0,
                next_retry_at = EXCLUDED.next_retry_at,
                status = 'pending'`,
            [sepayId, JSON.stringify(webhookData || {}), String(errorMessage || ''), nextRetry]
        );
        console.log(`[web2-webhook-retry] enqueued sepay_id=${sepayId}, err=${errorMessage}`);
    } catch (e) {
        console.error('[web2-webhook-retry] enqueue failed:', e.message);
    }
}

/**
 * Process pending queue. Called by cron job every 2 minutes.
 */
async function processQueue(db, processFn) {
    if (!db || !processFn) return { picked: 0, success: 0, failed: 0 };
    try {
        // Pick rows due for retry with row-level lock
        const r = await db.query(
            `SELECT id, sepay_id, webhook_data, retry_count
             FROM web2_webhook_retry_queue
             WHERE status = 'pending' AND next_retry_at <= NOW()
             ORDER BY next_retry_at ASC
             LIMIT 20
             FOR UPDATE SKIP LOCKED`
        );
        const rows = r.rows;
        if (!rows.length) return { picked: 0, success: 0, failed: 0 };

        let success = 0,
            failed = 0;
        const nextRetryDelaysMs = [2 * 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 4 * 3600_000];

        for (const row of rows) {
            try {
                await processFn(row.webhook_data);
                await db.query(
                    `UPDATE web2_webhook_retry_queue
                     SET status = 'success', resolved_at = NOW(), retry_count = retry_count + 1
                     WHERE id = $1`,
                    [row.id]
                );
                success++;
                console.log(`[web2-webhook-retry] success sepay_id=${row.sepay_id}`);
            } catch (e) {
                const nextCount = (Number(row.retry_count) || 0) + 1;
                if (nextCount >= 5) {
                    // Permanent failure
                    await db.query(
                        `UPDATE web2_webhook_retry_queue
                         SET status = 'permanent_failure', last_error = $2,
                             retry_count = $3, last_retry_at = NOW()
                         WHERE id = $1`,
                        [row.id, String(e.message || e).slice(0, 500), nextCount]
                    );
                    console.error(
                        `[web2-webhook-retry] PERMANENT FAILURE sepay_id=${row.sepay_id} after ${nextCount} retries: ${e.message}`
                    );
                } else {
                    const delay =
                        nextRetryDelaysMs[Math.min(nextCount, nextRetryDelaysMs.length - 1)];
                    const next = new Date(Date.now() + delay).toISOString();
                    await db.query(
                        `UPDATE web2_webhook_retry_queue
                         SET retry_count = $2, last_retry_at = NOW(),
                             next_retry_at = $3, last_error = $4
                         WHERE id = $1`,
                        [row.id, nextCount, next, String(e.message || e).slice(0, 500)]
                    );
                    console.warn(
                        `[web2-webhook-retry] retry ${nextCount}/5 failed for sepay_id=${row.sepay_id}: ${e.message}`
                    );
                }
                failed++;
            }
        }
        return { picked: rows.length, success, failed };
    } catch (e) {
        console.error('[web2-webhook-retry] processQueue failed:', e.message);
        return { picked: 0, success: 0, failed: 0, error: e.message };
    }
}

/**
 * Start cron job — runs every 2 minutes.
 */
let _intervalRef = null;
function startCron(db, processFn) {
    if (_intervalRef) return;
    _intervalRef = setInterval(
        async () => {
            const r = await processQueue(db, processFn);
            if (r.picked > 0) {
                console.log(
                    `[web2-webhook-retry] cron tick: picked=${r.picked} success=${r.success} failed=${r.failed}`
                );
            }
        },
        2 * 60 * 1000
    );
    console.log('[web2-webhook-retry] cron started (2-min interval)');
}

function stopCron() {
    if (_intervalRef) {
        clearInterval(_intervalRef);
        _intervalRef = null;
    }
}

async function getStats(db) {
    if (!db) return null;
    const r = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'pending') AS pending,
            COUNT(*) FILTER (WHERE status = 'success') AS success,
            COUNT(*) FILTER (WHERE status = 'permanent_failure') AS permanent_failure,
            MAX(retry_count) AS max_retries,
            COUNT(*) AS total
        FROM web2_webhook_retry_queue
    `);
    return r.rows[0];
}

module.exports = {
    ensureSchema,
    enqueue,
    processQueue,
    startCron,
    stopCron,
    getStats,
};
