// N2 FB Cookie Helper — Background Service Worker
// Captures EAAG token from Facebook network requests (most reliable method)

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

// =====================================================
// TOKEN CAPTURE via webRequest (intercept Graph API calls)
// =====================================================
let capturedToken = null;
let captureTabId = null;
let captureResolve = null;

// Listen for ALL facebook requests that contain access_token
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!captureTabId || details.tabId !== captureTabId) return;

        const url = details.url;
        // Look for access_token in URL
        const match = url.match(/access_token=(EAAG[A-Za-z0-9_-]{20,})/);
        if (match && match[1]) {
            console.log('[N2-EXT] Token captured from request:', url.substring(0, 80));
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
            'https://*.facebook.com/api/graphql/*',
            'https://*.facebook.com/ajax/*',
            'https://adsmanager.facebook.com/*',
            'https://business.facebook.com/*',
        ]
    },
    ['requestHeaders']
);

// Also check request bodies for GraphQL calls
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!captureTabId || details.tabId !== captureTabId) return;

        const url = details.url;
        // Check URL for token
        const match = url.match(/access_token=(EAAG[A-Za-z0-9_-]{20,})/);
        if (match && match[1]) {
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
// MESSAGE HANDLER from popup
// =====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'auto-login') {
        doAutoLogin()
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // async response
    }
});

// =====================================================
// MAIN AUTO-LOGIN FLOW
// =====================================================
async function doAutoLogin() {
    console.log('[N2-EXT] Starting auto login...');
    capturedToken = null;

    // Open Ads Manager — this triggers Graph API calls which contain the token
    let tab = null;
    try {
        tab = await chrome.tabs.create({ url: ADS_MANAGER_URL, active: false });
        captureTabId = tab.id;
        console.log('[N2-EXT] Opened Ads Manager tab:', tab.id);

        // Wait for token to be captured from network requests (max 20s)
        const token = await waitForCapturedToken(20000);

        // Close the Ads Manager tab
        try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }
        captureTabId = null;

        if (!token) {
            return { success: false, error: 'Không bắt được token. Hãy thử mở Ads Manager thủ công rồi bấm lại.' };
        }

        // Open N2 Ads Manager with token
        await openWithToken(token);
        return { success: true };

    } catch (error) {
        captureTabId = null;
        if (tab) {
            try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }
        }
        return { success: false, error: error.message };
    }
}

function waitForCapturedToken(timeout) {
    // If already captured (from listener), return immediately
    if (capturedToken) {
        return Promise.resolve(capturedToken);
    }

    return new Promise((resolve) => {
        captureResolve = resolve;

        // Timeout fallback
        setTimeout(() => {
            if (captureResolve === resolve) {
                captureResolve = null;
                resolve(capturedToken); // might be null or captured by now
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
