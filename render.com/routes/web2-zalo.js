// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Zalo single-source API (/api/web2-zalo).
// =====================================================================
// NGUỒN DUY NHẤT mọi dữ liệu + chức năng Zalo của Web 2.0.
// Trang web2/zalo/ + helper Web2Zalo + mọi trang khác đều đi qua đây.
//
// Gồm 2 kênh:
//   • personal (zca-js) → đăng nhập QR/cookie, chat 2 chiều, xem thông tin
//   • oa (official)     → ZNS, tin tư vấn (services/web2-zalo-oa.js)
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (Web 2.0 — KHÔNG ghi Web 1.0).
// Realtime: web2:zalo:messages / web2:zalo:conv:<id> / web2:zalo:accounts.
// =====================================================================

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { ensureWeb2ZaloSchema } = require('../db/web2-zalo-schema');
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');
const zca = require('../services/web2-zalo-zca');
const oa = require('../services/web2-zalo-oa');

// ── Auth gate (BẮT BUỘC) ────────────────────────────────────────────────
// Toàn bộ router Zalo (đọc PII + gửi tin tới KH thật + media) PHẢI qua gate mềm.
// Khi WEB2_AUTH_ENFORCE=1 (đang BẬT) → thiếu/sai x-web2-token = 401, chặn truy
// cập ẩn danh từ Internet (worker proxy pass-through không tự gắn token).
// Route huỷ/quản-lý tài khoản + admin reset thêm requireWeb2Admin (role='admin').
router.use(requireWeb2AuthSoft);

let _pool = null;
const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// ── Idempotency gửi tin (chống double-submit / retry / 2 tab) ───────────
// Khoá theo (accountKey, threadId, cliMsgId) — client gửi cliMsgId ổn định cho
// mỗi lần soạn; nếu trùng (double-click, network retry) → trả lại kết quả cũ,
// KHÔNG gọi zca.send lần 2 (KH không nhận tin trùng). In-process Map + TTL.
const _sendInflight = new Map(); // key → Promise (đang gửi)
const _sendDone = new Map(); // key → { at, result } (đã gửi xong, giữ TTL ngắn)
const SEND_DEDUPE_TTL_MS = 60 * 1000;
function _sendKey(accountKey, threadId, cliMsgId) {
    return `${accountKey || ''}|${threadId || ''}|${cliMsgId || ''}`;
}
function _sweepSendDedupe() {
    const cutoff = now() - SEND_DEDUPE_TTL_MS;
    for (const [k, v] of _sendDone) {
        if (!v || v.at < cutoff) _sendDone.delete(k);
    }
}
// Bọc 1 lần gửi qua guard idempotent. handler() phải trả về object kết quả gửi.
// Trả { duplicate:true, result } nếu trùng key đang/đã gửi trong TTL.
async function _withSendGuard(accountKey, threadId, cliMsgId, handler) {
    // Không có cliMsgId → không thể dedupe an toàn, gửi bình thường.
    if (!cliMsgId) return { duplicate: false, result: await handler() };
    const key = _sendKey(accountKey, threadId, cliMsgId);
    _sweepSendDedupe();
    const done = _sendDone.get(key);
    if (done) return { duplicate: true, result: done.result };
    const inflight = _sendInflight.get(key);
    if (inflight) return { duplicate: true, result: await inflight };
    const p = (async () => handler())();
    _sendInflight.set(key, p);
    try {
        const result = await p;
        _sendDone.set(key, { at: now(), result });
        return { duplicate: false, result };
    } finally {
        _sendInflight.delete(key);
    }
}

// ── SSE notifier plumbing ───────────────────────────────────────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(topic, action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(topic, { action, code: code || null, ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-ZALO] _notify failed:', e.message);
    }
}

// ── Nhóm được THEO DÕI (allowlist) — opt-in, MẶC ĐỊNH TẮT ──────────────
// Cache in-memory để _persistIncoming (firehose) khỏi query DB mỗi tin.
// ⚠ 2026-06-22 (user "bỏ giới hạn hiện group"): allowlist MẶC ĐỊNH TẮT →
// HIỆN/LƯU TẤT CẢ nhóm + hội thoại 1-1 (full Zalo như app thật). Bảng
// web2_zalo_tracked_groups + route /tracked-groups GIỮ LẠI làm opt-in tương lai
// (vd "nhóm ưu tiên") — CHỈ lọc khi env WEB2_ZALO_GROUP_ALLOWLIST=1. Không xoá
// capability, chỉ đổi default. (Trước đây ≥1 row = lọc → chỉ 2 nhóm hiển thị.)
const _ALLOWLIST_ON = process.env.WEB2_ZALO_GROUP_ALLOWLIST === '1';
let _trackedSet = new Set();
let _filterActive = false;
const _tk = (accountKey, threadId) => `${accountKey || ''}\u0000${threadId || ''}`;
async function _loadTracked() {
    if (!_pool) return;
    try {
        const { rows } = await _pool.query(
            `SELECT account_key, thread_id FROM web2_zalo_tracked_groups`
        );
        _trackedSet = new Set(rows.map((r) => _tk(r.account_key, r.thread_id)));
        // Chỉ lọc khi BẬT env opt-in (mặc định: hiện TẤT CẢ nhóm + hội thoại).
        _filterActive = _ALLOWLIST_ON && _trackedSet.size > 0;
    } catch (e) {
        console.warn('[WEB2-ZALO] loadTracked failed:', e.message);
    }
}

// Cache account_key của TK cá nhân CHÍNH (is_primary). zca service hỏi qua callback
// `isPrimary` để biết TK nào được watchdog chăm + tự reconnect (chỉ TK chính). Cache
// refresh 60s cùng _loadTracked + cập nhật NGAY khi đổi TK chính (route /primary).
let _primaryKey = null;

// Cập nhật cache TK chính. KHÔNG lưu phiên trên server nên KHÔNG tự kết nối — chỉ
// đảm bảo LUÔN có 1 TK mang cờ is_primary (để gửi tin KH 1-1 + gate watchdog). User
// tự kết nối TK chính bằng "Đăng nhập Zalo" (phiên chat.zalo.me trên trình duyệt).
async function _loadPrimaryKey() {
    if (!_pool) return;
    try {
        let key = await _getPrimaryKey(_pool);
        if (!key) {
            // TỰ LÀNH cờ: chưa có TK chính (vd bị xoá) nhưng còn TK cá nhân active →
            // tự phong CỜ is_primary cho 1 TK (ưu tiên đang connected → mới nối → cũ nhất).
            const { rows } = await _pool.query(
                `UPDATE web2_zalo_accounts SET is_primary=true, updated_at=$1
                   WHERE account_key = (
                     SELECT account_key FROM web2_zalo_accounts
                      WHERE account_type='personal' AND is_active=true
                      ORDER BY (status='connected') DESC, last_connected_at DESC NULLS LAST, created_at ASC
                      LIMIT 1)
                   AND NOT EXISTS (
                     SELECT 1 FROM web2_zalo_accounts WHERE is_primary=true AND account_type='personal')
                 RETURNING account_key`,
                [now()]
            );
            key = rows[0]?.account_key || null;
            if (key) {
                console.log('[WEB2-ZALO] auto-promoted primary (flag only):', key);
                _notify('web2:zalo:accounts', 'update', key);
            }
        }
        _primaryKey = key;
    } catch (e) {
        console.warn('[WEB2-ZALO] loadPrimaryKey failed:', e.message);
    }
}

// ── Strip dữ liệu nhạy cảm trước khi trả client ─────────────────────────
// live = object health từ zca.statusAll() (hoặc undefined). Surface health cho UI
// đèn sức khoẻ + cảnh báo "không bị văng" (reconnecting / kicked / lastEventAt).
function _safeAccount(a, live) {
    return {
        id: a.id,
        accountKey: a.account_key,
        accountType: a.account_type,
        label: a.label,
        zaloUid: a.zalo_uid,
        oaId: a.oa_id,
        displayName: a.display_name,
        avatarUrl: a.avatar_url,
        proxyUrl: a.proxy_url ? '••• đã set' : null,
        hasSession: !!a.session,
        hasToken: !!a.access_token,
        tokenExpires: a.token_expires,
        status: live?.status || a.status,
        statusMsg: live?.error || a.status_msg,
        isActive: a.is_active,
        isPrimary: !!a.is_primary, // TK cá nhân CHÍNH gửi tin KH 1-1
        lastConnectedAt: a.last_connected_at,
        // Health watchdog (chỉ personal có live): cho UI hiện đèn + cảnh báo.
        health: live
            ? {
                  healthy: !!live.healthy,
                  reconnecting: !!live.reconnecting,
                  lastEventAt: live.lastEventAt || null,
                  lastCloseCode: live.lastCloseCode || null,
                  consecutiveKicks: live.consecutiveKicks || 0,
                  connectedAt: live.connectedAt || null,
              }
            : null,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
    };
}

// account_key của TK cá nhân CHÍNH (gửi tin KH 1-1). null nếu chưa đặt → caller fallback hành vi cũ.
async function _getPrimaryKey(db) {
    try {
        const { rows } = await db.query(
            `SELECT account_key FROM web2_zalo_accounts WHERE is_primary=true AND account_type='personal' LIMIT 1`
        );
        return rows[0]?.account_key || null;
    } catch {
        return null;
    }
}

// =====================================================================
// zca callbacks → persist + SSE (chạy trong process, không relay hop)
// =====================================================================
zca.configure({
    onMessage: (msg) => {
        _persistIncoming(msg).catch((e) => console.warn('[WEB2-ZALO] persist msg:', e.message));
    },
    onStatus: (accountKey, status, txt) => {
        _updateAccStatus(accountKey, status, txt).catch(() => {});
    },
    persistSession: async (accountKey, creds, info, label) => {
        await _saveSession(accountKey, creds, info, label);
    },
    onReaction: (e) =>
        _persistReaction(e).catch((er) => console.warn('[WEB2-ZALO] react:', er.message)),
    onUndo: (e) => _persistRecall(e).catch((er) => console.warn('[WEB2-ZALO] undo:', er.message)),
    onSeen: (e) => _persistSeen(e).catch((er) => console.warn('[WEB2-ZALO] seen:', er.message)),
    onTyping: (e) => _notifyThread(e.accountKey, e.threadId, 'typing', e.senderUid),
    // Kết nối xong (boot restore / quét QR) → tự sửa lại tên NHÓM (bug cũ lưu tên
    // người nhắn cuối). Chạy nền, không chặn luồng kết nối.
    onConnected: (accountKey) => {
        _repairConvNames(accountKey)
            .then((n) => {
                if (n) console.log(`[WEB2-ZALO] repaired ${n} conv name(s) for ${accountKey}`);
            })
            .catch((e) => console.warn('[WEB2-ZALO] repairConvNames:', e.message));
    },
    // zca hỏi TK nào là CHÍNH → chỉ TK chính được watchdog chăm + tự reconnect.
    isPrimary: (accountKey) => !!_primaryKey && accountKey === _primaryKey,
});

// TTL refresh tên/avatar khi mở chat (tránh gọi zca mỗi lần mở).
const GROUP_NAME_TTL_MS = 6 * 60 * 60 * 1000;
// Trần số USER thread sửa 1 lượt (getUserInfo từng cái → chặn runaway).
const MAX_USER_REPAIR = 200;
const ZCA_RESOLVE_TIMEOUT_MS = 2000;

// zca chậm KHÔNG được nghẽn (kể cả vòng repair nền) → bọc timeout.
function _withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
}

