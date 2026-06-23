// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Trợ lý AI (chat) DÙNG CHUNG. Server-side, giấu key, XOAY TUA NHIỀU KEY FREE.
 *
 * Vì sao module này: gom các provider LLM **free-tier hợp pháp** (KHÔNG dùng gpt4free/
 * reverse-engineer — hay chết, vi phạm ToS, lộ data) vào 1 chỗ + xoay nhiều key để
 * cộng dồn quota free, giống pattern web2-elevenlabs (xoay 3 key).
 *
 * Provider (OpenAI-compatible trừ Gemini):
 *   • groq        — Llama 3.3 70B + GPT-OSS-20B/120B (model mở của OpenAI = "giống ChatGPT")
 *   • gemini      — Gemini 2.5/2.0 Flash (định dạng generateContent riêng)
 *   • openrouter  — 1 endpoint, nhiều model `:free` (GPT-OSS, DeepSeek R1, Llama 4…)
 *
 * XOAY KEY: env `<PREFIX>1..10` (vd GROQ_API_KEY1, GROQ_API_KEY2…) HOẶC `<PREFIX>` đơn /
 * phẩy ngăn cách. Round-robin rải tải; key 401/403 (sai) → cooldown 1h, 429/402 (hết
 * quota) → cooldown ngắn 5'; hết key khả dụng mới báo lỗi.
 *
 * API: chat({provider, model, messages, ...}) | chatStream(opts, onDelta) | status() | listModels()
 */
'use strict';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const COOLDOWN_AUTH_MS = 60 * 60 * 1000; // key sai → 1h
const COOLDOWN_QUOTA_MS = 5 * 60 * 1000; // hết quota → 5'
const COOLDOWN_OVERLOAD_MS = 20 * 1000; // provider quá tải (503/529) → nghỉ ngắn 20s
const MAX_KEYS = 10; // số env <PREFIX>1..N quét
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;

