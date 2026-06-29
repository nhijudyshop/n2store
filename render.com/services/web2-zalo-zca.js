// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Zalo personal account (zca-js) session manager.
// =====================================================================
// Quản lý phiên zca-js cho account_type='personal' (đăng nhập cá nhân).
// Chạy trong process Render fallback (giống Pancake relay — re-login khi boot
// từ session đã lưu DB; KHÔNG cần quét QR lại trừ khi cookie hết hạn).
//
// ⚠ RỦI RO: zca-js không chính thức — acc có thể bị KHOÁ/BAN. Dùng acc PHỤ,
//   không spam. Mỗi account 1 listener WebSocket duy nhất.
//
// Route inject callbacks qua configure():
//   onMessage(accountKey, msg)        → persist tin + SSE web2:zalo:messages
//   onStatus(accountKey, status, txt) → update DB + SSE web2:zalo:accounts
//   persistSession(accountKey, creds, self) → lưu session+uid+name vào DB
// =====================================================================

'use strict';

// ── Defensive require (không crash server nếu lib lỗi cài) ──────────────
let Zalo = null;
let ThreadType = null;
let Reactions = null;
let _libErr = null;
try {
    const zca = require('zca-js');
    Zalo = zca.Zalo;
    ThreadType = zca.ThreadType;
    Reactions = zca.Reactions || {};
} catch (e) {
    _libErr = e.message;
    console.warn('[web2-zalo-zca] zca-js chưa sẵn sàng:', e.message);
}

const _tt = (threadType) => (threadType === 'group' ? ThreadType.Group : ThreadType.User);

// ── Watchdog "không bị văng nick" (research 2026-06-22, zca-js issues #153/#198/#293/#333) ──
// zca-js KHÔNG có API refresh token; phiên hay chết âm thầm (~7 ngày zpw_sek) hoặc bị
// KICK khi TK mở Zalo Web ở máy khác (close 3000/3003) — bị kick KHÔNG mất cookie, chỉ
// rớt listener → re-login bằng cookie cũ là sống lại. Vì vậy:
//  • keepAlive ~2 phút (presence ping, maintainer khuyến nghị),
//  • auto-reconnect khi close/error (backoff lũy thừa cho 1006/network),
//  • 3000/3003 (bị giành phiên) → reconnect chậm + TRẦN số lần liên tiếp (tránh "đấu" vô
//    hạn với máy khác / instance deploy chồng) → đụng trần thì nghỉ dài + báo 'kicked',
//  • re-login CHỦ ĐỘNG trong cửa sổ 7 ngày để cuốn cookie trước khi hết hạn.
const KEEPALIVE_TIMEOUT_MS = 8 * 1000;
const WATCHDOG_MS = 90 * 1000; // chu kỳ kiểm tra sức khoẻ + keepAlive
const PROACTIVE_RELOGIN_MS = 3.5 * 24 * 60 * 60 * 1000; // re-login chủ động trong cửa sổ zpw_sek ~7 ngày
const RECONNECT_BACKOFF_MS = [5000, 15000, 30000, 60000, 120000]; // 1006/network
const KICK_RECONNECT_MS = 30 * 1000; // 3000/3003 reconnect chậm hơn
const KICK_CAP = 4; // số lần bị kick LIÊN TIẾP trước khi nghỉ dài
const KICK_COOLDOWN_MS = 10 * 60 * 1000; // nghỉ sau khi đụng trần kick (TK đang mở nơi khác)
const RECONNECT_COOLDOWN_MS = 3000; // chờ WS cũ đóng hẳn trước re-login (tránh tự-kick)
const MAX_RECONNECT_ATTEMPTS = 10; // sau ngần này lần fail (cookie hết hạn?) → bỏ cuộc, chờ login lại tay (tránh hammer Zalo → ban)
// ── Focus-lease (2026-06-25): Zalo Web = 1 phiên/TK → công cụ + chat.zalo.me đá nhau.
// Giải: server CHỈ giữ phiên zca-js khi 1 tab công cụ (web2/zalo | jt-tracking) đang
// FOCUS gửi heartbeat "lease". Hết lease (user rời tab / đóng / crash) → tự NHƯỜNG
// (graceful disconnect, status 'yielded', KHÔNG re-login) → chat.zalo.me dùng được,
// hết spam "Đổi thiết bị". Khi focus lại → tab gửi lease + login-cookie lại (lấy phiên).
const LEASE_TTL_MS = 75 * 1000; // lease sống 75s; tab heartbeat ~25s → dư biên 1 nhịp lỡ
let _watchdogTimer = null;

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const _raceTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);

// accountKey → { api, listener, status, qr, info, lastError, startedAt,
//   creds, label, expectedUid, connectedAt, lastEventAt, lastCloseCode,
//   reconnecting, reconnectAttempt, consecutiveKicks, reconnectTimer, disposed }
const _sessions = new Map();

function _bumpEvent(accountKey) {
    const s = _sessions.get(accountKey);
    if (s) s.lastEventAt = now();
}

let _cb = {
    onMessage: null,
    onStatus: null,
    persistSession: null,
    onTyping: null,
    onSeen: null,
    onDelivered: null,
    onReaction: null,
    onUndo: null,
    onConnected: null, // fire khi acc kết nối xong → route repair tên nhóm
};

function configure(cb) {
    _cb = Object.assign(_cb, cb || {});
}

// (Bỏ gate is_primary 2026-06-23 — per-máy owner-scoped: mỗi phiên trong RAM là
// account của 1 máy → watchdog giữ MỌI phiên còn s.creds. Owner-scope ở tầng route.)

function isAvailable() {
    return !!Zalo;
}

function now() {
    return Date.now();
}

function _setStatus(accountKey, status, msg) {
    const s = _sessions.get(accountKey) || {};
    s.status = status;
    if (msg !== undefined) s.lastError = msg;
    _sessions.set(accountKey, s);
    try {
        _cb.onStatus?.(accountKey, status, msg || null);
    } catch (e) {
        console.warn('[web2-zalo-zca] onStatus cb err:', e.message);
    }
}

// zalo msgType (zca) → loại nội bộ (ổn định cho UI render bubble)
function _classifyMsgType(zMsgType) {
    switch (zMsgType) {
        case 'webchat':
            return 'text';
        case 'chat.photo':
            return 'image';
        case 'chat.gif':
            return 'gif';
        case 'chat.sticker':
            return 'sticker';
        case 'chat.video.msg':
            return 'video';
        case 'chat.voice':
            return 'voice';
        case 'share.file':
            return 'file';
        case 'chat.link':
            return 'link';
        case 'chat.location.new':
            return 'location';
        case 'chat.recommended':
            return 'contact';
        case 'chat.doodle':
            return 'image';
        default:
            return zMsgType && zMsgType !== 'webchat' ? 'attachment' : 'text';
    }
}

