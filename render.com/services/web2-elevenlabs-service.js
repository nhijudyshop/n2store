// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — ElevenLabs TTS service (proxy server-side, giấu API key).
 *
 * Vì sao proxy: ElevenLabs cần `xi-api-key` (bí mật) + endpoint không mở CORS cho
 * browser → KHÔNG gọi trực tiếp từ frontend. Key đặt ở env `ELEVENLABS_API_KEY`
 * (Render). KHÔNG có key → route trả 503, frontend ẩn mục ElevenLabs.
 *
 * ⚠ Free tier ElevenLabs ~10k credits/tháng NHƯNG KHÔNG có quyền thương mại
 * (cần attribution / gói trả phí). Video bán hàng = commercial → cân nhắc.
 */
'use strict';

const API_BASE = 'https://api.elevenlabs.io/v1';
const MAX_TEXT = 2500; // chặn đốt credit (1 credit ≈ 1 ký tự)
const DEFAULT_MODEL = 'eleven_multilingual_v2'; // hỗ trợ tiếng Việt + đa ngôn ngữ

function apiKey() {
    return (process.env.ELEVENLABS_API_KEY || '').trim();
}
function configured() {
    return !!apiKey();
}

let _voicesCache = null;
let _voicesAt = 0;
const VOICES_TTL = 10 * 60 * 1000;

async function listVoices() {
    if (!configured()) throw new Error('ELEVENLABS_API_KEY chưa cấu hình');
    const now = Date.now();
    if (_voicesCache && now - _voicesAt < VOICES_TTL) return _voicesCache;
    const r = await fetch(`${API_BASE}/voices`, {
        headers: { 'xi-api-key': apiKey() },
    });
    if (!r.ok) throw new Error(`ElevenLabs /voices HTTP ${r.status}`);
    const d = await r.json();
    const voices = (d.voices || []).map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || '',
        labels: v.labels || {},
        preview_url: v.preview_url || '',
    }));
    _voicesCache = voices;
    _voicesAt = now;
    return voices;
}

// text → mp3 Buffer (mp3_44100_128). voiceId BẮT BUỘC; modelId optional.
async function tts(text, voiceId, modelId) {
    if (!configured()) throw new Error('ELEVENLABS_API_KEY chưa cấu hình');
    const t = String(text || '').trim();
    if (!t) throw new Error('text rỗng');
    if (!voiceId) throw new Error('thiếu voice_id');
    const clipped = t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t;
    const r = await fetch(
        `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
            method: 'POST',
            headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
            body: JSON.stringify({ text: clipped, model_id: modelId || DEFAULT_MODEL }),
        }
    );
    if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
            const j = await r.json();
            detail = j.detail?.message || j.detail || JSON.stringify(j);
        } catch {}
        throw new Error('ElevenLabs TTS lỗi: ' + detail);
    }
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
}

module.exports = { configured, listVoices, tts, DEFAULT_MODEL, MAX_TEXT };
