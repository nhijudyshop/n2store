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
            // Đổi sang nguồn KHÔNG sửa ảnh (editsImage=false) mà đang có ảnh gốc → dọn ảnh gốc +
            // card "Ảnh gốc" cho khớp thực tế (nguồn này sẽ bỏ qua ảnh gốc).
            const p = imageProviders().find((x) => x.id === e.target.value);
            if (editImageData && !(p && p.editsImage)) clearSource();
        });
        document.getElementById('aihImgGen').addEventListener('click', generate);
        // Kho ảnh free → chọn ảnh bản quyền-free làm ẢNH GỐC (Nano Banana sửa/ghép).
        document.getElementById('aihImgStock')?.addEventListener('click', () => {
            if (H().pickStock) H().pickStock((dataUrl) => setSource(dataUrl));
        });
        document.getElementById('aihImgEnhance')?.addEventListener('click', enhancePrompt);
        document.getElementById('aihImgPrompt').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') generate();
        });
        const file = document.getElementById('aihImgFile');
        if (file)
            file.addEventListener('change', () => {
                const f = file.files?.[0];
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setSource(rd.result);
                rd.readAsDataURL(f);
            });
        // DÁN ảnh (Ctrl+V) khi đang ở tab Tạo ảnh → hiện NGAY ở khung kết quả + dùng làm ảnh gốc.
        document.addEventListener('paste', (e) => {
            if (H().state?.activeTab !== 'image') return;
            const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            const f = it && it.getAsFile();
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => setSource(rd.result);
            rd.readAsDataURL(f);
        });
        // Kéo-thả ảnh vào khung kết quả.
        const gal = document.getElementById('aihGallery');
        if (gal) {
            gal.addEventListener('dragover', (e) => e.preventDefault());
            gal.addEventListener('drop', (e) => {
                e.preventDefault();
                const f = [...(e.dataTransfer?.files || [])].find((x) =>
                    x.type.startsWith('image/')
                );
                if (!f) return;
                const rd = new FileReader();
                rd.onload = () => setSource(rd.result);
                rd.readAsDataURL(f);
            });
        }
    }

    // Đặt ảnh gốc (paste/chọn/kéo-thả) → hiện preview ở khung kết quả + auto chuyển Nano Banana.
    function setSource(dataUrl) {
        editImageData = dataUrl;
        showSource(dataUrl);
        const provSel = document.getElementById('aihImgProvider');
        const gem = imageProviders().find((p) => p.id === 'gemini' && p.configured);
        if (provSel && provSel.value !== 'gemini' && gem) {
            provSel.value = 'gemini';
            fillModels('gemini');
            toggleEditField('gemini');
            H().toast('Đã dán ảnh gốc → chuyển sang Nano Banana để sửa/ghép', 'info');
        } else {
            H().toast('Đã dán ảnh gốc', 'success');
        }
    }
    function showSource(dataUrl) {
        const gallery = document.getElementById('aihGallery');
        if (!gallery) return;
        gallery.querySelector('.aih-imgcard.source')?.remove();
        const card = document.createElement('div');
        card.className = 'aih-imgcard source';
        const img = new Image();
        img.alt = 'Ảnh gốc';
        img.src = dataUrl;
        card.appendChild(img);
        const bar = document.createElement('div');
        bar.className = 'aih-imgcard-bar';
        bar.style.opacity = '1';
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.textContent = '🖼 Ảnh gốc — bỏ';
        tag.onclick = () => clearSource();
        bar.appendChild(tag);
        card.appendChild(bar);
        gallery.prepend(card);
    }
    // Dọn ảnh gốc: xoá state + card "Ảnh gốc" + reset file input (dùng cho nút "bỏ" và khi đổi
    // sang nguồn không sửa ảnh).
    function clearSource() {
        editImageData = null;
        document.getElementById('aihGallery')?.querySelector('.aih-imgcard.source')?.remove();
        const f = document.getElementById('aihImgFile');
        if (f) f.value = '';
    }

    // #2 — Nút AI viết mô tả: nhập ngắn → LLM mở rộng thành prompt chi tiết tạo ảnh.
    async function enhancePrompt() {
        const ta = document.getElementById('aihImgPrompt');
        const seed = ta.value.trim();
        if (!seed) return H().toast('Nhập vài chữ trước (vd: áo trắng nữ)', 'warning');
        const btn = document.getElementById('aihImgEnhance');
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Đang viết…';
        try {
            // /complete = failover gemini→groq→openrouter (1 provider quá tải vẫn chạy);
            // maxTokens cao để prompt không bị cắt giữa chừng (model suy luận đốt token).
            const r = await fetch(H().API() + '/complete', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify({
                    providers: ['gemini', 'groq', 'openrouter'],
                    // 2026-06-24 (user request): user nhập tiếng Việt → trả prompt
                    // bằng TIẾNG ANH (image model ăn prompt tiếng Anh tốt hơn nhiều).
                    system: 'You are an expert at writing prompts for AI fashion/product image generation. The user gives a SHORT description (usually in Vietnamese). Expand it into ONE detailed prompt (1-3 sentences) IN ENGLISH: clearly state the product, setting/background, lighting, camera angle, style, and material. Output ONLY the final English prompt — no explanation, no markdown, no extra line breaks, no Vietnamese.',
                    messages: [{ role: 'user', content: seed }],
                    maxTokens: 1024,
                    temperature: 0.8,
                }),
            });
            const j = await r.json();
            if (!j.ok || !j.text) throw new Error(j.error || 'AI không trả nội dung');
            ta.value = j.text.trim();
            H().toast('AI đã viết mô tả chi tiết ✨', 'success');
        } catch (e) {
            H().toast('Lỗi AI viết mô tả: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
            if (global.lucide) global.lucide.createIcons();
        }
    }

    async function onShow() {
        if (!inited) init();
        // Tự phục hồi nếu /status fail lúc boot → providers rỗng → dropdown trống (kẹt vĩnh viễn
        // vì fillProviders chỉ chạy 1 lần trong init). Nạp lại status rồi refill khi đang rỗng.
        if (imageProviders().length === 0) {
            await H().loadStatus();
            fillProviders();
        }
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

        // Ảnh gốc chỉ dùng được với Gemini (Nano Banana) — cảnh báo rõ nếu nguồn khác sẽ bỏ qua.
        if (editImageData && provider !== 'gemini') {
            H().toast(
                'Ảnh gốc chỉ dùng được với Nano Banana (Gemini) — nguồn hiện tại sẽ bỏ qua ảnh gốc',
                'warning'
            );
        }

        btn.disabled = true;
        try {
            const payload = { prompt, provider, model, width, height };
            if (provider === 'gemini' && editImageData) payload.image = editImageData;
            // Timeout 120s: nguồn ảnh (Pollinations/Flux) treo → KHÔNG kẹt nút mãi
            // (bug "tạo 1 hình rồi không tạo tiếp, phải F5"). Abort → catch → mở lại nút.
            const r = await fetch(H().API() + '/image', {
                method: 'POST',
                headers: H().authHeaders(true),
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(120000),
            });
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Tạo ảnh thất bại');
            const srcUrl = j.url || j.dataUrl;
            renderCard(card, srcUrl, prompt, j.provider);
        } catch (e) {
            const msg =
                e.name === 'TimeoutError' || e.name === 'AbortError'
                    ? 'Quá lâu (nguồn ảnh bận) — bấm Tạo ảnh lại nhé.'
                    : e.message || String(e);
            card.classList.remove('loading');
            card.innerHTML = `<div style="padding:14px;text-align:center;color:var(--web2-danger);font-size:.78rem">⚠️ ${H().escapeHtml(msg)}</div>`;
            H().toast('Lỗi tạo ảnh: ' + msg, 'error');
        } finally {
            btn.disabled = false; // LUÔN mở lại nút → tạo tiếp được, khỏi F5
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
