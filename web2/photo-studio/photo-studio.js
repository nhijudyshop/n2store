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
    // Engine "AI nhanh" mới: MediaPipe Tasks Vision ImageSegmenter (GPU delegate,
    // nhanh hơn nhiều bản Solution cũ). Legacy giữ làm fallback.
    const TASKS_VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18';
    const SELFIE_MODEL =
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
    const SEG_INPUT_W = 256; // downscale khung gửi model → nhanh + loop mask nhỏ
    const IMGLY_URL = 'https://esm.sh/@imgly/background-removal@1.5.5';
    const CUTOUT_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/cutout';

    const state = {
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
    let maskC, maskCtx; // mask đã crop ở preview res (dùng chung 2 engine)
    let segInput, segInputCtx; // khung downscale gửi segmenter
    let maskRaw, maskRawCtx; // mask thô từ tasks-vision (alpha)
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
        segInput = document.createElement('canvas');
        segInputCtx = segInput.getContext('2d');
        maskRaw = document.createElement('canvas');
        maskRawCtx = maskRaw.getContext('2d');
        bind();
        initSegmentation();
        applyMobileDefaults();
        loadSavedBgs();
        renderBgRows();
        loadLogo();
        el.qualityWrap.style.display = 'none'; // PNG mặc định → ẩn thanh chất lượng
        setMode('ai');
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
            'reviewOptions:psReviewOptions',
            'resetTransform:psResetTransform',
            'compare:psCompare',
            'reviewMeta:psReviewMeta',
            'reviewStage:psReviewStage',
            'reviewCanvas:psReviewCanvas',
            'bgRowCam:psBgRowCam',
            'bgRowReview:psBgRowReview',
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
            'shadow:psShadow',
            'shadowSoft:psShadowSoft',
            'shadowVal:psShadowVal',
            'enhance:psEnhance',
            'marketRow:psMarketRow',
            'quality:psQuality',
            'qualityVal:psQualityVal',
            'qualityWrap:psQualityWrap',
            'logoFile:psLogoFile',
            'logoOn:psLogoOn',
            'logoPosRow:psLogoPosRow',
            'logoThumb:psLogoThumb',
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
        el.reviewOptions.addEventListener('click', openSheet);
        el.sheetClose.addEventListener('click', closeSheet);
        el.sheetBackdrop.addEventListener('click', closeSheet);
        el.output.addEventListener('click', sampleKeyFromStage);
        el.reviewBack.addEventListener('click', backToCamera);
        el.retake.addEventListener('click', backToCamera);
        el.save.addEventListener('click', saveReview);
        el.bgFile.addEventListener('change', onBgFile);
        el.resetTransform.addEventListener('click', () => {
            state.tx = 0;
            state.ty = 0;
            state.scale = 1;
            renderReview();
        });
        bindReviewGestures();
        // Before/after: giữ nút để xem ảnh gốc
        const showOriginal = () => {
            if (!state._capFrame) return;
            rctx.clearRect(0, 0, state._capW, state._capH);
            rctx.drawImage(state._capFrame, 0, 0);
        };
        el.compare.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            showOriginal();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
            el.compare.addEventListener(ev, () => renderReview())
        );

        el.modePills
            .querySelectorAll('button[data-mode]')
            .forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
        // Hàng chọn nền (cả 2 màn) — delegated click
        [el.bgRowCam, el.bgRowReview].forEach((row) =>
            row.addEventListener('click', (e) => {
                const delBtn = e.target.closest('[data-del]');
                if (delBtn) {
                    e.stopPropagation();
                    deleteSavedBg(delBtn.dataset.del);
                    return;
                }
                const chip = e.target.closest('[data-bg]');
                if (chip) onBgChip(chip);
            })
        );
        el.bgColor.addEventListener('input', () => selectBg('color:' + el.bgColor.value));
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
                el.qualityWrap.style.display = state.format === 'png' ? 'none' : '';
            })
        );
        // Khổ sàn TMĐT: đặt aspect + kích thước xuất
        el.marketRow.querySelectorAll('.ps-chip[data-mk]').forEach((b) =>
            b.addEventListener('click', () => {
                state.market = b.dataset.mk;
                state.aspect = parseFloat(b.dataset.ar);
                state.exportPx = parseInt(b.dataset.px, 10);
                activate(el.marketRow.querySelectorAll('.ps-chip'), b);
                activate(el.aspectRow.querySelectorAll('.ps-chip'), null); // bỏ chọn tỉ lệ thủ công
                recomputeSizes();
                renderReview();
                notify('Khổ ' + b.textContent.trim() + ' — chụp lại để áp tỉ lệ.', 'info');
            })
        );
        // Bóng đổ / tự động đẹp
        el.shadow.addEventListener('change', () => {
            state.shadow = el.shadow.checked;
            renderReview();
        });
        bindSlider(el.shadowSoft, 'shadowSoft', (v) => v + 'px', el.shadowVal, true, renderReview);
        el.enhance.addEventListener('change', () => {
            state.enhance = el.enhance.checked;
            renderReview();
        });
        // Chất lượng xuất
        bindSlider(el.quality, 'quality', (v) => Math.round(v * 100) + '%', el.qualityVal);
        // Logo / watermark
        el.logoFile.addEventListener('change', onLogoFile);
        el.logoOn.addEventListener('change', () => {
            state.logoOn = el.logoOn.checked;
            renderReview();
        });
        el.logoPosRow.querySelectorAll('.ps-chip[data-pos]').forEach((b) =>
            b.addEventListener('click', () => {
                state.logoPos = b.dataset.pos;
                activate(el.logoPosRow.querySelectorAll('.ps-chip'), b);
                renderReview();
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
    async function initSegmentation() {
        // Ưu tiên Tasks Vision ImageSegmenter (GPU delegate, nhanh). Lỗi → legacy.
        try {
            const mod = await import(/* @vite-ignore */ `${TASKS_VISION}/vision_bundle.mjs`);
            const vision = await mod.FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);
            state._segmenter = await mod.ImageSegmenter.createFromOptions(vision, {
                baseOptions: { modelAssetPath: SELFIE_MODEL, delegate: isIOS() ? 'CPU' : 'GPU' },
                runningMode: 'VIDEO',
                outputConfidenceMasks: true,
                outputCategoryMask: false,
            });
            state._aiEngine = 'tasks';
            state.segReady = true;
        } catch (e) {
            console.warn('[photo-studio] tasks-vision init failed → legacy', e?.message || e);
            initLegacySeg();
        }
    }

    function initLegacySeg() {
        if (!global.SelfieSegmentation) return;
        try {
            const seg = new global.SelfieSegmentation({
                locateFile: (f) => `${MEDIAPIPE_BASE}/${f}`,
            });
            seg.setOptions({ modelSelection: 1, selfieMode: false });
            seg.onResults(onSegResults);
            state.seg = seg;
            state._aiEngine = 'legacy';
            state.segReady = true;
        } catch (e) {
            console.error('[photo-studio] legacy seg init', e);
        }
    }

    /** Khung downscale (≤256px) gửi segmenter → nhanh + mask nhỏ (loop rẻ). */
    function segInputFrame() {
        const src = currentSourceEl();
        if (!src || !state.srcNatW) return null;
        const scale = Math.min(1, SEG_INPUT_W / state.srcNatW);
        const w = Math.max(1, Math.round(state.srcNatW * scale));
        const h = Math.max(1, Math.round(state.srcNatH * scale));
        sizeCanvas(segInput, w, h);
        try {
            segInputCtx.drawImage(src, 0, 0, w, h);
        } catch {
            return null;
        }
        return segInput;
    }

    /** Tasks Vision callback: confidence mask (0..1) → alpha → maskC + composite. */
    function onTasksResult(result) {
        if (!state.modelLoaded) {
            state.modelLoaded = true;
            hideLoading();
        }
        const m = result.confidenceMasks && result.confidenceMasks[0];
        if (!m) return;
        const mw = m.width,
            mh = m.height;
        const f = m.getAsFloat32Array();
        sizeCanvas(maskRaw, mw, mh);
        const id = maskRawCtx.createImageData(mw, mh);
        const px = id.data;
        for (let i = 0; i < f.length; i++) px[i * 4 + 3] = (f[i] * 255) | 0;
        maskRawCtx.putImageData(id, 0, 0);
        if (m.close) m.close();
        populateMaskC(maskRaw, mw, mh);
        composeAI(octx, state.W, state.H, currentSourceEl(), maskC, state.crop, true);
        tickFps();
    }

    /** Vẽ mask (đã crop) vào maskC ở preview res, có feather. Dùng chung 2 engine. */
    function populateMaskC(srcMask, mw, mh) {
        const { W, H } = state;
        if (!W || !H || !state.srcNatW) return;
        sizeCanvas(maskC, W, H);
        maskCtx.clearRect(0, 0, W, H);
        if (state.feather > 0) maskCtx.filter = `blur(${state.feather}px)`;
        const rx = mw / state.srcNatW,
            ry = mh / state.srcNatH,
            c = state.crop;
        maskCtx.drawImage(srcMask, c.sx * rx, c.sy * ry, c.sw * rx, c.sh * ry, 0, 0, W, H);
        maskCtx.filter = 'none';
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
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result);
            const id = saveSavedBg(url); // lưu lại để dùng lại
            renderBgRows();
            selectBg('saved:' + id);
        };
        reader.readAsDataURL(file);
    }

    // ===== Logo / watermark =============================================
    const LOGO_KEY = 'ps_logo';
    function applyLogoDataUrl(url) {
        const img = new Image();
        img.onload = () => {
            state.logoImg = img;
            el.logoThumb.hidden = false;
            el.logoThumb.style.backgroundImage = `url(${url})`;
            renderReview();
        };
        img.src = url;
    }
    function loadLogo() {
        try {
            const url = localStorage.getItem(LOGO_KEY);
            if (url) applyLogoDataUrl(url);
        } catch {}
    }
    function onLogoFile(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result);
            try {
                localStorage.setItem(LOGO_KEY, url);
            } catch {}
            applyLogoDataUrl(url);
            state.logoOn = true;
            el.logoOn.checked = true;
            renderReview();
            notify('Đã lưu logo. Bật/tắt ở "Hiện logo".', 'success');
        };
        reader.readAsDataURL(file);
    }

    // ===== Backgrounds: presets + saved + render 2 hàng =================
    const PRESETS = [
        {
            id: 'studio-white',
            name: 'Studio trắng',
            kind: 'linear',
            css: 'linear-gradient(180deg,#ffffff,#e3e9f0)',
            stops: [
                [0, '#ffffff'],
                [1, '#e3e9f0'],
            ],
        },
        {
            id: 'studio-grey',
            name: 'Xám studio',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#fbfcfd,#c4ccd6)',
            stops: [
                [0, '#fbfcfd'],
                [1, '#c4ccd6'],
            ],
        },
        {
            id: 'warm-beige',
            name: 'Kem ấm',
            kind: 'linear',
            css: 'linear-gradient(180deg,#fdf6ec,#e7d6bf)',
            stops: [
                [0, '#fdf6ec'],
                [1, '#e7d6bf'],
            ],
        },
        {
            id: 'soft-pink',
            name: 'Hồng',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#fff0f3,#f4c4d2)',
            stops: [
                [0, '#fff0f3'],
                [1, '#f4c4d2'],
            ],
        },
        {
            id: 'soft-blue',
            name: 'Xanh dịu',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#eef5ff,#bcd4f0)',
            stops: [
                [0, '#eef5ff'],
                [1, '#bcd4f0'],
            ],
        },
        {
            id: 'mint',
            name: 'Bạc hà',
            kind: 'linear',
            css: 'linear-gradient(180deg,#eefaf3,#bfe6d2)',
            stops: [
                [0, '#eefaf3'],
                [1, '#bfe6d2'],
            ],
        },
        {
            id: 'sunset',
            name: 'Nắng',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 35%,#fff3da,#f6c89a)',
            stops: [
                [0, '#fff3da'],
                [1, '#f6c89a'],
            ],
        },
        {
            id: 'dark-lux',
            name: 'Tối sang',
            kind: 'radial',
            css: 'radial-gradient(circle at 50% 38%,#3a4658,#11161f)',
            stops: [
                [0, '#3a4658'],
                [1, '#11161f'],
            ],
        },
    ];
    const SOLIDS = [
        { c: '#ffffff', name: 'Trắng' },
        { c: '#000000', name: 'Đen' },
    ];
    // Nền cảnh có sẵn (Unsplash CDN, CORS * → vẽ canvas + export OK với crossOrigin).
    const SCENES = [
        { id: 'bien-nhiet-doi', name: 'Biển nhiệt đới', u: 'photo-1507525428034-b723cf961d3e' },
        {
            id: 'chan-troi-dai-duong',
            name: 'Chân trời đại dương',
            u: 'photo-1505228395891-9a51e7e86bf6',
        },
        {
            id: 'thanh-pho-tren-cao',
            name: 'Toàn cảnh thành phố',
            u: 'photo-1480714378408-67cf0d13bc1b',
        },
        { id: 'pho-dem', name: 'Phố đêm bokeh', u: 'photo-1449824913935-59a10b8d2000' },
        { id: 'ruong-lua', name: 'Ruộng lúa', u: 'photo-1500382017468-9049fed747ef' },
        { id: 'doi-xanh', name: 'Đồi xanh quê', u: 'photo-1470071459604-3b5ec3a7fe05' },
        { id: 'rung-xanh', name: 'Rừng xanh', u: 'photo-1441974231531-c6227db76b6e' },
        { id: 'thac-nuoc', name: 'Thác nước', u: 'photo-1432405972618-c60b0225b8f9' },
        { id: 'nui-cao', name: 'Núi cao', u: 'photo-1506905925346-21bda4d32df4' },
        { id: 'hoang-hon', name: 'Hoàng hôn', u: 'photo-1495616811223-4d98c6e9c869' },
        { id: 'den-bokeh', name: 'Ánh đèn bokeh', u: 'photo-1492684223066-81342ee5ff30' },
        { id: 'tuong-hoa', name: 'Tường hoa hồng', u: 'photo-1530103862676-de8c9debad1d' },
        { id: 'quan-cafe', name: 'Quán cafe ấm cúng', u: 'photo-1554118811-1e0d58224f24' },
        { id: 'phong-trang', name: 'Phòng trắng tối giản', u: 'photo-1497366216548-37526070297c' },
        { id: 'vuon-cay', name: 'Vườn cây xanh', u: 'photo-1416879595882-3373a0480b5b' },
        { id: 'san-thuong', name: 'Sân thượng thành phố', u: 'photo-1542353436-312f0e1f67ff' },
    ];
    const sceneFull = (u) => `https://images.unsplash.com/${u}?auto=format&fit=crop&w=1280&q=80`;
    const sceneThumb = (u) => `https://images.unsplash.com/${u}?w=96&h=96&fit=crop&q=60`;
    const sceneCache = {}; // id → HTMLImageElement đã load (crossOrigin)
    const SAVED_KEY = 'ps_saved_bgs';
    const SAVED_MAX = 8;

    function loadSavedBgs() {
        try {
            state.savedBgs = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]').slice(
                0,
                SAVED_MAX
            );
        } catch {
            state.savedBgs = [];
        }
    }
    function persistSavedBgs() {
        try {
            localStorage.setItem(SAVED_KEY, JSON.stringify(state.savedBgs.slice(0, SAVED_MAX)));
        } catch {}
    }
    function saveSavedBg(url) {
        const id = 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
        state.savedBgs.unshift({ id, url });
        state.savedBgs = state.savedBgs.slice(0, SAVED_MAX);
        persistSavedBgs();
        return id;
    }
    function deleteSavedBg(id) {
        state.savedBgs = state.savedBgs.filter((b) => b.id !== id);
        persistSavedBgs();
        if (state.bgKey === 'saved:' + id) selectBg('transparent');
        renderBgRows();
    }

    function bgRowHTML() {
        let h = '';
        h += `<button class="ps-bg-chip" data-bg="transparent" title="Trong suốt"><span class="ps-chip-checker"></span></button>`;
        for (const s of SOLIDS)
            h += `<button class="ps-bg-chip" data-bg="color" data-color="${s.c}" title="${s.name}" style="background:${s.c}${s.c === '#ffffff' ? ';border:1px solid #d6dde6' : ''}"></button>`;
        for (const p of PRESETS)
            h += `<button class="ps-bg-chip" data-bg="preset" data-preset="${p.id}" title="${p.name}" style="background:${p.css}"></button>`;
        h += `<button class="ps-bg-chip ps-bg-blur" data-bg="blur" title="Mờ nền"><i data-lucide="aperture"></i></button>`;
        for (const sc of SCENES)
            h += `<span class="ps-bg-chip ps-bg-scene" data-bg="scene" data-id="${sc.id}" title="${sc.name}" style="background-image:url(${sceneThumb(sc.u)})"></span>`;
        for (const b of state.savedBgs)
            h += `<span class="ps-bg-chip ps-bg-saved" data-bg="saved" data-id="${b.id}" title="Nền đã lưu" style="background-image:url(${b.url})"><button class="ps-bg-del" data-del="${b.id}" aria-label="Xóa">×</button></span>`;
        h += `<button class="ps-bg-chip ps-bg-pick" data-bg="pick" title="Màu khác"><i data-lucide="pipette"></i></button>`;
        h += `<button class="ps-bg-chip ps-bg-add" data-bg="upload" title="Thêm ảnh nền"><i data-lucide="image-plus"></i></button>`;
        return h;
    }

    function renderBgRows() {
        const html = bgRowHTML();
        [el.bgRowCam, el.bgRowReview].forEach((row) => {
            if (row) row.innerHTML = html;
        });
        applyActiveBg();
        relucide();
    }

    function applyActiveBg() {
        [el.bgRowCam, el.bgRowReview].forEach((row) => {
            if (!row) return;
            row.querySelectorAll('[data-bg]').forEach((c) =>
                c.classList.toggle('is-active', chipKey(c) === state.bgKey)
            );
        });
    }
    function chipKey(chip) {
        const t = chip.dataset.bg;
        if (t === 'color') return 'color:' + chip.dataset.color;
        if (t === 'preset') return 'preset:' + chip.dataset.preset;
        if (t === 'saved') return 'saved:' + chip.dataset.id;
        if (t === 'scene') return 'scene:' + chip.dataset.id;
        return t; // transparent | blur
    }

    function onBgChip(chip) {
        const t = chip.dataset.bg;
        if (t === 'pick') {
            el.bgColor.click();
            return;
        }
        if (t === 'upload') {
            el.bgFile.click();
            return;
        }
        selectBg(chipKey(chip));
    }

    /** Chọn nền theo key: transparent | blur | color:#hex | preset:id | saved:id */
    function selectBg(key) {
        state.bgKey = key;
        if (key === 'transparent') state.bgType = 'transparent';
        else if (key === 'blur') state.bgType = 'blur';
        else if (key.startsWith('color:')) {
            state.bgType = 'color';
            state.bgColor = key.slice(6);
        } else if (key.startsWith('preset:')) {
            state.bgType = 'preset';
            state.bgPreset = key.slice(7);
        } else if (key.startsWith('saved:')) {
            const rec = state.savedBgs.find((b) => b.id === key.slice(6));
            if (rec) {
                const img = new Image();
                img.onload = () => {
                    state.bgImage = img;
                    state.bgType = 'image';
                    renderReview();
                };
                img.src = rec.url;
            }
        } else if (key.startsWith('scene:')) {
            const id = key.slice(6);
            const sc = SCENES.find((s) => s.id === id);
            if (sc) {
                if (sceneCache[id]) {
                    state.bgImage = sceneCache[id];
                    state.bgType = 'image';
                } else {
                    showLoading('Đang tải nền…');
                    const img = new Image();
                    img.crossOrigin = 'anonymous'; // BẮT BUỘC để export canvas (Unsplash CORS *)
                    img.onload = () => {
                        sceneCache[id] = img;
                        hideLoading();
                        if (state.bgKey === key) {
                            state.bgImage = img;
                            state.bgType = 'image';
                            renderReview();
                        }
                    };
                    img.onerror = () => {
                        hideLoading();
                        notify('Không tải được nền (mạng?). Thử nền khác.', 'error');
                    };
                    img.src = sceneFull(sc.u);
                    state.bgType = 'image'; // đặt trước, ảnh set khi load xong
                }
            }
        }
        applyActiveBg();
        renderReview();
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
            if (state._aiEngine === 'tasks') {
                // segmentForVideo (VIDEO mode) chạy đồng bộ → không cần busy gate
                try {
                    const inp = segInputFrame();
                    if (inp)
                        state._segmenter.segmentForVideo(inp, performance.now(), onTasksResult);
                } catch (e) {
                    /* bỏ qua frame lỗi */
                }
            } else if (!state.busy) {
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
        if (!state.W || !state.H) return;
        // legacy mask ở native res → rx=1
        populateMaskC(results.segmentationMask, state.srcNatW, state.srcNatH);
        composeAI(octx, state.W, state.H, results.image, maskC, state.crop, true);
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
        } else if (state.bgType === 'preset') {
            drawPreset(ctx, W, H, state.bgPreset);
        }
    }

    function drawPreset(ctx, W, H, id) {
        const p = PRESETS.find((x) => x.id === id);
        if (!p) return;
        let g;
        if (p.kind === 'radial') {
            g = ctx.createRadialGradient(
                W / 2,
                H * 0.42,
                0,
                W / 2,
                H * 0.42,
                Math.hypot(W, H) * 0.62
            );
        } else {
            g = ctx.createLinearGradient(0, 0, 0, H);
        }
        p.stops.forEach(([o, c]) => g.addColorStop(o, c));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
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
            state._sil = buildSilhouette(cutout, W, H); // bóng đổ
            state._capFrame = frameCv;
            state._capW = W;
            state._capH = H;
            state.tx = 0;
            state.ty = 0;
            state.scale = 1; // reset transform mỗi lần chụp
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
        // isnet_quint8: model nén nhỏ/nhanh nhất (tải nhẹ + xử lý nhanh ~2-3×),
        // viền giảm chất lượng nhẹ — đổi lấy tốc độ trên điện thoại.
        return blobToImage(await mod.removeBackground(blob, { model: 'isnet_quint8' }));
    }
    async function cloudCutout(canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        // withoutbg: free 50/tháng, full HD, KHÔNG watermark. Hết quota → fallback @imgly.
        const res = await fetch(`${CUTOUT_API}/withoutbg`, {
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
    /** Silhouette đen của cutout (cho bóng đổ). */
    function buildSilhouette(cutout, W, H) {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d');
        x.drawImage(cutout, 0, 0);
        x.globalCompositeOperation = 'source-in';
        x.fillStyle = '#000';
        x.fillRect(0, 0, W, H);
        return c;
    }

    function drawShadow(ctx, W, H) {
        if (!state._sil) return;
        const soft = state.shadowSoft;
        const dy = Math.round(soft * 0.55 + H * 0.012); // bóng đổ xuống dưới
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.filter = `blur(${soft}px)`;
        ctx.drawImage(state._sil, 0, dy, W, H);
        ctx.restore();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
    }

    function drawLogo(ctx, W, H) {
        const img = state.logoImg;
        if (!img) return;
        const lw = Math.round(W * 0.2);
        const lh = Math.round(lw * (img.naturalHeight / img.naturalWidth || 1));
        const m = Math.round(W * 0.03);
        let x = W - lw - m,
            y = H - lh - m; // br
        if (state.logoPos === 'bl') x = m;
        else if (state.logoPos === 'tr') y = m;
        else if (state.logoPos === 'tl') {
            x = m;
            y = m;
        }
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(img, x, y, lw, lh);
        ctx.restore();
    }

    function renderReview() {
        const W = state._capW,
            H = state._capH;
        if (!W || !state._cutout) return;
        rctx.clearRect(0, 0, W, H);
        const transparent = state.bgType === 'transparent';
        drawBg(rctx, W, H, state._capFrame, { sx: 0, sy: 0, sw: W, sh: H }); // nền cố định
        // nhóm chủ thể (bóng + cutout) — áp transform di chuyển/phóng to
        rctx.save();
        rctx.translate(W / 2 + state.tx, H / 2 + state.ty);
        rctx.scale(state.scale, state.scale);
        rctx.translate(-W / 2, -H / 2);
        if (state.shadow && !transparent) drawShadow(rctx, W, H);
        if (state.enhance) rctx.filter = 'brightness(1.06) contrast(1.08) saturate(1.14)';
        rctx.drawImage(state._cutout, 0, 0);
        rctx.filter = 'none';
        rctx.restore();
        // logo/watermark cố định
        if (state.logoOn && state.logoImg) drawLogo(rctx, W, H);
        el.reviewCanvas.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
        el.reviewStage.classList.toggle('ps-checker', transparent);
        el.reviewMeta.textContent = state.exportPx
            ? `${W}×${H} → ${state.exportPx}px`
            : `${W}×${H}`;
    }

    // ---- Cử chỉ di chuyển / phóng to chủ thể trên màn Xem --------------
    function bindReviewGestures() {
        const stage = el.reviewStage;
        const pointers = new Map();
        let lastDist = 0,
            lastCx = 0,
            lastCy = 0,
            raf = 0;
        const ratio = () => state._capW / (el.reviewCanvas.getBoundingClientRect().width || 1);
        const schedule = () => {
            if (!raf)
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    renderReview();
                });
        };
        stage.addEventListener('pointerdown', (e) => {
            if (el.review.hidden) return;
            if (e.target.closest('button')) return; // không cướp click nút (Căn giữa)
            try {
                stage.setPointerCapture(e.pointerId);
            } catch {}
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                lastDist = Math.hypot(a.x - b.x, a.y - b.y);
                lastCx = (a.x + b.x) / 2;
                lastCy = (a.y + b.y) / 2;
            }
        });
        stage.addEventListener('pointermove', (e) => {
            const prev = pointers.get(e.pointerId);
            if (!prev) return;
            const cur = { x: e.clientX, y: e.clientY };
            pointers.set(e.pointerId, cur);
            const r = ratio();
            if (pointers.size === 1) {
                state.tx += (cur.x - prev.x) * r;
                state.ty += (cur.y - prev.y) * r;
                schedule();
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (lastDist > 0) state.scale = clamp(state.scale * (dist / lastDist), 0.3, 5);
                lastDist = dist;
                const cx = (a.x + b.x) / 2,
                    cy = (a.y + b.y) / 2;
                state.tx += (cx - lastCx) * r;
                state.ty += (cy - lastCy) * r;
                lastCx = cx;
                lastCy = cy;
                schedule();
            }
        });
        const up = (e) => {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) lastDist = 0;
        };
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);
    }
    function clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
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
        const srcW = state._capW,
            srcH = state._capH;
        if (!srcW) return;
        // khổ xuất: scale cạnh dài về exportPx (preset sàn), nếu 0 thì giữ gốc
        let W = srcW,
            H = srcH;
        if (state.exportPx) {
            const s = state.exportPx / Math.max(srcW, srcH);
            W = Math.round(srcW * s);
            H = Math.round(srcH * s);
        }
        const fmt = state.format; // png | jpg | webp
        const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const c = out.getContext('2d');
        if (fmt === 'jpg') {
            c.fillStyle = '#ffffff'; // JPG không alpha → nền trắng
            c.fillRect(0, 0, W, H);
        }
        if (state.mirror && state.source === 'camera') {
            c.translate(W, 0);
            c.scale(-1, 1);
        }
        c.drawImage(el.reviewCanvas, 0, 0, W, H); // scale review (đã ghép shadow/enhance/logo)
        out.toBlob(
            (blob) => blob && saveBlob(blob, `tach-nen-${stamp()}.${fmt}`),
            mime,
            fmt === 'png' ? undefined : state.quality
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
        // AI nhanh: nếu model chưa tải xong + đang chạy → hiện loading (preview vẫn show raw)
        if (isAi && state.running && !state.modelLoaded) showLoading('Đang tải mô hình AI nhanh…');
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
