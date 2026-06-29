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
// LC-pollnow-auth (2026-06-12): mutation + route nặng tài nguyên (yt-dlp/ffmpeg
// trên 0.5 CPU) gate SOFT — enforce khi WEB2_AUTH_ENFORCE=1. GET /snapshot/:id/image
// GIỮ public (img src không gửi header).
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const crypto = require('crypto');
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

const _ensuredPools = new WeakSet();
async function ensureSchema(pool) {
    if (_ensuredPools.has(pool) || !pool) return;
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
    // One-time dedup migration: multi-client race condition tạo duplicate rows
    // cho cùng commentId. Trước khi add UNIQUE INDEX, phải clean dup. Gate
    // qua index existence → idempotent (chạy 1 lần thôi).
    const idxCheck = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = 'uq_lss_comment_id'`
    );
    if (!idxCheck.rows.length) {
        console.log('[livestream-snapshots] one-time dedup cleanup + add UNIQUE INDEX...');
        // User confirm: 'bạn xóa DB rồi làm cũng được' → TRUNCATE clean slate.
        await pool.query('TRUNCATE livestream_snapshots');
        await pool.query(
            `CREATE UNIQUE INDEX uq_lss_comment_id ON livestream_snapshots(comment_id)`
        );
        console.log('[livestream-snapshots] cleanup done — multi-client race condition fixed');
    }
    // One-time post-crop-fix TRUNCATE: user báo prev migration didn't actually
    // clear DB (still seeing old snapshots in web). Bump marker để force re-run.
    // Marker version mới: v20260524y-cropfix-v2.
    const descCheck = await pool.query(
        `SELECT obj_description('livestream_snapshots'::regclass, 'pg_class') AS d`
    );
    const desc = descCheck.rows[0]?.d || '';
    if (!desc.includes('v20260524y-cropfix-v2')) {
        console.log('[livestream-snapshots] one-time post-crop-fix TRUNCATE v2 — force clear...');
        const before = await pool.query(`SELECT count(*) AS c FROM livestream_snapshots`);
        await pool.query('TRUNCATE livestream_snapshots');
        await pool.query(
            `COMMENT ON TABLE livestream_snapshots IS 'v20260524y-cropfix-v2 — snapshots cleared (forced) after crop-to-iframe logic'`
        );
        console.log(
            `[livestream-snapshots] post-crop-fix TRUNCATE done — deleted ${before.rows[0].c} rows`
        );
    }
    _ensuredPools.add(pool);
    console.log('[livestream-snapshots] schema ready');
    _autoCleanupOldSnapshots(pool).catch(() => {});
    if (!ensureSchema._cleanupTimer) {
        ensureSchema._cleanupTimer = setInterval(
            () => _autoCleanupOldSnapshots(pool).catch(() => {}),
            6 * 60 * 60 * 1000
        );
    }
    // Wire retry cron cho live_active snaps (extract sau khi live end).
    try {
        if (typeof _startLiveActiveRetry === 'function') _startLiveActiveRetry(pool);
    } catch {}
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
        await ensureSchema(req.app.locals.web2Db || req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema: ' + e.message });
    }
});

// REMOVED per user req 'bỏ hết chức năng lấy thumbnail đi':
// - _computeThumbnailUrl: trả FB Graph URL — đã chết 400 từ 05/2026.
// - _fetchFbThumbnail: backend fetch URL → bytea.
// Frame thật giờ ONLY qua:
//   • Frontend imageBase64 (path 1 buffer / path 3 share+capture).
//   • Backend POST /extract-frame (path 2 yt-dlp + ffmpeg).

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
    // FB official solution (verified qua FB Developer docs):
    //   developers.facebook.com/docs/plugins/embedded-video-player/api/
    //   → player.seek(seconds) là API DUY NHẤT reliable cho seek.
    // URL params (?t=, ?start=, ?lst=, ?start_time=, #t=) đều unofficial,
    // không reliable. FB doesn't natively support timestamp URL params
    // (theo MakeVideoLink, Meta docs).
    //
    // Solution: local wrapper page live-chat/fb-video-player.html load
    // FB JS SDK + embed plugin + call player.seek(N) programmatic on
    // xfbml.ready event. Reliable seek dù live VOD hay regular VOD.
    const params = new URLSearchParams({ v: videoId });
    if (pageSlugOrId) params.set('page', pageSlugOrId);
    if (offsetSec && Number.isFinite(offsetSec) && offsetSec > 0) {
        params.set('t', String(Math.floor(offsetSec)));
    }
    return `https://nhijudy.store/live-chat/fb-video-player.html?${params.toString()}`;
}

