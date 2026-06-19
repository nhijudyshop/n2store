// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoTTS — giọng đọc tiếng Việt ON-DEVICE (miễn phí, không server).
 *
 * Engine chính: MMS-TTS tiếng Việt (Xenova/mms-tts-vie) chạy bằng transformers.js
 * (ONNX/WASM) NGAY TRONG TRÌNH DUYỆT → trả Float32Array audio (16kHz) → mux thẳng
 * vào video xuất ra. Lazy-load lib + model từ CDN khi user bấm tạo (lần đầu tải
 * model ~vài chục MB, sau đó cache trong trình duyệt).
 *
 *   await Web2VideoTTS.synthesize(text, { onStatus })   → { samples:Float32Array, sampleRate }
 *   Web2VideoTTS.speakPreview(text)                      → đọc nhanh bằng giọng hệ điều hành (fallback, KHÔNG mux)
 *   Web2VideoTTS.cancelPreview()
 *
 * Vì sao MMS-TTS: Kokoro KHÔNG có tiếng Việt; MMS-TTS-vie (Facebook) có, ONNX-hoá
 * sẵn cho transformers.js, chạy offline trên máy → free + riêng tư + mux được.
 */
(function (global) {
    'use strict';

    // CDN transformers.js v3 (esm). Pin version để ổn định.
    const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
    const MODEL_ID = 'Xenova/mms-tts-vie';

    let _pipePromise = null;

    async function _getPipe(onStatus) {
        if (_pipePromise) return _pipePromise;
        _pipePromise = (async () => {
            onStatus && onStatus('Đang tải thư viện giọng đọc…');
            const tjs = await import(/* @vite-ignore */ TJS_URL);
            const { pipeline, env } = tjs;
            // Chỉ tải model từ HF CDN, không tìm local; bật cache trình duyệt.
            try {
                env.allowLocalModels = false;
                if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
            } catch {}
            onStatus &&
                onStatus('Đang tải model giọng Việt (lần đầu ~vài chục MB, sau cache lại)…');
            const synth = await pipeline('text-to-speech', MODEL_ID, {
                progress_callback: (p) => {
                    if (p && p.status === 'progress' && p.file && onStatus) {
                        const pct = p.progress ? ` ${Math.round(p.progress)}%` : '';
                        onStatus(`Tải model: ${p.file}${pct}`);
                    }
                },
            });
            return synth;
        })().catch((e) => {
            _pipePromise = null; // cho phép thử lại
            throw e;
        });
        return _pipePromise;
    }

    // Sinh giọng đọc. text dài → tách câu, ghép samples (MMS xử lý câu ngắn tốt hơn).
    async function synthesize(text, opts = {}) {
        const onStatus = opts.onStatus;
        const clean = String(text || '').trim();
        if (!clean) throw new Error('Chưa có nội dung lời đọc');
        const synth = await _getPipe(onStatus);
        onStatus && onStatus('Đang tạo giọng đọc…');
        const chunks = _splitSentences(clean);
        const parts = [];
        let sampleRate = 16000;
        for (let i = 0; i < chunks.length; i++) {
            onStatus && onStatus(`Đang tạo giọng đọc… (${i + 1}/${chunks.length})`);
            const out = await synth(chunks[i]);
            sampleRate = out.sampling_rate || sampleRate;
            parts.push(out.audio);
            // chèn khoảng lặng ngắn giữa câu (~180ms)
            if (i < chunks.length - 1) parts.push(new Float32Array(Math.round(sampleRate * 0.18)));
        }
        const total = parts.reduce((n, a) => n + a.length, 0);
        const samples = new Float32Array(total);
        let off = 0;
        for (const a of parts) {
            samples.set(a, off);
            off += a.length;
        }
        return { samples, sampleRate };
    }

    function _splitSentences(text) {
        // tách theo câu/dòng, gộp lại để mỗi chunk không quá dài (~220 ký tự).
        const raw = text
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?…\n])\s+|\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const out = [];
        let buf = '';
        for (const s of raw) {
            if ((buf + ' ' + s).trim().length > 220 && buf) {
                out.push(buf.trim());
                buf = s;
            } else {
                buf = buf ? buf + ' ' + s : s;
            }
        }
        if (buf) out.push(buf.trim());
        return out.length ? out : [text];
    }

    // Build AudioBuffer từ samples (cần AudioContext của caller).
    function toAudioBuffer(audioCtx, samples, sampleRate) {
        const buf = audioCtx.createBuffer(1, samples.length, sampleRate);
        buf.copyToChannel(samples, 0);
        return buf;
    }

    // ----- fallback: giọng hệ điều hành (KHÔNG mux được, chỉ nghe thử) -----
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

    global.Web2VideoTTS = { synthesize, toAudioBuffer, speakPreview, cancelPreview, MODEL_ID };
})(window);
