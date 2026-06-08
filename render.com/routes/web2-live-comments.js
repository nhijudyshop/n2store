// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — lưu comment livestream vào DB (auto-save + đọc lại đủ/bền).
// =====================================================================
// web2-live-comments — kho comment livestream Web 2.0 (web2Db).
//
// Vì sao: live-chat fetch comment trực tiếp pages.fm (cửa sổ thời gian + phân
// trang lặp + chỉ post đang chọn) → dễ THIẾU / mất khi reload. Lưu vào DB để:
//   • Hiển thị ĐỦ + BỀN (không phụ thuộc cửa sổ pages.fm).
//   • Gom theo bài livestream (post_id) + chiến dịch cha (campaign_id).
//   • Báo cáo / quản lý sau buổi live.
//
// Routes (mount /api/web2-live-comments):
//   POST /bulk            { comments:[{id,postId,pageId,pageName,fbId,name,message,createdTime,phone,address,hasOrder}] }
//   GET  /?postIds=a,b&pageIds=&campaignId=&since=&limit=  → { success, data:[...] }
//   GET  /stats?postId=   → { count }
// SSE topic: web2:live-comments
// =====================================================================

'use strict';
const express = require('express');
const router = express.Router();

function getDb(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, postId) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:live-comments',
            { action, postId: postId || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-LIVE-COMMENTS] _notify failed:', e.message);
    }
}

