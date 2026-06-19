// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoAudio — XỬ LÝ ÂM THANH cho video, 100% on-device (Web Audio, KHÔNG server):
 *   • chèn / ghép nhạc nền (mix với giọng đọc, chỉnh âm lượng từng kênh)
 *   • tách nhạc karaoke (khử kênh giữa L−R): lấy NHẠC (bỏ giọng) + GIỌNG (mid)
 *   • trích audio từ file VIDEO (decodeAudioData) → AudioBuffer
 *   • xuất AudioBuffer ra file WAV (.wav) tải về
 *   • dựng graph phát/ghi: giọng đọc + nhạc nền → 1 đích (preview / MediaRecorder)
 *
 * Karaoke L−R chỉ hiệu quả với nhạc STEREO có giọng pan giữa — gần đúng, không
 * hoàn hảo như AI server. Mono thì không tách được.
 */
(function (global) {
    'use strict';

    let _ac = null;
    function ac() {
        if (!_ac) _ac = new (global.AudioContext || global.webkitAudioContext)();
        return _ac;
    }

    // Giải mã file (audio HOẶC video) → AudioBuffer. decodeAudioData rút đường
    // tiếng ra khỏi mp4/webm (tùy codec trình duyệt hỗ trợ — AAC ok trên Chrome/Safari).
    async function decodeFile(file) {
        const buf = await file.arrayBuffer();
        return await ac().decodeAudioData(buf);
    }
    const extractAudioFromVideo = decodeFile; // alias rõ nghĩa ("trích audio từ video")

    // Tách karaoke: trả { music, vocals } (AudioBuffer mono).
    //   music  = L − R  (khử giọng pan giữa → còn nhạc)
    //   vocals = (L+R)/2 (mid → chủ yếu giọng)
    function karaokeSplit(audioBuffer) {
        const n = audioBuffer.length;
        const sr = audioBuffer.sampleRate;
        const ch = audioBuffer.numberOfChannels;
        if (ch < 2) return { music: null, vocals: null, mono: true };
        const L = audioBuffer.getChannelData(0);
        const Rc = audioBuffer.getChannelData(1);
        const a = ac();
        const music = a.createBuffer(1, n, sr);
        const vocals = a.createBuffer(1, n, sr);
        const md = music.getChannelData(0);
        const vd = vocals.getChannelData(0);
        for (let i = 0; i < n; i++) {
            md[i] = (L[i] - Rc[i]) * 0.85; // bù biên độ sau khi trừ
            vd[i] = (L[i] + Rc[i]) * 0.5;
        }
        return { music, vocals, mono: false };
    }

    // AudioBuffer → Blob WAV (PCM 16-bit, đa kênh).
    function bufferToWavBlob(audioBuffer) {
        const ch = audioBuffer.numberOfChannels;
        const sr = audioBuffer.sampleRate;
        const n = audioBuffer.length;
        const bytesPerSample = 2;
        const blockAlign = ch * bytesPerSample;
        const dataLen = n * blockAlign;
        const buffer = new ArrayBuffer(44 + dataLen);
        const view = new DataView(buffer);
        const wstr = (off, s) => {
            for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
        };
        wstr(0, 'RIFF');
        view.setUint32(4, 36 + dataLen, true);
        wstr(8, 'WAVE');
        wstr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, ch, true);
        view.setUint32(24, sr, true);
        view.setUint32(28, sr * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        wstr(36, 'data');
        view.setUint32(40, dataLen, true);
        const chans = [];
        for (let c = 0; c < ch; c++) chans.push(audioBuffer.getChannelData(c));
        let off = 44;
        for (let i = 0; i < n; i++) {
            for (let c = 0; c < ch; c++) {
                let s = Math.max(-1, Math.min(1, chans[c][i]));
                view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
                off += 2;
            }
        }
        return new Blob([buffer], { type: 'audio/wav' });
    }

    function downloadWav(audioBuffer, filename) {
        const blob = bufferToWavBlob(audioBuffer);
        const a = document.createElement('a');
        a.download = (filename || 'audio') + '.wav';
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 6000);
        return blob;
    }

    // Dựng graph trộn giọng đọc + nhạc nền → 1 AudioNode đích (ac.destination để
    // preview, hoặc MediaStreamAudioDestinationNode để ghi). Trả { start, stop, hasAudio }.
    //   opts = { audioCtx, dest, narrationBuffer, narrationVol, musicBuffer, musicVol,
    //            loopMusic, durationSec }
    function buildMixGraph(opts) {
        const a = opts.audioCtx || ac();
        const dest = opts.dest || a.destination;
        const nodes = [];
        const add = (buffer, vol, loop) => {
            if (!buffer) return;
            const src = a.createBufferSource();
            src.buffer = buffer;
            src.loop = !!loop;
            const g = a.createGain();
            g.gain.value = vol == null ? 1 : vol;
            src.connect(g).connect(dest);
            nodes.push(src);
        };
        add(opts.narrationBuffer, opts.narrationVol, false);
        add(opts.musicBuffer, opts.musicVol, opts.loopMusic !== false);
        return {
            hasAudio: nodes.length > 0,
            start() {
                nodes.forEach((s) => {
                    try {
                        s.start();
                    } catch {}
                });
            },
            stop() {
                nodes.forEach((s) => {
                    try {
                        s.stop();
                    } catch {}
                });
            },
        };
    }

    // tiện ích: float32 samples (TTS) → AudioBuffer mono
    function samplesToBuffer(samples, sampleRate) {
        if (!samples) return null;
        const b = ac().createBuffer(1, samples.length, sampleRate || 16000);
        b.copyToChannel ? b.copyToChannel(samples, 0) : b.getChannelData(0).set(samples);
        return b;
    }

    global.Web2VideoAudio = {
        ac,
        decodeFile,
        extractAudioFromVideo,
        karaokeSplit,
        bufferToWavBlob,
        downloadWav,
        buildMixGraph,
        samplesToBuffer,
    };
})(window);
