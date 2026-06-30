// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — beauty studio UI.
// =====================================================================
// Web2BeautyStudio — STUDIO LÀM ĐẸP kiểu Meitu, on-device, DÙNG CHUNG Web 2.0.
//   const dataUrl = await Web2BeautyStudio.open(src, { tool, name });
//     src   : dataURL | blobURL | URL | HTMLImageElement
//     tool  : 'auto'|'smooth'|'tone'|'eyes'|'nose'|'face'|'lips'|'legs'
//     return: dataURL PNG ảnh đã chỉnh ("Lấy ảnh về") | null (đóng)
//
// Mỗi công cụ 1 thanh điều khiển riêng + canvas xem trước. Bấm "Áp dụng" nhiều
// lần để tăng dần. Hoàn tác / Đặt lại / Lấy ảnh về. Engine ở Web2BeautyFilters
// (pixel) + Web2BeautyFace (điểm mốc MediaPipe). Trang chỉ gọi open(), KHÔNG
// dựng lại — 1 nguồn dùng chung.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2BeautyStudio) return;

    const FACE_TOOLS = ['eyes', 'nose', 'face', 'lips'];
    // 2026-06-24: 1800→1440. Lọc làm đẹp (smooth/warp) chạy SYNC trên main-thread → ảnh
    // to freeze UI lâu = "stuck". 1440px vẫn nét đẹp cho FB/Zalo/in card, nhanh hơn ~35%.
    const MAX_WORK = 1440; // cạnh dài tối đa canvas xử lý (cân bằng tốc độ/chất lượng)
    const MAX_HISTORY = 6;

    // ── WEB WORKER: xử lý lọc NẶNG trên luồng nền → KHÔNG đứng UI (spinner mượt). ──
    // URL worker = cùng thư mục module này (lấy từ currentScript lúc load). Pixel buffer
    // chuyển bằng Transferable. Lỗi/không có worker → fallback xử lý sync ở main-thread.
    const WORKER_URL = (function () {
        try {
            const s = document.currentScript && document.currentScript.src;
            if (s) return s.replace(/[^/]*$/, 'web2-beauty-worker.js') + '?v=20260624a';
        } catch (_) {}
        return null;
    })();
    let _bw = null; // Worker | false (đã lỗi) | null (chưa tạo)
    let _bwSeq = 0;
    const _bwJobs = new Map();
    function getWorker() {
        if (_bw === false || !WORKER_URL || typeof Worker === 'undefined') return null;
        if (_bw) return _bw;
        try {
            _bw = new Worker(WORKER_URL);
            _bw.onmessage = (e) => {
                const { id, ok, buf, w, h, error } = e.data || {};
                const job = _bwJobs.get(id);
                if (!job) return;
                _bwJobs.delete(id);
                ok ? job.res({ buf, w, h }) : job.rej(new Error(error || 'worker error'));
            };
            _bw.onerror = () => {
                _bw = false;
                _bwJobs.forEach((j) => j.rej(new Error('worker crashed')));
                _bwJobs.clear();
            };
        } catch (_) {
            _bw = false;
            return null;
        }
        return _bw;
    }
    function runInWorker(op, imageData, params) {
        return new Promise((res, rej) => {
            const w = getWorker();
            if (!w) return rej(new Error('no worker'));
            const id = ++_bwSeq;
            _bwJobs.set(id, { res, rej });
            const buf = imageData.data.buffer; // sẽ bị transfer (detach) — ok, ta tạo ImageData mới từ kết quả
            w.postMessage({ id, op, buf, w: imageData.width, h: imageData.height, params }, [buf]);
            setTimeout(() => {
                if (_bwJobs.has(id)) {
                    _bwJobs.delete(id);
                    rej(new Error('worker timeout'));
                }
            }, 90000);
        });
    }
    // Chạy 1 op lọc: ưu tiên Worker (nền), lỗi → fallback sync main-thread. Trả ImageData.
    async function processImageData(op, imageData, params) {
        try {
            const r = await runInWorker(op, imageData, params);
            return new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h);
        } catch (_) {
            const F = global.Web2BeautyFilters;
            if (op === 'smooth') {
                F.smoothSkin(imageData, F.buildSkinMask(imageData), params);
                return imageData;
            }
            if (op === 'tone') {
                F.adjustSkinTone(imageData, F.buildSkinMask(imageData), params);
                return imageData;
            }
            if (op === 'beautify') {
                F.beautify(imageData, params.strength);
                return imageData;
            }
            if (op === 'warp') return F.warp(imageData, params.brushes || []);
            if (op === 'auto') {
                F.beautify(imageData, params.strength);
                return params.brushes && params.brushes.length
                    ? F.warp(imageData, params.brushes)
                    : imageData;
            }
            return imageData;
        }
    }

    const TOOLS = {
        auto: {
            label: 'Làm đẹp tự động',
            icon: 'sparkles',
            hint: 'Mịn da + sáng da + tinh chỉnh mặt nhẹ (nếu có khuôn mặt).',
            sliders: [{ key: 'strength', label: 'Mức độ', min: 0, max: 1, step: 0.01, val: 0.6 }],
        },
        smooth: {
            label: 'Mịn da',
            icon: 'droplets',
            hint: 'Làm mịn vùng da, giữ chi tiết tóc/mắt/môi sắc nét.',
            sliders: [{ key: 'intensity', label: 'Độ mịn', min: 0, max: 1, step: 0.01, val: 0.6 }],
        },
        tone: {
            label: 'Màu da',
            icon: 'palette',
            hint: 'Sáng da, ấm tông, đều màu.',
            sliders: [
                { key: 'brighten', label: 'Sáng da', min: 0, max: 0.5, step: 0.01, val: 0.16 },
                { key: 'warmth', label: 'Ấm', min: -0.3, max: 0.3, step: 0.01, val: 0.05 },
                { key: 'even', label: 'Đều màu', min: 0, max: 0.6, step: 0.01, val: 0.2 },
            ],
        },
        eyes: {
            label: 'Mắt to',
            icon: 'eye',
            hint: 'Phóng to nhẹ 2 mắt quanh tâm mống mắt.',
            sliders: [{ key: 'strength', label: 'Mức độ', min: 0, max: 1, step: 0.01, val: 0.5 }],
        },
        nose: {
            label: 'Mũi thon',
            icon: 'triangle',
            hint: 'Thu gọn đầu mũi + 2 cánh mũi.',
            sliders: [{ key: 'strength', label: 'Mức độ', min: 0, max: 1, step: 0.01, val: 0.5 }],
        },
        face: {
            label: 'Mặt V-line',
            icon: 'scan-face',
            hint: 'Bóp hàm dưới về giữa tạo mặt thon.',
            sliders: [{ key: 'strength', label: 'Mức độ', min: 0, max: 1, step: 0.01, val: 0.5 }],
        },
        lips: {
            label: 'Môi căng',
            icon: 'smile',
            hint: 'Làm môi đầy đặn hơn.',
            sliders: [{ key: 'strength', label: 'Mức độ', min: 0, max: 1, step: 0.01, val: 0.5 }],
        },
        legs: {
            label: 'Kéo chân',
            icon: 'move-vertical',
            hint: 'Kéo 2 đường để chọn vùng (eo → cổ chân) rồi Áp dụng.',
            legs: true,
            sliders: [{ key: 'factor', label: 'Kéo dài', min: 1, max: 1.3, step: 0.01, val: 1.12 }],
        },
    };

    function loadImage(src) {
        return new Promise((res) => {
            if (src && src.tagName === 'IMG' && src.complete) return res(src);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => {
                const i2 = new Image();
                i2.onload = () => res(i2);
                i2.onerror = () => res(null);
                i2.src = typeof src === 'string' ? src : src?.src;
            };
            img.src = typeof src === 'string' ? src : src?.src;
        });
    }

    function open(src, opts) {
        opts = opts || {};
        const tool = TOOLS[opts.tool] ? opts.tool : 'auto';
        const meta = TOOLS[tool];
        const needFace = FACE_TOOLS.includes(tool);
        return new Promise(async (resolve) => {
            const notify = (m, t) => global.notificationManager?.show?.(m, t || 'info');
            const img = await loadImage(src);
            if (!img || !img.width) {
                notify('Không tải được ảnh', 'error');
                return resolve(null);
            }
            ensureStyles();

            // ── work (source of truth) + orig (để Đặt lại) + view (hiển thị) ──
            const work = document.createElement('canvas');
            const wctx = work.getContext('2d', { willReadFrequently: true });
            const orig = document.createElement('canvas');
            buildWork(img, work, wctx, orig);

            const back = document.createElement('div');
            back.className = 'bs-back';
            back.innerHTML = `
                <div class="bs-modal">
                    <div class="bs-head">
                        <b><i data-lucide="${meta.icon}"></i> ${esc(meta.label)}</b>
                        <span class="bs-head-hint">${esc(meta.hint)}</span>
                        <span style="flex:1"></span>
                        <button class="bs-btn bs-primary" data-bs="done"><i data-lucide="check"></i> Lấy ảnh về</button>
                        <button class="bs-x" data-bs="close" aria-label="Đóng">✕</button>
                    </div>
                    <div class="bs-stage" data-bs="stage">
                        <canvas class="bs-canvas" data-bs="canvas"></canvas>
                        <div class="bs-busy" data-bs="busy" hidden><div class="bs-spin"></div><span data-bs="busytext">Đang xử lý…</span></div>
                    </div>
                    <div class="bs-banner" data-bs="banner" hidden></div>
                    <div class="bs-foot">
                        <div class="bs-controls" data-bs="controls"></div>
                        <div class="bs-actions">
                            <button class="bs-btn" data-bs="undo"><i data-lucide="undo-2"></i> Hoàn tác</button>
                            <button class="bs-btn" data-bs="reset"><i data-lucide="rotate-ccw"></i> Đặt lại</button>
                            <button class="bs-btn bs-apply" data-bs="apply"><i data-lucide="wand-2"></i> Áp dụng</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(back);
            global.lucide?.createIcons?.();

            const stage = back.querySelector('[data-bs="stage"]');
            const view = back.querySelector('[data-bs="canvas"]');
            const vctx = view.getContext('2d');
            const busyEl = back.querySelector('[data-bs="busy"]');
            const busyText = back.querySelector('[data-bs="busytext"]');
            const banner = back.querySelector('[data-bs="banner"]');
            const controls = back.querySelector('[data-bs="controls"]');

            let scale = 1; // work px / view px
            let busy = false;
            let faceMissing = false;
            let det = null;
            const history = [];
            const legState = { y0: 0, y1: 0 };
            let dragLine = null;

            // ── controls ──
            controls.innerHTML =
                meta.sliders
                    .map(
                        (s) =>
                            `<div class="bs-slider"><label>${esc(s.label)} <b class="bs-val" data-for="${s.key}"></b></label>` +
                            `<input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.val}"></div>`
                    )
                    .join('') + (meta.legs ? '' : '');
            controls.querySelectorAll('input[type=range]').forEach((inp) => {
                const upd = () => {
                    const b = controls.querySelector(`.bs-val[data-for="${inp.dataset.key}"]`);
                    if (b) b.textContent = Number(inp.value).toFixed(2);
                    if (meta.legs) redraw();
                };
                inp.addEventListener('input', upd);
                upd();
            });
            function readControls() {
                const o = {};
                controls.querySelectorAll('input[type=range]').forEach((i) => {
                    o[i.dataset.key] = parseFloat(i.value);
                });
                return o;
            }

            // ── view sizing / draw ──
            function fit() {
                const availW = stage.clientWidth - 28;
                const availH = stage.clientHeight - 28;
                if (availW <= 0 || availH <= 0) return;
                let dw = availW;
                let dh = (dw * work.height) / work.width;
                if (dh > availH) {
                    dh = availH;
                    dw = (dh * work.width) / work.height;
                }
                view.style.width = dw + 'px';
                view.style.height = dh + 'px';
                view.width = Math.round(dw);
                view.height = Math.round(dh);
                scale = work.width / view.width;
                redraw();
            }
            function redraw() {
                vctx.clearRect(0, 0, view.width, view.height);
                vctx.drawImage(work, 0, 0, view.width, view.height);
                if (meta.legs) drawLegHandles();
            }
            function drawLegHandles() {
                const y0 = legState.y0 / scale;
                const y1 = legState.y1 / scale;
                vctx.save();
                vctx.fillStyle = 'rgba(0,104,255,0.12)';
                vctx.fillRect(0, y0, view.width, y1 - y0);
                [
                    [y0, '#0068ff', 'Trên (eo)'],
                    [y1, '#10b981', 'Dưới (cổ chân)'],
                ].forEach(([y, col, label]) => {
                    vctx.strokeStyle = col;
                    vctx.lineWidth = 2;
                    vctx.beginPath();
                    vctx.moveTo(0, y);
                    vctx.lineTo(view.width, y);
                    vctx.stroke();
                    vctx.fillStyle = col;
                    vctx.fillRect(view.width / 2 - 38, y - 9, 76, 18);
                    vctx.fillStyle = '#fff';
                    vctx.font = '11px system-ui, sans-serif';
                    vctx.textAlign = 'center';
                    vctx.fillText(label, view.width / 2, y + 4);
                });
                vctx.restore();
            }
            function resetLegDefaults() {
                legState.y0 = work.height * 0.5;
                legState.y1 = work.height * 0.92;
            }

            // ── leg handle drag ──
            if (meta.legs) {
                resetLegDefaults();
                view.addEventListener('pointerdown', (e) => {
                    const b = view.getBoundingClientRect();
                    const vy = e.clientY - b.top;
                    const d0 = Math.abs(vy - legState.y0 / scale);
                    const d1 = Math.abs(vy - legState.y1 / scale);
                    if (Math.min(d0, d1) > 22) return;
                    dragLine = d0 <= d1 ? 'y0' : 'y1';
                    view.setPointerCapture?.(e.pointerId);
                });
                view.addEventListener('pointermove', (e) => {
                    if (!dragLine) return;
                    const b = view.getBoundingClientRect();
                    const vy = Math.max(0, Math.min(view.height, e.clientY - b.top));
                    legState[dragLine] = vy * scale;
                    redraw();
                });
                const endDrag = () => (dragLine = null);
                view.addEventListener('pointerup', endDrag);
                view.addEventListener('pointercancel', endDrag);
            }

            // ── busy / banner ──
            function setBusy(on, text) {
                busy = on;
                busyEl.hidden = !on;
                if (text) busyText.textContent = text;
                back.querySelector('[data-bs="apply"]').disabled = on;
            }
            function showBanner(msg) {
                banner.textContent = msg;
                banner.hidden = false;
            }

            // ── history ──
            function pushHistory() {
                history.push({
                    w: work.width,
                    h: work.height,
                    data: wctx.getImageData(0, 0, work.width, work.height),
                });
                if (history.length > MAX_HISTORY) history.shift();
            }
            function undo() {
                const prev = history.pop();
                if (!prev) return notify('Không còn bước để hoàn tác', 'info');
                work.width = prev.w;
                work.height = prev.h;
                wctx.putImageData(prev.data, 0, 0);
                if (meta.legs) resetLegDefaults();
                fit();
            }
            function reset() {
                history.length = 0;
                work.width = orig.width;
                work.height = orig.height;
                wctx.drawImage(orig, 0, 0);
                if (meta.legs) resetLegDefaults();
                fit();
                notify('Đã đặt lại ảnh gốc', 'info');
            }

            function setWork(canvas) {
                work.width = canvas.width;
                work.height = canvas.height;
                wctx.drawImage(canvas, 0, 0);
            }

            // ── apply (defer 2 frames để spinner kịp vẽ) ──
            function apply() {
                if (busy) return;
                if (faceMissing) return notify('Công cụ này cần ảnh có khuôn mặt rõ', 'warning');
                setBusy(true, 'Đang xử lý…');
                // double-rAF cho spinner kịp vẽ; doApply async (lọc chạy trong Web Worker nền).
                requestAnimationFrame(() =>
                    requestAnimationFrame(async () => {
                        try {
                            await doApply();
                        } catch (e) {
                            console.error('[Web2BeautyStudio] apply lỗi:', e);
                            const m = /tainted|insecure|SecurityError/i.test(
                                String(e?.message || e)
                            )
                                ? 'Ảnh bị chặn CORS — hãy "Tải ảnh từ máy" rồi chỉnh.'
                                : 'Lỗi xử lý ảnh: ' + (e?.message || e);
                            notify(m, 'error');
                        }
                        setBusy(false);
                    })
                );
            }
            async function doApply() {
                const F = global.Web2BeautyFilters;
                if (!F) return notify('Thiếu engine xử lý ảnh', 'error');
                const v = readControls();
                pushHistory();

                // Kéo chân dùng canvas (stretchBand) → giữ ở main, nhanh, không freeze.
                if (meta.legs) {
                    const out = F.stretchBand(work, legState.y0, legState.y1, v.factor || 1.12, {
                        seam: 6,
                    });
                    setWork(out);
                    resetLegDefaults();
                    fit();
                    notify('Đã kéo dài', 'success');
                    return;
                }

                const imgData = wctx.getImageData(0, 0, work.width, work.height);
                let out;
                if (tool === 'smooth') {
                    out = await processImageData('smooth', imgData, { intensity: v.intensity });
                } else if (tool === 'tone') {
                    out = await processImageData('tone', imgData, {
                        brighten: v.brighten,
                        warmth: v.warmth,
                        saturation: -(v.even || 0),
                    });
                } else if (tool === 'auto') {
                    // buildAutoBrushes (nhẹ) chạy main; beautify+warp (nặng) chạy Worker 1 lần.
                    const brushes = det
                        ? global.Web2BeautyFace.buildAutoBrushes(det, v.strength)
                        : [];
                    out = await processImageData('auto', imgData, {
                        strength: v.strength,
                        brushes,
                    });
                } else {
                    // face tools (eyes/nose/face/lips): warp theo brush từ landmark.
                    const brushes = global.Web2BeautyFace.buildBrushes(det, tool, v.strength);
                    if (!brushes.length) {
                        notify('Không dựng được hiệu ứng cho ảnh này', 'warning');
                        return;
                    }
                    out = await processImageData('warp', imgData, { brushes });
                }
                wctx.putImageData(out, 0, 0);
                redraw();
                notify('Đã áp dụng — bấm tiếp để tăng dần', 'success');
            }

            // ── wire buttons ──
            function cleanup() {
                back.remove();
                global.removeEventListener('resize', fit);
            }
            back.addEventListener('click', (e) => {
                const a = e.target.closest('[data-bs]')?.dataset.bs;
                if (!a) {
                    if (e.target === back) {
                        cleanup();
                        resolve(null);
                    }
                    return;
                }
                if (a === 'close') {
                    cleanup();
                    resolve(null);
                } else if (a === 'done') {
                    let url = null;
                    try {
                        url = work.toDataURL('image/png');
                    } catch (err) {
                        notify('Ảnh bị chặn CORS — không xuất được', 'error');
                    }
                    cleanup();
                    resolve(url);
                } else if (a === 'apply') apply();
                else if (a === 'undo') undo();
                else if (a === 'reset') reset();
            });
            global.addEventListener('resize', fit);
            requestAnimationFrame(fit);

            // ── nhận diện khuôn mặt (face tools + auto) ──
            if ((needFace || tool === 'auto') && global.Web2BeautyFace) {
                setBusy(true, 'Đang tải bộ nhận diện (lần đầu ~13MB, sau sẽ tức thì)…');
                // thanh % theo tiến trình tải; watchdog chỉ bỏ cuộc nếu ĐỨNG thật
                // (không có hoạt động trong 30s) — không timeout khi đang tải/đang chạy.
                let lastActivity = Date.now();
                const unsub = global.Web2BeautyFace.onProgress?.((f) => {
                    lastActivity = Date.now();
                    busyText.textContent =
                        f >= 1
                            ? 'Đang nhận diện khuôn mặt…'
                            : 'Đang tải bộ nhận diện… ' + Math.round(f * 100) + '% (chỉ lần đầu)';
                });
                let iv = null;
                const guard = new Promise((res) => {
                    iv = setInterval(() => {
                        if (Date.now() - lastActivity > 30000) res('__timeout__');
                    }, 2000);
                });
                let r;
                try {
                    r = await Promise.race([global.Web2BeautyFace.detect(work), guard]);
                } catch (e) {
                    r = null;
                }
                clearInterval(iv);
                unsub && unsub();
                det = r === '__timeout__' ? null : r;
                setBusy(false);
                if (r === '__timeout__') {
                    notify(
                        needFace
                            ? 'Nhận diện khuôn mặt quá lâu (mạng?) — thử lại hoặc dùng Mịn da / Màu da'
                            : 'Bỏ qua chỉnh khuôn mặt (mạng chậm) — vẫn làm mịn da bình thường',
                        'warning'
                    );
                }
                if (!det && needFace) {
                    faceMissing = true;
                    showBanner(
                        '⚠ Không tìm thấy khuôn mặt rõ (hoặc nhận diện quá lâu). Công cụ này cần ảnh chân dung. Hãy thử ảnh khác, hoặc dùng "Mịn da" / "Màu da".'
                    );
                }
            }
        });
    }

    function buildWork(img, work, wctx, orig) {
        let W = img.naturalWidth || img.width;
        let H = img.naturalHeight || img.height;
        const m = Math.max(W, H);
        if (m > MAX_WORK) {
            const k = MAX_WORK / m;
            W = Math.round(W * k);
            H = Math.round(H * k);
        }
        work.width = W;
        work.height = H;
        wctx.drawImage(img, 0, 0, W, H);
        orig.width = W;
        orig.height = H;
        orig.getContext('2d').drawImage(work, 0, 0);
    }

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function ensureStyles() {
        if (document.getElementById('bs-css')) return;
        const s = document.createElement('style');
        s.id = 'bs-css';
        s.textContent = `
.bs-back{position:fixed;inset:0;z-index:100001;background:rgba(2,6,23,.66);display:flex;align-items:center;justify-content:center;padding:14px}
.bs-modal{width:min(1040px,97vw);height:min(92vh,940px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 26px 74px rgba(2,8,23,.46)}
.bs-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;flex-wrap:wrap}
.bs-head>b{display:inline-flex;align-items:center;gap:7px;font-weight:800;color:#0f172a}
.bs-head i{width:18px;height:18px;vertical-align:-3px}
.bs-head-hint{font-size:12px;color:#94a3b8;font-weight:500}
.bs-x{border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b;padding:4px 8px}
.bs-stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#eef2f7 0 25%,#fff 0 50%) 50%/22px 22px;overflow:hidden}
.bs-canvas{touch-action:none;border-radius:8px;box-shadow:0 8px 28px rgba(2,8,23,.22);max-width:100%;max-height:100%}
.bs-busy{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(255,255,255,.74);color:#0f172a;font-weight:700;font-size:14px;backdrop-filter:none}
.bs-spin{width:36px;height:36px;border-radius:50%;border:4px solid #dbeafe;border-top-color:#0068ff;animation:bs-rot .8s linear infinite}
@keyframes bs-rot{to{transform:rotate(360deg)}}
.bs-banner{padding:10px 16px;background:#fff7ed;color:#9a3412;font-size:12.5px;border-top:1px solid #fed7aa;line-height:1.5}
.bs-foot{display:flex;align-items:center;gap:16px;padding:12px 16px;border-top:1px solid #e5e7eb;flex-wrap:wrap}
.bs-controls{display:flex;gap:18px;flex:1;flex-wrap:wrap;min-width:200px}
.bs-slider{display:flex;flex-direction:column;gap:5px;min-width:150px;flex:1}
.bs-slider label{font-size:12px;font-weight:700;color:#334155;display:flex;justify-content:space-between;gap:8px}
.bs-val{font-family:ui-monospace,Menlo,monospace;color:#0068ff;font-weight:800}
.bs-slider input[type=range]{width:100%;accent-color:#0068ff;cursor:pointer}
.bs-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.bs-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;color:#0f172a;font-family:inherit}
.bs-btn i{width:15px;height:15px}
.bs-btn:hover{filter:brightness(.97)}
.bs-btn:disabled{opacity:.55;cursor:default}
.bs-primary{background:#0068ff;border-color:#0068ff;color:#fff}
.bs-apply{background:#10b981;border-color:#10b981;color:#fff;padding:10px 18px}
@media(max-width:640px){.bs-head-hint{display:none}.bs-foot{gap:10px}}
`;
        document.head.appendChild(s);
    }

    global.Web2BeautyStudio = { open, TOOLS };
})(window);
