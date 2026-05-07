// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AI KOL STUDIO ROUTES — tikreel clone in n2store/menu "Khác"
// Mounts at /api/aikol/*
// Endpoints:
//   GET  /credits             — wallet balance
//   GET  /credits/history     — credit ledger
//   GET  /costs               — pricing table (matches tikreel)
//   GET  /billing/packs       — top-up packs (VND, SePay)
//   GET    /models            — list portrait models
//   POST   /models            — upload portrait (multipart: file + name)
//   GET    /models/:id/file   — redirect to Bunny CDN
//   DELETE /models/:id        — delete portrait + Bunny object
// =====================================================

const express = require('express');
const multer = require('multer');
const router = express.Router();
const pool = require('../db/pool');
const bunny = require('../services/bunny-storage-service');
const clipsRouter = require('./aikol-clips');
const generationsRouter = require('./aikol-generations');
const billingRouter = require('./aikol-billing');
const campaignsRouter = require('./aikol-campaigns');

const COSTS = {
    image: 4,
    video_std_per_sec: 8,
    video_pro_per_sec: 13,
    video_min_seconds: 3,
    import_per_clip: 1,
    video_std: 80,
    video_pro: 130,
    max_variations: 10,
};

const PACKS = [
    { id: 'mini', name: 'Mini', credits: 180, vnd: 60000, configured: true },
    { id: 'small', name: 'Small', credits: 450, vnd: 150000, configured: true },
    { id: 'standard', name: 'Standard', credits: 900, vnd: 300000, configured: true },
    { id: 'pro', name: 'Pro', credits: 2000, vnd: 600000, configured: true },
    { id: 'power', name: 'Power', credits: 5000, vnd: 1500000, configured: true },
    { id: 'agency', name: 'Agency', credits: 10000, vnd: 3000000, configured: true },
];

// CORS
router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Auth-Data, X-User-Id'
    );
    res.header('Access-Control-Max-Age', '86400');
    next();
});
router.options('*', (_req, res) => res.status(204).send());

