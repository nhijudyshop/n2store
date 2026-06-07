// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Chiến dịch Live (thay TPOS SaleOnline_LiveCampaign).
// =====================================================================
// /api/web2-live-campaigns — CRUD chiến dịch live RIÊNG Web 2.0 (web2Db),
// thay TPOS OData SaleOnline_LiveCampaign. Response giữ field name TPOS-compat
// (Id, Name, Note, IsActive, Config, Facebook_UserId/UserName/LiveId, DateCreated)
// → frontend live-campaign-app.js gần như KHÔNG đổi.
//
//   GET    /list?search=&status=&from=&to=&top=&skip=&orderby=  → {value,count}
//   GET    /:id
//   POST   /            (create)
//   PUT    /:id         (update)
//   DELETE /:id
//   SSE topic: web2:live-campaigns
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:live-campaigns', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-LIVECAMP] _notify fail:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

let _ready = false;
async function ensureSchema(pool) {
    if (_ready || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_campaigns (
            id            BIGSERIAL PRIMARY KEY,
            name          VARCHAR(255) NOT NULL,
            note          TEXT,
            is_active     BOOLEAN NOT NULL DEFAULT true,
            config        VARCHAR(60) DEFAULT 'Draft',
            fb_user_id    VARCHAR(60),   -- FB page id
            fb_user_name  VARCHAR(255),  -- FB page name
            fb_live_id    VARCHAR(120),  -- pageId_videoId
            date_created  BIGINT NOT NULL,
            history       JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_by    VARCHAR(100),
            created_at    BIGINT NOT NULL,
            updated_at    BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_web2_livecamp_active ON web2_live_campaigns(is_active);
        CREATE INDEX IF NOT EXISTS idx_web2_livecamp_date ON web2_live_campaigns(date_created DESC);
    `);
    _ready = true;
    console.log('[WEB2-LIVECAMP] schema ready (web2Db)');
}

// Map row → TPOS-compatible shape (frontend không phải đổi field).
function mapRow(r) {
    return {
        Id: String(r.id),
        Name: r.name,
        Note: r.note || null,
        IsActive: !!r.is_active,
        Config: r.config || 'Draft',
        Facebook_UserId: r.fb_user_id || null,
        Facebook_UserName: r.fb_user_name || null,
        Facebook_LiveId: r.fb_live_id || null,
        DateCreated: r.date_created ? new Date(Number(r.date_created)).toISOString() : null,
        DateModified: r.updated_at ? new Date(Number(r.updated_at)).toISOString() : null,
        history: Array.isArray(r.history) ? r.history : [],
    };
}

function histEntry(action, b) {
    return {
        ts: Date.now(),
        action,
        userId: b?.userId || null,
        userName: b?.userName || '(ẩn danh)',
    };
}

// ─── GET /list ──────────────────────────────────────────────────────────
router.get('/list', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureSchema(pool);
        const { search, status, from, to } = req.query;
        const top = Math.min(500, parseInt(req.query.top, 10) || 50);
        const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
        const conds = [];
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            conds.push(`name ILIKE $${params.length}`);
        }
        if (status === 'active') conds.push('is_active = true');
        else if (status === 'inactive') conds.push('is_active = false');
        if (from) {
            params.push(Number(from));
            conds.push(`date_created >= $${params.length}`);
        }
        if (to) {
            params.push(Number(to));
            conds.push(`date_created <= $${params.length}`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const cnt = await pool.query(
            `SELECT COUNT(*)::int n FROM web2_live_campaigns ${where}`,
            params
        );
        const lp = [...params, top, skip];
        const r = await pool.query(
            `SELECT * FROM web2_live_campaigns ${where}
             ORDER BY date_created DESC NULLS LAST
             LIMIT $${lp.length - 1} OFFSET $${lp.length}`,
            lp
        );
        res.json({ value: r.rows.map(mapRow), count: cnt.rows[0].n });
    } catch (e) {
        console.error('[WEB2-LIVECAMP] list error:', e.message);
        res.status(500).json({ error: e.message, value: [], count: 0 });
    }
});

// ─── GET /:id ───────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureSchema(pool);
        const r = await pool.query('SELECT * FROM web2_live_campaigns WHERE id = $1', [
            parseInt(req.params.id, 10),
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(mapRow(r.rows[0]));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── POST / (create) ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureSchema(pool);
        const b = req.body || {};
        const name = String(b.Name || b.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Name required' });
        const now = Date.now();
        const r = await pool.query(
            `INSERT INTO web2_live_campaigns
                (name, note, is_active, config, fb_user_id, fb_user_name, fb_live_id,
                 date_created, history, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$8,$8) RETURNING *`,
            [
                name,
                b.Note || b.note || null,
                b.IsActive !== false,
                b.Config || b.config || 'Draft',
                b.Facebook_UserId || null,
                b.Facebook_UserName || null,
                b.Facebook_LiveId || null,
                now,
                JSON.stringify([histEntry('create', b)]),
                b.userId || null,
            ]
        );
        _notify('create', r.rows[0].id);
        res.json(mapRow(r.rows[0]));
    } catch (e) {
        console.error('[WEB2-LIVECAMP] create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── PUT /:id (update) ──────────────────────────────────────────────────
router.put('/:id', updateHandler);
router.patch('/:id', updateHandler);
async function updateHandler(req, res) {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureSchema(pool);
        const id = parseInt(req.params.id, 10);
        const b = req.body || {};
        const cur = await pool.query('SELECT * FROM web2_live_campaigns WHERE id = $1', [id]);
        if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
        const hist = Array.isArray(cur.rows[0].history) ? cur.rows[0].history.slice() : [];
        hist.push(histEntry('update', b));
        const pick = (camel, snakeCur) =>
            b[camel] !== undefined ? b[camel] : cur.rows[0][snakeCur];
        const r = await pool.query(
            `UPDATE web2_live_campaigns SET
                name = $2, note = $3, is_active = $4, config = $5,
                fb_user_id = $6, fb_user_name = $7, fb_live_id = $8,
                history = $9::jsonb, updated_at = $10
             WHERE id = $1 RETURNING *`,
            [
                id,
                pick('Name', 'name') || cur.rows[0].name,
                pick('Note', 'note'),
                b.IsActive !== undefined ? !!b.IsActive : cur.rows[0].is_active,
                pick('Config', 'config'),
                pick('Facebook_UserId', 'fb_user_id'),
                pick('Facebook_UserName', 'fb_user_name'),
                pick('Facebook_LiveId', 'fb_live_id'),
                JSON.stringify(hist),
                Date.now(),
            ]
        );
        _notify('update', id);
        res.json(mapRow(r.rows[0]));
    } catch (e) {
        console.error('[WEB2-LIVECAMP] update error:', e.message);
        res.status(500).json({ error: e.message });
    }
}

// ─── DELETE /:id ────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureSchema(pool);
        const id = parseInt(req.params.id, 10);
        await pool.query('DELETE FROM web2_live_campaigns WHERE id = $1', [id]);
        _notify('delete', id);
        res.json({ Id: String(id), deleted: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureSchema = ensureSchema;
