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
const store = require('../services/web2-ai-store');
const web2Users = require('./web2-users'); // userCan (gate quyền nanobanana — KHÔNG drift)
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');

// Pool web2Db (lưu ảnh/prompt/hội thoại). Web 2.0 → web2Db || chatDb (KHÔNG chatDb trần).
const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;

// Giới hạn ảnh Nano Banana (TRẢ PHÍ) / user / ngày (GMT+7). Override env. Admin KHÔNG giới hạn.
const NANOBANANA_DAILY_LIMIT = Math.max(
    0,
    parseInt(process.env.WEB2_NANOBANANA_DAILY_LIMIT, 10) || 50
);
const isAdminReq = (req) => req.web2User?.role === 'admin';

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
    // Dọn theo TTL khi Map phình to: chỉ xoá IP đã hết hạn (mọi timestamp > 60s), GIỮ window
    // của IP còn hit hợp lệ — tránh _hits.clear() reset cửa sổ của cả IP đang spam (burst bypass).
    if (_hits.size > 2000) {
        for (const [k, arr] of _hits) {
            const fresh = arr.filter((t) => now - t < 60_000);
            if (fresh.length === 0) _hits.delete(k);
            else _hits.set(k, fresh);
        }
    }
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

// ── Complete (failover provider) — cho tác vụ KHÔNG cần chọn provider (vd nút "AI viết
// mô tả"): tự xoay gemini→groq→openrouter nếu 1 cái quá tải/hết quota. Trả {text, provider}.
router.post(
    '/complete',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '256kb' }),
    async (req, res) => {
        try {
            const { messages, system, temperature, maxTokens, providers } = req.body || {};
            const out = await ai.complete(messages, {
                system,
                temperature,
                maxTokens,
                providers,
            });
            res.json({ ok: true, ...out });
        } catch (e) {
            console.error('[web2-ai] complete', e.message);
            res.status(e._noKey ? 503 : 500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

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
            const code = e._noKey ? 503 : e._noVision ? 422 : 500;
            res.status(code).json({
                ok: false,
                error: String(e.message || e),
                noVision: !!e._noVision,
            });
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
        // Client đóng tab/ngắt SSE → abort upstream LLM fetch ngay (không đốt quota free).
        const ac = new AbortController();
        req.on('close', () => {
            closed = true;
            ac.abort();
        });
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
                (delta) => send('delta', { text: delta }),
                ac.signal
            );
            send('done', { provider: out.provider, model: out.model });
        } catch (e) {
            // Abort do client ngắt → không phải lỗi thật, không log/gửi error.
            if (!closed && e?.name !== 'AbortError') {
                console.error('[web2-ai] chat/stream', e.message);
                send('error', { error: String(e.message || e), noKey: !!e._noKey });
            }
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
// Nano Banana (provider 'gemini') = model TRẢ PHÍ → GATE QUYỀN ('ai-hub'/'nanobanana') +
// QUOTA/ngày/user. Pollinations/Cloudflare (free) không gate. Mọi ảnh tạo thành công →
// LƯU server (web2_ai_images: prompt + bytes) best-effort để xem/tải lại + đếm quota.
router.post(
    '/image',
    requireWeb2AuthSoft,
    rateLimit,
    express.json({ limit: '20mb' }), // 2026-06-24: tăng cho GHÉP ĐỒ (nhiều ảnh base64)
    async (req, res) => {
        try {
            const { prompt, provider, model, width, height, image, images, seed } = req.body || {};
            const isPaid = provider === 'gemini'; // Nano Banana
            const user = req.web2User || null;
            const admin = isAdminReq(req);

            if (isPaid) {
                // Ảnh trả phí BẮT BUỘC có danh tính (để gate quyền + đếm quota).
                if (!user) {
                    return res.status(401).json({
                        ok: false,
                        error: 'Cần đăng nhập để dùng Nano Banana (ảnh AI trả phí)',
                    });
                }
                // Quyền: admin luôn pass; user khác phải được cấp 'nanobanana'.
                if (!web2Users.userCan(user, 'ai-hub', 'nanobanana')) {
                    return res.status(403).json({
                        ok: false,
                        error: 'Bạn chưa được cấp quyền dùng Nano Banana (ảnh AI trả phí). Liên hệ admin.',
                        code: 'no_nanobanana_perm',
                    });
                }
                // Quota/ngày (GMT+7) — admin miễn.
                if (!admin && NANOBANANA_DAILY_LIMIT > 0) {
                    const db = getDb(req);
                    let used = 0;
                    try {
                        used = await store.countPaidToday(db, user.id, Date.now());
                    } catch (e) {
                        console.warn('[web2-ai] quota count failed:', e.message);
                    }
                    if (used >= NANOBANANA_DAILY_LIMIT) {
                        return res.status(429).json({
                            ok: false,
                            error: `Hết lượt tạo ảnh Nano Banana hôm nay (${used}/${NANOBANANA_DAILY_LIMIT}). Thử lại ngày mai hoặc nhờ admin nâng giới hạn.`,
                            code: 'nanobanana_quota',
                            used,
                            limit: NANOBANANA_DAILY_LIMIT,
                        });
                    }
                }
            }

            const out = await img.generate({
                prompt,
                provider,
                model,
                width,
                height,
                image,
                images, // GHÉP ĐỒ: [ảnh người, ảnh quần áo…] → Gemini multi-image
                seed,
            });

            // Lưu lịch sử (best-effort — KHÔNG chặn response nếu DB lỗi).
            let savedId = null;
            try {
                const saved = await store.saveImage(getDb(req), {
                    userId: user?.id || null,
                    username: user?.username || null,
                    provider: out.provider || provider,
                    model,
                    kind: Array.isArray(images) && images.length ? 'tryon' : 'image',
                    prompt,
                    out,
                    width,
                    height,
                });
                savedId = saved?.id || null;
            } catch (e) {
                console.warn('[web2-ai] saveImage failed:', e.message);
            }
            res.json({ ok: true, ...out, savedId });
        } catch (e) {
            console.error('[web2-ai] image', e.message);
            res.status(e._noKey ? 503 : 500).json({ ok: false, error: String(e.message || e) });
        }
    }
);

// ── Quota Nano Banana còn lại của user hiện tại (cho UI hiển thị) ──
router.get('/quota', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    const admin = isAdminReq(req);
    if (!user) return res.json({ ok: true, unlimited: false, used: 0, limit: 0, remaining: 0 });
    if (admin || NANOBANANA_DAILY_LIMIT === 0) {
        return res.json({ ok: true, unlimited: true, used: 0, limit: 0, remaining: Infinity });
    }
    let used = 0;
    try {
        used = await store.countPaidToday(getDb(req), user.id, Date.now());
    } catch (e) {
        console.warn('[web2-ai] quota get failed:', e.message);
    }
    res.json({
        ok: true,
        unlimited: false,
        used,
        limit: NANOBANANA_DAILY_LIMIT,
        remaining: Math.max(0, NANOBANANA_DAILY_LIMIT - used),
        canUse: web2Users.userCan(user, 'ai-hub', 'nanobanana'),
    });
});

// ── Lịch sử ảnh đã tạo (metadata, KHÔNG bytes). Non-admin chỉ thấy của mình. ──
router.get('/images', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.json({ ok: true, images: [] });
    try {
        const rows = await store.listImages(getDb(req), {
            userId: user.id,
            isAdmin: isAdminReq(req),
            all: req.query.all === '1',
            limit: req.query.limit,
            offset: req.query.offset,
        });
        res.json({ ok: true, images: rows });
    } catch (e) {
        console.error('[web2-ai] list images', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// ── Serve bytes 1 ảnh (auth qua ?token= để <img src> gửi được). Chủ sở hữu / admin. ──
router.get('/images/:id(\\d+)', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.status(401).send('unauthorized');
    try {
        const row = await store.getImage(getDb(req), req.params.id);
        if (!row) return res.status(404).send('not found');
        if (!isAdminReq(req) && row.user_id && row.user_id !== user.id)
            return res.status(403).send('forbidden');
        if (row.bytes) {
            res.setHeader('Content-Type', row.mime || 'image/png');
            res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
            return res.end(row.bytes);
        }
        if (row.url) return res.redirect(row.url); // ảnh lưu dạng URL (pollinations)
        return res.status(404).send('no image data');
    } catch (e) {
        console.error('[web2-ai] get image', e.message);
        res.status(500).send('error');
    }
});

router.delete('/images/:id(\\d+)', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.status(401).json({ ok: false, error: 'Cần đăng nhập' });
    try {
        const ok = await store.deleteImage(getDb(req), req.params.id, user.id, isAdminReq(req));
        res.json({ ok });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

// ── Hội thoại (chat) lưu server — backup + đồng bộ đa máy ──
router.put('/chats/:id', requireWeb2AuthSoft, express.json({ limit: '2mb' }), async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.json({ ok: false, error: 'Cần đăng nhập', skipped: true });
    try {
        const { title, provider, model, messages } = req.body || {};
        const saved = await store.upsertChat(getDb(req), {
            id: req.params.id,
            userId: user.id,
            username: user.username,
            title,
            provider,
            model,
            messages,
        });
        res.json({ ok: true, saved });
    } catch (e) {
        console.error('[web2-ai] upsert chat', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

router.get('/chats', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.json({ ok: true, chats: [] });
    try {
        const rows = await store.listChats(getDb(req), {
            userId: user.id,
            isAdmin: isAdminReq(req),
            all: req.query.all === '1',
            limit: req.query.limit,
        });
        res.json({ ok: true, chats: rows });
    } catch (e) {
        console.error('[web2-ai] list chats', e.message);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

router.get('/chats/:id', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.status(401).json({ ok: false, error: 'Cần đăng nhập' });
    try {
        const row = await store.getChat(getDb(req), req.params.id, user.id, isAdminReq(req));
        if (!row) return res.status(404).json({ ok: false, error: 'Không tìm thấy' });
        res.json({ ok: true, chat: row });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

router.delete('/chats/:id', requireWeb2AuthSoft, async (req, res) => {
    const user = req.web2User || null;
    if (!user) return res.json({ ok: true }); // không đăng nhập → coi như đã xoá (chỉ local)
    try {
        const ok = await store.deleteChat(getDb(req), req.params.id, user.id, isAdminReq(req));
        res.json({ ok });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

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
