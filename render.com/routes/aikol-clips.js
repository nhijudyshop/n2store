// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL CLIPS — TikTok import + MP4 upload + clip CRUD
// Sub-router mounted under /api/aikol/* (combined with main aikol.js).
//
// Endpoints:
//   POST /import/single      — { url } → fetch /tiktok/detail → save MP4 to Bunny → INSERT clip
//   POST /import/upload      — multipart MP4 upload → Bunny → INSERT clip (FREE)
//   GET  /clips?limit&offset — list user clips
//   GET  /clips/:id/file     — 302 redirect to Bunny CDN MP4
//   GET  /clips/:id/poster   — 302 redirect to TikTok cover
//   DELETE /clips/:id        — delete row + Bunny object
//   PATCH  /clips/:id        — toggle favorite { favorite: bool }
// =====================================================

const express = require('express');
const multer = require('multer');
const router = express.Router();
const pool = require('../db/pool');
const bunny = require('../services/bunny-storage-service');
const scraper = require('../services/aikol-scraper-service');

const SINGLE_VIDEO_COST = 1; // 1 credit per single TikTok import (matches tikreel)

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

async function chargeCredits(userId, amount, gen_id, kind, note) {
    const row = await pool.query(
        `UPDATE aikol_credits SET balance = balance - $2, updated_at = NOW()
         WHERE user_id = $1 AND balance >= $2
         RETURNING balance`,
        [userId, amount]
    );
    if (!row.rows[0]) throw new Error('insufficient_credits');
    await pool.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, gen_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, kind, -amount, gen_id, note]
    );
    return row.rows[0].balance;
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

// ---------- POST /import/single — paste 1 TikTok video URL ----------
router.post('/import/single', requireUser, express.json(), async (req, res) => {
    const { url } = req.body || {};
    let videoId, username;
    try {
        const parsed = scraper.parseTiktokUrl(url);
        videoId = parsed.videoId;
        username = parsed.username;
    } catch (e) {
        return res.status(400).json({ error: 'invalid_url', detail: e.message });
    }

    // Check duplicate (same user already imported this video)
    const dupe = await pool.query(
        `SELECT id FROM aikol_clips WHERE user_id = $1 AND platform = 'tiktok' AND video_id = $2`,
        [req.userId, videoId]
    );
    if (dupe.rows[0]) {
        return res.status(409).json({
            error: 'already_imported',
            detail: 'Clip này đã có trong library',
            clip_id: dupe.rows[0].id,
        });
    }

    // Charge credits BEFORE scrape (refund on failure)
    let balanceAfter;
    try {
        balanceAfter = await chargeCredits(
            req.userId,
            SINGLE_VIDEO_COST,
            null,
            'charge',
            `Import TikTok ${videoId}`
        );
    } catch (e) {
        if (e.message === 'insufficient_credits') {
            return res.status(402).json({
                error: 'insufficient_credits',
                detail: 'Không đủ credits',
                cost: SINGLE_VIDEO_COST,
            });
        }
        throw e;
    }

    let clipId;
    let detail;
    try {
        // 1. Fetch metadata from scraper (no cookie required for /tiktok/detail)
        detail = await scraper.fetchTiktokVideoDetail(videoId);
        // 2. Insert clip row with metadata, status 'running' until MP4 download attempted
        const ins = await pool.query(
            `INSERT INTO aikol_clips (user_id, platform, username, video_id, video_url, cover_url, title, duration, file_path, download_status)
             VALUES ($1, 'tiktok', $2, $3, $4, $5, $6, $7, '', 'running')
             RETURNING id`,
            [
                req.userId,
                username,
                videoId,
                url.trim(),
                detail.staticCover,
                detail.title,
                detail.durationSeconds,
            ]
        );
        clipId = ins.rows[0].id;
    } catch (e) {
        console.error('[aikol] /import/single metadata fetch failed', e);
        await refundCredits(
            req.userId,
            SINGLE_VIDEO_COST,
            null,
            `Metadata: ${String(e.message).slice(0, 100)}`
        ).catch(() => {});
        return res
            .status(502)
            .json({ error: 'metadata_failed', detail: e.message, refunded: SINGLE_VIDEO_COST });
    }

    // 3. Try MP4 download. Akamai signed URLs are cookie-bound (`tt_chain_token`);
    // without cookie they 403. Degrade gracefully — keep metadata, mark as 'pending'
    // so the generation pipeline can retry/proxy the download later.
    try {
        if (!detail.downloadUrl) throw new Error('No download URL from scraper');
        const { buffer } = await scraper.downloadToBuffer(detail.downloadUrl);
        const key = `aikol/clips/${clipId}.mp4`;
        await bunny.uploadBuffer(buffer, key, 'video/mp4');
        await pool.query(
            `UPDATE aikol_clips SET file_path = $1, file_size = $2, download_status = 'done', downloaded_at = NOW() WHERE id = $3`,
            [key, buffer.length, clipId]
        );
        return res.json({
            clip_id: clipId,
            video_id: videoId,
            username,
            duration: detail.durationSeconds,
            file_size: buffer.length,
            title: detail.title,
            cover_url: detail.staticCover,
            balance: balanceAfter,
            mp4_status: 'done',
        });
    } catch (e) {
        console.warn('[aikol] /import/single MP4 deferred (metadata kept):', e.message);
        await pool
            .query(`UPDATE aikol_clips SET download_status = 'pending', error = $1 WHERE id = $2`, [
                `MP4 download deferred: ${String(e.message).slice(0, 200)}`,
                clipId,
            ])
            .catch(() => {});
        // Don't refund — metadata IS valuable (cover, title, duration, embed-able)
        return res.status(202).json({
            clip_id: clipId,
            video_id: videoId,
            username,
            duration: detail.durationSeconds,
            title: detail.title,
            cover_url: detail.staticCover,
            balance: balanceAfter,
            mp4_status: 'deferred',
            warning:
                'Metadata + cover saved. MP4 download cần TikTok cookie (sẽ thử lại khi cookie sẵn sàng).',
        });
    }
});

