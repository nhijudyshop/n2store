// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL QUEUE WORKER — drives image (Fal.ai) + video (Kling) generations.
//
// Run-loop:
//   1. Pick up `pending` rows → dispatch to Fal/Kling, store external_id, mark `running`.
//   2. Poll `running` rows → check provider status; on success download outputs to Bunny.
//   3. On terminal failure → refund credits, mark `error`.
//
// Concurrency: simple in-memory mutex per generation_id (prevents double-dispatch
// when multiple ticks fire close together). Single Render instance = no need for
// distributed locks. If we scale horizontally later, add SELECT FOR UPDATE SKIP LOCKED.
//
// Trigger: setInterval every 8s + on-demand `tick()` from POST /generations.
// =====================================================

const pool = require('../db/pool');
const bunny = require('./bunny-storage-service');
const fal = require('./aikol-fal-service');
const kling = require('./aikol-kling-service');
const geminiClone = require('./aikol-gemini-clone-service');
// Veo service đã bỏ — chỉ giữ require để không break tests cũ. Comment out:
// const veo = require('./aikol-veo-service');
const telegram = require('./aikol-telegram-service');
const presets = require('../../aikol-studio/js/aikol-presets');

const TICK_INTERVAL_MS = parseInt(process.env.AIKOL_WORKER_INTERVAL_MS, 10) || 8000;
const MAX_RUNNING = parseInt(process.env.AIKOL_WORKER_MAX_RUNNING, 10) || 6;
const FAL_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const KLING_POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
// VEO_POLL_TIMEOUT_MS bỏ — Veo service đã removed.

const inFlight = new Set(); // generation_ids currently being processed by THIS tick
let intervalHandle = null;
let _bootLogged = false;

function logBoot() {
    if (_bootLogged) return;
    _bootLogged = true;
    console.log(`[aikol-worker] boot — interval=${TICK_INTERVAL_MS}ms, max_running=${MAX_RUNNING}`);
}

async function refundCredits(userId, amount, gen_id, note) {
    await pool.query(
        `UPDATE aikol_credits SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1`,
        [userId, amount]
    );
    await pool.query(
        `INSERT INTO aikol_credit_history (user_id, kind, delta, gen_id, note)
         VALUES ($1, 'refund', $2, $3, $4)`,
        [userId, amount, gen_id, note]
    );
}

async function markError(genId, userId, costCredits, errMsg) {
    await pool.query(
        `UPDATE aikol_generations SET state = 'error', error = $1, finished_at = NOW() WHERE id = $2`,
        [String(errMsg).slice(0, 800), genId]
    );
    await refundCredits(
        userId,
        costCredits,
        genId,
        `Refund: ${String(errMsg).slice(0, 100)}`
    ).catch((e) => console.warn(`[aikol-worker] refund failed for ${genId}:`, e.message));
    telegram
        .notifyUser(
            userId,
            'error',
            `❌ *Generation thất bại*\n\nID: \`${genId.slice(0, 8)}\`\nĐã refund: \`+${costCredits} cr\`\nLỗi: ${String(errMsg).slice(0, 200)}`
        )
        .catch(() => {});
}

async function notifyDone(genId, userId, kind, outputCount) {
    telegram
        .notifyUser(
            userId,
            'done',
            `✅ *Generation hoàn tất*\n\n${kind === 'video' ? '🎬' : '🖼️'} \`${kind}\` — \`${outputCount}\` output\nID: \`${genId.slice(0, 8)}\``
        )
        .catch(() => {});
}

