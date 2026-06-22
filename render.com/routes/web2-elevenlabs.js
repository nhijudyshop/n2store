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
            const { text, voice_id, model_id, voice_settings, language_code } = req.body || {};
            if (!text) return res.status(400).json({ ok: false, error: 'Thiếu text' });
            if (!voice_id) return res.status(400).json({ ok: false, error: 'Thiếu voice_id' });
            const mp3 = await svc.tts(text, voice_id, {
                modelId: model_id,
                voiceSettings: voice_settings,
                languageCode: language_code,
            });
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.send(mp3);
        } catch (e) {
            console.error('[web2-elevenlabs] tts', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// text mô tả → hiệu ứng âm thanh (mp3)
router.post(
    '/sound',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '16kb' }),
    async (req, res) => {
        try {
            if (!svc.configured())
                return res
                    .status(503)
                    .json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
            const { text, duration_seconds, prompt_influence } = req.body || {};
            if (!text) return res.status(400).json({ ok: false, error: 'Thiếu mô tả âm thanh' });
            const mp3 = await svc.soundEffect(text, {
                durationSeconds: duration_seconds,
                promptInfluence: prompt_influence,
            });
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.send(mp3);
        } catch (e) {
            console.error('[web2-elevenlabs] sound', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// audio (base64) → transcript {text, language} (Scribe STT)
router.post(
    '/stt',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '48mb' }),
    async (req, res) => {
        try {
            if (!svc.configured())
                return res
                    .status(503)
                    .json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
            const { audio, mime, filename } = req.body || {};
            if (!audio) return res.status(400).json({ ok: false, error: 'Thiếu audio' });
            const buf = Buffer.from(String(audio).replace(/^data:[^,]+,/, ''), 'base64');
            const out = await svc.transcribe(buf, filename || 'audio.wav', mime || 'audio/wav');
            res.json({ ok: true, text: out.text, language: out.language });
        } catch (e) {
            console.error('[web2-elevenlabs] stt', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// audio (base64) → audio đã lọc tạp âm (mp3)
router.post(
    '/isolate',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '48mb' }),
    async (req, res) => {
        try {
            if (!svc.configured())
                return res
                    .status(503)
                    .json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
            const { audio, mime, filename } = req.body || {};
            if (!audio) return res.status(400).json({ ok: false, error: 'Thiếu audio' });
            const buf = Buffer.from(String(audio).replace(/^data:[^,]+,/, ''), 'base64');
            const out = await svc.audioIsolation(buf, filename || 'audio.wav', mime || 'audio/wav');
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.send(out);
        } catch (e) {
            console.error('[web2-elevenlabs] isolate', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// Kho giọng cộng đồng (shared) — lọc + phân trang. GET ?page&page_size&gender&language&search&sort…
router.get('/shared-voices', async (req, res) => {
    try {
        if (!svc.configured())
            return res.status(503).json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
        const out = await svc.listSharedVoices(req.query || {});
        res.json({ ok: true, ...out });
    } catch (e) {
        console.error('[web2-elevenlabs] shared-voices', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// Thêm giọng shared vào tài khoản để dùng TTS. body {public_owner_id, voice_id, name}.
router.post(
    '/add-shared',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '16kb' }),
    async (req, res) => {
        try {
            if (!svc.configured())
                return res
                    .status(503)
                    .json({ ok: false, error: 'ELEVENLABS_API_KEY chưa cấu hình' });
            const { public_owner_id, voice_id, name } = req.body || {};
            if (!public_owner_id || !voice_id)
                return res.status(400).json({ ok: false, error: 'Thiếu public_owner_id/voice_id' });
            const out = await svc.addSharedVoice(public_owner_id, voice_id, name);
            res.json({ ok: true, voice_id: out.voice_id });
        } catch (e) {
            console.error('[web2-elevenlabs] add-shared', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

module.exports = router;
