// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// GEMINI 3.1 FLASH IMAGE CLONE — multi-image input cho identity-preserving
// face clone vào scene mới. Khác PuLID (Fal) ở chỗ pass cả model + scene
// frame trực tiếp → match composition + lighting + objects gốc 100%.
//
// Verified: model #20 (Mai) + clip frame Khaby → output Mai sitting at
// Khaby's desk, perfect identity transfer + scene fidelity.
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.AIKOL_GEMINI_CLONE_MODEL || 'gemini-3.1-flash-image-preview';

async function fetchImageBase64(url) {
    const res = await fetch(url, {
        headers: {
            // TikTok CDN often needs Referer to avoid 403
            Referer: 'https://www.tiktok.com/',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
    });
    if (!res.ok) throw new Error(`Image fetch ${url.slice(0, 80)}… → HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return { data: buf.toString('base64'), mime };
}

/**
 * Clone the model's identity into a scene reference.
 *
 * @param {object} args
 * @param {string} args.modelImageUrl - Required: portrait of the KOL model
 * @param {string} [args.sceneImageUrl] - Optional: scene/clip frame to compose into
 * @param {string} [args.prompt] - Optional extra direction (note from user)
 * @param {string} [args.model] - Override default model
 * @returns {Promise<{buffer: Buffer, mimeType: string, model: string}>}
 */
async function cloneImage(args) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    const { modelImageUrl, sceneImageUrl, prompt, model } = args || {};
    if (!modelImageUrl) throw new Error('modelImageUrl is required');
    const m = model || DEFAULT_MODEL;

    // Fetch both reference images in parallel
    const [modelImg, sceneImg] = await Promise.all([
        fetchImageBase64(modelImageUrl),
        sceneImageUrl ? fetchImageBase64(sceneImageUrl) : Promise.resolve(null),
    ]);

    // Build prompt with explicit instructions (Gemini 3.1 honors clear directives)
    const directive = sceneImg
        ? [
              'Replace the person in the SECOND image with the woman/man from the FIRST image.',
              'Preserve her/his exact face, hairstyle, and identity from image 1.',
              'Keep the same scene, lighting, composition, props, and background from image 2.',
              prompt ? `Additional context: ${prompt}` : '',
              'Output: photorealistic, sharp focus, ultra detailed.',
          ]
              .filter(Boolean)
              .join(' ')
        : [
              'Generate a photorealistic portrait that preserves the exact face and identity from this reference image.',
              prompt ? `Scene/context: ${prompt}` : 'Same lighting and pose.',
              'Output: photorealistic, sharp focus, ultra detailed.',
          ]
              .filter(Boolean)
              .join(' ');

    const parts = [
        { text: directive },
        { inline_data: { mime_type: modelImg.mime, data: modelImg.data } },
    ];
    if (sceneImg) parts.push({ inline_data: { mime_type: sceneImg.mime, data: sceneImg.data } });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    const body = {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        throw new Error(`Gemini clone: ${data?.error?.message || `HTTP ${res.status}`}`);
    }
    const cand = (data.candidates || [])[0];
    const out = (cand?.content?.parts || []).find((p) => p.inlineData?.data || p.inline_data?.data);
    if (!out) {
        const finish = cand?.finishReason || 'no candidate';
        throw new Error(`Gemini clone: no image (${finish})`);
    }
    const inline = out.inlineData || out.inline_data;
    return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        model: m,
    };
}

module.exports = { cloneImage, DEFAULT_MODEL };