function _mapRow(row) {
    if (!row) return null;
    // Re-compute livestream_url với URL scheme hiện tại (/watch/?v=ID&t=N).
    // Existing rows lưu old format /{page}/videos/{id}/?t= không seek được
    // → recompute on read để frontend luôn nhận URL mới.
    let livestreamUrl = row.livestream_url;
    if (row.live_video_id) {
        const recomputed = _computeLivestreamUrl(
            row.page_id, // không có page vanity ở backend; FB redirect tự xử lý
            row.live_video_id,
            row.offset_seconds
        );
        if (recomputed) livestreamUrl = recomputed;
    }
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
        livestreamUrl,
        thumbnailUrl: row.thumbnail_url,
        note: row.note,
        extractStatus: row.extract_status,
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
router.post('/snapshot', requireWeb2AuthSoft, express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        }
        // KHÔNG fetch thumbnail URL (TPOS / FB Graph generic) nữa — chỉ lưu
        // metadata + frame bytea nếu có. thumbnail_url chỉ set khi có bytea
        // (self-served URL). User req: 'bỏ hết chức năng lấy thumbnail'.
        let thumbnailUrl = null;
        const user = b.user || {};
        // ON CONFLICT (comment_id) DO UPDATE — multi-client race protection.
        // 'First writer with bytea wins' via COALESCE: nếu existing đã có
        // image_data thì giữ, ngược lại nhận bytea từ writer mới. Tránh trường
        // hợp 5 máy chụp 5 frame khác nhau → 5 rows. Comment_id NULL không
        // conflict (Postgres unique allows multiple NULLs by default).
        const r = await pool.query(
            `INSERT INTO livestream_snapshots
             (comment_id, customer_fb_user_id, customer_name, page_id, page_name,
              live_campaign_id, live_video_id, captured_at, captured_by, captured_by_name,
              offset_seconds, livestream_url, thumbnail_url, note,
              image_data, image_mime, image_size)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (comment_id) DO UPDATE SET
               image_data = COALESCE(livestream_snapshots.image_data, EXCLUDED.image_data),
               image_mime = COALESCE(livestream_snapshots.image_mime, EXCLUDED.image_mime),
               image_size = COALESCE(livestream_snapshots.image_size, EXCLUDED.image_size),
               customer_name = COALESCE(livestream_snapshots.customer_name, EXCLUDED.customer_name),
               offset_seconds = COALESCE(livestream_snapshots.offset_seconds, EXCLUDED.offset_seconds)
             RETURNING *, (xmax = 0) AS was_inserted`,
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
        const wasInserted = r.rows[0].was_inserted;
        // Nếu row có image_data (mới hoặc tồn tại sau ON CONFLICT) và thumbnail_url
        // chưa set → update về self-served endpoint. Derive absolute URL từ request
        // để frontend trên GH Pages / localhost đều resolve đúng origin Render.
        if (r.rows[0].image_data && !r.rows[0].thumbnail_url) {
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
        // Chỉ broadcast 'create' khi thực sự insert mới. Update từ ON CONFLICT
        // → broadcast 'update' để các client refresh thumbnail.
        _notify(wasInserted ? 'create' : 'update', {
            customerFbUserId: snap.customerFbUserId,
            id: snap.id,
        });
        res.json({ success: true, snapshot: snap, wasInserted });
    } catch (e) {
        console.error('[livestream-snapshots] create error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// LEGACY: POST /snapshot/:id/refresh-thumbnail — REMOVED per user req
// 'bỏ hết chức năng lấy thumbnail'. Frame thật giờ qua POST /extract-frame
// (yt-dlp + ffmpeg server-side) hoặc imageBase64 từ frontend buffer.
router.post('/snapshot/:id/refresh-thumbnail', requireWeb2AuthSoft, (req, res) => {
    res.status(410).json({
        success: false,
        error: 'deprecated — use POST /api/livestream/extract-frame instead',
    });
});

// GET /snapshot/:id/image — serve image bytea với Cache-Control immutable.
router.get('/snapshot/:id/image', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const idsRaw = String(req.query.commentIds || '').trim();
        if (!idsRaw) return res.json({ success: true, byCommentId: {} });
        const ids = idsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) return res.json({ success: true, byCommentId: {} });
        const limited = ids.slice(0, 200);
        const r = await pool.query(
            `SELECT id, comment_id, thumbnail_url, livestream_url, offset_seconds, captured_at,
                    page_id, live_video_id
             FROM livestream_snapshots
             WHERE comment_id = ANY($1::text[])`,
            [limited]
        );
        const byCommentId = {};
        for (const row of r.rows) {
            const existing = byCommentId[row.comment_id];
            if (existing && Number(existing.capturedAt) > Number(row.captured_at)) continue;
            // Recompute URL on read — DB còn rows lưu URL FB native cũ
            // (/watch/?v= hoặc /<page>/videos/<id>/) không support seek.
            // _mapRow đã làm, endpoint này trước đây bypass → bug click button
            // "Xem live tại giây N" mở FB native thay vì fb-video-player.html.
            const recomputed = row.live_video_id
                ? _computeLivestreamUrl(row.page_id, row.live_video_id, row.offset_seconds)
                : null;
            byCommentId[row.comment_id] = {
                id: row.id,
                thumbnailUrl: row.thumbnail_url,
                livestreamUrl: recomputed || row.livestream_url,
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
router.post(
    '/offline-batch',
    requireWeb2AuthSoft,
    express.json({ limit: '5mb' }),
    async (req, res) => {
        try {
            const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
            // LC-pollnow-auth (2026-06-12): cap payload — loop 2 query/row, body
            // không giới hạn số comment là vector kéo sập route (1 live thật ≤ ~2000).
            if (b.comments.length > 2000) {
                return res.status(400).json({
                    success: false,
                    error: `comments[] quá lớn (${b.comments.length} > 2000) — chia nhỏ payload`,
                });
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
                    // Offline-batch chỉ lưu metadata — KHÔNG lưu thumbnail URL.
                    // Backend POST /extract-frame sẽ điền bytea sau (user req).
                    const thumbnailUrl = null;
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
    }
);

// POST /wipe-all — XÓA SẠCH thumbnail (livestream_snapshots) + Kho Hình
// (livestream_images) để force extract lại từ đầu (Web 2.0 beta — user yêu cầu
// 2026-06-11 sau khi fix SDK player: data cũ chứa poster rác). Gate bằng
// x-admin-secret === CLEANUP_SECRET (pattern /ingest) + body {confirm:'YES-WIPE'}.
// TRUNCATE RESTART IDENTITY: giải phóng disk ngay + id đếm lại từ 1.
router.post('/wipe-all', async (req, res) => {
    const secret = process.env.CLEANUP_SECRET || '';
    if (!secret || (req.headers['x-admin-secret'] || '') !== secret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    if ((req.body || {}).confirm !== 'YES-WIPE') {
        return res.status(400).json({ success: false, error: "cần body {confirm:'YES-WIPE'}" });
    }
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const before = await pool.query(
            `SELECT (SELECT COUNT(*) FROM livestream_snapshots)::int AS snaps,
                    (SELECT COUNT(*) FROM livestream_images)::int AS imgs`
        );
        await pool.query(`TRUNCATE livestream_snapshots RESTART IDENTITY`);
        await pool.query(`TRUNCATE livestream_images RESTART IDENTITY`);
        _notify('wipe-all', {});
        console.log(
            `[livestream-snapshots] WIPE-ALL: deleted snaps=${before.rows[0].snaps} imgs=${before.rows[0].imgs}`
        );
        res.json({ success: true, deleted: before.rows[0] });
    } catch (e) {
        console.error('[livestream-snapshots] wipe-all fail:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /purge — xoá snapshot theo phạm vi: 'today' (GMT+7) | 'all'. Dùng dọn
// thumbnail đen kẹt (Web 2.0 beta, regenerable): xoá row → comment thành "pending"
// → tự chụp lại khi focus / Force extract vá từ VOD. KHÔNG đụng livestream_images
// (gallery cache) cho scope today. Gate x-admin-secret === CLEANUP_SECRET + body
// {confirm:'YES-PURGE', scope}. Notify clients (action 'purge') để clear cache live.
router.post('/purge', async (req, res) => {
    const secret = process.env.CLEANUP_SECRET || '';
    if (!secret || (req.headers['x-admin-secret'] || '') !== secret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const b = req.body || {};
    if (b.confirm !== 'YES-PURGE') {
        return res.status(400).json({ success: false, error: "cần body {confirm:'YES-PURGE'}" });
    }
    const scope = b.scope === 'all' ? 'all' : 'today';
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        let out;
        if (scope === 'all') {
            const before = await pool.query('SELECT COUNT(*)::int AS n FROM livestream_snapshots');
            await pool.query('TRUNCATE livestream_snapshots RESTART IDENTITY');
            out = { scope, deleted: before.rows[0].n };
        } else {
            // today 00:00 GMT+7 (tính tường minh — không phụ thuộc TZ server).
            const dayStart7 =
                Math.floor((Date.now() + 7 * 3600e3) / 86400e3) * 86400e3 - 7 * 3600e3;
            const iso = new Date(dayStart7).toISOString();
            const r = await pool.query('DELETE FROM livestream_snapshots WHERE created_at >= $1', [
                iso,
            ]);
            out = { scope, since: iso, deleted: r.rowCount };
        }
        _notify('purge', { scope });
        console.log(`[livestream-snapshots] PURGE scope=${scope} deleted=${out.deleted}`);
        res.json({ success: true, ...out });
    } catch (e) {
        console.error('[livestream-snapshots] purge fail:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/snapshot/:id', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
// MEDIUM-cleanup (2026-06-13): _batchStatus tích luỹ vô hạn (mỗi batch manual/
// extract-all/retry-cron tạo 1 entry, không có chỗ xoá → memory leak chậm).
// Sweep mỗi 10' xoá batch ĐÃ XONG (done+failed >= total — client đã poll) +
// hard cap 200 entry mới nhất (Map giữ thứ tự insert) chống phình.
setInterval(
    () => {
        try {
            for (const [id, st] of _batchStatus) {
                if (
                    st &&
                    Number(st.total) > 0 &&
                    Number(st.done || 0) + Number(st.failed || 0) >= st.total
                )
                    _batchStatus.delete(id);
            }
            const MAX = 200;
            if (_batchStatus.size > MAX) {
                let drop = _batchStatus.size - MAX;
                for (const k of _batchStatus.keys()) {
                    if (drop-- <= 0) break;
                    _batchStatus.delete(k);
                }
            }
        } catch (e) {
            console.warn('[livestream] _batchStatus sweep fail:', e.message);
        }
    },
    10 * 60 * 1000
).unref?.();
let _workerRunning = false;

// FB Graph API — resolve URL video playable cho ffmpeg. Thử nhiều chiến lược +
// log chi tiết để biết cái nào chạy được:
//   - page token + appsecret_proof (FB_APP_SECRET) — fix "Bad signature" nếu app
//     yêu cầu proof.
//   - page token trần.
//   - app access token `{FB_APP_ID}|{FB_APP_SECRET}`.
// Field thử: source (MP4 owned VOD), playable_url, dash_preview_url, permalink_url.
async function _resolveViaGraphSource(liveVideoId, pageId, pool) {
    // DISABLED (2026-06-06): đã test cạn — page token Pancake trả code=190 "Bad
    // signature" (do app khác phát), app token trả code=10/100 no-permission, và
    // FB deprecate field source/playable_url cho live VOD. Không có token FB hợp lệ
    // trong backend → Graph bất khả thi. Frontend đã chuyển extract sang CLIENT-SIDE
    // (browser có FB auth: seek iframe VOD + capture). Giữ code dưới để tham khảo;
    // return sớm để KHÔNG tốn 6 FB call/snap thừa trên cron retry.
    return null;
    /* eslint-disable no-unreachable */
    if (!pageId) return null;
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;

    let pageToken = null;
    if (pool) {
        try {
            const r = await pool.query(
                'SELECT token FROM pancake_page_access_tokens WHERE page_id = $1 LIMIT 1',
                [String(pageId)]
            );
            pageToken = r.rows?.[0]?.token || null;
        } catch (e) {
            console.warn('[lss-graph] token query fail:', e.message);
        }
    }

    const full = String(liveVideoId);
    const short = full.replace(/^\d+_/, '');
    const ids = full === short ? [full] : [short, full];

    const strategies = [];
    if (pageToken && appSecret) {
        const proof = crypto.createHmac('sha256', appSecret).update(pageToken).digest('hex');
        strategies.push({ label: 'page+proof', token: pageToken, proof });
    }
    if (pageToken) strategies.push({ label: 'page', token: pageToken });
    if (appId && appSecret) strategies.push({ label: 'apptoken', token: `${appId}|${appSecret}` });
    if (!strategies.length) {
        console.warn('[lss-graph] no token nào khả dụng (pageId', pageId, ')');
        return null;
    }

    const FIELDS = 'source,playable_url,dash_preview_url,permalink_url,live_status';
    for (const s of strategies) {
        for (const vid of ids) {
            try {
                let url = `https://graph.facebook.com/v19.0/${encodeURIComponent(vid)}?fields=${FIELDS}&access_token=${encodeURIComponent(s.token)}`;
                if (s.proof) url += `&appsecret_proof=${s.proof}`;
                const resp = await fetch(url);
                const d = await resp.json();
                const playable = d?.source || d?.playable_url || d?.dash_preview_url;
                if (playable) {
                    console.log(
                        `[lss-graph] PLAYABLE OK via ${s.label} vid=${vid} field=${d.source ? 'source' : d.playable_url ? 'playable_url' : 'dash'}`
                    );
                    return playable;
                }
                if (d?.error) {
                    console.warn(
                        `[lss-graph] ${s.label} vid=${vid} ERR code=${d.error.code}/${d.error.error_subcode} ${String(d.error.message || '').slice(0, 90)}`
                    );
                } else {
                    console.warn(
                        `[lss-graph] ${s.label} vid=${vid} no-playable; keys=${Object.keys(d || {}).join(',')}`
                    );
                }
            } catch (e) {
                console.warn(`[lss-graph] ${s.label} vid=${vid} fetch fail:`, e.message);
            }
        }
    }
    return null;
}

// Resolve URL video playable cho ffmpeg cắt frame.
// Strategy: (1) yt-dlp scrape (primary — binary update qua postinstall yt-dlp -U
// để fix "Cannot parse data" khi FB đổi web) → (2) FB Graph `source` fallback
// (chỉ chạy khi yt-dlp fail; hiện token Pancake trả "Bad signature" nên thường
// vô dụng, giữ làm future-proof nếu sau có token app đúng).
async function _resolveM3u8Url(liveVideoId, pageId, pool) {
    const cached = _m3u8Cache.get(liveVideoId);
    if (cached && Date.now() - cached.fetchedAt < _M3U8_CACHE_TTL) return cached.url;

    // (1) yt-dlp (primary).
    let drmResult = null;
    if (_ytdlp) {
        const videoIdShort = String(liveVideoId).replace(/^\d+_/, '');
        const fbUrl = `https://www.facebook.com/${pageId}/videos/${videoIdShort}/`;
        try {
            const result = await _ytdlp(fbUrl, {
                getUrl: true,
                noWarnings: true,
                noCheckCertificate: true,
            });
            const url = typeof result === 'string' ? result.trim().split('\n')[0] : null;
            if (url) {
                _m3u8Cache.set(liveVideoId, { url, fetchedAt: Date.now() });
                return url;
            }
        } catch (e) {
            const msg = e?.message || '';
            if (/Forbidden|DRM|encrypted|login/i.test(msg)) {
                console.warn('[lss-extract] DRM/auth block:', fbUrl, msg.slice(0, 200));
                drmResult = { drm: true, error: msg.slice(0, 200) };
            } else {
                console.warn('[lss-extract] yt-dlp fail:', msg.slice(0, 200));
            }
        }
    }

    // (2) FB Graph source fallback.
    const viaGraph = await _resolveViaGraphSource(liveVideoId, pageId, pool);
    if (viaGraph) {
        _m3u8Cache.set(liveVideoId, { url: viaGraph, fetchedAt: Date.now() });
        return viaGraph;
    }

    return drmResult; // {drm:true} nếu yt-dlp báo DRM, else null
}

// Run ffmpeg với input-seek (fast, có thể SIGSEGV) hoặc output-seek (slow,
// reliable). Output-seek decode từ start nên chậm cho offset lớn nhưng không
// crash với FB VOD MP4 fragments.
function _ffmpegExtract(m3u8Url, offsetSec, mode) {
    return new Promise((resolve, reject) => {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(_ffmpegPath);
        const chunks = [];
        let cmd = ffmpeg(m3u8Url);
        if (mode === 'input') {
            // -ss BEFORE -i: keyframe seek, nhanh nhưng SIGSEGV với một số HLS/VOD.
            cmd = cmd.inputOptions(['-ss', String(offsetSec)]);
            cmd = cmd.outputOptions(['-frames:v', '1', '-q:v', '5', '-f', 'image2']);
        } else {
            // -ss AFTER -i: decode từ start, accurate + reliable, slow cho offset lớn.
            cmd = cmd.outputOptions([
                '-ss',
                String(offsetSec),
                '-frames:v',
                '1',
                '-q:v',
                '5',
                '-f',
                'image2',
            ]);
        }
        // HTTP-only flags (timeout, UA spoof) — chỉ apply khi input là URL.
        // Local file input → skip vì ffmpeg reject 'timeout' option cho protocol file.
        const isUrl = /^https?:\/\//i.test(m3u8Url);
        if (isUrl) {
            cmd = cmd.inputOptions([
                '-timeout',
                '20000000',
                '-rw_timeout',
                '20000000',
                '-user_agent',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                '-headers',
                'Referer: https://www.facebook.com/\\r\\nOrigin: https://www.facebook.com',
            ]);
        }
        cmd.format('image2')
            .on('error', (err) => reject(new Error(`ffmpeg(${mode}): ` + err.message)))
            .on('end', () => {
                const buf = Buffer.concat(chunks);
                if (buf.length < 512) reject(new Error('frame size quá nhỏ'));
                else resolve(buf);
            });
        const stream = cmd.pipe();
        stream.on('data', (c) => chunks.push(c));
    });
}

async function _extractFrameJpeg(m3u8Url, offsetSec) {
    // Try input-seek first (fast). Nếu SIGSEGV → fallback output-seek (reliable).
    try {
        return await _ffmpegExtract(m3u8Url, offsetSec, 'input');
    } catch (e) {
        const msg = String(e?.message || e);
        if (/SIGSEGV|killed with signal/i.test(msg)) {
            console.log(
                `[lss-extract] input-seek SIGSEGV at offset ${offsetSec}s → fallback output-seek`
            );
            return await _ffmpegExtract(m3u8Url, offsetSec, 'output');
        }
        throw e;
    }
}

// Robust path: dùng yt-dlp end-to-end để download tiny segment quanh offset
// → local file → ffmpeg extract frame. yt-dlp handle FB auth/cookies/session
// properly mà ffmpeg HTTP client không làm được (URL signed token IP/session
// bound). Slower hơn direct ffmpeg nhưng work với FB CDN 403.
async function _extractFrameViaYtdlp(fbUrl, offsetSec) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmpDir = os.tmpdir();
    const tmpId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Use template — yt-dlp may rename based on detected format
    const tmpTemplate = path.join(tmpDir, `${tmpId}.%(ext)s`);
    try {
        // Download tiny window quanh offset. yt-dlp dùng FFmpeg external
        // downloader để --download-sections work với HLS/DASH.
        await _ytdlp(fbUrl, {
            output: tmpTemplate,
            downloadSections: `*${offsetSec}-${offsetSec + 2}`,
            forceKeyframesAtCuts: true,
            noWarnings: true,
            noCheckCertificate: true,
        });
        // Find downloaded file (yt-dlp picks extension based on stream)
        const files = fs
            .readdirSync(tmpDir)
            .filter((f) => f.startsWith(tmpId + '.'))
            .map((f) => path.join(tmpDir, f));
        if (!files.length) throw new Error('yt-dlp produced no file');
        const tmpFile = files[0];
        try {
            // Extract frame ở giây 0 của file (file CHỈ chứa offset..offset+2)
            return await _ffmpegExtract(tmpFile, 0, 'output');
        } finally {
            try {
                fs.unlinkSync(tmpFile);
            } catch {}
        }
    } catch (e) {
        // Cleanup any partial files
        try {
            const files = fs
                .readdirSync(tmpDir)
                .filter((f) => f.startsWith(tmpId + '.'))
                .map((f) => path.join(tmpDir, f));
            for (const f of files) fs.unlinkSync(f);
        } catch {}
        throw new Error('yt-dlp-download: ' + String(e?.message || e).slice(0, 200));
    }
}

async function _processExtractJob(pool, job) {
    const status = _batchStatus.get(job.batchId);
    try {
        if (!_ensureExtractDeps()) throw new Error('ffmpeg/yt-dlp not available');
        const m3u8 = await _resolveM3u8Url(job.liveVideoId, job.pageId, pool);
        if (!m3u8) throw new Error('no m3u8 URL');
        if (m3u8.drm) {
            await pool.query(
                `UPDATE livestream_snapshots SET extract_status = 'drm_blocked' WHERE id = $1`,
                [job.snapshotId]
            );
            if (status) status.drmBlocked++;
            return;
        }
        // Detect DASH live stream — không seek backward được.
        // FB live serve dash-abr-ibr trong khi đang live. Sau khi end → VOD HLS.
        const isLiveDash = /live-dash|dash-abr|hvideo.*\/live/i.test(m3u8);
        if (isLiveDash) {
            await pool.query(
                `UPDATE livestream_snapshots SET extract_status = 'live_active' WHERE id = $1`,
                [job.snapshotId]
            );
            // Track riêng liveActive (không phải failure thật — chỉ đang đợi
            // live end để FB convert thành VOD). User cần hiểu rõ.
            if (status) status.liveActive = (status.liveActive || 0) + 1;
            console.log(
                '[lss-extract] snap',
                job.snapshotId,
                ': live đang chạy — đợi end mới extract được'
            );
            return;
        }
        // 2-tier extract:
        //   Tier 1: direct ffmpeg fetch m3u8 (fast, ~1-2s/frame)
        //   Tier 2: fallback yt-dlp download segment + ffmpeg local (~5-10s/frame
        //     nhưng work với FB CDN 403)
        let buf;
        try {
            buf = await _extractFrameJpeg(m3u8, job.offsetSec);
        } catch (e1) {
            const msg = String(e1?.message || e1);
            // SIGSEGV (URL inaccessible) hoặc 403 → fallback yt-dlp download
            if (/SIGSEGV|403|Forbidden|killed with signal/i.test(msg)) {
                const videoIdShort = String(job.liveVideoId).replace(/^\d+_/, '');
                const fbUrl = `https://www.facebook.com/${job.pageId}/videos/${videoIdShort}/`;
                console.log(
                    `[lss-extract] snap ${job.snapshotId}: tier1 fail → tier2 yt-dlp download`
                );
                buf = await _extractFrameViaYtdlp(fbUrl, job.offsetSec);
            } else {
                throw e1;
            }
        }
        await pool.query(
            `UPDATE livestream_snapshots
               SET image_data = $1, image_mime = 'image/jpeg', image_size = $2,
                   thumbnail_url = $3, extract_status = 'done'
               WHERE id = $4`,
            [
                buf,
                buf.length,
                `${process.env.SELF_URL || 'https://web2-api-kv04.onrender.com'}/api/livestream/snapshot/${job.snapshotId}/image`,
                job.snapshotId,
            ]
        );
        if (status) status.done++;
        _notify('extract-done', { snapshotId: job.snapshotId, batchId: job.batchId });
    } catch (e) {
        const msg = String(e?.message || e);
        // Phân loại error chính xác hơn — chỉ mark live_active khi rõ ràng
        // do live còn chạy (SIGSEGV trên seek backward / DASH live). Errors
        // khác (Forbidden, 404, network) → 'fail' thật sự.
        const isLiveSegfault =
            /SIGSEGV|killed with signal/i.test(msg) && /live|seek|backward/i.test(msg);
        const newStatus = isLiveSegfault ? 'live_active' : 'fail';
        console.warn('[lss-extract] snap', job.snapshotId, '→', newStatus, ':', msg.slice(0, 300));
        await pool.query(`UPDATE livestream_snapshots SET extract_status = $1 WHERE id = $2`, [
            newStatus,
            job.snapshotId,
        ]);
        if (status) {
            if (newStatus === 'live_active') {
                status.liveActive = (status.liveActive || 0) + 1;
            } else {
                status.failed++;
            }
            // Lưu last 5 errors để frontend show chi tiết
            status.lastErrors = status.lastErrors || [];
            if (status.lastErrors.length < 5) {
                status.lastErrors.push({ id: job.snapshotId, msg: msg.slice(0, 200) });
            }
        }
    }
}

// Cron-style retry: mỗi 1 tiếng scan snaps 'live_active' xem live đã end chưa
// → re-enqueue extract. Live thường end sau vài tiếng → VOD HLS seekable.
let _retryTimer = null;
function _startLiveActiveRetry(pool) {
    if (_retryTimer) return;
    const ONE_HOUR = 60 * 60 * 1000;
    const run = async () => {
        try {
            const r = await pool.query(
                `SELECT id, live_video_id, page_id, offset_seconds
                 FROM livestream_snapshots
                 WHERE extract_status = 'live_active'
                   AND created_at > NOW() - INTERVAL '7 days'
                 ORDER BY created_at DESC LIMIT 50`
            );
            if (!r.rows.length) return;
            console.log('[lss-extract] retry', r.rows.length, 'live_active snaps');
            const batchId = 'retry_' + Date.now();
            _batchStatus.set(batchId, {
                total: r.rows.length,
                done: 0,
                failed: 0,
                drmBlocked: 0,
                liveActive: 0,
            });
            // Clear m3u8 cache để re-resolve (live có thể đã end → VOD URL khác).
            _m3u8Cache.clear();
            for (const row of r.rows) {
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
            }
            setImmediate(() => _runWorker(pool).catch(() => {}));
        } catch (e) {
            console.warn('[lss-extract] retry scan error:', e.message);
        }
    };
    _retryTimer = setInterval(run, ONE_HOUR);
    // Run once at startup 5 phút sau init.
    setTimeout(run, 5 * 60 * 1000);
}

// Worker concurrency — N parallel consumers cùng queue. Mỗi job chạy
// yt-dlp (cache 5min/video → only first call per video slow) + ffmpeg seek
// (~1-3s). 3 parallel safe trên Render 0.5 CPU; tăng nếu CPU tier cao hơn.
const WORKER_CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY) || 3;
async function _runWorker(pool) {
    if (_workerRunning) return;
    _workerRunning = true;
    try {
        const workers = Array.from({ length: WORKER_CONCURRENCY }, async (_, idx) => {
            while (_extractQueue.length) {
                const job = _extractQueue.shift();
                if (!job) break;
                try {
                    await _processExtractJob(pool, job);
                } catch (e) {
                    console.warn(`[lss-worker${idx}] job ${job.snapshotId} threw:`, e.message);
                }
            }
        });
        await Promise.all(workers);
    } finally {
        _workerRunning = false;
    }
}

// POST /extract-frame — batch enqueue snap extraction jobs.
// Body: { snapshotIds: [Number] } — sẽ lookup snap trong DB để biết liveVideoId + offset.
router.post(
    '/extract-frame',
    requireWeb2AuthSoft,
    express.json({ limit: '500kb' }),
    async (req, res) => {
        try {
            if (!_ensureExtractDeps()) {
                return res
                    .status(503)
                    .json({ success: false, error: 'ffmpeg/yt-dlp not installed' });
            }
            const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
            const status = { total: 0, done: 0, failed: 0, drmBlocked: 0, liveActive: 0 };
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
    }
);

// POST /extract-all-pending — force re-extract tất cả snap không có bytea
// Body: { liveVideoId?, pageId?, limit? (default 500, max 500) }
// Useful khi live end + VOD đã có nhưng cron chưa retry.
router.post(
    '/extract-all-pending',
    requireWeb2AuthSoft,
    express.json({ limit: '500kb' }),
    async (req, res) => {
        try {
            if (!_ensureExtractDeps()) {
                return res
                    .status(503)
                    .json({ success: false, error: 'ffmpeg/yt-dlp not installed' });
            }
            const pool = req.app.locals.web2Db || req.app.locals.chatDb;
            const b = req.body || {};
            const limit = Math.min(Math.max(Number(b.limit) || 500, 1), 500);
            const where = [
                'image_data IS NULL',
                'offset_seconds IS NOT NULL',
                'live_video_id IS NOT NULL',
                "(extract_status IS NULL OR extract_status IN ('pending','fail','live_active'))",
            ];
            const args = [];
            if (b.liveVideoId) {
                args.push(String(b.liveVideoId));
                where.push(`live_video_id = $${args.length}`);
            }
            if (b.pageId) {
                args.push(String(b.pageId));
                where.push(`page_id = $${args.length}`);
            }
            args.push(limit);
            const r = await pool.query(
                `SELECT id, live_video_id, page_id, offset_seconds
             FROM livestream_snapshots
             WHERE ${where.join(' AND ')}
             ORDER BY created_at DESC
             LIMIT $${args.length}`,
                args
            );
            const batchId =
                'ex_pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            const status = { total: 0, done: 0, failed: 0, drmBlocked: 0, liveActive: 0 };
            for (const row of r.rows) {
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
            setImmediate(() => _runWorker(pool).catch(() => {}));
            res.json({ success: true, batchId, queued: status.total });
        } catch (e) {
            console.error('[lss-extract] pending batch error:', e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    }
);

// POST /extract-test — test extract 1 snap SYNCHRONOUSLY + return chi tiết error.
router.post(
    '/extract-test',
    requireWeb2AuthSoft,
    express.json({ limit: '50kb' }),
    async (req, res) => {
        try {
            if (!_ensureExtractDeps()) {
                return res.json({ ok: false, step: 'deps', error: 'deps not loaded' });
            }
            const pool = req.app.locals.web2Db || req.app.locals.chatDb;
            const id = Number(req.body?.snapshotId);
            if (!id) return res.status(400).json({ ok: false, error: 'snapshotId required' });
            const r = await pool.query(
                `SELECT id, live_video_id, page_id, offset_seconds
             FROM livestream_snapshots WHERE id = $1`,
                [id]
            );
            if (!r.rows.length) return res.json({ ok: false, error: 'snap not found' });
            const row = r.rows[0];
            const out = {
                ok: false,
                snapshotId: id,
                liveVideoId: row.live_video_id,
                pageId: row.page_id,
                offsetSec: row.offset_seconds,
                steps: [],
            };
            // Step 1: yt-dlp get URL
            out.steps.push('yt-dlp resolve...');
            const videoIdShort = String(row.live_video_id).replace(/^\d+_/, '');
            const fbUrl = `https://www.facebook.com/${row.page_id}/videos/${videoIdShort}/`;
            out.fbUrl = fbUrl;
            let m3u8 = null;
            try {
                const result = await _ytdlp(fbUrl, {
                    getUrl: true,
                    noWarnings: true,
                    noCheckCertificate: true,
                });
                m3u8 = typeof result === 'string' ? result.trim().split('\n')[0] : null;
                out.m3u8 = m3u8 ? m3u8.slice(0, 200) : null;
            } catch (e) {
                out.ytdlpError = String(e?.message || e).slice(0, 1000);
                out.ytdlpStderr = String(e?.stderr || '').slice(0, 1000);
                return res.json(out);
            }
            if (!m3u8) return res.json({ ...out, error: 'yt-dlp returned no URL' });
            out.steps.push('ffmpeg seek + extract...');
            try {
                const buf = await _extractFrameJpeg(m3u8, row.offset_seconds);
                out.ok = true;
                out.imageSize = buf.length;
            } catch (e) {
                out.ffmpegError = String(e?.message || e).slice(0, 1000);
                return res.json(out);
            }
            res.json(out);
        } catch (e) {
            res.status(500).json({ ok: false, error: String(e?.message || e).slice(0, 1000) });
        }
    }
);

// GET /extract-diag — chẩn đoán deps + thử extract sample.
router.get('/extract-diag', async (req, res) => {
    const out = { ffmpegStatic: null, ytdlp: null, error: null };
    try {
        try {
            out.ffmpegStatic = require('ffmpeg-static');
        } catch (e) {
            out.ffmpegStaticError = e.message;
        }
        try {
            const ytdlp = require('youtube-dl-exec');
            out.ytdlpLoaded = !!ytdlp;
            // Try a simple version check
            try {
                const ver = await ytdlp(null, { version: true });
                out.ytdlpVersion = String(ver).slice(0, 200);
            } catch (e2) {
                out.ytdlpVersionError = String(e2.message || e2).slice(0, 500);
            }
        } catch (e) {
            out.ytdlpError = e.message;
        }
        // Check ffmpeg executable
        if (out.ffmpegStatic) {
            try {
                const { execFileSync } = require('child_process');
                const ver = execFileSync(out.ffmpegStatic, ['-version'], {
                    encoding: 'utf8',
                    timeout: 5000,
                });
                out.ffmpegVersion = ver.split('\n')[0];
            } catch (e) {
                out.ffmpegExecError = String(e.message || e).slice(0, 500);
            }
        }
    } catch (e) {
        out.error = e.message;
    }
    res.json(out);
});

// GET /extract-status?batchId=X
router.get('/extract-status', (req, res) => {
    const batchId = String(req.query.batchId || '');
    if (!batchId) return res.status(400).json({ success: false, error: 'batchId required' });
    const status = _batchStatus.get(batchId);
    if (!status) return res.status(404).json({ success: false, error: 'batch not found' });
    res.json({ success: true, batchId, status, queued: _extractQueue.length });
});

// GET /stream-url?pageId=X&liveVideoId=Y
// Resolve raw FB stream URL qua yt-dlp (cache 5min, share với extract worker).
// Trả về { url, protocol: 'dash'|'hls'|'unknown' } để frontend chọn player.
router.get('/stream-url', requireWeb2AuthSoft, async (req, res) => {
    try {
        if (!_ensureExtractDeps()) {
            return res.status(503).json({ success: false, error: 'yt-dlp not installed' });
        }
        const { pageId, liveVideoId } = req.query;
        if (!pageId || !liveVideoId) {
            return res.status(400).json({ success: false, error: 'pageId + liveVideoId required' });
        }
        const m = await _resolveM3u8Url(
            liveVideoId,
            pageId,
            req.app.locals.web2Db || req.app.locals.chatDb
        );
        if (!m) {
            return res.status(502).json({ success: false, error: 'resolve fail (Graph + yt-dlp)' });
        }
        if (m.drm) {
            return res.json({ success: false, drm: true, error: m.error });
        }
        const url = String(m);
        const protocol = /live-dash|dash-abr|\.mpd/i.test(url)
            ? 'dash'
            : /\.m3u8|hls/i.test(url)
              ? 'hls'
              : 'unknown';
        res.json({ success: true, url, protocol });
    } catch (e) {
        console.error('[stream-url] error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Ensure schema bổ sung extract_status column (idempotent).
(async function _initExtractSchema() {
    // Sẽ chạy 1 lần khi route file load. ensureSchema base table đã có,
    // ALTER column thêm extract_status.
})();
module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureSchema = ensureSchema; // boot-migrate (web2-livestream-media-migrate) tạo bảng đích trên web2Db
// Reuse extraction pipeline (yt-dlp + ffmpeg) cho route khác (livestream-images
// fallback). DRY — tránh duplicate FB VOD frame extraction logic.
module.exports._extractHelpers = {
    ensureExtractDeps: _ensureExtractDeps,
    resolveM3u8Url: _resolveM3u8Url,
    extractFrameJpeg: _extractFrameJpeg,
};