// content (TAttachmentContent) → 1 attachment chuẩn {type,url,thumb,href,title}
function _extractAttachment(kind, content) {
    if (!content || typeof content !== 'object') return null;
    let params = {};
    try {
        if (typeof content.params === 'string') params = JSON.parse(content.params) || {};
        else if (content.params && typeof content.params === 'object') params = content.params;
    } catch {}
    const url =
        content.href ||
        params.normalUrl ||
        params.hdUrl ||
        params.oriUrl ||
        params.url ||
        content.thumb ||
        params.thumbUrl ||
        '';
    // Danh thiếp (chat.recommended): gom uid/phone/tên/avatar để render card liên hệ.
    if (kind === 'contact') {
        return {
            type: 'contact',
            uid: String(content.userId || content.uid || params.userId || ''),
            phone: content.phone || content.phoneNumber || params.phone || '',
            title:
                content.profileName ||
                content.name ||
                content.title ||
                params.name ||
                'Liên hệ Zalo',
            thumb: content.avatar || params.avatar || content.thumb || '',
            href: content.qrCodeUrl || params.qrCodeUrl || '',
        };
    }
    // Vị trí (chat.location.new): lat/lon + địa chỉ → link bản đồ.
    if (kind === 'location') {
        const lat = content.lat ?? params.lat ?? content.latitude ?? '';
        const lon = content.lon ?? content.lng ?? params.lon ?? content.longitude ?? '';
        return {
            type: 'location',
            lat: lat === '' ? '' : String(lat),
            lon: lon === '' ? '' : String(lon),
            title: content.address || content.desc || params.address || 'Vị trí',
            href:
                lat !== '' && lon !== ''
                    ? `https://maps.google.com/?q=${lat},${lon}`
                    : content.href || '',
            thumb: content.thumb || params.thumbUrl || '',
        };
    }
    const thumb = content.thumb || params.thumbUrl || params.normalUrl || url || '';
    // link: tách riêng title/desc để render card xem trước; kind khác giữ fallback cũ (tên tệp…).
    const title = content.title || (kind === 'link' ? '' : content.description) || '';
    return {
        type: kind,
        url: url || '',
        thumb: thumb || '',
        href: content.href || '',
        title,
        desc: kind === 'link' ? content.description || params.description || '' : '',
    };
}

// ── Chuẩn hoá 1 message từ zca-js → shape lưu DB (text + attachments) ────
function _normMessage(accountKey, m) {
    const isGroup = ThreadType && m?.type === ThreadType.Group;
    const d = m?.data || {};
    const kind = _classifyMsgType(d.msgType);
    const rawContent = d.content;

    let text = '';
    const attachments = [];
    if (rawContent && typeof rawContent === 'object') {
        // ảnh/sticker/file/link/... → giữ URL trong attachments, caption ở text
        const att = _extractAttachment(kind, rawContent);
        // contact/location có thể không có url/thumb/href → vẫn giữ (có uid/lat).
        if (att && (att.url || att.thumb || att.href || att.uid || att.lat)) attachments.push(att);
        // caption: chỉ giữ title/description (KHÔNG nhét href làm text — sẽ render media)
        if (kind === 'link') text = rawContent.title || rawContent.href || '';
        else if (kind === 'contact' || kind === 'location') text = att?.title || '';
        else text = rawContent.title || rawContent.description || '';
    } else {
        text = rawContent == null ? '' : String(rawContent);
    }

    // quote (reply) đến nếu có
    let replyTo = null;
    if (d.quote && (d.quote.msgId || d.quote.globalMsgId || d.quote.cliMsgId)) {
        replyTo = {
            msgId: String(d.quote.msgId || d.quote.globalMsgId || ''),
            preview: String(d.quote.content || '').slice(0, 120),
            senderName: d.quote.fromD || d.quote.dName || null,
        };
    }

    return {
        accountKey,
        msgId: d.msgId || d.cliMsgId || d.globalMsgId || null,
        cliMsgId: d.cliMsgId || null,
        threadId: String(m?.threadId || ''),
        threadType: isGroup ? 'group' : 'user',
        direction: m?.isSelf ? 'out' : 'in',
        msgType: kind,
        content: String(text || ''),
        attachments,
        replyTo,
        senderUid: d.uidFrom || null,
        senderName: d.dName || null,
        sentAt: Number(d.ts) || now(),
        raw: d,
    };
}

// ── Sự kiện NHÓM → câu mô tả tiếng Việt (chỉ trả text cho loại đáng hiển thị) ──
function _groupEventText(type, who, d) {
    const g = d?.groupName ? `"${d.groupName}"` : 'nhóm';
    switch (type) {
        case 'join':
            return `${who || 'Thành viên mới'} đã tham gia nhóm`;
        case 'leave':
            return `${who || 'Một thành viên'} đã rời nhóm`;
        case 'remove_member':
            return `${who || 'Một thành viên'} đã bị xoá khỏi nhóm`;
        case 'block_member':
            return `${who || 'Một thành viên'} đã bị chặn khỏi nhóm`;
        case 'add_admin':
            return `${who || 'Một thành viên'} được thêm làm phó nhóm`;
        case 'remove_admin':
            return `${who || 'Một thành viên'} bị gỡ vai trò phó nhóm`;
        case 'update':
            return `Thông tin ${g} đã được cập nhật`;
        case 'update_avatar':
            return `Ảnh đại diện nhóm đã thay đổi`;
        case 'update_setting':
            return `Cài đặt nhóm đã thay đổi`;
        case 'new_pin_topic':
            return `Đã ghim một nội dung trong nhóm`;
        case 'new_link':
            return `Liên kết tham gia nhóm đã được tạo`;
        case 'join_request':
            return `${who || 'Có người'} xin tham gia nhóm`;
        default:
            return null; // loại không đáng hiển thị (reorder pin/board/remind…)
    }
}

// GroupEvent (zca) → tin hệ thống dạng message để persist + render giữa khung chat.
// direction='system' để KHÔNG cộng unread (persist chỉ cộng khi direction==='in').
function _normGroupEvent(accountKey, e) {
    const type = e?.type;
    const d = e?.data || {};
    const threadId = String(e?.threadId || d.groupId || '');
    if (!threadId) return null;
    const names = (Array.isArray(d.updateMembers) ? d.updateMembers : [])
        .map((m) => m && m.dName)
        .filter(Boolean);
    const who = names.join(', ');
    const text = _groupEventText(type, who, d);
    if (!text) return null;
    return {
        accountKey,
        msgId: `sys_${threadId}_${type}_${now()}`,
        cliMsgId: null,
        threadId,
        threadType: 'group',
        direction: 'system',
        msgType: 'system',
        content: text,
        attachments: [],
        replyTo: null,
        senderUid: null,
        senderName: null,
        sentAt: now(),
        raw: null,
    };
}

