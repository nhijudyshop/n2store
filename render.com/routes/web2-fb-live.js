// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — FB Live (thay TPOS): live videos + thumbnails + comment poll→SSE.
// =====================================================================
// /api/web2-fb-live — thay thế TPOS cho cột "xem comment livestream":
//   GET  /videos?pageId=&token=            → live_videos + thumbnail (FB Graph)
//   GET  /comments?liveVideoId=&token=&since= → 1-shot comments (load/VOD)
//   POST /poll/start  {liveVideoId,pageId,token}  → bật poller server-side,
//        broadcast comment mới qua SSE topic `web2:livestream:<liveVideoId>`
//   POST /poll/stop   {liveVideoId}        → tắt poller
//   GET  /poll/status                       → debug danh sách poller
//
// MẤU CHỐT: token = `page_access_token` lấy từ Pancake /v1/pages
// (PancakeAPI.fetchPages → page.settings.page_access_token) = FB page token
// THẬT → gọi thẳng graph.facebook.com, KHÔNG cần TPOS. (TPOS bên trong cũng
// chỉ poll FB Graph rồi proxy SSE ra — đây tái tạo 1-1, độc lập TPOS.)
//
// ADDITIVE: route mới, chưa frontend nào gọi → KHÔNG phá path TPOS hiện tại.
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();

const GRAPH = 'https://graph.facebook.com/v21.0';
const POLL_INTERVAL_MS = 2500; // poll mỗi 2.5s (giống nhịp TPOS)
const POLLER_STALE_MS = 8 * 60 * 1000; // tự tắt nếu 8' không có /poll/start refresh (keepalive)
const MAX_POLLERS = 20; // backstop chống leak
const SEEN_CAP = 5000; // cap set id đã thấy / poller

// ─── SSE notifier (web2 hub) — wired ở server.js ────────────────────────
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _broadcast(liveVideoId, payload) {
    if (!_notifyClients || !liveVideoId) return;
    try {
        _notifyClients(`web2:livestream:${liveVideoId}`, payload, 'update');
    } catch (e) {
        console.warn('[WEB2-FB-LIVE] broadcast fail:', e.message);
    }
}

