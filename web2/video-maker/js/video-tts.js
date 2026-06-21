// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoTTS — giọng đọc tiếng Việt ON-DEVICE, NHIỀU GIỌNG (miễn phí, không server).
 *
 * 2 engine chạy NGAY TRONG TRÌNH DUYỆT (ONNX/WASM), lazy-load CDN khi cần:
 *   • MMS    : Xenova/mms-tts-vie  (transformers.js)   → Float32Array 16kHz
 *   • Piper  : vits-web (Rhasspy Piper)                → WAV Blob → decode
 *     - vi_VN-vais1000-medium, vi_VN-25hours_single-low, vi_VN-vivos-x_low
 * → tổng 4 giọng THẬT khác nhau, + "tông" (pitch) Chuẩn/Cao/Trầm = nhiều biến thể.
 * Tất cả trả `{ samples:Float32Array, sampleRate }` để MUX thẳng vào video.
 *
 *   Web2VideoTTS.VOICES / .TONES                          → cho UI chọn giọng/tông
 *   await Web2VideoTTS.synthesize(text,{voiceId,pitch,onStatus}) → { samples, sampleRate }
 *   Web2VideoTTS.toAudioBuffer(audioCtx, samples, sr)     → AudioBuffer
 *   Web2VideoTTS.SAMPLE_TEXT                              → câu mẫu nghe thử
 *
 * Vì sao: Kokoro KHÔNG có tiếng Việt. MMS + Piper đều có, ONNX-hoá sẵn cho web,
 * chạy offline → free + riêng tư + mux được.
 */