// Sửa tận gốc tên hội thoại bị bug cũ (NHÓM lẫn USER): lấy tên + avatar thật từ
// zca, FORCE ghi đè display_name. Idempotent. Trả số hội thoại đã sửa.
//   • NHÓM: getGroupsInfo theo batch 50 (force toàn bộ).
//   • USER: conv bị nhiễm (tên NULL / == tên SHOP / shop nhắn cuối chưa heal) →
//     getUserInfo(thread_id). ⚠ Resolve theo THREAD_ID (= uid KHÁCH cho 1-1),
//     KHÔNG theo zalo_uid (có thể đã bị nhiễm = uid SHOP cho conv tạo từ tin gửi đi).
async function _repairConvNames(accountKey) {
    if (!_pool || !accountKey || !zca.isConnected(accountKey)) return 0;
    let fixed = 0;
    const ownName =
        (
            await _pool
                .query(`SELECT display_name FROM web2_zalo_accounts WHERE account_key=$1`, [
                    accountKey,
                ])
                .catch(() => ({ rows: [] }))
        ).rows[0]?.display_name || null;

    // ── NHÓM ────────────────────────────────────────────────────────────────
    const gRows = (
        await _pool.query(
            `SELECT thread_id FROM web2_zalo_conversations WHERE account_key=$1 AND thread_type='group'`,
            [accountKey]
        )
    ).rows;
    const gids = gRows.map((r) => String(r.thread_id)).filter(Boolean);
    for (let i = 0; i < gids.length; i += 50) {
        const batch = gids.slice(i, i + 50);
        let info;
        try {
            info = await _withTimeout(zca.getGroupsInfo(accountKey, batch), ZCA_RESOLVE_TIMEOUT_MS);
        } catch (e) {
            continue; // best-effort: lỗi/timeout → bỏ qua đợt này, KHÔNG stamp
        }
        const ts = now();
        for (const gid of batch) {
            const g = info[gid];
            const nm = (g?.name || '').trim();
            const av = g?.avatar || '';
            if (!nm && !av) {
                await _pool
                    .query(
                        `UPDATE web2_zalo_conversations SET info_synced_at=$2 WHERE account_key=$1 AND thread_id=$3`,
                        [accountKey, ts, gid]
                    )
                    .catch(() => {});
                continue;
            }
            await _pool.query(
                `UPDATE web2_zalo_conversations
                    SET display_name=COALESCE($3,display_name), avatar_url=COALESCE($4,avatar_url),
                        info_synced_at=$5, updated_at=$5
                  WHERE account_key=$1 AND thread_id=$2`,
                [accountKey, gid, nm || null, av || null, ts]
            );
            fixed++;
        }
    }

    // ── USER bị nhiễm: tên NULL, hoặc == tên SHOP, hoặc shop nhắn cuối chưa heal ──
    //    (điều kiện cuối bắt cả trường hợp dName lúc gửi ≠ display_name account.)
    const uRows = (
        await _pool.query(
            `SELECT thread_id FROM web2_zalo_conversations
              WHERE account_key=$1 AND thread_type='user'
                AND (display_name IS NULL
                     OR ($2::text IS NOT NULL AND display_name=$2)
                     OR (last_msg_sender_uid='me' AND info_synced_at IS NULL))
              LIMIT $3`,
            [accountKey, ownName, MAX_USER_REPAIR]
        )
    ).rows;
    for (const r of uRows) {
        const uid = String(r.thread_id); // thread_id = uid KHÁCH cho 1-1
        let prof;
        try {
            prof = _pickProfile(
                await _withTimeout(zca.getUserInfo(accountKey, uid), ZCA_RESOLVE_TIMEOUT_MS),
                uid
            );
        } catch (e) {
            continue; // lỗi/timeout → KHÔNG stamp, thử lại lần sau
        }
        const nm = (prof?.zaloName || prof?.displayName || '').trim();
        const av = prof?.avatar || '';
        if (!nm && !av) continue; // resolve rỗng → KHÔNG stamp (giữ row đủ điều kiện retry)
        const ts = now();
        // FORCE tên KHÁCH + self-correct zalo_uid về thread_id (xoá uid SHOP bị nhiễm).
        await _pool
            .query(
                `UPDATE web2_zalo_conversations
                    SET display_name=COALESCE($3,display_name), avatar_url=COALESCE($4,avatar_url),
                        zalo_uid=$2, info_synced_at=$5, updated_at=$5
                  WHERE account_key=$1 AND thread_id=$2`,
                [accountKey, uid, nm || null, av || null, ts]
            )
            .catch(() => {});
        if (nm) fixed++;
    }

    if (fixed) _notify('web2:zalo:messages', 'update', accountKey);
    return fixed;
}

// Preview ngắn cho danh sách hội thoại (media → nhãn tiếng Việt)
const _MEDIA_LABEL = {
    image: '[Hình ảnh]',
    gif: '[Ảnh động]',
    sticker: '[Sticker]',
    video: '[Video]',
    voice: '[Tin nhắn thoại]',
    file: '[Tệp đính kèm]',
    location: '[Vị trí]',
    contact: '[Danh thiếp]',
    attachment: '[Đính kèm]',
};
function _msgPreview(msg) {
    if (!msg.msgType || msg.msgType === 'text' || msg.msgType === 'link')
        return (msg.content || (msg.msgType === 'link' ? '[Liên kết]' : '')).slice(0, 500);
    const cap = (msg.content || '').trim();
    const label = _MEDIA_LABEL[msg.msgType] || '[Đính kèm]';
    return (cap ? `${label} ${cap}` : label).slice(0, 500);
}

async function _persistIncoming(msg) {
    if (!_pool || !msg?.threadId) return;
    // Allowlist: khi filter BẬT, chỉ lưu tin của nhóm được theo dõi. Tin các
    // hội thoại khác (1-1, nhóm ngoài danh sách) bị bỏ qua hoàn toàn.
    if (_filterActive && !_trackedSet.has(_tk(msg.accountKey, msg.threadId))) return;
    const ts = now();
    // 1) INSERT message TRƯỚC (dedup theo msg_id) → biết tin có thật sự mới không.
    //    Tránh cộng unread 2 lần khi cùng 1 tin tới lặp (webhook/relay double-fire).
    const ins = await _pool.query(
        `INSERT INTO web2_zalo_messages
            (msg_id, cli_msg_id, account_key, thread_id, thread_type, direction, msg_type, content, attachments,
             reply_to_msg_id, reply_to_preview, sender_uid, send_status, sent_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,'sent',$13,$14)
         ON CONFLICT DO NOTHING RETURNING id`,
        [
            msg.msgId,
            msg.cliMsgId || null,
            msg.accountKey,
            msg.threadId,
            msg.threadType || 'user',
            msg.direction,
            msg.msgType || 'text',
            msg.content || '',
            JSON.stringify(Array.isArray(msg.attachments) ? msg.attachments : []),
            msg.replyTo?.msgId || null,
            msg.replyTo?.preview || null,
            msg.senderUid || null,
            msg.sentAt || ts,
            ts,
        ]
    );
    const isNew = ins.rowCount > 0;
    // Chỉ cộng unread khi tin có msg_id (đã được dedup bởi uq_web2_zalo_msg_id).
    // Tin thiếu msg_id KHÔNG có chỉ mục dedup (partial index WHERE msg_id IS NOT NULL)
    // → ON CONFLICT DO NOTHING luôn INSERT lại khi relay/webhook double-fire, khiến
    // isNew=true mỗi lần và đẩy unread tăng sai. Gate theo msg_id để counter ổn định.
    const unreadDelta = isNew && msg.direction === 'in' && msg.msgId ? 1 : 0;
    // 2) upsert conversation — chỉ cộng unread khi tin THỰC SỰ mới.
    //    ⚠ Tên/identity hội thoại CHỈ lấy từ tin ĐẾN (in) của USER thread:
    //    - NHÓM: tên = tên NHÓM (sync/getGroupInfo), KHÔNG đụng.
    //    - USER + tin GỬI ĐI (out/isSelf): senderName/uid là của SHOP → KHÔNG được
    //      làm tên/uid hội thoại (nếu không, shop nhắn cuối → tên KH bị thành tên shop).
    const useSender = msg.threadType !== 'group' && msg.direction === 'in';
    const convName = useSender ? msg.senderName || null : null;
    const convUid = useSender ? msg.senderUid || null : null;
    const lastSenderUid = msg.direction === 'out' ? 'me' : msg.senderUid || null;
    const { rows } = await _pool.query(
        `INSERT INTO web2_zalo_conversations
            (account_key, thread_id, thread_type, zalo_uid, display_name, last_msg_at, last_msg_text,
             unread_count, last_msg_sender_uid, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$6)
         ON CONFLICT (account_key, thread_id) DO UPDATE SET
            last_msg_at=$6, last_msg_text=$7,
            unread_count=web2_zalo_conversations.unread_count + $8,
            last_msg_sender_uid=$9,
            display_name=COALESCE(EXCLUDED.display_name, web2_zalo_conversations.display_name),
            zalo_uid=COALESCE(web2_zalo_conversations.zalo_uid, EXCLUDED.zalo_uid),
            updated_at=$6`,
        [
            msg.accountKey,
            msg.threadId,
            msg.threadType || 'user',
            convUid,
            convName,
            ts,
            _msgPreview(msg),
            unreadDelta,
            lastSenderUid,
        ]
    );
    // Chỉ broadcast khi tin mới (tránh refetch thừa khi tin lặp).
    if (isNew) {
        _notify('web2:zalo:messages', msg.direction === 'in' ? 'create' : 'update', msg.msgId);
        if (msg.threadId) _notify(`web2:zalo:thread:${msg.threadId}`, 'message', msg.msgId);
        // Auto-ingest mã vận đơn J&T (12 số) trong tin nhóm → trang Tra cứu vận đơn
        // tự thêm + cập nhật realtime (không cần Quét/refresh). Fire-and-forget.
        if (msg.threadType === 'group') {
            try {
                require('./web2-jt-tracking')
                    .autoIngestFromZalo(_pool, msg)
                    .catch(() => {});
            } catch (e) {
                /* module chưa sẵn sàng — bỏ qua */
            }
        }
    }
}

// Thread-keyed topic cho realtime conv-level (typing/reaction/recall/seen) —
// không cần lookup conv id từ threadId.
function _notifyThread(accountKey, threadId, action, code) {
    if (threadId) _notify(`web2:zalo:thread:${threadId}`, action, code);
}

// zca reaction VALUE (vd '/-heart') → emoji, để client render chip nhất quán
// với reaction shop tự thả (vốn lưu emoji). Emoji (non-ASCII) thì giữ nguyên.
const _ZCA_VALUE_EMOJI = {
    '/-heart': '❤️',
    '/-strong': '👍',
    ':>': '😆',
    ':o': '😮',
    ':-((': '😢',
    ':-h': '😡',
    ':-*': '😘',
    '--b': '😞',
    '/-ok': '👌',
    '/-no': '🙅',
    '/-rose': '🌹',
    '/-break': '💔',
    '/-weak': '👎',
    ":')": '😂',
    ':((': '😢',
    ':))': '😆',
    '/-beer': '🍺',
    '/-thanks': '🙏',
    '/-loveu': '😍',
    ';xx': '😍',
};
function _iconToEmoji(icon) {
    if (!icon) return '👍';
    if (_ZCA_VALUE_EMOJI[icon]) return _ZCA_VALUE_EMOJI[icon];
    return /[^\x00-\x7F]/.test(icon) ? icon : '👍'; // có ký tự unicode = emoji sẵn
}

