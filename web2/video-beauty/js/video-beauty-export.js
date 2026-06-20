// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoBeautyExport — XUẤT video đã làm đẹp, on-device. 2 chế độ:
 *   exportRealtime(o)   : MediaRecorder thời-gian-thực (mịn da + lọc màu), giữ
 *                         nguyên tiếng gốc. Mượt, full FPS. KHÔNG chỉnh mặt.
 *   exportRenderPass(o) : tua từng khung (WebCodecs + mp4-muxer) để CHỈNH MẶT
 *                         (nhận diện + warp mỗi khung) — chậm hơn realtime nhưng
 *                         FPS đầy đủ, có thanh tiến trình, mux lại tiếng gốc (AAC).
 *
 * o = { videoEl, file, work, wctx, view, vctx, settings, fps, onProgress, onStatus }
 * Trả về Blob video (mp4/webm).
 */
(function (global) {
    'use strict';
    if (global.Web2VideoBeautyExport) return;

    const R = () => global.Web2VideoBeautyRender;

    function pickMime() {
        const c = [
            'video/mp4;codecs=h264,aac',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        for (const m of c) {
            try {
                if (global.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
            } catch {}
        }
        return '';
    }

    function hasWebCodecs() {
        return (
            typeof global.VideoEncoder !== 'undefined' && typeof global.VideoFrame !== 'undefined'
        );
    }

    function seek(videoEl, t) {
        return new Promise((res) => {
            const done = () => {
                videoEl.removeEventListener('seeked', done);
                res();
            };
            videoEl.addEventListener('seeked', done);
            try {
                videoEl.currentTime = Math.min(t, (videoEl.duration || t) - 0.001);
            } catch {
                res();
            }
        });
    }

    // ---- realtime (mịn da + lọc màu, giữ tiếng) ----
    async function exportRealtime(o) {
        const { videoEl, work, wctx, view, vctx, settings, fps = 30, onProgress } = o;
        const stream = work.captureStream(fps);
        let vs = null;
        try {
            vs = videoEl.captureStream
                ? videoEl.captureStream()
                : videoEl.mozCaptureStream
                  ? videoEl.mozCaptureStream()
                  : null;
            if (vs) vs.getAudioTracks().forEach((t) => stream.addTrack(t));
        } catch {}
        try {
            const mime = pickMime();
            const rec = new MediaRecorder(
                stream,
                mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined
            );
            const chunks = [];
            rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
            const done = new Promise((r) => (rec.onstop = r));
            videoEl.muted = false;
            await seek(videoEl, 0);
            await videoEl.play();
            rec.start(100);
            const dur = videoEl.duration || 0;
            await new Promise((resolve) => {
                const step = () => {
                    if (videoEl.ended || videoEl.paused) return resolve();
                    R().applyFrame(videoEl, work, wctx, settings, null);
                    if (vctx && view.width > 0 && view.height > 0)
                        vctx.drawImage(work, 0, 0, view.width, view.height);
                    onProgress && onProgress(dur ? videoEl.currentTime / dur : 0);
                    if (videoEl.requestVideoFrameCallback) videoEl.requestVideoFrameCallback(step);
                    else requestAnimationFrame(step);
                };
                videoEl.onended = () => resolve();
                if (videoEl.requestVideoFrameCallback) videoEl.requestVideoFrameCallback(step);
                else requestAnimationFrame(step);
            });
            try {
                videoEl.pause();
            } catch {}
            rec.stop();
            await done;
            const outMime = (mime || 'video/webm').split(';')[0];
            return new Blob(chunks, { type: outMime });
        } finally {
            // dừng mọi track capture (canvas + video) tránh rò luồng giữ chạy nền
            try {
                stream.getTracks().forEach((t) => {
                    try {
                        t.stop();
                    } catch {}
                });
            } catch {}
            try {
                vs &&
                    vs.getTracks().forEach((t) => {
                        try {
                            t.stop();
                        } catch {}
                    });
            } catch {}
        }
    }

    // ---- render-pass (CHỈNH MẶT từng khung, WebCodecs + mp4-muxer) ----
    async function exportRenderPass(o) {
        const {
            videoEl,
            file,
            work,
            wctx,
            view,
            vctx,
            settings,
            fps = 25,
            onProgress,
            onStatus,
        } = o;
        if (!hasWebCodecs()) throw new Error('NO_WEBCODECS');
        onStatus && onStatus('Đang nạp bộ ghép MP4…');
        const mux = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs');
        const { Muxer, ArrayBufferTarget } = mux;
        const W = work.width;
        const H = work.height;
        const duration = videoEl.duration || 0;
        const frameCount = Math.max(1, Math.round(duration * fps));

        // tiếng gốc (giải mã 1 lần để mux lại)
        let audioBuf = null;
        try {
            if (file && global.Web2VideoAudio)
                audioBuf = await global.Web2VideoAudio.decodeFile(file);
        } catch {
            audioBuf = null;
        }
        const aCh = audioBuf ? Math.min(2, audioBuf.numberOfChannels) : 0;

        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: 'avc', width: W, height: H },
            audio: audioBuf
                ? { codec: 'aac', sampleRate: audioBuf.sampleRate, numberOfChannels: aCh }
                : undefined,
            fastStart: 'in-memory',
        });

        const venc = new global.VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => console.error('[video-beauty] venc', e),
        });
        venc.configure({
            codec: 'avc1.42001f',
            width: W,
            height: H,
            bitrate: 6_000_000,
            framerate: fps,
        });

        try {
            onStatus && onStatus('Đang xử lý từng khung…');
            const wantFace = (settings.face || 0) > 0 && global.Web2BeautyFace;
            for (let i = 0; i < frameCount; i++) {
                const t = i / fps;
                await seek(videoEl, t);
                // vẽ khung thô để nhận diện mặt (nếu cần)
                let det = null;
                if (wantFace) {
                    wctx.filter = 'none';
                    try {
                        wctx.drawImage(videoEl, 0, 0, W, H);
                    } catch {}
                    det = await global.Web2BeautyFace.detect(work).catch(() => null);
                }
                R().applyFrame(videoEl, work, wctx, settings, det);
                if (vctx && view.width > 0 && view.height > 0)
                    vctx.drawImage(work, 0, 0, view.width, view.height);
                const frame = new global.VideoFrame(work, {
                    timestamp: Math.round(t * 1e6),
                    duration: Math.round(1e6 / fps),
                });
                venc.encode(frame, { keyFrame: i % fps === 0 });
                frame.close();
                if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 6));
                onProgress && onProgress((i / frameCount) * (audioBuf ? 0.9 : 1));
            }
            await venc.flush();

            // mux tiếng gốc (AAC) nếu giải mã được + có AudioEncoder
            if (audioBuf && typeof global.AudioEncoder !== 'undefined') {
                try {
                    onStatus && onStatus('Đang ghép tiếng…');
                    await encodeAudio(audioBuf, aCh, muxer, onProgress);
                } catch (e) {
                    console.warn('[video-beauty] audio mux lỗi, xuất không tiếng:', e);
                }
            }
            muxer.finalize();
            return new Blob([muxer.target.buffer], { type: 'video/mp4' });
        } finally {
            // luôn đóng video encoder dù thành công hay lỗi (tránh rò WebCodecs)
            try {
                if (venc.state !== 'closed') venc.close();
            } catch {}
        }
    }

    // Mã hoá AudioBuffer → AAC chunks vào muxer (f32-planar).
    async function encodeAudio(audioBuf, aCh, muxer, onProgress) {
        const sr = audioBuf.sampleRate;
        const aenc = new global.AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => console.error('[video-beauty] aenc', e),
        });
        aenc.configure({
            codec: 'mp4a.40.2',
            sampleRate: sr,
            numberOfChannels: aCh,
            bitrate: 128000,
        });
        try {
            const total = audioBuf.length;
            const CH = 1024;
            const chans = [];
            for (let c = 0; c < aCh; c++) chans.push(audioBuf.getChannelData(c));
            for (let off = 0; off < total; off += CH) {
                const n = Math.min(CH, total - off);
                const data = new Float32Array(n * aCh); // planar: [ch0...][ch1...]
                for (let c = 0; c < aCh; c++) data.set(chans[c].subarray(off, off + n), c * n);
                const ad = new global.AudioData({
                    format: 'f32-planar',
                    sampleRate: sr,
                    numberOfFrames: n,
                    numberOfChannels: aCh,
                    timestamp: Math.round((off / sr) * 1e6),
                    data,
                });
                aenc.encode(ad);
                ad.close();
                if (aenc.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 4));
                onProgress && onProgress(0.9 + (off / total) * 0.1);
            }
            await aenc.flush();
        } finally {
            // luôn đóng audio encoder dù thành công hay lỗi (tránh rò WebCodecs)
            try {
                if (aenc.state !== 'closed') aenc.close();
            } catch {}
        }
    }

    global.Web2VideoBeautyExport = { exportRealtime, exportRenderPass, hasWebCodecs, pickMime };
})(window);
