// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Web2ProductCounter: đếm số SP qua camera realtime, DÙNG CHUNG mọi trang.
// =====================================================================
// Web2ProductCounter — camera điện thoại ĐẾM SỐ LƯỢNG vật thể/SP hiện trên
// màn hình realtime, chạy 100% on-device trong browser (KHÔNG gửi frame lên
// server, 0đ chi phí). Engine = MediaPipe Tasks Vision ObjectDetector
// (EfficientDet-Lite0, COCO 80 class). Dùng chung cho TOÀN BỘ Web 2.0 —
// trang nào cần chỉ load script này rồi tham chiếu, KHÔNG dựng lại engine.
//
// Triết lý (giống Web2Lottie/Web2CustomerChat):
//   1. Lazy: KHÔNG tải MediaPipe (vài MB WASM + model) cho tới khi user
//      thực sự BẬT camera → trang chỉ tham chiếu mà không dùng = 0 tải.
//   2. Self-contained: tự inject CSS widget → trang tham chiếu không cần
//      thêm file css nào.
//   3. On-device: getUserMedia → detectForVideo mỗi ~350ms → đếm bounding
//      box. Ổn định số bằng MEDIAN qua N frame (chống nhấp nháy).
//   4. Graceful: CDN/model/camera fail → status rõ + notify, KHÔNG vỡ trang.
//   5. GPU trước, fallback CPU (WASM) cho iOS Safari.
//
// API (window.Web2ProductCounter):
//   mount(target, opts) -> controller   // nhúng inline vào 1 container
//   open(opts)          -> controller   // drawer toàn màn hình (launcher)
//   defaults                            // bản sao config mặc định (đọc)
//   version
//
// controller: { start(), stop(), toggle(), flipCamera(), getCount(),
//               on(evt,cb), off(evt,cb), destroy(), el, video, canvas }
//   events: 'ready' | 'start' | 'stop' | 'count'(n, detections) | 'error'(err)
//
// opts (đều optional):
//   facingMode      'environment'(mặc định) | 'user'
//   intervalMs      350      // nhịp chạy detect (throttle)
//   medianWindow    5        // số frame lấy median để ổn định số đếm
//   scoreThreshold  0.4      // ngưỡng tin cậy
//   maxResults      30
//   excludePerson   true     // bỏ qua class 'person' (người bán cầm SP)
//   includeClasses  null     // mảng tên class chỉ-đếm (vd ['cup']); null = tất cả
//   modelUrl        <override>  // .tflite tự host (vd Cloudflare/R2) nếu GCS bị chặn
//   autoStart       false    // mount: tự bật camera ngay
//   onCount         fn       // tiện ích = on('count', fn)
//
// Đổi model chính xác hơn (custom-train áo/quần): set opts.modelUrl hoặc
// window.WEB2_CONFIG.OBJECT_MODEL_URL trỏ tới file .tflite EfficientDet-Lite
// đã fine-tune — KHÔNG đổi code.
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2ProductCounter) return;

    const doc = global.document;
    if (!doc) return;

    const VERSION = '20260618a';

    // ── Resolve base path của chính script này (để nạp CSS cùng chỗ nếu cần) ──
    const SCRIPT_SRC = (doc.currentScript && doc.currentScript.src) || '';

    const W2CFG = global.WEB2_CONFIG || {};

    const DEFAULTS = {
        // @mediapipe/tasks-vision — bundle ESM trên jsDelivr
        visionVersion: '0.10.18',
        // EfficientDet-Lite0 float16 (~4MB) — model chính chủ MediaPipe.
        // GCS có thể bị chặn ở 1 số mạng VN → cho phép self-host qua WEB2_CONFIG/opts.
        modelUrl:
            W2CFG.OBJECT_MODEL_URL ||
            'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
        facingMode: 'environment',
        intervalMs: 350,
        medianWindow: 5,
        scoreThreshold: 0.4,
        maxResults: 30,
        excludePerson: true,
        includeClasses: null,
        autoStart: false,
    };

    // ── CSS widget — inject 1 lần ────────────────────────────────────
    let _stylesInjected = false;
    function ensureStyles() {
        if (_stylesInjected || doc.getElementById('w2pc-styles')) {
            _stylesInjected = true;
            return;
        }
        const css = `
.w2pc{position:relative;display:flex;flex-direction:column;gap:14px;width:100%;height:100%;min-height:0;color:var(--web2-text,#e6edf3)}
.w2pc-stage{position:relative;flex:1 1 auto;min-height:240px;border-radius:18px;overflow:hidden;background:#05070d;
  box-shadow:0 10px 30px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.05);isolation:isolate}
.w2pc-video,.w2pc-overlay{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.w2pc-video{background:#05070d}
.w2pc-overlay{pointer-events:none}
.w2pc-flip-mirror .w2pc-video,.w2pc-flip-mirror .w2pc-overlay{transform:scaleX(-1)}
.w2pc-count{position:absolute;top:14px;left:14px;display:flex;align-items:baseline;gap:8px;
  padding:10px 16px;border-radius:14px;background:rgba(8,13,24,.62);backdrop-filter:blur(2px);
  box-shadow:0 4px 16px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.08);z-index:3;
  transition:transform .18s cubic-bezier(.16,1,.3,1)}
.w2pc-count.w2pc-bump{transform:scale(1.12)}
.w2pc-count-num{font-size:clamp(2.4rem,9vw,3.4rem);font-weight:800;line-height:1;color:var(--web2-primary,#0068ff);
  font-variant-numeric:tabular-nums;text-shadow:0 2px 10px rgba(0,104,255,.35)}
.w2pc-count-label{font-size:.8rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#9fb3c8}
.w2pc-status{position:absolute;left:0;right:0;bottom:0;padding:10px 14px;font-size:.82rem;text-align:center;
  background:linear-gradient(0deg,rgba(5,7,13,.85),transparent);color:#c7d3e0;z-index:2;pointer-events:none}
.w2pc-status[hidden]{display:none!important}
.w2pc-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:12px;text-align:center;padding:24px;color:#8aa0b6;z-index:1}
.w2pc-empty[hidden]{display:none!important}
.w2pc-empty svg{width:46px;height:46px;opacity:.7}
.w2pc-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.18);
  border-top-color:var(--web2-primary,#0068ff);animation:w2pc-spin .8s linear infinite}
@keyframes w2pc-spin{to{transform:rotate(360deg)}}
.w2pc-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.w2pc-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border:none;border-radius:14px;
  font-size:.95rem;font-weight:700;cursor:pointer;color:#fff;background:var(--web2-primary,#0068ff);
  box-shadow:0 6px 18px rgba(0,104,255,.32);transition:transform .15s,filter .15s,box-shadow .15s}
.w2pc-btn:hover{filter:brightness(1.06)}
.w2pc-btn:active{transform:translateY(1px) scale(.99)}
.w2pc-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
.w2pc-btn.is-stop{background:#1c2738;color:#e6edf3;box-shadow:none;outline:1px solid rgba(255,255,255,.1)}
.w2pc-btn-ghost{background:transparent;color:#bcd0e6;box-shadow:none;outline:1px solid rgba(255,255,255,.14);padding:11px 16px}
.w2pc-btn svg{width:18px;height:18px}
.w2pc-check{display:inline-flex;align-items:center;gap:7px;font-size:.86rem;color:#bcd0e6;cursor:pointer;
  margin-left:auto;user-select:none}
.w2pc-check input{accent-color:var(--web2-primary,#0068ff);width:16px;height:16px}
@media (prefers-reduced-motion:reduce){.w2pc-count,.w2pc-btn,.w2pc-spin{transition:none;animation:none}}
/* ── drawer toàn màn hình cho open() ── */
.w2pc-overlay-root{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;
  background:rgba(4,7,13,.92);backdrop-filter:blur(3px);padding:14px;gap:12px;
  animation:w2pc-fade .2s ease both}
@keyframes w2pc-fade{from{opacity:0}to{opacity:1}}
.w2pc-overlay-bar{display:flex;align-items:center;justify-content:space-between;color:#e6edf3}
.w2pc-overlay-title{font-size:1rem;font-weight:700;display:flex;align-items:center;gap:8px}
.w2pc-overlay-close{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;
  border:none;border-radius:12px;background:#1c2738;color:#e6edf3;cursor:pointer;outline:1px solid rgba(255,255,255,.1)}
.w2pc-overlay-body{flex:1 1 auto;min-height:0;display:flex}
.w2pc-overlay-root .w2pc{height:100%}
`;
        const style = doc.createElement('style');
        style.id = 'w2pc-styles';
        style.textContent = css;
        (doc.head || doc.documentElement).appendChild(style);
        _stylesInjected = true;
    }

    // ── Lazy-load MediaPipe Tasks Vision (ESM bundle) ────────────────
    let _visionPromise = null;
    function loadVision(ver) {
        if (_visionPromise) return _visionPromise;
        const url = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${ver}`;
        // Dynamic import hợp lệ trong classic script.
        _visionPromise = import(/* @vite-ignore */ url).catch((e) => {
            _visionPromise = null;
            throw e;
        });
        return _visionPromise;
    }

    // ── Detector dùng chung (1 instance/model cho cả trang) ──────────
    // AUDIT 2026-06-20 #29: KHÔNG share ObjectDetector giữa các controller — detector
    // VIDEO-mode có state thời gian nội bộ, dùng chung làm lệch frame/timestamp khi
    // 2 instance chạy song song. Chỉ cache FILESET/WASM (phần nặng, stateless) theo
    // visionVersion; mỗi controller tạo ObjectDetector RIÊNG + close() khi stop/destroy.
    const _filesetCache = new Map(); // visionVersion -> Promise<{FilesetResolver,ObjectDetector,fileset}>
    function getVisionFileset(visionVersion) {
        if (_filesetCache.has(visionVersion)) return _filesetCache.get(visionVersion);
        const p = (async () => {
            const vision = await loadVision(visionVersion);
            const { FilesetResolver, ObjectDetector } = vision;
            const fileset = await FilesetResolver.forVisionTasks(
                `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${visionVersion}/wasm`
            );
            return { ObjectDetector, fileset };
        })();
        _filesetCache.set(visionVersion, p);
        p.catch(() => _filesetCache.delete(visionVersion));
        return p;
    }
    async function getDetector(opts) {
        const { ObjectDetector, fileset } = await getVisionFileset(opts.visionVersion);
        const make = (delegate) =>
            ObjectDetector.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: opts.modelUrl, delegate },
                scoreThreshold: opts.scoreThreshold,
                maxResults: opts.maxResults,
                runningMode: 'VIDEO',
            });
        try {
            return await make('GPU');
        } catch (_e) {
            // iOS Safari / máy yếu → CPU (WASM)
            return await make('CPU');
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────
    function median(arr) {
        if (!arr.length) return 0;
        const s = arr.slice().sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
    }
    function categoryName(det) {
        const c = det && det.categories && det.categories[0];
        return (c && (c.categoryName || c.displayName)) || '';
    }

    // ── Controller: 1 widget camera + đếm ────────────────────────────
    function createController(rootEl, userOpts) {
        const opts = Object.assign({}, DEFAULTS, userOpts || {});
        const listeners = { ready: [], start: [], stop: [], count: [], error: [] };
        let stream = null;
        let detector = null;
        let raf = 0;
        let running = false;
        let starting = false; // chống double-start trong cửa sổ async (vd flipCamera double-tap)
        let destroyed = false;
        let lastDetect = 0;
        let currentCount = 0;
        const history = [];

        // ── DOM ──
        ensureStyles();
        rootEl.classList.add('w2pc');
        rootEl.innerHTML = `
<div class="w2pc-stage">
  <video class="w2pc-video" playsinline autoplay muted></video>
  <canvas class="w2pc-overlay"></canvas>
  <div class="w2pc-count" hidden><span class="w2pc-count-num">0</span><span class="w2pc-count-label">SP</span></div>
  <div class="w2pc-empty"><i data-lucide="scan-search"></i><p>Bấm <b>Bật camera</b> rồi đưa sản phẩm vào khung hình để đếm.</p></div>
  <div class="w2pc-status" hidden></div>
</div>
<div class="w2pc-controls">
  <button type="button" class="w2pc-btn w2pc-toggle"><i data-lucide="camera"></i><span>Bật camera</span></button>
  <button type="button" class="w2pc-btn w2pc-btn-ghost w2pc-flip" disabled><i data-lucide="refresh-cw"></i></button>
  <label class="w2pc-check"><input type="checkbox" class="w2pc-xperson"${opts.excludePerson ? ' checked' : ''}/>Bỏ qua người</label>
</div>`;
        const stage = rootEl.querySelector('.w2pc-stage');
        const video = rootEl.querySelector('.w2pc-video');
        const canvas = rootEl.querySelector('.w2pc-overlay');
        const ctx = canvas.getContext('2d');
        const countBox = rootEl.querySelector('.w2pc-count');
        const countNum = rootEl.querySelector('.w2pc-count-num');
        const emptyBox = rootEl.querySelector('.w2pc-empty');
        const statusEl = rootEl.querySelector('.w2pc-status');
        const toggleBtn = rootEl.querySelector('.w2pc-toggle');
        const flipBtn = rootEl.querySelector('.w2pc-flip');
        const xPerson = rootEl.querySelector('.w2pc-xperson');
        if (global.lucide)
            try {
                global.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}

        // ── events ──
        function emit(evt, a, b) {
            (listeners[evt] || []).forEach((fn) => {
                try {
                    fn(a, b);
                } catch (e) {
                    /* listener lỗi không làm vỡ loop */
                }
            });
        }
        function on(evt, fn) {
            if (listeners[evt]) listeners[evt].push(fn);
            return ctrl;
        }
        function off(evt, fn) {
            if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== fn);
            return ctrl;
        }

        function setStatus(msg) {
            if (!msg) {
                statusEl.hidden = true;
                statusEl.textContent = '';
                return;
            }
            statusEl.hidden = false;
            statusEl.textContent = msg;
        }
        function setToggleUi(isOn, busy) {
            toggleBtn.disabled = !!busy;
            toggleBtn.classList.toggle('is-stop', isOn);
            const ico = isOn ? 'square' : 'camera';
            const txt = isOn ? 'Tắt camera' : 'Bật camera';
            toggleBtn.innerHTML = `<i data-lucide="${ico}"></i><span>${busy ? 'Đang mở…' : txt}</span>`;
            if (global.lucide)
                try {
                    global.lucide.createIcons({ nameAttr: 'data-lucide' });
                } catch (_) {}
            flipBtn.disabled = !isOn;
        }
        function setCount(n) {
            if (n === currentCount) return;
            currentCount = n;
            countNum.textContent = String(n);
            countBox.classList.add('w2pc-bump');
            setTimeout(() => countBox.classList.remove('w2pc-bump'), 200);
            emit('count', n, _lastDets);
        }

        // ── detection loop ──
        let _lastDets = [];
        function filterDets(dets) {
            const xp = xPerson.checked;
            const inc = opts.includeClasses;
            return (dets || []).filter((d) => {
                const name = categoryName(d);
                if (xp && name === 'person') return false;
                if (inc && inc.length && !inc.includes(name)) return false;
                return true;
            });
        }
        function drawBoxes(dets) {
            const vw = video.videoWidth,
                vh = video.videoHeight;
            if (!vw || !vh) return;
            if (canvas.width !== vw || canvas.height !== vh) {
                canvas.width = vw;
                canvas.height = vh;
            }
            ctx.clearRect(0, 0, vw, vh);
            ctx.lineWidth = Math.max(2, Math.round(vw / 320));
            ctx.strokeStyle =
                getComputedStyle(rootEl).getPropertyValue('--web2-primary').trim() || '#0068ff';
            ctx.font = `${Math.max(12, Math.round(vw / 32))}px system-ui, sans-serif`;
            dets.forEach((d) => {
                const b = d.boundingBox;
                if (!b) return;
                ctx.strokeRect(b.originX, b.originY, b.width, b.height);
            });
        }
        function loop() {
            if (!running || destroyed) return;
            raf = global.requestAnimationFrame(loop);
            if (video.readyState < 2 || !video.videoWidth) return;
            const now = global.performance ? global.performance.now() : Date.now();
            if (now - lastDetect < opts.intervalMs) return;
            lastDetect = now;
            let res;
            try {
                res = detector.detectForVideo(video, now);
            } catch (e) {
                return; // 1 frame lỗi → bỏ qua, không vỡ
            }
            const dets = filterDets(res && res.detections);
            _lastDets = dets;
            history.push(dets.length);
            while (history.length > opts.medianWindow) history.shift();
            drawBoxes(dets);
            setCount(median(history));
        }

        // ── start / stop ──
        async function start() {
            // `running` chỉ bật SAU khi getUserMedia + getDetector xong, nên một
            // double-tap (vd flipCamera) có thể chạy 2 start() chồng nhau → 2 stream.
            // `starting` đóng cửa sổ async đó: lần thứ 2 trả về ngay.
            if (running || starting || destroyed) return;
            starting = true;
            setToggleUi(false, true);
            setStatus('Đang mở camera…');
            emptyBox.hidden = true;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: opts.facingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
            } catch (e) {
                starting = false;
                setToggleUi(false, false);
                emptyBox.hidden = false;
                setStatus('');
                const msg =
                    e && e.name === 'NotAllowedError'
                        ? 'Bạn chưa cho phép dùng camera.'
                        : 'Không mở được camera: ' + ((e && e.message) || e);
                notify(msg, 'error');
                emit('error', e);
                return;
            }
            video.srcObject = stream;
            rootEl.classList.toggle('w2pc-flip-mirror', opts.facingMode === 'user');
            try {
                await video.play();
            } catch (_) {}
            setStatus('Đang tải bộ nhận diện…');
            try {
                detector = await getDetector(opts);
            } catch (e) {
                starting = false;
                stopTracks();
                setToggleUi(false, false);
                emptyBox.hidden = false;
                setStatus('');
                notify('Không tải được bộ nhận diện AI (mạng/CDN). Thử lại sau.', 'error');
                emit('error', e);
                return;
            }
            if (destroyed) {
                starting = false;
                stopTracks();
                return;
            }
            running = true;
            starting = false;
            lastDetect = 0;
            history.length = 0;
            countBox.hidden = false;
            setStatus('Đưa sản phẩm vào khung hình');
            setTimeout(() => setStatus(''), 2200);
            setToggleUi(true, false);
            emit('ready');
            emit('start');
            raf = global.requestAnimationFrame(loop);
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
        function stop() {
            if (!running && !stream && !detector) return;
            running = false;
            if (raf) {
                global.cancelAnimationFrame(raf);
                raf = 0;
            }
            stopTracks();
            // AUDIT #29: giải phóng ObjectDetector riêng của controller này.
            try {
                detector?.close?.();
            } catch (_) {}
            detector = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            countBox.hidden = true;
            emptyBox.hidden = false;
            setStatus('');
            setToggleUi(false, false);
            currentCount = 0;
            emit('stop');
        }
        function toggle() {
            return running ? stop() : start();
        }
        async function flipCamera() {
            // Bỏ qua tap khi đang mở dở → tránh stop()+start() chồng nhau (2 stream).
            if (starting) return;
            opts.facingMode = opts.facingMode === 'environment' ? 'user' : 'environment';
            if (running) {
                flipBtn.disabled = true; // khoá nút trong lúc chuyển
                stop();
                try {
                    await start();
                } finally {
                    if (!destroyed && running) flipBtn.disabled = false;
                }
            }
        }
        function destroy() {
            destroyed = true;
            stop();
            try {
                rootEl.innerHTML = '';
                rootEl.classList.remove('w2pc', 'w2pc-flip-mirror');
            } catch (_) {}
        }

        // ── wire UI ──
        toggleBtn.addEventListener('click', () => toggle());
        flipBtn.addEventListener('click', () => flipCamera());

        const ctrl = {
            el: rootEl,
            video,
            canvas,
            start,
            stop,
            toggle,
            flipCamera,
            destroy,
            on,
            off,
            getCount: () => currentCount,
            getDetections: () => _lastDets.slice(),
            isRunning: () => running,
        };
        if (typeof opts.onCount === 'function') on('count', opts.onCount);
        if (opts.autoStart) start();
        return ctrl;
    }

    function notify(msg, type) {
        if (global.notificationManager && global.notificationManager.show)
            global.notificationManager.show(msg, type || 'info');
        else if (type === 'error') console.warn('[Web2ProductCounter]', msg);
    }

    function resolveTarget(target) {
        if (!target) return null;
        if (typeof target === 'string') return doc.querySelector(target);
        if (target.nodeType === 1) return target;
        return null;
    }

    // ── Public: mount inline ─────────────────────────────────────────
    function mount(target, opts) {
        const el = resolveTarget(target);
        if (!el) {
            console.warn('[Web2ProductCounter] mount: target không tồn tại', target);
            return null;
        }
        return createController(el, opts);
    }

    // ── Public: open drawer toàn màn hình (launcher) ─────────────────
    function open(opts) {
        ensureStyles();
        const root = doc.createElement('div');
        root.className = 'w2pc-overlay-root';
        root.innerHTML = `
<div class="w2pc-overlay-bar">
  <div class="w2pc-overlay-title"><i data-lucide="scan-search"></i> Đếm SP qua camera</div>
  <button type="button" class="w2pc-overlay-close" aria-label="Đóng"><i data-lucide="x"></i></button>
</div>
<div class="w2pc-overlay-body"><div class="w2pc-host"></div></div>`;
        doc.body.appendChild(root);
        if (global.lucide)
            try {
                global.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}
        const host = root.querySelector('.w2pc-host');
        const ctrl = createController(host, Object.assign({ autoStart: true }, opts || {}));
        let _closed = false;
        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        const close = () => {
            if (_closed) return; // idempotent — tránh double destroy/remove
            _closed = true;
            // Gỡ keydown listener ở MỌI đường đóng (X-button, Escape, lập trình),
            // không chỉ nhánh Escape → tránh leak listener + closure giữ controller đã destroy.
            doc.removeEventListener('keydown', onKey);
            try {
                ctrl.destroy();
            } catch (_) {}
            root.remove();
        };
        root.querySelector('.w2pc-overlay-close').addEventListener('click', close);
        doc.addEventListener('keydown', onKey);
        ctrl.close = close;
        return ctrl;
    }

    global.Web2ProductCounter = {
        version: VERSION,
        defaults: Object.assign({}, DEFAULTS),
        mount,
        open,
        _createController: createController,
    };
})(typeof window !== 'undefined' ? window : this);
