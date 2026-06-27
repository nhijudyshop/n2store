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
    const GEMINI_LOCAL = 'http://localhost:8131'; // sidecar gemini-tryon chạy ngay máy này

    // Dò máy Gemini FREE đang online: ưu tiên localhost (máy này), rồi registry (máy shop khác).
    // Trả URL máy có account sẵn sàng, hoặc '' nếu không có (→ dùng Nano Banana trả phí).
    async function discoverGemini() {
        try {
            const r = await fetch(GEMINI_LOCAL + '/health', { signal: AbortSignal.timeout(1500) });
            if (r.ok) {
                const d = await r.json();
                if (d.ok && d.readyCount > 0) return { url: GEMINI_LOCAL, ready: d.readyCount };
            }
        } catch (_) {}
        try {
            const base =
                global.WEB2_CONFIG?.WORKER_URL ||
                global.API_CONFIG?.WORKER_URL ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            const r = await fetch(base + '/api/web2-vieneu-registry/list?engine=gemini-tryon', {
                signal: AbortSignal.timeout(6000),
            });
            const d = await r.json();
            const servers = (d.servers || []).filter((s) => s && s.url);
            // Ưu tiên máy shop ĐANG KHỎE (có account sẵn sàng) → máy khác không route vào máy
            // shop cookie hết hạn. Health-check qua tunnel; ok thì dùng ngay.
            for (const s of servers) {
                const url = s.url.replace(/\/+$/, '');
                try {
                    const hr = await fetch(url + '/health', { signal: AbortSignal.timeout(4000) });
                    const hd = await hr.json();
                    if (hd.ok && hd.readyCount > 0) return { url, ready: hd.readyCount };
                } catch (_) {}
            }
            // Không máy nào confirm khỏe → vẫn thử máy đầu (có thể cookie vừa hết, sidecar trả lỗi rõ).
            if (servers[0]) return { url: servers[0].url.replace(/\/+$/, ''), ready: null };
        } catch (_) {}
        return null;
    }

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

    // Prompt try-on cải tiến (id onmodel-tryon-pro) — khoá danh tính + trung thực món đồ +
    // khớp ánh sáng/bóng đổ/màu da để GHÉP HÀI HOÀ NHẤT. Nguồn: PicoTrex + YouMind Nano Banana.
    const TRYON_PROMPT =
        "Take the person from the FIRST image as the fixed model. Dress them in the exact clothing item(s) shown in the following image(s), replacing their original outfit completely. ABSOLUTELY preserve the person's face, facial structure, skin tone, hairstyle, body shape, height proportions and pose from the first image - do not alter their identity in any way. For each garment, faithfully reproduce its true colour, fabric texture, knit/weave, pattern, print, logo, embroidery, buttons, seams, collar and length exactly as in the product image - never invent or simplify details. Make the clothing drape and fit the body naturally with realistic fabric folds, gravity, tension at shoulders and waist, and correct garment proportions. CRITICAL for a seamless composite: match the lighting direction, colour temperature and intensity of the original photo so the garment, skin and face share one consistent light; cast soft, physically-correct contact shadows where fabric meets the body; keep skin tone uniform across face, neck, hands and arms with no colour seam at the neckline or wrists; render hands, fingers, neck and collarbone undistorted and anatomically correct. Full-body framing, photorealistic, sharp focus, natural matte skin texture with visible pores (no plastic smoothing), professional fashion e-commerce photography, high resolution, 4:5 aspect ratio.";
    // Prompt ghép mặt (id faceswap-onto-model): ẢNH 1 = mặt nguồn, ẢNH 2 = model đích.
    const FACESWAP_PROMPT =
        "You are given two images. IMAGE 1 is the FACE SOURCE: take this person's face, facial features, expression, skin tone and identity. IMAGE 2 is the TARGET MODEL: keep the model's hair, neck, body, pose, hands, outfit, background and the camera angle exactly as they are. Seamlessly place the face from IMAGE 1 onto the head of the person in IMAGE 2. Match the face to the model's head orientation and viewing angle, blend skin tone and lighting so the face inherits the exact same light direction, color temperature, soft shadows and highlights of IMAGE 2. Preserve the original face shape, eyes, nose, lips, eyebrows and natural facial proportions from IMAGE 1 with maximum accuracy — do not beautify or change the identity. The transition at the jawline, hairline and neck must be invisible. Keep every garment, fold, accessory and the entire scene of IMAGE 2 unchanged. Output one photorealistic, seamless full-resolution image with no visible compositing, no double edges and no blur.";

    function buildPrompt(extra, mode) {
        let p = mode === 'faceswap' ? FACESWAP_PROMPT : TRYON_PROMPT;
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
.w2t-modes{display:flex;gap:6px;background:#f1f5f9;padding:4px;border-radius:11px}
.w2t-mode{flex:1;border:none;background:transparent;border-radius:8px;padding:8px 10px;font:inherit;font-size:.82rem;font-weight:600;color:#64748b;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.w2t-mode:hover{color:#4f46e5}
.w2t-mode.active{background:#fff;color:#4f46e5;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.w2t-srv{border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#f8fafc;font-size:.78rem}
.w2t-srv summary{cursor:pointer;font-weight:600;color:#334155;display:flex;align-items:center;gap:7px;list-style:none}
.w2t-srv summary::-webkit-details-marker{display:none}
.w2t-srv-dot{width:9px;height:9px;border-radius:50%;background:#cbd5e1;flex:0 0 auto}
.w2t-srv-dot.on{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.18)}
.w2t-srv-hint{margin:8px 0;color:#64748b;line-height:1.45;font-size:.74rem}
.w2t-srv-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
.w2t-srv-actions button,.w2t-srv-cfg{border:1px solid #c7d2fe;background:#eef2ff;color:#4f46e5;border-radius:8px;padding:5px 10px;font-size:.74rem;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.w2t-srv-actions button:hover,.w2t-srv-cfg:hover{background:#e0e7ff}
.w2t-srv-status{font-size:.73rem;color:#64748b;line-height:1.4}
.w2t-srv-status.on{color:#16a34a;font-weight:600}
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
                <div class="w2t-modes">
                    <button type="button" class="w2t-mode active" data-mode="tryon">👕 Ghép đồ</button>
                    <button type="button" class="w2t-mode" data-mode="faceswap">🧑‍🤝‍🧑 Ghép mặt</button>
                </div>
                <div class="w2t-warn" hidden></div>
                <div class="w2t-field">
                    <span class="w2t-label w2t-person-label">1) Ảnh người</span>
                    <div class="w2t-person"><span class="ph">Chưa chọn ảnh người</span></div>
                    <input type="file" class="w2t-file w2t-person-file" accept="image/*">
                    <button type="button" class="w2t-stock w2t-person-stock" hidden>📁 Kho ảnh free</button>
                </div>
                <div class="w2t-field">
                    <span class="w2t-label w2t-garment-label">2) Ảnh quần áo (1–${MAX_GARMENTS} ảnh) để mặc lên người</span>
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
                <details class="w2t-srv">
                    <summary><span class="w2t-srv-dot"></span> <span class="w2t-srv-sum">Máy Gemini FREE (xoay tua nhiều account)</span></summary>
                    <p class="w2t-srv-hint">Cài 1-click lên máy shop → tạo ảnh <b>miễn phí</b> bằng tài khoản Google (cài nhiều acc phụ để xoay tua, không bị giới hạn lượt). Khi máy bật → tab này tự dùng máy free thay vì Nano Banana trả phí.</p>
                    <div class="w2t-srv-actions">
                        <button type="button" class="w2t-srv-install">⬇ Tải bộ cài (Windows)</button>
                        <button type="button" class="w2t-srv-refresh">🔄 Dò máy</button>
                        <button type="button" class="w2t-srv-cfg">⚙️ Mở cấu hình account (máy shop)</button>
                    </div>
                    <div class="w2t-srv-status">Đang dò máy Gemini…</div>
                </details>
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

        // Chế độ: 'tryon' (người + quần áo) | 'faceswap' (ảnh mặt + ảnh model). Face-swap chỉ 1 ảnh model.
        let mode = 'tryon';
        const curMax = () => (mode === 'faceswap' ? 1 : MAX_GARMENTS);
        function applyMode() {
            const isFace = mode === 'faceswap';
            wrap.querySelectorAll('.w2t-mode').forEach((b) =>
                b.classList.toggle('active', b.dataset.mode === mode)
            );
            $('.w2t-person-label').textContent = isFace
                ? '1) Ảnh lấy MẶT (khuôn mặt nguồn)'
                : '1) Ảnh người';
            $('.w2t-garment-label').textContent = isFace
                ? '2) Ảnh MODEL — ghép mặt vào (1 ảnh)'
                : `2) Ảnh quần áo (1–${MAX_GARMENTS} ảnh) để mặc lên người`;
            $('.w2t-go').innerHTML = isFace
                ? '<span>🧑‍🤝‍🧑</span> Ghép mặt'
                : '<span>👕</span> Ghép đồ';
            $('.w2t-note').textContent = isFace
                ? '🟢 Ảnh 1 = lấy MẶT · Ảnh 2 = MODEL để ghép mặt vào (giữ thân/đồ/nền của model). AI Nano Banana.'
                : '🟢 Ghép 1 ảnh người + nhiều ảnh quần áo bằng AI (Nano Banana). Ảnh được nén trước khi gửi.';
            $('.w2t-garment-file').multiple = !isFace;
            if (isFace && garments.length > 1) {
                garments.length = 1;
                renderGarments();
            }
        }
        wrap.querySelectorAll('.w2t-mode').forEach((b) =>
            b.addEventListener('click', () => {
                if (mode === b.dataset.mode) return;
                mode = b.dataset.mode;
                applyMode();
            })
        );

        // ── Máy Gemini FREE (sidecar gemini-tryon) — dò online + tải bộ cài + route try-on ──
        let geminiUrl = ''; // '' = dùng Nano Banana trả phí; có URL = dùng máy free
        const srvDot = $('.w2t-srv-dot');
        const srvStatus = $('.w2t-srv-status');
        async function refreshSrv() {
            srvStatus.textContent = 'Đang dò máy Gemini…';
            srvStatus.classList.remove('on');
            srvDot.classList.remove('on');
            const m = await discoverGemini();
            geminiUrl = m ? m.url : '';
            if (geminiUrl) {
                srvDot.classList.add('on');
                srvStatus.classList.add('on');
                srvStatus.textContent =
                    '🟢 Máy Gemini FREE đang bật' +
                    (m.ready ? ` (${m.ready} account)` : '') +
                    ' — tab này đang dùng MIỄN PHÍ. Bấm "⚙️ Cấu hình account" để thêm cookie.';
            } else {
                srvStatus.textContent =
                    '⚪ Chưa thấy máy Gemini free → đang dùng Nano Banana (trả phí). Cài bộ trên để dùng free.';
            }
        }
        $('.w2t-srv-install')?.addEventListener('click', () => {
            if (global.Web2PosInstaller?.downloadInstaller) {
                global.Web2PosInstaller.downloadInstaller();
                toast('Đã tải bộ cài — bấm đúp chạy trên máy shop, chọn [4] Gemini', 'success');
            } else {
                toast('Chưa tải được module cài đặt', 'error');
            }
        });
        $('.w2t-srv-refresh')?.addEventListener('click', refreshSrv);
        // Nút mở trang cấu hình máy shop: dò máy online (localhost nếu ở máy shop, TUNNEL nếu máy khác)
        // → mở đúng URL để DÁN COOKIE từ bất kỳ máy nào. URL tunnel đổi mỗi lần restart nên luôn dò mới.
        $('.w2t-srv-cfg')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const old = btn.textContent;
            btn.disabled = true;
            btn.textContent = '⏳ Đang tìm máy shop…';
            try {
                let url = geminiUrl;
                if (!url) {
                    const m = await discoverGemini();
                    url = m ? m.url : '';
                    geminiUrl = url;
                }
                if (url) {
                    window.open(url + '/', '_blank', 'noopener');
                } else {
                    toast(
                        'Chưa thấy máy Gemini online. Bật sidecar trên máy shop (chạy bộ cài [4]) rồi bấm "Dò máy".',
                        'warning'
                    );
                }
            } finally {
                btn.disabled = false;
                btn.textContent = old;
            }
        });
        refreshSrv();

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
                if (garments.length >= curMax()) {
                    toast(
                        mode === 'faceswap'
                            ? 'Ghép mặt chỉ cần 1 ảnh model'
                            : 'Tối đa ' + MAX_GARMENTS + ' ảnh quần áo',
                        'warning'
                    );
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
                    if (garments.length >= curMax())
                        return toast(
                            mode === 'faceswap'
                                ? 'Ghép mặt chỉ cần 1 ảnh model'
                                : 'Tối đa ' + MAX_GARMENTS + ' ảnh quần áo',
                            'warning'
                        );
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

        // Gọi máy Gemini FREE (sidecar gemini-tryon) — trả dataUrl ảnh.
        async function callGeminiMachine(promptText, images) {
            const r = await fetch(geminiUrl + '/tryon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptText, images }),
                signal: AbortSignal.timeout(180000),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Máy Gemini lỗi');
            return j.dataUrl;
        }
        // Gọi Nano Banana TRẢ PHÍ (backend /api/web2-ai/image) — fallback khi không có máy free.
        async function callPaidNano(promptText, images) {
            const r = await fetch(API() + '/image', {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-2.5-flash-image',
                    prompt: promptText,
                    images,
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
            return j.url || j.dataUrl;
        }

        async function run() {
            const isFace = mode === 'faceswap';
            if (!person)
                return toast(isFace ? 'Hãy chọn ảnh lấy MẶT' : 'Hãy chọn 1 ảnh người', 'warning');
            if (!garments.length)
                return toast(
                    isFace
                        ? 'Hãy chọn ảnh MODEL để ghép mặt vào'
                        : 'Hãy chọn ít nhất 1 ảnh quần áo',
                    'warning'
                );
            const card = document.createElement('div');
            card.className = 'w2t-card loading';
            card.innerHTML = `<div class="w2t-spin"></div><span>${isFace ? 'Đang ghép mặt…' : 'Đang ghép đồ…'}</span>`;
            gallery.prepend(card);
            goBtn.disabled = true;
            const promptText = buildPrompt($('.w2t-prompt')?.value, mode);
            const images = [person, ...garments];
            try {
                let src;
                if (geminiUrl) {
                    // Đường FREE: máy shop (sidecar gemini-tryon) — cookie acc Google, xoay tua.
                    try {
                        src = await callGeminiMachine(promptText, images);
                    } catch (e) {
                        toast(
                            'Máy free lỗi (' + (e.message || e) + ') → chuyển Nano Banana trả phí',
                            'warning'
                        );
                        refreshSrv(); // máy có thể đã tắt → dò lại
                        src = await callPaidNano(promptText, images);
                    }
                } else {
                    src = await callPaidNano(promptText, images);
                }
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
