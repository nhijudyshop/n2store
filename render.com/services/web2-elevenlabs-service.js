// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — ElevenLabs service (proxy server-side, giấu API key) + XOAY TUA NHIỀU KEY.
 *
 * Vì sao proxy: ElevenLabs cần `xi-api-key` (bí mật) + endpoint không mở CORS cho
 * browser → KHÔNG gọi trực tiếp từ frontend. Key đặt ở env Render.
 *
 * XOAY TUA KEY (free tier ~10k credit/tháng/key → gộp nhiều account free):
 *   env ELEVENLABS_API_KEY1, ELEVENLABS_API_KEY2, … (hoặc ELEVENLABS_API_KEY đơn /
 *   phẩy ngăn cách). Round-robin để rải tải; key nào 401 (sai)/quota_exceeded/429 →
 *   cooldown 1h rồi thử key kế. Hết key khả dụng mới báo lỗi.
 *
 * ⚠ Free tier KHÔNG có quyền thương mại (cần attribution / gói trả phí).
 */
'use strict';

const API_BASE = 'https://api.elevenlabs.io/v1';
const MAX_TEXT = 2500; // chặn đốt credit (1 credit ≈ 1 ký tự)
const DEFAULT_MODEL = 'eleven_multilingual_v2'; // hỗ trợ tiếng Việt + đa ngôn ngữ
const COOLDOWN_MS = 60 * 60 * 1000; // 1h sau khi key 401/hết quota

let _rr = 0; // con trỏ round-robin
const _cooldown = new Map(); // key → ts hết cooldown

// Đọc danh sách key: ưu tiên ELEVENLABS_API_KEY1..N, fallback ELEVENLABS_API_KEY (đơn / phẩy).
function _keys() {
    const arr = [];
    for (let i = 1; i <= 10; i++) {
        const v = (process.env['ELEVENLABS_API_KEY' + i] || '').trim();
        if (v) arr.push(v);
    }
    const single = (process.env.ELEVENLABS_API_KEY || '').trim();
    if (single)
        single
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((k) => {
                if (!arr.includes(k)) arr.push(k);
            });
    return arr;
}
function configured() {
    return _keys().length > 0;
}
function keyCount() {
    return _keys().length;
}

// Thứ tự thử key: round-robin (rải tải) + đẩy key đang cooldown xuống cuối.
function _orderedKeys() {
    const keys = _keys();
    if (!keys.length) return [];
    const now = Date.now();
    const start = _rr % keys.length;
    _rr = (_rr + 1) % keys.length;
    const ordered = [];
    for (let i = 0; i < keys.length; i++) ordered.push(keys[(start + i) % keys.length]);
    const fresh = ordered.filter((k) => !(_cooldown.get(k) > now));
    const cooled = ordered.filter((k) => _cooldown.get(k) > now);
    return fresh.concat(cooled);
}

// Chạy fn(key) lần lượt; key lỗi auth/quota → cooldown + thử key kế. Lỗi khác → ném ngay.
async function _withKey(fn) {
    const keys = _orderedKeys();
    if (!keys.length) throw new Error('ELEVENLABS_API_KEY chưa cấu hình');
    let lastErr;
    for (const key of keys) {
        try {
            return await fn(key);
        } catch (e) {
            lastErr = e;
            if (e && (e._auth || e._quota)) {
                _cooldown.set(key, Date.now() + COOLDOWN_MS);
                continue; // thử key kế
            }
            throw e; // lỗi nội dung (text rỗng…) → không phí key khác
        }
    }
    throw lastErr || new Error('Tất cả key ElevenLabs đều lỗi/hết quota');
}

// Phân loại lỗi HTTP để biết có nên đổi key không.
async function _httpError(r) {
    let detail = `HTTP ${r.status}`;
    let code = '';
    try {
        const j = await r.json();
        code = (j.detail && j.detail.status) || '';
        const d = j.detail;
        detail =
            (d && (d.message || d.status)) ||
            (typeof d === 'string' ? d : null) ||
            (d ? JSON.stringify(d) : null) ||
            JSON.stringify(j);
    } catch {}
    const err = new Error(String(detail).slice(0, 300));
    const quotaCode = /quota|limit|exceeded|too_many/i.test(String(code) + ' ' + String(detail));
    if (r.status === 401 || r.status === 403) err._auth = true;
    if (r.status === 429 || r.status === 402 || quotaCode) err._quota = true;
    return err;
}

let _voicesCache = null;
let _voicesAt = 0;
const VOICES_TTL = 10 * 60 * 1000;

async function listVoices() {
    const now = Date.now();
    if (_voicesCache && now - _voicesAt < VOICES_TTL) return _voicesCache;
    const voices = await _withKey(async (key) => {
        const r = await fetch(`${API_BASE}/voices`, { headers: { 'xi-api-key': key } });
        if (!r.ok) throw await _httpError(r);
        const d = await r.json();
        return (d.voices || []).map((v) => ({
            voice_id: v.voice_id,
            name: v.name,
            category: v.category || '',
            labels: v.labels || {},
            preview_url: v.preview_url || '',
        }));
    });
    _voicesCache = voices;
    _voicesAt = now;
    return voices;
}