// ── Normalizers cho event realtime (typing/seen/reaction/undo) ──────────
function _normTyping(accountKey, e) {
    const d = e?.data || e || {};
    return {
        accountKey,
        threadId: String(d.uid || d.gid || d.threadId || e?.threadId || ''),
        isGroup: !!(d.gid || (ThreadType && e?.type === ThreadType.Group)),
        senderUid: d.uid || null,
        ts: now(),
    };
}
function _normSeen(accountKey, e) {
    const d = e?.data || e || {};
    const seen = Array.isArray(d) ? d : d.seen || d.msgIds || [];
    return {
        accountKey,
        threadId: String(e?.threadId || d.threadId || d.idTo || ''),
        msgIds: (Array.isArray(seen) ? seen : [seen])
            .map((x) => String(x?.msgId || x))
            .filter(Boolean),
        ts: now(),
    };
}
function _normReaction(accountKey, e) {
    const d = e?.data || {};
    const c = d.content || {};
    return {
        accountKey,
        threadId: String(e?.threadId || ''),
        msgId: String(c.rMsg?.[0]?.gMsgID || c.rMsg?.[0]?.msgId || d.msgId || ''),
        cliMsgId: String(c.rMsg?.[0]?.cMsgID || d.cliMsgId || ''),
        uidFrom: d.uidFrom || null,
        icon: c.rIcon || c.icon || '',
        rType: c.rType,
        ts: now(),
    };
}
function _normUndo(accountKey, e) {
    const d = e?.data || {};
    const c = d.content || {};
    return {
        accountKey,
        threadId: String(e?.threadId || ''),
        msgId: String(c.globalMsgId || c.gMsgID || d.msgId || ''),
        cliMsgId: String(c.cliMsgId || c.cMsgID || d.cliMsgId || ''),
        uidFrom: d.uidFrom || null,
        ts: now(),
    };
}

function _attachListener(accountKey, api) {
    const s = _sessions.get(accountKey) || {};
    // chỉ 1 listener / acc — đóng listener cũ nếu có
    try {
        s.listener?.stop?.();
    } catch {}
    const { listener } = api;
    s.listener = listener;
    _sessions.set(accountKey, s);

    listener.on('message', (m) => {
        _bumpEvent(accountKey); // sống = có event → watchdog biết listener còn nhận tin
        try {
            _cb.onMessage?.(_normMessage(accountKey, m));
        } catch (e) {
            console.warn('[web2-zalo-zca] onMessage cb err:', e.message);
        }
    });
    // Realtime phụ trợ: gõ phím, đã xem, đã nhận, thả cảm xúc, thu hồi.
    const _safe = (fn, label) => (e) => {
        _bumpEvent(accountKey);
        try {
            fn(e);
        } catch (err) {
            console.warn(`[web2-zalo-zca] ${label} cb err:`, err.message);
        }
    };
    // Tên event ĐÚNG theo zca-js v2.1.2 (apis/listen.js): message, reaction, undo,
    // typing, seen_messages, delivered_messages (KHÔNG có bản số ít).
    listener.on(
        'typing',
        _safe((e) => _cb.onTyping?.(_normTyping(accountKey, e)), 'typing')
    );
    listener.on(
        'seen_messages',
        _safe((e) => _cb.onSeen?.(_normSeen(accountKey, e)), 'seen')
    );
    listener.on(
        'delivered_messages',
        _safe((e) => _cb.onDelivered?.(_normSeen(accountKey, e)), 'delivered')
    );
    listener.on(
        'reaction',
        _safe((e) => _cb.onReaction?.(_normReaction(accountKey, e)), 'reaction')
    );
    listener.on(
        'undo',
        _safe((e) => _cb.onUndo?.(_normUndo(accountKey, e)), 'undo')
    );
    // Sự kiện NHÓM (vào/rời/đổi tên/ghim…) → tin hệ thống hiển thị giữa khung chat.
    listener.on(
        'group_event',
        _safe((e) => {
            const sys = _normGroupEvent(accountKey, e);
            if (sys) _cb.onMessage?.(sys); // đi qua persist + SSE như tin thường
        }, 'group_event')
    );
    listener.onConnected?.(() => {
        _bumpEvent(accountKey);
        _setStatus(accountKey, 'connected');
    });
    listener.onClosed?.((code, reason) => {
        const cur = _sessions.get(accountKey) || {};
        cur.lastCloseCode = code;
        _sessions.set(accountKey, cur);
        // Chủ động nhường (_yield) / ngắt (disconnect) → giữ nguyên status, KHÔNG đặt
        // 'disconnected', KHÔNG reconnect (tránh ghi đè 'yielded' bởi onclose async).
        if (cur.yielded || cur.disposed) return;
        _setStatus(accountKey, 'disconnected', `closed ${code} ${reason || ''}`);
        _scheduleReconnect(accountKey, code); // tự sống lại (không đợi watchdog)
    });
    listener.onError?.((err) => {
        const cur = _sessions.get(accountKey) || {};
        if (cur.yielded || cur.disposed) return;
        _setStatus(accountKey, 'error', String(err?.message || err).slice(0, 200));
        _scheduleReconnect(accountKey, 1006); // lỗi WS = abnormal → backoff reconnect
    });
    listener.start();
}

