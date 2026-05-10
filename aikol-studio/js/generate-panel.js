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
                        <fieldset class="aikol-gen-fieldset" data-gen-mode-fieldset hidden>
                            <legend>Cách tạo</legend>
                            <label><input type="radio" name="gen_mode" value="with_clip" checked> 🎬 Ghép model vào clip này (image: CF FLUX compose · video: Kling multi-image2video native)</label>
                            <label><input type="radio" name="gen_mode" value="auto_scene"> ✨ AI tự sáng tạo scene (chỉ dùng prompt — không cần clip)</label>
                        </fieldset>

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
                                <option value="cf_flux" selected>CF FLUX-2 — 4cr/variation · FREE 10K neurons/day 🆓</option>
                                <option value="fal_pulid">Fal PuLID — 4cr/variation · nhanh (cần top-up)</option>
                                <!-- gemini_3_1 ẩn khỏi UI — vẫn hoạt động khi CF fail/quota (auto-fallback backend). -->
                            </select>
                        </label>
                        <label class="aikol-gen-row" data-video-only style="display:none">
                            <span>Engine (video)</span>
                            <select name="engine_video" data-engine-video>
                                <!-- Options rebuilt theo gen_mode: with_clip → Kling vid2vid; auto_scene → Veo + Kling img2vid -->
                            </select>
                        </label>

                        <!-- Settings chính: chỉ những thứ thật sự ảnh hưởng output. -->
                        <div class="aikol-gen-grid">
                            <label class="aikol-gen-row" style="grid-column: 1 / -1">
                                <span>Variations / clip</span>
                                <span class="aikol-pill-row" data-variations-pills>
                                    <button type="button" data-var="1" class="aikol-pill aikol-pill--active">1</button>
                                    <button type="button" data-var="3" class="aikol-pill">3</button>
                                    <button type="button" data-var="5" class="aikol-pill">5</button>
                                    <button type="button" data-var="10" class="aikol-pill">10</button>
                                    <input type="hidden" name="variations" value="1" />
                                </span>
                            </label>
                            <label class="aikol-gen-row" style="grid-column: 1 / -1">
                                <span>Aspect ratio</span>
                                <select name="image_size">
                                    <option value="9:16" selected>9:16 (đứng - TikTok)</option>
                                    <option value="1:1">1:1 (vuông)</option>
                                    <option value="16:9">16:9 (ngang)</option>
                                </select>
                            </label>
                        </div>

                        <!-- Framing — 5 mode -->
                        <label class="aikol-gen-row">
                            <span>Framing (shot type)</span>
                            <select name="shot_type" data-shot-select>
                                <!-- Options injected từ AikolPresets.SHOT_TYPES -->
                            </select>
                        </label>

                        <!-- Scene mode — 3 radio + multi-preset checkbox panel -->
                        <fieldset class="aikol-gen-fieldset" data-scene-mode-fieldset>
                            <legend style="font-size:0.85rem">Scene</legend>
                            <label style="display:block">
                                <input type="radio" name="scene_mode" value="match" checked />
                                Match clip's scene (giữ nguyên setting clip gốc)
                            </label>
                            <label style="display:block">
                                <input type="radio" name="scene_mode" value="preset" />
                                Pick presets (chọn 1+ scenes, mix variants)
                            </label>
                            <label style="display:block">
                                <input type="radio" name="scene_mode" value="free_form" />
                                Free-form prompt (mô tả scene riêng)
                            </label>
                            <div data-scene-presets-panel hidden style="margin-top:0.5rem; display:grid; grid-template-columns:repeat(2, 1fr); gap:0.3rem; font-size:0.82rem">
                                <!-- Checkbox grid injected từ AikolPresets.SCENE_PRESETS -->
                            </div>
                        </fieldset>

                        <!-- Style Strength slider (scene mood) -->
                        <label class="aikol-gen-row">
                            <span>Style strength <em data-tier="style" style="font-style:normal; color:var(--aikol-text-dim); font-size:0.78rem; margin-left:0.4rem">— Balanced</em></span>
                            <input type="range" name="style_strength" min="0" max="100" value="50" data-style-input />
                        </label>

                        <!-- Auto-tune note hiện khi with_clip — báo user biết các setting "ẩn" đã được tối ưu. -->
                        <p
                            data-clip-only-block
                            style="margin: 0; padding: 0.5rem 0.75rem; background: var(--aikol-bg-soft, rgba(99,102,241,0.08)); border-left: 3px solid var(--aikol-accent, #6366F1); font-size: 0.78rem; color: var(--aikol-text-dim); border-radius: 4px"
                        >
                            ✨ Auto-tune đã bật: similarity 80 · creativity 30 · giữ pose/outfit/bg/lighting từ clip · engine
                            <strong>Kling multi-image2video</strong> (1-step face-swap)
                        </p>

                        <!-- Advanced: ẩn mặc định, các setting tác động yếu hoặc đã bị auto-tune force. -->
                        <details
                            class="aikol-gen-fieldset aikol-gen-details"
                            style="padding: 0.5rem 0.75rem"
                        >
                            <summary style="cursor: pointer; font-size: 0.85rem; color: var(--aikol-text-dim)">
                                🔧 Tinh chỉnh nâng cao (auto-tune sẽ override)
                            </summary>
                            <style>
                                /* Force-hide children when collapsed — global .aikol-gen-row{display:flex} overrides browser UA. */
                                details.aikol-gen-details:not([open]) > *:not(summary) {
                                    display: none !important;
                                }
                            </style>
                            <div class="aikol-gen-grid" style="margin-top: 0.6rem">
                                <label class="aikol-gen-row">
                                    <span>Similarity (identity) <em data-tier="similarity" style="font-style:normal; color:var(--aikol-text-dim); font-size:0.78rem; margin-left:0.4rem">— Strict</em></span>
                                    <input type="range" name="similarity" min="0" max="100" value="80" data-sim-input />
                                </label>
                                <label class="aikol-gen-row">
                                    <span>Creativity (unkept axes) <em data-tier="creativity" style="font-style:normal; color:var(--aikol-text-dim); font-size:0.78rem; margin-left:0.4rem">— Balanced</em></span>
                                    <input type="range" name="creativity" min="0" max="100" value="40" data-creat-input />
                                </label>
                            </div>
                            <fieldset
                                data-clip-only-block
                                style="border: 1px dashed var(--aikol-border, #ddd); padding: 0.4rem 0.6rem; margin-top: 0.5rem; font-size: 0.82rem"
                            >
                                <legend style="font-size: 0.78rem; padding: 0 0.3rem">
                                    Keep — locked attributes
                                </legend>
                                <label><input type="checkbox" name="keep_pose" checked> Pose</label>
                                <label><input type="checkbox" name="keep_outfit" checked> Outfit</label>
                                <label><input type="checkbox" name="keep_bg" checked> Background</label>
                                <label><input type="checkbox" name="keep_lighting" checked> Lighting</label>
                            </fieldset>
                        </details>

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
                                    <span style="display:flex; align-items:center; gap:0.5rem">
                                        <input type="range" name="duration_seconds" min="5" max="10" step="5" value="5" style="flex:1" data-duration-input />
                                        <span data-duration-label style="min-width:2.5em; text-align:right; font-variant-numeric:tabular-nums">5s</span>
                                    </span>
                                </label>
                            </div>
                            <p data-duration-hint style="margin:0.4rem 0 0; font-size:0.75rem; color:var(--aikol-text-dim)">
                                Kling chỉ cho 5s hoặc 10s. Tối đa = thời lượng clip gốc.
                                <strong>5s nhanh gấp đôi 10s</strong>.
                            </p>
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
        // Engine default — CF FLUX-2 (image, FREE) / Kling (video, native multi-image
        // face-swap khi with_clip). Gemini hidden in UI nhưng vẫn auto-fallback ở backend
        // khi CF unavailable / quota exceeded.
        obj.engine =
            obj.kind === 'image' ? obj.engine_image || 'cf_flux' : obj.engine_video || 'kling';
        delete obj.engine_image;
        delete obj.engine_video;
        return obj;
    }

    function computeCost(form) {
        const data = readForm(form);
        if (data.kind === 'image') {
            // gemini_3_1: 8cr (paid). cf_flux: 4cr (FREE tier 10K neurons/day).
            // fal_pulid: 4cr.
            const perVariation = data.engine === 'gemini_3_1' ? 8 : COSTS.image;
            return { total: perVariation * data.variations, engine: data.engine };
        }
        // Video — only Kling (Veo bỏ).
        const perSec =
            data.kling_mode === 'pro' ? COSTS.video_pro_per_sec : COSTS.video_std_per_sec;
        const engineLabel = data.kling_mode === 'pro' ? 'Kling pro' : 'Kling std';
        const sec = Math.max(COSTS.video_min_seconds, data.duration_seconds);
        const animate = perSec * sec;
        // Kling multi-image2video native (no compose cost).
        return { total: animate, engine: engineLabel, animate, compose: 0, sec, perSec };
    }

    // Credit → VND rate. Dựa trên packs nhỏ (Mini/Small/Standard) 333 VND/cr
    // (worst case cho user — packs lớn 300 VND/cr nhưng ít user dùng).
    const VND_PER_CREDIT = 333;
    function fmtVnd(cr) {
        return (cr * VND_PER_CREDIT).toLocaleString('vi-VN') + ' ₫';
    }

    const ENGINE_LABEL = {
        cf_flux: 'CF FLUX-2 🆓',
        gemini_3_1: 'Gemini 3.1',
        fal_pulid: 'Fal PuLID',
    };
    function refreshCostLabel(form) {
        const c = computeCost(form);
        const data = readForm(form);
        const totalVnd = fmtVnd(c.total);
        let breakdown;
        if (data.kind === 'image') {
            const label = ENGINE_LABEL[c.engine] || c.engine;
            breakdown = `${c.total} cr ≈ ${totalVnd} (${label} × ${data.variations})`;
        } else {
            breakdown = `${c.total} cr ≈ ${totalVnd} (${c.engine} ${c.sec}s × ${c.perSec}cr)`;
        }
        $('#aikol-gen-cost').textContent = breakdown;
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

    // Inject SHOT_TYPES options + SCENE_PRESETS checkboxes
    function setupShotTypeAndPresets(form) {
        const shotSel = form.querySelector('[data-shot-select]');
        const presetsPanel = form.querySelector('[data-scene-presets-panel]');
        const P = global.AikolPresets;
        if (!P) return;
        if (shotSel && !shotSel.options.length) {
            shotSel.innerHTML = P.SHOT_TYPES.map(
                (s, i) =>
                    `<option value="${s.id}"${i === 0 ? ' selected' : ''}>${escapeHtml(s.label)}</option>`
            ).join('');
        }
        if (presetsPanel && !presetsPanel.children.length) {
            presetsPanel.innerHTML = P.SCENE_PRESETS.map(
                (p) =>
                    `<label style="display:flex; gap:0.3rem; align-items:center"><input type="checkbox" name="scene_presets" value="${p.id}" /> ${escapeHtml(p.label)}</label>`
            ).join('');
        }
        // Toggle preset panel visibility based on scene_mode radio
        form.addEventListener('change', (ev) => {
            if (ev.target?.name === 'scene_mode') {
                presetsPanel.hidden = ev.target.value !== 'preset';
            }
        });
    }

    // Variations pill row 1/3/5/10 — sync hidden input
    function setupVariationsPills(form) {
        const row = form.querySelector('[data-variations-pills]');
        const hidden = row?.querySelector('input[name="variations"]');
        if (!row || !hidden) return;
        row.querySelectorAll('button[data-var]').forEach((btn) => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('button[data-var]').forEach((b) =>
                    b.classList.remove('aikol-pill--active')
                );
                btn.classList.add('aikol-pill--active');
                hidden.value = btn.dataset.var;
                hidden.dispatchEvent(new Event('input', { bubbles: true }));
                refreshCostLabel(form);
            });
        });
    }

    // Tier labels live-update khi user kéo slider (Similarity/Creativity/Style)
    function setupTierLabels(form) {
        const P = global.AikolPresets;
        if (!P) return;
        const update = () => {
            const sim = form.querySelector('[data-sim-input]');
            const creat = form.querySelector('[data-creat-input]');
            const style = form.querySelector('[data-style-input]');
            const simT = form.querySelector('[data-tier="similarity"]');
            const creT = form.querySelector('[data-tier="creativity"]');
            const styT = form.querySelector('[data-tier="style"]');
            if (sim && simT) simT.textContent = '— ' + P.similarityTier(sim.value);
            if (creat && creT) creT.textContent = '— ' + P.creativityTier(creat.value);
            if (style && styT) styT.textContent = '— ' + P.styleStrengthTier(style.value);
        };
        form.addEventListener('input', (ev) => {
            const n = ev.target?.name;
            if (n === 'similarity' || n === 'creativity' || n === 'style_strength') update();
        });
        update();
    }

    // Duration slider: max = clip duration (clamp 10), step 5 (Kling chỉ accept
    // 5 hoặc 10). Default 5s. Khi clip < 10s → disable max=10. Live update label.
    function setupDurationSlider(form, clip) {
        const input = form.querySelector('[data-duration-input]');
        const label = form.querySelector('[data-duration-label]');
        if (!input || !label) return;
        // Quantize clip.duration xuống 5 hoặc 10. Mặc định 10 nếu không có clip.
        const clipDur = clip?.duration ? parseFloat(clip.duration) : 10;
        const maxAllowed = clipDur >= 10 ? 10 : 5;
        input.max = String(maxAllowed);
        input.value = '5'; // default
        label.textContent = '5s';
        if (maxAllowed === 5) {
            input.disabled = true;
            label.textContent = '5s (clip ngắn)';
        } else {
            input.disabled = false;
        }
        input.addEventListener('input', () => {
            label.textContent = `${input.value}s`;
            refreshCostLabel(form);
        });
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

    // Toggle visibility of clip-dependent blocks based on `gen_mode` radio.
    // When user picks "AI tự sáng tạo scene" → hide "Keep from clip" + force note
    // placeholder + warn if note empty (note becomes the only signal Gemini has).
    // Cũng rebuild engine_video options theo mode (Kling vid2vid khi with_clip,
    // Veo 3.1 image2video khi auto_scene).
    function setupGenModeToggle(form, hasClip) {
        const fieldset = form.querySelector('[data-gen-mode-fieldset]');
        const clipOnlyBlocks = form.querySelectorAll('[data-clip-only-block]');
        const noteEl = form.querySelector('textarea[name="note"]');
        const engineVidSel = form.querySelector('[data-engine-video]');
        if (!fieldset) return;
        if (!hasClip) {
            fieldset.hidden = true;
            const autoRadio = form.querySelector('input[name="gen_mode"][value="auto_scene"]');
            if (autoRadio) autoRadio.checked = true;
        } else {
            fieldset.hidden = false;
        }
        // Lưu ý API thực tế: Kling public API KHÔNG có endpoint video2video /
        // face-swap-clip — feature đó trên Kling web UI yêu cầu Custom Face Model
        // không expose qua API. Cả Veo + Kling chỉ làm image2video; "with_clip"
        // mode dùng cover frame + note để bake scene vào prompt, không phải
        // ghép identity vào video clip thật sự.
        const rebuildEngineVideoOptions = (mode) => {
            if (!engineVidSel) return;
            const prev = engineVidSel.value;
            // Veo 3 đã bỏ — chỉ còn Kling. Giữ array opts cho future engines.
            const opts =
                mode === 'with_clip'
                    ? [
                          {
                              v: 'kling',
                              t: '🎬 Kling multi-image2video — native face-swap (8-13cr/s)',
                          },
                      ]
                    : [
                          {
                              v: 'kling',
                              t: '🎬 Kling image2video — animate ảnh model (8-13cr/s)',
                          },
                      ];
            engineVidSel.innerHTML = opts
                .map(
                    (o, i) =>
                        `<option value="${o.v}"${i === 0 ? ' selected' : ''}>${escapeHtml(o.t)}</option>`
                )
                .join('');
            if (prev && opts.some((o) => o.v === prev)) engineVidSel.value = prev;
        };
        const update = () => {
            const mode = form.elements.gen_mode?.value || (hasClip ? 'with_clip' : 'auto_scene');
            const auto = mode === 'auto_scene';
            clipOnlyBlocks.forEach((el) => (el.style.display = auto ? 'none' : ''));
            if (noteEl) {
                noteEl.placeholder = auto
                    ? '🎯 Mô tả CHI TIẾT scene để AI tạo từ đầu — vd: "ngồi quán cafe sân vườn buổi sáng, ánh nắng xuyên qua tán cây, mặc áo sweater be, tay cầm ly latte, biểu cảm thư giãn"'
                    : 'e.g. evening street market, soft golden light';
            }
            rebuildEngineVideoOptions(mode);
        };
        form.addEventListener('change', (ev) => {
            if (ev.target?.name === 'gen_mode') update();
        });
        update();
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
            meta.textContent = 'Không có clip — AI sẽ tự sáng tạo scene từ prompt.';
            delete root.dataset.clipId;
        }
        const form = $('#aikol-gen-form', root);
        form.reset();
        await loadModelsInto(form.elements.model_id);
        setupVideoToggle(form);
        setupGenModeToggle(form, !!clip);
        setupNoteSuggestButton(form);
        setupDurationSlider(form, clip);
        setupShotTypeAndPresets(form);
        setupVariationsPills(form);
        setupTierLabels(form);
        form.onsubmit = async (ev) => {
            ev.preventDefault();
            const data = readForm(form);
            if (!data.model_id) {
                showToast('Chọn 1 model trước', 'error');
                return;
            }
            // Chế độ AI tự sáng tạo → bắt buộc note (Gemini/Veo cần prompt).
            const useClip = data.gen_mode === 'with_clip' && !!clip;
            const note = (data.note || '').trim();
            if (!useClip && note.length < 10) {
                showToast('Chế độ AI tự sáng tạo cần mô tả scene chi tiết (≥10 ký tự)', 'error');
                return;
            }
            // Cost guard >5.000 ₫ — confirm để tránh burn accidental.
            const cInfo = computeCost(form);
            const totalVnd = cInfo.total * VND_PER_CREDIT;
            if (totalVnd > 5000) {
                const msg = `Chi phí: ${cInfo.total} cr ≈ ${totalVnd.toLocaleString('vi-VN')} ₫.\nTiếp tục submit?`;
                const confirmed =
                    typeof window.aikolConfirm === 'function'
                        ? await window.aikolConfirm(msg, 'Tạo', 'Huỷ')
                        : window.confirm(msg);
                if (!confirmed) return;
            }
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang gửi…';
            try {
                // Collect multi-checkbox scene_presets array
                const scenePresetIds = Array.from(
                    form.querySelectorAll('input[name="scene_presets"]:checked')
                ).map((el) => el.value);
                // Scene mode from radio (default match)
                const sceneMode =
                    form.querySelector('input[name="scene_mode"]:checked')?.value ||
                    (useClip ? 'match' : 'free_form');
                const payload = {
                    kind: data.kind,
                    model_id: parseInt(data.model_id, 10),
                    clip_ids: useClip ? [clip.id] : [],
                    config: {
                        engine: data.engine,
                        variations: parseInt(data.variations, 10) || 1,
                        similarity: data.similarity,
                        creativity: data.creativity,
                        style_strength: parseInt(data.style_strength, 10) || 50,
                        keep_pose: useClip ? data.keep_pose : false,
                        keep_outfit: useClip ? data.keep_outfit : false,
                        keep_bg: useClip ? data.keep_bg : false,
                        keep_lighting: useClip ? data.keep_lighting : false,
                        image_size: data.image_size,
                        shot_type: data.shot_type || 'auto',
                        scene_mode: sceneMode,
                        scene_presets: sceneMode === 'preset' ? scenePresetIds : [],
                        gen_mode: useClip ? 'with_clip' : 'auto_scene',
                        duration_seconds: data.duration_seconds,
                        kling_mode: data.kling_mode,
                    },
                    note: note || null,
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

    let _renderTickTimer = null;
    function startQueueWatch({ container, onTerminal } = {}) {
        stopQueueWatch();
        let lastQueueData = [];
        async function pollOnce() {
            try {
                const { queue } = await global.AikolAPI.getQueue();
                lastQueueData = queue || [];
                if (container) renderQueue(container, lastQueueData);
                const currentIds = new Set(lastQueueData.map((q) => q.id));
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
        // API poll mỗi 5s (tránh spam) nhưng UI re-render mỗi 1s để progress %
        // tăng smooth (compute từ Date.now() - started_at).
        watchTimer = setInterval(pollOnce, 5000);
        _renderTickTimer = setInterval(() => {
            if (container && lastQueueData.length) renderQueue(container, lastQueueData);
        }, 1000);
    }

    function stopQueueWatch() {
        if (watchTimer) clearInterval(watchTimer);
        watchTimer = null;
        if (_renderTickTimer) clearInterval(_renderTickTimer);
        _renderTickTimer = null;
    }

    // Estimated total seconds per kind+provider — dùng để compute % progress.
    // Số liệu lấy từ thực tế gen verified:
    //   - Gemini image (sync, no compose):   ~15s
    //   - Gemini compose + Veo animate:      ~60s
    //   - Kling multi-image2video:           ~100s
    //   - Kling image2video:                 ~80s
    function estimateTotalSec(q) {
        const kind = q.kind;
        const provider = q.config?.provider;
        const kindKey = q.config?.kind_key;
        if (kind === 'image') return 20;
        if (provider === 'kling' && kindKey === 'multi-image2video') return 110;
        if (provider === 'kling') return 80;
        if (provider === 'veo') return 90; // Veo + (compose 30s nếu with_clip)
        return 90; // fallback
    }

    function renderQueue(container, queue) {
        if (!container) return;
        if (!queue || queue.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        const now = Math.floor(Date.now() / 1000);
        container.innerHTML =
            `<h3 style="margin:0 0 0.5rem">Queue (${queue.length})</h3>` +
            queue
                .map((q) => {
                    let pct = 0;
                    let elapsedSec = 0;
                    let eta = '';
                    if (q.state === 'pending') {
                        pct = 5; // hiển thị thanh đang chờ
                        eta = 'đang chờ dispatch…';
                    } else if (q.state === 'dispatching') {
                        pct = 12;
                        eta = 'đang gửi job lên provider…';
                    } else if (q.state === 'running' && q.started_at) {
                        const total = estimateTotalSec(q);
                        elapsedSec = Math.max(0, now - q.started_at);
                        // Cap tại 95% để user biết chưa done
                        pct = Math.min(95, Math.round((elapsedSec / total) * 100));
                        const remain = Math.max(0, total - elapsedSec);
                        eta = elapsedSec >= total ? 'sắp xong…' : `~${remain}s còn lại`;
                    }
                    const elapsedDisplay = elapsedSec > 0 ? ` · ${elapsedSec}s` : '';
                    return `
                <div class="aikol-queue-item aikol-queue-item--${q.state}" style="display:grid; gap:0.3rem; padding:0.5rem 0.6rem; border:1px solid var(--aikol-border, rgba(255,255,255,0.08)); border-radius:6px; margin-bottom:0.4rem">
                    <div style="display:flex; justify-content:space-between; gap:0.5rem; font-size:0.85rem">
                        <span>${q.kind === 'video' ? '🎬' : '🖼️'} ${escapeHtml(q.kind)}${q.config?.engine ? ` · ${escapeHtml(q.config.engine)}` : ''}</span>
                        <span style="color:var(--aikol-text-dim); font-size:0.78rem">${q.cost_credits} cr${elapsedDisplay}</span>
                    </div>
                    <div style="height:6px; background:var(--aikol-bg-soft, rgba(99,102,241,0.1)); border-radius:3px; overflow:hidden">
                        <div style="height:100%; width:${pct}%; background:var(--aikol-accent, #6366F1); transition:width 0.5s ease"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--aikol-text-dim)">
                        <span>${escapeHtml(q.state)} · ${pct}%</span>
                        <span>${escapeHtml(eta)}</span>
                    </div>
                </div>`;
                })
                .join('');
    }

    global.AikolGenerate = {
        openForClip,
        close,
        startQueueWatch,
        stopQueueWatch,
    };
})(typeof window !== 'undefined' ? window : globalThis);
