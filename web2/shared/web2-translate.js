// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module dùng chung.
/**
 * Web2Translate — dịch thuật DÙNG CHUNG cho Web 2.0 (client). Gọi proxy /api/web2-translate
 * (LLM free Groq/DeepSeek/Gemini → fallback Google free; key giấu ở server).
 *
 *   await Web2Translate.translate(text, { to='en', from='auto', context }) → string
 *   await Web2Translate.toEn(text, context?) / toVi(text, context?)        → string
 *   await Web2Translate.status()                                          → { ok, engines }
 *
 * Có cache trong phiên (theo from|to|context|text). Lỗi → trả NGUYÊN VĂN (không ném vỡ UI).
 * Trang nào cần dịch chỉ cần load script này rồi gọi — KHÔNG tự fetch /api/web2-translate.
 */
(function (global) {
    'use strict';

    function _base() {
        return (
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function _auth() {
        try {
            const a = JSON.parse(localStorage.getItem('web2_auth') || '{}');
            return a && a.token ? { 'x-web2-token': a.token } : {};
        } catch {
            return {};
        }
    }

    const _cache = new Map(); // 'from|to|ctx|text' → bản dịch

    async function translate(text, opts = {}) {
        const t = String(text || '').trim();
        if (!t) return '';
        const to = String(opts.to || 'en');
        const from = String(opts.from || 'auto');
        const context = String(opts.context || '');
        const ck = from + '|' + to + '|' + context + '|' + t;
        if (_cache.has(ck)) return _cache.get(ck);
        try {
            const r = await fetch(_base() + '/api/web2-translate', {
                method: 'POST',
                headers: Object.assign({ 'content-type': 'application/json' }, _auth()),
                body: JSON.stringify({ text: t, to, from, context }),
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            const out = (d && d.text) || t;
            _cache.set(ck, out);
            return out;
        } catch (e) {
            return t; // không chặn UI — trả nguyên văn
        }
    }

    async function status() {
        try {
            const r = await fetch(_base() + '/api/web2-translate/status');
            return r.ok ? await r.json() : { ok: false };
        } catch {
            return { ok: false };
        }
    }

    global.Web2Translate = {
        translate,
        status,
        toEn: (t, context) => translate(t, { to: 'en', context }),
        toVi: (t, context) => translate(t, { to: 'vi', context }),
    };
})(window);
