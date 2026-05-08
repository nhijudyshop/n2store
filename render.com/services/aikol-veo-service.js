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
// Default model: veo-2.0-generate-001 — KHÔNG có audio generation → không hit
// audio safety filter (verified Veo 3.1 block "issue with the audio for your
// prompt" với 1 số ảnh model). Veo 2.0 stable + nhanh hơn cho silent KOL clones.
// Override via env AIKOL_VEO_MODEL khi cần audio (3.0/3.1).
// Available models: veo-2.0-generate-001 (no audio) / veo-3.0-generate-001
// (audio) / veo-3.0-fast-generate-001 / veo-3.1-generate-preview /
// veo-3.1-fast-generate-preview / veo-3.1-lite-generate-preview.
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.AIKOL_VEO_MODEL || 'veo-2.0-generate-001';
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

    // Default directive emphasizes IDENTITY LOCK — Veo image2video tự nhiên drift
    // face theo motion. Explicit anchor "do NOT redraw the face" giúp giữ pixel
    // identity ổn định qua frames.
    const directive = (
        prompt ||
        'Animate this image with subtle natural motion ONLY. ' +
            'Lock the face: do NOT redraw, smooth, beautify, idealize, or modify the eyes, ' +
            'nose, mouth, jawline, cheekbones, hairline, hair color, skin tone, makeup, or ' +
            'any facial feature. The animation must preserve the EXACT identity from the ' +
            'input image — same person beyond doubt across every frame. ' +
            'Allowed motion: gentle head turn (≤10°), subtle facial micro-expressions, ' +
            'eye blinks, breathing, slight body sway, hair movement. ' +
            'Keep the same scene, lighting, composition, and color palette from the input. ' +
            'Cinematic camera, photorealistic, natural skin texture, sharp focus on face.'
    ).slice(0, 1500);

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
    // "needs to be a number"). Valid buckets KHÁC NHAU theo model:
    //   Veo 2.0:  5 | 8           (4 hoặc 6 → API reject "invalid duration")
    //   Veo 3.x:  4 | 6 | 8
    // 1080p/4k yêu cầu 8 trên cả 2.
    const isVeo2 = /^veo-2/.test(m);
    const durRaw = Math.max(4, Math.min(parseInt(durationSeconds, 10) || 8, 8));
    const durQuantized = isVeo2 ? (durRaw >= 7 ? 8 : 5) : durRaw <= 4 ? 4 : durRaw <= 6 ? 6 : 8;
    const validResolutions = ['720p', '1080p', '4k'];
    const resStr = validResolutions.includes(resolution) ? resolution : '720p';
    const durFinal = resStr === '720p' ? durQuantized : 8;

    // Veo 3.x sinh audio kèm video → audio safety filter có thể block ngay cả
    // khi visual OK (verified user case Hạnh 4: "issue with the audio for your
    // prompt"). Param `generateAudio:false` không support trên 3.1 (tested 400).
    // → Default model Veo 2.0 (không có audio gen) tránh false-positive blocks.
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
 *
 * Veo có thể trả `done:true` mà không có video trong các trường hợp:
 *   - Safety filter blocked (raiMediaFilteredCount > 0): liệt kê reasons.
 *   - Person generation policy block: ảnh có người + region restricted (EU/UK).
 *   - Different response shape: log raw để debug.
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

    const resp = data.response || {};
    // Detect safety / RAI filter — Veo trả `raiMediaFilteredCount > 0` + `raiMediaFilteredReasons`
    // khi block. Có thể nằm ở resp top-level hoặc nested generateVideoResponse.
    const rai = resp.raiMediaFilteredCount ?? resp.generateVideoResponse?.raiMediaFilteredCount;
    const raiReasons =
        resp.raiMediaFilteredReasons ?? resp.generateVideoResponse?.raiMediaFilteredReasons ?? [];
    if (rai && rai > 0) {
        const reasons = Array.isArray(raiReasons) ? raiReasons.join('; ') : String(raiReasons);
        return {
            status: 'error',
            error: `Veo safety filter blocked (${rai} sample(s)): ${reasons || 'no reason given'}. Có thể do ảnh model trigger person/face policy hoặc prompt nhạy cảm.`,
            raw: data,
        };
    }

    // Extract video URI từ nhiều shape đã biết
    const generated =
        resp.generatedSamples ||
        resp.generateVideoResponse?.generatedSamples ||
        resp.predictions?.flatMap?.((p) => p.generatedSamples || []) ||
        [];
    const videoUri =
        generated[0]?.video?.uri ||
        generated[0]?.video?.gcsUri ||
        generated[0]?.videoUri ||
        generated[0]?.uri ||
        generated[0]?.gcsUri ||
        resp.video?.uri ||
        resp.video?.gcsUri ||
        resp.videos?.[0]?.uri ||
        resp.videos?.[0]?.gcsUri ||
        null;
    if (!videoUri) {
        // Log raw để identify shape mới
        console.warn(
            `[aikol-veo] done but no URI — operation=${operationName} response=${JSON.stringify(resp).slice(0, 1500)}`
        );
        const dbg = JSON.stringify(resp).slice(0, 200);
        return {
            status: 'error',
            error: `Veo done but no video URI. Raw response keys: ${Object.keys(resp).join(',') || '(empty)'}. Snippet: ${dbg}`,
            raw: data,
        };
    }
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