// ---------- POST /import/channel — list user's TikTok videos for batch import ----------
// Returns video metadata only — does NOT charge credits or persist clips. The
// frontend then calls /import/single per video (parallel, 1 credit each) so
// users can preview + cancel before paying. Already-imported videos are flagged
// with `already_imported: true` in the response so the UI can hide their button.
router.post('/import/channel', requireUser, express.json(), async (req, res) => {
    const { url, count, cookie } = req.body || {};
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'invalid', detail: 'url required' });
    }
    const limit = Math.max(1, Math.min(parseInt(count, 10) || 20, 35));

    // Step 1: resolve URL → secUid
    const resolved = await scraper.resolveTiktokSecUid(url);
    if (!resolved) {
        return res.status(400).json({
            error: 'cannot_resolve',
            detail:
                'Không lấy được secUid từ URL (TikTok có thể đã chặn IP server). ' +
                'Bạn có thể paste secUid trực tiếp (chuỗi bắt đầu MS4wLjAB...) thay vì link.',
        });
    }

    // Step 2: fetch account videos via self-hosted scraper.
    // Use admin-provided cookie env if user didn't pass one.
    const effectiveCookie = cookie || process.env.AIKOL_TIKTOK_COOKIE || '';
    let result;
    try {
        result = await scraper.fetchTiktokAccountVideos({
            secUid: resolved.secUid,
            cookie: effectiveCookie,
            count: limit,
            cursor: 0,
        });
    } catch (e) {
        console.error('[aikol] /import/channel scraper failed', e);
        return res.status(502).json({
            error: 'scraper_failed',
            detail: e.message,
            hint: effectiveCookie
                ? 'Cookie có thể đã hết hạn — admin cần update AIKOL_TIKTOK_COOKIE env.'
                : 'Channel scrape cần TikTok cookie. Admin cần set env AIKOL_TIKTOK_COOKIE trên scraper service.',
        });
    }

    if (!result.videos.length) {
        return res.status(200).json({
            sec_user_id: resolved.secUid,
            unique_id: resolved.uniqueId,
            videos: [],
            already_imported_ids: [],
            hint: 'Scraper trả 0 video. Có thể kênh private, không có video, hoặc cookie đã hết hạn.',
        });
    }

    // Step 3: flag which video_ids the user already has in their library
    const ids = result.videos.map((v) => v.videoId);
    const dupes = await pool.query(
        `SELECT video_id FROM aikol_clips
         WHERE user_id = $1 AND platform = 'tiktok' AND video_id = ANY($2)`,
        [req.userId, ids]
    );
    const dupeSet = new Set(dupes.rows.map((r) => r.video_id));

    res.json({
        sec_user_id: resolved.secUid,
        unique_id: resolved.uniqueId,
        videos: result.videos.map((v) => ({ ...v, already_imported: dupeSet.has(v.videoId) })),
        already_imported_ids: Array.from(dupeSet),
        has_more: result.hasMore,
        cursor: result.cursor,
        cost_per_video: SINGLE_VIDEO_COST,
    });
});

// ---------- POST /import/upload — local MP4 (FREE) ----------
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB matches tikreel UI cap
});

