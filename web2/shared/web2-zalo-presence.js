// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2ZaloPresence — FOCUS-LEASE cho phiên Zalo (nguồn DUY NHẤT).
//
// Vấn đề: Zalo Web = 1 phiên/tài khoản. Công cụ web2/zalo (zca-js trên server) và
// chat.zalo.me cùng 1 TK → đá nhau → spam "Đổi thiết bị". Giải pháp (user 2026-06-25):
// server CHỈ giữ phiên khi 1 tab công cụ (web2/zalo | jt-tracking) đang FOCUS. Tab gửi
// heartbeat `lease`; mất focus / đóng tab → `release` → server nhường chat.zalo.me.
//
// Trang nào muốn "giữ phiên khi focus" → include script này + ZaloApi + web2-extension-bridge,
// rồi gọi Web2ZaloPresence.start(). Xem reference_zalo_focus_lease.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ZaloPresence) return; // singleton

    const HEARTBEAT_MS = 25 * 1000; // < LEASE_TTL_MS (75s) → dư biên 1 nhịp lỡ
    const BLUR_RELEASE_DELAY_MS = 3000; // chờ 3s rồi mới release (tránh nhường khi liếc nhanh)
    const ACQUIRE_COOLDOWN_MS = 20 * 1000; // không acquire (login) dồn dập

    let _started = false;
    let _hbTimer = null;
    let _blurTimer = null;
    let _lastAcquireAt = 0;
    let _acquiring = false;
    const _managed = new Set(); // accountKey đang giữ → release đúng các key này lúc đóng tab

    const _api = () => global.ZaloApi;
    const _ext = () => global.Web2Ext;
    // Focus = tab đang hiển thị VÀ cửa sổ đang được OS focus (phân biệt chat.zalo.me ở
    // cửa sổ khác). hasFocus() bắt được cả trường hợp tab visible nhưng cửa sổ mất focus.
    const _focused = () =>
        document.visibilityState === 'visible' &&
        (typeof document.hasFocus === 'function' ? document.hasFocus() : true);

    // Danh sách TK cá nhân của MÁY này (owner-scoped ở server). Lấy từ /status.
    async function _personalKeys() {
        try {
            const res = await _api().status();
            return (res.accounts || [])
                .filter((a) => a.accountType === 'personal' && a.isActive !== false)
                .map((a) => ({ key: a.accountKey, status: a.status }));
        } catch {
            return [];
        }
    }

    // Acquire 1 TK: ưu tiên lease (rẻ). Chưa connected → lấy creds qua extension → login-cookie
    // silent → lease. Trả true nếu đã/đang giữ.
    async function _acquireOne(key) {
        let lr = null;
        try {
            lr = await _api().lease(key);
        } catch {
            lr = null;
        }
        _managed.add(key);
        if (lr && lr.connected) return true; // đã connected → chỉ cần gia hạn lease
        // Chưa connected → cần creds phiên chat.zalo.me (extension) để login lại.
        const ext = _ext();
        if (!ext || !ext.hasExtension || !ext.hasExtension()) return false;
        if (Date.now() - _lastAcquireAt < ACQUIRE_COOLDOWN_MS) return false; // tránh login dồn
        _lastAcquireAt = Date.now();
        let r = null;
        try {
            r = await ext.request('GET_ZALO_CREDS', {}, 12000);
        } catch {
            r = null;
        }
        if (!r || !r.ok || !r.data) return false;
        const { cookie, imei, userAgent } = r.data;
        if (!cookie || !imei || !userAgent) return false;
        try {
            await _api().loginCookie(key, { cookie, imei, userAgent, silent: true });
            await _api()
                .lease(key)
                .catch(() => {});
            return true;
        } catch {
            return false; // cookie hết hạn / sai TK → im lặng, lần focus sau thử lại
        }
    }

    let _bootstrapAt = 0;
    const BOOTSTRAP_COOLDOWN_MS = 60000;
    async function _acquireAll() {
        if (_acquiring) return;
        _acquiring = true;
        try {
            let list = await _personalKeys();
            // #3.2 (2026-06-27): CHƯA có TK cá nhân nào + còn phiên chat.zalo.me (cookie) →
            // TỰ tạo+login account đầu tiên từ cookie (không cần vào tab Zalo bấm nút). Tái
            // dùng Web2Zalo.getCookieAccountKey (chỉ có khi trang load web2-zalo.js, vd
            // jt-tracking). Throttle 60s + chỉ khi đang focus + có extension.
            if (
                !list.length &&
                _focused() &&
                global.Web2Zalo?.getCookieAccountKey &&
                _ext()?.hasExtension?.() &&
                Date.now() - _bootstrapAt > BOOTSTRAP_COOLDOWN_MS
            ) {
                _bootstrapAt = Date.now();
                try {
                    const key = await global.Web2Zalo.getCookieAccountKey({ autoLogin: true });
                    if (key) list = await _personalKeys();
                } catch {
                    /* không phiên/cookie → im lặng */
                }
            }
            for (const a of list) {
                if (!_focused()) break; // mất focus giữa chừng → dừng
                await _acquireOne(a.key);
            }
        } finally {
            _acquiring = false;
        }
    }

    async function _heartbeat() {
        if (!_focused()) return;
        // Gia hạn lease các TK đang giữ; TK nào rớt (connected=false) → acquire lại.
        const keys = _managed.size ? [..._managed] : (await _personalKeys()).map((a) => a.key);
        for (const key of keys) {
            if (!_focused()) break;
            let lr = null;
            try {
                lr = await _api().lease(key);
            } catch {
                lr = null;
            }
            if (!lr || !lr.connected) await _acquireOne(key);
        }
    }

    function _releaseAll(useBeacon) {
        const keys = [..._managed];
        for (const key of keys) {
            if (useBeacon) _api().releaseBeacon(key);
            else
                _api()
                    .release(key)
                    .catch(() => {});
        }
        if (!useBeacon) _managed.clear();
    }

    function _onFocus() {
        if (_blurTimer) {
            clearTimeout(_blurTimer);
            _blurTimer = null;
        }
        if (!_hbTimer) _hbTimer = setInterval(_heartbeat, HEARTBEAT_MS);
        _acquireAll();
    }

    function _onBlur() {
        if (_hbTimer) {
            clearInterval(_hbTimer);
            _hbTimer = null;
        }
        if (_blurTimer) clearTimeout(_blurTimer);
        // Debounce: chỉ nhường nếu vẫn mất focus sau BLUR_RELEASE_DELAY_MS (tránh liếc nhanh).
        _blurTimer = setTimeout(() => {
            _blurTimer = null;
            if (!_focused()) _releaseAll(false);
        }, BLUR_RELEASE_DELAY_MS);
    }

    function _onVisibility() {
        if (_focused()) _onFocus();
        else _onBlur();
    }

    // ── Public ───────────────────────────────────────────────────────────
    function start() {
        if (_started) return;
        if (!_api()) {
            console.warn('[Web2ZaloPresence] ZaloApi chưa load → bỏ qua');
            return;
        }
        _started = true;
        document.addEventListener('visibilitychange', _onVisibility);
        global.addEventListener('focus', _onFocus);
        global.addEventListener('blur', _onBlur);
        // Đóng tab → nhường ngay bằng beacon (không huỷ khi unload).
        global.addEventListener('pagehide', () => _releaseAll(true));
        global.addEventListener('beforeunload', () => _releaseAll(true));
        if (_focused()) _onFocus();
    }

    // ensure(): acquire on-demand (vd trước khi gửi tin Zalo từ trang khác). Trả Promise<bool>.
    async function ensure(key) {
        if (key) return _acquireOne(key);
        const list = await _personalKeys();
        let ok = false;
        for (const a of list) ok = (await _acquireOne(a.key)) || ok;
        return ok;
    }

    global.Web2ZaloPresence = {
        start,
        ensure,
        _state: () => ({ managed: [..._managed], focused: _focused() }),
    };
})(window);