// ---------- DISPATCH (pending → running) ----------
async function dispatchOne(row) {
    const { id, user_id, kind, model_id, clip_id, config, cost_credits } = row;
    const conf = typeof config === 'string' ? JSON.parse(config) : config;
    const note = conf.note || null;

    // Resolve model image URL.
    const modelRow = await pool.query(`SELECT file_path FROM aikol_models WHERE id = $1`, [
        model_id,
    ]);
    if (!modelRow.rows[0]) throw new Error(`model ${model_id} missing`);
    const modelImageUrl = bunny.cdnUrl(modelRow.rows[0].file_path);

    // Single round-trip cho tất cả clip data — tránh stale state nếu clip
    // bị delete giữa 2 query.
    let clipVideoUrl = null;
    let sceneImageUrl = null;
    if (clip_id) {
        const clipRow = await pool.query(
            `SELECT file_path, download_status, cover_url FROM aikol_clips WHERE id = $1`,
            [clip_id]
        );
        const c = clipRow.rows[0];
        if (c?.file_path && c.download_status === 'done') {
            clipVideoUrl = bunny.cdnUrl(c.file_path);
        }
        sceneImageUrl = c?.cover_url || null;
    }

    // Engine selection — config.engine overrides default per kind.
    // image: gemini_3_1 (default) | fal_pulid (locked)
    // video: kling (default — face-swap-capable via multi-image2video) | veo_3_1
    const engine = String(conf.engine || (kind === 'image' ? 'gemini_3_1' : 'kling')).toLowerCase();

    let externalId, provider, kindKey;
    // Khai báo function-scope để final UPDATE outside if/else block đọc được.
    let compositeKey = null;

    // gen_mode: 'with_clip' (clip scene) / 'auto_scene' (prompt) / 'product'
    // (outfit try-on, IMAGE 2 = outfit_url, no clip needed). Nếu user gửi
    // gen_mode='product' với outfit_url thì giữ nguyên; còn lại fallback theo
    // sceneImageUrl presence.
    let genMode = String(conf.gen_mode || '').toLowerCase();
    if (genMode === 'product' && conf.outfit_url) {
        // OK, keep as product
    } else {
        genMode = sceneImageUrl ? 'with_clip' : 'auto_scene';
    }

    // Build engine-agnostic directive.
    // - with_clip + sceneImageUrl: service tự build "Replace person in image2"
    //   directive → pass `note` để Gemini biết tweak gì thêm.
    // - auto_scene: build directive yêu cầu Gemini/Veo đặt model vào scene mới
    //   từ prompt (note bắt buộc, frontend đã validate).
    // Build scene description từ config:
    //   - scene_presets array (multi-select) → join các preset.prompt
    //   - free_form note → dùng note trực tiếp
    //   - fallback default studio
    function buildSceneDescription() {
        const sp = Array.isArray(conf.scene_presets) ? conf.scene_presets : [];
        if (sp.length > 0) {
            const prompts = sp.map((id) => presets.presetById(id)?.prompt).filter(Boolean);
            if (prompts.length > 0) {
                return prompts.length === 1
                    ? prompts[0]
                    : `one of these scenes (mix across variations): ${prompts.join(' OR ')}`;
            }
        }
        return (
            (note || '').trim() ||
            'photorealistic studio portrait, soft natural lighting, neutral background'
        );
    }
    // Inject framing directive based on shot_type
    function shotTypeDirective() {
        const st = presets.shotTypeById(conf.shot_type);
        return st?.prompt ? ' ' + st.prompt : '';
    }
    // Style strength (0-100) — control intensity of scene mood vs identity.
    function styleStrengthDirective() {
        const v = parseInt(conf.style_strength, 10);
        if (!Number.isFinite(v)) return '';
        if (v >= 70) return ' Apply the scene mood strongly — saturated cinematic look.';
        if (v <= 30) return ' Apply the scene mood subtly — soft, understated.';
        return '';
    }

    function buildAutoSceneDirective(forVideo) {
        const sceneDesc = buildSceneDescription();
        const verb = forVideo ? 'Animate the person' : 'Place the person';
        return [
            `${verb} from this reference image into the following new scene:`,
            sceneDesc + '.' + shotTypeDirective() + styleStrengthDirective(),
            '**Preserve identity 100% pixel-level**: eye shape, eye color, eyebrow',
            'shape, nose shape and proportions, mouth shape, lip line, jawline,',
            'chin, cheekbones, face shape, hairline, hair color and texture, skin',
            'tone, freckles, moles, makeup, age, ethnicity, gender. Same person',
            'beyond doubt — do NOT smooth, beautify, idealize, age-shift, or',
            'stylize the face. Do NOT blend with anyone else.',
            'The pose, expression, outfit, lighting, and background should match',
            'the new scene description above, not the reference image.',
            forVideo
                ? 'Cinematic camera, photorealistic, natural skin texture, sharp focus on face.'
                : 'Photorealistic, natural skin texture, sharp focus on face, ultra detailed.',
        ].join(' ');
    }

    // Product (outfit) directive — IMAGE 1 = model, IMAGE 2 = outfit photo.
    // Place model wearing outfit in a chosen scene preset.
    function buildProductDirective() {
        const sceneDesc = buildSceneDescription();
        return [
            '**TASK: e-commerce product try-on.**',
            'You are given two images:',
            '- IMAGE 1 (KOL model): contains the EXACT face/identity to preserve.',
            '- IMAGE 2 (outfit/clothing): the clothing item the model must wear.',
            '',
            `Generate ONE photorealistic image where the model from IMAGE 1 is`,
            `wearing the outfit/clothing from IMAGE 2 in this scene: ${sceneDesc}.`,
            shotTypeDirective(),
            styleStrengthDirective(),
            '',
            '**FACE FIDELITY (Priority 1)**: pixel-level preserve from IMAGE 1 —',
            'eye shape, eye color, eyebrows, nose, mouth, lip line, jawline, chin,',
            'cheekbones, face shape, hairline, hair color/texture, skin tone, freckles,',
            'moles, makeup, age, ethnicity, gender. Same person beyond doubt.',
            '',
            '**OUTFIT FIDELITY (Priority 2)**: replicate IMAGE 2 outfit exactly —',
            'cut, color, fabric texture, pattern, accessories. Fit naturally to model body.',
            '',
            '**SCENE INTEGRATION (Priority 3)**: place model in described scene with',
            'realistic lighting, color grade, depth of field. Seamless edge blending',
            'between model, outfit, and background — no visible composite seam.',
            '',
            '# FORBIDDEN: do NOT beautify, idealize, age-shift, or stylize the face.',
            'Do NOT alter the outfit color or pattern. No "AI face" glow.',
            '',
            'Output: photorealistic, natural skin texture, sharp focus on face, vertical 9:16.',
        ]
            .filter(Boolean)
            .join(' ');
    }

    // ===== IMAGE =====
    if (kind === 'image') {
        if (engine === 'gemini_3_1' || engine === 'cf_flux') {
            // gen_mode='product': IMAGE 1 = model, IMAGE 2 = outfit (config.outfit_url).
            // Override sceneImageUrl với outfit_url + dùng product directive.
            let imagePrompt, secondImageUrl;
            if (genMode === 'product' && conf.outfit_url) {
                imagePrompt = buildProductDirective();
                secondImageUrl = conf.outfit_url;
            } else if (genMode === 'auto_scene') {
                imagePrompt = buildAutoSceneDirective(false);
                secondImageUrl = null;
            } else {
                imagePrompt = note;
                secondImageUrl = sceneImageUrl;
            }
            // CF FLUX path (cheap free option) — fetch images as buffers, dùng
            // multi-image compose endpoint (FLUX-2 dev). Auto-fallback Gemini
            // nếu CF chưa configure.
            let result;
            const cfFlux = require('./aikol-cf-flux-service');
            if (engine === 'cf_flux' && cfFlux.isAvailable()) {
                const fetchAsBuf = async (url) => {
                    const r = await fetch(url);
                    if (!r.ok) throw new Error(`fetch image ${r.status}`);
                    const arr = await r.arrayBuffer();
                    return {
                        buffer: Buffer.from(arr),
                        mimeType: r.headers.get('content-type') || 'image/jpeg',
                    };
                };
                const refs = [await fetchAsBuf(modelImageUrl)];
                if (secondImageUrl) refs.push(await fetchAsBuf(secondImageUrl));
                result = await cfFlux.multiImageCompose({
                    images: refs.map((r) => r.buffer),
                    mimeTypes: refs.map((r) => r.mimeType),
                    prompt: imagePrompt,
                });
            } else {
                // Synchronous — generate, upload, save output, mark done all in one shot
                result = await geminiClone.cloneImage({
                    modelImageUrl,
                    sceneImageUrl: secondImageUrl,
                    prompt: imagePrompt,
                });
            }
            const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
            const key = `aikol/outputs/${id}-0.${ext}`;
            await bunny.uploadBuffer(result.buffer, key, result.mimeType);
            // Idempotent: nếu poll re-fire / restart re-dispatch, INSERT trùng
            // (generation_id, variant_index) sẽ no-op thay vì duplicate row.
            // Yêu cầu UNIQUE constraint trên (generation_id, variant_index) — sẽ
            // cần migration nếu chưa có.
            await pool.query(
                `INSERT INTO aikol_outputs
                    (generation_id, user_id, variant_index, file_path, file_kind, file_size)
                 SELECT $1, $2, 0, $3, 'image', $4
                 WHERE NOT EXISTS (
                   SELECT 1 FROM aikol_outputs WHERE generation_id = $1 AND variant_index = 0
                 )`,
                [id, user_id, key, result.buffer.length]
            );
            // Atomic flip: chỉ done nếu state vẫn là dispatching (chống ghi đè
            // markError đã chạy concurrent).
            await pool.query(
                `UPDATE aikol_generations
                 SET state = 'done', error = NULL, finished_at = NOW(),
                     config = COALESCE(config, '{}'::jsonb) || $1::jsonb
                 WHERE id = $2 AND state IN ('dispatching','running')`,
                [
                    JSON.stringify({
                        provider: engine === 'cf_flux' ? 'cloudflare' : 'gemini',
                        kind_key: 'image_clone',
                        engine,
                    }),
                    id,
                ]
            );
            await notifyDone(id, user_id, kind, 1).catch(() => {});
            return;
        }
        // Default: Fal PuLID
        const submit = await fal.submitImageJob({ modelImageUrl, config: conf, note });
        externalId = submit.requestId;
        provider = 'fal';
        kindKey = 'image';
    } else {
        // ===== VIDEO — Kling only (Veo bỏ 10/05/2026) =====
        // with_clip: native multi-image2video (face + clip cover, 1 API call).
        // auto_scene: image2video (model + prompt).
        const klingMultiImage = genMode === 'with_clip' && !!sceneImageUrl;

        {
            // ===== KLING =====
            if (klingMultiImage) {
                // Native face-swap workflow: model face + clip cover trong 1
                // multi-image2video request. Kling tự handle identity preservation,
                // KHÔNG cần Gemini compose step → tiết kiệm 8 cr + ~20-30s latency.
                const submit = await kling.submitMultiImage2Video({
                    imageUrls: [modelImageUrl, sceneImageUrl],
                    config: conf,
                    note,
                });
                externalId = submit.taskId;
                provider = 'kling';
                kindKey = 'multi-image2video';
            } else {
                // Kling image2video — auto_scene mode hoặc với_clip không có scene.
                const submit = await kling.submitImage2Video({
                    modelImageUrl,
                    config: conf,
                    note,
                });
                externalId = submit.taskId;
                provider = 'kling';
                kindKey = 'image2video';
            }
        }
    }

    // Atomic flip dispatching → running. Guard `state='dispatching'` chống race
    // (vd row đã bị recoverStuckDispatching reset về pending rồi pick lại).
    const flip = await pool.query(
        `UPDATE aikol_generations
         SET state = 'running', external_id = $1,
             config = COALESCE(config, '{}'::jsonb) || $2::jsonb
         WHERE id = $3 AND state = 'dispatching'
         RETURNING id`,
        [
            externalId,
            JSON.stringify({
                provider,
                kind_key: kindKey,
                engine,
                composite_key: compositeKey,
            }),
            id,
        ]
    );
    if (!flip.rows[0]) {
        // State đã bị thay đổi bởi process khác (vd recover, hoặc concurrent
        // markError). Job đã submit lên provider nhưng row bị hijack → log
        // warn, nhưng không refund (vì có thể run khác đã refund).
        console.warn(
            `[aikol-worker] ${id.slice(0, 8)} dispatching→running flip hijacked. Provider job ${externalId} có thể leak.`
        );
    }
}

