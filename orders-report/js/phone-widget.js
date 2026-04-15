// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Widget — Standalone WebRTC softphone for orders-report
// Uses JsSIP → OnCallCX PBX via Vultr WSS proxy

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

    // === STATE ===
    let phone = null;
    let currentSession = null;
    let callTimerInterval = null;
    let callStartTime = null;
    let isMuted = false;
    let isRegistered = false;
    let widgetEl = null;
    let fabEl = null;
    let dbConfig = null;
    let config = loadConfig();

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

    // === CREATE UI ===
    function createWidget() {
        if (widgetEl) return;

        const extensions = getExtensions();
        const extOpts = extensions.map(e =>
            `<option value="${e.ext}" ${config.extension === e.ext ? 'selected' : ''}>${e.label || 'Ext ' + e.ext}</option>`
        ).join('') + '<option value="_custom">Tuy chinh...</option>';

        const html = `
        <div id="phoneWidget" class="pw hidden">
            <div class="pw-head" id="pwHead">
                <span class="pw-title">N2Store Phone</span>
                <span class="pw-status" id="pwStatus">Offline</span>
                <button class="pw-hi" onclick="PhoneWidget.toggleSettings()" title="Cai dat">&#9881;</button>
                <button class="pw-hi" onclick="PhoneWidget.toggleMinimize()" title="Thu nho" id="pwMinBtn">&#9472;</button>
                <button class="pw-hi" onclick="PhoneWidget.hide()" title="Dong">&times;</button>
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
                        <div class="pw-f"><label>Password</label><input id="pwPassInput" type="password" value="${config.password}"></div>
                    </div>
                    <button class="pw-save" onclick="PhoneWidget.applySettings()">Ket noi</button>
                </div>

                <!-- Dial input -->
                <div class="pw-dial">
                    <div class="pw-name" id="pwName"></div>
                    <input type="tel" id="pwDialInput" class="pw-dial-input" placeholder="Nhap so dien thoai..." autocomplete="off">
                    <div class="pw-timer" id="pwTimer" style="display:none">00:00</div>
                </div>

                <!-- Dialpad -->
                <div class="pw-pad" id="pwPad">
                    <button onclick="PhoneWidget.press('1')">1</button>
                    <button onclick="PhoneWidget.press('2')">2<small>ABC</small></button>
                    <button onclick="PhoneWidget.press('3')">3<small>DEF</small></button>
                    <button onclick="PhoneWidget.press('4')">4<small>GHI</small></button>
                    <button onclick="PhoneWidget.press('5')">5<small>JKL</small></button>
                    <button onclick="PhoneWidget.press('6')">6<small>MNO</small></button>
                    <button onclick="PhoneWidget.press('7')">7<small>PQRS</small></button>
                    <button onclick="PhoneWidget.press('8')">8<small>TUV</small></button>
                    <button onclick="PhoneWidget.press('9')">9<small>WXYZ</small></button>
                    <button onclick="PhoneWidget.press('*')">*</button>
                    <button onclick="PhoneWidget.press('0')">0<small>+</small></button>
                    <button onclick="PhoneWidget.press('#')">#</button>
                </div>

                <!-- Actions -->
                <div class="pw-actions">
                    <button class="pw-btn pw-mute" id="pwMute" onclick="PhoneWidget.toggleMute()" style="display:none" title="Tat tieng">&#128263;</button>
                    <button class="pw-btn pw-call" id="pwCall" onclick="PhoneWidget.dialFromInput()" title="Goi">&#128222;</button>
                    <button class="pw-btn pw-hang" id="pwHangup" onclick="PhoneWidget.hangup()" style="display:none" title="Ngat">&#128308;</button>
                    <button class="pw-btn pw-del" id="pwDel" onclick="PhoneWidget.backspace()" title="Xoa">&#9003;</button>
                </div>

                <!-- Log -->
                <div class="pw-log" id="pwLog"></div>
            </div>
            <audio id="pwRemoteAudio" autoplay></audio>
        </div>`;

        const style = document.createElement('style');
        style.textContent = `
        /* FAB */
        .pw-fab{position:fixed;bottom:20px;right:80px;z-index:99998;width:48px;height:48px;border-radius:50%;
            background:linear-gradient(135deg,#4caf50,#2e7d32);color:#fff;border:none;font-size:22px;
            cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;
            transition:transform 0.2s}
        .pw-fab:hover{transform:scale(1.1)}
        .pw-fab.active{background:linear-gradient(135deg,#f44336,#c62828)}

        /* Widget */
        .pw{position:fixed;bottom:80px;right:20px;z-index:99999;width:280px;background:#1a1a2e;border-radius:14px;
            box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden}
        .pw.hidden{display:none}
        .pw.minimized #pwBody{display:none}

        /* Header */
        .pw-head{display:flex;align-items:center;padding:8px 12px;background:#16213e;gap:6px;cursor:move;user-select:none}
        .pw-title{font-size:12px;font-weight:600;color:#8be9fd;flex:1}
        .pw-status{font-size:9px;padding:2px 7px;border-radius:10px;background:#333;color:#888}
        .pw-status.registered{background:#1b4332;color:#4caf50}
        .pw-status.calling{background:#3d2c00;color:#ff9800}
        .pw-status.connected{background:#1b4332;color:#4caf50;animation:pw-p 1.5s infinite}
        .pw-status.error{background:#3d1212;color:#f44336}
        @keyframes pw-p{0%,100%{opacity:1}50%{opacity:.6}}
        .pw-hi{background:none;border:none;color:#556;font-size:14px;cursor:pointer;padding:0 3px;line-height:1}
        .pw-hi:hover{color:#8be9fd}

        /* Settings */
        .pw-settings{padding:8px 12px;background:#111827;border-bottom:1px solid #333}
        .pw-f{margin-bottom:6px}
        .pw-f label{display:block;font-size:9px;color:#888;margin-bottom:1px;text-transform:uppercase;letter-spacing:.5px}
        .pw-f input,.pw-f select{width:100%;box-sizing:border-box;padding:5px 7px;background:#1e293b;border:1px solid #334155;
            border-radius:5px;color:#e2e8f0;font-size:11px;font-family:monospace;outline:none}
        .pw-f input:focus,.pw-f select:focus{border-color:#8be9fd}
        .pw-save{width:100%;padding:5px;background:#4caf50;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;margin-top:4px}
        .pw-save:hover{background:#388e3c}

        /* Dial input */
        .pw-dial{padding:10px 12px 4px;text-align:center}
        .pw-name{font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;min-height:16px}
        .pw-dial-input{width:100%;box-sizing:border-box;background:transparent;border:none;border-bottom:2px solid #334155;
            color:#8be9fd;font-size:20px;font-family:monospace;text-align:center;padding:6px 0;outline:none;letter-spacing:2px}
        .pw-dial-input:focus{border-bottom-color:#8be9fd}
        .pw-dial-input::placeholder{color:#444;font-size:13px;letter-spacing:0}
        .pw-timer{font-size:20px;font-weight:300;color:#ccc;margin-top:4px;font-family:monospace}

        /* Dialpad */
        .pw-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px 12px}
        .pw-pad button{background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;
            font-size:16px;padding:8px 0;cursor:pointer;transition:background .1s;position:relative}
        .pw-pad button:hover{background:#334155}
        .pw-pad button:active{background:#4caf50;color:#fff}
        .pw-pad button small{display:block;font-size:7px;color:#556;letter-spacing:1px;margin-top:-2px}

        /* Actions */
        .pw-actions{display:flex;gap:10px;justify-content:center;padding:8px 12px}
        .pw-btn{width:44px;height:44px;border:none;border-radius:50%;font-size:18px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;transition:all .15s}
        .pw-call{background:#4caf50;color:#fff}.pw-call:hover{background:#388e3c}
        .pw-hang{background:#f44336;color:#fff}.pw-hang:hover{background:#d32f2f}
        .pw-mute{background:#333;color:#ccc}.pw-mute:hover{background:#444}.pw-mute.active{background:#f44336;color:#fff}
        .pw-del{background:#1e293b;color:#888;font-size:16px}.pw-del:hover{background:#334155;color:#fff}

        /* Log */
        .pw-log{max-height:60px;overflow-y:auto;font-size:8px;color:#555;font-family:monospace;
            background:#0d1117;padding:4px 6px;margin:0 10px 8px;border-radius:4px}
        .pw-log .error{color:#f44336}.pw-log .success{color:#4caf50}
        .pw-log::-webkit-scrollbar{width:2px}.pw-log::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        `;
        document.head.appendChild(style);

        // FAB button
        if (!fabEl) {
            fabEl = document.createElement('button');
            fabEl.className = 'pw-fab';
            fabEl.innerHTML = '&#128222;';
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
        document.getElementById('pwMinBtn').innerHTML = widgetEl.classList.contains('minimized') ? '&#9723;' : '&#9472;';
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
        if (!ext || !authId || !password) { addLog('Thieu thong tin', 'error'); return; }
        config = { wsUrl: getWsUrl(), extension: ext, authId, password };
        saveConfig();
        disconnect(); toggleSettings(); init();
    }

    function disconnect() {
        if (currentSession) { try { currentSession.terminate(); } catch {} currentSession = null; }
        if (phone) { try { phone.stop(); } catch {} phone = null; }
        isRegistered = false; isMuted = false; stopTimer();
    }

    // === INIT JSSIP ===
    async function init() {
        if (phone) return;
        if (!dbConfig) await loadFromDB();
        if (!config.wsUrl) config.wsUrl = getWsUrl();
        createWidget();
        try {
            addLog('Connecting...');
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
            phone.on('disconnected', () => { setStatus('error', 'Disconnected'); isRegistered = false; });
            phone.on('registered', () => { setStatus('registered', `Ext ${config.extension}`); isRegistered = true; addLog(`Registered ext ${config.extension}`, 'success'); });
            phone.on('unregistered', () => { setStatus('error', 'Unregistered'); isRegistered = false; });
            phone.on('registrationFailed', (e) => { setStatus('error', 'Reg Failed'); isRegistered = false; addLog(`Reg failed: ${e.cause}`, 'error'); });
            phone.on('newRTCSession', (e) => { if (e.originator === 'remote') handleIncoming(e.session); });
            phone.start();
        } catch (err) { setStatus('error', 'Init Error'); addLog(`Error: ${err.message}`, 'error'); }
    }

    function handleIncoming(session) {
        show();
        const caller = session.remote_identity.uri.user;
        addLog(`Incoming: ${caller}`);
        document.getElementById('pwName').textContent = '';
        document.getElementById('pwDialInput').value = caller;
        handleSession(session);
        session.answer({ mediaConstraints: { audio: true, video: false }, pcConfig: { iceServers: getIceServers() } });
    }

    // === DIAL ===
    function dialFromInput() {
        const input = document.getElementById('pwDialInput');
        const num = input ? input.value.trim() : '';
        if (num && num.length >= 3) makeCall(num, '');
    }
    function press(key) {
        const input = document.getElementById('pwDialInput');
        if (input) { input.value += key; input.focus(); }
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
        document.getElementById('pwName').textContent = customerName || '';
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
            addLog('Mic bi chan! Cho phep Microphone trong trinh duyet', 'error');
            setStatus('error', 'Mic blocked');
            pendingCall = null; return;
        }
        addLog(`Calling ${target}...`);
        setStatus('calling', 'Calling...');
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
        document.getElementById('pwCall').style.display = 'none';
        document.getElementById('pwDel').style.display = 'none';
        document.getElementById('pwPad').style.display = 'none';
        document.getElementById('pwHangup').style.display = 'flex';
        document.getElementById('pwMute').style.display = 'flex';
        session.on('progress', () => { setStatus('calling', 'Ringing...'); addLog('Ringing...'); });
        session.on('accepted', () => { setStatus('connected', 'Connected'); addLog('Connected', 'success'); startTimer(); });
        session.on('confirmed', () => attachAudio(session));
        session.on('ended', (e) => { addLog(`Ended: ${e.cause}`); endCall(); });
        session.on('failed', (e) => { addLog(`Failed: ${e.cause}`, 'error'); endCall(); });
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

    function hangup() { if (currentSession) { try { currentSession.terminate(); } catch {} } endCall(); }
    function endCall() {
        currentSession = null; isMuted = false; stopTimer();
        document.getElementById('pwCall').style.display = 'flex';
        document.getElementById('pwDel').style.display = 'flex';
        document.getElementById('pwPad').style.display = 'grid';
        document.getElementById('pwHangup').style.display = 'none';
        document.getElementById('pwMute').style.display = 'none';
        document.getElementById('pwMute').classList.remove('active');
        document.getElementById('pwTimer').style.display = 'none';
        document.getElementById('pwName').textContent = '';
        document.getElementById('pwDialInput').value = '';
        if (isRegistered) setStatus('registered', `Ext ${config.extension}`);
    }

    function toggleMute() {
        if (!currentSession) return;
        isMuted = !isMuted;
        if (currentSession.connection) currentSession.connection.getSenders().forEach(s => { if (s.track?.kind === 'audio') s.track.enabled = !isMuted; });
        const btn = document.getElementById('pwMute');
        btn.classList.toggle('active', isMuted);
        btn.innerHTML = isMuted ? '&#128263;' : '&#128264;';
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

    function setStatus(t, text) { const el = document.getElementById('pwStatus'); if (el) { el.className = `pw-status ${t}`; el.textContent = text; } }
    function addLog(msg, type) {
        const log = document.getElementById('pwLog'); if (!log) return;
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const div = document.createElement('div'); if (type) div.className = type;
        div.textContent = `[${time}] ${msg}`; log.appendChild(div); log.scrollTop = log.scrollHeight;
    }

    // === AUTO-INIT ===
    if (config.extension && config.authId && config.password) {
        setTimeout(() => init(), 3000);
    }

    return {
        init, makeCall, hangup, toggleMute, toggleSettings, applySettings, onExtChange,
        show, hide, toggle, toggleMinimize, dialFromInput, press, backspace,
        callCurrent: dialFromInput, isReady: () => isRegistered
    };
})();
