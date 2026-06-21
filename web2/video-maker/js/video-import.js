// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoImport — IMPORT 1 video có sẵn để LỒNG TIẾNG (voiceover).
 *
 * Khi có video: video-maker bỏ slideshow ảnh, vẽ KHUNG HÌNH video lên canvas + mux
 * giọng đọc (TTS) + nhạc nền + TIẾNG GỐC video (slider chỉnh âm lượng). Xuất ra video
 * mới (re-encode qua canvas.captureStream + MediaRecorder — đường duy nhất in-browser).
 *
 * 100% trên máy (object URL, không taint canvas → xuất được). Tiếng gốc lấy qua
 * MediaElementAudioSourceNode (tạo 1 lần / element, reconnect gain sang đích mới).
 *
 *   await Web2VideoImport.load(file)         → { name, duration, w, h }
 *   Web2VideoImport.clear()
 *   Web2VideoImport.isActive()
 *   Web2VideoImport.el()                     → HTMLVideoElement
 *   Web2VideoImport.draw(ctx, W, H)          → vẽ khung hình hiện tại (contain-fit)
 *   Web2VideoImport.connect(audioCtx, dest)  → nối tiếng gốc → gain(volume) → dest
 *   Web2VideoImport.disconnect()
 *   Web2VideoImport.setVolume(v) / getVolume()
 */
(function (global) {
    'use strict';

    const st = {
        el: null,
        url: '',
        name: '',
        duration: 0,
        w: 0,
        h: 0,
        volume: 0.2, // tiếng gốc mặc định NHỎ dưới giọng đọc
        _srcNode: null,
        _gain: null,
        _ctx: null,
    };

    function isActive() {
        return !!st.el;
    }
    function el() {
        return st.el;
    }
    function getVolume() {
        return st.volume;
    }
    function setVolume(v) {
        st.volume = Math.max(0, Math.min(1, Number(v) || 0));
        if (st._gain) st._gain.gain.value = st.volume;
    }

    function load(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('Thiếu file video'));
            clear();
            const url = URL.createObjectURL(file);
            const v = document.createElement('video');
            v.preload = 'auto';
            v.playsInline = true;
            v.crossOrigin = 'anonymous';
            // ẩn nhưng vẫn decode khung hình (off-screen, không display:none)
            v.style.cssText =
                'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
            v.muted = false;
            v.src = url;
            const onReady = () => {
                st.el = v;
                st.url = url;
                st.name = file.name || 'video';
                st.duration = v.duration || 0;
                st.w = v.videoWidth || 0;
                st.h = v.videoHeight || 0;
                document.body.appendChild(v);
                resolve({ name: st.name, duration: st.duration, w: st.w, h: st.h });
            };
            v.addEventListener('loadedmetadata', onReady, { once: true });
            v.addEventListener(
                'error',
                () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Không đọc được video (codec không hỗ trợ?)'));
                },
                { once: true }
            );
        });
    }

    function clear() {
        try {
            disconnect();
        } catch {}
        if (st.el) {
            try {
                st.el.pause();
            } catch {}
            try {
                st.el.remove();
            } catch {}
        }
        if (st.url) {
            try {
                URL.revokeObjectURL(st.url);
            } catch {}
        }
        st.el = null;
        st.url = '';
        st.name = '';
        st.duration = 0;
        st.w = 0;
        st.h = 0;
        st._srcNode = null;
        st._gain = null;
    }

    // vẽ khung hình hiện tại của video lên canvas (contain-fit, nền đen)
    function draw(ctx, W, H) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const v = st.el;
        if (!v || !v.videoWidth) return;
        const ir = v.videoWidth / v.videoHeight;
        const dr = W / H;
        let dw, dh;
        if (ir > dr) {
            dw = W;
            dh = W / ir;
        } else {
            dh = H;
            dw = H * ir;
        }
        try {
            ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        } catch {}
    }

    // nối tiếng gốc video → gain(volume) → dest. MediaElementSource tạo 1 LẦN/element.
    function connect(audioCtx, dest) {
        if (!st.el || !audioCtx) return null;
        st._ctx = audioCtx;
        if (!st._srcNode) {
            try {
                st._srcNode = audioCtx.createMediaElementSource(st.el);
                st._gain = audioCtx.createGain();
                st._srcNode.connect(st._gain);
            } catch (e) {
                // đã tạo source trước đó cho element này → dùng lại gain
            }
        }
        if (st._gain) {
            st._gain.gain.value = st.volume;
            try {
                st._gain.disconnect();
            } catch {}
            st._gain.connect(dest || audioCtx.destination);
        }
        return st._gain;
    }
    function disconnect() {
        if (st._gain) {
            try {
                st._gain.disconnect();
            } catch {}
        }
    }

    global.Web2VideoImport = {
        load,
        clear,
        isActive,
        el,
        draw,
        connect,
        disconnect,
        setVolume,
        getVolume,
    };
})(window);
