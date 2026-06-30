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
        scenes: [], // { id, _img, src, title, subtitle, dur, motion, transition, filter, textPos, fit, bg }
        ratioKey: 'landscape',
        accent: '#0068ff',
        transitionDur: global.Web2VideoRender?.DEFAULT_TDUR ?? 0.5,
        voiceId: 'pro-adam3', // mặc định = Adam 3 (Giọng AI Pro) — khớp VOICES[0], user ưu tiên
        tone: 'normal',
        narration: { text: '', samples: null, sampleRate: 16000 },
        music: { buffer: null, name: '', volume: 0.35 }, // nhạc nền (chèn/ghép)
        narrationVolume: 1.0,
        captions: true, // phụ đề tự động (karaoke theo lời đọc) — bật mặc định

        playing: false,
        recording: false,
        _raf: null,
        _sampleCache: {}, // key voiceId|tone → {samples,sampleRate}
        _sampling: false,
        _ttsBusy: false, // khoá UI chung cho tạo lời đọc + nghe mẫu
        vieneuRef: null, // Blob giọng mẫu để clone (VieNeu)
        vieneuVoices: [], // giọng preset từ server VieNeu
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
        // Lồng tiếng video → canvas khớp kích thước video gốc (cap 1280 cạnh dài) để
        // giữ nguyên khung hình, không crop.
        if (importActive()) {
            const v = global.Web2VideoImport.el();
            const vw = v?.videoWidth || 0;
            const vh = v?.videoHeight || 0;
            if (vw && vh) {
                const cap = 1280;
                const scale = Math.min(1, cap / Math.max(vw, vh));
                canvas.width = Math.round(vw * scale) || vw;
                canvas.height = Math.round(vh * scale) || vh;
                drawAt(0);
                fitPreview();
                return;
            }
        }
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

    function importActive() {
        return global.Web2VideoImport?.isActive?.();
    }

    function drawAt(t) {
        // Chế độ lồng tiếng video: vẽ khung hình video hiện tại (loop điều khiển playback).
        if (importActive()) {
            global.Web2VideoImport.draw(ctx, canvas.width, canvas.height);
            return;
        }
        global.Web2VideoRender.drawFrame(ctx, canvas.width, canvas.height, state.scenes, t, {
            accent: state.accent,
            transitionDur: state.transitionDur,
            captions: state.captions,
        });
    }

    // Gán caption cho từng cảnh khi BẬT phụ đề. Per-scene narration (sc.narr) thì
    // drawFrame tự dùng cur.narr; chỉ cần chia lời đọc CHUNG thành cụm theo cảnh.
    function _assignGlobalCaptions(text) {
        const words = String(text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .filter(Boolean);
        const n = state.scenes.length;
        if (!n) return;
        if (!words.length) {
            state.scenes.forEach((sc) => {
                if (!sc.narr) sc.caption = '';
            });
            return;
        }
        const per = Math.ceil(words.length / n);
        state.scenes.forEach((sc, i) => {
            // cảnh có narr riêng → giữ (drawFrame ưu tiên cur.caption || cur.narr)
            sc.caption = words.slice(i * per, (i + 1) * per).join(' ');
        });
    }

    function _refreshCaptions() {
        if (!state.captions) return;
        if (hasPerSceneNarration()) {
            // per-scene: drawFrame dùng cur.narr trực tiếp; xoá caption global cũ.
            state.scenes.forEach((sc) => {
                sc.caption = (sc.narr || '').trim();
            });
        } else {
            const t = state.narration?.text;
            if (t && t !== '(theo từng cảnh)') _assignGlobalCaptions(t);
        }
    }

    function totalDur() {
        const narr = state.narration.samples
            ? state.narration.samples.length / state.narration.sampleRate
            : 0;
        if (importActive()) {
            const vid = global.Web2VideoImport.el()?.duration || 0;
            return Math.max(vid, narr, 0.1);
        }
        const scenes = global.Web2VideoRender.totalDuration(state.scenes);
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
        const detail = (sc) =>
            global.Web2VideoSceneEditor ? global.Web2VideoSceneEditor.detailHtml(sc, esc) : '';
        wrap.innerHTML = state.scenes
            .map(
                (sc, i) => `
            <div class="vm-scene${sc._open ? ' open' : ''}" data-id="${sc.id}">
                <div class="vm-scene-thumb">${
                    sc.src ? `<img src="${esc(sc.src)}" alt="">` : '<i data-lucide="image"></i>'
                }<span class="vm-scene-idx">${i + 1}</span></div>
                <div class="vm-scene-fields">
                    <input type="text" class="vm-in" data-k="title" placeholder="Tiêu đề" value="${esc(sc.title || '')}">
                    <input type="text" class="vm-in" data-k="subtitle" placeholder="Phụ đề (giá, mô tả…)" value="${esc(sc.subtitle || '')}">
                    <div class="vm-scene-row">
                        <label class="vm-dur">⏱<input type="number" class="vm-in" data-k="dur" min="1" max="15" step="0.5" value="${sc.dur}"> s</label>
                        <span class="vm-scene-ops">
                            <button class="vm-op" data-op="detail" title="Chỉnh chi tiết"><i data-lucide="sliders-horizontal"></i></button>
                            <button class="vm-op" data-op="up" title="Lên">↑</button>
                            <button class="vm-op" data-op="down" title="Xuống">↓</button>
                            <button class="vm-op vm-op-del" data-op="del" title="Xóa"><i data-lucide="trash-2"></i></button>
                        </span>
                    </div>
                    ${detail(sc)}
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
        // chi tiết: select (chuyển động/hiệu ứng/lọc/vị trí chữ/khung) + màu nền
        wrap.addEventListener('change', (e) => {
            const el = e.target.closest('.vm-dsel, .vm-dcolor');
            if (!el) return;
            const sc = findScene(el.closest('.vm-scene')?.dataset.id);
            if (!sc) return;
            sc[el.dataset.k] = el.value;
            if (!state.playing) drawAt(0);
        });
        wrap.addEventListener('click', (e) => {
            const op = e.target.closest('.vm-op');
            if (!op) return;
            const sceneEl = op.closest('.vm-scene');
            const id = sceneEl?.dataset.id;
            const i = state.scenes.findIndex((s) => String(s.id) === String(id));
            if (i < 0) return;
            const which = op.dataset.op;
            if (which === 'detail') {
                // toggle inline — không render lại để giữ trạng thái select đang mở
                state.scenes[i]._open = !state.scenes[i]._open;
                sceneEl.classList.toggle('open', state.scenes[i]._open);
                return;
            }
            if (which === 'del') state.scenes.splice(i, 1);
            else if (which === 'up' && i > 0)
                [state.scenes[i - 1], state.scenes[i]] = [state.scenes[i], state.scenes[i - 1]];
            else if (which === 'down' && i < state.scenes.length - 1)
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

    // Thêm 1 cảnh từ URL ảnh (vd ảnh stock Pexels/Pixabay). CORS để không taint
    // canvas → xuất video được. Dùng bởi Web2VideoStock (kho ảnh/video miễn phí).
    async function addSceneFromUrl(url, meta = {}) {
        if (!url) return false;
        try {
            const img = await loadImageCors(url);
            state.scenes.push({
                id: _sid++,
                src: url,
                _img: img,
                title: meta.title || '',
                subtitle: meta.subtitle || '',
                dur: Number(meta.dur) || 3,
            });
            renderScenes();
            drawAt(0);
            return true;
        } catch (e) {
            notify('Không tải được ảnh từ kho miễn phí (CORS?)', 'error');
            return false;
        }
    }

    // ---------- narration (TTS) ----------
    // Khoá chung cho MỌI tác vụ tổng hợp giọng (tạo lời đọc + nghe mẫu) — chống
    // double-trigger giữa #vmGenVoice và các nút nghe mẫu. video-tts.js có khoá
    // serialize cấp engine, nhưng UI cũng cần phản ánh trạng thái thống nhất.
    function setTtsBusy(busy) {
        state._ttsBusy = !!busy;
        const gen = $('#vmGenVoice');
        if (gen) gen.disabled = !!busy;
        document.querySelectorAll('.vm-voice-sample').forEach((b) => (b.disabled = !!busy));
    }

    // Chế độ "giọng theo từng cảnh" (multi-narrator): ≥1 cảnh có lời đọc riêng.
    function hasPerSceneNarration() {
        return state.scenes.some((sc) => (sc.narr || '').trim());
    }

    // Tổng hợp lời đọc theo từng cảnh: mỗi cảnh đọc dòng riêng bằng giọng riêng, cảnh
    // tự nới thời lượng cho vừa lời, ghép vào 1 buffer canh theo mốc bắt đầu của cảnh.
    async function genNarrationPerScene(setStat) {
        const TTS = global.Web2VideoTTS;
        // 1) synth từng cảnh (tuần tự — engine serialize) + nới dur cho vừa lời
        for (const sc of state.scenes) {
            const t = (sc.narr || '').trim();
            if (!t) continue;
            const vId = sc.voiceId || state.voiceId;
            setStat('Đang tạo giọng theo cảnh…');
            const r = await TTS.synthesize(t, {
                voiceId: vId,
                pitch: tonePitch(),
                onStatus: setStat,
            });
            const sec = r.samples.length / r.sampleRate;
            sc.dur = Math.max(Number(sc.dur) || 3, +(sec + 0.4).toFixed(2));
            sc._seg = r;
        }
        // 2) mix vào 1 buffer 44.1kHz, đặt audio mỗi cảnh tại mốc bắt đầu (OfflineAudioContext tự resample)
        const SR = 44100;
        const total = global.Web2VideoRender.totalDuration(state.scenes);
        const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
        // mỗi cảnh đã nới dur cho vừa audio → audio luôn nằm trong tổng; pad nhỏ phòng rounding.
        const offline = new OAC(1, Math.ceil(total * SR) + Math.ceil(0.15 * SR), SR);
        let acc = 0;
        for (const sc of state.scenes) {
            const d = Number(sc.dur) || 3;
            if (sc._seg) {
                const seg = sc._seg;
                const buf = offline.createBuffer(1, seg.samples.length, seg.sampleRate);
                buf.copyToChannel
                    ? buf.copyToChannel(seg.samples, 0)
                    : buf.getChannelData(0).set(seg.samples);
                const src = offline.createBufferSource();
                src.buffer = buf;
                src.connect(offline.destination);
                src.start(acc);
                delete sc._seg;
            }
            acc += d;
        }
        const rendered = await offline.startRendering();
        return { samples: rendered.getChannelData(0).slice(), sampleRate: SR };
    }

    async function genNarration() {
        if (state._ttsBusy) return;
        const perScene = hasPerSceneNarration();
        const text = $('#vmNarr').value.trim();
        if (!text && !perScene)
            return notify('Nhập lời đọc chung, hoặc lời đọc riêng cho từng cảnh (⚙)', 'warning');
        const stat = $('#vmVoiceStat');
        setTtsBusy(true);
        const setStat = (m) => {
            stat.textContent = m;
        };
        try {
            const out = perScene
                ? await genNarrationPerScene(setStat)
                : await global.Web2VideoTTS.synthesize(text, {
                      voiceId: state.voiceId,
                      pitch: tonePitch(),
                      onStatus: setStat,
                  });
            state.narration = {
                text: perScene ? '(theo từng cảnh)' : text,
                samples: out.samples,
                sampleRate: out.sampleRate,
            };
            _refreshCaptions(); // phụ đề tự động bám theo lời đọc vừa tạo
            if (perScene) {
                renderScenes(); // dur cảnh có thể đã nới → cập nhật danh sách
            }
            drawAt(0);
            const secs = (out.samples.length / out.sampleRate).toFixed(1);
            setStat(
                `✅ Đã tạo giọng đọc${perScene ? ' (theo từng cảnh)' : ''} (${secs}s). Sẽ lồng vào video khi xuất.`
            );
            $('#vmPlayVoice').hidden = false;
            notify('Đã tạo giọng đọc tiếng Việt', 'success');
        } catch (e) {
            console.error('[video-maker] TTS error:', e);
            setStat('❌ Lỗi tạo giọng: ' + (e.message || e) + ' — thử "Nghe nhanh" (giọng máy).');
            notify('Không tạo được giọng đọc', 'error');
        } finally {
            setTtsBusy(false);
        }
    }

    let _audioCtx = null;
    function audioCtx() {
        if (global.Web2VideoAudio) return global.Web2VideoAudio.ac();
        if (!_audioCtx) _audioCtx = new (global.AudioContext || global.webkitAudioContext)();
        return _audioCtx;
    }
    // graph trộn giọng đọc + nhạc nền → đích (preview: ac.destination | record: dest)
    function buildAudioGraph(dest) {
        const ac = audioCtx();
        const graph = global.Web2VideoAudio.buildMixGraph({
            audioCtx: ac,
            dest: dest || ac.destination,
            narrationBuffer: narrationBuffer(),
            narrationVol: state.narrationVolume,
            musicBuffer: state.music.buffer,
            musicVol: state.music.volume,
            loopMusic: true,
        });
        state._liveGraph = graph; // để slider chỉnh âm lượng tác động graph đang chạy
        return graph;
    }

    // Cập nhật âm lượng cho graph đang phát/ghi (nếu engine có expose gain node).
    function applyLiveVolumes() {
        const g = state._liveGraph;
        if (!g) return;
        try {
            if (g.musicGain?.gain) g.musicGain.gain.value = state.music.volume;
            if (g.narrationGain?.gain) g.narrationGain.gain.value = state.narrationVolume;
        } catch {}
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
        if (state.playing || (!state.scenes.length && !importActive())) return;
        state.playing = true;
        $('#vmPlay').hidden = true;
        $('#vmStop').hidden = false;
        const total = totalDur();
        const start = performance.now();
        const ac = audioCtx();
        ac.resume?.();
        const graph = buildAudioGraph(ac.destination);
        graph.start();
        // lồng tiếng: phát video gốc (tiếng gốc qua graph) đồng bộ với loop vẽ khung
        const vid = importActive() ? global.Web2VideoImport.el() : null;
        if (vid) {
            global.Web2VideoImport.connect(ac, ac.destination);
            try {
                vid.currentTime = 0;
            } catch {}
            vid.play().catch(() => {});
        }
        const loop = () => {
            const t = (performance.now() - start) / 1000;
            const ended = vid ? vid.ended || t >= total : t >= total;
            if (ended || !state.playing) {
                stop();
                return;
            }
            drawAt(t);
            state._raf = requestAnimationFrame(loop);
        };
        state._stopSrc = () => {
            graph.stop();
            if (vid)
                try {
                    vid.pause();
                } catch {}
        };
        loop();
    }
    function stop() {
        state.playing = false;
        if (state._raf) cancelAnimationFrame(state._raf);
        state._stopSrc && state._stopSrc();
        state._stopSrc = null;
        state._liveGraph = null;
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
        if (!state.scenes.length && !importActive())
            return notify('Thêm ít nhất 1 cảnh hoặc import video', 'warning');
        if (!importActive() && hasTaintedScene()) {
            return notify(
                'Có ảnh SP không cho phép tải chéo miền (CORS) — không thể xuất video. Hãy "+ Thêm ảnh" tay hoặc thay ảnh khác.',
                'error'
            );
        }
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
            // mux audio: giọng đọc + nhạc nền (ghép)
            const ac = audioCtx();
            await ac.resume?.();
            const adest = ac.createMediaStreamDestination();
            const graph = buildAudioGraph(adest);
            // lồng tiếng video: tiếng gốc video → adest (cùng giọng đọc + nhạc nền)
            const vid = importActive() ? global.Web2VideoImport.el() : null;
            if (vid) global.Web2VideoImport.connect(ac, adest);
            const hasAudio = graph.hasAudio || !!vid;
            if (hasAudio) adest.stream.getAudioTracks().forEach((tr) => vstream.addTrack(tr));
            const rec = new MediaRecorder(
                vstream,
                mime ? { mimeType: mime, videoBitsPerSecond: 5_000_000 } : undefined
            );
            const chunks = [];
            rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
            const done = new Promise((res) => (rec.onstop = res));

            const total = totalDur();
            // Khởi động recorder + graph audio back-to-back, lấy mốc thời gian NGAY
            // trước đó để giảm lệch tiếng/hình (race recorder-lifecycle).
            rec.start(100);
            graph.start();
            if (vid) {
                try {
                    vid.currentTime = 0;
                } catch {}
                await vid.play().catch(() => {});
            }
            const start = performance.now();
            await new Promise((resolve) => {
                const loop = () => {
                    const t = (performance.now() - start) / 1000;
                    const pct = Math.min(100, Math.round((t / total) * 100));
                    barFill.style.width = pct + '%';
                    if ((vid && vid.ended) || t >= total) return resolve();
                    drawAt(t);
                    requestAnimationFrame(loop);
                };
                loop();
            });
            graph.stop();
            if (vid)
                try {
                    vid.pause();
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
            state._liveGraph = null;
            btn.disabled = false;
            $('#vmProg').hidden = true;
            $('#vmProgFill').style.width = '0%';
            drawAt(0);
        }
    }

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
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

    function tonePitch() {
        const t = (global.Web2VideoTTS.TONES || []).find((x) => x.id === state.tone);
        return t ? t.pitch : 1;
    }

    // render thẻ chọn giọng + tông + nút nghe mẫu
    function renderVoices() {
        const TTS = global.Web2VideoTTS;
        const vw = $('#vmVoices');
        if (vw) {
            vw.innerHTML = TTS.VOICES.map(
                (v) => `
                <div class="vm-voice ${v.id === state.voiceId ? 'on' : ''}" data-v="${v.id}">
                    <button type="button" class="vm-voice-pick" data-v="${v.id}">
                        <i data-lucide="${v.id === state.voiceId ? 'check-circle-2' : 'circle'}"></i>
                        <span>${esc(v.label)}</span>
                    </button>
                    <button type="button" class="vm-voice-sample" data-sample="${v.id}" title="Nghe mẫu">
                        <i data-lucide="volume-2"></i>
                    </button>
                    ${v._lib ? `<button type="button" class="vm-voice-del" data-del="${v.id}" title="Bỏ khỏi danh sách"><i data-lucide="x"></i></button>` : ''}
                </div>`
            ).join('');
            vw.querySelectorAll('.vm-voice-pick').forEach((b) =>
                b.addEventListener('click', () => {
                    state.voiceId = b.dataset.v;
                    renderVoices();
                })
            );
            vw.querySelectorAll('.vm-voice-sample').forEach((b) =>
                b.addEventListener('click', () => playSample(b.dataset.sample))
            );
            vw.querySelectorAll('.vm-voice-del').forEach((b) =>
                b.addEventListener('click', () => {
                    const id = b.dataset.del;
                    TTS.removeLibraryVoice(id);
                    if (state.voiceId === id) state.voiceId = TTS.VOICES[0]?.id || 'mms';
                    renderVoices();
                })
            );
        }
        const tw = $('#vmTones');
        if (tw) {
            // Giọng Pro/clone (server) giữ nguyên gốc → "Tông giọng" không áp được. Tắt
            // hàng chip + hiện ghi chú để khỏi tưởng tông làm giọng "khác đi".
            const pitchOk = TTS.isPitchCapable ? TTS.isPitchCapable(state.voiceId) : true;
            tw.classList.toggle('is-off', !pitchOk);
            tw.innerHTML = TTS.TONES.map(
                (t) =>
                    `<button type="button" class="vm-chip ${t.id === state.tone ? 'on' : ''}" data-tone="${t.id}"${pitchOk ? '' : ' disabled'}>${esc(t.label)}</button>`
            ).join('');
            if (pitchOk) {
                tw.querySelectorAll('[data-tone]').forEach((b) =>
                    b.addEventListener('click', () => {
                        state.tone = b.dataset.tone;
                        tw.querySelectorAll('[data-tone]').forEach((x) =>
                            x.classList.toggle('on', x === b)
                        );
                    })
                );
            }
            const note = $('#vmTonesNote');
            if (note) {
                note.textContent = pitchOk
                    ? ''
                    : 'Giọng cao cấp / Clone giữ nguyên giọng gốc — tông giọng không áp dụng (đã tắt).';
                note.hidden = pitchOk;
            }
        }
        renderCues();
        if (global.lucide) global.lucide.createIcons();
    }

    // chèn token tại vị trí con trỏ trong textarea (thêm khoảng trắng nếu cần)
    function insertAtCursor(ta, token) {
        const start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
        const end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        const lead = before && !/\s$/.test(before) ? ' ' : '';
        const trail = after && /^\s/.test(after) ? '' : ' ';
        const ins = lead + token + trail;
        ta.value = before + ins + after;
        const pos = (before + ins).length;
        ta.focus();
        try {
            ta.setSelectionRange(pos, pos);
        } catch {}
    }

    // render các chip cảm xúc (VieNeu) + hint theo giọng đang chọn
    function renderCues() {
        const TTS = global.Web2VideoTTS;
        const box = $('#vmCues');
        const hint = $('#vmCuesHint');
        if (!box || !TTS || !TTS.CUES) return;
        box.innerHTML = TTS.CUES.map(
            (c) =>
                `<button type="button" class="vm-chip" data-cue="${esc(c.token)}" title="Chèn ${esc(c.label)}"><i data-lucide="${esc(c.icon)}"></i> ${esc(c.label)}</button>`
        ).join('');
        box.querySelectorAll('[data-cue]').forEach((b) =>
            b.addEventListener('click', () => {
                const ta = $('#vmNarr');
                if (ta) insertAtCursor(ta, b.dataset.cue);
            })
        );
        if (hint) {
            hint.textContent = TTS.isCueCapable(state.voiceId)
                ? 'Thẻ cảm xúc hoạt động với giọng cao cấp (thử nghiệm) — đặt ngay chỗ muốn biểu cảm.'
                : 'Chọn giọng cao cấp (🎙️/⭐) để cảm xúc có tác dụng — giọng khác sẽ tự bỏ qua thẻ này.';
        }
        if (global.lucide) global.lucide.createIcons();
    }

    function stop_preview_audio() {
        try {
            state._previewAudio?.pause();
        } catch {}
        state._previewAudio = null;
    }
    // nghe mẫu 1 câu cố định bằng giọng + tông đang chọn (cache theo voice|tone)
    async function playSample(voiceId) {
        if (state._sampling || state._ttsBusy) return;
        const tone = state.tone;
        const key = voiceId + '|' + tone;
        const stat = $('#vmVoiceStat');
        // NGHE THỬ NHANH (không tải model): giọng Piper/ElevenLabs có clip mẫu sẵn →
        // phát thẳng bằng <audio>, KHÔNG tải model ~vài chục MB. (tông không áp được
        // cho clip mẫu, nhưng nghe để chọn giọng là đủ.)
        const v = (global.Web2VideoTTS.VOICES || []).find((x) => x.id === voiceId);
        const sampleUrl = global.Web2VideoTTS.previewUrlForVoice?.(v);
        if (sampleUrl) {
            try {
                stop_preview_audio();
                stat.textContent = 'Đang phát giọng mẫu…';
                const a = new Audio(sampleUrl); // KHÔNG set crossOrigin (no-cors media)
                state._previewAudio = a;
                a.onended = () =>
                    (stat.textContent = `Giọng: ${voiceLabel(voiceId)} · tông ${toneLabel()}`);
                a.onerror = () => (stat.textContent = `Giọng: ${voiceLabel(voiceId)}`);
                await a.play();
                return;
            } catch (e) {
                /* fallthrough → synth */
            }
        }
        try {
            state._sampling = true;
            setTtsBusy(true);
            let cached = state._sampleCache[key];
            if (!cached) {
                stat.textContent = 'Đang tạo giọng mẫu…';
                cached = await global.Web2VideoTTS.synthesize(global.Web2VideoTTS.SAMPLE_TEXT, {
                    voiceId,
                    pitch: tonePitch(),
                    onStatus: (m) => (stat.textContent = m),
                });
                state._sampleCache[key] = cached;
            }
            stat.textContent = 'Đang phát giọng mẫu…';
            const ac = audioCtx();
            await ac.resume?.();
            const src = ac.createBufferSource();
            src.buffer = global.Web2VideoTTS.toAudioBuffer(ac, cached.samples, cached.sampleRate);
            src.connect(ac.destination);
            src.onended = () =>
                (stat.textContent = `Giọng: ${voiceLabel(voiceId)} · tông ${toneLabel()}`);
            src.start();
        } catch (e) {
            console.error('[video-maker] sample error:', e);
            stat.textContent = '❌ Lỗi nghe mẫu: ' + (e.message || e);
            notify('Không tạo được giọng mẫu', 'error');
        } finally {
            state._sampling = false;
            setTtsBusy(false);
        }
    }
    function voiceLabel(id) {
        const v = (global.Web2VideoTTS.VOICES || []).find((x) => x.id === id);
        return v ? v.label : id;
    }
    function toneLabel() {
        const t = (global.Web2VideoTTS.TONES || []).find((x) => x.id === state.tone);
        return t ? t.label : '';
    }

    // ---------- tạo ngẫu nhiên (auto từ kho SP) ----------
    function _rand(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    function _shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function fmtPriceShort(n) {
        const num = Number(String(n).replace(/[^\d.-]/g, ''));
        if (!num) return '';
        return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
    }

    async function randomGenerate() {
        const btn = $('#vmRandom');
        btn.disabled = true;
        try {
            await global.Web2ProductsCache?.init?.().catch(() => {});
            // SSE realtime không bật trên trang này → revalidate tay để tránh dùng kho cũ
            await global.Web2ProductsCache?.refresh?.().catch(() => {});
            const all = (global.Web2ProductsCache?.getAll?.() || []).filter(
                (p) => p && p.imageUrl && /^(https?:\/\/|\/|data:image\/)/i.test(String(p.imageUrl))
            );
            if (!all.length) {
                notify('Kho chưa có SP kèm ảnh — hãy "+ Thêm ảnh" tay nhé', 'warning');
                return;
            }
            const pick = _shuffle(all).slice(0, Math.min(5, all.length));
            // tải ảnh song song (crossOrigin để đỡ taint khi xuất)
            const scenes = [];
            await Promise.all(
                pick.map(async (p, idx) => {
                    const img = await loadImageCors(p.imageUrl);
                    scenes.push({
                        id: _sid++,
                        src: p.imageUrl,
                        _img: img,
                        title: p.name || '',
                        subtitle: fmtPriceShort(p.price ?? p.sellPrice ?? p.salePrice ?? ''),
                        dur: 2.5 + Math.random(),
                        _name: p.name || '',
                        _price: p.price ?? p.sellPrice ?? p.salePrice ?? '',
                        _order: idx, // mốc ổn định (tên có thể trùng → không dùng name để sort)
                    });
                })
            );
            // giữ đúng thứ tự đã pick — sort theo index ổn định, KHÔNG theo name
            scenes.sort((a, b) => a._order - b._order);
            state.scenes = scenes;
            state.accent = _rand(ACCENTS);
            state.voiceId = _rand(global.Web2VideoTTS.VOICES).id;
            // narration tự động
            const names = pick
                .map((p) => p.name)
                .filter(Boolean)
                .slice(0, 3);
            const prices = pick.map((p) => Number(p.price ?? p.sellPrice ?? 0)).filter(Boolean);
            const minP = prices.length ? Math.min(...prices) : 0;
            const intro = _rand([
                'Shop mình vừa về thêm hàng mới nè!',
                'Các nàng ơi, hàng hot đã có mặt tại shop!',
                'Săn deal ngay kẻo lỡ nha cả nhà!',
            ]);
            const body = names.length ? `Nổi bật có ${names.join(', ')}.` : '';
            const price = minP ? ` Giá chỉ từ ${fmtPriceShort(minP)}.` : '';
            const cta = _rand([
                ' Inbox shop để được tư vấn và chốt đơn nha!',
                ' Nhắn tin ngay để đặt hàng nhé!',
                ' Comment hoặc inbox để shop giữ hàng cho mình nha!',
            ]);
            $('#vmNarr').value = intro + ' ' + body + price + cta;
            renderScenes();
            renderPickers();
            renderVoices();
            drawAt(0);
            notify(
                `Đã tạo video ngẫu nhiên từ ${scenes.length} SP — bấm "Tạo giọng đọc" rồi "Xuất video"`,
                'success'
            );
        } catch (e) {
            console.error('[video-maker] random error:', e);
            notify('Lỗi tạo ngẫu nhiên: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // ---------- tạo từ CHỦ ĐỀ (AI viết kịch bản) ----------
    async function topicGenerate() {
        const topic = $('#vmTopic').value.trim();
        if (!topic) return notify('Nhập chủ đề video trước', 'warning');
        if (!global.Web2VideoAiScript) return notify('Chưa tải module AI', 'error');
        const btn = $('#vmTopicGen');
        const stat = $('#vmTopicStat');
        const setStat = (m) => stat && (stat.textContent = m);
        btn.disabled = true;
        setStat('Đang lấy sản phẩm + AI viết kịch bản…');
        try {
            await global.Web2ProductsCache?.init?.().catch(() => {});
            // SSE realtime không bật trên trang này → revalidate tay để tránh dùng kho cũ
            await global.Web2ProductsCache?.refresh?.().catch(() => {});
            const all = (global.Web2ProductsCache?.getAll?.() || []).filter(
                (p) => p && p.imageUrl && /^(https?:\/\/|\/|data:image\/)/i.test(String(p.imageUrl))
            );
            // Pure-stock (MoneyPrinterTurbo): user tick "ảnh kho miễn phí", HOẶC kho
            // không có SP kèm ảnh → dựng cảnh từ Pexels thay vì kẹt.
            const forceStock = $('#vmUseStock')?.checked;
            if (forceStock || !all.length) {
                await _topicFromStock(topic, setStat);
                return;
            }
            // chọn SP liên quan chủ đề (tên chứa từ khoá) → thiếu thì bù ngẫu nhiên
            const words = topic
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 1);
            const scored = all.map((p) => ({
                p,
                s: words.reduce(
                    (a, w) => a + ((p.name || '').toLowerCase().includes(w) ? 1 : 0),
                    0
                ),
            }));
            let picked = scored
                .filter((x) => x.s > 0)
                .sort((a, b) => b.s - a.s)
                .map((x) => x.p);
            if (picked.length < 5)
                picked = picked
                    .concat(_shuffle(all.filter((p) => !picked.includes(p))))
                    .slice(0, 5);
            else picked = picked.slice(0, 5);
            const imgs = await Promise.all(picked.map((p) => loadImageCors(p.imageUrl)));
            const priceOf = (p) => p.price ?? p.sellPrice ?? p.salePrice ?? '';
            const ai = await global.Web2VideoAiScript.generate({
                topic,
                products: picked.map((p) => ({ name: p.name, price: priceOf(p) })),
            });
            state.scenes = picked.map((p, i) => ({
                id: _sid++,
                src: p.imageUrl,
                _img: imgs[i],
                title: ai.scenes[i]?.title || p.name || '',
                subtitle: ai.scenes[i]?.subtitle || fmtPriceShort(priceOf(p)),
                dur: 2.8,
            }));
            $('#vmNarr').value = ai.narration || '';
            state.accent = _rand(ACCENTS);
            state.voiceId = _rand(global.Web2VideoTTS.VOICES).id;
            renderScenes();
            renderPickers();
            renderVoices();
            drawAt(0);
            setStat(
                ai.ai
                    ? `✅ AI đã viết kịch bản cho "${topic}". Bấm "Tạo giọng đọc" → "Xuất video".`
                    : `✅ Tạo kịch bản mẫu cho "${topic}" (AI chưa cấu hình key). Bấm "Tạo giọng đọc".`
            );
            notify(`Đã tạo video từ chủ đề "${topic}"`, 'success');
        } catch (e) {
            console.error('[video-maker] topic error:', e);
            setStat('❌ Lỗi: ' + (e.message || e));
            notify('Lỗi tạo từ chủ đề: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
        }
    }

    // Tỉ lệ khung → từ khoá ratio cho kho stock (Pexels orientation).
    function _stockRatio() {
        const k = state.ratioKey;
        if (k === 'portrait') return '9:16';
        if (k === 'square') return '1:1';
        return '16:9';
    }

    // MoneyPrinterTurbo pure-stock: dựng N cảnh từ ẢNH KHO MIỄN PHÍ theo chủ đề.
    // 1 lần search (per = n*2) rồi lấy n ảnh phân biệt → tải CORS → cảnh. Tránh
    // N request API. Trả [] nếu kho chưa cấu hình / không kết quả.
    async function _buildStockScenes(topic, n) {
        if (!global.Web2VideoStock?.search) return [];
        const want = Math.max(4, Math.min(8, Number(n) || 5));
        let items = await global.Web2VideoStock.search(topic, {
            type: 'photo',
            ratio: _stockRatio(),
            per: Math.max(12, want * 2),
        });
        // Chủ đề tiếng Việt ít kết quả → thử lại bằng bản dịch EN nếu có Web2Translate.
        if (items.length < want && global.Web2Translate?.toEn) {
            try {
                const en = await global.Web2Translate.toEn(topic);
                if (en && en.toLowerCase() !== topic.toLowerCase()) {
                    const more = await global.Web2VideoStock.search(en, {
                        type: 'photo',
                        ratio: _stockRatio(),
                        per: Math.max(12, want * 2),
                    });
                    const seen = new Set(items.map((x) => x.url));
                    for (const m of more) if (!seen.has(m.url)) items.push(m);
                }
            } catch {}
        }
        const photos = items.filter((it) => it.type === 'photo' && it.url).slice(0, want);
        if (!photos.length) return [];
        const imgs = await Promise.all(photos.map((p) => loadImageCors(p.url)));
        return photos.map((p, i) => ({
            id: _sid++,
            src: p.url,
            _img: imgs[i],
            title: '',
            subtitle: '',
            dur: 2.8,
            _stockAuthor: p.author || '',
        }));
    }

    // Tạo video THUẦN STOCK từ chủ đề: AI viết kịch bản (không cần SP) → ảnh kho
    // miễn phí mỗi cảnh → narration + phụ đề. Dùng khi kho không có ảnh SP, hoặc
    // user tick "Ưu tiên ảnh kho miễn phí".
    async function _topicFromStock(topic, setStat) {
        setStat('Đang viết kịch bản + lấy ảnh kho miễn phí…');
        let ai = { narration: '', scenes: [], ai: false };
        try {
            ai = await global.Web2VideoAiScript.generate({ topic, products: [] });
        } catch (e) {
            console.warn('[video-maker] stock script fail:', e.message);
        }
        const n = Math.max(4, Math.min(8, ai.scenes?.length || 5));
        const scenes = await _buildStockScenes(topic, n);
        if (!scenes.length) {
            setStat(
                'Kho ảnh miễn phí không trả kết quả — thử chủ đề tiếng Anh, hoặc "+ Thêm ảnh".'
            );
            notify('Kho ảnh miễn phí trống cho chủ đề này', 'warning');
            return false;
        }
        scenes.forEach((sc, i) => {
            sc.title = ai.scenes?.[i]?.title || '';
            sc.subtitle = ai.scenes?.[i]?.subtitle || '';
        });
        state.scenes = scenes;
        // Không có SP → AI có thể trả narration rỗng → tự bù lời đọc theo chủ đề
        // (kẻo video câm + không phụ đề). Gán caption ngay để preview hiện luôn.
        const narration =
            ai.narration && ai.narration.trim()
                ? ai.narration
                : `Cả nhà ơi, shop vừa có ${topic} cực xinh nè! Inbox shop để được tư vấn và chốt đơn ngay nha!`;
        $('#vmNarr').value = narration;
        if (state.captions) _assignGlobalCaptions(narration);
        state.accent = _rand(ACCENTS);
        state.voiceId = _rand(global.Web2VideoTTS.VOICES).id;
        renderScenes();
        renderPickers();
        renderVoices();
        drawAt(0);
        setStat(
            ai.ai
                ? `✅ Kịch bản AI + ${scenes.length} cảnh ảnh kho cho "${topic}". Bấm "Tạo giọng đọc" → "Xuất video".`
                : `✅ ${scenes.length} cảnh ảnh kho cho "${topic}" (AI chưa cấu hình key). Bấm "Tạo giọng đọc".`
        );
        notify(`Đã tạo video ảnh kho cho "${topic}"`, 'success');
        return true;
    }

    // MoneyPrinterTurbo one-click: chủ đề → kịch bản AI + cảnh → giọng đọc + phụ đề
    // → XUẤT video luôn. Chuỗi 3 bước có sẵn (topicGenerate → genNarration →
    // exportVideo), thêm trạng thái + dừng sớm nếu 1 bước fail.
    async function oneClickVideo() {
        const topic = $('#vmTopic').value.trim();
        if (!topic) return notify('Nhập chủ đề video trước', 'warning');
        const btn = $('#vmOneClick');
        const stat = $('#vmTopicStat');
        const setStat = (m) => stat && (stat.textContent = m);
        if (btn) btn.disabled = true;
        try {
            setStat('① Viết kịch bản + ghép cảnh…');
            await topicGenerate();
            if (!state.scenes.length) return; // topicGenerate đã báo lý do
            setStat('② Tạo giọng đọc tiếng Việt + phụ đề…');
            await genNarration();
            if (!state.narration?.samples) {
                notify('Chưa tạo được giọng đọc — thử lại bước Tạo giọng', 'warning');
                return;
            }
            setStat('③ Đang xuất video (ghi hình theo thời lượng)…');
            await exportVideo();
            setStat('✅ Xong! Video đã tải về (kịch bản + giọng đọc + phụ đề).');
        } catch (e) {
            console.error('[video-maker] one-click error:', e);
            notify('Lỗi tạo video 1 chạm: ' + (e.message || e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    function loadImageCors(src) {
        return new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => {
                // Fallback KHÔNG CORS → ảnh sẽ "taint" canvas → MediaRecorder/captureStream
                // ném SecurityError khi xuất. Đánh dấu để cảnh báo sớm trước khi xuất.
                const i2 = new Image();
                i2._tainted = true;
                i2.onload = () => res(i2);
                i2.onerror = () => res(null);
                i2.src = src;
            };
            img.src = src;
        });
    }

    // Có cảnh nào dùng ảnh non-CORS (taint canvas) → không xuất được video.
    function hasTaintedScene() {
        return state.scenes.some((sc) => sc && sc._img && sc._img._tainted);
    }

    // ---------- nhạc nền + hiệu ứng chung + tách nhạc ----------
    function fillBulkSelects() {
        const O = global.Web2VideoSceneEditor?.OPTIONS;
        if (!O) return;
        const fill = (id, list, label) => {
            const el = $('#' + id);
            if (!el) return;
            el.innerHTML =
                `<option value="">${esc(label)}…</option>` +
                list.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
        };
        fill('vmBulkTransition', O.transition, 'Hiệu ứng');
        fill('vmBulkMotion', O.motion, 'Chuyển động');
        fill('vmBulkFilter', O.filter, 'Bộ lọc');
    }

    async function loadMusicFile(f) {
        const stat = $('#vmMusicName');
        stat.textContent = 'Đang nạp nhạc…';
        try {
            const buf = await global.Web2VideoAudio.decodeFile(f);
            state.music.buffer = buf;
            state.music.name = f.name;
            stat.textContent = `🎵 ${f.name} (${buf.duration.toFixed(1)}s)`;
            $('#vmMusicClear').hidden = false;
            notify('Đã chèn nhạc nền — sẽ ghép khi xuất', 'success');
        } catch (err) {
            stat.textContent = '';
            notify('Nhạc không giải mã được (codec không hỗ trợ)', 'error');
        }
    }

    function wireAudioUi() {
        if (!global.Web2VideoAudio) return;
        fillBulkSelects();
        const td = $('#vmTDur');
        td?.addEventListener('input', () => {
            state.transitionDur = Number(td.value);
            $('#vmTDurVal').textContent = state.transitionDur.toFixed(1) + 's';
            if (!state.playing) drawAt(0);
        });
        $('#vmBulkApply')?.addEventListener('click', () => {
            const tr = $('#vmBulkTransition').value;
            const mo = $('#vmBulkMotion').value;
            const fi = $('#vmBulkFilter').value;
            if (!tr && !mo && !fi) return notify('Chọn ít nhất 1 mục để áp dụng', 'warning');
            state.scenes.forEach((sc) => {
                if (tr) sc.transition = tr;
                if (mo) sc.motion = mo;
                if (fi) sc.filter = fi;
            });
            renderScenes();
            drawAt(0);
            notify('Đã áp dụng cho mọi cảnh', 'success');
        });
        const mv = $('#vmMusicVol');
        mv?.addEventListener('input', () => {
            state.music.volume = Number(mv.value);
            $('#vmMusicVolVal').textContent = Math.round(state.music.volume * 100) + '%';
            applyLiveVolumes(); // áp ngay nếu đang xem trước/ghi
        });
        const nv = $('#vmNarrVol');
        nv?.addEventListener('input', () => {
            state.narrationVolume = Number(nv.value);
            $('#vmNarrVolVal').textContent = Math.round(state.narrationVolume * 100) + '%';
            applyLiveVolumes();
        });
        $('#vmMusic')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) loadMusicFile(f);
        });
        $('#vmMusicClear')?.addEventListener('click', () => {
            state.music.buffer = null;
            state.music.name = '';
            $('#vmMusicName').textContent = '';
            $('#vmMusicClear').hidden = true;
            notify('Đã bỏ nhạc nền', 'info');
        });

        // ---- tách nhạc / trích audio ----
        let splitBuf = null;
        let splitName = 'audio';
        $('#vmSplitFile')?.addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const stat = $('#vmSplitStat');
            stat.textContent = 'Đang giải mã…';
            try {
                splitBuf = await global.Web2VideoAudio.decodeFile(f);
                splitName = f.name.replace(/\.[^.]+$/, '');
                $('#vmSplitActions').hidden = false;
                stat.textContent = `✅ ${f.name} — ${splitBuf.duration.toFixed(1)}s, ${splitBuf.numberOfChannels} kênh${splitBuf.numberOfChannels < 2 ? ' (MONO — không tách được giọng/nhạc)' : ''}.`;
            } catch (err) {
                splitBuf = null;
                $('#vmSplitActions').hidden = true;
                stat.textContent = '❌ Không giải mã được audio (codec không hỗ trợ).';
                notify('File không giải mã được', 'error');
            }
        });
        $('#vmSplitActions')?.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-split]');
            if (!b || !splitBuf) return;
            const VA = global.Web2VideoAudio;
            const act = b.dataset.split;
            if (act === 'audio') {
                VA.downloadWav(splitBuf, splitName + '-audio');
                return notify('Đã tải audio .wav', 'success');
            }
            if (act === 'usebg') {
                state.music.buffer = splitBuf;
                state.music.name = splitName;
                $('#vmMusicName').textContent = '🎵 ' + splitName;
                $('#vmMusicClear').hidden = false;
                return notify('Đã dùng làm nhạc nền', 'success');
            }
            // AI lọc tạp âm (ElevenLabs) — bỏ ồn nền, giữ giọng. Cần ≥4.6s.
            if (act === 'isolate') {
                const stat = $('#vmSplitStat');
                if (splitBuf.duration < 4.6)
                    return notify('Audio cần ≥4.6 giây để lọc tạp âm', 'warning');
                b.disabled = true;
                stat.textContent = 'Đang lọc tạp âm bằng AI…';
                try {
                    const wav = VA.bufferToWavBlob(splitBuf);
                    const cleaned = await global.Web2VideoTTS.elevenIsolate(wav);
                    const buf = await VA.decodeFile(cleaned);
                    splitBuf = buf; // cập nhật để tải/dùng tiếp bản đã lọc
                    state.music.buffer = buf;
                    state.music.name = splitName + '-loc';
                    $('#vmMusicName').textContent = '🎵 ' + splitName + '-loc (đã lọc)';
                    $('#vmMusicClear').hidden = false;
                    VA.downloadWav(buf, splitName + '-loc-tap-am');
                    stat.textContent = `✅ Đã lọc tạp âm — ${buf.duration.toFixed(1)}s. Đã tải về + dùng làm nhạc nền.`;
                    notify('Đã lọc tạp âm (AI)', 'success');
                } catch (err) {
                    stat.textContent = '❌ ' + (err.message || err);
                    notify('Lọc tạp âm lỗi: ' + (err.message || err), 'error');
                } finally {
                    b.disabled = false;
                }
                return;
            }
            const sp = VA.karaokeSplit(splitBuf);
            if (sp.mono) return notify('File MONO — cần nhạc stereo để tách', 'warning');
            if (act === 'music') {
                VA.downloadWav(sp.music, splitName + '-nhac');
                notify('Đã tải nhạc (bỏ giọng)', 'success');
            } else if (act === 'vocals') {
                VA.downloadWav(sp.vocals, splitName + '-giong');
                notify('Đã tải giọng', 'success');
            }
        });
    }

    // Trích audio từ file (video/audio) → WAV mono 16kHz nhỏ gọn (cho STT/isolate).
    async function extractCompactWav(fileOrBlob) {
        const ac = audioCtx();
        const ab = await fileOrBlob.arrayBuffer();
        const decoded = await ac.decodeAudioData(ab.slice(0));
        const SR = 16000;
        const OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
        const off = new OAC(1, Math.max(1, Math.ceil(decoded.duration * SR)), SR);
        const src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start();
        const r = await off.startRendering();
        return global.Web2VideoAudio.bufferToWavBlob(r);
    }

    // ---------- import video để lồng tiếng ----------
    function wireImportUi() {
        if (!global.Web2VideoImport) return;
        const stat = $('#vmImpStat');
        const clearBtn = $('#vmImpClear');
        const volRow = $('#vmImpVolRow');
        const setStat = (m) => stat && (stat.textContent = m);
        // Chép lời gốc (AI STT) → điền vào ô lời đọc để sửa + lồng giọng mới
        $('#vmImpStt')?.addEventListener('click', async (e) => {
            const f = global.Web2VideoImport.file?.();
            if (!f) return notify('Chưa nạp video', 'warning');
            const btn = e.currentTarget;
            btn.disabled = true;
            setStat('Đang trích audio + chép lời (AI)…');
            try {
                const wav = await extractCompactWav(f);
                const out = await global.Web2VideoTTS.elevenTranscribe(wav);
                const t = (out.text || '').trim();
                if (!t) {
                    setStat('Không nghe ra lời nói trong video.');
                    return notify('Không chép được lời (video không có giọng nói?)', 'warning');
                }
                $('#vmNarr').value = t;
                setStat(
                    `✅ Đã chép lời (${out.language || '?'}). Sửa lại rồi bấm "Tạo giọng đọc".`
                );
                notify('Đã chép lời gốc vào ô lời đọc', 'success');
            } catch (err) {
                setStat('❌ ' + (err.message || err));
                notify('Chép lời lỗi: ' + (err.message || err), 'error');
            } finally {
                btn.disabled = false;
            }
        });
        $('#vmImpFile')?.addEventListener('change', async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setStat('Đang đọc video…');
            try {
                const info = await global.Web2VideoImport.load(f);
                applyCanvasSize();
                drawAt(0);
                if (clearBtn) clearBtn.hidden = false;
                if (volRow) volRow.hidden = false;
                setStat(
                    `✅ ${info.name} — ${info.duration.toFixed(1)}s, ${info.w}×${info.h}. Nhập lời đọc + chọn giọng rồi bấm "Xuất video".`
                );
                notify(
                    'Đã nạp video → chuyển qua "Giọng & Âm thanh": tạo giọng đọc rồi Xuất video',
                    'success'
                );
                gotoVoiceStep(); // liên kết bước: đưa thẳng tới chỗ lồng tiếng + xuất
            } catch (err) {
                setStat('❌ ' + (err.message || err));
                notify('Không nạp được video', 'error');
            }
        });
        clearBtn?.addEventListener('click', () => {
            if (state.playing) stop();
            global.Web2VideoImport.clear();
            applyCanvasSize();
            drawAt(0);
            clearBtn.hidden = true;
            if (volRow) volRow.hidden = true;
            setStat('Đã bỏ video — quay lại chế độ slideshow ảnh.');
        });
        const iv = $('#vmImpVol');
        iv?.addEventListener('input', () => {
            global.Web2VideoImport.setVolume(Number(iv.value));
            $('#vmImpVolVal').textContent = Math.round(Number(iv.value) * 100) + '%';
        });
    }

    // ---------- hiệu ứng âm thanh AI (ElevenLabs sound effects) ----------
    function wireSoundFx() {
        const stat = $('#vmSfxStat');
        const setStat = (m) => stat && (stat.textContent = m);
        let lastBlob = null;
        // preset 1-chạm: điền mô tả + tạo luôn (mô tả tiếng Việt được backend dịch sang prompt EN)
        document.querySelectorAll('#vmSfxPresets [data-sfx]').forEach((b) =>
            b.addEventListener('click', () => {
                const inp = $('#vmSfxText');
                if (inp) inp.value = b.dataset.sfx;
                $('#vmSfxGen')?.click();
            })
        );
        $('#vmSfxGen')?.addEventListener('click', async (e) => {
            const text = ($('#vmSfxText')?.value || '').trim();
            if (!text) return notify('Mô tả âm thanh muốn tạo (vd: tiếng vỗ tay)', 'warning');
            const dur = Number($('#vmSfxDur')?.value) || undefined;
            const btn = e.currentTarget;
            btn.disabled = true;
            setStat('Đang tạo âm thanh bằng AI…');
            try {
                lastBlob = await global.Web2VideoTTS.elevenSoundEffect(text, {
                    durationSeconds: dur,
                });
                const buf = await global.Web2VideoAudio.decodeFile(lastBlob);
                // tự nghe thử
                const ac = audioCtx();
                await ac.resume?.();
                const src = ac.createBufferSource();
                src.buffer = buf;
                src.connect(ac.destination);
                src.start();
                $('#vmSfxUse').hidden = false;
                $('#vmSfxDownload').hidden = false;
                $('#vmSfxGen')._buf = buf;
                setStat(
                    `✅ Đã tạo (${buf.duration.toFixed(1)}s). Nghe thử xong: dùng làm nhạc nền hoặc tải về.`
                );
                notify('Đã tạo hiệu ứng âm thanh', 'success');
            } catch (err) {
                setStat('❌ ' + (err.message || err));
                notify('Tạo âm thanh lỗi: ' + (err.message || err), 'error');
            } finally {
                btn.disabled = false;
            }
        });
        $('#vmSfxUse')?.addEventListener('click', () => {
            const buf = $('#vmSfxGen')._buf;
            if (!buf) return;
            state.music.buffer = buf;
            state.music.name = 'hieu-ung-am-thanh';
            $('#vmMusicName').textContent = '🎵 Hiệu ứng âm thanh (AI)';
            $('#vmMusicClear').hidden = false;
            notify('Đã dùng làm nhạc nền', 'success');
        });
        $('#vmSfxDownload')?.addEventListener('click', () => {
            if (!lastBlob) return;
            const a = document.createElement('a');
            a.download = 'hieu-ung-am-thanh.mp3';
            a.href = URL.createObjectURL(lastBlob);
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 6000);
        });
    }

    // ---------- bố cục desktop: wide-edit | preview-focus | preview-hidden ----------
    // Mặc định wide-edit (vùng chỉnh full width, preview = PiP nổi). Lưu localStorage.
    // CSS làm hết layout; JS chỉ lật [data-vm-mode] + refit canvas khi đổi (stage đổi cỡ).
    function wireLayoutMode() {
        const app = $('.vm-app');
        if (!app) return;
        const KEY = 'web2_vm_layout_mode';
        const VALID = ['wide-edit', 'preview-focus', 'preview-hidden'];
        const refit = () => {
            try {
                fitPreview();
            } catch {}
        };
        const setMode = (m) => {
            if (!VALID.includes(m)) m = 'wide-edit';
            app.setAttribute('data-vm-mode', m);
            try {
                localStorage.setItem(KEY, m);
            } catch {}
            const wide = $('#vmModeWide');
            const focus = $('#vmModeFocus');
            if (wide) wide.setAttribute('aria-pressed', String(m !== 'preview-focus'));
            if (focus) focus.setAttribute('aria-pressed', String(m === 'preview-focus'));
            refit(); // canvas refit ngay…
            setTimeout(refit, 280); // …và sau khi transition cỡ stage xong
        };
        let saved = 'wide-edit';
        try {
            saved = localStorage.getItem(KEY) || 'wide-edit';
        } catch {}
        setMode(saved);
        $('#vmModeWide')?.addEventListener('click', () => setMode('wide-edit'));
        $('#vmModeFocus')?.addEventListener('click', () => setMode('preview-focus'));
        $('#vmPipExpand')?.addEventListener('click', () => setMode('preview-focus'));
        $('#vmPipHide')?.addEventListener('click', () => setMode('preview-hidden'));
        $('#vmPipReopen')?.addEventListener('click', () => setMode('wide-edit'));
    }

    function init() {
        canvas = $('#vmCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!global.Web2VideoRender) return notify('Chưa tải bộ dựng video', 'error');
        wireLayoutMode();
        renderPickers();
        // Nạp giọng đã thêm từ kho (localStorage) TRƯỚC khi render lần đầu — nếu không,
        // lần đầu chỉ hiện giọng built-in, phải đổi radio mới thấy giọng đã thêm
        // (Web2VideoLibraryUI.init bên dưới mới gọi loadLibraryVoices → quá trễ).
        try {
            global.Web2VideoTTS.loadLibraryVoices();
        } catch {}
        renderVoices();
        renderScenes();
        wireSceneList();
        wireAudioUi();
        wireImportUi();
        wireSoundFx();
        if (global.Web2VideoVieneuUI)
            global.Web2VideoVieneuUI.init({ state, onChange: renderVoices });
        if (global.Web2VideoLibraryUI)
            global.Web2VideoLibraryUI.init({
                onChange: renderVoices,
                audioCtx,
                // "Thêm" 1 giọng từ kho → CHỌN luôn giọng đó (tránh thêm xong vẫn đọc giọng cũ).
                onSelect: (id) => {
                    if (id) {
                        state.voiceId = id;
                        renderVoices();
                    }
                },
            });
        applyCanvasSize();

        $('#vmRandom')?.addEventListener('click', randomGenerate);
        $('#vmTopicGen')?.addEventListener('click', topicGenerate);
        $('#vmOneClick')?.addEventListener('click', oneClickVideo);
        $('#vmTopic')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') topicGenerate();
        });
        $('#vmAdd')?.addEventListener('change', (e) => {
            if (e.target.files?.length) addImagesFromFiles([...e.target.files]);
            e.target.value = '';
        });
        // DÁN (Ctrl+V) / kéo-thả ảnh vào khu "Nguồn" — module ảnh chung.
        window.Web2ImagePaste?.enhance?.('#vmAdd', {
            dropZone: '.vm-upload',
            hintInto: '.vm-row',
            hintText: 'hoặc dán (Ctrl+V) / kéo-thả ảnh vào đây',
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
            const raw = $('#vmNarr').value.trim();
            if (!raw) return notify('Nhập lời đọc trước', 'warning');
            // giọng OS không hiểu thẻ cảm xúc → bỏ token trước khi đọc nhanh
            const t = global.Web2VideoTTS.stripCues(raw);
            if (!global.Web2VideoTTS.speakPreview(t))
                notify('Trình duyệt không có giọng đọc sẵn', 'warning');
        });
        $('#vmExport')?.addEventListener('click', exportVideo);
        // Kho ảnh/video miễn phí (Pexels/Pixabay) — MoneyPrinterTurbo stock footage.
        $('#vmStock')?.addEventListener('click', () => {
            if (global.Web2VideoStock?.open) global.Web2VideoStock.open();
            else notify('Module kho media chưa tải', 'warning');
        });
        // Phụ đề tự động (karaoke theo lời đọc) — MoneyPrinterTurbo captions.
        const capChk = $('#vmCaptions');
        if (capChk) {
            capChk.checked = state.captions;
            capChk.addEventListener('change', () => {
                state.captions = capChk.checked;
                if (state.captions) _refreshCaptions();
                if (!state.playing) drawAt(0);
            });
        }
        global.Web2ProductsCache?.init?.().catch(() => {});
        global.addEventListener('resize', fitPreview);
    }

    function refresh() {
        renderScenes();
        if (!state.playing) drawAt(0);
    }

    // Liên kết bước: chuyển sang tab "Giọng & Âm thanh" (nơi có lời đọc + Xuất video)
    // sau khi nguồn (ảnh/cảnh/video) đã sẵn → user không bị "xong rồi làm gì".
    function gotoVoiceStep() {
        const r = document.getElementById('vmtab-voice');
        if (r) r.checked = true;
        setTimeout(() => {
            try {
                ($('#vmNarr') || $('#vmExport'))?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            } catch {}
        }, 90);
    }

    global.VideoMakerPage = { init, refresh, addSceneFromUrl, gotoVoiceStep, _state: state };
})(window);
