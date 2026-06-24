// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2BgScene — XÓA NỀN + ĐỔI NỀN ảnh, MIỄN PHÍ, on-device. Dùng chung.
// Cutout in-browser bằng transformers.js (BiRefNet_lite → fallback RMBG-1.4 — audit
// 2026-06-24: BiRefNet cạnh/tóc nét hơn). License kệ (Web 2.0 nội bộ). Rồi ghép chủ
// thể lên nền MỚI: trong suốt / màu / ảnh tải lên / nền SINH bằng Pollinations free.
//
// API:
//   Web2BgScene.open(srcDataUrl) → Promise<dataURL | null>   (modal đầy đủ — dùng ở tool grid)
//   Web2BgScene.cutout(input, {prefer}) → {dataUrl, engine}
//   Web2BgScene.composite(cutoutDataUrl, bg, opts) → dataURL
//   Web2BgScene.aiBackgroundUrl(prompt, w, h) → URL Pollinations free
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2BgScene) return;

    const TF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
    // Thử lần lượt (load + INFERENCE) — RMBG-1.4 proven nhất với pipeline background-removal
    // trong WASM; modnet fallback. (BiRefNet đẹp hơn nhưng inference WASM hay ném lỗi → bỏ.)
    const MODELS = ['briaai/RMBG-1.4', 'Xenova/modnet'];

    function _loadImg(src) {
        return new Promise((res, rej) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => res(im);
            im.onerror = () => rej(new Error('ảnh lỗi'));
            im.src = src;
        });
    }
    async function _toDataUrl(input) {
        if (typeof input === 'string') {
            if (/^data:/.test(input)) return input;
            return _blobToDataUrl(await (await fetch(input)).blob());
        }
        if (input instanceof Blob) return _blobToDataUrl(input);
        throw new Error('input phải là File/Blob/dataURL/url');
    }
    function _blobToDataUrl(b) {
        return new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = () => rej(new Error('đọc ảnh lỗi'));
            fr.readAsDataURL(b);
        });
    }

    // ───────── cutout in-browser (transformers.js) ─────────
    // Cache pipe của model ĐÃ chạy được (load + inference OK) → lần sau nhanh.
    let _pipe = null,
        _modelUsed = '';
    async function _runBrowserCutout(dataUrl, onProgress) {
        const { pipeline } = await import(/* @vite-ignore */ `${TF_CDN}/+esm`);
        // Đã có pipe chạy được → dùng luôn.
        if (_pipe) {
            const out = await _pipe(dataUrl);
            const raw = Array.isArray(out) ? out[0] : out;
            if (raw) return { raw, model: _modelUsed };
        }
        // Thử từng model: LOAD + INFERENCE trong cùng try → lỗi inference (WASM) cũng fallback.
        let lastErr;
        for (const m of MODELS) {
            try {
                const pipe = await pipeline('background-removal', m, {
                    progress_callback: onProgress || undefined,
                });
                const out = await pipe(dataUrl);
                const raw = Array.isArray(out) ? out[0] : out;
                if (!raw) throw new Error('không có kết quả');
                _pipe = pipe;
                _modelUsed = m;
                return { raw, model: m };
            } catch (e) {
                lastErr = e;
            }
        }
        throw new Error(
            'Tách nền on-device lỗi (' + ((lastErr && lastErr.message) || String(lastErr)) + ')'
        );
    }
    async function _rawToDataUrl(raw) {
        const w = raw.width,
            h = raw.height,
            ch = raw.channels || 4;
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext('2d');
        const id = ctx.createImageData(w, h);
        const src = raw.data;
        if (ch === 4) id.data.set(src);
        else
            for (let i = 0, j = 0; i < w * h; i++) {
                id.data[j++] = src[i * ch] || 0;
                id.data[j++] = src[i * ch + 1] || 0;
                id.data[j++] = src[i * ch + 2] || 0;
                id.data[j++] = ch >= 4 ? src[i * ch + 3] : 255;
            }
        ctx.putImageData(id, 0, 0);
        return cv.toDataURL('image/png');
    }
    async function cutout(input, opts) {
        opts = opts || {};
        const dataUrl = await _toDataUrl(input);
        // server rembg (BiRefNet) nếu có máy + ưu tiên
        if ((opts.prefer === 'server' || opts.prefer === 'auto') && global.Web2BgRemover) {
            try {
                const servers = await global.Web2BgRemover.listServers(3500);
                if (servers && servers.length) {
                    const url = await global.Web2BgRemover.removeBgAuto(dataUrl, {
                        timeoutMs: 60000,
                    });
                    return { dataUrl: url, engine: 'máy shop (rembg/BiRefNet)' };
                }
            } catch {}
            if (opts.prefer === 'server') throw new Error('Không có máy tách nền online');
        }
        const { raw, model } = await _runBrowserCutout(dataUrl, opts.onProgress);
        return {
            dataUrl: await _rawToDataUrl(raw),
            engine: 'on-device (' + (model.split('/')[1] || model) + ')',
        };
    }

    function aiBackgroundUrl(prompt, width, height) {
        const w = Math.min(1536, Math.max(256, Number(width) || 1024));
        const h = Math.min(1536, Math.max(256, Number(height) || 1024));
        const p = encodeURIComponent(String(prompt || 'phông nền studio tối giản').slice(0, 400));
        const seed = (String(prompt).length * 7 + w + h) % 100000;
        return `https://image.pollinations.ai/prompt/${p}?width=${w}&height=${h}&model=flux&seed=${seed}&nologo=true`;
    }

    async function composite(cutoutDataUrl, bg, opts) {
        opts = opts || {};
        const fg = await _loadImg(cutoutDataUrl);
        const W = opts.width || fg.naturalWidth,
            H = opts.height || fg.naturalHeight;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d');
        if (bg && bg.type === 'image' && bg.src) {
            const b = await _loadImg(await _toDataUrl(bg.src));
            const s = Math.max(W / b.naturalWidth, H / b.naturalHeight);
            const bw = b.naturalWidth * s,
                bh = b.naturalHeight * s;
            ctx.drawImage(b, (W - bw) / 2, (H - bh) / 2, bw, bh);
        } else if (bg && bg.type === 'color') {
            ctx.fillStyle = bg.color || '#ffffff';
            ctx.fillRect(0, 0, W, H);
        }
        ctx.drawImage(fg, 0, 0, W, H);
        return cv.toDataURL('image/png');
    }

    // ───────── modal open() — tool grid dùng ─────────
    let _css = false;
    function _injectCss() {
        if (_css) return;
        _css = true;
        const s = document.createElement('style');
        s.textContent = `
.w2bs-back{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:14px}
.w2bs-modal{background:#fff;border-radius:16px;width:min(860px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.w2bs-head{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid #eef2f5}
.w2bs-head b{flex:1;font-size:1rem;color:#0f172a}
.w2bs-x{border:none;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;color:#475569}
.w2bs-body{display:flex;gap:14px;padding:16px;overflow:auto;flex-wrap:wrap}
.w2bs-prev{flex:1;min-width:280px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#eef2f5 0% 25%,#fff 0% 50%) 50%/18px 18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;min-height:260px}
.w2bs-prev img{max-width:100%;max-height:48vh;display:block}
.w2bs-ctrls{width:280px;display:flex;flex-direction:column;gap:12px}
.w2bs-status{font-size:.82rem;color:#64748b}
.w2bs-lbl{font-size:.74rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.03em}
.w2bs-modes{display:flex;gap:6px;flex-wrap:wrap}
.w2bs-chip{border:1px solid #dbe2ea;background:#fff;border-radius:999px;padding:6px 12px;font-size:.78rem;cursor:pointer;color:#334155}
.w2bs-chip.sel{background:#eef2ff;border-color:#6366f1;color:#4f46e5;font-weight:600}
.w2bs-colors{display:flex;gap:7px;flex-wrap:wrap}
.w2bs-sw{width:30px;height:30px;border-radius:8px;border:2px solid #e2e8f0;cursor:pointer}
.w2bs-sw.sel{border-color:#6366f1;box-shadow:0 0 0 2px #c7d2fe}
.w2bs-ai{display:flex;gap:7px}
.w2bs-ai input{flex:1;height:38px;border:1px solid #d6dee2;border-radius:9px;padding:0 11px;font:inherit;font-size:.85rem}
.w2bs-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #eef2f5}
.w2bs-btn{border:1px solid #d6dee2;background:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;color:#334155}
.w2bs-btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
.w2bs-btn:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:640px){.w2bs-ctrls{width:100%}}`;
        document.head.appendChild(s);
    }

    async function open(srcDataUrl) {
        _injectCss();
        const COLORS = [
            '#ffffff',
            '#000000',
            '#f1f5f9',
            '#fde68a',
            '#fecaca',
            '#bbf7d0',
            '#bfdbfe',
            '#e9d5ff',
        ];
        return new Promise((resolve) => {
            const st = {
                cut: null,
                mode: 'transparent',
                color: '#ffffff',
                bgImg: null,
                result: srcDataUrl,
            };
            const back = document.createElement('div');
            back.className = 'w2bs-back';
            back.innerHTML = `
              <div class="w2bs-modal" role="dialog" aria-modal="true">
                <div class="w2bs-head"><b>✂️ Xóa nền / Đổi nền</b><button class="w2bs-x" data-x>×</button></div>
                <div class="w2bs-body">
                  <div class="w2bs-prev"><img data-prev src="${srcDataUrl}"></div>
                  <div class="w2bs-ctrls">
                    <button class="w2bs-btn primary" data-cut>✂️ Xóa nền (lần đầu tải model hơi lâu)</button>
                    <div class="w2bs-status" data-status></div>
                    <div data-opts hidden>
                      <div class="w2bs-lbl">Nền mới</div>
                      <div class="w2bs-modes">
                        <button class="w2bs-chip sel" data-mode="transparent">Trong suốt</button>
                        <button class="w2bs-chip" data-mode="color">Màu</button>
                        <button class="w2bs-chip" data-mode="ai">Sinh AI free</button>
                        <button class="w2bs-chip" data-mode="upload">Ảnh tải lên</button>
                      </div>
                      <div class="w2bs-colors" data-colors hidden style="margin-top:10px">${COLORS.map((c) => `<button class="w2bs-sw" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
                      <div class="w2bs-ai" data-ai hidden style="margin-top:10px"><input placeholder="vd: bãi biển hoàng hôn, studio nền trắng…"><button class="w2bs-btn" data-aigen>Sinh</button></div>
                      <div data-up hidden style="margin-top:10px"><input type="file" accept="image/*" data-upfile></div>
                    </div>
                  </div>
                </div>
                <div class="w2bs-foot"><button class="w2bs-btn" data-cancel>Hủy</button><button class="w2bs-btn primary" data-apply disabled>Áp dụng</button></div>
              </div>`;
            document.body.appendChild(back);
            const q = (s) => back.querySelector(s);
            const prev = q('[data-prev]');

            async function paint() {
                if (!st.cut) return;
                let out;
                if (st.mode === 'transparent') out = st.cut;
                else if (st.mode === 'color')
                    out = await composite(st.cut, { type: 'color', color: st.color });
                else if ((st.mode === 'ai' || st.mode === 'upload') && st.bgImg)
                    out = await composite(st.cut, { type: 'image', src: st.bgImg });
                else out = st.cut;
                st.result = out;
                prev.src = out;
                q('[data-apply]').disabled = false;
            }

            q('[data-cut]').addEventListener('click', async () => {
                q('[data-cut]').disabled = true;
                q('[data-status]').textContent = '⏳ Đang tải model & xóa nền…';
                try {
                    const r = await cutout(srcDataUrl, { prefer: 'auto' });
                    st.cut = r.dataUrl;
                    q('[data-status]').textContent = '✓ ' + r.engine;
                    q('[data-opts]').hidden = false;
                    await paint();
                } catch (e) {
                    q('[data-status]').textContent = '⚠️ ' + e.message;
                    q('[data-cut]').disabled = false;
                }
            });
            back.querySelectorAll('[data-mode]').forEach((b) =>
                b.addEventListener('click', () => {
                    st.mode = b.dataset.mode;
                    back.querySelectorAll('[data-mode]').forEach((x) =>
                        x.classList.toggle('sel', x === b)
                    );
                    q('[data-colors]').hidden = st.mode !== 'color';
                    q('[data-ai]').hidden = st.mode !== 'ai';
                    q('[data-up]').hidden = st.mode !== 'upload';
                    if (st.mode !== 'ai' && st.mode !== 'upload') paint();
                })
            );
            back.querySelectorAll('[data-color]').forEach((b) =>
                b.addEventListener('click', () => {
                    st.color = b.dataset.color;
                    back.querySelectorAll('[data-color]').forEach((x) =>
                        x.classList.toggle('sel', x === b)
                    );
                    paint();
                })
            );
            q('[data-aigen]').addEventListener('click', async () => {
                if (!st.cut) return;
                const fg = await _loadImg(st.cut);
                st.bgImg = aiBackgroundUrl(
                    q('[data-ai] input').value.trim(),
                    fg.naturalWidth,
                    fg.naturalHeight
                );
                q('[data-aigen]').textContent = '⏳';
                await paint();
                q('[data-aigen]').textContent = 'Sinh';
            });
            q('[data-upfile]').addEventListener('change', async () => {
                const f = q('[data-upfile]').files?.[0];
                if (f) {
                    st.bgImg = URL.createObjectURL(f);
                    await paint();
                }
            });

            function done(v) {
                back.remove();
                resolve(v);
            }
            q('[data-x]').addEventListener('click', () => done(null));
            q('[data-cancel]').addEventListener('click', () => done(null));
            back.addEventListener('click', (e) => {
                if (e.target === back) done(null);
            });
            q('[data-apply]').addEventListener('click', () => done(st.result));
        });
    }

    global.Web2BgScene = { open, cutout, composite, aiBackgroundUrl };
})(window);
