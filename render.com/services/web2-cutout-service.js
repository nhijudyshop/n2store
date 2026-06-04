// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Web 2.0 — Cutout service (tách nền chất lượng cao qua API thứ 3).
 *
 * Engine hỗ trợ:
 *   - birefnet (fal.ai): model BiRefNet (state-of-the-art, MIT) qua fal.ai sync.
 *                **Hiện free, KHÔNG watermark**, full HD. Dùng FAL_KEY (đã có sẵn
 *                cho AI KOL). → engine "Cloud (HD)" mặc định.
 *   - photoroom: PhotoRoom API v1 /segment. Sandbox free CÓ watermark; production
 *                tính phí (sạch). Giữ làm tùy chọn.
 *
 * Key đọc từ env (Render) — KHÔNG hardcode:
 *   FAL_KEY               (fal.ai BiRefNet)
 *   PHOTOROOM_API_KEY / PHOTOROOM_SANDBOX_KEY (PhotoRoom)
 *
 * Trả về Buffer PNG cutout (nền trong suốt). Frontend tự ghép nền.
 */
'use strict';

const PHOTOROOM_KEY = process.env.PHOTOROOM_API_KEY || process.env.PHOTOROOM_SANDBOX_KEY || '';
const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';
const FAL_KEY = process.env.FAL_KEY || '';
const FAL_BIREFNET_URL = 'https://fal.run/fal-ai/birefnet/v2';
const WITHOUTBG_KEY = process.env.WITHOUTBG_API_KEY || '';
const WITHOUTBG_URL = 'https://api.withoutbg.com/v1.0/image-without-background-base64';
const MAX_BYTES = 12 * 1024 * 1024; // 12MB ảnh input

function photoroomConfigured() {
    return Boolean(PHOTOROOM_KEY);
}
function falConfigured() {
    return Boolean(FAL_KEY);
}
function withoutbgConfigured() {
    return Boolean(WITHOUTBG_KEY);
}

/**
 * Tách nền bằng withoutbg.com (free 50/tháng, full HD, no watermark, Apache OSS).
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>} PNG cutout (nền trong suốt)
 */
async function withoutbgCutout(imageBuffer) {
    if (!WITHOUTBG_KEY) throw new Error('WITHOUTBG_API_KEY chưa cấu hình trên server');
    if (!imageBuffer?.length) throw new Error('Ảnh rỗng');
    if (imageBuffer.length > MAX_BYTES) throw new Error('Ảnh quá lớn (>12MB)');
    const res = await fetch(WITHOUTBG_URL, {
        method: 'POST',
        headers: { 'X-API-Key': WITHOUTBG_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: imageBuffer.toString('base64') }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`withoutbg ${res.status}: ${detail.slice(0, 300)}`);
    }
    const j = await res.json();
    const b64 = j.img_without_background_base64 || j.image_base64;
    if (!b64) throw new Error('withoutbg không trả ảnh');
    return Buffer.from(b64, 'base64');
}

/**
 * Tách nền bằng fal.ai BiRefNet (free, no watermark, HD).
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>} PNG cutout (nền trong suốt)
 */
async function birefnetCutout(imageBuffer) {
    if (!FAL_KEY) throw new Error('FAL_KEY chưa cấu hình trên server');
    if (!imageBuffer?.length) throw new Error('Ảnh rỗng');
    if (imageBuffer.length > MAX_BYTES) throw new Error('Ảnh quá lớn (>12MB)');

    const dataUri = 'data:image/png;base64,' + imageBuffer.toString('base64');
    const res = await fetch(FAL_BIREFNET_URL, {
        method: 'POST',
        headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: dataUri,
            output_format: 'png',
            operating_resolution: '1024x1024',
            refine_foreground: true,
        }),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`fal ${res.status}: ${detail.slice(0, 300)}`);
    }
    const j = await res.json();
    const url = j?.image?.url || j?.images?.[0]?.url;
    if (!url) throw new Error('fal không trả ảnh');
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error('Tải ảnh fal lỗi ' + imgRes.status);
    return Buffer.from(await imgRes.arrayBuffer());
}

/**
 * Tách nền 1 ảnh bằng PhotoRoom.
 * @param {Buffer} imageBuffer  ảnh nguồn (png/jpg)
 * @returns {Promise<Buffer>}   PNG cutout (nền trong suốt)
 */
async function photoroomCutout(imageBuffer) {
    if (!PHOTOROOM_KEY) throw new Error('PHOTOROOM_API_KEY chưa cấu hình trên server');
    if (!imageBuffer?.length) throw new Error('Ảnh rỗng');
    if (imageBuffer.length > MAX_BYTES) throw new Error('Ảnh quá lớn (>12MB)');

    const form = new FormData();
    form.append('image_file', new Blob([imageBuffer], { type: 'image/png' }), 'image.png');
    form.append('format', 'png');

    const res = await fetch(PHOTOROOM_SEGMENT_URL, {
        method: 'POST',
        headers: { 'x-api-key': PHOTOROOM_KEY },
        body: form,
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`PhotoRoom ${res.status}: ${detail.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

/** Parse dataURL hoặc base64 thuần → Buffer. */
function decodeImage(input) {
    if (typeof input !== 'string' || !input) throw new Error('Thiếu ảnh');
    const comma = input.indexOf(',');
    const b64 = input.startsWith('data:') && comma >= 0 ? input.slice(comma + 1) : input;
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new Error('Ảnh base64 không hợp lệ');
    return buf;
}

module.exports = {
    photoroomConfigured,
    photoroomCutout,
    falConfigured,
    birefnetCutout,
    withoutbgConfigured,
    withoutbgCutout,
    decodeImage,
    engines: () => ({
        withoutbg: withoutbgConfigured(),
        birefnet: falConfigured(),
        photoroom: photoroomConfigured(),
    }),
};
