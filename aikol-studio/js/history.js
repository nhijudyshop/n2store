// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Outputs / History page logic.
// Lists generated images + videos with kind filter, supports download + delete.

(function () {
    'use strict';

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }
    function $$(sel, root) {
        return Array.from((root || document).querySelectorAll(sel));
    }

    function showToast(msg, kind) {
        const el = document.createElement('div');
        el.className = 'aikol-toast' + (kind ? ` aikol-toast--${kind}` : '');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function fmtBytes(n) {
        if (!n) return '';
        if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fmtDate(secs) {
        if (!secs) return '';
        const d = new Date(secs * 1000);
        return d.toLocaleString('vi-VN', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    let currentFilter = 'all';

    function outputCard(o) {
        const card = document.createElement('div');
        card.className = 'aikol-model-card';
        card.dataset.id = o.id;

        const thumb = document.createElement('div');
        thumb.className = 'aikol-model-card__thumb';
        thumb.style.aspectRatio = '9/16';
        thumb.style.position = 'relative';
        thumb.style.cursor = 'pointer';

        if (o.file_kind === 'video') {
            const video = document.createElement('video');
            video.src = o.file_url;
            video.controls = true;
            video.preload = 'metadata';
            video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px';
            thumb.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = o.file_url;
            img.alt = `Output ${o.id}`;
            img.loading = 'lazy';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px';
            img.addEventListener('click', () => window.open(o.file_url, '_blank'));
            thumb.appendChild(img);
        }

        const body = document.createElement('div');
        body.className = 'aikol-model-card__body';

        const title = document.createElement('div');
        title.className = 'aikol-model-card__name';
        title.textContent = `${o.file_kind === 'video' ? '🎬' : '🖼️'} #${o.variant_index + 1}`;

        const meta = document.createElement('div');
        meta.className = 'aikol-model-card__meta';
        meta.textContent = `${fmtBytes(o.file_size)} · ${fmtDate(o.created_at)}`;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:0.4rem;margin-top:0.5rem;';
        const dlBtn = document.createElement('a');
        dlBtn.className = 'aikol-btn aikol-btn--secondary';
        dlBtn.style.cssText = 'flex:1;font-size:0.78rem;padding:0.35rem 0.5rem;text-align:center;';
        dlBtn.textContent = '⬇ Download';
        dlBtn.href = o.file_url;
        dlBtn.download = `${o.id}.${o.file_kind === 'video' ? 'mp4' : 'jpg'}`;
        dlBtn.target = '_blank';
        const delBtn = document.createElement('button');
        delBtn.className = 'aikol-btn aikol-btn--danger';
        delBtn.style.cssText = 'font-size:0.78rem;padding:0.35rem 0.6rem;';
        delBtn.textContent = 'Xoá';
        delBtn.addEventListener('click', () => onDelete(o.id));
        actions.append(dlBtn, delBtn);

        body.append(title, meta, actions);
        card.append(thumb, body);
        return card;
    }

    async function refreshOutputs() {
        const list = $('#outputs-list');
        const empty = $('#outputs-empty');
        const totalEl = $('#outputs-total');
        try {
            const kindArg = currentFilter === 'all' ? null : currentFilter;
            const { outputs } = await window.AikolAPI.listOutputs(100, 0, kindArg);
            list.innerHTML = '';
            const n = outputs ? outputs.length : 0;
            if (totalEl) totalEl.textContent = `${n} output${n === 1 ? '' : 's'}`;
            if (n === 0) {
                empty.style.display = 'block';
                list.style.display = 'none';
                return;
            }
            empty.style.display = 'none';
            list.style.display = 'grid';
            outputs.forEach((o) => list.appendChild(outputCard(o)));
        } catch (e) {
            console.error('[aikol] listOutputs', e);
            showToast('Lỗi tải outputs: ' + e.message, 'error');
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

    async function onDelete(id) {
        if (!confirm('Xoá output này? Không undo được.')) return;
        try {
            await window.AikolAPI.deleteOutput(id);
            showToast('Đã xoá', 'success');
            await refreshOutputs();
        } catch (e) {
            showToast('Lỗi xoá: ' + e.message, 'error');
        }
    }

    function setupFilters() {
        $$('[data-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                $$('[data-filter]').forEach((b) => {
                    b.setAttribute('aria-pressed', 'false');
                    b.classList.remove('aikol-chip--active');
                });
                btn.setAttribute('aria-pressed', 'true');
                btn.classList.add('aikol-chip--active');
                currentFilter = btn.dataset.filter;
                refreshOutputs();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupFilters();
        refreshCredits();
        refreshOutputs();

        const queuePanel = document.getElementById('aikol-queue-panel');
        if (window.AikolGenerate && queuePanel) {
            window.AikolGenerate.startQueueWatch({
                container: queuePanel,
                onTerminal: () => {
                    refreshCredits();
                    refreshOutputs();
                },
            });
        }
    });
})();
