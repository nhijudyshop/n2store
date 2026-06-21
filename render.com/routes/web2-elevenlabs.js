// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — ElevenLabs TTS proxy (cho trang Tạo video / video-maker).
 * Prefix /api/web2-elevenlabs → worker auto-forward (startsWith '/api/web2-').
 *
 * Endpoints:
 *   GET  /status   → { ok, configured }                — frontend biết có bật không
 *   GET  /voices   → { voices:[{voice_id,name,labels}] } — kho giọng (Adam, Rachel…)
 *   POST /tts      → audio/mpeg (mp3)  body {text, voice_id, model_id?}
 *
 * Key giấu ở env ELEVENLABS_API_KEY (Render). Rate-limit IP để khỏi đốt credit.
 */
'use strict';

const express = require('express');
const router = express.Router();
const svc = require('../services/web2-elevenlabs-service');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

// rate-limit (free tier credit ít) — giống web2-cutout
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

router.get('/voices', async (req, res) => {
    try {
        if (!svc.configured())
            return res.status(503).json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
        const voices = await svc.listVoices();
        res.json({ ok: true, voices });
    } catch (e) {
        console.error('[web2-elevenlabs] voices', e.message);
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
                return res
                    .status(503)
                    .json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
            const { text, voice_id, model_id } = req.body || {};
            if (!text) return res.status(400).json({ ok: false, error: 'Thiếu text' });
            if (!voice_id) return res.status(400).json({ ok: false, error: 'Thiếu voice_id' });
            const mp3 = await svc.tts(text, voice_id, model_id);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.send(mp3);
        } catch (e) {
            console.error('[web2-elevenlabs] tts', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

module.exports = router;
