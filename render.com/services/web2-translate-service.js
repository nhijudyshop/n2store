// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Dịch thuật DÙNG CHUNG (module). Server-side, giấu key.
 *
 * Ưu tiên LLM (ngữ cảnh tốt, vd "tiếng chó sủa" → "dog barking" thay vì dịch máy thô):
 *   Groq (free, llama-3.3-70b) → DeepSeek → Gemini  (mirror web2-caption-service).
 * Thiếu key / lỗi → FALLBACK FREE KHÔNG KEY (Google public endpoint) → luôn dịch được.
 * Cuối cùng kẹt hết → trả nguyên văn (không chặn luồng gọi).
 *
 * translate(text, {to='en', from='auto', context}) → { text, provider }
 * Consumer: web2-elevenlabs sound-effect (VN→EN), caption, mô tả SP… (qua /api/web2-translate).
 */
'use strict';

const MAX_TEXT = 2000;
const LANG_NAMES = {
    vi: 'Vietnamese',
    en: 'English',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    th: 'Thai',
    fr: 'French',
    es: 'Spanish',
    de: 'German',
};
function _langName(code) {
    return LANG_NAMES[String(code || '').toLowerCase()] || code || 'the target language';
}

const SYSTEM =
    'You are a professional translator. Output ONLY the translated text — no quotes, no notes, no explanation, never repeat the source.';

function _prompt(text, to, from, context) {
    const toN = _langName(to);
    const fromN =
        from && from !== 'auto' ? _langName(from) : 'the source language (auto-detect it)';
    let p = `Translate the text from ${fromN} to ${toN}. Output ONLY the translation.`;
    if (context) p += ` Context: ${context}.`;
    p += `\n\nText:\n${text}`;
    return p;
}

async function _groq(prompt) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2,
            max_tokens: 1024,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || null;
}

async function _deepseek(prompt) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) return null;
    const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model: 'deepseek-chat',
            temperature: 0.2,
            max_tokens: 1024,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.choices?.[0]?.message?.content?.trim() || null;
}

async function _gemini(prompt) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${SYSTEM}\n\n${prompt}` }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
            }),
        }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function _llm(text, to, from, context) {
    const prompt = _prompt(text, to, from, context);
    let out = await _groq(prompt).catch(() => null);
    if (out) return { text: out, provider: 'groq' };
    out = await _deepseek(prompt).catch(() => null);
    if (out) return { text: out, provider: 'deepseek' };
    out = await _gemini(prompt).catch(() => null);
    if (out) return { text: out, provider: 'gemini' };
    return null;
}

// Fallback FREE, KHÔNG KEY: Google translate public endpoint (gtx). Best-effort.
async function _freeGoogle(text, to, from) {
    const sl = from && from !== 'auto' ? from : 'auto';
    const url =
        'https://translate.googleapis.com/translate_a/single?client=gtx' +
        `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) return null;
    const j = await r.json(); // [[["dịch","gốc",...],...], null, "vi", ...]
    if (!Array.isArray(j) || !Array.isArray(j[0])) return null;
    const out = j[0].map((seg) => (Array.isArray(seg) ? seg[0] || '' : '')).join('');
    return out.trim() || null;
}

// text → { text: bản dịch, provider }. opts: {to, from, context}.
async function translate(text, opts = {}) {
    const t0 = String(text || '').trim();
    if (!t0) throw new Error('text rỗng');
    const t = t0.length > MAX_TEXT ? t0.slice(0, MAX_TEXT) : t0;
    const to = String(opts.to || 'en')
        .toLowerCase()
        .slice(0, 5);
    const from = String(opts.from || 'auto')
        .toLowerCase()
        .slice(0, 5);
    const context = String(opts.context || '').slice(0, 200);
    const res = await _llm(t, to, from, context).catch(() => null);
    if (res && res.text) return res;
    const g = await _freeGoogle(t, to, from).catch(() => null);
    if (g) return { text: g, provider: 'google-free' };
    return { text: t, provider: 'none' }; // không chặn luồng — trả nguyên văn
}

function engines() {
    const e = [];
    if (process.env.GROQ_API_KEY) e.push('groq');
    if (process.env.DEEPSEEK_API_KEY) e.push('deepseek');
    if (process.env.GEMINI_API_KEY) e.push('gemini');
    e.push('google-free');
    return e;
}
function configured() {
    return true; // luôn có free fallback
}

module.exports = { translate, engines, configured, MAX_TEXT };
