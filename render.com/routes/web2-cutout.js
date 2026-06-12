// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 MODULE.
/**
 * Web 2.0 — Cutout route (tách nền chất lượng cao qua API thứ 3).
 * Mount: app.use('/api/web2/cutout', require('./routes/web2-cutout'))
 * (PHẢI mount TRƯỚC '/api/web2' generic để Express ưu tiên path cụ thể.)
 *
 * Endpoints:
 *   GET  /api/web2/cutout/status        → engine nào đã cấu hình
 *   POST /api/web2/cutout/photoroom     → { image: dataURL } → { image: dataURL PNG }
 *
 * Frontend (web2/photo-studio) gọi qua CF worker:
 *   https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/cutout/photoroom
 */
'use strict';

const express = require('express');
const router = express.Router();
const svc = require('../services/web2-cutout-service');
// 1D-auth (2026-06-12): API tách nền TRẢ PHÍ (PhotoRoom/withoutbg/fal) — gate SOFT
// + rate-limit IP để người lạ không hammer drain quota. Enforce khi WEB2_AUTH_ENFORCE=1.
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const _cutoutHits = new Map(); // ip → [timestamps]
const CUTOUT_RATE_LIMIT = 20; // req/phút/IP (page-flow thật ~1-3 req/phút)
function cutoutRateLimit(req, res, next) {
    const ip =
        req.headers['cf-connecting-ip'] ||
        String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .pop()
            .trim() ||
        req.socket?.remoteAddress ||
        'unknown';
    const now = Date.now();
    const hits = (_cutoutHits.get(ip) || []).filter((t) => now - t < 60_000);
    if (hits.length >= CUTOUT_RATE_LIMIT) {
        return res.status(429).json({ success: false, error: 'Rate limit: tối đa 20 ảnh/phút' });
    }
    hits.push(now);
    _cutoutHits.set(ip, hits);
    if (_cutoutHits.size > 1000) _cutoutHits.clear(); // chống phình map
    next();
}

// Body lớn (ảnh base64) — parser riêng cho router này.
const jsonLarge = express.json({ limit: '16mb' });

router.get('/status', (req, res) => {
    res.json({ success: true, engines: svc.engines() });
});

router.post('/withoutbg', requireWeb2AuthSoft, cutoutRateLimit, jsonLarge, async (req, res) => {
    try {
        const { image } = req.body || {};
        if (!image) return res.status(400).json({ success: false, error: 'Thiếu ảnh (image)' });
        if (!svc.withoutbgConfigured()) {
            return res
                .status(503)
                .json({ success: false, error: 'WITHOUTBG_API_KEY chưa cấu hình trên server' });
        }
        const buf = svc.decodeImage(image);
        const out = await svc.withoutbgCutout(buf);
        res.json({ success: true, image: 'data:image/png;base64,' + out.toString('base64') });
    } catch (e) {
        console.error('[web2-cutout] withoutbg', e.message);
        res.status(500).json({ success: false, error: String(e.message || e) });
    }
});

router.post('/birefnet', requireWeb2AuthSoft, cutoutRateLimit, jsonLarge, async (req, res) => {
    try {
        const { image } = req.body || {};
        if (!image) return res.status(400).json({ success: false, error: 'Thiếu ảnh (image)' });
        if (!svc.falConfigured()) {
            return res
                .status(503)
                .json({ success: false, error: 'FAL_KEY chưa cấu hình trên server' });
        }
        const buf = svc.decodeImage(image);
        const out = await svc.birefnetCutout(buf);
        res.json({ success: true, image: 'data:image/png;base64,' + out.toString('base64') });
    } catch (e) {
        console.error('[web2-cutout] birefnet', e.message);
        res.status(500).json({ success: false, error: String(e.message || e) });
    }
});

router.post('/photoroom', requireWeb2AuthSoft, cutoutRateLimit, jsonLarge, async (req, res) => {
    try {
        const { image } = req.body || {};
        if (!image) return res.status(400).json({ success: false, error: 'Thiếu ảnh (image)' });
        if (!svc.photoroomConfigured()) {
            return res
                .status(503)
                .json({ success: false, error: 'PHOTOROOM_API_KEY chưa cấu hình trên server' });
        }
        const buf = svc.decodeImage(image);
        const out = await svc.photoroomCutout(buf);
        res.json({ success: true, image: 'data:image/png;base64,' + out.toString('base64') });
    } catch (e) {
        console.error('[web2-cutout] photoroom', e.message);
        res.status(500).json({ success: false, error: String(e.message || e) });
    }
});

module.exports = router;
