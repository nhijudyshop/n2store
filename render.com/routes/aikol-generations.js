// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL GENERATIONS — image (Fal.ai) + video (Kling) jobs.
// Mounted under /api/aikol/* alongside aikol.js / aikol-clips.js.
//
// Endpoints:
//   POST   /generations                    — submit job(s) — body { kind, model_id, clip_ids, config, note }
//   GET    /generations?limit&offset       — list user's gen jobs
//   GET    /generations/:id                — single gen detail (with outputs[])
//   GET    /queue                          — active (pending|running) jobs only
//   GET    /outputs?limit&offset&kind      — list completed outputs (image|video)
//   GET    /outputs/:id/file               — 302 to Bunny CDN
//   DELETE /outputs/:id                    — delete output + Bunny object
//
// Pricing (matches COSTS in aikol.js):
//   image:        4 credits per variation
//   video std:   80 credits per clip (10s default)
//   video pro:  130 credits per clip
//   video min:   3 seconds
// =====================================================

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const bunny = require('../services/bunny-storage-service');

const COSTS = {
    image: 4, // Fal PuLID — default
    image_gemini_3_1: 8, // Gemini 3.1 multi-image clone — better scene fidelity
    video_std_per_sec: 8, // Kling std
    video_pro_per_sec: 13, // Kling pro
    video_veo_per_sec: 16, // Veo 3.1 — Google
    video_min_seconds: 3,
    max_variations: 10,
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
    const variations = clampInt(config.variations, 1, COSTS.max_variations, 1);
    const engine = String(config.engine || 'fal_pulid').toLowerCase();
    const perVariation = engine === 'gemini_3_1' ? COSTS.image_gemini_3_1 : COSTS.image;
    return perVariation * variations;
}

function computeVideoCost(config) {
    const seconds = Math.max(COSTS.video_min_seconds, clampInt(config.duration_seconds, 3, 10, 5));
    const engine = String(config.engine || 'kling').toLowerCase();
    let perSec;
    if (engine === 'veo_3_1') {
        perSec = COSTS.video_veo_per_sec;
    } else {
        perSec = config.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec;
    }
    let total = perSec * seconds;
    // Veo with_clip: cần Gemini compose pre-step (worker tự chạy) → cộng 8cr.
    // Kling with_clip: dùng native multi-image2video, KHÔNG cần compose → 0cr extra.
    if (config.gen_mode === 'with_clip' && engine === 'veo_3_1') {
        total += COSTS.image_gemini_3_1;
    }
    return total;
}

async function chargeCredits(client, userId, amount, gen_id, kind, note) {
    const row = await client.query(
        `UPDATE aikol_credits SET balance = balance - $2, updated_at = NOW()
         WHERE user_id = $1 AND balance >= $2
         RETURNING balance`,
        [userId, amount]
    );
    if (!row.rows[0]) {
        const cur = await client.query(`SELECT balance FROM aikol_credits WHERE user_id = $1`, [
            userId,
        ]);
        const have = cur.rows[0]?.balance ?? 0;
        const err = new Error('insufficient_credits');
        err.code = 'insufficient_credits';
        err.balance = have;
        err.needed = amount;
        throw err;
    }
    const balanceAfter = row.rows[0].balance;
    await client.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, gen_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, kind, -amount, gen_id, note]
    );
    return balanceAfter;
}

async function refundCredits(userId, amount, gen_id, note) {
    await pool.query(
        `UPDATE aikol_credits SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, amount]
    );
    await pool.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, gen_id, note)
         VALUES ($1, 'refund', $2, $3, $4)`,
        [userId, amount, gen_id, note]
    );
}

