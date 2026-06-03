// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Studio chụp tách nền — Web 2.0
 *
 * Pure client-side: camera (getUserMedia) hoặc ảnh upload → tách nền realtime
 * bằng AI (MediaPipe Selfie Segmentation, on-device) hoặc chroma key (lọc màu
 * phông theo pixel) → ghép nền mới (trong suốt / màu / ảnh / mờ nền) → xuất
 * PNG/JPG. Hỗ trợ tỉ lệ khung, khử ám màu (spill), chụp ở độ phân giải gốc.
 *
 * Không có backend/DB/SSE: ảnh KHÔNG rời khỏi máy người dùng.
 */
(function (global) {
    'use strict';

    // ---- Tunables -------------------------------------------------------
    const PREVIEW_MAX_W = 1080; // cap xử lý realtime để mượt trên mobile
    const CAPTURE_MAX_LONG = 2400; // cap cạnh dài khi chụp (tránh tốn RAM)
    const MEDIAPIPE_BASE =
        'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

    // ---- State ----------------------------------------------------------
    const state = {
        mode: 'ai', // 'ai' | 'chroma'
        source: 'camera', // 'camera' | 'image'
        bgType: 'transparent', // 'transparent' | 'color' | 'image' | 'blur'
        bgColor: '#ffffff',
        bgImage: null,
        blurStrength: 12,
        key: { r: 0, g: 177, b: 64 },
        threshold: 0.45,
        smooth: 0.1,
        feather: 2,
        spill: true,
        mirror: true,
        format: 'png', // 'png' | 'jpg'
        aspect: null, // null=gốc | number (w/h)
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
        _hqBusy: false,
    };

    const el = {};
    let work, workCtx; // offscreen for chroma processing (preview res)
    let maskC, maskCtx; // latest AI mask snapshot
    let octx; // output ctx
    let imglyMod = null; // lazy-loaded @imgly/background-removal module (AI nét)

    // @imgly/background-removal (IS-Net / U²-Net, on-device, free). ESM qua esm.sh
    // để tự gói dependency (onnxruntime-web). Lazy import lần đầu dùng "AI nét".
    const IMGLY_URL = 'https://esm.sh/@imgly/background-removal@1.5.5';

    // ---- Init -----------------------------------------------------------
    function init() {
        cache();
        if (!el.output) return;
        octx = el.output.getContext('2d', { willReadFrequently: true });
        work = document.createElement('canvas');
        workCtx = work.getContext('2d', { willReadFrequently: true });
        maskC = document.createElement('canvas');
        maskCtx = maskC.getContext('2d');
        bind();
        initSegmentation();
        applyMobileDefaults();
        autoStartIfAllowed();
    }

    function isMobile() {
        return (
            /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches)
        );
    }

    // Trang dùng chủ yếu trên điện thoại → mặc định camera SAU (chụp sản phẩm),
    // tắt lật gương (chỉ camera trước mới cần).
    function applyMobileDefaults() {
        if (!isMobile()) return;
        state.facingMode = 'environment';
        state.mirror = false;
        el.mirror.checked = false;
    }

    // Nếu user đã cấp quyền camera trước đó → tự mở lại (không cần bấm), không
    // prompt. Permissions API không hỗ trợ 'camera' trên vài trình duyệt (Safari/
    // Firefox) → bọc try, fallback im lặng về nút "Bật camera".
    async function autoStartIfAllowed() {
        try {
            if (!navigator.permissions?.query) return;
            const st = await navigator.permissions.query({ name: 'camera' });
            if (st.state === 'granted') startCamera({ silent: true });
            else if (st.state === 'denied') {
                // Đã bị chặn từ trước → Chrome sẽ KHÔNG hỏi lại. Báo + hướng dẫn ngay.
                showPermissionHelp('Quyền camera đang bị chặn cho trang này.');
            }
            st.onchange = () => {
                if (st.state === 'granted' && state.source !== 'image') {
                    if (!state.stream) startCamera({ silent: true });
                }
            };
        } catch {
            /* Permissions API không hỗ trợ 'camera' — bỏ qua, dùng nút thủ công */
        }
    }

    function cache() {
        const id = (x) => document.getElementById(x);
        [
            'stage:psStage',
            'output:psOutput',
            'video:psVideo',
            'stageEmpty:psStageEmpty',
            'stageLoading:psStageLoading',
            'loadingText:psLoadingText',
            'fps:psFps',
            'capture:psCapture',
            'startCam:psStartCam',
            'switchCam:psSwitchCam',
            'sourceFile:psSourceFile',
            'sampleHint:psSampleHint',
            'modeNote:psModeNote',
            'aspectRow:psAspectRow',
            'chromaCard:psChromaCard',
            'aiCard:psAiCard',
            'keyColor:psKeyColor',
            'threshold:psThreshold',
            'threshVal:psThreshVal',
            'smooth:psSmooth',
            'smoothVal:psSmoothVal',
            'spill:psSpill',
            'feather:psFeather',
            'featherVal:psFeatherVal',
            'bgBlurBtn:psBgBlurBtn',
            'bgColorOpt:psBgColorOpt',
            'bgImageOpt:psBgImageOpt',
            'bgBlurOpt:psBgBlurOpt',
            'bgColor:psBgColor',
            'bgFile:psBgFile',
            'bgThumb:psBgThumb',
            'blurStrength:psBlurStrength',
            'blurVal:psBlurVal',
            'mirror:psMirror',
            'results:psResults',
            'resultsGrid:psResultsGrid',
            'resultsCount:psResultsCount',
            'clearResults:psClearResults',
            'downloadAll:psDownloadAll',
        ].forEach((pair) => {
            const [k, v] = pair.split(':');
            el[k] = id(v);
        });
    }

    function bind() {
        el.startCam.addEventListener('click', toggleCamera);
        el.switchCam.addEventListener('click', switchCamera);
        el.capture.addEventListener('click', capture);
        el.sourceFile.addEventListener('change', onSourceFile);
        el.bgFile.addEventListener('change', onBgFile);
        el.clearResults.addEventListener('click', clearResults);
        el.downloadAll.addEventListener('click', downloadAll);
        el.output.addEventListener('click', sampleKeyFromStage);

        document
            .querySelectorAll('.ps-seg-btn[data-mode]')
            .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
        document
            .querySelectorAll('.ps-bg-btn[data-bg]')
            .forEach((b) => b.addEventListener('click', () => setBgType(b.dataset.bg)));
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

        // chroma swatches
        el.chromaCard.querySelectorAll('.ps-swatch[data-key]').forEach((b) =>
            b.addEventListener('click', () => {
                const [r, g, bb] = b.dataset.key.split(',').map(Number);
                state.key = { r, g, b: bb };
                el.keyColor.value = rgbToHex(r, g, bb);
                activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), b);
            })
        );
        el.keyColor.addEventListener('input', () => {
            state.key = hexToRgb(el.keyColor.value);
            activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), null);
        });
        el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]').forEach((b) =>
            b.addEventListener('click', () => {
                state.bgColor = b.dataset.color;
                el.bgColor.value = b.dataset.color;
                activate(el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]'), b);
            })
        );
        el.bgColor.addEventListener('input', () => {
            state.bgColor = el.bgColor.value;
            activate(el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]'), null);
        });

        bindSlider(el.threshold, 'threshold', (v) => v.toFixed(2), el.threshVal);
        bindSlider(el.smooth, 'smooth', (v) => v.toFixed(2), el.smoothVal);
        bindSlider(el.feather, 'feather', (v) => v + 'px', el.featherVal, true);
        bindSlider(el.blurStrength, 'blurStrength', (v) => v + 'px', el.blurVal, true);

        el.spill.addEventListener('change', () => (state.spill = el.spill.checked));
        el.mirror.addEventListener('change', () => {
            state.mirror = el.mirror.checked;
            applyMirrorClass();
        });
    }

    function bindSlider(input, key, fmt, label, isInt) {
        input.addEventListener('input', () => {
            state[key] = isInt ? parseInt(input.value, 10) : parseFloat(input.value);
            label.textContent = fmt(state[key]);
        });
    }

    // ---- MediaPipe ------------------------------------------------------
    function initSegmentation() {
        if (!global.SelfieSegmentation) {
            console.warn('[photo-studio] SelfieSegmentation chưa load — chỉ dùng được Chroma key');
            return;
        }
        try {
            const seg = new global.SelfieSegmentation({
                locateFile: (f) => `${MEDIAPIPE_BASE}/${f}`,
            });
            seg.setOptions({ modelSelection: 1, selfieMode: false });
            seg.onResults(onSegResults);
            state.seg = seg;
            state.segReady = true;
        } catch (e) {
            console.error('[photo-studio] init segmentation failed', e);
        }
    }

    // ---- Camera ---------------------------------------------------------
    async function toggleCamera() {
        if (state.running && state.source === 'camera') {
            stopAll();
            el.startCam.innerHTML = '<i data-lucide="video"></i> Bật camera';
            relucide();
            return;
        }
        await startCamera();
    }

    async function startCamera(opts = {}) {
        if (!isSecureContext) {
            notify('Camera cần HTTPS. Mở trang qua https:// rồi thử lại.', 'error');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            notify('Trình duyệt không hỗ trợ camera.', 'error');
            return;
        }
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
            el.switchCam.disabled = false;
            el.capture.disabled = false;
            el.startCam.innerHTML = '<i data-lucide="video-off"></i> Tắt camera';
            relucide();
            if (state.mode === 'ai' && !state.modelLoaded) showLoading('Đang tải mô hình AI…');
            else hideLoading();
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

    // Thông báo lỗi đơn giản trong khung (không phải lỗi quyền).
    function showStageError(msg) {
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i><p class="ps-stage-err">${msg}</p>` +
            `<button class="ps-btn ps-btn-sm ps-btn-primary" id="psRetryCam">` +
            `<i data-lucide="rotate-cw"></i> Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => startCamera());
        relucide();
    }

    // Hướng dẫn cấp quyền camera từng bước (Chrome Android chỉ hỏi 1 lần; bị
    // chặn rồi phải bật tay trong cài đặt site). Tùy nền tảng.
    function showPermissionHelp(reason) {
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i>` +
            `<p class="ps-stage-err">${reason}</p>` +
            `<div class="ps-help">${permissionStepsHTML()}</div>` +
            `<button class="ps-btn ps-btn-sm ps-btn-primary" id="psRetryCam">` +
            `<i data-lucide="rotate-cw"></i> Đã cấp quyền — Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => startCamera());
        relucide();
    }

    function permissionStepsHTML() {
        if (isIOS()) {
            return (
                `<div class="ps-help-title">Bật quyền Camera trên iPhone:</div>` +
                `<ol>` +
                `<li>Mở <b>Cài đặt</b> điện thoại → cuộn tìm <b>${browserName()}</b></li>` +
                `<li>Bật <b>Camera</b></li>` +
                `<li>Quay lại trang này, nhấn <b>Thử lại</b></li>` +
                `</ol>` +
                `<div class="ps-help-alt">Safari: nhấn <b>aA</b> bên trái thanh địa chỉ → <b>Cài đặt trang web</b> → <b>Camera</b> → <b>Cho phép</b>.</div>`
            );
        }
        // Android Chrome & các trình duyệt khác
        return (
            `<div class="ps-help-title">Bật quyền Camera trên Chrome điện thoại:</div>` +
            `<ol>` +
            `<li>Nhấn biểu tượng <b>🔒</b> (hoặc <b>⊟ / ⓘ</b>) ngay bên trái địa chỉ web phía trên</li>` +
            `<li>Chọn <b>Quyền</b> (Permissions) → <b>Máy ảnh</b> (Camera)</li>` +
            `<li>Chọn <b>Cho phép</b> (Allow)</li>` +
            `<li>Nhấn <b>Thử lại</b> bên dưới (hoặc tải lại trang)</li>` +
            `</ol>` +
            `<div class="ps-help-alt">Hoặc: menu <b>⋮</b> (góc trên phải) → <b>Cài đặt</b> → <b>Cài đặt trang web</b> → <b>Máy ảnh</b> → tìm trang này → <b>Cho phép</b>.</div>`
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

    function cameraErrorMsg(e) {
        switch (e?.name) {
            case 'NotAllowedError':
            case 'SecurityError':
                return 'Quyền camera đang bị chặn. Xem hướng dẫn cấp quyền trong khung.';
            case 'NotFoundError':
            case 'OverconstrainedError':
                return 'Không tìm thấy camera phù hợp trên thiết bị.';
            case 'NotReadableError':
                return 'Camera đang được ứng dụng khác sử dụng. Đóng app đó rồi thử lại.';
            default:
                return 'Không mở được camera: ' + (e?.message || e);
        }
    }

    // Camera trước → lật gương; camera sau → không lật.
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
        el.fps.hidden = true;
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
            el.capture.disabled = false;
            el.switchCam.disabled = true;
            el.startCam.innerHTML = '<i data-lucide="video"></i> Bật camera';
            relucide();
            if (state.mode === 'ai' && !state.modelLoaded) showLoading('Đang tải mô hình AI…');
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
            el.bgThumb.hidden = false;
            el.bgThumb.style.backgroundImage = `url(${img.src})`;
        };
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    }

    // ---- Sizing / crop --------------------------------------------------
    function cropRect(natW, natH) {
        if (!state.aspect) return { sx: 0, sy: 0, sw: natW, sh: natH };
        const target = state.aspect;
        const srcRatio = natW / natH;
        let cw = natW;
        let ch = natH;
        if (srcRatio > target)
            cw = natH * target; // too wide → crop sides
        else ch = natW / target; // too tall → crop top/bottom
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

    // ---- Render loop ----------------------------------------------------
    function startLoop() {
        state.running = true;
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
                    .catch((e) => console.warn('[photo-studio] seg.send', e))
                    .finally(() => {
                        state.busy = false;
                    });
            }
        } else if (state.mode === 'chroma') {
            renderChroma(octx, state.W, state.H, currentSourceEl(), state.crop);
            tickFps();
        } else {
            // 'hq' — không tách realtime (model nặng), chỉ show khung hình để canh.
            renderPassthrough(octx, state.W, state.H, currentSourceEl(), state.crop);
            tickFps();
        }
        state.rafId = requestAnimationFrame(frame);
    }

    // ---- AI compositing -------------------------------------------------
    function onSegResults(results) {
        if (!state.modelLoaded) {
            state.modelLoaded = true;
            hideLoading();
        }
        const { W, H } = state;
        if (!W || !H) return;
        // snapshot mask (feathered) to maskC at preview res
        sizeCanvas(maskC, W, H);
        maskCtx.clearRect(0, 0, W, H);
        if (state.feather > 0) maskCtx.filter = `blur(${state.feather}px)`;
        const c = state.crop;
        maskCtx.drawImage(results.segmentationMask, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
        maskCtx.filter = 'none';
        composeAI(octx, W, H, results.image, maskC, c);
        tickFps();
    }

    function composeAI(ctx, W, H, frameEl, maskCanvas, crop) {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(maskCanvas, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(frameEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        ctx.globalCompositeOperation = 'destination-over';
        drawBg(ctx, W, H, frameEl, crop);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    // ---- Passthrough (hq preview) --------------------------------------
    function renderPassthrough(ctx, W, H, src, crop) {
        if (!W || !H || !src) return;
        try {
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {
            /* frame not ready */
        }
    }

    // ---- Chroma key -----------------------------------------------------
    function renderChroma(ctx, W, H, src, crop) {
        if (!W || !H || !src) return;
        sizeCanvas(work, W, H);
        try {
            workCtx.clearRect(0, 0, W, H);
            workCtx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {
            return;
        }
        const frameData = workCtx.getImageData(0, 0, W, H);
        keyOut(frameData, state.key, state.threshold, state.smooth, state.spill);
        workCtx.putImageData(frameData, 0, 0);
        ctx.clearRect(0, 0, W, H);
        drawBg(ctx, W, H, src, crop); // blur/image/color drawn behind
        ctx.drawImage(work, 0, 0, W, H);
    }

    /**
     * Per-pixel chroma key + optional spill suppression.
     * @param {ImageData} img
     * @param {{r,g,b}} key
     * @param {number} threshold 0..1 — bán kính xóa hẳn
     * @param {number} smooth 0..0.4 — dải chuyển tiếp mềm viền
     * @param {boolean} spill — khử ám màu key trên pixel giữ lại
     */
    function keyOut(img, key, threshold, smooth, spill) {
        const d = img.data;
        const MAXD = 441.6729559; // sqrt(3*255^2)
        const lo = threshold * MAXD;
        const hi = (threshold + smooth) * MAXD;
        const span = Math.max(1, hi - lo);
        // dominant channel of key → kênh cần khử spill
        const dom = key.r >= key.g && key.r >= key.b ? 0 : key.g >= key.b ? 1 : 2;
        const a = dom === 0 ? 1 : 0;
        const b = dom === 2 ? 1 : 2;
        for (let i = 0; i < d.length; i += 4) {
            const dr = d[i] - key.r;
            const dg = d[i + 1] - key.g;
            const db = d[i + 2] - key.b;
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
            // vẽ rộng hơn 1 chút để blur không lộ viền trong suốt ở mép
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
        // transparent → nothing
    }

    function drawCover(ctx, img, W, H) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const scale = Math.max(W / iw, H / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    // ---- Capture (high-res one-shot) ------------------------------------
    function capture() {
        if (!state.srcNatW) return;
        if (state.mode === 'hq') {
            captureHQ();
            return;
        }
        const crop = cropRect(state.srcNatW, state.srcNatH);
        const { W, H } = captureSize(crop);
        const src = currentSourceEl();

        const comp = document.createElement('canvas');
        comp.width = W;
        comp.height = H;
        const cctx = comp.getContext('2d');

        if (state.mode === 'ai' && state.modelLoaded) {
            composeAI(cctx, W, H, src, maskC, crop); // maskC (preview res) tự upscale
        } else if (state.mode === 'chroma') {
            renderChromaHiRes(cctx, W, H, src, crop);
        } else {
            notify('Mô hình AI chưa sẵn sàng — đợi vài giây rồi chụp lại.', 'warning');
            return;
        }
        finalizeCapture(comp, W, H);
    }

    function captureSize(crop) {
        const scale = Math.min(1, CAPTURE_MAX_LONG / Math.max(crop.sw, crop.sh));
        return { W: Math.round(crop.sw * scale), H: Math.round(crop.sh * scale) };
    }

    /** Bake mirror + format + push to results gallery. */
    function finalizeCapture(comp, W, H) {
        const jpg = state.format === 'jpg';
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const octx2 = out.getContext('2d');
        if (jpg) {
            octx2.fillStyle = '#ffffff'; // JPG không có alpha → nền trắng
            octx2.fillRect(0, 0, W, H);
        }
        if (state.mirror) {
            octx2.translate(W, 0);
            octx2.scale(-1, 1);
        }
        octx2.drawImage(comp, 0, 0);
        out.toBlob(
            (blob) => blob && addResult(blob, W, H, jpg ? 'jpg' : 'png'),
            jpg ? 'image/jpeg' : 'image/png',
            0.92
        );
    }

    // ---- AI nét (@imgly/background-removal, on-device) ------------------
    async function loadImgly() {
        if (imglyMod) return imglyMod;
        imglyMod = await import(/* @vite-ignore */ IMGLY_URL);
        return imglyMod;
    }

    async function captureHQ() {
        if (state._hqBusy || !state.srcNatW) return;
        state._hqBusy = true;
        el.capture.disabled = true;
        showLoading(
            imglyMod ? 'Đang tách nền…' : 'Đang tải mô hình AI nét (lần đầu ~vài chục MB)…'
        );
        try {
            const crop = cropRect(state.srcNatW, state.srcNatH);
            const { W, H } = captureSize(crop);
            // 1) khung hình gốc (đã crop) ở độ phân giải capture
            const tmp = document.createElement('canvas');
            tmp.width = W;
            tmp.height = H;
            tmp.getContext('2d').drawImage(
                currentSourceEl(),
                crop.sx,
                crop.sy,
                crop.sw,
                crop.sh,
                0,
                0,
                W,
                H
            );
            const inputBlob = await canvasToBlob(tmp, 'image/png');
            // 2) tách nền on-device
            const mod = await loadImgly();
            showLoading('Đang tách nền…');
            const cutBlob = await mod.removeBackground(inputBlob);
            const cutImg = await blobToImage(cutBlob);
            // 3) ghép nền mới (full crop coords)
            const comp = document.createElement('canvas');
            comp.width = W;
            comp.height = H;
            const cctx = comp.getContext('2d');
            drawBg(cctx, W, H, tmp, { sx: 0, sy: 0, sw: W, sh: H });
            cctx.drawImage(cutImg, 0, 0, W, H);
            URL.revokeObjectURL(cutImg.src);
            finalizeCapture(comp, W, H);
        } catch (e) {
            console.error('[photo-studio] AI nét', e);
            notify('Tách nền nét thất bại: ' + (e?.message || e), 'error');
        } finally {
            hideLoading();
            state._hqBusy = false;
            el.capture.disabled = false;
        }
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

    function renderChromaHiRes(ctx, W, H, src, crop) {
        const tmp = document.createElement('canvas');
        tmp.width = W;
        tmp.height = H;
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        const data = tctx.getImageData(0, 0, W, H);
        keyOut(data, state.key, state.threshold, state.smooth, state.spill);
        tctx.putImageData(data, 0, 0);
        ctx.clearRect(0, 0, W, H);
        drawBg(ctx, W, H, src, crop);
        ctx.drawImage(tmp, 0, 0);
    }

    // ---- Results --------------------------------------------------------
    function addResult(blob, w, h, ext) {
        const url = URL.createObjectURL(blob);
        el.results.hidden = false;
        const stamp = resultStamp();
        const card = document.createElement('div');
        card.className = 'ps-result-card';
        card.innerHTML = `
            <div class="ps-result-thumb" style="background-image:url(${url})"></div>
            <div class="ps-result-meta">${w}×${h} · ${(blob.size / 1024).toFixed(0)} KB</div>
            <div class="ps-result-actions">
                <a class="ps-btn ps-btn-sm ps-btn-primary" download="tach-nen-${stamp}.${ext}" href="${url}">
                    <i data-lucide="download"></i> Tải
                </a>
                <button class="ps-btn ps-btn-sm ps-btn-ghost ps-result-del" title="Xóa">
                    <i data-lucide="x"></i>
                </button>
            </div>`;
        card.querySelector('.ps-result-del').addEventListener('click', () => {
            URL.revokeObjectURL(url);
            card.remove();
            updateResultsCount();
        });
        el.resultsGrid.prepend(card);
        updateResultsCount();
        relucide();
        notify('Đã chụp ảnh.', 'success');
    }

    function updateResultsCount() {
        const n = el.resultsGrid.children.length;
        el.resultsCount.textContent = n;
        el.results.hidden = n === 0;
    }

    function downloadAll() {
        const links = el.resultsGrid.querySelectorAll('a[download]');
        if (!links.length) return;
        links.forEach((a, i) => setTimeout(() => a.click(), i * 250));
    }

    function resultStamp() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
            d.getMinutes()
        )}${p(d.getSeconds())}`;
    }

    function clearResults() {
        el.resultsGrid.querySelectorAll('.ps-result-thumb').forEach((t) => {
            const m = /url\("?(blob:[^")]+)"?\)/.exec(t.style.backgroundImage);
            if (m) URL.revokeObjectURL(m[1]);
        });
        el.resultsGrid.innerHTML = '';
        updateResultsCount();
    }

    // ---- UI switching ---------------------------------------------------
    const MODE_NOTE = {
        ai: 'AI nhận diện chủ thể realtime, không cần phông. Tốt cho người & sản phẩm.',
        hq: 'AI nét (IS-Net) — viền sắc cho sản phẩm/vật thể. Bấm Chụp để xử lý (lần đầu tải mô hình ~vài chục MB, sau đó cache nhanh).',
        chroma: 'Chụp trên phông đơn sắc đủ sáng. Bấm vào vùng phông để lấy đúng màu.',
    };

    function setMode(mode) {
        state.mode = mode;
        activate(document.querySelectorAll('.ps-seg-btn[data-mode]'), null);
        document.querySelector(`.ps-seg-btn[data-mode="${mode}"]`)?.classList.add('is-active');
        const isChroma = mode === 'chroma';
        const isAi = mode === 'ai';
        // Engines cached: chuyển qua lại tức thì sau lần đầu (state.seg + imglyMod giữ nguyên).
        el.chromaCard.hidden = !isChroma;
        el.aiCard.hidden = !isAi; // slider feather chỉ áp cho AI realtime
        el.sampleHint.hidden = !isChroma;
        el.output.classList.toggle('ps-pickable', isChroma);
        el.modeNote.textContent = MODE_NOTE[mode] || MODE_NOTE.ai;
        // "Mờ nền" chỉ hợp lý khi còn frame gốc (AI nhanh / AI nét); chroma đã xóa phông
        el.bgBlurBtn.disabled = isChroma;
        if (isChroma && state.bgType === 'blur') setBgType('transparent');
        if (isAi && !state.segReady) {
            notify('Mô hình AI chưa sẵn sàng — kiểm tra mạng rồi thử lại.', 'warning');
        }
        if (isAi && !state.modelLoaded && state.running) {
            showLoading('Đang tải mô hình AI…');
        } else if (mode !== 'ai') {
            hideLoading();
        }
        // hq mode: preload engine ngầm để lần Chụp đầu nhanh hơn (cache).
        if (mode === 'hq' && !imglyMod) {
            loadImgly().catch((e) => console.warn('[photo-studio] preload imgly', e));
        }
    }

    function setBgType(type) {
        state.bgType = type;
        activate(document.querySelectorAll('.ps-bg-btn[data-bg]'), null);
        document.querySelector(`.ps-bg-btn[data-bg="${type}"]`)?.classList.add('is-active');
        el.bgColorOpt.hidden = type !== 'color';
        el.bgImageOpt.hidden = type !== 'image';
        el.bgBlurOpt.hidden = type !== 'blur';
        el.stage.classList.toggle('ps-stage-transparent', type === 'transparent');
    }

    function applyMirrorClass() {
        el.output.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
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
            activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), null);
            notify(`Đã lấy màu phông rgb(${p[0]}, ${p[1]}, ${p[2]})`, 'info');
        } catch {
            /* ignore */
        }
    }

    // ---- FPS ------------------------------------------------------------
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
    function activate(nodeList, active) {
        nodeList.forEach((n) => n.classList.remove('is-active'));
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
    function showLoading(text) {
        el.loadingText.textContent = text || 'Đang xử lý…';
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
