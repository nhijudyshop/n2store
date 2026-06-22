// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoTTS — giọng đọc tiếng Việt ON-DEVICE, NHIỀU GIỌNG (miễn phí, không server).
 *
 * 2 engine chạy NGAY TRONG TRÌNH DUYỆT (ONNX/WASM), lazy-load CDN khi cần:
 *   • MMS    : Xenova/mms-tts-vie  (transformers.js)   → Float32Array 16kHz
 *   • Piper  : vits-web (Rhasspy Piper)                → WAV Blob → decode
 *     - vi_VN-vais1000-medium, vi_VN-25hours_single-low, vi_VN-vivos-x_low
 * → tổng 4 giọng THẬT khác nhau, + "tông" (pitch) Chuẩn/Cao/Trầm = nhiều biến thể.
 * Tất cả trả `{ samples:Float32Array, sampleRate }` để MUX thẳng vào video.
 *
 *   Web2VideoTTS.VOICES / .TONES                          → cho UI chọn giọng/tông
 *   await Web2VideoTTS.synthesize(text,{voiceId,pitch,onStatus}) → { samples, sampleRate }
 *   Web2VideoTTS.toAudioBuffer(audioCtx, samples, sr)     → AudioBuffer
 *   Web2VideoTTS.SAMPLE_TEXT                              → câu mẫu nghe thử
 *
 * Vì sao: Kokoro KHÔNG có tiếng Việt. MMS + Piper đều có, ONNX-hoá sẵn cho web,
 * chạy offline → free + riêng tư + mux được.
 */
