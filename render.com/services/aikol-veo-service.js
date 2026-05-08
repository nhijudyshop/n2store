// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// VEO 3.1 VIDEO CLONE — Google's image-to-video model accessible via Gemini API.
//
// Endpoint: models/{model}:predictLongRunning (async — returns operation name,
// must poll :operations/{name} until done.response.generateVideoResponse).
//
// Models per docs (https://ai.google.dev/gemini-api/docs/video):
//   - veo-3.1-generate-preview      — preview, up to 4K, 8s
//   - veo-3.1-fast-generate-preview — preview, faster
//   - veo-3.1-lite-generate-preview — preview, cheap
//   - veo-3.0-generate-001          — stable, 4K, 8s
//   - veo-3.0-fast-generate-001     — stable fast
//   - veo-2.0-generate-001          — stable 720p
//
// Veo 3.1 supports up to 3 reference images for appearance preservation.
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
 * @param {string} [args.sceneImageUrl] - Optional: scene reference (Veo 3.1)
 * @param {string} [args.prompt] - Action/scene description
 * @param {number} [args.durationSeconds=5] - 4 / 6 / 8
 * @param {string} [args.aspectRatio='9:16'] - 9:16 vertical default for TikTok
 * @param {string} [args.resolution='720p']
 * @param {string} [args.model] - override
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

    const modelImg = await fetchImageBase64(modelImageUrl);

    const directive = (
        prompt ||
        'Animate the subject naturally, maintaining their face and identity. Cinematic camera, photorealistic.'
    ).slice(0, 1000);

    // Veo predictLongRunning expects bytesBase64Encoded (not inlineData) per
    // Vertex AI / Gemini API doc convention. Numeric durationSeconds, not string.
    const instance = {
        prompt: directive,
        image: {
            bytesBase64Encoded: modelImg.data,
            mimeType: modelImg.mime,
        },
    };
    // Veo 3.1 reference images (optional appearance preservation)
    if (sceneImageUrl && /^veo-3\.1/.test(m)) {
        const sceneImg = await fetchImageBase64(sceneImageUrl);
        instance.referenceImages = [
            {
                image: {
                    bytesBase64Encoded: sceneImg.data,
                    mimeType: sceneImg.mime,
                },
                referenceType: 'asset',
            },
        ];
    }

    const body = {
        instances: [instance],
        parameters: {
            aspectRatio,
            resolution,
            durationSeconds: Number(durationSeconds),
            sampleCount: 1,
        },
    };

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
    // done — extract video URI
    const resp = data.response || {};
    const generated =
        resp.generateVideoResponse?.generatedSamples ||
        resp.predictions?.flatMap?.((p) => p.generatedSamples || []) ||
        [];
    const videoUri = generated[0]?.video?.uri || generated[0]?.uri || null;
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
