// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Web2PackCounter: đếm bó/pack bằng camera (opencv.js) + chạm sửa tay, dùng chung.
// =====================================================================
// Web2PackCounter — ĐẾM SỐ BÓ/PACK trên kệ từ camera, on-device
// (opencv.js WASM, KHÔNG server). Theo report on-device camera reading:
// đếm pack chồng dính = DỄ SAI, cần tuning → KHÔNG đếm tự động hoàn toàn mà
// dùng kiểu HỖ-TRỢ-TAY: opencv ước lượng (contour) đặt sẵn marker → user
// CHẠM thêm/bớt cho đúng → con số cuối do user chốt. Dùng chung mọi trang.
//
// Triết lý (giống Web2LabelOcr/Web2BarcodeScanner):
//   1. Lazy: chỉ tải opencv.js (~8MB WASM) khi user mở.
//   2. Self-contained: tự inject CSS overlay.
//   3. Chụp-rồi-đếm: bấm "Đếm" → freeze frame → opencv ước lượng.
//   4. Hỗ-trợ-tay: chạm ảnh thêm marker, chạm marker để xoá. Slider độ nhạy
//      → ước lượng lại. Con số = số marker (user chốt).
//   5. Graceful: CDN/camera fail → notify, KHÔNG vỡ trang.
//
// API (window.Web2PackCounter):
//   open(opts)  -> controller
//   version
//
// opts:
//   onResult(count)  callback khi user bấm "Dùng" với số đếm cuối
//   title, hint
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2PackCounter) return;
    const doc = global.document;
    if (!doc) return;

    const VERSION = '20260618a';
    // @techstark/opencv-js (npm prebuilt, đúng repo report khuyến nghị) — pinned immutable.
    const OPENCV_URL =
        'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.11.0-release.1/dist/opencv.js';
    const HIT_RADIUS = 22; // px chạm trúng marker để xoá

    let _styled = false;
    function ensureStyles() {
        if (_styled || doc.getElementById('w2pk-styles')) {
            _styled = true;
            return;
        }
        const css = `
.w2pk-root{position:fixed;inset:0;z-index:9100;display:flex;flex-direction:column;background:#05070d;color:#e6edf3;
  padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:w2pk-fade .18s ease both}
@keyframes w2pk-fade{from{opacity:0}to{opacity:1}}
.w2pk-bar{flex:0 0 auto;display:flex;align-items:center;gap:6px;height:52px;padding:0 6px;background:#0b1018;border-bottom:1px solid rgba(255,255,255,.08)}
.w2pk-title{flex:1 1 auto;text-align:center;font-size:1rem;font-weight:700}
.w2pk-iconbtn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:none;border-radius:12px;background:transparent;color:#e6edf3;cursor:pointer}
.w2pk-iconbtn:active{background:rgba(255,255,255,.08)}
.w2pk-iconbtn i,.w2pk-iconbtn svg{width:24px;height:24px}
.w2pk-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#05070d;touch-action:none}
.w2pk-video,.w2pk-frozen,.w2pk-overlay{position:absolute;inset:0;width:100%;height:100%}
.w2pk-video,.w2pk-frozen{object-fit:contain;background:#05070d}
.w2pk-frozen[hidden]{display:none}
.w2pk-count{position:absolute;top:12px;left:12px;display:flex;align-items:baseline;gap:8px;padding:10px 16px;border-radius:14px;
  background:rgba(8,13,24,.72);box-shadow:0 4px 16px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.08);z-index:3}
.w2pk-count-num{font-size:clamp(2.2rem,9vw,3rem);font-weight:800;line-height:1;color:var(--web2-primary,#0068ff);font-variant-numeric:tabular-nums}
.w2pk-count-label{font-size:.78rem;font-weight:600;text-transform:uppercase;color:#9fb3c8}
.w2pk-hint{position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:.82rem;color:#cdd9e6;text-shadow:0 1px 4px rgba(0,0,0,.6);padding:0 24px;pointer-events:none}
.w2pk-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#cdd9e6;background:rgba(4,7,13,.6);z-index:4}
.w2pk-loading[hidden]{display:none!important}
.w2pk-spin{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:var(--web2-primary,#0068ff);animation:w2pk-spin .8s linear infinite}
@keyframes w2pk-spin{to{transform:rotate(360deg)}}
.w2pk-foot{flex:0 0 auto;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:#0b1018;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:10px}
.w2pk-sens{display:none;align-items:center;gap:10px;font-size:.82rem;color:#9fb3c8}
.w2pk-sens.show{display:flex}
.w2pk-sens input{flex:1}
.w2pk-btn{width:100%;min-height:54px;border:none;border-radius:16px;font-size:1rem;font-weight:700;color:#fff;background:var(--web2-primary,#0068ff);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.w2pk-btn:active{transform:translateY(1px)}
.w2pk-btn.ghost{background:#1c2738;color:#e6edf3;outline:1px solid rgba(255,255,255,.12)}
.w2pk-btn i,.w2pk-btn svg{width:20px;height:20px}
.w2pk-row{display:none;gap:8px}
.w2pk-row.show{display:flex}
.w2pk-row .w2pk-btn{min-height:50px}
.w2pk-note{font-size:.75rem;color:#8aa0b6;text-align:center;margin:0}
@media (prefers-reduced-motion:reduce){.w2pk-spin{animation:none}}`;
        const s = doc.createElement('style');
        s.id = 'w2pk-styles';
        s.textContent = css;
        (doc.head || doc.documentElement).appendChild(s);
        _styled = true;
    }

    function notify(m, t) {
        if (global.notificationManager && global.notificationManager.show)
            global.notificationManager.show(m, t || 'info');
        else if (t === 'error') console.warn('[Web2PackCounter]', m);
    }

    // ── Lazy-load opencv.js ──────────────────────────────────────────
    let _cvP = null;
    function loadCv() {
        if (global.cv && global.cv.Mat) return Promise.resolve(global.cv);
        if (_cvP) return _cvP;
        _cvP = new Promise((res, rej) => {
            const s = doc.createElement('script');
            s.src = OPENCV_URL;
            s.async = true;
            let done = false;
            const ready = () => {
                if (done) return;
                if (global.cv && global.cv.Mat) {
                    done = true;
                    res(global.cv);
                }
            };
            s.onload = () => {
                // opencv.js: có thể đã sẵn, hoặc cần onRuntimeInitialized, hoặc là Promise
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
                    if (!done && tries++ < 120) setTimeout(poll, 100);
                };
                poll();
            };
            s.onerror = () => {
                _cvP = null;
                rej(new Error('opencv load fail'));
            };
            (doc.head || doc.documentElement).appendChild(s);
        });
        return _cvP;
    }

    // ── opencv: ước lượng tâm các bó (contour) trên 1 canvas ──────────
    // Trả mảng {x,y} theo toạ độ pixel của srcCanvas. sensitivity 1..10
    // (cao = bắt vật nhỏ hơn → đếm nhiều hơn).
    function estimateCenters(cv, srcCanvas, sensitivity) {
        const src = cv.imread(srcCanvas);
        const gray = new cv.Mat(),
            edges = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.Canny(gray, edges, 35, 110);
        const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
        cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
        cv.dilate(edges, edges, kernel);
        const contours = new cv.MatVector(),
            hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        const totalArea = src.rows * src.cols;
        // độ nhạy cao → ngưỡng diện tích nhỏ hơn
        const minArea = totalArea * (0.0009 * (12 - Math.max(1, Math.min(10, sensitivity))));
        const centers = [];
        for (let i = 0; i < contours.size(); i++) {
            const c = contours.get(i);
            const a = cv.contourArea(c);
            if (a >= minArea) {
                const r = cv.boundingRect(c);
                centers.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
            }
            c.delete();
        }
        src.delete();
        gray.delete();
        edges.delete();
        kernel.delete();
        contours.delete();
        hierarchy.delete();
        return centers;
    }

    function open(opts) {
        opts = Object.assign(
            { hint: 'Bấm "Đếm" để chụp & ước lượng — rồi chạm để thêm/bớt' },
            opts || {}
        );
        ensureStyles();
        const root = doc.createElement('div');
        root.className = 'w2pk-root';
        root.innerHTML = `
<div class="w2pk-bar">
  <button type="button" class="w2pk-iconbtn w2pk-close" aria-label="Đóng"><i data-lucide="x"></i></button>
  <span class="w2pk-title">${opts.title || 'Đếm bó / pack'}</span>
  <span style="width:42px"></span>
</div>
<div class="w2pk-stage">
  <video class="w2pk-video" playsinline autoplay muted></video>
  <img class="w2pk-frozen" hidden alt="" />
  <canvas class="w2pk-overlay"></canvas>
  <div class="w2pk-count" hidden><span class="w2pk-count-num">0</span><span class="w2pk-count-label">bó</span></div>
  <div class="w2pk-hint">${opts.hint}</div>
  <div class="w2pk-loading" hidden><div class="w2pk-spin"></div><span class="w2pk-loadtext">Đang xử lý…</span></div>
</div>
<div class="w2pk-foot">
  <label class="w2pk-sens"><span>Độ nhạy</span><input type="range" min="1" max="10" value="5" class="w2pk-sensinp"/></label>
  <button type="button" class="w2pk-btn w2pk-shoot"><i data-lucide="scan-search"></i> Đếm</button>
  <div class="w2pk-row">
    <button type="button" class="w2pk-btn ghost w2pk-retry"><i data-lucide="rotate-ccw"></i> Chụp lại</button>
    <button type="button" class="w2pk-btn w2pk-use"><i data-lucide="check"></i> Dùng</button>
  </div>
  <p class="w2pk-note">Chạm ảnh để thêm điểm · chạm điểm để xoá. Số đếm = số điểm bạn chốt.</p>
</div>`;
        doc.body.appendChild(root);
        if (global.lucide)
            try {
                global.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}

        const video = root.querySelector('.w2pk-video');
        const frozen = root.querySelector('.w2pk-frozen');
        const overlay = root.querySelector('.w2pk-overlay');
        const octx = overlay.getContext('2d');
        const stage = root.querySelector('.w2pk-stage');
        const countBox = root.querySelector('.w2pk-count');
        const countNum = root.querySelector('.w2pk-count-num');
        const hintEl = root.querySelector('.w2pk-hint');
        const loading = root.querySelector('.w2pk-loading');
        const loadText = root.querySelector('.w2pk-loadtext');
        const shootBtn = root.querySelector('.w2pk-shoot');
        const rowEl = root.querySelector('.w2pk-row');
        const sensWrap = root.querySelector('.w2pk-sens');
        const sensInp = root.querySelector('.w2pk-sensinp');
        const useBtn = root.querySelector('.w2pk-use');
        const retryBtn = root.querySelector('.w2pk-retry');

        let stream = null,
            destroyed = false,
            frozenCanvas = null;
        let markers = []; // {x,y} theo toạ độ DISPLAY của stage
        let imgToDisp = null; // map từ pixel ảnh → display

        function setLoading(on, text) {
            loading.hidden = !on;
            if (text) loadText.textContent = text;
        }
        function fitOverlay() {
            overlay.width = stage.clientWidth;
            overlay.height = stage.clientHeight;
        }
        function drawMarkers() {
            octx.clearRect(0, 0, overlay.width, overlay.height);
            octx.lineWidth = 2.5;
            markers.forEach((m, i) => {
                octx.beginPath();
                octx.arc(m.x, m.y, 11, 0, Math.PI * 2);
                octx.fillStyle = 'rgba(0,104,255,.35)';
                octx.fill();
                octx.strokeStyle = '#0068ff';
                octx.stroke();
                octx.fillStyle = '#fff';
                octx.font = 'bold 11px system-ui';
                octx.textAlign = 'center';
                octx.textBaseline = 'middle';
                octx.fillText(String(i + 1), m.x, m.y);
            });
            countNum.textContent = String(markers.length);
        }

        async function start() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
            } catch (e) {
                notify(
                    e && e.name === 'NotAllowedError'
                        ? 'Bạn chưa cho phép dùng camera.'
                        : 'Không mở được camera.',
                    'error'
                );
                cleanup();
                return;
            }
            video.srcObject = stream;
            try {
                await video.play();
            } catch (_) {}
        }
        function stopTracks() {
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
            }
            try {
                video.srcObject = null;
            } catch (_) {}
        }

        async function shoot() {
            if (!video.videoWidth) return;
            // chụp frame gốc
            const vw = video.videoWidth,
                vh = video.videoHeight;
            frozenCanvas = doc.createElement('canvas');
            frozenCanvas.width = vw;
            frozenCanvas.height = vh;
            frozenCanvas.getContext('2d').drawImage(video, 0, 0, vw, vh);
            frozen.src = frozenCanvas.toDataURL('image/png');
            frozen.hidden = false;
            setLoading(true, 'Đang tải bộ xử lý ảnh…');
            let cv;
            try {
                cv = await loadCv();
            } catch (e) {
                setLoading(false);
                notify('Không tải được opencv.js (mạng/CDN).', 'error');
                return;
            }
            if (destroyed) return;
            setLoading(true, 'Đang ước lượng số bó…');
            // chờ ảnh frozen hiển thị xong để tính map display
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            recount(cv);
            setLoading(false);
            // chuyển UI sang chế độ kết quả
            shootBtn.style.display = 'none';
            rowEl.classList.add('show');
            sensWrap.classList.add('show');
            countBox.hidden = false;
            hintEl.textContent = 'Chạm để thêm · chạm điểm để xoá';
        }

        function computeImgToDisp() {
            // object-fit:contain → tính vùng ảnh hiển thị trong stage
            const sw = stage.clientWidth,
                sh = stage.clientHeight;
            const iw = frozenCanvas.width,
                ih = frozenCanvas.height;
            const scale = Math.min(sw / iw, sh / ih);
            const dw = iw * scale,
                dh = ih * scale;
            const ox = (sw - dw) / 2,
                oy = (sh - dh) / 2;
            return { scale, ox, oy };
        }
        function recount(cv) {
            fitOverlay();
            imgToDisp = computeImgToDisp();
            const centers = estimateCenters(cv, frozenCanvas, parseInt(sensInp.value, 10));
            markers = centers.map((c) => ({
                x: imgToDisp.ox + c.x * imgToDisp.scale,
                y: imgToDisp.oy + c.y * imgToDisp.scale,
            }));
            drawMarkers();
        }

        // chạm thêm/bớt marker
        function onTap(clientX, clientY) {
            const rect = stage.getBoundingClientRect();
            const x = clientX - rect.left,
                y = clientY - rect.top;
            // gần marker nào → xoá
            let hit = -1,
                best = HIT_RADIUS;
            markers.forEach((m, i) => {
                const d = Math.hypot(m.x - x, m.y - y);
                if (d < best) {
                    best = d;
                    hit = i;
                }
            });
            if (hit >= 0) markers.splice(hit, 1);
            else markers.push({ x, y });
            drawMarkers();
        }
        overlay.addEventListener('click', (e) => {
            if (frozenCanvas) onTap(e.clientX, e.clientY);
        });

        function use() {
            if (typeof opts.onResult === 'function') {
                try {
                    opts.onResult(markers.length);
                } catch (_) {}
            }
            cleanup();
        }
        function showCamera() {
            frozen.hidden = true;
            frozenCanvas = null;
            markers = [];
            octx.clearRect(0, 0, overlay.width, overlay.height);
            countBox.hidden = true;
            shootBtn.style.display = '';
            rowEl.classList.remove('show');
            sensWrap.classList.remove('show');
            hintEl.textContent = opts.hint;
        }
        function cleanup() {
            destroyed = true;
            stopTracks();
            try {
                root.remove();
            } catch (_) {}
            doc.removeEventListener('keydown', onKey);
        }
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup();
        };

        shootBtn.addEventListener('click', shoot);
        useBtn.addEventListener('click', use);
        retryBtn.addEventListener('click', showCamera);
        sensInp.addEventListener('change', () => {
            if (frozenCanvas && global.cv && global.cv.Mat) recount(global.cv);
        });
        root.querySelector('.w2pk-close').addEventListener('click', cleanup);
        doc.addEventListener('keydown', onKey);
        start();
        return { close: cleanup, el: root };
    }

    global.Web2PackCounter = { version: VERSION, open };
})(typeof window !== 'undefined' ? window : this);
