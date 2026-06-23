// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Trợ lý AI — TẠO ẢNH free: Pollinations (no-key) · Cloudflare Workers AI · Gemini Nano Banana.
 * Pollinations trả URL (browser tự load) · CF/Gemini trả dataUrl base64.
 */
(function (global) {
    'use strict';

    const H = () => global.AiHub;
    let inited = false;
    let editImageData = null; // base64 ảnh gốc (Gemini sửa/ghép)

    function imageProviders() {
        return H().state.status?.image?.providers || [];
    }

    function fillProviders() {
        const sel = document.getElementById('aihImgProvider');
        const list = imageProviders();
        sel.innerHTML = list
            .map(
                (p) =>
                    `<option value="${p.id}" ${p.configured ? '' : 'disabled'}>${p.label}${p.configured ? '' : ' — chưa cấu hình'}</option>`
            )
            .join('');
        sel.value = (list.find((p) => p.configured) || list[0] || {}).id || 'pollinations';
        fillModels(sel.value);
        toggleEditField(sel.value);
    }
    function fillModels(providerId) {
        const sel = document.getElementById('aihImgModel');
        const p = imageProviders().find((x) => x.id === providerId);
        if (!p) return;
        sel.innerHTML = (p.models || [])
            .map((m) => `<option value="${m.id}">${m.label}</option>`)
            .join('');
    }
    function toggleEditField(providerId) {
        const p = imageProviders().find((x) => x.id === providerId);
        const field = document.getElementById('aihImgEditField');
        if (field) field.hidden = !(p && p.editsImage);
    }

    function init() {
        if (inited) return;
        inited = true;
        fillProviders();
        document.getElementById('aihImgProvider').addEventListener('change', (e) => {
            fillModels(e.target.value);
            toggleEditField(e.target.value);
        });
        document.getElementById('aihImgGen').addEventListener('click', generate);
        document.getElementById('aihImgPrompt').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
        });
        const file = document.getElementById('aihImgFile');
        if (file)
            file.addEventListener('change', () => {
                const f = file.files?.[0];
                if (!f) {
                    editImageData = null;
                    return;
                }
                const rd = new FileReader();
                rd.onload = () => (editImageData = rd.result);
                rd.readAsDataURL(f);
            });
        // Cho phép DÁN (Ctrl+V) / kéo-thả ảnh — dùng module ảnh chung.
        if (global.Web2ImagePaste?.enhance) {
            global.Web2ImagePaste.enhance('#aihImgFile', {
                dropZone: '#aihImgEditField',
                hintText: 'hoặc dán ảnh (Ctrl+V) / kéo-thả vào đây để sửa/ghép',
            });
        }
    }

    function onShow() {
        if (!inited) init();
        if (global.lucide) global.lucide.createIcons();
    }

    async function generate() {
        const prompt = document.getElementById('aihImgPrompt').value.trim();
        if (!prompt) return H().toast('Nhập mô tả ảnh', 'warning');
        const provider = document.getElementById('aihImgProvider').value;
        const model = document.getElementById('aihImgModel').value;
        const width = +document.getElementById('aihImgW').value;
        const height = +document.getElementById('aihImgH').value;
        const btn = document.getElementById('aihImgGen');
        const gallery = document.getElementById('aihGallery');

        // card loading (prepend)
        const card = document.createElement('div');
        card.className = 'aih-imgcard loading';
        card.innerHTML = '<div class="aih-spinner"></div><span>Đang tạo…</span>';
        gallery.prepend(card);

        btn.disabled = true;
        try {
            const payload = { prompt, provider, model, width, height };
            if (provider === 'gemini' && editImageData) payload.image = editImageData;
            const r = await fetch(H().API() + '/image', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify(payload),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Tạo ảnh thất bại');
            const srcUrl = j.url || j.dataUrl;
            renderCard(card, srcUrl, prompt, j.provider);
        } catch (e) {
            card.classList.remove('loading');
            card.innerHTML = `<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ ${H().escapeHtml(e.message || e)}</div>`;
            H().toast('Lỗi tạo ảnh: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
        }
    }

    function renderCard(card, src, prompt, provider) {
        const img = new Image();
        img.alt = prompt;
        img.onload = () => {
            card.classList.remove('loading');
            card.innerHTML = '';
            card.appendChild(img);
            const bar = document.createElement('div');
            bar.className = 'aih-imgcard-bar';
            const dl = document.createElement('a');
            dl.textContent = '⬇ Tải';
            dl.href = src;
            dl.download = 'ai-' + Date.now() + '.png';
            dl.target = '_blank';
            const open = document.createElement('button');
            open.textContent = provider || 'mở';
            open.onclick = () => window.open(src, '_blank');
            bar.appendChild(dl);
            bar.appendChild(open);
            card.appendChild(bar);
        };
        img.onerror = () => {
            card.classList.remove('loading');
            card.innerHTML =
                '<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ Ảnh lỗi/hết quota</div>';
        };
        img.src = src;
    }

    global.AiImage = { init, onShow };
})(window);
