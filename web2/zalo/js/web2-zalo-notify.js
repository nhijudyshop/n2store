// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Zalo thông báo tin mới (toast + âm thanh + badge tab + Web Notification).
// =====================================================================
// Trang Zalo — thông báo tin nhắn MỚI khi đang ở tab khác / hội thoại khác:
//   • toast (notificationManager)  • beep (Web Audio, throttle, tắt được)
//   • badge số chưa đọc trên document.title  • Web Notification (khi tab ẩn)
// Phát hiện tin mới = diff danh sách hội thoại trước/sau mỗi loadConversations
// (SSE web2:zalo:messages chỉ báo "có thay đổi" → client re-fetch → diff unread).
// =====================================================================

(function () {
    'use strict';

    const WZApp = (window.WZApp = window.WZApp || {});
    const { state } = WZApp;

    const BASE_TITLE = 'Zalo - WEB 2.0';
    const SOUND_KEY = 'wz_notify_sound'; // '0' = tắt tiếng
    const SOUND_THROTTLE_MS = 1500;
    const PREVIEW_MAX = 60;

    let _audioCtx = null;
    let _lastSoundAt = 0;
    let _permAsked = false;

    function soundOn() {
        try {
            return localStorage.getItem(SOUND_KEY) !== '0';
        } catch {
            return true;
        }
    }
    function setSound(on) {
        try {
            localStorage.setItem(SOUND_KEY, on ? '1' : '0');
        } catch {}
    }

    // Beep ngắn bằng Web Audio (không cần file asset). Throttle + tôn trọng tắt tiếng.
    function beep() {
        if (!soundOn()) return;
        const t = Date.now();
        if (t - _lastSoundAt < SOUND_THROTTLE_MS) return;
        _lastSoundAt = t;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            _audioCtx = _audioCtx || new AC();
            if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = 880;
            const now = _audioCtx.currentTime;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.26);
        } catch {}
    }

    // Tổng số chưa đọc → badge trên tiêu đề tab.
    function totalUnread() {
        return (state.conv.list || []).reduce((s, c) => s + (Number(c.unread_count) || 0), 0);
    }
    function setTabBadge() {
        const n = totalUnread();
        document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${BASE_TITLE}` : BASE_TITLE;
    }

    // Xin quyền Web Notification 1 lần (gọi từ user gesture — mở hội thoại).
    function ensurePermission() {
        if (_permAsked || !('Notification' in window)) return;
        _permAsked = true;
        if (Notification.permission === 'default') {
            try {
                Notification.requestPermission().catch(() => {});
            } catch {}
        }
    }
    function browserNotify(title, body) {
        // Chỉ bắn khi tab ẩn (đang xem trang thì toast đủ) + đã cấp quyền.
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (!document.hidden) return;
        try {
            const n = new Notification(title, { body, tag: 'web2-zalo', renotify: true });
            n.onclick = () => {
                window.focus();
                n.close();
            };
        } catch {}
    }

    function _preview(c) {
        let p = c.last_msg_text || '';
        if (!p) {
            const t = c.last_msg_type;
            p =
                t === 'image'
                    ? '[Hình ảnh]'
                    : t === 'sticker'
                      ? '[Sticker]'
                      : t === 'file'
                        ? '[Tệp đính kèm]'
                        : t === 'voice'
                          ? '[Tin nhắn thoại]'
                          : 'Tin nhắn mới';
        }
        return String(p).slice(0, PREVIEW_MAX);
    }

    // So sánh map cũ (id→unread) với danh sách mới → tin INBOUND mới (unread tăng,
    // không phải hội thoại đang mở, người gửi cuối != mình) → toast + beep + Web Notif.
    function notify(prevMap) {
        const list = state.conv.list || [];
        const fresh = [];
        for (const c of list) {
            const prev = prevMap.get(String(c.id));
            const prevUnread = prev ? prev.unread : 0;
            const inbound = c.last_msg_sender_uid !== 'me';
            if (
                inbound &&
                Number(c.unread_count) > prevUnread &&
                String(c.id) !== String(state.conv.activeId)
            ) {
                fresh.push(c);
            }
        }
        setTabBadge();
        if (!fresh.length) return;
        const group = fresh[0].thread_type === 'group';
        const name = fresh[0].display_name || (group ? 'Nhóm Zalo' : 'Khách Zalo');
        const msg =
            fresh.length === 1
                ? `💬 ${name}: ${_preview(fresh[0])}`
                : `💬 ${fresh.length} hội thoại có tin nhắn Zalo mới`;
        try {
            window.notificationManager?.show?.(msg, 'info');
        } catch {}
        beep();
        browserNotify(
            fresh.length === 1 ? name : 'Tin nhắn Zalo mới',
            fresh.length === 1 ? _preview(fresh[0]) : `${fresh.length} hội thoại mới`
        );
    }

    // Snapshot map id→unread TRƯỚC khi loadConversations ghi đè list (chat.js gọi).
    function snapshot() {
        const m = new Map();
        for (const c of state.conv.list || [])
            m.set(String(c.id), { unread: Number(c.unread_count) || 0 });
        return m;
    }

    // Cập nhật badge khi quay lại tab (đề phòng list đổi lúc ẩn).
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) setTabBadge();
    });

    WZApp.zaloNotify = { notify, snapshot, setTabBadge, ensurePermission, beep, soundOn, setSound };
})();
