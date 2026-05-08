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
        actions.style.cssText = 'display:flex;gap:0.4rem;margin-top:0.5rem;flex-wrap:wrap;';
        const genBtn = document.createElement('button');
        genBtn.className = 'aikol-btn';
        genBtn.style.cssText = 'flex:1 1 100%;font-size:0.78rem;padding:0.4rem 0.5rem;';
        genBtn.textContent = '⚡ Generate';
        genBtn.addEventListener('click', () => {
            if (window.AikolGenerate) window.AikolGenerate.openForClip(c);
        });
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
        actions.append(genBtn, favBtn, delBtn);

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

    // ===== Channel batch import =====
    let channelCancelled = false;

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function onChannelFetch(ev) {
        ev.preventDefault();
        const input = $('#channel-input');
        const countSel = $('#channel-count');
        const btn = $('#channel-fetch-btn');
        const progress = $('#channel-progress');
        const list = $('#channel-list');
        const url = (input.value || '').trim();
        if (!url) return showToast('Vui lòng dán URL kênh hoặc secUid', 'error');

        btn.disabled = true;
        btn.textContent = 'Đang lấy…';
        progress.style.display = 'block';
        progress.textContent = 'Đang resolve secUid + gọi scraper…';
        list.style.display = 'none';
        list.innerHTML = '';

        try {
            const r = await window.AikolAPI.importChannel(url, parseInt(countSel.value, 10));
            const fresh = r.videos.filter((v) => !v.already_imported);
            if (!r.videos.length) {
                progress.innerHTML =
                    '<span style="color:var(--aikol-warn)">' +
                    escapeHtml(r.hint || 'Scraper trả 0 video.') +
                    '</span>';
                btn.disabled = false;
                btn.textContent = 'Lấy danh sách';
                return;
            }
            progress.innerHTML = `Tìm thấy <strong>${r.videos.length}</strong> video — đã có sẵn ${r.videos.length - fresh.length}, mới <strong>${fresh.length}</strong>. Mỗi video tốn ${r.cost_per_video} credit.`;
            renderChannelList(r.videos, fresh.length, r.cost_per_video);
        } catch (e) {
            const detail = e.data?.detail || e.message;
            const hint = e.data?.hint;
            progress.innerHTML =
                '<span style="color:var(--aikol-error)">Lỗi: ' +
                escapeHtml(detail) +
                (hint ? '<br><small>' + escapeHtml(hint) + '</small>' : '') +
                '</span>';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Lấy danh sách';
        }
    }

    function renderChannelList(videos, freshCount, costPerVideo) {
        const list = $('#channel-list');
        list.style.display = 'block';
        list.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.6rem">
                <button type="button" class="aikol-btn" id="channel-import-all" ${freshCount === 0 ? 'disabled' : ''}>
                    Import ${freshCount} video mới (${freshCount * costPerVideo} credits)
                </button>
                <button type="button" class="aikol-btn aikol-btn--secondary" id="channel-cancel" style="display:none">
                    Huỷ
                </button>
                <span style="color:var(--aikol-text-dim); font-size:0.82rem">10 song song · refund tự động nếu fail</span>
            </div>
            <div class="aikol-channel-list">
                ${videos
                    .map(
                        (v) => `
                    <div class="aikol-channel-item" data-video-id="${escapeHtml(v.videoId)}" data-already="${v.already_imported ? '1' : '0'}">
                        ${v.cover ? `<img src="${escapeHtml(v.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="aikol-channel-item__cover-placeholder">—</div>'}
                        <div class="aikol-channel-item__body">
                            <div class="aikol-channel-item__title" title="${escapeHtml(v.title)}">${escapeHtml(v.title || v.videoId)}</div>
                            <div class="aikol-channel-item__meta">
                                ${v.duration ? `${v.duration}s · ` : ''}${escapeHtml(v.videoId)}
                            </div>
                        </div>
                        <div class="aikol-channel-item__status" data-status="pending">
                            ${v.already_imported ? '<span style="color:var(--aikol-text-dim)">đã có</span>' : 'chờ'}
                        </div>
                    </div>`
                    )
                    .join('')}
            </div>`;
        const btnAll = $('#channel-import-all');
        const btnCancel = $('#channel-cancel');
        btnAll?.addEventListener('click', async () => {
            const fresh = videos.filter((v) => !v.already_imported);
            if (!fresh.length) return;
            btnAll.disabled = true;
            btnCancel.style.display = '';
            channelCancelled = false;
            btnCancel.onclick = () => {
                channelCancelled = true;
                btnCancel.disabled = true;
                btnCancel.textContent = 'Đang dừng…';
            };
            await runChannelBatch(fresh, 10);
            btnCancel.style.display = 'none';
            btnAll.textContent = 'Đã xong';
            await Promise.all([refreshCredits(), refreshClips()]);
        });
    }

    async function runChannelBatch(videos, concurrency) {
        let idx = 0;
        let done = 0;
        let failed = 0;
        const total = videos.length;
        const updateRowStatus = (videoId, html, statusKey) => {
            const row = document.querySelector(
                `.aikol-channel-item[data-video-id="${videoId}"] .aikol-channel-item__status`
            );
            if (row) {
                row.innerHTML = html;
                row.dataset.status = statusKey;
            }
        };
        const progress = $('#channel-progress');
        const updateProgress = () => {
            progress.innerHTML = `Đã import <strong>${done}/${total}</strong>${failed ? ` · lỗi ${failed}` : ''}${channelCancelled ? ' · đã huỷ' : ''}`;
        };
        updateProgress();

        async function worker() {
            while (!channelCancelled) {
                const i = idx++;
                if (i >= total) return;
                const v = videos[i];
                updateRowStatus(
                    v.videoId,
                    '<span style="color:var(--aikol-accent)">đang tải…</span>',
                    'running'
                );
                try {
                    await window.AikolAPI.importSingle(v.url);
                    done++;
                    updateRowStatus(
                        v.videoId,
                        '<span style="color:var(--aikol-success)">✓ xong</span>',
                        'done'
                    );
                } catch (e) {
                    failed++;
                    const detail = e.data?.detail || e.message || 'lỗi';
                    updateRowStatus(
                        v.videoId,
                        `<span style="color:var(--aikol-error)" title="${escapeHtml(detail)}">✗ lỗi</span>`,
                        'error'
                    );
                }
                updateProgress();
            }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
        updateProgress();
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('#single-form').addEventListener('submit', onSingleImport);
        $('#upload-form').addEventListener('submit', onUpload);
        $('#channel-form')?.addEventListener('submit', onChannelFetch);
        refreshCredits();
        refreshClips();

        // Sprint 3 — queue watcher + auto-refresh on submit/terminal.
        const queuePanel = document.getElementById('aikol-queue-panel');
        if (window.AikolGenerate && queuePanel) {
            window.AikolGenerate.startQueueWatch({
                container: queuePanel,
                onTerminal: () => {
                    refreshCredits();
                },
            });
        }
        window.addEventListener('aikol:generation-submitted', () => {
            refreshCredits();
        });
    });
})();
