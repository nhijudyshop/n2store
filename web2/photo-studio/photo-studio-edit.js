// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Photo Studio — chụp → cutout → màn Xem (review): ghép nền/bóng/đẹp/logo,
 * di chuyển/phóng to, brush sửa viền, chọn-đúng-món (SAM), lưu ảnh, xử lý hàng loạt.
 *
 * Đây là tầng chỉnh sửa: phối hợp engine (photo-studio-bg.js) + tiện ích canvas
 * lên `PS.state._cutout/_capFrame`. Gắn vào `window.PS`.
 */
(function (global) {
    'use strict';

    const PS = (global.PS = global.PS || {});

    // ---- Capture → cutout → review -------------------------------------
    PS.capture = async function () {
        const state = PS.state,
            el = PS.el;
        if (state._capBusy || !state.srcNatW) return;
        state._capBusy = true;
        el.capture.disabled = true;
        try {
            const crop = PS.cropRect(state.srcNatW, state.srcNatH);
            const { W, H } = PS.captureSize(crop);
            const frameCv = document.createElement('canvas');
            frameCv.width = W;
            frameCv.height = H;
            frameCv
                .getContext('2d')
                .drawImage(PS.currentSourceEl(), crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
            const cutout = await PS.makeCutout(frameCv, W, H);
            state._cutout = cutout;
            state._sil = PS.buildSilhouette(cutout, W, H); // bóng đổ
            state._capFrame = frameCv;
            state._capW = W;
            state._capH = H;
            state.tx = 0;
            state.ty = 0;
            state.scale = 1; // reset transform mỗi lần chụp
            PS.setBrushMode(false);
            if (state.pickMode) PS.setPickUI(false);
            PS.samPoints = [];
            state._samAlpha = null;
            PS.sizeCanvas(el.reviewCanvas, W, H);
            PS.renderReview();
            PS.showReview();
        } catch (e) {
            console.error('[photo-studio] capture', e);
            PS.notify('Tách nền thất bại: ' + (e?.message || e), 'error');
        } finally {
            state._capBusy = false;
            el.capture.disabled = false;
            PS.hideLoading();
        }
    };

    /**
     * AUDIT 2026-06-20 #32: segment TƯƠI đúng frame vừa chụp (frameCv) thay vì dùng
     * PS.maskC của loop (lệch ≥1 frame khi chủ thể chuyển động → cutout lệch viền).
     * Chỉ engine 'tasks' (segmentForVideo đồng bộ). Lỗi/engine khác → trả null để
     * makeCutout fallback PS.maskC (KHÔNG regression). Timestamp dùng chung chuỗi
     * tăng dần với loop (state._tasksLastMs) để không phá monotonic của segmenter.
     */
    PS.freshAiMask = function (frameCv, W, H) {
        const state = PS.state;
        if (state._aiEngine !== 'tasks' || !state._segmenter) return null;
        try {
            const scale = Math.min(1, PS.SEG_INPUT_W / W);
            const sw = Math.max(1, Math.round(W * scale));
            const sh = Math.max(1, Math.round(H * scale));
            const seg = document.createElement('canvas');
            seg.width = sw;
            seg.height = sh;
            seg.getContext('2d').drawImage(frameCv, 0, 0, sw, sh);
            const ts = Math.max(performance.now(), (state._tasksLastMs || 0) + 1);
            state._tasksLastMs = ts;
            let maskCv = null;
            state._segmenter.segmentForVideo(seg, ts, (result) => {
                const m = result.confidenceMasks && result.confidenceMasks[0];
                if (!m) return;
                const mw = m.width,
                    mh = m.height;
                const f = m.getAsFloat32Array();
                const raw = document.createElement('canvas');
                raw.width = mw;
                raw.height = mh;
                const rctx = raw.getContext('2d');
                const id = rctx.createImageData(mw, mh);
                for (let i = 0; i < f.length; i++) id.data[i * 4 + 3] = (f[i] * 255) | 0;
                rctx.putImageData(id, 0, 0);
                if (m.close) m.close();
                const out = document.createElement('canvas');
                out.width = W;
                out.height = H;
                const octx = out.getContext('2d');
                if (state.feather > 0) octx.filter = `blur(${state.feather}px)`;
                octx.drawImage(raw, 0, 0, W, H);
                octx.filter = 'none';
                maskCv = out;
            });
            return maskCv;
        } catch (e) {
            console.warn('[photo-studio] freshAiMask fail → maskC:', e?.message);
            return null;
        }
    };

    /** Tạo cutout (chủ thể nền trong suốt) theo mode hiện tại. Trả canvas WxH. */
    PS.makeCutout = async function (frameCv, W, H) {
        const state = PS.state;
        if (state.mode === 'chroma') {
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const c = cv.getContext('2d', { willReadFrequently: true });
            c.drawImage(frameCv, 0, 0);
            const d = c.getImageData(0, 0, W, H);
            PS.keyOut(d, state.key, state.threshold, state.smooth, state.spill);
            c.putImageData(d, 0, 0);
            return cv;
        }
        if (state.mode === 'ai') {
            if (!state.modelLoaded) throw new Error('AI nhanh chưa sẵn sàng, đợi chút');
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const c = cv.getContext('2d');
            const fresh = PS.freshAiMask(frameCv, W, H); // mask tươi đúng frame vừa chụp
            c.drawImage(fresh || PS.maskC, 0, 0, W, H); // fallback maskC nếu fresh null
            c.globalCompositeOperation = 'source-in';
            c.drawImage(frameCv, 0, 0);
            return cv;
        }
        // hq: cloud (auto) → fallback local; hoặc local
        const cloud = state.hqEngine === 'auto';
        if (cloud) {
            PS.showLoading('Đang tách nền chất lượng cao…');
            try {
                return await PS.imgToCanvas(await PS.cloudCutout(frameCv), W, H);
            } catch (e) {
                console.warn('[photo-studio] cloud fail → local', e?.message);
                PS.notify('Mất kết nối cloud — dùng tách nền trên máy.', 'warning');
            }
        }
        PS.showLoading(
            PS.imglyMod ? 'Đang tách nền…' : 'Đang tải mô hình AI (lần đầu ~vài chục MB)…'
        );
        return PS.imgToCanvas(await PS.localCutout(frameCv), W, H);
    };

    // ---- Review render --------------------------------------------------
    PS.renderReview = function () {
        const state = PS.state,
            el = PS.el,
            rctx = PS.rctx;
        const W = state._capW,
            H = state._capH;
        if (!W || !state._cutout) return;
        rctx.clearRect(0, 0, W, H);
        const transparent = state.bgType === 'transparent';
        PS.drawBg(rctx, W, H, state._capFrame, { sx: 0, sy: 0, sw: W, sh: H }); // nền cố định
        // nhóm chủ thể (bóng + cutout) — áp transform di chuyển/phóng to
        rctx.save();
        rctx.translate(W / 2 + state.tx, H / 2 + state.ty);
        rctx.scale(state.scale, state.scale);
        rctx.translate(-W / 2, -H / 2);
        if (state.shadow && !transparent) PS.drawShadow(rctx, W, H);
        if (state.enhance) rctx.filter = 'brightness(1.06) contrast(1.08) saturate(1.14)';
        rctx.drawImage(state._cutout, 0, 0);
        rctx.filter = 'none';
        rctx.restore();
        // logo/watermark cố định
        if (state.logoOn && state.logoImg) PS.drawLogo(rctx, W, H);
        el.reviewCanvas.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
        el.reviewStage.classList.toggle('ps-checker', transparent);
        el.reviewMeta.textContent = state.exportPx
            ? `${W}×${H} → ${state.exportPx}px`
            : `${W}×${H}`;
    };

    // ---- Cử chỉ di chuyển / phóng to chủ thể trên màn Xem --------------
    PS.bindReviewGestures = function () {
        const state = PS.state,
            el = PS.el;
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
                    PS.renderReview();
                });
        };
        let painting = false;
        stage.addEventListener('pointerdown', (e) => {
            if (el.review.hidden) return;
            if (e.target.closest('button, input, .ps-brush-bar, .ps-pick-bar')) return; // không cướp click nút
            if (state.pickMode) {
                PS.addPickPoint(e);
                return;
            }
            if (state.brushMode) {
                try {
                    stage.setPointerCapture(e.pointerId);
                } catch {}
                painting = true;
                PS.paintBrush(e);
                PS.moveCursor(e);
                return;
            }
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
            if (state.brushMode) {
                PS.moveCursor(e);
                if (painting) PS.paintBrush(e);
                return;
            }
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
                if (lastDist > 0) state.scale = PS.clamp(state.scale * (dist / lastDist), 0.3, 5);
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
            if (state.brushMode && painting) {
                painting = false;
                PS.finishBrush();
                return;
            }
            pointers.delete(e.pointerId);
            if (pointers.size < 2) lastDist = 0;
        };
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);
    };

    // ---- Brush sửa viền ------------------------------------------------
    /** Sơn cọ lên cutout: xóa (destination-out) hoặc khôi phục (từ _capFrame). */
    PS.paintBrush = function (e) {
        const state = PS.state,
            el = PS.el;
        const r = el.reviewCanvas.getBoundingClientRect();
        if (!r.width || !state._cutout) return;
        const W = state._capW,
            H = state._capH;
        const sx = W / r.width; // px màn hình → px canvas
        const cx = (e.clientX - r.left) * sx;
        const cy = (e.clientY - r.top) * (H / r.height);
        // đảo transform chủ thể (di chuyển/phóng) → toạ độ trong cutout
        const lx = (cx - W / 2 - state.tx) / state.scale + W / 2;
        const ly = (cy - H / 2 - state.ty) / state.scale + H / 2;
        const rad = (state.brushSize * sx) / state.scale;
        const c = state._cutout.getContext('2d');
        c.save();
        if (state.brushTool === 'erase') {
            c.globalCompositeOperation = 'destination-out';
            c.beginPath();
            c.arc(lx, ly, rad, 0, 7);
            c.fill();
        } else {
            c.beginPath();
            c.arc(lx, ly, rad, 0, 7);
            c.clip();
            c.globalCompositeOperation = 'source-over';
            c.drawImage(state._capFrame, 0, 0);
        }
        c.restore();
        PS.renderReview();
    };
    PS.finishBrush = function () {
        const state = PS.state;
        state._sil = PS.buildSilhouette(state._cutout, state._capW, state._capH); // cập nhật bóng
        PS.renderReview();
    };
    PS.moveCursor = function (e) {
        const el = PS.el;
        const r = el.reviewStage.getBoundingClientRect();
        const d = PS.state.brushSize * 2;
        el.brushCursor.style.width = d + 'px';
        el.brushCursor.style.height = d + 'px';
        el.brushCursor.style.left = e.clientX - r.left + 'px';
        el.brushCursor.style.top = e.clientY - r.top + 'px';
    };
    PS.setBrushMode = function (on) {
        const state = PS.state,
            el = PS.el;
        state.brushMode = on;
        el.brushBar.hidden = !on;
        el.brushCursor.hidden = !on;
        el.brushToggle.style.display = on ? 'none' : '';
        el.pickToggle.style.display = on ? 'none' : '';
        el.compare.style.display = on ? 'none' : '';
        el.resetTransform.style.display = on ? 'none' : '';
        el.moveHint.style.display = on ? 'none' : '';
        el.reviewStage.classList.toggle('ps-brushing', on);
    };

    // ---- Chọn đúng món: UI + tương tác (engine SAM ở photo-studio-bg.js) ----
    PS.setPickUI = function (on) {
        const state = PS.state,
            el = PS.el;
        state.pickMode = on;
        el.pickBar.hidden = !on;
        el.pickHint.hidden = !on;
        el.pickToggle.style.display = on ? 'none' : '';
        el.brushToggle.style.display = on ? 'none' : '';
        el.compare.style.display = on ? 'none' : '';
        el.resetTransform.style.display = on ? 'none' : '';
        el.moveHint.style.display = on ? 'none' : '';
        el.reviewStage.classList.toggle('ps-picking', on);
        if (on) {
            state.pickTool = 'add';
            PS.activate(
                el.pickBar.querySelectorAll('.ps-pick-tool'),
                el.pickBar.querySelector('[data-ptool="add"]')
            );
            el.pickHint.textContent = 'Chạm vào món muốn giữ';
        }
    };

    PS.enterPickMode = async function () {
        const state = PS.state,
            el = PS.el;
        if (!state._capFrame) return;
        PS.setPickUI(true);
        PS.samPoints = [];
        state._samAlpha = null;
        PS.renderPick();
        try {
            el.pickHint.textContent = 'Đang tải AI chọn vật (lần đầu ~15MB)…';
            await PS.samEmbed();
            el.pickHint.textContent = 'Chạm vào món muốn giữ';
        } catch (e) {
            console.error('[photo-studio] SAM load', e);
            PS.notify('Không tải được AI chọn vật: ' + (e?.message || e), 'error');
            PS.exitPickMode(false);
        }
    };

    PS.exitPickMode = function (apply) {
        const state = PS.state;
        if (apply && PS.applyPickMask()) PS.notify('Đã cập nhật chủ thể.', 'success');
        PS.setPickUI(false);
        PS.samPoints = [];
        state._samAlpha = null;
        PS.renderReview();
    };

    /** Toạ độ chạm (màn hình) → pixel trong khung gốc (đảo mirror nếu selfie). */
    PS.pickPointFromEvent = function (e) {
        const state = PS.state,
            el = PS.el;
        const r = el.reviewCanvas.getBoundingClientRect();
        if (!r.width) return null;
        let x = (e.clientX - r.left) * (state._capW / r.width);
        let y = (e.clientY - r.top) * (state._capH / r.height);
        if (state.mirror && state.source === 'camera') x = state._capW - x;
        return {
            x: PS.clamp(Math.round(x), 0, state._capW - 1),
            y: PS.clamp(Math.round(y), 0, state._capH - 1),
        };
    };

    PS.addPickPoint = function (e) {
        const state = PS.state;
        if (!state._samEmb) {
            PS.notify('Đang tải AI, đợi chút…', 'warning');
            return;
        }
        const p = PS.pickPointFromEvent(e);
        if (!p) return;
        PS.samPoints.push({ x: p.x, y: p.y, label: state.pickTool === 'add' ? 1 : 0 });
        PS.runSamDecode();
    };

    PS.undoPickPoint = function () {
        const state = PS.state;
        PS.samPoints.pop();
        if (PS.samPoints.length) PS.runSamDecode();
        else {
            state._samAlpha = null;
            PS.renderPick();
        }
    };

    /** Vẽ khung gốc + tô vùng mask + chấm điểm (preview khi đang chọn). */
    PS.renderPick = function () {
        const state = PS.state,
            el = PS.el,
            rctx = PS.rctx;
        const W = state._capW,
            H = state._capH;
        if (!W) return;
        rctx.clearRect(0, 0, W, H);
        rctx.drawImage(state._capFrame, 0, 0);
        if (state._samAlpha) {
            const t = document.createElement('canvas');
            t.width = W;
            t.height = H;
            const id = t.getContext('2d').createImageData(W, H);
            const a = state._samAlpha;
            for (let i = 0; i < W * H; i++)
                if (a[i]) {
                    id.data[i * 4] = 0;
                    id.data[i * 4 + 1] = 180;
                    id.data[i * 4 + 2] = 255;
                    id.data[i * 4 + 3] = 110;
                }
            t.getContext('2d').putImageData(id, 0, 0);
            rctx.drawImage(t, 0, 0);
        }
        const rad = Math.max(6, W * 0.012);
        for (const p of PS.samPoints) {
            rctx.beginPath();
            rctx.arc(p.x, p.y, rad, 0, 7);
            rctx.fillStyle = p.label ? '#22c55e' : '#ef4444';
            rctx.fill();
            rctx.lineWidth = Math.max(2, W * 0.004);
            rctx.strokeStyle = '#fff';
            rctx.stroke();
        }
        el.reviewCanvas.classList.toggle('ps-mirror', state.mirror && state.source === 'camera');
    };

    /** Tách món vừa chọn (SAM) thành 1 ảnh PNG nền trong suốt, cắt sát viền + lưu. */
    PS.extractPickedObject = async function () {
        const state = PS.state,
            el = PS.el;
        if (!state._samAlpha) {
            PS.notify('Chạm chọn món trước đã.', 'warning');
            return;
        }
        const W = state._capW,
            H = state._capH,
            a = state._samAlpha;
        // bounding box vùng chọn
        let minX = W,
            minY = H,
            maxX = -1,
            maxY = -1;
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++)
                if (a[y * W + x]) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
        if (maxX < 0) {
            PS.notify('Vùng chọn trống.', 'warning');
            return;
        }
        const pad = Math.round(Math.max(W, H) * 0.02);
        minX = PS.clamp(minX - pad, 0, W - 1);
        minY = PS.clamp(minY - pad, 0, H - 1);
        maxX = PS.clamp(maxX + pad, 0, W - 1);
        maxY = PS.clamp(maxY + pad, 0, H - 1);
        const ow = maxX - minX + 1,
            oh = maxY - minY + 1;
        // cutout full-res = frame ∩ mask (feather)
        const m = document.createElement('canvas');
        m.width = W;
        m.height = H;
        const mc = m.getContext('2d');
        const id = mc.createImageData(W, H);
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
        // crop sát viền
        let out = document.createElement('canvas');
        out.width = ow;
        out.height = oh;
        out.getContext('2d').drawImage(cut, minX, minY, ow, oh, 0, 0, ow, oh);
        // lật gương cho khớp ảnh selfie đang xem
        if (state.mirror && state.source === 'camera') {
            const f = document.createElement('canvas');
            f.width = ow;
            f.height = oh;
            const fc = f.getContext('2d');
            fc.translate(ow, 0);
            fc.scale(-1, 1);
            fc.drawImage(out, 0, 0);
            out = f;
        }
        if (state.upscale) {
            el.pickHint.textContent = 'Đang làm nét…';
            try {
                out = await PS.upscaleCanvas(out);
            } catch (e) {
                console.warn('[photo-studio] extract upscale', e?.message);
            }
        }
        try {
            const blob = await PS.canvasToBlob(out, 'image/png');
            if (blob) {
                await PS.saveBlob(blob, `mon-${PS.stamp()}.png`);
                PS.notify('Đã tách món ra ảnh PNG trong suốt.', 'success');
            }
        } catch (e) {
            PS.notify('Lưu ảnh lỗi: ' + (e?.message || e), 'error');
        }
        el.pickHint.textContent = PS.samPoints.length
            ? 'Chạm thêm để chỉnh · Dùng / ✂ tách riêng'
            : 'Chạm vào món muốn giữ';
    };

    // ---- Chuyển màn / lưu ----------------------------------------------
    PS.showReview = function () {
        PS.el.camera.hidden = true;
        PS.el.review.hidden = false;
    };
    PS.backToCamera = function () {
        const state = PS.state,
            el = PS.el;
        PS.setBrushMode(false);
        if (state.pickMode) PS.setPickUI(false);
        el.review.hidden = true;
        el.camera.hidden = false;
    };

    PS.saveReview = async function () {
        const state = PS.state,
            el = PS.el;
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
        let finalCv = out;
        if (state.upscale) {
            PS.showLoading('Đang làm nét (AI ×2)…');
            try {
                finalCv = await PS.upscaleCanvas(out);
            } catch (e) {
                console.warn('[photo-studio] upscale', e?.message);
            }
            PS.hideLoading();
        }
        const blob = await PS.canvasToBlob(
            finalCv,
            mime,
            fmt === 'png' ? undefined : state.quality
        );
        if (blob) PS.saveBlob(blob, `tach-nen-${PS.stamp()}.${fmt}`);
    };

    // Đăng lên FB: chuyển ảnh kết quả (reviewCanvas đã ghép nền/shadow/logo) sang trang Đăng bài.
    PS.shareReviewToFb = function () {
        const el = PS.el;
        if (!window.Web2FbShare) {
            PS.notify('Chưa tải được công cụ chuyển sang Đăng bài', 'error');
            return;
        }
        const cv = el && el.reviewCanvas;
        if (!cv) {
            PS.notify('Chưa có ảnh để đăng', 'warning');
            return;
        }
        let dataUrl;
        try {
            dataUrl = cv.toDataURL('image/png');
        } catch (e) {
            PS.notify('Ảnh chặn xuất (CORS). Thử tải ảnh từ máy.', 'error');
            return;
        }
        PS.notify('Đang chuyển sang trang Đăng bài…', 'info');
        window.Web2FbShare.send({
            images: [{ dataUrl, name: 'photo-studio.png' }],
            source: 'Studio tách nền',
        });
    };

    PS.saveBlob = async function (blob, filename) {
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
        PS.notify('Đã tải ảnh về máy.', 'success');
    };

    // ---- Xử lý hàng loạt ------------------------------------------------
    PS.batchBlobs = []; // [{name, blob}]
    PS.onBatchFiles = async function (e) {
        const state = PS.state,
            el = PS.el;
        const files = [...(e.target.files || [])];
        e.target.value = '';
        if (!files.length) return;
        PS.batchBlobs = [];
        el.batchGrid.innerHTML = '';
        el.batchZip.disabled = true;
        el.batch.hidden = false;
        let done = 0;
        el.batchCount.textContent = `0/${files.length}`;
        for (const file of files) {
            const cell = document.createElement('div');
            cell.className = 'ps-batch-cell ps-batch-loading';
            cell.innerHTML = '<div class="ps-spinner"></div>';
            el.batchGrid.appendChild(cell);
            try {
                const img = await PS.fileToImage(file);
                const { blob, url } = await PS.processOne(img);
                const name = `tach-nen-${PS.stamp()}-${done + 1}.${state.format}`;
                PS.batchBlobs.push({ name, blob });
                cell.className = 'ps-batch-cell';
                cell.innerHTML = `<div class="ps-batch-thumb" style="background-image:url(${url})"></div>`;
            } catch (err) {
                console.warn('[photo-studio] batch item', err?.message);
                cell.className = 'ps-batch-cell ps-batch-err';
                cell.textContent = '⚠';
            }
            done++;
            el.batchCount.textContent = `${done}/${files.length}`;
        }
        el.batchZip.disabled = PS.batchBlobs.length === 0;
        PS.notify(`Xong ${PS.batchBlobs.length}/${files.length} ảnh.`, 'success');
    };

    /** Tách nền 1 ảnh (không dùng mask realtime). chroma→keyOut; còn lại→cloud/local. */
    PS.batchCutout = async function (frameCv, W, H) {
        const state = PS.state;
        if (state.mode === 'chroma') {
            const cv = document.createElement('canvas');
            cv.width = W;
            cv.height = H;
            const c = cv.getContext('2d', { willReadFrequently: true });
            c.drawImage(frameCv, 0, 0);
            const d = c.getImageData(0, 0, W, H);
            PS.keyOut(d, state.key, state.threshold, state.smooth, state.spill);
            c.putImageData(d, 0, 0);
            return cv;
        }
        if (state.hqEngine === 'auto') {
            try {
                return PS.imgToCanvas(await PS.cloudCutout(frameCv), W, H);
            } catch (e) {
                /* fallback local */
            }
        }
        return PS.imgToCanvas(await PS.localCutout(frameCv), W, H);
    };

    /** Ghép nền + bóng + đẹp + logo (identity transform) → blob theo khổ/format. */
    PS.processOne = async function (srcImg) {
        const state = PS.state;
        const W0 = srcImg.naturalWidth,
            H0 = srcImg.naturalHeight;
        const crop = PS.cropRect(W0, H0);
        const { W, H } = PS.captureSize(crop);
        const frameCv = document.createElement('canvas');
        frameCv.width = W;
        frameCv.height = H;
        frameCv.getContext('2d').drawImage(srcImg, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
        const cutout = await PS.batchCutout(frameCv, W, H);
        const transparent = state.bgType === 'transparent';
        const comp = document.createElement('canvas');
        comp.width = W;
        comp.height = H;
        const c = comp.getContext('2d');
        if (!transparent) PS.drawBg(c, W, H, frameCv, { sx: 0, sy: 0, sw: W, sh: H });
        if (state.shadow && !transparent) {
            const sil = PS.buildSilhouette(cutout, W, H);
            c.save();
            c.globalAlpha = 0.32;
            c.filter = `blur(${state.shadowSoft}px)`;
            c.drawImage(sil, 0, Math.round(state.shadowSoft * 0.55 + H * 0.012), W, H);
            c.restore();
            c.filter = 'none';
            c.globalAlpha = 1;
        }
        if (state.enhance) c.filter = 'brightness(1.06) contrast(1.08) saturate(1.14)';
        c.drawImage(cutout, 0, 0);
        c.filter = 'none';
        if (state.logoOn && state.logoImg) PS.drawLogo(c, W, H);
        // khổ xuất + format
        let oW = W,
            oH = H;
        if (state.exportPx) {
            const s = state.exportPx / Math.max(W, H);
            oW = Math.round(W * s);
            oH = Math.round(H * s);
        }
        const fmt = state.format;
        const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
        const out = document.createElement('canvas');
        out.width = oW;
        out.height = oH;
        const oc = out.getContext('2d');
        if (fmt === 'jpg') {
            oc.fillStyle = '#fff';
            oc.fillRect(0, 0, oW, oH);
        }
        oc.drawImage(comp, 0, 0, oW, oH);
        const finalCv = state.upscale ? await PS.upscaleCanvas(out) : out;
        const blob = await PS.canvasToBlob(
            finalCv,
            mime,
            fmt === 'png' ? undefined : state.quality
        );
        return { blob, url: URL.createObjectURL(blob) };
    };

    PS.downloadBatchZip = async function () {
        const el = PS.el;
        if (!PS.batchBlobs.length) return;
        el.batchZip.disabled = true;
        try {
            PS.showLoading('Đang nén ZIP…');
            const mod = await import(/* @vite-ignore */ 'https://esm.sh/jszip@3.10.1');
            const JSZip = mod.default || mod;
            const zip = new JSZip();
            PS.batchBlobs.forEach((b) => zip.file(b.name, b.blob));
            const content = await zip.generateAsync({ type: 'blob' });
            await PS.saveBlob(content, `tach-nen-${PS.stamp()}.zip`);
        } catch (e) {
            console.error('[photo-studio] zip', e);
            PS.notify('Nén ZIP lỗi: ' + (e?.message || e), 'error');
        } finally {
            PS.hideLoading();
            el.batchZip.disabled = false;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
