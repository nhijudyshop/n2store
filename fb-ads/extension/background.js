// N2 FB Cookie Helper — Background Service Worker
// Multi-strategy EAAG token extraction

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

// =====================================================
// PERSISTENT STATE
// =====================================================
let state = {
    status: 'idle', step: 0, message: '', token: null, error: null, startedAt: null,
};

function setState(updates) {
    Object.assign(state, updates);
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {});
}

// =====================================================
// TOKEN CAPTURE via webRequest (Strategy A)
// =====================================================
let capturedToken = null;
let captureTabId = null;
let captureResolve = null;

function onTokenFound(token) {
    if (capturedToken) return; // already found
    capturedToken = token;
    console.log('[N2-EXT] Token captured:', token.substring(0, 20) + '...');
    if (captureResolve) {
        captureResolve(token);
        captureResolve = null;
    }
}

// Capture from URL params
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!captureTabId || details.tabId !== captureTabId) return;
        const match = details.url.match(/access_token=(EAAG[A-Za-z0-9_-]{20,})/);
        if (match) onTokenFound(match[1]);

        // Also check POST form body
        if (details.requestBody && details.requestBody.formData) {
            const fd = details.requestBody.formData;
            if (fd.access_token) {
                const t = Array.isArray(fd.access_token) ? fd.access_token[0] : fd.access_token;
                if (t && t.startsWith('EAAG')) onTokenFound(t);
            }
        }
    },
    {
        urls: [
            'https://graph.facebook.com/*',
            'https://*.facebook.com/*',
        ]
    },
    ['requestBody']
);

// Capture from request headers
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!captureTabId || details.tabId !== captureTabId) return;
        const authHeader = (details.requestHeaders || []).find(h => h.name.toLowerCase() === 'authorization');
        if (authHeader && authHeader.value) {
            const match = authHeader.value.match(/(EAAG[A-Za-z0-9_-]{20,})/);
            if (match) onTokenFound(match[1]);
        }
    },
    {
        urls: [
            'https://graph.facebook.com/*',
            'https://*.facebook.com/*',
        ]
    },
    ['requestHeaders']
);

// =====================================================
// MESSAGE HANDLER
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'auto-login') {
        doAutoLogin().then(r => sendResponse(r)).catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
    if (msg.action === 'get-state') {
        sendResponse(state);
        return false;
    }
    if (msg.action === 'reset') {
        setState({ status: 'idle', step: 0, message: '', token: null, error: null, startedAt: null });
        sendResponse({ ok: true });
        return false;
    }
});

// =====================================================
// AUTO-LOGIN FLOW
// =====================================================
async function doAutoLogin() {
    capturedToken = null;
    captureResolve = null;

    // Step 1: Check FB login
    setState({ status: 'working', step: 1, message: 'Kiểm tra đăng nhập Facebook...', startedAt: Date.now(), error: null });

    const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
    const cookieMap = {};
    (cookies || []).forEach(c => { cookieMap[c.name] = c.value; });

    if (!cookieMap['c_user'] || !cookieMap['xs']) {
        setState({ status: 'error', step: 1, message: 'Chưa đăng nhập Facebook', error: 'Hãy mở facebook.com và đăng nhập trước.' });
        return { success: false, error: 'Chưa đăng nhập Facebook' };
    }

    // Step 2: Open Ads Manager & extract token
    setState({ status: 'working', step: 2, message: 'Đang mở Ads Manager...' });

    let tab = null;
    try {
        // Open tab in FOREGROUND so JS executes fully (background tabs are throttled)
        tab = await chrome.tabs.create({ url: ADS_MANAGER_URL, active: true });
        captureTabId = tab.id;

        setState({ status: 'working', step: 2, message: 'Đang chờ Ads Manager load...' });

        // Race: webRequest capture vs script injection
        const token = await raceForToken(tab.id, 30000);

        // Close the Ads Manager tab
        try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }
        captureTabId = null;

        if (!token) {
            setState({ status: 'error', step: 2, message: 'Không tìm thấy token', error: 'Không bắt được EAAG token. Tài khoản có thể chưa có quyền Ads Manager.' });
            return { success: false, error: 'Không bắt được token' };
        }

        // Step 3: Open N2 Ads Manager
        setState({ status: 'working', step: 3, message: 'Đang đăng nhập N2 Ads Manager...', token });
        await openWithToken(token);
        setState({ status: 'success', step: 3, message: 'Đăng nhập thành công!' });
        return { success: true };

    } catch (error) {
        captureTabId = null;
        if (tab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
        setState({ status: 'error', step: 2, message: error.message, error: error.message });
        return { success: false, error: error.message };
    }
}

