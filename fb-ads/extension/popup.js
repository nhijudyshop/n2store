// N2 FB Cookie Helper - Auto Token Extraction
// 1-click: extract EAAG token from Ads Manager → auto login

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';
const REQUIRED_COOKIES = ['c_user', 'xs'];

let extractedCookies = '';
let extractedToken = '';

function openFacebook() {
    chrome.tabs.create({ url: 'https://www.facebook.com/' });
}

// =====================================================
// INIT — check if user is logged into Facebook
// =====================================================
async function init() {
    const statusEl = document.getElementById('status');
    const autoBtn = document.getElementById('autoLoginBtn');
    const copyBtn = document.getElementById('copyBtn');

    try {
        const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
        if (!cookies || cookies.length === 0) {
            statusEl.className = 'status err';
            statusEl.innerHTML = '<span class="dot"></span> Chưa đăng nhập Facebook';
            autoBtn.textContent = 'Mở Facebook để đăng nhập';
            autoBtn.disabled = false;
            autoBtn.removeEventListener('click', autoLogin);
            autoBtn.addEventListener('click', openFacebook);
            return;
        }

        const cookieMap = {};
        cookies.forEach(c => { cookieMap[c.name] = c.value; });

        const missing = REQUIRED_COOKIES.filter(name => !cookieMap[name]);
        if (missing.length > 0) {
            statusEl.className = 'status err';
            statusEl.innerHTML = '<span class="dot"></span> Chưa đăng nhập Facebook';
            autoBtn.textContent = 'Mở Facebook để đăng nhập';
            autoBtn.disabled = false;
            autoBtn.removeEventListener('click', autoLogin);
            autoBtn.addEventListener('click', openFacebook);
            return;
        }

        // Build cookie string
        const parts = [];
        ['c_user', 'xs', 'datr', 'fr', 'sb'].forEach(name => {
            if (cookieMap[name]) parts.push(`${name}=${cookieMap[name]}`);
        });
        cookies.forEach(c => {
            if (!['c_user', 'xs', 'datr', 'fr', 'sb'].includes(c.name) && c.name.length < 20) {
                parts.push(`${c.name}=${c.value}`);
            }
        });
        extractedCookies = parts.join('; ');

        // Show user info
        const userId = cookieMap['c_user'];
        statusEl.className = 'status ok';
        statusEl.innerHTML = '<span class="dot"></span> Đã đăng nhập Facebook';

        const userSection = document.getElementById('userSection');
        userSection.style.display = '';
        document.getElementById('userAvatar').textContent = userId.charAt(0);
        document.getElementById('userIdDisplay').textContent = `ID: ${userId}`;

        // Try to get user name from existing FB tab
        try {
            const [fbTab] = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
            if (fbTab) {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: fbTab.id },
                    func: () => {
                        const el = document.querySelector('[data-pagelet="ProfileTilesFeed_0"] h1') ||
                                   document.querySelector('span[dir="auto"]') ||
                                   document.querySelector('[aria-label="Your profile"]');
                        return el ? el.textContent : null;
                    }
                });
                if (results?.[0]?.result) {
                    document.getElementById('userNameDisplay').textContent = results[0].result;
                }
            }
        } catch (e) { /* ignore */ }

        if (!document.getElementById('userNameDisplay').textContent) {
            document.getElementById('userNameDisplay').textContent = `Facebook User`;
        }

        // Enable buttons
        autoBtn.disabled = false;
        copyBtn.disabled = false;

    } catch (error) {
        statusEl.className = 'status err';
        statusEl.innerHTML = `<span class="dot"></span> Lỗi: ${error.message}`;
    }
}

