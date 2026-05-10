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
    image_gemini_3_1: 8, // multi-image clone, scene-fidelity tốt
    video_std_per_sec: 8,
    video_pro_per_sec: 13,
    video_veo_per_sec: 16, // Veo 3.1 image-to-video, 4K
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

// Ensure wallet row exists. KHÔNG cấp credits free khi signup — user phải nạp
// qua billing/topup để có balance. Trước đây cấp 30 free credits, nhưng admin
// quyết định bỏ (08/05/2026) để tránh user spam tạo account ăn free.
async function ensureWallet(userId) {
    const { rows } = await pool.query(
        `INSERT INTO aikol_credits (user_id, balance, plan)
         VALUES ($1, 0, 'free')
         ON CONFLICT (user_id) DO NOTHING
         RETURNING balance, plan`,
        [userId]
    );
    if (rows[0]) {
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
        sepay_enabled: Boolean(process.env.SEPAY_ACCOUNT_NUMBER),
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

// POST /models/clone-from-image — Multipart upload ref image + name + optional
// prompt → Gemini 3.1 multi-image clone preserves EXACT face/identity from
// reference. Cost: COSTS.image_gemini_3_1 (8cr).
const geminiClone = require('../services/aikol-gemini-clone-service');
router.post('/models/clone-from-image', requireUser, upload.single('file'), async (req, res) => {
    const name = (req.body.name || '').trim();
    const extraPrompt = (req.body.prompt || '').trim();
    if (!name || name.length > 80)
        return res.status(400).json({ error: 'invalid', detail: 'Tên model 1-80 ký tự' });
    if (!req.file)
        return res.status(400).json({ error: 'invalid', detail: 'Cần upload ảnh tham khảo' });
    const refMime = (req.file.mimetype || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(refMime))
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'Chỉ chấp nhận JPEG / PNG / WEBP' });

    const cost = COSTS.image_gemini_3_1;
    const chargeRes = await pool.query(
        `UPDATE aikol_credits SET balance = balance - $2, updated_at = NOW()
             WHERE user_id = $1 AND balance >= $2 RETURNING balance`,
        [req.userId, cost]
    );
    if (!chargeRes.rows[0])
        return res
            .status(402)
            .json({ error: 'insufficient_credits', detail: 'Không đủ credits', cost });
    await pool.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
             VALUES ($1, 'charge', $2, $3)`,
        [req.userId, -cost, `Clone model from image: ${name}`]
    );
    const refund = async (note) => {
        await pool.query(`UPDATE aikol_credits SET balance = balance + $2 WHERE user_id = $1`, [
            req.userId,
            cost,
        ]);
        await pool.query(
            `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
                 VALUES ($1, 'refund', $2, $3)`,
            [req.userId, cost, note]
        );
    };

    // Upload ref image to Bunny first so Gemini service can fetch via URL
    // (cleaner than passing buffer through service signature).
    const tmpKey = `aikol/tmp/ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${refMime
        .split('/')[1]
        .replace('jpeg', 'jpg')}`;
    try {
        await bunny.uploadBuffer(req.file.buffer, tmpKey, refMime);
    } catch (e) {
        await refund(`Bunny tmp upload: ${e.message}`).catch(() => {});
        return res.status(502).json({ error: 'upload_failed', detail: e.message });
    }
    const refUrl = bunny.cdnUrl(tmpKey);

    // Build directive: 100% pixel-level FIDELITY — output phải giống ảnh upload
    // beyond doubt. Nếu user không cho thêm prompt → reproduce 1:1, không sáng
    // tạo. Nếu có prompt → chỉ thay đổi minimal theo prompt, mọi thứ khác y.
    const fidelityCore = [
        '**Preserve identity 100% pixel-level**: eye shape, eye color, eyebrow shape,',
        'nose shape and proportions, mouth shape, lip line, jawline, chin, cheekbones,',
        'ears, face shape, hairline, hair color and texture, skin tone, freckles,',
        'moles, scars, makeup, age, ethnicity, gender, facial expression.',
        'Same person beyond doubt — do NOT smooth, beautify, idealize, age-shift,',
        'stylize, or blend with anyone else.',
    ].join(' ');
    const directive = extraPrompt
        ? [
              'Reproduce this reference image as closely as possible.',
              fidelityCore,
              'Also preserve: head pose, body pose, outfit, accessories, lighting',
              'direction, color palette, background composition.',
              `Apply only this small adjustment per the user request: ${extraPrompt}.`,
              'Do not change anything else. No re-styling, no re-posing, no re-framing.',
              'Photorealistic, natural skin texture, sharp focus on face, ultra detailed.',
          ].join(' ')
        : [
              'Reproduce this reference image with 1:1 pixel-level fidelity — output',
              'must look INDISTINGUISHABLE from the input.',
              fidelityCore,
              'Also preserve: head pose, body pose, outfit, accessories, lighting',
              'direction, color palette, background composition. Do not add, remove,',
              'or modify any element.',
              'Photorealistic, natural skin texture, sharp focus on face, ultra detailed.',
          ].join(' ');

    let result;
    try {
        result = await geminiClone.cloneImage({
            modelImageUrl: refUrl,
            prompt: directive,
        });
    } catch (e) {
        console.error('[aikol] /models/clone-from-image Gemini failed:', e.message);
        await refund(`Gemini clone failed: ${String(e.message).slice(0, 100)}`).catch(() => {});
        return res.status(502).json({ error: 'gen_failed', detail: e.message, refunded: cost });
    }

    const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
    const insRes = await pool.query(
        `INSERT INTO aikol_models (user_id, name, file_path, file_size, mime)
             VALUES ($1, $2, '', $3, $4)
             RETURNING id, EXTRACT(EPOCH FROM created_at)::int AS created_at`,
        [req.userId, name, result.buffer.length, result.mimeType]
    );
    const { id, created_at } = insRes.rows[0];
    const key = `aikol/models/${id}.${ext}`;
    try {
        await bunny.uploadBuffer(result.buffer, key, result.mimeType);
    } catch (uploadErr) {
        await pool.query(`DELETE FROM aikol_models WHERE id = $1`, [id]);
        await refund(`Bunny upload: ${uploadErr.message}`).catch(() => {});
        return res.status(502).json({ error: 'upload_failed', detail: uploadErr.message });
    }
    await pool.query(`UPDATE aikol_models SET file_path = $1 WHERE id = $2`, [key, id]);
    const balRes = await pool.query(`SELECT balance FROM aikol_credits WHERE user_id = $1`, [
        req.userId,
    ]);
    res.json({
        id,
        name,
        file_path: key,
        mime: result.mimeType,
        file_size: result.buffer.length,
        thumb_url: bunny.cdnUrl(key),
        created_at,
        updated_at: created_at,
        ai_model: result.model,
        ref_url: refUrl,
        balance: balRes.rows[0]?.balance,
        cost,
    });
});

// POST /products/upload-outfit — multipart upload outfit/clothing image lên
// Bunny tmp/. Trả CDN URL cho frontend dùng làm config.outfit_url khi submit
// /generations với gen_mode='product'.
router.post('/products/upload-outfit', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'invalid', detail: 'Outfit image file required' });
    const mime = (req.file.mimetype || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime))
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'Chỉ chấp nhận JPEG / PNG / WEBP' });
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const key = `aikol/tmp/outfit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
        await bunny.uploadBuffer(req.file.buffer, key, mime);
        return res.json({ url: bunny.cdnUrl(key), key });
    } catch (e) {
        console.error('[aikol] /products/upload-outfit', e);
        return res.status(502).json({ error: 'upload_failed', detail: e.message });
    }
});

