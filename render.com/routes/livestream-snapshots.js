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
        -- Phase 2: background extract status (pending|done|fail|drm_blocked|null=not_attempted).
        ALTER TABLE livestream_snapshots ADD COLUMN IF NOT EXISTS extract_status VARCHAR(20);
    `);
    _schemaReady = true;
    console.log('[livestream-snapshots] schema ready');
    // Auto-cleanup: snapshots > 30 ngày → hard delete. Chạy 1 lần ngay + every 6h.
    _autoCleanupOldSnapshots(pool).catch(() => {});
    if (!ensureSchema._cleanupTimer) {
        ensureSchema._cleanupTimer = setInterval(
            () => _autoCleanupOldSnapshots(pool).catch(() => {}),
            6 * 60 * 60 * 1000
        );
    }
}

// Resolve absolute self-URL respecting X-Forwarded-Proto (Render proxy).
// req.protocol returns "http" sau load balancer dù origin là HTTPS → mixed-content.
function _resolveSelfBase(req) {
    const host = req.get('host') || '';
    const fwdProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const proto = fwdProto || (host.endsWith('.onrender.com') ? 'https' : req.protocol);
    return `${proto}://${host}`;
}

// Auto-delete snapshots > 30 ngày (kèm image_data BYTEA bytes).
// Idempotent — chạy bao nhiêu lần cũng OK. CASCADE qua FK không có (table độc lập).
async function _autoCleanupOldSnapshots(pool) {
    if (!pool) return;
    try {
        const r = await pool.query(
            `DELETE FROM livestream_snapshots
             WHERE created_at < NOW() - INTERVAL '30 days'`
        );
        if (r.rowCount > 0) {
            console.log(
                `[livestream-snapshots] auto-cleanup deleted ${r.rowCount} snaps > 30 days`
            );
        }
    } catch (e) {
        console.warn('[livestream-snapshots] auto-cleanup fail:', e.message);
    }
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema: ' + e.message });
    }
});

