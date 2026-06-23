// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Trợ lý AI: TẠO ẢNH free (nhiều nguồn để xoay). Server-side.
 *
 * Nguồn free (đúng tinh thần "group AI free"):
 *   • pollinations — FREE 100%, KHÔNG cần key. Trả URL ảnh (browser tự load). Số 1.
 *   • cloudflare   — Workers AI (Flux-1-schnell / SDXL-Lightning), free ~10k neurons/ngày.
 *                    Env CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_WORKERS_AI_TOKEN (|CLOUDFLARE_API_TOKEN).
 *   • gemini       — Nano Banana (gemini-2.5-flash-image), dùng CHUNG key GEMINI_API_KEY*.
 *                    Tốt cho SỬA/GHÉP ảnh theo câu lệnh (nhận input image base64).
 *
 * generate({prompt, provider, model, width, height, image}) → {provider, url} | {provider, dataUrl}
 */
'use strict';

const { keysOf } = require('./web2-ai-service');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_PROMPT = 1500;

// ───────────────────────── Pollinations (no key) ─────────────────────────
const POLLINATIONS_MODELS = [
    { id: 'flux', label: 'Flux (đẹp, mặc định)' },
    { id: 'turbo', label: 'Turbo (nhanh)' },
];
function _pollinations(prompt, { width, height, model, seed }) {
    const w = clampInt(width, 256, 1536, 1024);
    const h = clampInt(height, 256, 1536, 1024);
    const mdl = POLLINATIONS_MODELS.some((m) => m.id === model) ? model : 'flux';
    const s = Number.isFinite(+seed) ? +seed : Math.floor((Date.now() % 1e9) + w + h);
    const url =
        'https://image.pollinations.ai/prompt/' +
        encodeURIComponent(prompt) +
        `?width=${w}&height=${h}&model=${mdl}&seed=${s}&nologo=true&safe=false`;
    return { provider: 'pollinations', url };
}

// ───────────────────────── Cloudflare Workers AI ─────────────────────────
const CF_MODELS = [
    { id: '@cf/black-forest-labs/flux-1-schnell', label: 'Flux-1 Schnell (mặc định)' },
    { id: '@cf/bytedance/stable-diffusion-xl-lightning', label: 'SDXL Lightning' },
];
function _cfCreds() {
    const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const token = (
        process.env.CLOUDFLARE_WORKERS_AI_TOKEN ||
        process.env.CLOUDFLARE_API_TOKEN ||
        ''
    ).trim();
    return accountId && token ? { accountId, token } : null;
}
async function _cloudflare(prompt, { model, width, height }) {
    const creds = _cfCreds();
    if (!creds) {
        const e = new Error('Cloudflare Workers AI chưa cấu hình (ACCOUNT_ID + token)');
        e._noKey = true;
        throw e;
    }
    const mdl = CF_MODELS.some((m) => m.id === model) ? model : CF_MODELS[0].id;
    const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${mdl}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${creds.token}`,
            },
            body: JSON.stringify({
                prompt,
                width: clampInt(width, 256, 1536, 1024),
                height: clampInt(height, 256, 1536, 1024),
                steps: 4,
            }),
        }
    );
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
            const j = await r.json();
            detail = j?.errors?.[0]?.message || j?.messages?.[0]?.message || detail;
        } catch {}
        throw new Error(`Cloudflare: ${String(detail).slice(0, 200)}`);
    }
    // flux-1-schnell → JSON {result:{image: base64}}. SDXL → binary PNG.
    if (ct.includes('application/json')) {
        const j = await r.json();
        const b64 = j?.result?.image;
        if (!b64) throw new Error('Cloudflare: phản hồi không có ảnh');
        return { provider: 'cloudflare', dataUrl: `data:image/jpeg;base64,${b64}` };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { provider: 'cloudflare', dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
}

// ───────────────────────── Gemini Nano Banana ─────────────────────────
const GEMINI_IMAGE_MODELS = [
    { id: 'gemini-2.5-flash-image', label: 'Nano Banana (2.5 Flash Image)' },
    { id: 'gemini-2.0-flash-preview-image-generation', label: 'Gemini 2.0 Flash Image' },
];
let _gemRr = 0;
function _gemKey() {
    const keys = keysOf('gemini');
    if (!keys.length) return null;
    const k = keys[_gemRr % keys.length];
    _gemRr = (_gemRr + 1) % keys.length;
    return k;
}
async function _gemini(prompt, { model, image }) {
    const key = _gemKey();
    if (!key) {
        const e = new Error('Gemini chưa cấu hình key (GEMINI_API_KEY)');
        e._noKey = true;
        throw e;
    }
    const mdl = GEMINI_IMAGE_MODELS.some((m) => m.id === model) ? model : GEMINI_IMAGE_MODELS[0].id;
    const parts = [{ text: prompt }];
    if (image) {
        // image: dataURL hoặc base64 thuần → đính kèm để SỬA/GHÉP.
        const m = /^data:([^;]+);base64,(.*)$/.exec(String(image));
        const mime = m ? m[1] : 'image/png';
        const data = m ? m[2] : String(image).replace(/^data:[^,]*,/, '');
        parts.push({ inlineData: { mimeType: mime, data } });
    }
    const r = await fetch(`${GEMINI_BASE}/models/${mdl}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
    });
    if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
            const j = await r.json();
            detail = j?.error?.message || detail;
        } catch {}
        throw new Error(`Gemini: ${String(detail).slice(0, 200)}`);
    }
    const j = await r.json();
    const out = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!out) throw new Error('Gemini: phản hồi không có ảnh (có thể bị chặn nội dung)');
    const mime = out.inlineData.mimeType || 'image/png';
    return { provider: 'gemini', dataUrl: `data:${mime};base64,${out.inlineData.data}` };
}

// ───────────────────────── Public ─────────────────────────
function clampInt(v, min, max, dflt) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
}

async function generate(opts = {}) {
    const prompt = String(opts.prompt || '')
        .trim()
        .slice(0, MAX_PROMPT);
    if (!prompt) throw new Error('Thiếu mô tả ảnh');
    const provider = opts.provider || 'pollinations';
    if (provider === 'cloudflare') return _cloudflare(prompt, opts);
    if (provider === 'gemini') return _gemini(prompt, opts);
    return _pollinations(prompt, opts);
}

function status() {
    return {
        providers: [
            {
                id: 'pollinations',
                label: 'Pollinations (free, no-key)',
                configured: true,
                models: POLLINATIONS_MODELS,
                editsImage: false,
            },
            {
                id: 'cloudflare',
                label: 'Cloudflare Workers AI',
                configured: !!_cfCreds(),
                models: CF_MODELS,
                editsImage: false,
            },
            {
                id: 'gemini',
                label: 'Gemini Nano Banana',
                configured: keysOf('gemini').length > 0,
                models: GEMINI_IMAGE_MODELS,
                editsImage: true, // nhận input image để sửa/ghép
            },
        ],
        defaultProvider: 'pollinations',
    };
}

function configured() {
    return true; // pollinations luôn sẵn (no-key)
}

module.exports = { generate, status, configured };