// =====================================================
// RACE: try multiple strategies in parallel
// =====================================================
function raceForToken(tabId, timeout) {
    if (capturedToken) return Promise.resolve(capturedToken);

    return new Promise((resolve) => {
        let done = false;
        const start = Date.now();

        // Set up resolve for webRequest capture
        captureResolve = (token) => {
            if (!done) { done = true; resolve(token); }
        };

        // Strategy B: periodically inject script to read JS globals
        let attempts = 0;
        const maxAttempts = 15;

        function tryInject() {
            if (done) return;
            attempts++;

            if (Date.now() - start > timeout || attempts > maxAttempts) {
                if (!done) { done = true; resolve(capturedToken); }
                return;
            }

            setState({ status: 'working', step: 2, message: `Đang tìm token... (${attempts}/${maxAttempts})` });

            // Inject into page's MAIN world to access FB JS globals
            chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => {
                    try {
                        // Strategy B1: Search known FB global variables
                        const globals = ['__accessToken', 'accessToken'];
                        for (const g of globals) {
                            if (window[g] && typeof window[g] === 'string' && window[g].startsWith('EAAG')) {
                                return window[g];
                            }
                        }

                        // Strategy B2: Search in require/module cache
                        if (window.require) {
                            try {
                                const token = window.require('AccessToken')?.getCurrentAccessToken?.();
                                if (token && token.startsWith('EAAG')) return token;
                            } catch (e) {}
                        }

                        // Strategy B3: Search in window.__comet_req or similar data stores
                        const json = JSON.stringify(window.__RELAY_STORE__ || {});
                        let m = json.match(/(EAAG[A-Za-z0-9_-]{50,})/);
                        if (m) return m[1];

                        return null;
                    } catch (e) { return null; }
                }
            }).then(results => {
                const token = results?.[0]?.result;
                if (token && !done) {
                    done = true;
                    capturedToken = token;
                    resolve(token);
                } else if (!done) {
                    // Also try ISOLATED world to parse HTML
                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: () => {
                            try {
                                const html = document.documentElement.innerHTML;
                                const patterns = [
                                    /"accessToken"\s*:\s*"(EAAG[^"]+)"/,
                                    /"access_token"\s*:\s*"(EAAG[^"]+)"/,
                                    /accessToken":"(EAAG[^"]+)"/,
                                    /(EAAG[A-Za-z0-9_-]{80,})/,
                                ];
                                for (const p of patterns) {
                                    const m = html.match(p);
                                    if (m && m[1]) return m[1];
                                }
                                return null;
                            } catch (e) { return null; }
                        }
                    }).then(r2 => {
                        const t2 = r2?.[0]?.result;
                        if (t2 && !done) {
                            done = true;
                            capturedToken = t2;
                            resolve(t2);
                        } else if (!done) {
                            setTimeout(tryInject, 2000);
                        }
                    }).catch(() => { if (!done) setTimeout(tryInject, 2000); });
                }
            }).catch(() => {
                if (!done) setTimeout(tryInject, 2000);
            });
        }

        // Start first injection after page has time to begin loading
        setTimeout(tryInject, 3000);
    });
}

// =====================================================
// OPEN N2 ADS MANAGER
// =====================================================
async function openWithToken(token) {
    const targetUrl = `${N2_ADS_URL}?auto_token=${encodeURIComponent(token)}`;
    const [existing] = await chrome.tabs.query({ url: N2_ADS_URL + '*' });
    if (existing) {
        await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    } else {
        await chrome.tabs.create({ url: targetUrl });
    }
}