async function pickPending() {
    // Reserve atomically — flip state to 'dispatching' transient marker. Sau khi
    // submit thành công sẽ flip 'running'. Nếu process restart giữa chừng,
    // recoverDispatching() sẽ reset về 'pending' (sau timeout) để retry, hoặc
    // mark error nếu vượt quá retry limit. Giữ guard `state='pending'` trong CTE
    // để chống double-flip race khi 2 process tick cùng lúc.
    const { rows } = await pool.query(
        `WITH next AS (
             SELECT id FROM aikol_generations
             WHERE state = 'pending'
             ORDER BY created_at ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED
         )
         UPDATE aikol_generations g
         SET state = 'dispatching', started_at = NOW()
         FROM next
         WHERE g.id = next.id AND g.state = 'pending'
         RETURNING g.id, g.user_id, g.kind, g.model_id, g.clip_id, g.config, g.cost_credits`,
        [MAX_RUNNING]
    );
    return rows;
}

// Recovery: rows stuck ở 'dispatching' lâu hơn DISPATCH_TIMEOUT_MS (process
// restart giữa dispatch) → reset về 'pending' để re-dispatch. Chạy 1 lần
// mỗi tick.
const DISPATCH_TIMEOUT_MS = 90 * 1000;
async function recoverStuckDispatching() {
    const { rows } = await pool.query(
        `UPDATE aikol_generations
         SET state = 'pending'
         WHERE state = 'dispatching'
           AND started_at < NOW() - INTERVAL '${Math.floor(DISPATCH_TIMEOUT_MS / 1000)} seconds'
         RETURNING id`
    );
    if (rows.length) {
        console.warn(
            `[aikol-worker] recovered ${rows.length} stuck dispatching rows: ${rows.map((r) => r.id.slice(0, 8)).join(',')}`
        );
    }
}

