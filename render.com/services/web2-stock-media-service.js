// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Stock media (ảnh/video bản quyền-free) DÙNG CHUNG cho Xưởng Video AI.
 *
 * Lấy cảm hứng từ MoneyPrinterTurbo (harry0703): topic → kịch bản → STOCK FOOTAGE →
 * TTS → phụ đề. video-maker đã có script (Web2VideoAiScript) + TTS + render; module
 * này bổ sung mảnh còn thiếu: tìm ảnh/video stock free chèn vào cảnh (B-roll / nền).
 *
 * Nguồn: Pexels (ảnh + video) ưu tiên → Pixabay fallback. KEY giấu server-side
 * (env PEXELS_API_KEY / PIXABAY_API_KEY). Thiếu key → trả { configured:false } để
 * frontend báo "cần cấu hình" GỌN, KHÔNG vỡ.
 *
 *   search({ q, type:'photo'|'video', page, per, ratio }) → { configured, source, items:[...] }
 *     item ảnh:  { id, type:'photo', url, thumb, w, h, author, srcPage }
 *     item video:{ id, type:'video', url, thumb, w, h, duration, author, srcPage }
 *   status() → { configured, sources:{ pexels:bool, pixabay:bool } }
 */
'use strict';

const PEXELS_BASE = 'https://api.pexels.com';
const PIXABAY_BASE = 'https://pixabay.com/api';
const MAX_PER = 40;
const TIMEOUT_MS = 12000;

function _pexelsKeys() {
    const keys = [];
    const push = (v) => {
        if (v && String(v).trim()) keys.push(String(v).trim());
    };
    // Xoay tua nhiều key (convention WEB2_ như web2-ai). WEB2_PEXELS_API_KEY1..10
    // (chuẩn) + PEXELS_API_KEY1..10 (fallback) + đơn.
    for (let i = 1; i <= 10; i++) push(process.env['WEB2_PEXELS_API_KEY' + i]);
    for (let i = 1; i <= 10; i++) push(process.env['PEXELS_API_KEY' + i]);
    push(process.env.WEB2_PEXELS_API_KEY);
    push(process.env.PEXELS_API_KEY);
    return Array.from(new Set(keys));
}
function _pixabayKeys() {
    const keys = [];
    const push = (v) => {
        if (v && String(v).trim()) keys.push(String(v).trim());
    };
    for (let i = 1; i <= 10; i++) push(process.env['WEB2_PIXABAY_API_KEY' + i]);
    for (let i = 1; i <= 10; i++) push(process.env['PIXABAY_API_KEY' + i]);
    push(process.env.WEB2_PIXABAY_API_KEY);
    push(process.env.PIXABAY_API_KEY);
    return Array.from(new Set(keys));
}

let _pexRr = 0;
let _pixRr = 0;

function _isConfigured() {
    return _pexelsKeys().length > 0 || _pixabayKeys().length > 0;
}

function status() {
    return {
        configured: _isConfigured(),
        sources: {
            pexels: _pexelsKeys().length > 0,
            pixabay: _pixabayKeys().length > 0,
        },
    };
}

async function _fetchJson(url, headers) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const r = await fetch(url, { headers: headers || {}, signal: controller.signal });
        const text = await r.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = {};
        }
        return { ok: r.ok, status: r.status, data };
    } finally {
        clearTimeout(t);
    }
}

// ── PEXELS ──────────────────────────────────────────────────────────────────
function _orientation(ratio) {
    // ratio '9:16' (dọc) / '16:9' (ngang) / '1:1' (vuông) → Pexels orientation.
    if (ratio === '9:16' || ratio === 'portrait') return 'portrait';
    if (ratio === '1:1' || ratio === 'square') return 'square';
    return 'landscape';
}

