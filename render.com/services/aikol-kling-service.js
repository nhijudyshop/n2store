// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// KLING AI CLIENT — video generation for AI KOL Studio
//
// Auth: JWT (HS256) signed per-request with KLING_ACCESS_KEY / KLING_SECRET_KEY.
// Endpoint base: https://api.klingai.com (or api-singapore.klingai.com).
//
// Used flows:
//   image2video — portrait (model.jpg) + prompt → 5s/10s vertical clip
//   video2video — reference clip (clip.mp4) + portrait → identity-swapped clip
//
// Submission returns task_id; we poll /v1/videos/{kind}/{task_id} until
// task_status === 'succeed', then download MP4 to Bunny (URL expires fast).
//
// Docs: https://docs.qingque.cn/d/home/eZQDdGSZS_Y0nv9pkJEv8eMiL?identityId=1pxrpapp9TlCtN
// =====================================================

const jwt = require('jsonwebtoken');

const ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const SECRET_KEY = process.env.KLING_SECRET_KEY;
// Singapore region — better latency cho VN users + cùng datacenter Bunny CDN.
const KLING_BASE = (process.env.KLING_API_BASE || 'https://api-singapore.klingai.com').replace(
    /\/+$/,
    ''
);

// Default model — kling-v2-5-turbo cân bằng chất lượng/tốc độ. Available models
// (per https://kling.ai/document-api): kling-v1, kling-v1-5, kling-v1-6,
// kling-v2-master, kling-v2-1, kling-v2-1-master, kling-v2-5-turbo, kling-v2-6,
// kling-v3 (newest, native 4K). Override via env KLING_MODEL.
const KLING_MODEL = process.env.KLING_MODEL || 'kling-v2-5-turbo';
// Multi-image2video chỉ support kling-v1-6. Sẽ override khi gọi multi.
const KLING_MULTI_MODEL = process.env.KLING_MULTI_MODEL || 'kling-v1-6';

/**
 * Sign a short-lived JWT for the request. Kling expects:
 *   header: { alg: 'HS256', typ: 'JWT' }
 *   payload: { iss: ACCESS_KEY, exp: now+1800, nbf: now-5 }
 */
function signToken() {
    if (!ACCESS_KEY || !SECRET_KEY) {
        throw new Error('KLING_ACCESS_KEY / KLING_SECRET_KEY not configured');
    }
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({ iss: ACCESS_KEY, exp: now + 1800, nbf: now - 5 }, SECRET_KEY, {
        algorithm: 'HS256',
        header: { alg: 'HS256', typ: 'JWT' },
    });
}

function authHeader() {
    return { Authorization: `Bearer ${signToken()}`, 'Content-Type': 'application/json' };
}

function buildPrompt({ config, note }) {
    const sim = Math.max(0, Math.min(100, Number(config.similarity ?? 80)));
    const creat = Math.max(0, Math.min(100, Number(config.creativity ?? 50)));
    const keep = [];
    if (config.keep_pose) keep.push('same pose as reference');
    if (config.keep_outfit) keep.push('same outfit as reference');
    if (config.keep_bg) keep.push('same background as reference');
    if (config.keep_lighting) keep.push('same lighting as reference');

    const sceneNote =
        config.scene_mode === 'free_form' && note
            ? note
            : config.scene_mode === 'match'
              ? 'matching the source video setting'
              : '';

    return [
        'Portrait person',
        sceneNote,
        ...keep,
        `identity strength ${sim}%`,
        `motion creativity ${creat}%`,
        'natural motion, vertical 9:16 frame',
    ]
        .filter(Boolean)
        .join(', ');
}

/**
 * Submit an image-to-video job (portrait → vertical short).
 * @param {Object} args
 * @param {string} args.modelImageUrl - public URL to portrait reference (Bunny CDN)
 * @param {Object} args.config - { kling_mode, variations (1), similarity, creativity, ... }
 * @param {string} [args.note]
 * @returns {Promise<{taskId:string, kind:'image2video', raw:any}>}
 */
async function submitImage2Video({ modelImageUrl, config, note }) {
    if (!modelImageUrl) throw new Error('modelImageUrl is required');
    const mode = config.kling_mode === 'pro' ? 'pro' : 'std';
    const duration = String(config.duration_seconds || 5); // 5 | 10
    const body = {
        model_name: KLING_MODEL,
        mode,
        duration,
        image: modelImageUrl,
        prompt: buildPrompt({ config, note }),
        cfg_scale: 0.5,
    };
    return _submit('/v1/videos/image2video', body, 'image2video');
}

