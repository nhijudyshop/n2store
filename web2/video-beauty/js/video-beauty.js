// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Video Beauty — APP. Làm đẹp VIDEO on-device (mịn da + trắng da + lọc màu xem
 * trước realtime; chỉnh mặt render-pass khi xuất). Tái dùng engine ảnh
 * (Web2BeautyFilters/Web2BeautyFace) + Web2VideoBeautyRender/Export. 100% trên máy.
 */
(function (global) {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const notify = (m, t) => global.notificationManager?.show?.(m, t || 'info');
    const MAX_OUT = 1280; // cạnh dài tối đa video xuất

    const state = {
        file: null,
        videoEl: null,
        work: null,
        wctx: null,
        view: null,
        vctx: null,
        playing: false,
        exporting: false,
        _raf: 0,
        _vfc: 0,
        _gen: 0, // AUDIT #31: token chống 2 previewLoop chạy chồng (double Play)
        _url: null,
        settings: { filter: 'none', smooth: 0.5, whiten: 0.12, warmth: 0.05, face: 0 },
    };

    function setupOutputSize() {
        const v = state.videoEl;
        let W = v.videoWidth || 1280;
        let H = v.videoHeight || 720;
        const m = Math.max(W, H);
        if (m > MAX_OUT) {
            const k = MAX_OUT / m;
            W = Math.round(W * k);
            H = Math.round(H * k);
        }
        state.work.width = W;
        state.work.height = H;
        fitView();
    }
    function fitView() {
        const stage = $('#vbStage');
        const v = state.view;
        if (!stage || !state.work.width) return;
        const maxW = stage.clientWidth - 8;
        const maxH = stage.clientHeight - 8;
        const r = state.work.width / state.work.height;
        let w = maxW;
        let h = w / r;
        if (h > maxH) {
            h = maxH;
            w = h * r;
        }
        v.style.width = Math.max(40, w) + 'px';
        v.style.height = Math.max(40, h) + 'px';
        v.width = Math.round(Math.max(40, w));
        v.height = Math.round(Math.max(40, h));
        drawCurrent();
    }

    function drawCurrent() {
        if (!state.work.width || !state.videoEl?.videoWidth) return;
        global.Web2VideoBeautyRender.applyFrame(
            state.videoEl,
            state.work,
            state.wctx,
            state.settings,
            null
        );
        state.vctx.drawImage(state.work, 0, 0, state.view.width, state.view.height);
    }

    function previewLoop(gen) {
        // AUDIT #31: bail nếu là chain cũ (gen lệch) → không double drawCurrent.
        if (gen !== state._gen || !state.playing) return;
        const v = state.videoEl;
        if (v.ended || v.paused) return stopPreview();
        drawCurrent();
        if (v.requestVideoFrameCallback)
            state._vfc = v.requestVideoFrameCallback(() => previewLoop(gen));
        else state._raf = requestAnimationFrame(() => previewLoop(gen));
    }
    async function playPreview() {
        if (!state.file || state.exporting) return;
        state.playing = true;
        const gen = ++state._gen; // huỷ mọi loop trước, bắt đầu chain mới
        $('#vbPlay').hidden = true;
        $('#vbPause').hidden = false;
        state.videoEl.muted = false;
        try {
            await state.videoEl.play();
        } catch {}
        previewLoop(gen);
    }
    function stopPreview() {
        state.playing = false;
        state._gen++; // vô hiệu loop đang chạy (rVFC/rAF đã queue)
        try {
            state.videoEl.pause();
        } catch {}
        $('#vbPlay').hidden = false;
        $('#vbPause').hidden = true;
        if (state._raf) cancelAnimationFrame(state._raf);
        state._raf = 0;
        if (state._vfc && state.videoEl?.cancelVideoFrameCallback) {
            try {
                state.videoEl.cancelVideoFrameCallback(state._vfc);
            } catch {}
        }
        state._vfc = 0;
    }

    async function loadFile(file) {
        if (!file || !file.type.startsWith('video/'))
            return notify('Hãy chọn file video', 'warning');
        state.file = file;
        // GitHub-style skeleton trong lúc decode video. #vbStage chứa <canvas> SỐNG
        // → tuyệt đối KHÔNG đụng; chỉ vẽ skeleton-frame 16:9 vào placeholder #vbEmpty.
        const _emptyEl = $('#vbEmpty');
        const _emptyHtml = _emptyEl ? _emptyEl.innerHTML : '';
        if (_emptyEl) {
            window.Web2Skeleton?.injectCss?.();
            _emptyEl.hidden = false;
            _emptyEl.innerHTML = window.Web2Skeleton
                ? '<div class="w2sk" style="width:min(560px,80vw);aspect-ratio:16/9;border-radius:12px;margin-bottom:12px"></div><p style="color:#94a3b8;font-size:13px">Đang nạp video…</p>'
                : '<p style="color:#94a3b8;font-size:13px">Đang nạp video…</p>';
        }
        const _restoreEmpty = () => {
            if (!_emptyEl) return;
            _emptyEl.innerHTML = _emptyHtml;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        };
        if (state._url) {
            try {
                URL.revokeObjectURL(state._url);
            } catch {}
        }
        const url = URL.createObjectURL(file);
        state._url = url;
        const v = state.videoEl;
        v.src = url;
        v.__file = file;
        await new Promise((res) => {
            v.onloadedmetadata = res;
            v.onerror = res;
        });
        if (!v.videoWidth) {
            _restoreEmpty(); // gỡ skeleton, trả lại prompt upload (tránh kẹt)
            return notify('Không đọc được video (codec?)', 'error');
        }
        setupOutputSize();
        await new Promise((res) => {
            const d = () => {
                v.removeEventListener('seeked', d);
                res();
            };
            v.addEventListener('seeked', d);
            v.currentTime = 0.01;
        });
        drawCurrent();
        _restoreEmpty(); // trả prompt gốc cho lần upload sau, trước khi ẩn
        $('#vbEmpty').hidden = true;
        $('#vbStage').hidden = false;
        $('#vbControls').hidden = false;
        // preload model chỉnh mặt ở nền
        global.Web2BeautyFace?.warmup?.().catch(() => {});
        const secs = (v.duration || 0).toFixed(1);
        notify(`Đã tải video (${v.videoWidth}×${v.videoHeight}, ${secs}s)`, 'success');
    }

    // ---- export ----
    function setProg(p) {
        const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
        $('#vbProgFill').style.width = pct + '%';
        $('#vbProgPct').textContent = pct + '%';
    }
    function setStatus(m) {
        $('#vbExportStat').textContent = m || '';
    }
    function downloadBlob(blob) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const a = document.createElement('a');
        a.download = `video-lam-dep-${Date.now()}.${ext}`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);
        notify(`Đã xuất video ${ext.toUpperCase()} (${(blob.size / 1e6).toFixed(1)}MB)`, 'success');
    }

    async function doExport() {
        if (!state.file) return notify('Tải video trước', 'warning');
        if (state.exporting) return;
        stopPreview();
        state.exporting = true;
        $('#vbExport').disabled = true;
        $('#vbProg').hidden = false;
        setProg(0);
        const E = global.Web2VideoBeautyExport;
        const base = {
            videoEl: state.videoEl,
            file: state.file,
            work: state.work,
            wctx: state.wctx,
            view: state.view,
            vctx: state.vctx,
            settings: state.settings,
            onProgress: setProg,
            onStatus: setStatus,
        };
        try {
            let blob;
            if (state.settings.face > 0) {
                if (!E.hasWebCodecs()) {
                    notify(
                        'Trình duyệt chưa hỗ trợ chỉnh mặt khi xuất (cần Chrome/Edge mới). Xuất mịn da + lọc màu thôi.',
                        'warning'
                    );
                    blob = await E.exportRealtime({ ...base, fps: 30 });
                } else {
                    setStatus('Chế độ chỉnh mặt: xử lý từng khung, chậm hơn — vui lòng đợi…');
                    blob = await E.exportRenderPass({ ...base, fps: 25 });
                }
            } else {
                setStatus('Đang xuất (mịn da + lọc màu)…');
                blob = await E.exportRealtime({ ...base, fps: 30 });
            }
            if (blob && blob.size) downloadBlob(blob);
            else notify('Xuất video thất bại (file rỗng)', 'error');
        } catch (e) {
            console.error('[video-beauty] export', e);
            if (state.settings.face > 0) {
                // thử lại bằng realtime (mịn da + lọc màu) khi render-pass lỗi
                try {
                    notify('Chỉnh mặt lỗi — thử xuất mịn da + lọc màu…', 'warning');
                    const blob = await E.exportRealtime({ ...base, fps: 30 });
                    if (blob && blob.size) downloadBlob(blob);
                } catch (e2) {
                    notify('Lỗi xuất video: ' + (e2.message || e2), 'error');
                }
            } else {
                notify('Lỗi xuất video: ' + (e.message || e), 'error');
            }
        } finally {
            state.exporting = false;
            $('#vbExport').disabled = false;
            $('#vbProg').hidden = true;
            setProg(0);
            setStatus('');
            drawCurrent();
        }
    }

    // ---- controls ----
    function renderFilters() {
        const wrap = $('#vbFilters');
        wrap.innerHTML = global.Web2VideoBeautyRender.FILTER_LIST.map(
            ([id, label]) =>
                `<button type="button" class="vb-chip ${id === state.settings.filter ? 'on' : ''}" data-f="${id}">${label}</button>`
        ).join('');
        wrap.querySelectorAll('[data-f]').forEach((b) =>
            b.addEventListener('click', () => {
                state.settings.filter = b.dataset.f;
                wrap.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
                if (!state.playing) drawCurrent();
            })
        );
    }
    function wireSliders() {
        const bind = (id, key, fmt) => {
            const el = $('#' + id);
            const val = $('#' + id + 'Val');
            if (!el) return;
            const upd = () => {
                state.settings[key] = parseFloat(el.value);
                if (val) val.textContent = fmt ? fmt(parseFloat(el.value)) : el.value;
                if (!state.playing && !state.exporting) drawCurrent();
            };
            el.addEventListener('input', upd);
            upd();
        };
        const pct = (v) => Math.round(v * 100) + '%';
        bind('vbSmooth', 'smooth', pct);
        bind('vbWhiten', 'whiten', (v) => Math.round((v / 0.4) * 100) + '%');
        bind('vbWarmth', 'warmth', (v) => (v > 0 ? '+' : '') + Math.round((v / 0.3) * 100) + '%');
        bind('vbFace', 'face', (v) => (v <= 0 ? 'Tắt' : pct(v)));
    }

    function fileToVideo() {
        const v = document.createElement('video');
        v.playsInline = true;
        v.preload = 'auto';
        v.crossOrigin = 'anonymous';
        v.style.display = 'none';
        document.body.appendChild(v);
        return v;
    }

    function init() {
        state.videoEl = fileToVideo();
        state.work = document.createElement('canvas');
        state.wctx = state.work.getContext('2d', { willReadFrequently: true });
        state.view = $('#vbCanvas');
        state.vctx = state.view.getContext('2d');
        renderFilters();
        wireSliders();
        $('#vbUpload')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) loadFile(f);
        });
        $('#vbPlay')?.addEventListener('click', playPreview);
        $('#vbPause')?.addEventListener('click', stopPreview);
        $('#vbExport')?.addEventListener('click', doExport);
        global.addEventListener('resize', fitView);
        if (!global.Web2VideoBeautyExport?.hasWebCodecs?.()) {
            const n = $('#vbFaceNote');
            if (n)
                n.textContent =
                    '(Chỉnh mặt khi xuất cần Chrome/Edge mới — máy này có thể chỉ xuất mịn da + lọc màu.)';
        }
    }

    global.VideoBeautyPage = { init, load: loadFile, _state: state };
})(window);
