// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — proxy cấu hình relay realtime (chọn trang join WS per-page).
// =====================================================================
// web2-live-relay — cầu nối pancake-settings ↔ relay web2-realtime.
//
// Relay (service web2-realtime, Pancake WS) join per-page `pages:{pageId}` để né
// lỗi "Gói cước hết hạn" của `multiple_pages:` (1 page hết gói kéo cả bó chết).
// Frontend KHÔNG có RELAY_SECRET → route này forward server-to-server, gắn secret.
//
// Routes (mount /api/web2-live-relay):
//   GET  /pages            → { success, accounts:[{userId,name,allPages:[{id,name,image,enabled,joinFailed}],selectedPageIds}] }
//   POST /connect { userId?, pageIds:[...] } → đặt tập trang BẬT + reconnect per-page
// =====================================================================

'use strict';
const express = require('express');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const router = express.Router();

const RELAY_URL = (process.env.WEB2_REALTIME_URL || 'https://web2-realtime.onrender.com').replace(
    /\/+$/,
    ''
);
const RELAY_SECRET = process.env.RELAY_SECRET || process.env.CLEANUP_SECRET || '';

async function relayFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (RELAY_SECRET) headers['x-relay-secret'] = RELAY_SECRET;
    const resp = await fetch(RELAY_URL + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(20000),
    });
    const text = await resp.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = { success: false, error: text.slice(0, 200) };
    }
    return { status: resp.status, json };
}

// GET /pages — danh sách trang + lựa chọn hiện tại (cho UI checkbox).
router.get('/pages', async (req, res) => {
    try {
        const { status, json } = await relayFetch('/api/pages-available');
        res.status(status).json(json);
    } catch (e) {
        res.status(502).json({ success: false, error: 'relay unreachable: ' + e.message });
    }
});

// POST /connect { userId?, pageIds } — đặt tập trang BẬT + reconnect per-page.
router.post('/connect', requireWeb2AuthSoft, async (req, res) => {
    const pageIds = Array.isArray(req.body?.pageIds) ? req.body.pageIds : null;
    if (!pageIds) return res.status(400).json({ success: false, error: 'pageIds[] required' });
    try {
        const { status, json } = await relayFetch('/api/connect-pages', {
            method: 'POST',
            body: { userId: req.body?.userId, pageIds },
        });
        res.status(status).json(json);
    } catch (e) {
        res.status(502).json({ success: false, error: 'relay unreachable: ' + e.message });
    }
});

module.exports = router;