// ---------- POST /generations ----------
// Body: { kind: 'image'|'video', model_id, clip_ids: int[]?, config: {...}, note?: string }
//
// `clip_ids` is optional — image jobs can run from a model alone (no clip).
// If clip_ids is provided, we create one generation row per clip.
router.post('/generations', requireUser, express.json(), async (req, res) => {
    const { kind, model_id, clip_ids, config, note } = req.body || {};
    if (kind !== 'image' && kind !== 'video') {
        return res.status(400).json({ error: 'invalid', detail: '`kind` must be image|video' });
    }
    const modelId = parseInt(model_id, 10);
    if (!Number.isFinite(modelId)) {
        return res.status(400).json({ error: 'invalid', detail: '`model_id` is required' });
    }
    const conf = config && typeof config === 'object' ? config : {};

    // AUTO-TUNE — identity match là priority #1. Khi user chọn with_clip,
    // FORCE settings tối ưu cho preserve identity (override input):
    //   - similarity ≥ 80 (anchor mặt strong)
    //   - creativity ≤ 30 (giảm Veo/Gemini drift)
    //   - keep_pose, keep_outfit, keep_bg, keep_lighting = true (giữ scene clip)
    //   - engine image: gemini_3_1 (Fal PuLID locked + identity tốt hơn)
    //   - engine video: veo_3_1 default Veo 2.0 (no audio safety filter)
    // User có thể override qua flag `auto_tune: false` trong config.
    if (conf.auto_tune !== false && conf.gen_mode === 'with_clip') {
        conf.similarity = Math.max(80, parseInt(conf.similarity, 10) || 80);
        conf.creativity = Math.min(30, parseInt(conf.creativity, 10) || 30);
        conf.keep_pose = true;
        conf.keep_outfit = true;
        conf.keep_bg = true;
        conf.keep_lighting = true;
        if (kind === 'image' && conf.engine !== 'gemini_3_1' && conf.engine !== 'fal_pulid') {
            conf.engine = 'gemini_3_1';
        }
        if (kind === 'video' && !conf.engine) {
            conf.engine = 'veo_3_1';
        }
    }

    // Validate model belongs to user.
    const modelRow = await pool.query(
        `SELECT id, file_path FROM aikol_models WHERE id = $1 AND user_id = $2`,
        [modelId, req.userId]
    );
    if (!modelRow.rows[0]) {
        return res.status(404).json({ error: 'not_found', detail: 'Model not found' });
    }

    const clipsArr = Array.isArray(clip_ids) ? clip_ids.filter((x) => Number.isFinite(+x)) : [];
    if (kind === 'video' && clipsArr.length === 0) {
        // Video gen still allowed without clip (image-to-video) — skip clip validation.
    }

    let clipsValid = [];
    if (clipsArr.length > 0) {
        const { rows } = await pool.query(
            `SELECT id, file_path FROM aikol_clips
             WHERE user_id = $1 AND id = ANY($2::int[])`,
            [req.userId, clipsArr.map((x) => +x)]
        );
        clipsValid = rows;
        if (clipsValid.length === 0) {
            return res.status(400).json({ error: 'invalid', detail: 'No valid clips' });
        }
    }

    const targets = clipsValid.length > 0 ? clipsValid : [{ id: null, file_path: null }];
    const perJobCost = kind === 'image' ? computeImageCost(conf) : computeVideoCost(conf);

    // Atomic charge inside transaction — chargeCredits dùng `WHERE balance >= $2`
    // an toàn cho concurrent. KHÔNG pre-check balance vì pre-check race với
    // concurrent POST khác (cả 2 cùng pass pre-check rồi cùng charge → balance âm).
    const created = [];
    let lastBalance = null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const c of targets) {
            const ins = await client.query(
                `INSERT INTO aikol_generations
                    (user_id, clip_id, model_id, kind, config, state, cost_credits)
                 VALUES ($1, $2, $3, $4, $5, 'pending', $6)
                 RETURNING id, EXTRACT(EPOCH FROM created_at)::int AS created_at`,
                [req.userId, c.id, modelId, kind, JSON.stringify({ ...conf, note }), perJobCost]
            );
            const genId = ins.rows[0].id;
            lastBalance = await chargeCredits(
                client,
                req.userId,
                perJobCost,
                genId,
                'charge',
                `${kind} gen ${genId.slice(0, 8)}`
            );
            created.push({ id: genId, clip_id: c.id, cost: perJobCost });
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e.code === 'insufficient_credits') {
            return res.status(402).json({
                error: 'insufficient_credits',
                detail: `Hết credits sau ${created.length}/${targets.length} jobs`,
                created: created.length,
            });
        }
        console.error('[aikol] POST /generations', e);
        return res.status(500).json({ error: 'server_error', detail: e.message });
    } finally {
        client.release();
    }

    // Wake the worker (no-await — fire and forget).
    try {
        const worker = require('../services/aikol-queue-worker');
        worker.tick().catch((err) => console.warn('[aikol] worker tick:', err.message));
    } catch (_) {}

    res.json({
        generation_ids: created.map((c) => c.id),
        count: created.length,
        cost_each: perJobCost,
        cost_total: perJobCost * created.length,
        balance: lastBalance, // Returned từ chargeCredits trong transaction (consistent).
    });
});

