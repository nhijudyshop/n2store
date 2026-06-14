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
const zca = require('../services/web2-zalo-zca');
const oa = require('../services/web2-zalo-oa');

let _pool = null;
const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

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

// ── Strip dữ liệu nhạy cảm trước khi trả client ─────────────────────────
function _safeAccount(a, liveStatus) {
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
        status: liveStatus || a.status,
        statusMsg: a.status_msg,
        isActive: a.is_active,
        lastConnectedAt: a.last_connected_at,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
    };
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
        _repairGroupNames(accountKey)
            .then((n) => {
                if (n) console.log(`[WEB2-ZALO] repaired ${n} group name(s) for ${accountKey}`);
            })
            .catch((e) => console.warn('[WEB2-ZALO] repairGroupNames:', e.message));
    },
});

// TTL refresh tên/avatar nhóm khi mở chat (tránh gọi getGroupInfo mỗi lần mở).
const GROUP_NAME_TTL_MS = 6 * 60 * 60 * 1000;

// Sửa tận gốc tên NHÓM bị bug cũ: lấy tên + avatar thật từ zca, FORCE ghi đè
// display_name nhóm (giá trị cũ có thể là tên người nhắn cuối). Idempotent.
async function _repairGroupNames(accountKey) {
    if (!_pool || !accountKey || !zca.isConnected(accountKey)) return 0;
    const { rows } = await _pool.query(
        `SELECT thread_id FROM web2_zalo_conversations
          WHERE account_key=$1 AND thread_type='group'`,
        [accountKey]
    );
    const gids = rows.map((r) => String(r.thread_id)).filter(Boolean);
    if (!gids.length) return 0;
    let fixed = 0;
    for (let i = 0; i < gids.length; i += 50) {
        const batch = gids.slice(i, i + 50);
        let info;
        try {
            info = await zca.getGroupsInfo(accountKey, batch);
        } catch (e) {
            continue; // best-effort: nhóm không resolve được thì bỏ qua đợt này
        }
        const ts = now();
        for (const gid of batch) {
            const g = info[gid];
            const nm = (g?.name || '').trim();
            const av = g?.avatar || '';
            if (!nm && !av) {
                // Không lấy được info (rời nhóm / lỗi) → vẫn đánh dấu để khỏi spam.
                await _pool
                    .query(
                        `UPDATE web2_zalo_conversations SET info_synced_at=$2
                          WHERE account_key=$1 AND thread_id=$3`,
                        [accountKey, ts, gid]
                    )
                    .catch(() => {});
                continue;
            }
            // FORCE ghi đè tên nhóm (sửa bug cũ) + avatar nếu có.
            await _pool.query(
                `UPDATE web2_zalo_conversations
                    SET display_name   = COALESCE($3, display_name),
                        avatar_url     = COALESCE($4, avatar_url),
                        info_synced_at = $5, updated_at = $5
                  WHERE account_key=$1 AND thread_id=$2`,
                [accountKey, gid, nm || null, av || null, ts]
            );
            fixed++;
        }
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
    const unreadDelta = isNew && msg.direction === 'in' ? 1 : 0;
    // 2) upsert conversation — chỉ cộng unread khi tin THỰC SỰ mới.
    //    ⚠ NHÓM: display_name = tên NHÓM (từ sync/getGroupInfo), KHÔNG đụng tới —
    //    tránh nhầm tên hội thoại với tên người nhắn cuối. User thread: tên = người gửi.
    const convName = msg.threadType === 'group' ? null : msg.senderName || null;
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
            updated_at=$6`,
        [
            msg.accountKey,
            msg.threadId,
            msg.threadType || 'user',
            msg.threadType === 'group' ? null : msg.senderUid,
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

async function _saveSession(accountKey, creds, info, label) {
    if (!_pool) return;
    await _pool.query(
        `UPDATE web2_zalo_accounts SET
            session=$1, zalo_uid=COALESCE($2, zalo_uid),
            display_name=COALESCE($3, display_name), avatar_url=COALESCE($4, avatar_url),
            status='connected', status_msg=NULL, last_connected_at=$5, updated_at=$5
          WHERE account_key=$6`,
        [
            creds ? JSON.stringify(creds) : null,
            info?.uid || null,
            info?.name || label || null,
            info?.avatar || null,
            now(),
            accountKey,
        ]
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
        const accounts = rows.map((a) => _safeAccount(a, live[a.account_key]?.status));
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
            data: rows.map((a) => _safeAccount(a, live[a.account_key]?.status)),
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

// Bắt đầu đăng nhập QR (zca)
router.post('/accounts/:key/login-qr', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = await db.query(`SELECT * FROM web2_zalo_accounts WHERE account_key=$1`, [
            req.params.key,
        ]);
        if (!rows[0])
            return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
        const r = zca.startQrLogin(req.params.key, rows[0].label || rows[0].display_name);
        await db.query(
            `UPDATE web2_zalo_accounts SET status=$1, updated_at=$2 WHERE account_key=$3`,
            [r.status, now(), req.params.key]
        );
        res.json({ success: true, ...r });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Poll QR / trạng thái đăng nhập
router.get('/accounts/:key/qr', (req, res) => {
    res.json({ success: true, ...zca.getQr(req.params.key) });
});

// Đăng nhập lại bằng session đã lưu (manual reconnect)
router.post('/accounts/:key/reconnect', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = await db.query(`SELECT * FROM web2_zalo_accounts WHERE account_key=$1`, [
            req.params.key,
        ]);
        if (!rows[0]?.session)
            return res.status(400).json({
                success: false,
                error: 'Chưa có session để kết nối lại — cần đăng nhập QR',
            });
        const r = await zca.loginWithCredentials(req.params.key, rows[0].session, rows[0].label);
        res.json({ success: true, ...r });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/accounts/:key/disconnect', async (req, res) => {
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

router.delete('/accounts/:key', async (req, res) => {
    try {
        zca.disconnect(req.params.key);
        await getDb(req).query(`DELETE FROM web2_zalo_accounts WHERE account_key=$1`, [
            req.params.key,
        ]);
        _notify('web2:zalo:accounts', 'deleted', req.params.key);
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

// Sửa tên NHÓM thủ công (force re-fetch từ zca). Cần acc đang kết nối.
router.post('/accounts/:key/repair-group-names', async (req, res) => {
    try {
        if (!zca.isConnected(req.params.key))
            return res.status(400).json({ success: false, error: 'Tài khoản chưa kết nối' });
        const repaired = await _repairGroupNames(req.params.key);
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
             ${wsql} ORDER BY c.last_msg_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
        // Lười resolve avatar/tên khi mở chat (1 lần / thread, best-effort, không chặn).
        if (conv.thread_type === 'user' && !conv.avatar_url && zca.isConnected(conv.account_key)) {
            try {
                const uid = conv.zalo_uid || conv.thread_id;
                const prof = _pickProfile(await zca.getUserInfo(conv.account_key, uid), uid);
                const av = prof?.avatar || '';
                const nm = prof?.zaloName || prof?.displayName || '';
                if (av || nm) {
                    await db.query(
                        `UPDATE web2_zalo_conversations SET avatar_url=COALESCE($1,avatar_url), display_name=COALESCE($2,display_name), updated_at=$3 WHERE id=$4`,
                        [av || null, nm || null, now(), conv.id]
                    );
                    if (av) conv.avatar_url = av;
                    if (nm) conv.display_name = nm;
                }
            } catch (e) {
                /* best-effort — không chặn xem tin */
            }
        }
        // Nhóm: heal tên + avatar NHÓM (bug cũ lưu tên người nhắn cuối) — lazy, gate TTL.
        if (
            conv.thread_type === 'group' &&
            zca.isConnected(conv.account_key) &&
            (!conv.info_synced_at || now() - Number(conv.info_synced_at) > GROUP_NAME_TTL_MS)
        ) {
            try {
                const info = await zca.getGroupsInfo(conv.account_key, [conv.thread_id]);
                const g = info[String(conv.thread_id)];
                const nm = (g?.name || '').trim();
                const av = g?.avatar || '';
                const ts = now();
                await db.query(
                    `UPDATE web2_zalo_conversations
                        SET display_name=COALESCE($1,display_name), avatar_url=COALESCE($2,avatar_url),
                            info_synced_at=$3, updated_at=$3 WHERE id=$4`,
                    [nm || null, av || null, ts, conv.id]
                );
                if (nm) conv.display_name = nm;
                if (av) conv.avatar_url = av;
            } catch (e) {
                /* best-effort — không chặn xem tin */
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
            `SELECT * FROM web2_zalo_messages WHERE account_key=$1 AND thread_id=$2${beforeSql} ORDER BY sent_at DESC, id DESC LIMIT $${params.length}`,
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

// Tra hội thoại theo SĐT (helper Web2Zalo.getConversation)
router.get('/conversation/:phone', async (req, res) => {
    try {
        const db = getDb(req);
        const p = String(req.params.phone).replace(/\D/g, '');
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_conversations WHERE phone=$1 ORDER BY last_msg_at DESC NULLS LAST LIMIT 1`,
            [p]
        );
        res.json({ success: true, data: rows[0] || null });
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
        const { accountKey, threadId, text, threadType, replyTo } = req.body || {};
        if (!accountKey || !threadId || !text)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu accountKey/threadId/text' });
        // reply: client gửi quote thô (raw tin gốc) → pass thẳng cho zca
        const r = await zca.send(accountKey, threadId, text, threadType, replyTo?.quote || null);
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
        res.json({
            success: true,
            msgId: r.msgId,
            cliMsgId: r.cliMsgId,
            id: saved.id,
            sentAt: saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi ảnh (1..n) — base64 → bytea self-host + gửi Zalo ────────────────
router.post('/send-image', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, caption, files } = req.body || {};
        if (!accountKey || !threadId || !Array.isArray(files) || !files.length)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu accountKey/threadId/files' });
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
        if (!sources.length)
            return res.status(400).json({ success: false, error: 'File ảnh không hợp lệ' });
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
        res.json({
            success: true,
            msgId: r.msgId,
            attachments,
            id: saved.id,
            sentAt: saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi file/tài liệu ───────────────────────────────────────────────────
router.post('/send-file', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, caption, file } = req.body || {};
        if (!accountKey || !threadId || !file?.base64)
            return res.status(400).json({ success: false, error: 'Thiếu file' });
        const buf = _b64ToBuffer(file.base64);
        if (!buf) return res.status(400).json({ success: false, error: 'File không hợp lệ' });
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
        res.json({
            success: true,
            msgId: r.msgId,
            attachments,
            id: saved.id,
            sentAt: saved.sentAt,
        });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Gửi sticker ─────────────────────────────────────────────────────────
router.post('/send-sticker', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, threadType, sticker } = req.body || {};
        if (!accountKey || !threadId || !sticker?.id)
            return res.status(400).json({ success: false, error: 'Thiếu sticker' });
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
        });
        res.json({ success: true, msgId: r.msgId, id: saved.id, sentAt: saved.sentAt });
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

// ── Serve media tự host (ảnh/file shop đã gửi) ─────────────────────────
router.get('/media/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = await db.query(
            `SELECT mime, filename, data FROM web2_zalo_media WHERE id=$1`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).send('Not found');
        res.setHeader('Content-Type', rows[0].mime || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
const MEDIA_BASE =
    process.env.WEB2_MEDIA_BASE || 'https://web2-api-kv04.onrender.com/api/web2-zalo/media';
async function _storeMedia(db, accountKey, buf, mime, filename, width, height) {
    const { rows } = await db.query(
        `INSERT INTO web2_zalo_media (account_key, mime, filename, data, width, height, size, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
            accountKey,
            mime || 'application/octet-stream',
            filename || null,
            buf,
            width || null,
            height || null,
            buf.length,
            now(),
        ]
    );
    return `${MEDIA_BASE}/${rows[0].id}`;
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
router.post('/send-zns', async (req, res) => {
    try {
        const db = getDb(req);
        const { phone, templateId, data, orderRef, oaRef, customerId, sentBy } = req.body || {};
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
// Schema + boot restore (gọi từ server.js)
// =====================================================================
async function ensureSchema(pool) {
    _pool = pool;
    await ensureWeb2ZaloSchema(pool);
}

// Re-login mọi acc personal có session đã lưu (gọi sau ensureSchema khi boot)
async function restoreSessions() {
    if (!_pool || !zca.isAvailable()) return;
    try {
        const { rows } = await _pool.query(
            `SELECT account_key, account_type, is_active, session, label, display_name FROM web2_zalo_accounts WHERE account_type='personal' AND is_active=true AND session IS NOT NULL`
        );
        await zca.restoreAll(rows);
    } catch (e) {
        console.warn('[WEB2-ZALO] restoreSessions failed:', e.message);
    }
}

router.ensureSchema = ensureSchema;
router.initializeNotifiers = initializeNotifiers;
router.restoreSessions = restoreSessions;

module.exports = router;
