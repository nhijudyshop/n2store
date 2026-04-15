// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Widget — Standalone WebRTC softphone for orders-report
// Uses JsSIP → OnCallCX PBX (direct WSS or via Render proxy)

const PhoneWidget = (() => {
    // === DEFAULTS ===
    const PBX_DOMAIN = 'pbx-ucaas.oncallcx.vn';
    const STORAGE_KEY = 'phoneWidget_config';
    const METERED_API_KEY = '61239134d00b315f4db5888a720950acc22d';

    // Preset extensions (populate from OnCallCX)
    const PRESETS = [
        { ext: '101', authId: 'gOcQD5CWCYFuDSh2', password: 'iuPj7ZTT2dKoOSoY' }
    ];

    // WS connection options
    const WS_OPTIONS = [
        { label: 'Vultr VPS', url: 'wss://45-76-155-207.sslip.io/ws' },
        { label: 'Render Proxy', url: 'wss://n2store-fallback.onrender.com/api/oncall/ws' }
    ];

    // === STATE ===
    let phone = null;
    let currentSession = null;
    let callTimerInterval = null;
    let callStartTime = null;
    let isMuted = false;
    let isRegistered = false;
    let widgetEl = null;
    let config = loadConfig();

    function loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch {}
        return {
            wsUrl: WS_OPTIONS[0].url,
            extension: PRESETS[0].ext,
            authId: PRESETS[0].authId,
            password: PRESETS[0].password
        };
    }

    function saveConfig() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch {}
    }

    // === CREATE WIDGET UI ===
    function createWidget() {
        if (widgetEl) return;

        const wsOptionsHtml = WS_OPTIONS.map(o =>
            `<option value="${o.url}" ${config.wsUrl === o.url ? 'selected' : ''}>${o.label}</option>`
        ).join('');

        const html = `
        <div id="phoneWidget" class="phone-widget hidden">
            <div class="pw-header">
                <span class="pw-title">N2Store Phone</span>
                <span class="pw-status" id="pwStatus">Offline</span>
                <button class="pw-btn-icon" id="pwSettingsBtn" onclick="PhoneWidget.toggleSettings()" title="Cài đặt">&#9881;</button>
                <button class="pw-btn-icon" onclick="PhoneWidget.hide()" title="Ẩn">&times;</button>
            </div>

            <!-- Settings Panel -->
            <div class="pw-settings" id="pwSettings" style="display:none">
                <div class="pw-field">
                    <label>Server</label>
                    <select id="pwWsUrl">${wsOptionsHtml}</select>
                </div>
                <div class="pw-field">
                    <label>Extension</label>
                    <input id="pwExtInput" type="text" value="${config.extension}" placeholder="101">
                </div>
                <div class="pw-field">
                    <label>Auth ID</label>
                    <input id="pwAuthInput" type="text" value="${config.authId}" placeholder="Auth ID">
                </div>
                <div class="pw-field">
                    <label>Password</label>
                    <input id="pwPassInput" type="password" value="${config.password}" placeholder="Password">
                </div>
                <div class="pw-settings-actions">
                    <button class="pw-save-btn" onclick="PhoneWidget.applySettings()">Kết nối</button>
                </div>
            </div>

            <!-- Call UI -->
            <div class="pw-call-info" id="pwCallPanel">
                <div class="pw-name" id="pwName"></div>
                <div class="pw-number" id="pwNumber">Ready</div>
                <div class="pw-timer" id="pwTimer" style="display:none">00:00</div>
            </div>
            <div class="pw-actions" id="pwActions">
                <button class="pw-btn pw-btn-mute" id="pwMute" onclick="PhoneWidget.toggleMute()" style="display:none" title="Tắt tiếng">&#128263;</button>
                <button class="pw-btn pw-btn-call" id="pwCall" onclick="PhoneWidget.callCurrent()" title="Gọi">&#128222;</button>
                <button class="pw-btn pw-btn-hangup" id="pwHangup" onclick="PhoneWidget.hangup()" style="display:none" title="Ngắt">&#128308;</button>
            </div>
            <div class="pw-log" id="pwLog"></div>
            <audio id="pwRemoteAudio" autoplay></audio>
        </div>`;

        const style = document.createElement('style');
        style.textContent = `
        .phone-widget {
            position: fixed; bottom: 20px; right: 20px; z-index: 99999;
            width: 310px; background: #1a1a2e; border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4); color: #eee;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden; transition: all 0.3s ease;
        }
        .phone-widget.hidden { display: none; }
        .pw-header {
            display: flex; align-items: center; padding: 10px 14px;
            background: #16213e; gap: 8px;
        }
        .pw-title { font-size: 13px; font-weight: 600; color: #8be9fd; flex: 1; }
        .pw-status {
            font-size: 10px; padding: 2px 8px; border-radius: 10px;
            background: #333; color: #888;
        }
        .pw-status.registered { background: #1b4332; color: #4caf50; }
        .pw-status.calling { background: #3d2c00; color: #ff9800; }
        .pw-status.connected { background: #1b4332; color: #4caf50; animation: pw-pulse 1.5s infinite; }
        .pw-status.error { background: #3d1212; color: #f44336; }
        @keyframes pw-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .pw-btn-icon {
            background: none; border: none; color: #666; font-size: 16px;
            cursor: pointer; padding: 2px 4px; line-height: 1;
        }
        .pw-btn-icon:hover { color: #8be9fd; }

        /* Settings */
        .pw-settings {
            padding: 10px 14px; background: #111827;
            border-bottom: 1px solid #333;
        }
        .pw-field { margin-bottom: 8px; }
        .pw-field label {
            display: block; font-size: 10px; color: #888;
            margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .pw-field input, .pw-field select {
            width: 100%; box-sizing: border-box; padding: 6px 8px;
            background: #1e293b; border: 1px solid #334155; border-radius: 6px;
            color: #e2e8f0; font-size: 12px; font-family: monospace;
            outline: none;
        }
        .pw-field input:focus, .pw-field select:focus {
            border-color: #8be9fd;
        }
        .pw-settings-actions { display: flex; gap: 8px; }
        .pw-save-btn {
            flex: 1; padding: 6px; background: #4caf50; color: #fff;
            border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
            cursor: pointer;
        }
        .pw-save-btn:hover { background: #388e3c; }

        /* Call info */
        .pw-call-info {
            text-align: center; padding: 14px 10px; min-height: 60px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .pw-name { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 2px; }
        .pw-number { font-size: 13px; color: #8be9fd; font-family: monospace; }
        .pw-timer { font-size: 22px; font-weight: 300; color: #ccc; margin-top: 6px; font-family: monospace; }
        .pw-actions {
            display: flex; gap: 12px; justify-content: center; padding: 0 14px 14px;
        }
        .pw-btn {
            width: 48px; height: 48px; border: none; border-radius: 50%;
            font-size: 20px; cursor: pointer; transition: all 0.15s;
            display: flex; align-items: center; justify-content: center;
        }
        .pw-btn-call { background: #4caf50; color: #fff; }
        .pw-btn-call:hover { background: #388e3c; }
        .pw-btn-hangup { background: #f44336; color: #fff; }
        .pw-btn-hangup:hover { background: #d32f2f; }
        .pw-btn-mute { background: #333; color: #ccc; }
        .pw-btn-mute:hover { background: #444; }
        .pw-btn-mute.active { background: #f44336; color: #fff; }
        .pw-log {
            max-height: 80px; overflow-y: auto; font-size: 9px; color: #555;
            font-family: monospace; background: #111; padding: 6px; margin: 0 10px 10px;
            border-radius: 6px;
        }
        .pw-log .error { color: #f44336; }
        .pw-log .success { color: #4caf50; }
        .pw-log::-webkit-scrollbar { width: 3px; }
        .pw-log::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container.firstElementChild);
        widgetEl = document.getElementById('phoneWidget');
    }

    // === SETTINGS ===
    function toggleSettings() {
        const panel = document.getElementById('pwSettings');
        if (!panel) return;
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function applySettings() {
        const wsUrl = document.getElementById('pwWsUrl').value;
        const ext = document.getElementById('pwExtInput').value.trim();
        const authId = document.getElementById('pwAuthInput').value.trim();
        const password = document.getElementById('pwPassInput').value.trim();

        if (!ext || !authId || !password) {
            addLog('Thiếu thông tin ext/auth/pass', 'error');
            return;
        }

        config = { wsUrl, extension: ext, authId, password };
        saveConfig();

        // Disconnect old phone and reconnect
        disconnect();
        toggleSettings();
        init();
    }

    function disconnect() {
        if (currentSession) {
            try { currentSession.terminate(); } catch {}
            currentSession = null;
        }
        if (phone) {
            try { phone.stop(); } catch {}
            phone = null;
        }
        isRegistered = false;
        isMuted = false;
        stopTimer();
    }

    // === INIT JSSIP ===
    async function init() {
        if (phone) return;
        createWidget();

        try {
            addLog(`Connecting ${config.wsUrl.includes('onrender') ? 'via Proxy' : 'Direct'}...`);

            const socket = new JsSIP.WebSocketInterface(config.wsUrl);

            const configuration = {
                sockets: [socket],
                uri: `sip:${config.extension}@${PBX_DOMAIN}`,
                authorization_user: config.authId,
                password: config.password,
                display_name: config.extension,
                register: true,
                register_expires: 120,
                session_timers: false,
                connection_recovery_min_interval: 2,
                connection_recovery_max_interval: 30,
                no_answer_timeout: 60
            };

            phone = new JsSIP.UA(configuration);

            phone.on('connected', () => addLog('WebSocket connected', 'success'));
            phone.on('disconnected', () => {
                setStatus('error', 'Disconnected');
                isRegistered = false;
                addLog('Disconnected', 'error');
            });
            phone.on('registered', () => {
                setStatus('registered', `Ext ${config.extension}`);
                isRegistered = true;
                addLog(`Registered ext ${config.extension}`, 'success');
            });
            phone.on('unregistered', () => {
                setStatus('error', 'Unregistered');
                isRegistered = false;
            });
            phone.on('registrationFailed', (e) => {
                setStatus('error', 'Reg Failed');
                isRegistered = false;
                addLog(`Reg failed: ${e.cause}`, 'error');
            });

            // Incoming call
            phone.on('newRTCSession', (e) => {
                if (e.originator === 'remote') {
                    handleIncoming(e.session);
                }
            });

            phone.start();
            addLog('Starting...');
        } catch (err) {
            setStatus('error', 'Init Error');
            addLog(`Error: ${err.message}`, 'error');
        }
    }

    // === INCOMING CALL ===
    async function handleIncoming(session) {
        show();
        const caller = session.remote_identity.uri.user;
        addLog(`Incoming: ${caller}`);
        document.getElementById('pwName').textContent = '';
        document.getElementById('pwNumber').textContent = caller;

        const iceServers = await fetchIceServers();
        handleSession(session);
        session.answer({
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers }
        });
    }

    // === MAKE CALL ===
    let pendingCall = null;

    async function makeCall(phoneNumber, customerName) {
        const target = phoneNumber.replace(/[\s\-()]/g, '');
        if (!target || target.length < 3) return;

        pendingCall = { phone: target, name: customerName || '' };

        show();
        document.getElementById('pwName').textContent = customerName || '';
        document.getElementById('pwNumber').textContent = target;

        if (!phone) {
            await init();
            const waitReg = setInterval(() => {
                if (isRegistered) {
                    clearInterval(waitReg);
                    dialPending();
                }
            }, 500);
            setTimeout(() => {
                clearInterval(waitReg);
                if (!isRegistered) addLog('Registration timeout', 'error');
            }, 15000);
            return;
        }

        if (!isRegistered) {
            addLog('Not registered, waiting...', 'error');
            return;
        }

        dialPending();
    }

    async function dialPending() {
        if (!pendingCall || !phone || !isRegistered) return;
        if (currentSession) {
            addLog('Already in call', 'error');
            return;
        }

        const target = pendingCall.phone;
        addLog(`Calling ${target}...`);
        setStatus('calling', 'Calling...');

        const iceServers = await fetchIceServers();
        const session = phone.call(`sip:${target}@${PBX_DOMAIN}`, {
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers, iceTransportPolicy: 'all' },
            rtcOfferConstraints: { offerToReceiveAudio: true },
            sessionTimersExpires: 120
        });

        handleSession(session);
        pendingCall = null;
    }

    // === HANDLE SESSION ===
    function handleSession(session) {
        currentSession = session;
        document.getElementById('pwCall').style.display = 'none';
        document.getElementById('pwHangup').style.display = 'flex';
        document.getElementById('pwMute').style.display = 'flex';

        session.on('progress', () => {
            setStatus('calling', 'Ringing...');
            addLog('Ringing...');
        });
        session.on('accepted', () => {
            setStatus('connected', 'Connected');
            addLog('Connected', 'success');
            startTimer();
        });
        session.on('confirmed', () => attachAudio(session));
        session.on('ended', (e) => {
            addLog(`Ended: ${e.cause}`);
            endCall();
        });
        session.on('failed', (e) => {
            addLog(`Failed: ${e.cause}`, 'error');
            endCall();
        });
        session.on('peerconnection', (e) => {
            e.peerconnection.addEventListener('track', (event) => {
                if (event.track.kind === 'audio') {
                    const audio = document.getElementById('pwRemoteAudio');
                    audio.srcObject = new MediaStream([event.track]);
                    audio.play().catch(() => {});
                    addLog('Audio attached', 'success');
                }
            });
        });
    }

    function attachAudio(session) {
        try {
            const pc = session.connection;
            if (!pc) return;
            pc.getReceivers().forEach(r => {
                if (r.track && r.track.kind === 'audio') {
                    const audio = document.getElementById('pwRemoteAudio');
                    audio.srcObject = new MediaStream([r.track]);
                    audio.play().catch(() => {});
                }
            });
        } catch {}
    }

    // === HANGUP ===
    function hangup() {
        if (currentSession) {
            try { currentSession.terminate(); } catch {}
        }
        endCall();
    }

    function endCall() {
        currentSession = null;
        isMuted = false;
        stopTimer();
        document.getElementById('pwCall').style.display = 'flex';
        document.getElementById('pwHangup').style.display = 'none';
        document.getElementById('pwMute').style.display = 'none';
        document.getElementById('pwMute').classList.remove('active');
        document.getElementById('pwTimer').style.display = 'none';
        document.getElementById('pwName').textContent = '';
        document.getElementById('pwNumber').textContent = 'Ready';
        if (isRegistered) {
            setStatus('registered', `Ext ${config.extension}`);
        }
    }

    // === MUTE ===
    function toggleMute() {
        if (!currentSession) return;
        isMuted = !isMuted;
        if (currentSession.connection) {
            currentSession.connection.getSenders().forEach(s => {
                if (s.track && s.track.kind === 'audio') s.track.enabled = !isMuted;
            });
        }
        const btn = document.getElementById('pwMute');
        btn.classList.toggle('active', isMuted);
        btn.innerHTML = isMuted ? '&#128263;' : '&#128264;';
        addLog(isMuted ? 'Muted' : 'Unmuted');
    }

    // === TIMER ===
    function startTimer() {
        callStartTime = Date.now();
        const el = document.getElementById('pwTimer');
        el.style.display = 'block';
        el.textContent = '00:00';
        callTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            el.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
        }, 1000);
    }

    function stopTimer() {
        if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    }

    // === ICE SERVERS ===
    async function fetchIceServers() {
        try {
            const resp = await fetch(`https://n2store.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
            const servers = await resp.json();
            if (Array.isArray(servers) && servers.length > 0) return servers;
        } catch {}
        return [{ urls: 'stun:stun.l.google.com:19302' }];
    }

    // === UI HELPERS ===
    function setStatus(type, text) {
        const el = document.getElementById('pwStatus');
        if (!el) return;
        el.className = `pw-status ${type}`;
        el.textContent = text;
    }

    function addLog(msg, type) {
        const log = document.getElementById('pwLog');
        if (!log) return;
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const div = document.createElement('div');
        if (type) div.className = type;
        div.textContent = `[${time}] ${msg}`;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
    }

    function show() {
        createWidget();
        widgetEl.classList.remove('hidden');
    }

    function hide() {
        if (widgetEl) widgetEl.classList.add('hidden');
    }

    function callCurrent() {
        const num = document.getElementById('pwNumber')?.textContent;
        const name = document.getElementById('pwName')?.textContent;
        if (num && num !== 'Ready') makeCall(num, name);
    }

    // === PUBLIC API ===
    return {
        init,
        makeCall,
        hangup,
        toggleMute,
        toggleSettings,
        applySettings,
        show,
        hide,
        callCurrent,
        isReady: () => isRegistered
    };
})();