router.post('/import/upload', requireUser, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'invalid', detail: 'MP4 file required' });
    const mime = (req.file.mimetype || '').toLowerCase();
    if (!['video/mp4', 'video/quicktime'].includes(mime)) {
        return res.status(400).json({ error: 'invalid', detail: 'Chỉ chấp nhận MP4 hoặc MOV' });
    }

    const ext = mime === 'video/mp4' ? 'mp4' : 'mov';
    const title = (req.body.title || req.file.originalname || 'upload').slice(0, 200);
    const username = `upload-${Math.random().toString(36).slice(2, 10)}`;
    const videoId = require('crypto').randomBytes(16).toString('hex');

    try {
        const ins = await pool.query(
            `INSERT INTO aikol_clips
                (user_id, platform, username, video_id, file_path, file_size, title, download_status, downloaded_at)
             VALUES ($1, 'upload', $2, $3, '', $4, $5, 'running', NOW())
             RETURNING id`,
            [req.userId, username, videoId, req.file.size, title]
        );
        const clipId = ins.rows[0].id;
        const key = `aikol/clips/${clipId}.${ext}`;
        await bunny.uploadBuffer(req.file.buffer, key, mime);
        await pool.query(
            `UPDATE aikol_clips SET file_path = $1, download_status = 'done' WHERE id = $2`,
            [key, clipId]
        );
        return res.json({
            clip_id: clipId,
            video_id: videoId,
            file_size: req.file.size,
            title,
        });
    } catch (e) {
        console.error('[aikol] /import/upload', e);
        return res.status(500).json({ error: 'upload_failed', detail: e.message });
    }
});

// ---------- GET /clips ----------
router.get('/clips', requireUser, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    try {
        const [{ rows }, total] = await Promise.all([
            pool.query(
                `SELECT id, platform, username, video_id, video_url, cover_url, title, duration,
                        view_count, like_count, file_path, file_size, download_status, error,
                        favorite, tags,
                        EXTRACT(EPOCH FROM imported_at)::int AS imported_at,
                        EXTRACT(EPOCH FROM downloaded_at)::int AS downloaded_at
                 FROM aikol_clips
                 WHERE user_id = $1
                 ORDER BY imported_at DESC
                 LIMIT $2 OFFSET $3`,
                [req.userId, limit, offset]
            ),
            pool.query(`SELECT COUNT(*)::int AS n FROM aikol_clips WHERE user_id = $1`, [
                req.userId,
            ]),
        ]);
        const clips = rows.map((r) => ({
            ...r,
            file_url: r.file_path ? bunny.cdnUrl(r.file_path) : null,
        }));
        return res.json({ clips, total: total.rows[0].n });
    } catch (e) {
        console.error('[aikol] GET /clips', e);
        res.status(500).json({ error: 'db_error', detail: e.message });
    }
});

// ---------- GET /clips/:id/file ----------
router.get('/clips/:id/file', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query(
        `SELECT file_path FROM aikol_clips WHERE id = $1 AND user_id = $2`,
        [id, req.userId]
    );
    if (!rows[0] || !rows[0].file_path) return res.status(404).json({ error: 'not_found' });
    res.redirect(302, bunny.cdnUrl(rows[0].file_path));
});

// ---------- GET /clips/:id/poster ----------
router.get('/clips/:id/poster', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query(
        `SELECT cover_url FROM aikol_clips WHERE id = $1 AND user_id = $2`,
        [id, req.userId]
    );
    if (!rows[0] || !rows[0].cover_url) return res.status(404).json({ error: 'not_found' });
    res.redirect(302, rows[0].cover_url);
});

// ---------- DELETE /clips/:id ----------
router.delete('/clips/:id', requireUser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { rows } = await pool.query(
        `DELETE FROM aikol_clips WHERE id = $1 AND user_id = $2 RETURNING file_path`,
        [id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    if (rows[0].file_path) {
        bunny
            .deleteObject(rows[0].file_path)
            .catch((err) => console.warn('[aikol] Bunny delete clip:', err.message));
    }
    res.json({ ok: true, id });
});

// ---------- PATCH /clips/:id ----------
router.patch('/clips/:id', requireUser, express.json(), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const { favorite } = req.body || {};
    if (typeof favorite !== 'boolean') {
        return res.status(400).json({ error: 'invalid', detail: '`favorite` boolean required' });
    }
    const { rows } = await pool.query(
        `UPDATE aikol_clips SET favorite = $1 WHERE id = $2 AND user_id = $3 RETURNING id, favorite`,
        [favorite, id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
});

module.exports = router;
