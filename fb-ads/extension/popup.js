// N2 FB Cookie Helper — Popup
// Sends work to background service worker (popup can close anytime)

const REQUIRED_COOKIES = ['c_user', 'xs'];
let extractedCookies = '';

async function init() {
    const statusEl = document.getElementById('status');
    const autoBtn = document.getElementById('autoLoginBtn');
    const copyBtn = document.getElementById('copyBtn');

    try {
        const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
        if (!cookies || cookies.length === 0) {
            showNotLoggedIn(statusEl, autoBtn);
            return;
        }

        const cookieMap = {};
        cookies.forEach(c => { cookieMap[c.name] = c.value; });

        const missing = REQUIRED_COOKIES.filter(name => !cookieMap[name]);
        if (missing.length > 0) {
            showNotLoggedIn(statusEl, autoBtn);
            return;
        }

        // Build cookie string
        const parts = [];
        ['c_user', 'xs', 'datr', 'fr', 'sb'].forEach(name => {
            if (cookieMap[name]) parts.push(`${name}=${cookieMap[name]}`);
        });
        extractedCookies = parts.join('; ');

        // Show logged in state
        const userId = cookieMap['c_user'];
        statusEl.className = 'status ok';
        statusEl.innerHTML = '<span class="dot"></span> Đã đăng nhập Facebook';

        document.getElementById('userSection').style.display = '';
        document.getElementById('userAvatar').textContent = userId.charAt(0);
        document.getElementById('userIdDisplay').textContent = `ID: ${userId}`;
        document.getElementById('userNameDisplay').textContent = 'Facebook User';

        autoBtn.disabled = false;
        copyBtn.disabled = false;

    } catch (error) {
        statusEl.className = 'status err';
        statusEl.innerHTML = '<span class="dot"></span> Lỗi: ' + error.message;
    }
}

function showNotLoggedIn(statusEl, autoBtn) {
    statusEl.className = 'status err';
    statusEl.innerHTML = '<span class="dot"></span> Chưa đăng nhập Facebook';
    autoBtn.textContent = 'Mở Facebook để đăng nhập';
    autoBtn.disabled = false;
    // Re-bind to open Facebook instead of auto-login
    autoBtn.removeEventListener('click', handleAutoLogin);
    autoBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.facebook.com/' });
    });
}

function handleAutoLogin() {
    const btn = document.getElementById('autoLoginBtn');
    const steps = document.getElementById('progressSteps');

    btn.disabled = true;
    steps.style.display = '';
    setStep(1, 'done');
    setStep(2, 'active');
    btn.innerHTML = '<span class="spinner"></span> Đang lấy token...';

    // Send to background service worker (survives popup close)
    chrome.runtime.sendMessage({ action: 'auto-login' }, (response) => {
        if (chrome.runtime.lastError) {
            // Popup might close before response — that's OK, background handles it
            return;
        }
        if (response && response.success) {
            setStep(2, 'done');
            setStep(3, 'done');
            btn.className = 'btn btn-success btn-lg';
            btn.textContent = '✅ Đăng nhập thành công!';
        } else {
            setStep(2, 'error');
            btn.className = 'btn btn-primary btn-lg';
            btn.textContent = '❌ ' + (response?.error || 'Thất bại');
            btn.disabled = false;
        }
    });
}

function handleCopyCookies() {
    if (!extractedCookies) return;
    const btn = document.getElementById('copyBtn');

    const textarea = document.createElement('textarea');
    textarea.value = extractedCookies;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        btn.className = 'btn btn-success';
        btn.textContent = '✅ Đã copy cookies!';
        setTimeout(() => {
            btn.className = 'btn btn-outline';
            btn.textContent = '📋 Copy Cookies (thủ công)';
            btn.style.fontSize = '13px';
        }, 2000);
    } catch (e) { /* ignore */ }
    textarea.remove();
}

function setStep(num, state) {
    const el = document.getElementById('step' + num);
    if (!el) return;
    el.className = 'step ' + state;
    const numEl = el.querySelector('.step-num');
    if (state === 'done') numEl.textContent = '✓';
    else if (state === 'error') numEl.textContent = '✗';
    else if (state === 'active') numEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>';
}

// Bind events and init
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('autoLoginBtn').addEventListener('click', handleAutoLogin);
    document.getElementById('copyBtn').addEventListener('click', handleCopyCookies);
    init();
});
