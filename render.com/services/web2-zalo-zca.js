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

const QR_TTL_MS = 5 * 60 * 1000; // QR sống 5 phút
const _tt = (threadType) => (threadType === 'group' ? ThreadType.Group : ThreadType.User);

// accountKey → { api, status, qr, info, lastError, startedAt }
const _sessions = new Map();

let _cb = {
    onMessage: null,
    onStatus: null,
    persistSession: null,
    onTyping: null,
    onSeen: null,
    onDelivered: null,
    onReaction: null,
    onUndo: null,
    onConnected: null, // fire khi acc kết nối xong (boot/QR) → route repair tên nhóm
};

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
    const thumb = content.thumb || params.thumbUrl || params.normalUrl || url || '';
    return {
        type: kind,
        url: url || '',
        thumb: thumb || '',
        href: content.href || '',
        title: content.title || content.description || '',
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
        if (att && (att.url || att.thumb || att.href)) attachments.push(att);
        // caption: chỉ giữ title/description (KHÔNG nhét href làm text — sẽ render media)
        if (kind === 'link') text = rawContent.title || rawContent.href || '';
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
        try {
            _cb.onMessage?.(_normMessage(accountKey, m));
        } catch (e) {
            console.warn('[web2-zalo-zca] onMessage cb err:', e.message);
        }
    });
    // Realtime phụ trợ: gõ phím, đã xem, đã nhận, thả cảm xúc, thu hồi.
    const _safe = (fn, label) => (e) => {
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
    // Sau khi kết nối: route tự sửa lại tên NHÓM (bug cũ lưu tên người nhắn cuối).
    try {
        _cb.onConnected?.(accountKey);
    } catch (e) {
        console.warn('[web2-zalo-zca] onConnected cb err:', e.message);
    }
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

    const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
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
    const zalo = new Zalo({ selfListen: true, checkUpdate: false, logging: false });
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

// Gửi text (kèm quote/reply nếu có). quote = SendMessageQuote lấy từ raw tin gốc.
async function send(accountKey, threadId, text, threadType, quote) {
    const api = _requireApi(accountKey);
    const tt = _tt(threadType);
    const payload = quote ? { msg: String(text), quote } : String(text);
    const res = await api.sendMessage(payload, String(threadId), tt);
    return { success: true, ..._pickSendIds(res), raw: res };
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
    return { success: true, items: r?.items || r || [] };
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

async function getGroupChatHistory(accountKey, groupId, lastMsgId, count) {
    const api = _requireApi(accountKey);
    return api.getGroupChatHistory({ groupId: String(groupId), lastMsgId, count: count || 50 });
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
    const info = await api.getGroupInfo(ids).catch(() => null);
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

// uid của chính tài khoản (để phân biệt tin mình gửi trong nhóm).
function getOwnUid(accountKey) {
    return _sessions.get(accountKey)?.info?.uid || null;
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
    sendMedia,
    sendSticker,
    react,
    recall,
    forward,
    sendTyping,
    sendSeen,
    getStickers,
    getQuickMessages,
    getUserInfo,
    findUser,
    getMultiUsersByPhones,
    getAllFriends,
    getAllGroups,
    getRoster,
    isConnected,
    fetchSelf,
    getGroupChatHistory,
    getGroupMembersInfo,
    getGroupsInfo,
    getOwnUid,
    disconnect,
    status,
    statusAll,
    restoreAll,
};
