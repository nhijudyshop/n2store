// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Video Maker — APP. Ghép ảnh SP thành video slideshow (Ken Burns + crossfade + chữ)
 * + giọng đọc tiếng Việt on-device (Web2VideoTTS / MMS-TTS-vie) → xuất file video.
 * 100% trong trình duyệt: canvas.captureStream + MediaRecorder (mux cả tiếng). Không server.
 */
(function (global) {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const notify = (m, t) =>
        global.notificationManager?.show?.(m, t || 'info') || console.log('[video]', m);

    const RATIOS = {
        landscape: { key: 'landscape', w: 1280, h: 720, label: 'Ngang 16:9' },
        square: { key: 'square', w: 1080, h: 1080, label: 'Vuông 1:1' },
        story: { key: 'story', w: 720, h: 1280, label: 'Dọc 9:16' },
    };
    const ACCENTS = ['#0068ff', '#ef4444', '#16a34a', '#f59e0b', '#7c3aed', '#db2777'];
    const FPS = 30;
    let _sid = 1;

    const state = {
        scenes: [], // { id, _img, src, title, subtitle, dur }
        ratioKey: 'landscape',
        accent: '#0068ff',
        narration: { text: '', samples: null, sampleRate: 16000 },
        playing: false,
        recording: false,
        _raf: null,
    };

    let canvas, ctx;

    function loadImage(src) {
        return new Promise((res) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = src;
        });
    }

    function dims() {
        return RATIOS[state.ratioKey] || RATIOS.landscape;
    }

    function applyCanvasSize() {
        const d = dims();
        canvas.width = d.w;
        canvas.height = d.h;
        drawAt(0);
        fitPreview();
    }

    function fitPreview() {
        const stage = $('#vmStage');
        if (!stage) return;
        const maxW = stage.clientWidth - 8;
        const maxH = stage.clientHeight - 8;
        const r = canvas.width / canvas.height;
        let w = maxW;
        let h = w / r;
        if (h > maxH) {
            h = maxH;
            w = h * r;
        }
        canvas.style.width = Math.max(40, w) + 'px';
        canvas.style.height = Math.max(40, h) + 'px';
    }

    function drawAt(t) {
        global.Web2VideoRender.drawFrame(ctx, canvas.width, canvas.height, state.scenes, t, {
            accent: state.accent,
        });
    }

    function totalDur() {
        const scenes = global.Web2VideoRender.totalDuration(state.scenes);
        const narr = state.narration.samples
            ? state.narration.samples.length / state.narration.sampleRate
            : 0;
        return Math.max(scenes, narr, 0.1);
    }

    // ---------- scene list ----------
    function renderScenes() {
        const wrap = $('#vmScenes');
        if (!state.scenes.length) {
            wrap.innerHTML =
                '<div class="vm-empty">Chưa có cảnh nào. Bấm <b>+ Thêm ảnh</b> để bắt đầu.</div>';
            return;
        }
        wrap.innerHTML = state.scenes
            .map(
                (sc, i) => `
            <div class="vm-scene" data-id="${sc.id}">
                <div class="vm-scene-thumb">${
                    sc.src ? `<img src="${esc(sc.src)}" alt="">` : '<i data-lucide="image"></i>'
                }<span class="vm-scene-idx">${i + 1}</span></div>
                <div class="vm-scene-fields">
                    <input type="text" class="vm-in" data-k="title" placeholder="Tiêu đề" value="${esc(sc.title || '')}">
                    <input type="text" class="vm-in" data-k="subtitle" placeholder="Phụ đề (giá, mô tả…)" value="${esc(sc.subtitle || '')}">
                    <div class="vm-scene-row">
                        <label class="vm-dur">⏱<input type="number" class="vm-in" data-k="dur" min="1" max="15" step="0.5" value="${sc.dur}"> s</label>
                        <span class="vm-scene-ops">
                            <button class="vm-op" data-op="up" title="Lên">↑</button>
                            <button class="vm-op" data-op="down" title="Xuống">↓</button>
                            <button class="vm-op vm-op-del" data-op="del" title="Xóa"><i data-lucide="trash-2"></i></button>
                        </span>
                    </div>
                </div>
            </div>`
            )
            .join('');
        if (global.lucide) global.lucide.createIcons();
    }

    function findScene(id) {
        return state.scenes.find((s) => String(s.id) === String(id));
    }

    function wireSceneList() {
        const wrap = $('#vmScenes');
        wrap.addEventListener('input', (e) => {
            const el = e.target.closest('.vm-in');
            if (!el) return;
            const id = el.closest('.vm-scene')?.dataset.id;
            const sc = findScene(id);
            if (!sc) return;
            const k = el.dataset.k;
            sc[k] = k === 'dur' ? Math.max(1, Math.min(15, Number(el.value) || 3)) : el.value;
            if (!state.playing) drawAt(0);
        });
        wrap.addEventListener('click', (e) => {
            const op = e.target.closest('.vm-op');
            if (!op) return;
            const id = op.closest('.vm-scene')?.dataset.id;
            const i = state.scenes.findIndex((s) => String(s.id) === String(id));
            if (i < 0) return;
            if (op.dataset.op === 'del') state.scenes.splice(i, 1);
            else if (op.dataset.op === 'up' && i > 0)
                [state.scenes[i - 1], state.scenes[i]] = [state.scenes[i], state.scenes[i - 1]];
            else if (op.dataset.op === 'down' && i < state.scenes.length - 1)
                [state.scenes[i + 1], state.scenes[i]] = [state.scenes[i], state.scenes[i + 1]];
            renderScenes();
            drawAt(0);
        });
    }

    async function addImagesFromFiles(files) {
        for (const f of files) {
            if (!f.type.startsWith('image/')) continue;
            const src = await new Promise((res) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.readAsDataURL(f);
            });
            const img = await loadImage(src);
            state.scenes.push({
                id: _sid++,
                src,
                _img: img,
                title: '',
                subtitle: '',
                dur: 3,
            });
        }
        renderScenes();
        drawAt(0);
    }

    // ---------- narration (TTS) ----------
    async function genNarration() {
        const text = $('#vmNarr').value.trim();
        if (!text) return notify('Nhập nội dung lời đọc trước', 'warning');
        const btn = $('#vmGenVoice');
        const stat = $('#vmVoiceStat');
        btn.disabled = true;
        const setStat = (m) => {
            stat.textContent = m;
        };
        try {
            const { samples, sampleRate } = await global.Web2VideoTTS.synthesize(text, {
                onStatus: setStat,
            });
            state.narration = { text, samples, sampleRate };
            const secs = (samples.length / sampleRate).toFixed(1);
            setStat(`✅ Đã tạo giọng đọc (${secs}s). Sẽ lồng vào video khi xuất.`);
            $('#vmPlayVoice').hidden = false;
            notify('Đã tạo giọng đọc tiếng Việt', 'success');
        } catch (e) {
            console.error('[video-maker] TTS error:', e);
            setStat('❌ Lỗi tạo giọng: ' + (e.message || e) + ' — thử "Nghe nhanh" (giọng máy).');
            notify('Không tạo được giọng MMS, dùng tạm "Nghe nhanh"', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    let _audioCtx = null;
    function audioCtx() {
        if (!_audioCtx) _audioCtx = new (global.AudioContext || global.webkitAudioContext)();
        return _audioCtx;
    }
    function narrationBuffer() {
        if (!state.narration.samples) return null;
        return global.Web2VideoTTS.toAudioBuffer(
            audioCtx(),
            state.narration.samples,
            state.narration.sampleRate
        );
    }

    // ---------- preview ----------
    function play() {
        if (state.playing || !state.scenes.length) return;
        state.playing = true;
        $('#vmPlay').hidden = true;
        $('#vmStop').hidden = false;
        const total = totalDur();
        const start = performance.now();
        let srcNode = null;
        const buf = narrationBuffer();
        if (buf) {
            const ac = audioCtx();
            ac.resume?.();
            srcNode = ac.createBufferSource();
            srcNode.buffer = buf;
            srcNode.connect(ac.destination);
            srcNode.start();
        }
        const loop = () => {
            const t = (performance.now() - start) / 1000;
            if (t >= total || !state.playing) {
                stop();
                return;
            }
            drawAt(t);
            state._raf = requestAnimationFrame(loop);
        };
        state._stopSrc = () => {
            try {
                srcNode && srcNode.stop();
            } catch {}
        };
        loop();
    }
    function stop() {
        state.playing = false;
        if (state._raf) cancelAnimationFrame(state._raf);
        state._stopSrc && state._stopSrc();
        state._stopSrc = null;
        $('#vmPlay').hidden = false;
        $('#vmStop').hidden = true;
        drawAt(0);
    }

    // ---------- export (record) ----------
    function pickMime() {
        const cands = [
            'video/mp4;codecs=h264,aac',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
        ];
        for (const m of cands) {
            try {
                if (global.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
            } catch {}
        }
        return '';
    }

    async function exportVideo() {
        if (state.recording) return;
        if (!state.scenes.length) return notify('Thêm ít nhất 1 cảnh', 'warning');
        if (state.playing) stop();
        const mime = pickMime();
        if (!global.MediaRecorder) return notify('Trình duyệt không hỗ trợ ghi video', 'error');

        state.recording = true;
        const btn = $('#vmExport');
        btn.disabled = true;
        const bar = $('#vmProg');
        const barFill = $('#vmProgFill');
        bar.hidden = false;

        try {
            const vstream = canvas.captureStream(FPS);
            // mux audio narration nếu có
            const buf = narrationBuffer();
            let srcNode = null;
            if (buf) {
                const ac = audioCtx();
                await ac.resume?.();
                const dest = ac.createMediaStreamDestination();
                srcNode = ac.createBufferSource();
                srcNode.buffer = buf;
                srcNode.connect(dest);
                dest.stream.getAudioTracks().forEach((tr) => vstream.addTrack(tr));
            }
            const rec = new MediaRecorder(
                vstream,
                mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined
            );
            const chunks = [];
            rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
            const done = new Promise((res) => (rec.onstop = res));

            const total = totalDur();
            const start = performance.now();
            rec.start(100);
            if (srcNode) srcNode.start();
            await new Promise((resolve) => {
                const loop = () => {
                    const t = (performance.now() - start) / 1000;
                    const pct = Math.min(100, Math.round((t / total) * 100));
                    barFill.style.width = pct + '%';
                    if (t >= total) return resolve();
                    drawAt(t);
                    requestAnimationFrame(loop);
                };
                loop();
            });
            try {
                srcNode && srcNode.stop();
            } catch {}
            rec.stop();
            await done;

            const outMime = mime.split(';')[0] || 'video/webm';
            const ext = outMime.includes('mp4') ? 'mp4' : 'webm';
            const blob = new Blob(chunks, { type: outMime });
            const a = document.createElement('a');
            a.download = `video-sp-${Date.now()}.${ext}`;
            a.href = URL.createObjectURL(blob);
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 6000);
            notify(
                `Đã xuất video ${ext.toUpperCase()} (${(blob.size / 1e6).toFixed(1)}MB)`,
                'success'
            );
        } catch (e) {
            console.error('[video-maker] export error:', e);
            notify('Lỗi xuất video: ' + (e.message || e), 'error');
        } finally {
            state.recording = false;
            btn.disabled = false;
            $('#vmProg').hidden = true;
            $('#vmProgFill').style.width = '0%';
            drawAt(0);
        }
    }

    function esc(s) {
        if (global.Web2Escape?.escapeHtml) return global.Web2Escape.escapeHtml(s);
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }

    function renderPickers() {
        const rw = $('#vmRatios');
        rw.innerHTML = Object.values(RATIOS)
            .map(
                (r) =>
                    `<button type="button" class="vm-chip ${r.key === state.ratioKey ? 'on' : ''}" data-r="${r.key}">${esc(r.label)}</button>`
            )
            .join('');
        rw.querySelectorAll('[data-r]').forEach((b) =>
            b.addEventListener('click', () => {
                state.ratioKey = b.dataset.r;
                rw.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
                applyCanvasSize();
            })
        );
        const aw = $('#vmAccents');
        aw.innerHTML = ACCENTS.map(
            (c) =>
                `<button type="button" class="vm-swatch ${c === state.accent ? 'on' : ''}" data-a="${c}" style="background:${c}"></button>`
        ).join('');
        aw.querySelectorAll('[data-a]').forEach((b) =>
            b.addEventListener('click', () => {
                state.accent = b.dataset.a;
                aw.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', x === b));
                drawAt(0);
            })
        );
    }

    function init() {
        canvas = $('#vmCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!global.Web2VideoRender) return notify('Chưa tải bộ dựng video', 'error');
        renderPickers();
        renderScenes();
        wireSceneList();
        applyCanvasSize();

        $('#vmAdd')?.addEventListener('change', (e) => {
            if (e.target.files?.length) addImagesFromFiles([...e.target.files]);
            e.target.value = '';
        });
        $('#vmPlay')?.addEventListener('click', play);
        $('#vmStop')?.addEventListener('click', stop);
        $('#vmGenVoice')?.addEventListener('click', genNarration);
        $('#vmPlayVoice')?.addEventListener('click', () => {
            const buf = narrationBuffer();
            if (!buf) return;
            const ac = audioCtx();
            ac.resume?.();
            const s = ac.createBufferSource();
            s.buffer = buf;
            s.connect(ac.destination);
            s.start();
        });
        $('#vmQuickVoice')?.addEventListener('click', () => {
            const t = $('#vmNarr').value.trim();
            if (!t) return notify('Nhập lời đọc trước', 'warning');
            if (!global.Web2VideoTTS.speakPreview(t))
                notify('Trình duyệt không có giọng đọc sẵn', 'warning');
        });
        $('#vmExport')?.addEventListener('click', exportVideo);
        global.Web2ProductsCache?.init?.().catch(() => {});
        global.addEventListener('resize', fitPreview);
    }

    global.VideoMakerPage = { init, _state: state };
})(window);
