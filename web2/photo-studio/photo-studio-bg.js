// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — tích hợp engine tách nền + AI lib (lazy load CDN).
 *
 *  - MediaPipe Tasks Vision / Selfie Segmentation (AI nhanh realtime).
 *  - Cloud cutout (withoutbg qua proxy) + @imgly on-device (AI nét).
 *  - UpscalerJS/ESRGAN ×2 (fallback Lanczos).
 *  - SlimSAM (Xenova/transformers) cho "chọn đúng món".
 * Gắn vào `window.PS`; dùng `PS.maskC/maskRaw/segInput/octx` + `PS.state`.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- MediaPipe segmentation -----------------------------------------
    PS.initSegmentation = async function () {
        const state = PS.state;
        // Ưu tiên Tasks Vision ImageSegmenter (GPU delegate, nhanh). Lỗi → legacy.
        try {
            const mod = await import(/* @vite-ignore */ `${PS.TASKS_VISION}/vision_bundle.mjs`);
            const vision = await mod.FilesetResolver.forVisionTasks(`${PS.TASKS_VISION}/wasm`);
            state._segmenter = await mod.ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: PS.SELFIE_MODEL,
                    delegate: PS.isIOS() ? 'CPU' : 'GPU',
                },
                runningMode: 'VIDEO',
                outputConfidenceMasks: true,
                outputCategoryMask: false,
            });
            state._aiEngine = 'tasks';
            state.segReady = true;
        } catch (e) {
            console.warn('[photo-studio] tasks-vision init failed → legacy', e?.message || e);
            PS.initLegacySeg();
        }
    };

    PS.initLegacySeg = function () {
        const state = PS.state;
        if (!global.SelfieSegmentation) return;
        try {
            const seg = new global.SelfieSegmentation({
                locateFile: (f) => `${PS.MEDIAPIPE_BASE}/${f}`,
            });
            seg.setOptions({ modelSelection: 1, selfieMode: false });
            seg.onResults(PS.onSegResults);
            state.seg = seg;
            state._aiEngine = 'legacy';
            state.segReady = true;
        } catch (e) {
            console.error('[photo-studio] legacy seg init', e);
        }
    };

    /** Khung downscale (≤256px) gửi segmenter → nhanh + mask nhỏ (loop rẻ). */
    PS.segInputFrame = function () {
        const state = PS.state;
        const src = PS.currentSourceEl();
        if (!src || !state.srcNatW) return null;
        const scale = Math.min(1, PS.SEG_INPUT_W / state.srcNatW);
        const w = Math.max(1, Math.round(state.srcNatW * scale));
        const h = Math.max(1, Math.round(state.srcNatH * scale));
        PS.sizeCanvas(PS.segInput, w, h);
        try {
            PS.segInputCtx.drawImage(src, 0, 0, w, h);
        } catch {
            return null;
        }
        return PS.segInput;
    };

    /** Tasks Vision callback: confidence mask (0..1) → alpha → maskC + composite. */
    PS._tasksBusy = false;
    PS.onTasksResult = function (result) {
        // In-flight gate: nếu delegate (GPU/CPU) lỡ gọi callback chồng nhau, bỏ qua
        // kết quả đến giữa chừng để tránh ghi đè maskC/maskRaw đang xử lý dở.
        if (PS._tasksBusy) {
            if (result && result.confidenceMasks && result.confidenceMasks[0]?.close) {
                result.confidenceMasks[0].close();
            }
            return;
        }
        PS._tasksBusy = true;
        try {
            const state = PS.state;
            if (!state.modelLoaded) {
                state.modelLoaded = true;
                PS.hideLoading();
            }
            const m = result.confidenceMasks && result.confidenceMasks[0];
            if (!m) return;
            const mw = m.width,
                mh = m.height;
            const f = m.getAsFloat32Array();
            PS.sizeCanvas(PS.maskRaw, mw, mh);
            const id = PS.maskRawCtx.createImageData(mw, mh);
            const px = id.data;
            for (let i = 0; i < f.length; i++) px[i * 4 + 3] = (f[i] * 255) | 0;
            PS.maskRawCtx.putImageData(id, 0, 0);
            if (m.close) m.close();
            PS.populateMaskC(PS.maskRaw, mw, mh);
            PS.composeAI(
                PS.octx,
                state.W,
                state.H,
                PS.currentSourceEl(),
                PS.maskC,
                state.crop,
                true
            );
            PS.tickFps();
        } finally {
            PS._tasksBusy = false;
        }
    };

    /** Vẽ mask (đã crop) vào maskC ở preview res, có feather. Dùng chung 2 engine. */
    PS.populateMaskC = function (srcMask, mw, mh) {
        const state = PS.state;
        const { W, H } = state;
        if (!W || !H || !state.srcNatW) return;
        PS.sizeCanvas(PS.maskC, W, H);
        PS.maskCtx.clearRect(0, 0, W, H);
        if (state.feather > 0) PS.maskCtx.filter = `blur(${state.feather}px)`;
        const rx = mw / state.srcNatW,
            ry = mh / state.srcNatH,
            c = state.crop;
        PS.maskCtx.drawImage(srcMask, c.sx * rx, c.sy * ry, c.sw * rx, c.sh * ry, 0, 0, W, H);
        PS.maskCtx.filter = 'none';
    };

    PS.onSegResults = function (results) {
        const state = PS.state;
        if (!state.modelLoaded) {
            state.modelLoaded = true;
            PS.hideLoading();
        }
        if (!state.W || !state.H) return;
        // legacy mask ở native res → rx=1
        PS.populateMaskC(results.segmentationMask, state.srcNatW, state.srcNatH);
        PS.composeAI(PS.octx, state.W, state.H, results.image, PS.maskC, state.crop, true);
        PS.tickFps();
    };

    PS.composeAI = function (ctx, W, H, frameEl, maskCanvas, crop, withBg) {
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(maskCanvas, 0, 0, W, H);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(frameEl, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        if (withBg) {
            ctx.globalCompositeOperation = 'destination-over';
            PS.drawBg(ctx, W, H, frameEl, crop);
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    };

    // ---- Cloud / local cutout (@imgly) ----------------------------------
    PS.loadImgly = async function () {
        if (PS.imglyMod) return PS.imglyMod;
        PS.imglyMod = await import(/* @vite-ignore */ PS.IMGLY_URL);
        return PS.imglyMod;
    };
    PS.localCutout = async function (canvas) {
        const blob = await PS.canvasToBlob(canvas, 'image/png');
        const mod = await PS.loadImgly();
        // isnet_quint8: model nén nhỏ/nhanh nhất (tải nhẹ + xử lý nhanh ~2-3×),
        // viền giảm chất lượng nhẹ — đổi lấy tốc độ trên điện thoại.
        return PS.blobToImage(await mod.removeBackground(blob, { model: 'isnet_quint8' }));
    };
    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho /api/web2/cutout/* (soft-gate → WEB2_AUTH_ENFORCE=1)
    PS.authHeaders = function (extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    };
    PS.cloudCutout = async function (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        // withoutbg: free 50/tháng, full HD, KHÔNG watermark. Hết quota → fallback @imgly.
        const res = await fetch(`${PS.CUTOUT_API}/withoutbg`, {
            method: 'POST',
            headers: PS.authHeaders({ 'Content-Type': 'application/json' }), // ENFORCE-PREP (2026-06-12)
            body: JSON.stringify({ image: dataUrl }),
        });
        let j;
        try {
            j = await res.json();
        } catch {
            throw new Error('Server lỗi (' + res.status + ')');
        }
        if (!res.ok || !j.success) throw new Error(j?.error || 'Cloud lỗi (' + res.status + ')');
        return PS.loadImageSrc(j.image);
    };

    // ---- AI upscale ×2 (UpscalerJS / ESRGAN, fallback Lanczos) -----------
    PS._upscaler = null;
    PS.UPSCALE_MAX_IN = 1400; // chặn OOM mobile: chỉ chạy AI khi cạnh dài ≤ giá trị này
    // UMD build: tf + upscaler + model (weights nhúng sẵn → không fetch thêm, chạy offline)
    PS.UP_TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
    PS.UP_LIB = 'https://cdn.jsdelivr.net/npm/upscaler@1.0.0/dist/browser/umd/upscaler.min.js';
    PS.UP_MODEL =
        'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@1.0.0/dist/umd/models/esrgan-slim/src/x2/index.min.js';
    PS.loadScript = function (src) {
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src;
            s.crossOrigin = 'anonymous';
            s.onload = res;
            s.onerror = () => rej(new Error('load ' + src));
            document.head.appendChild(s);
        });
    };
    PS.getUpscaler = async function () {
        if (PS._upscaler !== null) return PS._upscaler;
        try {
            await PS.loadScript(PS.UP_TF);
            await PS.loadScript(PS.UP_LIB);
            await PS.loadScript(PS.UP_MODEL);
            const Upscaler = window.Upscaler?.default || window.Upscaler;
            const model = window.ESRGANSlim2x?.default || window.ESRGANSlim2x;
            if (!Upscaler || !model) throw new Error('UMD global thiếu');
            PS._upscaler = new Upscaler({ model });
        } catch (e) {
            console.warn('[photo-studio] UpscalerJS load fail → Lanczos', e?.message);
            PS._upscaler = false; // đánh dấu không khả dụng → dùng fallback
        }
        return PS._upscaler;
    };

    /** Trả về canvas đã phóng to (AI nếu được, không thì Lanczos x2). */
    PS.upscaleCanvas = async function (src) {
        const long = Math.max(src.width, src.height);
        if (long <= PS.UPSCALE_MAX_IN) {
            const up = await PS.getUpscaler();
            if (up) {
                try {
                    const dataUrl = await up.upscale(src, {
                        output: 'base64',
                        patchSize: 64,
                        padding: 2,
                    });
                    const img = await new Promise((res, rej) => {
                        const i = new Image();
                        i.onload = () => res(i);
                        i.onerror = rej;
                        i.src = dataUrl;
                    });
                    const cv = document.createElement('canvas');
                    cv.width = img.naturalWidth;
                    cv.height = img.naturalHeight;
                    cv.getContext('2d').drawImage(img, 0, 0);
                    window.__psUpscaleAI = true;
                    return cv;
                } catch (e) {
                    console.warn('[photo-studio] AI upscale fail → Lanczos', e?.message);
                }
            }
        }
        return PS.lanczos2x(src);
    };

    // Chặn OOM: không cấp phát canvas dài cạnh vượt ngưỡng an toàn (mobile dễ crash).
    PS.UPSCALE_MAX_OUT = 4096;

    /** Phóng to ×2 chất lượng cao bằng resample 2 bước (fallback khi không có AI). */
    PS.lanczos2x = function (src) {
        // Guard OOM: nếu ×2 vượt cạnh dài an toàn → trả nguyên bản (không phóng to),
        // tránh allocate canvas khổng lồ gây crash trên điện thoại.
        if (Math.max(src.width, src.height) * 2 > PS.UPSCALE_MAX_OUT) {
            return src;
        }
        const w = src.width * 2,
            h = src.height * 2;
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const c = cv.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(src, 0, 0, w, h);
        return cv;
    };

    // ---- Chọn đúng món (MobileSAM / SlimSAM trong trình duyệt) ----------
    PS._sam = null;
    PS._samBusy = false;
    PS._samPending = false;
    PS.samPoints = [];
    PS.SAM_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';
    PS.SAM_MODEL = 'Xenova/slimsam-77-uniform';

    PS.getSam = async function () {
        if (PS._sam) return PS._sam;
        const t = await import(/* @vite-ignore */ PS.SAM_URL);
        // Probe adapter thật (navigator.gpu có thể tồn tại nhưng không lấy được adapter).
        let hasGPU = false;
        try {
            hasGPU = !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
        } catch {
            hasGPU = false;
        }
        // Thử cấu hình nhẹ→an toàn; fallback dần xuống WASM q8 (chạy mọi nơi).
        const attempts = [];
        if (hasGPU) attempts.push({ device: 'webgpu', dtype: 'fp32' });
        attempts.push({ device: 'wasm', dtype: 'q8' });
        let model = null,
            lastErr;
        for (const cfg of attempts) {
            try {
                model = await t.SamModel.from_pretrained(PS.SAM_MODEL, cfg);
                break;
            } catch (e) {
                lastErr = e;
                console.warn('[photo-studio] SAM cfg fail', cfg, e?.message);
            }
        }
        if (!model) throw lastErr || new Error('Không khởi tạo được SAM');
        const processor = await t.AutoProcessor.from_pretrained(PS.SAM_MODEL);
        PS._sam = { t, model, processor };
        return PS._sam;
    };

    /** Encode khung gốc 1 lần (vision encoder) → cache cho mọi cú chạm. */
    PS.samEmbed = async function () {
        const state = PS.state;
        const { t, model, processor } = await PS.getSam();
        if (state._samFrame === state._capFrame && state._samEmb) return;
        const image = t.RawImage.fromCanvas(state._capFrame);
        const inputs = await processor(image);
        state._samEmb = await model.get_image_embeddings(inputs);
        state._samImage = image;
        state._samInputs = inputs;
        state._samFrame = state._capFrame;
    };

    PS.runSamDecode = async function () {
        const state = PS.state;
        if (PS._samBusy) {
            PS._samPending = true;
            return;
        }
        PS._samBusy = true;
        PS._samPending = false;
        PS.el.pickHint.textContent = 'Đang nhận diện…';
        try {
            const { model, processor } = await PS.getSam();
            const pts = PS.samPoints.map((p) => [p.x, p.y]);
            const labels = PS.samPoints.map((p) => p.label);
            const proc = await processor(state._samImage, {
                input_points: [pts],
                input_labels: [labels],
            });
            const out = await model({
                ...state._samEmb,
                input_points: proc.input_points,
                input_labels: proc.input_labels,
            });
            const masks = await processor.post_process_masks(
                out.pred_masks,
                state._samInputs.original_sizes,
                state._samInputs.reshaped_input_sizes
            );
            state._samAlpha = PS.maskToAlpha(masks[0], out.iou_scores, state._capW, state._capH);
            let onPx = 0;
            for (let i = 0; i < state._samAlpha.length; i++) if (state._samAlpha[i]) onPx++;
            global.__psSam = {
                pts: PS.samPoints.length,
                onPx,
                total: state._capW * state._capH,
            };
            PS.renderPick();
        } catch (e) {
            console.error('[photo-studio] SAM decode', e);
            PS.notify('Nhận diện lỗi: ' + (e?.message || e), 'error');
        } finally {
            PS._samBusy = false;
            PS.el.pickHint.textContent = PS.samPoints.length
                ? 'Chạm thêm để chỉnh · Dùng / ✂ tách riêng'
                : 'Chạm vào món muốn giữ';
            if (PS._samPending) PS.runSamDecode();
        }
    };

    /** Tensor mask (3 đề xuất) → Uint8 alpha WxH; chọn mask iou cao nhất. */
    PS.maskToAlpha = function (maskTensor, iouScores, W, H) {
        const dims = maskTensor.dims;
        const mh = dims.at(-2),
            mw = dims.at(-1);
        const num = dims.length >= 3 ? dims.at(-3) : 1;
        const scores = iouScores.data;
        let best = 0;
        for (let i = 1; i < num && i < scores.length; i++) if (scores[i] > scores[best]) best = i;
        const plane = maskTensor.data;
        const off = best * mh * mw;
        const alpha = new Uint8Array(W * H);
        if (mw === W && mh === H) {
            for (let i = 0; i < W * H; i++) alpha[i] = Number(plane[off + i]) > 0 ? 255 : 0;
        } else {
            for (let y = 0; y < H; y++)
                for (let x = 0; x < W; x++) {
                    const sx = Math.floor((x * mw) / W),
                        sy = Math.floor((y * mh) / H);
                    alpha[y * W + x] = Number(plane[off + sy * mw + sx]) > 0 ? 255 : 0;
                }
        }
        return alpha;
    };

    /** Áp mask SAM thành cutout mới (frame ∩ mask, có feather). */
    PS.applyPickMask = function () {
        const state = PS.state;
        if (!state._samAlpha) return false;
        const W = state._capW,
            H = state._capH;
        const m = document.createElement('canvas');
        m.width = W;
        m.height = H;
        const mc = m.getContext('2d');
        const id = mc.createImageData(W, H);
        const a = state._samAlpha;
        for (let i = 0; i < W * H; i++) {
            id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255;
            id.data[i * 4 + 3] = a[i];
        }
        mc.putImageData(id, 0, 0);
        const cut = document.createElement('canvas');
        cut.width = W;
        cut.height = H;
        const cc = cut.getContext('2d');
        if (state.feather > 0) cc.filter = `blur(${state.feather}px)`;
        cc.drawImage(m, 0, 0);
        cc.filter = 'none';
        cc.globalCompositeOperation = 'source-in';
        cc.drawImage(state._capFrame, 0, 0);
        state._cutout = cut;
        state._sil = PS.buildSilhouette(cut, W, H);
        return true;
    };
})(typeof window !== 'undefined' ? window : globalThis);
