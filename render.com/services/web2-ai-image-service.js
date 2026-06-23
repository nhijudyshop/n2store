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

const { keysOf, runWithKey } = require('./web2-ai-service');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_PROMPT = 1500;

// ───────────────────────── Pollinations ─────────────────────────
const POLLINATIONS_MODELS = [
    { id: 'flux', label: 'Flux (đẹp, mặc định)' },
    // 2026-06-24 (user request): bỏ Turbo — chỉ giữ Flux.
];
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt/';
// referrer KHÔNG bí mật (browser tự gửi) → nâng tier nhẹ cho path no-token. Override env.
const POLLINATIONS_REFERRER = (process.env.WEB2_POLLINATIONS_REFERRER || 'nhijudy.store').trim();
const POL_COOLDOWN_MS = 60 * 1000;
const POL_FETCH_TIMEOUT_MS = 45 * 1000; // cắt token treo → xoay token kế (chống kẹt)

// Nhiều token Seed free (auth.pollinations.ai) → xoay tua cộng dồn quota + bỏ giới hạn
// anonymous (1 req/15s). Bearer token PHẢI ở server (docs: "Never put Bearer tokens in
// frontend code") → path có token PROXY ảnh trả dataUrl (token không lộ browser).
// WEB2_POLLINATIONS_TOKEN{1..10} + legacy đơn. Mirror _cfAccounts().
function _pollinationsTokens() {
    const out = [];
    const push = (t) => {
        t = (t || '').trim();
        if (t && !out.includes(t)) out.push(t);
    };
    for (let i = 1; i <= 10; i++) push(process.env['WEB2_POLLINATIONS_TOKEN' + i]);
    push(process.env.WEB2_POLLINATIONS_TOKEN);
    push(process.env.POLLINATIONS_TOKEN);
    return out;
}
let _polRr = 0;
const _polCooldown = new Map(); // token → ts hết cooldown (401/403/429)

function _pollinationsUrl(prompt, { width, height, model, seed }) {
    const w = clampInt(width, 256, 1536, 1024);
    const h = clampInt(height, 256, 1536, 1024);
    const mdl = POLLINATIONS_MODELS.some((m) => m.id === model) ? model : 'flux';
    const s = Number.isFinite(+seed) ? +seed : Math.floor((Date.now() % 1e9) + w + h);
    return (
        POLLINATIONS_BASE +
        encodeURIComponent(prompt) +
        `?width=${w}&height=${h}&model=${mdl}&seed=${s}&nologo=true&safe=false`
    );
}

async function _pollinations(prompt, opts) {
    const tokens = _pollinationsTokens();
    const baseUrl = _pollinationsUrl(prompt, opts);
    const anonUrl = () => ({
        provider: 'pollinations',
        url: baseUrl + `&referrer=${encodeURIComponent(POLLINATIONS_REFERRER)}`,
    });
    // KHÔNG token → trả URL cho browser tự load (rẻ, không proxy) + referrer.
    if (!tokens.length) return anonUrl();

    // Có token → proxy server-side với Bearer (giấu token) + xoay tua + cooldown.
    const now = Date.now();
    const ready = tokens.filter((t) => (_polCooldown.get(t) || 0) <= now);
    const pool = ready.length ? ready : tokens; // tất cả đang cooldown → vẫn thử lại hết
    const start = _polRr % pool.length;
    _polRr = (_polRr + 1) % pool.length;
    const ordered = pool.map((_, i) => pool[(start + i) % pool.length]);
    let lastErr = '';
    for (const token of ordered) {
        try {
            // Timeout per-token: token rate-limited/treo trả chậm → cắt 45s rồi xoay
            // token kế, tránh treo CẢ request (bug "tạo 1 hình rồi kẹt, phải F5").
            const r = await fetch(baseUrl, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(POL_FETCH_TIMEOUT_MS),
            });
            const ct = r.headers.get('content-type') || '';
            if (!r.ok) {
                if (r.status === 401 || r.status === 403 || r.status === 429)
                    _polCooldown.set(token, Date.now() + POL_COOLDOWN_MS);
                lastErr = `HTTP ${r.status}`;
                continue;
            }
            if (ct.startsWith('image/')) {
                const buf = Buffer.from(await r.arrayBuffer());
                const mime = ct.split(';')[0] || 'image/jpeg';
                return {
                    provider: 'pollinations',
                    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
                };
            }
            lastErr = 'phản hồi không phải ảnh'; // đôi khi trả text lỗi
            continue;
        } catch (e) {
            lastErr = e.message || String(e);
            continue;
        }
    }
    // Hết token khoẻ → fallback anonymous URL (vẫn có ảnh, tier thấp hơn).
    console.warn(`[web2-ai-image] pollinations rotation exhausted: ${lastErr} → fallback URL`);
    return anonUrl();
}