let _tablesReady = false;
async function ensureTables(pool) {
    if (_tablesReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_comments (
            id            VARCHAR(120) PRIMARY KEY,   -- pages.fm comment id (postId_commentId)
            post_id       VARCHAR(120),               -- bài livestream (FB post id)
            page_id       VARCHAR(50),
            page_name     VARCHAR(255),
            campaign_id   VARCHAR(120),               -- gán chiến dịch cha (tuỳ chọn)
            fb_id         VARCHAR(50),
            customer_name VARCHAR(255),
            message       TEXT,
            created_time  TIMESTAMPTZ,
            phone         VARCHAR(20),
            address       TEXT,
            has_order     BOOLEAN DEFAULT false,
            data          JSONB,
            created_at    BIGINT,
            updated_at    BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_w2lc_post ON web2_live_comments(post_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_page ON web2_live_comments(page_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_campaign ON web2_live_comments(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_created ON web2_live_comments(created_time DESC);
    `);
    _tablesReady = true;
}

const norm = (v) => (v == null ? null : String(v));

// Upsert nhiều comment vào web2_live_comments. Dùng chung cho /bulk + server poller.
async function upsertComments(pool, arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    await ensureTables(pool);
    const now = Date.now();
    let saved = 0;
    const BATCH = 200;
    for (let i = 0; i < arr.length; i += BATCH) {
        const chunk = arr.slice(i, i + BATCH).filter((c) => c && c.id);
        if (!chunk.length) continue;
        const params = [];
        chunk.forEach((c) => {
            params.push(
                norm(c.id),
                norm(c.postId),
                norm(c.pageId),
                norm(c.pageName),
                norm(c.campaignId),
                norm(c.fbId),
                norm(c.name),
                c.message == null ? null : String(c.message),
                c.createdTime ? new Date(c.createdTime) : null,
                norm(c.phone),
                c.address == null ? null : String(c.address),
                !!c.hasOrder,
                now
            );
        });
        const sql = `
            INSERT INTO web2_live_comments
                (id, post_id, page_id, page_name, campaign_id, fb_id, customer_name,
                 message, created_time, phone, address, has_order, created_at, updated_at)
            VALUES ${chunk
                .map((_, k) => {
                    const b = k * 13;
                    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 13})`;
                })
                .join(',')}
            ON CONFLICT (id) DO UPDATE SET
                message = EXCLUDED.message,
                phone = COALESCE(NULLIF(web2_live_comments.phone,''), EXCLUDED.phone),
                address = COALESCE(NULLIF(web2_live_comments.address,''), EXCLUDED.address),
                customer_name = COALESCE(NULLIF(web2_live_comments.customer_name,''), EXCLUDED.customer_name),
                has_order = web2_live_comments.has_order OR EXCLUDED.has_order,
                campaign_id = COALESCE(EXCLUDED.campaign_id, web2_live_comments.campaign_id),
                updated_at = EXCLUDED.updated_at`;
        const r = await pool.query(sql, params);
        saved += r.rowCount || chunk.length;
    }
    return saved;
}

// POST /bulk — upsert nhiều comment (auto-save khi live load/realtime).
router.post('/bulk', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const arr = Array.isArray(req.body?.comments) ? req.body.comments : [];
    if (!arr.length) return res.json({ success: true, saved: 0 });
    try {
        const saved = await upsertComments(pool, arr);
        // KHÔNG _notify ở client auto-save (tránh reload→re-save loop). CHỈ server
        // poller _notify('poll') — nguồn authoritative cho realtime reload.
        res.json({ success: true, saved });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] bulk error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET / — đọc comment đã lưu (theo post/page/campaign).
router.get('/', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const where = [];
        const params = [];
        const add = (clause, val) => {
            params.push(val);
            where.push(clause.replace('$?', `$${params.length}`));
        };
        const list = (s) =>
            String(s || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
        const postIds = list(req.query.postIds);
        const pageIds = list(req.query.pageIds);
        if (postIds.length) add('post_id = ANY($?)', postIds);
        if (pageIds.length) add('page_id = ANY($?)', pageIds);
        if (req.query.campaignId) add('campaign_id = $?', String(req.query.campaignId));
        if (req.query.since) add('created_time >= $?', new Date(Number(req.query.since)));
        const limit = Math.min(Number(req.query.limit) || 1000, 5000);
        const sql = `SELECT id, post_id, page_id, page_name, campaign_id, fb_id, customer_name,
                            message, created_time, phone, address, has_order
                     FROM web2_live_comments
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY created_time DESC LIMIT ${limit}`;
        const r = await pool.query(sql, params);
        res.json({ success: true, data: r.rows });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] list error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /stats?postId= — đếm comment đã lưu cho 1 post.
router.get('/stats', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const postId = req.query.postId ? String(req.query.postId) : null;
        const r = postId
            ? await pool.query(
                  'SELECT COUNT(*)::int AS count FROM web2_live_comments WHERE post_id = $1',
                  [postId]
              )
            : await pool.query('SELECT COUNT(*)::int AS count FROM web2_live_comments');
        res.json({ success: true, count: r.rows[0]?.count || 0 });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Poller pages config (trang tự lấy comment khi livestream) ─────────
async function ensurePollerTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_poller_pages (
            page_id    VARCHAR(50) PRIMARY KEY,
            page_name  VARCHAR(255),
            page_url   TEXT,
            enabled    BOOLEAN DEFAULT true,
            added_at   BIGINT
        );
    `);
}

// GET /poller-pages — list trang đang cấu hình.
router.get('/poller-pages', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        const r = await pool.query(
            'SELECT page_id, page_name, page_url, enabled, added_at FROM web2_live_poller_pages ORDER BY added_at ASC'
        );
        res.json({ success: true, data: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /poller-pages { pageId, pageName, pageUrl } — thêm/cập nhật trang.
router.post('/poller-pages', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const pageId = String(req.body?.pageId || '').trim();
    if (!pageId) return res.status(400).json({ success: false, error: 'pageId required' });
    try {
        await ensurePollerTable(pool);
        await pool.query(
            `INSERT INTO web2_live_poller_pages (page_id, page_name, page_url, enabled, added_at)
             VALUES ($1,$2,$3,true,$4)
             ON CONFLICT (page_id) DO UPDATE SET
                page_name = COALESCE(EXCLUDED.page_name, web2_live_poller_pages.page_name),
                page_url = COALESCE(EXCLUDED.page_url, web2_live_poller_pages.page_url),
                enabled = true`,
            [pageId, req.body?.pageName || null, req.body?.pageUrl || null, Date.now()]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /poller-pages/:pageId { enabled } — bật/tắt.
router.patch('/poller-pages/:pageId', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        await pool.query('UPDATE web2_live_poller_pages SET enabled = $1 WHERE page_id = $2', [
            !!req.body?.enabled,
            String(req.params.pageId),
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /poller-pages/:pageId
router.delete('/poller-pages/:pageId', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        await pool.query('DELETE FROM web2_live_poller_pages WHERE page_id = $1', [
            String(req.params.pageId),
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.upsertComments = upsertComments;
module.exports.ensureTables = ensureTables;
module.exports._notify = _notify;
