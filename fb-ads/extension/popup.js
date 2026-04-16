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

        // Build cookie string — important cookies first
        const parts = [];
        USEFUL_COOKIES.forEach(name => {
            if (cookieMap[name]) {
                parts.push(`${name}=${cookieMap[name]}`);
            }
        });
        // Also include other cookies
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

        // Show preview (masked for security)
        preview.style.display = '';
        const maskedCookies = extractedCookies
            .replace(/(c_user=\d{3})\d+/g, '$1***')
            .replace(/(xs=.{6}).+?(;|$)/g, '$1***$2');
        preview.textContent = maskedCookies;

        // Enable copy button
        copyBtn.disabled = false;
        copyBtn.textContent = '📋 Copy Cookies';

    } catch (error) {
        statusEl.className = 'status err';
        statusEl.innerHTML = `<span class="dot"></span> Lỗi: ${error.message}`;
    }
}

function copyCookies() {
    if (!extractedCookies) return;
    const btn = document.getElementById('copyBtn');

    // Use textarea + execCommand as primary (most reliable in extension popup)
    const textarea = document.createElement('textarea');
    textarea.value = extractedCookies;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (e) {
        success = false;
    }
    textarea.remove();

    if (success) {
        btn.className = 'btn btn-success';
        btn.textContent = '✅ Đã copy! Paste vào Ads Manager';
        setTimeout(() => {
            btn.className = 'btn btn-primary';
            btn.textContent = '📋 Copy Cookies';
        }, 3000);
    } else {
        // Last resort: show full cookies for manual copy
        const preview = document.getElementById('cookiesPreview');
        preview.textContent = extractedCookies;
        preview.style.userSelect = 'all';
        preview.style.maxHeight = '200px';
        btn.textContent = '⚠ Hãy chọn toàn bộ text ở trên và Ctrl+C';
        btn.className = 'btn btn-outline';
    }
}

function openAdsManager() {
    // chrome.tabs.create works in Manifest V3 popup without extra permissions
    if (chrome && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: N2_ADS_URL });
    } else {
        // Fallback
        window.open(N2_ADS_URL, '_blank');
    }
}

// Init on load
document.addEventListener('DOMContentLoaded', init);
