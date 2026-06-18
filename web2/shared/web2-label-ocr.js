// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Web2LabelOcr: đọc chữ trên nhãn bằng camera on-device (tesseract.js), dùng chung mọi trang.
// =====================================================================
// Web2LabelOcr — ĐỌC CHỮ trên nhãn pack TỪ CAMERA, 100% on-device
// (tesseract.js WASM, KHÔNG gửi ảnh lên server). Theo report on-device
// camera reading: OCR KHÔNG streaming realtime được (model nặng) → kiểu
// "CHỤP 1 frame ROI rồi đọc"; chữ IN đọc tốt, chữ TAY kém → LUÔN cho user
// sửa tay (gợi-ý + xác nhận), KHÔNG auto. Dùng chung cho TOÀN BỘ Web 2.0.
//
// Triết lý (giống Web2BarcodeScanner/Web2ProductCounter):
//   1. Lazy: chỉ tải tesseract.js (WASM + traineddata) khi user mở.
//   2. Self-contained: tự inject CSS overlay.
//   3. On-device: ngắm nhãn vào khung ROI → bấm "Chụp & đọc" → OCR.
//   4. Gợi-ý + sửa tay: hiện các dòng nhận được (chip bấm chọn) + ô sửa
//      → user xác nhận mới trả onResult. KHÔNG tự động.
//   5. Graceful: CDN/camera fail → notify, KHÔNG vỡ trang.
//
// API (window.Web2LabelOcr):
//   open(opts)  -> controller   // overlay toàn màn hình
//   version
//
// opts:
//   onResult(text)   callback khi user XÁC NHẬN 1 giá trị (đã sửa tay)
//   title            tiêu đề
//   hint             gợi ý dưới khung
//   lang='eng'       ngôn ngữ tesseract ('eng' cho mã ASCII; 'vie' nặng hơn)
//   whitelist        chuỗi ký tự cho phép (vd '0123456789ABC...-') siết nhiễu
//   continuous=false giữ overlay sau khi xác nhận (true = quét tiếp nhiều nhãn)
// =====================================================================