(function (global) {
    'use strict';

    const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
    const PIPER_URL = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm';
    const MMS_ID = 'Xenova/mms-tts-vie';

    // Base worker URL (1 nguồn WEB2_CONFIG) → proxy ElevenLabs server-side (giấu API key).
    function _workerBase() {
        return (
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    const _ELEVEN_BASE = () => _workerBase() + '/api/web2-elevenlabs';
    // "Giọng AI Pro" — route TRUNG TÍNH (không lộ nhà cung cấp). Backend relay .wav.
    const _PRO_BASE = () => _workerBase() + '/api/web2-tts-pro';

    // ⚠ CHỈ giữ giọng Piper KNOWN-GOOD trên trình duyệt. vi_VN-25hours_single-low &
    // vi_VN-vivos-x_low có bảng phoneme 130 symbol → espeak-ng (vits-web) sinh id 132
    // → OrtRun "out of data bounds" (crash). vais1000-medium có 256 symbol → an toàn.
    // (Nghiên cứu rhasspy/piper-voices num_symbols; xem dev-log 2026-06-22.)
    const VOICES = [
        // "Giọng AI Pro" (server) — ưu tiên đầu danh sách (user yêu cầu Adam 3). proId =
        // id giọng cộng đồng; nhãn hiển thị KHÔNG lộ tên nhà cung cấp.
        {
            id: 'pro-adam3',
            label: 'Adam 3',
            engine: 'pro',
            proId: '5r2MVjMfzwsSDzTpaLjbY9',
            note: 'Pro',
        },
        { id: 'mms', label: 'Nữ trong trẻo', engine: 'mms', note: 'MMS' },
        { id: 'vais', label: 'Nữ ấm áp', engine: 'piper', voiceId: 'vi_VN-vais1000-medium' },
    ];
    const TONES = [
        { id: 'low', label: 'Trầm', pitch: 0.9 },
        { id: 'normal', label: 'Chuẩn', pitch: 1.0 },
        { id: 'high', label: 'Cao', pitch: 1.12 },
    ];
    const SAMPLE_TEXT = 'Xin chào, đây là giọng đọc mẫu của shop nhé!';

    // Thẻ CẢM XÚC / phi ngôn ngữ (VieNeu-TTS v3 Turbo — thử nghiệm). Chèn token thẳng
    // vào lời đọc; CHỈ engine 'vieneu' hiểu, engine on-device (MMS/Piper) sẽ bị BỎ token
    // (stripCues) để không đọc literal "cười". Nguồn: github.com/pnnbao97/VieNeu-TTS.
    const CUES = [
        { token: '[cười]', label: 'Cười', icon: 'laugh' },
        { token: '[thở dài]', label: 'Thở dài', icon: 'wind' },
        { token: '[hắng giọng]', label: 'Hắng giọng', icon: 'mic-2' },
    ];

    function _voice(id) {
        return VOICES.find((v) => v.id === id) || VOICES[0];
    }

    // Giọng có hỗ trợ thẻ cảm xúc? (chỉ VieNeu v3 Turbo)
    function isCueCapable(voiceId) {
        return _voice(voiceId).engine === 'vieneu';
    }

    // "Tông giọng" (pitch) chỉ áp được cho giọng ON-DEVICE (mms/piper) — resample đổi
    // pitch. Giọng SERVER (pro/vieneu/elevenlabs) đã là giọng hoàn chỉnh/clone → resample
    // làm méo, KHÔNG giống → bỏ pitch (xem guard trong synthesize). Helper này là NGUỒN
    // DUY NHẤT để UI biết có nên cho đổi tông hay không (mirror đúng guard đó).
    function isPitchCapable(voiceId) {
        const e = _voice(voiceId).engine;
        return e !== 'pro' && e !== 'vieneu' && e !== 'elevenlabs';
    }

    // Bỏ mọi thẻ cảm xúc đã biết khỏi text (cho engine không hỗ trợ) + gom khoảng trắng.
    function stripCues(text) {
        let t = String(text || '');
        for (const c of CUES) t = t.split(c.token).join(' ');
        return t.replace(/\s{2,}/g, ' ').trim();
    }

    // ---------------- SERIALIZE inference (BẮT BUỘC) ----------------
    // ONNX Runtime Web KHÔNG an toàn khi 2 inference chạy ĐỒNG THỜI trên cùng
    // 1 session → input tensor hỏng → "Gather idx out of bounds" / "reading null".
    // Tái hiện: bấm "Nghe mẫu" (đang chạy) rồi "Tạo giọng đọc" → 2 synth() chồng.
    // → Khoá toàn cục: mọi inference (MMS + Piper) xếp hàng, mỗi lúc chỉ 1 chạy.
    let _ttsLock = Promise.resolve();
    function _serialize(fn) {
        const run = _ttsLock.then(fn, fn); // chạy sau khi cái trước settle (kể cả lỗi)
        _ttsLock = run.then(
            () => {},
            () => {}
        ); // giữ chuỗi sống, không lan lỗi sang job sau
        return run;
    }

    // ---------------- MMS (transformers.js) ----------------
    let _mmsPromise = null;
    async function _getMms(onStatus) {
        if (_mmsPromise) return _mmsPromise;
        _mmsPromise = (async () => {
            onStatus && onStatus('Đang tải thư viện giọng (MMS)…');
            const { pipeline, env } = await import(/* @vite-ignore */ TJS_URL);
            try {
                env.allowLocalModels = false;
                if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
            } catch {}
            onStatus && onStatus('Đang tải model MMS (lần đầu ~vài chục MB, sau cache)…');
            return pipeline('text-to-speech', MMS_ID);
        })().catch((e) => {
            _mmsPromise = null;
            throw e;
        });
        return _mmsPromise;
    }
    async function _mmsChunk(text, onStatus) {
        const synth = await _getMms(onStatus);
        const out = await _serialize(() => synth(text)); // không để 2 inference chồng
        return { samples: out.audio, sampleRate: out.sampling_rate || 16000 };
    }

    // ---------------- Piper (vits-web) ----------------
    let _piperPromise = null;
    async function _getPiper(onStatus) {
        if (_piperPromise) return _piperPromise;
        _piperPromise = (async () => {
            onStatus && onStatus('Đang tải engine giọng (Piper)…');
            const mod = await import(/* @vite-ignore */ PIPER_URL);
            return mod.default || mod;
        })().catch((e) => {
            _piperPromise = null;
            throw e;
        });
        return _piperPromise;
    }
    // Voice Piper hỏng trên trình duyệt (model/phoneme không khớp → OrtRun "out of data
    // bounds"). Deterministic theo voice → ghi nhận để UI ẩn + không chào lại.
    const _brokenVoices = new Set();
    function isBrokenVoice(key) {
        return _brokenVoices.has(key);
    }
    async function _piperChunk(text, voiceId, onStatus) {
        const tts = await _getPiper(onStatus);
        onStatus && onStatus('Đang tạo giọng (lần đầu tải model giọng ~vài chục MB)…');
        let wav;
        try {
            wav = await _serialize(() => tts.predict({ text, voiceId })); // serialize như MMS
        } catch (e) {
            const msg = String((e && e.message) || e);
            // Lỗi model/phoneme không tương thích (vd vi_VN-25hours_single-low) — đánh dấu hỏng.
            if (/out of data bounds|OrtRun|Gather|indices element/i.test(msg)) {
                _brokenVoices.add(voiceId);
                throw new Error(
                    'Giọng này không tương thích trên trình duyệt (lỗi model). Hãy chọn giọng khác.'
                );
            }
            throw e;
        }
        const ab = await wav.arrayBuffer();
        const ac = _decodeCtx();
        const buf = await ac.decodeAudioData(ab);
        return { samples: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate };
    }

    // ---------------- VieNeu (server, clone giọng) ----------------
    async function _vieneuChunk(text, v, onStatus) {
        if (!global.Web2Vieneu) throw new Error('Chưa tải module giọng cao cấp');
        onStatus && onStatus('Đang tạo giọng trên server máy shop…');
        if (v.cloneRef) return global.Web2Vieneu.clone(text, v.cloneRef); // nhái giọng mẫu
        return global.Web2Vieneu.synthesize(text, v.vieneuVoice || v.voiceId || v.id);
    }

    // ---------------- KHO GIỌNG Piper (catalog 100+ giọng, on-device) ----------------
    // vits-web có sẵn cả 1 catalog Piper (Hugging Face rhasspy/piper-voices): nhiều
    // ngôn ngữ + giọng CÓ TÊN (en_US-ryan-high, …). Liệt kê → nghe thử → tải về máy
    // theo nhu cầu (IndexedDB) → thêm vào danh sách chọn. 100% free, không server.
    async function listPiperCatalog(onStatus) {
        const tts = await _getPiper(onStatus);
        const list = (await tts.voices()) || [];
        let stored = [];
        try {
            stored = (await tts.stored()) || [];
        } catch {}
        const storedSet = new Set(stored);
        return list.map((v) => {
            const lang = v.language || {};
            return {
                key: v.key,
                name: v.name || v.key,
                quality: v.quality || '',
                langCode: lang.code || '',
                langName: lang.name_english || lang.name_native || lang.code || '',
                region: lang.country_english || lang.region || '',
                downloaded: storedSet.has(v.key),
            };
        });
    }
    async function piperStored() {
        try {
            const tts = await _getPiper();
            return (await tts.stored()) || [];
        } catch {
            return [];
        }
    }
    async function downloadPiperVoice(key, onProgress) {
        const tts = await _getPiper();
        await tts.download(key, (p) => {
            // p.loaded / p.total → %
            if (onProgress && p && p.total) onProgress(Math.round((p.loaded / p.total) * 100), p);
        });
        return true;
    }
    async function removePiperVoice(key) {
        const tts = await _getPiper();
        if (tts.remove) await tts.remove(key);
        return true;
    }

    // NGHE THỬ KHÔNG TẢI MODEL: Piper có sẵn clip mẫu ~60-90KB trên HuggingFace
    // (cùng repo rhasspy/piper-voices). Phát bằng <audio> thường (KHÔNG crossorigin →
    // no-cors media, bỏ qua việc HF thiếu CORS header). key: vi_VN-vais1000-medium.
    function samplePreviewUrl(voiceKey, speaker = 0) {
        const k = String(voiceKey || '');
        const dash = k.indexOf('-');
        if (dash < 0) return null;
        const locale = k.slice(0, dash); // vi_VN
        const rest = k.slice(dash + 1).split('-'); // [vais1000, medium]
        if (rest.length < 2) return null;
        const quality = rest.pop(); // medium (token cuối)
        const name = rest.join('-'); // phần giữa (an toàn nếu name có '-')
        const lang = locale.split('_')[0]; // vi
        return `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${locale}/${name}/${quality}/samples/speaker_${speaker}.mp3`;
    }
    // URL nghe thử cho 1 giọng (VOICES entry HOẶC catalog meta). null nếu phải synth.
    //   piper → clip mẫu HF; elevenlabs → preview_url; mms/vieneu → null (synth/đặc thù).
    function previewUrlForVoice(v) {
        if (!v) return null;
        if (v.engine === 'piper' || v.key) return samplePreviewUrl(v.voiceId || v.key);
        if (v.engine === 'elevenlabs') return v.previewUrl || v.preview_url || null;
        return null;
    }

    // ---------------- ElevenLabs (proxy server-side, key giấu ở Render) ----------------
    // Free tier có giọng tên 'Adam'… nhưng KHÔNG có quyền thương mại (cần attribution /
    // gói trả phí) — chỉ bật khi đã set key. Gọi qua worker /api/web2-elevenlabs.
    let _elevenAvail = null; // cache {ok, configured}
    async function elevenStatus() {
        if (_elevenAvail) return _elevenAvail;
        try {
            const r = await fetch(_ELEVEN_BASE() + '/status', { credentials: 'omit' });
            _elevenAvail = r.ok ? await r.json() : { ok: false, configured: false };
        } catch {
            _elevenAvail = { ok: false, configured: false };
        }
        return _elevenAvail;
    }
    async function listElevenVoices() {
        const r = await fetch(_ELEVEN_BASE() + '/voices', { credentials: 'omit' });
        if (!r.ok) throw new Error('Giọng AI voices HTTP ' + r.status);
        const d = await r.json();
        return (d && d.voices) || [];
    }
    // Kho giọng cộng đồng (lọc + phân trang). params: {page,page_size,gender,language,search,sort,…}
    async function listSharedVoices(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v != null && v !== '') qs.set(k, v);
        });
        const r = await fetch(_ELEVEN_BASE() + '/shared-voices?' + qs.toString(), {
            credentials: 'omit',
        });
        if (!r.ok) throw new Error('shared-voices HTTP ' + r.status);
        return r.json(); // { ok, voices, has_more, total_count }
    }
    // Thêm giọng shared vào tài khoản (dùng được trong TTS). Trả {ok, voice_id}.
    async function addSharedVoice(publicOwnerId, voiceId, name) {
        const r = await _elPost(
            '/add-shared',
            { public_owner_id: publicOwnerId, voice_id: voiceId, name },
            'Thêm giọng'
        );
        return r.json();
    }

    // Cài đặt ElevenLabs (model + voice_settings) — 1 nguồn, persist localStorage.
    const ELEVEN_SET_KEY = 'web2_vm_eleven_settings';
    const ELEVEN_DEFAULTS = {
        model_id: 'eleven_flash_v2_5', // có tiếng Việt
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0,
    };
    function getElevenSettings() {
        try {
            return Object.assign(
                {},
                ELEVEN_DEFAULTS,
                JSON.parse(localStorage.getItem(ELEVEN_SET_KEY) || '{}')
            );
        } catch {
            return { ...ELEVEN_DEFAULTS };
        }
    }
    function setElevenSettings(patch) {
        const s = Object.assign(getElevenSettings(), patch || {});
        try {
            localStorage.setItem(ELEVEN_SET_KEY, JSON.stringify(s));
        } catch {}
        return s;
    }

    async function _elevenChunk(text, v, onStatus) {
        onStatus && onStatus('Đang tạo giọng AI…');
        const s = getElevenSettings();
        const r = await fetch(_ELEVEN_BASE() + '/tts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                text: String(text || ''),
                voice_id: v.elevenId,
                model_id: v.elevenModel || s.model_id,
                language_code: 'vi',
                voice_settings: {
                    stability: s.stability,
                    similarity_boost: s.similarity_boost,
                    style: s.style,
                    use_speaker_boost: s.use_speaker_boost,
                    speed: s.speed,
                },
            }),
        });
        if (!r.ok) {
            let msg = 'HTTP ' + r.status;
            try {
                msg = (await r.json()).error || msg;
            } catch {}
            throw new Error('Giọng AI lỗi: ' + msg);
        }
        const ab = await r.arrayBuffer();
        const buf = await _decodeCtx().decodeAudioData(ab);
        return { samples: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate };
    }

    // ---------------- "Giọng AI Pro" (server proxy, tên trung tính) ----------------
    // Giọng Việt chất lượng cao (gồm giọng cộng đồng "Adam 3"…). Gọi qua worker
    // /api/web2-tts-pro; backend trả .wav (đã relay → KHÔNG lộ domain nhà cung cấp).
    let _proAvail = null;
    async function proStatus() {
        if (_proAvail) return _proAvail;
        try {
            const r = await fetch(_PRO_BASE() + '/status', { credentials: 'omit' });
            _proAvail = r.ok ? await r.json() : { ok: false, configured: false };
        } catch {
            _proAvail = { ok: false, configured: false };
        }
        return _proAvail;
    }
    // Danh sách giọng. params: {search,page,limit,scope}. scope mặc định 'community'
    // (nơi có Adam 3); 'user' = giọng tài khoản. Trả {ok,voices:[{id,name,tags,description}],total,hasNext}.
    async function listProVoices(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v != null && v !== '') qs.set(k, v);
        });
        const r = await fetch(_PRO_BASE() + '/voices?' + qs.toString(), { credentials: 'omit' });
        if (!r.ok) throw new Error('Giọng AI Pro voices HTTP ' + r.status);
        return r.json();
    }
    async function _proChunk(text, v, onStatus) {
        onStatus && onStatus('Đang tạo giọng AI Pro…');
        const r = await fetch(_PRO_BASE() + '/tts', {
            method: 'POST',
            headers: Object.assign({ 'content-type': 'application/json' }, _w2auth()),
            body: JSON.stringify({
                text: String(text || ''),
                voice_id: v.proId,
                speed: v.speed || 1.0,
            }),
        });
        if (!r.ok) {
            let msg = 'HTTP ' + r.status;
            try {
                msg = (await r.json()).error || msg;
            } catch {}
            throw new Error('Giọng AI Pro lỗi: ' + msg);
        }
        const ab = await r.arrayBuffer();
        const buf = await _decodeCtx().decodeAudioData(ab);
        return { samples: buf.getChannelData(0).slice(), sampleRate: buf.sampleRate };
    }

    // ---- ElevenLabs tool calls (sound effect / STT / isolation) qua proxy ----
    async function _blobB64(blob) {
        const ab = await blob.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH)
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        return btoa(bin);
    }
    function _w2auth() {
        try {
            const a = JSON.parse(localStorage.getItem('web2_auth') || '{}');
            return a && a.token ? { 'x-web2-token': a.token } : {};
        } catch {
            return {};
        }
    }
    async function _elPost(path, body, label) {
        const r = await fetch(_ELEVEN_BASE() + path, {
            method: 'POST',
            headers: Object.assign({ 'content-type': 'application/json' }, _w2auth()),
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            let m = 'HTTP ' + r.status;
            try {
                m = (await r.json()).error || m;
            } catch {}
            throw new Error((label || 'Giọng AI') + ' lỗi: ' + m);
        }
        return r;
    }
    // mô tả → Blob mp3 hiệu ứng âm thanh
    async function elevenSoundEffect(text, opts = {}) {
        const r = await _elPost(
            '/sound',
            {
                text: String(text || ''),
                duration_seconds: opts.durationSeconds,
                prompt_influence: opts.promptInfluence,
            },
            'Tạo âm thanh'
        );
        return r.blob();
    }
    // audio Blob → { text, language } (chép lời)
    async function elevenTranscribe(blob) {
        const audio = await _blobB64(blob);
        const r = await _elPost(
            '/stt',
            { audio, mime: blob.type || 'audio/wav', filename: 'audio.wav' },
            'Chép lời'
        );
        const d = await r.json();
        return { text: d.text || '', language: d.language || '' };
    }
    // audio Blob → Blob mp3 đã lọc tạp âm
    async function elevenIsolate(blob) {
        const audio = await _blobB64(blob);
        const r = await _elPost(
            '/isolate',
            { audio, mime: blob.type || 'audio/wav', filename: 'audio.wav' },
            'Lọc tạp âm'
        );
        return r.blob();
    }

    let _dctx = null;
    function _decodeCtx() {
        if (!_dctx) _dctx = new (global.AudioContext || global.webkitAudioContext)();
        return _dctx;
    }

    // ---------------- pitch (resample, ghép pitch+tempo) ----------------
    function _resample(samples, factor) {
        if (!factor || factor === 1) return samples;
        const outLen = Math.max(1, Math.round(samples.length / factor));
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const src = i * factor;
            const i0 = Math.floor(src);
            const frac = src - i0;
            const a = samples[i0] || 0;
            const b = samples[i0 + 1] != null ? samples[i0 + 1] : a;
            out[i] = a + (b - a) * frac;
        }
        return out;
    }

    // ---------------- public synthesize ----------------
    async function synthesize(text, opts = {}) {
        const onStatus = opts.onStatus;
        const clean = String(text || '').trim();
        if (!clean) throw new Error('Chưa có nội dung lời đọc');
        const v = _voice(opts.voiceId);
        // Thẻ cảm xúc chỉ VieNeu hiểu — engine khác bỏ token để khỏi đọc literal.
        const work = v.engine === 'vieneu' ? clean : stripCues(clean);
        const chunks = _splitSentences(work);
        const parts = [];
        let sampleRate = 16000;
        for (let i = 0; i < chunks.length; i++) {
            onStatus && onStatus(`Đang tạo giọng đọc… (${i + 1}/${chunks.length})`);
            const r =
                v.engine === 'mms'
                    ? await _mmsChunk(chunks[i], onStatus)
                    : v.engine === 'vieneu'
                      ? await _vieneuChunk(chunks[i], v, onStatus)
                      : v.engine === 'elevenlabs'
                        ? await _elevenChunk(chunks[i], v, onStatus)
                        : v.engine === 'pro'
                          ? await _proChunk(chunks[i], v, onStatus)
                          : await _piperChunk(chunks[i], v.voiceId, onStatus);
            sampleRate = r.sampleRate;
            parts.push(r.samples);
            if (i < chunks.length - 1) parts.push(new Float32Array(Math.round(sampleRate * 0.18)));
        }
        let samples = _concat(parts);
        // Pitch (tông Trầm/Cao) = resample → ĐỔI timbre. Engine server (pro/vieneu/elevenlabs)
        // đã là giọng hoàn chỉnh/clone → resample làm "méo, không giống". Chỉ áp pitch cho
        // giọng on-device (mms/piper).
        const isServer = v.engine === 'pro' || v.engine === 'vieneu' || v.engine === 'elevenlabs';
        const pitch = Number(opts.pitch) || 1;
        if (pitch !== 1 && !isServer) samples = _resample(samples, pitch);
        return { samples, sampleRate };
    }

    // Tổng hợp 1 đoạn ngắn cho 1 giọng bất kỳ (CHƯA cần có trong VOICES) — dùng để
    // NGHE THỬ trong kho giọng. meta: {engine:'piper',key} | {engine:'elevenlabs',elevenId} | {engine:'mms'}
    async function synthVoiceMeta(meta, text, opts = {}) {
        const onStatus = opts.onStatus;
        const t = String(text || '').trim();
        if (!t) throw new Error('Chưa có nội dung');
        if (!meta || !meta.engine) throw new Error('Thiếu thông tin giọng');
        if (meta.engine === 'elevenlabs')
            return _elevenChunk(
                t,
                { elevenId: meta.elevenId, elevenModel: meta.elevenModel },
                onStatus
            );
        if (meta.engine === 'pro') return _proChunk(t, { proId: meta.proId }, onStatus);
        if (meta.engine === 'mms') return _mmsChunk(t, onStatus);
        // piper catalog — đảm bảo đã tải model trước khi predict
        const key = meta.key || meta.voiceId;
        const tts = await _getPiper(onStatus);
        try {
            const st = (await tts.stored()) || [];
            if (!st.includes(key)) {
                onStatus && onStatus('Đang tải giọng về máy…');
                await tts.download(key, () => {});
            }
        } catch {}
        return _piperChunk(t, key, onStatus);
    }

    function _concat(parts) {
        const total = parts.reduce((n, a) => n + a.length, 0);
        const out = new Float32Array(total);
        let off = 0;
        for (const a of parts) {
            out.set(a, off);
            off += a.length;
        }
        return out;
    }

    function _splitSentences(text) {
        const raw = text
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?…\n])\s+|\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const out = [];
        let buf = '';
        for (const s of raw) {
            if ((buf + ' ' + s).trim().length > 200 && buf) {
                out.push(buf.trim());
                buf = s;
            } else buf = buf ? buf + ' ' + s : s;
        }
        if (buf) out.push(buf.trim());
        return out.length ? out : [text];
    }

    function toAudioBuffer(audioCtx, samples, sampleRate) {
        const buf = audioCtx.createBuffer(1, samples.length, sampleRate);
        // Fallback Safari/iOS cũ thiếu copyToChannel (audit r4) — khớp web2-video-audio.js.
        if (buf.copyToChannel) buf.copyToChannel(samples, 0);
        else buf.getChannelData(0).set(samples);
        return buf;
    }

    // ----- fallback giọng hệ điều hành (nghe nhanh, KHÔNG mux) -----
    function speakPreview(text) {
        try {
            if (!global.speechSynthesis) return false;
            global.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(String(text || ''));
            const vis = global.speechSynthesis.getVoices() || [];
            const vi = vis.find(
                (v) => /vi[-_]?VN|Vietnam/i.test(v.lang) || /Vietnam/i.test(v.name)
            );
            if (vi) u.voice = vi;
            u.lang = 'vi-VN';
            global.speechSynthesis.speak(u);
            return true;
        } catch {
            return false;
        }
    }
    function cancelPreview() {
        try {
            global.speechSynthesis?.cancel();
        } catch {}
    }

    // Thêm/cập nhật giọng VieNeu (server) + giọng đã clone vào danh sách VOICES.
    // serverVoices: [{label, voice_id}] từ Web2Vieneu.listVoices(); clonedRef: Blob|null.
    function registerVieneuVoices(serverVoices, clonedRef) {
        for (let i = VOICES.length - 1; i >= 0; i--) {
            if (VOICES[i].engine === 'vieneu') VOICES.splice(i, 1);
        }
        if (clonedRef) {
            VOICES.push({
                id: 'vieneu-clone',
                engine: 'vieneu',
                label: '⭐ Giọng của tôi (clone)',
                cloneRef: clonedRef,
            });
        }
        (serverVoices || []).forEach((sv) => {
            VOICES.push({
                id: 'vieneu-' + sv.voice_id,
                engine: 'vieneu',
                label: '🎙️ ' + (sv.label || sv.voice_id),
                vieneuVoice: sv.voice_id,
            });
        });
        return VOICES.filter((v) => v.engine === 'vieneu');
    }

    // ---------------- KHO GIỌNG đã "kéo về" (persist localStorage) ----------------
    // Giọng user chọn từ kho (Piper catalog / ElevenLabs) được thêm vào VOICES và
    // lưu lại để lần sau mở vẫn còn. KHÔNG đụng 4 giọng built-in / VieNeu / clone.
    const LIB_KEY = 'web2_vm_lib_voices';
    function hasVoice(id) {
        return VOICES.some((v) => v.id === id);
    }
    function _persistLib() {
        try {
            const lib = VOICES.filter((v) => v._lib).map((v) => ({
                id: v.id,
                engine: v.engine,
                label: v.label,
                voiceId: v.voiceId || null,
                elevenId: v.elevenId || null,
                elevenModel: v.elevenModel || null,
                proId: v.proId || null,
                lang: v.lang || null,
            }));
            localStorage.setItem(LIB_KEY, JSON.stringify(lib));
        } catch {}
    }
    // Thêm 1 giọng từ kho vào danh sách chọn. meta:
    //   piper:      { engine:'piper', key, label, lang }
    //   elevenlabs: { engine:'elevenlabs', elevenId, label, elevenModel? }
    function addLibraryVoice(meta) {
        if (!meta || !meta.engine) return null;
        const id =
            meta.engine === 'elevenlabs'
                ? 'el-' + meta.elevenId
                : meta.engine === 'pro'
                  ? 'pro-' + meta.proId
                  : 'piper-' + (meta.key || meta.voiceId);
        if (hasVoice(id)) return id;
        const entry = {
            id,
            engine: meta.engine,
            label: meta.label || id,
            _lib: true,
            lang: meta.lang || '',
        };
        if (meta.engine === 'elevenlabs') {
            entry.elevenId = meta.elevenId;
            entry.elevenModel = meta.elevenModel || '';
        } else if (meta.engine === 'pro') {
            entry.proId = meta.proId;
        } else {
            entry.voiceId = meta.key || meta.voiceId;
        }
        VOICES.push(entry);
        _persistLib();
        return id;
    }
    function removeLibraryVoice(id) {
        const i = VOICES.findIndex((v) => v.id === id && v._lib);
        if (i >= 0) {
            VOICES.splice(i, 1);
            _persistLib();
            return true;
        }
        return false;
    }
    function loadLibraryVoices() {
        let lib = [];
        try {
            lib = JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
        } catch {}
        (lib || []).forEach((m) => {
            if (hasVoice(m.id)) return;
            VOICES.push({ ...m, _lib: true });
        });
        return VOICES.filter((v) => v._lib);
    }

    global.Web2VideoTTS = {
        VOICES,
        TONES,
        CUES,
        SAMPLE_TEXT,
        synthesize,
        toAudioBuffer,
        speakPreview,
        cancelPreview,
        registerVieneuVoices,
        isCueCapable,
        isPitchCapable,
        stripCues,
        // kho giọng Piper (free, on-device)
        listPiperCatalog,
        piperStored,
        downloadPiperVoice,
        removePiperVoice,
        // nghe thử không tải model + nhận diện giọng hỏng
        samplePreviewUrl,
        previewUrlForVoice,
        isBrokenVoice,
        // Giọng AI Pro (proxy, tên trung tính — không lộ nhà cung cấp)
        proStatus,
        listProVoices,
        // ElevenLabs (proxy)
        elevenStatus,
        listElevenVoices,
        listSharedVoices,
        addSharedVoice,
        getElevenSettings,
        setElevenSettings,
        // nghe thử 1 giọng bất kỳ (chưa cần trong VOICES)
        synthVoiceMeta,
        // ElevenLabs tools
        elevenSoundEffect,
        elevenTranscribe,
        elevenIsolate,
        // quản lý giọng đã kéo về
        addLibraryVoice,
        removeLibraryVoice,
        loadLibraryVoices,
        hasVoice,
    };
})(window);