async function _afterLogin(accountKey, api, label, opts) {
    const s = _sessions.get(accountKey) || {};
    s.api = api;
    s.qr = null;
    _sessions.set(accountKey, s);

    let self = null;
    let credentials = null;
    try {
        const ctx = api.getContext();
        credentials = {
            imei: ctx.imei,
            userAgent: ctx.userAgent,
            language: ctx.language,
            cookie: ctx.cookie?.toJSON?.()?.cookies || ctx.cookie,
        };
    } catch (e) {
        console.warn('[web2-zalo-zca] getContext err:', e.message);
    }
    try {
        self = await api.fetchAccountInfo();
    } catch (e) {
        console.warn('[web2-zalo-zca] fetchAccountInfo err:', e.message);
    }
    const profile = self?.profile || self || {};
    s.info = {
        uid: profile.userId || profile.uid || null,
        name: profile.displayName || profile.zaloName || label || null,
        avatar: profile.avatar || null,
    };
    _sessions.set(accountKey, s);

    // GUARD: cookie-login chỉ cho TK khớp danh tính phiên trình duyệt. Nếu slot này đã biết uid
    // (đăng nhập trước đó) mà phiên vừa login là uid KHÁC → từ chối, KHÔNG lưu, KHÔNG nghe →
    // tránh "lấy nhầm" 1 phiên Zalo gắn vào slot tài khoản khác (corrupt identity).
    if (opts && opts.expectedUid && s.info.uid && String(s.info.uid) !== String(opts.expectedUid)) {
        _sessions.delete(accountKey); // listener CHƯA attach ở bước này → chỉ cần bỏ session
        const err = new Error(
            `Phiên Zalo trên trình duyệt là tài khoản khác (uid ${s.info.uid}) — không khớp tài khoản này. Đăng nhập đúng tài khoản trên chat.zalo.me rồi thử lại.`
        );
        err.code = 'WRONG_ACCOUNT';
        throw err;
    }

    // LƯU phiên (cookie) lên server (2026-06-29, global always-on): ghi session đã mã
    // hoá vào DB để boot-restore + auto-refresh (giống Pancake relay autoConnect).
    // credentials = {cookie,imei,userAgent,language} trích từ ctx ở trên. Route
    // _saveSession mã hoá at-rest trước khi ghi. credentials null (getContext lỗi) →
    // chỉ cập nhật danh tính, giữ session cũ.
    await _cb.persistSession?.(accountKey, credentials, s.info, label);
    _attachListener(accountKey, api);
    _setStatus(accountKey, 'connected');

    // Lưu creds TRONG RAM + danh tính + reset bộ đếm để watchdog tự re-login khi
    // listener rớt (KHÔNG đọc DB, KHÔNG lưu DB). expectedUid = uid thật vừa login →
    // guard chống re-login nhầm danh tính ở các lần reconnect sau.
    if (credentials) s.creds = credentials;
    s.label = label || s.label;
    s.expectedUid = (opts && opts.expectedUid) || s.info.uid || s.expectedUid || null;
    s.connectedAt = now();
    s.lastEventAt = now();
    s.reconnectAttempt = 0;
    s.consecutiveKicks = 0;
    s.disposed = false;
    s.gaveUp = false;
    s.yielded = false; // login = 1 tab công cụ vừa "lấy phiên" → đang muốn giữ
    s.leaseUntil = now() + LEASE_TTL_MS; // cấp lease ban đầu; heartbeat của tab sẽ gia hạn
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
    _sessions.set(accountKey, s);
    startWatchdog();

    // Sau khi kết nối: route tự sửa lại tên NHÓM (bug cũ lưu tên người nhắn cuối).
    try {
        _cb.onConnected?.(accountKey);
    } catch (e) {
        console.warn('[web2-zalo-zca] onConnected cb err:', e.message);
    }
}

// ── Watchdog: tự sống lại + keepAlive + re-login chủ động ────────────────
// Lên lịch reconnect theo close code. 1006/network = backoff lũy thừa; 3000/3003
// (DuplicateConnection/KickConnection — bị giành phiên) = reconnect chậm + đếm
// liên tiếp, đụng trần KICK_CAP thì nghỉ dài (TK đang mở ở máy khác → tránh "đấu").
// ALWAYS-ON (2026-06-29): tài khoản Zalo GLOBAL luôn online trên server cho cả dự án
// (user chốt: dùng acc riêng, bỏ focus-lease). "Wanted" = chưa bị admin chủ động ngắt
// / xoá (disposed) → watchdog giữ phiên 24/7 + auto-reconnect. KHÔNG còn nhường theo
// lease (chat.zalo.me của acc này sẽ bị đá — chấp nhận, dùng acc phụ riêng cho tool).
function _isWanted(s) {
    return !!s && !s.disposed;
}

function _scheduleReconnect(accountKey, code) {
    const s = _sessions.get(accountKey);
    if (!s || s.reconnecting || s.disposed) return;
    if (!_isWanted(s)) return; // hết lease (user rời tab công cụ) → nhường, KHÔNG re-login
    if (!s.creds) return; // chưa có creds (phiên RAM) → đợi user đăng nhập lại từ trình duyệt
    if (s.reconnectTimer) return; // đã có lịch
    const isKick = code === 3000 || code === 3003;
    let delay;
    if (isKick) {
        s.consecutiveKicks = (s.consecutiveKicks || 0) + 1;
        if (s.consecutiveKicks > KICK_CAP) {
            _setStatus(
                accountKey,
                'kicked',
                'Tài khoản Zalo đang mở ở nơi khác (Zalo Web máy khác?) — tạm dừng kết nối lại'
            );
            s.reconnectTimer = setTimeout(() => {
                const cur = _sessions.get(accountKey);
                if (cur) {
                    cur.consecutiveKicks = 0;
                    cur.reconnectTimer = null;
                }
                _doReconnect(accountKey);
            }, KICK_COOLDOWN_MS);
            if (s.reconnectTimer.unref) s.reconnectTimer.unref();
            _sessions.set(accountKey, s);
            return;
        }
        delay = KICK_RECONNECT_MS;
    } else {
        const attempt = s.reconnectAttempt || 0;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
            s.gaveUp = true; // chờ login lại bằng tay / boot restore — watchdog bỏ qua
            _setStatus(
                accountKey,
                'error',
                'Mất kết nối — cần đăng nhập lại (cookie có thể đã hết hạn)'
            );
            _sessions.set(accountKey, s);
            return;
        }
        delay = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
        s.reconnectAttempt = attempt + 1;
    }
    s.reconnectTimer = setTimeout(() => {
        const cur = _sessions.get(accountKey);
        if (cur) cur.reconnectTimer = null;
        _doReconnect(accountKey);
    }, delay);
    if (s.reconnectTimer.unref) s.reconnectTimer.unref();
    _sessions.set(accountKey, s);
}

async function _doReconnect(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s || s.reconnecting || s.disposed || !s.creds) return;
    if (!_isWanted(s)) return; // lease hết hạn ngay trước khi tới lượt → nhường, đừng login lại
    s.reconnecting = true;
    _sessions.set(accountKey, s);
    _setStatus(accountKey, 'reconnecting'); // SSE web2:zalo:accounts → UI hiện "đang kết nối lại"
    try {
        try {
            s.listener?.stop?.();
        } catch {}
        s.listener = null;
        s.api = null; // cho phép loginWithCredentials không short-circuit "đã kết nối"
        await _sleep(RECONNECT_COOLDOWN_MS); // chờ WS cũ đóng hẳn (tránh tự-kick 3000)
        if (s.disposed) return;
        // Giữ s.reconnecting=true xuyên suốt login (finally mới clear) → chặn close event
        // đồng thời double-schedule. loginWithCredentials KHÔNG gate theo reconnecting.
        await loginWithCredentials(accountKey, s.creds, s.label, { expectedUid: s.expectedUid });
        console.log('[web2-zalo-zca] reconnected', accountKey);
    } catch (e) {
        console.warn('[web2-zalo-zca] reconnect fail', accountKey, e.message);
        _setStatus(accountKey, 'error', 'reconnect: ' + String(e.message).slice(0, 120));
        _scheduleReconnect(accountKey, 1006); // thử lại (có backoff cap + kick cap chặn storm)
    } finally {
        const cur = _sessions.get(accountKey);
        if (cur) cur.reconnecting = false;
    }
}

