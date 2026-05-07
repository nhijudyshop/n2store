// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL CAMPAIGNS — saved (model × clip-filter × config) bundles to re-run.
// Mounted under /api/aikol/* alongside other aikol sub-routers.
//
// Endpoints:
//   GET    /campaigns           — list user's campaigns
//   POST   /campaigns           — create
//   GET    /campaigns/:id       — single campaign
//   PATCH  /campaigns/:id       — update name/config
//   DELETE /campaigns/:id
//   POST   /campaigns/:id/run   — submit generations across matching clips
//
// Bulk run flow:
//   1. Resolve clips by filter (platform/username/favorite_only/min_views/limit).
//   2. Fan-out into N generations (one per clip × variations).
//   3. Up-front balance check; abort if insufficient.
//   4. Atomic charge per row (single TX).
//   5. Worker tick — same as POST /generations.
// =====================================================

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const COSTS = {
    image: 4,
    video_std_per_sec: 8,
    video_pro_per_sec: 13,
    video_min_seconds: 3,
    max_variations: 10,
    max_clips_per_run: 50,
};

// ---------- helpers ----------
function getUserId(req) {
    const direct = req.header('X-User-Id') || req.query.user_id;
    if (direct) return String(direct);
    const authData = req.header('X-Auth-Data');
    if (authData) {
        try {
            const p = JSON.parse(authData);
            return p.userId || p.uid || p.email || null;
        } catch {}
    }
    return null;
}
function requireUser(req, res, next) {
    const uid = getUserId(req);
    if (!uid) return res.status(401).json({ error: 'auth_required', detail: 'Missing X-User-Id' });
    req.userId = uid;
    next();
}
function clampInt(n, min, max, fallback) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, v));
}
function computeImageCost(config) {
    return COSTS.image * clampInt(config.variations, 1, COSTS.max_variations, 1);
}
function computeVideoCost(config) {
    const seconds = Math.max(COSTS.video_min_seconds, clampInt(config.duration_seconds, 3, 10, 5));
    const perSec = config.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec;
    return perSec * seconds;
}