// ───────────────────────── Cloudflare Workers AI ─────────────────────────
const CF_MODELS = [
    { id: '@cf/black-forest-labs/flux-1-schnell', label: 'Flux-1 Schnell (mặc định)' },
    { id: '@cf/bytedance/stable-diffusion-xl-lightning', label: 'SDXL Lightning' },
];
// Nhiều account Cloudflare free (mỗi cái 10k neuron/ngày) → XOAY để cộng dồn quota.
// Cặp WEB2_CLOUDFLARE_ACCOUNT_ID{i} + WEB2_CLOUDFLARE_WORKERS_AI_TOKEN{i} (i=1..10) + legacy đơn.
function _cfAccounts() {
    const out = [];
    const push = (acc, tok) => {
        acc = (acc || '').trim();
        tok = (tok || '').trim();
        if (acc && tok && !out.some((a) => a.accountId === acc))
            out.push({ accountId: acc, token: tok });
    };
    for (let i = 1; i <= 10; i++) {
        push(
            process.env['WEB2_CLOUDFLARE_ACCOUNT_ID' + i],
            process.env['WEB2_CLOUDFLARE_WORKERS_AI_TOKEN' + i]
        );
    }
    push(process.env.WEB2_CLOUDFLARE_ACCOUNT_ID, process.env.WEB2_CLOUDFLARE_WORKERS_AI_TOKEN);
    push(
        process.env.CLOUDFLARE_ACCOUNT_ID,
        process.env.CLOUDFLARE_WORKERS_AI_TOKEN || process.env.CLOUDFLARE_API_TOKEN
    );
    return out;
}
let _cfRr = 0;
async function _cloudflare(prompt, { model, width, height }) {
    const accounts = _cfAccounts();
    if (!accounts.length) {
        const e = new Error('Cloudflare Workers AI chưa cấu hình (ACCOUNT_ID + token)');
        e._noKey = true;
        throw e;
    }
    const mdl = CF_MODELS.some((m) => m.id === model) ? model : CF_MODELS[0].id;
    // round-robin: rải tải giữa các account free.
    const start = _cfRr % accounts.length;
    _cfRr = (_cfRr + 1) % accounts.length;
    const ordered = accounts.map((_, i) => accounts[(start + i) % accounts.length]);
    let lastErr = '';
    for (const cred of ordered) {
        const r = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${mdl}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${cred.token}`,
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
            lastErr = String(detail).slice(0, 200);
            // auth/quota/rate → thử account kế; lỗi khác cũng thử (ảnh không phải mutation nguy hiểm).
            continue;
        }
        if (ct.includes('application/json')) {
            const j = await r.json();
            const b64 = j?.result?.image;
            if (b64) return { provider: 'cloudflare', dataUrl: `data:image/jpeg;base64,${b64}` };
            lastErr = 'phản hồi không có ảnh';
            continue;
        }
        const buf = Buffer.from(await r.arrayBuffer());
        return {
            provider: 'cloudflare',
            dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
        };
    }
    throw new Error(`Cloudflare: ${lastErr || 'tất cả account đều lỗi/hết quota'}`);
}

// ───────────────────────── Gemini Nano Banana ─────────────────────────
const GEMINI_IMAGE_MODELS = [
    // 2026-06-24 (user request): Gemini Nano Banana chỉ giữ 1 model Nano Banana.
    { id: 'gemini-2.5-flash-image', label: 'Nano Banana' },
];
async function _gemini(prompt, { model, image, images }) {
    if (!keysOf('gemini').length) {
        const e = new Error('Gemini chưa cấu hình key (GEMINI_API_KEY)');
        e._noKey = true;
        throw e;
    }
    const mdl = GEMINI_IMAGE_MODELS.some((m) => m.id === model) ? model : GEMINI_IMAGE_MODELS[0].id;
    const parts = [{ text: prompt }];
    // Đa ảnh (GHÉP ĐỒ / THỬ ĐỒ): images[] = [ảnh người, ảnh quần áo 1, 2…]. Gemini
    // 2.5 Flash Image nhận NHIỀU input part → ghép theo prompt. Back-compat 1 ảnh.
    const MAX_IMAGES = 6;
    const imgList = (Array.isArray(images) && images.length ? images : image ? [image] : []).slice(
        0,
        MAX_IMAGES
    );
    for (const img of imgList) {
        if (!img) continue;
        const m = /^data:([^;]+);base64,(.*)$/.exec(String(img));
        const mime = m ? m[1] : 'image/png';
        const data = m ? m[2] : String(img).replace(/^data:[^,]*,/, '');
        if (data) parts.push({ inlineData: { mimeType: mime, data } });
    }
    // Xoay TOÀN BỘ pool key Gemini + cooldown CHUNG (qua runWithKey) — 1 key 401/429/503 thì
    // thử key kế thay vì fail oan dù pool còn key tốt.
    return runWithKey('gemini', async (key) => {
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
            const err = new Error(`Gemini: ${String(detail).slice(0, 200)}`);
            const d = String(detail);
            if (r.status === 401 || r.status === 403) err._auth = true;
            if (r.status === 429 || r.status === 402) err._quota = true;
            if (r.status === 502 || r.status === 503 || r.status === 529) err._overload = true;
            // Gemini trả HTTP 400 cho key hỏng → coi như auth để xoay key kế.
            if (
                /api[\s_-]?key (not found|not valid|invalid)|API_KEY_INVALID|invalid api key/i.test(
                    d
                )
            )
                err._auth = true;
            if (
                /quota|rate.?limit|exhausted|resource has been exhausted|too many requests/i.test(d)
            )
                err._quota = true;
            throw err;
        }
        const j = await r.json();
        const out = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
        if (!out) throw new Error('Gemini: phản hồi không có ảnh (có thể bị chặn nội dung)');
        const mime = out.inlineData.mimeType || 'image/png';
        return { provider: 'gemini', dataUrl: `data:${mime};base64,${out.inlineData.data}` };
    });
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
                label: `Pollinations${_pollinationsTokens().length ? ` (${_pollinationsTokens().length} token)` : ''}`,
                configured: true, // luôn sẵn (no-token = anonymous + referrer)
                tokens: _pollinationsTokens().length,
                models: POLLINATIONS_MODELS,
                editsImage: false,
            },
            // 2026-06-24 (user request): ẨN Cloudflare Workers AI khỏi danh sách nguồn.
            // (Hàm _cloudflare + CF_MODELS giữ lại — chỉ không liệt kê trong UI.)
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
