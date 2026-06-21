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
// Nhiều key withoutbg → xoay tua (mỗi key free 50/tháng). WITHOUTBG_API_KEYS phẩy
// ngăn cách (ưu tiên), fallback WITHOUTBG_API_KEY đơn.
const WITHOUTBG_KEYS = (process.env.WITHOUTBG_API_KEYS || process.env.WITHOUTBG_API_KEY || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
let withoutbgIdx = 0; // key đang dùng (in-memory, sticky)
const WITHOUTBG_URL = 'https://api.withoutbg.com/v1.0/image-without-background-base64';
const MAX_BYTES = 12 * 1024 * 1024; // 12MB ảnh input

function photoroomConfigured() {
    return Boolean(PHOTOROOM_KEY);
}
function falConfigured() {
    return Boolean(FAL_KEY);
}
function withoutbgConfigured() {
    return WITHOUTBG_KEYS.length > 0;
}

// Status code coi là "key hết quota / không hợp lệ" → xoay sang key kế.
const WB_ROTATE_STATUS = new Set([401, 402, 403, 429]);

/**
 * Tách nền bằng withoutbg.com (free 50/tháng/key, full HD, no watermark).
 * Xoay tua nhiều key: dùng key hiện tại; nếu hết quota (402/429…) → key kế.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>} PNG cutout (nền trong suốt)
 */
async function withoutbgCutout(imageBuffer) {
    if (!WITHOUTBG_KEYS.length) throw new Error('WITHOUTBG_API_KEY(S) chưa cấu hình trên server');
    if (!imageBuffer?.length) throw new Error('Ảnh rỗng');
    if (imageBuffer.length > MAX_BYTES) throw new Error('Ảnh quá lớn (>12MB)');
    const body = JSON.stringify({ image_base64: imageBuffer.toString('base64') });
    const n = WITHOUTBG_KEYS.length;
    const start = withoutbgIdx; // bắt đầu từ key sticky hiện tại
    let lastErr = null;

    for (let attempt = 0; attempt < n; attempt++) {
        const idx = (start + attempt) % n;
        let res;
        try {
            res = await fetch(WITHOUTBG_URL, {
                signal: AbortSignal.timeout(30_000), // audit r8: chống treo vô hạn
                method: 'POST',
                headers: { 'X-API-Key': WITHOUTBG_KEYS[idx], 'Content-Type': 'application/json' },
                body,
            });
        } catch (e) {
            lastErr = e; // lỗi mạng → thử key kế
            continue;
        }
        if (res.ok) {
            withoutbgIdx = idx; // bám key đang chạy được cho lần sau
            const j = await res.json();
            const b64 = j.img_without_background_base64 || j.image_base64;
            if (!b64) throw new Error('withoutbg không trả ảnh');
            return Buffer.from(b64, 'base64');
        }
        if (WB_ROTATE_STATUS.has(res.status)) {
            console.warn(`[web2-cutout] withoutbg key#${idx} ${res.status} → xoay key kế`);
            lastErr = new Error(`key#${idx} ${res.status}`);
            continue; // thử key kế (KHÔNG đổi sticky giữa vòng — tránh nhảy cóc)
        }
        // lỗi thật (400 ảnh sai, 5xx) → không xoay, báo luôn
        const detail = await res.text().catch(() => '');
        throw new Error(`withoutbg ${res.status}: ${detail.slice(0, 200)}`);
    }
    // tất cả hết quota → dịch sticky để lần sau bắt đầu key khác
    withoutbgIdx = (start + 1) % n;
    throw new Error('Tất cả key withoutbg đã hết quota / lỗi. ' + (lastErr?.message || ''));
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
        signal: AbortSignal.timeout(30_000), // audit r8: chống treo vô hạn
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
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(30_000) }); // audit r8
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
        signal: AbortSignal.timeout(30_000), // audit r8: chống treo vô hạn
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
        withoutbgKeys: WITHOUTBG_KEYS.length,
        birefnet: falConfigured(),
        photoroom: photoroomConfigured(),
    }),
};
