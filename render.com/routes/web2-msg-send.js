// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk FB Message Send Job (server-side, refresh-safe)
// =====================================================
//
// Trang native-orders chọn N đơn → "Gửi tin nhắn" → POST job vào đây. Server
// chạy NỀN (worker `web2-msg-send-worker.js`): gửi qua Pancake API đa-account
// song song; đơn lỗi 24h → đánh dấu `needs_extension` để client drain qua
// browser extension (chỉ extension bypass được 24h — xem research CLAUDE.md).
//
// Tables (web2Db):
//   web2_msg_send_jobs   — 1 row / lần bấm gửi
//   web2_msg_send_items  — 1 row / đơn (message text đã fill sẵn ở client)
//
// Refresh-safe: job + items ở Postgres. Client reload → GET /active → reattach.
// Progress: SSE topic `web2:bulk-send:<jobId>` (per-job) + `web2:bulk-send` (list).
//
// Routes (mount /api/web2/msg-send — CF worker forward /api/web2/* về Render;
// PHẢI mount TRƯỚC catch-all /api/web2 generic router để không bị nuốt):
//   POST   /                       → tạo job + items, trả { jobId, total }
//   GET    /active                 → job đang chạy gần nhất (reattach sau refresh)
//   GET    /:id                    → job + counters + items tóm tắt
//   GET    /:id/extension-items    → items state='needs_extension' (client drain)
//   POST   /:id/items/:itemId/claim-ext  → đánh dấu ext_inflight (chống double-send)
//   POST   /:id/items/:itemId/result     → { ok, via, error } cập nhật kết quả extension
//   POST   /:id/cancel             → huỷ job (pending → cancelled)

'use strict';

const express = require('express');
const router = express.Router();

// ─── Web 2.0 auth gate (per-route; honors WEB2_AUTH_ENFORCE=1 → 401) ──
const { requireWeb2Auth, requireWeb2AuthSoft } = require('../middleware/web2-auth');

