// N2 FB Cookie Helper — Popup
// Reads state from background worker, survives open/close

const REQUIRED_COOKIES = ['c_user', 'xs'];

// =====================================================
// INIT — restore state from background
// =====================================================
async function init() {
    // Ask background for current state
    chrome.runtime.sendMessage({ action: 'get-state' }, (bgState) => {
        if (bgState && bgState.status !== 'idle') {
            renderState(bgState);
        } else {
            checkFacebookLogin();
        }
    });

    // Listen for live state updates from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'state-update') {
            renderState(msg.state);
        }
    });
}

// =====================================================
// CHECK FB LOGIN
// =====================================================
async function checkFacebookLogin() {
    const statusEl = document.getElementById('status');
    const autoBtn = document.getElementById('autoLoginBtn');
    const copyBtn = document.getElementById('copyBtn');

    try {
        const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
        const cookieMap = {};
        (cookies || []).forEach(c => { cookieMap[c.name] = c.value; });

        const missing = REQUIRED_COOKIES.filter(name => !cookieMap[name]);
        if (missing.length > 0) {
            statusEl.className = 'status err';
            statusEl.innerHTML = '<span class="dot"></span> Chưa đăng nhập Facebook';
            autoBtn.textContent = 'Mở Facebook để đăng nhập';
            autoBtn.disabled = false;
            autoBtn.addEventListener('click', () => chrome.tabs.create({ url: 'https://www.facebook.com/' }));
            return;
        }

        // Logged in
        const userId = cookieMap['c_user'];
        statusEl.className = 'status ok';
        statusEl.innerHTML = '<span class="dot"></span> Đã đăng nhập Facebook';

        document.getElementById('userSection').style.display = '';
        document.getElementById('userAvatar').textContent = userId.charAt(0);
        document.getElementById('userIdDisplay').textContent = 'ID: ' + userId;
        document.getElementById('userNameDisplay').textContent = 'Facebook User';

        autoBtn.disabled = false;
        copyBtn.disabled = false;

        // Build cookie string for manual copy
        const parts = [];
        ['c_user', 'xs', 'datr', 'fr', 'sb'].forEach(n => {
            if (cookieMap[n]) parts.push(n + '=' + cookieMap[n]);
        });
        copyBtn.dataset.cookies = parts.join('; ');

    } catch (error) {
        statusEl.className = 'status err';
        statusEl.innerHTML = '<span class="dot"></span> Lỗi: ' + error.message;
    }
}

// =====================================================
// RENDER STATE from background
// =====================================================
function renderState(s) {
    const statusEl = document.getElementById('status');
    const autoBtn = document.getElementById('autoLoginBtn');
    const steps = document.getElementById('progressSteps');
    const userSection = document.getElementById('userSection');

    // Always show progress steps when not idle
    steps.style.display = '';
    userSection.style.display = 'none';

    // Update steps
    for (let i = 1; i <= 3; i++) {
        if (i < s.step) {
            setStep(i, 'done');
        } else if (i === s.step) {
            setStep(i, s.status === 'error' ? 'error' : s.status === 'success' ? 'done' : 'active');
        } else {
            setStep(i, 'pending');
        }
    }

    // Update status bar
    if (s.status === 'working') {
        statusEl.className = 'status loading';
        statusEl.innerHTML = '<span class="dot"></span> ' + s.message;
        autoBtn.disabled = true;
        autoBtn.innerHTML = '<span class="spinner"></span> ' + s.message;

        // Show elapsed time
        if (s.startedAt) {
            const elapsed = Math.round((Date.now() - s.startedAt) / 1000);
            statusEl.innerHTML += ' (' + elapsed + 's)';
        }
    } else if (s.status === 'success') {
        statusEl.className = 'status ok';
        statusEl.innerHTML = '<span class="dot"></span> Đăng nhập thành công!';
        autoBtn.className = 'btn btn-success btn-lg';
        autoBtn.textContent = '✅ Đăng nhập thành công!';
        autoBtn.disabled = true;

        // Auto reset after 5s
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'reset' });
            checkFacebookLogin();
            steps.style.display = 'none';
            autoBtn.className = 'btn btn-primary btn-lg';
            autoBtn.textContent = '🚀 Đăng nhập Ads Manager';
        }, 5000);
    } else if (s.status === 'error') {
        statusEl.className = 'status err';
        statusEl.innerHTML = '<span class="dot"></span> ' + (s.error || s.message);
        autoBtn.className = 'btn btn-primary btn-lg';
        autoBtn.textContent = '🔄 Thử lại';
        autoBtn.disabled = false;
    }
}

// =====================================================
// ACTIONS
// =====================================================
function handleAutoLogin() {
    const btn = document.getElementById('autoLoginBtn');
    const steps = document.getElementById('progressSteps');

    btn.disabled = true;
    steps.style.display = '';
    btn.innerHTML = '<span class="spinner"></span> Bắt đầu...';

    // Reset state first, then start
    chrome.runtime.sendMessage({ action: 'reset' }, () => {
        chrome.runtime.sendMessage({ action: 'auto-login' }, (response) => {
            // Response may arrive after popup closes — that's OK
            if (chrome.runtime.lastError) return;
            if (response) renderState(response.success
                ? { status: 'success', step: 3, message: 'Thành công!' }
                : { status: 'error', step: 2, message: response.error, error: response.error }
            );
        });
    });
}

function handleCopyCookies() {
    const btn = document.getElementById('copyBtn');
    const cookies = btn.dataset.cookies;
    if (!cookies) return;

    const textarea = document.createElement('textarea');
    textarea.value = cookies;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    textarea.remove();

    btn.className = 'btn btn-success';
    btn.textContent = '✅ Đã copy!';
    setTimeout(() => {
        btn.className = 'btn btn-outline';
        btn.textContent = '📋 Copy Cookies (thủ công)';
        btn.style.fontSize = '13px';
    }, 2000);
}

// =====================================================
// UI HELPERS
// =====================================================
function setStep(num, state) {
    const el = document.getElementById('step' + num);
    if (!el) return;
    el.className = 'step ' + state;
    const numEl = el.querySelector('.step-num');
    if (state === 'done') numEl.textContent = '✓';
    else if (state === 'error') numEl.textContent = '✗';
    else if (state === 'active') numEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>';
    else numEl.textContent = num;
}

// =====================================================
// BIND & INIT
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('autoLoginBtn').addEventListener('click', handleAutoLogin);
    document.getElementById('copyBtn').addEventListener('click', handleCopyCookies);
    init();
});
