// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — tầng UI: camera, tải ảnh, vòng render live, hàng chọn nền
 * (preset/cảnh/đã-lưu), logo, mode/sheet tùy chọn, cache DOM + bind sự kiện.
 *
 * Điều phối thao tác người dùng → gọi engine (photo-studio-bg.js) / chỉnh sửa.
 * Gắn vào `window.PS`. `cache()`+`bind()` được orchestrator (app) gọi trong init.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- DOM cache + event bind -----------------------------------------
    PS.cache = function () {
        const el = PS.el;
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
            'brushToggle:psBrushToggle',
            'brushBar:psBrushBar',
            'brushDone:psBrushDone',
            'brushSize:psBrushSize',
            'brushCursor:psBrushCursor',
            'pickToggle:psPickToggle',
            'pickBar:psPickBar',
            'pickUndo:psPickUndo',
            'pickExtract:psPickExtract',
            'pickCancel:psPickCancel',
            'pickApply:psPickApply',
            'pickHint:psPickHint',
            'moveHint:psMoveHint',
            'reviewMeta:psReviewMeta',
            'reviewStage:psReviewStage',
            'reviewCanvas:psReviewCanvas',
            'bgRowCam:psBgRowCam',
            'bgRowReview:psBgRowReview',
            'bgColor:psBgColor',
            'bgFile:psBgFile',
            'retake:psRetake',
            'save:psSave',
            'shareFb:psShareFb',
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
            'upscale:psUpscale',
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
            'batchFile:psBatchFile',
            'batch:psBatch',
            'batchGrid:psBatchGrid',
            'batchCount:psBatchCount',
            'batchClose:psBatchClose',
            'batchClose2:psBatchClose2',
            'batchZip:psBatchZip',
        ].forEach((p) => {
            const [k, v] = p.split(':');
            el[k] = id(v);
        });
    };

    PS.bind = function () {
        const state = PS.state,
            el = PS.el;
        el.startCam.addEventListener('click', PS.toggleCamera);
        el.switchCam.addEventListener('click', PS.switchCamera);
        el.capture.addEventListener('click', PS.capture);
        el.sourceFile.addEventListener('change', PS.onSourceFile);
        el.optionsToggle.addEventListener('click', PS.openSheet);
        el.reviewOptions.addEventListener('click', PS.openSheet);
        el.sheetClose.addEventListener('click', PS.closeSheet);
        el.sheetBackdrop.addEventListener('click', PS.closeSheet);
        el.output.addEventListener('click', PS.sampleKeyFromStage);
        el.reviewBack.addEventListener('click', PS.backToCamera);
        el.retake.addEventListener('click', PS.backToCamera);
        el.save.addEventListener('click', PS.saveReview);
        el.shareFb && el.shareFb.addEventListener('click', PS.shareReviewToFb);
        el.bgFile.addEventListener('change', PS.onBgFile);
        el.resetTransform.addEventListener('click', () => {
            state.tx = 0;
            state.ty = 0;
            state.scale = 1;
            PS.renderReview();
        });
        PS.bindReviewGestures();
        // Before/after: giữ nút để xem ảnh gốc
        const showOriginal = () => {
            if (!state._capFrame) return;
            PS.rctx.clearRect(0, 0, state._capW, state._capH);
            PS.rctx.drawImage(state._capFrame, 0, 0);
        };
        el.compare.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            showOriginal();
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
            el.compare.addEventListener(ev, () => PS.renderReview())
        );
        // Brush sửa viền
        el.brushToggle.addEventListener('click', () => PS.setBrushMode(true));
        el.brushDone.addEventListener('click', () => PS.setBrushMode(false));
        el.brushBar.querySelectorAll('.ps-brush-tool[data-tool]').forEach((b) =>
            b.addEventListener('click', () => {
                state.brushTool = b.dataset.tool;
                PS.activate(el.brushBar.querySelectorAll('.ps-brush-tool'), b);
            })
        );
        el.brushSize.addEventListener('input', () => {
            state.brushSize = parseInt(el.brushSize.value, 10);
            const lbl = document.getElementById('psBrushSizeLabel');
            if (lbl) lbl.textContent = state.brushSize + 'px';
        });
        // Chọn đúng món (MobileSAM)
        el.pickToggle.addEventListener('click', () => PS.enterPickMode());
        el.pickCancel.addEventListener('click', () => PS.exitPickMode(false));
        el.pickApply.addEventListener('click', () => PS.exitPickMode(true));
        el.pickUndo.addEventListener('click', PS.undoPickPoint);
        el.pickExtract.addEventListener('click', PS.extractPickedObject);
        el.pickBar.querySelectorAll('.ps-pick-tool[data-ptool]').forEach((b) =>
            b.addEventListener('click', () => {
                state.pickTool = b.dataset.ptool;
                PS.activate(el.pickBar.querySelectorAll('.ps-pick-tool'), b);
            })
        );
        // Xử lý hàng loạt
        el.batchFile.addEventListener('change', PS.onBatchFiles);
        el.batchClose.addEventListener('click', () => (el.batch.hidden = true));
        el.batchClose2.addEventListener('click', () => (el.batch.hidden = true));
        el.batchZip.addEventListener('click', PS.downloadBatchZip);

        el.modePills
            .querySelectorAll('button[data-mode]')
            .forEach((b) => b.addEventListener('click', () => PS.setMode(b.dataset.mode)));
        // Hàng chọn nền (cả 2 màn) — delegated click
        [el.bgRowCam, el.bgRowReview].forEach((row) =>
            row.addEventListener('click', (e) => {
                const delBtn = e.target.closest('[data-del]');
                if (delBtn) {
                    e.stopPropagation();
                    PS.deleteSavedBg(delBtn.dataset.del);
                    return;
                }
                const chip = e.target.closest('[data-bg]');
                if (chip) PS.onBgChip(chip);
            })
        );
        el.bgColor.addEventListener('input', () => PS.selectBg('color:' + el.bgColor.value));
        document.querySelectorAll('.ps-eng-btn[data-hqeng]').forEach((b) =>
            b.addEventListener('click', () => {
                state.hqEngine = b.dataset.hqeng;
                PS.activate(document.querySelectorAll('.ps-eng-btn'), b);
            })
        );
        document.querySelectorAll('.ps-fmt-btn[data-fmt]').forEach((b) =>
            b.addEventListener('click', () => {
                state.format = b.dataset.fmt;
                PS.activate(document.querySelectorAll('.ps-fmt-btn'), b);
                el.qualityWrap.style.display = state.format === 'png' ? 'none' : '';
            })
        );
        // Khổ sàn TMĐT: đặt aspect + kích thước xuất
        el.marketRow.querySelectorAll('.ps-chip[data-mk]').forEach((b) =>
            b.addEventListener('click', () => {
                state.market = b.dataset.mk;
                state.aspect = parseFloat(b.dataset.ar);
                state.exportPx = parseInt(b.dataset.px, 10);
                PS.activate(el.marketRow.querySelectorAll('.ps-chip'), b);
                PS.activate(el.aspectRow.querySelectorAll('.ps-chip'), null); // bỏ chọn tỉ lệ thủ công
                PS.recomputeSizes();
                PS.renderReview();
                PS.notify('Khổ ' + b.textContent.trim() + ' — chụp lại để áp tỉ lệ.', 'info');
            })
        );
        // Bóng đổ / tự động đẹp
        el.shadow.addEventListener('change', () => {
            state.shadow = el.shadow.checked;
            PS.renderReview();
        });
        PS.bindSlider(
            el.shadowSoft,
            'shadowSoft',
            (v) => v + 'px',
            el.shadowVal,
            true,
            PS.renderReview
        );
        el.enhance.addEventListener('change', () => {
            state.enhance = el.enhance.checked;
            PS.renderReview();
        });
        // Chất lượng xuất
        PS.bindSlider(el.quality, 'quality', (v) => Math.round(v * 100) + '%', el.qualityVal);
        // Logo / watermark
        el.logoFile.addEventListener('change', PS.onLogoFile);
        el.logoOn.addEventListener('change', () => {
            state.logoOn = el.logoOn.checked;
            PS.renderReview();
        });
        el.logoPosRow.querySelectorAll('.ps-chip[data-pos]').forEach((b) =>
            b.addEventListener('click', () => {
                state.logoPos = b.dataset.pos;
                PS.activate(el.logoPosRow.querySelectorAll('.ps-chip'), b);
                PS.renderReview();
            })
        );
        el.aspectRow.querySelectorAll('.ps-chip[data-ar]').forEach((b) =>
            b.addEventListener('click', () => {
                state.aspect = b.dataset.ar ? parseFloat(b.dataset.ar) : null;
                PS.activate(el.aspectRow.querySelectorAll('.ps-chip'), b);
                PS.recomputeSizes();
            })
        );
        el.chromaGroup.querySelectorAll('.ps-swatch[data-key]').forEach((b) =>
            b.addEventListener('click', () => {
                const [r, g, bb] = b.dataset.key.split(',').map(Number);
                state.key = { r, g, b: bb };
                el.keyColor.value = PS.rgbToHex(r, g, bb);
                PS.activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), b);
            })
        );
        el.keyColor.addEventListener('input', () => {
            state.key = PS.hexToRgb(el.keyColor.value);
            PS.activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), null);
        });
        PS.bindSlider(el.threshold, 'threshold', (v) => v.toFixed(2), el.threshVal);
        PS.bindSlider(el.smooth, 'smooth', (v) => v.toFixed(2), el.smoothVal);
        PS.bindSlider(el.feather, 'feather', (v) => v + 'px', el.featherVal, true);
        PS.bindSlider(
            el.blurStrength,
            'blurStrength',
            (v) => v + 'px',
            el.blurVal,
            true,
            PS.renderReview
        );
        el.spill.addEventListener('change', () => (state.spill = el.spill.checked));
        el.mirror.addEventListener('change', () => {
            state.mirror = el.mirror.checked;
            PS.applyMirrorClass();
            PS.renderReview();
        });
        if (el.upscale)
            el.upscale.addEventListener('change', () => (state.upscale = el.upscale.checked));
    };

    PS.bindSlider = function (input, key, fmt, label, isInt, after) {
        input.addEventListener('input', () => {
            PS.state[key] = isInt ? parseInt(input.value, 10) : parseFloat(input.value);
            label.textContent = fmt(PS.state[key]);
            if (after) after();
        });
    };

    PS.applyMobileDefaults = function () {
        const state = PS.state,
            el = PS.el;
        if (!PS.isMobile()) return;
        state.facingMode = 'environment';
        state.mirror = false;
        el.mirror.checked = false;
    };

    // ---- Camera ---------------------------------------------------------
    PS.toggleCamera = async function () {
        const state = PS.state;
        if (state.running && state.source === 'camera') {
            PS.stopAll();
            return;
        }
        await PS.startCamera();
    };

    PS.autoStartIfAllowed = async function () {
        const state = PS.state;
        try {
            if (!navigator.permissions?.query) return;
            const st = await navigator.permissions.query({ name: 'camera' });
            if (st.state === 'granted') PS.startCamera({ silent: true });
            else if (st.state === 'denied')
                PS.showPermissionHelp('Quyền camera đang bị chặn cho trang này.');
            st.onchange = () => {
                if (st.state === 'granted' && state.source !== 'image' && !state.stream)
                    PS.startCamera({ silent: true });
            };
        } catch {
            /* Permissions API không hỗ trợ 'camera' */
        }
    };

    PS.startCamera = async function (opts = {}) {
        const state = PS.state,
            el = PS.el;
        if (!isSecureContext) return PS.notify('Camera cần HTTPS.', 'error');
        if (!navigator.mediaDevices?.getUserMedia)
            return PS.notify('Trình duyệt không hỗ trợ camera.', 'error');
        PS.stopStream();
        PS.showLoading('Đang mở camera…');
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
            await PS.waitForVideo();
            state.srcNatW = el.video.videoWidth;
            state.srcNatH = el.video.videoHeight;
            PS.recomputeSizes();
            PS.syncMirrorToFacing();
            el.stageEmpty.hidden = true;
            el.startCam.hidden = true;
            el.switchCam.disabled = false;
            el.capture.disabled = false;
            PS.updateHqHint();
            PS.hideLoading();
            PS.startLoop();
        } catch (e) {
            PS.hideLoading();
            console.error('[photo-studio] getUserMedia', e);
            if (!opts.silent) {
                const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
                if (denied) PS.showPermissionHelp('Quyền camera đang bị chặn cho trang này.');
                else PS.showStageError(PS.cameraErrorMsg(e));
                PS.notify(PS.cameraErrorMsg(e), 'error');
            }
        }
    };

    PS.cameraErrorMsg = function (e) {
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
    };

    PS.showStageError = function (msg) {
        const el = PS.el;
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i><p class="ps-stage-err">${msg}</p>` +
            `<button class="ps-start-cta" id="psRetryCam" style="position:static;transform:none">` +
            `<i data-lucide="rotate-cw"></i> Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => PS.startCamera());
        PS.relucide();
    };

    PS.showPermissionHelp = function (reason) {
        const el = PS.el;
        el.stageEmpty.innerHTML =
            `<i data-lucide="camera-off"></i><p class="ps-stage-err">${reason}</p>` +
            `<div class="ps-help">${PS.permissionStepsHTML()}</div>` +
            `<button class="ps-start-cta" id="psRetryCam" style="position:static;transform:none">` +
            `<i data-lucide="rotate-cw"></i> Đã cấp quyền — Thử lại</button>`;
        el.stageEmpty.hidden = false;
        document.getElementById('psRetryCam')?.addEventListener('click', () => PS.startCamera());
        PS.relucide();
    };

    PS.permissionStepsHTML = function () {
        if (PS.isIOS()) {
            return (
                `<div class="ps-help-title">Bật quyền Camera trên iPhone:</div><ol>` +
                `<li>Mở <b>Cài đặt</b> → cuộn tìm <b>${PS.browserName()}</b></li>` +
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
    };

    PS.syncMirrorToFacing = function () {
        const state = PS.state,
            el = PS.el;
        state.mirror = state.facingMode === 'user';
        el.mirror.checked = state.mirror;
        PS.applyMirrorClass();
    };
    PS.waitForVideo = function () {
        const el = PS.el;
        return new Promise((res) => {
            if (el.video.readyState >= 2 && el.video.videoWidth) return res();
            el.video.addEventListener('loadeddata', () => res(), { once: true });
        });
    };
    PS.switchCamera = async function () {
        const state = PS.state;
        state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
        await PS.startCamera();
    };
    PS.stopStream = function () {
        const state = PS.state;
        if (state.stream) {
            state.stream.getTracks().forEach((t) => t.stop());
            state.stream = null;
        }
    };
    PS.stopAll = function () {
        const state = PS.state,
            el = PS.el;
        PS.stopLoop();
        PS.stopStream();
        state.running = false;
        PS.octx && PS.octx.clearRect(0, 0, el.output.width, el.output.height);
        el.stageEmpty.hidden = false;
        el.startCam.hidden = false;
        el.fps.hidden = true;
        el.hqHint.hidden = true;
        el.capture.disabled = true;
        el.switchCam.disabled = true;
    };

    // ---- Source: image upload ------------------------------------------
    PS.onSourceFile = function (e) {
        const state = PS.state,
            el = PS.el;
        const file = e.target.files?.[0];
        if (!file) return;
        const img = new Image();
        img.onload = () => {
            PS.stopStream();
            PS.stopLoop();
            state.source = 'image';
            state._sourceImg = img;
            state.srcNatW = img.naturalWidth;
            state.srcNatH = img.naturalHeight;
            PS.recomputeSizes();
            state.mirror = false;
            el.mirror.checked = false;
            PS.applyMirrorClass();
            el.stageEmpty.hidden = true;
            el.startCam.hidden = true;
            el.capture.disabled = false;
            el.switchCam.disabled = true;
            PS.updateHqHint();
            PS.startLoop();
        };
        img.onerror = () => PS.notify('Không đọc được ảnh.', 'error');
        img.src = URL.createObjectURL(file);
        e.target.value = '';
    };

    PS.onBgFile = function (e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result);
            const id = PS.saveSavedBg(url); // lưu lại để dùng lại
            PS.renderBgRows();
            PS.selectBg('saved:' + id);
        };
        reader.readAsDataURL(file);
    };

    // ===== Logo / watermark =============================================
    PS.LOGO_KEY = 'ps_logo';
    PS.applyLogoDataUrl = function (url) {
        const state = PS.state,
            el = PS.el;
        const img = new Image();
        img.onload = () => {
            state.logoImg = img;
            el.logoThumb.hidden = false;
            el.logoThumb.style.backgroundImage = `url(${url})`;
            PS.renderReview();
        };
        img.src = url;
    };
    PS.loadLogo = function () {
        try {
            const url = localStorage.getItem(PS.LOGO_KEY);
            if (url) PS.applyLogoDataUrl(url);
        } catch {}
    };
    PS.onLogoFile = function (e) {
        const state = PS.state,
            el = PS.el;
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result);
            try {
                localStorage.setItem(PS.LOGO_KEY, url);
            } catch {}
            PS.applyLogoDataUrl(url);
            state.logoOn = true;
            el.logoOn.checked = true;
            PS.renderReview();
            PS.notify('Đã lưu logo. Bật/tắt ở "Hiện logo".', 'success');
        };
        reader.readAsDataURL(file);
    };

    // ===== Backgrounds (preset/cảnh/đã-lưu + chọn nền) → photo-studio-bgpicker.js

    // ---- Live render loop ----------------------------------------------
    PS.startLoop = function () {
        const state = PS.state,
            el = PS.el;
        state.running = true;
        PS.updateHqHint();
        el.sampleHint.hidden = !(state.mode === 'chroma');
        cancelAnimationFrame(state.rafId);
        PS.frame();
    };
    PS.stopLoop = function () {
        const state = PS.state;
        state.running = false;
        cancelAnimationFrame(state.rafId);
    };
    PS.frame = function () {
        const state = PS.state;
        if (!state.running) return;
        if (state.mode === 'ai' && state.segReady) {
            if (state._aiEngine === 'tasks') {
                // segmentForVideo (VIDEO mode) chạy đồng bộ → không cần busy gate
                try {
                    const inp = PS.segInputFrame();
                    if (inp)
                        state._segmenter.segmentForVideo(inp, performance.now(), PS.onTasksResult);
                } catch (e) {
                    /* bỏ qua frame lỗi */
                }
            } else if (!state.busy) {
                state.busy = true;
                state.seg
                    .send({ image: PS.currentSourceEl() })
                    .catch(() => {})
                    .finally(() => (state.busy = false));
            }
        } else if (state.mode === 'chroma') {
            PS.renderChroma(PS.octx, state.W, state.H, PS.currentSourceEl(), state.crop, true);
            PS.tickFps();
        } else {
            PS.renderPassthrough(PS.octx, state.W, state.H, PS.currentSourceEl(), state.crop);
            PS.tickFps();
        }
        state.rafId = requestAnimationFrame(PS.frame);
    };

    PS.renderPassthrough = function (ctx, W, H, src, crop) {
        if (!W || !H || !src) return;
        try {
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {}
    };

    PS.renderChroma = function (ctx, W, H, src, crop, withBg) {
        const state = PS.state;
        if (!W || !H || !src) return;
        PS.sizeCanvas(PS.work, W, H);
        try {
            PS.workCtx.clearRect(0, 0, W, H);
            PS.workCtx.drawImage(src, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        } catch {
            return;
        }
        const d = PS.workCtx.getImageData(0, 0, W, H);
        PS.keyOut(d, state.key, state.threshold, state.smooth, state.spill);
        PS.workCtx.putImageData(d, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (withBg) PS.drawBg(ctx, W, H, src, crop);
        ctx.drawImage(PS.work, 0, 0, W, H);
    };

    // ---- Mode / UI ------------------------------------------------------
    PS.setMode = function (mode) {
        const state = PS.state,
            el = PS.el;
        state.mode = mode;
        PS.activate(el.modePills.querySelectorAll('button[data-mode]'), null);
        el.modePills.querySelector(`button[data-mode="${mode}"]`)?.classList.add('is-active');
        const isChroma = mode === 'chroma';
        const isAi = mode === 'ai';
        const isHq = mode === 'hq';
        el.chromaGroup.hidden = !isChroma;
        el.aiGroup.hidden = !isAi;
        el.engineGroup.hidden = !isHq;
        el.sampleHint.hidden = !(isChroma && state.running);
        el.output.classList.toggle('ps-pickable', isChroma);
        PS.updateHqHint();
        // AI nhanh: nếu model chưa tải xong + đang chạy → hiện loading (preview vẫn show raw)
        if (isAi && state.running && !state.modelLoaded)
            PS.showLoading('Đang tải mô hình AI nhanh…');
    };
    PS.updateHqHint = function () {
        const state = PS.state;
        PS.el.hqHint.hidden = !(state.mode === 'hq' && state.running);
    };

    PS.applyMirrorClass = function () {
        const state = PS.state;
        PS.el.output.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
    };

    PS.openSheet = function () {
        PS.el.sheet.classList.add('is-open');
        PS.el.sheetBackdrop.classList.add('is-open');
    };
    PS.closeSheet = function () {
        PS.el.sheet.classList.remove('is-open');
        PS.el.sheetBackdrop.classList.remove('is-open');
    };

    PS.sampleKeyFromStage = function (e) {
        const state = PS.state,
            el = PS.el;
        if (state.mode !== 'chroma' || !state.W) return;
        const rect = el.output.getBoundingClientRect();
        let x = ((e.clientX - rect.left) / rect.width) * state.W;
        const y = ((e.clientY - rect.top) / rect.height) * state.H;
        if (el.output.classList.contains('ps-mirror')) x = state.W - x;
        x = Math.max(0, Math.min(state.W - 1, Math.round(x)));
        const yy = Math.max(0, Math.min(state.H - 1, Math.round(y)));
        try {
            PS.workCtx.drawImage(
                PS.currentSourceEl(),
                state.crop.sx,
                state.crop.sy,
                state.crop.sw,
                state.crop.sh,
                0,
                0,
                state.W,
                state.H
            );
            const p = PS.workCtx.getImageData(x, yy, 1, 1).data;
            state.key = { r: p[0], g: p[1], b: p[2] };
            el.keyColor.value = PS.rgbToHex(p[0], p[1], p[2]);
            PS.activate(el.chromaGroup.querySelectorAll('.ps-swatch[data-key]'), null);
            PS.notify(`Đã lấy màu phông rgb(${p[0]}, ${p[1]}, ${p[2]})`, 'info');
        } catch {}
    };
})(typeof window !== 'undefined' ? window : globalThis);
