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

    // Build prompt with explicit instructions. Identity preservation directive
    // emphasizes pixel-level face match — Gemini 3.1 honors highly specific
    // anatomical anchors better than vague "preserve face" wording.
    const directive = sceneImg
        ? [
              '**TASK: identity-preserving face transfer.**',
              'You are given two images:',
              '- IMAGE 1 (reference person): contains the EXACT identity to preserve.',
              '- IMAGE 2 (target scene): contains the scene, pose, lighting, and composition.',
              '',
              "Generate ONE output image that places IMAGE 1's person into IMAGE 2's scene.",
              '',
              '**CRITICAL — preserve from IMAGE 1 with 100% pixel-level fidelity:**',
              'eye shape, eye color, eyebrow shape, nose shape and proportions,',
              'mouth shape and lip line, jawline, chin shape, cheekbones, ears,',
              'face shape and proportions, forehead, hairline, hair color and texture,',
              'skin tone, freckles, moles, scars, makeup, age, ethnicity, gender.',
              'The face must look INDISTINGUISHABLE from IMAGE 1 — same person beyond doubt.',
              'Do NOT smooth, beautify, idealize, age-shift, or stylize the face.',
              'Do NOT blend features with the person in IMAGE 2.',
              '',
              '**From IMAGE 2: keep** scene, lighting direction, color palette,',
              'composition, camera angle, props, background, and body pose/outfit.',
              prompt ? `\n**Additional context:** ${prompt}` : '',
              '',
              '**Output:** photorealistic, sharp focus on the face, ultra detailed,',
              'natural skin texture, anatomically correct, no smoothing artifacts.',
          ]
              .filter(Boolean)
              .join(' ')
        : prompt
          ? // Caller provided a custom directive — honour it as-is (route layer
            // builds explicit fidelity prompts).
            prompt
          : [
                'Reproduce this reference image with 100% pixel-level fidelity.',
                'Preserve EXACTLY: eye shape, eye color, eyebrow shape, nose shape and',
                'proportions, mouth shape, lip line, jawline, chin, cheekbones, ears,',
                'face shape, hairline, hair color and texture, skin tone, freckles, moles,',
                'scars, makeup, age, ethnicity, gender, expression, head pose, body pose,',
                'outfit, accessories, lighting direction, color palette, background.',
                'The output must look INDISTINGUISHABLE from the input — same person',
                'beyond doubt. Do NOT smooth, beautify, idealize, age-shift, or stylize.',
                'Photorealistic, sharp focus, natural skin texture, 1:1 reproduction.',
            ].join(' ');

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
        // Surface lý do rõ ràng: extract finishReason + text part nếu có (Gemini
        // thường kèm text refusal khi block bằng safety/policy/recitation).
        const finish = cand?.finishReason || 'no candidate';
        const textPart = (cand?.content?.parts || []).find((p) => p.text);
        const hint = textPart?.text?.slice(0, 250) || '';
        const safetyRatings = cand?.safetyRatings;
        const blockedRatings = Array.isArray(safetyRatings)
            ? safetyRatings.filter((r) => r.blocked || r.probability === 'HIGH').slice(0, 3)
            : [];
        const safetyHint = blockedRatings.length
            ? ` safety=${blockedRatings.map((r) => `${r.category}:${r.probability}`).join(',')}`
            : '';
        throw new Error(
            `Gemini clone: no image (${finish})${hint ? ' — ' + hint : ''}${safetyHint}`
        );
    }
    const inline = out.inlineData || out.inline_data;
    return {
        buffer: Buffer.from(inline.data, 'base64'),
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
        model: m,
    };
}

module.exports = { cloneImage, DEFAULT_MODEL };
