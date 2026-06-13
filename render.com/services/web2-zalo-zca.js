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
let _libErr = null;
try {
    const zca = require('zca-js');
    Zalo = zca.Zalo;
    ThreadType = zca.ThreadType;
} catch (e) {
    _libErr = e.message;
    console.warn('[web2-zalo-zca] zca-js chưa sẵn sàng:', e.message);
}

const QR_TTL_MS = 5 * 60 * 1000; // QR sống 5 phút

// accountKey → { api, status, qr, info, lastError, startedAt }
const _sessions = new Map();

let _cb = { onMessage: null, onStatus: null, persistSession: null };

function configure(cb) {
    _cb = Object.assign(_cb, cb || {});
}

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

// ── Chuẩn hoá 1 message từ zca-js → shape lưu DB ────────────────────────
function _normMessage(accountKey, m) {
    const isGroup = ThreadType && m?.type === ThreadType.Group;
    const d = m?.data || {};
    let content = d.content;
    let msgType = 'text';
    if (content && typeof content === 'object') {
        // attachment/sticker/photo → giữ raw, lấy title nếu có
        msgType = content.action || content.type || (content.href ? 'link' : 'attachment');
        content =
            content.title ||
            content.description ||
            content.href ||
            JSON.stringify(content).slice(0, 500);
    }
    return {
        accountKey,
        msgId: d.msgId || d.cliMsgId || d.globalMsgId || null,
        threadId: String(m?.threadId || ''),
        threadType: isGroup ? 'group' : 'user',
        direction: m?.isSelf ? 'out' : 'in',
        msgType,
        content: content == null ? '' : String(content),
        senderUid: d.uidFrom || null,
        senderName: d.dName || null,
        sentAt: Number(d.ts) || now(),
        raw: d,
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
        try {
            _cb.onMessage?.(_normMessage(accountKey, m));
        } catch (e) {
            console.warn('[web2-zalo-zca] onMessage cb err:', e.message);
        }
    });
    listener.onConnected?.(() => _setStatus(accountKey, 'connected'));
    listener.onClosed?.((code, reason) =>
        _setStatus(accountKey, 'disconnected', `closed ${code} ${reason || ''}`)
    );
    listener.onError?.((err) =>
        _setStatus(accountKey, 'error', String(err?.message || err).slice(0, 200))
    );
    listener.start();
}

async function _afterLogin(accountKey, api, label) {
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

    try {
        await _cb.persistSession?.(accountKey, credentials, s.info, label);
    } catch (e) {
        console.warn('[web2-zalo-zca] persistSession err:', e.message);
    }
    _attachListener(accountKey, api);
    _setStatus(accountKey, 'connected');
}

// ── Đăng nhập QR (không await — trả ngay, browser poll getQr) ───────────
function startQrLogin(accountKey, label) {
    if (!Zalo) throw new Error('zca-js không khả dụng: ' + (_libErr || 'unknown'));
    const existing = _sessions.get(accountKey);
    if (existing?.api) {
        return { status: 'connected', alreadyConnected: true };
    }
    const s = { status: 'qr_pending', qr: null, startedAt: now(), label };
    _sessions.set(accountKey, s);

    const zalo = new Zalo();
    const cb = (event) => {
        const cur = _sessions.get(accountKey) || {};
        const t = event?.type;
        // LoginQRCallbackEventType: 0 generated, 1 expired, 2 scanned, 3 declined, 4 gotInfo
        if (t === 0) {
            let img = event.data?.image || '';
            if (img && !/^data:/.test(img)) img = 'data:image/png;base64,' + img;
            cur.qr = { image: img, token: event.data?.token, expiresAt: now() + QR_TTL_MS };
            cur.status = 'qr_pending';
        } else if (t === 1) {
            cur.status = 'qr_expired';
            cur.qr = null;
        } else if (t === 2) {
            cur.status = 'scanned';
            cur.scanned = { name: event.data?.display_name, avatar: event.data?.avatar };
        } else if (t === 3) {
            cur.status = 'declined';
        }
        _sessions.set(accountKey, cur);
    };

    zalo.loginQR({}, cb)
        .then((api) => _afterLogin(accountKey, api, label))
        .catch((err) => {
            console.warn('[web2-zalo-zca] loginQR fail', accountKey, err?.message);
            _setStatus(accountKey, 'error', String(err?.message || err).slice(0, 200));
        });

    return { status: 'qr_pending' };
}