function startWatchdog() {
    if (_watchdogTimer) return;
    _watchdogTimer = setInterval(_watchdogTick, WATCHDOG_MS);
    if (_watchdogTimer.unref) _watchdogTimer.unref();
    console.log('[web2-zalo-zca] watchdog started (keepAlive + auto-reconnect)');
}

async function _watchdogTick() {
    for (const [key, s] of _sessions.entries()) {
        if (s.disposed || s.reconnecting) continue;
        if (s.yielded) continue; // đã nhường — chờ tab công cụ focus lại (lease) mới giữ phiên
        // Hết lease (không tab công cụ nào focus) → NHƯỜNG: đóng listener, không re-login,
        // để chat.zalo.me dùng được. Đây cũng là failsafe khi tab crash/đóng mà không kịp release.
        if (!_isWanted(s)) {
            if (s.api || s.listener || s.reconnectTimer) _yield(key);
            continue;
        }
        // Per-máy: mỗi phiên trong RAM là account của 1 máy → watchdog chăm MỌI phiên
        // (keepAlive + re-login chủ động + tự sống lại bằng s.creds trong RAM).
        try {
            // Re-login CHỦ ĐỘNG trong cửa sổ zpw_sek (~7 ngày) → cuốn cookie trước khi hết hạn.
            if (s.api && s.connectedAt && now() - s.connectedAt > PROACTIVE_RELOGIN_MS) {
                console.log('[web2-zalo-zca] proactive re-login', key);
                _doReconnect(key);
                continue;
            }
            if (s.api) {
                // keepAlive (presence ping) + liveness: ném/khựng → coi như chết → reconnect.
                await _raceTimeout(s.api.keepAlive(), KEEPALIVE_TIMEOUT_MS);
            } else if (s.creds && !s.gaveUp && s.status !== 'kicked' && !s.reconnectTimer) {
                // Có creds nhưng mất api mà không có lịch reconnect → schedule.
                // gaveUp (đã bỏ cuộc sau MAX_RECONNECT_ATTEMPTS) → chờ login tay, KHÔNG hammer.
                _scheduleReconnect(key, 1006);
            }
        } catch (e) {
            console.warn('[web2-zalo-zca] keepAlive fail → reconnect', key, e.message);
            _scheduleReconnect(key, 1006);
        }
    }
}

// Dừng toàn bộ (graceful shutdown) — nhường phiên cho instance mới + chặn reconnect.
function stopAll() {
    if (_watchdogTimer) {
        clearInterval(_watchdogTimer);
        _watchdogTimer = null;
    }
    for (const [, s] of _sessions.entries()) {
        s.disposed = true;
        clearTimeout(s.reconnectTimer);
        s.reconnectTimer = null;
        try {
            s.listener?.stop?.();
        } catch {}
    }
    console.log('[web2-zalo-zca] stopAll (graceful shutdown)');
}

// ── Đăng nhập QR (khôi phục 2026-06-29) — zca-js loginQR phát sự kiện QR qua onEvent ──
// onEvent(ev): ev.type 0=QRCodeGenerated{data.image base64}, 1=Expired, 2=Scanned
// {data.avatar,display_name}, 3=Declined, 4=GotLoginInfo. Route forward sang SSE để
// trình duyệt vẽ QR. Thành công → _afterLogin (lưu session + nghe realtime, như cookie).
async function loginWithQR(accountKey, label, onEvent, opts) {
    if (!Zalo) throw new Error('zca-js không khả dụng');
    const existing = _sessions.get(accountKey);
    if (existing?.api) return { status: 'connected', alreadyConnected: true };
    if (existing?.connecting) return { status: 'connecting', alreadyConnecting: true };
    const seed = _sessions.get(accountKey) || {};
    seed.connecting = true;
    _sessions.set(accountKey, seed);
    _setStatus(accountKey, 'connecting');
    try {
        const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
        const api = await zalo.loginQR({ language: 'vi' }, (ev) => {
            try {
                onEvent?.(ev);
            } catch (_) {}
        });
        if (!api) throw new Error('QR hết hạn hoặc bị huỷ — chưa đăng nhập được');
        await _afterLogin(accountKey, api, label, opts);
        return { status: 'connected' };
    } catch (e) {
        if (!(e && e.code === 'WRONG_ACCOUNT')) {
            _setStatus(accountKey, 'error', String((e && e.message) || e).slice(0, 120));
        }
        throw e;
    } finally {
        const cur = _sessions.get(accountKey);
        if (cur) delete cur.connecting;
    }
}

// ── Đăng nhập bằng credentials (cookie từ trình duyệt) ──
// opts.expectedUid: chỉ chấp nhận nếu phiên login ra đúng uid này (guard cookie-login slot khác).
async function loginWithCredentials(accountKey, credentials, label, opts) {
    if (!Zalo) throw new Error('zca-js không khả dụng');
    if (!credentials?.cookie || !credentials?.imei || !credentials?.userAgent) {
        throw new Error('Credentials không đủ (cookie/imei/userAgent)');
    }
    const existing = _sessions.get(accountKey);
    if (existing?.api) {
        // Đã kết nối → re-acquire (focus lại) chỉ cần gia hạn lease, KHÔNG login lại (tránh
        // popup "Đổi thiết bị" thừa).
        existing.leaseUntil = now() + LEASE_TTL_MS;
        existing.yielded = false;
        return { status: 'connected', alreadyConnected: true };
    }
    // GUARD chống đăng nhập đua (boot restore vs manual POST cùng accountKey): đặt sentinel
    // `connecting` TRƯỚC khi await zalo.login → caller thứ 2 short-circuit, tránh 2 phiên/2 listener.
    if (existing?.connecting) return { status: 'connecting', alreadyConnecting: true };
    const seed = _sessions.get(accountKey) || {};
    seed.connecting = true;
    _sessions.set(accountKey, seed);
    _setStatus(accountKey, 'connecting');
    try {
        const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
        const api = await zalo.login(credentials);
        await _afterLogin(accountKey, api, label, opts);
        return { status: 'connected' };
    } catch (e) {
        // Login lỗi (cookie hết hạn / sai danh tính) → set 'error' để UI phản ánh đúng
        // (trước đây kẹt 'connecting'). Ném lại cho caller xử lý (route trả 400, _doReconnect backoff).
        if (!(e && e.code === 'WRONG_ACCOUNT')) {
            _setStatus(accountKey, 'error', String((e && e.message) || e).slice(0, 120));
        }
        throw e;
    } finally {
        // _afterLogin/_setStatus dùng cùng entry trong _sessions → chỉ xoá cờ, không ghi đè state.
        const cur = _sessions.get(accountKey);
        if (cur) delete cur.connecting;
    }
}

