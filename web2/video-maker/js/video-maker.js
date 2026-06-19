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
        voiceId: 'mms',
        tone: 'normal',
        narration: { text: '', samples: null, sampleRate: 16000 },
        music: { buffer: null, name: '', volume: 0.35 }, // nhạc nền (chèn/ghép)
        narrationVolume: 1.0,
        playing: false,
        recording: false,
        _raf: null,
        _sampleCache: {}, // key voiceId|tone → {samples,sampleRate}
        _sampling: false,
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
            transitionDur: state.transitionDur,
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
                voiceId: state.voiceId,
                pitch: tonePitch(),
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
        if (global.Web2VideoAudio) return global.Web2VideoAudio.ac();
        if (!_audioCtx) _audioCtx = new (global.AudioContext || global.webkitAudioContext)();
        return _audioCtx;
    }
    // graph trộn giọng đọc + nhạc nền → đích (preview: ac.destination | record: dest)
    function buildAudioGraph(dest) {
        const ac = audioCtx();
        return global.Web2VideoAudio.buildMixGraph({
            audioCtx: ac,
            dest: dest || ac.destination,
            narrationBuffer: narrationBuffer(),
            narrationVol: state.narrationVolume,
            musicBuffer: state.music.buffer,
            musicVol: state.music.volume,
            loopMusic: true,
        });
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
        const ac = audioCtx();
        ac.resume?.();
        const graph = buildAudioGraph(ac.destination);
        graph.start();
        const loop = () => {
            const t = (performance.now() - start) / 1000;
            if (t >= total || !state.playing) {
                stop();
                return;
            }
            drawAt(t);
            state._raf = requestAnimationFrame(loop);
        };
        state._stopSrc = () => graph.stop();
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
            // mux audio: giọng đọc + nhạc nền (ghép)
            const ac = audioCtx();
            await ac.resume?.();
            const adest = ac.createMediaStreamDestination();
            const graph = buildAudioGraph(adest);
            if (graph.hasAudio) adest.stream.getAudioTracks().forEach((tr) => vstream.addTrack(tr));
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
            graph.start();
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
            graph.stop();
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
        }
        const tw = $('#vmTones');
        if (tw) {
            tw.innerHTML = TTS.TONES.map(
                (t) =>
                    `<button type="button" class="vm-chip ${t.id === state.tone ? 'on' : ''}" data-tone="${t.id}">${esc(t.label)}</button>`
            ).join('');
            tw.querySelectorAll('[data-tone]').forEach((b) =>
                b.addEventListener('click', () => {
                    state.tone = b.dataset.tone;
                    tw.querySelectorAll('[data-tone]').forEach((x) =>
                        x.classList.toggle('on', x === b)
                    );
                })
            );
        }
        if (global.lucide) global.lucide.createIcons();
    }

    // nghe mẫu 1 câu cố định bằng giọng + tông đang chọn (cache theo voice|tone)
    async function playSample(voiceId) {
        if (state._sampling) return;
        const tone = state.tone;
        const key = voiceId + '|' + tone;
        const stat = $('#vmVoiceStat');
        try {
            state._sampling = true;
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
                pick.map(async (p) => {
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
                    });
                })
            );
            // giữ đúng thứ tự đã pick
            scenes.sort(
                (a, b) =>
                    pick.findIndex((p) => p.name === a._name) -
                    pick.findIndex((p) => p.name === b._name)
            );
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
            const all = (global.Web2ProductsCache?.getAll?.() || []).filter(
                (p) => p && p.imageUrl && /^(https?:\/\/|\/|data:image\/)/i.test(String(p.imageUrl))
            );
            if (!all.length) {
                setStat('Kho chưa có SP kèm ảnh — bấm "+ Thêm ảnh" tay nhé.');
                return notify('Kho chưa có SP kèm ảnh', 'warning');
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

    function loadImageCors(src) {
        return new Promise((res) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => res(img);
            img.onerror = () => {
                const i2 = new Image();
                i2.onload = () => res(i2);
                i2.onerror = () => res(null);
                i2.src = src;
            };
            img.src = src;
        });
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
        });
        const nv = $('#vmNarrVol');
        nv?.addEventListener('input', () => {
            state.narrationVolume = Number(nv.value);
            $('#vmNarrVolVal').textContent = Math.round(state.narrationVolume * 100) + '%';
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
        $('#vmSplitActions')?.addEventListener('click', (e) => {
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

    function init() {
        canvas = $('#vmCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        if (!global.Web2VideoRender) return notify('Chưa tải bộ dựng video', 'error');
        renderPickers();
        renderVoices();
        renderScenes();
        wireSceneList();
        wireAudioUi();
        applyCanvasSize();

        $('#vmRandom')?.addEventListener('click', randomGenerate);
        $('#vmTopicGen')?.addEventListener('click', topicGenerate);
        $('#vmTopic')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') topicGenerate();
        });
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

    function refresh() {
        renderScenes();
        if (!state.playing) drawAt(0);
    }

    global.VideoMakerPage = { init, refresh, _state: state };
})(window);
