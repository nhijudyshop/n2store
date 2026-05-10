// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Products page — outfit upload + scene preset → AI gen model wearing outfit.
// Pipeline: POST /products/upload-outfit → get bunny URL → POST /generations
// với gen_mode='product' + config.outfit_url + config.scene_presets[].

(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const VND_PER_CREDIT = 333;

    function showToast(msg, kind) {
        const el = document.createElement('div');
        el.className = 'aikol-toast' + (kind ? ` aikol-toast--${kind}` : '');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function refreshCredits() {
        const chip = $('#aikol-credits');
        if (!chip) return;
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            chip.textContent = `${balance} credits · ${plan}`;
        } catch (_) {
            chip.textContent = '— credits';
        }
    }

    async function loadModels() {
        const sel = document.querySelector('select[name="model_id"]');
        try {
            const { models } = await window.AikolAPI.listModels();
            if (!models?.length) {
                sel.innerHTML = '<option value="">— Chưa có model — Upload trước</option>';
                return;
            }
            sel.innerHTML = models
                .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
                .join('');
        } catch (e) {
            sel.innerHTML = `<option value="">Lỗi: ${escapeHtml(e.message)}</option>`;
        }
    }

    function renderScenePresets() {
        const grid = document.querySelector('[data-scene-presets-grid]');
        if (!grid || !window.AikolPresets) return;
        grid.innerHTML = window.AikolPresets.SCENE_PRESETS.map(
            (p, i) =>
                `<label style="display:flex; gap:0.4rem; align-items:center; padding:0.4rem 0.6rem; border:1px solid var(--aikol-border, rgba(255,255,255,0.1)); border-radius:6px; cursor:pointer">
                    <input type="radio" name="scene_preset" value="${p.id}"${i === 0 ? ' checked' : ''} />
                    <span>${escapeHtml(p.label)}</span>
                </label>`
        ).join('');
    }

    function setupVariationsPills(form) {
        const row = form.querySelector('[data-variations-pills]');
        const hidden = row?.querySelector('input[name="variations"]');
        if (!row || !hidden) return;
        row.querySelectorAll('button[data-var]').forEach((btn) => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('button[data-var]').forEach((b) =>
                    b.classList.remove('aikol-pill--active')
                );
                btn.classList.add('aikol-pill--active');
                hidden.value = btn.dataset.var;
                refreshCost();
            });
        });
    }

    function refreshCost() {
        const v = parseInt(document.querySelector('input[name="variations"]')?.value || '1', 10);
        const cost = 8 * v; // Gemini 3.1 — 8 credits / variation
        const vnd = (cost * VND_PER_CREDIT).toLocaleString('vi-VN');
        $('#products-cost').textContent =
            `Estimated cost: ${cost} cr ≈ ${vnd} ₫ (Gemini 3.1 × ${v})`;
    }

    function setupOutfitPreview() {
        const file = document.querySelector('input[name="outfit_file"]');
        const wrap = $('#outfit-preview');
        const img = $('#outfit-preview-img');
        file?.addEventListener('change', () => {
            const f = file.files?.[0];
            if (!f) {
                wrap.style.display = 'none';
                return;
            }
            img.src = URL.createObjectURL(f);
            wrap.style.display = 'block';
        });
    }

    async function onSubmit(ev) {
        ev.preventDefault();
        const form = $('#products-form');
        const fd = new FormData(form);
        const modelId = parseInt(fd.get('model_id'), 10);
        const file = fd.get('outfit_file');
        const variations = parseInt(fd.get('variations'), 10) || 1;
        const imageSize = fd.get('image_size') || '9:16';
        const scenePreset = fd.get('scene_preset') || 'studio_backdrop';
        const customScene = (fd.get('custom_scene') || '').trim();
        const note = (fd.get('note') || '').trim();
        if (!modelId) return showToast('Chọn model', 'error');
        if (!file || !(file instanceof File) || !file.size)
            return showToast('Chọn outfit photo', 'error');
        if (file.size > 10 * 1024 * 1024) return showToast('Outfit max 10MB', 'error');

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang upload outfit…';
        try {
            // 1. Upload outfit lên Bunny tmp
            const upFd = new FormData();
            upFd.append('file', file);
            const upRes = await fetch(`${window.AikolAPI.endpoint}/products/upload-outfit`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-User-Id': window.AikolAPI.getCurrentUserId() || '',
                },
                body: upFd,
            });
            const upData = await upRes.json().catch(() => ({}));
            if (!upRes.ok) throw new Error(upData.detail || `Upload HTTP ${upRes.status}`);
            const outfitUrl = upData.url;

            // 2. Submit /generations với gen_mode='product'
            submitBtn.textContent = 'Đang gửi job…';
            const config = {
                engine: 'gemini_3_1',
                variations,
                image_size: imageSize,
                gen_mode: 'product',
                outfit_url: outfitUrl,
                scene_mode: customScene ? 'free_form' : 'preset',
                scene_presets: customScene ? [] : [scenePreset],
                shot_type: 'auto',
                style_strength: 50,
            };
            const noteText = customScene || note || null;
            const r = await window.AikolAPI.submitGeneration({
                kind: 'image',
                model_id: modelId,
                clip_ids: [],
                config,
                note: noteText,
            });
            showToast(`Đã gửi ${r.count} job · còn ${r.balance} credits`, 'success');
            window.dispatchEvent(new CustomEvent('aikol:generation-submitted', { detail: r }));
            form.reset();
            $('#outfit-preview').style.display = 'none';
            await refreshCredits();
        } catch (e) {
            console.error('[products]', e);
            showToast('Lỗi: ' + (e.data?.detail || e.message), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Generate';
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (window.lucide) window.lucide.createIcons();
        await Promise.all([refreshCredits(), loadModels()]);
        renderScenePresets();
        setupVariationsPills($('#products-form'));
        setupOutfitPreview();
        refreshCost();
        $('#products-form').addEventListener('submit', onSubmit);
        $('#products-form').addEventListener('change', refreshCost);

        // Queue watcher
        const queuePanel = $('#aikol-queue-panel');
        if (window.AikolGenerate && queuePanel) {
            window.AikolGenerate.startQueueWatch({
                container: queuePanel,
                onTerminal: () => refreshCredits(),
            });
        }
        window.addEventListener('aikol:generation-submitted', () => refreshCredits());
    });
})();
