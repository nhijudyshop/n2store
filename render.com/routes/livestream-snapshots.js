// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Livestream Snapshot per Customer
//
// Use case: tpos-pancake page nhận quá nhiều comment livestream, user không kịp
// xử lý từng SP. Click 📸 Snap trên comment row → lưu lại thời điểm + deep-link
// FB live + thumbnail → user review sau khi rảnh để gán SP.
//
// Storage:
//   livestream_snapshots — 1 snapshot = 1 record (customer có N snapshots)
//
// Deep-link logic:
//   livestream_url = https://www.facebook.com/{pageId}/videos/{liveVideoId}/?t={offsetSeconds}
//   offsetSeconds tính client-side (Date.now() - liveStartTimeMs)/1000
//   FB chỉ hỗ trợ `?t=` trên VOD replay (sau khi live kết thúc)
//
// Thumbnail strategy (LAZY FETCH per user req 2026-05-23):
//   Default → KHÔNG fetch ảnh tại snap-time. Save metadata (time, video_id,
//     offset) + thumbnail_url = FB Graph picture URL trực tiếp.
//   View → browser resolves <img src=thumbnail_url> tại view-time → lấy thumb
//     fresh từ FB CDN (đặc biệt nếu live đã end, FB Graph trả FINAL thumb
//     đẹp hơn frame stale lúc snap).
//   Manual freeze → POST /snapshot/:id/refresh-thumbnail (opt-in, save bytea)
//     hữu ích khi user muốn keep ảnh sau khi FB có thể xóa video.
//   Real-snap toggle (frontend getDisplayMedia) → vẫn save bytea ngay tại snap
//     time với imageBase64.
// =====================================================

const express = require('express');
const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, data) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:livestream-snapshots', { action, ...data, ts: Date.now() }, 'update');
    } catch {}
}