// Inbound: KH thả cảm xúc lên tin (add-only). reactions JSONB = {emoji: [uid,...]}.
// ATOMIC: 1 UPDATE tự đọc-ghi dưới row lock (READ COMMITTED) → không mất reaction
// khi 2 event tới gần nhau (KH + shop). jsonb_set + append-distinct.
async function _persistReaction(e) {
    if (!_pool || !e.msgId || !e.icon) return;
    const emoji = _iconToEmoji(e.icon);
    const uid = String(e.uidFrom || 'kh');
    const { rowCount } = await _pool.query(
        `UPDATE web2_zalo_messages
            SET reactions = jsonb_set(
                COALESCE(reactions, '{}'::jsonb),
                ARRAY[$4::text],
                (SELECT to_jsonb(array_agg(v)) FROM (
                    SELECT jsonb_array_elements_text(COALESCE(reactions->$4, '[]'::jsonb)) AS v
                    UNION SELECT $5::text
                ) s),
                true)
          WHERE account_key=$1 AND (msg_id=$2 OR cli_msg_id=$3)`,
        [e.accountKey, e.msgId, e.cliMsgId || '', emoji, uid]
    );
    if (rowCount) _notifyThread(e.accountKey, e.threadId, 'reaction', e.msgId);
}

// Inbound/own: thu hồi tin.
async function _persistRecall(e) {
    if (!_pool || (!e.msgId && !e.cliMsgId)) return;
    await _pool.query(
        `UPDATE web2_zalo_messages SET recalled=true, recalled_at=$1, recalled_by=$2
          WHERE account_key=$3 AND (msg_id=$4 OR cli_msg_id=$5)`,
        [now(), e.uidFrom || null, e.accountKey, e.msgId || '', e.cliMsgId || '']
    );
    _notifyThread(e.accountKey, e.threadId, 'recall', e.msgId || e.cliMsgId);
}

// Inbound: KH đã xem → đánh dấu mọi tin OUT chưa seen trong thread.
async function _persistSeen(e) {
    if (!_pool || !e.threadId) return;
    await _pool.query(
        `UPDATE web2_zalo_messages SET seen_at=$1
          WHERE account_key=$2 AND thread_id=$3 AND direction='out' AND seen_at IS NULL`,
        [now(), e.accountKey, e.threadId]
    );
    _notifyThread(e.accountKey, e.threadId, 'seen', e.threadId);
}

async function _updateAccStatus(accountKey, status, txt) {
    if (!_pool) return;
    await _pool.query(
        `UPDATE web2_zalo_accounts SET status=$1, status_msg=$2, updated_at=$3,
            last_connected_at = CASE WHEN $1='connected' THEN $3 ELSE last_connected_at END
          WHERE account_key=$4`,
        [status, txt || null, now(), accountKey]
    );
    _notify('web2:zalo:accounts', 'update', accountKey);
}

// Sau khi đăng nhập (cookie từ trình duyệt) → CHỈ cập nhật DANH TÍNH TK (uid/tên/
// avatar/status) để UI hiện tên. KHÔNG lưu cookie/phiên lên server (2026-06-23):
// cột `session` luôn = NULL. Phiên chỉ sống trong RAM (zca s.creds) trong uptime.
// (Tham số `creds` được zca truyền null — bỏ qua, giữ chữ ký callback persistSession.)
async function _saveSession(accountKey, _creds, info, label) {
    if (!_pool) throw new Error('DB pool chưa sẵn sàng (cold-start)');
    await _pool.query(
        `UPDATE web2_zalo_accounts SET
            session=NULL, zalo_uid=COALESCE($1, zalo_uid),
            display_name=COALESCE($2, display_name), avatar_url=COALESCE($3, avatar_url),
            status='connected', status_msg=NULL, last_connected_at=$4, updated_at=$4
          WHERE account_key=$5`,
        [info?.uid || null, info?.name || label || null, info?.avatar || null, now(), accountKey]
    );
    _notify('web2:zalo:accounts', 'update', accountKey);
}

