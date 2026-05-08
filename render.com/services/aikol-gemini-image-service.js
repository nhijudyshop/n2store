// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// GEMINI IMAGE GENERATION — uses GEMINI_API_KEY (already configured for /api/gemini)
//
// Models per https://ai.google.dev/gemini-api/docs/image-generation:
//   - gemini-2.5-flash-image       (Nano Banana, 1K, low-latency)
//   - gemini-3.1-flash-image-preview (Nano Banana 2, 4K, faster — paid)
//   - gemini-3-pro-image-preview   (Nano Banana Pro, 4K, thinking/pro)
//
// All include SynthID watermark per Gemini policy. No grounding for real
// people from web search (docs limitation).
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.AIKOL_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

/**
 * Generate an image from a text prompt via Gemini.
 *
 * @param {object} args
 * @param {string} args.prompt - Required text prompt (the persona description).
 * @param {string} [args.model] - Override default model (e.g. for Pro).
 * @param {string} [args.aspectRatio] - "9:16", "1:1", "16:9", "4:5", etc.
 *   Only honored by 3.1+ models per docs; 2.5-flash-image will ignore.
 * @returns {Promise<{buffer: Buffer, mimeType: string, model: string, usage: object}>}
 */
async function generatePortrait(args = {}) {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    const prompt = String(args.prompt || '').trim();
    if (!prompt) throw new Error('prompt is required');
    const model = args.model || DEFAULT_MODEL;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
    };
    // aspectRatio config only valid on 3.x models; 2.5 ignores generationConfig
    // beyond responseModalities. Bake aspect into prompt string for 2.5.
    const supportsAspectConfig = /gemini-3/i.test(model);
    if (args.aspectRatio) {
        if (supportsAspectConfig) {
            body.generationConfig.responseFormat = {
                image: { aspectRatio: args.aspectRatio },
            };
        } else {
            // For 2.5 — append aspect hint to prompt (model honors framing cues)
            const aspectHint = {
                '9:16': 'vertical 9:16 portrait composition',
                '4:5': '4:5 instagram portrait composition',
                '3:4': '3:4 portrait composition',
                '16:9': 'horizontal 16:9 widescreen composition',
                '1:1': 'square 1:1 composition',
            }[args.aspectRatio];
            if (aspectHint) {
                body.contents[0].parts[0].text = `${prompt}, ${aspectHint}`;
            }
        }
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'x-goog-api-key': GEMINI_API_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        throw new Error(`Gemini image gen: ${msg}`);
    }
    const cand = (data.candidates || [])[0];
    const parts = cand?.content?.parts || [];
    const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
    if (!imgPart) {
        const finish = cand?.finishReason || 'no candidate';
        const text = parts.find((p) => p.text)?.text;
        throw new Error(
            `Gemini không trả ảnh (${finish})${text ? ' · ' + String(text).slice(0, 120) : ''}`
        );
    }
    const inline = imgPart.inlineData || imgPart.inline_data;
    return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        model,
        usage: data.usageMetadata || {},
    };
}

module.exports = { generatePortrait, DEFAULT_MODEL };