// ---------- POLL (running → done|error) ----------
async function pollOne(row) {
    const { id, user_id, kind, external_id, cost_credits, started_at, config } = row;
    if (!external_id) {
        return markError(id, user_id, cost_credits, 'Missing external_id');
    }
    const conf = typeof config === 'string' ? JSON.parse(config) : config || {};
    const provider = conf.provider || (kind === 'image' ? 'fal' : 'kling');

    // Timeout guard. Veo bỏ — chỉ fal + kling.
    const startedAtMs = started_at ? new Date(started_at).getTime() : Date.now();
    const elapsed = Date.now() - startedAtMs;
    const cap = provider === 'fal' ? FAL_POLL_TIMEOUT_MS : KLING_POLL_TIMEOUT_MS;
    if (elapsed > cap) {
        return markError(id, user_id, cost_credits, `Provider ${provider} timeout (${cap}ms)`);
    }

    if (provider === 'fal') return pollFal(row);
    if (provider === 'veo') {
        // Legacy gen với provider='veo' từ trước commit này — mark error vì
        // service đã bỏ. Refund auto qua markError.
        return markError(
            id,
            user_id,
            cost_credits,
            'Veo service đã bỏ — vui lòng resubmit với engine=kling'
        );
    }
    return pollKling(row);
}