function _requireApi(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s?.api) throw new Error('Tài khoản Zalo chưa kết nối (' + (s?.status || 'offline') + ')');
    return s.api;
}

// ── Hành động (chỉ personal) ────────────────────────────────────────────
// Lấy {msgId, cliMsgId} từ result api.sendMessage (shape {message:{msgId}, attachment:[]} | {msgId} | [])
function _pickSendIds(res) {
    const m = res?.message || (Array.isArray(res) ? res[0] : res) || {};
    return {
        msgId:
            m.msgId ||
            res?.msgId ||
            (Array.isArray(res?.attachment) ? res.attachment[0]?.msgId : null) ||
            null,
        cliMsgId: m.cliMsgId || res?.cliMsgId || null,
    };
}

// Gửi text (kèm quote/reply + mentions @tag nếu có). quote = SendMessageQuote lấy từ raw
// tin gốc; mentions = [{uid,pos,len}] (Zalo @tag thành viên nhóm — chỉ dùng cho nhóm).
async function send(accountKey, threadId, text, threadType, quote, mentions) {
    const api = _requireApi(accountKey);
    const tt = _tt(threadType);
    const ms = (Array.isArray(mentions) ? mentions : [])
        .filter((m) => m && m.uid && Number.isFinite(m.pos) && Number.isFinite(m.len) && m.len > 0)
        .map((m) => ({ uid: String(m.uid), pos: m.pos | 0, len: m.len | 0 }));
    const buildPayload = (useQuote) => {
        if (useQuote || ms.length) {
            const p = { msg: String(text) };
            if (useQuote) p.quote = quote;
            if (ms.length) p.mentions = ms;
            return p;
        }
        return String(text);
    };
    try {
        const res = await api.sendMessage(buildPayload(!!quote), String(threadId), tt);
        return { success: true, ..._pickSendIds(res), raw: res };
    } catch (e) {
        // Quote bị Zalo từ chối (vd propertyExt/shape tin gốc dựng lại chưa khớp) → gửi LẠI
        // KHÔNG quote để tin vẫn tới (degrade về tin thường, không nuốt tin của user).
        if (quote) {
            const res = await api.sendMessage(buildPayload(false), String(threadId), tt);
            return { success: true, quoteDropped: true, ..._pickSendIds(res), raw: res };
        }
        throw e;
    }
}

// Gửi ảnh/file: sources = [{ data: Buffer, filename, metadata:{totalSize,width?,height?} }].
// api.sendMessage tự upload Buffer lên Zalo CDN + gửi (KHÔNG trả URL → route tự host bytea).
async function sendMedia(accountKey, threadId, sources, caption, threadType) {
    const api = _requireApi(accountKey);
    const tt = _tt(threadType);
    const res = await api.sendMessage(
        { msg: String(caption || ''), attachments: sources },
        String(threadId),
        tt
    );
    return { success: true, ..._pickSendIds(res), raw: res };
}

async function sendSticker(accountKey, threadId, sticker, threadType) {
    const api = _requireApi(accountKey);
    const res = await api.sendSticker(
        { id: Number(sticker.id), cateId: Number(sticker.cateId), type: Number(sticker.type) },
        String(threadId),
        _tt(threadType)
    );
    return { success: true, msgId: res?.msgId || null, raw: res };
}

// Thả cảm xúc (add-only — zca KHÔNG có removeReaction). iconKey = tên enum Reactions (vd 'HEART').
async function react(accountKey, threadId, msgId, cliMsgId, iconKey, threadType) {
    const api = _requireApi(accountKey);
    const icon = Reactions[iconKey] != null ? Reactions[iconKey] : iconKey;
    const res = await api.addReaction(icon, {
        data: { msgId: String(msgId), cliMsgId: String(cliMsgId) },
        threadId: String(threadId),
        type: _tt(threadType),
    });
    return { success: true, msgIds: res?.msgIds || [], raw: res };
}

// Thu hồi tin mình gửi.
async function recall(accountKey, threadId, msgId, cliMsgId, threadType) {
    const api = _requireApi(accountKey);
    const res = await api.undo(
        { msgId: String(msgId), cliMsgId: String(cliMsgId) },
        String(threadId),
        _tt(threadType)
    );
    return { success: true, status: res?.status, raw: res };
}

// Xoá tin ở phía mình (deleteMessage onlyMe=true) — KHÁC recall (thu hồi 2 phía).
// dest cần data{cliMsgId,msgId,uidFrom}. uidFrom = người gửi tin gốc (tin mình gửi → uid mình).
async function deleteForMe(accountKey, { threadId, msgId, cliMsgId, uidFrom, threadType }) {
    const api = _requireApi(accountKey);
    const res = await api.deleteMessage(
        {
            data: {
                cliMsgId: String(cliMsgId || ''),
                msgId: String(msgId || ''),
                uidFrom: String(uidFrom || ''),
            },
            threadId: String(threadId),
            type: _tt(threadType),
        },
        true
    );
    return { success: true, status: res?.status, raw: res };
}

async function forward(accountKey, message, threadIds, threadType) {
    const api = _requireApi(accountKey);
    const ids = (Array.isArray(threadIds) ? threadIds : [threadIds]).map(String);
    const res = await api.forwardMessage({ message: String(message) }, ids, _tt(threadType));
    return { success: true, raw: res };
}

async function sendTyping(accountKey, threadId, threadType) {
    const api = _requireApi(accountKey);
    await api.sendTypingEvent(String(threadId), _tt(threadType));
    return { success: true };
}

// Báo đã xem. messages = mảng raw tin inbound (chứa msgId/cliMsgId/uidFrom/...).
async function sendSeen(accountKey, messages, threadType) {
    const api = _requireApi(accountKey);
    const arr = Array.isArray(messages) ? messages : [messages];
    await api.sendSeenEvent(arr, _tt(threadType));
    return { success: true };
}

