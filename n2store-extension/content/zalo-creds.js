// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Content script chạy trên chat.zalo.me — đọc IMEI (device uuid) + userAgent của phiên Zalo Web
// đang đăng nhập, để Web 2.0 "Đăng nhập Zalo 1-click" (zca-js cookie login) dùng.
//
// IMEI Zalo Web = localStorage 'z_uuid' (alias 'sh_z_uuid'). zca-js cần bộ {cookie, imei, userAgent}
// khớp nhau (imei = uuid + '-' + MD5(userAgent)). Cookie do background đọc qua chrome.cookies
// (đọc được cả httpOnly). Content script này CHỈ lo phần imei + userAgent (localStorage = origin-bound,
// chỉ đọc được từ trong trang zalo.me).
//
// 2 đường lấy:
//   1) Lúc load → tự gửi cache lên background (chrome.storage.local) → 1-click không cần tab mở.
//   2) Background hỏi trực tiếp (ZALO_READ_CREDS) → đọc tươi từ tab đang mở.
(function () {
    'use strict';

    function readImei() {
        try {
            return (
                window.localStorage.getItem('z_uuid') ||
                window.localStorage.getItem('sh_z_uuid') ||
                null
            );
        } catch (e) {
            return null;
        }
    }

    // 2026-06-20: đọc UID tài khoản ĐANG đăng nhập chat.zalo.me → Web 2.0 ưu tiên
    // dùng đúng tài khoản này để gửi tin (match account web2 theo zalo_uid).
    function readUid() {
        try {
            const direct =
                window.localStorage.getItem('sh_zlast_uid') ||
                window.localStorage.getItem('sh_z_recentuid') ||
                null;
            if (direct) return String(direct);
            const ids = window.localStorage.getItem('sh_user_ids');
            if (ids) {
                const arr = JSON.parse(ids);
                if (Array.isArray(arr) && arr[0]) return String(arr[0]);
            }
        } catch (e) {}
        return null;
    }

    function snapshot() {
        return { imei: readImei(), userAgent: navigator.userAgent, uid: readUid() };
    }

    // 1) Cache ngay khi vào chat.zalo.me (nếu đã đăng nhập → có z_uuid).
    function cacheNow() {
        const s = snapshot();
        if (!s.imei) return; // chưa đăng nhập / chưa có uuid → bỏ qua, không cache rác
        try {
            chrome.runtime.sendMessage({
                type: 'ZALO_CREDS_CACHE',
                imei: s.imei,
                userAgent: s.userAgent,
                uid: s.uid,
            });
        } catch (e) {
            /* extension context có thể chưa sẵn — bỏ qua, lần sau thử lại */
        }
    }

    // 2) Background hỏi tươi → trả {imei, userAgent} ngay.
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'ZALO_READ_CREDS') {
            sendResponse(snapshot());
            return true;
        }
    });

    // chạy lúc load + thử lại vài lần (z_uuid có thể set trễ sau khi app Zalo Web khởi tạo).
    cacheNow();
    let tries = 0;
    const t = setInterval(() => {
        if (readImei() || ++tries >= 6) {
            cacheNow();
            clearInterval(t);
        }
    }, 1500);
})();
