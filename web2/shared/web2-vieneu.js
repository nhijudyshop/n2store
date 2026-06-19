// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — kho Voice.
/**
 * Web2Vieneu — client DÙNG CHUNG cho server VieNeu-TTS (clone giọng tiếng Việt).
 *
 * Server chạy trên MÁY SHOP (vieneu-tts/, FastAPI) → URL cấu hình được (nhiều máy:
 * dán URL tunnel của máy đang bật). Lưu localStorage `web2_vieneu_url`.
 * Trả `{samples:Float32Array, sampleRate}` để khớp Web2VideoTTS (mux thẳng vào video).
 *
 *   Web2Vieneu.setUrl(url) / getUrl()
 *   await Web2Vieneu.health()                     → {ok, model}
 *   await Web2Vieneu.listVoices()                 → [{label, voice_id}]
 *   await Web2Vieneu.synthesize(text, voiceId)    → {samples, sampleRate}
 *   await Web2Vieneu.clone(text, refAudioBlob)    → {samples, sampleRate}   (nhái giọng từ mẫu 3-5s)
 */
(function (global) {
    'use strict';

    const URL_KEY = 'web2_vieneu_url';
    const SECRET_KEY = 'web2_vieneu_secret';

    function getUrl() {
        try {
            return (localStorage.getItem(URL_KEY) || '').replace(/\/+$/, '');
        } catch {
            return '';
        }
    }
    function setUrl(u) {
        try {
            localStorage.setItem(
                URL_KEY,
                String(u || '')
                    .trim()
                    .replace(/\/+$/, '')
            );
        } catch {}
    }
    function getSecret() {
        try {
            return localStorage.getItem(SECRET_KEY) || '';
        } catch {
            return '';
        }
    }
    function setSecret(s) {
        try {
            localStorage.setItem(SECRET_KEY, String(s || '').trim());
        } catch {}
    }
    function _headers(extra) {
        const h = Object.assign({}, extra || {});
        const s = getSecret();
        if (s) h['x-vieneu-secret'] = s;
        return h;
    }
    function _need() {
        const u = getUrl();
        if (!u) throw new Error('Chưa cấu hình URL server giọng VieNeu');
        return u;
    }

    // WAV/audio blob → { samples:Float32Array (kênh 0), sampleRate }
    let _ac = null;
    function _ctx() {
        if (!_ac) _ac = new (global.AudioContext || global.webkitAudioContext)();
        return _ac;
    }
    async function _decode(blob) {
        const ab = await blob.arrayBuffer();
        const buf = await _ctx().decodeAudioData(ab);
        return { samples: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate };
    }

    async function health(timeoutMs) {
        const u = _need();
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs || 6000);
        try {
            const r = await fetch(`${u}/health`, { signal: ctrl.signal });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } finally {
            clearTimeout(t);
        }
    }

    async function listVoices() {
        const u = _need();
        const r = await fetch(`${u}/voices`, { headers: _headers() });
        if (!r.ok) throw new Error('Không lấy được danh sách giọng (HTTP ' + r.status + ')');
        const d = await r.json();
        return (d && d.voices) || [];
    }

    async function synthesize(text, voiceId) {
        const u = _need();
        const r = await fetch(`${u}/synthesize`, {
            method: 'POST',
            headers: _headers({ 'content-type': 'application/json' }),
            body: JSON.stringify({ text: String(text || ''), voice: voiceId || null }),
        });
        if (!r.ok) {
            let msg = 'HTTP ' + r.status;
            try {
                msg = (await r.json()).error || msg;
            } catch {}
            throw new Error('Tạo giọng VieNeu lỗi: ' + msg);
        }
        return _decode(await r.blob());
    }

    async function clone(text, refAudioBlob) {
        const u = _need();
        if (!refAudioBlob) throw new Error('Thiếu file giọng mẫu để clone');
        const fd = new FormData();
        fd.append('text', String(text || ''));
        fd.append('ref_audio', refAudioBlob, 'ref.wav');
        const r = await fetch(`${u}/clone`, { method: 'POST', headers: _headers(), body: fd });
        if (!r.ok) {
            let msg = 'HTTP ' + r.status;
            try {
                msg = (await r.json()).error || msg;
            } catch {}
            throw new Error('Clone giọng lỗi: ' + msg);
        }
        return _decode(await r.blob());
    }

    global.Web2Vieneu = {
        getUrl,
        setUrl,
        getSecret,
        setSecret,
        health,
        listVoices,
        synthesize,
        clone,
    };
})(window);
