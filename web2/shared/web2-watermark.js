// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2Watermark — THÊM LOGO / WATERMARK lên ảnh (đóng dấu thương hiệu). Dùng chung.
// Bổ sung cho bộ sửa ảnh đã có (photo-studio=xóa/đổi nền, Web2LogoEraser=xóa logo).
// Ghép logo theo 9 vị trí / kích thước / độ mờ, hoặc LẶP KHẮP ảnh (watermark chìm).
// 100% on-device canvas, $0. KHÔNG dùng AI trả phí.
//
// API: Web2Watermark.open(srcDataUrl) → Promise<dataURL | null>  (null nếu Hủy)
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Watermark) return;

    const ANCHORS = [
        ['tl', '↖'],
        ['tc', '↑'],
        ['tr', '↗'],
        ['ml', '←'],
        ['mc', '•'],
        ['mr', '→'],
        ['bl', '↙'],
        ['bc', '↓'],
        ['br', '↘'],
    ];

    function _loadImg(src) {
        return new Promise((res, rej) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => res(im);
            im.onerror = () => rej(new Error('ảnh lỗi'));
            im.src = src;
        });
    }

    // Vẽ logo/watermark lên ảnh nền → canvas (full-res).
    function _compose(base, logo, o) {
        const W = base.naturalWidth,
            H = base.naturalHeight;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.drawImage(base, 0, 0);
        if (!logo) return cv;
        const lw = Math.min(W, H) * (o.size / 100);
        const lh = (logo.naturalHeight / logo.naturalWidth) * lw;
        ctx.globalAlpha = o.opacity / 100;
        if (o.tile) {
            const gapX = lw * 1.9,
                gapY = lh * 2.3;
            for (let y = -lh; y < H + lh; y += gapY) {
                for (let x = -lw; x < W + lw; x += gapX) {
                    ctx.save();
                    ctx.translate(x + lw / 2, y + lh / 2);
                    ctx.rotate(-Math.PI / 9);
                    ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
                    ctx.restore();
                }
            }
        } else {
            const m = Math.min(W, H) * 0.03;
            const a = o.anchor;
            let x = m,
                y = m;
            if (a[1] === 'c') x = (W - lw) / 2;
            if (a[1] === 'r') x = W - lw - m;
            if (a[0] === 'm') y = (H - lh) / 2;
            if (a[0] === 'b') y = H - lh - m;
            ctx.drawImage(logo, x, y, lw, lh);
        }
        ctx.globalAlpha = 1;
        return cv;
    }

    let _cssDone = false;
    function _css() {
        if (_cssDone) return;
        _cssDone = true;
        const s = document.createElement('style');
        s.textContent = `
.w2wm-back{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:14px}
.w2wm-modal{background:#fff;border-radius:16px;width:min(840px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.w2wm-head{display:flex;align-items:center;gap:8px;padding:13px 16px;border-bottom:1px solid #eef2f5}
.w2wm-head b{flex:1;font-size:1rem;color:#0f172a}
.w2wm-x{border:none;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;color:#475569}
.w2wm-body{display:flex;gap:14px;padding:16px;overflow:auto;flex-wrap:wrap}
.w2wm-preview{flex:1;min-width:280px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#eef2f5 0% 25%,#fff 0% 50%) 50%/18px 18px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;min-height:240px}
.w2wm-preview canvas{max-width:100%;max-height:46vh;display:block}
.w2wm-ctrls{width:280px;display:flex;flex-direction:column;gap:12px}
.w2wm-up{border:1px dashed #cbd5e1;border-radius:10px;padding:12px;text-align:center;cursor:pointer;font-size:.84rem;color:#475569;background:#f8fafc}
.w2wm-up:hover{border-color:#6366f1}
.w2wm-lbl{font-size:.74rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.03em}
.w2wm-anchors{display:grid;grid-template-columns:repeat(3,38px);gap:5px}
.w2wm-an{width:38px;height:38px;border:1px solid #d6dee2;border-radius:8px;background:#fff;cursor:pointer;font-size:15px;color:#64748b}
.w2wm-an.sel{background:#6366f1;border-color:#6366f1;color:#fff}
.w2wm-slider{display:flex;align-items:center;gap:8px;font-size:.82rem;color:#475569}
.w2wm-slider input{flex:1}
.w2wm-check{display:flex;align-items:center;gap:7px;font-size:.84rem;color:#334155;cursor:pointer}
.w2wm-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid #eef2f5}
.w2wm-btn{border:1px solid #d6dee2;background:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;color:#334155}
.w2wm-btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
.w2wm-btn.primary:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:640px){.w2wm-ctrls{width:100%}}`;
        document.head.appendChild(s);
    }

    async function open(srcDataUrl) {
        _css();
        const base = await _loadImg(srcDataUrl);
        const state = { logo: null, size: 22, opacity: 100, anchor: 'br', tile: false };

        return new Promise((resolve) => {
            const back = document.createElement('div');
            back.className = 'w2wm-back';
            back.innerHTML = `
              <div class="w2wm-modal" role="dialog" aria-modal="true">
                <div class="w2wm-head"><b>🏷️ Thêm logo / watermark</b><button class="w2wm-x" data-x>×</button></div>
                <div class="w2wm-body">
                  <div class="w2wm-preview"><canvas data-cv></canvas></div>
                  <div class="w2wm-ctrls">
                    <label class="w2wm-up" data-up>📤 Chọn ảnh logo / dấu (PNG nền trong suốt đẹp nhất)
                      <input type="file" accept="image/*" hidden data-file></label>
                    <div><div class="w2wm-lbl">Vị trí</div><div class="w2wm-anchors" data-anchors></div></div>
                    <label class="w2wm-slider">Cỡ <input type="range" min="5" max="60" value="22" data-size><span data-sizev>22%</span></label>
                    <label class="w2wm-slider">Mờ <input type="range" min="10" max="100" value="100" data-op><span data-opv>100%</span></label>
                    <label class="w2wm-check"><input type="checkbox" data-tile> Lặp khắp ảnh (watermark chìm)</label>
                  </div>
                </div>
                <div class="w2wm-foot">
                  <button class="w2wm-btn" data-cancel>Hủy</button>
                  <button class="w2wm-btn primary" data-apply disabled>Áp dụng</button>
                </div>
              </div>`;
            document.body.appendChild(back);
            const q = (s) => back.querySelector(s);
            const cv = q('[data-cv]');
            const ctx = cv.getContext('2d');

            // preview scaled
            function redraw() {
                const full = _compose(base, state.logo, state);
                const maxW = 720,
                    sc = Math.min(1, maxW / full.width);
                cv.width = Math.round(full.width * sc);
                cv.height = Math.round(full.height * sc);
                ctx.drawImage(full, 0, 0, cv.width, cv.height);
            }
            redraw();

            q('[data-anchors]').innerHTML = ANCHORS.map(
                ([k, g]) =>
                    `<button class="w2wm-an ${k === state.anchor ? 'sel' : ''}" data-an="${k}">${g}</button>`
            ).join('');
            q('[data-anchors]')
                .querySelectorAll('[data-an]')
                .forEach((b) =>
                    b.addEventListener('click', () => {
                        state.anchor = b.dataset.an;
                        q('[data-anchors]')
                            .querySelectorAll('.w2wm-an')
                            .forEach((x) => x.classList.toggle('sel', x === b));
                        redraw();
                    })
                );
            q('[data-up]').addEventListener('click', () => q('[data-file]').click());
            q('[data-file]').addEventListener('change', async () => {
                const f = q('[data-file]').files?.[0];
                if (!f) return;
                const url = await new Promise((r) => {
                    const fr = new FileReader();
                    fr.onload = () => r(fr.result);
                    fr.readAsDataURL(f);
                });
                state.logo = await _loadImg(url);
                q('[data-apply]').disabled = false;
                redraw();
            });
            q('[data-size]').addEventListener('input', (e) => {
                state.size = +e.target.value;
                q('[data-sizev]').textContent = state.size + '%';
                redraw();
            });
            q('[data-op]').addEventListener('input', (e) => {
                state.opacity = +e.target.value;
                q('[data-opv]').textContent = state.opacity + '%';
                redraw();
            });
            q('[data-tile]').addEventListener('change', (e) => {
                state.tile = e.target.checked;
                redraw();
            });

            function done(val) {
                back.remove();
                resolve(val);
            }
            q('[data-x]').addEventListener('click', () => done(null));
            q('[data-cancel]').addEventListener('click', () => done(null));
            back.addEventListener('click', (e) => {
                if (e.target === back) done(null);
            });
            q('[data-apply]').addEventListener('click', () => {
                if (!state.logo) return;
                done(_compose(base, state.logo, state).toDataURL('image/png'));
            });
        });
    }

    global.Web2Watermark = { open };
})(window);
