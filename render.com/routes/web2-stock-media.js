// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Route stock media (Pexels/Pixabay) cho Xưởng Video AI.
 *   GET /api/web2-stock-media/status            → { success, configured, sources }
 *   GET /api/web2-stock-media/search?q=&type=photo|video&page=&per=&ratio=9:16
 *        → { success, configured, source, items:[...] }
 *
 * Key giấu server-side (PEXELS_API_KEY / PIXABAY_API_KEY). READ-only, không auth
 * write (chỉ tìm kiếm media public). Worker tự route '/api/web2-stock-media' →
 * web2-api (prefix web2-). KHÔNG dùng TPOS.
 */
'use strict';

const express = require('express');
const router = express.Router();
const stock = require('../services/web2-stock-media-service');

router.get('/status', (req, res) => {
    try {
        res.json({ success: true, ...stock.status() });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/search', async (req, res) => {
    try {
        const result = await stock.search({
            q: req.query.q,
            type: req.query.type,
            page: req.query.page,
            per: req.query.per,
            ratio: req.query.ratio,
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.warn('[web2-stock-media] search error:', e.message);
        res.status(500).json({ success: false, error: e.message, items: [] });
    }
});

module.exports = router;
