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
        btn.textContent = 'Đang vẽ… (10-25s)';
        statusEl.style.display = 'block';
        statusEl.innerHTML =
            '<span style="color:var(--aikol-accent)">Gemini đang generate ảnh…</span>';
        try {
            const r = await window.AikolAPI.generateModel({ name, prompt, aspectRatio });
            showToast(`Tạo model "${r.name}" thành công`, 'success');
            statusEl.innerHTML = `<span style="color:var(--aikol-success)">✓ Done · model #${r.id} · còn ${r.balance} credits</span>`;
            nameEl.value = '';
            promptEl.value = '';
            await Promise.all([refreshCredits(), refreshModels()]);
        } catch (e) {
            const detail = e.data?.detail || e.message;
            const refunded = e.data?.refunded;
            console.error('[aikol] generateModel', e);
            statusEl.innerHTML = `<span style="color:var(--aikol-error)">Lỗi: ${escapeHtml(detail)}${refunded ? ` (đã refund ${refunded}cr)` : ''}</span>`;
            showToast('Lỗi tạo: ' + detail, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Tạo bằng AI — 4 credits';
        }
    }

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function onDelete(id, name) {
        if (!confirm(`Xoá model "${name}"?`)) return;
        try {
            await window.AikolAPI.deleteModel(id);
            showToast('Đã xoá', 'success');
            await refreshModels();
        } catch (e) {
            console.error('[aikol] deleteModel', e);
            showToast('Lỗi xoá: ' + e.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('#model-form').addEventListener('submit', onSubmit);
        $('#model-gen-form')?.addEventListener('submit', onGenerate);
        refreshCredits();
        refreshModels();
    });
})();
