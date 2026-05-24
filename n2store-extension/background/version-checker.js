// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Version checker: chu kỳ poll latest version từ GH Pages, lưu vào storage.
// Popup đọc storage → nếu remote > local thì hiện banner "Cập nhật" với nút mở Store.
//
// Tại sao không dùng Chrome Web Store API: cần OAuth, không khả thi client-side.
// Tại sao GH Pages thay vì raw.githubusercontent: GH Pages domain đã có trong host_permissions, không cần xin thêm.

const REMOTE_MANIFEST_URL = 'https://nhijudyshop.github.io/n2store/n2store-extension/manifest.json';
const STORE_URL = 'https://chromewebstore.google.com/detail/dgcicifdlgamleagjangkbbcdgbhmfea';
const STORAGE_KEY = 'updateInfo'; // { latestVersion, installedVersion, checkedAt, storeUrl }
const ALARM_NAME = 'version-check';
const CHECK_INTERVAL_MIN = 360; // 6h — không spam GH Pages

function parseSemver(v) {
    return String(v || '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
    const r = parseSemver(remote);
    const l = parseSemver(local);
    const len = Math.max(r.length, l.length);
    for (let i = 0; i < len; i++) {
        const ri = r[i] || 0;
        const li = l[i] || 0;
        if (ri > li) return true;
        if (ri < li) return false;
    }
    return false;
}

async function checkLatestVersion() {
    const installedVersion = chrome.runtime.getManifest().version;
    try {
        const res = await fetch(REMOTE_MANIFEST_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const remote = await res.json();
        const latestVersion = remote.version;

        const info = {
            latestVersion,
            installedVersion,
            checkedAt: Date.now(),
            storeUrl: STORE_URL,
            updateAvailable: isNewer(latestVersion, installedVersion),
        };
        await chrome.storage.local.set({ [STORAGE_KEY]: info });
        return info;
    } catch (err) {
        // Soft-fail: lần check sau sẽ retry. Không clobber state cũ.
        return { error: String(err && err.message), installedVersion };
    }
}

function setupVersionChecker() {
    // Kiểm tra ngay khi service worker khởi động (cold start sau Chrome restart hoặc update)
    checkLatestVersion();

    // Đăng ký alarm chu kỳ
    chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: CHECK_INTERVAL_MIN,
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            checkLatestVersion();
        }
    });
}

export { setupVersionChecker, checkLatestVersion, STORAGE_KEY, STORE_URL };
