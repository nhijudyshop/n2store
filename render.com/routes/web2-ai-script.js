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

const MODEL = process.env.WEB2_GEMINI_MODEL || 'gemini-2.0-flash';
const apiKey = () => process.env.WEB2_GEMINI_API_KEY || '';

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

router.post('/generate', async (req, res) => {
    try {
        const K = apiKey();
        if (!K)
            return res.status(503).json({
                success: false,
                error: 'WEB2_GEMINI_API_KEY chưa cấu hình trên server web2-api',
            });
        const topic = String(req.body?.topic || '').trim();
        const products = Array.isArray(req.body?.products) ? req.body.products.slice(0, 8) : [];
        if (!topic || !products.length)
            return res.status(400).json({ success: false, error: 'Thiếu topic hoặc products' });

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${K}`;
        const body = {
            contents: [{ role: 'user', parts: [{ text: buildPrompt(topic, products) }] }],
            generationConfig: {
                temperature: 0.95,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
            },
        };
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await r.json();
        if (data.error)
            return res
                .status(502)
                .json({ success: false, error: data.error.message || 'Gemini error' });
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
    res.json({ success: true, configured: !!apiKey(), model: MODEL });
});

// không có bảng DB — no-op để khớp pattern mount ensureSchema (nếu server.js gọi)
router.ensureSchema = async () => {};

module.exports = router;
