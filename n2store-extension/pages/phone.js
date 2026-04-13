// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// N2Store Phone — JsSIP WebRTC Softphone
// Connects to Render SIP proxy via WebSocket, makes calls via OnCallCX PBX

// === CONFIG ===
const RENDER_WS_URL = 'wss://n2store-fallback.onrender.com/api/oncall/ws';
const RENDER_API_URL = 'https://n2store-fallback.onrender.com/api/oncall';
const PBX_DOMAIN = 'pbx-ucaas.oncallcx.vn';

// === STATE ===
let phone = null;
let currentSession = null;
let localStream = null;
let callTimerInterval = null;
let callStartTime = null;
let isMuted = false;

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

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
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
    setTimeout(() => makeCall(), 1500); // Wait for registration
  }

  // Dialpad buttons
  document.getElementById('dialpad').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key]');
    if (btn) pressKey(btn.dataset.key);
  });

  // Action buttons
  document.getElementById('btnCall').addEventListener('click', () => makeCall());
  document.getElementById('btnHangup').addEventListener('click', () => hangup());
  document.getElementById('btnMute').addEventListener('click', () => toggleMute());

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
    // Load SIP credentials from extension storage
    const { settings } = await chrome.runtime.sendMessage({ type: 'GET_ONCALL_SETTINGS' });
    const sipPassword = settings?.sipPassword;
    const sipAuthId = settings?.sipAuthId;
    const sipExtension = settings?.extension || '101';

    if (!sipAuthId || !sipPassword) {
      setStatus('error', 'No SIP credentials');
      addLog('SIP credentials not configured. Go to Settings > OnCallCX.', 'error');
      return;
    }

    // Fetch TURN/ICE servers from metered.ca API
    let iceServers = await fetchIceServers();

    addLog(`Connecting to ${RENDER_WS_URL}...`);

    // Create JsSIP WebSocket
    const socket = new JsSIP.WebSocketInterface(RENDER_WS_URL);

    // Create JsSIP UA
    const configuration = {
      sockets: [socket],
      uri: `sip:${sipExtension}@${PBX_DOMAIN}`,
      authorization_user: sipAuthId,
      password: sipPassword,
      display_name: sipExtension,
      register: true,
      register_expires: 120,
      session_timers: false,
      connection_recovery_min_interval: 2,
      connection_recovery_max_interval: 30,
      no_answer_timeout: 30
    };

    phone = new JsSIP.UA(configuration);

    // === UA Events ===
    phone.on('connected', () => {
      addLog('WebSocket connected', 'success');
    });

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
      const session = e.session;

      if (session.direction === 'incoming') {
        addLog(`Incoming call from ${session.remote_identity.uri.user}`);
        // Auto-answer for now (can add UI later)
        handleSession(session);
        session.answer({
          mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers }
        });
      }
    });

    // Debug: log all SIP traffic
    phone.on('newRTCSession', (e) => {
      addLog(`newRTCSession: ${e.session.direction} ${e.request?.method || ''}`, 'success');
    });

    // Attach WebSocket interceptor AFTER connection (socket._ws only exists after connect)
    phone.on('connected', () => {
      const rawWs = socket._ws;
      if (rawWs && !rawWs._n2intercepted) {
        rawWs._n2intercepted = true;

        const origOnMsg = rawWs.onmessage;
        rawWs.onmessage = function(evt) {
          if (typeof evt.data === 'string') {
            const first = evt.data.substring(0, 50);
            if (!first.includes('REGISTER')) {
              addLog(`← PBX: ${first.replace(/\r\n/g, ' | ')}`);
              console.log('=== PBX RESPONSE ===\n' + evt.data.substring(0, 1500));
            }
          }
          if (origOnMsg) origOnMsg.call(this, evt);
        };

        const origSend = rawWs.send.bind(rawWs);
        rawWs.send = function(data) {
          if (typeof data === 'string') {
            if (data.startsWith('INVITE ')) {
              addLog(`→ PBX: INVITE sent (${data.length} bytes)`);
              console.log('=== SIP INVITE ===\n' + data.substring(0, 2000));
            } else if (data.startsWith('ACK ') || data.startsWith('CANCEL ') || data.startsWith('BYE ')) {
              addLog(`→ PBX: ${data.substring(0, 30)}`);
            }
          }
          return origSend(data);
        };
        addLog('SIP traffic interceptor attached', 'success');
      }
    });

    // Start
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

  // Fetch TURN/ICE servers
  let iceServers = await fetchIceServers();

  const options = {
    mediaConstraints: { audio: true, video: false },
    pcConfig: { iceServers },
    rtcOfferConstraints: { offerToReceiveAudio: true }
  };

  const session = phone.call(`sip:${target}@${PBX_DOMAIN}`, options);
  handleSession(session);
}

// === HANDLE SESSION ===
function handleSession(session) {
  currentSession = session;

  // Show hangup/mute buttons
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

  session.on('confirmed', () => {
    // Attach remote audio
    attachRemoteAudio(session);
  });

  session.on('ended', (e) => {
    addLog(`Call ended: ${e.cause}`);
    endCall();
  });

  session.on('failed', (e) => {
    addLog(`Call failed: ${e.cause}`, 'error');
    endCall();
  });

  // Handle remote track (audio from PBX)
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
    const receivers = pc.getReceivers();
    receivers.forEach(receiver => {
      if (receiver.track && receiver.track.kind === 'audio') {
        remoteAudio.srcObject = new MediaStream([receiver.track]);
        remoteAudio.play().catch(() => {});
      }
    });
  } catch (e) {
    addLog(`Audio attach error: ${e.message}`, 'error');
  }
}

// === HANGUP ===
function hangup() {
  if (currentSession) {
    try { currentSession.terminate(); } catch {}
  }
  endCall();
}

// === END CALL (cleanup) ===
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
    const ext = phoneInput.value ? '' : '';
    setStatus('registered', statusEl.textContent.includes('Ext') ? statusEl.textContent : 'Ready');
  } else {
    setStatus('error', 'Disconnected');
  }
}

// === TOGGLE MUTE ===
function toggleMute() {
  if (!currentSession) return;

  isMuted = !isMuted;

  if (currentSession.connection) {
    currentSession.connection.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = !isMuted;
      }
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

  // Send DTMF if in call
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
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    callTimerEl.textContent = `${min}:${sec}`;
  }, 1000);
}

function stopTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
}

// === ICE/TURN SERVERS ===
const METERED_API_KEY = '61239134d00b315f4db5888a720950acc22d';

async function fetchIceServers() {
  try {
    const resp = await fetch(`https://n2store.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
    const servers = await resp.json();
    if (Array.isArray(servers) && servers.length > 0) {
      addLog(`ICE servers loaded: ${servers.length} entries`, 'success');
      return servers;
    }
  } catch (e) {
    addLog('TURN fetch failed, using STUN only', 'error');
  }
  return [{ urls: 'stun:stun.l.google.com:19302' }];
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
