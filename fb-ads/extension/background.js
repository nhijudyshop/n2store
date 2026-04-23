// N2 FB Cookie Helper — Background Service Worker
// Uses Facebook OAuth dialog to get EAAG token (most reliable)

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const FB_APP_ID = '1290728302927895';
const OAUTH_REDIRECT = 'https://www.facebook.com/connect/login_success.html';
const OAUTH_SCOPES =
    'ads_management,ads_read,business_management,pages_read_engagement,pages_manage_ads';

// =====================================================
// STATE
// =====================================================
let state = {
    status: 'idle',
    step: 0,
    message: '',
    token: null,
    error: null,
    startedAt: null,
};

function setState(updates) {
    Object.assign(state, updates);
    chrome.runtime.sendMessage({ type: 'state-update', state }).catch(() => {});
}

// =====================================================
// MESSAGE HANDLER
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'auto-login') {
        doAutoLogin()
            .then((r) => sendResponse(r))
            .catch((e) => sendResponse({ success: false, error: e.message }));
        return true;
    }
    if (msg.action === 'get-state') {
        sendResponse(state);
        return false;
    }
    if (msg.action === 'reset') {
        setState({
            status: 'idle',
            step: 0,
            message: '',
            token: null,
            error: null,
            startedAt: null,
        });
        sendResponse({ ok: true });
        return false;
    }
});

// =====================================================
// AUTO-LOGIN via OAuth
// =====================================================
async function doAutoLogin() {
    // Step 1: Check FB cookies
    setState({
        status: 'working',
        step: 1,
        message: 'Kiểm tra đăng nhập Facebook...',
        startedAt: Date.now(),
        error: null,
    });

    const cookies = await chrome.cookies.getAll({ domain: '.facebook.com' });
    const cookieMap = {};
    (cookies || []).forEach((c) => {
        cookieMap[c.name] = c.value;
    });

    if (!cookieMap['c_user'] || !cookieMap['xs']) {
        setState({ status: 'error', step: 1, error: 'Hãy mở facebook.com và đăng nhập trước.' });
        return { success: false, error: 'Chưa đăng nhập Facebook' };
    }

    // Step 2: Open OAuth dialog — FB auto-approves if already authorized
    setState({ status: 'working', step: 2, message: 'Đang lấy token qua Facebook OAuth...' });

    let tab = null;
    try {
        const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT)}&response_type=token&scope=${OAUTH_SCOPES}`;

        tab = await chrome.tabs.create({ url: oauthUrl, active: true });

        const token = await waitForOAuthRedirect(tab.id, 30000);

        try {
            await chrome.tabs.remove(tab.id);
        } catch (e) {}

        if (!token) {
            setState({
                status: 'error',
                step: 2,
                error: 'Không nhận được token. Có thể cần approve app trên popup Facebook.',
            });
            return { success: false, error: 'OAuth timeout' };
        }

        // Step 3: Open N2 Ads Manager
        setState({
            status: 'working',
            step: 3,
            message: 'Đang đăng nhập N2 Ads Manager...',
            token,
        });
        await openWithToken(token);
        setState({ status: 'success', step: 3, message: 'Đăng nhập thành công!' });
        return { success: true };
    } catch (error) {
        if (tab) {
            try {
                await chrome.tabs.remove(tab.id);
            } catch (e) {}
        }
        setState({ status: 'error', step: 2, error: error.message });
        return { success: false, error: error.message };
    }
}

// =====================================================
// Wait for OAuth redirect containing access_token
// =====================================================
function waitForOAuthRedirect(tabId, timeout) {
    return new Promise((resolve) => {
        let done = false;

        function listener(updatedTabId, changeInfo) {
            if (done || updatedTabId !== tabId) return;

            const url = changeInfo.url || '';

            // Facebook redirects to: redirect_uri#access_token=EAAG...&...
            if (url.includes('login_success') && url.includes('access_token=')) {
                done = true;
                chrome.tabs.onUpdated.removeListener(listener);

                const hashParams = url.split('#')[1] || '';
                const match = hashParams.match(/access_token=([^&]+)/);
                const token = match ? decodeURIComponent(match[1]) : null;

                console.log(
                    '[N2-BG] OAuth token received!',
                    token ? token.substring(0, 20) + '...' : 'null'
                );
                setState({ status: 'working', step: 2, message: 'Token nhận được!' });
                resolve(token);
            }

            // User denied or error
            if (url.includes('login_success') && url.includes('error=')) {
                done = true;
                chrome.tabs.onUpdated.removeListener(listener);
                const errorMatch = url.match(/error_description=([^&]+)/);
                const errorMsg = errorMatch
                    ? decodeURIComponent(errorMatch[1].replace(/\+/g, ' '))
                    : 'User denied';
                setState({ status: 'error', step: 2, error: errorMsg });
                resolve(null);
            }
        }

        chrome.tabs.onUpdated.addListener(listener);

        // Timeout
        setTimeout(() => {
            if (!done) {
                done = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(null);
            }
        }, timeout);
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
