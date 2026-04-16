// N2 FB Cookie Helper — Background Service Worker
// Handles token extraction independently of popup lifecycle

const N2_ADS_URL = 'https://nhijudyshop.github.io/n2store/fb-ads/index.html';
const ADS_MANAGER_URLS = [
    'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
    'https://business.facebook.com/adsmanager/manage/campaigns',
    'https://www.facebook.com/adsmanager/manage/campaigns',
];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'auto-login') {
        doAutoLogin().then(result => sendResponse(result));
        return true; // keep sendResponse channel open for async
    }
});

async function doAutoLogin() {
    console.log('[N2-EXT] Starting auto login...');

    // Strategy 1: Try to extract token from an existing FB tab (no new tab needed)
    const token = await tryExtractFromExistingTab();
    if (token) {
        console.log('[N2-EXT] Token found from existing tab!');
        await openAdsManagerWithToken(token);
        return { success: true, method: 'existing-tab' };
    }

    // Strategy 2: Open Ads Manager tab in background, extract, close
    const tokenFromNewTab = await tryExtractFromNewTab();
    if (tokenFromNewTab) {
        console.log('[N2-EXT] Token found from new tab!');
        await openAdsManagerWithToken(tokenFromNewTab);
        return { success: true, method: 'new-tab' };
    }

    return { success: false, error: 'Không tìm thấy EAAG token. Hãy thử đăng nhập thủ công.' };
}

// =====================================================
// Strategy 1: Extract from existing Facebook tab
// =====================================================
async function tryExtractFromExistingTab() {
    try {
        // Find any open Facebook tab
        const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
        const bizTabs = await chrome.tabs.query({ url: '*://business.facebook.com/*' });
        const adsTabs = await chrome.tabs.query({ url: '*://adsmanager.facebook.com/*' });

        // Try ads manager tabs first, then business, then regular FB
        const allTabs = [...adsTabs, ...bizTabs, ...tabs];

        for (const tab of allTabs) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: extractTokenFromPage
                });
                const token = results?.[0]?.result;
                if (token) return token;
            } catch (e) {
                console.log(`[N2-EXT] Can't inject into tab ${tab.id}:`, e.message);
            }
        }

        // Try fetching from an existing FB tab context (uses FB cookies automatically)
        for (const tab of allTabs) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: fetchTokenFromAdsManager
                });
                const token = results?.[0]?.result;
                if (token) return token;
            } catch (e) {
                console.log(`[N2-EXT] Fetch from tab ${tab.id} failed:`, e.message);
            }
        }
    } catch (e) {
        console.log('[N2-EXT] Existing tab strategy failed:', e.message);
    }
    return null;
}

// =====================================================
// Strategy 2: Open new tab to Ads Manager
// =====================================================
async function tryExtractFromNewTab() {
    for (const url of ADS_MANAGER_URLS) {
        let tab = null;
        try {
            tab = await chrome.tabs.create({ url, active: false });
            console.log(`[N2-EXT] Opened tab ${tab.id} for ${url}`);

            const token = await waitForTokenInTab(tab.id, 20000);

            try { await chrome.tabs.remove(tab.id); } catch (e) { /* ok */ }

            if (token) return token;
        } catch (e) {
            console.log(`[N2-EXT] New tab strategy failed for ${url}:`, e.message);
            if (tab) {
                try { await chrome.tabs.remove(tab.id); } catch (e2) { /* ok */ }
            }
        }
    }
    return null;
}

function waitForTokenInTab(tabId, timeout) {
    return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        let attempts = 0;

        function tryOnce() {
            if (done) return;
            attempts++;
            if (Date.now() - start > timeout || attempts > 10) {
                done = true;
                resolve(null);
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId },
                func: extractTokenFromPage
            }).then(results => {
                const token = results?.[0]?.result;
                if (token && !done) {
                    done = true;
                    resolve(token);
                } else if (!done) {
                    setTimeout(tryOnce, 2000);
                }
            }).catch(() => {
                if (!done) setTimeout(tryOnce, 2000);
            });
        }

        // First attempt after page starts loading
        setTimeout(tryOnce, 3000);
    });
}

// =====================================================
// Token extraction functions (injected into FB pages)
// =====================================================

// Extracts EAAG token from current page's HTML/scripts
function extractTokenFromPage() {
    try {
        const html = document.documentElement.innerHTML;
        const patterns = [
            /\"accessToken\"\s*:\s*\"(EAAG[^\"]+)\"/,
            /\"access_token\"\s*:\s*\"(EAAG[^\"]+)\"/,
            /accessToken\s*=\s*\"(EAAG[^\"]+)\"/,
            /access_token=(EAAG[^&\"\'\\]+)/,
            /__accessToken\s*=\s*\"(EAAG[^\"]+)\"/,
            /\"token\"\s*:\s*\"(EAAG[^\"]+)\"/,
            /(EAAG[A-Za-z0-9_-]{50,})/,
        ];
        for (const p of patterns) {
            const m = html.match(p);
            if (m && m[1]) return m[1];
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Fetches Ads Manager page from within FB context (cookies auto-sent)
async function fetchTokenFromAdsManager() {
    try {
        const urls = [
            'https://business.facebook.com/adsmanager/manage/campaigns',
            'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
        ];
        for (const url of urls) {
            try {
                const res = await fetch(url, { credentials: 'include', redirect: 'follow' });
                const html = await res.text();
                const m = html.match(/(EAAG[A-Za-z0-9_-]{50,})/);
                if (m) return m[1];
            } catch (e) { /* try next */ }
        }
        return null;
    } catch (e) {
        return null;
    }
}

// =====================================================
// Open N2 Ads Manager with extracted token
// =====================================================
async function openAdsManagerWithToken(token) {
    const targetUrl = `${N2_ADS_URL}?auto_token=${encodeURIComponent(token)}`;

    // Reuse existing tab if open
    const [existing] = await chrome.tabs.query({ url: N2_ADS_URL + '*' });
    if (existing) {
        await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    } else {
        await chrome.tabs.create({ url: targetUrl });
    }
}
