// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Library page logic.
// Sprint 2: import single TikTok URL + MP4 upload + clip grid.
// Channel scraping deferred (needs cookie).

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
        setTimeout(() => el.remove(), 4000);
    }

    function fmtDuration(s) {
        if (!s) return '';
        const ss = Math.round(s);
        const m = Math.floor(ss / 60);
        const r = ss % 60;
        return `${m}:${r.toString().padStart(2, '0')}`;
    }

    function fmtBytes(n) {
        if (!n) return '';
        if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fmtViews(n) {
        if (!n) return '';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(n);
    }

    function clipCard(c) {
        const card = document.createElement('div');
        card.className = 'aikol-model-card';
        card.dataset.id = c.id;
        const thumb = document.createElement('div');
        thumb.className = 'aikol-model-card__thumb';
        thumb.style.aspectRatio = '9/16';
        if (c.cover_url) {
            thumb.style.backgroundImage = `url("${c.cover_url}")`;
        }
        const badge = document.createElement('div');
        badge.style.cssText =
            'position:relative;display:flex;justify-content:space-between;padding:0.4rem 0.5rem;font-size:0.72rem;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,0.7));margin-top:auto;';
        badge.innerHTML = `<span>${fmtDuration(c.duration)}</span><span>${fmtViews(c.view_count)}</span>`;
        thumb.style.display = 'flex';
        thumb.style.flexDirection = 'column';
        thumb.appendChild(badge);

        const body = document.createElement('div');
        body.className = 'aikol-model-card__body';
        const title = document.createElement('div');
        title.className = 'aikol-model-card__name';
        title.textContent = c.title || c.video_id || '(untitled)';
        title.title = c.title || '';
        const meta = document.createElement('div');
        meta.className = 'aikol-model-card__meta';
        const userTxt = c.platform === 'upload' ? '📁 Upload' : `@${c.username || '?'}`;
        meta.textContent = `${userTxt} · ${fmtBytes(c.file_size)}`;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:0.4rem;margin-top:0.5rem;';
        const favBtn = document.createElement('button');
        favBtn.className = 'aikol-btn aikol-btn--secondary';
        favBtn.style.cssText = 'flex:1;font-size:0.78rem;padding:0.35rem 0.5rem;';
        favBtn.textContent = c.favorite ? '★ Favorite' : '☆ Fav';
        favBtn.addEventListener('click', () => onToggleFavorite(c.id, !c.favorite));
        const delBtn = document.createElement('button');
        delBtn.className = 'aikol-btn aikol-btn--danger';
        delBtn.style.cssText = 'font-size:0.78rem;padding:0.35rem 0.6rem;';
        delBtn.textContent = 'Xoá';
        delBtn.addEventListener('click', () => onDelete(c.id, c.title || c.video_id));
        actions.append(favBtn, delBtn);

        body.append(title, meta, actions);
        card.append(thumb, body);
        return card;
    }

    async function refreshClips() {
        const list = $('#clips-list');
        const empty = $('#clips-empty');
        const totalEl = $('#clips-total');
        try {
            const { clips, total } = await window.AikolAPI.listClips(50, 0);
            list.innerHTML = '';
            if (totalEl) totalEl.textContent = `${total} clip${total === 1 ? '' : 's'}`;
            if (!clips || clips.length === 0) {
                empty.style.display = 'block';
                list.style.display = 'none';
                return;
            }
            empty.style.display = 'none';
            list.style.display = 'grid';
            clips.forEach((c) => list.appendChild(clipCard(c)));
        } catch (e) {
            console.error('[aikol] listClips', e);
            showToast('Lỗi tải danh sách: ' + e.message, 'error');
        }
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

    async function onSingleImport(ev) {
        ev.preventDefault();
        const input = $('#single-url');
        const btn = $('#single-submit');
        const url = (input.value || '').trim();
        if (!url) {
            showToast('Vui lòng dán link TikTok', 'error');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Đang tải video…';
        try {
            const res = await window.AikolAPI.importSingle(url);
            showToast(
                `Tải xong: ${res.title || res.video_id} (${fmtBytes(res.file_size)})`,
                'success'
            );
            input.value = '';
            await Promise.all([refreshCredits(), refreshClips()]);
        } catch (e) {
            console.error('[aikol] importSingle', e);
            const detail = e.data && e.data.detail ? e.data.detail : e.message;
            showToast(`Lỗi: ${detail}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Import — 1 credit';
        }
    }

    async function onUpload(ev) {
        ev.preventDefault();
        const fileInput = $('#upload-file');
        const titleInput = $('#upload-title');
        const btn = $('#upload-submit');
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
            showToast('Chọn MP4 / MOV để upload', 'error');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            showToast('File tối đa 100MB', 'error');
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Đang upload…';
        try {
            await window.AikolAPI.uploadClip({ file, title: titleInput.value || file.name });
            showToast('Upload thành công', 'success');
            fileInput.value = '';
            titleInput.value = '';
            await refreshClips();
        } catch (e) {
            console.error('[aikol] uploadClip', e);
            const detail = e.data && e.data.detail ? e.data.detail : e.message;
            showToast(`Lỗi upload: ${detail}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Upload (FREE)';
        }
    }

    async function onToggleFavorite(id, fav) {
        try {
            await window.AikolAPI.toggleClipFavorite(id, fav);
            await refreshClips();
        } catch (e) {
            showToast('Lỗi: ' + e.message, 'error');
        }
    }

    async function onDelete(id, label) {
        if (!confirm(`Xoá clip "${label}"?`)) return;
        try {
            await window.AikolAPI.deleteClip(id);
            showToast('Đã xoá', 'success');
            await refreshClips();
        } catch (e) {
            showToast('Lỗi xoá: ' + e.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('#single-form').addEventListener('submit', onSingleImport);
        $('#upload-form').addEventListener('submit', onUpload);
        refreshCredits();
        refreshClips();
    });
})();
