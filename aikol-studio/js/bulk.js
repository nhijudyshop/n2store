// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Sprint 5 Bulk Generate page (3-step horizontal layout).

(function () {
    'use strict';
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

    const COSTS = {
        image: 4,
        video_std_per_sec: 8,
        video_pro_per_sec: 13,
        video_min_seconds: 3,
    };

    const PRESETS = {
        favorites_image: {
            label: 'Favorites → Image',
            kind: 'image',
            variations: 1,
            limit: 20,
            favorite_only: true,
            image_size: '9:16',
            keep_pose: true,
            keep_lighting: true,
        },
        recent_image_3: {
            label: 'Recent 5 → 3 images',
            kind: 'image',
            variations: 3,
            limit: 5,
            favorite_only: false,
            image_size: '9:16',
            keep_pose: false,
            keep_lighting: true,
        },
        favorites_video: {
            label: 'Favorites → Video std',
            kind: 'video',
            variations: 1,
            limit: 5,
            favorite_only: true,
            kling_mode: 'std',
            duration_seconds: 5,
            keep_pose: true,
        },
        custom: { label: 'Custom', kind: 'image' },
    };

    let activePreset = null;
    let allClips = [];
    let lastClipsFetchAt = 0;

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
            const chip = $('#aikol-credits');
            if (chip) chip.textContent = `${balance} credits · ${plan}`;
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

    async function fetchClips() {
        // Cache for 30s — bulk page filtering doesn't need fresher data than that.
        if (allClips.length && Date.now() - lastClipsFetchAt < 30000) return allClips;
        try {
            const { clips } = await window.AikolAPI.listClips(200, 0);
            allClips = (clips || []).filter((c) => c.download_status === 'done' && c.file_path);
            lastClipsFetchAt = Date.now();
        } catch (e) {
            console.warn('[bulk] listClips', e.message);
        }
        return allClips;
    }

    function readForm() {
        const form = $('#bulk-form');
        const fd = new FormData(form);
        const o = {};
        fd.forEach((v, k) => (o[k] = v));
        ['favorite_only', 'keep_pose', 'keep_outfit', 'keep_bg', 'keep_lighting'].forEach(
            (k) => (o[k] = form.elements[k]?.checked || false)
        );
        o.variations = parseInt(o.variations, 10) || 1;
        o.limit = parseInt(o.limit, 10) || 10;
        o.duration_seconds = parseInt(o.duration_seconds, 10) || 5;
        o.min_views = o.min_views ? parseInt(o.min_views, 10) : null;
        return o;
    }

    function matchClip(clip, filter) {
        if (filter.platform && clip.platform !== filter.platform) return false;
        if (filter.username && (clip.username || '') !== filter.username) return false;
        if (filter.favorite_only && !clip.favorite) return false;
        if (filter.min_views != null && (clip.view_count || 0) < filter.min_views) return false;
        return true;
    }

    function filterClips() {
        const o = readForm();
        const matched = allClips.filter((c) =>
            matchClip(c, {
                platform: o.platform || null,
                username: o.username || null,
                favorite_only: o.favorite_only,
                min_views: o.min_views,
            })
        );
        return matched.slice(0, o.limit);
    }

    function renderClipPreview(clips) {
        const root = $('#bulk-clip-preview');
        if (!root) return;
        if (allClips.length === 0) {
            root.innerHTML = `<div class="aikol-empty" style="padding:1.25rem 0.5rem;font-size:0.85rem">
                Chưa có clip nào. <a href="library.html" style="color:var(--aikol-accent-light)">Import clip từ Library →</a>
            </div>`;
            return;
        }
        if (clips.length === 0) {
            root.innerHTML = `<div class="aikol-empty" style="padding:1.25rem 0.5rem;font-size:0.85rem">Không có clip nào khớp filter.</div>`;
            return;
        }
        root.innerHTML = clips
            .slice(0, 12)
            .map((c) => {
                const cover = c.cover_url || '';
                const fav = c.favorite ? '⭐' : '';
                return `<div class="aikol-bulk-thumb" title="${escapeHtml(c.title || c.video_id || '')}">
                    ${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">` : ''}
                    <span class="aikol-bulk-thumb__badge">${fav}</span>
                </div>`;
            })
            .join('');
    }

    function buildFilterLabel(o) {
        const bits = [];
        if (o.favorite_only) bits.push('★ favorite');
        if (o.platform) bits.push(o.platform);
        if (o.username) bits.push('@' + o.username);
        if (o.min_views != null && o.min_views > 0) bits.push(`views ≥ ${o.min_views}`);
        return bits.length ? bits.join(' · ') : 'All clips';
    }

    function refreshLaunch() {
        const o = readForm();
        const matched = filterClips();
        const perClip =
            o.kind === 'image'
                ? COSTS.image * (o.variations || 1)
                : (o.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec) *
                  Math.max(COSTS.video_min_seconds, o.duration_seconds);
        const total = perClip * matched.length;

        $('#launch-preset').textContent = activePreset
            ? PRESETS[activePreset]?.label || activePreset
            : 'Custom';
        $('#launch-output').textContent =
            o.kind === 'image'
                ? `image · ${o.variations} variation${o.variations > 1 ? 's' : ''} · ${o.image_size || ''}`
                : `video · ${o.kling_mode || 'std'} · ${o.duration_seconds}s`;
        $('#launch-filter').textContent = buildFilterLabel(o);
        $('#launch-matching').textContent =
            `${matched.length} clip${matched.length !== 1 ? 's' : ''}`;
        $('#launch-per').textContent = `${perClip} cr`;
        $('#launch-total').textContent = `${total} cr`;

        const matchCountEl = $('#bulk-match-count');
        if (matchCountEl) {
            matchCountEl.textContent = matched.length
                ? `(${matched.length} match${matched.length !== 1 ? 'es' : ''})`
                : '(0 matches)';
        }
        // Hidden legacy slot — keeps older deep test compatible.
        const legacy = $('#bulk-cost-summary');
        if (legacy)
            legacy.textContent = `~${perClip} cr / clip × ${matched.length} clips = ${total} cr (max)`;

        renderClipPreview(matched);

        // Disable launch button when no clips match
        const btn = $('#launch-btn');
        if (btn) {
            btn.disabled = matched.length === 0;
            btn.title = matched.length === 0 ? 'Không có clip khớp filter' : '';
        }
    }

    function applyPreset(presetId) {
        activePreset = presetId;
        const p = PRESETS[presetId];
        // Visual highlight
        $$('[data-preset]').forEach((b) => {
            b.classList.toggle('aikol-preset--active', b.dataset.preset === presetId);
        });
        if (!p || presetId === 'custom') {
            refreshLaunch();
            return;
        }
        const form = $('#bulk-form');
        Object.entries(p).forEach(([k, v]) => {
            if (k === 'label') return;
            const el = form.elements[k];
            if (!el) {
                if (k === 'kind') {
                    setKind(v);
                }
                return;
            }
            if (el.type === 'checkbox') el.checked = !!v;
            else el.value = v;
        });
        if (p.kind) setKind(p.kind);
        refreshLaunch();
    }

    function setKind(kind) {
        const form = $('#bulk-form');
        form.elements.kind.value = kind;
        $$('.aikol-segmented__btn').forEach((b) => {
            const active = b.dataset.kind === kind;
            b.classList.toggle('aikol-segmented__btn--active', active);
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        $$('[data-image-only]').forEach((el) => {
            el.style.display = kind === 'image' ? '' : 'none';
        });
        $$('[data-video-only]').forEach((el) => {
            el.style.display = kind === 'video' ? '' : 'none';
        });
    }

    function setQuickFilter(quick) {
        $$('[data-quick]').forEach((b) => {
            const active = b.dataset.quick === quick;
            b.classList.toggle('aikol-chip--active', active);
            b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const form = $('#bulk-form');
        switch (quick) {
            case 'all':
                form.elements.favorite_only.checked = false;
                form.elements.min_views.value = '';
                break;
            case 'favorites':
                form.elements.favorite_only.checked = true;
                break;
            case 'recent':
                form.elements.favorite_only.checked = false;
                form.elements.min_views.value = '';
                form.elements.limit.value = 5;
                break;
            case 'popular':
                form.elements.favorite_only.checked = false;
                form.elements.min_views.value = 100000;
                break;
        }
        refreshLaunch();
    }

    async function onSubmit(ev) {
        ev.preventDefault();
        const form = $('#bulk-form');
        const submitBtn = $('#launch-btn');
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
            submitBtn.textContent = '🚀 Launch';
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
                    <span class="aikol-credit-row__delta">${g.cost_credits} cr</span>
                    <span style="flex:1;min-width:0">${escapeHtml(g.kind)} · model #${g.model_id}${g.clip_id ? ' · clip #' + g.clip_id : ''} · ${g.output_count} output</span>
                    <span style="color:var(--aikol-text-dim);font-size:0.78rem">${new Date(g.created_at * 1000).toLocaleString('vi-VN')}</span>
                </div>`
                )
                .join('');
        } catch (e) {
            $('#bulk-recent').innerHTML =
                `<div class="aikol-empty">Lỗi: ${escapeHtml(e.message)}</div>`;
        }
    }

    function setupBulkNoteSuggest(form) {
        const btn = document.querySelector('#bulk-note-suggest-btn');
        const textarea = document.querySelector('#bulk-note-textarea');
        const list = document.querySelector('#bulk-note-suggest-list');
        if (!btn || !textarea || !list || !window.aikolPromptGenerator) return;
        btn.addEventListener('click', () => {
            const kind = form.elements.kind?.value === 'video' ? 'video' : 'image';
            const items = window.aikolPromptGenerator.generateSceneNotes({
                type: kind,
                count: 5,
            });
            list.style.display = 'flex';
            list.innerHTML = items
                .map(
                    (it) => `
                <button type="button" class="aikol-prompt-card" style="padding:0.5rem 0.65rem; gap:0.2rem">
                    <div class="aikol-prompt-card__head" style="font-size:0.68rem">
                        <span class="aikol-prompt-card__vibe">${it.locationSet}</span>
                    </div>
                    <div class="aikol-prompt-card__body" style="-webkit-line-clamp:2; font-size:0.78rem">${it.note.replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])}</div>
                </button>`
                )
                .join('');
            list.querySelectorAll('button').forEach((b, i) => {
                b.addEventListener('click', () => {
                    textarea.value = items[i].note;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    list.style.display = 'none';
                    showToast('Đã chọn scene', 'success');
                });
            });
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const form = $('#bulk-form');
        loadModelsInto(form.elements.model_id);
        refreshCredits();
        loadRecent();
        setupBulkNoteSuggest(form);

        // Segmented kind toggle
        $$('.aikol-segmented__btn').forEach((b) => {
            b.addEventListener('click', () => setKind(b.dataset.kind));
        });
        // Quick filter chips
        $$('[data-quick]').forEach((b) => {
            b.addEventListener('click', () => setQuickFilter(b.dataset.quick));
        });
        // Preset cards
        $$('[data-preset]').forEach((b) => {
            b.addEventListener('click', () => applyPreset(b.dataset.preset));
        });
        // Live update on every form change
        form.addEventListener('change', refreshLaunch);
        form.addEventListener('input', refreshLaunch);
        form.addEventListener('submit', onSubmit);

        await fetchClips();
        setKind('image');
        refreshLaunch();

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