// ─── Pool: jobs/items ở web2Db (req.app.locals.web2Db) ────────────
function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// ─── SSE notifier (injected từ server.js) ─────────────────────────
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(topic, data) {
    if (!_notifyClients) return;
    try {
        _notifyClients(topic, { ...data, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-MSG-SEND] _notify failed:', e.message);
    }
}

// ─── Schema (idempotent, chạy lúc boot từ server.js) ──────────────
async function ensureSchema(pool) {
    if (!pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_msg_send_jobs (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_by    TEXT,
            template_name TEXT,
            total         INTEGER NOT NULL DEFAULT 0,
            state         TEXT NOT NULL DEFAULT 'running',
            note          TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at   TIMESTAMPTZ
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_msg_send_items (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id        UUID NOT NULL REFERENCES web2_msg_send_jobs(id) ON DELETE CASCADE,
            order_code    TEXT,
            page_id       TEXT,
            conv_id       TEXT,
            customer_id   TEXT,
            customer_name TEXT,
            fb_user_id    TEXT,
            global_id     TEXT,
            thread_id     TEXT,
            message       TEXT NOT NULL,
            state         TEXT NOT NULL DEFAULT 'pending',
            via           TEXT,
            attempts      INTEGER NOT NULL DEFAULT 0,
            e_code        INTEGER,
            e_subcode     BIGINT,
            error         TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2msg_jobs_state ON web2_msg_send_jobs(state) WHERE state IN ('running','awaiting_extension');`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2msg_jobs_created ON web2_msg_send_jobs(created_at DESC);`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2msg_items_job ON web2_msg_send_items(job_id);`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2msg_items_pending ON web2_msg_send_items(state) WHERE state IN ('pending','sending');`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2msg_items_ext ON web2_msg_send_items(job_id, state) WHERE state = 'needs_extension';`
    );
    console.log('[WEB2-MSG-SEND] schema ensured');
}

// ─── Counters helper: aggregate item states → job + SSE broadcast ──
// ATOMIC: derive counts + state + write job trong MỘT statement (correlated
// UPDATE đọc thẳng từ items). Read-modify-write cũ (SELECT → derive → UPDATE
// trên plain pool conn, READ COMMITTED) race giữa /result, /cancel và worker
// debounce trong cùng process → state có thể lùi. Gộp 1 SQL = không interleave.
async function _recomputeAndNotify(pool, jobId) {
    const { rows } = await pool.query(
        `UPDATE web2_msg_send_jobs j
         SET state = c.new_state,
             updated_at = NOW(),
             finished_at = CASE
                 WHEN c.new_state = 'done' AND j.finished_at IS NULL THEN NOW()
                 ELSE j.finished_at
             END
         FROM (
             SELECT
                 COALESCE(SUM(n) FILTER (WHERE state = 'done'), 0)            AS sent,
                 COALESCE(SUM(n) FILTER (WHERE state = 'error'), 0)           AS failed,
                 COALESCE(SUM(n) FILTER (WHERE state IN ('needs_extension','ext_inflight')), 0) AS needs_ext,
                 COALESCE(SUM(n) FILTER (WHERE state IN ('pending','sending')), 0)              AS active,
                 COALESCE(SUM(n), 0)                                         AS total,
                 CASE
                     WHEN COALESCE(SUM(n) FILTER (WHERE state IN ('pending','sending')), 0) > 0 THEN 'running'
                     WHEN COALESCE(SUM(n) FILTER (WHERE state IN ('needs_extension','ext_inflight')), 0) > 0 THEN 'awaiting_extension'
                     ELSE 'done'
                 END AS new_state
             FROM (
                 SELECT state, COUNT(*)::int AS n
                 FROM web2_msg_send_items
                 WHERE job_id = $1
                 GROUP BY state
             ) s
         ) c
         WHERE j.id = $1
         RETURNING c.total::int AS total, c.sent::int AS sent, c.failed::int AS failed,
                   c.needs_ext::int AS "needsExt", c.active::int AS active, j.state AS state`,
        [jobId]
    );
    if (!rows.length) {
        // job đã bị xoá hoặc id sai → không broadcast
        return { jobId, total: 0, sent: 0, failed: 0, needsExt: 0, active: 0, state: 'done' };
    }
    const payload = { jobId, ...rows[0] };
    _notify('web2:bulk-send:' + jobId, payload);
    _notify('web2:bulk-send', { action: 'progress', ...payload });
    return payload;
}

// ─── POST / — tạo job + items ─────────────────────────────────────
router.post('/', requireWeb2Auth, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ success: false, error: 'no_items' });
    const createdBy = String(body.createdBy || '').slice(0, 120) || null;
    const templateName = String(body.templateName || '').slice(0, 200) || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const jobRes = await client.query(
            `INSERT INTO web2_msg_send_jobs (created_by, template_name, total, state)
             VALUES ($1, $2, $3, 'running') RETURNING id`,
            [createdBy, templateName, items.length]
        );
        const jobId = jobRes.rows[0].id;
        // Bulk insert items. message bắt buộc; bỏ qua item thiếu message/conv.
        let inserted = 0;
        for (const it of items) {
            const message = String(it.message || '').trim();
            const pageId = String(it.pageId || '').trim();
            const convId = String(it.convId || it.conversationId || '').trim();
            if (!message || !pageId || !convId) continue;
            await client.query(
                `INSERT INTO web2_msg_send_items
                 (job_id, order_code, page_id, conv_id, customer_id, customer_name,
                  fb_user_id, global_id, thread_id, message, state)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
                [
                    jobId,
                    it.orderCode || null,
                    pageId,
                    convId,
                    it.customerId || null,
                    it.customerName || null,
                    it.fbUserId || null,
                    it.globalId || null,
                    it.threadId || null,
                    message,
                ]
            );
            inserted++;
        }
        if (inserted === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'no_valid_items' });
        }
        // total = số item thực sự insert (có thể < items.length nếu thiếu field)
        await client.query(`UPDATE web2_msg_send_jobs SET total = $2 WHERE id = $1`, [
            jobId,
            inserted,
        ]);
        await client.query('COMMIT');
        _notify('web2:bulk-send', {
            action: 'created',
            jobId,
            total: inserted,
            sent: 0,
            failed: 0,
            needsExt: 0,
            state: 'running',
        });
        return res.json({ success: true, jobId, total: inserted });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-MSG-SEND] create job failed:', e.message);
        return res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// ─── GET /active — job đang chạy gần nhất (reattach sau refresh) ───