// Cleanup composite tmp file sau khi gen done. Read composite_key từ config
// (đã persist khi dispatch). Best-effort — failure không fail gen.
async function cleanupComposite(id, conf) {
    const compKey = conf?.composite_key;
    if (!compKey) return;
    try {
        await bunny.deleteObject(compKey);
        console.log(`[aikol-worker] ${id.slice(0, 8)} cleanup composite ${compKey}`);
    } catch (e) {
        console.warn(
            `[aikol-worker] ${id.slice(0, 8)} cleanup composite ${compKey} failed:`,
            e.message
        );
    }
}

// pollVeo bỏ — Veo service đã removed. Legacy gen với provider='veo' được
// mark error trong pollOne với refund auto.

async function pollFal(row) {
    const { id, user_id, external_id, cost_credits, kind, config } = row;
    const conf = typeof config === 'string' ? JSON.parse(config) : config || {};
    const status = await fal.getJobStatus(external_id);
    if (status.status === 'COMPLETED') {
        const result = await fal.getJobResult(external_id);
        const images = Array.isArray(result.images) ? result.images : [];
        if (images.length === 0) {
            await cleanupComposite(id, conf);
            return markError(id, user_id, cost_credits, 'Fal returned 0 images');
        }
        let saved = 0;
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (!img?.url) continue;
            try {
                const buffer = await fal.downloadToBuffer(img.url);
                const ext = (img.content_type || '').includes('png') ? 'png' : 'jpg';
                const key = `aikol/outputs/${id}-${i}.${ext}`;
                await bunny.uploadBuffer(buffer, key, img.content_type || 'image/jpeg');
                await pool.query(
                    `INSERT INTO aikol_outputs
                        (generation_id, user_id, variant_index, file_path, file_kind, file_size)
                     SELECT $1, $2, $3, $4, 'image', $5
                     WHERE NOT EXISTS (
                       SELECT 1 FROM aikol_outputs WHERE generation_id = $1 AND variant_index = $3
                     )`,
                    [id, user_id, i, key, buffer.length]
                );
                saved++;
            } catch (e) {
                console.warn(`[aikol-worker] image variant ${i} of ${id} failed:`, e.message);
            }
        }
        if (saved === 0) {
            await cleanupComposite(id, conf);
            return markError(id, user_id, cost_credits, 'All image variants failed to download');
        }
        await pool.query(
            `UPDATE aikol_generations SET state = 'done', error = NULL, finished_at = NOW()
             WHERE id = $1 AND state IN ('running','dispatching')`,
            [id]
        );
        await cleanupComposite(id, conf);
        notifyDone(id, user_id, kind, saved);
    } else if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
        // still running — no-op
    } else {
        // FAILED or unknown
        await cleanupComposite(id, conf);
        return markError(id, user_id, cost_credits, `Fal status: ${status.status}`);
    }
}