// Tìm sticker theo keyword → trả chi tiết (url để render + id/cateId/type để gửi).
async function getStickers(accountKey, keyword) {
    const api = _requireApi(accountKey);
    const ids = await api.getStickers(String(keyword || 'hi'));
    const idArr = (Array.isArray(ids) ? ids : []).slice(0, 40);
    if (!idArr.length) return { success: true, stickers: [] };
    const details = await api.getStickersDetail(idArr).catch(() => []);
    const stickers = (Array.isArray(details) ? details : [])
        .map((s) => ({
            id: s.id,
            cateId: s.cateId,
            type: s.type,
            url: s.stickerWebpUrl || s.stickerUrl || '',
            text: s.text || '',
        }))
        .filter((s) => s.url && s.id);
    return { success: true, stickers };
}

async function getQuickMessages(accountKey) {
    const api = _requireApi(accountKey);
    const r = await api.getQuickMessageList();
    const raw = Array.isArray(r?.items) ? r.items : Array.isArray(r) ? r : [];
    // zca QuickMessage = { id, keyword, message:{title} } → chuẩn {id,keyword,title}
    const items = raw.map((q) => ({
        id: q.id ?? null,
        keyword: q.keyword || '',
        title: (q.message && q.message.title) || q.title || '',
    }));
    return { success: true, items };
}

// Thêm câu trả lời nhanh (keyword gợi nhớ + nội dung tin). zca: addQuickMessage({keyword,title}).
async function addQuickMessage(accountKey, { keyword, title } = {}) {
    const api = _requireApi(accountKey);
    const kw = String(keyword || '').trim();
    const msg = String(title || '').trim();
    if (!kw || !msg) throw new Error('Cần từ khoá và nội dung câu trả lời nhanh');
    const r = await api.addQuickMessage({ keyword: kw, title: msg });
    const it = r?.item || {};
    return {
        success: true,
        item: {
            id: it.id ?? null,
            keyword: it.keyword || kw,
            title: (it.message && it.message.title) || msg,
        },
    };
}

async function getUserInfo(accountKey, uid) {
    const api = _requireApi(accountKey);
    return api.getUserInfo(String(uid));
}

async function findUser(accountKey, phone) {
    const api = _requireApi(accountKey);
    return api.findUser(String(phone));
}

async function getMultiUsersByPhones(accountKey, phones) {
    const api = _requireApi(accountKey);
    return api.getMultiUsersByPhones(Array.isArray(phones) ? phones : [phones]);
}

async function getAllFriends(accountKey) {
    const api = _requireApi(accountKey);
    return api.getAllFriends();
}

async function getAllGroups(accountKey) {
    const api = _requireApi(accountKey);
    return api.getAllGroups();
}

// ── Roster để backfill hội thoại (bạn bè + nhóm) ────────────────────────
// zca-js KHÔNG có API liệt kê hội thoại gần đây / lịch sử 1-1 với người lạ.
// Nên danh sách "tất cả hội thoại cũ" chỉ có thể seed từ danh bạ (bạn) + nhóm;
// tin nhắn của KH lạ sẽ chỉ chảy về realtime qua listener từ thời điểm kết nối.
async function getRoster(accountKey) {
    const api = _requireApi(accountKey);
    const out = { users: [], groups: [] };
    try {
        const fr = await api.getAllFriends();
        const arr = Array.isArray(fr) ? fr : fr?.data || fr?.friends || [];
        out.users = arr
            .map((f) => ({
                uid: String(f.userId || f.uid || f.id || ''),
                name: f.zaloName || f.displayName || f.dName || f.username || '',
                avatar: f.avatar || f.avatar_25 || '',
                phone: f.phoneNumber || f.phone || '',
            }))
            .filter((u) => u.uid);
    } catch (e) {
        console.warn('[web2-zalo-zca] getAllFriends:', e.message);
    }
    try {
        const groups = await api.getAllGroups();
        const verMap = groups?.gridVerMap || {};
        let infoMap = groups?.gridInfoMap || null;
        const ids = Object.keys(infoMap || verMap);
        if (ids.length && !infoMap) {
            const info = await api.getGroupInfo(ids).catch(() => null);
            infoMap = info?.gridInfoMap || {};
        }
        out.groups = ids
            .map((id) => {
                const g = (infoMap && infoMap[id]) || {};
                return {
                    gid: String(id),
                    name: g.name || g.groupName || '',
                    avatar: g.fullAvt || g.avt || g.avatar || '',
                };
            })
            .filter((g) => g.gid);
    } catch (e) {
        console.warn('[web2-zalo-zca] getAllGroups:', e.message);
    }
    return out;
}

function isConnected(accountKey) {
    return !!_sessions.get(accountKey)?.api;
}

async function fetchSelf(accountKey) {
    const api = _requireApi(accountKey);
    return api.fetchAccountInfo();
}

async function getGroupChatHistory(accountKey, groupId, count) {
    const api = _requireApi(accountKey);
    // ⚠ zca-js: getGroupChatHistory(groupId, count) — positional, KHÔNG có lastMsgId.
    return api.getGroupChatHistory(String(groupId), count || 50);
}

// Lịch sử nhóm đã CHUẨN HOÁ (giống tin realtime qua _normMessage) — để quét/backfill
// mã đơn cũ/bị thiếu. Trả { messages:[{content,sentAt,...}], total, more } (more>0 = Zalo
// còn tin cũ hơn nhưng API bản zca-js 2.1.2 KHÔNG có cursor để lấy tiếp).
async function getGroupHistory(accountKey, groupId, count) {
    const res = await getGroupChatHistory(accountKey, groupId, count);
    const arr = Array.isArray(res?.groupMsgs) ? res.groupMsgs : Array.isArray(res) ? res : [];
    const messages = [];
    for (const m of arr) {
        try {
            messages.push(_normMessage(accountKey, m));
        } catch {
            /* bỏ qua tin không parse được (system msg…) */
        }
    }
    return { messages, total: arr.length, more: Number(res?.more) || 0 };
}

// Resolve tên + avatar của thành viên nhóm theo uid (group message dName rỗng).
// Trả { uid: {name, avatar} }.
async function getGroupMembersInfo(accountKey, uids) {
    const api = _requireApi(accountKey);
    const arr = [...new Set((Array.isArray(uids) ? uids : [uids]).map(String).filter(Boolean))];
    if (!arr.length) return {};
    const r = await api.getGroupMembersInfo(arr);
    const profiles = r?.profiles || {};
    const out = {};
    for (const [uid, p] of Object.entries(profiles)) {
        out[uid] = { name: p.zaloName || p.displayName || '', avatar: p.avatar || '' };
    }
    return out;
}