// ── Đăng nhập bằng credentials đã lưu (boot restore / manual) ───────────
async function loginWithCredentials(accountKey, credentials, label) {
    if (!Zalo) throw new Error('zca-js không khả dụng');
    if (!credentials?.cookie || !credentials?.imei || !credentials?.userAgent) {
        throw new Error('Credentials không đủ (cookie/imei/userAgent)');
    }
    const existing = _sessions.get(accountKey);
    if (existing?.api) return { status: 'connected', alreadyConnected: true };
    _setStatus(accountKey, 'connecting');
    const zalo = new Zalo();
    const api = await zalo.login(credentials);
    await _afterLogin(accountKey, api, label);
    return { status: 'connected' };
}

function getQr(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s) return { status: 'unknown' };
    return {
        status: s.status,
        image: s.qr?.image || null,
        scanned: s.scanned || null,
        info: s.info || null,
        error: s.lastError || null,
    };
}

function _requireApi(accountKey) {
    const s = _sessions.get(accountKey);
    if (!s?.api) throw new Error('Tài khoản Zalo chưa kết nối (' + (s?.status || 'offline') + ')');
    return s.api;
}

// ── Hành động (chỉ personal) ────────────────────────────────────────────
async function send(accountKey, threadId, text, threadType) {
    const api = _requireApi(accountKey);
    const tt = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    const res = await api.sendMessage(String(text), String(threadId), tt);
    // shape: {msgId, ...} hoặc array
    const msgId =
        res?.msgId || res?.message?.msgId || (Array.isArray(res) ? res[0]?.msgId : null) || null;
    return { success: true, msgId, raw: res };
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

async function fetchSelf(accountKey) {
    const api = _requireApi(accountKey);
    return api.fetchAccountInfo();
}

async function getGroupChatHistory(accountKey, groupId, lastMsgId, count) {
    const api = _requireApi(accountKey);
    return api.getGroupChatHistory({ groupId: String(groupId), lastMsgId, count: count || 50 });
}

function disconnect(accountKey) {
    const s = _sessions.get(accountKey);
    try {
        s?.listener?.stop?.();
    } catch {}
    _sessions.delete(accountKey);
    _setStatus(accountKey, 'disconnected');
    return { success: true };
}

function status(accountKey) {
    const s = _sessions.get(accountKey);
    return {
        accountKey,
        status: s?.status || 'offline',
        info: s?.info || null,
        error: s?.lastError || null,
        hasApi: !!s?.api,
    };
}

function statusAll() {
    return [..._sessions.entries()].map(([k, s]) => ({
        accountKey: k,
        status: s.status || 'offline',
        info: s.info || null,
        error: s.lastError || null,
        hasApi: !!s.api,
    }));
}

// ── Boot restore: re-login mọi acc personal có session đã lưu ───────────
async function restoreAll(accounts) {
    if (!Zalo || !Array.isArray(accounts)) return;
    for (const a of accounts) {
        if (a.account_type !== 'personal' || !a.is_active) continue;
        const creds = a.session;
        if (!creds?.cookie || !creds?.imei) continue;
        try {
            await loginWithCredentials(a.account_key, creds, a.label || a.display_name);
            console.log('[web2-zalo-zca] restored', a.account_key);
        } catch (e) {
            console.warn('[web2-zalo-zca] restore fail', a.account_key, e.message);
            _setStatus(a.account_key, 'error', 'restore: ' + String(e.message).slice(0, 120));
        }
    }
}

module.exports = {
    configure,
    isAvailable,
    startQrLogin,
    loginWithCredentials,
    getQr,
    send,
    getUserInfo,
    findUser,
    getMultiUsersByPhones,
    getAllFriends,
    getAllGroups,
    fetchSelf,
    getGroupChatHistory,
    disconnect,
    status,
    statusAll,
    restoreAll,
};
