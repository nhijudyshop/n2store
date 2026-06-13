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
});

async function _persistIncoming(msg) {
    if (!_pool || !msg?.threadId) return;
    const ts = now();
    // upsert conversation
    const { rows } = await _pool.query(
        `INSERT INTO web2_zalo_conversations
            (account_key, thread_id, thread_type, zalo_uid, display_name, last_msg_at, last_msg_text,
             unread_count, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6,$6)
         ON CONFLICT (account_key, thread_id) DO UPDATE SET
            last_msg_at=$6, last_msg_text=$7,
            unread_count=web2_zalo_conversations.unread_count + $8,
            display_name=COALESCE(EXCLUDED.display_name, web2_zalo_conversations.display_name),
            updated_at=$6
         RETURNING id`,
        [
            msg.accountKey,
            msg.threadId,
            msg.threadType || 'user',
            msg.threadType === 'group' ? null : msg.senderUid,
            msg.senderName || null,
            ts,
            (msg.content || '').slice(0, 500),
            msg.direction === 'in' ? 1 : 0,
        ]
    );
    const convId = rows[0]?.id;
    // insert message (dedup theo msg_id)
    await _pool.query(
        `INSERT INTO web2_zalo_messages
            (msg_id, account_key, thread_id, thread_type, direction, msg_type, content, sender_uid, send_status, sent_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sent',$9,$10)
         ON CONFLICT DO NOTHING`,
        [
            msg.msgId,
            msg.accountKey,
            msg.threadId,
            msg.threadType || 'user',
            msg.direction,
            msg.msgType || 'text',
            msg.content || '',
            msg.senderUid || null,
            msg.sentAt || ts,
            ts,
        ]
    );
    _notify('web2:zalo:messages', msg.direction === 'in' ? 'create' : 'update', msg.msgId);
    if (convId) _notify(`web2:zalo:conv:${convId}`, 'create', String(convId));
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
            return res
                .status(400)
                .json({
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

router.get('/accounts/:key/groups', async (req, res) => {
    try {
        res.json({ success: true, data: await zca.getAllGroups(req.params.key) });
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
            where.push(`account_key=$${params.length}`);
        }
        if (search) {
            params.push('%' + search + '%');
            where.push(
                `(display_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR zalo_uid ILIKE $${params.length})`
            );
        }
        const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const total = (
            await db.query(`SELECT COUNT(*)::int n FROM web2_zalo_conversations ${wsql}`, params)
        ).rows[0].n;
        params.push(lim, off);
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_conversations ${wsql} ORDER BY last_msg_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );
        res.json({ success: true, data: rows, total });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const db = getDb(req);
        const conv = (
            await db.query(`SELECT * FROM web2_zalo_conversations WHERE id=$1`, [req.params.id])
        ).rows[0];
        if (!conv)
            return res.status(404).json({ success: false, error: 'Không tìm thấy hội thoại' });
        const lim = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const { rows } = await db.query(
            `SELECT * FROM web2_zalo_messages WHERE account_key=$1 AND thread_id=$2 ORDER BY sent_at DESC LIMIT $3`,
            [conv.account_key, conv.thread_id, lim]
        );
        // reset unread
        await db
            .query(`UPDATE web2_zalo_conversations SET unread_count=0 WHERE id=$1`, [req.params.id])
            .catch(() => {});
        res.json({ success: true, conversation: conv, data: rows.reverse() });
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
router.post('/send-message', async (req, res) => {
    try {
        const db = getDb(req);
        const { accountKey, threadId, text, threadType } = req.body || {};
        if (!accountKey || !threadId || !text)
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu accountKey/threadId/text' });
        const r = await zca.send(accountKey, threadId, text, threadType);
        const ts = now();
        await db.query(
            `INSERT INTO web2_zalo_messages (msg_id, account_key, thread_id, thread_type, direction, msg_type, content, send_status, sent_at, created_at)
             VALUES ($1,$2,$3,$4,'out','text',$5,'sent',$6,$6) ON CONFLICT DO NOTHING`,
            [r.msgId, accountKey, threadId, threadType || 'user', String(text), ts]
        );
        await db.query(
            `UPDATE web2_zalo_conversations SET last_msg_at=$1, last_msg_text=$2, updated_at=$1 WHERE account_key=$3 AND thread_id=$4`,
            [ts, String(text).slice(0, 500), accountKey, threadId]
        );
        _notify('web2:zalo:messages', 'update', r.msgId);
        res.json({ success: true, msgId: r.msgId });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

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
