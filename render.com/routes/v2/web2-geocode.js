// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Goong geocode proxy (ẩn API key) cho auto-detect địa chỉ.
// =====================================================================
// WEB 2.0 — GOONG GEOCODE PROXY (Method B auto-detect địa chỉ giao hàng)
//
//   GET /api/web2/geocode?address=<free-text>
//     → gọi Goong forward geocode (ẩn GOONG_API_KEY ở backend) →
//       { success, province, district, ward, formatted, source:'goong'|'cache' }
//
// Goong free ~1000 req/ngày. Cache in-memory theo normalized address (TTL 7d)
// để KH lặp lại = 0 call. deprecated_compound.district (V2) ưu tiên — khớp
// district CŨ để map zone HCMC (sau gộp tỉnh 2025 district bị bỏ về pháp lý).
// =====================================================================

const express = require('express');
const router = express.Router();

const GOONG_KEY = process.env.GOONG_API_KEY || '';
const TTL_MS = 7 * 24 * 3600 * 1000;
const _cache = new Map(); // normAddr → { at, data }

function norm(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function goongGeocode(address) {
    // V2 (merger-aware) trả compound + deprecated_compound. Fallback v1 nếu lỗi.
    const enc = encodeURIComponent(address);
    const tryUrls = [
        `https://rsapi.goong.io/v2/geocode?address=${enc}&api_key=${GOONG_KEY}`,
        `https://rsapi.goong.io/geocode?address=${enc}&api_key=${GOONG_KEY}`,
    ];
    for (const url of tryUrls) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!r.ok) continue;
            const j = await r.json();
            const res = (j.results || [])[0];
            if (!res) continue;
            const dep = res.deprecated_compound || {};
            const comp = res.compound || {};
            return {
                province: comp.province || dep.province || '',
                district: dep.district || comp.district || '',
                ward: comp.commune || comp.ward || dep.commune || '',
                formatted: res.formatted_address || '',
            };
        } catch (_) {
            /* thử url kế tiếp */
        }
    }
    return null;
}

router.get('/', async (req, res) => {
    const address = String(req.query.address || '').trim();
    if (!address) return res.status(400).json({ success: false, error: 'address required' });
    if (!GOONG_KEY) {
        return res
            .status(503)
            .json({ success: false, error: 'GOONG_API_KEY chưa cấu hình trên server' });
    }
    const key = norm(address);
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) {
        return res.json({ success: true, source: 'cache', ...cached.data });
    }
    try {
        const data = await goongGeocode(address);
        if (!data) {
            return res.json({
                success: false,
                error: 'Goong không tìm thấy',
                province: '',
                district: '',
            });
        }
        _cache.set(key, { at: Date.now(), data });
        res.json({ success: true, source: 'goong', ...data });
    } catch (e) {
        console.error('[web2-geocode] error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
