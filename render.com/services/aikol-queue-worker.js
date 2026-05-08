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
const veo = require('./aikol-veo-service');
const telegram = require('./aikol-telegram-service');

const TICK_INTERVAL_MS = parseInt(process.env.AIKOL_WORKER_INTERVAL_MS, 10) || 8000;
const MAX_RUNNING = parseInt(process.env.AIKOL_WORKER_MAX_RUNNING, 10) || 6;
const FAL_POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const KLING_POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
const VEO_POLL_TIMEOUT_MS = 20 * 60 * 1000; // 20 min (Veo can take longer)

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
    // image: fal_pulid (default) | gemini_3_1
    // video: kling (default) | veo_3_1
    const engine = String(conf.engine || (kind === 'image' ? 'fal_pulid' : 'kling')).toLowerCase();

    let externalId, provider, kindKey;
    // Khai báo function-scope để final UPDATE outside if/else block đọc được.
    let compositeKey = null;

    // gen_mode: 'with_clip' (default) compose model vào scene của clip /
    // 'auto_scene' AI tạo scene mới từ prompt. Nếu không có clip → ép auto_scene.
    const genMode = sceneImageUrl
        ? String(conf.gen_mode || 'with_clip').toLowerCase()
        : 'auto_scene';

    // Build engine-agnostic directive.
    // - with_clip + sceneImageUrl: service tự build "Replace person in image2"
    //   directive → pass `note` để Gemini biết tweak gì thêm.
    // - auto_scene: build directive yêu cầu Gemini/Veo đặt model vào scene mới
    //   từ prompt (note bắt buộc, frontend đã validate).
    function buildAutoSceneDirective(forVideo) {
        const sceneDesc =
            (note || '').trim() ||
            'photorealistic studio portrait, soft natural lighting, neutral background';
        const verb = forVideo ? 'Animate the person' : 'Place the person';
        return [
            `${verb} from this reference image into the following new scene:`,
            sceneDesc + '.',
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

    // ===== IMAGE =====
    if (kind === 'image') {
        if (engine === 'gemini_3_1') {
            const imagePrompt = genMode === 'auto_scene' ? buildAutoSceneDirective(false) : note;
            // Synchronous — generate, upload, save output, mark done all in one shot
            const result = await geminiClone.cloneImage({
                modelImageUrl,
                sceneImageUrl: genMode === 'auto_scene' ? null : sceneImageUrl,
                prompt: imagePrompt,
            });
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
                [JSON.stringify({ provider: 'gemini', kind_key: 'image_clone', engine }), id]
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
        // ===== VIDEO =====
        // Kling public JWT API KHÔNG có vid2vid endpoint (verified 404). Cả Veo
        // + Kling chỉ làm image2video. Để vẫn đạt được "ghép model vào clip" cho
        // video, dùng pipeline 2-bước khi gen_mode=with_clip + clip cover có sẵn:
        //   1) Compose: Gemini 3.1 ghép modelImage + clipCover → composite image
        //      (model trong scene clip — verified hoạt động cho image gen).
        //   2) Animate: Veo/Kling image2video lấy composite làm input → output là
        //      MP4 model trong scene clip + motion.
        // Pipeline thêm ~20-30s latency Gemini compose nhưng kết quả gần với
        // "face-swap video" nhất có thể qua public API.
        let animationSourceUrl = modelImageUrl;
        const shouldCompose = genMode === 'with_clip' && !!sceneImageUrl;
        if (shouldCompose) {
            // Compose fail KHÔNG silent fallback — nếu Gemini block hoặc lỗi,
            // user mong đợi "model trong scene clip" mà output chỉ là model gốc
            // → identity-match bị phá hỏng và user mất credits không biết tại sao.
            // Throw để worker mark error + refund + surface lý do rõ ràng.
            const composite = await geminiClone
                .cloneImage({
                    modelImageUrl,
                    sceneImageUrl,
                    prompt: note,
                })
                .catch((e) => {
                    throw new Error(
                        `Compose failed (Gemini): ${e.message}. Identity-match pipeline yêu cầu compose step thành công — không thể fallback.`
                    );
                });
            const compExt = composite.mimeType.includes('png') ? 'png' : 'jpg';
            compositeKey = `aikol/tmp/${id}-composite.${compExt}`;
            await bunny.uploadBuffer(composite.buffer, compositeKey, composite.mimeType);
            animationSourceUrl = bunny.cdnUrl(compositeKey);
            console.log(
                `[aikol-worker] ${id.slice(0, 8)} with_clip composite ready → ${compositeKey}`
            );
        }

        if (engine === 'veo_3_1') {
            // Gemini Veo durationSeconds buckets: "4" | "6" | "8". Pass raw value
            // — service quantizes (1080p/4k always force "8").
            const durationSeconds = Math.max(
                4,
                Math.min(parseInt(conf.duration_seconds, 10) || 8, 8)
            );
            // Khi đã compose: directive yêu cầu animate composite (giữ scene+identity).
            // Khi auto_scene: directive yêu cầu place model vào scene mới từ note.
            // Khi with_clip nhưng compose fail: fallback note như cũ.
            // Compose case: input đã là model-trong-scene-clip (Gemini composed).
            // Veo cần GIỮ NGUYÊN face, chỉ thêm motion → identity-lock prompt
            // mạnh để tránh face drift qua frames.
            // Veo image2video deepfake-grade animate. Input là composite model+
            // clip-scene từ Gemini; Veo phải animate KHÔNG drift face qua frames.
            const composeAnimatePrompt = [
                '# TASK',
                'Animate this static image into a 5-8 second vertical short-form clip',
                'with subtle, natural, TikTok-appropriate motion.',
                '',
                '# PRIORITY 1 — FACE LOCK (absolute)',
                'The face in the input image is the EXACT identity that must be preserved',
                'across every single frame. The viewer must recognize the same person',
                'beyond doubt from frame 1 to the last frame.',
                'DO NOT modify, redraw, smooth, beautify, idealize, age, or stylize:',
                '- Eye shape, eye color, eyelid fold',
                '- Eyebrow shape and color',
                '- Nose shape, tip, bridge, nostrils',
                '- Mouth, lip shape, lip line, lip color',
                '- Jawline, chin, cheekbones, face shape',
                '- Hairline, hair color, hair texture',
                '- Skin tone, freckles, moles, makeup',
                'No "AI face" effect. No symmetry correction. No glow. No airbrush.',
                '',
                '# PRIORITY 2 — ALLOWED MOTION (subtle, natural)',
                '- Head: gentle turns ≤10° in any direction',
                '- Eyes: 1-3 natural blinks, soft gaze shift',
                '- Brows: micro-expressions consistent with mood',
                '- Mouth: subtle smile shift or breath-related lip movement',
                '  (NO mouthing words — lip-sync not requested)',
                '- Body: chest/shoulder rise & fall from breathing',
                '- Posture: natural sway ≤5°',
                '- Hair: physics-based gentle sway',
                '',
                '# FORBIDDEN MOTION',
                '- Large head rotation (>15°) or full profile turn',
                '- Walking, running, jumping, dancing, or large gestures',
                '- Speaking with mouth wide open or rapid lip movement',
                '- Camera zoom, pan, tilt, dolly, or focus pull',
                '- Scene change, cut, or transition',
                '',
                '# SCENE CONTINUITY',
                'Keep IDENTICAL to the input image: background, props, environment,',
                'lighting direction & intensity, color temperature, camera angle,',
                'framing, focal length, color grade, saturation, contrast.',
                '',
                '# STYLE',
                'Cinematic 9:16 vertical, photorealistic, 24-30 fps natural motion blur,',
                'sharp focus on the face throughout, natural skin texture with pores',
                'visible. Indistinguishable from real footage.',
                (note || '').trim() ? `\n# ADDITIONAL DIRECTION\n${note.trim()}` : '',
            ]
                .filter(Boolean)
                .join(' ');
            const videoPrompt = shouldCompose
                ? composeAnimatePrompt
                : genMode === 'auto_scene'
                  ? buildAutoSceneDirective(true)
                  : // with_clip nhưng không có sceneImageUrl (edge case clip
                    // chưa download cover hoặc cover URL invalid). Vẫn cần
                    // identity-lock — wrap note vào auto_scene directive.
                    buildAutoSceneDirective(true);
            const submit = await veo.submitVideoJob({
                modelImageUrl: animationSourceUrl,
                sceneImageUrl: null,
                prompt: videoPrompt,
                durationSeconds,
                aspectRatio: conf.aspect_ratio || conf.image_size || '9:16',
                resolution: conf.resolution || '720p',
            });
            externalId = submit.operationName;
            provider = 'veo';
            kindKey = 'image2video';
        } else {
            // Kling image2video — dùng composite URL nếu compose ok.
            const submit = await kling.submitImage2Video({
                modelImageUrl: animationSourceUrl,
                config: conf,
                note,
            });
            externalId = submit.taskId;
            provider = 'kling';
            kindKey = 'image2video';
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

    // Timeout guard.
    const startedAtMs = started_at ? new Date(started_at).getTime() : Date.now();
    const elapsed = Date.now() - startedAtMs;
    const cap =
        provider === 'fal'
            ? FAL_POLL_TIMEOUT_MS
            : provider === 'veo'
              ? VEO_POLL_TIMEOUT_MS
              : KLING_POLL_TIMEOUT_MS;
    if (elapsed > cap) {
        return markError(id, user_id, cost_credits, `Provider ${provider} timeout (${cap}ms)`);
    }

    if (provider === 'fal') return pollFal(row);
    if (provider === 'veo') return pollVeo(row);
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

async function pollVeo(row) {
    const { id, user_id, external_id, cost_credits, kind, config } = row;
    const conf = typeof config === 'string' ? JSON.parse(config) : config || {};
    const status = await veo.getJobStatus(external_id);
    if (status.status === 'running') return;
    if (status.status === 'error') {
        await cleanupComposite(id, conf);
        return markError(id, user_id, cost_credits, `Veo: ${status.error}`);
    }
    if (status.status === 'done' && status.videoUri) {
        try {
            const { buffer, contentType } = await veo.downloadVideo(status.videoUri);
            const key = `aikol/outputs/${id}-0.mp4`;
            await bunny.uploadBuffer(buffer, key, contentType);
            await pool.query(
                `INSERT INTO aikol_outputs
                    (generation_id, user_id, variant_index, file_path, file_kind, file_size)
                 SELECT $1, $2, 0, $3, 'video', $4
                 WHERE NOT EXISTS (
                   SELECT 1 FROM aikol_outputs WHERE generation_id = $1 AND variant_index = 0
                 )`,
                [id, user_id, key, buffer.length]
            );
            await pool.query(
                `UPDATE aikol_generations SET state = 'done', error = NULL, finished_at = NOW()
                 WHERE id = $1 AND state IN ('running','dispatching')`,
                [id]
            );
            await cleanupComposite(id, conf);
            await notifyDone(id, user_id, kind, 1).catch(() => {});
        } catch (e) {
            await cleanupComposite(id, conf);
            return markError(id, user_id, cost_credits, `Veo download/save: ${e.message}`);
        }
    }
}

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
