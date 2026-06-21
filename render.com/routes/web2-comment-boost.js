// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — API job tăng comment chạy nền server.
// =====================================================================
// web2-comment-boost — API tạo/giám sát job tăng comment chạy NỀN.
//
// Luồng: client chọn bài live + hội thoại comment + số muốn THÊM (addTarget).
// Server chụp comment_count hiện tại (baseline) → target = baseline + addTarget,
// lưu job (state=pending). Worker (web2-comment-boost-worker) nhặt job, đăng
// reply_comment qua nhiều account Pancake tới khi comment_count THẬT >= target
// (re-check vòng lặp). Browser đóng vẫn chạy.
//
// Routes (mount /api/web2-comment-boost):
//   POST /create            { pageId, pageName, postId, convId, messageId, postTitle, addTarget, currentCount?, tpl?, delayMs? }
//   GET  /jobs?pageId=&limit=  → { success, jobs:[...] }
//   GET  /job/:id           → { success, job }
//   POST /job/:id/stop      → { success }
// SSE topic: web2:comment-boost  (payload { action, jobId, ts })
// =====================================================================

'use strict';
const express = require('express');
const crypto = require('crypto');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const worker = require('../services/web2-comment-boost-worker');
const router = express.Router();

function web2Db(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}
function chatDb(req) {
    return req.app.locals.chatDb;
}

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, jobId) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:comment-boost',
            { action, jobId: jobId || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-CMT-BOOST] _notify failed:', e.message);
    }
}

let _ready = false;
async function ensureSchema(pool) {
    if (_ready) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_comment_boost_jobs (
            id             VARCHAR(60) PRIMARY KEY,
            page_id        VARCHAR(50),
            page_name      VARCHAR(255),
            post_id        VARCHAR(120),
            conv_id        VARCHAR(160),
            message_id     VARCHAR(160),
            post_title     TEXT,
            baseline_count INTEGER,
            add_target     INTEGER,
            target_count   INTEGER,
            tpl            TEXT,
            delay_ms       INTEGER DEFAULT 1000,
            state          VARCHAR(20) DEFAULT 'pending',  -- pending|running|done|stopped|error
            sent_ok        INTEGER DEFAULT 0,
            sent_err       INTEGER DEFAULT 0,
            rounds         INTEGER DEFAULT 0,
            last_count     INTEGER,
            note           TEXT,
            error          TEXT,
            created_by     VARCHAR(120),
            created_at     BIGINT,
            updated_at     BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_w2cb_page ON web2_comment_boost_jobs(page_id);
        CREATE INDEX IF NOT EXISTS idx_w2cb_state ON web2_comment_boost_jobs(state);
        CREATE INDEX IF NOT EXISTS idx_w2cb_created ON web2_comment_boost_jobs(created_at DESC);
    `);
    _ready = true;
}
function _ensure(req, res, next) {
    ensureSchema(web2Db(req))
        .then(() => next())
        .catch((e) => {
            console.error('[WEB2-CMT-BOOST] ensureSchema fail:', e.message);
            res.status(500).json({ success: false, error: 'schema' });
        });
}

const num = (v, d = 0) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
};

// POST /create — chụp baseline + tạo job pending.
router.post('/create', _ensure, requireWeb2AuthSoft, async (req, res) => {
    const b = req.body || {};
    const pageId = String(b.pageId || '').trim();
    const postId = String(b.postId || '').trim();
    const convId = String(b.convId || '').trim();
    const addTarget = num(b.addTarget, 0);
    if (!pageId || !postId || !convId) {
        return res.status(400).json({ success: false, error: 'missing pageId/postId/convId' });
    }
    if (addTarget < 1 || addTarget > 100000) {
        return res.status(400).json({ success: false, error: 'addTarget 1..100000' });
    }
    // Baseline = comment_count THẬT của bài (server fetch); fallback currentCount client gửi.
    let baseline = await worker
        .fetchPostCommentCount(chatDb(req), pageId, postId)
        .catch(() => null);
    if (baseline == null && b.currentCount != null) baseline = num(b.currentCount, null);
    if (baseline == null) {
        return res.status(502).json({
            success: false,
            error: 'count_unreadable',
            message: 'Không đọc được số comment hiện tại của bài (thử lại).',
        });
    }
    const target = baseline + addTarget;
    const id = 'cb_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
    const now = Date.now();
    const delayMs = Math.max(1000, num(b.delayMs, 1000));
    try {
        await web2Db(req).query(
            `INSERT INTO web2_comment_boost_jobs
              (id, page_id, page_name, post_id, conv_id, message_id, post_title,
               baseline_count, add_target, target_count, tpl, delay_ms,
               state, sent_ok, sent_err, rounds, last_count, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',0,0,0,$13,$14,$15,$15)`,
            [
                id,
                pageId,
                String(b.pageName || '').slice(0, 255) || null,
                postId,
                convId,
                String(b.messageId || convId).slice(0, 160),
                String(b.postTitle || '').slice(0, 500) || null,
                baseline,
                addTarget,
                target,
                String(b.tpl || '').trim() || null,
                delayMs,
                baseline,
                String(req.web2User?.username || req.web2User?.id || '').slice(0, 120) || null,
                now,
            ]
        );
    } catch (e) {
        console.error('[WEB2-CMT-BOOST] insert fail:', e.message);
        return res.status(500).json({ success: false, error: 'insert' });
    }
    _notify('create', id);
    worker.triggerTick();
    const r = await web2Db(req).query('SELECT * FROM web2_comment_boost_jobs WHERE id=$1', [id]);
    res.json({ success: true, job: r.rows[0], baseline, target });
});

// GET /jobs — danh sách job gần đây (cho UI panel).
router.get('/jobs', _ensure, requireWeb2AuthSoft, async (req, res) => {
    const pageId = String(req.query.pageId || '').trim();
    const limit = Math.min(50, num(req.query.limit, 20));
    try {
        const params = [];
        let where = '';
        if (pageId) {
            params.push(pageId);
            where = 'WHERE page_id = $1';
        }
        params.push(limit);
        const r = await web2Db(req).query(
            `SELECT * FROM web2_comment_boost_jobs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
            params
        );
        res.json({ success: true, jobs: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /job/:id
router.get('/job/:id', _ensure, requireWeb2AuthSoft, async (req, res) => {
    try {
        const r = await web2Db(req).query('SELECT * FROM web2_comment_boost_jobs WHERE id=$1', [
            req.params.id,
        ]);
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'not_found' });
        res.json({ success: true, job: r.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /job/:id/stop — đặt state=stopped (worker tự dừng vòng kế).
router.post('/job/:id/stop', _ensure, requireWeb2AuthSoft, async (req, res) => {
    try {
        const r = await web2Db(req).query(
            `UPDATE web2_comment_boost_jobs SET state='stopped', updated_at=$2
             WHERE id=$1 AND state IN ('pending','running') RETURNING id`,
            [req.params.id, Date.now()]
        );
        _notify('stop', req.params.id);
        res.json({ success: true, stopped: r.rows.length > 0 });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = ensureSchema;
router.initializeNotifiers = initializeNotifiers;
module.exports = router;
