// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web 2.0 — AI Video Script (Gemini RIÊNG của Web 2.0, KHÔNG đụng Web 1.0).
// Viết kịch bản video bán hàng từ 1 CHỦ ĐỀ + danh sách SP → {narration, scenes}.
// Key RIÊNG: process.env.WEB2_GEMINI_API_KEY (đặt trên service web2-api-kv04).
// Mount: /api/web2/ai-script  (CF worker tự forward /api/web2/* về web2-api).
//   POST /generate  body { topic, products:[{name,price}] }
//                   → { success, narration, scenes:[{title,subtitle}] }
// =====================================================================
'use strict';

const express = require('express');
const router = express.Router();
const ai = require('../services/web2-ai-service'); // pool key Gemini xoay TẬP TRUNG (gồm cả WEB2_GEMINI_API_KEY)

// Auth + rate-limit: gate WRITE /generate để người lạ không hammer drain quota
// Gemini (key trả phí). Enforce 401 khi WEB2_AUTH_ENFORCE=1.
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const _aiScriptHits = new Map(); // ip → [timestamps]
const AI_SCRIPT_RATE_LIMIT = 20; // req/phút/IP (page-flow thật ~1-3 req/phút)
function aiScriptRateLimit(req, res, next) {
    const ip =
        req.headers['cf-connecting-ip'] ||
        String(req.headers['x-forwarded-for'] || '')
            .split(',')
            .pop()
            .trim() ||
        req.socket?.remoteAddress ||
        'unknown';
    const now = Date.now();
    const hits = (_aiScriptHits.get(ip) || []).filter((t) => now - t < 60_000);
    if (hits.length >= AI_SCRIPT_RATE_LIMIT) {
        return res
            .status(429)
            .json({ success: false, error: 'Rate limit: tối đa 20 kịch bản/phút' });
    }
    hits.push(now);
    _aiScriptHits.set(ip, hits);
    if (_aiScriptHits.size > 1000) _aiScriptHits.clear(); // chống phình map
    next();
}

// Remap model đã khai tử → bản hiện hành (env WEB2_GEMINI_MODEL có thể còn trỏ gemini-2.0-flash
// đã bị Google gỡ "no longer available" → ép về 2.5-flash, khỏi phải đợi sửa env Render).
const _DEPRECATED_GEMINI = {
    'gemini-2.0-flash': 'gemini-2.5-flash',
    'gemini-1.5-flash': 'gemini-2.5-flash',
    'gemini-1.5-pro': 'gemini-2.5-pro',
    'gemini-pro': 'gemini-2.5-flash',
};
const _MODEL_RAW = process.env.WEB2_GEMINI_MODEL || 'gemini-2.5-flash';
const MODEL = _DEPRECATED_GEMINI[_MODEL_RAW] || _MODEL_RAW;
// Pool key Gemini xoay (WEB2_GEMINI_API_KEY + GEMINI_API_KEY* gộp trong web2-ai-service).
const geminiKeys = () => ai.keysOf('gemini');

function fmtPrice(n) {
    const num = Number(String(n ?? '').replace(/[^\d.-]/g, ''));
    if (!num) return '';
    return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
}

