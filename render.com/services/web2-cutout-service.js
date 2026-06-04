// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Web 2.0 — Cutout service (tách nền chất lượng cao qua API thứ 3).
 *
 * Engine hỗ trợ:
 *   - photoroom: PhotoRoom API v1 /segment → trả PNG cutout (nền trong suốt).
 *                Sandbox 1000 ảnh/tháng free; production tính phí.
 *
 * Key đọc từ env (Render) — KHÔNG hardcode:
 *   PHOTOROOM_API_KEY   (production)  hoặc
 *   PHOTOROOM_SANDBOX_KEY (test, prefix sandbox_)
 *
 * Trả về Buffer PNG. Frontend tự ghép nền (màu/ảnh/mờ) để đồng nhất với các
 * engine on-device khác.
 */
'use strict';

const PHOTOROOM_KEY = process.env.PHOTOROOM_API_KEY || process.env.PHOTOROOM_SANDBOX_KEY || '';
const PHOTOROOM_SEGMENT_URL = 'https://sdk.photoroom.com/v1/segment';
const MAX_BYTES = 12 * 1024 * 1024; // 12MB ảnh input

function photoroomConfigured() {
    return Boolean(PHOTOROOM_KEY);
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
    decodeImage,
    engines: () => ({ photoroom: photoroomConfigured() }),
};
