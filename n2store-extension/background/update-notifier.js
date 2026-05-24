// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Update notifier: bắn chrome notification khi extension được auto-update từ Chrome Web Store.
// User click notification → mở trang store hoặc release notes.

const STORE_URL = 'https://chromewebstore.google.com/detail/dgcicifdlgamleagjangkbbcdgbhmfea';
const NOTIFICATION_ID = 'n2store-extension-updated';
const STORAGE_KEY_LAST_SEEN = 'lastSeenVersion';

function setupUpdateNotifier() {
    chrome.runtime.onInstalled.addListener((details) => {
        const currentVersion = chrome.runtime.getManifest().version;

        if (details.reason === 'install') {
            // First install — welcome notification
            chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN]: currentVersion });
            return;
        }

        if (details.reason !== 'update') return;

        const previousVersion = details.previousVersion || 'unknown';
        chrome.storage.local.set({ [STORAGE_KEY_LAST_SEEN]: currentVersion });

        chrome.notifications.create(
            NOTIFICATION_ID,
            {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('images/icon-128.png'),
                title: 'N2Store Extension đã cập nhật',
                message: `Phiên bản mới: v${currentVersion} (từ v${previousVersion}). Click để xem trên Chrome Web Store.`,
                priority: 2,
                requireInteraction: false,
            },
            () => void chrome.runtime.lastError
        );
    });

    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationId === NOTIFICATION_ID) {
            chrome.tabs.create({ url: STORE_URL });
            chrome.notifications.clear(notificationId);
        }
    });
}

export { setupUpdateNotifier };