function buildPrompt(topic, products) {
    const n = products.length;
    const list = products
        .map(
            (p, i) =>
                `${i + 1}. ${p.name || 'Sản phẩm ' + (i + 1)}${p.price ? ' — ' + fmtPrice(p.price) : ''}`
        )
        .join('\n');
    return (
        `Bạn là copywriter quảng cáo cho một shop thời trang Việt Nam.\n` +
        `Chủ đề video: "${topic}".\n` +
        `${n} sản phẩm (mỗi sản phẩm là 1 cảnh, ĐÚNG thứ tự):\n${list}\n\n` +
        `Hãy viết:\n` +
        `- Với MỖI sản phẩm: "title" ngắn 3-6 từ thật hấp dẫn + "subtitle" ngắn (giá hoặc điểm nổi bật).\n` +
        `- "narration": lời đọc tiếng Việt LIỀN MẠCH cho cả video: mở đầu bằng câu hook theo chủ đề, ` +
        `giới thiệu lần lượt từng sản phẩm, kết bằng lời mời inbox/đặt hàng (CTA). ` +
        `Giọng bán hàng thân thiện, tự nhiên, khoảng ${n * 2 + 2} câu, KHÔNG dùng emoji.\n` +
        `Trả về đúng JSON theo schema, KHÔNG kèm markdown.`
    );
}

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        narration: { type: 'STRING' },
        scenes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: { title: { type: 'STRING' }, subtitle: { type: 'STRING' } },
                required: ['title'],
            },
        },
    },
    required: ['narration', 'scenes'],
};

router.post('/generate', requireWeb2AuthSoft, aiScriptRateLimit, async (req, res) => {
    try {
        const keys = geminiKeys();
        if (!keys.length)
            return res.status(503).json({
                success: false,
                error: 'Chưa cấu hình key Gemini (GEMINI_API_KEY / WEB2_GEMINI_API_KEY) trên web2-api',
            });
        const topic = String(req.body?.topic || '').trim();
        const products = Array.isArray(req.body?.products) ? req.body.products.slice(0, 8) : [];
        if (!topic || !products.length)
            return res.status(400).json({ success: false, error: 'Thiếu topic hoặc products' });

        // Key qua HEADER x-goog-api-key (KHÔNG nhét vào URL query) để tránh lộ key
        // nếu có tầng trung gian log request URL.
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
        const body = {
            contents: [{ role: 'user', parts: [{ text: buildPrompt(topic, products) }] }],
            generationConfig: {
                temperature: 0.95,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
            },
        };
        // XOAY NHIỀU KEY: key sai/hết quota → thử key kế; lỗi nội dung → trả ngay.
        let data = null,
            lastErr = '';
        for (const K of keys) {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': K },
                body: JSON.stringify(body),
            });
            const d = await r.json().catch(() => ({}));
            if (d.error) {
                lastErr = d.error.message || 'Gemini error';
                // auth/quota → đổi key; lỗi khác (nội dung) → dừng. Gemini trả 400 cho
                // key hỏng (API_KEY_INVALID) → cũng phải đổi key, không chỉ 401/403/429/402.
                const keyBad =
                    r.status === 401 ||
                    r.status === 403 ||
                    r.status === 429 ||
                    r.status === 402 ||
                    /api[\s_-]?key (not found|not valid|invalid)|API_KEY_INVALID|quota|exhausted|rate.?limit/i.test(
                        lastErr
                    );
                if (keyBad) continue;
                return res.status(502).json({ success: false, error: lastErr });
            }
            data = d;
            break;
        }
        if (!data)
            return res
                .status(502)
                .json({ success: false, error: lastErr || 'Tất cả key Gemini đều lỗi/hết quota' });
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text)
            return res.status(502).json({ success: false, error: 'Gemini không trả nội dung' });
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return res.status(502).json({ success: false, error: 'Parse JSON lỗi' });
        }
        return res.json({
            success: true,
            narration: String(parsed.narration || '').trim(),
            scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
            model: MODEL,
        });
    } catch (e) {
        console.error('[web2-ai-script] generate lỗi:', e);
        return res.status(500).json({ success: false, error: e.message || 'lỗi server' });
    }
});

// healthcheck: cho biết key đã cấu hình chưa (KHÔNG lộ key)
router.get('/status', (req, res) => {
    res.json({
        success: true,
        configured: geminiKeys().length > 0,
        keys: geminiKeys().length,
        model: MODEL,
    });
});

// không có bảng DB — no-op để khớp pattern mount ensureSchema (nếu server.js gọi)
router.ensureSchema = async () => {};

module.exports = router;
