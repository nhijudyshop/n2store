// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — base namespace `window.PS`: state + hằng số + util dùng chung.
 *
 * Đây là module ĐẦU TIÊN trong chuỗi script (state → canvas → bg → edit → ui → app).
 * Mọi module sau gắn hàm vào `window.PS` và đọc/ghi `PS.state` / `PS.el` /
 * các canvas dùng chung (`PS.octx`, `PS.maskC`, …). Không tách state ra nhiều nơi.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- Constants ------------------------------------------------------
    PS.PREVIEW_MAX_W = 1080;
    PS.CAPTURE_MAX_LONG = 2400;
    PS.MEDIAPIPE_BASE =
        'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';
    // Engine "AI nhanh" mới: MediaPipe Tasks Vision ImageSegmenter (GPU delegate,
    // nhanh hơn nhiều bản Solution cũ). Legacy giữ làm fallback.
    PS.TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
    PS.SELFIE_MODEL =
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
    PS.SEG_INPUT_W = 256; // downscale khung gửi model → nhanh + loop mask nhỏ
    PS.IMGLY_URL = 'https://esm.sh/@imgly/background-removal@1.5.5';
    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    PS.CUTOUT_API =
        (global.API_CONFIG?.WORKER_URL ||
            global.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/cutout';

    PS.state = {
        mode: 'ai', // mặc định AI nhanh (tức thì). 'hq' AI nét chậm hơn nhưng sắc | 'chroma'
        hqEngine: 'auto', // mặc định Cloud HD (withoutbg, HD, no watermark) → fallback @imgly. 'local' = luôn @imgly
        source: 'camera', // 'camera' | 'image'
        bgType: 'transparent', // 'transparent'|'color'|'image'|'blur'|'preset'
        bgColor: '#ffffff',
        bgImage: null,
        bgPreset: null, // id preset gradient đang chọn
        bgKey: 'transparent', // key chip đang active (đồng bộ 2 hàng)
        savedBgs: [], // [{id,url}] nền ảnh user đã lưu (localStorage)
        blurStrength: 12,
        key: { r: 0, g: 177, b: 64 },
        threshold: 0.45,
        smooth: 0.1,
        feather: 2,
        spill: true,
        mirror: true,
        upscale: false, // AI upscale ×2 khi xuất
        format: 'png', // 'png' | 'jpg' | 'webp'
        quality: 0.92, // chất lượng jpg/webp
        shadow: true, // bóng đổ dưới chủ thể (khi nền không trong suốt)
        shadowSoft: 20, // độ mềm bóng (blur px)
        enhance: false, // tự động đẹp (sáng/tương phản/rực)
        exportPx: 0, // khổ xuất cạnh dài (0 = giữ gốc) — preset sàn TMĐT
        market: '', // id preset sàn đang chọn
        logoImg: null, // ảnh logo (Image)
        logoOn: false,
        logoPos: 'br', // br|bl|tr|tl
        _sil: null, // silhouette đen của cutout (cache cho bóng đổ)
        // transform chủ thể trên nền (di chuyển/phóng to)
        tx: 0,
        ty: 0,
        scale: 1,
        brushMode: false, // sửa viền
        brushTool: 'erase', // 'erase' | 'restore'
        brushSize: 40, // px màn hình
        pickMode: false, // chọn đúng món (MobileSAM)
        pickTool: 'add', // 'add' (điểm giữ) | 'remove' (điểm bỏ)
        aspect: 0.8, // mặc định 4:5 (chuẩn ảnh sản phẩm)
        facingMode: 'user',
        srcNatW: 0,
        srcNatH: 0,
        crop: { sx: 0, sy: 0, sw: 0, sh: 0 },
        stream: null,
        running: false,
        busy: false,
        rafId: 0,
        seg: null,
        segReady: false,
        modelLoaded: false,
        W: 0,
        H: 0,
        _sourceImg: null,
        _fpsT: 0,
        _fpsN: 0,
        _capBusy: false,
        // review state
        _cutout: null, // canvas: chủ thể nền trong suốt (capture res, chưa mirror)
        _capFrame: null, // canvas: khung hình gốc đã crop (cho nền mờ)
        _capW: 0,
        _capH: 0,
    };

    PS.el = {};
    // Canvas dùng chung (gán trong PS.init ở canvas module). Để null ban đầu.
    PS.work = null;
    PS.workCtx = null; // chroma realtime
    PS.maskC = null;
    PS.maskCtx = null; // mask đã crop ở preview res (dùng chung 2 engine)
    PS.segInput = null;
    PS.segInputCtx = null; // khung downscale gửi segmenter
    PS.maskRaw = null;
    PS.maskRawCtx = null; // mask thô từ tasks-vision (alpha)
    PS.octx = null; // live output ctx
    PS.rctx = null; // review ctx
    PS.imglyMod = null;

    // ---- Util: DOM / notify / loading -----------------------------------
    PS.activate = function (list, active) {
        list.forEach((n) => n.classList.remove('is-active'));
        if (active) active.classList.add('is-active');
    };
    PS.hexToRgb = function (hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m
            ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
            : { r: 0, g: 177, b: 64 };
    };
    PS.rgbToHex = function (r, g, b) {
        return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    PS.relucide = function () {
        if (global.lucide) {
            try {
                global.lucide.createIcons();
            } catch {}
        }
    };
    PS.showLoading = function (t) {
        PS.el.loadingText.textContent = t || 'Đang xử lý…';
        PS.el.stageLoading.hidden = false;
    };
    PS.hideLoading = function () {
        PS.el.stageLoading.hidden = true;
    };
    PS.notify = function (msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[photo-studio]', type || 'info', msg);
    };

    // ---- Util: env / math -----------------------------------------------
    PS.isMobile = function () {
        return (
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches)
        );
    };
    PS.isIOS = function () {
        return (
            /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        );
    };
    PS.browserName = function () {
        const ua = navigator.userAgent;
        if (/CriOS/i.test(ua)) return 'Chrome';
        if (/FxiOS/i.test(ua)) return 'Firefox';
        if (/EdgiOS/i.test(ua)) return 'Edge';
        return 'Safari';
    };
    PS.clamp = function (v, a, b) {
        return Math.max(a, Math.min(b, v));
    };
    PS.stamp = function () {
        const d = new Date(),
            p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    };

    // ---- Util: sizing / source / fps ------------------------------------
    PS.sizeCanvas = function (c, w, h) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
    };
    PS.currentSourceEl = function () {
        const state = PS.state;
        return state.source === 'image' ? state._sourceImg : PS.el.video;
    };
    PS.captureSize = function (crop) {
        const scale = Math.min(1, PS.CAPTURE_MAX_LONG / Math.max(crop.sw, crop.sh));
        return { W: Math.round(crop.sw * scale), H: Math.round(crop.sh * scale) };
    };
    PS.cropRect = function (natW, natH) {
        const state = PS.state;
        if (!state.aspect) return { sx: 0, sy: 0, sw: natW, sh: natH };
        const target = state.aspect;
        const r = natW / natH;
        let cw = natW,
            ch = natH;
        if (r > target) cw = natH * target;
        else ch = natW / target;
        return { sx: (natW - cw) / 2, sy: (natH - ch) / 2, sw: cw, sh: ch };
    };
    PS.recomputeSizes = function () {
        const state = PS.state;
        const { srcNatW: w, srcNatH: h } = state;
        if (!w || !h) return;
        state.crop = PS.cropRect(w, h);
        const { sw, sh } = state.crop;
        const scale = Math.min(1, PS.PREVIEW_MAX_W / sw);
        state.W = Math.round(sw * scale);
        state.H = Math.round(sh * scale);
        PS.sizeCanvas(PS.el.output, state.W, state.H);
        PS.sizeCanvas(PS.work, state.W, state.H);
    };
    PS.tickFps = function () {
        const state = PS.state;
        const now = performance.now();
        state._fpsN++;
        if (now - state._fpsT >= 1000) {
            PS.el.fps.hidden = false;
            PS.el.fps.textContent = state._fpsN + ' FPS';
            state._fpsN = 0;
            state._fpsT = now;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