router.get('/active', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT id, created_by, template_name, total, state, created_at
             FROM web2_msg_send_jobs
             WHERE state IN ('running','awaiting_extension')
             ORDER BY created_at DESC LIMIT 1`
        );
        if (!rows.length) return res.json({ success: true, job: null });
        const job = rows[0];
        const counts = await _counts(pool, job.id);
        return res.json({ success: true, job: { ...job, ...counts } });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

async function _counts(pool, jobId) {
    const { rows } = await pool.query(
        `SELECT state, COUNT(*)::int AS n FROM web2_msg_send_items WHERE job_id = $1 GROUP BY state`,
        [jobId]
    );
    const c = {
        pending: 0,
        sending: 0,
        done: 0,
        error: 0,
        needs_extension: 0,
        ext_inflight: 0,
        cancelled: 0,
    };
    for (const r of rows) c[r.state] = r.n;
    return {
        sent: c.done,
        failed: c.error,
        needsExt: c.needs_extension + c.ext_inflight,
        active: c.pending + c.sending,
        cancelled: c.cancelled,
    };
}

// ─── GET /:id — chi tiết job ───────────────────────────────────────
router.get('/:id', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    try {
        const { rows } = await pool.query(`SELECT * FROM web2_msg_send_jobs WHERE id = $1`, [
            req.params.id,
        ]);
        if (!rows.length) return res.status(404).json({ success: false, error: 'not_found' });
        const counts = await _counts(pool, req.params.id);
        return res.json({ success: true, job: { ...rows[0], ...counts } });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /:id/extension-items — đơn cần extension drain ───────────
router.get('/:id/extension-items', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    try {
        const { rows } = await pool.query(
            `SELECT id, order_code, page_id, conv_id, customer_id, customer_name,
                    fb_user_id, global_id, thread_id, message, e_code, e_subcode, error
             FROM web2_msg_send_items
             WHERE job_id = $1 AND state = 'needs_extension'
             ORDER BY updated_at ASC LIMIT $2`,
            [req.params.id, limit]
        );
        return res.json({ success: true, items: rows });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/items/:itemId/claim-ext — chống double-send ────────
router.post('/:id/items/:itemId/claim-ext', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    try {
        const { rows } = await pool.query(
            `UPDATE web2_msg_send_items
             SET state = 'ext_inflight', updated_at = NOW()
             WHERE id = $1 AND job_id = $2 AND state = 'needs_extension'
             RETURNING id`,
            [req.params.itemId, req.params.id]
        );
        return res.json({ success: true, claimed: rows.length > 0 });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/items/:itemId/result — kết quả extension ───────────
router.post('/:id/items/:itemId/result', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    const ok = !!(req.body && req.body.ok);
    const via = String(req.body?.via || 'extension').slice(0, 30);
    const error = req.body?.error ? String(req.body.error).slice(0, 500) : null;
    try {
        // State-guarded + idempotent: chỉ ghi kết quả khi item vẫn đang chờ/đang
        // gửi qua extension. Tránh stale clobber khi worker _recoverStuck đã revert
        // ext_inflight→needs_extension rồi một reporter cũ POST /result trễ về (sẽ
        // ghi đè kết quả của lần claim/gửi mới). rowCount===0 → đã được xử lý nơi khác.
        const upd = await pool.query(
            `UPDATE web2_msg_send_items
             SET state = $3, via = $4, error = $5, attempts = attempts + 1, updated_at = NOW()
             WHERE id = $1 AND job_id = $2 AND state IN ('ext_inflight','needs_extension')`,
            [req.params.itemId, req.params.id, ok ? 'done' : 'error', via, ok ? null : error]
        );
        if (upd.rowCount === 0) {
            return res.json({ success: true, ignored: true });
        }
        const payload = await _recomputeAndNotify(pool, req.params.id);
        return res.json({ success: true, ...payload });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/cancel ──────────────────────────────────────────────
// ⚠ KHÔNG huỷ được item đang state='sending': worker đã CLAIM (FOR UPDATE SKIP
// LOCKED) và đang gọi Pancake send — không có abort path giữa chừng, tin VẪN tới
// khách dù user bấm "Huỷ". Chỉ huỷ được item còn pending/needs_extension/
// ext_inflight (chưa rời hàng đợi). Đây là giới hạn cố ý: không clobber state của
// item đang gửi để tránh ghi 'cancelled' đè lên kết quả 'done'/'error' worker
// sắp ghi. Muốn huỷ tức thì item đang gửi → cần job-level cancel flag worker đọc
// ngay trước lệnh send (chưa làm — defer, low priority).
router.post('/:id/cancel', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(503).json({ success: false, error: 'db_unavailable' });
    try {
        await pool.query(
            `UPDATE web2_msg_send_items
             SET state = 'cancelled', updated_at = NOW()
             WHERE job_id = $1 AND state IN ('pending','needs_extension','ext_inflight')`,
            [req.params.id]
        );
        const payload = await _recomputeAndNotify(pool, req.params.id);
        return res.json({ success: true, ...payload });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = ensureSchema;
router.initializeNotifiers = initializeNotifiers;
router._recomputeAndNotify = _recomputeAndNotify;
module.exports = router;
