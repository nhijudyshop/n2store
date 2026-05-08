// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// AI KOL Studio — Sprint 3 Generate panel.
//
// Exposes window.AikolGenerate.openForClip(clip) — opens a modal pre-filled with
// the clip and lets the user pick a model + config, then submits to /generations.
//
// Also exposes startQueueWatch(onUpdate?) — polls /queue every ~5s and renders
// active gen jobs. Caller passes a container element + optional callback fired on
// terminal state changes (so the parent page can refresh outputs).
(function (global) {
    'use strict';

    const COSTS = {
        image: 4,
        video_std_per_sec: 8,
        video_pro_per_sec: 13,
        video_min_seconds: 3,
    };

    function $(sel, root) {
        return (root || document).querySelector(sel);
    }

    function showToast(msg, kind) {
        const el = document.createElement('div');
        el.className = 'aikol-toast' + (kind ? ` aikol-toast--${kind}` : '');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function ensureModalRoot() {
        let root = document.getElementById('aikol-gen-modal-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'aikol-gen-modal-root';
        root.innerHTML = `
            <div class="aikol-modal-backdrop" hidden>
                <div class="aikol-modal aikol-gen-modal" role="dialog" aria-modal="true">
                    <header class="aikol-gen-modal__head">
                        <div>
                            <h3 style="margin:0">Generate</h3>
                            <p id="aikol-gen-clip-meta" style="color:var(--aikol-text-dim);font-size:0.85rem;margin:0.2rem 0 0">—</p>
                        </div>
                        <button type="button" class="aikol-icon-btn" data-close aria-label="Close">×</button>
                    </header>

                    <form id="aikol-gen-form" class="aikol-gen-modal__body">
                        <fieldset class="aikol-gen-fieldset">
                            <legend>Kind</legend>
                            <label><input type="radio" name="kind" value="image" checked> Image (4-8 cr/variation)</label>
                            <label><input type="radio" name="kind" value="video"> Video (8-16 cr/sec)</label>
                        </fieldset>

                        <label class="aikol-gen-row">
                            <span>Model</span>
                            <select name="model_id" required></select>
                        </label>

                        <label class="aikol-gen-row" data-image-only>
                            <span>Engine (image)</span>
                            <select name="engine_image">
                                <option value="gemini_3_1" selected>Gemini 3.1 — 8cr/variation · scene match tốt nhất ⭐</option>
                                <option value="fal_pulid">Fal PuLID — 4cr/variation · nhanh (cần top-up)</option>
                            </select>
                        </label>
                        <label class="aikol-gen-row" data-video-only style="display:none">
                            <span>Engine (video)</span>
                            <select name="engine_video">
                                <option value="veo_3_1" selected>Veo 3.1 — 16cr/s · Google · chất lượng cao ⭐</option>
                                <option value="kling">Kling — 8-13cr/s · image2video (cần top-up)</option>
                            </select>
                        </label>

                        <div class="aikol-gen-grid">
                            <label class="aikol-gen-row">
                                <span>Variations</span>
                                <input type="number" name="variations" min="1" max="10" value="1" />
                            </label>
                            <label class="aikol-gen-row">
                                <span>Image size</span>
                                <select name="image_size">
                                    <option value="9:16" selected>9:16</option>
                                    <option value="1:1">1:1</option>
                                    <option value="16:9">16:9</option>
                                </select>
                            </label>
                            <label class="aikol-gen-row">
                                <span>Similarity</span>
                                <input type="range" name="similarity" min="0" max="100" value="80" />
                            </label>
                            <label class="aikol-gen-row">
                                <span>Creativity</span>
                                <input type="range" name="creativity" min="0" max="100" value="40" />
                            </label>
                            <label class="aikol-gen-row">
                                <span>Shot</span>
                                <select name="shot_type">
                                    <option value="match_clip" selected>Match clip</option>
                                    <option value="close_up">Close-up</option>
                                    <option value="waist_up">Waist-up</option>
                                    <option value="full_body">Full body</option>
                                </select>
                            </label>
                            <label class="aikol-gen-row">
                                <span>Scene</span>
                                <select name="scene_mode">
                                    <option value="match" selected>Match clip</option>
                                    <option value="free_form">Free-form (note)</option>
                                </select>
                            </label>
                        </div>

                        <fieldset class="aikol-gen-fieldset">
                            <legend>Keep from clip</legend>
                            <label><input type="checkbox" name="keep_pose" checked> Pose</label>
                            <label><input type="checkbox" name="keep_outfit"> Outfit</label>
                            <label><input type="checkbox" name="keep_bg"> Background</label>
                            <label><input type="checkbox" name="keep_lighting" checked> Lighting</label>
                        </fieldset>

                        <div data-video-only style="display:none">
                            <div class="aikol-gen-grid">
                                <label class="aikol-gen-row">
                                    <span>Mode</span>
                                    <select name="kling_mode">
                                        <option value="std" selected>Standard (8 cr/s)</option>
                                        <option value="pro">Pro (13 cr/s)</option>
                                    </select>
                                </label>
                                <label class="aikol-gen-row">
                                    <span>Duration</span>
                                    <select name="duration_seconds">
                                        <option value="5" selected>5s</option>
                                        <option value="10">10s</option>
                                    </select>
                                </label>
                            </div>
                        </div>

                        <label class="aikol-gen-row">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap">
                                <span>Note (optional)</span>
                                <button type="button" class="aikol-btn aikol-btn--secondary" data-act="suggest-note" style="font-size:0.75rem; padding:0.25rem 0.6rem">🎲 Gợi ý scene</button>
                            </div>
                            <textarea name="note" rows="2" maxlength="500" placeholder="e.g. evening street market, soft golden light"></textarea>
                            <div data-suggest-list style="display:none; gap:0.4rem; flex-direction:column; margin-top:0.4rem"></div>
                        </label>

                        <footer class="aikol-gen-modal__foot">
                            <span id="aikol-gen-cost">—</span>
                            <button type="button" class="aikol-btn aikol-btn--secondary" data-close>Huỷ</button>
                            <button type="submit" class="aikol-btn">Generate</button>
                        </footer>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(root);
        const backdrop = root.querySelector('.aikol-modal-backdrop');
        root.addEventListener('click', (e) => {
            if (e.target.matches('[data-close]') || e.target === backdrop) close();
        });
        return root;
    }

    function close() {
        const root = document.getElementById('aikol-gen-modal-root');
        if (root) root.querySelector('.aikol-modal-backdrop').hidden = true;
    }

    async function loadModelsInto(select) {
        select.innerHTML = '<option value="">Loading…</option>';
        try {
            const { models } = await global.AikolAPI.listModels();
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
            select.disabled = true;
        }
    }

    function escapeHtml(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function readForm(form) {
        const fd = new FormData(form);
        const obj = {};
        fd.forEach((v, k) => (obj[k] = v));
        // Convert checkboxes (only present if checked).
        ['keep_pose', 'keep_outfit', 'keep_bg', 'keep_lighting'].forEach(
            (k) => (obj[k] = form.elements[k].checked)
        );
        obj.variations = parseInt(obj.variations, 10) || 1;
        obj.similarity = parseInt(obj.similarity, 10);
        obj.creativity = parseInt(obj.creativity, 10);
        obj.duration_seconds = parseInt(obj.duration_seconds, 10) || 5;
        // Engine — pick from the visible field per kind. Default Gemini 3.1 / Veo 3.1
        // (Fal + Kling vẫn chọn được nhưng provider account cần top-up).
        obj.engine =
            obj.kind === 'image' ? obj.engine_image || 'gemini_3_1' : obj.engine_video || 'veo_3_1';
        delete obj.engine_image;
        delete obj.engine_video;
        return obj;
    }

    function computeCost(form) {
        const data = readForm(form);
        if (data.kind === 'image') {
            const perVariation = data.engine === 'gemini_3_1' ? 8 : COSTS.image;
            return perVariation * data.variations;
        }
        let perSec;
        if (data.engine === 'veo_3_1') {
            perSec = 16; // COSTS.video_veo_per_sec
        } else {
            perSec = data.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec;
        }
        return perSec * Math.max(COSTS.video_min_seconds, data.duration_seconds);
    }

    function refreshCostLabel(form) {
        const cost = computeCost(form);
        $('#aikol-gen-cost').textContent = `${cost} credits`;
    }

    // Wire the 🎲 "Gợi ý scene" button next to Note textarea.
    // Renders 4 scene-note suggestions, click-to-fill into the textarea.
    function setupNoteSuggestButton(form) {
        const btn = form.querySelector('[data-act="suggest-note"]');
        const noteEl = form.querySelector('textarea[name="note"]');
        const listEl = form.querySelector('[data-suggest-list]');
        if (!btn || !noteEl || !listEl || !window.aikolPromptGenerator) return;
        if (btn._wired) return;
        btn._wired = true;

        const render = () => {
            const kind = form.elements.kind?.value === 'video' ? 'video' : 'image';
            const items = window.aikolPromptGenerator.generateSceneNotes({
                type: kind,
                count: 4,
            });
            listEl.style.display = 'flex';
            listEl.innerHTML = items
                .map(
                    (it) => `
                <button type="button" class="aikol-prompt-card" style="padding:0.5rem 0.65rem; gap:0.2rem">
                    <div class="aikol-prompt-card__head" style="font-size:0.68rem">
                        <span class="aikol-prompt-card__vibe">${escapeHtmlAttr(it.locationSet)}</span>
                    </div>
                    <div class="aikol-prompt-card__body" style="-webkit-line-clamp:2; font-size:0.78rem">${escapeHtmlAttr(it.note)}</div>
                </button>`
                )
                .join('');
            Array.from(listEl.querySelectorAll('button')).forEach((b, i) => {
                b.addEventListener('click', () => {
                    noteEl.value = items[i].note;
                    noteEl.dispatchEvent(new Event('input', { bubbles: true }));
                    listEl.style.display = 'none';
                    showToast('Đã chọn scene', 'success');
                });
            });
        };
        btn.addEventListener('click', render);
    }

    function escapeHtmlAttr(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setupVideoToggle(form) {
        const videoBlocks = form.querySelectorAll('[data-video-only]');
        const imageBlocks = form.querySelectorAll('[data-image-only]');
        function update() {
            const kind = form.elements.kind.value;
            const isVideo = kind === 'video';
            videoBlocks.forEach((el) => (el.style.display = isVideo ? '' : 'none'));
            imageBlocks.forEach((el) => (el.style.display = isVideo ? 'none' : ''));
        }
        form.addEventListener('change', () => {
            update();
            refreshCostLabel(form);
        });
        form.addEventListener('input', () => refreshCostLabel(form));
        update();
        refreshCostLabel(form);
    }

    async function openForClip(clip) {
        const root = ensureModalRoot();
        root.querySelector('.aikol-modal-backdrop').hidden = false;
        const meta = $('#aikol-gen-clip-meta', root);
        if (clip) {
            meta.textContent = `Clip #${clip.id} — ${clip.title || clip.video_id || ''}`.slice(
                0,
                180
            );
            root.dataset.clipId = clip.id;
        } else {
            meta.textContent = 'Không có clip — generate từ model only.';
            delete root.dataset.clipId;
        }
        const form = $('#aikol-gen-form', root);
        form.reset();
        await loadModelsInto(form.elements.model_id);
        setupVideoToggle(form);
        setupNoteSuggestButton(form);
        form.onsubmit = async (ev) => {
            ev.preventDefault();
            const data = readForm(form);
            if (!data.model_id) {
                showToast('Chọn 1 model trước', 'error');
                return;
            }
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang gửi…';
            try {
                const payload = {
                    kind: data.kind,
                    model_id: parseInt(data.model_id, 10),
                    clip_ids: clip ? [clip.id] : [],
                    config: {
                        engine: data.engine,
                        variations: data.variations,
                        similarity: data.similarity,
                        creativity: data.creativity,
                        keep_pose: data.keep_pose,
                        keep_outfit: data.keep_outfit,
                        keep_bg: data.keep_bg,
                        keep_lighting: data.keep_lighting,
                        image_size: data.image_size,
                        shot_type: data.shot_type,
                        scene_mode: data.scene_mode,
                        duration_seconds: data.duration_seconds,
                        kling_mode: data.kling_mode,
                    },
                    note: data.note || null,
                };
                const res = await global.AikolAPI.submitGeneration(payload);
                showToast(`Đã gửi ${res.count} job · còn ${res.balance} credits`, 'success');
                close();
                global.dispatchEvent(
                    new CustomEvent('aikol:generation-submitted', { detail: res })
                );
            } catch (e) {
                console.error('[aikol] submitGeneration', e);
                const detail = e.data && e.data.detail ? e.data.detail : e.message;
                showToast(`Lỗi: ${detail}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Generate';
            }
        };
    }

    // ---------- queue watcher ----------
    let watchTimer = null;
    let lastQueueIds = new Set();

    function startQueueWatch({ container, onTerminal } = {}) {
        stopQueueWatch();
        async function pollOnce() {
            try {
                const { queue } = await global.AikolAPI.getQueue();
                if (container) renderQueue(container, queue);
                const currentIds = new Set(queue.map((q) => q.id));
                // detect terminal transitions
                const terminated = [...lastQueueIds].filter((id) => !currentIds.has(id));
                if (terminated.length && typeof onTerminal === 'function') {
                    onTerminal(terminated);
                }
                lastQueueIds = currentIds;
            } catch (e) {
                console.warn('[aikol] queue poll', e.message);
            }
        }
        pollOnce();
        watchTimer = setInterval(pollOnce, 5000);
    }

    function stopQueueWatch() {
        if (watchTimer) clearInterval(watchTimer);
        watchTimer = null;
    }

    function renderQueue(container, queue) {
        if (!container) return;
        if (!queue || queue.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        container.innerHTML =
            `<h3 style="margin:0 0 0.5rem">Queue (${queue.length})</h3>` +
            queue
                .map(
                    (q) => `
                <div class="aikol-queue-item aikol-queue-item--${q.state}">
                    <span>${escapeHtml(q.kind)}</span>
                    <span>${escapeHtml(q.state)}</span>
                    <span style="color:var(--aikol-text-dim);font-size:0.78rem">${q.cost_credits} cr</span>
                </div>`
                )
                .join('');
    }

    global.AikolGenerate = {
        openForClip,
        close,
        startQueueWatch,
        stopQueueWatch,
    };
})(typeof window !== 'undefined' ? window : globalThis);
