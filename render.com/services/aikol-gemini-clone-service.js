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

    // Photorealistic identity-transfer directive — deepfake-quality face swap
    // cho KOL studio. Hierarchy of priorities + concrete anatomical anchors +
    // forbidden list để Gemini 3.1 không drift sang "AI beauty filter" look.
    const directive = sceneImg
        ? [
              '# TASK',
              'Photorealistic identity-transfer for a vertical short-video frame.',
              'Generate ONE output image where the PERSON in IMAGE 2 is replaced by the',
              "person from IMAGE 1, while the scene, pose, and composition stay IMAGE 2's.",
              '',
              '# INPUTS',
              '- **IMAGE 1** = REFERENCE FACE. The KOL whose identity must be preserved.',
              '- **IMAGE 2** = TARGET FRAME. The TikTok-style scene to integrate into.',
              '',
              '# PRIORITY 1 — FACE FIDELITY (violate any → fail)',
              'Replicate from IMAGE 1 with pixel-level fidelity:',
              '- Eyes: shape, color, eye spacing, eyelid fold, lash density',
              '- Eyebrows: shape, density, color, arch',
              '- Nose: tip shape, bridge profile, nostril size, alar width',
              '- Mouth: lip shape, lip line, lip thickness, philtrum, natural lip color',
              '- Lower face: jawline angle, chin shape, mandible width, gonial angle',
              '- Mid face: cheekbone height, cheek fullness, malar prominence',
              '- Upper face: forehead height, brow ridge, temple width',
              '- Face boundary: hairline shape, ears (if visible), face height/width ratio',
              '- Hair: color, texture, parting, density (preserve from IMAGE 1 unless covered in IMAGE 2)',
              '- Skin: tone, undertone, pore texture, freckles, moles, scars, fine lines',
              '- Identity markers: age, ethnicity, gender expression, makeup style',
              '',
              'The output face must be INDISTINGUISHABLE from IMAGE 1 — a viewer must',
              'recognize the same person beyond any reasonable doubt.',
              '',
              '# PRIORITY 2 — SCENE INTEGRATION (everything else from IMAGE 2)',
              'Preserve from IMAGE 2: body pose, body proportions, hands, outfit, accessories,',
              'background, props, camera angle, framing, focal length, lighting direction,',
              'lighting intensity, color temperature, color grade, contrast, saturation.',
              '',
              '# PRIORITY 3 — NATURALNESS',
              "- Re-light the IMAGE 1 face to match IMAGE 2's lighting (direction +",
              '  temperature) WITHOUT altering the underlying face geometry.',
              '- Color-grade the face to match the clip frame (warm/cool, saturation).',
              '- Seamless edge blending at jawline, neckline, hairline — no visible',
              '  composite seam, no skin-tone mismatch where face meets neck.',
              '- Skin texture: natural pores and micro-imperfections (NOT airbrushed,',
              '  NOT plastic, NOT Instagram-filter smooth).',
              '- Match motion blur / depth of field / film grain of IMAGE 2.',
              '',
              '# FORBIDDEN (common deepfake failure modes)',
              '- DO NOT beautify, smooth, or idealize the face',
              '- DO NOT make features more symmetric than in IMAGE 1',
              '- DO NOT age-shift (younger/older)',
              '- DO NOT blend, average, or hybridize features with the IMAGE 2 person',
              '- DO NOT change ethnicity, race, or gender presentation',
              '- DO NOT add or remove tattoos, piercings, glasses unless in IMAGE 1',
              '- DO NOT change facial expression beyond what the body pose in IMAGE 2 implies',
              '- DO NOT generate an "AI face" — no over-symmetry, no airbrush, no glow',
              prompt ? `\n# ADDITIONAL CONTEXT\n${prompt}\n` : '',
              '',
              '# OUTPUT',
              'A single photorealistic image, indistinguishable from a real photograph',
              'taken with the same camera as IMAGE 2. Sharp focus on the face. Natural',
              'skin. Vertical 9:16 frame suitable for short-form video.',
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
