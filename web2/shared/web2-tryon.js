// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2Tryon — "GHÉP ĐỒ / THỬ ĐỒ" 1 NGUỒN DÙNG CHUNG (hình 2).
//
// Chọn 1 ảnh người + 1..5 ảnh quần áo → AI ghép (mặc đồ lên người) + prompt tuỳ
// chọn đổi phong cảnh/chi tiết. Engine FREE: Gemini Nano Banana (gemini-2.5-flash-image)
// — engine free DUY NHẤT nhận NHIỀU ảnh input. Backend /api/web2-ai/image.
//
// Tách hẳn khỏi orchestrator ai-hub → mount được vào BẤT KỲ container nào (widget ✨,
// trang sản phẩm…). Tự dùng Web2VideoStock (kho ảnh free) + AiPresets (mẫu phong cảnh)
// nếu có mặt; thiếu thì ẩn nút tương ứng (degrade mượt).
//
// API:  Web2Tryon.mount(container, opts) → { destroy() }
//   opts: { compact?:bool, onResult?(dataUrl) }
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2Tryon) return;

    const MAX_GARMENTS = 5;
    const MAX_DIM = 1280;

    function workerUrl() {
        return (
            global.WEB2_CONFIG?.WORKER_URL ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const API = () => workerUrl() + '/api/web2-ai';
    function authHeaders(json) {
        const h = json ? { 'Content-Type': 'application/json' } : {};
        let token = '';
        try {
            token =
                global.Web2Auth?.getStored?.()?.token ||
                JSON.parse(localStorage.getItem('web2_users_session') || '{}')?.token ||
                '';
        } catch (_) {}
        if (token) h['x-web2-token'] = token;
        return h;
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function toast(m, t) {
        try {
            global.notificationManager?.show?.(m, t || 'info');
        } catch (_) {}
    }

    // Nén ảnh client (resize ≤ MAX_DIM + JPEG) → payload nhỏ, gửi nhanh.
    function compressFile(file) {
        return new Promise((resolve, reject) => {
            const rd = new FileReader();
            rd.onerror = () => reject(new Error('Đọc file lỗi'));
            rd.onload = () => compressDataUrl(rd.result).then(resolve, reject);
            rd.readAsDataURL(file);
        });
    }
    function compressDataUrl(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Ảnh lỗi'));
            img.onload = () => {
                let { width: w, height: h } = img;
                if (w > MAX_DIM || h > MAX_DIM) {
                    const s = MAX_DIM / Math.max(w, h);
                    w = Math.round(w * s);
                    h = Math.round(h * s);
                }
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                cv.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(cv.toDataURL('image/jpeg', 0.85));
            };
            img.src = dataUrl;
        });
    }

    function buildPrompt(extra) {
        let p =
            'Take the person from the FIRST image and dress them in the clothing item(s) shown in the following image(s). ' +
            'Keep the person’s face, hairstyle, body shape, skin tone and pose unchanged. ' +
            'Make each garment fit the body naturally and realistically, correct proportions, realistic fabric folds and lighting. ' +
            'Replace the original outfit. Full-body, photorealistic, high quality professional fashion photo.';
        const ex = String(extra || '').trim();
        if (ex) p += ' Scene/details: ' + ex;
        return p;
    }

    function injectCss() {
        if (document.getElementById('web2-tryon-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-tryon-css';
        st.textContent = `
.w2t{display:grid;grid-template-columns:minmax(240px,330px) 1fr;gap:14px;padding:14px;height:100%;box-sizing:border-box;overflow:auto}
.w2t.compact{grid-template-columns:1fr;overflow:auto}
.w2t-controls{display:flex;flex-direction:column;gap:12px;min-width:0}
.w2t-field{display:flex;flex-direction:column;gap:6px}
.w2t-label{font-size:.78rem;font-weight:600;color:#334155}
.w2t-label-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.w2t-warn{font-size:.74rem;line-height:1.4;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:9px;padding:7px 9px}
.w2t-file{font-size:.78rem}
.w2t-person{min-height:96px}
.w2t-person img{width:96px;height:96px;object-fit:cover;border-radius:9px;border:1px solid #e2e8f0}
.w2t-person .ph{color:#94a3b8;font-size:.78rem}
.w2t-garments{display:flex;flex-wrap:wrap;gap:6px}
.w2t-thumb{position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;flex:0 0 auto}
.w2t-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.w2t-thumb .rm{position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0}
.w2t-stock{align-self:flex-start;border:1px solid #c7d2fe;background:#eef2ff;color:#4f46e5;border-radius:8px;padding:5px 10px;font-size:.76rem;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.w2t-stock:hover{background:#e0e7ff}
.w2t-ta{width:100%;box-sizing:border-box;resize:vertical;min-height:60px;border:1px solid #d6dee2;border-radius:10px;padding:8px 10px;font:inherit;font-size:.84rem;outline:none}
.w2t-ta:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.w2t-preset{border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:8px;padding:4px 9px;font-size:.74rem;cursor:pointer}
.w2t-preset:hover{border-color:#6366f1;color:#4f46e5}
.w2t-label-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.w2t-ai{border:1px solid #c7d2fe;background:#eef2ff;color:#4f46e5;border-radius:8px;padding:4px 9px;font-size:.74rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.w2t-ai:hover{background:#e0e7ff}
.w2t-ai:disabled{opacity:.6;cursor:not-allowed}
.w2t-go{border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:11px;padding:11px 14px;font-weight:600;font-size:.9rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.w2t-go:disabled{opacity:.6;cursor:not-allowed}
.w2t-note{font-size:.72rem;color:#94a3b8;line-height:1.4}
.w2t-gallery{display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;min-height:120px}
.w2t-card{position:relative;width:170px;min-height:120px;border-radius:11px;overflow:hidden;border:1px solid #e6e9ef;background:#f8fafc;display:flex;align-items:center;justify-content:center}
.w2t-card img{width:100%;height:auto;display:block}
.w2t-card.loading{flex-direction:column;gap:8px;color:#64748b;font-size:.78rem;padding:18px}
.w2t-card-bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,.55));opacity:0;transition:opacity .15s}
.w2t-card:hover .w2t-card-bar{opacity:1}
.w2t-card-bar a,.w2t-card-bar button{color:#fff;font-size:.74rem;text-decoration:none;border:none;background:rgba(255,255,255,.18);border-radius:6px;padding:3px 8px;cursor:pointer}
.w2t-spin{width:26px;height:26px;border:3px solid #c7d2fe;border-top-color:#6366f1;border-radius:50%;animation:w2tSpin .8s linear infinite}
@keyframes w2tSpin{to{transform:rotate(360deg)}}
@media(max-width:760px){.w2t{grid-template-columns:1fr}}`;
        document.head.appendChild(st);
    }

    const hasStock = () => !!(global.Web2VideoStock && global.Web2VideoStock.open);
    const presets = () => global.AiPresets || global.Web2AiPresets;

    // Mở kho ảnh free → nén → cb(dataUrl). Tự xử lý CORS (blob same-origin).
    function pickStock(cb) {
        if (!hasStock()) return toast('Kho ảnh chưa sẵn sàng', 'warning');
        global.Web2VideoStock.open({
            type: 'photo',
            onPick: async (it) => {
                try {
                    const blob = await (await fetch(it.url || it.thumb)).blob();
                    const raw = await new Promise((res, rej) => {
                        const fr = new FileReader();
                        fr.onload = () => res(fr.result);
                        fr.onerror = () => rej(new Error('read'));
                        fr.readAsDataURL(blob);
                    });
                    const dataUrl = await compressDataUrl(raw);
                    global.Web2VideoStock.close?.();
                    cb(dataUrl);
                } catch (_) {
                    toast('Tải ảnh kho lỗi (CORS) — thử ảnh khác', 'error');
                }
            },
        });
    }

    function mount(container, opts = {}) {
        if (!container) return { destroy() {} };
        injectCss();
        const compact = !!opts.compact;
        let person = null; // dataURL
        const garments = []; // [dataURL]

        const wrap = document.createElement('div');
        wrap.className = 'w2t' + (compact ? ' compact' : '');
        wrap.innerHTML = `
            <div class="w2t-controls">
                <div class="w2t-warn" hidden></div>
                <div class="w2t-field">
                    <span class="w2t-label">1) Ảnh người</span>
                    <div class="w2t-person"><span class="ph">Chưa chọn ảnh người</span></div>
                    <input type="file" class="w2t-file w2t-person-file" accept="image/*">
                    <button type="button" class="w2t-stock w2t-person-stock" hidden>📁 Kho ảnh free</button>
                </div>
                <div class="w2t-field">
                    <span class="w2t-label">2) Ảnh quần áo (1–${MAX_GARMENTS} ảnh) để mặc lên người</span>
                    <div class="w2t-garments"></div>
                    <input type="file" class="w2t-file w2t-garment-file" accept="image/*" multiple>
                    <button type="button" class="w2t-stock w2t-garment-stock" hidden>📁 Kho ảnh free</button>
                </div>
                <div class="w2t-field">
                    <div class="w2t-label-row">
                        <span class="w2t-label">3) Đổi phong cảnh / chi tiết (tuỳ chọn)</span>
                        <span class="w2t-label-actions">
                            <button type="button" class="w2t-ai" hidden>✨ AI viết mô tả</button>
                            <button type="button" class="w2t-preset" hidden>🧩 Mẫu</button>
                        </span>
                    </div>
                    <textarea class="w2t-ta w2t-prompt" placeholder="vd: đứng ở bãi biển hoàng hôn, ánh sáng studio, nền trắng…"></textarea>
                </div>
                <button class="w2t-go"><span>👕</span> Ghép đồ</button>
                <p class="w2t-note">🟢 Ghép 1 ảnh người + nhiều ảnh quần áo bằng AI (Nano Banana). Ảnh được nén trước khi gửi.</p>
            </div>
            <div class="w2t-gallery"></div>`;
        container.innerHTML = '';
        container.appendChild(wrap);

        const $ = (sel) => wrap.querySelector(sel);
        const personBox = $('.w2t-person');
        const garmentBox = $('.w2t-garments');
        const gallery = $('.w2t-gallery');
        const warn = $('.w2t-warn');
        const goBtn = $('.w2t-go');

        function renderPerson() {
            personBox.innerHTML = person
                ? `<img src="${person}" alt="người">`
                : '<span class="ph">Chưa chọn ảnh người</span>';
        }
        function renderGarments() {
            garmentBox.innerHTML = garments
                .map(
                    (src, i) =>
                        `<div class="w2t-thumb"><img src="${src}" alt="quần áo"><button type="button" class="rm" data-rm="${i}" title="Bỏ">×</button></div>`
                )
                .join('');
            garmentBox.querySelectorAll('[data-rm]').forEach((b) =>
                b.addEventListener('click', () => {
                    garments.splice(Number(b.dataset.rm), 1);
                    renderGarments();
                })
            );
        }

        // file inputs
        $('.w2t-person-file').addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
                person = await compressFile(f);
                renderPerson();
            } catch (err) {
                toast('Lỗi ảnh người: ' + err.message, 'error');
            }
            e.target.value = '';
        });
        $('.w2t-garment-file').addEventListener('change', async (e) => {
            for (const f of [...(e.target.files || [])]) {
                if (garments.length >= MAX_GARMENTS) {
                    toast('Tối đa ' + MAX_GARMENTS + ' ảnh quần áo', 'warning');
                    break;
                }
                try {
                    garments.push(await compressFile(f));
                } catch (err) {
                    toast('Lỗi ảnh: ' + err.message, 'error');
                }
            }
            renderGarments();
            e.target.value = '';
        });

        // 📋 Dán ảnh (Ctrl+V) + kéo-thả cho ô "Ảnh người" + "Ảnh quần áo" — nâng cấp
        // file input SẴN CÓ qua module shared Web2ImagePaste (1 NGUỒN, KHÔNG fork). Ảnh
        // dán/thả được bơm vào input.files + dispatch change → handler nén/preview ở trên
        // chạy y như chọn file. Hover/focus vào ô nào thì Ctrl+V rơi vào ô đó.
        if (global.Web2ImagePaste && global.Web2ImagePaste.enhance) {
            const personFile = $('.w2t-person-file');
            const garmentFile = $('.w2t-garment-file');
            global.Web2ImagePaste.enhance(personFile, {
                dropZone: personFile.closest('.w2t-field'),
                hintText: 'hoặc DÁN ảnh (Ctrl+V) / kéo-thả ảnh người vào đây',
            });
            global.Web2ImagePaste.enhance(garmentFile, {
                dropZone: garmentFile.closest('.w2t-field'),
                hintText: `hoặc DÁN/kéo-thả ảnh quần áo (Ctrl+V) — tối đa ${MAX_GARMENTS}`,
            });
        }

        // kho ảnh free (chỉ hiện khi Web2VideoStock có mặt)
        if (hasStock()) {
            const ps = $('.w2t-person-stock');
            const gs = $('.w2t-garment-stock');
            ps.hidden = false;
            gs.hidden = false;
            ps.addEventListener('click', () =>
                pickStock((dataUrl) => {
                    person = dataUrl;
                    renderPerson();
                })
            );
            gs.addEventListener('click', () =>
                pickStock((dataUrl) => {
                    if (garments.length >= MAX_GARMENTS)
                        return toast('Tối đa ' + MAX_GARMENTS + ' ảnh quần áo', 'warning');
                    garments.push(dataUrl);
                    renderGarments();
                })
            );
        }

        // ✨ AI viết mô tả — mở rộng ý ngắn → mô tả phong cảnh/chi tiết, dùng module shared
        // Web2AiDescribe (1 NGUỒN, KHÔNG fork). Chỉ hiện khi module có mặt (degrade mượt).
        if (global.Web2AiDescribe && global.Web2AiDescribe.attach) {
            const aiBtn = $('.w2t-ai');
            aiBtn.hidden = false;
            global.Web2AiDescribe.attach({
                button: aiBtn,
                input: $('.w2t-prompt'),
                kind: 'generic',
                lang: 'en', // mô tả phong cảnh/chi tiết tiếng ANH (model ảnh hiểu tốt hơn)
            });
        }

        // mẫu phong cảnh (chỉ hiện khi AiPresets có mặt)
        if (presets() && presets().pickImage) {
            const pb = $('.w2t-preset');
            pb.hidden = false;
            pb.addEventListener('click', () =>
                presets().pickImage(
                    (prompt) => {
                        const ta = $('.w2t-prompt');
                        ta.value = prompt;
                        ta.focus();
                    },
                    { onlyCats: ['scene'], title: 'Mẫu phong cảnh / chi tiết' }
                )
            );
        }

        async function run() {
            if (!person) return toast('Hãy chọn 1 ảnh người', 'warning');
            if (!garments.length) return toast('Hãy chọn ít nhất 1 ảnh quần áo', 'warning');
            const card = document.createElement('div');
            card.className = 'w2t-card loading';
            card.innerHTML = '<div class="w2t-spin"></div><span>Đang ghép đồ…</span>';
            gallery.prepend(card);
            goBtn.disabled = true;
            try {
                const r = await fetch(API() + '/image', {
                    method: 'POST',
                    headers: authHeaders(true),
                    body: JSON.stringify({
                        provider: 'gemini',
                        model: 'gemini-2.5-flash-image',
                        prompt: buildPrompt($('.w2t-prompt')?.value),
                        images: [person, ...garments],
                    }),
                    signal: AbortSignal.timeout(120000),
                });
                if (r.status === 401) {
                    if (global.Web2Auth?.requireAuth)
                        setTimeout(() => global.Web2Auth.requireAuth(), 1200);
                    throw new Error('Phiên Web 2.0 hết hạn — đăng nhập lại.');
                }
                const j = await r.json();
                if (!j.ok) throw new Error(j.error || 'Ghép đồ thất bại');
                const src = j.url || j.dataUrl;
                renderResultCard(card, src);
                if (opts.onResult) opts.onResult(src);
            } catch (e) {
                const msg =
                    e.name === 'TimeoutError' || e.name === 'AbortError'
                        ? 'Quá lâu — thử lại nhé.'
                        : e.message || String(e);
                card.classList.remove('loading');
                card.innerHTML = `<div style="padding:14px;text-align:center;color:#dc2626;font-size:.76rem">⚠️ ${esc(
                    msg
                )}</div>`;
                toast('Lỗi ghép đồ: ' + msg, 'error');
            } finally {
                goBtn.disabled = false;
            }
        }

        function renderResultCard(card, src) {
            const img = new Image();
            img.alt = 'Ghép đồ';
            img.onload = () => {
                card.classList.remove('loading');
                card.innerHTML = '';
                card.appendChild(img);
                const bar = document.createElement('div');
                bar.className = 'w2t-card-bar';
                const dl = document.createElement('a');
                dl.textContent = '⬇ Tải';
                dl.href = src;
                dl.download = 'ghepdo-' + Date.now() + '.png';
                dl.target = '_blank';
                bar.appendChild(dl);
                card.appendChild(bar);
            };
            img.onerror = () => {
                card.classList.remove('loading');
                card.innerHTML =
                    '<div style="padding:14px;text-align:center;color:#dc2626;font-size:.76rem">⚠️ Ảnh lỗi</div>';
            };
            img.src = src;
        }

        goBtn.addEventListener('click', run);
        renderPerson();
        renderGarments();

        // Kiểm tra Nano Banana đã cấu hình + quyền dùng → cảnh báo sớm.
        (async () => {
            try {
                const r = await fetch(API() + '/quota', { headers: authHeaders(false) });
                const j = await r.json();
                if (j.ok && j.canUse === false) {
                    warn.hidden = false;
                    warn.textContent =
                        '🔒 Bạn chưa được cấp quyền dùng Nano Banana — liên hệ admin.';
                } else if (j.ok && !j.unlimited && typeof j.remaining === 'number') {
                    warn.hidden = false;
                    warn.style.color = '#64748b';
                    warn.style.background = '#f8fafc';
                    warn.style.borderColor = '#e2e8f0';
                    warn.textContent = `🍌 Ghép đồ dùng Nano Banana — còn ${j.remaining}/${j.limit} lượt hôm nay.`;
                }
            } catch (_) {}
        })();

        return {
            destroy() {
                try {
                    container.innerHTML = '';
                } catch (_) {}
            },
        };
    }

    global.Web2Tryon = { mount };
})(window);