// ---------- LIST ----------
router.get('/campaigns', requireUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, platform, username, favorite_only, min_views, model_id, kind, config,
                    last_run_count,
                    EXTRACT(EPOCH FROM created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM last_run_at)::int AS last_run_at
             FROM aikol_campaigns
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.userId]
        );
        res.json({ campaigns: rows });
    } catch (e) {
        console.error('[aikol] GET /campaigns', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- CREATE ----------
router.post('/campaigns', requireUser, express.json(), async (req, res) => {
    const { name, platform, username, favorite_only, min_views, model_id, kind, config } =
        req.body || {};
    if (!name || String(name).trim().length === 0) {
        return res.status(400).json({ error: 'invalid', detail: 'name required' });
    }
    if (kind !== 'image' && kind !== 'video') {
        return res.status(400).json({ error: 'invalid', detail: 'kind must be image|video' });
    }
    const modelId = parseInt(model_id, 10);
    if (!Number.isFinite(modelId)) {
        return res.status(400).json({ error: 'invalid', detail: 'model_id required' });
    }
    // Validate model belongs to user.
    const m = await pool.query(`SELECT id FROM aikol_models WHERE id = $1 AND user_id = $2`, [
        modelId,
        req.userId,
    ]);
    if (!m.rows[0]) return res.status(404).json({ error: 'model_not_found' });

    try {
        const ins = await pool.query(
            `INSERT INTO aikol_campaigns
                (user_id, name, platform, username, favorite_only, min_views, model_id, kind, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, name, platform, username, favorite_only, min_views, model_id, kind, config,
                       last_run_count,
                       EXTRACT(EPOCH FROM created_at)::int AS created_at,
                       EXTRACT(EPOCH FROM last_run_at)::int AS last_run_at`,
            [
                req.userId,
                String(name).trim().slice(0, 200),
                platform || null,
                username || null,
                Boolean(favorite_only),
                min_views == null ? null : parseInt(min_views, 10),
                modelId,
                kind,
                JSON.stringify(config || {}),
            ]
        );
        res.json(ins.rows[0]);
    } catch (e) {
        console.error('[aikol] POST /campaigns', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

// ---------- GET single ----------
router.get('/campaigns/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query(
        `SELECT id, name, platform, username, favorite_only, min_views, model_id, kind, config,
                last_run_count,
                EXTRACT(EPOCH FROM created_at)::int AS created_at,
                EXTRACT(EPOCH FROM last_run_at)::int AS last_run_at
         FROM aikol_campaigns
         WHERE id = $1 AND user_id = $2`,
        [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
});

// ---------- PATCH ----------
router.patch('/campaigns/:id', requireUser, express.json(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { name, config, favorite_only, min_views, platform, username, kind } = req.body || {};
    const sets = [];
    const params = [id, req.userId];
    function add(field, value) {
        params.push(value);
        sets.push(`${field} = $${params.length}`);
    }
    if (name !== undefined) add('name', String(name).slice(0, 200));
    if (config !== undefined) add('config', JSON.stringify(config || {}));
    if (favorite_only !== undefined) add('favorite_only', Boolean(favorite_only));
    if (min_views !== undefined)
        add('min_views', min_views == null ? null : parseInt(min_views, 10));
    if (platform !== undefined) add('platform', platform || null);
    if (username !== undefined) add('username', username || null);
    if (kind !== undefined) {
        if (kind !== 'image' && kind !== 'video') {
            return res.status(400).json({ error: 'invalid', detail: 'kind must be image|video' });
        }
        add('kind', kind);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'no_fields' });
    const sql = `UPDATE aikol_campaigns SET ${sets.join(
        ', '
    )} WHERE id = $1 AND user_id = $2 RETURNING id`;
    const { rows } = await pool.query(sql, params);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, id });
});

// ---------- DELETE ----------
router.delete('/campaigns/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query(
        `DELETE FROM aikol_campaigns WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, id });
});

// ---------- POST /campaigns/:id/run ----------
router.post('/campaigns/:id/run', requireUser, express.json(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const camp = await pool.query(`SELECT * FROM aikol_campaigns WHERE id = $1 AND user_id = $2`, [
        id,
        req.userId,
    ]);
    if (!camp.rows[0]) return res.status(404).json({ error: 'not_found' });
    const c = camp.rows[0];
    const conf = typeof c.config === 'string' ? JSON.parse(c.config) : c.config || {};

    return runBulk(req, res, {
        userId: req.userId,
        campaignId: c.id,
        kind: c.kind,
        model_id: c.model_id,
        platform: c.platform,
        username: c.username,
        favorite_only: c.favorite_only,
        min_views: c.min_views,
        config: conf,
        limit: clampInt(req.body?.limit, 1, COSTS.max_clips_per_run, 20),
    });
});

// ---------- POST /bulk ----------
// Body: { kind, model_id, config, filter: { platform?, username?, favorite_only?, min_views? }, limit }
// One-shot bulk run without saving as a campaign.
router.post('/bulk', requireUser, express.json(), async (req, res) => {
    const { kind, model_id, config, filter, limit } = req.body || {};
    if (kind !== 'image' && kind !== 'video') {
        return res.status(400).json({ error: 'invalid', detail: 'kind must be image|video' });
    }
    const modelId = parseInt(model_id, 10);
    if (!Number.isFinite(modelId)) {
        return res.status(400).json({ error: 'invalid', detail: 'model_id required' });
    }
    const f = filter || {};
    return runBulk(req, res, {
        userId: req.userId,
        campaignId: null,
        kind,
        model_id: modelId,
        platform: f.platform || null,
        username: f.username || null,
        favorite_only: Boolean(f.favorite_only),
        min_views: f.min_views == null ? null : parseInt(f.min_views, 10),
        config: config || {},
        limit: clampInt(limit, 1, COSTS.max_clips_per_run, 10),
    });
});

async function runBulk(req, res, args) {
    const {
        userId,
        campaignId,
        kind,
        model_id,
        platform,
        username,
        favorite_only,
        min_views,
        config,
        limit,
    } = args;

    // Validate model.
    const modelOk = await pool.query(`SELECT id FROM aikol_models WHERE id = $1 AND user_id = $2`, [
        model_id,
        userId,
    ]);
    if (!modelOk.rows[0]) return res.status(404).json({ error: 'model_not_found' });

    // Resolve matching clips.
    const params = [userId];
    let where = `user_id = $1 AND download_status = 'done'`;
    if (platform) {
        params.push(platform);
        where += ` AND platform = $${params.length}`;
    }
    if (username) {
        params.push(username);
        where += ` AND username = $${params.length}`;
    }
    if (favorite_only) {
        where += ` AND favorite = TRUE`;
    }
    if (min_views != null && Number.isFinite(min_views)) {
        params.push(min_views);
        where += ` AND COALESCE(view_count, 0) >= $${params.length}`;
    }
    params.push(limit);
    const clipsQ = await pool.query(
        `SELECT id FROM aikol_clips WHERE ${where} ORDER BY imported_at DESC LIMIT $${params.length}`,
        params
    );
    const clipIds = clipsQ.rows.map((r) => r.id);
    if (clipIds.length === 0) {
        return res
            .status(404)
            .json({ error: 'no_clips_match', detail: 'Không có clip nào khớp filter' });
    }

    const perJobCost = kind === 'image' ? computeImageCost(config) : computeVideoCost(config);
    const totalCost = perJobCost * clipIds.length;

    const wallet = await pool.query(`SELECT balance FROM aikol_credits WHERE user_id = $1`, [
        userId,
    ]);
    const balance = wallet.rows[0]?.balance ?? 0;
    if (balance < totalCost) {
        return res.status(402).json({
            error: 'insufficient_credits',
            detail: `Cần ${totalCost} credits cho ${clipIds.length} clips, có ${balance}`,
            balance,
            cost: totalCost,
            clips_count: clipIds.length,
        });
    }

    // Atomic INSERT + charge per row.
    const created = [];
    const note = config.note || null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const clipId of clipIds) {
            const ins = await client.query(
                `INSERT INTO aikol_generations
                    (user_id, clip_id, model_id, kind, config, state, cost_credits)
                 VALUES ($1, $2, $3, $4, $5, 'pending', $6)
                 RETURNING id`,
                [userId, clipId, model_id, kind, JSON.stringify({ ...config, note }), perJobCost]
            );
            const genId = ins.rows[0].id;
            const charged = await client.query(
                `UPDATE aikol_credits SET balance = balance - $2, updated_at = NOW()
                 WHERE user_id = $1 AND balance >= $2
                 RETURNING balance`,
                [userId, perJobCost]
            );
            if (!charged.rows[0]) throw new Error('insufficient_credits_mid_run');
            await client.query(
                `INSERT INTO aikol_credit_history (user_id, kind, delta, gen_id, note)
                 VALUES ($1, 'charge', $2, $3, $4)`,
                [userId, -perJobCost, genId, `${kind} bulk ${genId.slice(0, 8)}`]
            );
            created.push({ id: genId, clip_id: clipId });
        }
        if (campaignId) {
            await client.query(
                `UPDATE aikol_campaigns SET last_run_at = NOW(), last_run_count = $2 WHERE id = $1`,
                [campaignId, created.length]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        return res.status(500).json({
            error: 'bulk_failed',
            detail: e.message,
            created: created.length,
        });
    } finally {
        client.release();
    }

    // Wake worker.
    try {
        const worker = require('../services/aikol-queue-worker');
        worker.tick().catch(() => {});
    } catch (_) {}

    const balanceAfter = (
        await pool.query(`SELECT balance FROM aikol_credits WHERE user_id = $1`, [userId])
    ).rows[0]?.balance;

    res.json({
        generation_ids: created.map((c) => c.id),
        count: created.length,
        cost_each: perJobCost,
        cost_total: totalCost,
        balance: balanceAfter,
        campaign_id: campaignId,
    });
}

module.exports = router;