// text → mp3 Buffer (mp3_44100_128). voiceId BẮT BUỘC; modelId optional.
async function tts(text, voiceId, modelId) {
    const t = String(text || '').trim();
    if (!t) throw new Error('text rỗng');
    if (!voiceId) throw new Error('thiếu voice_id');
    const clipped = t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) : t;
    return _withKey(async (key) => {
        const r = await fetch(
            `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
                method: 'POST',
                headers: { 'xi-api-key': key, 'content-type': 'application/json' },
                body: JSON.stringify({ text: clipped, model_id: modelId || DEFAULT_MODEL }),
            }
        );
        if (!r.ok) throw await _httpError(r);
        return Buffer.from(await r.arrayBuffer());
    });
}

// text prompt → hiệu ứng âm thanh (mp3). durationSeconds optional (0.5–22), promptInfluence 0–1.
async function soundEffect(text, opts = {}) {
    const t = String(text || '').trim();
    if (!t) throw new Error('mô tả âm thanh rỗng');
    const body = { text: t.slice(0, 450) };
    if (opts.durationSeconds)
        body.duration_seconds = Math.max(0.5, Math.min(22, +opts.durationSeconds));
    if (opts.promptInfluence != null)
        body.prompt_influence = Math.max(0, Math.min(1, +opts.promptInfluence));
    return _withKey(async (key) => {
        const r = await fetch(`${API_BASE}/sound-generation`, {
            method: 'POST',
            headers: { 'xi-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) throw await _httpError(r);
        return Buffer.from(await r.arrayBuffer());
    });
}

// audio Buffer → transcript text (Scribe STT). multipart: file + model_id=scribe_v1.
async function transcribe(buf, filename, mime) {
    if (!buf || !buf.length) throw new Error('audio rỗng');
    return _withKey(async (key) => {
        const fd = new FormData();
        fd.append('model_id', 'scribe_v1');
        fd.append('file', new Blob([buf], { type: mime || 'audio/wav' }), filename || 'audio.wav');
        const r = await fetch(`${API_BASE}/speech-to-text`, {
            method: 'POST',
            headers: { 'xi-api-key': key },
            body: fd,
        });
        if (!r.ok) throw await _httpError(r);
        const d = await r.json();
        return { text: d.text || '', language: d.language_code || '' };
    });
}

// audio Buffer → audio Buffer đã lọc tạp âm (Voice Isolator). multipart: audio.
async function audioIsolation(buf, filename, mime) {
    if (!buf || !buf.length) throw new Error('audio rỗng');
    return _withKey(async (key) => {
        const fd = new FormData();
        fd.append('audio', new Blob([buf], { type: mime || 'audio/wav' }), filename || 'audio.wav');
        const r = await fetch(`${API_BASE}/audio-isolation`, {
            method: 'POST',
            headers: { 'xi-api-key': key },
            body: fd,
        });
        if (!r.ok) throw await _httpError(r);
        return Buffer.from(await r.arrayBuffer());
    });
}

// Voice Design: mô tả → previews [{generated_voice_id, audio (mp3 base64)}] để nghe thử.
async function designVoicePreviews(description, sampleText) {
    const desc = String(description || '').trim();
    if (desc.length < 20)
        throw new Error('Mô tả giọng cần ≥20 ký tự (vd: giọng nữ miền Nam trẻ trung, ấm)');
    // ElevenLabs yêu cầu text mẫu ≥100 ký tự — dùng mặc định dài / nối thêm nếu thiếu.
    const DEF =
        'Xin chào quý khách, đây là giọng đọc mẫu dùng để lồng tiếng cho video sản phẩm của shop. Cảm ơn các bạn đã quan tâm theo dõi và ủng hộ shop nhé!';
    let text = String(sampleText || '').trim();
    if (text.length < 100) text = (text ? text + ' ' + DEF : DEF).slice(0, 1000);
    return _withKey(async (key) => {
        const r = await fetch(`${API_BASE}/text-to-voice/create-previews`, {
            method: 'POST',
            headers: { 'xi-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify({ voice_description: desc, text }),
        });
        if (!r.ok) throw await _httpError(r);
        const d = await r.json();
        return (d.previews || []).map((p) => ({
            generated_voice_id: p.generated_voice_id,
            audio_base64: p.audio_base_64 || p.audio_base64 || '',
            media_type: p.media_type || 'audio/mpeg',
        }));
    });
}

// Lưu 1 preview thành giọng thật → { voice_id, name } (tốn 1 voice slot, free ~3 slot).
async function createVoiceFromPreview(name, description, generatedVoiceId) {
    if (!generatedVoiceId) throw new Error('thiếu generated_voice_id');
    return _withKey(async (key) => {
        const r = await fetch(`${API_BASE}/text-to-voice/create-voice-from-preview`, {
            method: 'POST',
            headers: { 'xi-api-key': key, 'content-type': 'application/json' },
            body: JSON.stringify({
                voice_name: (name || 'Giọng thiết kế').slice(0, 60),
                voice_description:
                    String(description || '').slice(0, 400) || 'Giọng thiết kế cho video',
                generated_voice_id: generatedVoiceId,
            }),
        });
        if (!r.ok) throw await _httpError(r);
        const d = await r.json();
        return { voice_id: d.voice_id, name: d.name || name };
    });
}

module.exports = {
    configured,
    keyCount,
    listVoices,
    tts,
    soundEffect,
    transcribe,
    audioIsolation,
    designVoicePreviews,
    createVoiceFromPreview,
    DEFAULT_MODEL,
    MAX_TEXT,
};