// =====================================================
// AUTO LOGIN — 1-click extract token & login
// =====================================================
async function autoLogin() {
    const btn = document.getElementById('autoLoginBtn');
    const steps = document.getElementById('progressSteps');
    btn.disabled = true;
    steps.style.display = '';

    // Step 1: Check FB login (already done)
    setStep(1, 'done');
    setStep(2, 'active');
    btn.innerHTML = '<span class="spinner"></span> Đang lấy token...';

    let tab = null;
    try {
        // Step 2: Open Ads Manager in background tab & extract token
        tab = await chrome.tabs.create({ url: ADS_MANAGER_URL, active: false });

        // Wait for page to fully load (with timeout)
        const token = await waitForToken(tab.id, 25000);

        if (tab) {
            try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }
        }

        if (!token) {
            setStep(2, 'error');
            btn.textContent = '❌ Không tìm thấy token';
            btn.disabled = false;
            // retry is already bound via addEventListener

            // Show fallback
            setTimeout(() => {
                btn.innerHTML = '🔄 Thử lại';
                // retry is already bound via addEventListener
            }, 2000);
            return;
        }

        extractedToken = token;
        setStep(2, 'done');
        setStep(3, 'active');
        btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';

        // Step 3: Open N2 Ads Manager with token
        const targetUrl = `${N2_ADS_URL}?auto_token=${encodeURIComponent(token)}`;

        // Check if fb-ads tab is already open
        const [existingTab] = await chrome.tabs.query({ url: N2_ADS_URL + '*' });
        if (existingTab) {
            await chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
        } else {
            await chrome.tabs.create({ url: targetUrl });
        }

        setStep(3, 'done');
        btn.className = 'btn btn-success btn-lg';
        btn.textContent = '✅ Đăng nhập thành công!';

    } catch (error) {
        if (tab) {
            try { await chrome.tabs.remove(tab.id); } catch (e) { /* ignore */ }
        }
        setStep(2, 'error');
        btn.textContent = '❌ ' + error.message;
        btn.disabled = false;
        setTimeout(() => {
            btn.className = 'btn btn-primary btn-lg';
            btn.innerHTML = '🔄 Thử lại';
            // retry is already bound via addEventListener
        }, 2000);
    }
}

/**
 * Wait for Ads Manager tab to load and extract EAAG token
 * Retries multiple times with delays
 */
function waitForToken(tabId, timeout) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let resolved = false;
        let attempts = 0;
        const maxAttempts = 12;

        function tryExtract() {
            if (resolved) return;
            attempts++;

            if (Date.now() - startTime > timeout || attempts > maxAttempts) {
                resolved = true;
                resolve(null);
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    try {
                        const html = document.documentElement.innerHTML;
                        // Look for EAAG token patterns
                        const patterns = [
                            /\"accessToken\"\s*:\s*\"(EAAG[^\"]+)\"/,
                            /\"access_token\"\s*:\s*\"(EAAG[^\"]+)\"/,
                            /access_token=(EAAG[^&\"\'\\]+)/,
                            /[\"\\s](EAAG[A-Za-z0-9]{50,})/,
                        ];
                        for (const p of patterns) {
                            const m = html.match(p);
                            if (m && m[1]) return m[1];
                        }
                        // Also check all script tags
                        const scripts = document.querySelectorAll('script');
                        for (const s of scripts) {
                            const text = s.textContent || '';
                            for (const p of patterns) {
                                const m = text.match(p);
                                if (m && m[1]) return m[1];
                            }
                        }
                        return null;
                    } catch (e) {
                        return null;
                    }
                }
            }).then(results => {
                const token = results?.[0]?.result;
                if (token && !resolved) {
                    resolved = true;
                    resolve(token);
                } else if (!resolved) {
                    // Retry after delay
                    setTimeout(tryExtract, 2000);
                }
            }).catch(() => {
                // Tab might not be ready yet, retry
                if (!resolved) {
                    setTimeout(tryExtract, 2000);
                }
            });
        }

        // Start first attempt after a short delay for page to begin loading
        setTimeout(tryExtract, 3000);
    });
}

// =====================================================
// COPY COOKIES (manual fallback)
// =====================================================
function copyCookies() {
    if (!extractedCookies) return;
    const btn = document.getElementById('copyBtn');

    const textarea = document.createElement('textarea');
    textarea.value = extractedCookies;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let success = false;
    try { success = document.execCommand('copy'); } catch (e) { success = false; }
    textarea.remove();

    if (success) {
        btn.className = 'btn btn-success';
        btn.textContent = '✅ Đã copy cookies!';
        setTimeout(() => {
            btn.className = 'btn btn-outline';
            btn.textContent = '📋 Copy Cookies (thủ công)';
            btn.style.fontSize = '13px';
        }, 2000);
    }
}

// =====================================================
// UI HELPERS
// =====================================================
function setStep(num, state) {
    const el = document.getElementById(`step${num}`);
    el.className = `step ${state}`;
    const numEl = el.querySelector('.step-num');
    if (state === 'done') numEl.textContent = '✓';
    else if (state === 'error') numEl.textContent = '✗';
    else if (state === 'active') numEl.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>';
}

// Init on load — bind all event listeners (no inline onclick allowed in MV3)
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('autoLoginBtn').addEventListener('click', autoLogin);
    document.getElementById('copyBtn').addEventListener('click', copyCookies);
    init();
});
