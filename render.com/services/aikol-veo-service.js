// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// VEO VIDEO CLONE — Google's image-to-video model via Gemini API.
//
// Endpoint: models/{model}:predictLongRunning (async — returns operation name,
// must poll :operations/{name} until done.response.generatedSamples).
//
// Schema: Gemini API uses `contents` + `inlineData` + `generationConfig.videoConfig`
// (https://ai.google.dev/gemini-api/docs/video). NOT the Vertex AI `instances` +
// `image.bytesBase64Encoded` wrapper — that returns 400 "Unsupported video
// generation request" on generativelanguage.googleapis.com.
//
// Default model: veo-3.1-generate-preview per ai.google.dev/gemini-api/docs/video.
// Override via env AIKOL_VEO_MODEL. Other valid models on Gemini API:
//   veo-3.1-generate-preview / veo-3.1-fast-generate-preview /
//   veo-3.1-lite-generate-preview / veo-3.0-generate-001 / veo-2.0-generate-001.
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.AIKOL_VEO_MODEL || 'veo-3.1-generate-preview';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function authHeaders() {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    return { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' };
}

async function fetchImageBase64(url) {
    const res = await fetch(url, {
        headers: {
            Referer: 'https://www.tiktok.com/',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
    });
    if (!res.ok) throw new Error(`Image fetch HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    return { data: buf.toString('base64'), mime };
}

/**
 * Submit an image-to-video clone job. Returns operation name to poll.
 *
 * @param {object} args
 * @param {string} args.modelImageUrl - Required: portrait of the KOL
 * @param {string} [args.sceneImageUrl] - Optional: scene reference (Veo 3.1 only — appended as 2nd inline image)
 * @param {string} [args.prompt] - Action/scene description
 * @param {number} [args.durationSeconds=5] - 5 / 6 / 7 / 8
 * @param {string} [args.aspectRatio='9:16'] - "9:16" or "16:9"
 * @param {string} [args.resolution='720p'] - "720p" (default) or "1080p" (allowlist)
 * @param {string} [args.model] - override; default veo-2.0-generate-001
 * @returns {Promise<{operationName: string, model: string}>}
 */
async function submitVideoJob(args) {
    const {
        modelImageUrl,
        sceneImageUrl,
        prompt,
        durationSeconds = 5,
        aspectRatio = '9:16',
        resolution = '720p',
        model,
    } = args || {};
    if (!modelImageUrl) throw new Error('modelImageUrl is required');
    const m = model || DEFAULT_MODEL;
    const isVeo31 = /^veo-3\.1/.test(m);

    const modelImg = await fetchImageBase64(modelImageUrl);

    const directive = (
        prompt ||
        'Animate the subject naturally, maintaining their face and identity. Cinematic camera, photorealistic.'
    ).slice(0, 1000);

    // predictLongRunning uses Vertex-style envelope. Image goes in
    // instances[].image.{bytesBase64Encoded, mimeType}. The docs page mentions
    // `inlineData` but Veo on Gemini API rejects it ("`inlineData` isn't
    // supported by this model"). Real cause of original 400 was `durationSeconds`
    // sent as numeric 5; valid values are STRING "4"|"6"|"8".
    const instance = {
        prompt: directive,
        image: {
            bytesBase64Encoded: modelImg.data,
            mimeType: modelImg.mime,
        },
    };
    // NOTE: Veo 3.1 reference image (`referenceImages`) is currently unsupported
    // by the public Gemini API endpoint — sending it triggers a generic 400
    // "Unsupported video generation request". Scene info goes into the prompt
    // instead. Re-enable when Google publishes the field name for Gemini API.
    void sceneImageUrl; // suppress unused warning
    void isVeo31;

    // parameters: durationSeconds NUMERIC (docs say string but API rejects with
    // "The value type for `durationSeconds` needs to be a number"). Valid buckets
    // 4/6/8; 1080p/4k require 8.
    const durRaw = Math.max(4, Math.min(parseInt(durationSeconds, 10) || 8, 8));
    const durQuantized = durRaw <= 4 ? 4 : durRaw <= 6 ? 6 : 8;
    const validResolutions = ['720p', '1080p', '4k'];
    const resStr = validResolutions.includes(resolution) ? resolution : '720p';
    const durFinal = resStr === '720p' ? durQuantized : 8;

    const parameters = {
        aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
        durationSeconds: durFinal,
        resolution: resStr,
        sampleCount: 1,
    };

    const body = { instances: [instance], parameters };

    const url = `${BASE}/models/${encodeURIComponent(m)}:predictLongRunning`;
    const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        throw new Error(`Veo submit: ${data?.error?.message || `HTTP ${res.status}`}`);
    }
    if (!data.name) throw new Error('Veo submit: no operation name returned');
    return { operationName: data.name, model: m };
}

/**
 * Poll a Veo operation. Returns status + (when done) video URLs.
 */
async function getJobStatus(operationName) {
    if (!operationName) throw new Error('operationName required');
    const url = `${BASE}/${operationName}`;
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        return { status: 'error', error: data?.error?.message || `HTTP ${res.status}` };
    }
    if (!data.done) return { status: 'running', raw: data };
    if (data.error) return { status: 'error', error: data.error.message || 'Veo failed' };
    // done — extract video URI from various known response shapes
    const resp = data.response || {};
    const generated =
        resp.generatedSamples ||
        resp.generateVideoResponse?.generatedSamples ||
        resp.predictions?.flatMap?.((p) => p.generatedSamples || []) ||
        [];
    const videoUri =
        generated[0]?.video?.uri ||
        generated[0]?.uri ||
        resp.video?.uri ||
        resp.videos?.[0]?.uri ||
        null;
    if (!videoUri) return { status: 'error', error: 'Veo done but no video URI', raw: data };
    return { status: 'done', videoUri, raw: data };
}

/**
 * Download Veo result video. Veo URI is a download URL that needs the API key
 * appended as query param OR auth header.
 */
async function downloadVideo(videoUri) {
    const sep = videoUri.includes('?') ? '&' : '?';
    const url = `${videoUri}${sep}key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Veo download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return {
        buffer: buf,
        contentType: res.headers.get('content-type') || 'video/mp4',
    };
}

module.exports = { submitVideoJob, getJobStatus, downloadVideo, DEFAULT_MODEL };
