// N2 FB Cookie Helper - Popup Script
// Extracts Facebook cookies for N2Store Ads Manager

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const REQUIRED_COOKIES = ['c_user', 'xs'];
const USEFUL_COOKIES = ['c_user', 'xs', 'datr', 'fr', 'sb'];

let extractedCookies = '';

async function init() {
    const statusEl = document.getElementById('status');
    const copyBtn = document.getElementById('copyBtn');
    const preview = document.getElementById('cookiesPreview');
    const userSection = document.getElementById('userSection');

    try {
        // Get all Facebook cookies
        const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });

        if (!cookies || cookies.length === 0) {
            statusEl.className = 'status err';
            statusEl.innerHTML = '<span class="dot"></span> Chưa đăng nhập Facebook. Hãy mở facebook.com và đăng nhập.';
            return;
        }

        // Build cookie string with useful cookies
        const cookieMap = {};
        cookies.forEach(c => { cookieMap[c.name] = c.value; });

        // Check required cookies
        const missing = REQUIRED_COOKIES.filter(name => !cookieMap[name]);
        if (missing.length > 0) {
            statusEl.className = 'status err';
            statusEl.innerHTML = `<span class="dot"></span> Thiếu cookie: ${missing.join(', ')}. Hãy đăng nhập Facebook.`;
            return;
        }

        // Build cookie string
        const parts = [];
        USEFUL_COOKIES.forEach(name => {
            if (cookieMap[name]) {
                parts.push(`${name}=${cookieMap[name]}`);
            }
        });
        // Also include any other cookies that might be needed
        cookies.forEach(c => {
            if (!USEFUL_COOKIES.includes(c.name) && c.name.length < 20) {
                parts.push(`${c.name}=${c.value}`);
            }
        });

        extractedCookies = parts.join('; ');

        // Show success
        const userId = cookieMap['c_user'];
        statusEl.className = 'status ok';
        statusEl.innerHTML = '<span class="dot"></span> Đã tìm thấy cookies Facebook!';

        // Show user info
        userSection.style.display = '';
        document.getElementById('userAvatar').textContent = userId.charAt(0);
        document.getElementById('userIdDisplay').textContent = `User ID: ${userId}`;

        // Show preview (masked)
        preview.style.display = '';
        const maskedCookies = extractedCookies.replace(/(c_user=\d{3})\d+/g, '$1***').replace(/(xs=.{6}).+?(;|$)/g, '$1***$2');
        preview.textContent = maskedCookies;

        // Enable copy button
        copyBtn.disabled = false;
        copyBtn.textContent = '📋 Copy Cookies';

    } catch (error) {
        statusEl.className = 'status err';
        statusEl.innerHTML = `<span class="dot"></span> Lỗi: ${error.message}`;
    }
}

async function copyCookies() {
    if (!extractedCookies) return;

    const btn = document.getElementById('copyBtn');

    try {
        await navigator.clipboard.writeText(extractedCookies);
        btn.className = 'btn btn-success';
        btn.textContent = '✅ Đã copy!';
        setTimeout(() => {
            btn.className = 'btn btn-primary';
            btn.textContent = '📋 Copy Cookies';
        }, 2000);
    } catch (e) {
        // Fallback: select text
        const textarea = document.createElement('textarea');
        textarea.value = extractedCookies;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();

        btn.className = 'btn btn-success';
        btn.textContent = '✅ Đã copy!';
        setTimeout(() => {
            btn.className = 'btn btn-primary';
            btn.textContent = '📋 Copy Cookies';
        }, 2000);
    }
}

function openAdsManager() {
    // chrome.tabs.create needs "tabs" permission — use window.open instead
    window.open(N2_ADS_URL, '_blank');
}

// Init on load
document.addEventListener('DOMContentLoaded', init);
