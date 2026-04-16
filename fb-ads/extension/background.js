// N2 FB Cookie Helper — Background Service Worker
// Captures EAAG token from Facebook network requests

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

// =====================================================
// PERSISTENT STATE — survives popup open/close
// =====================================================
let state = {
    status: 'idle',    // idle | working | success | error
    step: 0,           // 0=not started, 1=checking, 2=extracting, 3=logging-in
    message: '',
    token: null,
    error: null,
    startedAt: null,
};

function setState(updates) {
    Object.assign(state, updates);
    // Notify any open popup
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {});
}

// =====================================================
// TOKEN CAPTURE via webRequest
// =====================================================
let capturedToken = null;
let captureTabId = null;
let captureResolve = null;

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!captureTabId || details.tabId !== captureTabId) return;

        const url = details.url;
        const match = url.match(/access_token=(EAAG[A-Za-z0-9_-]{20,})/);
        if (match && match[1] && !capturedToken) {
            console.log('[N2-EXT] Token captured!');
            capturedToken = match[1];
            if (captureResolve) {
                captureResolve(capturedToken);
                captureResolve = null;
            }
        }
    },
    {
        urls: [
            'https://graph.facebook.com/*',
            'https://*.facebook.com/*',
        ]
    }
);

// =====================================================
// MESSAGE HANDLER
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'auto-login') {
        doAutoLogin()
            .then(r => sendResponse(r))
            .catch(e => sendResponse({ success: false, error: e.message }));
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

    // Step 1
    setState({ status: 'working', step: 1, message: 'Kiểm tra đăng nhập Facebook...', startedAt: Date.now(), error: null });

    const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
    const cookieMap = {};
    (cookies || []).forEach(c => { cookieMap[c.name] = c.value; });

    if (!cookieMap['c_user'] || !cookieMap['xs']) {
        setState({ status: 'error', step: 1, message: 'Chưa đăng nhập Facebook', error: 'Hãy mở facebook.com và đăng nhập trước.' });
        return { success: false, error: 'Chưa đăng nhập Facebook' };
    }

    // Step 2
    setState({ status: 'working', step: 2, message: 'Đang mở Ads Manager & lấy token...' });

    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: ADS_MANAGER_URL, active: false });
        captureTabId = tab.id;

        setState({ status: 'working', step: 2, message: 'Đang chờ Ads Manager load & bắt token...' });

        const token = await waitForCapturedToken(25000);

        // Close tab
        try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }
        captureTabId = null;

        if (!token) {
            setState({ status: 'error', step: 2, message: 'Không bắt được token', error: 'Ads Manager load nhưng không có token. Thử lại hoặc đăng nhập thủ công.' });
            return { success: false, error: 'Không bắt được token' };
        }

        // Step 3
        setState({ status: 'working', step: 3, message: 'Đang mở N2 Ads Manager...', token });

        await openWithToken(token);

        setState({ status: 'success', step: 3, message: 'Đăng nhập thành công!' });
        return { success: true };

    } catch (error) {
        captureTabId = null;
        if (tab) {
            try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }
        }
        setState({ status: 'error', step: 2, message: error.message, error: error.message });
        return { success: false, error: error.message };
    }
}

function waitForCapturedToken(timeout) {
    if (capturedToken) return Promise.resolve(capturedToken);
    return new Promise((resolve) => {
        captureResolve = resolve;
        setTimeout(() => {
            if (captureResolve === resolve) {
                captureResolve = null;
                resolve(capturedToken);
            }
        }, timeout);
    });
}

async function openWithToken(token) {
    const targetUrl = `${N2_ADS_URL}?auto_token=${encodeURIComponent(token)}`;
    const [existing] = await chrome.tabs.query({ url: N2_ADS_URL + '*' });
    if (existing) {
        await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    } else {
        await chrome.tabs.create({ url: targetUrl });
    }
}