// Lấy tên + avatar NHÓM theo group id (để sửa display_name nhóm bị bug cũ).
// Trả { gid: {name, avatar} } — chỉ những gid resolve được.
async function getGroupsInfo(accountKey, gids) {
    const api = _requireApi(accountKey);
    const ids = [...new Set((Array.isArray(gids) ? gids : [gids]).map(String).filter(Boolean))];
    if (!ids.length) return {};
    // KHÔNG nuốt lỗi: lỗi API/mạng → throw để caller (lazy-heal/repair) KHÔNG đánh
    // dấu info_synced_at (tránh đóng băng tên nhóm sai 6h vì 1 lần lỗi tạm thời).
    const info = await api.getGroupInfo(ids);
    const map = info?.gridInfoMap || {};
    const out = {};
    for (const id of ids) {
        const g = map[id];
        if (!g) continue;
        out[id] = {
            name: g.name || g.groupName || '',
            avatar: g.fullAvt || g.avt || g.avatar || '',
        };
    }
    return out;
}

// Danh sách thành viên NHÓM (uid + tên + avatar) → đổ vào dropdown @tag ô soạn.
// getGroupInfo trả memVerList ['uid_version'] → tách uid → resolve tên (getGroupMembersInfo
// batch 50). Bỏ chính mình. Lỗi → throw để caller fallback (senders trong thread).
async function getGroupMembers(accountKey, gid) {
    const api = _requireApi(accountKey);
    const info = await api.getGroupInfo(String(gid));
    const g = (info?.gridInfoMap || {})[String(gid)] || {};
    const uids = [
        ...new Set(
            (Array.isArray(g.memVerList) ? g.memVerList : [])
                .map((s) => String(s).split('_')[0])
                .filter(Boolean)
        ),
    ];
    if (!uids.length) return [];
    const own = String(getOwnUid(accountKey) || '');
    const out = [];
    for (let i = 0; i < uids.length; i += 50) {
        const batch = uids.slice(i, i + 50);
        const resolved = await getGroupMembersInfo(accountKey, batch).catch(() => ({}));
        for (const uid of batch) {
            if (String(uid) === own) continue;
            const p = resolved[uid] || {};
            out.push({ uid: String(uid), name: p.name || '', avatar: p.avatar || '' });
        }
    }
    return out;
}

// uid của chính tài khoản (để phân biệt tin mình gửi trong nhóm).
function getOwnUid(accountKey) {
    return _sessions.get(accountKey)?.info?.uid || null;
}

function disconnect(accountKey) {
    const s = _sessions.get(accountKey);
    if (s) {
        s.disposed = true; // chặn watchdog tự reconnect sau khi user chủ động ngắt
        clearTimeout(s.reconnectTimer);
        s.reconnectTimer = null;
    }
    try {
        s?.listener?.stop?.();
    } catch {}
    _sessions.delete(accountKey);
    _setStatus(accountKey, 'disconnected');
    return { success: true };
}

// ── Focus-lease API (gọi từ route /lease & /release) ─────────────────────
// touchLease: tab công cụ đang focus → gia hạn lease (giữ phiên). Chỉ tác động phiên
// đã tồn tại trong RAM; KHÔNG tự login (login do browser /login-cookie vì cần creds).
// Trả {connected} để FE biết có cần acquire (login-cookie) hay không.
function touchLease(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s) return { leased: false, connected: false, status: 'offline' };
    if (s.disposed) return { leased: false, connected: false, status: 'disconnected' };
    s.leaseUntil = now() + LEASE_TTL_MS;
    s.yielded = false;
    // Phiên còn creds RAM nhưng rớt (không api) → để watchdog/ scheduleReconnect tự nối lại
    // ngay (đã wanted trở lại). Không api + không creds → cần browser login-cookie.
    if (!s.api && s.creds && !s.reconnecting && !s.reconnectTimer)
        _scheduleReconnect(accountKey, 1006);
    return { leased: true, connected: !!s.api, status: s.status || 'offline' };
}

// _yield: NHƯỜNG phiên cho chat.zalo.me — đóng listener, KHÔNG re-login. Giữ creds/info/
// expectedUid trong RAM để focus lại nối nhanh + guard danh tính. Phiên KHÔNG bị xoá.
function _yield(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s) return { released: false };
    s.yielded = true;
    s.leaseUntil = 0;
    s.reconnectAttempt = 0;
    s.consecutiveKicks = 0;
    clearTimeout(s.reconnectTimer);
    s.reconnectTimer = null;
    try {
        s.listener?.stop?.();
    } catch {}
    s.listener = null;
    s.api = null;
    _setStatus(
        accountKey,
        'yielded',
        'Đã nhường phiên cho chat.zalo.me (không có tab công cụ đang mở)'
    );
    return { released: true };
}

// releaseLease: GLOBAL always-on (2026-06-29) → KHÔNG nhường nữa (tài khoản dùng chung
// cả dự án, luôn online). No-op để các trang còn gọi /release (vd jt-tracking focus-lease
// cũ) KHÔNG ngắt phiên global. _yield giữ lại phòng tương lai nhưng không còn caller.
function releaseLease(accountKey) {
    const s = _sessions.get(accountKey);
    return { released: false, connected: !!(s && s.api), status: (s && s.status) || 'offline' };
}

// Health 1 phiên (cho UI đèn sức khoẻ + observability "không bị văng").
function _health(k, s) {
    return {
        accountKey: k,
        status: s?.status || 'offline',
        info: s?.info || null,
        error: s?.lastError || null,
        hasApi: !!s?.api,
        healthy: s?.status === 'connected' && !!s?.api,
        connectedAt: s?.connectedAt || null,
        lastEventAt: s?.lastEventAt || null,
        lastCloseCode: s?.lastCloseCode || null,
        reconnecting: !!s?.reconnecting,
        consecutiveKicks: s?.consecutiveKicks || 0,
    };
}

function status(accountKey) {
    return _health(accountKey, _sessions.get(accountKey));
}

function statusAll() {
    return [..._sessions.entries()].map(([k, s]) => _health(k, s));
}

// (Boot restore đã GỠ 2026-06-23 — KHÔNG lưu phiên trên server nên không có gì để
// khôi phục lúc boot; user đăng nhập lại bằng phiên chat.zalo.me trên trình duyệt.)

module.exports = {
    configure,
    isAvailable,
    loginWithCredentials,
    loginWithQR,
    send,
    sendMedia,
    sendSticker,
    react,
    recall,
    deleteForMe,
    forward,
    sendTyping,
    sendSeen,
    getStickers,
    getQuickMessages,
    addQuickMessage,
    getUserInfo,
    findUser,
    getMultiUsersByPhones,
    getAllFriends,
    getAllGroups,
    getRoster,
    isConnected,
    fetchSelf,
    getGroupChatHistory,
    getGroupHistory,
    getGroupMembersInfo,
    getGroupMembers,
    getGroupsInfo,
    getOwnUid,
    disconnect,
    touchLease,
    releaseLease,
    status,
    statusAll,
    startWatchdog,
    stopAll,
};
