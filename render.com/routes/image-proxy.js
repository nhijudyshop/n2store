// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// IMAGE PROXY ROUTE
// Proxy images from external sources to bypass CORS.
// Optional resize via sharp (?w=<px>&q=<1-100>) for bandwidth savings on
// thumbnails / lightbox previews of large Firebase Storage uploads.
// =====================================================

const express = require('express');
const sharp = require('sharp');
const router = express.Router();

const MAX_WIDTH = 4000;
const DEFAULT_QUALITY = 70;

/**
 * GET /api/image-proxy?url=<encoded_url>[&w=<px>][&q=<quality>]
 *
 * - url: image URL to fetch (required)
 * - w:   target width in px (optional, 1..4000) — height auto by aspect, no upscale
 * - q:   JPEG quality 1..100 (default 70 when w is set, else original)
 *
 * Without w/q the image is streamed through unchanged (legacy behavior used by
 * order-image-generator.js). With w or q set, the response is re-encoded as
 * JPEG via sharp for smaller payloads.
 */
router.get('/', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        const widthRaw = req.query.w;
        const qualityRaw = req.query.q;

        if (!imageUrl) {
            return res.status(400).json({
                error: 'Missing url parameter',
                usage: '/api/image-proxy?url=<encoded_url>[&w=<px>][&q=<quality>]'
            });
        }

        const wantResize = widthRaw != null || qualityRaw != null;
        let targetWidth = null;
        let targetQuality = DEFAULT_QUALITY;
        if (wantResize) {
            if (widthRaw != null) {
                const n = parseInt(widthRaw, 10);
                if (!Number.isFinite(n) || n < 1 || n > MAX_WIDTH) {
                    return res.status(400).json({ error: `w must be 1..${MAX_WIDTH}` });
                }
                targetWidth = n;
            }
            if (qualityRaw != null) {
                const q = parseInt(qualityRaw, 10);
                if (!Number.isFinite(q) || q < 1 || q > 100) {
                    return res.status(400).json({ error: 'q must be 1..100' });
                }
                targetQuality = q;
            }
        }

        console.log('[IMAGE-PROXY] Fetching:', imageUrl, wantResize ? `(resize w=${targetWidth} q=${targetQuality})` : '');

        const response = await fetch(imageUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
                'Referer': 'https://tomato.tpos.vn/'
            }
        });

        if (!response.ok) {
            console.error('[IMAGE-PROXY] Failed:', response.status, response.statusText);
            return res.status(response.status).json({
                error: `Failed to fetch image: ${response.status} ${response.statusText}`
            });
        }

        const upstreamContentType = response.headers.get('content-type') || 'image/jpeg';
        const upstreamBuffer = Buffer.from(await response.arrayBuffer());

        if (!wantResize) {
            res.set({
                'Content-Type': upstreamContentType,
                'Content-Length': upstreamBuffer.length,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            });
            return res.send(upstreamBuffer);
        }

        // Resize + re-encode as JPEG (smaller, broad compatibility)
        let pipeline = sharp(upstreamBuffer).rotate(); // honor EXIF orientation
        if (targetWidth) {
            pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: true });
        }
        const out = await pipeline.jpeg({ quality: targetQuality, mozjpeg: true }).toBuffer();
        console.log('[IMAGE-PROXY] Resized:', upstreamBuffer.length, '->', out.length, 'bytes');

        res.set({
            'Content-Type': 'image/jpeg',
            'Content-Length': out.length,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        });
        res.send(out);
    } catch (error) {
        console.error('[IMAGE-PROXY] Error:', error);
        res.status(500).json({
            error: 'Failed to proxy image',
            message: error.message
        });
    }
});

module.exports = router;
