// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Widget — Standalone WebRTC softphone for orders-report
// Uses JsSIP → OnCallCX PBX via Vultr WSS proxy
// Features: auto-reconnect, ringback/answer/hangup tones, incoming ring + accept/reject

const PhoneWidget = (() => {
    const STORAGE_KEY = 'phoneWidget_config';
    const RENDER_API = 'https://n2store-fallback.onrender.com/api/oncall/phone-config';
    const DEFAULTS = {
        pbx_domain: 'pbx-ucaas.oncallcx.vn',
        ws_url: 'wss://45-76-155-207.sslip.io/ws',
        sip_extensions: [
            { ext: '101', authId: 'gOcQD5CWCYFuDSh2', password: 'iuPj7ZTT2dKoOSoY', label: 'Ext 101' }
        ]
    };
    const MAX_RECONNECT_DELAY = 30000;

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

    // Audio tones
    let audioCtx = null;
    let ringbackInterval = null;
    let incomingRingInterval = null;

    function loadConfig() {
        try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {}
        return { wsUrl: DEFAULTS.ws_url, extension: DEFAULTS.sip_extensions[0].ext, authId: DEFAULTS.sip_extensions[0].authId, password: DEFAULTS.sip_extensions[0].password };
    }
    function saveConfig() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {} }

    async function loadFromDB() {
        try {
            const r = await fetch(RENDER_API); const d = await r.json();
            if (d.success && d.config) { dbConfig = d.config; try { localStorage.setItem('phoneWidget_dbConfig', JSON.stringify(dbConfig)); } catch {} return dbConfig; }
        } catch {}
        try { const c = localStorage.getItem('phoneWidget_dbConfig'); if (c) { dbConfig = JSON.parse(c); return dbConfig; } } catch {}
        return null;
    }
    function getPbxDomain() { return dbConfig?.pbx_domain || DEFAULTS.pbx_domain; }
    function getExtensions() { return dbConfig?.sip_extensions || DEFAULTS.sip_extensions; }
    function getWsUrl() { return dbConfig?.ws_url || DEFAULTS.ws_url; }
    function getIceServers() { return [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]; }

    // === AUDIO TONES (Web Audio API) ===
    function getAudioCtx() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
        }
        if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function playBeep({ freq = 440, freqEnd = null, duration = 0.2, volume = 0.18, type = 'sine', delay = 0 } = {}) {
        const ctx = getAudioCtx(); if (!ctx) return;
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
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + duration + 0.05);
    }

    // Vietnam ringback: 425Hz, 1s on / 4s off
    function startRingback() {
        stopRingback();
        const tick = () => playBeep({ freq: 425, duration: 1, volume: 0.12 });
        tick();
        ringbackInterval = setInterval(tick, 5000);
    }
    function stopRingback() {
        if (ringbackInterval) { clearInterval(ringbackInterval); ringbackInterval = null; }
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
        if (incomingRingInterval) { clearInterval(incomingRingInterval); incomingRingInterval = null; }
    }

    // Rising beep: call answered / connected
    function playAnsweredTone() {
        playBeep({ freq: 600, freqEnd: 1000, duration: 0.18, volume: 0.22, type: 'sine' });
        playBeep({ freq: 1000, duration: 0.12, volume: 0.18, type: 'sine', delay: 0.22 });
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

    // === CREATE UI ===
    function createWidget() {
        if (widgetEl) return;

        const extensions = getExtensions();
        const extOpts = extensions.map(e =>
            `<option value="${e.ext}" ${config.extension === e.ext ? 'selected' : ''}>${e.label || 'Ext ' + e.ext}</option>`
        ).join('') + '<option value="_custom">Tuỳ chỉnh...</option>';

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
                        <div class="pw-f"><label>Ext</label><input id="pwExtInput" type="text" value="${config.extension}"></div>
                        <div class="pw-f"><label>Auth ID</label><input id="pwAuthInput" type="text" value="${config.authId}"></div>
                        <div class="pw-f"><label>Mật khẩu</label><input id="pwPassInput" type="password" value="${config.password}"></div>
                    </div>
                    <button class="pw-save" onclick="PhoneWidget.applySettings()">Kết nối lại</button>
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
                    <input type="tel" id="pwDialInput" class="pw-dial-input" placeholder="Nhập số điện thoại" autocomplete="off">
                    <div class="pw-timer" id="pwTimer" style="display:none">00:00</div>
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
            font-family:'SF Mono','Monaco',monospace;text-align:center;padding:8px 0 6px;
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

        // Enter to call
        document.getElementById('pwDialInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dialFromInput();
        });

        // Unlock AudioContext on first interaction
        const unlock = () => { getAudioCtx(); widgetEl.removeEventListener('click', unlock); };
        widgetEl.addEventListener('click', unlock);

        // Draggable header
        initDrag();
    }

    // === DRAG ===
    function initDrag() {
        const head = document.getElementById('pwHead');
        if (!head) return;
        let dragging = false, offsetX = 0, offsetY = 0;
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
            widgetEl.style.left = (e.clientX - offsetX) + 'px';
            widgetEl.style.top = (e.clientY - offsetY) + 'px';
            widgetEl.style.right = 'auto';
            widgetEl.style.bottom = 'auto';
        });
        document.addEventListener('mouseup', () => { dragging = false; widgetEl.style.transition = ''; });
    }

    // === TOGGLE / SHOW / HIDE ===
    function toggle() {
        createWidget();
        if (widgetEl.classList.contains('hidden')) {
            widgetEl.classList.remove('hidden');
            fabEl.classList.add('active');
        } else {
            widgetEl.classList.add('hidden');
            fabEl.classList.remove('active');
        }
    }
    function show() { createWidget(); widgetEl.classList.remove('hidden'); if (fabEl) fabEl.classList.add('active'); }
    function hide() { if (widgetEl) widgetEl.classList.add('hidden'); if (fabEl) fabEl.classList.remove('active'); }
    function toggleMinimize() {
        if (!widgetEl) return;
        widgetEl.classList.toggle('minimized');
        document.getElementById('pwMinBtn').innerHTML = widgetEl.classList.contains('minimized') ? '▢' : '−';
    }

    // === QUICK EXT PICKER ===
    function renderExtPickerList() {
        const list = document.getElementById('pwExtPickerList'); if (!list) return;
        const extensions = getExtensions();
        list.innerHTML = extensions.map(e => `
            <div class="pw-ext-item ${config.extension === e.ext ? 'active' : ''}" onclick="PhoneWidget.switchExt('${e.ext}')">
                <span><span class="pw-ext-item-num">${e.ext}</span>${e.label && e.label !== 'Ext ' + e.ext ? `<span class="pw-ext-item-label">${e.label}</span>` : ''}</span>
            </div>
        `).join('');
    }
    function toggleExtPicker(ev) {
        if (ev) ev.stopPropagation();
        const p = document.getElementById('pwExtPicker'); if (!p) return;
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
        const f = getExtensions().find(e => e.ext === ext);
        if (!f) { addLog(`Không tìm thấy ext ${ext}`, 'error'); return; }
        if (currentSession) { addLog('Đang có cuộc gọi — không đổi ext', 'error'); return; }
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
        if (el) el.textContent = `Ext ${config.extension}`;
    }

    // === SETTINGS ===
    function toggleSettings() {
        const p = document.getElementById('pwSettings');
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }
    function onExtChange() {
        const sel = document.getElementById('pwExtSelect');
        const custom = document.getElementById('pwCustomFields');
        if (sel.value === '_custom') { custom.style.display = 'block'; return; }
        custom.style.display = 'none';
        const ext = getExtensions().find(e => e.ext === sel.value);
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
            const f = getExtensions().find(e => e.ext === sel.value);
            if (!f) { addLog('Extension not found', 'error'); return; }
            ext = f.ext; authId = f.authId; password = f.password;
        }
        if (!ext || !authId || !password) { addLog('Thiếu thông tin', 'error'); return; }
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
        if (currentSession) { try { currentSession.terminate(); } catch {} currentSession = null; }
        if (incomingSession) { try { incomingSession.terminate(); } catch {} incomingSession = null; }
        if (phone) { try { phone.stop(); } catch {} phone = null; }
        isRegistered = false; isMuted = false; stopTimer();
    }

    // === RECONNECT ===
    function scheduleReconnect(reason) {
        if (reconnectTimer) return;
        reconnectAttempt++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), MAX_RECONNECT_DELAY);
        addLog(`Reconnect in ${Math.round(delay/1000)}s (lần ${reconnectAttempt}) — ${reason}`, 'error');
        setStatus('error', `Đang thử lại (${reconnectAttempt})... ${Math.round(delay/1000)}s`);
        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            // Fully tear down before re-init
            if (phone) { try { phone.stop(); } catch {} phone = null; }
            isRegistered = false;
            addLog(`Đang kết nối lại ext ${config.extension}...`);
            init();
        }, delay);
    }
    function cancelReconnect() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        reconnectAttempt = 0;
    }

    // === INIT JSSIP ===
    async function init() {
        if (phone) return;
        if (!dbConfig) await loadFromDB();
        if (!config.wsUrl) config.wsUrl = getWsUrl();
        createWidget();
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
                register: true, register_expires: 120, session_timers: false,
                connection_recovery_min_interval: 2, connection_recovery_max_interval: 30, no_answer_timeout: 60
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
            phone.on('newRTCSession', (e) => { if (e.originator === 'remote') handleIncoming(e.session); });
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
            try { session.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
            addLog('Busy — incoming call rejected', 'error');
            return;
        }
        show();
        incomingSession = session;
        const caller = session.remote_identity.uri.user || 'Không rõ';
        addLog(`Cuộc gọi đến: ${caller}`);

        // Show incoming banner, hide normal UI
        document.getElementById('pwIncoming').style.display = 'block';
        document.getElementById('pwIncomingNum').textContent = caller;
        document.getElementById('pwCaller').style.display = 'none';
        document.getElementById('pwPad').style.display = 'none';
        document.querySelector('.pw-actions').style.display = 'none';
        setStatus('calling', 'Cuộc gọi đến...');
        if (fabEl) fabEl.classList.add('incoming');
        startIncomingRing();

        session.on('failed', (e) => {
            stopIncomingRing();
            addLog(`Missed/failed: ${e.cause}`, 'error');
            hideIncomingBanner();
            incomingSession = null;
        });
        session.on('ended', () => {
            stopIncomingRing();
            hideIncomingBanner();
            incomingSession = null;
        });
    }

    function acceptIncoming() {
        if (!incomingSession) return;
        stopIncomingRing();
        hideIncomingBanner();
        const caller = incomingSession.remote_identity.uri.user || '';
        document.getElementById('pwName').textContent = 'Đang trả lời...';
        document.getElementById('pwDialInput').value = caller;
        handleSession(incomingSession);
        try {
            incomingSession.answer({
                mediaConstraints: { audio: true, video: false },
                pcConfig: { iceServers: getIceServers() }
            });
        } catch (err) { addLog(`Answer error: ${err.message}`, 'error'); }
        incomingSession = null;
    }

    function rejectIncoming() {
        if (!incomingSession) return;
        stopIncomingRing();
        try { incomingSession.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); } catch {}
        incomingSession = null;
        playHangupTone();
        hideIncomingBanner();
        addLog('Đã từ chối cuộc gọi');
    }

    function hideIncomingBanner() {
        const el = document.getElementById('pwIncoming'); if (el) el.style.display = 'none';
        document.getElementById('pwCaller').style.display = 'block';
        document.getElementById('pwPad').style.display = 'grid';
        document.querySelector('.pw-actions').style.display = 'flex';
        if (fabEl) fabEl.classList.remove('incoming');
        if (isRegistered && !currentSession) setStatus('registered', `Ext ${config.extension} • Sẵn sàng`);
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
        if (input && !currentSession) { input.value += key; input.focus(); }
        if (currentSession && currentSession.isEstablished()) { try { currentSession.sendDTMF(key); } catch {} }
    }
    function backspace() {
        const input = document.getElementById('pwDialInput');
        if (input) input.value = input.value.slice(0, -1);
    }

    let pendingCall = null;
    async function makeCall(phoneNumber, customerName) {
        const target = phoneNumber.replace(/[\s\-()]/g, '');
        if (!target || target.length < 3) return;
        pendingCall = { phone: target, name: customerName || '' };
        show();
        document.getElementById('pwName').textContent = customerName || 'Đang quay số...';
        document.getElementById('pwDialInput').value = target;
        if (phone && isRegistered) { dialPending(); return; }
        if (!phone) await init();
        const waitReg = setInterval(() => { if (isRegistered) { clearInterval(waitReg); dialPending(); } }, 200);
        setTimeout(() => { clearInterval(waitReg); if (!isRegistered) addLog('Registration timeout', 'error'); }, 15000);
    }

    async function dialPending() {
        if (!pendingCall || !phone || !isRegistered) return;
        if (currentSession) { addLog('Already in call', 'error'); return; }
        const target = pendingCall.phone;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
        } catch {
            addLog('Mic bị chặn! Cho phép Microphone trong trình duyệt', 'error');
            setStatus('error', 'Mic bị chặn');
            pendingCall = null; return;
        }
        addLog(`Calling ${target}...`);
        setStatus('calling', `Đang gọi ${target}...`);
        const session = phone.call(`sip:${target}@${getPbxDomain()}`, {
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers: getIceServers(), iceTransportPolicy: 'all' },
            rtcOfferConstraints: { offerToReceiveAudio: true }, sessionTimersExpires: 120
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
            if (caller) { caller.classList.add('ringing'); caller.classList.remove('active'); }
            document.getElementById('pwName').textContent = 'Đang đổ chuông...';
            startRingback();
        });
        session.on('accepted', () => {
            stopRingback();
            setStatus('connected', 'Đã kết nối');
            addLog('Connected', 'success');
            if (caller) { caller.classList.add('active'); caller.classList.remove('ringing'); }
            document.getElementById('pwName').textContent = 'Đang nói chuyện';
            playAnsweredTone();
            startTimer();
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
            endCall();
        });
        session.on('peerconnection', (e) => {
            e.peerconnection.addEventListener('track', (ev) => {
                if (ev.track.kind === 'audio') {
                    const a = document.getElementById('pwRemoteAudio');
                    a.srcObject = new MediaStream([ev.track]); a.play().catch(() => {});
                }
            });
        });
    }

    function attachAudio(session) {
        try {
            const pc = session.connection; if (!pc) return;
            pc.getReceivers().forEach(r => {
                if (r.track?.kind === 'audio') {
                    const a = document.getElementById('pwRemoteAudio');
                    a.srcObject = new MediaStream([r.track]); a.play().catch(() => {});
                }
            });
        } catch {}
    }

    function hangup() {
        if (currentSession) {
            try { currentSession.terminate(); } catch {}
            playHangupTone();
        }
        endCall();
    }
    function endCall() {
        stopRingback();
        currentSession = null; isMuted = false; stopTimer();
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
        if (isRegistered) setStatus('registered', `Ext ${config.extension} • Sẵn sàng`);
    }

    function toggleMute() {
        if (!currentSession) return;
        isMuted = !isMuted;
        if (currentSession.connection) currentSession.connection.getSenders().forEach(s => { if (s.track?.kind === 'audio') s.track.enabled = !isMuted; });
        const btn = document.getElementById('pwMute');
        btn.classList.toggle('active', isMuted);
        btn.innerHTML = isMuted ? '🔇' : '🔊';
    }

    function startTimer() {
        callStartTime = Date.now();
        const el = document.getElementById('pwTimer');
        el.style.display = 'block'; el.textContent = '00:00';
        callTimerInterval = setInterval(() => {
            const s = Math.floor((Date.now() - callStartTime) / 1000);
            el.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
        }, 1000);
    }
    function stopTimer() { if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; } }

    function setStatus(t, text) {
        const dot = document.getElementById('pwStatusDot');
        const bar = document.getElementById('pwStatusBar');
        const txt = document.getElementById('pwStatusText');
        if (dot) dot.className = `pw-status-dot ${t}`;
        if (bar) bar.className = `pw-statusbar ${t}`;
        if (txt) txt.textContent = text;
    }
    function addLog(msg, type) {
        const log = document.getElementById('pwLog'); if (!log) return;
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const div = document.createElement('div'); if (type) div.className = type;
        div.textContent = `[${time}] ${msg}`; log.appendChild(div); log.scrollTop = log.scrollHeight;
        // keep last 30 entries
        while (log.children.length > 30) log.removeChild(log.firstChild);
    }

    // === AUTO-INIT ===
    if (config.extension && config.authId && config.password) {
        setTimeout(() => init(), 3000);
    }

    return {
        init, makeCall, hangup, toggleMute, toggleSettings, applySettings, onExtChange,
        show, hide, toggle, toggleMinimize, dialFromInput, press, backspace,
        acceptIncoming, rejectIncoming,
        toggleExtPicker, switchExt,
        callCurrent: dialFromInput, isReady: () => isRegistered
    };
})();
