// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Trợ lý AI (chat free + tạo ảnh free). Prefix /api/web2-ai → worker
 * auto-forward (proxy-handler startsWith '/api/web2'). KHÔNG cần sửa worker.
 *
 * Endpoints:
 *   GET  /status        → providers chat + ảnh + số key + cooldown (MASKED)
 *   GET  /models        → model theo provider
 *   POST /chat          → {provider, model, messages, system, temperature, maxTokens} → {text}
 *   POST /chat/stream   → SSE: event delta {text} … event done {provider, model}
 *   POST /image         → {prompt, provider, model, width, height, image} → {url}|{dataUrl}
 *   POST /test          → {provider} ping 1 lượt verify key
 *
 * Key giấu ở env Render (GROQ_API_KEY*, GEMINI_API_KEY*, OPENROUTER_API_KEY*,
 * CLOUDFLARE_*). Frontend KHÔNG bao giờ thấy key thật (status chỉ trả masked).
 */
'use strict';

const express = require('express');
const router = express.Router();
const ai = require('../services/web2-ai-service');
const img = require('../services/web2-ai-image-service');
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');

// ── Rate-limit theo IP (chống đốt quota free) ──
const _hits = new Map();
const RATE_LIMIT = 40; // req/phút/IP
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
        return res.status(429).json({ ok: false, error: 'Quá nhiều yêu cầu, thử lại sau ít giây' });
    }
    hits.push(now);
    _hits.set(ip, hits);
    if (_hits.size > 2000) _hits.clear();
    next();
}

// ── Trạng thái + models. Chi tiết key (masked + cooldown + keyCount) CHỈ admin.
// NV vẫn nhận provider/model (cho dropdown chat) nhưng KHÔNG thấy thông tin key.
router.get('/status', requireWeb2AuthSoft, (req, res) => {
    const admin = req.web2User?.role === 'admin';
    const chat = ai.status();
    if (!admin) {
        chat.providers = (chat.providers || []).map((p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            configured: p.configured,
            defaultModel: p.defaultModel,
            models: p.models,
        }));
    }
    res.json({ ok: true, admin, chat, image: img.status() });
});

router.get('/models', (req, res) => {
    res.json({ ok: true, models: ai.listModels() });
});

// ── Chat non-stream ──
router.post(
    '/chat',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '256kb' }),
    async (req, res) => {
        try {
            const { provider, model, messages, system, temperature, maxTokens } = req.body || {};
            const out = await ai.chat({
                provider,
                model,
                messages,
                system,
                temperature,
                maxTokens,
            });
            res.json({ ok: true, ...out });
        } catch (e) {
            console.error('[web2-ai] chat', e.message);
            res.status(e._noKey ? 503 : 500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// ── Chat streaming (SSE) ──
router.post(
    '/chat/stream',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '256kb' }),
    async (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        if (res.flushHeaders) res.flushHeaders();

        let closed = false;
        req.on('close', () => (closed = true));
        const send = (event, data) => {
            if (closed) return;
            try {
                res.write(`event: ${event}\n`);
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch {}
        };

        try {
            const { provider, model, messages, system, temperature, maxTokens } = req.body || {};
            const out = await ai.chatStream(
                { provider, model, messages, system, temperature, maxTokens },
                (delta) => send('delta', { text: delta })
            );
            send('done', { provider: out.provider, model: out.model });
        } catch (e) {
            console.error('[web2-ai] chat/stream', e.message);
            send('error', { error: String(e.message || e), noKey: !!e._noKey });
        } finally {
            if (!closed) {
                try {
                    res.end();
                } catch {}
            }
        }
    }
);

// ── Tạo ảnh ──
router.post(
    '/image',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '12mb' }),
    async (req, res) => {
        try {
            const { prompt, provider, model, width, height, image, seed } = req.body || {};
            const out = await img.generate({ prompt, provider, model, width, height, image, seed });
            res.json({ ok: true, ...out });
        } catch (e) {
            console.error('[web2-ai] image', e.message);
            res.status(e._noKey ? 503 : 500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// ── Test 1 provider (admin-only — quản lý key) ──
router.post(
    '/test',
    requireWeb2Admin,
    rateLimit,
    express.json({ limit: '8kb' }),
    async (req, res) => {
        try {
            const provider = String((req.body || {}).provider || '').trim();
            if (!provider) return res.status(400).json({ ok: false, error: 'Thiếu provider' });
            const out = await ai.test(provider);
            res.json({ ok: true, result: out });
        } catch (e) {
            console.error('[web2-ai] test', e.message);
            res.status(500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

module.exports = router;
