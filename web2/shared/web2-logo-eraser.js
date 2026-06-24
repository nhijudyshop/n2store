// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================================
// Web2LogoEraser — XOÁ LOGO / watermark trên ảnh, ON-DEVICE (không server).
//   await Web2LogoEraser.open(imgSrc) → Promise<dataURL PNG | null>
// User: kéo chọn 1+ vùng logo (hoặc "Tự dò" gợi ý) → "Xoá vùng" → INPAINT THẬT
// bằng OpenCV TELEA (lấp bằng texture xung quanh, content-aware) → "Xong" trả ảnh sạch.
// Trước đây chỉ nội suy viền (bilinear) = trông như LÀM MỜ; nay ưu tiên opencv.js
// (lazy-load ~8MB WASM), fallback bilinear nếu CDN/opencv lỗi.
// Reusable: product-card / photo-studio… đều gọi được.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2LogoEraser) return;

    function _loadImage(src) {
        return new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => {
                const i2 = new Image();
                i2.onload = () => res(i2);
                i2.onerror = () => res(null);
                i2.src = src;
            };
            img.src = src;
        });
    }

    // Content-aware fill 1 vùng (rx,ry,rw,rh) trên ImageData: nội suy song tuyến
    // từ 4 viền NGOÀI vùng → che logo mượt trên nền gradient/đồng màu.
    function _inpaintRect(data, W, H, rx, ry, rw, rh) {
        const px = data.data;
        const x0 = Math.max(0, rx);
        const y0 = Math.max(0, ry);
        const x1 = Math.min(W, rx + rw);
        const y1 = Math.min(H, ry + rh);
        const get = (x, y) => {
            const i = (y * W + x) * 4;
            return [px[i], px[i + 1], px[i + 2], px[i + 3]];
        };
        // lấy mẫu viền ngoài (clamp về trong ảnh)
        const lx = Math.max(0, x0 - 1);
        const rxo = Math.min(W - 1, x1);
        const ty = Math.max(0, y0 - 1);
        const byo = Math.min(H - 1, y1);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const L = get(lx, y);
                const R = get(rxo, y);
                const T = get(x, ty);
                const B = get(x, byo);
                // trọng số theo khoảng cách tới mỗi viền
                const wl = 1 / (x - lx + 1);
                const wr = 1 / (rxo - x + 1);
                const wt = 1 / (y - ty + 1);
                const wb = 1 / (byo - y + 1);
                const wsum = wl + wr + wt + wb || 1;
                const i = (y * W + x) * 4;
                for (let c = 0; c < 3; c++) {
                    let v = (L[c] * wl + R[c] * wr + T[c] * wt + B[c] * wb) / wsum;
                    v += (Math.random() - 0.5) * 6; // nhiễu nhẹ tránh patch phẳng
                    px[i + c] = Math.max(0, Math.min(255, v));
                }
                px[i + 3] = 255;
            }
        }
    }

    // ── XOÁ logo THẬT bằng OpenCV inpaint (content-aware, lấp bằng texture xung
    // quanh) thay vì chỉ nội suy mượt (trông như làm mờ). Lazy-load opencv.js. ──
    const OPENCV_URL =
        'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.11.0-release.1/dist/opencv.js';
    let _cvP = null;
    function _loadCv() {
        if (global.cv && global.cv.Mat) return Promise.resolve(global.cv);
        if (_cvP) return _cvP;
        _cvP = new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = OPENCV_URL;
            s.async = true;
            let done = false;
            const ready = () => {
                if (!done && global.cv && global.cv.Mat) {
                    done = true;
                    res(global.cv);
                }
            };
            s.onload = () => {
                if (global.cv && typeof global.cv.then === 'function') {
                    global.cv.then((m) => {
                        global.cv = m;
                        done = true;
                        res(m);
                    });
                    return;
                }
                if (global.cv && !global.cv.Mat) {
                    try {
                        global.cv.onRuntimeInitialized = ready;
                    } catch (_) {}
                }
                let tries = 0;
                const poll = () => {
                    if (done) return;
                    ready();
                    if (!done && tries++ < 150) setTimeout(poll, 100);
                };
                poll();
            };
            s.onerror = () => {
                _cvP = null;
                rej(new Error('opencv load fail'));
            };
            (document.head || document.documentElement).appendChild(s);
        });
        return _cvP;
    }

    // Inpaint TELEA trên canvas đầy đủ độ phân giải. QUAN TRỌNG: trong mỗi ô user
    // khoanh, chỉ mask NÉT LOGO (high-pass: chỗ khác nền) chứ KHÔNG mask cả ô — nhờ vậy
    // TELEA lấp nét từ texture xung quanh, GIỮ vân nền (không bị smear/làm mờ cả vùng).
    // Nền bận / không tách được nét rõ → fallback mask cả ô.
    function _inpaintCv(cv, canvas, rects) {
        const src = cv.imread(canvas); // RGBA
        const rgb = new cv.Mat();
        cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const W = src.cols,
            H = src.rows;
        const mask = cv.Mat.zeros(H, W, cv.CV_8UC1);
        rects.forEach((r) => {
            const x = Math.max(0, r.x | 0);
            const y = Math.max(0, r.y | 0);
            const w = Math.min(W - x, r.w | 0);
            const h = Math.min(H - y, r.h | 0);
            if (w < 3 || h < 3) return;
            const roiR = new cv.Rect(x, y, w, h);
            const rm = mask.roi(roiR);
            const g = gray.roi(roiR);
            const bg = new cv.Mat();
            let kb = Math.max(11, Math.round(Math.min(w, h) / 5));
            if (kb % 2 === 0) kb++; // kernel lẻ
            cv.GaussianBlur(g, bg, new cv.Size(kb, kb), 0); // ước lượng nền
            const diff = new cv.Mat();
            cv.absdiff(g, bg, diff); // high-pass: nét logo nổi lên
            const tm = new cv.Mat();
            cv.threshold(diff, tm, 18, 255, cv.THRESH_BINARY);
            cv.dilate(tm, tm, cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
            const frac = cv.countNonZero(tm) / (w * h);
            if (frac >= 0.004 && frac <= 0.55)
                tm.copyTo(rm); // có nét rõ → chỉ xóa nét
            else rm.setTo(new cv.Scalar(255)); // không rõ nét → xóa cả ô
            g.delete();
            bg.delete();
            diff.delete();
            tm.delete();
            rm.delete();
        });
        const dst = new cv.Mat();
        cv.inpaint(rgb, mask, dst, 4, cv.INPAINT_TELEA);
        const out = new cv.Mat();
        cv.cvtColor(dst, out, cv.COLOR_RGB2RGBA);
        cv.imshow(canvas, out);
        [src, rgb, gray, mask, dst, out].forEach((m) => {
            try {
                m.delete();
            } catch (_) {}
        });
    }

    // Tự dò vùng logo: chia lưới, tính mật độ cạnh (gradient luminance), gộp ô
    // cạnh-cao thành box (cap ≤ 45% ảnh để không chọn nhầm cả SP). Trả [{x,y,w,h}].
    function _autoDetect(data, W, H) {
        const px = data.data;
        const GX = 32;
        const cw = Math.max(1, Math.floor(W / GX));
        const ch = cw;
        const cols = Math.ceil(W / cw);
        const rows = Math.ceil(H / ch);
        const lum = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        const score = new Float32Array(cols * rows);
        let maxS = 0;
        for (let cy = 0; cy < rows; cy++) {
            for (let cx = 0; cx < cols; cx++) {
                let s = 0;
                let n = 0;
                const xs = cx * cw;
                const ys = cy * ch;
                for (let y = ys; y < Math.min(ys + ch, H); y += 2) {
                    for (let x = xs; x < Math.min(xs + cw, W); x += 2) {
                        const i = (y * W + x) * 4;
                        if (x + 1 < W) s += Math.abs(lum(i) - lum(i + 4));
                        if (y + 1 < H) s += Math.abs(lum(i) - lum(i + W * 4));
                        n++;
                    }
                }
                const v = n ? s / n : 0;
                score[cy * cols + cx] = v;
                if (v > maxS) maxS = v;
            }
        }
        if (maxS <= 0) return [];
        const thr = maxS * 0.55;
        const hot = score.map((v) => (v >= thr ? 1 : 0));
        // flood-fill gộp ô hot → box
        const seen = new Uint8Array(cols * rows);
        const boxes = [];
        const stack = [];
        for (let k = 0; k < hot.length; k++) {
            if (!hot[k] || seen[k]) continue;
            stack.length = 0;
            stack.push(k);
            seen[k] = 1;
            let minx = cols;
            let miny = rows;
            let maxx = 0;
            let maxy = 0;
            let cnt = 0;
            while (stack.length) {
                const idx = stack.pop();
                const cx = idx % cols;
                const cy = (idx / cols) | 0;
                cnt++;
                if (cx < minx) minx = cx;
                if (cy < miny) miny = cy;
                if (cx > maxx) maxx = cx;
                if (cy > maxy) maxy = cy;
                [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ].forEach(([dx, dy]) => {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
                    const ni = ny * cols + nx;
                    if (hot[ni] && !seen[ni]) {
                        seen[ni] = 1;
                        stack.push(ni);
                    }
                });
            }
            if (cnt < 2) continue;
            const bx = minx * cw;
            const by = miny * ch;
            const bw = Math.min(W, (maxx + 1) * cw) - bx;
            const bh = Math.min(H, (maxy + 1) * ch) - by;
            const area = (bw * bh) / (W * H);
            if (area > 0.45 || area < 0.002) continue; // bỏ box quá to (SP) / quá nhỏ
            // padding nhẹ
            const padx = Math.round(bw * 0.12);
            const pady = Math.round(bh * 0.12);
            boxes.push({
                x: Math.max(0, bx - padx),
                y: Math.max(0, by - pady),
                w: Math.min(W, bw + padx * 2),
                h: Math.min(H, bh + pady * 2),
                cnt,
            });
        }
        boxes.sort((a, b) => b.cnt - a.cnt);
        return boxes.slice(0, 3).map(({ x, y, w, h }) => ({ x, y, w, h }));
    }

    function open(imgSrc) {
        return new Promise(async (resolve) => {
            const img = await _loadImage(imgSrc);
            if (!img || !img.width) {
                resolve(null);
                return;
            }
            const NW = img.naturalWidth || img.width;
            const NH = img.naturalHeight || img.height;
            // canvas natural-res (nguồn sự thật) + canvas hiển thị scale theo viewport
            const work = document.createElement('canvas');
            work.width = NW;
            work.height = NH;
            const wctx = work.getContext('2d', { willReadFrequently: true });
            wctx.drawImage(img, 0, 0);
            const history = [];

            const back = document.createElement('div');
            back.className = 'w2le-back';
            back.innerHTML = `
                <div class="w2le-modal">
                    <div class="w2le-head">
                        <b><i data-lucide="eraser"></i> Xoá logo / watermark</b>
                        <button class="w2le-x" data-le="cancel" aria-label="Đóng">✕</button>
                    </div>
                    <div class="w2le-stage" data-le="stage">
                        <canvas class="w2le-canvas" data-le="canvas"></canvas>
                    </div>
                    <div class="w2le-hint">Kéo chuột khoanh vùng logo → bấm <b>Xoá vùng</b>. Có thể khoanh nhiều vùng. Dùng <b>Tự dò</b> để gợi ý.</div>
                    <div class="w2le-foot">
                        <button class="w2le-btn" data-le="auto"><i data-lucide="scan-search"></i> Tự dò</button>
                        <button class="w2le-btn" data-le="undo"><i data-lucide="undo-2"></i> Hoàn tác</button>
                        <button class="w2le-btn w2le-danger" data-le="erase"><i data-lucide="eraser"></i> Xoá vùng đã chọn</button>
                        <span style="flex:1"></span>
                        <button class="w2le-btn" data-le="cancel2">Huỷ</button>
                        <button class="w2le-btn w2le-primary" data-le="done"><i data-lucide="check"></i> Xong</button>
                    </div>
                </div>`;
            document.body.appendChild(back);
            ensureStyles();
            global.lucide?.createIcons?.();

            const cvs = back.querySelector('[data-le="canvas"]');
            const stage = back.querySelector('[data-le="stage"]');
            const cctx = cvs.getContext('2d');
            let scale = 1; // natural px / display px
            let rects = []; // {x,y,w,h} natural px
            let drag = null;

            function fit() {
                const maxW = stage.clientWidth - 24;
                const maxH = stage.clientHeight - 24;
                let dw = maxW;
                let dh = (dw * NH) / NW;
                if (dh > maxH) {
                    dh = maxH;
                    dw = (dh * NW) / NH;
                }
                cvs.style.width = dw + 'px';
                cvs.style.height = dh + 'px';
                cvs.width = Math.round(dw);
                cvs.height = Math.round(dh);
                scale = NW / cvs.width;
                redraw();
            }
            function redraw() {
                cctx.clearRect(0, 0, cvs.width, cvs.height);
                cctx.drawImage(work, 0, 0, cvs.width, cvs.height);
                cctx.lineWidth = 2;
                rects.forEach((r) => {
                    cctx.strokeStyle = '#ef4444';
                    cctx.fillStyle = 'rgba(239,68,68,0.18)';
                    const x = r.x / scale;
                    const y = r.y / scale;
                    const w = r.w / scale;
                    const h = r.h / scale;
                    cctx.fillRect(x, y, w, h);
                    cctx.strokeRect(x, y, w, h);
                });
            }
            function evtPos(e) {
                const b = cvs.getBoundingClientRect();
                const cx = (e.touches ? e.touches[0].clientX : e.clientX) - b.left;
                const cy = (e.touches ? e.touches[0].clientY : e.clientY) - b.top;
                return {
                    x: Math.max(0, Math.min(cvs.width, cx)),
                    y: Math.max(0, Math.min(cvs.height, cy)),
                };
            }
            cvs.addEventListener('pointerdown', (e) => {
                const p = evtPos(e);
                drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
                cvs.setPointerCapture?.(e.pointerId);
            });
            cvs.addEventListener('pointermove', (e) => {
                if (!drag) return;
                const p = evtPos(e);
                drag.x1 = p.x;
                drag.y1 = p.y;
                redraw();
                cctx.strokeStyle = '#0068ff';
                cctx.fillStyle = 'rgba(0,104,255,0.15)';
                cctx.lineWidth = 2;
                const x = Math.min(drag.x0, drag.x1);
                const y = Math.min(drag.y0, drag.y1);
                const w = Math.abs(drag.x1 - drag.x0);
                const h = Math.abs(drag.y1 - drag.y0);
                cctx.fillRect(x, y, w, h);
                cctx.strokeRect(x, y, w, h);
            });
            cvs.addEventListener('pointerup', () => {
                if (!drag) return;
                const x = Math.min(drag.x0, drag.x1) * scale;
                const y = Math.min(drag.y0, drag.y1) * scale;
                const w = Math.abs(drag.x1 - drag.x0) * scale;
                const h = Math.abs(drag.y1 - drag.y0) * scale;
                if (w > 6 && h > 6) rects.push({ x, y, w, h });
                drag = null;
                redraw();
            });

            async function applyErase() {
                if (!rects.length) return notify('Hãy khoanh vùng logo trước', 'warning');
                history.push(wctx.getImageData(0, 0, NW, NH));
                if (history.length > 8) history.shift();
                const rs = rects.map((r) => ({
                    x: Math.round(r.x),
                    y: Math.round(r.y),
                    w: Math.round(r.w),
                    h: Math.round(r.h),
                }));
                // ƯU TIÊN inpaint THẬT (OpenCV TELEA) — lấp bằng texture xung quanh,
                // KHÔNG chỉ làm mờ. Lỗi tải/chạy → fallback nội suy viền (bilinear).
                let okCv = false;
                notify('Đang xoá logo (AI inpaint, lần đầu tải ~8MB)…', 'info');
                try {
                    const cv = await _loadCv();
                    _inpaintCv(cv, wctx.canvas, rs);
                    okCv = true;
                } catch (e) {
                    console.warn('[logo-eraser] opencv inpaint fail → fallback bilinear:', e);
                }
                if (!okCv) {
                    const data = wctx.getImageData(0, 0, NW, NH);
                    rs.forEach((r) => _inpaintRect(data, NW, NH, r.x, r.y, r.w, r.h));
                    wctx.putImageData(data, 0, 0);
                }
                rects = [];
                redraw();
                notify(
                    okCv ? 'Đã xoá logo ✓ (inpaint)' : 'Đã xoá vùng (nền mượt — opencv lỗi)',
                    'success'
                );
            }
            function autoDetect() {
                const data = wctx.getImageData(0, 0, NW, NH);
                const found = _autoDetect(data, NW, NH);
                if (!found.length)
                    return notify('Không tìm thấy vùng logo rõ ràng — khoanh tay nhé', 'info');
                rects = rects.concat(found);
                redraw();
                notify(`Gợi ý ${found.length} vùng — chỉnh lại nếu cần rồi bấm Xoá`, 'info');
            }
            function undo() {
                const prev = history.pop();
                if (!prev) return;
                wctx.putImageData(prev, 0, 0);
                rects = [];
                redraw();
            }
            function notify(m, t) {
                global.notificationManager?.show?.(m, t || 'info');
            }
            function cleanup() {
                back.remove();
                global.removeEventListener('resize', fit);
            }
            back.addEventListener('click', (e) => {
                const a = e.target.closest('[data-le]')?.dataset.le;
                if (!a) {
                    if (e.target === back) {
                        cleanup();
                        resolve(null);
                    }
                    return;
                }
                if (a === 'cancel' || a === 'cancel2') {
                    cleanup();
                    resolve(null);
                } else if (a === 'erase') applyErase();
                else if (a === 'auto') autoDetect();
                else if (a === 'undo') undo();
                else if (a === 'done') {
                    const url = work.toDataURL('image/png');
                    cleanup();
                    resolve(url);
                }
            });
            global.addEventListener('resize', fit);
            requestAnimationFrame(fit);
        });
    }

    function ensureStyles() {
        if (document.getElementById('w2le-css')) return;
        const s = document.createElement('style');
        s.id = 'w2le-css';
        s.textContent = `
.w2le-back{position:fixed;inset:0;z-index:100000;background:rgba(2,6,23,.62);display:flex;align-items:center;justify-content:center;padding:18px}
.w2le-modal{width:min(960px,96vw);height:min(88vh,900px);background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(2,8,23,.4)}
.w2le-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:15px}
.w2le-head i{width:18px;height:18px;vertical-align:-3px}
.w2le-x{border:0;background:transparent;font-size:18px;cursor:pointer;color:#64748b}
.w2le-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#eef2f7 0 25%,#fff 0 50%) 50%/22px 22px;overflow:hidden}
.w2le-canvas{touch-action:none;cursor:crosshair;border-radius:6px;box-shadow:0 6px 24px rgba(2,8,23,.2);max-width:100%;max-height:100%}
.w2le-hint{padding:8px 16px;font-size:12px;color:#64748b;border-top:1px solid #f1f5f9}
.w2le-foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;flex-wrap:wrap}
.w2le-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;color:#0f172a}
.w2le-btn i{width:15px;height:15px}
.w2le-btn:hover{filter:brightness(.97)}
.w2le-primary{background:#0068ff;border-color:#0068ff;color:#fff}
.w2le-danger{background:#fee2e2;border-color:#fecaca;color:#b91c1c}
`;
        document.head.appendChild(s);
    }

    global.Web2LogoEraser = { open };
})(window);
