// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// FAL.AI CLIENT — image generation for AI KOL Studio
//
// Uses fal-ai/flux-pulid (PuLID face-conditioned Flux) for identity-preserving
// portrait generation. Reads FAL_KEY from env. Submits to the queue, returns a
// request_id; poller fetches the result later.
//
// Docs: https://fal.ai/models/fal-ai/flux-pulid/api
// Queue API: https://fal.ai/docs/concepts/queue
// =====================================================

const FAL_KEY = process.env.FAL_KEY;
const FAL_BASE = 'https://queue.fal.run';

// Use PuLID (best identity preservation for portrait clones).
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux-pulid';

const IMAGE_SIZE_MAP = {
    '9:16': 'portrait_16_9', // fal naming is inverted: portrait_16_9 = 9:16
    '1:1': 'square_hd',
    '16:9': 'landscape_16_9',
    '4:5': 'portrait_4_3',
    '3:4': 'portrait_4_3',
};

function authHeader() {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');
    return { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' };
}

/**
 * Build Fal.ai input from a generation config + a model reference image URL.
 * @param {Object} args
 * @param {string} args.modelImageUrl - Public URL to portrait reference (Bunny CDN).
 * @param {Object} args.config - Generation config (see aikol_generations.config).
 * @param {string} [args.note] - Optional free-form prompt addendum.
 */
function buildImageInput({ modelImageUrl, config, note }) {
    const sim = Math.max(0, Math.min(100, Number(config.similarity ?? 80)));
    const creat = Math.max(0, Math.min(100, Number(config.creativity ?? 50)));
    const variations = Math.max(1, Math.min(10, Number(config.variations ?? 1)));

    const keepParts = [];
    if (config.keep_pose) keepParts.push('same pose as reference');
    if (config.keep_outfit) keepParts.push('same outfit as reference');
    if (config.keep_bg) keepParts.push('same background as reference');
    if (config.keep_lighting) keepParts.push('same lighting as reference');

    const shotMap = {
        match_clip: 'matching shot framing',
        close_up: 'close-up shot',
        waist_up: 'waist-up shot',
        full_body: 'full body shot',
    };
    const shot = shotMap[config.shot_type] || '';
    const sceneNote =
        config.scene_mode === 'free_form' && note
            ? note
            : config.scene_mode === 'match'
              ? 'matching the source video setting'
              : '';

    const promptBits = [
        'Portrait person',
        sceneNote,
        shot,
        ...keepParts,
        `identity strength ${sim}%`,
        `creative variation ${creat}%`,
        'photorealistic, sharp focus, vertical 9:16 frame',
    ].filter(Boolean);

    return {
        prompt: promptBits.join(', '),
        reference_image_url: modelImageUrl,
        image_size: IMAGE_SIZE_MAP[config.image_size] || 'portrait_16_9',
        num_images: variations,
        // PuLID-specific knobs (mirror Fal docs defaults; fall back gracefully if model differs).
        num_inference_steps: 20,
        guidance_scale: 3.5 + (creat / 100) * 4, // 3.5..7.5
        true_cfg: 1.0 + (sim / 100) * 1.5, // 1..2.5 — higher = stronger identity lock
    };
}

/**
 * Submit a job to Fal.ai queue. Returns { requestId, statusUrl, responseUrl }.
 */
async function submitImageJob({ modelImageUrl, config, note }) {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');
    if (!modelImageUrl) throw new Error('modelImageUrl is required');

    const input = buildImageInput({ modelImageUrl, config, note });
    const url = `${FAL_BASE}/${FAL_MODEL}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(input),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Fal submit ${res.status}: ${text.slice(0, 400)}`);
    }
    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error(`Fal returned non-JSON: ${text.slice(0, 200)}`);
    }
    return {
        requestId: data.request_id,
        statusUrl: data.status_url || `${FAL_BASE}/${FAL_MODEL}/requests/${data.request_id}/status`,
        responseUrl: data.response_url || `${FAL_BASE}/${FAL_MODEL}/requests/${data.request_id}`,
        rawSubmit: data,
    };
}

/**
 * Poll job status. Returns { status: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED', logs, result? }.
 */
async function getJobStatus(requestId, model = FAL_MODEL) {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');
    const url = `${FAL_BASE}/${model}/requests/${requestId}/status`;
    const res = await fetch(url, { headers: authHeader() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Fal status ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
}

/**
 * Fetch final result. Only valid after status === 'COMPLETED'.
 * Returns { images: [{ url, content_type, width, height }], seed, ... }.
 */
async function getJobResult(requestId, model = FAL_MODEL) {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured');
    const url = `${FAL_BASE}/${model}/requests/${requestId}`;
    const res = await fetch(url, { headers: authHeader() });
    const text = await res.text();
    if (!res.ok) throw new Error(`Fal result ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
}

/**
 * Stream-download a remote URL into a Buffer with size cap.
 */
async function downloadToBuffer(url, maxBytes = 30 * 1024 * 1024) {
    if (!url) throw new Error('Missing download URL');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download ${res.status} for ${url}`);
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
        throw new Error(`Download exceeds ${maxBytes} bytes (got ${arrayBuf.byteLength})`);
    }
    return Buffer.from(arrayBuf);
}

module.exports = {
    submitImageJob,
    getJobStatus,
    getJobResult,
    downloadToBuffer,
    buildImageInput,
    FAL_MODEL,
};
