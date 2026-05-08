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

    let clipVideoUrl = null;
    if (clip_id) {
        const clipRow = await pool.query(
            `SELECT file_path, download_status FROM aikol_clips WHERE id = $1`,
            [clip_id]
        );
        if (clipRow.rows[0]?.file_path && clipRow.rows[0].download_status === 'done') {
            clipVideoUrl = bunny.cdnUrl(clipRow.rows[0].file_path);
        }
    }

    // Engine selection — config.engine overrides default per kind.
    // image: fal_pulid (default) | gemini_3_1
    // video: kling (default) | veo_3_1
    const engine = String(conf.engine || (kind === 'image' ? 'fal_pulid' : 'kling')).toLowerCase();

    // Resolve scene image URL (clip cover) for engines that accept it
    let sceneImageUrl = null;
    if (clip_id) {
        const c = await pool.query(`SELECT cover_url FROM aikol_clips WHERE id = $1`, [clip_id]);
        sceneImageUrl = c.rows[0]?.cover_url || null;
    }

    let externalId, provider, kindKey;

    // ===== IMAGE =====
    if (kind === 'image') {
        if (engine === 'gemini_3_1') {
            // Synchronous — generate, upload, save output, mark done all in one shot
            const result = await geminiClone.cloneImage({
                modelImageUrl,
                sceneImageUrl,
                prompt: note,
            });
            const ext = result.mimeType.includes('png') ? 'png' : 'jpg';
            const key = `aikol/outputs/${id}-0.${ext}`;
            await bunny.uploadBuffer(result.buffer, key, result.mimeType);
            await pool.query(
                `INSERT INTO aikol_outputs
                    (generation_id, user_id, variant_index, file_path, file_kind, file_size)
                 VALUES ($1, $2, 0, $3, 'image', $4)`,
                [id, user_id, key, result.buffer.length]
            );
            await pool.query(
                `UPDATE aikol_generations
                 SET state = 'done', finished_at = NOW(), started_at = NOW(),
                     config = COALESCE(config, '{}'::jsonb) || $1::jsonb
                 WHERE id = $2`,
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
        if (engine === 'veo_3_1') {
            // Gemini Veo durationSeconds buckets: "4" | "6" | "8". Pass raw value
            // — service quantizes (1080p/4k always force "8").
            const durationSeconds = Math.max(
                4,
                Math.min(parseInt(conf.duration_seconds, 10) || 8, 8)
            );
            const submit = await veo.submitVideoJob({
                modelImageUrl,
                sceneImageUrl,
                prompt: note,
                durationSeconds,
                aspectRatio: conf.aspect_ratio || conf.image_size || '9:16',
                resolution: conf.resolution || '720p',
            });
            externalId = submit.operationName;
            provider = 'veo';
            kindKey = 'image2video';
        } else {
            // Kling: chỉ dùng image2video (video2video endpoint 404 trên Kling
            // public API; cần plan đặc biệt). Scene info bake vào prompt qua note.
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

    await pool.query(
        `UPDATE aikol_generations
         SET state = 'running', external_id = $1, started_at = NOW(),
             config = COALESCE(config, '{}'::jsonb) || $2::jsonb
         WHERE id = $3`,
        [externalId, JSON.stringify({ provider, kind_key: kindKey, engine }), id]
    );
}

async function pickPending() {
    // Reserve atomically — flip to a transient marker so concurrent ticks skip.
    const { rows } = await pool.query(
        `WITH next AS (
             SELECT id FROM aikol_generations
             WHERE state = 'pending'
             ORDER BY created_at ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED
         )
         UPDATE aikol_generations g
         SET started_at = NOW()
         FROM next
         WHERE g.id = next.id AND g.state = 'pending'
         RETURNING g.id, g.user_id, g.kind, g.model_id, g.clip_id, g.config, g.cost_credits`,
        [MAX_RUNNING]
    );
    return rows;
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

async function pollVeo(row) {
    const { id, user_id, external_id, cost_credits, kind } = row;
    const status = await veo.getJobStatus(external_id);
    if (status.status === 'running') return;
    if (status.status === 'error') {
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
                 VALUES ($1, $2, 0, $3, 'video', $4)`,
                [id, user_id, key, buffer.length]
            );
            await pool.query(
                `UPDATE aikol_generations SET state = 'done', finished_at = NOW() WHERE id = $1`,
                [id]
            );
            await notifyDone(id, user_id, kind, 1).catch(() => {});
        } catch (e) {
            return markError(id, user_id, cost_credits, `Veo download/save: ${e.message}`);
        }
    }
}

async function pollFal(row) {
    const { id, user_id, external_id, cost_credits, kind } = row;
    const status = await fal.getJobStatus(external_id);
    if (status.status === 'COMPLETED') {
        const result = await fal.getJobResult(external_id);
        const images = Array.isArray(result.images) ? result.images : [];
        if (images.length === 0) {
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
                     VALUES ($1, $2, $3, $4, 'image', $5)`,
                    [id, user_id, i, key, buffer.length]
                );
                saved++;
            } catch (e) {
                console.warn(`[aikol-worker] image variant ${i} of ${id} failed:`, e.message);
            }
        }
        if (saved === 0) {
            return markError(id, user_id, cost_credits, 'All image variants failed to download');
        }
        await pool.query(
            `UPDATE aikol_generations SET state = 'done', finished_at = NOW() WHERE id = $1`,
            [id]
        );
        notifyDone(id, user_id, kind, saved);
    } else if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
        // still running — no-op
    } else {
        // FAILED or unknown
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
                     VALUES ($1, $2, $3, $4, 'video', $5)`,
                    [id, user_id, i, key, buffer.length]
                );
                saved++;
            } catch (e) {
                console.warn(`[aikol-worker] video variant ${i} of ${id} failed:`, e.message);
            }
        }
        if (saved === 0) {
            return markError(id, user_id, cost_credits, 'All video variants failed to download');
        }
        await pool.query(
            `UPDATE aikol_generations SET state = 'done', finished_at = NOW() WHERE id = $1`,
            [id]
        );
        notifyDone(id, user_id, kind, saved);
    } else if (status.status === 'submitted' || status.status === 'processing') {
        // still running — no-op
    } else {
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
