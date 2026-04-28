// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Widget — Standalone WebRTC softphone for orders-report
// Uses JsSIP → OnCallCX PBX via Vultr WSS proxy
// Features: auto-reconnect, ringback/answer/hangup tones, incoming ring + accept/reject

const PhoneWidget = (() => {
    const STORAGE_KEY = 'phoneWidget_config';
    const HISTORY_KEY = 'phoneWidget_history';
    const MISSED_KEY = 'phoneWidget_missed';
    const RENDER_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/phone-config';
    const DEFAULTS = {
        pbx_domain: 'pbx-ucaas.oncallcx.vn',
        ws_url: 'wss://45-76-155-207.sslip.io/ws',
        sip_extensions: [
            {
                ext: '101',
                authId: 'gOcQD5CWCYFuDSh2',
                password: 'iuPj7ZTT2dKoOSoY',
                label: 'Ext 101',
            },
        ],
    };
    const MAX_RECONNECT_DELAY = 30000;
    const MAX_HISTORY = 50;

    // === STATE ===
    let phone = null;
    let currentSession = null;
    let incomingSession = null;
    let callTimerInterval = null;
    let callStartTime = null;
    let isMuted = false;
    let isRegistered = false;
    let widgetEl = null;
    let fabEl = null;
    let dbConfig = null;
    let config = loadConfig();
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    let activeCallMeta = null; // {phone, name, direction, startedAt, orderCode}

    // Audio tones
    let audioCtx = null;
    let ringbackInterval = null;
    let incomingRingInterval = null;

    // Call history + missed
    let callHistory = loadHistory();
    let missedCount = loadMissed();

    function loadHistory() {
        try {
            const s = localStorage.getItem(HISTORY_KEY);
            if (s) return JSON.parse(s);
        } catch {}
        return [];
    }
    function saveHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(callHistory.slice(0, MAX_HISTORY)));
        } catch {}
    }
    function loadMissed() {
        try {
            return parseInt(localStorage.getItem(MISSED_KEY) || '0', 10) || 0;
        } catch {
            return 0;
        }
    }
    function saveMissed() {
        try {
            localStorage.setItem(MISSED_KEY, String(missedCount));
        } catch {}
    }

    function loadConfig() {
        try {
            const s = localStorage.getItem(STORAGE_KEY);
            if (s) return JSON.parse(s);
        } catch {}
        return {
            wsUrl: DEFAULTS.ws_url,
            extension: DEFAULTS.sip_extensions[0].ext,
            authId: DEFAULTS.sip_extensions[0].authId,
            password: DEFAULTS.sip_extensions[0].password,
        };
    }

    // Try override config with assigned ext (from PhoneExtAssignment). Returns true if config changed.
    function applyAssignedExt() {
        try {
            const assign = window.PhoneExtAssignment;
            if (!assign) return false;
            const myExt = assign.getMyExt();
            if (!myExt) return false;
            if (config.extension === myExt) return false;
            const ext = getExtensions().find((e) => String(e.ext) === String(myExt));
            if (!ext) return false;
            config = {
                wsUrl: getWsUrl(),
                extension: ext.ext,
                authId: ext.authId,
                password: ext.password,
            };
            saveConfig();
            updateExtChipLabel();
            return true;
        } catch {
            return false;
        }
    }
    function saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch {}
    }

    async function loadFromDB() {
        try {
            const r = await fetch(RENDER_API);
            const d = await r.json();
            if (d.success && d.config) {
                dbConfig = d.config;
                try {
                    localStorage.setItem('phoneWidget_dbConfig', JSON.stringify(dbConfig));
                } catch {}
                return dbConfig;
            }
        } catch {}
        try {
            const c = localStorage.getItem('phoneWidget_dbConfig');
            if (c) {
                dbConfig = JSON.parse(c);
                return dbConfig;
            }
        } catch {}
        return null;
    }
    function getPbxDomain() {
        return dbConfig?.pbx_domain || DEFAULTS.pbx_domain;
    }
    function getExtensions() {
        return dbConfig?.sip_extensions || DEFAULTS.sip_extensions;
    }
    function getWsUrl() {
        return dbConfig?.ws_url || DEFAULTS.ws_url;
    }
    // ICE servers cache. Populated by fetchIceServersFromRender() on init; falls back to STUN only.
    let _iceServersCache = null;
    let _iceServersFetchedAt = 0;
    const ICE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — TURN credentials thường rotate sau ~vài giờ

    async function fetchIceServersFromRender() {
        // Reuse cache nếu còn fresh — tránh hit /turn-config mỗi cuộc gọi
        if (_iceServersCache && Date.now() - _iceServersFetchedAt < ICE_CACHE_TTL_MS) {
            return _iceServersCache;
        }
        try {
            const url = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/turn-config';
            const res = await fetch(url, { signal: AbortSignal.timeout?.(5000) });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.iceServers) && data.iceServers.length > 0) {
                    _iceServersCache = data.iceServers;
                    _iceServersFetchedAt = Date.now();
                    addLog(`ICE: loaded ${data.iceServers.length} server(s) including TURN`);
                    return _iceServersCache;
                }
            }
        } catch (err) {
            addLog(`ICE fetch failed: ${err.message} — fallback STUN only`, 'error');
        }
        return null;
    }

    function getIceServers() {
        // Sync getter — return cached (incl. TURN) if available, else STUN-only fallback.
        if (_iceServersCache && _iceServersCache.length > 0) return _iceServersCache;
        return [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
        ];
    }

    // === HELPERS: phone formatting + name lookup ===
    function stripPhone(s) {
        return (s || '').toString().replace(/[^\d+]/g, '');
    }
    function formatVNPhone(s) {
        const d = stripPhone(s);
        if (!d) return '';
        // Local 10-digit: 090 123 4567 / 090 12345 67? — use 3-3-4
        if (d.length === 10 && d.startsWith('0'))
            return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
        if (d.length === 11 && d.startsWith('0'))
            return d.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3');
        if (d.startsWith('+84') && d.length === 12)
            return d.replace(/(\+84)(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
        // Fallback: group every 3
        return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    }
    function lookupCustomerName(phone) {
        const d = stripPhone(phone);
        if (!d || !window.allOrders || !Array.isArray(window.allOrders)) return '';
        const match = window.allOrders.find((o) => stripPhone(o.Telephone) === d);
        return match ? match.Name || '' : '';
    }
    function lookupOrderCode(phone) {
        const d = stripPhone(phone);
        if (!d || !window.allOrders || !Array.isArray(window.allOrders)) return '';
        const match = window.allOrders.find((o) => stripPhone(o.Telephone) === d);
        return match ? match.Code || '' : '';
    }

    // === CALL HISTORY ===
    function addHistoryEntry(entry) {
        const e = {
            phone: stripPhone(entry.phone),
            name: entry.name || lookupCustomerName(entry.phone) || '',
            direction: entry.direction || 'out', // 'out' | 'in' | 'missed'
            duration: entry.duration || 0,
            timestamp: entry.timestamp || Date.now(),
            orderCode: entry.orderCode || '',
        };
        if (!e.phone) return;
        callHistory.unshift(e);
        if (callHistory.length > MAX_HISTORY) callHistory.length = MAX_HISTORY;
        saveHistory();
        if (isHistoryOpen()) renderHistory();
    }
    function clearHistory() {
        callHistory = [];
        saveHistory();
        renderHistory();
    }
    function formatDuration(sec) {
        if (!sec) return '';
        const m = Math.floor(sec / 60),
            s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    function relativeTime(ts) {
        const diff = Date.now() - ts;
        if (diff < 60000) return 'Vừa xong';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
        const d = new Date(ts);
        return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    function directionIcon(dir) {
        if (dir === 'in') return '<span class="pw-dir in" title="Đã nhận">↙</span>';
        if (dir === 'missed') return '<span class="pw-dir missed" title="Nhỡ">✕</span>';
        return '<span class="pw-dir out" title="Đã gọi">↗</span>';
    }

    // === MISSED CALLS ===
    function incrementMissed() {
        missedCount++;
        saveMissed();
        updateMissedBadge();
    }
    function clearMissed() {
        if (missedCount === 0) return;
        missedCount = 0;
        saveMissed();
        updateMissedBadge();
    }
    function updateMissedBadge() {
        if (!fabEl) return;
        let badge = fabEl.querySelector('.pw-fab-badge');
        if (missedCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'pw-fab-badge';
                fabEl.appendChild(badge);
            }
            badge.textContent = missedCount > 9 ? '9+' : String(missedCount);
        } else if (badge) {
            badge.remove();
        }
    }

    // === AUDIO TONES (Web Audio API) ===
    function getAudioCtx() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch {
                return null;
            }
        }
        if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function playBeep({
        freq = 440,
        freqEnd = null,
        duration = 0.2,
        volume = 0.18,
        type = 'sine',
        delay = 0,
    } = {}) {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
        gain.gain.setValueAtTime(volume, t0 + duration - 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
    }

    // Vietnam ringback: 425Hz, 1s on / 4s off
    function startRingback() {
        stopRingback();
        const tick = () => playBeep({ freq: 425, duration: 1, volume: 0.12 });
        tick();
        ringbackInterval = setInterval(tick, 5000);
    }
    function stopRingback() {
        if (ringbackInterval) {
            clearInterval(ringbackInterval);
            ringbackInterval = null;
        }
    }

    // Incoming ring: two-tone loop (similar to phone ring)
    function startIncomingRing() {
        stopIncomingRing();
        const tick = () => {
            playBeep({ freq: 520, duration: 0.35, volume: 0.22, delay: 0 });
            playBeep({ freq: 660, duration: 0.35, volume: 0.22, delay: 0.45 });
            playBeep({ freq: 520, duration: 0.35, volume: 0.22, delay: 1.0 });
            playBeep({ freq: 660, duration: 0.35, volume: 0.22, delay: 1.45 });
        };
        tick();
        incomingRingInterval = setInterval(tick, 3000);
    }
    function stopIncomingRing() {
        if (incomingRingInterval) {
            clearInterval(incomingRingInterval);
            incomingRingInterval = null;
        }
    }

    // Rising beep: call answered / connected
    function playAnsweredTone() {
        playBeep({ freq: 600, freqEnd: 1000, duration: 0.18, volume: 0.1, type: 'sine' });
        playBeep({ freq: 1000, duration: 0.12, volume: 0.08, type: 'sine', delay: 0.22 });
    }

    // Descending beep: hangup / disconnected
    function playHangupTone() {
        playBeep({ freq: 800, freqEnd: 300, duration: 0.35, volume: 0.22, type: 'sine' });
    }

    // Short DTMF-like click when pressing a key
    function playKeypadClick() {
        playBeep({ freq: 880, duration: 0.04, volume: 0.1, type: 'square' });
    }

    function stopAllTones() {
        stopRingback();
        stopIncomingRing();
    }

    // Vietnamese TTS announcements (theo Zoiper5)
    let _ttsVoice = null;
    function _loadTtsVoice() {
        if (!('speechSynthesis' in window)) return;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length) {
            _ttsVoice =
                voices.find((v) => v.lang?.startsWith('vi')) ||
                voices.find((v) => v.default) ||
                voices[0];
        }
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        _loadTtsVoice();
        window.speechSynthesis.onvoiceschanged = _loadTtsVoice;
    }
    function speakVN(text) {
        if (!text || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'vi-VN';
            u.rate = 1.0;
            u.pitch = 1.0;
            u.volume = 0.9;
            if (_ttsVoice) u.voice = _ttsVoice;
            window.speechSynthesis.speak(u);
        } catch {}
    }
    function _announceCallFailure(cause, direction) {
        if (direction !== 'out') return; // chỉ announce cho cuộc gọi đi
        const c = String(cause || '').toLowerCase();
        let msg = '';
        if (c.includes('no answer') || c === 'timer b' || c.includes('timeout'))
            msg = 'Khách không nhấc máy';
        else if (c.includes('busy')) msg = 'Máy bận';
        else if (c.includes('rejected')) msg = 'Khách từ chối cuộc gọi';
        else if (c.includes('unavailable') || c.includes('not found'))
            msg = 'Thuê bao không liên lạc được';
        else if (c.includes('canceled')) return; // user đã bấm cúp, không cần announce
        if (msg) setTimeout(() => speakVN(msg), 500); // sau hangup tone
    }

    // === CREATE UI ===
    function createWidget() {
        if (widgetEl) return;

        const extensions = getExtensions();
        const extOpts =
            extensions
                .map(
                    (e) =>
                        `<option value="${e.ext}" ${config.extension === e.ext ? 'selected' : ''}>${e.label || 'Ext ' + e.ext}</option>`
                )
                .join('') + '<option value="_custom">Tuỳ chỉnh...</option>';

        const html = `
        <div id="phoneWidget" class="pw hidden">
            <div class="pw-head" id="pwHead">
                <div class="pw-head-left">
                    <span class="pw-status-dot" id="pwStatusDot"></span>
                    <span class="pw-title">N2Store Phone</span>
                </div>
                <div class="pw-head-right">
                    <button class="pw-ext-chip" id="pwExtChip" onclick="PhoneWidget.toggleExtPicker(event)" title="Đổi extension nhanh">
                        <span id="pwExtChipLabel">Ext ${config.extension}</span>
                        <span class="pw-ext-chip-caret">▾</span>
                    </button>
                    <button class="pw-hi" onclick="PhoneWidget.toggleHistory()" title="Lịch sử gọi" id="pwHistBtn">🕐</button>
                    <button class="pw-hi" onclick="PhoneWidget.refresh()" title="Làm mới widget (kết nối lại tổng đài)" id="pwRefreshBtn">↻</button>
                    <button class="pw-hi" onclick="PhoneWidget.toggleSettings()" title="Cài đặt">⚙</button>
                    <button class="pw-hi" onclick="PhoneWidget.toggleMinimize()" title="Thu nhỏ" id="pwMinBtn">−</button>
                    <button class="pw-hi" onclick="PhoneWidget.hide()" title="Đóng">×</button>
                </div>
            </div>

            <!-- Quick ext picker popover -->
            <div class="pw-ext-picker" id="pwExtPicker" style="display:none">
                <div class="pw-ext-picker-head">Chọn extension</div>
                <div class="pw-ext-picker-list" id="pwExtPickerList"></div>
            </div>

            <div class="pw-statusbar" id="pwStatusBar">
                <span id="pwStatusText">Đang kết nối...</span>
            </div>

            <div id="pwBody">
                <!-- Settings -->
                <div class="pw-settings" id="pwSettings" style="display:none">
                    <div class="pw-f"><label>Extension</label>
                        <select id="pwExtSelect" onchange="PhoneWidget.onExtChange()">${extOpts}</select>
                    </div>
                    <div id="pwCustomFields" style="display:none">
                        <div class="pw-f"><label>Ext</label><input id="pwExtInput" type="text" value="${config.extension}" autocomplete="off"></div>
                        <div class="pw-f"><label>Auth ID</label><input id="pwAuthInput" type="text" value="${config.authId}" autocomplete="off"></div>
                        <div class="pw-f"><label>Mật khẩu</label><input id="pwPassInput" type="text" value="${config.password}" autocomplete="off" data-lpignore="true" data-form-type="other" style="-webkit-text-security:disc;-moz-text-security:disc;text-security:disc"></div>
                    </div>
                    <button class="pw-save" onclick="PhoneWidget.applySettings()">Kết nối lại</button>
                    <button class="pw-save pw-admin-btn" id="pwAdminBtn" onclick="PhoneWidget.openExtAssignment()" style="display:none;margin-top:6px;background:linear-gradient(135deg,#8b5cf6,#6d28d9)">👥 Phân chia Ext nhân viên</button>
                    <button class="pw-save pw-admin-btn" id="pwAutoRegBtn" onclick="PhoneWidget.toggleAutoRegister()" style="display:none;margin-top:6px;background:linear-gradient(135deg,#f59e0b,#d97706)">📡 Treo 10 line</button>
                    <div id="pwAutoRegStatus" style="display:none;font-size:10px;color:#94a3b8;margin-top:4px;text-align:center"></div>
                </div>

                <!-- Incoming call banner -->
                <div class="pw-incoming" id="pwIncoming" style="display:none">
                    <div class="pw-incoming-avatar">📞</div>
                    <div class="pw-incoming-label">Cuộc gọi đến</div>
                    <div class="pw-incoming-num" id="pwIncomingNum">—</div>
                    <div class="pw-incoming-actions">
                        <button class="pw-btn pw-accept" onclick="PhoneWidget.acceptIncoming()" title="Trả lời">📞</button>
                        <button class="pw-btn pw-reject" onclick="PhoneWidget.rejectIncoming()" title="Từ chối">✕</button>
                    </div>
                </div>

                <!-- Caller display -->
                <div class="pw-caller" id="pwCaller">
                    <div class="pw-avatar" id="pwAvatar">👤</div>
                    <div class="pw-name" id="pwName">Sẵn sàng gọi</div>
                    <div class="pw-dial-wrap">
                        <input type="tel" id="pwDialInput" class="pw-dial-input" placeholder="Nhập số điện thoại" autocomplete="off">
                        <button class="pw-paste" onclick="PhoneWidget.pasteFromClipboard()" title="Dán số từ clipboard">📋</button>
                    </div>
                    <div class="pw-sub" id="pwSub"></div>
                    <div class="pw-timer" id="pwTimer" style="display:none">00:00</div>
                </div>

                <!-- History panel -->
                <div class="pw-history" id="pwHistory" style="display:none">
                    <div class="pw-history-head">
                        <span>Lịch sử cuộc gọi</span>
                        <button class="pw-history-clear" onclick="PhoneWidget.clearHistory()" title="Xoá lịch sử">🗑</button>
                    </div>
                    <div class="pw-history-list" id="pwHistoryList"></div>
                </div>

                <!-- Dialpad -->
                <div class="pw-pad" id="pwPad">
                    <button onclick="PhoneWidget.press('1')"><b>1</b></button>
                    <button onclick="PhoneWidget.press('2')"><b>2</b><small>ABC</small></button>
                    <button onclick="PhoneWidget.press('3')"><b>3</b><small>DEF</small></button>
                    <button onclick="PhoneWidget.press('4')"><b>4</b><small>GHI</small></button>
                    <button onclick="PhoneWidget.press('5')"><b>5</b><small>JKL</small></button>
                    <button onclick="PhoneWidget.press('6')"><b>6</b><small>MNO</small></button>
                    <button onclick="PhoneWidget.press('7')"><b>7</b><small>PQRS</small></button>
                    <button onclick="PhoneWidget.press('8')"><b>8</b><small>TUV</small></button>
                    <button onclick="PhoneWidget.press('9')"><b>9</b><small>WXYZ</small></button>
                    <button onclick="PhoneWidget.press('*')"><b>*</b></button>
                    <button onclick="PhoneWidget.press('0')"><b>0</b><small>+</small></button>
                    <button onclick="PhoneWidget.press('#')"><b>#</b></button>
                </div>

                <!-- Actions -->
                <div class="pw-actions">
                    <button class="pw-btn pw-mute" id="pwMute" onclick="PhoneWidget.toggleMute()" style="display:none" title="Tắt tiếng">🔇</button>
                    <button class="pw-btn pw-call" id="pwCall" onclick="PhoneWidget.dialFromInput()" title="Gọi">📞</button>
                    <button class="pw-btn pw-hang" id="pwHangup" onclick="PhoneWidget.hangup()" style="display:none" title="Ngắt máy">✕</button>
                    <button class="pw-btn pw-del" id="pwDel" onclick="PhoneWidget.backspace()" title="Xoá">⌫</button>
                </div>

                <!-- Log -->
                <div class="pw-log" id="pwLog"></div>
            </div>
            <audio id="pwRemoteAudio" autoplay></audio>
        </div>`;

        const style = document.createElement('style');
        style.textContent = `
        /* FAB */
        .pw-fab{position:fixed;bottom:20px;right:80px;z-index:99998;width:56px;height:56px;border-radius:50%;
            background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;border:none;font-size:24px;
            cursor:pointer;box-shadow:0 8px 24px rgba(34,197,94,0.4),0 2px 4px rgba(0,0,0,0.2);
            display:flex;align-items:center;justify-content:center;
            transition:transform .2s cubic-bezier(.4,0,.2,1),box-shadow .2s}
        .pw-fab:hover{transform:scale(1.08);box-shadow:0 12px 28px rgba(34,197,94,0.55),0 4px 8px rgba(0,0,0,0.25)}
        .pw-fab.active{background:linear-gradient(135deg,#ef4444,#b91c1c);box-shadow:0 8px 24px rgba(239,68,68,0.45)}
        .pw-fab.incoming{animation:pw-shake .6s infinite;background:linear-gradient(135deg,#3b82f6,#1d4ed8)}
        @keyframes pw-shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg) scale(1.05)}75%{transform:rotate(12deg) scale(1.05)}}

        /* Widget */
        .pw{position:fixed;bottom:90px;right:20px;z-index:99999;width:320px;
            background:linear-gradient(180deg,#1e293b 0%,#0f172a 100%);
            border-radius:20px;
            box-shadow:0 24px 48px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.06);
            color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            overflow:hidden;backdrop-filter:blur(12px);
            transition:all .3s cubic-bezier(.4,0,.2,1);animation:pw-slide .3s cubic-bezier(.4,0,.2,1)}
        @keyframes pw-slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .pw.hidden{display:none}
        .pw.minimized #pwBody,.pw.minimized .pw-statusbar{display:none}

        /* Header */
        .pw-head{display:flex;align-items:center;justify-content:space-between;
            padding:10px 14px;background:rgba(15,23,42,.6);cursor:move;user-select:none;
            border-bottom:1px solid rgba(255,255,255,.05)}
        .pw-head-left{display:flex;align-items:center;gap:8px}
        .pw-head-right{display:flex;align-items:center;gap:2px}
        .pw-status-dot{width:9px;height:9px;border-radius:50%;background:#64748b;
            box-shadow:0 0 0 3px rgba(100,116,139,0.2);transition:all .3s}
        .pw-status-dot.registered{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.25);animation:pw-pulse-dot 2s infinite}
        .pw-status-dot.calling{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.25);animation:pw-pulse-dot 1s infinite}
        .pw-status-dot.connected{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.35)}
        .pw-status-dot.error{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,0.25)}
        @keyframes pw-pulse-dot{0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.25)}50%{box-shadow:0 0 0 6px rgba(34,197,94,0.1)}}
        .pw-title{font-size:13px;font-weight:600;color:#f1f5f9;letter-spacing:.2px}
        .pw-hi{background:none;border:none;color:#64748b;font-size:15px;cursor:pointer;padding:4px 7px;
            line-height:1;border-radius:6px;transition:all .15s;width:26px;height:26px}
        .pw-hi:hover{color:#f1f5f9;background:rgba(255,255,255,.08)}

        /* Quick ext chip */
        .pw-ext-chip{display:inline-flex;align-items:center;gap:3px;background:rgba(59,130,246,.15);
            border:1px solid rgba(59,130,246,.3);color:#93c5fd;font-size:11px;font-weight:600;
            padding:3px 8px;border-radius:12px;cursor:pointer;transition:all .15s;
            font-family:inherit;margin-right:4px;white-space:nowrap;line-height:1.2}
        .pw-ext-chip:hover{background:rgba(59,130,246,.25);color:#dbeafe;transform:translateY(-1px)}
        .pw-ext-chip-caret{font-size:9px;opacity:.7}

        /* Ext picker popover */
        .pw-ext-picker{position:absolute;top:42px;right:14px;z-index:100;min-width:140px;
            background:linear-gradient(180deg,#1e293b,#0f172a);border:1px solid rgba(59,130,246,.3);
            border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);
            overflow:hidden;animation:pw-slide .2s cubic-bezier(.4,0,.2,1)}
        .pw-ext-picker-head{font-size:10px;color:#94a3b8;padding:8px 12px 4px;
            text-transform:uppercase;letter-spacing:.8px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.05)}
        .pw-ext-picker-list{max-height:240px;overflow-y:auto;padding:4px 0}
        .pw-ext-picker-list::-webkit-scrollbar{width:4px}
        .pw-ext-picker-list::-webkit-scrollbar-thumb{background:rgba(148,163,184,.3);border-radius:2px}
        .pw-ext-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;
            cursor:pointer;color:#e2e8f0;font-size:12px;transition:all .12s}
        .pw-ext-item:hover{background:rgba(59,130,246,.15);color:#dbeafe}
        .pw-ext-item.active{background:rgba(34,197,94,.15);color:#4ade80;font-weight:600}
        .pw-ext-item.active::after{content:'✓';font-size:13px;color:#22c55e}
        .pw-ext-item-num{font-family:'SF Mono',Monaco,monospace;font-weight:600}
        .pw-ext-item-label{font-size:10px;color:#64748b;margin-left:8px}

        /* Status bar */
        .pw-statusbar{padding:6px 14px;background:rgba(15,23,42,.4);font-size:11px;color:#94a3b8;
            text-align:center;border-bottom:1px solid rgba(255,255,255,.03);letter-spacing:.3px}
        .pw-statusbar.registered{color:#4ade80}
        .pw-statusbar.calling{color:#fbbf24}
        .pw-statusbar.connected{color:#22c55e;font-weight:600}
        .pw-statusbar.error{color:#f87171}

        /* Settings */
        .pw-settings{padding:10px 14px;background:rgba(15,23,42,.5);border-bottom:1px solid rgba(255,255,255,.05)}
        .pw-f{margin-bottom:8px}
        .pw-f label{display:block;font-size:10px;color:#94a3b8;margin-bottom:4px;
            text-transform:uppercase;letter-spacing:.7px;font-weight:600}
        .pw-f input,.pw-f select{width:100%;box-sizing:border-box;padding:7px 10px;
            background:rgba(30,41,59,.6);border:1px solid rgba(148,163,184,.2);
            border-radius:8px;color:#f1f5f9;font-size:12px;font-family:inherit;outline:none;transition:border-color .15s}
        .pw-f input:focus,.pw-f select:focus{border-color:#3b82f6;background:rgba(30,41,59,.9)}
        .pw-save{width:100%;padding:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);
            color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            margin-top:6px;transition:transform .1s}
        .pw-save:hover{transform:translateY(-1px)}
        .pw-save:active{transform:translateY(0)}

        /* Incoming call banner */
        .pw-incoming{padding:16px;text-align:center;
            background:linear-gradient(135deg,rgba(59,130,246,.15),rgba(29,78,216,.08));
            border-bottom:1px solid rgba(59,130,246,.2);animation:pw-pulse-bg 1.5s infinite}
        @keyframes pw-pulse-bg{0%,100%{background:linear-gradient(135deg,rgba(59,130,246,.15),rgba(29,78,216,.08))}
            50%{background:linear-gradient(135deg,rgba(59,130,246,.3),rgba(29,78,216,.15))}}
        .pw-incoming-avatar{width:56px;height:56px;margin:0 auto 8px;border-radius:50%;
            background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;
            justify-content:center;font-size:24px;animation:pw-bounce 1s infinite}
        @keyframes pw-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
        .pw-incoming-label{font-size:11px;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px}
        .pw-incoming-num{font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:12px;font-family:monospace;letter-spacing:1px}
        .pw-incoming-actions{display:flex;gap:16px;justify-content:center}
        .pw-accept{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;
            animation:pw-pulse-btn 1.2s infinite;box-shadow:0 4px 12px rgba(34,197,94,.4)}
        .pw-reject{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;box-shadow:0 4px 12px rgba(239,68,68,.4)}
        @keyframes pw-pulse-btn{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}

        /* Caller display */
        .pw-caller{padding:14px 14px 4px;text-align:center}
        .pw-avatar{width:44px;height:44px;margin:0 auto 6px;border-radius:50%;
            background:linear-gradient(135deg,#475569,#334155);display:flex;align-items:center;
            justify-content:center;font-size:18px;color:#cbd5e1;transition:all .3s}
        .pw-caller.active .pw-avatar{background:linear-gradient(135deg,#22c55e,#15803d);
            color:#fff;box-shadow:0 0 0 4px rgba(34,197,94,.2);animation:pw-avatar-glow 2s infinite}
        .pw-caller.ringing .pw-avatar{background:linear-gradient(135deg,#f59e0b,#d97706);
            color:#fff;animation:pw-avatar-glow 1s infinite}
        @keyframes pw-avatar-glow{0%,100%{box-shadow:0 0 0 4px rgba(34,197,94,.2)}
            50%{box-shadow:0 0 0 10px rgba(34,197,94,.05)}}
        .pw-name{font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:4px;min-height:18px}
        .pw-dial-input{width:100%;box-sizing:border-box;background:transparent;border:none;
            border-bottom:2px solid rgba(148,163,184,.2);color:#60a5fa;font-size:22px;
            font-family:'SF Mono','Monaco',monospace;text-align:center;padding:8px 28px 6px;
            outline:none;letter-spacing:2px;transition:border-color .2s;font-weight:500}
        .pw-dial-input:focus{border-bottom-color:#3b82f6}
        .pw-dial-input::placeholder{color:#475569;font-size:13px;letter-spacing:0;font-weight:400}
        .pw-caller.active .pw-dial-input,.pw-caller.ringing .pw-dial-input{border-bottom-color:transparent;font-size:16px;color:#94a3b8}
        .pw-timer{font-size:22px;font-weight:300;color:#f1f5f9;margin-top:4px;
            font-family:'SF Mono','Monaco',monospace;letter-spacing:1px}

        /* Dialpad */
        .pw-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 14px 6px}
        .pw-pad button{background:linear-gradient(180deg,rgba(30,41,59,.9),rgba(15,23,42,.9));
            border:1px solid rgba(148,163,184,.12);border-radius:10px;color:#e2e8f0;
            padding:10px 0;cursor:pointer;transition:all .12s;position:relative;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            box-shadow:0 1px 2px rgba(0,0,0,.2)}
        .pw-pad button b{font-size:17px;font-weight:500;line-height:1}
        .pw-pad button small{display:block;font-size:8px;color:#64748b;letter-spacing:1.5px;margin-top:2px}
        .pw-pad button:hover{background:linear-gradient(180deg,rgba(51,65,85,.9),rgba(30,41,59,.9));
            transform:translateY(-1px);box-shadow:0 3px 6px rgba(0,0,0,.3)}
        .pw-pad button:active{background:linear-gradient(180deg,#3b82f6,#1d4ed8);color:#fff;transform:translateY(0)}
        .pw-pad button:active small{color:rgba(255,255,255,.8)}

        /* Actions */
        .pw-actions{display:flex;gap:14px;justify-content:center;padding:10px 14px 14px}
        .pw-btn{width:48px;height:48px;border:none;border-radius:50%;font-size:18px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;transition:all .15s;
            box-shadow:0 3px 8px rgba(0,0,0,.25)}
        .pw-btn:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(0,0,0,.35)}
        .pw-btn:active{transform:translateY(0)}
        .pw-call{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff}
        .pw-hang{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff}
        .pw-mute{background:linear-gradient(135deg,#475569,#334155);color:#cbd5e1}
        .pw-mute.active{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff}
        .pw-del{background:linear-gradient(135deg,#475569,#334155);color:#cbd5e1;font-size:15px}

        /* FAB missed badge */
        .pw-fab-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;
            background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;border-radius:10px;
            font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;
            padding:0 5px;border:2px solid #0f172a;box-shadow:0 2px 6px rgba(239,68,68,.5);
            animation:pw-badge-pop .3s cubic-bezier(.4,0,.2,1)}
        @keyframes pw-badge-pop{from{transform:scale(0)}to{transform:scale(1)}}

        /* Dial wrap + paste */
        .pw-dial-wrap{position:relative}
        .pw-paste{position:absolute;right:0;top:50%;transform:translateY(-50%);
            background:none;border:none;color:#64748b;cursor:pointer;font-size:13px;padding:4px;
            border-radius:4px;transition:all .15s}
        .pw-paste:hover{color:#93c5fd;background:rgba(59,130,246,.1)}
        .pw-sub{font-size:10px;color:#64748b;text-align:center;margin-top:2px;min-height:12px}
        .pw-sub.has-order{color:#60a5fa}

        /* History panel */
        .pw-history{display:flex;flex-direction:column;max-height:340px;
            animation:pw-slide .25s cubic-bezier(.4,0,.2,1)}
        .pw-history-head{display:flex;justify-content:space-between;align-items:center;
            padding:8px 14px;font-size:11px;color:#94a3b8;text-transform:uppercase;
            letter-spacing:.8px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.05)}
        .pw-history-clear{background:none;border:none;color:#64748b;cursor:pointer;font-size:12px;
            padding:2px 6px;border-radius:4px;transition:all .15s}
        .pw-history-clear:hover{color:#f87171;background:rgba(239,68,68,.08)}
        .pw-history-list{flex:1;overflow-y:auto;padding:4px 0;max-height:300px}
        .pw-history-list::-webkit-scrollbar{width:3px}
        .pw-history-list::-webkit-scrollbar-thumb{background:rgba(148,163,184,.3);border-radius:2px}
        .pw-hist-item{display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;
            transition:background .12s;border-bottom:1px solid rgba(255,255,255,.03)}
        .pw-hist-item:hover{background:rgba(59,130,246,.08)}
        .pw-hist-main{flex:1;min-width:0}
        .pw-hist-name{font-size:12px;font-weight:600;color:#f1f5f9;white-space:nowrap;
            overflow:hidden;text-overflow:ellipsis}
        .pw-hist-meta{font-size:10px;color:#64748b;display:flex;gap:6px;align-items:center;margin-top:1px}
        .pw-hist-phone{font-family:'SF Mono',Monaco,monospace}
        .pw-hist-time{opacity:.8}
        .pw-hist-dur{color:#94a3b8}
        .pw-dir{display:inline-flex;align-items:center;justify-content:center;
            width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700}
        .pw-dir.out{background:rgba(34,197,94,.15);color:#4ade80}
        .pw-dir.in{background:rgba(59,130,246,.15);color:#93c5fd}
        .pw-dir.missed{background:rgba(239,68,68,.15);color:#f87171}
        .pw-hist-call{background:none;border:none;color:#22c55e;cursor:pointer;font-size:15px;
            padding:4px 8px;border-radius:50%;transition:all .15s}
        .pw-hist-call:hover{background:rgba(34,197,94,.15);transform:scale(1.1)}
        .pw-hist-empty{padding:32px 14px;text-align:center;color:#64748b;font-size:12px}

        /* Log */
        .pw-log{max-height:52px;overflow-y:auto;font-size:9px;color:#64748b;
            font-family:'SF Mono',Monaco,monospace;background:rgba(0,0,0,.3);padding:5px 8px;
            margin:0 14px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.03)}
        .pw-log div{margin-bottom:1px;line-height:1.3}
        .pw-log .error{color:#f87171}.pw-log .success{color:#4ade80}
        .pw-log::-webkit-scrollbar{width:3px}
        .pw-log::-webkit-scrollbar-thumb{background:rgba(148,163,184,.3);border-radius:2px}
        `;
        document.head.appendChild(style);

        // FAB button
        if (!fabEl) {
            fabEl = document.createElement('button');
            fabEl.className = 'pw-fab';
            fabEl.innerHTML = '📞';
            fabEl.title = 'N2Store Phone';
            fabEl.onclick = () => toggle();
            document.body.appendChild(fabEl);
        }

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container.firstElementChild);
        widgetEl = document.getElementById('phoneWidget');

        const dialInput = document.getElementById('pwDialInput');

        // Enter to call; auto-format VN phone as user types; live name lookup
        dialInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dialFromInput();
        });
        dialInput.addEventListener('input', () => {
            const caret = dialInput.selectionStart;
            const oldLen = dialInput.value.length;
            const formatted = formatVNPhone(dialInput.value);
            if (formatted !== dialInput.value) {
                dialInput.value = formatted;
                // keep caret approximately in place
                const newLen = formatted.length;
                try {
                    dialInput.setSelectionRange(
                        caret + (newLen - oldLen),
                        caret + (newLen - oldLen)
                    );
                } catch {}
            }
            updateDialSubInfo();
        });

        // Unlock AudioContext on first interaction + clear missed counter
        const unlock = () => {
            getAudioCtx();
            widgetEl.removeEventListener('click', unlock);
        };
        widgetEl.addEventListener('click', unlock);

        // Global keyboard shortcuts
        if (!window.__pwShortcutsBound) {
            window.__pwShortcutsBound = true;
            document.addEventListener('keydown', (e) => {
                const tag = (e.target?.tagName || '').toLowerCase();
                const isInput =
                    tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
                // Ctrl+Shift+C — toggle widget
                if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') {
                    e.preventDefault();
                    toggle();
                    return;
                }
                // Esc — if incoming ringing, reject; else if in call, hangup
                if (e.key === 'Escape') {
                    if (incomingSession) {
                        e.preventDefault();
                        rejectIncoming();
                        return;
                    }
                    if (currentSession) {
                        e.preventDefault();
                        hangup();
                        return;
                    }
                    return;
                }
                // Enter — accept incoming when ringing (not while typing in another input)
                if (e.key === 'Enter' && incomingSession && !isInput) {
                    e.preventDefault();
                    acceptIncoming();
                    return;
                }
                // Space — toggle mute during active call (not while typing)
                if (
                    e.code === 'Space' &&
                    currentSession &&
                    currentSession.isEstablished &&
                    currentSession.isEstablished() &&
                    !isInput
                ) {
                    e.preventDefault();
                    toggleMute();
                }
            });
        }

        // Draggable header
        initDrag();
    }

    function updateDialSubInfo() {
        const sub = document.getElementById('pwSub');
        if (!sub) return;
        const raw = document.getElementById('pwDialInput')?.value || '';
        if (!raw || currentSession) {
            sub.textContent = '';
            sub.classList.remove('has-order');
            return;
        }
        const name = lookupCustomerName(raw);
        const code = lookupOrderCode(raw);
        if (name && code) {
            sub.textContent = `${name} • Đơn ${code}`;
            sub.classList.add('has-order');
        } else if (name) {
            sub.textContent = name;
            sub.classList.remove('has-order');
        } else {
            sub.textContent = '';
            sub.classList.remove('has-order');
        }
    }

    // === DRAG ===
    function initDrag() {
        const head = document.getElementById('pwHead');
        if (!head) return;
        let dragging = false,
            offsetX = 0,
            offsetY = 0;
        head.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            const rect = widgetEl.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            widgetEl.style.transition = 'none';
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            widgetEl.style.left = e.clientX - offsetX + 'px';
            widgetEl.style.top = e.clientY - offsetY + 'px';
            widgetEl.style.right = 'auto';
            widgetEl.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => {
            dragging = false;
            widgetEl.style.transition = '';
        });
    }

    // === TOGGLE / SHOW / HIDE ===
    function toggle() {
        createWidget();
        if (widgetEl.classList.contains('hidden')) {
            widgetEl.classList.remove('hidden');
            fabEl.classList.add('active');
            clearMissed();
        } else {
            widgetEl.classList.add('hidden');
            fabEl.classList.remove('active');
        }
    }
    function show() {
        createWidget();
        widgetEl.classList.remove('hidden');
        if (fabEl) fabEl.classList.add('active');
        clearMissed();
    }
    function hide() {
        if (widgetEl) widgetEl.classList.add('hidden');
        if (fabEl) fabEl.classList.remove('active');
    }
    function toggleMinimize() {
        if (!widgetEl) return;
        widgetEl.classList.toggle('minimized');
        document.getElementById('pwMinBtn').innerHTML = widgetEl.classList.contains('minimized')
            ? '▢'
            : '−';
    }

    // === QUICK EXT PICKER ===
    function renderExtPickerList() {
        const list = document.getElementById('pwExtPickerList');
        if (!list) return;
        const extensions = getExtensions();
        const assign = window.PhoneExtAssignment;
        list.innerHTML = extensions
            .map((e) => {
                const assignedUser = assign?.getUserForExt?.(e.ext) || '';
                const userLabel = assignedUser
                    ? `<span class="pw-ext-item-label">· ${assignedUser}</span>`
                    : '';
                return `
            <div class="pw-ext-item ${config.extension === e.ext ? 'active' : ''}" onclick="PhoneWidget.switchExt('${e.ext}')">
                <span><span class="pw-ext-item-num">${e.ext}</span>${userLabel}</span>
            </div>
        `;
            })
            .join('');
    }
    function toggleExtPicker(ev) {
        if (ev) ev.stopPropagation();
        const p = document.getElementById('pwExtPicker');
        if (!p) return;
        if (p.style.display === 'none') {
            renderExtPickerList();
            p.style.display = 'block';
            // Close when clicking outside
            setTimeout(() => {
                const close = (e) => {
                    if (!p.contains(e.target) && e.target.id !== 'pwExtChip') {
                        p.style.display = 'none';
                        document.removeEventListener('click', close);
                    }
                };
                document.addEventListener('click', close);
            }, 0);
        } else {
            p.style.display = 'none';
        }
    }
    function switchExt(ext) {
        const f = getExtensions().find((e) => e.ext === ext);
        if (!f) {
            addLog(`Không tìm thấy ext ${ext}`, 'error');
            return;
        }
        if (currentSession) {
            addLog('Đang có cuộc gọi — không đổi ext', 'error');
            return;
        }
        if (config.extension === ext && isRegistered) {
            document.getElementById('pwExtPicker').style.display = 'none';
            return;
        }
        addLog(`Chuyển sang Ext ${ext}...`);
        config = { wsUrl: getWsUrl(), extension: f.ext, authId: f.authId, password: f.password };
        saveConfig();
        updateExtChipLabel();
        cancelReconnect();
        disconnect();
        document.getElementById('pwExtPicker').style.display = 'none';
        init();
    }
    function updateExtChipLabel() {
        const el = document.getElementById('pwExtChipLabel');
        if (!el) return;
        let label = `Ext ${config.extension}`;
        try {
            const assignedUser = window.PhoneExtAssignment?.getUserForExt?.(config.extension);
            if (assignedUser) {
                // Trim long names to keep chip compact
                const short =
                    assignedUser.length > 10 ? assignedUser.slice(0, 10) + '…' : assignedUser;
                label = `Ext ${config.extension} · ${short}`;
            }
        } catch {}
        el.textContent = label;
    }

    // === HISTORY PANEL ===
    function isHistoryOpen() {
        const el = document.getElementById('pwHistory');
        return el && el.style.display !== 'none';
    }
    function toggleHistory() {
        const panel = document.getElementById('pwHistory');
        const caller = document.getElementById('pwCaller');
        const pad = document.getElementById('pwPad');
        const actions = document.querySelector('.pw-actions');
        const btn = document.getElementById('pwHistBtn');
        if (!panel) return;
        if (panel.style.display === 'none') {
            renderHistory();
            panel.style.display = 'flex';
            if (caller) caller.style.display = 'none';
            if (pad) pad.style.display = 'none';
            if (actions) actions.style.display = 'none';
            if (btn) btn.style.color = '#93c5fd';
            clearMissed();
        } else {
            panel.style.display = 'none';
            if (caller) caller.style.display = 'block';
            if (pad && !currentSession) pad.style.display = 'grid';
            if (actions) actions.style.display = 'flex';
            if (btn) btn.style.color = '';
        }
    }
    function renderHistory() {
        const list = document.getElementById('pwHistoryList');
        if (!list) return;
        if (callHistory.length === 0) {
            list.innerHTML = '<div class="pw-hist-empty">Chưa có cuộc gọi nào</div>';
            return;
        }
        list.innerHTML = callHistory
            .map((h, i) => {
                const display = h.name || lookupCustomerName(h.phone) || 'Không rõ';
                const dur =
                    h.direction !== 'missed' && h.duration
                        ? ` • ${formatDuration(h.duration)}`
                        : '';
                return `
                <div class="pw-hist-item" onclick="PhoneWidget.callFromHistory(${i})">
                    ${directionIcon(h.direction)}
                    <div class="pw-hist-main">
                        <div class="pw-hist-name">${escapeHtml(display)}</div>
                        <div class="pw-hist-meta">
                            <span class="pw-hist-phone">${formatVNPhone(h.phone)}</span>
                            <span class="pw-hist-time">• ${relativeTime(h.timestamp)}</span>
                            <span class="pw-hist-dur">${dur}</span>
                        </div>
                    </div>
                    <button class="pw-hist-call" onclick="event.stopPropagation(); PhoneWidget.callFromHistory(${i})" title="Gọi lại">📞</button>
                </div>`;
            })
            .join('');
    }
    function escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function callFromHistory(i) {
        const h = callHistory[i];
        if (!h) return;
        toggleHistory();
        makeCall(h.phone, h.name);
    }

    // === CLIPBOARD PASTE ===
    async function pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            const input = document.getElementById('pwDialInput');
            if (input) {
                input.value = formatVNPhone(text);
                updateDialSubInfo();
                input.focus();
            }
        } catch (err) {
            addLog('Không đọc được clipboard — cho phép quyền paste', 'error');
        }
    }

    // === SETTINGS ===
    function toggleSettings() {
        const p = document.getElementById('pwSettings');
        if (!p) return;
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
        const show = p.style.display !== 'none';
        const isAdmin = !!window.PhoneExtAssignment?.isAdmin?.();
        const adminBtn = document.getElementById('pwAdminBtn');
        if (adminBtn) adminBtn.style.display = isAdmin && show ? 'block' : 'none';
        const autoBtn = document.getElementById('pwAutoRegBtn');
        if (autoBtn) {
            autoBtn.style.display = isAdmin && show ? 'block' : 'none';
            if (show) _refreshAutoRegisterUI();
        }
    }
    function openExtAssignment() {
        try {
            window.PhoneExtAssignment?.openModal?.();
        } catch (err) {
            addLog('Không mở được modal: ' + err.message, 'error');
        }
    }

    async function _refreshAutoRegisterUI() {
        const btn = document.getElementById('pwAutoRegBtn');
        const st = document.getElementById('pwAutoRegStatus');
        if (!btn || !window.PhoneAutoRegister) return;
        const s = window.PhoneAutoRegister.getStatus();
        const lock = await window.PhoneAutoRegister.getRemoteLock?.();
        const mine = lock && lock.holder_session === s.sessionId;
        if (s.started && mine) {
            btn.innerHTML = `■ Tắt treo 10 line (${s.registered}/${s.total})`;
            btn.style.background = 'linear-gradient(135deg,#22c55e,#15803d)';
            if (st) {
                st.style.display = 'block';
                st.textContent = `Đang giữ lock trên máy này`;
            }
        } else if (lock && lock.locked) {
            btn.innerHTML = `📡 Chuyển treo 10 line về máy này`;
            btn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
            if (st) {
                st.style.display = 'block';
                st.textContent = `Đang bật ở: ${lock.holder_user || '?'} · ${lock.holder_device ? lock.holder_device.split(';')[0] : ''}`;
            }
        } else {
            btn.innerHTML = `📡 Bật treo 10 line (trên máy này)`;
            btn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
            if (st) {
                st.style.display = 'none';
            }
        }
    }

    async function toggleAutoRegister() {
        if (!window.PhoneAutoRegister) {
            addLog('Module auto-register chưa load', 'error');
            return;
        }
        const s = window.PhoneAutoRegister.getStatus();
        const lock = await window.PhoneAutoRegister.getRemoteLock?.();
        const mine = lock && lock.holder_session === s.sessionId;
        try {
            if (s.started && mine) {
                // Currently holding → disable
                if (!confirm('Tắt treo 10 line trên máy này?')) return;
                await window.PhoneAutoRegister.disable();
                addLog('Đã tắt treo 10 line');
            } else {
                // Want to enable
                const r = await window.PhoneAutoRegister.enable();
                if (r.conflict) {
                    const who = r.holder_user || '?';
                    const dev = r.holder_device
                        ? ' (' + r.holder_device.split(';')[0].trim() + ')'
                        : '';
                    const since = r.started_at
                        ? Math.round((Date.now() - r.started_at) / 60000) + ' phút trước'
                        : '';
                    if (
                        !confirm(
                            `Máy "${who}"${dev} đang treo 10 line${since ? ' từ ' + since : ''}.\n\nChuyển về máy này? (Máy kia sẽ tự ngắt trong vài giây)`
                        )
                    )
                        return;
                    const r2 = await window.PhoneAutoRegister.enable({ force: true });
                    if (r2.conflict) {
                        addLog('Không chuyển được: ' + (r2.error || 'unknown'), 'error');
                        return;
                    }
                    addLog('Đã chuyển treo 10 line về máy này', 'success');
                } else {
                    addLog('Đã bật treo 10 line trên máy này', 'success');
                }
            }
        } catch (err) {
            addLog('Lỗi: ' + err.message, 'error');
        }
        setTimeout(_refreshAutoRegisterUI, 1000);
    }
    function onExtChange() {
        const sel = document.getElementById('pwExtSelect');
        const custom = document.getElementById('pwCustomFields');
        if (sel.value === '_custom') {
            custom.style.display = 'block';
            return;
        }
        custom.style.display = 'none';
        const ext = getExtensions().find((e) => e.ext === sel.value);
        if (ext) {
            document.getElementById('pwExtInput').value = ext.ext;
            document.getElementById('pwAuthInput').value = ext.authId;
            document.getElementById('pwPassInput').value = ext.password;
        }
    }
    function applySettings() {
        const sel = document.getElementById('pwExtSelect');
        let ext, authId, password;
        if (sel.value === '_custom') {
            ext = document.getElementById('pwExtInput').value.trim();
            authId = document.getElementById('pwAuthInput').value.trim();
            password = document.getElementById('pwPassInput').value.trim();
        } else {
            const f = getExtensions().find((e) => e.ext === sel.value);
            if (!f) {
                addLog('Extension not found', 'error');
                return;
            }
            ext = f.ext;
            authId = f.authId;
            password = f.password;
        }
        if (!ext || !authId || !password) {
            addLog('Thiếu thông tin', 'error');
            return;
        }
        config = { wsUrl: getWsUrl(), extension: ext, authId, password };
        saveConfig();
        updateExtChipLabel();
        cancelReconnect();
        disconnect();
        toggleSettings();
        init();
    }

    function disconnect() {
        stopAllTones();
        if (currentSession) {
            try {
                currentSession.terminate();
            } catch {}
            currentSession = null;
        }
        if (incomingSession) {
            try {
                incomingSession.terminate();
            } catch {}
            incomingSession = null;
        }
        if (phone) {
            try {
                phone.stop();
            } catch {}
            phone = null;
        }
        isRegistered = false;
        isMuted = false;
        stopTimer();
    }

    // === RECONNECT ===
    function scheduleReconnect(reason) {
        if (reconnectTimer) return;
        reconnectAttempt++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), MAX_RECONNECT_DELAY);
        addLog(
            `Reconnect in ${Math.round(delay / 1000)}s (lần ${reconnectAttempt}) — ${reason}`,
            'error'
        );
        setStatus('error', `Đang thử lại (${reconnectAttempt})... ${Math.round(delay / 1000)}s`);
        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            // Fully tear down before re-init
            if (phone) {
                try {
                    phone.stop();
                } catch {}
                phone = null;
            }
            isRegistered = false;
            addLog(`Đang kết nối lại ext ${config.extension}...`);
            init();
        }, delay);
    }
    function cancelReconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        reconnectAttempt = 0;
    }

    // === INIT JSSIP ===
    async function init() {
        if (phone) return;
        if (!dbConfig) await loadFromDB();
        // Wait briefly for ext-assignment to be ready, then apply if user has one assigned
        try {
            if (window.PhoneExtAssignment) {
                await Promise.race([
                    window.PhoneExtAssignment.init(),
                    new Promise((r) => setTimeout(r, 2000)),
                ]);
                applyAssignedExt();
            }
        } catch {}
        if (!config.wsUrl) config.wsUrl = getWsUrl();
        createWidget();
        // Fetch ICE servers (incl. TURN) — non-blocking; falls back to STUN if Render env
        // chưa cấu hình TURN_URL. Without TURN, audio fails behind symmetric NAT/firewall
        // → user phải gọi 2 lần mới nghe + bắt máy không được.
        fetchIceServersFromRender().catch(() => {});
        try {
            addLog('Connecting...');
            setStatus('calling', 'Đang kết nối tổng đài...');
            const socket = new JsSIP.WebSocketInterface(config.wsUrl || getWsUrl());
            const pbxDomain = getPbxDomain();
            phone = new JsSIP.UA({
                sockets: [socket],
                uri: `sip:${config.extension}@${pbxDomain}`,
                authorization_user: config.authId,
                password: config.password,
                display_name: config.extension,
                register: true,
                register_expires: 120,
                session_timers: false,
                connection_recovery_min_interval: 2,
                connection_recovery_max_interval: 30,
                no_answer_timeout: 60,
            });
            phone.on('connected', () => addLog('WS connected', 'success'));
            phone.on('disconnected', (e) => {
                setStatus('error', 'Mất kết nối');
                isRegistered = false;
                addLog('WS disconnected', 'error');
                scheduleReconnect('WS disconnected');
            });
            phone.on('registered', () => {
                setStatus('registered', `Ext ${config.extension} • Sẵn sàng`);
                isRegistered = true;
                cancelReconnect();
                addLog(`Registered ext ${config.extension}`, 'success');
                try {
                    window.PhoneCloudSync?.setPresence?.('registered', { ext: config.extension });
                    window.PhoneCloudSync?.startHeartbeat?.(() => ({
                        state: currentSession
                            ? 'in-call'
                            : incomingSession
                              ? 'ringing'
                              : 'registered',
                        extra: {
                            ext: config.extension,
                            callPhone: activeCallMeta?.phone || '',
                            callName: activeCallMeta?.name || '',
                        },
                    }));
                } catch {}
            });
            phone.on('unregistered', () => {
                setStatus('error', 'Unregistered');
                isRegistered = false;
                scheduleReconnect('Unregistered');
            });
            phone.on('registrationFailed', (e) => {
                setStatus('error', `Lỗi ext: ${e.cause || 'Registration failed'}`);
                isRegistered = false;
                addLog(`Reg failed: ${e.cause}`, 'error');
                scheduleReconnect(`Reg failed: ${e.cause}`);
            });
            phone.on('newRTCSession', (e) => {
                if (e.originator === 'remote') handleIncoming(e.session);
            });
            phone.start();
        } catch (err) {
            setStatus('error', 'Init Error');
            addLog(`Error: ${err.message}`, 'error');
            scheduleReconnect(err.message);
        }
    }

    // === INCOMING CALL ===
    function handleIncoming(session) {
        // If already in a call, auto-reject
        if (currentSession) {
            try {
                session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
            } catch {}
            addLog('Busy — incoming call rejected', 'error');
            return;
        }
        show();
        incomingSession = session;
        const caller = session.remote_identity.uri.user || 'Không rõ';
        const callerName = lookupCustomerName(caller);
        addLog(`Cuộc gọi đến: ${caller}${callerName ? ' — ' + callerName : ''}`);

        // Show incoming banner, hide normal UI
        document.getElementById('pwIncoming').style.display = 'block';
        document.getElementById('pwIncomingNum').textContent = callerName
            ? `${callerName} • ${formatVNPhone(caller)}`
            : formatVNPhone(caller);
        document.getElementById('pwCaller').style.display = 'none';
        document.getElementById('pwPad').style.display = 'none';
        document.querySelector('.pw-actions').style.display = 'none';
        setStatus('calling', 'Cuộc gọi đến...');
        if (fabEl) fabEl.classList.add('incoming');
        startIncomingRing();

        let answered = false;
        session.on('accepted', () => {
            answered = true;
        });
        session.on('confirmed', () => {
            answered = true;
        });
        session.on('failed', (e) => {
            stopIncomingRing();
            addLog(`Missed/failed: ${e.cause}`, 'error');
            // Count as missed if user didn't answer & didn't reject manually
            if (!answered && incomingSession) {
                addHistoryEntry({ phone: caller, name: callerName, direction: 'missed' });
                // Only increment badge if widget not showing history already
                if (widgetEl?.classList.contains('hidden') || !isHistoryOpen()) incrementMissed();
            }
            hideIncomingBanner();
            incomingSession = null;
        });
        session.on('ended', () => {
            stopIncomingRing();
            hideIncomingBanner();
            incomingSession = null;
        });
    }

    async function acceptIncoming() {
        if (!incomingSession) return;
        const sessionToAnswer = incomingSession; // capture ref nếu state reset trong async gap
        stopIncomingRing();
        hideIncomingBanner();
        const caller = sessionToAnswer.remote_identity.uri.user || '';
        const callerName = lookupCustomerName(caller);
        activeCallMeta = {
            phone: caller,
            name: callerName,
            direction: 'in',
            startedAt: Date.now(),
            orderCode: lookupOrderCode(caller),
        };
        document.getElementById('pwName').textContent = callerName || 'Đang trả lời...';
        document.getElementById('pwDialInput').value = formatVNPhone(caller);

        // Pre-test mic TRƯỚC khi answer — outgoing đã làm, incoming thiếu → JsSIP gọi
        // getUserMedia trong answer() và fail im với "WebRTC Error" nếu mic chưa grant
        // (lần đầu vào page chưa request mic bao giờ).
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
        } catch (err) {
            addLog(`Mic bị chặn: ${err.message}. Cho phép Microphone trong trình duyệt`, 'error');
            setStatus('error', 'Mic bị chặn');
            try {
                sessionToAnswer.terminate({ status_code: 480, reason_phrase: 'Mic blocked' });
            } catch {}
            incomingSession = null;
            return;
        }

        // Pre-warm TURN config nếu chưa cache (timeout 5s)
        await fetchIceServersFromRender().catch(() => {});

        // Register UI listeners + audio attach AFTER mic OK
        handleSession(sessionToAnswer);
        try {
            sessionToAnswer.answer({
                mediaConstraints: { audio: true, video: false },
                pcConfig: { iceServers: getIceServers(), iceTransportPolicy: 'all' },
                rtcOfferConstraints: { offerToReceiveAudio: true },
                sessionTimersExpires: 120,
            });
        } catch (err) {
            addLog(`Answer error: ${err.message}`, 'error');
        }
        incomingSession = null;
    }

    function rejectIncoming() {
        if (!incomingSession) return;
        const caller = incomingSession.remote_identity.uri.user || '';
        const callerName = lookupCustomerName(caller);
        stopIncomingRing();
        try {
            incomingSession.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
        } catch {}
        incomingSession = null;
        playHangupTone();
        hideIncomingBanner();
        addLog('Đã từ chối cuộc gọi');
        addHistoryEntry({ phone: caller, name: callerName, direction: 'in', duration: 0 });
    }

    function hideIncomingBanner() {
        const el = document.getElementById('pwIncoming');
        if (el) el.style.display = 'none';
        document.getElementById('pwCaller').style.display = 'block';
        document.getElementById('pwPad').style.display = 'grid';
        document.querySelector('.pw-actions').style.display = 'flex';
        if (fabEl) fabEl.classList.remove('incoming');
        if (isRegistered && !currentSession)
            setStatus('registered', `Ext ${config.extension} • Sẵn sàng`);
    }

    // === DIAL ===
    function dialFromInput() {
        const input = document.getElementById('pwDialInput');
        const num = input ? input.value.trim() : '';
        if (num && num.length >= 3) makeCall(num, '');
    }
    function press(key) {
        playKeypadClick();
        const input = document.getElementById('pwDialInput');
        if (input && !currentSession) {
            input.value += key;
            input.focus();
        }
        if (currentSession && currentSession.isEstablished()) {
            try {
                currentSession.sendDTMF(key);
            } catch {}
        }
    }
    function backspace() {
        const input = document.getElementById('pwDialInput');
        if (input) input.value = input.value.slice(0, -1);
    }

    let pendingCall = null;
    async function makeCall(phoneNumber, customerName, orderCode) {
        const target = stripPhone(phoneNumber);
        if (!target || target.length < 3) return;
        const name = customerName || lookupCustomerName(target);
        const code = orderCode || lookupOrderCode(target);
        pendingCall = { phone: target, name: name || '', orderCode: code || '' };
        activeCallMeta = {
            phone: target,
            name: name || '',
            direction: 'out',
            startedAt: Date.now(),
            orderCode: code || '',
        };
        show();
        if (isHistoryOpen()) toggleHistory(); // close history panel when calling
        document.getElementById('pwName').textContent = name || 'Đang quay số...';
        document.getElementById('pwDialInput').value = formatVNPhone(target);
        const sub = document.getElementById('pwSub');
        if (sub) {
            sub.textContent = code ? `Đơn ${code}` : '';
            sub.classList.toggle('has-order', !!code);
        }
        if (phone && isRegistered) {
            dialPending();
            return;
        }
        if (!phone) await init();
        const waitReg = setInterval(() => {
            if (isRegistered) {
                clearInterval(waitReg);
                dialPending();
            }
        }, 200);
        setTimeout(() => {
            clearInterval(waitReg);
            if (!isRegistered) addLog('Registration timeout', 'error');
        }, 15000);
    }

    async function dialPending() {
        if (!pendingCall || !phone || !isRegistered) return;
        if (currentSession) {
            addLog('Already in call', 'error');
            return;
        }
        const target = pendingCall.phone;
        // Đảm bảo ICE/TURN config đã load trước khi tạo offer — nếu cache đã có thì return ngay.
        await fetchIceServersFromRender().catch(() => {});
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
        } catch {
            addLog('Mic bị chặn! Cho phép Microphone trong trình duyệt', 'error');
            setStatus('error', 'Mic bị chặn');
            pendingCall = null;
            return;
        }
        addLog(`Calling ${target}...`);
        setStatus('calling', `Đang gọi ${target}...`);
        const session = phone.call(`sip:${target}@${getPbxDomain()}`, {
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers: getIceServers(), iceTransportPolicy: 'all' },
            rtcOfferConstraints: { offerToReceiveAudio: true },
            sessionTimersExpires: 120,
        });
        handleSession(session);
        pendingCall = null;
    }

    function handleSession(session) {
        currentSession = session;
        const caller = document.getElementById('pwCaller');
        document.getElementById('pwCall').style.display = 'none';
        document.getElementById('pwDel').style.display = 'none';
        document.getElementById('pwPad').style.display = 'none';
        document.getElementById('pwHangup').style.display = 'flex';
        document.getElementById('pwMute').style.display = 'flex';

        session.on('progress', () => {
            setStatus('calling', 'Đang đổ chuông...');
            addLog('Ringing...');
            if (caller) {
                caller.classList.add('ringing');
                caller.classList.remove('active');
            }
            document.getElementById('pwName').textContent = 'Đang đổ chuông...';
            startRingback();
        });
        session.on('accepted', () => {
            stopRingback();
            setStatus('connected', 'Đã kết nối');
            addLog('Connected', 'success');
            if (caller) {
                caller.classList.add('active');
                caller.classList.remove('ringing');
            }
            document.getElementById('pwName').textContent =
                activeCallMeta?.name || 'Đang nói chuyện';
            playAnsweredTone();
            startTimer();
            try {
                window.PhoneCloudSync?.setPresence?.('in-call', {
                    ext: config.extension,
                    callPhone: activeCallMeta?.phone || '',
                    callName: activeCallMeta?.name || '',
                    direction: activeCallMeta?.direction || '',
                });
            } catch {}
            // Always-on recording: thu âm mọi cuộc gọi (local IndexedDB + auto-upload Render DB)
            try {
                if (window.PhoneRecording && activeCallMeta?.phone) {
                    const user = window.authManager?.getAuthData?.()?.displayName || '';
                    // Delay 400ms to let remote track attach to <audio id=pwRemoteAudio>
                    setTimeout(() => {
                        window.PhoneRecording.startRecording({
                            username: user,
                            ext: config.extension,
                            phone: activeCallMeta.phone,
                            name: activeCallMeta.name,
                            direction: activeCallMeta.direction,
                            orderCode: activeCallMeta.orderCode,
                            timestamp: Date.now(),
                        });
                    }, 400);
                }
            } catch (err) {
                addLog('Ghi âm lỗi: ' + err.message, 'error');
            }
        });
        session.on('confirmed', () => attachAudio(session));
        session.on('ended', (e) => {
            stopRingback();
            addLog(`Ended: ${e.cause}`);
            playHangupTone();
            endCall();
        });
        session.on('failed', (e) => {
            stopRingback();
            addLog(`Failed: ${e.cause}`, 'error');
            playHangupTone();
            _announceCallFailure(e.cause, activeCallMeta?.direction);
            endCall();
        });
        session.on('peerconnection', (e) => {
            e.peerconnection.addEventListener('track', (ev) => {
                if (ev.track.kind === 'audio') {
                    const a = document.getElementById('pwRemoteAudio');
                    a.srcObject = new MediaStream([ev.track]);
                    a.play().catch(() => {});
                }
            });
        });
    }

    function attachAudio(session) {
        try {
            const pc = session.connection;
            if (!pc) return;
            pc.getReceivers().forEach((r) => {
                if (r.track?.kind === 'audio') {
                    const a = document.getElementById('pwRemoteAudio');
                    a.srcObject = new MediaStream([r.track]);
                    a.play().catch(() => {});
                }
            });
        } catch {}
    }

    function hangup() {
        if (currentSession) {
            try {
                currentSession.terminate();
            } catch {}
            playHangupTone();
        }
        endCall();
    }
    function endCall() {
        stopRingback();
        // Log to history before clearing state
        if (activeCallMeta && activeCallMeta.phone) {
            const durSec = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
            const entry = {
                phone: activeCallMeta.phone,
                name: activeCallMeta.name,
                direction: activeCallMeta.direction || 'out',
                duration: durSec,
                orderCode: activeCallMeta.orderCode,
                timestamp: Date.now(),
                ext: config.extension,
            };
            addHistoryEntry(entry);
            try {
                window.PhoneCloudSync?.logCall?.(entry);
            } catch {}
            // Stop local recording & save with duration
            try {
                if (window.PhoneRecording) {
                    window.PhoneRecording.stopRecording({ duration: durSec });
                }
            } catch {}
            activeCallMeta = null;
        }
        try {
            window.PhoneCloudSync?.setPresence?.(isRegistered ? 'registered' : 'offline', {
                ext: config.extension,
            });
        } catch {}
        currentSession = null;
        isMuted = false;
        stopTimer();
        const caller = document.getElementById('pwCaller');
        if (caller) caller.classList.remove('active', 'ringing');
        document.getElementById('pwCall').style.display = 'flex';
        document.getElementById('pwDel').style.display = 'flex';
        document.getElementById('pwPad').style.display = 'grid';
        document.getElementById('pwHangup').style.display = 'none';
        document.getElementById('pwMute').style.display = 'none';
        document.getElementById('pwMute').classList.remove('active');
        document.getElementById('pwTimer').style.display = 'none';
        document.getElementById('pwName').textContent = 'Sẵn sàng gọi';
        document.getElementById('pwDialInput').value = '';
        const sub = document.getElementById('pwSub');
        if (sub) {
            sub.textContent = '';
            sub.classList.remove('has-order');
        }
        if (isRegistered) setStatus('registered', `Ext ${config.extension} • Sẵn sàng`);
    }

    function toggleMute() {
        if (!currentSession) return;
        isMuted = !isMuted;
        if (currentSession.connection)
            currentSession.connection.getSenders().forEach((s) => {
                if (s.track?.kind === 'audio') s.track.enabled = !isMuted;
            });
        const btn = document.getElementById('pwMute');
        btn.classList.toggle('active', isMuted);
        btn.innerHTML = isMuted ? '🔇' : '🔊';
    }

    function startTimer() {
        callStartTime = Date.now();
        const el = document.getElementById('pwTimer');
        el.style.display = 'block';
        el.textContent = '00:00';
        callTimerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - callStartTime) / 1000);
            el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        }, 1000);
    }
    function stopTimer() {
        if (callTimerInterval) {
            clearInterval(callTimerInterval);
            callTimerInterval = null;
        }
    }

    function setStatus(t, text) {
        const dot = document.getElementById('pwStatusDot');
        const bar = document.getElementById('pwStatusBar');
        const txt = document.getElementById('pwStatusText');
        if (dot) dot.className = `pw-status-dot ${t}`;
        if (bar) bar.className = `pw-statusbar ${t}`;
        if (txt) txt.textContent = text;
    }
    function addLog(msg, type) {
        const log = document.getElementById('pwLog');
        if (!log) return;
        const time = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        const div = document.createElement('div');
        if (type) div.className = type;
        div.textContent = `[${time}] ${msg}`;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        // keep last 30 entries
        while (log.children.length > 30) log.removeChild(log.firstChild);
    }

    // === AUTO-INIT ===
    if (config.extension && config.authId && config.password) {
        setTimeout(() => init(), 3000);
    }

    // When ext-assignment changes (admin reassigns), re-apply if current user got a new ext
    if (window.PhoneExtAssignment?.onChange) {
        window.PhoneExtAssignment.onChange(() => {
            const assign = window.PhoneExtAssignment;
            if (!assign) return;
            updateExtChipLabel(); // refresh "Ext 107 · Name" on any change
            const myExt = assign.getMyExt();
            if (myExt && String(myExt) !== String(config.extension) && !currentSession) {
                addLog(`Ext mới được phân chia: ${myExt} — đang kết nối lại`, 'success');
                const f = getExtensions().find((e) => String(e.ext) === String(myExt));
                if (f) switchExt(f.ext);
            }
        });
    }

    // === HEALTH WATCHDOG ===
    // Vấn đề đã biết: tab ẩn lâu → browser throttle timers → JsSIP register expire,
    // WebSocket transport bị NAT/proxy cut silent → không fire 'disconnected' →
    // user mở lại tab thấy "mất kết nối" và không tự reconnect.
    //
    // Fix: 3 lớp phòng thủ:
    //   1) Visibility change: khi tab visible lại → reset backoff + force register refresh
    //      (nếu stale → registrationFailed/disconnected sẽ fire → scheduleReconnect)
    //   2) Online event: khi network online trở lại → reset backoff + kick init ngay
    //   3) Watchdog interval 45s: nếu phone null (chưa init) hoặc không registered và
    //      không có reconnectTimer đang chạy → trigger reconnect không delay

    function _forceReconnectNow(reason) {
        addLog(`Force reconnect: ${reason}`, 'error');
        cancelReconnect();
        // Tear down stale phone object
        if (phone) {
            try {
                phone.stop();
            } catch {}
            phone = null;
        }
        isRegistered = false;
        init();
    }

    function _healthCheck() {
        // Không động nếu đang có cuộc gọi — tránh disrupt audio
        if (currentSession || incomingSession) return;
        // Nếu đang có reconnect timer chạy → để nó tự xử lý (tránh double-init)
        if (reconnectTimer) return;
        // Nếu không có ext config → widget chưa setup, skip
        if (!config.extension || !config.authId || !config.password) return;

        if (!phone) {
            _forceReconnectNow('watchdog: no phone instance');
            return;
        }
        if (!isRegistered) {
            _forceReconnectNow('watchdog: not registered');
            return;
        }
        // Phone exists và registered. Kiểm tra WS transport health (JsSIP internals).
        // Nếu WS readyState != OPEN, transport dead → tear down.
        try {
            const transport = phone._transport;
            const ws = transport?.socket?._ws || transport?._ws;
            const readyState = ws?.readyState;
            // WebSocket.OPEN === 1. Nếu readyState != 1 và transport đã init → stale.
            if (ws && readyState != null && readyState !== 1) {
                _forceReconnectNow(`watchdog: WS readyState=${readyState}`);
            }
        } catch {
            // Accessing internals failed — không tear down, để tự nhiên.
        }
    }

    // Visibility: tab quay lại foreground → health check ngay
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            _healthCheck();
        }
    });

    // Network: online trở lại → reset backoff + kick reconnect ngay (nếu cần)
    window.addEventListener('online', () => {
        addLog('Network online — resetting reconnect backoff');
        if (reconnectTimer) {
            // Nếu đang pending reconnect, cancel để kick ngay không chờ backoff lớn
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
            reconnectAttempt = 0;
        }
        _healthCheck();
    });

    // Watchdog interval — 45s (dưới register_expires=120s để detect stale sớm)
    setInterval(_healthCheck, 45000);

    // Initialize FAB badge state on widget creation (attach to fabEl creation)
    function _initFabBadgeOnLoad() {
        // Defer until FAB exists
        const check = setInterval(() => {
            if (fabEl) {
                updateMissedBadge();
                clearInterval(check);
            }
        }, 500);
        setTimeout(() => clearInterval(check), 15000);
    }
    _initFabBadgeOnLoad();

    /**
     * Refresh widget — disconnect + re-init (kết nối lại tổng đài, re-fetch ICE/TURN, re-register SIP).
     * Dùng khi widget hiển thị lỗi: "Mic bị chặn", "Reg failed", "WS disconnected", hoặc bị treo.
     * Spin nút ↻ trong 1.5s để báo hiệu cho user.
     */
    async function refresh() {
        const btn = document.getElementById('pwRefreshBtn');
        if (btn) {
            btn.style.transition = 'transform 1.5s ease-out';
            btn.style.transform = 'rotate(360deg)';
            btn.disabled = true;
            setTimeout(() => {
                if (btn) {
                    btn.style.transition = 'none';
                    btn.style.transform = 'rotate(0deg)';
                    btn.disabled = false;
                }
            }, 1500);
        }
        addLog('🔄 Refresh widget — kết nối lại tổng đài...');
        setStatus('calling', 'Đang kết nối lại...');
        try {
            disconnect();
        } catch (e) {
            console.warn('[PhoneWidget] refresh disconnect warn:', e?.message);
        }
        // Clear ICE cache để fetch fresh TURN credentials
        _iceServersCache = null;
        _iceServersFetchedAt = 0;
        // Slight delay để WebSocket cleanup hoàn toàn
        await new Promise((r) => setTimeout(r, 300));
        try {
            await init();
            addLog('✅ Refresh xong');
        } catch (e) {
            addLog('❌ Refresh thất bại: ' + (e?.message || e), 'error');
            setStatus('error', 'Refresh thất bại');
        }
    }

    return {
        init,
        refresh,
        makeCall,
        hangup,
        toggleMute,
        toggleSettings,
        applySettings,
        onExtChange,
        show,
        hide,
        toggle,
        toggleMinimize,
        dialFromInput,
        press,
        backspace,
        acceptIncoming,
        rejectIncoming,
        toggleExtPicker,
        switchExt,
        openExtAssignment,
        toggleAutoRegister,
        toggleHistory,
        clearHistory,
        callFromHistory,
        pasteFromClipboard,
        callCurrent: dialFromInput,
        isReady: () => isRegistered,
    };
})();