// =====================================================================
// STATUS — tổng quan kênh Zalo
// =====================================================================
router.get('/status', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_accounts WHERE is_active=true ORDER BY account_type, updated_at DESC`
        );
        const live = Object.fromEntries(zca.statusAll().map((s) => [s.accountKey, s]));
        const accounts = rows.map((a) => _safeAccount(a, live[a.account_key]));
        res.json({
            success: true,
            zcaAvailable: zca.isAvailable(),
            accounts,
            personalCount: rows.filter((a) => a.account_type === 'personal').length,
            oaCount: rows.filter((a) => a.account_type === 'oa').length,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================================
// ACCOUNTS
// =====================================================================
router.get('/accounts', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_accounts ORDER BY account_type, updated_at DESC`
        );
        const live = Object.fromEntries(zca.statusAll().map((s) => [s.accountKey, s]));
        res.json({
            success: true,
            data: rows.map((a) => _safeAccount(a, live[a.account_key])),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Tạo shell tài khoản personal (chưa đăng nhập)
router.post('/accounts', async (req, res) => {
    try {
        const db = getDb(req);
        const { label } = req.body || {};
        const key = 'zca_' + crypto.randomUUID();
        const ts = now();
        const { rows } = await db.query(
            `INSERT INTO web2_zalo_accounts (account_key, account_type, label, status, is_active, created_at, updated_at)
             VALUES ($1,'personal',$2,'disconnected',true,$3,$3) RETURNING *`,
            [key, (label || 'Tài khoản Zalo').slice(0, 200), ts]
        );
        _notify('web2:zalo:accounts', 'create', key);
        res.json({ success: true, data: _safeAccount(rows[0]) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// (Đăng nhập QR + "Kết nối lại bằng session đã lưu" đã GỠ 2026-06-23 — KHÔNG lưu
// phiên trên server. Đăng nhập DUY NHẤT qua /login-cookie: phiên chat.zalo.me sống
// trên trình duyệt + tiện ích N2Store. "Kết nối lại" = bấm "Đăng nhập Zalo" lại.)

// "Đăng nhập Zalo" 1-click: client (qua extension) gửi {cookie, imei, userAgent} của phiên
// chat.zalo.me → login zca-js bằng cookie (KHÔNG cần quét QR). _afterLogin tự lưu session +
// set status connected + SSE. Cookie sai/hết hạn → zalo.login throw → 400 (client báo lỗi).
router.post('/accounts/:key/login-cookie', async (req, res) => {
    try {
        const db = getDb(req);
        const { cookie, imei, userAgent, silent } = req.body || {};
        if (!cookie || !imei || !userAgent)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu cookie/imei/userAgent (phiên Zalo Web)' });
        const { rows } = await db.query(`SELECT * FROM web2_zalo_accounts WHERE account_key=$1`, [
            req.params.key,
        ]);
        if (!rows[0])
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
        if (rows[0].account_type !== 'personal')
            return res
                .status(400)
                .json({ success: false, error: 'Chỉ tài khoản cá nhân mới đăng nhập kiểu này' });
        // Tự gia hạn NỀN (silent) chỉ cho TK CHÍNH — chặn frontend (kể cả bản cache cũ)
        // tự kết nối lại TK phụ "refresh liên tục". Đăng nhập TAY (silent=false) vẫn nối được.
        if (silent && req.params.key !== _primaryKey) {
            return res.json({
                success: true,
                skipped: true,
                reason: 'not_primary',
                message: 'TK phụ — không tự kết nối nền (đặt làm chính nếu muốn giữ kết nối)',
            });
        }
        const creds = { cookie, imei, userAgent, language: 'vi' };
        const r = await zca.loginWithCredentials(
            req.params.key,
            creds,
            rows[0].label || rows[0].display_name,
            { expectedUid: rows[0].zalo_uid || null } // guard: chặn login nhầm danh tính khác
        );
        res.json({ success: true, ...r });
    } catch (e) {
        const wrong = e && e.code === 'WRONG_ACCOUNT';
        res.status(400).json({
            success: false,
            error: wrong ? e.message : 'Đăng nhập Zalo lỗi: ' + (e.message || 'phiên không hợp lệ'),
        });
    }
});

router.post('/accounts/:key/disconnect', requireWeb2Admin, async (req, res) => {
    try {
        zca.disconnect(req.params.key);
        await getDb(req).query(
            `UPDATE web2_zalo_accounts SET status='disconnected', updated_at=$1 WHERE account_key=$2`,
            [now(), req.params.key]
        );
        _notify('web2:zalo:accounts', 'update', req.params.key);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Đặt 1 TK cá nhân làm CHÍNH. is_primary quyết định TK gửi tin KH 1-1 VÀ TK được
// hệ thống tự kết nối + giữ kết nối (watchdog). "Đặt làm chính thì MỚI kết nối với
// TK đó": ngắt các TK cá nhân khác đang nối (giữ đúng 1 TK), rồi kết nối TK chính.
router.post('/accounts/:key/primary', async (req, res) => {
    try {
        const db = getDb(req);
        const key = req.params.key;
        const { rows } = await db.query(
            `SELECT account_type, session, label, display_name, zalo_uid FROM web2_zalo_accounts WHERE account_key=$1`,
            [key]
        );
        if (!rows[0])
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
        if (rows[0].account_type !== 'personal')
            return res
                .status(400)
                .json({ success: false, error: 'Chỉ tài khoản cá nhân mới làm TK chính được' });
        // Atomic: bỏ cờ mọi TK rồi set cờ TK này.
        await db.query(
            `UPDATE web2_zalo_accounts SET is_primary = (account_key=$1), updated_at=$2`,
            [key, now()]
        );
        _primaryKey = key; // cập nhật cache NGAY → zca callback isPrimary đúng tức thì

        // Ngắt các TK cá nhân KHÁC đang kết nối (chỉ giữ 1 TK chính).
        try {
            const others = await db.query(
                `SELECT account_key FROM web2_zalo_accounts
                 WHERE account_type='personal' AND account_key<>$1
                   AND status IN ('connected','connecting','reconnecting')`,
                [key]
            );
            for (const o of others.rows) {
                try {
                    zca.disconnect(o.account_key);
                } catch {}
                await db
                    .query(
                        `UPDATE web2_zalo_accounts SET status='disconnected', updated_at=$1 WHERE account_key=$2`,
                        [now(), o.account_key]
                    )
                    .catch(() => {});
                _notify('web2:zalo:accounts', 'update', o.account_key);
            }
        } catch (e) {
            console.warn('[WEB2-ZALO] primary: disconnect others:', e.message);
        }

        // KHÔNG lưu phiên trên server → không tự kết nối được. User bấm "Đăng nhập
        // Zalo" trên TK chính (phiên chat.zalo.me trên trình duyệt) để nối realtime.
        _notify('web2:zalo:accounts', 'update', key);
        res.json({ success: true, accountKey: key, connecting: false });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/accounts/:key', requireWeb2Admin, async (req, res) => {
    try {
        const wasPrimary = req.params.key === _primaryKey;
        zca.disconnect(req.params.key);
        await getDb(req).query(`DELETE FROM web2_zalo_accounts WHERE account_key=$1`, [
            req.params.key,
        ]);
        _notify('web2:zalo:accounts', 'deleted', req.params.key);
        // Xoá TK chính → tự phong CỜ TK chính mới cho TK cá nhân còn lại (để gửi 1-1).
        // KHÔNG tự kết nối (không lưu phiên) — user "Đăng nhập Zalo" để nối.
        if (wasPrimary) {
            _primaryKey = null;
            await _loadPrimaryKey();
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Thông tin tài khoản mình (live)
router.get('/accounts/:key/self', async (req, res) => {
    try {
        res.json({ success: true, data: await zca.fetchSelf(req.params.key) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.get('/accounts/:key/friends', async (req, res) => {
    try {
        res.json({ success: true, data: await zca.getAllFriends(req.params.key) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Đồng bộ danh bạ (bạn bè + nhóm) → seed hội thoại để hiện "tất cả hội thoại".
// Lưu ý: zca-js không có API lịch sử hội thoại 1-1 với người lạ — danh sách này
// chỉ gồm bạn bè + nhóm; KH lạ sẽ chảy về realtime qua listener khi có tin mới.
router.post('/accounts/:key/sync-conversations', async (req, res) => {
    try {
        const db = getDb(req);
        const key = req.params.key;
        const roster = await zca.getRoster(key);
        const ts = now();
        let n = 0;
        for (const u of roster.users) {
            // Filter BẬT → chỉ seed hội thoại được theo dõi (tránh ngập lại list).
            if (_filterActive && !_trackedSet.has(_tk(key, u.uid))) continue;
            await db.query(
                `INSERT INTO web2_zalo_conversations
                    (account_key, thread_id, thread_type, zalo_uid, display_name, avatar_url, phone, unread_count, created_at, updated_at)
                 VALUES ($1,$2,'user',$3,$4,$5,$6,0,$7,$7)
                 ON CONFLICT (account_key, thread_id) DO UPDATE SET
                    display_name=COALESCE(EXCLUDED.display_name, web2_zalo_conversations.display_name),
                    avatar_url=COALESCE(EXCLUDED.avatar_url, web2_zalo_conversations.avatar_url),
                    phone=COALESCE(EXCLUDED.phone, web2_zalo_conversations.phone),
                    zalo_uid=COALESCE(EXCLUDED.zalo_uid, web2_zalo_conversations.zalo_uid),
                    updated_at=$7`,
                [
                    key,
                    u.uid,
                    u.uid,
                    u.name || null,
                    u.avatar || null,
                    u.phone ? String(u.phone).replace(/\D/g, '') || null : null,
                    ts,
                ]
            );
            n++;
        }
        for (const g of roster.groups) {
            if (_filterActive && !_trackedSet.has(_tk(key, g.gid))) continue;
            await db.query(
                `INSERT INTO web2_zalo_conversations
                    (account_key, thread_id, thread_type, display_name, avatar_url, unread_count, created_at, updated_at)
                 VALUES ($1,$2,'group',$3,$4,0,$5,$5)
                 ON CONFLICT (account_key, thread_id) DO UPDATE SET
                    display_name=COALESCE(EXCLUDED.display_name, web2_zalo_conversations.display_name),
                    avatar_url=COALESCE(EXCLUDED.avatar_url, web2_zalo_conversations.avatar_url),
                    updated_at=$5`,
                [key, g.gid, g.name || null, g.avatar || null, ts]
            );
            n++;
        }
        _notify('web2:zalo:messages', 'update', key);
        res.json({
            success: true,
            synced: n,
            users: roster.users.length,
            groups: roster.groups.length,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.get('/accounts/:key/groups', async (req, res) => {
    try {
        res.json({ success: true, data: await zca.getAllGroups(req.params.key) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// Sửa tên hội thoại thủ công (NHÓM + USER bị nhiễm) — force re-fetch từ zca. Cần acc kết nối.
router.post('/accounts/:key/repair-group-names', async (req, res) => {
    try {
        if (!zca.isConnected(req.params.key))
            return res.status(400).json({ success: false, error: 'Tài khoản chưa kết nối' });
        const repaired = await _repairConvNames(req.params.key);
        res.json({ success: true, repaired });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// =====================================================================
// XEM THÔNG TIN NGƯỜI KHÁC (lookup)
// =====================================================================
router.get('/lookup', async (req, res) => {
    try {
        const { accountKey, phone, uid } = req.query;
        if (!accountKey) return res.status(400).json({ success: false, error: 'Thiếu accountKey' });
        let data;
        if (uid) data = await zca.getUserInfo(accountKey, uid);
        else if (phone) data = await zca.findUser(accountKey, String(phone).replace(/\D/g, ''));
        else return res.status(400).json({ success: false, error: 'Cần phone hoặc uid' });
        res.json({ success: true, data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// =====================================================================
// CONVERSATIONS + MESSAGES (đọc từ DB)
// =====================================================================
router.get('/conversations', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, search, page = 1, limit = 50 } = req.query;
        const lim = Math.min(parseInt(limit, 10) || 50, 200);
        const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
        const where = [];
        const params = [];
        if (accountKey) {
            params.push(accountKey);
            where.push(`c.account_key=$${params.length}`);
        }
        if (search) {
            params.push('%' + search + '%');
            where.push(
                `(c.display_name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.zalo_uid ILIKE $${params.length})`
            );
        }
        const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const total = (
            await db.query(`SELECT COUNT(*)::int n FROM web2_zalo_conversations c ${wsql}`, params)
        ).rows[0].n;
        params.push(lim, off);
        // LEFT JOIN members → tên người NHẮN CUỐI (cho nhóm hiện "Tên: tin").
        // last_msg_sender_uid='me' → shop (frontend hiện "Bạn").
        const { rows } = await db.query(
            `SELECT c.*, m.display_name AS last_sender_name
               FROM web2_zalo_conversations c
               LEFT JOIN web2_zalo_members m
                 ON m.account_key = c.account_key AND m.uid = c.last_msg_sender_uid
             ${wsql} ORDER BY c.is_pinned DESC, c.last_msg_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        // Resolve 1 lần tên người-nhắn-cuối còn thiếu (nhóm) → 1 call getGroupMembersInfo.
        if (accountKey && zca.isConnected(accountKey)) {
            const need = [
                ...new Set(
                    rows
                        .filter(
                            (r) =>
                                r.thread_type === 'group' &&
                                r.last_msg_sender_uid &&
                                r.last_msg_sender_uid !== 'me' &&
                                !r.last_sender_name
                        )
                        .map((r) => String(r.last_msg_sender_uid))
                ),
            ];
            if (need.length) {
                try {
                    const resolved = await zca.getGroupMembersInfo(accountKey, need);
                    const ts = now();
                    for (const [uid, info] of Object.entries(resolved)) {
                        await db.query(
                            `INSERT INTO web2_zalo_members (account_key, uid, display_name, avatar, updated_at)
                             VALUES ($1,$2,$3,$4,$5)
                             ON CONFLICT (account_key, uid) DO UPDATE SET
                                display_name=EXCLUDED.display_name, avatar=EXCLUDED.avatar, updated_at=EXCLUDED.updated_at`,
                            [accountKey, uid, info.name || null, info.avatar || null, ts]
                        );
                    }
                    for (const r of rows) {
                        if (r.thread_type === 'group' && !r.last_sender_name) {
                            const info = resolved[String(r.last_msg_sender_uid)];
                            if (info?.name) r.last_sender_name = info.name;
                        }
                    }
                } catch (e) {
                    /* best-effort */
                }
            }
        }
        res.json({ success: true, data: rows, total });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// getUserInfo (zca) trả nhiều shape khác nhau → lấy profile có avatar/tên
function _pickProfile(info, uid) {
    if (!info || typeof info !== 'object') return null;
    const buckets = [
        info.changed_profiles,
        info.unchanged_profiles,
        info.profiles,
        info, // đôi khi { [uid]: {...} } hoặc thẳng profile
    ];
    for (const b of buckets) {
        if (!b || typeof b !== 'object') continue;
        const p = b[uid] || b.profile || (b.avatar || b.displayName || b.zaloName ? b : null);
        if (p && (p.avatar || p.displayName || p.zaloName)) return p;
    }
    return null;
}

// Gắn tên + avatar người gửi cho tin NHÓM (uid → tên thật). Cache web2_zalo_members
// + resolve uid còn thiếu qua getGroupMembersInfo. Tin của shop → tên TK + 'Bạn'.
async function _attachGroupSenders(db, conv, rows) {
    const ownUid = zca.isConnected(conv.account_key) ? zca.getOwnUid(conv.account_key) : null;
    const uids = [
        ...new Set(
            rows
                .filter(
                    (r) =>
                        r.direction === 'in' &&
                        r.sender_uid &&
                        String(r.sender_uid) !== String(ownUid)
                )
                .map((r) => String(r.sender_uid))
        ),
    ];
    const nameMap = {};
    if (uids.length) {
        const { rows: cached } = await db.query(
            `SELECT uid, display_name, avatar FROM web2_zalo_members WHERE account_key=$1 AND uid = ANY($2::text[])`,
            [conv.account_key, uids]
        );
        for (const c of cached) nameMap[c.uid] = { name: c.display_name, avatar: c.avatar };
        const missing = uids.filter((u) => !nameMap[u]);
        if (missing.length && zca.isConnected(conv.account_key)) {
            try {
                const resolved = await zca.getGroupMembersInfo(conv.account_key, missing);
                const ts = now();
                for (const [uid, info] of Object.entries(resolved)) {
                    nameMap[uid] = { name: info.name, avatar: info.avatar };
                    await db.query(
                        `INSERT INTO web2_zalo_members (account_key, uid, display_name, avatar, updated_at)
                         VALUES ($1,$2,$3,$4,$5)
                         ON CONFLICT (account_key, uid) DO UPDATE SET
                            display_name=EXCLUDED.display_name, avatar=EXCLUDED.avatar, updated_at=EXCLUDED.updated_at`,
                        [conv.account_key, uid, info.name || null, info.avatar || null, ts]
                    );
                }
            } catch (e) {
                /* best-effort — không chặn xem tin */
            }
        }
    }
    const acc =
        (
            await db.query(
                `SELECT display_name, avatar_url FROM web2_zalo_accounts WHERE account_key=$1`,
                [conv.account_key]
            )
        ).rows[0] || {};
    for (const r of rows) {
        if (r.direction === 'out' || (ownUid && String(r.sender_uid) === String(ownUid))) {
            r.sender_name = acc.display_name || 'Bạn';
            r.sender_avatar = acc.avatar_url || null;
        } else if (r.sender_uid) {
            const m = nameMap[String(r.sender_uid)];
            if (m) {
                if (m.name) r.sender_name = m.name;
                r.sender_avatar = m.avatar || null;
            }
        }
    }
}

router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const db = getDb(req);
        const conv = (
            await db.query(`SELECT * FROM web2_zalo_conversations WHERE id=$1`, [req.params.id])
        ).rows[0];
        if (!conv)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        // User: heal tên + avatar KHÁCH (bug cũ: shop nhắn cuối → tên hội thoại thành
        // tên SHOP) — lazy, gate TTL. Force ghi đè, timeout 2s, chỉ stamp khi resolve.
        // ⚠ Resolve theo THREAD_ID (uid KHÁCH), KHÔNG zalo_uid (có thể bị nhiễm uid SHOP).
        if (
            conv.thread_type === 'user' &&
            zca.isConnected(conv.account_key) &&
            (!conv.info_synced_at || now() - Number(conv.info_synced_at) > GROUP_NAME_TTL_MS)
        ) {
            try {
                const uid = String(conv.thread_id);
                const prof = _pickProfile(
                    await _withTimeout(
                        zca.getUserInfo(conv.account_key, uid),
                        ZCA_RESOLVE_TIMEOUT_MS
                    ),
                    uid
                );
                const av = prof?.avatar || '';
                const nm = (prof?.zaloName || prof?.displayName || '').trim();
                // Resolve rỗng → KHÔNG ghi/stamp (giữ row đủ điều kiện heal lần mở sau).
                if (nm || av) {
                    const ts = now();
                    // FORCE tên KHÁCH + self-correct zalo_uid về thread_id (xoá uid SHOP nhiễm).
                    await db.query(
                        `UPDATE web2_zalo_conversations
                            SET avatar_url=COALESCE($1,avatar_url), display_name=COALESCE($2,display_name),
                                zalo_uid=$5, info_synced_at=$3, updated_at=$3 WHERE id=$4`,
                        [av || null, nm || null, ts, conv.id, uid]
                    );
                    if (av) conv.avatar_url = av;
                    if (nm) conv.display_name = nm;
                    _notify('web2:zalo:messages', 'update', conv.account_key);
                }
            } catch (e) {
                /* best-effort — lỗi/timeout: không chặn xem tin, không stamp → thử lại lần sau */
            }
        }
        // Nhóm: heal tên + avatar NHÓM (bug cũ lưu tên người nhắn cuối) — lazy, gate TTL.
        // Timeout 2s: zca chậm KHÔNG được nghẽn tải tin. Lỗi/timeout → KHÔNG stamp
        // info_synced_at (giữ row đủ điều kiện heal lần mở sau, tránh đóng băng tên sai).
        if (
            conv.thread_type === 'group' &&
            zca.isConnected(conv.account_key) &&
            (!conv.info_synced_at || now() - Number(conv.info_synced_at) > GROUP_NAME_TTL_MS)
        ) {
            try {
                const info = await _withTimeout(
                    zca.getGroupsInfo(conv.account_key, [conv.thread_id]),
                    ZCA_RESOLVE_TIMEOUT_MS
                );
                const g = info[String(conv.thread_id)];
                const nm = (g?.name || '').trim();
                const av = g?.avatar || '';
                const ts = now();
                // Chỉ ghi (kể cả stamp info_synced_at) khi đã RESOLVE info từ zca.
                await db.query(
                    `UPDATE web2_zalo_conversations
                        SET display_name=COALESCE($1,display_name), avatar_url=COALESCE($2,avatar_url),
                            info_synced_at=$3, updated_at=$3 WHERE id=$4`,
                    [nm || null, av || null, ts, conv.id]
                );
                if (nm) conv.display_name = nm;
                if (av) conv.avatar_url = av;
                // Tên vừa heal → báo list các tab refresh (header tab này tự cập nhật qua res.conversation).
                if (nm || av) _notify('web2:zalo:messages', 'update', conv.account_key);
            } catch (e) {
                /* best-effort — lỗi/timeout: không chặn xem tin, không stamp → thử lại lần sau */
            }
        }
        const lim = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const before = req.query.before ? Number(req.query.before) : null;
        const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null;
        // Keyset pagination composite (sent_at, id): nhiều tin cùng sent_at vẫn
        // không bị nhảy/lặp. ORDER BY sent_at DESC, id DESC.
        const params = [conv.account_key, conv.thread_id];
        let beforeSql = '';
        if (before) {
            if (beforeId) {
                params.push(before, beforeId);
                beforeSql = ` AND (sent_at < $${params.length - 1} OR (sent_at = $${params.length - 1} AND id < $${params.length}))`;
            } else {
                params.push(before);
                beforeSql = ` AND sent_at < $${params.length}`;
            }
        }
        params.push(lim);
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_messages WHERE account_key=$1 AND thread_id=$2 AND NOT COALESCE(hidden_for_me,false)${beforeSql} ORDER BY sent_at DESC, id DESC LIMIT $${params.length}`,
            params
        );
        const hasMore = rows.length === lim;
        // Mở mới (không phân trang) → reset unread + đánh dấu last_read.
        if (!before) {
            const lastMsgId = rows[0]?.msg_id || null;
            await db
                .query(
                    `UPDATE web2_zalo_conversations SET unread_count=0, last_read_msg_id=COALESCE($2,last_read_msg_id), last_read_at=$3 WHERE id=$1`,
                    [req.params.id, lastMsgId, now()]
                )
                .catch(() => {});
        }
        // NHÓM: resolve tên + avatar người gửi (uid → tên thật) để hiện đúng cấu trúc.
        if (conv.thread_type === 'group') {
            await _attachGroupSenders(db, conv, rows);
        }
        res.json({ success: true, conversation: conv, data: rows.reverse(), hasMore });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Backfill lịch sử NHÓM từ Zalo (zca getGroupChatHistory) → bơm vào web2_zalo_messages.
// Dùng khi "Tải tin cũ hơn" mà DB đã hết tin: kéo batch gần nhất (tới count tin) từ Zalo,
// INSERT dedupe (ON CONFLICT DO NOTHING) — KHÔNG đụng row conversation (không bump unread/
// last_msg, vì đây là tin CŨ). Tiện thể auto-ingest mã đơn J&T trong tin vừa kéo về.
//   ⚠ zca-js 2.1.2 chỉ trả batch gần nhất (more>0 = còn cũ hơn NHƯNG không có cursor để lấy
//      tiếp) → backfill 1 lần lấy được nhiều hơn batch realtime, nhưng có trần.
router.post('/conversations/:id/backfill', async (req, res) => {
    try {
        const db = getDb(req);
        const conv = (
            await db.query(`SELECT * FROM web2_zalo_conversations WHERE id=$1`, [req.params.id])
        ).rows[0];
        if (!conv)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        if (conv.thread_type !== 'group')
            return res.json({
                success: true,
                added: 0,
                fetched: 0,
                more: 0,
                note: 'Chỉ hỗ trợ tải lịch sử cho nhóm Zalo',
            });
        if (!zca.isConnected(conv.account_key))
            return res.status(503).json({ success: false, error: 'Tài khoản Zalo chưa kết nối' });
        const count = Math.min(parseInt(req.body && req.body.count, 10) || 200, 500);
        const hist = await zca
            .getGroupHistory(conv.account_key, conv.thread_id, count)
            .catch((e) => ({ messages: [], error: e.message }));
        if (hist && hist.error) return res.status(502).json({ success: false, error: hist.error });
        const msgs = Array.isArray(hist && hist.messages) ? hist.messages : [];
        let added = 0;
        for (const m of msgs) {
            if (!m || !m.msgId) continue;
            const ins = await db
                .query(
                    `INSERT INTO web2_zalo_messages
                        (msg_id, cli_msg_id, account_key, thread_id, thread_type, direction, msg_type, content, attachments,
                         reply_to_msg_id, reply_to_preview, sender_uid, send_status, sent_at, created_at)
                     VALUES ($1,$2,$3,$4,'group',$5,$6,$7,$8::jsonb,$9,$10,$11,'sent',$12,$13)
                     ON CONFLICT DO NOTHING RETURNING id`,
                    [
                        m.msgId,
                        m.cliMsgId || null,
                        conv.account_key,
                        conv.thread_id,
                        m.direction || 'in',
                        m.msgType || 'text',
                        m.content || '',
                        JSON.stringify(Array.isArray(m.attachments) ? m.attachments : []),
                        m.replyTo?.msgId || null,
                        m.replyTo?.preview || null,
                        m.senderUid || null,
                        m.sentAt || now(),
                        now(),
                    ]
                )
                .catch(() => ({ rowCount: 0 }));
            if (ins.rowCount > 0) added++;
        }
        // Mã đơn J&T trong tin vừa backfill → auto-ingest (giống realtime), fire-and-forget.
        if (added > 0) {
            try {
                const jt = require('./web2-jt-tracking');
                for (const m of msgs) {
                    if (m && m.content)
                        jt.autoIngestFromZalo(db, {
                            ...m,
                            threadType: 'group',
                            accountKey: conv.account_key,
                            threadId: conv.thread_id,
                        }).catch(() => {});
                }
            } catch (e) {
                /* module chưa sẵn sàng — bỏ qua */
            }
            _notify('web2:zalo:messages', 'update', conv.account_key);
        }
        res.json({
            success: true,
            added,
            fetched: msgs.length,
            more: Number(hist && hist.more) || 0,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /conversations/:id/members — thành viên NHÓM để @tag trong ô soạn.
// Nguồn: zca.getGroupMembers (đầy đủ, best-effort) + GỘP người đã từng nhắn trong thread
// (web2_zalo_members cache — luôn có tên, là người hay được tag). Dedup theo uid, ưu tiên
// bản có tên, sort theo tên. Hội thoại 1-1 → [] (mention chỉ cho nhóm).
router.get('/conversations/:id/members', async (req, res) => {
    try {
        const db = getDb(req);
        const conv = (
            await db.query(`SELECT * FROM web2_zalo_conversations WHERE id=$1`, [req.params.id])
        ).rows[0];
        if (!conv)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        if (conv.thread_type !== 'group') return res.json({ success: true, members: [] });
        const byUid = new Map();
        const put = (uid, name, avatar) => {
            uid = String(uid || '');
            if (!uid) return;
            const cur = byUid.get(uid);
            if (!cur) byUid.set(uid, { uid, name: name || '', avatar: avatar || '' });
            else {
                if (!cur.name && name) cur.name = name;
                if (!cur.avatar && avatar) cur.avatar = avatar;
            }
        };
        // 1) Người đã nhắn trong thread (cache tên sẵn — chắc chắn liên quan).
        try {
            const { rows } = await db.query(
                `SELECT DISTINCT m.uid, m.display_name, m.avatar
                   FROM web2_zalo_messages msg
                   JOIN web2_zalo_members m ON m.account_key = msg.account_key AND m.uid = msg.sender_uid
                  WHERE msg.account_key=$1 AND msg.thread_id=$2 AND msg.sender_uid IS NOT NULL`,
                [conv.account_key, conv.thread_id]
            );
            rows.forEach((r) => put(r.uid, r.display_name, r.avatar));
        } catch (e) {
            /* bảng có thể chưa init — bỏ qua */
        }
        // 2) Danh sách thành viên đầy đủ từ Zalo (best-effort — cần tài khoản kết nối).
        if (zca.isConnected(conv.account_key)) {
            try {
                const mems = await _withTimeout(
                    zca.getGroupMembers(conv.account_key, conv.thread_id),
                    ZCA_RESOLVE_TIMEOUT_MS * 3
                );
                (Array.isArray(mems) ? mems : []).forEach((m) => put(m.uid, m.name, m.avatar));
                // resolve tên còn thiếu (member chưa từng nhắn → chưa có trong cache) — cache lại
                const ts = now();
                for (const m of byUid.values()) {
                    if (m.name)
                        db.query(
                            `INSERT INTO web2_zalo_members (account_key, uid, display_name, avatar, updated_at)
                             VALUES ($1,$2,$3,$4,$5)
                             ON CONFLICT (account_key, uid) DO UPDATE SET
                                display_name=COALESCE(EXCLUDED.display_name, web2_zalo_members.display_name),
                                avatar=COALESCE(EXCLUDED.avatar, web2_zalo_members.avatar),
                                updated_at=$5`,
                            [conv.account_key, m.uid, m.name || null, m.avatar || null, ts]
                        ).catch(() => {});
                }
            } catch (e) {
                /* zca lỗi/timeout → vẫn trả danh sách từ cache thread */
            }
        }
        const members = [...byUid.values()]
            .filter((m) => m.name) // chỉ hiện người có tên (tag được)
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        res.json({ success: true, members });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Tra hội thoại theo SĐT (helper Web2Zalo.getConversation)
router.get('/conversation/:phone', async (req, res) => {
    try {
        const db = getDb(req);
        const p = String(req.params.phone).replace(/\D/g, '');
        // 2026-06-20: ?account=<key> → ưu tiên hội thoại dưới TK cookie (TK đang đăng
        // nhập chat.zalo.me). Không truyền → TK CHÍNH (is_primary). Chưa có cả 2 →
        // hành vi cũ (hội thoại mới nhất bất kỳ TK).
        const prefer = String(req.query.account || '').trim() || null;
        const acct = prefer || (await _getPrimaryKey(db));
        const { rows } = acct
            ? await db.query(
                  `SELECT * FROM web2_zalo_conversations WHERE phone=$1 AND account_key=$2 ORDER BY last_msg_at DESC NULLS LAST LIMIT 1`,
                  [p, acct]
              )
            : // Chưa có prefer & chưa đặt TK chính: KHÔNG trả TK bất kỳ (most-recent có
              // thể sai danh tính). Ưu tiên hội thoại thuộc TK is_primary rồi TK đang
              // connected, mới tới last_msg_at. (audit MEDIUM 2026-06-20)
              await db.query(
                  `SELECT c.* FROM web2_zalo_conversations c
                   LEFT JOIN web2_zalo_accounts a ON a.account_key = c.account_key
                   WHERE c.phone=$1
                   ORDER BY (a.is_primary IS TRUE) DESC, (a.status='connected') DESC,
                            c.last_msg_at DESC NULLS LAST
                   LIMIT 1`,
                  [p]
              );
        res.json({ success: true, data: rows[0] || null });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Đảm bảo có hội thoại 1-1 theo SĐT — chưa có thì findUser (zca) → tạo row RỖNG để chat
// được ngay. Zalo KHÔNG chặn nhắn người lạ; chỉ khi KHÁCH chặn thì gửi mới fail.
router.post('/conversation/ensure', async (req, res) => {
    try {
        const db = getDb(req);
        const phone = String(req.body?.phone || '').replace(/\D/g, '');
        if (!phone) return res.status(400).json({ success: false, error: 'Thiếu phone' });
        // 2026-06-20: accountKey (TK cookie) ưu tiên cho CẢ existing-check + tạo mới →
        // hội thoại 1-1 đi đúng TK đang đăng nhập chat.zalo.me. Không truyền → TK CHÍNH.
        const prefer = String(req.body?.accountKey || '').trim() || null;
        const checkAcct = prefer || (await _getPrimaryKey(db));
        const ex = checkAcct
            ? await db.query(
                  `SELECT * FROM web2_zalo_conversations WHERE phone=$1 AND account_key=$2 ORDER BY last_msg_at DESC NULLS LAST LIMIT 1`,
                  [phone, checkAcct]
              )
            : await db.query(
                  `SELECT * FROM web2_zalo_conversations WHERE phone=$1 ORDER BY last_msg_at DESC NULLS LAST LIMIT 1`,
                  [phone]
              );
        if (ex.rows[0]) return res.json({ success: true, data: ex.rows[0], created: false });
        // Chọn tài khoản personal đang KẾT NỐI — ƯU TIÊN TK cookie (prefer) rồi TK CHÍNH.
        let accountKey = prefer;
        if (!accountKey) {
            const accs = await db.query(
                `SELECT account_key FROM web2_zalo_accounts WHERE is_active=true AND account_type='personal' ORDER BY is_primary DESC, updated_at DESC`
            );
            accountKey = accs.rows.map((r) => r.account_key).find((k) => zca.isConnected(k));
        }
        if (!accountKey)
            return res.json({ success: false, error: 'Chưa có tài khoản Zalo cá nhân kết nối' });
        // Tìm user Zalo theo SĐT.
        let u = null;
        try {
            u = await zca.findUser(accountKey, phone);
        } catch (e) {
            return res.json({ success: false, error: 'Tra cứu Zalo lỗi: ' + e.message });
        }
        const uid = String(u?.userId || u?.uid || u?.id || '');
        if (!uid)
            return res.json({
                success: false,
                error: 'Không tìm thấy người dùng Zalo với SĐT này',
            });
        const name = u.displayName || u.zaloName || u.dName || u.username || '';
        const avatar = u.avatar || u.avatar_25 || '';
        const ts = now();
        const ins = await db.query(
            `INSERT INTO web2_zalo_conversations
                (account_key, thread_id, thread_type, zalo_uid, display_name, avatar_url, phone, unread_count, created_at, updated_at)
             VALUES ($1,$2,'user',$2,$3,$4,$5,0,$6,$6)
             ON CONFLICT (account_key, thread_id) DO UPDATE SET
                phone=COALESCE(EXCLUDED.phone, web2_zalo_conversations.phone),
                display_name=COALESCE(EXCLUDED.display_name, web2_zalo_conversations.display_name),
                avatar_url=COALESCE(EXCLUDED.avatar_url, web2_zalo_conversations.avatar_url),
                updated_at=$6
             RETURNING *`,
            [accountKey, uid, name || null, avatar || null, phone, ts]
        );
        res.json({ success: true, data: ins.rows[0], created: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================================
// GỬI TIN — personal (zca). Persist out msg + SSE.
// =====================================================================

// Lưu 1 tin OUT + cập nhật conversation + SSE. Dùng chung cho text/ảnh/file/sticker.
async function _persistOut(db, p) {
    const ts = now();
    const { rows } = await db.query(
        `INSERT INTO web2_zalo_messages
            (msg_id, cli_msg_id, account_key, thread_id, thread_type, direction, msg_type, content, attachments,
             reply_to_msg_id, reply_to_preview, send_status, sent_at, created_at)
         VALUES ($1,$2,$3,$4,$5,'out',$6,$7,$8::jsonb,$9,$10,'sent',$11,$11)
         ON CONFLICT DO NOTHING RETURNING id`,
        [
            p.msgId || null,
            p.cliMsgId || null,
            p.accountKey,
            p.threadId,
            p.threadType || 'user',
            p.msgType || 'text',
            p.content || '',
            JSON.stringify(Array.isArray(p.attachments) ? p.attachments : []),
            p.replyToMsgId || null,
            p.replyToPreview || null,
            ts,
        ]
    );
    await db.query(
        `UPDATE web2_zalo_conversations SET last_msg_at=$1, last_msg_text=$2, last_msg_sender_uid='me', updated_at=$1 WHERE account_key=$3 AND thread_id=$4`,
        [ts, _outPreview(p).slice(0, 500), p.accountKey, p.threadId]
    );
    _notify('web2:zalo:messages', 'update', p.msgId);
    if (p.threadId) _notify(`web2:zalo:thread:${p.threadId}`, 'message', p.msgId);
    return { id: rows[0]?.id, sentAt: ts };
}
function _outPreview(p) {
    if (p.msgType === 'image') return '[Hình ảnh]' + (p.content ? ' ' + p.content : '');
    if (p.msgType === 'file') return '[Tệp đính kèm]';
    if (p.msgType === 'sticker') return '[Sticker]';
    return p.content || '';
}

router.post('/send-message', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, text, threadType, replyTo, mentions, cliMsgId } =
            req.body || {};
        if (!accountKey || !threadId || !text)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu accountKey/threadId/text' });
        // reply: client gửi quote thô (raw tin gốc) → pass thẳng cho zca.
        // mentions: [{uid,pos,len}] @tag thành viên nhóm (chỉ áp dụng nhóm).
        // cliMsgId: khoá idempotent — double-submit cùng key KHÔNG gửi lại.
        const { duplicate, result } = await _withSendGuard(
            accountKey,
            threadId,
            cliMsgId,
            async () => {
                const r = await zca.send(
                    accountKey,
                    threadId,
                    text,
                    threadType,
                    replyTo?.quote || null,
                    Array.isArray(mentions) ? mentions : null
                );
                const saved = await _persistOut(db, {
                    accountKey,
                    threadId,
                    threadType,
                    msgType: 'text',
                    content: String(text),
                    msgId: r.msgId,
                    cliMsgId: r.cliMsgId,
                    replyToMsgId: replyTo?.msgId || null,
                    replyToPreview: replyTo?.preview || null,
                });
                return { r, saved };
            }
        );
        res.json({
            success: true,
            duplicate,
            msgId: result.r.msgId,
            cliMsgId: result.r.cliMsgId,
            id: result.saved.id,
            sentAt: result.saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi ảnh (1..n) — base64 → bytea self-host + gửi Zalo ────────────────
router.post('/send-image', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, caption, files, cliMsgId } = req.body || {};
        if (!accountKey || !threadId || !Array.isArray(files) || !files.length)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu accountKey/threadId/files' });
        const { duplicate, result } = await _withSendGuard(
            accountKey,
            threadId,
            cliMsgId,
            async () => {
                const sources = [];
                const attachments = [];
                for (const f of files.slice(0, 12)) {
                    const buf = _b64ToBuffer(f.base64);
                    if (!buf) continue;
                    const mediaUrl = await _storeMedia(
                        db,
                        accountKey,
                        buf,
                        f.mime || 'image/jpeg',
                        f.filename,
                        f.width,
                        f.height
                    );
                    sources.push({
                        data: buf,
                        filename: _safeFilename(f.filename, 'photo.jpg'),
                        metadata: {
                            totalSize: buf.length,
                            width: f.width || undefined,
                            height: f.height || undefined,
                        },
                    });
                    attachments.push({
                        type: 'image',
                        url: mediaUrl,
                        thumb: mediaUrl,
                        title: f.filename || '',
                    });
                }
                if (!sources.length) {
                    const err = new Error('File ảnh không hợp lệ');
                    err.httpStatus = 400;
                    throw err;
                }
                const r = await zca.sendMedia(accountKey, threadId, sources, caption, threadType);
                const saved = await _persistOut(db, {
                    accountKey,
                    threadId,
                    threadType,
                    msgType: 'image',
                    content: caption || '',
                    attachments,
                    msgId: r.msgId,
                    cliMsgId: r.cliMsgId,
                });
                return { r, saved, attachments };
            }
        );
        res.json({
            success: true,
            duplicate,
            msgId: result.r.msgId,
            attachments: result.attachments,
            id: result.saved.id,
            sentAt: result.saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi file/tài liệu ───────────────────────────────────────────────────
router.post('/send-file', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, caption, file, cliMsgId } = req.body || {};
        if (!accountKey || !threadId || !file?.base64)
            return res.status(400).json({ success: false, error: 'Thiếu file' });
        const { duplicate, result } = await _withSendGuard(
            accountKey,
            threadId,
            cliMsgId,
            async () => {
                const buf = _b64ToBuffer(file.base64);
                if (!buf) {
                    const err = new Error('File không hợp lệ');
                    err.httpStatus = 400;
                    throw err;
                }
                const mediaUrl = await _storeMedia(
                    db,
                    accountKey,
                    buf,
                    file.mime || 'application/octet-stream',
                    file.filename
                );
                const sources = [
                    {
                        data: buf,
                        filename: _safeFilename(file.filename, 'file.bin'),
                        metadata: { totalSize: buf.length },
                    },
                ];
                const r = await zca.sendMedia(accountKey, threadId, sources, caption, threadType);
                const attachments = [
                    {
                        type: 'file',
                        url: mediaUrl,
                        href: mediaUrl,
                        title: file.filename || 'Tệp đính kèm',
                        size: buf.length,
                    },
                ];
                const saved = await _persistOut(db, {
                    accountKey,
                    threadId,
                    threadType,
                    msgType: 'file',
                    content: caption || '',
                    attachments,
                    msgId: r.msgId,
                    cliMsgId: r.cliMsgId,
                });
                return { r, saved, attachments };
            }
        );
        res.json({
            success: true,
            duplicate,
            msgId: result.r.msgId,
            attachments: result.attachments,
            id: result.saved.id,
            sentAt: result.saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi sticker ─────────────────────────────────────────────────────────
router.post('/send-sticker', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, sticker, cliMsgId } = req.body || {};
        if (!accountKey || !threadId || !sticker?.id)
            return res.status(400).json({ success: false, error: 'Thiếu sticker' });
        const { duplicate, result } = await _withSendGuard(
            accountKey,
            threadId,
            cliMsgId,
            async () => {
                const r = await zca.sendSticker(accountKey, threadId, sticker, threadType);
                const attachments = sticker.url
                    ? [{ type: 'sticker', url: sticker.url, thumb: sticker.url }]
                    : [];
                const saved = await _persistOut(db, {
                    accountKey,
                    threadId,
                    threadType,
                    msgType: 'sticker',
                    content: '',
                    attachments,
                    msgId: r.msgId,
                    cliMsgId,
                });
                return { r, saved };
            }
        );
        res.json({
            success: true,
            duplicate,
            msgId: result.r.msgId,
            id: result.saved.id,
            sentAt: result.saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Thả cảm xúc (shop) ─────────────────────────────────────────────────
router.post('/react', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, msgId, cliMsgId, icon, threadType } = req.body || {};
        if (!accountKey || !threadId || !msgId || !icon)
            return res.status(400).json({ success: false, error: 'Thiếu tham số' });
        await zca.react(accountKey, threadId, msgId, cliMsgId, icon, threadType);
        // ghi reactions của shop (uid 'me') + SSE
        await _persistReaction({
            accountKey,
            threadId,
            msgId,
            cliMsgId,
            uidFrom: 'me',
            icon: _reactionEmoji(icon),
        });
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Thu hồi tin shop ───────────────────────────────────────────────────
router.post('/recall', async (req, res) => {
    try {
        const { accountKey, threadId, msgId, cliMsgId, threadType } = req.body || {};
        if (!accountKey || !threadId || !msgId)
            return res.status(400).json({ success: false, error: 'Thiếu tham số' });
        await zca.recall(accountKey, threadId, msgId, cliMsgId, threadType);
        await _persistRecall({ accountKey, threadId, msgId, cliMsgId, uidFrom: 'me' });
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Xoá tin ở phía mình (delete-for-me) — ẩn khỏi DB + Zalo onlyMe ─────
router.post('/delete-message', async (req, res) => {
    try {
        const { accountKey, threadId, msgId, cliMsgId, uidFrom, threadType } = req.body || {};
        if (!accountKey || !threadId || (!msgId && !cliMsgId))
            return res.status(400).json({ success: false, error: 'Thiếu tham số' });
        await zca.deleteForMe(accountKey, { threadId, msgId, cliMsgId, uidFrom, threadType });
        // Ẩn vĩnh viễn ở DB để không hiện lại sau refresh.
        await getDb(req).query(
            `UPDATE web2_zalo_messages SET hidden_for_me=true
              WHERE account_key=$1 AND (msg_id=$2 OR cli_msg_id=$3)`,
            [accountKey, msgId || '', cliMsgId || '']
        );
        _notifyThread(accountKey, threadId, 'delete', msgId || cliMsgId);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Chuyển tiếp tin tới nhiều thread ───────────────────────────────────
router.post('/forward', async (req, res) => {
    try {
        const { accountKey, message, threadIds, threadType } = req.body || {};
        if (!accountKey || !message || !Array.isArray(threadIds) || !threadIds.length)
            return res.status(400).json({ success: false, error: 'Thiếu message/threadIds' });
        await zca.forward(accountKey, message, threadIds, threadType);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Báo đang gõ (outbound, throttle ở client) ──────────────────────────
router.post('/typing', async (req, res) => {
    try {
        const { accountKey, threadId, threadType } = req.body || {};
        if (!accountKey || !threadId) return res.json({ success: false });
        await zca.sendTyping(accountKey, threadId, threadType).catch(() => {});
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false });
    }
});

// ── Báo đã xem (khi mở chat) ───────────────────────────────────────────
router.post('/seen', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, convId, threadId } = req.body || {};
        if (!accountKey || !convId)
            return res.status(400).json({ success: false, error: 'Thiếu convId' });
        await db.query(
            `UPDATE web2_zalo_conversations SET unread_count=0, last_read_at=$2 WHERE id=$1`,
            [convId, now()]
        );
        // gửi seen lên Zalo cho tin inbound chưa seen (best-effort, raw có sẵn cột).
        // idTo = thread (uid KH / group id), KHÔNG phải accountKey của shop.
        try {
            if (threadId) {
                const { rows } = await db.query(
                    `SELECT msg_id, cli_msg_id, sender_uid FROM web2_zalo_messages
                      WHERE account_key=$1 AND thread_id=$2 AND direction='in' ORDER BY sent_at DESC LIMIT 1`,
                    [accountKey, threadId]
                );
                if (rows[0]?.msg_id) {
                    await zca.sendSeen(
                        accountKey,
                        [
                            {
                                msgId: rows[0].msg_id,
                                cliMsgId: rows[0].cli_msg_id,
                                uidFrom: rows[0].sender_uid,
                                idTo: threadId,
                            },
                        ],
                        req.body.threadType
                    );
                }
            }
        } catch {}
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Quản lý hội thoại: ghim / tắt thông báo / đánh dấu chưa đọc ─────────
// DB-driven (cột is_pinned/is_muted/unread_count) → điều khiển danh sách của
// CHÍNH tool (sắp xếp ghim lên đầu). _notify list refresh để tab khác cập nhật.
router.post('/conversations/:id/pin', async (req, res) => {
    try {
        const db = getDb(req);
        const pinned = !!(req.body || {}).pinned;
        const { rowCount } = await db.query(
            `UPDATE web2_zalo_conversations SET is_pinned=$1, updated_at=$2 WHERE id=$3`,
            [pinned, now(), req.params.id]
        );
        if (!rowCount)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        _notify('web2:zalo:messages', 'pin', req.params.id);
        res.json({ success: true, pinned });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});
router.post('/conversations/:id/mute', async (req, res) => {
    try {
        const db = getDb(req);
        const muted = !!(req.body || {}).muted;
        const until = Number((req.body || {}).until) || null; // epoch ms, null = vô thời hạn
        const { rowCount } = await db.query(
            `UPDATE web2_zalo_conversations SET is_muted=$1, muted_until=$2, updated_at=$3 WHERE id=$4`,
            [muted, muted ? until : null, now(), req.params.id]
        );
        if (!rowCount)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        _notify('web2:zalo:messages', 'mute', req.params.id);
        res.json({ success: true, muted, until });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});
// Đánh dấu chưa đọc (unread:true → unread_count≥1) / đã đọc (false → 0).
router.post('/conversations/:id/mark', async (req, res) => {
    try {
        const db = getDb(req);
        const unread = !!(req.body || {}).unread;
        const { rowCount } = await db.query(
            `UPDATE web2_zalo_conversations
                SET unread_count = CASE WHEN $1 THEN GREATEST(unread_count, 1) ELSE 0 END,
                    last_read_at = CASE WHEN $1 THEN last_read_at ELSE $2 END,
                    updated_at = $2
              WHERE id=$3`,
            [unread, now(), req.params.id]
        );
        if (!rowCount)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        _notify('web2:zalo:messages', 'mark', req.params.id);
        res.json({ success: true, unread });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Sticker search + quick replies ─────────────────────────────────────
router.get('/stickers', async (req, res) => {
    try {
        const { accountKey, q } = req.query;
        if (!accountKey) return res.status(400).json({ success: false, error: 'Thiếu accountKey' });
        res.json(await zca.getStickers(accountKey, q));
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});
router.get('/quick-replies', async (req, res) => {
    try {
        const { accountKey } = req.query;
        if (!accountKey) return res.status(400).json({ success: false, error: 'Thiếu accountKey' });
        res.json(await zca.getQuickMessages(accountKey));
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});
// Lưu câu trả lời nhanh mới (đồng bộ thẳng lên Zalo của tài khoản).
router.post('/quick-replies', async (req, res) => {
    try {
        const { accountKey, keyword, title } = req.body || {};
        if (!accountKey) return res.status(400).json({ success: false, error: 'Thiếu accountKey' });
        res.json(await zca.addQuickMessage(accountKey, { keyword, title }));
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Serve media tự host (ảnh/file shop đã gửi) ─────────────────────────
router.get('/media/:id', async (req, res) => {
    try {
        const db = getDb(req);
        // IDOR hardening (O2): route đã sau router.use(requireWeb2AuthSoft) (chặn ẩn danh).
        // Media MỚI dùng `token` bất khả đoán (36 hex) → tra theo token, không enumerate.
        // URL legacy dạng id BIGSERIAL tuần tự → BẮT BUỘC kèm account_key scope (bỏ param
        // = 404) nên không thể quét id 1,2,3… của account khác. Cache PRIVATE (token-gated).
        const ref = String(req.params.id || '');
        const isNumericId = /^[0-9]+$/.test(ref);
        let sql, params;
        if (!isNumericId) {
            sql = `SELECT mime, data FROM web2_zalo_media WHERE token=$1`;
            params = [ref];
        } else {
            const acctScope = (req.query.accountKey || req.query.account_key || '')
                .toString()
                .trim();
            if (!acctScope) return res.status(404).send('Not found');
            sql = `SELECT mime, data FROM web2_zalo_media WHERE id=$1 AND account_key=$2`;
            params = [ref, acctScope];
        }
        const { rows } = await db.query(sql, params);
        if (!rows[0]) return res.status(404).send('Not found');
        res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.send(rows[0].data);
    } catch (e) {
        res.status(500).send('error');
    }
});

// ── Helpers media ───────────────────────────────────────────────────────
function _b64ToBuffer(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    const m = b64.match(/^data:[^;]+;base64,(.*)$/);
    try {
        return Buffer.from(m ? m[1] : b64, 'base64');
    } catch {
        return null;
    }
}
function _safeFilename(name, fallback) {
    const n = String(name || '')
        .replace(/[^\w.\-]/g, '_')
        .slice(0, 80);
    return /\.[a-z0-9]+$/i.test(n) ? n : fallback;
}
// audit r8: fallback đi QUA worker proxy thay vì raw Render host — URL media nhúng
// vào web2_zalo_messages.attachments là tuyệt đối + vĩnh viễn; raw host đổi/đổi tên
// → vỡ hết. Worker proxy host-agnostic (CF route /api/web2-zalo/*). Vẫn ưu tiên
// env WEB2_MEDIA_BASE nếu set.
const MEDIA_BASE =
    process.env.WEB2_MEDIA_BASE ||
    'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-zalo/media';
async function _storeMedia(db, accountKey, buf, mime, filename, width, height) {
    // token bất khả đoán → URL /media/<token> không enumerate được (chống IDOR).
    const token = crypto.randomBytes(18).toString('hex'); // 36 hex chars
    const { rows } = await db.query(
        `INSERT INTO web2_zalo_media (account_key, mime, filename, data, width, height, size, created_at, token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
            accountKey,
            mime || 'application/octet-stream',
            filename || null,
            buf,
            width || null,
            height || null,
            buf.length,
            now(),
            token,
        ]
    );
    return `${MEDIA_BASE}/${token}`;
}
// emoji hiển thị cho reaction icon enum (lưu vào reactions JSONB cho client render)
const _REACTION_EMOJI = {
    HEART: '❤️',
    LIKE: '👍',
    HAHA: '😆',
    WOW: '😮',
    CRY: '😢',
    ANGRY: '😡',
    KISS: '😘',
    SAD: '😞',
    OK: '👌',
    NO: '🙅',
};
function _reactionEmoji(iconKey) {
    return _REACTION_EMOJI[iconKey] || iconKey;
}

// =====================================================================
// OA — kết nối, ZNS, tin tư vấn, template
// =====================================================================
router.post('/oa/connect', async (req, res) => {
    try {
        const db = getDb(req);
        const { appId, secret, code, oaId, oaName, accountKey } = req.body || {};
        const r = await oa.exchangeCode(db, { appId, secret, code, oaId, oaName, accountKey });
        await oa.syncTemplates(db, r.accountKey).catch(() => {});
        _notify('web2:zalo:accounts', 'create', r.accountKey);
        res.json({ success: true, accountKey: r.accountKey });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.post('/oa/sync-templates', async (req, res) => {
    try {
        res.json({ success: true, ...(await oa.syncTemplates(getDb(req), req.body?.oaRef)) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.get('/zns/templates', async (req, res) => {
    try {
        const { rows } = await getDb(req).query(
            `SELECT * FROM web2_zns_templates WHERE is_active=true ORDER BY updated_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Gửi ZNS (helper Web2Zalo.sendZNS target)
// audit r9: rate-limit ZNS theo SĐT (tốn phí ~200đ/tin) — chống loop/spam từ 1 phiên
// authed. Bổ sung cho idempotency (orderRef) ở service: chặn cả gửi nhiều SĐT khác orderRef.
const _znsRate = new Map(); // phone → [ts,...]
const ZNS_WINDOW_MS = 60_000;
const ZNS_MAX_PER_WINDOW = 5;
router.post('/send-zns', async (req, res) => {
    try {
        const db = getDb(req);
        const { phone, templateId, data, orderRef, oaRef, customerId, sentBy } = req.body || {};
        const _p = String(phone || '').replace(/\D/g, '');
        const _nowTs = Date.now();
        const _hits = (_znsRate.get(_p) || []).filter((t) => _nowTs - t < ZNS_WINDOW_MS);
        if (_hits.length >= ZNS_MAX_PER_WINDOW) {
            return res
                .status(429)
                .json({ success: false, error: 'Gửi ZNS quá nhanh tới SĐT này, vui lòng đợi' });
        }
        _hits.push(_nowTs);
        _znsRate.set(_p, _hits);
        if (_znsRate.size > 2000) {
            for (const [k, v] of _znsRate) {
                if (!v.some((t) => _nowTs - t < ZNS_WINDOW_MS)) _znsRate.delete(k);
            }
        }
        const r = await oa.sendZNS(db, {
            phone,
            templateId,
            data,
            orderRef,
            oaRef,
            customerId,
            sentBy,
        });
        res.json({ success: true, msgId: r.msgId, logId: r.logId });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.post('/oa/send-cs', async (req, res) => {
    try {
        const r = await oa.sendCsMessage(getDb(req), req.body || {});
        res.json({ success: true, msgId: r.msgId });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

router.get('/zns/log', async (req, res) => {
    try {
        const db = getDb(req);
        const { phone, status, page = 1, limit = 50 } = req.query;
        const lim = Math.min(parseInt(limit, 10) || 50, 200);
        const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;
        const where = [];
        const params = [];
        if (phone) {
            params.push(String(phone).replace(/\D/g, ''));
            where.push(`phone=$${params.length}`);
        }
        if (status) {
            params.push(status);
            where.push(`status=$${params.length}`);
        }
        const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const total = (await db.query(`SELECT COUNT(*)::int n FROM web2_zns_log ${wsql}`, params))
            .rows[0].n;
        params.push(lim, off);
        const { rows } = await db.query(
            `SELECT * FROM web2_zns_log ${wsql} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        res.json({ success: true, data: rows, total });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================================
// Nhóm được THEO DÕI (allowlist) — quản lý + wipe/seed + retention
// =====================================================================

// Liệt kê các nhóm đang theo dõi.
router.get('/tracked-groups', async (req, res) => {
    try {
        const { rows } = await getDb(req).query(
            `SELECT account_key AS "accountKey", thread_id AS "threadId", name, added_at AS "addedAt"
               FROM web2_zalo_tracked_groups ORDER BY added_at ASC`
        );
        res.json({ success: true, data: rows, filterActive: _filterActive });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Thêm nhóm vào danh sách theo dõi (manual add).
router.post('/tracked-groups', async (req, res) => {
    try {
        const { accountKey, threadId, name } = req.body || {};
        if (!accountKey || !threadId)
            return res
                .status(400)
                .json({ success: false, error: 'accountKey + threadId bắt buộc' });
        await getDb(req).query(
            `INSERT INTO web2_zalo_tracked_groups (account_key, thread_id, name, added_at)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (account_key, thread_id) DO UPDATE SET name=COALESCE(EXCLUDED.name, web2_zalo_tracked_groups.name)`,
            [accountKey, threadId, name || null, now()]
        );
        await _loadTracked();
        _notify('web2:zalo:accounts', 'tracked-changed', threadId);
        res.json({ success: true, filterActive: _filterActive, tracked: _trackedSet.size });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Bỏ 1 nhóm khỏi danh sách theo dõi.
router.delete('/tracked-groups/:accountKey/:threadId', async (req, res) => {
    try {
        await getDb(req).query(
            `DELETE FROM web2_zalo_tracked_groups WHERE account_key=$1 AND thread_id=$2`,
            [req.params.accountKey, req.params.threadId]
        );
        await _loadTracked();
        _notify('web2:zalo:accounts', 'tracked-changed', req.params.threadId);
        res.json({ success: true, filterActive: _filterActive, tracked: _trackedSet.size });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── ADMIN: wipe toàn bộ tin/hội thoại/ảnh + khoá theo dõi đúng nhóm khớp ──
//    Header x-admin-secret = CLEANUP_SECRET. Body:
//      { pattern?:'XỬ LÝ NJD', groups?:[{accountKey,threadId,name}], confirm:'YES-RESET', dryRun? }
//    Giữ NGUYÊN: tài khoản (đăng nhập), bảng ZNS. Xoá: messages/conversations/media/members.
router.post('/admin/reset-to-tracked', requireWeb2Admin, async (req, res) => {
    const secret = process.env.CLEANUP_SECRET || '';
    const provided = req.headers['x-admin-secret'] || req.query.secret || '';
    if (!secret || provided !== secret)
        return res.status(403).json({ success: false, error: 'forbidden' });
    const db = getDb(req);
    try {
        const pattern = (req.body?.pattern || 'XỬ LÝ NJD').trim();
        const explicit = Array.isArray(req.body?.groups) ? req.body.groups : null;
        const dryRun = !!req.body?.dryRun;

        // 1) Xác định nhóm cần khoá: explicit override HOẶC khớp tên hiện có.
        let targets;
        if (explicit && explicit.length) {
            targets = explicit
                .filter((g) => g && g.accountKey && g.threadId)
                .map((g) => ({
                    account_key: g.accountKey,
                    thread_id: g.threadId,
                    name: g.name || null,
                    avatar_url: null,
                }));
        } else {
            const { rows } = await db.query(
                `SELECT account_key, thread_id, display_name AS name, avatar_url
                   FROM web2_zalo_conversations
                  WHERE thread_type='group' AND display_name ILIKE '%' || $1 || '%'`,
                [pattern]
            );
            targets = rows;
        }

        if (!targets.length)
            return res.status(400).json({
                success: false,
                error: `Không tìm thấy nhóm nào khớp "${pattern}". Truyền body.groups=[{accountKey,threadId,name}] để khoá thủ công, hoặc đồng bộ hội thoại trước.`,
            });

        if (dryRun || req.body?.confirm !== 'YES-RESET')
            return res.json({
                success: true,
                dryRun: true,
                wouldTrack: targets.map((t) => ({
                    accountKey: t.account_key,
                    threadId: t.thread_id,
                    name: t.name,
                })),
                note: 'Gửi lại với confirm:"YES-RESET" để thực hiện wipe + khoá.',
            });

        // 2) Seed bảng theo dõi TRƯỚC (sống sót qua wipe).
        for (const t of targets) {
            await db.query(
                `INSERT INTO web2_zalo_tracked_groups (account_key, thread_id, name, added_at)
                 VALUES ($1,$2,$3,$4)
                 ON CONFLICT (account_key, thread_id) DO UPDATE SET name=COALESCE(EXCLUDED.name, web2_zalo_tracked_groups.name)`,
                [t.account_key, t.thread_id, t.name || null, now()]
            );
        }

        // 3) WIPE dữ liệu chat (giữ tài khoản + ZNS).
        const wiped = {};
        for (const tbl of [
            'web2_zalo_messages',
            'web2_zalo_conversations',
            'web2_zalo_media',
            'web2_zalo_members',
        ]) {
            const r = await db.query(`DELETE FROM ${tbl}`);
            wiped[tbl] = r.rowCount;
        }

        // 4) Tái tạo dòng hội thoại cho nhóm theo dõi (hiện ngay trong list, rỗng tin).
        const ts = now();
        for (const t of targets) {
            await db.query(
                `INSERT INTO web2_zalo_conversations
                    (account_key, thread_id, thread_type, display_name, avatar_url, unread_count, created_at, updated_at)
                 VALUES ($1,$2,'group',$3,$4,0,$5,$5)
                 ON CONFLICT (account_key, thread_id) DO NOTHING`,
                [t.account_key, t.thread_id, t.name || null, t.avatar_url || null, ts]
            );
        }

        await _loadTracked();
        _notify('web2:zalo:accounts', 'reset', null);
        _notify('web2:zalo:messages', 'reset', null);
        res.json({
            success: true,
            tracked: targets.map((t) => ({
                accountKey: t.account_key,
                threadId: t.thread_id,
                name: t.name,
            })),
            wiped,
            filterActive: _filterActive,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Retention: xoá tin nhắn + media cũ hơn N ngày (mặc định 7). Giữ dòng hội thoại
// (nhóm vẫn hiện trong list); xoá preview cũ. Gọi từ cron server.js.
async function runZaloRetention(days = 7) {
    if (!_pool) return null;
    const cutoff = now() - days * 24 * 60 * 60 * 1000;
    try {
        const m = await _pool.query(`DELETE FROM web2_zalo_messages WHERE sent_at < $1`, [cutoff]);
        const md = await _pool.query(`DELETE FROM web2_zalo_media WHERE created_at < $1`, [cutoff]);
        await _pool.query(
            `UPDATE web2_zalo_conversations
                SET last_msg_at=NULL, last_msg_text=NULL
              WHERE last_msg_at IS NOT NULL AND last_msg_at < $1`,
            [cutoff]
        );
        if (m.rowCount || md.rowCount)
            console.log(
                `[WEB2-ZALO] retention: -${m.rowCount} msg, -${md.rowCount} media (>${days}d)`
            );
        return { messages: m.rowCount, media: md.rowCount };
    } catch (e) {
        console.warn('[WEB2-ZALO] retention failed:', e.message);
        return null;
    }
}

// =====================================================================
// Schema + boot restore (gọi từ server.js)
// =====================================================================
async function ensureSchema(pool) {
    _pool = pool;
    await ensureWeb2ZaloSchema(pool);
    await _loadTracked();
    await _loadPrimaryKey(); // nạp cache TK chính lúc boot (KHÔNG boot-restore phiên)
    // Refresh cache định kỳ (an toàn khi nhiều instance / thay đổi ngoài luồng).
    if (!ensureSchema._refreshTimer) {
        ensureSchema._refreshTimer = setInterval(() => {
            _loadTracked();
            _loadPrimaryKey();
        }, 60 * 1000);
        if (ensureSchema._refreshTimer.unref) ensureSchema._refreshTimer.unref();
    }
}

// (restoreSessions đã GỠ 2026-06-23 — KHÔNG lưu phiên trên server nên không boot-
// restore. Boot chỉ ensureSchema (wipe cột session) + nạp cache TK chính. Mọi TK
// đều disconnected sau restart; user "Đăng nhập Zalo" từ trình duyệt để nối lại.)

router.ensureSchema = ensureSchema;
router.initializeNotifiers = initializeNotifiers;
router.runZaloRetention = runZaloRetention;
// Graceful shutdown: dừng watchdog + đóng listener zca để nhường phiên cho instance mới
// (tránh deploy chồng instance "đấu" phiên — bị kick 3000/3003).
router.stopZalo = () => {
    try {
        zca.stopAll();
    } catch (e) {
        console.warn('[WEB2-ZALO] stopZalo:', e.message);
    }
};

module.exports = router;
