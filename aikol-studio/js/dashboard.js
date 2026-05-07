// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Sprint 5 dashboard. KPI hero + queue + completed thumbs.

(function () {
    'use strict';
    const $ = (s, r) => (r || document).querySelector(s);

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    async function loadKpis() {
        try {
            const [clips, models, outputs] = await Promise.all([
                window.AikolAPI.listClips(1, 0).catch(() => ({ total: 0 })),
                window.AikolAPI.listModels().catch(() => ({ models: [] })),
                window.AikolAPI.listOutputs(1, 0).catch(() => ({ outputs: [] })),
            ]);
            // listClips returns total; listModels returns models[]; listOutputs returns outputs[].
            // For accurate output count we'd need a count endpoint; use a 200-page sample for now.
            const allOutputs = await window.AikolAPI.listOutputs(200, 0).catch(() => ({
                outputs: [],
            }));
            $('#kpi-clips').textContent = String(clips.total ?? 0);
            $('#kpi-models').textContent = String(models.models?.length ?? 0);
            $('#kpi-outputs').textContent = String(allOutputs.outputs?.length ?? 0);
        } catch (e) {
            console.warn('[dashboard] kpi load', e.message);
        }
    }

    function queueRow(g) {
        const stateColors = {
            pending: 'aikol-credit-row__kind--pending',
            running: 'aikol-credit-row__kind--running',
            error: 'aikol-credit-row__kind--error',
            done: 'aikol-credit-row__kind--done',
        };
        return `
            <div class="aikol-credit-row" data-id="${escapeHtml(g.id)}">
                <span class="aikol-credit-row__kind ${stateColors[g.state] || ''}">${escapeHtml(g.state)}</span>
                <span class="aikol-credit-row__delta">${g.cost_credits} cr</span>
                <span style="flex:1;min-width:0">
                    ${g.kind === 'video' ? '🎬' : '🖼️'} ${escapeHtml(g.kind)} · model #${g.model_id}${g.clip_id ? ' · clip #' + g.clip_id : ''}
                </span>
                <span style="color:var(--aikol-text-dim);font-size:0.78rem">
                    ${new Date((g.started_at || g.created_at) * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>`;
    }

    async function loadQueue() {
        try {
            const { queue } = await window.AikolAPI.getQueue();
            $('#dash-queue-count').textContent = String(queue?.length ?? 0);
            const root = $('#dash-queue-list');
            if (!queue || queue.length === 0) {
                root.innerHTML = `<div class="aikol-empty" style="padding:1.25rem 0.5rem;font-size:0.85rem">Chưa có job nào đang chạy.</div>`;
                return;
            }
            root.innerHTML = queue.slice(0, 6).map(queueRow).join('');
        } catch (e) {
            console.warn('[dashboard] queue load', e.message);
        }
    }

    async function loadCompleted() {
        try {
            const { outputs } = await window.AikolAPI.listOutputs(8, 0);
            $('#dash-done-count').textContent = String(outputs?.length ?? 0);
            const root = $('#dash-done-thumbs');
            if (!outputs || outputs.length === 0) {
                root.innerHTML = `<div class="aikol-empty" style="padding:1.25rem 0.5rem;font-size:0.85rem">Outputs sẽ hiện ở đây.</div>`;
                return;
            }
            root.innerHTML = outputs
                .slice(0, 8)
                .map((o) => {
                    const url = o.file_url || '';
                    if (o.file_kind === 'video') {
                        return `<a class="aikol-dash-thumb aikol-dash-thumb--video" href="history.html" title="Video output">
                            <video src="${escapeHtml(url)}" muted preload="metadata"></video>
                        </a>`;
                    }
                    return `<a class="aikol-dash-thumb" href="history.html" title="Image output">
                        <img src="${escapeHtml(url)}" alt="" loading="lazy" />
                    </a>`;
                })
                .join('');
        } catch (e) {
            console.warn('[dashboard] outputs load', e.message);
        }
    }

    async function refreshAll() {
        await Promise.all([loadKpis(), loadQueue(), loadCompleted()]);
    }

    document.addEventListener('DOMContentLoaded', () => {
        refreshAll();
        // Light auto-refresh: every 15s for queue, every 60s for kpis/completed.
        setInterval(loadQueue, 15000);
        setInterval(() => {
            loadKpis();
            loadCompleted();
        }, 60000);
    });
})();
