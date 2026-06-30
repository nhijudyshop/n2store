// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared module.
// =====================================================================
// Web2ContentMaker — "TẠO CARD / BÀI ĐĂNG / VIDEO từ data" 1 NGUỒN DÙNG CHUNG (hình 3).
//
// Chọn loại (Bài đăng FB · Card SP · Bảng giá · Voucher · Báo cáo CSV · Video HyperFrames)
// → dán data → AI FREE sinh HTML đẹp (stream realtime vào iframe) → export PNG/HTML, hoặc
// render MP4 (skill video) trên máy shop. ĐIỀU PHỐI module shared Web2HtmlSkill +
// Web2VideoRender — KHÔNG tự dựng lại logic AI.
//
// Tách hẳn khỏi orchestrator ai-hub → mount được vào BẤT KỲ container nào (widget ✨…).
// TỰ ĐẢM BẢO deps (Web2HtmlSkill, Web2VideoRender, DOMPurify, html2canvas) — lazy-load
// nếu thiếu → drop-in mọi trang Web 2.0 mà không cần khai báo <script> trước.
//
// API:  Web2ContentMaker.mount(container, opts) → { destroy() }
//   opts: { compact?:bool, defaultSkill?:string, defaultData?:string }
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ContentMaker) return;

    // ── base URL của thư mục web2/shared/ (để lazy-load module shared anh em) ──
    const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
    function sharedBase() {
        if (SELF_SRC) return SELF_SRC.replace(/[^/]*$/, ''); // .../web2/shared/
        const tag = document.querySelector('script[src*="/web2/shared/"]');
        return tag ? tag.src.replace(/web2\/shared\/[^/]*$/, 'web2/shared/') : '';
    }

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function toast(m, t) {
        try {
            global.notificationManager?.show?.(m, t || 'info');
        } catch (_) {}
    }

    // ── lazy script loader (dedupe theo src) ──
    const _loading = {};
    function loadScript(src) {
        if (!src) return Promise.reject(new Error('no src'));
        if (_loading[src]) return _loading[src];
        _loading[src] = new Promise((resolve, reject) => {
            const exist = [...document.scripts].find(
                (s) => s.src === src || s.src.split('?')[0] === src.split('?')[0]
            );
            if (exist && exist.dataset.w2cmLoaded) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.dataset.w2cmLoaded = '';
            s.onload = () => {
                s.dataset.w2cmLoaded = '1';
                resolve();
            };
            // Lỗi mạng tạm → XOÁ cache promise (KHÔNG kẹt reject vĩnh viễn) để lần sau
            // mở lại tool còn retry được, khỏi phải F5.
            s.onerror = () => {
                delete _loading[src];
                reject(new Error('load ' + src));
            };
            (document.head || document.documentElement).appendChild(s);
        });
        return _loading[src];
    }
    async function ensureDeps() {
        const base = sharedBase();
        if (!global.Web2HtmlSkill && base)
            await loadScript(base + 'web2-html-skill.js?v=20260625a');
        if (!global.Web2VideoRender && base)
            await loadScript(base + 'web2-video-render.js?v=20260625a').catch(() => {});
        if (!global.DOMPurify)
            await loadScript(
                'https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js'
            ).catch(() => {});
        if (!global.html2canvas)
            await loadScript(
                'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
            ).catch(() => {});
        // ✨ AI viết mô tả (nút mở rộng ý ngắn ở ô Dữ liệu) — module shared, best-effort.
        if (!global.Web2AiDescribe && base)
            await loadScript(base + 'web2-ai-describe.js?v=20260625b').catch(() => {});
        if (!global.Web2HtmlSkill) throw new Error('Không tải được Web2HtmlSkill');
    }

    function injectCss() {
        if (document.getElementById('web2-content-maker-css')) return;
        const st = document.createElement('style');
        st.id = 'web2-content-maker-css';
        st.textContent = `
.w2cm{display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:14px;padding:14px;height:100%;box-sizing:border-box;overflow:hidden}
.w2cm.compact{grid-template-columns:1fr;overflow:auto;height:auto}
.w2cm-left{display:flex;flex-direction:column;gap:9px;min-width:0;overflow:auto}
.w2cm-seclabel{font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8;margin-top:2px}
.w2cm-seclabel-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.w2cm-ai{border:1px solid #c7d2fe;background:#eef2ff;color:#4f46e5;border-radius:8px;padding:3px 8px;font-size:.7rem;font-weight:600;cursor:pointer;text-transform:none;letter-spacing:0;display:inline-flex;align-items:center;gap:4px}
.w2cm-ai:hover{background:#e0e7ff}
.w2cm-ai:disabled{opacity:.6;cursor:not-allowed}
.w2cm-skills{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.w2cm.compact .w2cm-skills{grid-template-columns:1fr 1fr 1fr}
.w2cm-skill{display:flex;flex-direction:column;gap:2px;align-items:flex-start;border:1px solid #e2e8f0;background:#fff;border-radius:10px;padding:8px 9px;cursor:pointer;text-align:left;transition:border-color .12s,box-shadow .12s}
.w2cm-skill:hover{border-color:#c7d2fe}
.w2cm-skill.is-on{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
.w2cm-skill .emoji{font-size:1.1rem}
.w2cm-skill .nm{font-size:.76rem;font-weight:600;color:#1f2937;line-height:1.2}
.w2cm-skill .sz{font-size:.64rem;color:#94a3b8}
.w2cm-data{width:100%;box-sizing:border-box;resize:vertical;min-height:120px;border:1px solid #d6dee2;border-radius:10px;padding:9px 11px;font:inherit;font-size:.82rem;line-height:1.5;outline:none}
.w2cm-data:focus,.w2cm-extra:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.14)}
.w2cm-extra{width:100%;box-sizing:border-box;border:1px solid #d6dee2;border-radius:10px;padding:8px 11px;font:inherit;font-size:.82rem;outline:none}
.w2cm-actions{display:flex;flex-wrap:wrap;gap:6px}
.w2cm-btn{border:1px solid #e2e8f0;background:#fff;color:#334155;border-radius:9px;padding:8px 11px;font-size:.8rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.w2cm-btn:hover:not(:disabled){border-color:#c7d2fe;color:#4f46e5}
.w2cm-btn:disabled{opacity:.5;cursor:not-allowed}
.w2cm-btn.primary{border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.w2cm-status{font-size:.72rem;color:#64748b;line-height:1.4;min-height:1em}
.w2cm-right{display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0}
.w2cm.compact .w2cm-right{min-height:380px}
.w2cm-pvhead{display:flex;align-items:center;justify-content:space-between;font-size:.74rem;color:#64748b}
.w2cm-stage{flex:1;min-height:0;position:relative;border:1px solid #e6e9ef;border-radius:12px;background:#f1f5f9 repeating-linear-gradient(45deg,transparent,transparent 9px,rgba(148,163,184,.08) 9px,rgba(148,163,184,.08) 18px);overflow:hidden;display:flex;align-items:center;justify-content:center}
.w2cm-empty{color:#94a3b8;font-size:.8rem;text-align:center;padding:16px}
.w2cm-frame{border:none;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.14);border-radius:4px}
@media(max-width:760px){.w2cm{grid-template-columns:1fr;overflow:auto;height:auto}.w2cm-skills{grid-template-columns:1fr 1fr}.w2cm-right{min-height:360px}}`;
        document.head.appendChild(st);
    }

    function mount(container, opts = {}) {
        if (!container) return { destroy() {} };
        injectCss();
        container.innerHTML =
            '<div style="padding:24px;text-align:center;color:#64748b;font-size:.84rem">Đang tải bộ tạo nội dung…</div>';
        let destroyed = false;
        const inst = {
            destroy() {
                destroyed = true;
                try {
                    container.innerHTML = '';
                } catch (_) {}
            },
        };

        ensureDeps()
            .then(() => {
                if (destroyed) return;
                build(container, opts, inst);
            })
            .catch((e) => {
                if (destroyed) return;
                container.innerHTML = `<div style="padding:24px;text-align:center;color:#dc2626;font-size:.82rem">⚠️ ${esc(
                    e.message || e
                )}</div>`;
            });
        return inst;
    }

    function build(container, opts, inst) {
        const HS = global.Web2HtmlSkill;
        const compact = !!opts.compact;
        const skills = HS.skills();
        const state = {
            skillId: opts.defaultSkill || skills[0]?.id || null,
            abort: null,
            html: '',
            streaming: false,
        };

        const wrap = document.createElement('div');
        wrap.className = 'w2cm' + (compact ? ' compact' : '');
        wrap.innerHTML = `
            <div class="w2cm-left">
                <div class="w2cm-seclabel">1 · Chọn loại</div>
                <div class="w2cm-skills">
                    ${skills
                        .map(
                            (s) =>
                                `<button type="button" class="w2cm-skill${
                                    s.id === state.skillId ? ' is-on' : ''
                                }" data-skill="${s.id}" title="${esc(s.hint)}">
                                    <span class="emoji">${s.emoji}</span>
                                    <span class="nm">${esc(s.label)}</span>
                                    <span class="sz">${esc(s.size.label)}</span>
                                </button>`
                        )
                        .join('')}
                </div>
                <div class="w2cm-seclabel w2cm-seclabel-row">
                    <span>2 · Dữ liệu</span>
                    <button type="button" class="w2cm-ai" hidden>✨ AI viết mô tả</button>
                </div>
                <textarea class="w2cm-data" rows="7"></textarea>
                <input class="w2cm-extra" type="text" placeholder="Yêu cầu thêm (tuỳ chọn): tông màu, phong cách…">
                <div class="w2cm-actions">
                    <button class="w2cm-btn primary w2cm-gen">✨ Tạo HTML</button>
                    <button class="w2cm-btn w2cm-stop" hidden>■ Dừng</button>
                    <button class="w2cm-btn w2cm-png" disabled>🖼 PNG</button>
                    <button class="w2cm-btn w2cm-dl" disabled>⬇ HTML</button>
                    <button class="w2cm-btn w2cm-open" disabled>↗ Mở tab</button>
                    <button class="w2cm-btn w2cm-render" hidden disabled>🎬 Render MP4 (máy shop)</button>
                </div>
                <div class="w2cm-status">Free AI (Gemini/Groq/OpenRouter) · luật chống "AI slop" bật sẵn.</div>
            </div>
            <div class="w2cm-right">
                <div class="w2cm-pvhead"><span>Xem trước</span><span class="w2cm-sizelabel"></span></div>
                <div class="w2cm-stage">
                    <div class="w2cm-empty">Chọn loại → dán data → bấm “Tạo HTML”.</div>
                    <iframe class="w2cm-frame" title="preview" hidden></iframe>
                </div>
            </div>`;
        container.innerHTML = '';
        container.appendChild(wrap);

        const $ = (s) => wrap.querySelector(s);
        const dataEl = $('.w2cm-data');
        const extraEl = $('.w2cm-extra');
        const frame = $('.w2cm-frame');
        const stage = $('.w2cm-stage');
        const empty = $('.w2cm-empty');
        const status = $('.w2cm-status');
        const genBtn = $('.w2cm-gen');
        const stopBtn = $('.w2cm-stop');
        const renderBtn = $('.w2cm-render');

        const meta = (id) => skills.find((s) => s.id === id);
        const isVideo = () => !!meta(state.skillId)?.video;

        function selectSkill(id) {
            state.skillId = id;
            wrap.querySelectorAll('.w2cm-skill').forEach((b) =>
                b.classList.toggle('is-on', b.dataset.skill === id)
            );
            const m = meta(id);
            dataEl.placeholder = m?.hint || 'Dán dữ liệu…';
            $('.w2cm-sizelabel').textContent = m ? m.size.label : '';
            renderBtn.hidden = !m?.video;
            fitPreview();
        }
        function setBusy(on) {
            state.streaming = on;
            genBtn.hidden = on;
            stopBtn.hidden = !on;
            ['.w2cm-png', '.w2cm-dl', '.w2cm-open'].forEach(
                (s) => ($(s).disabled = on || !state.html)
            );
            renderBtn.disabled = on || !state.html || !isVideo();
        }
        function fitPreview() {
            if (frame.hidden) return;
            const m = meta(state.skillId);
            if (!m) return;
            const { w, h } = m.size;
            frame.style.width = w + 'px';
            frame.style.height = h + 'px';
            const availW = stage.clientWidth - 24;
            const availH = stage.clientHeight - 24;
            const scale = Math.min(availW / w, availH / h, 1);
            frame.style.transform = `scale(${scale})`;
            frame.style.transformOrigin = 'center center';
        }

        async function generate() {
            const data = (dataEl.value || '').trim();
            if (!data) return toast('Dán dữ liệu trước đã', 'warning');
            if (state.streaming) return;
            const extra = (extraEl.value || '').trim();
            empty.hidden = true;
            frame.hidden = false;
            state.html = '';
            state.abort = new AbortController();
            setBusy(true);
            status.textContent = 'Đang sinh HTML… (xem trực tiếp bên phải)';
            try {
                const html = await HS.generate({
                    skillId: state.skillId,
                    data,
                    extra,
                    signal: state.abort.signal,
                    onDelta: (full) => {
                        HS.renderToIframe(frame, HS.cleanHtml(full));
                        fitPreview();
                    },
                });
                state.html = html;
                HS.renderToIframe(frame, html);
                fitPreview();
                status.textContent = 'Xong ✓ — xuất PNG/HTML hoặc chỉnh data rồi tạo lại.';
                toast('Đã tạo HTML', 'success');
            } catch (e) {
                if (e?.name === 'AbortError') status.textContent = 'Đã dừng.';
                else {
                    status.textContent = 'Lỗi: ' + (e.message || e);
                    toast('Tạo HTML lỗi: ' + (e.message || e), 'error');
                }
            } finally {
                setBusy(false);
            }
        }
        async function renderVideo() {
            if (!state.html) return;
            if (!global.Web2VideoRender) return toast('Chưa tải module render video', 'error');
            renderBtn.disabled = true;
            status.textContent = 'Đang tìm máy render + render MP4 (có thể vài chục giây)…';
            try {
                const { url } = await global.Web2VideoRender.render({ html: state.html });
                status.textContent = 'Render MP4 xong ✓ — đã mở video ở tab mới.';
                window.open(url, '_blank');
                toast('Render MP4 thành công', 'success');
            } catch (e) {
                status.textContent = 'Render MP4 lỗi: ' + (e.message || e);
                toast(e.message || String(e), 'error');
            } finally {
                renderBtn.disabled = !state.html || !isVideo();
            }
        }
        // "Mở tab" xem trước HTML do AI sinh. KHÔNG mở blob:/data: trực tiếp ở tab mới —
        // blob: thừa hưởng ORIGIN app → <script> trong HTML (AI có thể bị prompt-inject từ
        // data dán vào) chạy với quyền app, đọc được token web2 trong localStorage. Thay vào
        // đó nhúng HTML vào IFRAME sandbox="allow-scripts" (KHÔNG allow-same-origin → opaque
        // origin): script vẫn chạy (vd GSAP xem video) nhưng KHÔNG chạm được origin/token app.
        function openTab() {
            if (!state.html) return;
            const w = window.open('', '_blank');
            if (!w) return toast('Trình duyệt chặn popup — cho phép rồi thử lại', 'warning');
            const srcdoc = state.html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            w.document.write(
                '<!doctype html><meta charset="utf-8"><title>Xem trước nội dung</title>' +
                    '<style>html,body{margin:0;height:100%;background:#0f172a}' +
                    'iframe{border:0;display:block;width:100vw;height:100vh}</style>' +
                    '<iframe sandbox="allow-scripts" srcdoc="' +
                    srcdoc +
                    '"></iframe>'
            );
            w.document.close();
        }

        wrap.querySelectorAll('.w2cm-skill').forEach((b) =>
            b.addEventListener('click', () => selectSkill(b.dataset.skill))
        );
        genBtn.addEventListener('click', generate);
        stopBtn.addEventListener('click', () => state.abort && state.abort.abort());
        $('.w2cm-png').addEventListener('click', () =>
            HS.exportPng(frame, 'web2-' + state.skillId)
        );
        $('.w2cm-dl').addEventListener('click', () =>
            HS.exportHtml(state.html, 'web2-' + state.skillId)
        );
        $('.w2cm-open').addEventListener('click', openTab);
        renderBtn.addEventListener('click', renderVideo);

        // ✨ AI viết mô tả — mở rộng ý ngắn ở ô Dữ liệu, dùng module shared Web2AiDescribe
        // (1 NGUỒN, KHÔNG fork). ensureDeps đã best-effort nạp module; chỉ hiện khi có mặt.
        if (global.Web2AiDescribe && global.Web2AiDescribe.attach) {
            const aiBtn = $('.w2cm-ai');
            aiBtn.hidden = false;
            global.Web2AiDescribe.attach({
                button: aiBtn,
                input: dataEl,
                kind: 'generic',
                lang: 'en', // viết mô tả bằng tiếng ANH (theo yêu cầu)
            });
        }

        const onResize = () => fitPreview();
        window.addEventListener('resize', onResize);
        if (opts.defaultData) dataEl.value = opts.defaultData;
        selectSkill(state.skillId);

        // gắn cleanup vào instance
        const prevDestroy = inst.destroy;
        inst.destroy = () => {
            window.removeEventListener('resize', onResize);
            if (state.abort) state.abort.abort();
            prevDestroy();
        };
    }

    global.Web2ContentMaker = { mount, ensureDeps };
})(window);
