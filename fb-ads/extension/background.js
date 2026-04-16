// N2 FB Cookie Helper — Background Service Worker

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

// =====================================================
// STATE (persists across popup open/close)
// =====================================================
let state = {
    status: 'idle', step: 0, message: '', token: null, error: null, startedAt: null,
};

function setState(updates) {
    Object.assign(state, updates);
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {});
}

// =====================================================
// TOKEN received from content script (intercept.js → relay.js)
// =====================================================
let tokenResolve = null;
let capturedToken = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Token found by content script
    if (msg.action === 'token-found' && msg.token) {
        console.log('[N2-BG] Token received from content script!', msg.token.substring(0, 20) + '...');
        capturedToken = msg.token;
        if (tokenResolve) {
            tokenResolve(msg.token);
            tokenResolve = null;
        }
        return;
    }

    // Popup requests
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
        capturedToken = null;
        sendResponse({ ok: true });
        return false;
    }
});

// =====================================================
// AUTO-LOGIN
// =====================================================
async function doAutoLogin() {
    capturedToken = null;
    tokenResolve = null;

    // Step 1
    setState({ status: 'working', step: 1, message: 'Kiểm tra đăng nhập Facebook...', startedAt: Date.now(), error: null });

    const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
    const cookieMap = {};
    (cookies || []).forEach(c => { cookieMap[c.name] = c.value; });

    if (!cookieMap['c_user'] || !cookieMap['xs']) {
        setState({ status: 'error', step: 1, error: 'Hãy mở facebook.com và đăng nhập trước.' });
        return { success: false, error: 'Chưa đăng nhập Facebook' };
    }

    // Step 2: Open Ads Manager → content scripts auto-intercept fetch → find token
    setState({ status: 'working', step: 2, message: 'Đang mở Ads Manager...' });

    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: ADS_MANAGER_URL, active: true });

        setState({ status: 'working', step: 2, message: 'Đang chờ token từ Ads Manager...' });

        // Wait for content script to intercept a fetch call containing EAAG
        const token = await waitForToken(30000);

        try { await chrome.tabs.remove(tab.id); } catch (e) {}

        if (!token) {
            setState({ status: 'error', step: 2, error: 'Không bắt được token sau 30s. Tài khoản có thể không có quyền Ads.' });
            return { success: false, error: 'Timeout' };
        }

        // Step 3
        setState({ status: 'working', step: 3, message: 'Đang đăng nhập...', token });
        await openWithToken(token);
        setState({ status: 'success', step: 3, message: 'Đăng nhập thành công!' });
        return { success: true };

    } catch (error) {
        if (tab) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
        setState({ status: 'error', step: 2, error: error.message });
        return { success: false, error: error.message };
    }
}

function waitForToken(timeout) {
    if (capturedToken) return Promise.resolve(capturedToken);
    return new Promise((resolve) => {
        tokenResolve = resolve;
        setTimeout(() => {
            if (tokenResolve === resolve) {
                tokenResolve = null;
                resolve(capturedToken); // null if not found
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