async function pollKling(row) {
    const { id, user_id, external_id, cost_credits, config, kind } = row;
    const conf = typeof config === 'string' ? JSON.parse(config) : config || {};
    const kindKey = conf.kind_key || 'image2video';
    const status = await kling.getJobStatus(external_id, kindKey);
    if (status.status === 'succeed') {
        const videos = status.videos || [];
        if (videos.length === 0) {
            await cleanupComposite(id, conf);
            return markError(id, user_id, cost_credits, 'Kling returned 0 videos');
        }
        let saved = 0;
        for (let i = 0; i < videos.length; i++) {
            const v = videos[i];
            if (!v?.url) continue;
            try {
                const buffer = await kling.downloadToBuffer(v.url);
                const key = `aikol/outputs/${id}-${i}.mp4`;
                await bunny.uploadBuffer(buffer, key, 'video/mp4');
                await pool.query(
                    `INSERT INTO aikol_outputs
                        (generation_id, user_id, variant_index, file_path, file_kind, file_size)
                     SELECT $1, $2, $3, $4, 'video', $5
                     WHERE NOT EXISTS (
                       SELECT 1 FROM aikol_outputs WHERE generation_id = $1 AND variant_index = $3
                     )`,
                    [id, user_id, i, key, buffer.length]
                );
                saved++;
            } catch (e) {
                console.warn(`[aikol-worker] video variant ${i} of ${id} failed:`, e.message);
            }
        }
        if (saved === 0) {
            await cleanupComposite(id, conf);
            return markError(id, user_id, cost_credits, 'All video variants failed to download');
        }
        await pool.query(
            `UPDATE aikol_generations SET state = 'done', error = NULL, finished_at = NOW()
             WHERE id = $1 AND state IN ('running','dispatching')`,
            [id]
        );
        await cleanupComposite(id, conf);
        notifyDone(id, user_id, kind, saved);
    } else if (status.status === 'submitted' || status.status === 'processing') {
        // still running — no-op
    } else {
        await cleanupComposite(id, conf);
        return markError(
            id,
            user_id,
            cost_credits,
            `Kling status: ${status.status}${status.message ? ' — ' + status.message : ''}`
        );
    }
}

// ---------- TICK ORCHESTRATOR ----------
let _ticking = false;
async function tick() {
    if (_ticking) return; // re-entrancy guard
    _ticking = true;
    try {
        // 0. Recover dispatching rows stuck quá DISPATCH_TIMEOUT_MS (vd process
        // restart giữa Gemini compose 30s+) → reset về 'pending' để retry.
        await recoverStuckDispatching().catch((e) =>
            console.warn('[aikol-worker] recover stuck failed:', e.message)
        );

        // 1. Dispatch new pending jobs.
        const pending = await pickPending();
        for (const row of pending) {
            if (inFlight.has(row.id)) continue;
            inFlight.add(row.id);
            dispatchOne(row)
                .catch((e) => {
                    console.warn(`[aikol-worker] dispatch ${row.id} failed:`, e.message);
                    return markError(row.id, row.user_id, row.cost_credits, e.message);
                })
                .finally(() => inFlight.delete(row.id));
        }

        // 2. Poll running jobs.
        const { rows: running } = await pool.query(
            `SELECT id, user_id, kind, external_id, cost_credits, started_at, config
             FROM aikol_generations
             WHERE state = 'running'
             ORDER BY started_at ASC NULLS FIRST
             LIMIT $1`,
            [MAX_RUNNING * 2]
        );
        for (const row of running) {
            if (inFlight.has(row.id)) continue;
            inFlight.add(row.id);
            pollOne(row)
                .catch((e) => {
                    console.warn(`[aikol-worker] poll ${row.id} failed:`, e.message);
                })
                .finally(() => inFlight.delete(row.id));
        }
    } catch (e) {
        console.error('[aikol-worker] tick error:', e.message);
    } finally {
        _ticking = false;
    }
}

function start() {
    logBoot();
    if (intervalHandle) return;
    // Skip in test/CI environments unless explicitly enabled.
    if (process.env.AIKOL_WORKER_DISABLED === '1') {
        console.log('[aikol-worker] disabled via AIKOL_WORKER_DISABLED=1');
        return;
    }
    intervalHandle = setInterval(() => {
        tick().catch((e) => console.error('[aikol-worker] interval tick failed:', e.message));
    }, TICK_INTERVAL_MS);
    intervalHandle.unref?.();
    // Initial kick (next event-loop turn so dependents finish wiring).
    setImmediate(() => tick().catch(() => {}));
}

function stop() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}

module.exports = { tick, start, stop };