(function (global) {
    'use strict';
    if (global.Web2LabelOcr) return;
    const doc = global.document;
    if (!doc) return;

    const VERSION = '20260618a';
    const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

    // ── CSS ──────────────────────────────────────────────────────────
    let _styled = false;
    function ensureStyles() {
        if (_styled || doc.getElementById('w2ocr-styles')) {
            _styled = true;
            return;
        }
        const css = `
.w2ocr-root{position:fixed;inset:0;z-index:9100;display:flex;flex-direction:column;background:#05070d;color:#e6edf3;
  padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:w2ocr-fade .18s ease both}
@keyframes w2ocr-fade{from{opacity:0}to{opacity:1}}
.w2ocr-bar{flex:0 0 auto;display:flex;align-items:center;gap:6px;height:52px;padding:0 6px;background:#0b1018;border-bottom:1px solid rgba(255,255,255,.08)}
.w2ocr-title{flex:1 1 auto;text-align:center;font-size:1rem;font-weight:700}
.w2ocr-iconbtn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:none;border-radius:12px;background:transparent;color:#e6edf3;cursor:pointer}
.w2ocr-iconbtn:active{background:rgba(255,255,255,.08)}
.w2ocr-iconbtn i,.w2ocr-iconbtn svg{width:24px;height:24px}
.w2ocr-stage{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#05070d}
.w2ocr-video,.w2ocr-frozen{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#05070d}
.w2ocr-frozen[hidden]{display:none}
.w2ocr-roi{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:min(86vw,440px);aspect-ratio:2.4/1;
  border:2px solid var(--web2-primary,#0068ff);border-radius:12px;box-shadow:0 0 0 9999px rgba(4,7,13,.5);pointer-events:none}
.w2ocr-hint{position:absolute;left:0;right:0;bottom:16%;text-align:center;font-size:.86rem;color:#cdd9e6;text-shadow:0 1px 4px rgba(0,0,0,.6);padding:0 24px;pointer-events:none}
.w2ocr-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#cdd9e6;background:rgba(4,7,13,.6)}
.w2ocr-loading[hidden]{display:none!important}
.w2ocr-spin{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:var(--web2-primary,#0068ff);animation:w2ocr-spin .8s linear infinite}
@keyframes w2ocr-spin{to{transform:rotate(360deg)}}
.w2ocr-foot{flex:0 0 auto;padding:12px 14px calc(12px + env(safe-area-inset-bottom));background:#0b1018;border-top:1px solid rgba(255,255,255,.08)}
.w2ocr-btn{width:100%;min-height:54px;border:none;border-radius:16px;font-size:1rem;font-weight:700;color:#fff;background:var(--web2-primary,#0068ff);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.w2ocr-btn:active{transform:translateY(1px)}
.w2ocr-btn[disabled]{opacity:.5;cursor:not-allowed}
.w2ocr-btn.ghost{background:#1c2738;color:#e6edf3;outline:1px solid rgba(255,255,255,.12)}
.w2ocr-btn i,.w2ocr-btn svg{width:20px;height:20px}
.w2ocr-result{display:none;flex-direction:column;gap:10px}
.w2ocr-result.show{display:flex}
.w2ocr-chips{display:flex;flex-wrap:wrap;gap:7px;max-height:84px;overflow:auto}
.w2ocr-chip{border:none;border-radius:999px;padding:7px 13px;background:#16202c;color:#cdd9e6;font-size:.86rem;font-weight:600;cursor:pointer;white-space:nowrap}
.w2ocr-chip:active{background:#22303f}
.w2ocr-editrow{display:flex;gap:8px}
.w2ocr-edit{flex:1 1 auto;min-width:0;min-height:50px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:#0e1620;color:#fff;font-size:1.05rem;font-weight:700;padding:0 14px;outline:none}
.w2ocr-edit:focus{border-color:var(--web2-primary,#0068ff)}
.w2ocr-actions{display:flex;gap:8px}
.w2ocr-actions .w2ocr-btn{min-height:50px}
.w2ocr-note{font-size:.76rem;color:#8aa0b6;text-align:center;margin:2px 0 0}
.w2ocr-modes{display:flex;gap:8px;margin-bottom:10px}
.w2ocr-mode{flex:1;min-height:42px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#0e1620;color:#9fb3c8;font-size:.86rem;font-weight:700;cursor:pointer}
.w2ocr-mode.is-active{background:var(--web2-primary,#0068ff);color:#fff;border-color:transparent}
@media (prefers-reduced-motion:reduce){.w2ocr-spin{animation:none}}`;
        const s = doc.createElement('style');
        s.id = 'w2ocr-styles';
        s.textContent = css;
        (doc.head || doc.documentElement).appendChild(s);
        _styled = true;
    }

    function notify(m, t) {
        if (global.notificationManager && global.notificationManager.show)
            global.notificationManager.show(m, t || 'info');
        else if (t === 'error') console.warn('[Web2LabelOcr]', m);
    }

    // ── Lazy-load tesseract.js (UMD) ─────────────────────────────────
    let _tessP = null;
    function loadTesseract() {
        if (global.Tesseract) return Promise.resolve(global.Tesseract);
        if (_tessP) return _tessP;
        _tessP = new Promise((res, rej) => {
            const s = doc.createElement('script');
            s.src = TESSERACT_URL;
            s.onload = () =>
                global.Tesseract ? res(global.Tesseract) : rej(new Error('Tesseract missing'));
            s.onerror = () => {
                _tessP = null;
                rej(new Error('CDN load fail'));
            };
            (doc.head || doc.documentElement).appendChild(s);
        });
        return _tessP;
    }
    // ── Lazy-load transformers.js + TrOCR (chữ TAY) ──────────────────
    // CHỮ TAY: chính xác THẤP (model IAM tiếng Anh; số/mã ASCII đỡ hơn, chữ
    // tiếng Việt có dấu kém) + model nặng → chỉ tải khi user chọn "Chữ tay".
    const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
    const TROCR_MODEL = 'Xenova/trocr-base-handwritten';
    let _trocrP = null;
    function getTrocr() {
        if (_trocrP) return _trocrP;
        _trocrP = (async () => {
            const mod = await import(/* @vite-ignore */ TRANSFORMERS_URL);
            return await mod.pipeline('image-to-text', TROCR_MODEL);
        })();
        _trocrP.catch(() => {
            _trocrP = null;
        });
        return _trocrP;
    }
    async function recognizeHandwritten(imgUrl) {
        const pipe = await getTrocr();
        const out = await pipe(imgUrl);
        const text = Array.isArray(out)
            ? out[0] && out[0].generated_text
            : out && out.generated_text;
        return (text || '').trim();
    }

    // worker cache theo lang (chữ IN, tesseract)
    const _workers = new Map();
    async function getWorker(lang) {
        if (_workers.has(lang)) return _workers.get(lang);
        const p = (async () => {
            const T = await loadTesseract();
            return await T.createWorker(lang); // v5: tự tải core+lang từ CDN
        })();
        _workers.set(lang, p);
        p.catch(() => _workers.delete(lang));
        return p;
    }

    // ── Crop ROI từ video + tiền xử lý (grayscale + tăng tương phản) ──
    function captureRoi(video, roiRect) {
        const vw = video.videoWidth,
            vh = video.videoHeight;
        // map ROI (theo tỉ lệ object-fit:cover) → vùng pixel trong video gốc
        const dispW = video.clientWidth,
            dispH = video.clientHeight;
        const scale = Math.max(dispW / vw, dispH / vh);
        const cropDispW = roiRect.w,
            cropDispH = roiRect.h;
        const sw = cropDispW / scale,
            sh = cropDispH / scale;
        const cx = vw / 2,
            cy = vh * 0.42; // ROI tâm ~42% như CSS
        const sx = cx - sw / 2,
            sy = cy - sh / 2;
        const out = doc.createElement('canvas');
        const up = 2; // upscale giúp OCR nét hơn
        out.width = Math.round(sw * up);
        out.height = Math.round(sh * up);
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, out.width, out.height);
        // grayscale + contrast nhẹ
        try {
            const img = ctx.getImageData(0, 0, out.width, out.height);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                g = (g - 128) * 1.25 + 128; // contrast
                g = g < 0 ? 0 : g > 255 ? 255 : g;
                d[i] = d[i + 1] = d[i + 2] = g;
            }
            ctx.putImageData(img, 0, 0);
        } catch (_) {}
        return out;
    }

    function open(opts) {
        opts = Object.assign(
            {
                lang: 'eng',
                continuous: false,
                hint: 'Ngắm dòng chữ trên nhãn vào khung rồi bấm Chụp',
            },
            opts || {}
        );
        ensureStyles();
        const root = doc.createElement('div');
        root.className = 'w2ocr-root';
        root.innerHTML = `
<div class="w2ocr-bar">
  <button type="button" class="w2ocr-iconbtn w2ocr-close" aria-label="Đóng"><i data-lucide="x"></i></button>
  <span class="w2ocr-title">${opts.title || 'Đọc nhãn'}</span>
  <span style="width:42px"></span>
</div>
<div class="w2ocr-stage">
  <video class="w2ocr-video" playsinline autoplay muted></video>
  <img class="w2ocr-frozen" hidden alt="" />
  <div class="w2ocr-roi"></div>
  <div class="w2ocr-hint">${opts.hint}</div>
  <div class="w2ocr-loading" hidden><div class="w2ocr-spin"></div><span class="w2ocr-loadtext">Đang đọc…</span></div>
</div>
<div class="w2ocr-foot">
  <div class="w2ocr-modes">
    <button type="button" class="w2ocr-mode" data-mode="printed">Chữ in (nhanh)</button>
    <button type="button" class="w2ocr-mode" data-mode="handwritten">Chữ tay</button>
  </div>
  <button type="button" class="w2ocr-btn w2ocr-shoot"><i data-lucide="scan-text"></i> Chụp &amp; đọc</button>
  <div class="w2ocr-result">
    <div class="w2ocr-chips"></div>
    <div class="w2ocr-editrow"><input class="w2ocr-edit" type="text" inputmode="text" placeholder="Sửa lại cho đúng…" /></div>
    <div class="w2ocr-actions">
      <button type="button" class="w2ocr-btn ghost w2ocr-retry"><i data-lucide="rotate-ccw"></i> Chụp lại</button>
      <button type="button" class="w2ocr-btn w2ocr-use"><i data-lucide="check"></i> Dùng</button>
    </div>
    <p class="w2ocr-note">OCR chỉ là gợi ý — sửa lại cho đúng trước khi dùng.</p>
  </div>
</div>`;
        doc.body.appendChild(root);
        if (global.lucide)
            try {
                global.lucide.createIcons({ nameAttr: 'data-lucide' });
            } catch (_) {}

        const video = root.querySelector('.w2ocr-video');
        const frozen = root.querySelector('.w2ocr-frozen');
        const roiEl = root.querySelector('.w2ocr-roi');
        const loading = root.querySelector('.w2ocr-loading');
        const loadText = root.querySelector('.w2ocr-loadtext');
        const shootBtn = root.querySelector('.w2ocr-shoot');
        const resultBox = root.querySelector('.w2ocr-result');
        const chipsBox = root.querySelector('.w2ocr-chips');
        const editEl = root.querySelector('.w2ocr-edit');
        const useBtn = root.querySelector('.w2ocr-use');
        const retryBtn = root.querySelector('.w2ocr-retry');
        let stream = null,
            destroyed = false;

        // ── Chế độ đọc: chữ IN (tesseract, mặc định) | chữ TAY (TrOCR) ──
        let currentMode = opts.mode === 'handwritten' ? 'handwritten' : 'printed';
        const modeBtns = root.querySelectorAll('.w2ocr-mode');
        modeBtns.forEach((b) => {
            if (b.dataset.mode === currentMode) b.classList.add('is-active');
            b.addEventListener('click', () => {
                currentMode = b.dataset.mode;
                modeBtns.forEach((x) => x.classList.toggle('is-active', x === b));
            });
        });

        function setLoading(on, text) {
            loading.hidden = !on;
            if (text) loadText.textContent = text;
        }
        function showCamera() {
            resultBox.classList.remove('show');
            shootBtn.style.display = '';
            frozen.hidden = true;
            roiEl.style.display = '';
            root.querySelector('.w2ocr-hint').style.display = '';
        }
        function showResult(lines, frozenUrl) {
            frozen.src = frozenUrl;
            frozen.hidden = false;
            roiEl.style.display = 'none';
            root.querySelector('.w2ocr-hint').style.display = 'none';
            shootBtn.style.display = 'none';
            resultBox.classList.add('show');
            chipsBox.innerHTML = '';
            (lines || []).slice(0, 8).forEach((t) => {
                const b = doc.createElement('button');
                b.type = 'button';
                b.className = 'w2ocr-chip';
                b.textContent = t;
                b.addEventListener('click', () => {
                    editEl.value = t;
                    editEl.focus();
                });
                chipsBox.appendChild(b);
            });
            editEl.value = (lines && lines[0]) || '';
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
            const roiRect = roiEl.getBoundingClientRect();
            const canvas = captureRoi(video, { w: roiRect.width, h: roiRect.height });
            const frozenUrl = canvas.toDataURL('image/png');

            // CHỮ TAY → TrOCR (transformers.js). Nặng + chính xác thấp → chỉ khi chọn.
            if (currentMode === 'handwritten') {
                setLoading(true, 'Đang tải bộ đọc chữ tay (lần đầu hơi lâu)…');
                let text = '';
                try {
                    text = await recognizeHandwritten(frozenUrl);
                } catch (e) {
                    setLoading(false);
                    notify('Không tải/đọc được chữ tay (mạng/CDN).', 'error');
                    return;
                }
                setLoading(false);
                if (destroyed) return;
                showResult(text ? [text] : [], frozenUrl);
                return;
            }

            // CHỮ IN → tesseract.js (mặc định)
            setLoading(true, 'Đang tải bộ đọc…');
            let worker;
            try {
                worker = await getWorker(opts.lang);
            } catch (e) {
                setLoading(false);
                notify('Không tải được bộ đọc OCR (mạng/CDN).', 'error');
                return;
            }
            if (destroyed) return;
            if (opts.whitelist) {
                try {
                    await worker.setParameters({ tessedit_char_whitelist: opts.whitelist });
                } catch (_) {}
            }
            setLoading(true, 'Đang đọc chữ…');
            let lines = [];
            try {
                const { data } = await worker.recognize(canvas);
                lines = (data.lines || []).map((l) => (l.text || '').trim()).filter(Boolean);
                if (!lines.length && data.text)
                    lines = data.text
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean);
            } catch (e) {
                setLoading(false);
                notify('Đọc nhãn thất bại, thử lại.', 'error');
                return;
            }
            setLoading(false);
            if (destroyed) return;
            showResult(lines, frozenUrl);
        }

        function use() {
            const val = (editEl.value || '').trim();
            if (!val) {
                editEl.focus();
                return;
            }
            if (typeof opts.onResult === 'function') {
                try {
                    opts.onResult(val);
                } catch (_) {}
            }
            if (opts.continuous) showCamera();
            else cleanup();
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
        root.querySelector('.w2ocr-close').addEventListener('click', cleanup);
        editEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.isComposing) use();
        });
        doc.addEventListener('keydown', onKey);
        start();
        return { close: cleanup, el: root };
    }

    global.Web2LabelOcr = { version: VERSION, open };
})(typeof window !== 'undefined' ? window : this);
