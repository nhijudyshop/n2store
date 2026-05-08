// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio Sprint 4 — Campaigns page.

(function () {
    'use strict';
    const $ = (s, r) => (r || document).querySelector(s);

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

    function fmtDate(secs) {
        if (!secs) return '—';
        return new Date(secs * 1000).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    async function refreshCredits() {
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            $('#aikol-credits').textContent = `${balance} credits · ${plan}`;
        } catch (_) {}
    }

    function buildSummary(c) {
        const filt = [];
        if (c.platform) filt.push(`platform=${c.platform}`);
        if (c.username) filt.push(`@${c.username}`);
        if (c.favorite_only) filt.push('★ favorite');
        if (c.min_views != null) filt.push(`views ≥ ${c.min_views}`);
        return filt.length ? filt.join(' · ') : 'Tất cả clips';
    }

    function buildConfigSummary(c) {
        const conf = typeof c.config === 'string' ? JSON.parse(c.config || '{}') : c.config || {};
        const bits = [];
        if (c.kind === 'image') {
            bits.push(`${conf.variations || 1} variation${(conf.variations || 1) > 1 ? 's' : ''}`);
            if (conf.image_size) bits.push(conf.image_size);
        } else {
            bits.push(`Kling ${conf.kling_mode || 'std'} ${conf.duration_seconds || 5}s`);
        }
        if (conf.shot_type && conf.shot_type !== 'match_clip') bits.push(conf.shot_type);
        return bits.join(' · ') || '—';
    }

    function campaignCard(c) {
        const card = document.createElement('div');
        card.className = 'aikol-campaign-card';
        card.innerHTML = `
            <div class="aikol-campaign-card__head">
                <div style="flex:1;min-width:0">
                    <div class="aikol-campaign-card__name">${escapeHtml(c.name)}</div>
                    <div class="aikol-campaign-card__sub">
                        ${c.kind === 'video' ? '🎬' : '🖼️'} ${escapeHtml(c.kind)} · model #${c.model_id}
                    </div>
                </div>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:flex-start">
                    <button type="button" class="aikol-btn" data-action="run" data-id="${c.id}">▶ Run</button>
                    <button type="button" class="aikol-btn aikol-btn--danger" data-action="delete" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Xoá</button>
                </div>
            </div>
            <div class="aikol-campaign-card__body">
                <div><strong>Filter:</strong> ${escapeHtml(buildSummary(c))}</div>
                <div><strong>Config:</strong> ${escapeHtml(buildConfigSummary(c))}</div>
                <div style="color:var(--aikol-text-dim);font-size:0.82rem">
                    Tạo ${fmtDate(c.created_at)}${c.last_run_at ? ` · Last run ${fmtDate(c.last_run_at)} (${c.last_run_count} clips)` : ' · Chưa chạy'}
                </div>
            </div>
            <div class="aikol-campaign-card__foot">
                <label style="display:inline-flex;gap:0.4rem;align-items:center;font-size:0.85rem">
                    Limit:
                    <input type="number" class="aikol-input" data-id="${c.id}" data-role="limit" min="1" max="50" value="20" style="width:80px">
                </label>
            </div>
        `;
        card.querySelector('[data-action="run"]').addEventListener('click', () =>
            onRun(c.id, card)
        );
        card.querySelector('[data-action="delete"]').addEventListener('click', (e) =>
            onDelete(c.id, e.currentTarget.dataset.name)
        );
        return card;
    }

    async function loadCampaigns() {
        try {
            const { campaigns } = await window.AikolAPI.listCampaigns();
            const list = $('#campaigns-list');
            const empty = $('#campaigns-empty');
            const total = $('#campaigns-total');
            list.innerHTML = '';
            const n = campaigns ? campaigns.length : 0;
            if (total) total.textContent = `${n} campaign${n === 1 ? '' : 's'}`;
            if (n === 0) {
                empty.style.display = 'block';
                return;
            }
            empty.style.display = 'none';
            campaigns.forEach((c) => list.appendChild(campaignCard(c)));
        } catch (e) {
            showToast('Lỗi tải campaigns: ' + e.message, 'error');
        }
    }

    async function onRun(id, card) {
        const limitInput = card.querySelector('[data-role="limit"]');
        const limit = parseInt(limitInput?.value, 10) || 20;
        const btn = card.querySelector('[data-action="run"]');
        btn.disabled = true;
        btn.textContent = 'Running…';
        try {
            const res = await window.AikolAPI.runCampaign(id, { limit });
            showToast(`Đã gửi ${res.count} jobs · còn ${res.balance} credits`, 'success');
            await Promise.all([refreshCredits(), loadCampaigns()]);
        } catch (e) {
            const detail = e.data?.detail || e.message;
            showToast('Lỗi run: ' + detail, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '▶ Run';
        }
    }

    async function onDelete(id, name) {
        const ok = await window.aikolConfirmDelete(`campaign "${name}"`);
        if (!ok) return;
        try {
            await window.AikolAPI.deleteCampaign(id);
            showToast('Đã xoá', 'success');
            await loadCampaigns();
        } catch (e) {
            showToast('Lỗi xoá: ' + (e.data?.detail || e.message), 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        refreshCredits();
        loadCampaigns();
        const queuePanel = document.getElementById('aikol-queue-panel');
        if (window.AikolGenerate && queuePanel) {
            window.AikolGenerate.startQueueWatch({
                container: queuePanel,
                onTerminal: () => {
                    refreshCredits();
                    loadCampaigns();
                },
            });
        }
    });
})();
