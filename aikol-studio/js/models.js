// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Models page logic.

(function () {
    'use strict';

    function $(sel) {
        return document.querySelector(sel);
    }
    function showToast(msg, kind) {
        const el = document.createElement('div');
        el.className = 'aikol-toast' + (kind ? ` aikol-toast--${kind}` : '');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    function fmtBytes(n) {
        if (!n) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fmtDate(epoch) {
        if (!epoch) return '';
        const d = new Date(epoch * 1000);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function modelCard(m) {
        const card = document.createElement('div');
        card.className = 'aikol-model-card';
        card.dataset.id = m.id;
        const thumb = document.createElement('div');
        thumb.className = 'aikol-model-card__thumb';
        if (m.thumb_url) thumb.style.backgroundImage = `url("${m.thumb_url}")`;
        const body = document.createElement('div');
        body.className = 'aikol-model-card__body';
        const name = document.createElement('div');
        name.className = 'aikol-model-card__name';
        name.textContent = m.name;
        const meta = document.createElement('div');
        meta.className = 'aikol-model-card__meta';
        meta.textContent = `${fmtBytes(m.file_size)} · ${fmtDate(m.created_at)}`;
        const del = document.createElement('button');
        del.className = 'aikol-btn aikol-btn--danger';
        del.style.fontSize = '0.78rem';
        del.style.padding = '0.35rem 0.6rem';
        del.style.marginTop = '0.5rem';
        del.textContent = 'Xoá';
        del.addEventListener('click', () => onDelete(m.id, m.name));
        body.append(name, meta, del);
        card.append(thumb, body);
        return card;
    }

    async function refreshModels() {
        const list = $('#models-list');
        const empty = $('#models-empty');
        try {
            const { models } = await window.AikolAPI.listModels();
            list.innerHTML = '';
            if (!models || models.length === 0) {
                empty.style.display = 'block';
                list.style.display = 'none';
                return;
            }
            empty.style.display = 'none';
            list.style.display = 'grid';
            models.forEach((m) => list.appendChild(modelCard(m)));
        } catch (e) {
            console.error('[aikol] listModels', e);
            showToast('Lỗi tải danh sách: ' + e.message, 'error');
        }
    }

    async function refreshCredits() {
        const chip = $('#aikol-credits');
        if (!chip) return;
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            chip.textContent = `${balance} credits · ${plan}`;
        } catch (e) {
            chip.textContent = '— credits';
        }
    }

    async function onSubmit(ev) {
        ev.preventDefault();
        const nameInput = $('#model-name');
        const fileInput = $('#model-file');
        const submitBtn = $('#model-submit');
        const name = (nameInput.value || '').trim();
        const file = fileInput.files && fileInput.files[0];
        if (!name) {
            showToast('Vui lòng nhập tên model', 'error');
            return;
        }
        if (!file) {
            showToast('Vui lòng chọn ảnh', 'error');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            showToast('Ảnh tối đa 8MB', 'error');
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang upload…';
        try {
            await window.AikolAPI.uploadModel({ name, file });
            showToast('Upload thành công', 'success');
            nameInput.value = '';
            fileInput.value = '';
            await refreshModels();
        } catch (e) {
            console.error('[aikol] uploadModel', e);
            showToast('Lỗi upload: ' + e.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Lưu model';
        }
    }

    async function onGenerate(ev) {
        ev.preventDefault();
        const nameEl = $('#model-gen-name');
        const promptEl = $('#model-gen-prompt');
        const aspectEl = $('#model-gen-aspect');
        const btn = $('#model-gen-submit');
        const statusEl = $('#model-gen-status');
        const name = (nameEl.value || '').trim();
        const prompt = (promptEl.value || '').trim();
        const aspectRatio = aspectEl.value || undefined;
        if (!name || !prompt) {
            showToast('Vui lòng nhập tên + mô tả', 'error');
            return;
        }
        if (prompt.length < 10) {
            showToast('Mô tả phải ≥10 ký tự', 'error');
            return;
        }
        btn.disabled = true;
        const useClone = Boolean(_refImageFile);
        btn.textContent = useClone ? 'Đang clone… (10-20s)' : 'Đang vẽ… (10-25s)';
        statusEl.style.display = 'block';
        statusEl.innerHTML = useClone
            ? '<span style="color:var(--aikol-accent)">Gemini 3.1 đang clone giữ y gương mặt…</span>'
            : '<span style="color:var(--aikol-accent)">Gemini đang generate ảnh…</span>';
        try {
            const r = useClone
                ? await window.AikolAPI.cloneModelFromImage({
                      name,
                      prompt,
                      file: _refImageFile,
                  })
                : await window.AikolAPI.generateModel({ name, prompt, aspectRatio });
            showToast(`Tạo model "${r.name}" thành công`, 'success');
            statusEl.innerHTML = `<span style="color:var(--aikol-success)">✓ Done · model #${r.id} · còn ${r.balance} credits${useClone ? ' (giữ y gương mặt)' : ''}</span>`;
            nameEl.value = '';
            promptEl.value = '';
            _refImageFile = null;
            updateRefImageBadge(null);
            updateGenerateButtonLabel();
            await Promise.all([refreshCredits(), refreshModels()]);
        } catch (e) {
            const detail = e.data?.detail || e.message;
            const refunded = e.data?.refunded;
            console.error('[aikol] generateModel', e);
            statusEl.innerHTML = `<span style="color:var(--aikol-error)">Lỗi: ${escapeHtml(detail)}${refunded ? ` (đã refund ${refunded}cr)` : ''}</span>`;
            showToast('Lỗi tạo: ' + detail, 'error');
        } finally {
            btn.disabled = false;
            updateGenerateButtonLabel();
        }
    }

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function onDelete(id, name) {
        const ok = await window.aikolConfirmDelete(`model "${name}"`, 'Không undo được.');
        if (!ok) return;
        try {
            await window.AikolAPI.deleteModel(id);
            showToast('Đã xoá', 'success');
            await refreshModels();
        } catch (e) {
            console.error('[aikol] deleteModel', e);
            showToast('Lỗi xoá: ' + e.message, 'error');
        }
    }

    // ===== Prompt generator =====
    function populateVibeSelect() {
        const sel = $('#prompt-gen-vibe');
        if (!sel || !window.aikolPromptGenerator) return;
        const vibes = window.aikolPromptGenerator.listVibes();
        for (const v of vibes) {
            const opt = document.createElement('option');
            opt.value = v.key;
            opt.textContent = v.label;
            sel.appendChild(opt);
        }
    }

    function renderSuggestions() {
        const panel = $('#prompt-suggestions-panel');
        const grid = $('#prompt-suggestions');
        const gender = $('#prompt-gen-gender').value;
        const vibe = $('#prompt-gen-vibe').value;
        const items = window.aikolPromptGenerator.generateMany({
            count: 6,
            gender,
            vibe,
        });
        grid.innerHTML = items
            .map(
                (it, i) => `
            <button type="button" class="aikol-prompt-card" data-prompt="${escapeHtmlAttr(it.prompt)}">
                <div class="aikol-prompt-card__head">
                    <span class="aikol-prompt-card__vibe">${escapeHtml(it.vibeLabel)}</span>
                    <span class="aikol-prompt-card__gender">${it.gender === 'female' ? '♀ Nữ' : '♂ Nam'}</span>
                </div>
                <div class="aikol-prompt-card__body">${escapeHtml(it.prompt)}</div>
            </button>`
            )
            .join('');
        grid.querySelectorAll('.aikol-prompt-card').forEach((btn) => {
            btn.addEventListener('click', () => {
                const p = btn.dataset.prompt;
                const ta = $('#model-gen-prompt');
                ta.value = p;
                ta.focus();
                ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                showToast('Đã chọn prompt — chỉnh sửa nếu cần rồi bấm Tạo', 'success');
            });
        });
        panel.style.display = 'block';
    }

    function escapeHtmlAttr(s) {
        return String(s || '')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Khi user pick ảnh "📷 Từ ảnh", file được lưu vào _refImageFile để
    // bước Tạo bằng AI sau đó dùng Gemini 3.1 multi-image clone (giữ exact face).
    // Đồng thời gọi describe để fill textarea cho user xem/edit.
    let _refImageFile = null;
    async function onPromptFromImage(file) {
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
            showToast('Ảnh tối đa 8MB', 'error');
            return;
        }
        const btn = $('#prompt-from-image-btn');
        const ta = $('#model-gen-prompt');
        const origLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Đang đọc ảnh…';
        try {
            const r = await window.AikolAPI.describeImageAsPrompt(file);
            ta.value = r.prompt;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.focus();
            _refImageFile = file;
            updateRefImageBadge(file);
            updateGenerateButtonLabel();
            showToast(
                'Đã tạo prompt + giữ ảnh tham khảo — sẽ giữ y nguyên gương mặt khi tạo (8cr)',
                'success'
            );
        } catch (e) {
            const detail = e.data?.detail || e.message;
            showToast('Lỗi đọc ảnh: ' + detail, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = origLabel;
        }
    }

    function updateRefImageBadge(file) {
        let badge = $('#ref-image-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'ref-image-badge';
            badge.style.cssText =
                'display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.7rem;background:var(--aikol-accent-soft);border:1px solid var(--aikol-accent);border-radius:8px;margin-top:0.5rem;font-size:0.82rem';
            const ta = $('#model-gen-prompt');
            ta?.parentElement?.appendChild(badge);
        }
        badge.innerHTML = file
            ? `<span>📷</span><span style="flex:1">Giữ y nguyên gương mặt từ <strong>${escapeHtml(file.name)}</strong> (Gemini 3.1, 8cr)</span><button type="button" id="ref-image-clear" class="aikol-btn aikol-btn--secondary" style="font-size:0.72rem;padding:0.2rem 0.5rem">Xoá</button>`
            : '';
        if (file) {
            $('#ref-image-clear')?.addEventListener('click', () => {
                _refImageFile = null;
                updateRefImageBadge(null);
                updateGenerateButtonLabel();
                showToast('Đã bỏ ảnh tham khảo — sẽ tạo từ text only (4cr)', 'info');
            });
        } else {
            badge.remove();
        }
    }

    function updateGenerateButtonLabel() {
        const btn = $('#model-gen-submit');
        if (!btn) return;
        const hasRef = Boolean(_refImageFile);
        btn.textContent = hasRef ? 'Tạo bằng AI (giữ mặt) — 8 credits' : 'Tạo bằng AI — 4 credits';
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('#model-form').addEventListener('submit', onSubmit);
        $('#model-gen-form')?.addEventListener('submit', onGenerate);
        populateVibeSelect();
        $('#prompt-gen-btn')?.addEventListener('click', renderSuggestions);
        $('#prompt-gen-shuffle')?.addEventListener('click', renderSuggestions);
        $('#prompt-gen-gender')?.addEventListener('change', renderSuggestions);
        $('#prompt-gen-vibe')?.addEventListener('change', renderSuggestions);

        // 📷 Từ ảnh: trigger hidden file input
        const fromImgBtn = $('#prompt-from-image-btn');
        const fromImgFile = $('#prompt-from-image-file');
        if (fromImgBtn && fromImgFile) {
            fromImgBtn.addEventListener('click', () => fromImgFile.click());
            fromImgFile.addEventListener('change', () => {
                const f = fromImgFile.files?.[0];
                if (f) onPromptFromImage(f);
                fromImgFile.value = ''; // reset to allow same file re-pick
            });
        }

        refreshCredits();
        refreshModels();
    });
})();