async function _searchPexels({ q, type, page, per, ratio }) {
    const keys = _pexelsKeys();
    if (!keys.length) return null;
    const orientation = _orientation(ratio);
    const params = new URLSearchParams({
        query: q,
        per_page: String(per),
        page: String(page),
        orientation,
    });
    const path = type === 'video' ? '/videos/search' : '/v1/search';
    let lastErr = '';
    for (let i = 0; i < keys.length; i++) {
        const key = keys[(_pexRr + i) % keys.length];
        try {
            const {
                ok,
                status: code,
                data,
            } = await _fetchJson(`${PEXELS_BASE}${path}?${params.toString()}`, {
                Authorization: key,
            });
            if (code === 401 || code === 403 || code === 429) {
                lastErr = `pexels ${code}`;
                continue; // key hỏng/đụng rate → thử key kế
            }
            if (!ok) {
                lastErr = `pexels ${code}`;
                break;
            }
            _pexRr = (_pexRr + i + 1) % keys.length;
            if (type === 'video') {
                const items = (data.videos || []).map((v) => {
                    // chọn file mp4 ~720p để nhẹ
                    const files = (v.video_files || [])
                        .filter((f) => /mp4/i.test(f.file_type || ''))
                        .sort((a, b) => (a.height || 0) - (b.height || 0));
                    const pick =
                        files.find((f) => (f.height || 0) >= 540) || files[files.length - 1] || {};
                    return {
                        id: 'pex_' + v.id,
                        type: 'video',
                        url: pick.link || '',
                        thumb: v.image || '',
                        w: pick.width || v.width || 0,
                        h: pick.height || v.height || 0,
                        duration: v.duration || 0,
                        author: (v.user && v.user.name) || 'Pexels',
                        srcPage: v.url || '',
                    };
                });
                return { source: 'pexels', items: items.filter((x) => x.url) };
            }
            const items = (data.photos || []).map((p) => ({
                id: 'pex_' + p.id,
                type: 'photo',
                url: (p.src && (p.src.large2x || p.src.large || p.src.original)) || '',
                thumb: (p.src && (p.src.medium || p.src.small)) || '',
                w: p.width || 0,
                h: p.height || 0,
                author: p.photographer || 'Pexels',
                srcPage: p.url || '',
            }));
            return { source: 'pexels', items: items.filter((x) => x.url) };
        } catch (e) {
            lastErr = (e && e.message) || 'pexels error';
        }
    }
    if (lastErr) console.warn('[web2-stock] pexels fail:', lastErr);
    return null;
}

// ── PIXABAY (fallback) ──────────────────────────────────────────────────────
async function _searchPixabay({ q, type, page, per }) {
    const keys = _pixabayKeys();
    if (!keys.length) return null;
    let lastErr = '';
    for (let i = 0; i < keys.length; i++) {
        const key = keys[(_pixRr + i) % keys.length];
        const params = new URLSearchParams({
            key,
            q,
            per_page: String(per),
            page: String(page),
            safesearch: 'true',
        });
        const url =
            type === 'video'
                ? `${PIXABAY_BASE}/videos/?${params.toString()}`
                : `${PIXABAY_BASE}/?${params.toString()}&image_type=photo`;
        try {
            const { ok, status: code, data } = await _fetchJson(url);
            if (code === 429) {
                lastErr = 'pixabay 429';
                continue;
            }
            if (!ok) {
                lastErr = `pixabay ${code}`;
                break;
            }
            _pixRr = (_pixRr + i + 1) % keys.length;
            if (type === 'video') {
                const items = (data.hits || []).map((v) => {
                    const f = (v.videos && (v.videos.medium || v.videos.small)) || {};
                    return {
                        id: 'pix_' + v.id,
                        type: 'video',
                        url: f.url || '',
                        thumb:
                            'https://i.vimeocdn.com/video/' + (v.picture_id || '') + '_295x166.jpg',
                        w: f.width || 0,
                        h: f.height || 0,
                        duration: v.duration || 0,
                        author: v.user || 'Pixabay',
                        srcPage: v.pageURL || '',
                    };
                });
                return { source: 'pixabay', items: items.filter((x) => x.url) };
            }
            const items = (data.hits || []).map((p) => ({
                id: 'pix_' + p.id,
                type: 'photo',
                url: p.largeImageURL || p.webformatURL || '',
                thumb: p.webformatURL || p.previewURL || '',
                w: p.imageWidth || 0,
                h: p.imageHeight || 0,
                author: p.user || 'Pixabay',
                srcPage: p.pageURL || '',
            }));
            return { source: 'pixabay', items: items.filter((x) => x.url) };
        } catch (e) {
            lastErr = (e && e.message) || 'pixabay error';
        }
    }
    if (lastErr) console.warn('[web2-stock] pixabay fail:', lastErr);
    return null;
}

async function search(opts) {
    const o = opts || {};
    const q = String(o.q || '').trim();
    const type = o.type === 'video' ? 'video' : 'photo';
    const page = Math.max(1, parseInt(o.page, 10) || 1);
    const per = Math.min(MAX_PER, Math.max(1, parseInt(o.per, 10) || 20));
    const ratio = o.ratio || '9:16';

    if (!_isConfigured()) {
        return { configured: false, source: null, items: [] };
    }
    if (!q) return { configured: true, source: null, items: [] };

    // Pexels ưu tiên → Pixabay fallback nếu Pexels không có/không có kết quả.
    const pex = await _searchPexels({ q, type, page, per, ratio });
    if (pex && pex.items.length) return { configured: true, ...pex };
    const pix = await _searchPixabay({ q, type, page, per });
    if (pix && pix.items.length) return { configured: true, ...pix };
    // không key/không kết quả → trả mảng rỗng (vẫn configured nếu có ít nhất 1 key).
    return {
        configured: true,
        source: (pex && pex.source) || (pix && pix.source) || null,
        items: [],
    };
}

module.exports = { search, status };