let _schemaReady = false;
async function ensureSchema(pool) {
    if (_schemaReady || !pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS livestream_snapshots (
            id BIGSERIAL PRIMARY KEY,
            comment_id TEXT,
            customer_fb_user_id TEXT NOT NULL,
            customer_name TEXT,
            page_id TEXT NOT NULL,
            page_name TEXT,
            live_campaign_id TEXT,
            live_video_id TEXT,
            captured_at BIGINT NOT NULL,
            captured_by TEXT,
            captured_by_name TEXT,
            offset_seconds INTEGER,
            livestream_url TEXT,
            thumbnail_url TEXT,
            note TEXT,
            image_data BYTEA,
            image_mime VARCHAR(50),
            image_size INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_lss_customer
            ON livestream_snapshots(customer_fb_user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_lss_live_video
            ON livestream_snapshots(page_id, live_video_id);
        -- Phase 3: real screenshot via getDisplayMedia. Add image_data BYTEA cho
        -- bảng cũ (idempotent ALTER).
        ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_data BYTEA;
        ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_mime VARCHAR(50);
        ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS image_size INTEGER;
    `);
    _schemaReady = true;
    console.log('[livestream-snapshots] schema ready');
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema: ' + e.message });
    }
});

// Compute thumbnail URL từ FB public picture endpoint (Phase 2).
// FB cho phép unauthenticated access: /{video_id}/picture?type=large.
function _computeThumbnailUrl(liveVideoId) {
    if (!liveVideoId) return null;
    return `https://graph.facebook.com/${encodeURIComponent(liveVideoId)}/picture?type=large`;
}

// Server-side fetch FB Graph thumbnail, return Buffer | null.
// Dùng cho default snap path (user KHÔNG cần mở FB live tab) — backend tự kéo
// frame mới nhất từ FB CDN tại moment user bấm 📸 → freeze vào DB.
async function _fetchFbThumbnail(liveVideoId) {
    if (!liveVideoId) return null;
    const url = `https://graph.facebook.com/${encodeURIComponent(liveVideoId)}/picture?type=large&redirect=true`;
    try {
        const fetchFn = global.fetch || (await import('node-fetch')).default;
        const r = await fetchFn(url, { redirect: 'follow' });
        if (!r.ok) {
            console.warn('[lss] FB thumb fetch fail:', r.status, url);
            return null;
        }
        const ct = r.headers.get('content-type') || 'image/jpeg';
        if (!ct.startsWith('image/')) {
            console.warn('[lss] FB thumb not image:', ct);
            return null;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        // Validate min size — FB sometimes returns 1×1 placeholder if video private/ended
        if (buf.length < 1024) {
            console.warn('[lss] FB thumb too small (likely placeholder):', buf.length);
            return null;
        }
        return { buffer: buf, mime: ct };
    } catch (e) {
        console.warn('[lss] FB thumb fetch error:', e.message);
        return null;
    }
}

// Compute FB deep-link URL.
// Format: https://www.facebook.com/{pageId}/videos/{liveVideoId}/?t={seconds}
function _computeLivestreamUrl(pageId, liveVideoId, offsetSec) {
    if (!liveVideoId) return null;
    const base = pageId
        ? `https://www.facebook.com/${encodeURIComponent(pageId)}/videos/${encodeURIComponent(liveVideoId)}/`
        : `https://www.facebook.com/watch/live/?v=${encodeURIComponent(liveVideoId)}`;
    if (offsetSec && Number.isFinite(offsetSec) && offsetSec > 0) {
        return `${base}?t=${Math.floor(offsetSec)}`;
    }
    return base;
}

function _mapRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        commentId: row.comment_id,
        customerFbUserId: row.customer_fb_user_id,
        customerName: row.customer_name,
        pageId: row.page_id,
        pageName: row.page_name,
        liveCampaignId: row.live_campaign_id,
        liveVideoId: row.live_video_id,
        capturedAt: Number(row.captured_at),
        capturedBy: row.captured_by,
        capturedByName: row.captured_by_name,
        offsetSeconds: row.offset_seconds,
        livestreamUrl: row.livestream_url,
        thumbnailUrl: row.thumbnail_url,
        note: row.note,
        createdAt: row.created_at,
    };
}

// POST /snapshot — create new snapshot
// Body: {
//   commentId?, customerFbUserId, customerName,
//   pageId, pageName, liveCampaignId, liveVideoId,
//   capturedAt?, offsetSeconds?, note?, user: {id, name},
//   imageBase64?   — Phase 3: real screenshot từ getDisplayMedia, base64 (no data: prefix OR with)
//   imageMime?     — 'image/jpeg' | 'image/png' (default jpeg)
// }
// Body limit cần tăng (Express default 100kb không đủ). Mount middleware riêng route này.
router.post('/snapshot', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const b = req.body || {};
        if (!b.customerFbUserId) {
            return res.status(400).json({ success: false, error: 'customerFbUserId required' });
        }
        if (!b.pageId) {
            return res.status(400).json({ success: false, error: 'pageId required' });
        }
        const capturedAt = Number(b.capturedAt) || Date.now();
        const offsetSec = Number.isFinite(b.offsetSeconds) ? Math.floor(b.offsetSeconds) : null;
        const livestreamUrl = _computeLivestreamUrl(b.pageId, b.liveVideoId, offsetSec);
        // Image source priority:
        //   1. b.imageBase64 (Phase 3 — frontend captured frame qua getDisplayMedia)
        //   2. Server-side fetch FB Graph thumbnail (default — user KHÔNG cần FB tab)
        //   3. Fallback: chỉ lưu URL FB Graph (live link, không freeze)
        let imageBuffer = null;
        let imageMime = null;
        let imageSize = null;
        if (b.imageBase64) {
            try {
                const raw = String(b.imageBase64).replace(/^data:[^;]+;base64,/, '');
                imageBuffer = Buffer.from(raw, 'base64');
                imageMime = String(b.imageMime || 'image/jpeg').slice(0, 50);
                imageSize = imageBuffer.length;
                if (imageSize > 5 * 1024 * 1024) {
                    return res
                        .status(413)
                        .json({ success: false, error: 'image too large (>5MB)' });
                }
            } catch (e) {
                return res
                    .status(400)
                    .json({ success: false, error: 'invalid imageBase64: ' + e.message });
            }
        } else if (b.liveVideoId && b.fetchFbThumbnail === true) {
            // Opt-in: backend fetch FB Graph thumb để freeze moment user bấm 📸.
            // KHÔNG default — vì FB CDN trả thumb stale 5-30s, freeze sớm sẽ
            // mất cơ hội lấy thumb tươi hơn lúc view (đặc biệt sau khi live ends
            // FB Graph trả final thumb đẹp hơn frame stale lúc snap).
            const result = await _fetchFbThumbnail(b.liveVideoId);
            if (result) {
                imageBuffer = result.buffer;
                imageMime = result.mime;
                imageSize = result.buffer.length;
            }
        }
        // Thumbnail URL strategy (lazy fetch):
        //   Default → FB Graph URL = always-fresh (browser resolves tại view-time):
        //     · Live đang chạy: FB CDN trả thumb mới nhất
        //     · Live kết thúc: FB Graph trả FINAL thumb (clean, không phải frame stale)
        //   Real-snap → self-served `/api/.../image/:id` (frozen bytea từ getDisplayMedia)
        let thumbnailUrl = _computeThumbnailUrl(b.liveVideoId);
        const user = b.user || {};
        const r = await pool.query(
            `INSERT INTO livestream_snapshots
             (comment_id, customer_fb_user_id, customer_name, page_id, page_name,
              live_campaign_id, live_video_id, captured_at, captured_by, captured_by_name,
              offset_seconds, livestream_url, thumbnail_url, note,
              image_data, image_mime, image_size)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             RETURNING *`,
            [
                b.commentId || null,
                b.customerFbUserId,
                b.customerName || null,
                b.pageId,
                b.pageName || null,
                b.liveCampaignId || null,
                b.liveVideoId || null,
                capturedAt,
                user.id || null,
                user.name || null,
                offsetSec,
                livestreamUrl,
                thumbnailUrl,
                b.note || null,
                imageBuffer,
                imageMime,
                imageSize,
            ]
        );
        // Nếu có image thật, update thumbnail_url về self-served endpoint.
        // Derive absolute URL từ request để frontend trên GH Pages / localhost
        // đều resolve đúng origin Render.
        if (imageBuffer) {
            const selfBase =
                req.app.locals.web2BaseUrl ||
                process.env.SELF_URL ||
                `${req.protocol}://${req.get('host')}`;
            const selfImageUrl = `${selfBase}/api/livestream/snapshot/${r.rows[0].id}/image`;
            await pool.query(`UPDATE livestream_snapshots SET thumbnail_url = $1 WHERE id = $2`, [
                selfImageUrl,
                r.rows[0].id,
            ]);
            r.rows[0].thumbnail_url = selfImageUrl;
        }
        const snap = _mapRow(r.rows[0]);
        _notify('create', { customerFbUserId: snap.customerFbUserId, id: snap.id });
        res.json({ success: true, snapshot: snap });
    } catch (e) {
        console.error('[livestream-snapshots] create error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /snapshot/:id/refresh-thumbnail
// Fetch FB Graph thumb hiện tại → save bytea → update thumbnail_url về
// self-served endpoint (freeze ảnh vĩnh viễn). Hữu ích khi:
//   - Live đã kết thúc → FB Graph trả final thumb đẹp → user muốn keep
//   - User lo FB sẽ xóa video → freeze trước
// Idempotent: gọi nhiều lần sẽ replace ảnh cũ bằng ảnh mới nhất từ FB.
router.post('/snapshot/:id/refresh-thumbnail', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const r0 = await pool.query(
            `SELECT id, live_video_id FROM livestream_snapshots WHERE id = $1`,
            [req.params.id]
        );
        if (r0.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'snapshot not found' });
        }
        const liveVideoId = r0.rows[0].live_video_id;
        if (!liveVideoId) {
            return res
                .status(400)
                .json({ success: false, error: 'snapshot không có live_video_id' });
        }
        const result = await _fetchFbThumbnail(liveVideoId);
        if (!result) {
            return res.status(502).json({
                success: false,
                error: 'không lấy được thumb từ FB Graph (có thể video private/đã xóa)',
            });
        }
        const selfBase =
            req.app.locals.web2BaseUrl ||
            process.env.SELF_URL ||
            `${req.protocol}://${req.get('host')}`;
        const selfImageUrl = `${selfBase}/api/livestream/snapshot/${req.params.id}/image`;
        const r1 = await pool.query(
            `UPDATE livestream_snapshots
             SET image_data = $1, image_mime = $2, image_size = $3,
                 thumbnail_url = $4
             WHERE id = $5
             RETURNING *`,
            [result.buffer, result.mime, result.buffer.length, selfImageUrl, req.params.id]
        );
        const snap = _mapRow(r1.rows[0]);
        _notify('refresh-thumbnail', { customerFbUserId: snap.customerFbUserId, id: snap.id });
        res.json({ success: true, snapshot: snap });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /snapshot/:id/image — serve image bytea với Cache-Control immutable.
router.get('/snapshot/:id/image', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const r = await pool.query(
            `SELECT image_data, image_mime FROM livestream_snapshots WHERE id = $1`,
            [req.params.id]
        );
        if (r.rows.length === 0 || !r.rows[0].image_data) {
            return res.status(404).json({ success: false, error: 'image not found' });
        }
        const { image_data, image_mime } = r.rows[0];
        res.setHeader('Content-Type', image_mime || 'image/jpeg');
        res.setHeader('Content-Length', image_data.length);
        // Image bất biến (snapshot frozen in time) → cache lâu OK
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(image_data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /snapshots?customerFbUserId=X[,Y,Z]&limit=20
// List snapshots cho 1 hoặc nhiều customer (batch). Sắp xếp created_at desc.
router.get('/snapshots', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const idsRaw = String(req.query.customerFbUserId || '').trim();
        if (!idsRaw) return res.json({ success: true, snapshots: [] });
        const ids = idsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const limit = Math.min(Number(req.query.limit) || 20, 200);
        const r = await pool.query(
            `SELECT * FROM livestream_snapshots
             WHERE customer_fb_user_id = ANY($1::text[])
             ORDER BY created_at DESC
             LIMIT $2`,
            [ids, limit]
        );
        res.json({ success: true, snapshots: r.rows.map(_mapRow) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /snapshots/batch-counts?customerIds=X,Y,Z
// Trả {customerId: count} cho badge counter (1 query nhanh).
router.get('/snapshots/batch-counts', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const idsRaw = String(req.query.customerIds || '').trim();
        if (!idsRaw) return res.json({ success: true, counts: {} });
        const ids = idsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) return res.json({ success: true, counts: {} });
        const r = await pool.query(
            `SELECT customer_fb_user_id, COUNT(*)::int AS c
             FROM livestream_snapshots
             WHERE customer_fb_user_id = ANY($1::text[])
             GROUP BY customer_fb_user_id`,
            [ids]
        );
        const counts = {};
        for (const row of r.rows) counts[row.customer_fb_user_id] = row.c;
        res.json({ success: true, counts });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /snapshot/:id
router.delete('/snapshot/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const r = await pool.query(
            `DELETE FROM livestream_snapshots WHERE id = $1 RETURNING customer_fb_user_id`,
            [req.params.id]
        );
        if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'not found' });
        const customerFbUserId = r.rows[0].customer_fb_user_id;
        _notify('delete', { customerFbUserId, id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