// ---------- GET /generations ----------
router.get('/generations', requireUser, async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const offset = clampInt(req.query.offset, 0, 1_000_000, 0);
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.kind, g.state, g.cost_credits, g.error, g.config,
                    g.clip_id, g.model_id, g.external_id,
                    EXTRACT(EPOCH FROM g.created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM g.started_at)::int AS started_at,
                    EXTRACT(EPOCH FROM g.finished_at)::int AS finished_at,
                    (SELECT COUNT(*)::int FROM aikol_outputs o WHERE o.generation_id = g.id) AS output_count
             FROM aikol_generations g
             WHERE g.user_id = $1
             ORDER BY g.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.userId, limit, offset]
        );
        res.json({ generations: rows });
    } catch (e) {
        console.error('[aikol] GET /generations', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /generations/:id ----------
router.get('/generations/:id', requireUser, async (req, res) => {
    const id = req.params.id;
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.kind, g.state, g.cost_credits, g.error, g.config,
                    g.clip_id, g.model_id, g.external_id,
                    EXTRACT(EPOCH FROM g.created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM g.started_at)::int AS started_at,
                    EXTRACT(EPOCH FROM g.finished_at)::int AS finished_at
             FROM aikol_generations g
             WHERE g.id = $1 AND g.user_id = $2`,
            [id, req.userId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        const gen = rows[0];
        const outputs = await pool.query(
            `SELECT id, variant_index, file_path, file_kind, file_size,
                    EXTRACT(EPOCH FROM created_at)::int AS created_at
             FROM aikol_outputs
             WHERE generation_id = $1
             ORDER BY variant_index ASC`,
            [id]
        );
        gen.outputs = outputs.rows.map((r) => ({
            ...r,
            file_url: bunny.cdnUrl(r.file_path),
        }));
        res.json(gen);
    } catch (e) {
        console.error('[aikol] GET /generations/:id', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /queue ----------
router.get('/queue', requireUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, kind, state, cost_credits, clip_id, model_id, external_id,
                    config,
                    EXTRACT(EPOCH FROM created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM started_at)::int AS started_at
             FROM aikol_generations
             WHERE user_id = $1 AND state IN ('pending', 'dispatching', 'running')
             ORDER BY created_at ASC
             LIMIT 100`,
            [req.userId]
        );
        res.json({ queue: rows, count: rows.length });
    } catch (e) {
        console.error('[aikol] GET /queue', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /outputs ----------
router.get('/outputs', requireUser, async (req, res) => {
    const limit = clampInt(req.query.limit, 1, 200, 50);
    const offset = clampInt(req.query.offset, 0, 1_000_000, 0);
    const kindFilter = ['image', 'video'].includes(req.query.kind) ? req.query.kind : null;
    try {
        const params = [req.userId];
        let where = `o.user_id = $1`;
        if (kindFilter) {
            params.push(kindFilter);
            where += ` AND o.file_kind = $${params.length}`;
        }
        params.push(limit, offset);
        const { rows } = await pool.query(
            `SELECT o.id, o.generation_id, o.variant_index, o.file_path, o.file_kind, o.file_size,
                    EXTRACT(EPOCH FROM o.created_at)::int AS created_at,
                    g.kind AS gen_kind, g.model_id, g.clip_id, g.config
             FROM aikol_outputs o
             JOIN aikol_generations g ON g.id = o.generation_id
             WHERE ${where}
             ORDER BY o.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        const outputs = rows.map((r) => ({ ...r, file_url: bunny.cdnUrl(r.file_path) }));
        res.json({ outputs });
    } catch (e) {
        console.error('[aikol] GET /outputs', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /outputs/:id/file ----------
router.get('/outputs/:id/file', requireUser, async (req, res) => {
    const id = req.params.id;
    const { rows } = await pool.query(
        `SELECT file_path FROM aikol_outputs WHERE id = $1 AND user_id = $2`,
        [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.redirect(302, bunny.cdnUrl(rows[0].file_path));
});

// ---------- DELETE /outputs/:id ----------
router.delete('/outputs/:id', requireUser, async (req, res) => {
    const id = req.params.id;
    const { rows } = await pool.query(
        `DELETE FROM aikol_outputs WHERE id = $1 AND user_id = $2 RETURNING file_path`,
        [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    if (rows[0].file_path) {
        bunny
            .deleteObject(rows[0].file_path)
            .catch((err) => console.warn('[aikol] Bunny delete output:', err.message));
    }
    res.json({ ok: true, id });
});

// ---------- expose helpers for queue worker (refund on failure) ----------
router.__internal = { refundCredits };

module.exports = router;
