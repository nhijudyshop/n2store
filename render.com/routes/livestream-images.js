// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Kho "Hình Livestream" — manual iframe capture (tpos-pancake)
//
// Khác với livestream_snapshots (gắn per-comment/customer), bảng này lưu ảnh
// chụp THỦ CÔNG từ khung iframe FB live đang nhúng, KHÔNG gắn comment nào.
// Mục đích: shop lưu lại các khoảnh khắc trong live (mẫu mặc, giá, …) làm tư
// liệu, filter theo campaign.
//
// Storage: Postgres bytea trên **web2Db** (n2store-web2-db) — policy CLAUDE.md (không Bunny).
//   ⚠ Bảng từng ở chatDb (Web 1.0) trước tách DB → ĐÃ migrate sang web2Db
//   (web2-livestream-media-migrate.js); code resolve `web2Db || chatDb` (dead-safe).
// SSE topic: web2:livestream-images — multi-tab/-máy sync.
//
// Fallback (khi frontend không lấy được frame): lưu metadata-only với
// offset_seconds + extract_status='pending'. Sau đó POST /:id/extract dùng
// yt-dlp + ffmpeg (reuse helper từ livestream-snapshots.js) để lấy frame thật
// từ VOD.
// =====================================================
const express = require('express');
const router = express.Router();

// ---- SSE notifier (web2 hub) ----
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, data) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:livestream-images', { action, ...data, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[livestream-images] _notify fail:', e.message);
    }
}

