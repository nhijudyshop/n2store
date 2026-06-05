// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Unread Messages Tracker (độc lập Web 1.0)
// =====================================================
//
// Bảng web2_unread_messages (web2Db) — bản theo dõi tin nhắn chưa đọc RIÊNG của
// Web 2.0, KHÔNG đọc bảng pending_customers (Web 1.0 / chatDb). Cùng nguồn sự
// kiện Pancake WS (server.js RealtimeClient) nhưng GHI sang web2Db độc lập →
// Web 2.0 ⊥ Web 1.0: không share table/state, bug 1 layer không ảnh hưởng layer kia.
//
// Hook (server.js handleMessage):
//   • pages:update_conversation → onConversationUpdate (unread authoritative;
//     unread=0 hoặc shop gửi cuối → delete; else upsert count=unread)
//   • pages:new_message (từ khách) → onNewMessage (bump +1)
//
// SSE topic: web2:unread  → trang web2/payment-confirm tab "Tin nhắn chưa đọc".
//
// Logic mirror upsertPendingCustomer (routes/realtime.js) nhưng ghi web2Db.

'use strict';

// ─── Schema (idempotent, gọi lúc boot từ server.js) ───────────────────
async function ensureSchema(pool) {
    if (!pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_unread_messages (
            psid                 TEXT NOT NULL,
            page_id              TEXT NOT NULL,
            conversation_id      TEXT,
            customer_name        TEXT,
            last_message_snippet TEXT,
            last_message_time    BIGINT,
            message_count        INTEGER NOT NULL DEFAULT 1,
            type                 TEXT DEFAULT 'INBOX',
            updated_at           BIGINT,
            PRIMARY KEY (psid, page_id)
        );
    `);
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2unread_time ON web2_unread_messages(last_message_time DESC);`
    );
    console.log('[WEB2-UNREAD] schema ensured');
}

// ─── SSE notify helper ────────────────────────────────────────────────
function _emit(notify, action, data) {
    if (typeof notify !== 'function') return;
    try {
        notify('web2:unread', { action, ...data, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-UNREAD] notify failed:', e.message);
    }
}

// ─── Upsert (count authoritative nếu có, else bump +1) ────────────────
async function _upsert(pool, data, notify) {
    const useUnread = typeof data.unreadCount === 'number' && data.unreadCount >= 1;
    const now = Date.now();
    const snippet = data.snippet ? String(data.snippet).slice(0, 200) : null;

    const sql = useUnread
        ? `
            INSERT INTO web2_unread_messages
              (psid, page_id, conversation_id, customer_name, last_message_snippet, last_message_time, message_count, type, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6)
            ON CONFLICT (psid, page_id) DO UPDATE SET
              conversation_id = COALESCE(EXCLUDED.conversation_id, web2_unread_messages.conversation_id),
              customer_name = COALESCE(EXCLUDED.customer_name, web2_unread_messages.customer_name),
              last_message_snippet = EXCLUDED.last_message_snippet,
              last_message_time = EXCLUDED.last_message_time,
              message_count = EXCLUDED.message_count,
              updated_at = EXCLUDED.updated_at`
        : `
            INSERT INTO web2_unread_messages
              (psid, page_id, conversation_id, customer_name, last_message_snippet, last_message_time, message_count, type, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6)
            ON CONFLICT (psid, page_id) DO UPDATE SET
              conversation_id = COALESCE(EXCLUDED.conversation_id, web2_unread_messages.conversation_id),
              customer_name = COALESCE(EXCLUDED.customer_name, web2_unread_messages.customer_name),
              last_message_snippet = EXCLUDED.last_message_snippet,
              last_message_time = EXCLUDED.last_message_time,
              message_count = web2_unread_messages.message_count + 1,
              updated_at = EXCLUDED.updated_at`;

    const params = [
        String(data.psid),
        String(data.pageId),
        data.conversationId || null,
        data.customerName || null,
        snippet,
        now,
        useUnread ? data.unreadCount : 1,
        data.type || 'INBOX',
    ];
    await pool.query(sql, params);
    _emit(notify, 'upsert', { psid: data.psid, pageId: data.pageId });
}

// ─── Delete (shop đã đọc / shop gửi cuối) ─────────────────────────────
async function _delete(pool, psid, pageId, notify) {
    const r = await pool.query(
        `DELETE FROM web2_unread_messages WHERE psid = $1 AND page_id = $2`,
        [String(psid), String(pageId)]
    );
    if (r.rowCount > 0) _emit(notify, 'clear', { psid, pageId });
    return r.rowCount;
}

// ─── pages:update_conversation (INBOX, unread authoritative) ──────────
// data = { conversationId, snippet, unreadCount, pageId, psid, customerName,
//          shopSentLast }
async function onConversationUpdate(pool, data, notify) {
    if (!pool || !data || !data.psid || !data.pageId) return;
    try {
        const unread = data.unreadCount || 0;
        if (data.shopSentLast || unread === 0) {
            await _delete(pool, data.psid, data.pageId, notify);
        } else {
            await _upsert(pool, data, notify);
        }
    } catch (e) {
        console.error('[WEB2-UNREAD] onConversationUpdate failed:', e.message);
    }
}

// ─── pages:new_message (từ khách) → bump ──────────────────────────────
// data = { conversationId, snippet, pageId, psid, customerName }
async function onNewMessage(pool, data, notify) {
    if (!pool || !data || !data.psid || !data.pageId) return;
    try {
        await _upsert(pool, { ...data, unreadCount: undefined }, notify);
    } catch (e) {
        console.error('[WEB2-UNREAD] onNewMessage failed:', e.message);
    }
}

// ─── Mark seen (user mở/đọc trên trang Web 2.0) ───────────────────────
async function markSeen(pool, psid, pageId, notify) {
    if (!pool) return 0;
    return _delete(pool, psid, pageId, notify);
}

module.exports = {
    ensureSchema,
    onConversationUpdate,
    onNewMessage,
    markSeen,
};
