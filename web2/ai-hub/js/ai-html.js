// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * AiHtml — tab "HTML Studio" của ai-hub. Chọn skill → dán data → AI free sinh HTML
 * đẹp (stream realtime vào iframe) → export PNG/HTML. Điều phối module shared
 * Web2HtmlSkill (web2/shared/web2-html-skill.js) — KHÔNG tự dựng lại logic AI.
 */
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const HS = () => global.Web2HtmlSkill;
    const toast = (m, t) => global.AiHub?.toast?.(m, t) || global.notificationManager?.show?.(m, t);

    const state = { skillId: null, abort: null, html: '', built: false, streaming: false };

    function onShow() {
        if (state.built) return;
        build();
    }
    function init() {
        /* lazy — chỉ build khi mở tab (onShow) */
    }

    function build() {
        const host = $('aihHtml');
        if (!host || !HS()) return;
        state.built = true;
        const skills = HS().skills();
        state.skillId = skills[0]?.id || null;

        host.innerHTML = `
            <div class="aihh">
                <div class="aihh-left">
                    <div class="aihh-section-label">1 · Chọn loại</div>
                    <div class="aihh-skills" id="aihhSkills">
                        ${skills
                            .map(
                                (s) =>
                                    `<button class="aihh-skill ${s.id === state.skillId ? 'is-on' : ''}" data-skill="${s.id}" title="${esc(s.hint)}">
                                        <span class="aihh-skill-emoji">${s.emoji}</span>
                                        <span class="aihh-skill-label">${esc(s.label)}</span>
                                        <span class="aihh-skill-size">${esc(s.size.label)}</span>
                                    </button>`
                            )
                            .join('')}
                    </div>

                    <div class="aihh-section-label">2 · Dữ liệu</div>
                    <textarea id="aihhData" class="aihh-data" rows="9" placeholder=""></textarea>
                    <input id="aihhExtra" class="aihh-extra" type="text" placeholder="Yêu cầu thêm (tuỳ chọn): tông màu, phong cách…" />

                    <div class="aihh-actions">
                        <button id="aihhGen" class="aihh-btn primary"><i data-lucide="sparkles"></i> Tạo HTML</button>
                        <button id="aihhStop" class="aihh-btn" hidden><i data-lucide="square"></i> Dừng</button>
                        <button id="aihhPng" class="aihh-btn" disabled><i data-lucide="image-down"></i> PNG</button>
                        <button id="aihhDl" class="aihh-btn" disabled><i data-lucide="download"></i> HTML</button>
                        <button id="aihhOpen" class="aihh-btn" disabled><i data-lucide="external-link"></i> Mở tab</button>
                    </div>
                    <div class="aihh-status" id="aihhStatus">Free AI (Gemini/Groq/OpenRouter) · luật chống "AI slop" bật sẵn.</div>
                </div>

                <div class="aihh-right">
                    <div class="aihh-preview-head">
                        <span>Xem trước</span>
                        <span class="aihh-size" id="aihhSizeLabel"></span>
                    </div>
                    <div class="aihh-stage" id="aihhStage">
                        <div class="aihh-empty" id="aihhEmpty">Chọn loại → dán data → bấm “Tạo HTML”.</div>
                        <iframe id="aihhFrame" class="aihh-frame" title="preview" hidden></iframe>
                    </div>
                </div>
            </div>`;

        // events
        host.querySelectorAll('.aihh-skill').forEach((b) =>
            b.addEventListener('click', () => selectSkill(b.dataset.skill))
        );
        $('aihhGen').addEventListener('click', generate);
        $('aihhStop').addEventListener('click', stop);
        $('aihhPng').addEventListener('click', () =>
            HS().exportPng($('aihhFrame'), 'web2-' + state.skillId)
        );
        $('aihhDl').addEventListener('click', () =>
            HS().exportHtml(state.html, 'web2-' + state.skillId)
        );
        $('aihhOpen').addEventListener('click', openTab);
        selectSkill(state.skillId);
        if (global.lucide) global.lucide.createIcons();
        window.addEventListener('resize', fitPreview);
    }

    function esc(s) {
        return global.AiHub?.escapeHtml?.(s) ?? String(s ?? '');
    }

    function selectSkill(id) {
        state.skillId = id;
        const sk = HS().skill(id);
        const meta = HS()
            .skills()
            .find((s) => s.id === id);
        document
            .querySelectorAll('.aihh-skill')
            .forEach((b) => b.classList.toggle('is-on', b.dataset.skill === id));
        const ta = $('aihhData');
        if (ta) ta.placeholder = meta?.hint || 'Dán dữ liệu…';
        const sl = $('aihhSizeLabel');
        if (sl) sl.textContent = meta ? meta.size.label : '';
        fitPreview();
    }

    function setBusy(on) {
        state.streaming = on;
        $('aihhGen').hidden = on;
        $('aihhStop').hidden = !on;
        ['aihhPng', 'aihhDl', 'aihhOpen'].forEach((id) => ($(id).disabled = on || !state.html));
    }

    async function generate() {
        const data = ($('aihhData').value || '').trim();
        if (!data) return toast('Dán dữ liệu trước đã', 'warning');
        if (state.streaming) return;
        const extra = ($('aihhExtra').value || '').trim();
        const frame = $('aihhFrame');
        const empty = $('aihhEmpty');
        empty.hidden = true;
        frame.hidden = false;
        state.html = '';
        state.abort = new AbortController();
        setBusy(true);
        $('aihhStatus').textContent = 'Đang sinh HTML… (xem trực tiếp bên phải)';
        try {
            const html = await HS().generate({
                skillId: state.skillId,
                data,
                extra,
                signal: state.abort.signal,
                onDelta: (full) => {
                    // stream: render partial (clean nhẹ) để xem realtime
                    HS().renderToIframe(frame, HS().cleanHtml(full));
                    fitPreview();
                },
            });
            state.html = html;
            HS().renderToIframe(frame, html);
            fitPreview();
            $('aihhStatus').textContent = 'Xong ✓ — xuất PNG/HTML hoặc chỉnh data rồi tạo lại.';
            toast('Đã tạo HTML', 'success');
        } catch (e) {
            if (e?.name === 'AbortError') {
                $('aihhStatus').textContent = 'Đã dừng.';
            } else {
                console.error('[ai-html] generate', e);
                $('aihhStatus').textContent = 'Lỗi: ' + (e.message || e);
                toast('Tạo HTML lỗi: ' + (e.message || e), 'error');
            }
        } finally {
            setBusy(false);
        }
    }

    function stop() {
        if (state.abort) state.abort.abort();
    }

    function openTab() {
        if (!state.html) return;
        const blob = new Blob([state.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // Scale iframe (kích thước thật theo skill) vừa khung preview.
    function fitPreview() {
        const frame = $('aihhFrame');
        const stage = $('aihhStage');
        if (!frame || !stage || frame.hidden) return;
        const meta = HS()
            .skills()
            .find((s) => s.id === state.skillId);
        if (!meta) return;
        const { w, h } = meta.size;
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
        const availW = stage.clientWidth - 24;
        const availH = stage.clientHeight - 24;
        const scale = Math.min(availW / w, availH / h, 1);
        frame.style.transform = `scale(${scale})`;
        frame.style.transformOrigin = 'top left';
        // căn giữa khối đã scale
        stage.style.setProperty('--fit-w', w * scale + 'px');
        stage.style.setProperty('--fit-h', h * scale + 'px');
    }

    global.AiHtml = { init, onShow };
})(window);
