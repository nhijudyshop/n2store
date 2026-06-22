// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — "Giọng AI Pro" proxy (cho trang Xưởng Video AI / video-maker).
 * Prefix /api/web2-tts-pro → worker auto-forward (startsWith '/api/web2-').
 *
 * ⚠ Tên trung tính (KHÔNG dùng "vivibe"/"lucylab") để không lộ nhà cung cấp ra frontend.
 *
 * Endpoints:
 *   GET  /status   → { ok, configured, keys }
 *   GET  /voices   → { ok, voices:[{id,name,tags,description}], total, hasNext }
 *                    query: ?search=&page=&limit=&scope=community|user (mặc định community)
 *   POST /tts      → audio/wav  body { text, voice_id, speed? }
 *
 * Key giấu ở env VIVIBE_API_KEY1..N (Render). Rate-limit IP để khỏi đốt credit.
 */
'use strict';

const express = require('express');
const router = express.Router();
const svc = require('../services/web2-tts-pro-service');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

const _hits = new Map();
const RATE_LIMIT = 30; // req/phút/IP
function rateLimit(req, res, next) {
    const ip =
        req.headers['cf-connecting-ip'] ||
        String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .pop()
            .trim() ||
        req.socket?.remoteAddress ||
        'unknown';
    const now = Date.now();
    const hits = (_hits.get(ip) || []).filter((t) => now - t < 60_000);
    if (hits.length >= RATE_LIMIT) {
        return res.status(429).json({ ok: false, error: 'Rate limit: tối đa 30 lần/phút' });
    }
    hits.push(now);
    _hits.set(ip, hits);
    if (_hits.size > 1000) _hits.clear();
    next();
}

router.get('/status', (req, res) => {
    res.json({ ok: true, configured: svc.configured(), keys: svc.keyCount() });
});

// Danh sách giọng. Mặc định cộng đồng (nơi có giọng "Adam 3"); scope=user lấy giọng tài khoản.
router.get('/voices', async (req, res) => {
    try {
        if (!svc.configured())
            return res.status(503).json({ ok: false, error: 'Dịch vụ giọng chưa cấu hình' });
        const params = {
            search: req.query.search,
            page: req.query.page,
            limit: req.query.limit,
        };
        const out =
            String(req.query.scope || 'community') === 'user'
                ? await svc.listUserVoices(params)
                : await svc.listCommunityVoices(params);
        res.json({ ok: true, ...out });
    } catch (e) {
        console.error('[web2-tts-pro] voices', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

router.post(
    '/tts',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '64kb' }),
    async (req, res) => {
        try {
            if (!svc.configured())
                return res.status(503).json({ ok: false, error: 'Dịch vụ giọng chưa cấu hình' });
            const { text, voice_id, speed } = req.body || {};
            if (!text) return res.status(400).json({ ok: false, error: 'Thiếu text' });
            if (!voice_id) return res.status(400).json({ ok: false, error: 'Thiếu voice_id' });
            const wav = await svc.tts(text, voice_id, { speed });
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Cache-Control', 'no-store');
            res.send(wav);
        } catch (e) {
            console.error('[web2-tts-pro] tts', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

module.exports = router;
