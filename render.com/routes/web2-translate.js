// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Dịch thuật proxy (module dùng chung). Prefix /api/web2-translate → worker
 * auto-forward (startsWith '/api/web2-'). Key AI giấu ở env Render.
 *
 *   GET  /status → { ok, engines:[...] }
 *   POST /       → { ok, text, provider }   body { text, to?='en', from?='auto', context? }
 */
'use strict';

const express = require('express');
const router = express.Router();
const svc = require('../services/web2-translate-service');
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

const _hits = new Map();
const RATE_LIMIT = 60; // req/phút/IP (dịch nhẹ hơn TTS)
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
        return res.status(429).json({ ok: false, error: 'Rate limit: tối đa 60 lần/phút' });
    }
    hits.push(now);
    _hits.set(ip, hits);
    if (_hits.size > 1000) _hits.clear();
    next();
}

router.get('/status', (req, res) => {
    res.json({ ok: true, engines: svc.engines() });
});

router.post(
    '/',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '32kb' }),
    async (req, res) => {
        try {
            const { text, to, from, context } = req.body || {};
            if (!text) return res.status(400).json({ ok: false, error: 'Thiếu text' });
            const out = await svc.translate(text, { to, from, context });
            res.json({ ok: true, text: out.text, provider: out.provider });
        } catch (e) {
            console.error('[web2-translate]', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

module.exports = router;
