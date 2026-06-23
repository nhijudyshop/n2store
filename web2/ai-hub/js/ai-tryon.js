// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — GHÉP ĐỒ / THỬ ĐỒ: chọn 1 ảnh người + 1..n ảnh quần áo → AI ghép
 * (mặc đồ lên người) + prompt tuỳ chọn để đổi phong cảnh/chi tiết.
 *
 * Engine FREE: Gemini Nano Banana (gemini-2.5-flash-image) — nhận NHIỀU input
 * image, ghép theo câu lệnh. Đây là engine free DUY NHẤT trong stack nhận ảnh
 * đầu vào (Pollinations/Cloudflare chỉ text→ảnh). Backend `/api/web2-ai/image`
 * nhận { images:[người, áo…], provider:'gemini' }.
 */
(function (global) {
    'use strict';

    const H = () => global.AiHub;
    let inited = false;
    let person = null; // dataURL
    const garments = []; // [dataURL]

    // Nén ảnh client (resize ≤ MAX_DIM + JPEG) → payload nhỏ, gửi nhanh.
    const MAX_DIM = 1280;
    function compress(file) {
        return new Promise((resolve, reject) => {
            const rd = new FileReader();
            rd.onerror = () => reject(new Error('Đọc file lỗi'));
            rd.onload = () => {
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
                img.src = rd.result;
            };
            rd.readAsDataURL(file);
        });
    }

    function el(id) {
        return document.getElementById(id);
    }

    function renderGarments() {
        const box = el('aihTryGarments');
        if (!box) return;
        box.innerHTML = garments
            .map(
                (src, i) =>
                    `<div class="aih-try-thumb" style="position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--web2-border,#e2e8f0);flex:0 0 auto;">
                        <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;">
                        <button type="button" data-rm="${i}" title="Bỏ" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0;">×</button>
                    </div>`
            )
            .join('');
        box.querySelectorAll('[data-rm]').forEach((b) => {
            b.addEventListener('click', () => {
                garments.splice(Number(b.dataset.rm), 1);
                renderGarments();
            });
        });
    }

    function renderPerson() {
        const box = el('aihTryPerson');
        if (!box) return;
        box.innerHTML = person
            ? `<img src="${person}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid var(--web2-border,#e2e8f0);">`
            : '<span style="color:#94a3b8;font-size:13px;">Chưa chọn ảnh người</span>';
    }

    function buildPrompt(extra) {
        // Prompt tiếng Anh (image model ăn EN tốt hơn).
        let p =
            'Take the person from the FIRST image and dress them in the clothing item(s) shown in the following image(s). ' +
            'Keep the person’s face, hairstyle, body shape, skin tone and pose unchanged. ' +
            'Make each garment fit the body naturally and realistically, correct proportions, realistic fabric folds and lighting. ' +
            'Replace the original outfit. Full-body, photorealistic, high quality professional fashion photo.';
        const ex = String(extra || '').trim();
        if (ex) p += ' Scene/details: ' + ex;
        return p;
    }

    async function run() {
        if (!person) return H().toast('Hãy chọn 1 ảnh người', 'warning');
        if (!garments.length) return H().toast('Hãy chọn ít nhất 1 ảnh quần áo', 'warning');
        const btn = el('aihTryGo');
        const gallery = el('aihTryGallery');
        const card = document.createElement('div');
        card.className = 'aih-imgcard loading';
        card.innerHTML = '<div class="aih-spinner"></div><span>Đang ghép đồ…</span>';
        gallery.prepend(card);
        btn.disabled = true;
        try {
            const r = await fetch(H().API() + '/image', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-2.5-flash-image',
                    prompt: buildPrompt(el('aihTryPrompt')?.value),
                    images: [person, ...garments],
                }),
                signal: AbortSignal.timeout(120000),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Ghép đồ thất bại');
            const src = j.url || j.dataUrl;
            const img = new Image();
            img.onload = () => {
                card.classList.remove('loading');
                card.innerHTML = '';
                card.appendChild(img);
                const bar = document.createElement('div');
                bar.className = 'aih-imgcard-bar';
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
                    '<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ Ảnh lỗi</div>';
            };
            img.alt = 'Ghép đồ';
            img.src = src;
        } catch (e) {
            const msg =
                e.name === 'TimeoutError' || e.name === 'AbortError'
                    ? 'Quá lâu — thử lại nhé.'
                    : e.message || String(e);
            card.classList.remove('loading');
            card.innerHTML = `<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ ${H().escapeHtml(msg)}</div>`;
            H().toast('Lỗi ghép đồ: ' + msg, 'error');
        } finally {
            btn.disabled = false;
        }
    }

    function init() {
        if (inited) return;
        inited = true;
        el('aihTryPersonFile')?.addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
                person = await compress(f);
                renderPerson();
            } catch (err) {
                H().toast('Lỗi ảnh người: ' + err.message, 'error');
            }
            e.target.value = '';
        });
        el('aihTryGarmentFile')?.addEventListener('change', async (e) => {
            const files = [...(e.target.files || [])];
            for (const f of files) {
                if (garments.length >= 5) {
                    H().toast('Tối đa 5 ảnh quần áo', 'warning');
                    break;
                }
                try {
                    garments.push(await compress(f));
                } catch (err) {
                    H().toast('Lỗi ảnh: ' + err.message, 'error');
                }
            }
            renderGarments();
            e.target.value = '';
        });
        // Kho ảnh free → chọn ảnh người / quần áo từ kho bản quyền-free.
        el('aihTryPersonStock')?.addEventListener('click', () => {
            if (H().pickStock)
                H().pickStock((dataUrl) => {
                    person = dataUrl;
                    renderPerson();
                });
        });
        el('aihTryGarmentStock')?.addEventListener('click', () => {
            if (H().pickStock)
                H().pickStock((dataUrl) => {
                    if (garments.length >= 5) return H().toast('Tối đa 5 ảnh quần áo', 'warning');
                    garments.push(dataUrl);
                    renderGarments();
                });
        });
        el('aihTryGo')?.addEventListener('click', run);
        renderPerson();
        renderGarments();
    }

    async function onShow() {
        if (!inited) init();
        // Cần Gemini đã cấu hình key.
        const provs = H().state.status?.image?.providers || [];
        const gem = provs.find((p) => p.id === 'gemini');
        const warn = el('aihTryWarn');
        if (warn) warn.hidden = !!(gem && gem.configured);
        if (global.lucide) global.lucide.createIcons();
    }

    global.AiTryon = { init, onShow };
})(window);