(function (global) {
    'use strict';

    const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
    const PIPER_URL = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';
    const MMS_ID = 'Xenova/mms-tts-vie';

    const VOICES = [
        { id: 'mms', label: 'Nữ trong trẻo', engine: 'mms', note: 'MMS' },
        { id: 'vais', label: 'Nữ ấm áp', engine: 'piper', voiceId: 'vi_VN-vais1000-medium' },
        { id: 'h25', label: 'Nữ tự nhiên', engine: 'piper', voiceId: 'vi_VN-25hours_single-low' },
        { id: 'vivos', label: 'Giọng VIVOS', engine: 'piper', voiceId: 'vi_VN-vivos-x_low' },
    ];
    const TONES = [
        { id: 'low', label: 'Trầm', pitch: 0.9 },
        { id: 'normal', label: 'Chuẩn', pitch: 1.0 },
        { id: 'high', label: 'Cao', pitch: 1.12 },
    ];
    const SAMPLE_TEXT = 'Xin chào, đây là giọng đọc mẫu của shop nhé!';

    // Thẻ CẢM XÚC / phi ngôn ngữ (VieNeu-TTS v3 Turbo — thử nghiệm). Chèn token thẳng
    // vào lời đọc; CHỈ engine 'vieneu' hiểu, engine on-device (MMS/Piper) sẽ bị BỎ token
    // (stripCues) để không đọc literal "cười". Nguồn: github.com/pnnbao97/VieNeu-TTS.
    const CUES = [
        { token: '[cười]', label: 'Cười', icon: 'laugh' },
        { token: '[thở dài]', label: 'Thở dài', icon: 'wind' },
        { token: '[hắng giọng]', label: 'Hắng giọng', icon: 'mic-2' },
    ];

    function _voice(id) {
        return VOICES.find((v) => v.id === id) || VOICES[0];
    }

    // Giọng có hỗ trợ thẻ cảm xúc? (chỉ VieNeu v3 Turbo)
    function isCueCapable(voiceId) {
        return _voice(voiceId).engine === 'vieneu';
    }

    // Bỏ mọi thẻ cảm xúc đã biết khỏi text (cho engine không hỗ trợ) + gom khoảng trắng.
    function stripCues(text) {
        let t = String(text || '');
        for (const c of CUES) t = t.split(c.token).join(' ');
        return t.replace(/\s{2,}/g, ' ').trim();
    }

    // ---------------- SERIALIZE inference (BẮT BUỘC) ----------------
    // ONNX Runtime Web KHÔNG an toàn khi 2 inference chạy ĐỒNG THỜI trên cùng
    // 1 session → input tensor hỏng → "Gather idx out of bounds" / "reading null".
    // Tái hiện: bấm "Nghe mẫu" (đang chạy) rồi "Tạo giọng đọc" → 2 synth() chồng.
    // → Khoá toàn cục: mọi inference (MMS + Piper) xếp hàng, mỗi lúc chỉ 1 chạy.
    let _ttsLock = Promise.resolve();
    function _serialize(fn) {
        const run = _ttsLock.then(fn, fn); // chạy sau khi cái trước settle (kể cả lỗi)
        _ttsLock = run.then(
            () => {},
            () => {}
        ); // giữ chuỗi sống, không lan lỗi sang job sau
        return run;
    }

    // ---------------- MMS (transformers.js) ----------------
    let _mmsPromise = null;
    async function _getMms(onStatus) {
        if (_mmsPromise) return _mmsPromise;
        _mmsPromise = (async () => {
            onStatus && onStatus('Đang tải thư viện giọng (MMS)…');
            const { pipeline, env } = await import(/* @vite-ignore */ TJS_URL);
            try {
                env.allowLocalModels = false;
                if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
            } catch {}
            onStatus && onStatus('Đang tải model MMS (lần đầu ~vài chục MB, sau cache)…');
            return pipeline('text-to-speech', MMS_ID);
        })().catch((e) => {
            _mmsPromise = null;
            throw e;
        });
        return _mmsPromise;
    }
    async function _mmsChunk(text, onStatus) {
        const synth = await _getMms(onStatus);
        const out = await _serialize(() => synth(text)); // không để 2 inference chồng
        return { samples: out.audio, sampleRate: out.sampling_rate || 16000 };
    }

    // ---------------- Piper (vits-web) ----------------
    let _piperPromise = null;
    async function _getPiper(onStatus) {
        if (_piperPromise) return _piperPromise;
        _piperPromise = (async () => {
            onStatus && onStatus('Đang tải engine giọng (Piper)…');
            const mod = await import(/* @vite-ignore */ PIPER_URL);
            return mod.default || mod;
        })().catch((e) => {
            _piperPromise = null;
            throw e;
        });
        return _piperPromise;
    }
    async function _piperChunk(text, voiceId, onStatus) {
        const tts = await _getPiper(onStatus);
        onStatus && onStatus('Đang tạo giọng (lần đầu tải model giọng ~vài chục MB)…');
        const wav = await _serialize(() => tts.predict({ text, voiceId })); // serialize như MMS
        const ab = await wav.arrayBuffer();
        const ac = _decodeCtx();
        const buf = await ac.decodeAudioData(ab);
        return { samples: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate };
    }

    // ---------------- VieNeu (server, clone giọng) ----------------
    async function _vieneuChunk(text, v, onStatus) {
        if (!global.Web2Vieneu) throw new Error('Chưa tải module VieNeu (web2-vieneu.js)');
        onStatus && onStatus('Đang tạo giọng VieNeu trên server máy shop…');
        if (v.cloneRef) return global.Web2Vieneu.clone(text, v.cloneRef); // nhái giọng mẫu
        return global.Web2Vieneu.synthesize(text, v.vieneuVoice || v.voiceId || v.id);
    }

    let _dctx = null;
    function _decodeCtx() {
        if (!_dctx) _dctx = new (global.AudioContext || global.webkitAudioContext)();
        return _dctx;
    }

    // ---------------- pitch (resample, ghép pitch+tempo) ----------------
    function _resample(samples, factor) {
        if (!factor || factor === 1) return samples;
        const outLen = Math.max(1, Math.round(samples.length / factor));
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const src = i * factor;
            const i0 = Math.floor(src);
            const frac = src - i0;
            const a = samples[i0] || 0;
            const b = samples[i0 + 1] != null ? samples[i0 + 1] : a;
            out[i] = a + (b - a) * frac;
        }
        return out;
    }

    // ---------------- public synthesize ----------------
    async function synthesize(text, opts = {}) {
        const onStatus = opts.onStatus;
        const clean = String(text || '').trim();
        if (!clean) throw new Error('Chưa có nội dung lời đọc');
        const v = _voice(opts.voiceId);
        // Thẻ cảm xúc chỉ VieNeu hiểu — engine khác bỏ token để khỏi đọc literal.
        const work = v.engine === 'vieneu' ? clean : stripCues(clean);
        const chunks = _splitSentences(work);
        const parts = [];
        let sampleRate = 16000;
        for (let i = 0; i < chunks.length; i++) {
            onStatus && onStatus(`Đang tạo giọng đọc… (${i + 1}/${chunks.length})`);
            const r =
                v.engine === 'mms'
                    ? await _mmsChunk(chunks[i], onStatus)
                    : v.engine === 'vieneu'
                      ? await _vieneuChunk(chunks[i], v, onStatus)
                      : await _piperChunk(chunks[i], v.voiceId, onStatus);
            sampleRate = r.sampleRate;
            parts.push(r.samples);
            if (i < chunks.length - 1) parts.push(new Float32Array(Math.round(sampleRate * 0.18)));
        }
        let samples = _concat(parts);
        const pitch = Number(opts.pitch) || 1;
        if (pitch !== 1) samples = _resample(samples, pitch);
        return { samples, sampleRate };
    }

    function _concat(parts) {
        const total = parts.reduce((n, a) => n + a.length, 0);
        const out = new Float32Array(total);
        let off = 0;
        for (const a of parts) {
            out.set(a, off);
            off += a.length;
        }
        return out;
    }

    function _splitSentences(text) {
        const raw = text
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?…\n])\s+|\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const out = [];
        let buf = '';
        for (const s of raw) {
            if ((buf + ' ' + s).trim().length > 200 && buf) {
                out.push(buf.trim());
                buf = s;
            } else buf = buf ? buf + ' ' + s : s;
        }
        if (buf) out.push(buf.trim());
        return out.length ? out : [text];
    }

    function toAudioBuffer(audioCtx, samples, sampleRate) {
        const buf = audioCtx.createBuffer(1, samples.length, sampleRate);
        // Fallback Safari/iOS cũ thiếu copyToChannel (audit r4) — khớp web2-video-audio.js.
        if (buf.copyToChannel) buf.copyToChannel(samples, 0);
        else buf.getChannelData(0).set(samples);
        return buf;
    }

    // ----- fallback giọng hệ điều hành (nghe nhanh, KHÔNG mux) -----
    function speakPreview(text) {
        try {
            if (!global.speechSynthesis) return false;
            global.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text || ''));
            const vis = global.speechSynthesis.getVoices() || [];
            const vi = vis.find(
                (v) => /vi[-_]?VN|Vietnam/i.test(v.lang) || /Vietnam/i.test(v.name)
            );
            if (vi) u.voice = vi;
            u.lang = 'vi-VN';
            global.speechSynthesis.speak(u);
            return true;
        } catch {
            return false;
        }
    }
    function cancelPreview() {
        try {
            global.speechSynthesis?.cancel();
        } catch {}
    }

    // Thêm/cập nhật giọng VieNeu (server) + giọng đã clone vào danh sách VOICES.
    // serverVoices: [{label, voice_id}] từ Web2Vieneu.listVoices(); clonedRef: Blob|null.
    function registerVieneuVoices(serverVoices, clonedRef) {
        for (let i = VOICES.length - 1; i >= 0; i--) {
            if (VOICES[i].engine === 'vieneu') VOICES.splice(i, 1);
        }
        if (clonedRef) {
            VOICES.push({
                id: 'vieneu-clone',
                engine: 'vieneu',
                label: '⭐ Giọng của tôi (clone)',
                cloneRef: clonedRef,
            });
        }
        (serverVoices || []).forEach((sv) => {
            VOICES.push({
                id: 'vieneu-' + sv.voice_id,
                engine: 'vieneu',
                label: '🎙️ ' + (sv.label || sv.voice_id),
                vieneuVoice: sv.voice_id,
            });
        });
        return VOICES.filter((v) => v.engine === 'vieneu');
    }

    global.Web2VideoTTS = {
        VOICES,
        TONES,
        CUES,
        SAMPLE_TEXT,
        synthesize,
        toAudioBuffer,
        speakPreview,
        cancelPreview,
        registerVieneuVoices,
        isCueCapable,
        stripCues,
    };
})(window);
