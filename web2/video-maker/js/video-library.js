// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoLibraryUI — KHO GIỌNG cho video-maker. Modal duyệt + nghe thử + "kéo về":
 *   • Miễn phí (trên máy): catalog Piper (vits-web) — 100+ giọng CÓ TÊN, nhiều ngôn ngữ.
 *     "Kéo về" = tải model về máy (IndexedDB) rồi thêm vào danh sách chọn (persist).
 *   • ElevenLabs (tuỳ chọn): giọng tên 'Adam'… — chỉ hiện khi server đã set API key.
 *     ⚠ Free tier KHÔNG có quyền thương mại (cần attribution/gói trả phí).
 *
 * Dùng Web2VideoTTS (listPiperCatalog / downloadPiperVoice / listElevenVoices /
 * addLibraryVoice / synthVoiceMeta). Trang chỉ điều phối: onChange = renderVoices.
 *
 *   Web2VideoLibraryUI.init({ onChange, audioCtx })
 */
(function (global) {
    'use strict';

    const $ = (s, r) => (r || document).querySelector(s);
    const notify = (m, t) =>
        global.notificationManager?.show?.(m, t || 'info') || console.log('[vlib]', m);
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );

    let _ctx = null; // { onChange, audioCtx }
    let _modal = null;
    let _tab = 'free'; // free | eleven
    let _piperCatalog = null; // cache
    let _elevenVoices = null;
    let _elevenConfigured = false;
    let _busy = false; // 1 audition/download tại 1 thời điểm
    let _previewSrc = null;
    // Kho giọng ElevenLabs cộng đồng (shared) — ưu tiên VN + lọc + cuộn nạp thêm.
    const _shared = {
        items: [],
        page: 0,
        hasMore: true,
        loading: false,
        lang: 'vi',
        gender: '',
        q: '',
    };
    let _elScrollBound = false;

    function init(ctx) {
        _ctx = ctx || {};
        const TTS = global.Web2VideoTTS;
        if (!TTS) return;
        // khôi phục giọng đã kéo về lần trước
        try {
            TTS.loadLibraryVoices();
        } catch {}
        $('#vmLibOpen')?.addEventListener('click', open);
    }

    function _audio() {
        return (
            _ctx.audioCtx?.() ||
            global.Web2VideoAudio?.ac?.() ||
            (global.AudioContext && new AudioContext())
        );
    }

    function _stopPreview() {
        try {
            _previewSrc?.stop?.();
        } catch {}
        try {
            _previewSrc?.pause?.();
        } catch {}
        _previewSrc = null;
    }

    function _buildModal() {
        const el = document.createElement('div');
        el.className = 'vm-lib-overlay';
        el.innerHTML = `
            <div class="vm-lib modal-content" role="dialog" aria-label="Kho giọng đọc">
                <div class="vm-lib-head">
                    <b><i data-lucide="library"></i> Kho giọng đọc</b>
                    <button class="vm-lib-x" id="vmLibClose" aria-label="Đóng"><i data-lucide="x"></i></button>
                </div>
                <div class="vm-lib-tabs">
                    <button class="vm-lib-tab on" data-tab="free"><i data-lucide="hard-drive-download"></i> Miễn phí (trên máy)</button>
                    <button class="vm-lib-tab" data-tab="eleven"><i data-lucide="sparkles"></i> ElevenLabs</button>
                </div>
                <div class="vm-lib-filter">
                    <input type="search" id="vmLibSearch" class="vm-topic-in" placeholder="Tìm theo tên / ngôn ngữ (vd: english, ryan, vietnam)…" />
                    <select id="vmLibLang" class="vm-dsel"></select>
                </div>
                <div class="vm-lib-list modal-body" id="vmLibList"></div>
                <div class="vm-lib-foot" id="vmLibFoot"></div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => {
            if (e.target === el) close();
        });
        $('#vmLibClose', el).addEventListener('click', close);
        el.querySelectorAll('.vm-lib-tab').forEach((b) =>
            b.addEventListener('click', () => {
                _tab = b.dataset.tab;
                el.querySelectorAll('.vm-lib-tab').forEach((x) =>
                    x.classList.toggle('on', x === b)
                );
                render();
            })
        );
        let _deb;
        $('#vmLibSearch', el).addEventListener('input', () => {
            clearTimeout(_deb);
            _deb = setTimeout(() => {
                if (_tab === 'eleven') _loadShared(true);
                else render();
            }, 250);
        });
        $('#vmLibLang', el).addEventListener('change', render);
        return el;
    }

    async function open() {
        if (!_modal) _modal = _buildModal();
        _modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        if (global.lucide) global.lucide.createIcons();
        // tải dữ liệu lần đầu
        const TTS = global.Web2VideoTTS;
        const foot = $('#vmLibFoot');
        if (!_piperCatalog) {
            $('#vmLibList').innerHTML =
                '<div class="vm-lib-loading">Đang nạp danh sách giọng…</div>';
            try {
                _piperCatalog = await TTS.listPiperCatalog();
                _fillLangFilter();
            } catch (e) {
                _piperCatalog = [];
                notify('Không nạp được kho giọng Piper: ' + (e.message || e), 'error');
            }
        }
        // ElevenLabs status (1 lần)
        if (_elevenVoices == null) {
            try {
                const st = await TTS.elevenStatus();
                _elevenConfigured = !!(st && st.configured);
            } catch {
                _elevenConfigured = false;
            }
        }
        render();
    }

    function close() {
        _stopPreview();
        if (_modal) _modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function _fillLangFilter() {
        const sel = $('#vmLibLang');
        if (!sel || !_piperCatalog) return;
        const langs = [...new Set(_piperCatalog.map((v) => v.langName).filter(Boolean))].sort();
        sel.innerHTML =
            '<option value="">Mọi ngôn ngữ</option>' +
            langs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
        // ưu tiên Vietnamese + English mặc định: để "" (mọi ngôn ngữ) cho dễ duyệt
    }

    function render() {
        if (!_modal) return;
        if (global.lucide) setTimeout(() => global.lucide.createIcons(), 0);
        const filterRow = $('#vmLibLang');
        if (_tab === 'eleven') {
            if (filterRow) filterRow.style.display = 'none';
            renderEleven();
        } else {
            if (filterRow) filterRow.style.display = '';
            renderFree();
        }
    }

    function _voiceRow(opts) {
        // opts: { id, title, sub, badges:[], added, onPreview, onToggle, addLabel }
        return opts;
    }

    function renderFree() {
        const list = $('#vmLibList');
        const foot = $('#vmLibFoot');
        const TTS = global.Web2VideoTTS;
        foot.innerHTML =
            '100% miễn phí, chạy trên máy (Piper). "Kéo về" = tải model 1 lần (~vài chục MB) rồi dùng offline.';
        const q = ($('#vmLibSearch')?.value || '').trim().toLowerCase();
        const lang = $('#vmLibLang')?.value || '';
        let rows = (_piperCatalog || []).filter((v) => {
            if (lang && v.langName !== lang) return false;
            if (!q) return true;
            return (
                (v.name || '').toLowerCase().includes(q) ||
                (v.key || '').toLowerCase().includes(q) ||
                (v.langName || '').toLowerCase().includes(q)
            );
        });
        // gọn: tối đa 80 dòng hiển thị để modal nhẹ
        const total = rows.length;
        const capped = rows.slice(0, 80);
        list.innerHTML =
            capped
                .map((v) => {
                    const added = TTS.hasVoice('piper-' + v.key);
                    return `
                <div class="vm-lib-row" data-key="${esc(v.key)}">
                    <div class="vm-lib-info">
                        <div class="vm-lib-name">${esc(v.name)} ${v.downloaded ? '<span class="vm-lib-dot" title="Đã tải về máy">●</span>' : ''}</div>
                        <div class="vm-lib-meta">${esc(v.langName)}${v.region ? ' · ' + esc(v.region) : ''}${v.quality ? ' · ' + esc(v.quality) : ''}</div>
                    </div>
                    <div class="vm-lib-acts">
                        <button class="vm-btn sm vm-lib-prev" data-key="${esc(v.key)}"><i data-lucide="volume-2"></i> Nghe thử</button>
                        <button class="vm-btn sm ${added ? '' : 'primary'} vm-lib-add" data-key="${esc(v.key)}" ${added ? 'disabled' : ''}>
                            <i data-lucide="${added ? 'check' : 'download'}"></i> ${added ? 'Đã thêm' : 'Kéo về'}
                        </button>
                    </div>
                </div>`;
                })
                .join('') +
            (total > capped.length
                ? `<div class="vm-lib-more">Hiển thị ${capped.length}/${total} — gõ tìm để lọc bớt.</div>`
                : '') +
            (total === 0 ? '<div class="vm-lib-more">Không thấy giọng phù hợp.</div>' : '');
        list.querySelectorAll('.vm-lib-prev').forEach((b) =>
            b.addEventListener('click', () => previewPiper(b.dataset.key, b))
        );
        list.querySelectorAll('.vm-lib-add').forEach((b) =>
            b.addEventListener('click', () => addPiper(b.dataset.key, b))
        );
        if (global.lucide) global.lucide.createIcons();
    }

    // ===== Tab ElevenLabs: kho giọng cộng đồng — VN ưu tiên + lọc + cuộn nạp thêm + cài đặt =====
    function renderEleven() {
        const list = $('#vmLibList');
        const foot = $('#vmLibFoot');
        foot.innerHTML =
            '⚠ ElevenLabs free ~10k ký tự/tháng, KHÔNG quyền thương mại (cần attribution / gói trả phí). "Thêm" tốn 1 slot giọng (free ít) → dùng vài giọng ưng ý.';
        if (!_elevenConfigured) {
            list.innerHTML =
                '<div class="vm-lib-empty"><b>Chưa bật ElevenLabs.</b><br>Lấy free key tại elevenlabs.io → đặt <code>ELEVENLABS_API_KEY1/2/3</code> trên server Render (web2-api) → tải lại trang.</div>';
            return;
        }
        const langOpts = [
            ['vi', '🇻🇳 Tiếng Việt'],
            ['', '🌐 Mọi ngôn ngữ'],
            ['en', 'English'],
        ];
        const genOpts = [
            ['', 'Mọi giới tính'],
            ['female', 'Nữ'],
            ['male', 'Nam'],
        ];
        list.innerHTML = `
            <div class="vm-el-head">
                <details class="vm-el-settings">
                    <summary><i data-lucide="sliders-horizontal"></i> Cài đặt giọng (chất lượng đọc)</summary>
                    <div id="vmElSet"></div>
                </details>
                <div class="vm-el-filters">
                    <select id="vmElLang" class="vm-dsel">${langOpts.map(([v, l]) => `<option value="${v}" ${_shared.lang === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                    <select id="vmElGender" class="vm-dsel">${genOpts.map(([v, l]) => `<option value="${v}" ${_shared.gender === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
                </div>
            </div>
            <div class="vm-el-rows" id="vmElRows"></div>
            <div class="vm-lib-more" id="vmElMore"></div>`;
        _renderElevenSettings();
        $('#vmElLang')?.addEventListener('change', (e) => {
            _shared.lang = e.target.value;
            _loadShared(true);
        });
        $('#vmElGender')?.addEventListener('change', (e) => {
            _shared.gender = e.target.value;
            _loadShared(true);
        });
        if (!_elScrollBound) {
            list.addEventListener('scroll', _onElScroll, { passive: true });
            _elScrollBound = true;
        }
        _loadShared(true);
        if (global.lucide) global.lucide.createIcons();
    }

    function _slider(id, label, val) {
        return `<label class="vm-slabel">${esc(label)} <b id="${id}V">${Math.round(val * 100)}%</b></label>
            <input type="range" id="${id}" class="vm-range" min="0" max="1" step="0.05" value="${val}">`;
    }
    function _renderElevenSettings() {
        const box = $('#vmElSet');
        const TTS = global.Web2VideoTTS;
        if (!box || !TTS.getElevenSettings) return;
        const s = TTS.getElevenSettings();
        const models = [
            ['eleven_flash_v2_5', 'Flash v2.5 — nhanh, có Tiếng Việt (khuyên dùng)'],
            ['eleven_v3', 'v3 — biểu cảm nhất'],
            ['eleven_turbo_v2_5', 'Turbo v2.5'],
        ];
        box.innerHTML = `
            <label class="vm-slabel">Model</label>
            <select id="vmElModel" class="vm-dsel">${models.map(([id, lb]) => `<option value="${id}" ${s.model_id === id ? 'selected' : ''}>${esc(lb)}</option>`).join('')}</select>
            ${_slider('vmElStab', 'Ổn định (stability)', s.stability)}
            ${_slider('vmElSim', 'Giống giọng gốc (similarity)', s.similarity_boost)}
            ${_slider('vmElStyle', 'Biểu cảm (style)', s.style)}
            <label class="vm-slabel">Tốc độ <b id="vmElSpeedV">${s.speed.toFixed(2)}×</b></label>
            <input type="range" id="vmElSpeed" class="vm-range" min="0.7" max="1.2" step="0.05" value="${s.speed}">`;
        $('#vmElModel')?.addEventListener('change', (e) =>
            TTS.setElevenSettings({ model_id: e.target.value })
        );
        const bind = (id, key, pct) => {
            const el = $('#' + id);
            el?.addEventListener('input', () => {
                const v = Number(el.value);
                TTS.setElevenSettings({ [key]: v });
                const lbl = $('#' + id + 'V');
                if (lbl) lbl.textContent = pct ? Math.round(v * 100) + '%' : v.toFixed(2) + '×';
            });
        };
        bind('vmElStab', 'stability', true);
        bind('vmElSim', 'similarity_boost', true);
        bind('vmElStyle', 'style', true);
        bind('vmElSpeed', 'speed', false);
        if (global.lucide) global.lucide.createIcons();
    }

    function _onElScroll(e) {
        if (_tab !== 'eleven') return;
        const el = e.target;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 140) _loadShared(false);
    }

    async function _loadShared(reset) {
        const TTS = global.Web2VideoTTS;
        if (_shared.loading) return;
        if (reset) {
            _shared.page = 0;
            _shared.hasMore = true;
            _shared.items = [];
            const rows = $('#vmElRows');
            if (rows) rows.innerHTML = '';
        }
        if (!_shared.hasMore) return;
        _shared.loading = true;
        _shared.q = ($('#vmLibSearch')?.value || '').trim();
        const more = $('#vmElMore');
        if (more) more.textContent = 'Đang nạp giọng…';
        try {
            const params = { page: _shared.page, page_size: 30, sort: 'trending' };
            if (_shared.lang) params.language = _shared.lang;
            if (_shared.gender) params.gender = _shared.gender;
            if (_shared.q) params.search = _shared.q;
            const d = await TTS.listSharedVoices(params);
            const items = d.voices || [];
            _shared.items.push(...items);
            _shared.hasMore = !!d.has_more && items.length > 0;
            _shared.page += 1;
            _appendSharedRows(items);
            if (more)
                more.textContent = _shared.hasMore
                    ? 'Cuộn xuống để xem thêm…'
                    : _shared.items.length
                      ? '— Hết —'
                      : 'Không tìm thấy giọng phù hợp.';
        } catch (e) {
            if (more) more.textContent = 'Lỗi nạp: ' + (e.message || e);
        } finally {
            _shared.loading = false;
        }
    }

    function _appendSharedRows(items) {
        const TTS = global.Web2VideoTTS;
        const rows = $('#vmElRows');
        if (!rows) return;
        const html = items
            .map((v) => {
                const added = TTS.hasVoice('el-' + v.voice_id);
                const meta = [v.gender, v.accent, v.language, v.use_case]
                    .filter(Boolean)
                    .join(' · ');
                const freeBadge = v.free_users_allowed
                    ? '<span class="vm-el-free">free OK</span>'
                    : '<span class="vm-el-paid">cần gói</span>';
                return `
                <div class="vm-lib-row" data-vid="${esc(v.voice_id)}">
                    <div class="vm-lib-info">
                        <div class="vm-lib-name">${esc(v.name)} ${freeBadge}</div>
                        <div class="vm-lib-meta">${esc(meta)}</div>
                    </div>
                    <div class="vm-lib-acts">
                        <button class="vm-btn sm vm-lib-eprev" data-prev="${esc(v.preview_url || '')}"><i data-lucide="volume-2"></i> Nghe thử</button>
                        <button class="vm-btn sm ${added ? '' : 'primary'} vm-lib-eadd" data-i="${esc(v.voice_id)}" ${added ? 'disabled' : ''}>
                            <i data-lucide="${added ? 'check' : 'plus'}"></i> ${added ? 'Đã thêm' : 'Thêm'}
                        </button>
                    </div>
                </div>`;
            })
            .join('');
        rows.insertAdjacentHTML('beforeend', html);
        // wire only the newly-added rows
        rows.querySelectorAll('.vm-lib-eprev:not([data-w])').forEach((b) => {
            b.setAttribute('data-w', '1');
            b.addEventListener('click', () => previewEleven(null, b.dataset.prev, b));
        });
        rows.querySelectorAll('.vm-lib-eadd:not([data-w])').forEach((b) => {
            b.setAttribute('data-w', '1');
            b.addEventListener('click', () => {
                const v = _shared.items.find((x) => x.voice_id === b.dataset.i);
                if (v) addShared(v, b);
            });
        });
        if (global.lucide) global.lucide.createIcons();
    }

    async function addShared(v, btn) {
        if (_busy) return;
        _busy = true;
        const old = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> …';
        if (global.lucide) global.lucide.createIcons();
        try {
            const res = await global.Web2VideoTTS.addSharedVoice(
                v.public_owner_id,
                v.voice_id,
                v.name
            );
            const realId = (res && res.voice_id) || v.voice_id;
            global.Web2VideoTTS.addLibraryVoice({
                engine: 'elevenlabs',
                elevenId: realId,
                label: '✨ ' + v.name + ' (ElevenLabs)',
            });
            notify('Đã thêm giọng "' + v.name + '"', 'success');
            _ctx.onChange && _ctx.onChange();
            btn.innerHTML = '<i data-lucide="check"></i> Đã thêm';
            btn.classList.remove('primary');
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = old;
            const m = String(e.message || e);
            if (/slot|maximum|limit|reached|quota/i.test(m))
                notify(
                    'Hết slot giọng ElevenLabs (free ít) — bỏ bớt giọng đã thêm hoặc nâng gói.',
                    'warning'
                );
            else notify('Thêm giọng lỗi: ' + m, 'error');
        } finally {
            _busy = false;
            if (global.lucide) global.lucide.createIcons();
        }
    }

    async function _playSamples(r) {
        const ac = _audio();
        await ac.resume?.();
        const src = ac.createBufferSource();
        src.buffer = global.Web2VideoTTS.toAudioBuffer(ac, r.samples, r.sampleRate);
        src.connect(ac.destination);
        _previewSrc = src;
        src.start();
    }

    // NGHE THỬ KHÔNG TẢI MODEL: phát clip mẫu HF (~60-90KB) bằng <audio>, KHÔNG tải
    // model ~vài chục MB. "Kéo về" mới tải model thật. (no crossorigin → no-cors media)
    async function previewPiper(key, btn) {
        if (_busy) return;
        _stopPreview();
        const url = global.Web2VideoTTS.samplePreviewUrl(key);
        if (!url) {
            notify('Giọng này không có clip nghe thử', 'info');
            return;
        }
        const old = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="volume-2"></i> …';
        if (global.lucide) global.lucide.createIcons();
        const restore = () => {
            btn.innerHTML = old;
            if (global.lucide) global.lucide.createIcons();
        };
        try {
            const a = new Audio(url); // KHÔNG set crossOrigin
            _previewSrc = a;
            a.onended = restore;
            a.onerror = () => {
                restore();
                notify('Không tải được clip nghe thử (thử "Kéo về")', 'warning');
            };
            await a.play();
        } catch (e) {
            restore();
            notify('Nghe thử lỗi: ' + (e.message || e), 'error');
        }
    }

    async function addPiper(key, btn) {
        if (_busy) return;
        _busy = true;
        const old = btn.innerHTML;
        btn.disabled = true;
        try {
            btn.innerHTML = '<i data-lucide="loader"></i> Đang tải…';
            if (global.lucide) global.lucide.createIcons();
            await global.Web2VideoTTS.downloadPiperVoice(key, (pct) => {
                btn.innerHTML = `<i data-lucide="loader"></i> ${pct || 0}%`;
            });
            const meta = (_piperCatalog || []).find((v) => v.key === key) || { key };
            const label =
                '🌐 ' + (meta.name || key) + (meta.langName ? ' (' + meta.langName + ')' : '');
            global.Web2VideoTTS.addLibraryVoice({
                engine: 'piper',
                key,
                label,
                lang: meta.langName,
            });
            if (meta) meta.downloaded = true;
            notify('Đã kéo giọng "' + (meta.name || key) + '" về máy', 'success');
            _ctx.onChange && _ctx.onChange();
            renderFree();
        } catch (e) {
            notify('Tải giọng lỗi: ' + (e.message || e), 'error');
            btn.disabled = false;
            btn.innerHTML = old;
            if (global.lucide) global.lucide.createIcons();
        } finally {
            _busy = false;
        }
    }

    async function previewEleven(vid, previewUrl, btn) {
        if (_busy) return;
        _busy = true;
        _stopPreview();
        try {
            if (previewUrl) {
                const a = new Audio(previewUrl);
                _previewSrc = a;
                await a.play();
            } else {
                const r = await global.Web2VideoTTS.synthVoiceMeta(
                    { engine: 'elevenlabs', elevenId: vid },
                    global.Web2VideoTTS.SAMPLE_TEXT
                );
                await _playSamples(r);
            }
        } catch (e) {
            notify('Nghe thử lỗi: ' + (e.message || e), 'error');
        } finally {
            _busy = false;
        }
    }

    function addEleven(vid, name, btn) {
        global.Web2VideoTTS.addLibraryVoice({
            engine: 'elevenlabs',
            elevenId: vid,
            label: '✨ ' + (name || vid) + ' (ElevenLabs)',
        });
        notify('Đã thêm giọng ElevenLabs "' + (name || vid) + '"', 'success');
        _ctx.onChange && _ctx.onChange();
        renderEleven();
    }

    global.Web2VideoLibraryUI = { init, open, close };
})(window);
