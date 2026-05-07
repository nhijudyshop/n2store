#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// Sprint 3 smoke test — Fal.ai + Kling generation E2E.
//
// 1. GET /credits — wallet balance (auto-create + 30 free credits)
// 2. POST /generations { kind: image, model_id, clip_ids, config } — submits + atomically charges
// 3. GET /queue — confirm pending|running
// 4. Poll until job leaves queue (success or refund)
// 5. GET /outputs?kind=image — list saved outputs
// 6. (optional) repeat for kind=video with kling_mode=std, duration=5s
//
// Usage:
//   API=https://n2store-fallback.onrender.com node scripts/test-aikol-sprint3.js
// =====================================================

const API = (process.env.API || 'https://n2store-fallback.onrender.com').replace(/\/+$/, '');
const USER = process.env.AIKOL_TEST_USER || 'aikol-sprint3-test';
const RUN_VIDEO = process.env.SKIP_VIDEO !== '1';

const headers = {
    'X-User-Id': USER,
    'Content-Type': 'application/json',
    Accept: 'application/json',
};

async function call(method, path, body) {
    const res = await fetch(`${API}/api/aikol${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    return { status: res.status, data };
}

function log(...args) {
    console.log('[sprint3]', ...args);
}

async function main() {
    log(`API=${API} USER=${USER}`);

    // 0. Health
    const health = await call('GET', '/health');
    log('health:', health.status, JSON.stringify(health.data));
    if (health.status !== 200) throw new Error('health fail');

    // 1. Credits
    const credits = await call('GET', '/credits');
    log('credits:', credits.status, credits.data);
    if (credits.status !== 200) throw new Error('credits fail');

    // 2. Need a model. List models; if empty, abort with helpful message.
    const models = await call('GET', '/models');
    if (!models.data.models || models.data.models.length === 0) {
        log('!! No models for this user. Upload one first via /aikol-studio/models.html');
        log('Set AIKOL_TEST_USER to an existing user that has a model.');
        process.exit(2);
    }
    const modelId = models.data.models[0].id;
    log(`using model ${modelId}: ${models.data.models[0].name}`);

    // 3. Use first clip if any, else generate from model alone
    const clips = await call('GET', '/clips?limit=10');
    const firstClip = clips.data.clips && clips.data.clips[0];
    const clipIds = firstClip ? [firstClip.id] : [];
    log(`clips available: ${clips.data.clips?.length || 0}; using:`, clipIds);

    // 4. Submit IMAGE generation
    log('submitting IMAGE gen (1 variation)…');
    const imageGen = await call('POST', '/generations', {
        kind: 'image',
        model_id: modelId,
        clip_ids: clipIds,
        config: {
            variations: 1,
            similarity: 80,
            creativity: 40,
            keep_pose: true,
            keep_lighting: true,
            image_size: '9:16',
            shot_type: 'match_clip',
            scene_mode: 'match',
        },
    });
    log('image gen response:', imageGen.status, imageGen.data);
    if (imageGen.status !== 200) {
        log('!! image submit failed — abort');
        process.exit(1);
    }
    const imageGenId = imageGen.data.generation_ids[0];

    // 5. Poll queue until done
    log(`polling /generations/${imageGenId} every 8s (up to 5 min)…`);
    const start = Date.now();
    let finalState = null;
    while (Date.now() - start < 5 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 8000));
        const detail = await call('GET', `/generations/${imageGenId}`);
        const s = detail.data.state;
        const out = detail.data.outputs?.length || 0;
        log(`  state=${s} outputs=${out} ext=${detail.data.external_id || '-'}`);
        if (s === 'done' || s === 'error') {
            finalState = detail.data;
            break;
        }
    }
    if (!finalState) {
        log('!! image gen timed out');
        process.exit(1);
    }
    log(`image gen final: ${finalState.state}`);
    if (finalState.state === 'done') {
        log(`  ${finalState.outputs.length} outputs:`);
        finalState.outputs.forEach((o) => log(`    - ${o.file_kind} ${o.file_url}`));
    } else {
        log(`  error: ${finalState.error}`);
    }

    if (!RUN_VIDEO) {
        log('SKIP_VIDEO=1, exiting after image test');
        return;
    }

    // 6. VIDEO test (5s std = 40 credits)
    log('submitting VIDEO gen (std, 5s)…');
    const videoGen = await call('POST', '/generations', {
        kind: 'video',
        model_id: modelId,
        clip_ids: clipIds,
        config: {
            similarity: 80,
            creativity: 40,
            keep_pose: true,
            kling_mode: 'std',
            duration_seconds: 5,
            scene_mode: 'match',
        },
    });
    log('video gen response:', videoGen.status, videoGen.data);
    if (videoGen.status === 402) {
        log('  insufficient credits — image test consumed budget. Exit non-fatal.');
        return;
    }
    if (videoGen.status !== 200) {
        log('!! video submit failed');
        process.exit(1);
    }
    const videoGenId = videoGen.data.generation_ids[0];
    log(`polling /generations/${videoGenId} every 15s (up to 12 min)…`);
    const vstart = Date.now();
    let vfinal = null;
    while (Date.now() - vstart < 12 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 15000));
        const detail = await call('GET', `/generations/${videoGenId}`);
        const s = detail.data.state;
        log(`  state=${s} ext=${detail.data.external_id || '-'}`);
        if (s === 'done' || s === 'error') {
            vfinal = detail.data;
            break;
        }
    }
    if (!vfinal) {
        log('!! video gen timed out (Kling may take longer)');
        return;
    }
    log(`video gen final: ${vfinal.state}`);
    if (vfinal.state === 'done') {
        vfinal.outputs.forEach((o) => log(`    - ${o.file_kind} ${o.file_url}`));
    } else {
        log(`  error: ${vfinal.error}`);
    }
}

main().catch((e) => {
    console.error('[sprint3] FATAL', e);
    process.exit(1);
});
