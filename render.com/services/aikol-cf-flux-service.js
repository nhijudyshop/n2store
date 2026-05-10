// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// CLOUDFLARE WORKERS AI — FLUX image generation (free 10K neurons/day)
// thay cho Gemini 3.1 Flash Image ($0.04/img → ~$0 free tier).
//
// Models:
//   - @cf/black-forest-labs/flux-1-schnell — text-to-image, ~$0.003/image
//   - @cf/black-forest-labs/flux-2-dev — multi-image native (input_image_0..3)
//     ~$0.02-0.03/image. Multipart form-data only.
//
// Auth: Bearer CF_WORKERS_AI_TOKEN (Account API token với "Workers AI Read"
// permission tại https://dash.cloudflare.com/profile/api-tokens).
// Account ID: CF_ACCOUNT_ID — 32-char hex tại dashboard.
// =====================================================

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_TOKEN = process.env.CF_WORKERS_AI_TOKEN;
const FLUX_SCHNELL = '@cf/black-forest-labs/flux-1-schnell';
const FLUX_2_DEV = '@cf/black-forest-labs/flux-2-dev';

function isAvailable() {
    return !!(CF_ACCOUNT_ID && CF_TOKEN);
}

function endpoint(model) {
    return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${model}`;
}

/**
 * Text-to-image với FLUX-1-schnell — rẻ + nhanh (4 step, ~3-5s).
 * Input: prompt text. Output: PNG buffer.
 *
 * @param {object} args
 * @param {string} args.prompt
 * @param {number} [args.steps=4] — 1-8
 * @returns {Promise<{buffer: Buffer, mimeType: string, model: string}>}
 */
async function textToImage({ prompt, steps = 4 }) {
    if (!isAvailable()) throw new Error('CF_ACCOUNT_ID / CF_WORKERS_AI_TOKEN not configured');
    if (!prompt) throw new Error('prompt required');
    const res = await fetch(endpoint(FLUX_SCHNELL), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${CF_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), steps }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
        throw new Error(`CF FLUX schnell: ${data?.errors?.[0]?.message || `HTTP ${res.status}`}`);
    }
    // Response: { result: { image: "<base64>" }, success: true }
    const b64 = data.result?.image;
    if (!b64) throw new Error('CF FLUX: no image in response');
    return {
        buffer: Buffer.from(b64, 'base64'),
        mimeType: 'image/png',
        model: FLUX_SCHNELL,
    };
}

/**
 * Multi-image compose với FLUX-2-dev — native multi-reference (face + scene).
 * Multipart form-data with input_image_0..3 + prompt.
 *
 * @param {object} args
 * @param {Buffer[]} args.images - 1-4 reference images (model + scene/outfit)
 * @param {string[]} args.mimeTypes - mime type cho mỗi image
 * @param {string} args.prompt
 * @param {number} [args.steps=20]
 * @returns {Promise<{buffer: Buffer, mimeType: string, model: string}>}
 */
async function multiImageCompose({ images, mimeTypes, prompt, steps = 20 }) {
    if (!isAvailable()) throw new Error('CF_ACCOUNT_ID / CF_WORKERS_AI_TOKEN not configured');
    if (!Array.isArray(images) || images.length === 0)
        throw new Error('images (1-4 buffers) required');
    if (images.length > 4) throw new Error('FLUX.2 dev max 4 images');

    // FormData multipart
    const FormData = global.FormData || require('form-data');
    const fd = new FormData();
    fd.append('prompt', String(prompt).slice(0, 2000));
    fd.append('steps', String(steps));
    images.forEach((buf, i) => {
        const mime = mimeTypes?.[i] || 'image/jpeg';
        // Node 18+ FormData accepts Blob; node-form-data accepts Buffer + filename.
        if (typeof Blob !== 'undefined') {
            fd.append(`input_image_${i}`, new Blob([buf], { type: mime }));
        } else {
            fd.append(`input_image_${i}`, buf, {
                filename: `ref_${i}.${mime.split('/')[1]}`,
                contentType: mime,
            });
        }
    });

    const res = await fetch(endpoint(FLUX_2_DEV), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${CF_TOKEN}`,
            // KHÔNG set Content-Type — fetch tự set với boundary cho multipart
        },
        body: fd,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`CF FLUX-2 dev: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    // FLUX-2 dev trả raw image bytes (không phải JSON).
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = res.headers.get('content-type') || 'image/png';
    return { buffer, mimeType: contentType, model: FLUX_2_DEV };
}

module.exports = {
    isAvailable,
    textToImage,
    multiImageCompose,
    FLUX_SCHNELL,
    FLUX_2_DEV,
};
