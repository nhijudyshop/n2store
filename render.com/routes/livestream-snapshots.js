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
// Thumbnail (Phase 2):
//   Dùng FB public picture endpoint:
//     https://graph.facebook.com/{liveVideoId}/picture?type=large
//   Hoặc og:image của live URL. Không cần access token cho live public.
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_lss_customer
            ON livestream_snapshots(customer_fb_user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_lss_live_video
            ON livestream_snapshots(page_id, live_video_id);
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
//   capturedAt?, offsetSeconds?, note?, user: {id, name}
// }
router.post('/snapshot', async (req, res) => {
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
        const thumbnailUrl = _computeThumbnailUrl(b.liveVideoId);
        const user = b.user || {};
        const r = await pool.query(
            `INSERT INTO livestream_snapshots
             (comment_id, customer_fb_user_id, customer_name, page_id, page_name,
              live_campaign_id, live_video_id, captured_at, captured_by, captured_by_name,
              offset_seconds, livestream_url, thumbnail_url, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
            ]
        );
        const snap = _mapRow(r.rows[0]);
        _notify('create', { customerFbUserId: snap.customerFbUserId, id: snap.id });
        res.json({ success: true, snapshot: snap });
    } catch (e) {
        console.error('[livestream-snapshots] create error:', e.message);
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
