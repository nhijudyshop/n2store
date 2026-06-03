// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Studio chụp tách nền — Web 2.0
 *
 * Pure client-side: camera (getUserMedia) hoặc ảnh upload → tách nền realtime
 * bằng AI (MediaPipe Selfie Segmentation, on-device) hoặc chroma key (lọc màu
 * phông theo pixel) → ghép nền mới (trong suốt / màu / ảnh) → xuất PNG.
 *
 * Không có backend/DB/SSE: ảnh KHÔNG rời khỏi máy người dùng.
 */
(function (global) {
    'use strict';

    // ---- Tunables -------------------------------------------------------
    const PREVIEW_MAX_W = 960; // cap xử lý realtime để mượt trên mobile
    const MEDIAPIPE_BASE =
        'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

    // ---- State ----------------------------------------------------------
    const state = {
        mode: 'ai', // 'ai' | 'chroma'
        source: 'camera', // 'camera' | 'image'
        bgType: 'transparent', // 'transparent' | 'color' | 'image'
        bgColor: '#ffffff',
        bgImage: null, // HTMLImageElement
        key: { r: 0, g: 177, b: 64 },
        threshold: 0.45,
        smooth: 0.1,
        feather: 2,
        mirror: true,
        facingMode: 'user',
        stream: null,
        running: false,
        busy: false,
        rafId: 0,
        seg: null,
        segReady: false,
        W: 0,
        H: 0,
    };

    const el = {};
    let work; // offscreen canvas for chroma processing
    let workCtx;
    let octx; // output ctx

    // ---- Init -----------------------------------------------------------
    function init() {
        cache();
        if (!el.output) return;
        octx = el.output.getContext('2d', { willReadFrequently: true });
        work = document.createElement('canvas');
        workCtx = work.getContext('2d', { willReadFrequently: true });
        bind();
        initSegmentation();
    }

    function cache() {
        const id = (x) => document.getElementById(x);
        el.stage = id('psStage');
        el.output = id('psOutput');
        el.video = id('psVideo');
        el.stageEmpty = id('psStageEmpty');
        el.stageLoading = id('psStageLoading');
        el.loadingText = id('psLoadingText');
        el.capture = id('psCapture');
        el.startCam = id('psStartCam');
        el.switchCam = id('psSwitchCam');
        el.sourceFile = id('psSourceFile');
        el.sampleHint = id('psSampleHint');
        el.modeNote = id('psModeNote');
        el.chromaCard = id('psChromaCard');
        el.aiCard = id('psAiCard');
        el.keyColor = id('psKeyColor');
        el.threshold = id('psThreshold');
        el.threshVal = id('psThreshVal');
        el.smooth = id('psSmooth');
        el.smoothVal = id('psSmoothVal');
        el.feather = id('psFeather');
        el.featherVal = id('psFeatherVal');
        el.bgColorOpt = id('psBgColorOpt');
        el.bgImageOpt = id('psBgImageOpt');
        el.bgColor = id('psBgColor');
        el.bgFile = id('psBgFile');
        el.bgThumb = id('psBgThumb');
        el.mirror = id('psMirror');
        el.results = id('psResults');
        el.resultsGrid = id('psResultsGrid');
        el.clearResults = id('psClearResults');
    }

    function bind() {
        el.startCam.addEventListener('click', toggleCamera);
        el.switchCam.addEventListener('click', switchCamera);
        el.capture.addEventListener('click', capture);
        el.sourceFile.addEventListener('change', onSourceFile);
        el.bgFile.addEventListener('change', onBgFile);
        el.clearResults.addEventListener('click', clearResults);

        // Mode toggle
        document.querySelectorAll('.ps-seg-btn[data-mode]').forEach((b) => {
            b.addEventListener('click', () => setMode(b.dataset.mode));
        });
        // Background type toggle
        document.querySelectorAll('.ps-bg-btn[data-bg]').forEach((b) => {
            b.addEventListener('click', () => setBgType(b.dataset.bg));
        });
        // Chroma key swatches
        el.chromaCard.querySelectorAll('.ps-swatch[data-key]').forEach((b) => {
            b.addEventListener('click', () => {
                const [r, g, bb] = b.dataset.key.split(',').map(Number);
                state.key = { r, g, b: bb };
                activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), b);
            });
        });
        el.keyColor.addEventListener('input', () => {
            state.key = hexToRgb(el.keyColor.value);
            activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), null);
        });
        // Bg color swatches
        el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]').forEach((b) => {
            b.addEventListener('click', () => {
                state.bgColor = b.dataset.color;
                el.bgColor.value = b.dataset.color;
                activate(el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]'), b);
            });
        });
        el.bgColor.addEventListener('input', () => {
            state.bgColor = el.bgColor.value;
            activate(el.bgColorOpt.querySelectorAll('.ps-swatch[data-color]'), null);
        });
        // Sliders
        el.threshold.addEventListener('input', () => {
            state.threshold = parseFloat(el.threshold.value);
            el.threshVal.textContent = state.threshold.toFixed(2);
        });
        el.smooth.addEventListener('input', () => {
            state.smooth = parseFloat(el.smooth.value);
            el.smoothVal.textContent = state.smooth.toFixed(2);
        });
        el.feather.addEventListener('input', () => {
            state.feather = parseInt(el.feather.value, 10);
            el.featherVal.textContent = state.feather + 'px';
        });
        el.mirror.addEventListener('change', () => {
            state.mirror = el.mirror.checked;
            applyMirrorClass();
        });
        // Click stage to sample key color (chroma mode)
        el.output.addEventListener('click', sampleKeyFromStage);
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
            if (global.lucide) lucide.createIcons();
            return;
        }
        await startCamera();
    }

    async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            notify('Trình duyệt không hỗ trợ camera (cần HTTPS).', 'error');
            return;
        }
        stopStream();
        showLoading('Đang mở camera…');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: state.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });
            state.stream = stream;
            state.source = 'camera';
            el.video.srcObject = stream;
            await el.video.play().catch(() => {});
            await waitForVideo();
            setupSizes(el.video.videoWidth, el.video.videoHeight);
            applyMirrorClass();
            hideLoading();
            el.stageEmpty.hidden = true;
            el.switchCam.disabled = false;
            el.capture.disabled = false;
            el.startCam.innerHTML = '<i data-lucide="video-off"></i> Tắt camera';
            if (global.lucide) lucide.createIcons();
            startLoop();
        } catch (e) {
            hideLoading();
            console.error('[photo-studio] getUserMedia', e);
            notify('Không mở được camera: ' + (e?.message || e), 'error');
        }
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
            setupSizes(img.naturalWidth, img.naturalHeight);
            state.mirror = false;
            el.mirror.checked = false;
            applyMirrorClass();
            el.stageEmpty.hidden = true;
            el.capture.disabled = false;
            el.switchCam.disabled = true;
            el.startCam.innerHTML = '<i data-lucide="video"></i> Bật camera';
            if (global.lucide) lucide.createIcons();
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

    // ---- Sizing ---------------------------------------------------------
    function setupSizes(w, h) {
        if (!w || !h) return;
        const scale = Math.min(1, PREVIEW_MAX_W / w);
        state.W = Math.round(w * scale);
        state.H = Math.round(h * scale);
        el.output.width = state.W;
        el.output.height = state.H;
        work.width = state.W;
        work.height = state.H;
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
                const src = currentSourceEl();
                state.seg
                    .send({ image: src })
                    .catch((e) => console.warn('[photo-studio] seg.send', e))
                    .finally(() => {
                        state.busy = false;
                    });
            }
        } else {
            // chroma (or AI unavailable fallback)
            renderChroma();
        }
        state.rafId = requestAnimationFrame(frame);
    }

    // ---- AI compositing -------------------------------------------------
    function onSegResults(results) {
        const { W, H } = state;
        if (!W || !H) return;
        octx.save();
        octx.clearRect(0, 0, W, H);
        // 1) draw mask (optionally feathered) → alpha channel
        if (state.feather > 0) octx.filter = `blur(${state.feather}px)`;
        octx.drawImage(results.segmentationMask, 0, 0, W, H);
        octx.filter = 'none';
        // 2) keep only subject pixels from the frame
        octx.globalCompositeOperation = 'source-in';
        octx.drawImage(results.image, 0, 0, W, H);
        // 3) put background behind subject
        octx.globalCompositeOperation = 'destination-over';
        drawBackground(octx, W, H);
        octx.restore();
        octx.globalCompositeOperation = 'source-over';
    }

    // ---- Chroma key -----------------------------------------------------
    function renderChroma() {
        const { W, H } = state;
        if (!W || !H) return;
        const src = currentSourceEl();
        if (!src) return;
        try {
            workCtx.clearRect(0, 0, W, H);
            workCtx.drawImage(src, 0, 0, W, H);
        } catch {
            return; // frame not ready
        }
        const frameData = workCtx.getImageData(0, 0, W, H);
        keyOut(frameData, state.key, state.threshold, state.smooth);
        workCtx.putImageData(frameData, 0, 0);

        octx.clearRect(0, 0, W, H);
        drawBackground(octx, W, H);
        octx.drawImage(work, 0, 0, W, H);
    }

    /**
     * Per-pixel chroma key. Sets alpha based on color distance from key.
     * @param {ImageData} img
     * @param {{r:number,g:number,b:number}} key
     * @param {number} threshold 0..1 — màu trong bán kính này bị xóa hẳn
     * @param {number} smooth 0..0.4 — dải chuyển tiếp mềm viền
     */
    function keyOut(img, key, threshold, smooth) {
        const d = img.data;
        // max RGB distance ~441.67 (sqrt(3*255^2)); normalize to 0..1
        const MAXD = 441.6729559;
        const lo = threshold * MAXD;
        const hi = (threshold + smooth) * MAXD;
        const span = Math.max(1, hi - lo);
        for (let i = 0; i < d.length; i += 4) {
            const dr = d[i] - key.r;
            const dg = d[i + 1] - key.g;
            const db = d[i + 2] - key.b;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);
            if (dist <= lo) {
                d[i + 3] = 0;
            } else if (dist < hi) {
                d[i + 3] = Math.round(((dist - lo) / span) * d[i + 3]);
            }
            // else keep original alpha
        }
    }

    // ---- Background draw -------------------------------------------------
    function drawBackground(ctx, W, H) {
        if (state.bgType === 'color') {
            ctx.fillStyle = state.bgColor;
            ctx.fillRect(0, 0, W, H);
        } else if (state.bgType === 'image' && state.bgImage) {
            drawCover(ctx, state.bgImage, W, H);
        }
        // transparent → draw nothing
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

    // ---- Capture --------------------------------------------------------
    function capture() {
        const { W, H } = state;
        if (!W || !H) return;
        // Output canvas already holds composited frame (mirror applied via CSS,
        // so bake mirror into the exported bitmap here).
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const c = out.getContext('2d');
        if (state.mirror) {
            c.translate(W, 0);
            c.scale(-1, 1);
        }
        c.drawImage(el.output, 0, 0);
        out.toBlob((blob) => {
            if (!blob) return;
            addResult(blob, W, H);
        }, 'image/png');
    }

    function addResult(blob, w, h) {
        const url = URL.createObjectURL(blob);
        el.results.hidden = false;
        const stamp = resultStamp();
        const card = document.createElement('div');
        card.className = 'ps-result-card';
        card.innerHTML = `
            <div class="ps-result-thumb" style="background-image:url(${url})"></div>
            <div class="ps-result-actions">
                <a class="ps-btn ps-btn-sm ps-btn-primary" download="tach-nen-${stamp}.png" href="${url}">
                    <i data-lucide="download"></i> Tải
                </a>
                <button class="ps-btn ps-btn-sm ps-btn-ghost ps-result-del">
                    <i data-lucide="x"></i>
                </button>
            </div>`;
        card.querySelector('.ps-result-del').addEventListener('click', () => {
            URL.revokeObjectURL(url);
            card.remove();
            if (!el.resultsGrid.children.length) el.results.hidden = true;
        });
        el.resultsGrid.prepend(card);
        if (global.lucide) lucide.createIcons();
        notify('Đã chụp ảnh.', 'success');
    }

    function resultStamp() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
            d.getMinutes()
        )}${p(d.getSeconds())}`;
    }

    function clearResults() {
        el.resultsGrid.innerHTML = '';
        el.results.hidden = true;
    }

    // ---- UI mode/bg switching ------------------------------------------
    function setMode(mode) {
        state.mode = mode;
        activate(document.querySelectorAll('.ps-seg-btn[data-mode]'), null);
        document.querySelector(`.ps-seg-btn[data-mode="${mode}"]`)?.classList.add('is-active');
        const isChroma = mode === 'chroma';
        el.chromaCard.hidden = !isChroma;
        el.aiCard.hidden = isChroma;
        el.sampleHint.hidden = !isChroma;
        el.output.classList.toggle('ps-pickable', isChroma);
        el.modeNote.textContent = isChroma
            ? 'Chụp trên phông đơn sắc đủ sáng. Bấm vào vùng phông để lấy đúng màu.'
            : 'AI nhận diện chủ thể, không cần phông. Tốt cho người & sản phẩm.';
        if (mode === 'ai' && !state.segReady) {
            notify('Mô hình AI chưa sẵn sàng — kiểm tra mạng rồi thử lại.', 'warning');
        }
    }

    function setBgType(type) {
        state.bgType = type;
        activate(document.querySelectorAll('.ps-bg-btn[data-bg]'), null);
        document.querySelector(`.ps-bg-btn[data-bg="${type}"]`)?.classList.add('is-active');
        el.bgColorOpt.hidden = type !== 'color';
        el.bgImageOpt.hidden = type !== 'image';
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
            workCtx.drawImage(currentSourceEl(), 0, 0, state.W, state.H);
            const p = workCtx.getImageData(x, yy, 1, 1).data;
            state.key = { r: p[0], g: p[1], b: p[2] };
            el.keyColor.value = rgbToHex(p[0], p[1], p[2]);
            activate(el.chromaCard.querySelectorAll('.ps-swatch[data-key]'), null);
            notify(`Đã lấy màu phông rgb(${p[0]}, ${p[1]}, ${p[2]})`, 'info');
        } catch {
            /* ignore */
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

    function showLoading(text) {
        el.loadingText.textContent = text || 'Đang xử lý…';
        el.stageLoading.hidden = false;
    }
    function hideLoading() {
        el.stageLoading.hidden = true;
    }

    function notify(msg, type) {
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type || 'info');
        } else {
            console.log('[photo-studio]', type || 'info', msg);
        }
    }

    global.PhotoStudio = { init };
})(typeof window !== 'undefined' ? window : globalThis);