// ---- Schema ----
const _ensuredPools = new WeakSet();
async function ensureSchema(pool) {
    if (_ensuredPools.has(pool) || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS livestream_images (
            id BIGSERIAL PRIMARY KEY,
            page_id TEXT,
            page_name TEXT,
            live_campaign_id TEXT,
            live_campaign_name TEXT,
            live_video_id TEXT,
            captured_at BIGINT NOT NULL,
            captured_by TEXT,
            captured_by_name TEXT,
            offset_seconds INTEGER,
            livestream_url TEXT,
            note TEXT,
            image_data BYTEA,
            image_mime VARCHAR(50),
            image_size INTEGER,
            extract_status VARCHAR(20),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_lsimg_campaign
            ON livestream_images(live_campaign_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_lsimg_created
            ON livestream_images(created_at DESC);
    `);
    _ensuredPools.add(pool);
    console.log('[livestream-images] schema ready');
    _autoCleanupOld(pool).catch(() => {});
    if (!ensureSchema._cleanupTimer) {
        ensureSchema._cleanupTimer = setInterval(
            () => _autoCleanupOld(pool).catch(() => {}),
            6 * 60 * 60 * 1000
        );
    }
}

// Auto-delete > 60 ngày (ảnh tư liệu giữ lâu hơn snapshot/comment 30d).
async function _autoCleanupOld(pool) {
    if (!pool) return;
    try {
        const r = await pool.query(
            `DELETE FROM livestream_images WHERE created_at < NOW() - INTERVAL '60 days'`
        );
        if (r.rowCount > 0) {
            console.log(`[livestream-images] auto-cleanup deleted ${r.rowCount} images > 60d`);
        }
    } catch (e) {
        console.warn('[livestream-images] auto-cleanup fail:', e.message);
    }
}

function _resolveSelfBase(req) {
    const host = req.get('host') || '';
    const fwdProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const proto = fwdProto || (host.endsWith('.onrender.com') ? 'https' : req.protocol);
    return `${proto}://${host}`;
}

// FB deep-link (giống livestream-snapshots) — qua wrapper page seek chính xác.
function _computeLivestreamUrl(pageSlugOrId, liveVideoId, offsetSec) {
    if (!liveVideoId) return null;
    let videoId = String(liveVideoId);
    const m = videoId.match(/^\d+_(\d+)$/);
    if (m) videoId = m[1];
    const params = new URLSearchParams({ v: videoId });
    if (pageSlugOrId) params.set('page', pageSlugOrId);
    if (offsetSec && Number.isFinite(offsetSec) && offsetSec > 0) {
        params.set('t', String(Math.floor(offsetSec)));
    }
    return `https://nhijudy.store/live-chat/fb-video-player.html?${params.toString()}`;
}

function _mapRow(row, selfBase) {
    if (!row) return null;
    const hasImage = !!row.image_data || !!row.image_size;
    return {
        id: row.id,
        pageId: row.page_id,
        pageName: row.page_name,
        liveCampaignId: row.live_campaign_id,
        liveCampaignName: row.live_campaign_name,
        liveVideoId: row.live_video_id,
        capturedAt: Number(row.captured_at),
        capturedBy: row.captured_by,
        capturedByName: row.captured_by_name,
        offsetSeconds: row.offset_seconds,
        livestreamUrl:
            _computeLivestreamUrl(row.page_id, row.live_video_id, row.offset_seconds) ||
            row.livestream_url,
        note: row.note,
        extractStatus: row.extract_status,
        imageSize: row.image_size,
        imageUrl: hasImage && selfBase ? `${selfBase}/api/livestream-images/image/${row.id}` : null,
        createdAt: row.created_at,
    };
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.web2Db || req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema: ' + e.message });
    }
});

// -----------------------------------------------------
// POST / — capture (lưu ảnh hoặc metadata-only fallback)
// Body: {
//   pageId, pageName, liveCampaignId, liveCampaignName, liveVideoId,
//   capturedAt?, offsetSeconds?, note?, user: {id, name},
//   imageBase64?  — frame thật từ frontend (no/with data: prefix)
//   imageMime?    — default image/jpeg
// }
// -----------------------------------------------------
router.post('/', express.json({ limit: '8mb' }), async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const b = req.body || {};
        const capturedAt = Number(b.capturedAt) || Date.now();
        const offsetSec = Number.isFinite(b.offsetSeconds) ? Math.floor(b.offsetSeconds) : null;

        let imageBuffer = null;
        let imageMime = null;
        let imageSize = null;
        let extractStatus = null;
        if (b.imageBase64) {
            try {
                const raw = String(b.imageBase64).replace(/^data:[^;]+;base64,/, '');
                imageBuffer = Buffer.from(raw, 'base64');
                imageMime = String(b.imageMime || 'image/jpeg').slice(0, 50);
                imageSize = imageBuffer.length;
                if (imageSize > 8 * 1024 * 1024) {
                    return res
                        .status(413)
                        .json({ success: false, error: 'image too large (>8MB)' });
                }
                extractStatus = 'done';
            } catch (e) {
                return res
                    .status(400)
                    .json({ success: false, error: 'invalid imageBase64: ' + e.message });
            }
        } else {
            // Fallback: chưa có frame → lưu metadata, đánh dấu pending để extract sau.
            extractStatus = 'pending';
        }

        const user = b.user || {};
        const r = await pool.query(
            `INSERT INTO livestream_images
             (page_id, page_name, live_campaign_id, live_campaign_name, live_video_id,
              captured_at, captured_by, captured_by_name, offset_seconds, note,
              image_data, image_mime, image_size, extract_status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             RETURNING *`,
            [
                b.pageId || null,
                b.pageName || null,
                b.liveCampaignId || null,
                b.liveCampaignName || null,
                b.liveVideoId || null,
                capturedAt,
                user.id || null,
                user.name || null,
                offsetSec,
                b.note ? String(b.note).slice(0, 500) : null,
                imageBuffer,
                imageMime,
                imageSize,
                extractStatus,
            ]
        );
        const selfBase =
            req.app.locals.web2BaseUrl || process.env.SELF_URL || _resolveSelfBase(req);
        const image = _mapRow(r.rows[0], selfBase);
        _notify('create', { id: image.id, liveCampaignId: image.liveCampaignId });
        res.json({ success: true, image });
    } catch (e) {
        console.error('[livestream-images] create error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /image/:id — serve bytea, cache immutable.
router.get('/image/:id', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await pool.query(
            `SELECT image_data, image_mime FROM livestream_images WHERE id = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0 || !r.rows[0].image_data) {
            return res.status(404).json({ success: false, error: 'image not found' });
        }
        const { image_data, image_mime } = r.rows[0];
        res.setHeader('Content-Type', image_mime || 'image/jpeg');
        res.setHeader('Content-Length', image_data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(image_data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET / — list. Query: liveCampaignId? (filter), limit (default 100, max 300).
router.get('/', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
        const campaignId = req.query.liveCampaignId ? String(req.query.liveCampaignId) : null;
        const where = campaignId ? `WHERE live_campaign_id = $1` : '';
        const params = campaignId ? [campaignId, limit] : [limit];
        const r = await pool.query(
            `SELECT id, page_id, page_name, live_campaign_id, live_campaign_name, live_video_id,
                    captured_at, captured_by, captured_by_name, offset_seconds, livestream_url,
                    note, image_mime, image_size, extract_status, created_at
             FROM livestream_images
             ${where}
             ORDER BY created_at DESC
             LIMIT $${campaignId ? 2 : 1}`,
            params
        );
        const selfBase =
            req.app.locals.web2BaseUrl || process.env.SELF_URL || _resolveSelfBase(req);
        res.json({ success: true, images: r.rows.map((row) => _mapRow(row, selfBase)) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /campaigns — distinct campaigns có ảnh, để build filter dropdown.
router.get('/campaigns', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await pool.query(
            `SELECT live_campaign_id, MAX(live_campaign_name) AS live_campaign_name,
                    COUNT(*)::int AS count, MAX(created_at) AS last_at
             FROM livestream_images
             GROUP BY live_campaign_id
             ORDER BY last_at DESC`
        );
        res.json({
            success: true,
            campaigns: r.rows.map((row) => ({
                liveCampaignId: row.live_campaign_id,
                liveCampaignName: row.live_campaign_name,
                count: row.count,
            })),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await pool.query(
            `DELETE FROM livestream_images WHERE id = $1 RETURNING live_campaign_id`,
            [req.params.id]
        );
        if (!r.rows.length) {
            return res.status(404).json({ success: false, error: 'not found' });
        }
        _notify('delete', {
            id: Number(req.params.id),
            liveCampaignId: r.rows[0].live_campaign_id,
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:id/extract — fallback: lấy frame thật từ VOD cho row metadata-only.
// Reuse yt-dlp + ffmpeg helpers từ livestream-snapshots.js (DRY).
router.post('/:id/extract', express.json({ limit: '50kb' }), async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await pool.query(
            `SELECT id, live_video_id, page_id, offset_seconds FROM livestream_images WHERE id = $1`,
            [req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'not found' });
        const row = r.rows[0];
        if (!row.live_video_id || !Number.isFinite(row.offset_seconds)) {
            return res
                .status(400)
                .json({ success: false, error: 'missing live_video_id or offset_seconds' });
        }
        const helpers = require('./livestream-snapshots')._extractHelpers;
        if (!helpers || !helpers.ensureExtractDeps()) {
            return res.status(503).json({ success: false, error: 'extract deps not available' });
        }
        const m3u8 = await helpers.resolveM3u8Url(row.live_video_id, row.page_id, pool);
        if (!m3u8 || m3u8.drm) {
            await pool.query(`UPDATE livestream_images SET extract_status = 'fail' WHERE id = $1`, [
                row.id,
            ]);
            return res
                .status(502)
                .json({ success: false, error: m3u8?.error || 'cannot resolve m3u8' });
        }
        const buf = await helpers.extractFrameJpeg(m3u8, row.offset_seconds);
        await pool.query(
            `UPDATE livestream_images
             SET image_data = $1, image_mime = 'image/jpeg', image_size = $2, extract_status = 'done'
             WHERE id = $3`,
            [buf, buf.length, row.id]
        );
        _notify('update', { id: row.id });
        res.json({ success: true, imageSize: buf.length });
    } catch (e) {
        try {
            await (req.app.locals.web2Db || req.app.locals.chatDb).query(
                `UPDATE livestream_images SET extract_status = 'fail' WHERE id = $1`,
                [req.params.id]
            );
        } catch {}
        console.error('[livestream-images] extract error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureSchema = ensureSchema; // boot-migrate (web2-livestream-media-migrate) tạo bảng đích trên web2Db