// POST /models/describe-image — Multipart image upload → portrait prompt text
// (FREE — Gemini Vision describe, ~$0.001/call). Returns { prompt: "..." } that
// frontend fills into the "Mô tả" textarea for Section 2 Tạo bằng AI.
const geminiDescribe = require('../services/aikol-gemini-describe-service');
router.post('/models/describe-image', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'invalid', detail: 'Image file required' });
    }
    const mime = (req.file.mimetype || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'Chỉ chấp nhận JPEG / PNG / WEBP' });
    }
    try {
        const r = await geminiDescribe.describeFromImage({
            buffer: req.file.buffer,
            mimeType: mime,
        });
        res.json({ prompt: r.prompt, model: r.model });
    } catch (e) {
        console.error('[aikol] /models/describe-image', e.message);
        res.status(502).json({ error: 'describe_failed', detail: e.message });
    }
});

// POST /models/generate — Tạo model bằng AI (Gemini 2.5 Flash Image / Nano Banana)
// Body: { name, prompt, aspectRatio? } → charges COSTS.image credits, generates
// portrait via Gemini, uploads to Bunny, inserts aikol_models row.
const geminiImg = require('../services/aikol-gemini-image-service');
router.post('/models/generate', requireUser, express.json(), async (req, res) => {
    const name = (req.body.name || '').trim();
    const prompt = (req.body.prompt || '').trim();
    const aspectRatio = (req.body.aspectRatio || '').trim() || undefined;
    if (!name || name.length > 80)
        return res.status(400).json({ error: 'invalid', detail: 'Tên model 1-80 ký tự' });
    if (!prompt || prompt.length < 10)
        return res
            .status(400)
            .json({ error: 'invalid', detail: 'Prompt phải ≥10 ký tự (mô tả model)' });
    if (prompt.length > 2000)
        return res.status(400).json({ error: 'invalid', detail: 'Prompt tối đa 2000 ký tự' });

    const cost = COSTS.image; // 4 credits, match Fal/Gemini single image
    // Charge credits BEFORE generation; refund on any failure.
    const chargeRes = await pool.query(
        `UPDATE aikol_credits SET balance = balance - $2, updated_at = NOW()
         WHERE user_id = $1 AND balance >= $2
         RETURNING balance`,
        [req.userId, cost]
    );
    if (!chargeRes.rows[0]) {
        return res
            .status(402)
            .json({ error: 'insufficient_credits', detail: 'Không đủ credits', cost });
    }
    await pool.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
         VALUES ($1, 'charge', $2, $3)`,
        [req.userId, -cost, `AI model gen: ${name}`]
    );

    const refund = async (note) => {
        await pool.query(`UPDATE aikol_credits SET balance = balance + $2 WHERE user_id = $1`, [
            req.userId,
            cost,
        ]);
        await pool.query(
            `INSERT INTO aikol_credit_history (user_id, kind, delta, note)
             VALUES ($1, 'refund', $2, $3)`,
            [req.userId, cost, note]
        );
    };

    let result;
    try {
        result = await geminiImg.generatePortrait({ prompt, aspectRatio });
    } catch (e) {
        console.error('[aikol] /models/generate Gemini failed:', e.message);
        await refund(`Gemini gen failed: ${String(e.message).slice(0, 100)}`).catch(() => {});
        return res.status(502).json({
            error: 'gen_failed',
            detail: e.message,
            refunded: cost,
        });
    }

    const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
    const insRes = await pool.query(
        `INSERT INTO aikol_models (user_id, name, file_path, file_size, mime)
         VALUES ($1, $2, '', $3, $4)
         RETURNING id, EXTRACT(EPOCH FROM created_at)::int AS created_at`,
        [req.userId, name, result.buffer.length, result.mimeType]
    );
    const { id, created_at } = insRes.rows[0];
    const key = `aikol/models/${id}.${ext}`;
    try {
        await bunny.uploadBuffer(result.buffer, key, result.mimeType);
    } catch (uploadErr) {
        await pool.query(`DELETE FROM aikol_models WHERE id = $1`, [id]);
        await refund(`Bunny upload failed: ${String(uploadErr.message).slice(0, 100)}`).catch(
            () => {}
        );
        return res.status(502).json({ error: 'upload_failed', detail: uploadErr.message });
    }
    await pool.query(`UPDATE aikol_models SET file_path = $1 WHERE id = $2`, [key, id]);

    // Get updated balance
    const balRes = await pool.query(`SELECT balance FROM aikol_credits WHERE user_id = $1`, [
        req.userId,
    ]);

    res.json({
        id,
        name,
        file_path: key,
        mime: result.mimeType,
        file_size: result.buffer.length,
        thumb_url: bunny.cdnUrl(key),
        created_at,
        updated_at: created_at,
        ai_model: result.model,
        balance: balRes.rows[0]?.balance,
        cost,
    });
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
