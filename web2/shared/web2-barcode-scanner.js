// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Web2BarcodeScanner: quét barcode/QR bằng CAMERA on-device, dùng chung mọi trang.
// =====================================================================
// Web2BarcodeScanner — quét barcode/QR/DataMatrix... TRỰC TIẾP TỪ CAMERA
// điện thoại, 100% on-device (KHÔNG gửi ảnh lên server). Là "máy quét gun
// bằng camera" — mỗi lần đọc được mã thì gọi onScan(code) y như máy quét
// cầm tay gõ vào ô input. Dùng chung cho TOÀN BỘ Web 2.0 — trang nào cần
// chỉ load script này rồi gọi, KHÔNG dựng lại engine.
//
// Engine: Sec-ant/barcode-detector (ponyfill) — tự dùng BarcodeDetector
// NATIVE trên Chrome/Android (nhanh, 0 WASM), fallback ZXing-C++ WASM trên
// iOS Safari/Firefox. 1 code path mọi máy. MIT.
//
// Triết lý (giống Web2ProductCounter/Web2Lottie):
//   1. Lazy: chỉ import ponyfill (CDN) khi user thực sự mở scanner.
//   2. Self-contained: tự inject CSS overlay/viewfinder.
//   3. On-device: getUserMedia → detect(video) mỗi ~120ms → onScan.
//   4. Dedupe: cùng 1 mã không bắn liên tục (re-arm sau dedupeMs).
//   5. Feedback: beep (WebAudio) + rung (vibrate) + flash khung xanh.
//   6. Graceful: CDN/camera fail → notify, KHÔNG vỡ trang.
//
// API (window.Web2BarcodeScanner):
//   open(opts)            -> controller   // overlay toàn màn hình (launcher)
//   mount(target, opts)   -> controller   // nhúng inline
//   version
//
// controller: { start, stop, close, setTorch(on), el, on/off(evt,cb) }
//   events: 'ready' | 'scan'(code, raw) | 'error'(err) | 'close'
//
// opts:
//   onScan(code, raw)   BẮT BUỘC nên truyền — callback mỗi mã đọc được
//   formats             mảng định dạng (mặc định bộ phổ biến)
//   title               tiêu đề overlay
//   continuous=true     quét liên tục (false = đóng sau 1 mã)
//   dedupeMs=1500       cùng 1 mã chỉ bắn lại sau ngần này ms
//   hint                dòng gợi ý dưới khung ngắm
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2BarcodeScanner) return;

    const doc = global.document;
    if (!doc) return;

    const VERSION = '20260618a';
    // Ponyfill ESM — native trước, ZXing-C++ WASM fallback. Đổi version ở 1 chỗ.
    const PONYFILL_URL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3/dist/es/ponyfill.min.js';

    const DEFAULT_FORMATS = [
        'qr_code',
        'code_128',
        'ean_13',
        'ean_8',
        'code_39',
        'code_93',
        'upc_a',
        'upc_e',
        'itf',
        'data_matrix',
        'pdf417',
        'codabar',
        'aztec',
    ];

    // ── CSS overlay/viewfinder — inject 1 lần ────────────────────────
    let _stylesInjected = false;
    function ensureStyles() {
        if (_stylesInjected || doc.getElementById('w2bc-styles')) {
            _stylesInjected = true;
            return;
        }
        const css = `
.w2bc{position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;color:#e6edf3;background:#05070d}
.w2bc-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#05070d}
.w2bc-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#05070d}
.w2bc-scrim{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(closest-side at 50% 44%, transparent 0 38%, rgba(4,7,13,.55) 72%)}
.w2bc-frame{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);
  width:min(74vw,320px);aspect-ratio:1.25/1;border-radius:18px;pointer-events:none;
  box-shadow:0 0 0 2px rgba(255,255,255,.18), 0 0 0 9999px rgba(4,7,13,.0)}
.w2bc-frame::before,.w2bc-frame::after,.w2bc-corner::before,.w2bc-corner::after{content:"";position:absolute;
  width:30px;height:30px;border:3px solid var(--web2-primary,#0068ff);border-radius:4px}
.w2bc-frame::before{top:-3px;left:-3px;border-right:0;border-bottom:0;border-top-left-radius:16px}
.w2bc-frame::after{top:-3px;right:-3px;border-left:0;border-bottom:0;border-top-right-radius:16px}
.w2bc-corner::before{bottom:-3px;left:-3px;border-right:0;border-top:0;border-bottom-left-radius:16px}
.w2bc-corner::after{bottom:-3px;right:-3px;border-left:0;border-top:0;border-bottom-right-radius:16px}
.w2bc-frame.is-hit{box-shadow:0 0 0 3px #1ad05f, 0 0 22px rgba(26,208,95,.6)}
.w2bc-frame.is-hit::before,.w2bc-frame.is-hit::after,.w2bc-frame.is-hit .w2bc-corner::before,.w2bc-frame.is-hit .w2bc-corner::after{border-color:#1ad05f}
.w2bc-line{position:absolute;left:8%;right:8%;top:18%;height:2px;border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--web2-primary,#0068ff),transparent);
  box-shadow:0 0 10px var(--web2-primary,#0068ff);animation:w2bc-scan 2.1s ease-in-out infinite}
@keyframes w2bc-scan{0%,100%{top:16%}50%{top:80%}}
.w2bc-hint{position:absolute;left:0;right:0;bottom:14%;text-align:center;font-size:.86rem;color:#cdd9e6;
  text-shadow:0 1px 4px rgba(0,0,0,.6);padding:0 24px;pointer-events:none}
.w2bc-last{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);max-width:86%;
  display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;
  background:rgba(8,13,24,.82);box-shadow:0 4px 16px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.1);
  font-size:.92rem;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;opacity:0;transition:opacity .2s, transform .2s}
.w2bc-last.show{opacity:1}
.w2bc-last .w2bc-cnt{font-weight:600;color:#9fb3c8;font-size:.8rem}
.w2bc-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#9fb3c8}
.w2bc-loading[hidden]{display:none!important}
.w2bc-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.18);border-top-color:var(--web2-primary,#0068ff);animation:w2bc-spin .8s linear infinite}
@keyframes w2bc-spin{to{transform:rotate(360deg)}}
/* drawer toàn màn hình cho open() */
.w2bc-root{position:fixed;inset:0;z-index:9100;display:flex;flex-direction:column;background:#05070d;
  padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:w2bc-fade .18s ease both}
@keyframes w2bc-fade{from{opacity:0}to{opacity:1}}
.w2bc-bar{flex:0 0 auto;display:flex;align-items:center;gap:6px;height:52px;padding:0 6px;
  background:#0b1018;border-bottom:1px solid rgba(255,255,255,.08)}
.w2bc-title{flex:1 1 auto;text-align:center;font-size:1rem;font-weight:700}
.w2bc-iconbtn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;
  border:none;border-radius:12px;background:transparent;color:#e6edf3;cursor:pointer}
.w2bc-iconbtn:active{background:rgba(255,255,255,.08)}
.w2bc-iconbtn.is-on{color:var(--web2-primary,#0068ff)}
.w2bc-iconbtn i,.w2bc-iconbtn svg{width:24px;height:24px}
.w2bc-body{flex:1 1 auto;min-height:0;display:flex}
@media (prefers-reduced-motion:reduce){.w2bc-line,.w2bc-last,.w2bc-frame{animation:none;transition:none}}`;
        const style = doc.createElement('style');
        style.id = 'w2bc-styles';
        style.textContent = css;
        (doc.head || doc.documentElement).appendChild(style);
        _stylesInjected = true;
    }

    // ── Lazy-load ponyfill (BarcodeDetector) ─────────────────────────
    let _modPromise = null;
    function loadModule() {
        if (_modPromise) return _modPromise;
        _modPromise = import(/* @vite-ignore */ PONYFILL_URL).catch((e) => {
            _modPromise = null;
            throw e;
        });
        return _modPromise;
    }

    // ── Beep (WebAudio) — không cần file ─────────────────────────────
    let _ac = null;
    function beep() {
        try {
            _ac = _ac || new (global.AudioContext || global.webkitAudioContext)();
            if (_ac.state === 'suspended') _ac.resume();
            const o = _ac.createOscillator(),
                g = _ac.createGain();
            o.type = 'square';
            o.frequency.value = 1320;
            g.gain.value = 0.05;
            o.connect(g);
            g.connect(_ac.destination);
            const t = _ac.currentTime;
            o.start(t);
            o.stop(t + 0.08);
        } catch (_) {}
    }
    function vibrate() {
        try {
            global.navigator.vibrate && global.navigator.vibrate(55);
        } catch (_) {}
    }

    function notify(msg, type) {
        if (global.notificationManager && global.notificationManager.show)
            global.notificationManager.show(msg, type || 'info');
        else if (type === 'error') console.warn('[Web2BarcodeScanner]', msg);
    }

    // ── Controller ───────────────────────────────────────────────────
    function createScanner(rootEl, userOpts) {
        const opts = Object.assign(
            {
                formats: DEFAULT_FORMATS,
                continuous: true,
                dedupeMs: 1500,
                hint: 'Đưa mã vạch / QR vào khung',
                onScan: null,
            },
            userOpts || {}
        );
        const listeners = { ready: [], scan: [], error: [], close: [] };
        let stream = null,
            detector = null,
            raf = 0,
            running = false,
            destroyed = false;
        let lastDetect = 0,
            lastCode = '',
            lastTime = 0,
            count = 0,
            track = null;

        ensureStyles();
        rootEl.classList.add('w2bc');
        rootEl.innerHTML = `
<div class="w2bc-stage">
  <video class="w2bc-video" playsinline autoplay muted></video>
  <div class="w2bc-scrim"></div>
  <div class="w2bc-frame"><span class="w2bc-corner"></span><div class="w2bc-line"></div></div>
  <div class="w2bc-hint">${opts.hint}</div>
  <div class="w2bc-last"><span class="w2bc-code"></span><span class="w2bc-cnt"></span></div>
  <div class="w2bc-loading"><div class="w2bc-spin"></div><span>Đang mở camera…</span></div>
</div>`;
        const video = rootEl.querySelector('.w2bc-video');
        const frame = rootEl.querySelector('.w2bc-frame');
        const lastBox = rootEl.querySelector('.w2bc-last');
        const lastCodeEl = rootEl.querySelector('.w2bc-code');
        const lastCntEl = rootEl.querySelector('.w2bc-cnt');
        const loadingEl = rootEl.querySelector('.w2bc-loading');

        function emit(evt, a, b) {
            (listeners[evt] || []).forEach((fn) => {
                try {
                    fn(a, b);
                } catch (_) {}
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

        let _hitTimer = 0;
        function onHit(code, raw) {
            const now = global.performance ? global.performance.now() : Date.now();
            if (code === lastCode && now - lastTime < opts.dedupeMs) return; // dedupe
            lastCode = code;
            lastTime = now;
            count++;
            beep();
            vibrate();
            frame.classList.add('is-hit');
            clearTimeout(_hitTimer);
            _hitTimer = setTimeout(() => frame.classList.remove('is-hit'), 400);
            lastCodeEl.textContent = code;
            lastCntEl.textContent = count > 1 ? `×${count}` : '';
            lastBox.classList.add('show');
            emit('scan', code, raw);
            if (typeof opts.onScan === 'function') {
                try {
                    opts.onScan(code, raw);
                } catch (_) {}
            }
            if (!opts.continuous) close();
        }

        function loop() {
            if (!running || destroyed) return;
            raf = global.requestAnimationFrame(loop);
            if (video.readyState < 2 || !video.videoWidth) return;
            const now = global.performance ? global.performance.now() : Date.now();
            if (now - lastDetect < 120) return; // ~8fps
            lastDetect = now;
            detector
                .detect(video)
                .then((codes) => {
                    if (codes && codes.length) {
                        // mã gần tâm khung nhất
                        const c = codes[0];
                        if (c && c.rawValue) onHit(String(c.rawValue).trim(), c);
                    }
                })
                .catch(() => {});
        }

        async function start() {
            if (running || destroyed) return;
            loadingEl.hidden = false;
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
                loadingEl.hidden = true;
                notify(
                    e && e.name === 'NotAllowedError'
                        ? 'Bạn chưa cho phép dùng camera.'
                        : 'Không mở được camera.',
                    'error'
                );
                emit('error', e);
                return;
            }
            video.srcObject = stream;
            track = stream.getVideoTracks()[0];
            try {
                await video.play();
            } catch (_) {}
            try {
                const mod = await loadModule();
                detector = new mod.BarcodeDetector({ formats: opts.formats });
            } catch (e) {
                stopTracks();
                loadingEl.hidden = true;
                notify('Không tải được bộ giải mã (mạng/CDN).', 'error');
                emit('error', e);
                return;
            }
            if (destroyed) {
                stopTracks();
                return;
            }
            running = true;
            lastDetect = 0;
            loadingEl.hidden = true;
            emit('ready');
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
            track = null;
        }
        function stop() {
            running = false;
            if (raf) {
                global.cancelAnimationFrame(raf);
                raf = 0;
            }
            stopTracks();
        }
        async function setTorch(onState) {
            if (!track) return false;
            try {
                const caps = track.getCapabilities ? track.getCapabilities() : {};
                if (!caps || !('torch' in caps)) return false;
                await track.applyConstraints({ advanced: [{ torch: !!onState }] });
                return true;
            } catch (_) {
                return false;
            }
        }
        function destroy() {
            destroyed = true;
            stop();
            try {
                rootEl.innerHTML = '';
                rootEl.classList.remove('w2bc');
            } catch (_) {}
        }
        function close() {
            emit('close');
            destroy();
        }

        const ctrl = {
            el: rootEl,
            video,
            start,
            stop,
            setTorch,
            destroy,
            close,
            on,
            off,
            getCount: () => count,
        };
        return ctrl;
    }

    function resolveTarget(t) {
        if (!t) return null;
        if (typeof t === 'string') return doc.querySelector(t);
        if (t.nodeType === 1) return t;
        return null;
    }

    function mount(target, opts) {
        const el = resolveTarget(target);
        if (!el) {
            console.warn('[Web2BarcodeScanner] mount: target không tồn tại', target);
            return null;
        }
        const ctrl = createScanner(el, opts);
        ctrl.start();
        return ctrl;
    }

    // ── open(): overlay toàn màn hình + nút đèn flash + đóng ──────────
    function open(opts) {
        opts = opts || {};
        ensureStyles();
        const root = doc.createElement('div');
        root.className = 'w2bc-root';
        root.innerHTML = `
<div class="w2bc-bar">
  <button type="button" class="w2bc-iconbtn w2bc-close" aria-label="Đóng"><i data-lucide="x"></i></button>
  <span class="w2bc-title">${opts.title || 'Quét mã bằng camera'}</span>
  <button type="button" class="w2bc-iconbtn w2bc-torch" aria-label="Đèn flash"><i data-lucide="zap"></i></button>
</div>
<div class="w2bc-body"><div class="w2bc-host"></div></div>`;
        doc.body.appendChild(root);
        if (global.lucide)
            try {
                global.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}
        const host = root.querySelector('.w2bc-host');
        const torchBtn = root.querySelector('.w2bc-torch');
        let torchOn = false;
        const ctrl = createScanner(host, opts);
        const cleanup = () => {
            try {
                ctrl.destroy();
            } catch (_) {}
            root.remove();
            doc.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup();
        };
        root.querySelector('.w2bc-close').addEventListener('click', cleanup);
        torchBtn.addEventListener('click', async () => {
            const ok = await ctrl.setTorch(!torchOn);
            if (!ok) {
                notify('Máy không hỗ trợ đèn flash từ trình duyệt.', 'info');
                return;
            }
            torchOn = !torchOn;
            torchBtn.classList.toggle('is-on', torchOn);
        });
        ctrl.on('close', cleanup);
        doc.addEventListener('keydown', onKey);
        ctrl.start();
        const api = { ...ctrl, close: cleanup };
        return api;
    }

    global.Web2BarcodeScanner = { version: VERSION, open, mount, _createScanner: createScanner };
})(typeof window !== 'undefined' ? window : this);
