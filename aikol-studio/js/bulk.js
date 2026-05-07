// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio Sprint 4 — Bulk Generate page.

(function () {
    'use strict';
    const $ = (s, r) => (r || document).querySelector(s);

    const COSTS = {
        image: 4,
        video_std_per_sec: 8,
        video_pro_per_sec: 13,
        video_min_seconds: 3,
    };

    const PRESETS = {
        favorites_image: {
            kind: 'image',
            variations: 1,
            limit: 20,
            favorite_only: true,
            image_size: '9:16',
            shot_type: 'match_clip',
            scene_mode: 'match',
            keep_pose: true,
            keep_lighting: true,
        },
        recent_image_3: {
            kind: 'image',
            variations: 3,
            limit: 5,
            favorite_only: false,
            image_size: '9:16',
            shot_type: 'close_up',
            scene_mode: 'match',
            keep_pose: false,
            keep_lighting: true,
        },
        favorites_video: {
            kind: 'video',
            variations: 1,
            limit: 5,
            favorite_only: true,
            kling_mode: 'std',
            duration_seconds: 5,
            scene_mode: 'match',
            keep_pose: true,
        },
        custom: null,
    };

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
        try {
            const { balance, plan } = await window.AikolAPI.getCredits();
            $('#aikol-credits').textContent = `${balance} credits · ${plan}`;
        } catch (_) {}
    }

    async function loadModelsInto(select) {
        select.innerHTML = '<option value="">Loading…</option>';
        try {
            const { models } = await window.AikolAPI.listModels();
            if (!models || models.length === 0) {
                select.innerHTML = '<option value="">— Chưa có model — Upload trước</option>';
                select.disabled = true;
                return;
            }
            select.disabled = false;
            select.innerHTML = models
                .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
                .join('');
        } catch (e) {
            select.innerHTML = `<option value="">Lỗi: ${escapeHtml(e.message)}</option>`;
        }
    }

    function readForm() {
        const form = $('#bulk-form');
        const fd = new FormData(form);
        const o = {};
        fd.forEach((v, k) => (o[k] = v));
        ['favorite_only', 'keep_pose', 'keep_outfit', 'keep_bg', 'keep_lighting'].forEach(
            (k) => (o[k] = form.elements[k].checked)
        );
        o.variations = parseInt(o.variations, 10) || 1;
        o.limit = parseInt(o.limit, 10) || 10;
        o.duration_seconds = parseInt(o.duration_seconds, 10) || 5;
        o.min_views = o.min_views ? parseInt(o.min_views, 10) : null;
        return o;
    }

    function refreshCostSummary() {
        const o = readForm();
        const perClip =
            o.kind === 'image'
                ? COSTS.image * (o.variations || 1)
                : (o.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec) *
                  Math.max(COSTS.video_min_seconds, o.duration_seconds);
        const total = perClip * o.limit;
        $('#bulk-cost-summary').textContent =
            `~${perClip} cr / clip × ${o.limit} clips = ${total} cr (max)`;
    }

    function applyPreset(presetId) {
        const p = PRESETS[presetId];
        if (!p) return;
        const form = $('#bulk-form');
        Object.entries(p).forEach(([k, v]) => {
            const el = form.elements[k];
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!v;
            else el.value = v;
        });
        refreshCostSummary();
        toggleVideoBlock();
    }

    function toggleVideoBlock() {
        const form = $('#bulk-form');
        const kind = form.elements.kind.value;
        $('#bulk-form [data-video-only]').style.display = kind === 'video' ? 'block' : 'none';
    }

    async function onSubmit(ev) {
        ev.preventDefault();
        const form = $('#bulk-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        const o = readForm();
        if (!o.model_id) {
            showToast('Chọn model', 'error');
            return;
        }
        const config = {
            variations: o.variations,
            similarity: 80,
            creativity: 40,
            keep_pose: o.keep_pose,
            keep_outfit: o.keep_outfit,
            keep_bg: o.keep_bg,
            keep_lighting: o.keep_lighting,
            image_size: o.image_size,
            shot_type: 'match_clip',
            scene_mode: 'match',
            kling_mode: o.kling_mode || 'std',
            duration_seconds: o.duration_seconds,
        };
        const filter = {
            platform: o.platform || null,
            username: o.username || null,
            favorite_only: o.favorite_only,
            min_views: o.min_views,
        };
        const payload = {
            kind: o.kind,
            model_id: parseInt(o.model_id, 10),
            config,
            filter,
            limit: o.limit,
            note: o.note || null,
        };
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang gửi…';
        try {
            // Save as campaign first?
            if ($('#save-as-campaign').checked) {
                const name =
                    $('#campaign-name').value.trim() ||
                    `Bulk ${new Date().toLocaleString('vi-VN')}`;
                await window.AikolAPI.createCampaign({
                    name,
                    platform: filter.platform,
                    username: filter.username,
                    favorite_only: filter.favorite_only,
                    min_views: filter.min_views,
                    model_id: payload.model_id,
                    kind: payload.kind,
                    config,
                });
                showToast(`Đã lưu campaign "${name}"`, 'success');
            }
            const res = await window.AikolAPI.runBulk(payload);
            showToast(`Đã gửi ${res.count} jobs · còn ${res.balance} credits`, 'success');
            await Promise.all([refreshCredits(), loadRecent()]);
        } catch (e) {
            const detail = e.data?.detail || e.message;
            showToast('Lỗi: ' + detail, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Run Bulk';
        }
    }

    async function loadRecent() {
        try {
            const { generations } = await window.AikolAPI.listGenerations(20, 0);
            const root = $('#bulk-recent');
            if (!generations || generations.length === 0) {
                root.innerHTML = '<div class="aikol-empty">Chưa có run nào.</div>';
                return;
            }
            root.innerHTML = generations
                .slice(0, 10)
                .map(
                    (g) => `
                <div class="aikol-credit-row">
                    <span class="aikol-credit-row__kind aikol-credit-row__kind--${escapeHtml(g.state)}">${escapeHtml(g.state)}</span>
                    <span style="flex:1;min-width:0">${escapeHtml(g.kind)} · model #${g.model_id}${g.clip_id ? ' · clip #' + g.clip_id : ''} · ${g.cost_credits} cr · ${g.output_count} output</span>
                    <span style="color:var(--aikol-text-dim);font-size:0.78rem">${new Date(g.created_at * 1000).toLocaleString('vi-VN')}</span>
                </div>`
                )
                .join('');
        } catch (e) {
            $('#bulk-recent').innerHTML =
                `<div class="aikol-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const form = $('#bulk-form');
        loadModelsInto(form.elements.model_id);
        refreshCredits();
        loadRecent();

        $('#preset-grid')
            .querySelectorAll('[data-preset]')
            .forEach((b) => {
                b.addEventListener('click', () => applyPreset(b.dataset.preset));
            });
        form.addEventListener('change', () => {
            toggleVideoBlock();
            refreshCostSummary();
        });
        form.addEventListener('input', refreshCostSummary);
        form.addEventListener('submit', onSubmit);
        toggleVideoBlock();
        refreshCostSummary();

        const queuePanel = document.getElementById('aikol-queue-panel');
        if (window.AikolGenerate && queuePanel) {
            window.AikolGenerate.startQueueWatch({
                container: queuePanel,
                onTerminal: () => {
                    refreshCredits();
                    loadRecent();
                },
            });
        }
    });
})();