/**
 * Submit a multi-image-to-video job (face-swap workflow).
 *
 * Kling Multi-Image2Video accepts up to 4 reference images — perfect cho
 * "ghép model vào clip TikTok": image[0] = model face (KOL), image[1] =
 * clip cover frame (target scene). Kling tự handle identity preservation +
 * scene match — không cần Gemini compose step (1 API call thay vì 2-stage).
 *
 * Endpoint: POST /v1/videos/multi-image2video. Default model: kling-v1-6.
 *
 * @param {Object} args
 * @param {string[]} args.imageUrls - 1-4 reference image URLs (model + scene refs)
 * @param {Object} args.config - { kling_mode, duration_seconds, ... }
 * @param {string} [args.note] - prompt text
 */
async function submitMultiImage2Video({ imageUrls, config, note }) {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        throw new Error('imageUrls (1-4 images) is required');
    }
    if (imageUrls.length > 4) {
        throw new Error('Multi-Image2Video supports max 4 images');
    }
    const mode = config.kling_mode === 'pro' ? 'pro' : 'std';
    const duration = String(config.duration_seconds || 5); // 5 | 10
    const aspect = config.image_size || config.aspect_ratio || '9:16';
    const body = {
        model_name: KLING_MULTI_MODEL,
        mode,
        duration,
        aspect_ratio: ['16:9', '9:16', '1:1'].includes(aspect) ? aspect : '9:16',
        image_list: imageUrls.map((url) => ({ image: url })),
        prompt: buildPrompt({ config, note }),
    };
    return _submit('/v1/videos/multi-image2video', body, 'multi-image2video');
}

/**
 * Submit a video-to-video job (reference clip + portrait → identity-swapped clip).
 * Note: Kling's /v1/videos/video-effects with face_swap effect is the cheaper path;
 * full video2video may not be available on all plans. We default to image2video
 * for portrait clones unless an explicit clip URL is passed.
 *
 * @param {Object} args
 * @param {string} args.clipVideoUrl - public URL to source clip MP4 (Bunny CDN)
 * @param {string} args.modelImageUrl - public URL to portrait reference
 */
async function submitVideo2Video({ clipVideoUrl, modelImageUrl, config, note }) {
    if (!clipVideoUrl) throw new Error('clipVideoUrl is required');
    if (!modelImageUrl) throw new Error('modelImageUrl is required');
    const mode = config.kling_mode === 'pro' ? 'pro' : 'std';
    const duration = String(config.duration_seconds || 5);
    const body = {
        model_name: KLING_MODEL,
        mode,
        duration,
        video_url: clipVideoUrl,
        image_url: modelImageUrl,
        prompt: buildPrompt({ config, note }),
    };
    return _submit('/v1/videos/video2video', body, 'video2video');
}

async function _submit(path, body, kind) {
    const url = `${KLING_BASE}${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Kling ${path} ${res.status}: ${text.slice(0, 400)}`);
    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error(`Kling returned non-JSON: ${text.slice(0, 200)}`);
    }
    if (data.code !== 0 || !data.data || !data.data.task_id) {
        throw new Error(`Kling rejected: ${data.message || JSON.stringify(data).slice(0, 300)}`);
    }
    return { taskId: data.data.task_id, kind, raw: data };
}

/**
 * Poll job status. Returns normalized { status, videos: [{ url, duration }], rawTask }.
 * status in: 'submitted' | 'processing' | 'succeed' | 'failed'
 */
async function getJobStatus(taskId, kind = 'image2video') {
    if (!taskId) throw new Error('taskId is required');
    const path = `/v1/videos/${kind}/${taskId}`;
    const res = await fetch(`${KLING_BASE}${path}`, { headers: authHeader() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Kling status ${res.status}: ${text.slice(0, 300)}`);
    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error(`Kling status non-JSON: ${text.slice(0, 200)}`);
    }
    if (data.code !== 0) {
        throw new Error(`Kling status rejected: ${data.message || data.code}`);
    }
    const task = data.data || {};
    const status = task.task_status || 'submitted';
    const result = task.task_result || {};
    const videos = Array.isArray(result.videos)
        ? result.videos.map((v) => ({
              url: v.url,
              duration: parseFloat(v.duration) || null,
              id: v.id || null,
          }))
        : [];
    return {
        status,
        videos,
        message: task.task_status_msg || null,
        rawTask: task,
    };
}

/**
 * Download Kling output MP4 (URLs expire ~30 min after gen).
 */
async function downloadToBuffer(url, maxBytes = 200 * 1024 * 1024) {
    if (!url) throw new Error('Missing download URL');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download ${res.status} for ${url}`);
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
        throw new Error(`Download exceeds ${maxBytes} bytes`);
    }
    return Buffer.from(arrayBuf);
}

module.exports = {
    submitImage2Video,
    submitMultiImage2Video,
    submitVideo2Video,
    getJobStatus,
    downloadToBuffer,
    buildPrompt,
    KLING_MODEL,
    KLING_MULTI_MODEL,
};