// ───────────────────────── Registry provider ─────────────────────────
// THỨ TỰ = ưu tiên failover của complete() + default chat: GEMINI TRƯỚC (free 1500/ngày,
// user ưu tiên dùng key Gemini free) → Groq → OpenRouter.
// envPrefixes: quét key theo nhiều prefix. ƯU TIÊN `WEB2_*` (key riêng module AI, free)
// rồi tới legacy (`GEMINI_API_KEY`…). Mỗi prefix quét `<prefix>1..10` + `<prefix>` (phẩy).
const PROVIDERS = {
    gemini: {
        label: 'Gemini',
        kind: 'gemini',
        envPrefixes: ['WEB2_GEMINI_API_KEY', 'GEMINI_API_KEY'],
        defaultModel: 'gemini-2.5-flash',
        // Gemini đều multimodal → vision:true (nhận ảnh + PDF).
        models: [
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash 👁', vision: true },
            {
                id: 'gemini-2.5-flash-lite',
                label: 'Gemini 2.5 Flash Lite 👁 (nhanh)',
                vision: true,
            },
            { id: 'gemini-flash-latest', label: 'Gemini Flash (mới nhất) 👁', vision: true },
        ],
    },
    groq: {
        label: 'Groq',
        kind: 'openai',
        envPrefixes: ['WEB2_GROQ_API_KEY', 'GROQ_API_KEY'],
        baseURL: 'https://api.groq.com/openai/v1',
        defaultModel: 'openai/gpt-oss-20b',
        models: [
            { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (OpenAI mở · giống ChatGPT)' },
            { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B (mạnh hơn)' },
            { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
            { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (nhanh)' },
            // Vision (nhận ảnh) — Llama 4 Scout preview (sunset ~07/2026; thay bằng qwen khi chết).
            {
                id: 'meta-llama/llama-4-scout-17b-16e-instruct',
                label: 'Llama 4 Scout 👁 (xem ảnh)',
                vision: true,
            },
        ],
    },
    openrouter: {
        label: 'OpenRouter',
        kind: 'openai',
        envPrefixes: ['WEB2_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY'],
        baseURL: 'https://openrouter.ai/api/v1',
        defaultModel: 'openai/gpt-oss-20b:free',
        extraHeaders: {
            'HTTP-Referer': 'https://nhijudy.store',
            'X-Title': 'N2Store Web2 AI',
        },
        models: [
            { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (giống ChatGPT)' },
            { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3' },
            { id: 'deepseek/deepseek-r1-0528:free', label: 'DeepSeek R1 — suy luận' },
            { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
            { id: 'qwen/qwen3-235b-a22b:free', label: 'Qwen3 235B' },
            // ⚠ OpenRouter free vision đã CHẾT 2026 (qwen2.5-vl:free → paid; llama-4-*:free →
            // "no image input"). Đính ảnh dùng Gemini (👁 mọi model) hoặc Groq Llama-4 Scout.
        ],
    },
};

// ───────────────────────── Đọc + xoay key ─────────────────────────
// Gom key từ MỌI prefix (WEB2_* ưu tiên trước → legacy), mỗi prefix quét `<prefix>1..10`
// + `<prefix>` (đơn/phẩy). Dedup. Thứ tự đảm bảo key WEB2_ free được thử trước.
function _keys(providerId) {
    const p = PROVIDERS[providerId];
    if (!p) return [];
    const arr = [];
    const add = (raw) =>
        String(raw)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((k) => {
                if (!arr.includes(k)) arr.push(k);
            });
    for (const prefix of p.envPrefixes || []) {
        for (let i = 1; i <= MAX_KEYS; i++) {
            const v = (process.env[prefix + i] || '').trim();
            if (v) add(v);
        }
        const single = (process.env[prefix] || '').trim();
        if (single) add(single);
    }
    return arr;
}

const _rr = {}; // providerId → con trỏ round-robin
const _cooldown = new Map(); // key → ts hết cooldown

// Thứ tự thử key: round-robin (rải tải) + đẩy key đang cooldown xuống cuối.
function _orderedKeys(providerId) {
    const keys = _keys(providerId);
    if (!keys.length) return [];
    const now = Date.now();
    const start = (_rr[providerId] || 0) % keys.length;
    _rr[providerId] = (start + 1) % keys.length;
    const ordered = [];
    for (let i = 0; i < keys.length; i++) ordered.push(keys[(start + i) % keys.length]);
    const fresh = ordered.filter((k) => !(_cooldown.get(k) > now));
    const cooled = ordered.filter((k) => _cooldown.get(k) > now);
    return fresh.concat(cooled);
}

// Chạy fn(key) lần lượt; key auth/quota lỗi → cooldown + thử key kế. Lỗi khác → ném ngay.
async function _withKey(providerId, fn) {
    const keys = _orderedKeys(providerId);
    if (!keys.length) {
        const e = new Error(`${PROVIDERS[providerId]?.label || providerId}: chưa cấu hình key`);
        e._noKey = true;
        throw e;
    }
    let lastErr;
    for (const key of keys) {
        try {
            return await fn(key);
        } catch (e) {
            lastErr = e;
            // Client ngắt (đóng SSE) → KHÔNG đánh dấu cooldown key, KHÔNG failover, ném ngay.
            if (e && (e.name === 'AbortError' || e._aborted)) throw e;
            if (e && e._auth) {
                _cooldown.set(key, Date.now() + COOLDOWN_AUTH_MS);
                continue;
            }
            if (e && e._quota) {
                _cooldown.set(key, Date.now() + COOLDOWN_QUOTA_MS);
                continue;
            }
            if (e && e._overload) {
                // Provider quá tải tạm thời → nghỉ ngắn rồi xoay sang key/provider kế.
                _cooldown.set(key, Date.now() + COOLDOWN_OVERLOAD_MS);
                continue;
            }
            throw e; // lỗi nội dung (prompt rỗng…) → không phí key khác
        }
    }
    throw lastErr || new Error(`${providerId}: tất cả key đều lỗi/hết quota`);
}

// Phân loại lỗi HTTP để biết có nên đổi key không.
async function _httpError(r, providerLabel) {
    let detail = `HTTP ${r.status}`;
    try {
        const j = await r.json();
        detail = j?.error?.message || j?.message || (j?.error && JSON.stringify(j.error)) || detail;
    } catch {
        try {
            detail = (await r.text())?.slice(0, 300) || detail;
        } catch {}
    }
    const err = new Error(`${providerLabel}: ${String(detail).slice(0, 300)}`);
    const d = String(detail);
    if (r.status === 401 || r.status === 403) err._auth = true;
    if (r.status === 429 || r.status === 402) err._quota = true;
    // Provider quá tải tạm thời (502 Bad Gateway / 503 Unavailable / 529 Overloaded) → coi
    // là _overload để xoay sang key/provider kế thay vì fail cứng ở key đầu. KHÔNG blanket 500
    // (500 có thể là bad-request thật → đốt cả pool); 500 chỉ xét qua body text bên dưới.
    if (r.status === 502 || r.status === 503 || r.status === 529) err._overload = true;
    if (/overload|unavailable|temporarily|try again|service unavailable/i.test(d))
        err._overload = true;
    // Gemini trả HTTP 400 cho key hỏng (API_KEY_INVALID / "API key not found") → coi như
    // auth để XOAY sang key kế (không thì rotation ném ngay ở key đầu, bỏ phí key tốt sau).
    if (/api[\s_-]?key (not found|not valid|invalid)|API_KEY_INVALID|invalid api key/i.test(d))
        err._auth = true;
    if (/quota|rate.?limit|exhausted|resource has been exhausted|too many requests/i.test(d))
        err._quota = true;
    return err;
}

function maskKey(k) {
    if (!k) return '';
    const s = String(k);
    if (s.length <= 10) return s.slice(0, 2) + '…';
    return s.slice(0, 5) + '…' + s.slice(-4);
}

// ───────────────────────── Chuẩn hoá message ─────────────────────────
function _normMessages(messages, system) {
    const out = [];
    if (system && String(system).trim()) out.push({ role: 'system', content: String(system) });
    for (const m of messages || []) {
        const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
        const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
        // Ảnh đính kèm (chỉ user) — dataURL base64. Giữ lại để gửi tới model vision.
        const images =
            role === 'user' && Array.isArray(m.images)
                ? m.images.filter((x) => typeof x === 'string' && x.startsWith('data:'))
                : [];
        if (content || images.length) out.push({ role, content, images });
    }
    return out;
}

// messages chuẩn → OpenAI messages (content thành ARRAY khi có ảnh: text + image_url).
function _openaiMessages(messages) {
    return messages.map((m) => {
        if (m.role !== 'system' && m.images && m.images.length) {
            const parts = [];
            if (m.content) parts.push({ type: 'text', text: m.content });
            m.images.forEach((url) => parts.push({ type: 'image_url', image_url: { url } }));
            return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
    });
}

// messages chuẩn → Gemini contents + systemInstruction (ảnh = inlineData base64).
function _toGemini(messages) {
    const contents = [];
    let systemText = '';
    for (const m of messages) {
        if (m.role === 'system') {
            systemText += (systemText ? '\n' : '') + m.content;
            continue;
        }
        const parts = [];
        if (m.content) parts.push({ text: m.content });
        (m.images || []).forEach((url) => {
            const mt = /^data:([^;]+);base64,(.*)$/.exec(url);
            if (mt) parts.push({ inlineData: { mimeType: mt[1], data: mt[2] } });
        });
        if (!parts.length) parts.push({ text: '' });
        contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
    }
    return { contents, systemText };
}

// ───────────────────────── Chat (non-stream) ─────────────────────────
function _resolve(providerId, model) {
    const p = PROVIDERS[providerId];
    if (!p) throw new Error(`Provider không hợp lệ: ${providerId}`);
    const mdl = model && p.models.some((m) => m.id === model) ? model : p.defaultModel;
    return { p, mdl };
}

// Chặn sớm khi gửi ảnh tới model KHÔNG xem được ảnh → tránh lỗi 400 upstream tối nghĩa.
// Gemini: mọi model đều vision → bỏ qua. Provider khác: model phải có vision:true.
function _assertVision(p, mdl, messages) {
    if (p.kind === 'gemini') return;
    const hasImages = messages.some((m) => m.role !== 'system' && m.images && m.images.length);
    if (!hasImages) return;
    const md = p.models.find((m) => m.id === mdl);
    if (md && md.vision) return;
    const e = new Error(
        `Model "${md?.label || mdl}" không xem được ảnh — hãy chọn model có biểu tượng 👁 ` +
            `(vd Llama 4 Scout của Groq, hoặc Gemini).`
    );
    e._noVision = true;
    throw e;
}

async function _openaiChat(p, mdl, messages, opts) {
    return _withKey(opts._pid, async (key) => {
        const r = await fetch(`${p.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                ...(p.extraHeaders || {}),
            },
            body: JSON.stringify({
                model: mdl,
                messages: _openaiMessages(messages),
                temperature: opts.temperature,
                max_tokens: opts.maxTokens,
                stream: false,
            }),
        });
        if (!r.ok) throw await _httpError(r, p.label);
        const j = await r.json();
        const text = j?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error(`${p.label}: phản hồi rỗng`);
        return text;
    });
}

async function _geminiChat(p, mdl, messages, opts) {
    const { contents, systemText } = _toGemini(messages);
    return _withKey(opts._pid, async (key) => {
        const r = await fetch(`${GEMINI_BASE}/models/${mdl}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents,
                ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
                generationConfig: {
                    temperature: opts.temperature,
                    maxOutputTokens: opts.maxTokens,
                },
            }),
        });
        if (!r.ok) throw await _httpError(r, p.label);
        const j = await r.json();
        const text = (j?.candidates?.[0]?.content?.parts || [])
            .map((x) => x.text || '')
            .join('')
            .trim();
        if (!text) throw new Error(`${p.label}: phản hồi rỗng`);
        return text;
    });
}

// chat({provider, model, messages, system, temperature, maxTokens}) → {text, provider, model}
async function chat(opts = {}) {
    const providerId = opts.provider || defaultProvider();
    const { p, mdl } = _resolve(providerId, opts.model);
    const messages = _normMessages(opts.messages, opts.system);
    if (!messages.some((m) => m.role !== 'system')) throw new Error('Thiếu nội dung chat');
    _assertVision(p, mdl, messages);
    const o = {
        _pid: providerId,
        temperature: clampNum(opts.temperature, 0, 2, DEFAULT_TEMPERATURE),
        maxTokens: clampNum(opts.maxTokens, 1, 8192, DEFAULT_MAX_TOKENS),
    };
    const text =
        p.kind === 'gemini'
            ? await _geminiChat(p, mdl, messages, o)
            : await _openaiChat(p, mdl, messages, o);
    return { text, provider: providerId, model: mdl };
}

// ───────────────────────── Chat (streaming) ─────────────────────────
// Đọc SSE body theo dòng, gọi cb(dataString) cho mỗi `data: ...`.
// GHI CHÚ: mỗi provider (Gemini alt=sse, OpenAI-style stream) phát 1 JSON hoàn chỉnh trên
// 1 dòng `data:`; buffer theo `\n` đã chống cắt-chunk. signal cho phép client ngắt → hủy
// đọc + cancel reader (không đốt quota cho phản hồi không ai nhận).
async function _readSSE(body, onData, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
        if (signal?.aborted) {
            await reader.cancel().catch(() => {});
            break;
        }
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (line.startsWith('data:')) onData(line.slice(5).trim());
        }
    }
    if (buf.trim().startsWith('data:')) onData(buf.trim().slice(5).trim());
}

// chatStream(opts, onDelta, signal) — gọi onDelta(textChunk) khi có; trả {text, provider, model}.
// signal (AbortSignal) propagate xuống fetch + _readSSE để client đóng SSE thì hủy upstream
// LLM fetch ngay (không đốt quota free cho response không ai nhận).
async function chatStream(opts = {}, onDelta, signal) {
    const providerId = opts.provider || defaultProvider();
    const { p, mdl } = _resolve(providerId, opts.model);
    const messages = _normMessages(opts.messages, opts.system);
    if (!messages.some((m) => m.role !== 'system')) throw new Error('Thiếu nội dung chat');
    _assertVision(p, mdl, messages);
    const temperature = clampNum(opts.temperature, 0, 2, DEFAULT_TEMPERATURE);
    const maxTokens = clampNum(opts.maxTokens, 1, 8192, DEFAULT_MAX_TOKENS);
    let full = '';
    const emit = (t) => {
        if (!t) return;
        full += t;
        try {
            onDelta && onDelta(t);
        } catch {}
    };

    await _withKey(providerId, async (key) => {
        let r, parseLine;
        if (p.kind === 'gemini') {
            const { contents, systemText } = _toGemini(messages);
            r = await fetch(`${GEMINI_BASE}/models/${mdl}:streamGenerateContent?alt=sse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify({
                    contents,
                    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
                    generationConfig: { temperature, maxOutputTokens: maxTokens },
                }),
                signal,
            });
            parseLine = (d) => {
                try {
                    const j = JSON.parse(d);
                    (j?.candidates?.[0]?.content?.parts || []).forEach((x) => emit(x.text || ''));
                } catch {}
            };
        } else {
            r = await fetch(`${p.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${key}`,
                    ...(p.extraHeaders || {}),
                },
                body: JSON.stringify({
                    model: mdl,
                    messages: _openaiMessages(messages),
                    temperature,
                    max_tokens: maxTokens,
                    stream: true,
                }),
                signal,
            });
            parseLine = (d) => {
                if (d === '[DONE]') return;
                try {
                    const j = JSON.parse(d);
                    emit(j?.choices?.[0]?.delta?.content || '');
                } catch {}
            };
        }
        if (!r.ok) throw await _httpError(r, p.label);
        if (!r.body) throw new Error(`${p.label}: không có stream body`);
        await _readSSE(r.body, parseLine, signal);
        // Client ngắt giữa chừng → coi như xong, KHÔNG ném "phản hồi rỗng" (sẽ bị hiểu nhầm lỗi).
        if (signal?.aborted) return;
        if (!full.trim()) throw new Error(`${p.label}: phản hồi rỗng`);
    });

    return { text: full, provider: providerId, model: mdl };
}

// ───────────────────────── complete: failover provider + xoay key ─────────────────────────
// Cho service nội bộ (translate/caption/ai-script) tái dùng group xoay key TẬP TRUNG.
// Thử lần lượt providers (mỗi provider tự xoay nhiều key + cooldown); trả provider đầu OK.
// complete(messages, {providers, modelFor, system, temperature, maxTokens}) → {text, provider, model}
async function complete(messages, opts = {}) {
    const want =
        opts.providers && opts.providers.length ? opts.providers : ['gemini', 'groq', 'openrouter'];
    const avail = want.filter((id) => PROVIDERS[id] && _keys(id).length);
    if (!avail.length) {
        const e = new Error('Không có provider AI nào cấu hình key');
        e._noKey = true;
        throw e;
    }
    let lastErr;
    for (const provider of avail) {
        try {
            return await chat({
                provider,
                model: opts.modelFor && opts.modelFor[provider],
                system: opts.system,
                messages,
                temperature: opts.temperature,
                maxTokens: opts.maxTokens,
            });
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Tất cả provider AI đều lỗi');
}

// ───────────────────────── Trạng thái / tiện ích ─────────────────────────
function clampNum(v, min, max, dflt) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
}

function defaultProvider() {
    for (const id of Object.keys(PROVIDERS)) if (_keys(id).length) return id;
    return 'groq';
}

function configured() {
    return Object.keys(PROVIDERS).some((id) => _keys(id).length > 0);
}

// status() → providers + số key + trạng thái cooldown (MASKED) + models. KHÔNG lộ key.
function status() {
    const now = Date.now();
    const providers = Object.keys(PROVIDERS).map((id) => {
        const p = PROVIDERS[id];
        const keys = _keys(id);
        return {
            id,
            label: p.label,
            kind: p.kind,
            configured: keys.length > 0,
            keyCount: keys.length,
            defaultModel: p.defaultModel,
            models: p.models,
            keys: keys.map((k) => {
                const cd = _cooldown.get(k) || 0;
                return {
                    masked: maskKey(k),
                    cooling: cd > now,
                    cooldownMs: cd > now ? cd - now : 0,
                };
            }),
        };
    });
    return { providers, defaultProvider: defaultProvider(), configured: configured() };
}

function listModels() {
    const out = {};
    for (const id of Object.keys(PROVIDERS)) out[id] = PROVIDERS[id].models;
    return out;
}

// test(provider) — ping 1 lượt ngắn để xác minh key chạy. Trả {ok, ms, model, error?}.
async function test(providerId) {
    const t0 = Date.now();
    try {
        const res = await chat({
            provider: providerId,
            messages: [{ role: 'user', content: 'Trả lời ngắn: nói "OK" nếu bạn hoạt động.' }],
            // ⚠ Model suy luận (GPT-OSS, Gemini 2.5) đốt token cho reasoning trước output;
            // maxTokens quá thấp (16) → output rỗng dù key chạy. Để ≥256 cho có chỗ.
            maxTokens: 256,
            temperature: 0,
        });
        return { ok: true, ms: Date.now() - t0, model: res.model, sample: res.text.slice(0, 40) };
    } catch (e) {
        return { ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 200) };
    }
}

// runWithKey — cho image-service tái dùng CHUNG cơ chế xoay key + cooldown (1h auth / 5' quota
// / 20s overload). fn(key) PHẢI ném lỗi gắn cờ _auth/_quota/_overload (vd qua classifyHttpError)
// để rotation biết xoay sang key kế thay vì fail cứng.
function runWithKey(providerId, fn) {
    return _withKey(providerId, fn);
}

// keysOf — cho image-service tái dùng pool key Gemini (KHÔNG lộ ra route/frontend).
module.exports = {
    chat,
    chatStream,
    complete,
    status,
    listModels,
    test,
    configured,
    defaultProvider,
    maskKey,
    keysOf: _keys,
    runWithKey,
    classifyHttpError: _httpError,
};