// LEGACY: FB Graph picture endpoint trả 400 từ 05/2026. Giữ tên function
// để không break import nhưng luôn trả null. Frontend ưu tiên TPOS
// thumbnail.url qua _fetchLiveVideoInfo, hoặc chỉ lưu metadata (no thumb)
// và để user click button '📸 Chụp' manual.
function _computeThumbnailUrl(_liveVideoId) {
    return null;
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
// Format chuẩn: https://www.facebook.com/{pageSlugOrId}/videos/{videoId}/?t={seconds}
//
// QUAN TRỌNG: TPOS trả Facebook_LiveId dạng `{pageId}_{videoId}` (vd
// "117267091364524_973749988973335"). URL FB chỉ cần phần videoId SAU dấu
// `_`. Nếu để nguyên compound → URL `/videos/{pageId}_{videoId}` → FB 404.
//
// pageSlug ưu tiên: vanity username (vd "NhiJudyHouse.VietNam") đẹp hơn.
// Fallback: pageId numeric — FB tự redirect về vanity.
function _computeLivestreamUrl(pageSlugOrId, liveVideoId, offsetSec) {
    if (!liveVideoId) return null;
    // Strip {pageId}_ prefix nếu liveVideoId compound.
    let videoId = String(liveVideoId);
    const m = videoId.match(/^\d+_(\d+)$/);
    if (m) videoId = m[1];
    const base = pageSlugOrId
        ? `https://www.facebook.com/${encodeURIComponent(pageSlugOrId)}/videos/${encodeURIComponent(videoId)}/`
        : `https://www.facebook.com/watch/live/?v=${encodeURIComponent(videoId)}`;
    const qs = ['locale=vi_VN'];
    if (offsetSec && Number.isFinite(offsetSec) && offsetSec > 0) {
        qs.push(`t=${Math.floor(offsetSec)}`);
    }
    return `${base}?${qs.join('&')}`;
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
        // Ưu tiên pageUsername (vanity) cho URL đẹp, fallback pageId numeric.
        const livestreamUrl = _computeLivestreamUrl(
            b.pageUsername || b.pageId,
            b.liveVideoId,
            offsetSec
        );
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
        //   Priority: b.thumbnailUrl (FB CDN signed URL từ TPOS video.thumbnail.url) →
        //     fallback FB Graph picture URL (FB đã trả 400 từ 05/2026 → effectively
        //     broken, giữ làm cuối cùng).
        //   Real-snap → self-served `/api/.../image/:id` (frozen bytea getDisplayMedia)
        let thumbnailUrl = b.thumbnailUrl || _computeThumbnailUrl(b.liveVideoId);
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
                req.app.locals.web2BaseUrl || process.env.SELF_URL || _resolveSelfBase(req);
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
// 2 paths:
//   1. Body có thumbnailUrl (TPOS video.thumbnail.url, FB CDN signed) →
//      fetch URL đó → save bytea + thumbnail_url = self-served (frozen).
//   2. Body trống → fallback fetch FB Graph picture (giờ trả 400 từ 05/2026,
//      effectively broken — giữ làm fallback nhưng sẽ fail).
//
// User flow: frontend click 🔄 → resolve TPOS thumbnail.url qua
// _fetchLiveVideoInfo → gọi endpoint này với thumbnailUrl trong body.
router.post('/snapshot/:id/refresh-thumbnail', express.json({ limit: '1mb' }), async (req, res) => {
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
        // Source URL: body.thumbnailUrl (TPOS CDN) → FB Graph fallback.
        const sourceUrl =
            (req.body && req.body.thumbnailUrl) ||
            `https://graph.facebook.com/${encodeURIComponent(liveVideoId)}/picture?type=large&redirect=true`;
        const fetchFn = global.fetch || (await import('node-fetch')).default;
        let result = null;
        try {
            const r = await fetchFn(sourceUrl, { redirect: 'follow' });
            if (r.ok) {
                const ct = r.headers.get('content-type') || 'image/jpeg';
                if (ct.startsWith('image/')) {
                    const buf = Buffer.from(await r.arrayBuffer());
                    if (buf.length >= 512) {
                        result = { buffer: buf, mime: ct };
                    }
                }
            }
        } catch (e) {
            console.warn('[lss] refresh-thumbnail fetch error:', e.message);
        }
        if (!result) {
            return res.status(502).json({
                success: false,
                error: 'không lấy được ảnh (URL CDN có thể hết hạn signed token, video private hoặc đã xóa)',
            });
        }
        const selfBase =
            req.app.locals.web2BaseUrl || process.env.SELF_URL || _resolveSelfBase(req);
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

// GET /snapshots/by-comment-ids?commentIds=ID1,ID2,... — batch lookup snap theo commentId.
// (Legacy GET: chỉ exact match by comment_id.)
router.get('/snapshots/by-comment-ids', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const idsRaw = String(req.query.commentIds || '').trim();
        if (!idsRaw) return res.json({ success: true, byCommentId: {} });
        const ids = idsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) return res.json({ success: true, byCommentId: {} });
        const limited = ids.slice(0, 200);
        const r = await pool.query(
            `SELECT id, comment_id, thumbnail_url, livestream_url, offset_seconds, captured_at
             FROM livestream_snapshots
             WHERE comment_id = ANY($1::text[])`,
            [limited]
        );
        const byCommentId = {};
        for (const row of r.rows) {
            const existing = byCommentId[row.comment_id];
            if (existing && Number(existing.capturedAt) > Number(row.captured_at)) continue;
            byCommentId[row.comment_id] = {
                id: row.id,
                thumbnailUrl: row.thumbnail_url,
                livestreamUrl: row.livestream_url,
                offsetSeconds: row.offset_seconds,
                capturedAt: Number(row.captured_at),
                source: 'exact',
            };
        }
        res.json({ success: true, byCommentId });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /snapshot/:id
// POST /offline-batch — Feature 2: backfill snapshots cho list comments
// Body: {
//   pageId, pageName, pageUsername?, liveCampaignId?, liveVideoId,
//   broadcastStartMs (number, BẮT BUỘC — frontend tính qua TPOS livevideo),
//   comments: [{ commentId, customerFbUserId, customerName, createdTime (ms), message? }],
//   user: {id, name},
//   skipExisting? (default true — skip nếu đã có snap cùng commentId)
// }
// Loop create snaps với offsetSec = (createdTime - broadcastStartMs)/1000.
// Returns: { created: N, skipped: M, failed: K, snapshots: [...] }
router.post('/offline-batch', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const b = req.body || {};
        if (!b.liveVideoId) {
            return res.status(400).json({ success: false, error: 'liveVideoId required' });
        }
        if (!Number.isFinite(Number(b.broadcastStartMs))) {
            return res
                .status(400)
                .json({ success: false, error: 'broadcastStartMs (number) required' });
        }
        if (!Array.isArray(b.comments) || b.comments.length === 0) {
            return res.status(400).json({ success: false, error: 'comments[] required' });
        }
        const broadcastStart = Number(b.broadcastStartMs);
        const skipExisting = b.skipExisting !== false;
        const user = b.user || {};
        const created = [];
        const skipped = [];
        const failed = [];

        for (const c of b.comments) {
            try {
                if (!c.customerFbUserId || !c.createdTime) {
                    failed.push({
                        commentId: c.commentId,
                        reason: 'missing customerFbUserId/createdTime',
                    });
                    continue;
                }
                const commentTime = Number(c.createdTime);
                if (!Number.isFinite(commentTime)) {
                    failed.push({ commentId: c.commentId, reason: 'invalid createdTime' });
                    continue;
                }
                // Idempotency: skip nếu đã có snap với commentId này
                if (skipExisting && c.commentId) {
                    const exists = await pool.query(
                        `SELECT id FROM livestream_snapshots WHERE comment_id = $1 LIMIT 1`,
                        [c.commentId]
                    );
                    if (exists.rowCount > 0) {
                        skipped.push({ commentId: c.commentId, snapshotId: exists.rows[0].id });
                        continue;
                    }
                }
                const offsetSec =
                    commentTime > broadcastStart
                        ? Math.floor((commentTime - broadcastStart) / 1000)
                        : null;
                const livestreamUrl = _computeLivestreamUrl(
                    b.pageUsername || b.pageId,
                    b.liveVideoId,
                    offsetSec
                );
                // FB Graph picture endpoint giờ trả 400 cho video (FB policy 05/2026).
                // Ưu tiên b.thumbnailUrl từ frontend (lấy từ TPOS video.thumbnail.url
                // — FB CDN signed URL, public). Fallback FB Graph URL (sẽ 400 nhưng
                // giữ structure cũ để rollback an toàn).
                const thumbnailUrl = b.thumbnailUrl || _computeThumbnailUrl(b.liveVideoId);
                const r = await pool.query(
                    `INSERT INTO livestream_snapshots
                     (comment_id, customer_fb_user_id, customer_name, page_id, page_name,
                      live_campaign_id, live_video_id, captured_at, captured_by, captured_by_name,
                      offset_seconds, livestream_url, thumbnail_url, note)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                     RETURNING id`,
                    [
                        c.commentId || null,
                        c.customerFbUserId,
                        c.customerName || null,
                        b.pageId,
                        b.pageName || null,
                        b.liveCampaignId || null,
                        b.liveVideoId,
                        commentTime,
                        user.id || null,
                        user.name || null,
                        offsetSec,
                        livestreamUrl,
                        thumbnailUrl,
                        c.message ? String(c.message).slice(0, 500) : null,
                    ]
                );
                created.push({
                    commentId: c.commentId,
                    snapshotId: r.rows[0].id,
                    offsetSec,
                });
                _notify('create', { customerFbUserId: c.customerFbUserId, id: r.rows[0].id });
            } catch (e) {
                failed.push({ commentId: c.commentId, reason: e.message });
            }
        }
        res.json({
            success: true,
            summary: {
                total: b.comments.length,
                created: created.length,
                skipped: skipped.length,
                failed: failed.length,
            },
            created,
            skipped,
            failed,
        });
    } catch (e) {
        console.error('[livestream-snapshots] offline-batch error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

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

// =====================================================
// PHASE 2 — Background frame extraction qua yt-dlp + ffmpeg.
// Cho phép backfill comment cũ (sau live kết thúc) hoặc comment lúc user
// offline. Lấy frame chính xác giây offset từ video HLS của FB.
// =====================================================
let _ytdlp = null;
let _ffmpegPath = null;
function _ensureExtractDeps() {
    if (_ytdlp && _ffmpegPath) return true;
    try {
        if (!_ytdlp) _ytdlp = require('youtube-dl-exec');
        if (!_ffmpegPath) _ffmpegPath = require('ffmpeg-static');
        return !!(_ytdlp && _ffmpegPath);
    } catch (e) {
        console.warn('[lss-extract] deps not installed:', e.message);
        return false;
    }
}

// In-memory queue + cache m3u8 URL per video (5 phút TTL — FB URL có expire token).
const _extractQueue = []; // { snapshotId, offsetSec, liveVideoId, pageId, batchId }
const _m3u8Cache = new Map(); // liveVideoId → { url, fetchedAt }
const _M3U8_CACHE_TTL = 5 * 60 * 1000;
const _batchStatus = new Map(); // batchId → { total, done, failed, drmBlocked }
let _workerRunning = false;

async function _resolveM3u8Url(liveVideoId, pageId) {
    if (!_ytdlp) return null;
    const cached = _m3u8Cache.get(liveVideoId);
    if (cached && Date.now() - cached.fetchedAt < _M3U8_CACHE_TTL) return cached.url;
    const videoIdShort = String(liveVideoId).replace(/^\d+_/, '');
    const fbUrl = `https://www.facebook.com/${pageId}/videos/${videoIdShort}/`;
    try {
        const result = await _ytdlp(fbUrl, {
            getUrl: true,
            format: 'best[ext=mp4]/best',
            noWarnings: true,
            noCheckCertificate: true,
        });
        const url = typeof result === 'string' ? result.trim().split('\n')[0] : null;
        if (!url) return null;
        _m3u8Cache.set(liveVideoId, { url, fetchedAt: Date.now() });
        return url;
    } catch (e) {
        const msg = e?.message || '';
        if (/Forbidden|DRM|encrypted|login/i.test(msg)) {
            console.warn('[lss-extract] DRM/auth block:', fbUrl, msg.slice(0, 200));
            return { drm: true, error: msg.slice(0, 200) };
        }
        console.warn('[lss-extract] yt-dlp fail:', msg.slice(0, 200));
        return null;
    }
}

async function _extractFrameJpeg(m3u8Url, offsetSec) {
    return new Promise((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(_ffmpegPath);
        const chunks = [];
        const cmd = ffmpeg(m3u8Url)
            .inputOptions(['-ss', String(offsetSec)]) // input-seek nhanh hơn output-seek
            .outputOptions(['-frames:v', '1', '-q:v', '5', '-f', 'image2'])
            .format('image2')
            .on('error', (err) => reject(new Error('ffmpeg: ' + err.message)))
            .on('end', () => {
                const buf = Buffer.concat(chunks);
                if (buf.length < 512) reject(new Error('frame size quá nhỏ — placeholder?'));
                else resolve(buf);
            });
        const stream = cmd.pipe();
        stream.on('data', (c) => chunks.push(c));
    });
}

async function _processExtractJob(pool, job) {
    const status = _batchStatus.get(job.batchId);
    try {
        if (!_ensureExtractDeps()) throw new Error('ffmpeg/yt-dlp not available');
        const m3u8 = await _resolveM3u8Url(job.liveVideoId, job.pageId);
        if (!m3u8) throw new Error('no m3u8 URL');
        if (m3u8.drm) {
            await pool.query(
                `UPDATE livestream_snapshots SET extract_status = 'drm_blocked' WHERE id = $1`,
                [job.snapshotId]
            );
            if (status) status.drmBlocked++;
            return;
        }
        const buf = await _extractFrameJpeg(m3u8, job.offsetSec);
        await pool.query(
            `UPDATE livestream_snapshots
               SET image_data = $1, image_mime = 'image/jpeg', image_size = $2,
                   thumbnail_url = $3, extract_status = 'done'
               WHERE id = $4`,
            [
                buf,
                buf.length,
                `${process.env.SELF_URL || 'https://n2store-fallback.onrender.com'}/api/livestream/snapshot/${job.snapshotId}/image`,
                job.snapshotId,
            ]
        );
        if (status) status.done++;
        _notify('extract-done', { snapshotId: job.snapshotId, batchId: job.batchId });
    } catch (e) {
        console.warn('[lss-extract] fail snap', job.snapshotId, ':', e.message);
        await pool.query(`UPDATE livestream_snapshots SET extract_status = 'fail' WHERE id = $1`, [
            job.snapshotId,
        ]);
        if (status) status.failed++;
    }
}

async function _runWorker(pool) {
    if (_workerRunning) return;
    _workerRunning = true;
    try {
        while (_extractQueue.length) {
            const job = _extractQueue.shift();
            await _processExtractJob(pool, job);
        }
    } finally {
        _workerRunning = false;
    }
}

// POST /extract-frame — batch enqueue snap extraction jobs.
// Body: { snapshotIds: [Number] } — sẽ lookup snap trong DB để biết liveVideoId + offset.
router.post('/extract-frame', express.json({ limit: '500kb' }), async (req, res) => {
    try {
        if (!_ensureExtractDeps()) {
            return res.status(503).json({ success: false, error: 'ffmpeg/yt-dlp not installed' });
        }
        const pool = req.app.locals.chatDb;
        const ids = Array.isArray(req.body?.snapshotIds)
            ? req.body.snapshotIds.map(Number).filter(Number.isFinite).slice(0, 200)
            : [];
        if (!ids.length)
            return res.status(400).json({ success: false, error: 'snapshotIds required' });
        // Lookup info từ DB.
        const r = await pool.query(
            `SELECT id, live_video_id, page_id, offset_seconds, extract_status, image_data
             FROM livestream_snapshots WHERE id = ANY($1::bigint[])`,
            [ids]
        );
        const batchId = 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const status = { total: 0, done: 0, failed: 0, drmBlocked: 0 };
        for (const row of r.rows) {
            // Skip nếu đã extract done với bytea sẵn.
            if (row.image_data && row.extract_status === 'done') continue;
            if (!row.live_video_id || !Number.isFinite(row.offset_seconds)) continue;
            _extractQueue.push({
                batchId,
                snapshotId: Number(row.id),
                offsetSec: Number(row.offset_seconds),
                liveVideoId: row.live_video_id,
                pageId: row.page_id,
            });
            await pool.query(
                `UPDATE livestream_snapshots SET extract_status = 'pending' WHERE id = $1`,
                [row.id]
            );
            status.total++;
        }
        _batchStatus.set(batchId, status);
        // Fire worker (async, don't block response).
        setImmediate(() => _runWorker(pool).catch(() => {}));
        res.json({ success: true, batchId, queued: status.total });
    } catch (e) {
        console.error('[lss-extract] enqueue error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /extract-status?batchId=X
router.get('/extract-status', (req, res) => {
    const batchId = String(req.query.batchId || '');
    if (!batchId) return res.status(400).json({ success: false, error: 'batchId required' });
    const status = _batchStatus.get(batchId);
    if (!status) return res.status(404).json({ success: false, error: 'batch not found' });
    res.json({ success: true, batchId, status, queued: _extractQueue.length });
});

// Ensure schema bổ sung extract_status column (idempotent).
(async function _initExtractSchema() {
    // Sẽ chạy 1 lần khi route file load. ensureSchema base table đã có,
    // ALTER column thêm extract_status.
})();
module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
