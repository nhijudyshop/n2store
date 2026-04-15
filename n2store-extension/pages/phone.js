// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Phone — JsSIP WebRTC Softphone
// Loads config from Render DB (phone_config), connects via Vultr WSS proxy → OnCallCX PBX

// === CONFIG ===
const RENDER_CONFIG_URL = 'https://n2store-fallback.onrender.com/api/oncall/phone-config';

// Fallback defaults (if DB unreachable)
const DEFAULTS = {
  ws_url: 'wss://45-76-155-207.sslip.io/ws',
  pbx_domain: 'pbx-ucaas.oncallcx.vn',
  metered_api_key: '61239134d00b315f4db5888a720950acc22d',
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
let dbConfig = null;

// === UI ELEMENTS ===
const statusEl = document.getElementById('status');
const callNameEl = document.getElementById('callName');
const callNumberEl = document.getElementById('callNumber');
const callTimerEl = document.getElementById('callTimer');
const phoneInput = document.getElementById('phoneInput');
const btnCall = document.getElementById('btnCall');
const btnHangup = document.getElementById('btnHangup');
const btnMute = document.getElementById('btnMute');
const remoteAudio = document.getElementById('remoteAudio');
const logSection = document.getElementById('logSection');

// === DB CONFIG ===
async function loadDBConfig() {
  try {
    const resp = await fetch(RENDER_CONFIG_URL);
    const data = await resp.json();
    if (data.success && data.config) {
      dbConfig = data.config;
      // Cache for offline
      chrome.storage.local.set({ phoneDbConfig: dbConfig });
      return dbConfig;
    }
  } catch {}
  // Fallback: cached
  try {
    const result = await chrome.storage.local.get('phoneDbConfig');
    if (result.phoneDbConfig) { dbConfig = result.phoneDbConfig; return dbConfig; }
  } catch {}
  return null;
}

function getWsUrl() { return dbConfig?.ws_url || DEFAULTS.ws_url; }
function getPbxDomain() { return dbConfig?.pbx_domain || DEFAULTS.pbx_domain; }
function getMeteredApiKey() { return dbConfig?.metered_api_key || DEFAULTS.metered_api_key; }
function getExtensions() { return dbConfig?.sip_extensions || DEFAULTS.sip_extensions; }

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  // Load DB config first
  await loadDBConfig();

  // Parse URL params (from orders-report click)
  const params = new URLSearchParams(window.location.search);
  const targetPhone = params.get('phone');
  const targetName = params.get('name');

  if (targetPhone) {
    phoneInput.value = targetPhone;
    if (targetName) callNameEl.textContent = decodeURIComponent(targetName);
  }


  // Load SIP credentials and connect
  await initPhone();

  // Auto-dial if phone number provided
  if (targetPhone && phone) {
    setTimeout(() => makeCall(), 1500);
  }

  // Dialpad buttons
  document.getElementById('dialpad').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) pressKey(btn.dataset.key);
  });

  // Action buttons
  btnCall.addEventListener('click', () => makeCall());
  btnHangup.addEventListener('click', () => hangup());
  btnMute.addEventListener('click', () => toggleMute());

  // Listen for messages from service worker (new call requests)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DIAL_NUMBER') {
      phoneInput.value = msg.phone || '';
      callNameEl.textContent = msg.customerName || '';
      if (msg.phone && phone) makeCall();
    }
  });

  // Enter key to call
  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && phoneInput.value.trim()) makeCall();
  });
});

// === PHONE INIT ===
async function initPhone() {
  try {
    // Try DB config extensions first
    const extensions = getExtensions();
    let sipExtension, sipAuthId, sipPassword;

    if (extensions && extensions.length > 0) {
      // Use first extension from DB (or match saved preference)
      const result = await chrome.storage.local.get('selectedExt');
      const preferred = result.selectedExt || extensions[0].ext;
      const ext = extensions.find(e => e.ext === preferred) || extensions[0];
      sipExtension = ext.ext;
      sipAuthId = ext.authId;
      sipPassword = ext.password;
      addLog(`Using ext ${sipExtension} from DB`, 'success');
    } else {
      // Fallback: extension storage settings
      const { settings } = await chrome.runtime.sendMessage({ type: 'GET_ONCALL_SETTINGS' });
      sipPassword = settings?.sipPassword;
      sipAuthId = settings?.sipAuthId;
      sipExtension = settings?.extension || '101';
    }

    if (!sipAuthId || !sipPassword) {
      setStatus('error', 'No SIP credentials');
      addLog('SIP credentials not configured. Check DB or Settings.', 'error');
      return;
    }

    const wsUrl = getWsUrl();
    const pbxDomain = getPbxDomain();

    addLog(`Connecting to ${wsUrl.includes('sslip') ? 'Vultr VPS' : 'Render'}...`);

    const socket = new JsSIP.WebSocketInterface(wsUrl);

    const configuration = {
      sockets: [socket],
      uri: `sip:${sipExtension}@${pbxDomain}`,
      authorization_user: sipAuthId,
      password: sipPassword,
      display_name: sipExtension,
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
      addLog('WebSocket disconnected', 'error');
    });
    phone.on('registered', () => {
      setStatus('registered', `Ext ${sipExtension}`);
      addLog(`Registered as ext ${sipExtension}`, 'success');
    });
    phone.on('unregistered', () => {
      setStatus('error', 'Unregistered');
      addLog('Unregistered from PBX', 'error');
    });
    phone.on('registrationFailed', (e) => {
      setStatus('error', 'Reg Failed');
      addLog(`Registration failed: ${e.cause}`, 'error');
    });

    // Incoming call
    phone.on('newRTCSession', (e) => {
      if (e.originator === 'remote') {
        const caller = e.session.remote_identity.uri.user;
        addLog(`Incoming call from ${caller}`);
        handleSession(e.session);
        e.session.answer({
            mediaConstraints: { audio: true, video: false },
            pcConfig: { iceServers: getIceServers() }
          });
        });
      }
    });

    phone.start();
    addLog('JsSIP UA starting...');

  } catch (err) {
    setStatus('error', 'Init Error');
    addLog(`Init error: ${err.message}`, 'error');
  }
}