// ─── FB Graph fetch helper (node 22 global fetch) ───────────────────────
async function graphGet(path, params) {
    const qs = new URLSearchParams(params).toString();
    const url = `${GRAPH}/${path}?${qs}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.fbCode = data?.error?.code;
        err.status = res.status;
        throw err;
    }
    return data;
}

// Chuẩn hoá 1 comment FB → shape gọn cho client.
function mapComment(c) {
    return {
        id: c.id,
        message: c.message || '',
        createdTime: c.created_time || null,
        fromId: c.from?.id || null,
        fromName: c.from?.name || '',
        parentId: c.parent?.id || null,
        attachment: c.attachment?.media?.image?.src || null,
    };
}

// ─── GET /videos?pageId=&token= — live videos + thumbnail (batch) ───────
router.get('/videos', async (req, res) => {
    const pageId = String(req.query.pageId || '').trim();
    const token = String(req.query.token || req.get('X-Page-Access-Token') || '').trim();
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    if (!pageId || !token) {
        return res.status(400).json({ success: false, error: 'pageId + token required' });
    }
    try {
        const lv = await graphGet(`${pageId}/live_videos`, {
            fields: 'id,status,title,description,permalink_url,creation_time,broadcast_start_time,video{id}',
            limit,
            access_token: token,
        });
        const videos = Array.isArray(lv.data) ? lv.data : [];
        // Thumbnail batch: 1 sub-request /{videoId}/thumbnails mỗi video.
        const withThumbs = await Promise.all(
            videos.map(async (v) => {
                let thumbnail = null;
                const vid = v.video?.id || v.id;
                try {
                    const th = await graphGet(`${vid}/thumbnails`, {
                        fields: 'uri,is_preferred,width,height',
                        access_token: token,
                    });
                    const arr = Array.isArray(th.data) ? th.data : [];
                    const pref = arr.find((t) => t.is_preferred) || arr[0];
                    thumbnail = pref?.uri || null;
                } catch (e) {
                    /* thumbnail optional */
                }
                return {
                    objectId: v.id,
                    videoId: vid,
                    title: v.title || v.description || '(không tiêu đề)',
                    statusLive: v.status, // LIVE | LIVE_STOPPED | VOD | PROCESSING
                    permalinkUrl: v.permalink_url || null,
                    channelCreatedTime: v.broadcast_start_time || v.creation_time || null,
                    thumbnail: { url: thumbnail },
                };
            })
        );
        res.json({ success: true, data: withThumbs });
    } catch (e) {
        console.error('[WEB2-FB-LIVE] videos error:', e.message);
        res.status(502).json({ success: false, error: e.message, fbCode: e.fbCode });
    }
});

// ─── GET /comments?liveVideoId=&token=&since= — 1-shot (load/VOD) ───────
router.get('/comments', async (req, res) => {
    const liveVideoId = String(req.query.liveVideoId || '').trim();
    const token = String(req.query.token || req.get('X-Page-Access-Token') || '').trim();
    const since = req.query.since ? String(req.query.since) : null;
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    if (!liveVideoId || !token) {
        return res.status(400).json({ success: false, error: 'liveVideoId + token required' });
    }
    try {
        const params = {
            order: 'reverse_chronological',
            live_filter: 'no_filter',
            fields: 'id,from{id,name},message,created_time,parent{id},attachment',
            limit,
            access_token: token,
        };
        if (since) params.since = since;
        const r = await graphGet(`${liveVideoId}/comments`, params);
        const comments = (Array.isArray(r.data) ? r.data : []).map(mapComment);
        res.json({ success: true, data: comments });
    } catch (e) {
        console.error('[WEB2-FB-LIVE] comments error:', e.message);
        res.status(502).json({ success: false, error: e.message, fbCode: e.fbCode });
    }
});

// ─── Poller registry (server-side, 1 poller / liveVideoId) ──────────────
const _pollers = new Map(); // liveVideoId → { timer, since, seen:Set, token, pageId, lastTouch, errCount }

function _stopPoller(liveVideoId) {
    const p = _pollers.get(liveVideoId);
    if (!p) return;
    clearInterval(p.timer);
    _pollers.delete(liveVideoId);
    console.log(`[WEB2-FB-LIVE] poller stopped: ${liveVideoId}`);
}

async function _pollOnce(liveVideoId) {
    const p = _pollers.get(liveVideoId);
    if (!p) return;
    // Tự tắt nếu stale (client không refresh keepalive).
    if (Date.now() - p.lastTouch > POLLER_STALE_MS) {
        _stopPoller(liveVideoId);
        return;
    }
    try {
        const params = {
            order: 'chronological',
            live_filter: 'no_filter',
            fields: 'id,from{id,name},message,created_time,parent{id},attachment',
            limit: 50,
            access_token: p.token,
        };
        if (p.since) params.since = p.since;
        const r = await graphGet(`${liveVideoId}/comments`, params);
        p.errCount = 0;
        const rows = Array.isArray(r.data) ? r.data : [];
        const fresh = [];
        for (const c of rows) {
            if (p.seen.has(c.id)) continue;
            p.seen.add(c.id);
            fresh.push(mapComment(c));
            // advance cursor theo created_time mới nhất
            if (c.created_time) {
                const ts = Math.floor(new Date(c.created_time).getTime() / 1000);
                if (!p.since || ts >= Number(p.since)) p.since = String(ts);
            }
        }
        // cap seen set
        if (p.seen.size > SEEN_CAP) {
            p.seen = new Set(Array.from(p.seen).slice(-Math.floor(SEEN_CAP / 2)));
        }
        if (fresh.length) {
            _broadcast(liveVideoId, {
                action: 'comments',
                liveVideoId,
                comments: fresh,
                ts: Date.now(),
            });
        }
    } catch (e) {
        p.errCount = (p.errCount || 0) + 1;
        console.warn(`[WEB2-FB-LIVE] poll ${liveVideoId} err(${p.errCount}):`, e.message);
        // FB token/permission error (190/200/100) hoặc 5 lỗi liên tiếp → tắt.
        if ([190, 200, 100, 10].includes(e.fbCode) || p.errCount >= 5) {
            _broadcast(liveVideoId, {
                action: 'poll-error',
                liveVideoId,
                error: e.message,
                ts: Date.now(),
            });
            _stopPoller(liveVideoId);
        }
    }
}

// ─── POST /poll/start {liveVideoId,pageId,token} — bật/refresh poller ───
router.post('/poll/start', (req, res) => {
    const b = req.body || {};
    const liveVideoId = String(b.liveVideoId || '').trim();
    const token = String(b.token || '').trim();
    const pageId = String(b.pageId || '').trim();
    if (!liveVideoId || !token) {
        return res.status(400).json({ success: false, error: 'liveVideoId + token required' });
    }
    const existing = _pollers.get(liveVideoId);
    if (existing) {
        // Refresh keepalive + token (phòng token rotate).
        existing.lastTouch = Date.now();
        existing.token = token;
        return res.json({ success: true, status: 'refreshed', liveVideoId });
    }
    if (_pollers.size >= MAX_POLLERS) {
        return res.status(429).json({ success: false, error: 'too many active pollers' });
    }
    const p = {
        timer: null,
        since: b.since ? String(b.since) : null,
        seen: new Set(),
        token,
        pageId,
        lastTouch: Date.now(),
        errCount: 0,
    };
    p.timer = setInterval(() => _pollOnce(liveVideoId), POLL_INTERVAL_MS);
    _pollers.set(liveVideoId, p);
    console.log(`[WEB2-FB-LIVE] poller started: ${liveVideoId} (page ${pageId})`);
    // poll ngay 1 lần để không chờ interval đầu
    _pollOnce(liveVideoId);
    res.json({ success: true, status: 'started', liveVideoId });
});

// ─── POST /poll/stop {liveVideoId} ──────────────────────────────────────
router.post('/poll/stop', (req, res) => {
    const liveVideoId = String((req.body || {}).liveVideoId || '').trim();
    if (!liveVideoId)
        return res.status(400).json({ success: false, error: 'liveVideoId required' });
    _stopPoller(liveVideoId);
    res.json({ success: true, stopped: liveVideoId });
});

// ─── GET /poll/status — debug ───────────────────────────────────────────
router.get('/poll/status', (req, res) => {
    const list = Array.from(_pollers.entries()).map(([id, p]) => ({
        liveVideoId: id,
        pageId: p.pageId,
        since: p.since,
        seen: p.seen.size,
        errCount: p.errCount,
        ageMs: Date.now() - p.lastTouch,
    }));
    res.json({ success: true, active: list.length, pollers: list });
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
