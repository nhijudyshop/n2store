// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Studio chụp tách nền — giao diện camera-app mobile-first.
 *
 * Luồng: Camera (live) → Chụp → Xem (review) → chọn nền + Lưu ảnh.
 *  - Mode "AI nét" (mặc định): tách nền chất lượng cao. Engine 'auto' = PhotoRoom
 *    cloud, tự fallback @imgly on-device nếu lỗi/mất mạng. 'local' = luôn @imgly.
 *  - Mode "AI nhanh": MediaPipe realtime (xem trước trực tiếp).
 *  - Mode "Phông xanh": chroma key.
 *
 * Tách nền tạo ra "cutout" (chủ thể nền trong suốt). Màn Xem ghép cutout với nền
 * (trong suốt/màu/ảnh/mờ) theo thời gian thực — đổi nền không cần tách lại.
 * Lưu ảnh qua Web Share API (vào Ảnh điện thoại) → fallback tải về.
 *
 * Không backend cho on-device; cloud chỉ proxy PhotoRoom. Ảnh không lưu ở server.
 */
(function (global) {
    'use strict';

    const PREVIEW_MAX_W = 1080;
    const CAPTURE_MAX_LONG = 2400;
    const MEDIAPIPE_BASE =
        'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';
    const IMGLY_URL = 'https://esm.sh/@imgly/background-removal@1.5.5';
    const CUTOUT_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/cutout';

    const state = {
        mode: 'hq', // 'hq' | 'ai' | 'chroma'
        hqEngine: 'auto', // 'auto' (cloud→fallback) | 'local'
        source: 'camera', // 'camera' | 'image'
        bgType: 'transparent',
        bgColor: '#ffffff',
        bgImage: null,
        blurStrength: 12,
        key: { r: 0, g: 177, b: 64 },
        threshold: 0.45,
        smooth: 0.1,
        feather: 2,
        spill: true,
        mirror: true,
        format: 'png',
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

    const el = {};
    let work, workCtx; // chroma realtime
    let maskC, maskCtx; // latest AI mask
    let octx; // live output ctx
    let rctx; // review ctx
    let imglyMod = null;

    // ---- Init -----------------------------------------------------------
    function init() {
        cache();
        if (!el.output) return;
        octx = el.output.getContext('2d', { willReadFrequently: true });
        rctx = el.reviewCanvas.getContext('2d');
        work = document.createElement('canvas');
        workCtx = work.getContext('2d', { willReadFrequently: true });
        maskC = document.createElement('canvas');
        maskCtx = maskC.getContext('2d');
        bind();
        initSegmentation();
        applyMobileDefaults();
        setMode('hq');
        autoStartIfAllowed();
    }

    function cache() {
        const id = (x) => document.getElementById(x);
        [
            'camera:psCamera',
            'review:psReview',
            'sheet:psSheet',
            'sheetBackdrop:psSheetBackdrop',
            'stage:psStage',
            'output:psOutput',
            'video:psVideo',
            'stageEmpty:psStageEmpty',
            'stageLoading:psStageLoading',
            'loadingText:psLoadingText',
            'hqHint:psHqHint',
            'fps:psFps',
            'modePills:psModePills',
            'startCam:psStartCam',
            'capture:psCapture',
            'switchCam:psSwitchCam',
            'sourceFile:psSourceFile',
            'sampleHint:psSampleHint',
            'optionsToggle:psOptionsToggle',
            'sheetClose:psSheetClose',
            'reviewBack:psReviewBack',
            'reviewMeta:psReviewMeta',
            'reviewStage:psReviewStage',
            'reviewCanvas:psReviewCanvas',
            'bgRow:psBgRow',
            'bgColor:psBgColor',
            'bgFile:psBgFile',
            'retake:psRetake',
            'save:psSave',
            'aspectRow:psAspectRow',
            'engineGroup:psEngineGroup',
            'chromaGroup:psChromaGroup',
            'aiGroup:psAiGroup',
            'keyColor:psKeyColor',
            'threshold:psThreshold',
            'threshVal:psThreshVal',
            'smooth:psSmooth',
            'smoothVal:psSmoothVal',
            'spill:psSpill',
            'feather:psFeather',
            'featherVal:psFeatherVal',
            'blurStrength:psBlurStrength',
            'blurVal:psBlurVal',
            'mirror:psMirror',
        ].forEach((p) => {
            const [k, v] = p.split(':');
            el[k] = id(v);
        });
    }

    function bind() {
        el.startCam.addEventListener('click', toggleCamera);
        el.switchCam.addEventListener('click', switchCamera);
        el.capture.addEventListener('click', capture);
        el.sourceFile.addEventListener('change', onSourceFile);
        el.optionsToggle.addEventListener('click', openSheet);
        el.sheetClose.addEventListener('click', closeSheet);
        el.sheetBackdrop.addEventListener('click', closeSheet);
        el.output.addEventListener('click', sampleKeyFromStage);
        el.reviewBack.addEventListener('click', backToCamera);
        el.retake.addEventListener('click', backToCamera);
        el.save.addEventListener('click', saveReview);
        el.bgFile.addEventListener('change', onBgFile);

        el.modePills
            .querySelectorAll('button[data-mode]')
            .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
        el.bgRow
            .querySelectorAll('[data-bg]')
            .forEach((b) => b.addEventListener('click', () => pickBg(b)));
        el.bgColor.addEventListener('input', () => {
            state.bgType = 'color';
            state.bgColor = el.bgColor.value;
            activate(el.bgRow.querySelectorAll('[data-bg]'), el.bgColor.closest('[data-bg]'));
            renderReview();
        });
        document.querySelectorAll('.ps-eng-btn[data-hqeng]').forEach((b) =>
            b.addEventListener('click', () => {
                state.hqEngine = b.dataset.hqeng;
                activate(document.querySelectorAll('.ps-eng-btn'), b);
            })
        );
        document.querySelectorAll('.ps-fmt-btn[data-fmt]').forEach((b) =>
            b.addEventListener('click', () => {
                state.format = b.dataset.fmt;
                activate(document.querySelectorAll('.ps-fmt-btn'), b);
            })
        );
        el.aspectRow.querySelectorAll('.ps-chip[data-ar]').forEach((b) =>
            b.addEventListener('click', () => {
                state.aspect = b.dataset.ar ? parseFloat(b.dataset.ar) : null;
                activate(el.aspectRow.querySelectorAll('.ps-chip'), b);
                recomputeSizes();
            })
        );
        el.chromaGroup.querySelectorAll('.ps-swatch[data-key]').forEach((b) =>
            b.addEventListener('click', () => {
                const [r, g, bb] = b.dataset.key.split(',').map(Number);
                state.key = { r, g, b: bb };
                el.keyColor.value = rgbToHex(r, g, bb);
                activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), b);
            })
        );
        el.keyColor.addEventListener('input', () => {
            state.key = hexToRgb(el.keyColor.value);
            activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), null);
        });
        bindSlider(el.threshold, 'threshold', (v) => v.toFixed(2), el.threshVal);
        bindSlider(el.smooth, 'smooth', (v) => v.toFixed(2), el.smoothVal);
        bindSlider(el.feather, 'feather', (v) => v + 'px', el.featherVal, true);
        bindSlider(
            el.blurStrength,
            'blurStrength',
            (v) => v + 'px',
            el.blurVal,
            true,
            renderReview
        );
        el.spill.addEventListener('change', () => (state.spill = el.spill.checked));
        el.mirror.addEventListener('change', () => {
            state.mirror = el.mirror.checked;
            applyMirrorClass();
            renderReview();
        });
    }

    function bindSlider(input, key, fmt, label, isInt, after) {
        input.addEventListener('input', () => {
            state[key] = isInt ? parseInt(input.value, 10) : parseFloat(input.value);
            label.textContent = fmt(state[key]);
            if (after) after();
        });
    }

    function isMobile() {
        return (
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches)
        );
    }
    function applyMobileDefaults() {
        if (!isMobile()) return;
        state.facingMode = 'environment';
        state.mirror = false;
        el.mirror.checked = false;
    }

    // ---- MediaPipe ------------------------------------------------------
    function initSegmentation() {
        if (!global.SelfieSegmentation) return;
        try {
            const seg = new global.SelfieSegmentation({
                locateFile: (f) => `${MEDIAPIPE_BASE}/${f}`,
            });
            seg.setOptions({ modelSelection: 1, selfieMode: false });
            seg.onResults(onSegResults);
            state.seg = seg;
            state.segReady = true;
        } catch (e) {
            console.error('[photo-studio] seg init', e);
        }
    }

    // ---- Camera ---------------------------------------------------------
    async function toggleCamera() {
        if (state.running && state.source === 'camera') {
            stopAll();
            return;
        }
        await startCamera();
    }

    async function autoStartIfAllowed() {
        try {
            if (!navigator.permissions?.query) return;
            const st = await navigator.permissions.query({ name: 'camera' });
            if (st.state === 'granted') startCamera({ silent: true });
            else if (st.state === 'denied')
                showPermissionHelp('Quyền camera đang bị chặn cho trang này.');
            st.onchange = () => {
                if (st.state === 'granted' && state.source !== 'image' && !state.stream)
                    startCamera({ silent: true });
            };
        } catch {
            /* Permissions API không hỗ trợ 'camera' */
        }
    }

    async function startCamera(opts = {}) {
        if (!isSecureContext) return notify('Camera cần HTTPS.', 'error');
        if (!navigator.mediaDevices?.getUserMedia)
            return notify('Trình duyệt không hỗ trợ camera.', 'error');
        stopStream();
        showLoading('Đang mở camera…');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: state.facingMode },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
                audio: false,
            });
            state.stream = stream;
            state.source = 'camera';
            el.video.srcObject = stream;
            await el.video.play().catch(() => {});
            await waitForVideo();
            state.srcNatW = el.video.videoWidth;
            state.srcNatH = el.video.videoHeight;
            recomputeSizes();
            syncMirrorToFacing();
            el.stageEmpty.hidden = true;
            el.startCam.hidden = true;
            el.switchCam.disabled = false;
            el.capture.disabled = false;
            updateHqHint();
            hideLoading();
            startLoop();
        } catch (e) {
            hideLoading();
            console.error('[photo-studio] getUserMedia', e);
            if (!opts.silent) {
                const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
                if (denied) showPermissionHelp('Quyền camera đang bị chặn cho trang này.');
                else showStageError(cameraErrorMsg(e));
                notify(cameraErrorMsg(e), 'error');
            }
        }
    }

    function cameraErrorMsg(e) {
        switch (e?.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Quyền camera bị chặn. Xem hướng dẫn cấp quyền trong khung.';
            case 'NotFoundError':
            case 'OverconstrainedError':
                return 'Không tìm thấy camera phù hợp.';
            case 'NotReadableError':
                return 'Camera đang được app khác dùng. Đóng app đó rồi thử lại.';
            default:
                return 'Không mở được camera: ' + (e?.message || e);
        }
    }

    function showStageError(msg) {
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i><p class="ps-stage-err">${msg}</p>` +
            `<button class="ps-start-cta" id="psRetryCam" style="position:static;transform:none">` +
            `<i data-lucide="rotate-cw"></i> Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => startCamera());
        relucide();
    }

    function showPermissionHelp(reason) {
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i><p class="ps-stage-err">${reason}</p>` +
            `<div class="ps-help">${permissionStepsHTML()}</div>` +
            `<button class="ps-start-cta" id="psRetryCam" style="position:static;transform:none">` +
            `<i data-lucide="rotate-cw"></i> Đã cấp quyền — Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => startCamera());
        relucide();
    }

    function permissionStepsHTML() {
        if (isIOS()) {
            return (
                `<div class="ps-help-title">Bật quyền Camera trên iPhone:</div><ol>` +
                `<li>Mở <b>Cài đặt</b> → cuộn tìm <b>${browserName()}</b></li>` +
                `<li>Bật <b>Camera</b></li><li>Quay lại, nhấn <b>Thử lại</b></li></ol>` +
                `<div class="ps-help-alt">Safari: nhấn <b>aA</b> bên trái địa chỉ → <b>Cài đặt trang web</b> → <b>Camera</b> → <b>Cho phép</b>.</div>`
            );
        }
        return (
            `<div class="ps-help-title">Bật quyền Camera trên Chrome điện thoại:</div><ol>` +
            `<li>Nhấn <b>🔒</b> (hoặc <b>⊟/ⓘ</b>) bên trái địa chỉ web</li>` +
            `<li><b>Quyền</b> → <b>Máy ảnh</b></li><li><b>Cho phép</b>, rồi nhấn <b>Thử lại</b></li></ol>` +
            `<div class="ps-help-alt">Hoặc: menu <b>⋮</b> → <b>Cài đặt</b> → <b>Cài đặt trang web</b> → <b>Máy ảnh</b> → trang này → <b>Cho phép</b>.</div>`
        );
    }
    function isIOS() {
        return (
            /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        );
    }
    function browserName() {
        const ua = navigator.userAgent;
        if (/CriOS/i.test(ua)) return 'Chrome';
        if (/FxiOS/i.test(ua)) return 'Firefox';
        if (/EdgiOS/i.test(ua)) return 'Edge';
        return 'Safari';
    }
    function syncMirrorToFacing() {
        state.mirror = state.facingMode === 'user';
        el.mirror.checked = state.mirror;
        applyMirrorClass();
    }
    function waitForVideo() {
        return new Promise((res) => {
            if (el.video.readyState >= 2 && el.video.videoWidth) return res();
            el.video.addEventListener('loadeddata', () => res(), { once: true });
        });
    }
    async function switchCamera() {
        state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
        await startCamera();
    }
    function stopStream() {
        if (state.stream) {
            state.stream.getTracks().forEach((t) => t.stop());
            state.stream = null;
        }
    }
    function stopAll() {
        stopLoop();
        stopStream();
        state.running = false;
        octx && octx.clearRect(0, 0, el.output.width, el.output.height);
        el.stageEmpty.hidden = false;
        el.startCam.hidden = false;
        el.fps.hidden = true;
        el.hqHint.hidden = true;
        el.capture.disabled = true;
        el.switchCam.disabled = true;
    }

    // ---- Source: image upload ------------------------------------------
    function onSourceFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            stopStream();
            stopLoop();
            state.source = 'image';
            state._sourceImg = img;
            state.srcNatW = img.naturalWidth;
            state.srcNatH = img.naturalHeight;
            recomputeSizes();
            state.mirror = false;
            el.mirror.checked = false;
            applyMirrorClass();
            el.stageEmpty.hidden = true;
            el.startCam.hidden = true;
            el.capture.disabled = false;
            el.switchCam.disabled = true;
            updateHqHint();
            startLoop();
        };
        img.onerror = () => notify('Không đọc được ảnh.', 'error');
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }

    function onBgFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            state.bgImage = img;
            state.bgType = 'image';
            activate(el.bgRow.querySelectorAll('[data-bg]'), el.bgFile.closest('[data-bg]'));
            renderReview();
        };
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }

    // ---- Sizing / crop --------------------------------------------------
    function cropRect(natW, natH) {
        if (!state.aspect) return { sx: 0, sy: 0, sw: natW, sh: natH };
        const target = state.aspect;
        const r = natW / natH;
        let cw = natW,
            ch = natH;
        if (r > target) cw = natH * target;
        else ch = natW / target;
        return { sx: (natW - cw) / 2, sy: (natH - ch) / 2, sw: cw, sh: ch };
    }
    function recomputeSizes() {
        const { srcNatW: w, srcNatH: h } = state;
        if (!w || !h) return;
        state.crop = cropRect(w, h);
        const { sw, sh } = state.crop;
        const scale = Math.min(1, PREVIEW_MAX_W / sw);
        state.W = Math.round(sw * scale);
        state.H = Math.round(sh * scale);
        sizeCanvas(el.output, state.W, state.H);
        sizeCanvas(work, state.W, state.H);
    }
    function sizeCanvas(c, w, h) {
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
    }
    function currentSourceEl() {
        return state.source === 'image' ? state._sourceImg : el.video;
    }
    function captureSize(crop) {
        const scale = Math.min(1, CAPTURE_MAX_LONG / Math.max(crop.sw, crop.sh));
        return { W: Math.round(crop.sw * scale), H: Math.round(crop.sh * scale) };
    }

    // ---- Live render loop ----------------------------------------------
    function startLoop() {
        state.running = true;
        updateHqHint();
        el.sampleHint.hidden = !(state.mode === 'chroma');
        cancelAnimationFrame(state.rafId);
        frame();
    }
    function stopLoop() {
        state.running = false;
        cancelAnimationFrame(state.rafId);
    }
    function frame() {
        if (!state.running) return;
        if (state.mode === 'ai' && state.segReady) {
            if (!state.busy) {
                state.busy = true;
                state.seg
                    .send({ image: currentSourceEl() })
                    .catch(() => {})
                    .finally(() => (state.busy = false));
            }
        } else if (state.mode === 'chroma') {
            renderChroma(octx, state.W, state.H, currentSourceEl(), state.crop, true);
            tickFps();
        } else {
            renderPassthrough(octx, state.W, state.H, currentSourceEl(), state.crop);
            tickFps();
        }
        state.rafId = requestAnimationFrame(frame);
    }

    function onSegResults(results) {
        if (!state.modelLoaded) {
            state.modelLoaded = true;
            hideLoading();
        }
        const { W, H } = state;
        if (!W || !H) return;
        sizeCanvas(maskC, W, H);
        maskCtx.clearRect(0, 0, W, H);
        if (state.feather > 0) maskCtx.filter = `blur(${state.feather}px)`;
        const c = state.crop;
        maskCtx.drawImage(results.segmentationMask, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
        maskCtx.filter = 'none';
        // live preview: composite subject over current bg
        composeAI(octx, W, H, results.image, maskC, c, true);
        tickFps();
    }

    function composeAI(ctx, W, H, frameEl, maskCanvas, crop, withBg) {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(maskCanvas, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(frameEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        if (withBg) {
            ctx.globalCompositeOperation = 'destination-over';
            drawBg(ctx, W, H, frameEl, crop);
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    function renderPassthrough(ctx, W, H, src, crop) {
        if (!W || !H || !src) return;
        try {
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {}
    }

    function renderChroma(ctx, W, H, src, crop, withBg) {
        if (!W || !H || !src) return;
        sizeCanvas(work, W, H);
        try {
            workCtx.clearRect(0, 0, W, H);
            workCtx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {
            return;
        }
        const d = workCtx.getImageData(0, 0, W, H);
        keyOut(d, state.key, state.threshold, state.smooth, state.spill);
        workCtx.putImageData(d, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (withBg) drawBg(ctx, W, H, src, crop);
        ctx.drawImage(work, 0, 0, W, H);
    }

    function keyOut(img, key, threshold, smooth, spill) {
        const d = img.data;
        const MAXD = 441.6729559;
        const lo = threshold * MAXD;
        const hi = (threshold + smooth) * MAXD;
        const span = Math.max(1, hi - lo);
        const dom = key.r >= key.g && key.r >= key.b ? 0 : key.g >= key.b ? 1 : 2;
        const a = dom === 0 ? 1 : 0;
        const b = dom === 2 ? 1 : 2;
        for (let i = 0; i < d.length; i += 4) {
            const dr = d[i] - key.r,
                dg = d[i + 1] - key.g,
                db = d[i + 2] - key.b;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist <= lo) {
                d[i + 3] = 0;
                continue;
            } else if (dist < hi) {
                d[i + 3] = Math.round(((dist - lo) / span) * d[i + 3]);
            }
            if (spill && d[i + 3] > 0) {
                const cap = (d[i + a] + d[i + b]) / 2;
                if (d[i + dom] > cap) d[i + dom] = cap;
            }
        }
    }

    // ---- Background draw -------------------------------------------------
    function drawBg(ctx, W, H, frameEl, crop) {
        if (state.bgType === 'color') {
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, W, H);
        } else if (state.bgType === 'image' && state.bgImage) {
            drawCover(ctx, state.bgImage, W, H);
        } else if (state.bgType === 'blur' && frameEl) {
            ctx.save();
            ctx.filter = `blur(${state.blurStrength}px)`;
            const pad = Math.ceil(state.blurStrength * 1.5);
            ctx.drawImage(
                frameEl,
                crop.sx,
                crop.sy,
                crop.sw,
                crop.sh,
                -pad,
                -pad,
                W + pad * 2,
                H + pad * 2
            );
            ctx.restore();
        }
    }
    function drawCover(ctx, img, W, H) {
        const iw = img.naturalWidth || img.width,
            ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const scale = Math.max(W / iw, H / ih);
        ctx.drawImage(img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
    }

    // ---- Capture → cutout → review -------------------------------------
    async function capture() {
        if (state._capBusy || !state.srcNatW) return;
        state._capBusy = true;
        el.capture.disabled = true;
        try {
            const crop = cropRect(state.srcNatW, state.srcNatH);
            const { W, H } = captureSize(crop);
            const frameCv = document.createElement('canvas');
            frameCv.width = W;
            frameCv.height = H;
            frameCv
                .getContext('2d')
                .drawImage(currentSourceEl(), crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
            const cutout = await makeCutout(frameCv, W, H);
            state._cutout = cutout;
            state._capFrame = frameCv;
            state._capW = W;
            state._capH = H;
            sizeCanvas(el.reviewCanvas, W, H);
            renderReview();
            showReview();
        } catch (e) {
            console.error('[photo-studio] capture', e);
            notify('Tách nền thất bại: ' + (e?.message || e), 'error');
        } finally {
            state._capBusy = false;
            el.capture.disabled = false;
            hideLoading();
        }
    }

    /** Tạo cutout (chủ thể nền trong suốt) theo mode hiện tại. Trả canvas WxH. */
    async function makeCutout(frameCv, W, H) {
        if (state.mode === 'chroma') {
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const c = cv.getContext('2d', { willReadFrequently: true });
            c.drawImage(frameCv, 0, 0);
            const d = c.getImageData(0, 0, W, H);
            keyOut(d, state.key, state.threshold, state.smooth, state.spill);
            c.putImageData(d, 0, 0);
            return cv;
        }
        if (state.mode === 'ai') {
            if (!state.modelLoaded) throw new Error('AI nhanh chưa sẵn sàng, đợi chút');
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const c = cv.getContext('2d');
            c.drawImage(maskC, 0, 0, W, H); // latest realtime mask (scaled)
            c.globalCompositeOperation = 'source-in';
            c.drawImage(frameCv, 0, 0);
            return cv;
        }
        // hq: cloud (auto) → fallback local; hoặc local
        const cloud = state.hqEngine === 'auto';
        if (cloud) {
            showLoading('Đang tách nền chất lượng cao…');
            try {
                return await imgToCanvas(await cloudCutout(frameCv), W, H);
            } catch (e) {
                console.warn('[photo-studio] cloud fail → local', e?.message);
                notify('Mất kết nối cloud — dùng tách nền trên máy.', 'warning');
            }
        }
        showLoading(imglyMod ? 'Đang tách nền…' : 'Đang tải mô hình AI (lần đầu ~vài chục MB)…');
        return imgToCanvas(await localCutout(frameCv), W, H);
    }

    function imgToCanvas(img, W, H) {
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        cv.getContext('2d').drawImage(img, 0, 0, W, H);
        if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
        return cv;
    }

    async function loadImgly() {
        if (imglyMod) return imglyMod;
        imglyMod = await import(/* @vite-ignore */ IMGLY_URL);
        return imglyMod;
    }
    async function localCutout(canvas) {
        const blob = await canvasToBlob(canvas, 'image/png');
        const mod = await loadImgly();
        return blobToImage(await mod.removeBackground(blob));
    }
    async function cloudCutout(canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        const res = await fetch(`${CUTOUT_API}/photoroom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl }),
        });
        let j;
        try {
            j = await res.json();
        } catch {
            throw new Error('Server lỗi (' + res.status + ')');
        }
        if (!res.ok || !j.success) throw new Error(j?.error || 'Cloud lỗi (' + res.status + ')');
        return loadImageSrc(j.image);
    }
    function loadImageSrc(src) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => rej(new Error('Không tải được ảnh kết quả'));
            img.src = src;
        });
    }
    function canvasToBlob(canvas, type, q) {
        return new Promise((res) => canvas.toBlob(res, type, q));
    }
    function blobToImage(blob) {
        return new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = URL.createObjectURL(blob);
        });
    }

    // ---- Review ---------------------------------------------------------
    function renderReview() {
        const W = state._capW,
            H = state._capH;
        if (!W || !state._cutout) return;
        rctx.clearRect(0, 0, W, H);
        drawBg(rctx, W, H, state._capFrame, { sx: 0, sy: 0, sw: W, sh: H });
        rctx.drawImage(state._cutout, 0, 0);
        el.reviewCanvas.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
        el.reviewStage.classList.toggle('ps-checker', state.bgType === 'transparent');
        el.reviewMeta.textContent = `${W}×${H}`;
    }

    function pickBg(btn) {
        const type = btn.dataset.bg;
        if (type === 'color') {
            state.bgType = 'color';
            state.bgColor = btn.dataset.color;
            el.bgColor.value = btn.dataset.color;
        } else if (type === 'image') {
            return; // label opens file dialog; onBgFile handles
        } else {
            state.bgType = type; // transparent | blur
        }
        activate(el.bgRow.querySelectorAll('[data-bg]'), btn);
        renderReview();
    }

    function showReview() {
        el.camera.hidden = true;
        el.review.hidden = false;
    }
    function backToCamera() {
        el.review.hidden = true;
        el.camera.hidden = false;
    }

    function saveReview() {
        const W = state._capW,
            H = state._capH;
        if (!W) return;
        const jpg = state.format === 'jpg';
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const c = out.getContext('2d');
        if (jpg) {
            c.fillStyle = '#ffffff';
            c.fillRect(0, 0, W, H);
        }
        if (state.mirror && state.source === 'camera') {
            c.translate(W, 0);
            c.scale(-1, 1);
        }
        c.drawImage(el.reviewCanvas, 0, 0);
        out.toBlob(
            (blob) => blob && saveBlob(blob, `tach-nen-${stamp()}.${jpg ? 'jpg' : 'png'}`),
            jpg ? 'image/jpeg' : 'image/png',
            0.92
        );
    }

    async function saveBlob(blob, filename) {
        const type = blob.type || 'image/png';
        try {
            const file = new File([blob], filename, { type });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
                return;
            }
        } catch (e) {
            if (e?.name === 'AbortError') return;
            console.warn('[photo-studio] share fail', e);
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        notify('Đã tải ảnh về máy.', 'success');
    }
    function stamp() {
        const d = new Date(),
            p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    // ---- Mode / UI ------------------------------------------------------
    function setMode(mode) {
        state.mode = mode;
        activate(el.modePills.querySelectorAll('button[data-mode]'), null);
        el.modePills.querySelector(`button[data-mode="${mode}"]`)?.classList.add('is-active');
        const isChroma = mode === 'chroma';
        const isAi = mode === 'ai';
        const isHq = mode === 'hq';
        el.chromaGroup.hidden = !isChroma;
        el.aiGroup.hidden = !isAi;
        el.engineGroup.hidden = !isHq;
        el.sampleHint.hidden = !(isChroma && state.running);
        el.output.classList.toggle('ps-pickable', isChroma);
        updateHqHint();
        if (isAi && !state.segReady) notify('Mô hình AI nhanh chưa sẵn sàng.', 'warning');
    }
    function updateHqHint() {
        el.hqHint.hidden = !(state.mode === 'hq' && state.running);
    }

    function applyMirrorClass() {
        el.output.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
    }

    function openSheet() {
        el.sheet.classList.add('is-open');
        el.sheetBackdrop.classList.add('is-open');
    }
    function closeSheet() {
        el.sheet.classList.remove('is-open');
        el.sheetBackdrop.classList.remove('is-open');
    }

    function sampleKeyFromStage(e) {
        if (state.mode !== 'chroma' || !state.W) return;
        const rect = el.output.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * state.W;
        const y = ((e.clientY - rect.top) / rect.height) * state.H;
        if (el.output.classList.contains('ps-mirror')) x = state.W - x;
        x = Math.max(0, Math.min(state.W - 1, Math.round(x)));
        const yy = Math.max(0, Math.min(state.H - 1, Math.round(y)));
        try {
            workCtx.drawImage(
                currentSourceEl(),
                state.crop.sx,
                state.crop.sy,
                state.crop.sw,
                state.crop.sh,
                0,
                0,
                state.W,
                state.H
            );
            const p = workCtx.getImageData(x, yy, 1, 1).data;
            state.key = { r: p[0], g: p[1], b: p[2] };
            el.keyColor.value = rgbToHex(p[0], p[1], p[2]);
            activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), null);
            notify(`Đã lấy màu phông rgb(${p[0]}, ${p[1]}, ${p[2]})`, 'info');
        } catch {}
    }

    function tickFps() {
        const now = performance.now();
        state._fpsN++;
        if (now - state._fpsT >= 1000) {
            el.fps.hidden = false;
            el.fps.textContent = state._fpsN + ' FPS';
            state._fpsN = 0;
            state._fpsT = now;
        }
    }

    // ---- Utils ----------------------------------------------------------
    function activate(list, active) {
        list.forEach((n) => n.classList.remove('is-active'));
        if (active) active.classList.add('is-active');
    }
    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m
            ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
            : { r: 0, g: 177, b: 64 };
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    function relucide() {
        if (global.lucide) {
            try {
                global.lucide.createIcons();
            } catch {}
        }
    }
    function showLoading(t) {
        el.loadingText.textContent = t || 'Đang xử lý…';
        el.stageLoading.hidden = false;
    }
    function hideLoading() {
        el.stageLoading.hidden = true;
    }
    function notify(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[photo-studio]', type || 'info', msg);
    }

    global.PhotoStudio = { init };
})(typeof window !== 'undefined' ? window : globalThis);