// === MAKE CALL ===
async function makeCall() {
  const target = phoneInput.value.trim().replace(/[\s\-()]/g, '');
  if (!target || target.length < 3) {
    addLog('Invalid phone number', 'error');
    return;
  }
  if (!phone || !phone.isRegistered()) {
    addLog('Not registered with PBX', 'error');
    return;
  }
  if (currentSession) {
    addLog('Already in a call', 'error');
    return;
  }

  addLog(`Calling ${target}...`);
  callNumberEl.textContent = target;
  setStatus('calling', 'Calling...');

  const iceServers = getIceServers();
  const session = phone.call(`sip:${target}@${getPbxDomain()}`, {
    mediaConstraints: { audio: true, video: false },
    pcConfig: { iceServers, iceTransportPolicy: 'all' },
    rtcOfferConstraints: { offerToReceiveAudio: true },
    sessionTimersExpires: 120
  });

  handleSession(session);
}

// === HANDLE SESSION ===
function handleSession(session) {
  currentSession = session;
  btnCall.style.display = 'none';
  btnHangup.style.display = 'flex';
  btnMute.style.display = 'flex';

  session.on('progress', () => {
    setStatus('calling', 'Ringing...');
    addLog('Ringing...');
  });
  session.on('accepted', () => {
    setStatus('connected', 'Connected');
    addLog('Call connected', 'success');
    startTimer();
  });
  session.on('confirmed', () => attachRemoteAudio(session));
  session.on('ended', (e) => {
    addLog(`Call ended: ${e.cause}`);
    endCall();
  });
  session.on('failed', (e) => {
    addLog(`Call failed: ${e.cause}`, 'error');
    endCall();
  });
  session.on('peerconnection', (e) => {
    e.peerconnection.addEventListener('track', (event) => {
      if (event.track.kind === 'audio') {
        remoteAudio.srcObject = new MediaStream([event.track]);
        remoteAudio.play().catch(() => {});
        addLog('Remote audio attached', 'success');
      }
    });
  });

  // Log call to extension storage
  chrome.runtime.sendMessage({
    type: 'ADD_CALL_LOG',
    entry: {
      phone: phoneInput.value.trim(),
      customerName: callNameEl.textContent || '',
      timestamp: Date.now()
    }
  }).catch(() => {});
}

// === ATTACH REMOTE AUDIO ===
function attachRemoteAudio(session) {
  try {
    const pc = session.connection;
    if (!pc) return;
    pc.getReceivers().forEach(r => {
      if (r.track && r.track.kind === 'audio') {
        remoteAudio.srcObject = new MediaStream([r.track]);
        remoteAudio.play().catch(() => {});
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
  btnCall.style.display = 'flex';
  btnHangup.style.display = 'none';
  btnMute.style.display = 'none';
  btnMute.classList.remove('active');
  callTimerEl.style.display = 'none';
  callNameEl.textContent = '';
  callNumberEl.textContent = 'Ready';
  if (phone && phone.isRegistered()) {
    setStatus('registered', statusEl.textContent);
  } else {
    setStatus('error', 'Disconnected');
  }
}

// === TOGGLE MUTE ===
function toggleMute() {
  if (!currentSession) return;
  isMuted = !isMuted;
  if (currentSession.connection) {
    currentSession.connection.getSenders().forEach(s => {
      if (s.track && s.track.kind === 'audio') s.track.enabled = !isMuted;
    });
  }
  btnMute.classList.toggle('active', isMuted);
  btnMute.innerHTML = isMuted ? '&#128263;' : '&#128264;';
  addLog(isMuted ? 'Muted' : 'Unmuted');
}

// === DIALPAD ===
function pressKey(key) {
  phoneInput.value += key;
  phoneInput.focus();
  if (currentSession && currentSession.isEstablished()) {
    try { currentSession.sendDTMF(key); } catch {}
  }
}

// === TIMER ===
function startTimer() {
  callStartTime = Date.now();
  callTimerEl.style.display = 'block';
  callTimerEl.textContent = '00:00';
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    callTimerEl.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
}

// === ICE SERVERS (STUN only — fast, no TURN timeout delay) ===
function getIceServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
}

// === UI HELPERS ===
function setStatus(type, text) {
  statusEl.className = `phone-status ${type}`;
  statusEl.textContent = text;
}

function addLog(msg, type) {
  const entry = document.createElement('div');
  entry.className = `log-entry${type ? ' ' + type : ''}`;
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  entry.textContent = `[${time}] ${msg}`;
  logSection.appendChild(entry);
  logSection.scrollTop = logSection.scrollHeight;
}