// User identification — n2store auth uses X-User-Id header (legacy) or
// X-Auth-Data (JSON-encoded auth object). Accept both.
function getUserId(req) {
    const direct = req.header('X-User-Id') || req.query.user_id;
    if (direct) return String(direct);
    const authData = req.header('X-Auth-Data');
    if (authData) {
        try {
            const parsed = JSON.parse(authData);
            return parsed.userId || parsed.uid || parsed.email || null;
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

// Ensure wallet row exists; gives 30 free credits on first call.
async function ensureWallet(userId) {
    const { rows } = await pool.query(
        `INSERT INTO aikol_credits (user_id, balance, plan)
         VALUES ($1, 30, 'free')
         ON CONFLICT (user_id) DO NOTHING
         RETURNING balance, plan`,
        [userId]
    );
    if (rows[0]) {
        // First-time: log the signup bonus
        await pool.query(
            `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
             VALUES ($1, 'signup_bonus', 30, 'Welcome — 30 free credits')`,
            [userId]
        );
        return rows[0];
    }
    const cur = await pool.query(`SELECT balance, plan FROM aikol_credits WHERE user_id = $1`, [
        userId,
    ]);
    return cur.rows[0];
}

// ===== Costs / Pricing =====
router.get('/costs', (_req, res) => res.json(COSTS));
router.get('/billing/packs', (_req, res) =>
    res.json({
        packs: PACKS,
        stripe_enabled: false,
        sepay_enabled: true,
        currency: 'VND',
        memo_prefix: 'AIKOL',
    })
);

// ===== Credits =====
router.get('/credits', requireUser, async (req, res) => {
    try {
        const wallet = await ensureWallet(req.userId);
        res.json({ balance: wallet.balance, plan: wallet.plan });
    } catch (e) {
        console.error('[aikol] /credits', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

router.get('/credits/history', requireUser, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
    try {
        const { rows } = await pool.query(
            `SELECT kind, delta, amount_vnd, bank, memo, gen_id, note, created_at AS at
             FROM aikol_credit_history
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.userId, limit]
        );
        res.json({ history: rows, limit });
    } catch (e) {
        console.error('[aikol] /credits/history', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ===== Models =====
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB matches tikreel UI
});

router.get('/models', requireUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT m.id, m.name, m.file_path, m.file_size, m.mime,
                    EXTRACT(EPOCH FROM m.created_at)::int AS created_at,
                    EXTRACT(EPOCH FROM m.updated_at)::int AS updated_at,
                    COALESCE((
                       SELECT COUNT(*) FROM aikol_outputs o
                       JOIN aikol_generations g ON g.id = o.generation_id
                       WHERE g.model_id = m.id AND g.user_id = $1
                    ), 0) AS output_count
             FROM aikol_models m
             WHERE m.user_id = $1
             ORDER BY m.created_at DESC`,
            [req.userId]
        );
        const models = rows.map((r) => ({
            ...r,
            thumb_url: bunny.cdnUrl(r.file_path),
        }));
        res.json({ models });
    } catch (e) {
        console.error('[aikol] GET /models', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

router.post('/models', requireUser, upload.single('file'), async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'invalid', detail: 'Name is required' });
        if (name.length > 80)
            return res.status(400).json({ error: 'invalid', detail: 'Name too long' });
        if (!req.file)
            return res.status(400).json({ error: 'invalid', detail: 'Image file required' });
        const mime = (req.file.mimetype || '').toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
            return res.status(400).json({ error: 'invalid', detail: 'Only JPEG/PNG/WEBP allowed' });
        }

        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
        // Insert row first to get id, then upload to Bunny under that id
        const insRes = await pool.query(
            `INSERT INTO aikol_models (user_id, name, file_path, file_size, mime)
             VALUES ($1, $2, '', $3, $4)
             RETURNING id, EXTRACT(EPOCH FROM created_at)::int AS created_at`,
            [req.userId, name, req.file.size, mime]
        );
        const { id, created_at } = insRes.rows[0];
        const key = `aikol/models/${id}.${ext}`;
        try {
            await bunny.uploadBuffer(req.file.buffer, key, mime);
        } catch (uploadErr) {
            // Roll back the row if upload failed
            await pool.query(`DELETE FROM aikol_models WHERE id = $1`, [id]);
            console.error('[aikol] Bunny upload failed', uploadErr);
            return res.status(502).json({ error: 'upload_failed', detail: uploadErr.message });
        }
        await pool.query(`UPDATE aikol_models SET file_path = $1 WHERE id = $2`, [key, id]);
        res.json({
            id,
            name,
            file_path: key,
            mime,
            file_size: req.file.size,
            thumb_url: bunny.cdnUrl(key),
            created_at,
            updated_at: created_at,
        });
    } catch (e) {
        console.error('[aikol] POST /models', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

router.get('/models/:id/file', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    try {
        const { rows } = await pool.query(
            `SELECT file_path FROM aikol_models WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.redirect(302, bunny.cdnUrl(rows[0].file_path));
    } catch (e) {
        console.error('[aikol] GET /models/:id/file', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

router.delete('/models/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    try {
        const { rows } = await pool.query(
            `DELETE FROM aikol_models
             WHERE id = $1 AND user_id = $2
             RETURNING file_path`,
            [id, req.userId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        // Best-effort delete; ignore failure (object may have been removed already)
        bunny
            .deleteObject(rows[0].file_path)
            .catch((err) => console.warn('[aikol] Bunny delete failed:', err.message));
        res.json({ ok: true, id });
    } catch (e) {
        console.error('[aikol] DELETE /models/:id', e);
        res.status(500).json({ error: 'server_error', detail: e.message });
    }
});

// ===== Health =====
router.get('/health', (_req, res) => {
    res.json({
        ok: true,
        zone: bunny.ZONE,
        cdn: bunny.CDN_HOSTNAME,
        bunny_configured: !!process.env.BUNNY_STORAGE_KEY,
        fal_configured: !!process.env.FAL_KEY,
        kling_configured: !!process.env.KLING_ACCESS_KEY,
        scraper_url: process.env.AIKOL_SCRAPER_URL || null,
    });
});

// ===== Clips + Imports (separate file to keep size <800 lines) =====
router.use('/', clipsRouter);

// ===== Generations + Outputs (Sprint 3 — Fal.ai + Kling) =====
router.use('/', generationsRouter);

// ===== Billing + Settings + Campaigns (Sprint 4) =====
router.use('/', billingRouter);
router.use('/', campaignsRouter);

module.exports = router;
