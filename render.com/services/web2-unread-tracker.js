// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Unread Messages Tracker (logic Web 2.0 thuần, KHÔNG học Web 1.0)
// =====================================================
//
// Bảng web2_unread_messages (web2Db). Nguồn DUY NHẤT: event realtime Pancake
// `pages:update_conversation` lấy từ server socket (server.js RealtimeClient).
// Web 2.0 ⊥ Web 1.0: KHÔNG đọc pending_customers, KHÔNG copy logic bump +1.
//
// Nguyên tắc (authoritative — tin tưởng Pancake làm chủ trạng thái đọc):
//   Pancake gửi `unread_count` chính xác + `last_sent_by` mỗi lần hội thoại đổi.
//   → SET message_count = unread_count (KHÔNG cộng dồn → không drift).
//   → unread_count = 0 (đã đọc trên Pancake) HOẶC shop là người gửi cuối
//     (shop vừa trả lời) → XOÁ khỏi danh sách (auto, không cần bấm tay).
//
// Vì sao chỉ dùng `update_conversation` (bỏ `new_message`): Pancake LUÔN bắn
// `update_conversation` kèm theo (mang unread_count authoritative + snippet).
// `new_message` chỉ là single-event không có count tổng → dùng nó để đếm sẽ
// drift. → unread đi hoàn toàn theo `update_conversation`. (`new_message` vẫn
// được dùng riêng cho keyword detector — việc khác.)
//
// SSE topic: web2:unread → trang web2/payment-confirm tab "Tin nhắn chưa đọc".

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

// ─── Đồng bộ 1 hội thoại từ event `pages:update_conversation` ─────────
// data = { psid, pageId, conversationId, customerName, snippet, unreadCount,
//          shopSentLast, lastMessageTime? }
// → unread=0 hoặc shopSentLast → XOÁ; else UPSERT (count = unread authoritative).
async function syncFromConversation(pool, data, notify) {
    if (!pool || !data || !data.psid || !data.pageId) return;
    const psid = String(data.psid);
    const pageId = String(data.pageId);
    const unread = Number(data.unreadCount) || 0;

    try {
        // Đã đọc trên Pancake (unread=0) hoặc shop gửi cuối → không còn "chưa đọc".
        if (unread === 0 || data.shopSentLast) {
            const r = await pool.query(
                `DELETE FROM web2_unread_messages WHERE psid = $1 AND page_id = $2`,
                [psid, pageId]
            );
            if (r.rowCount > 0) {
                _emit(notify, 'clear', { psid, pageId });
            }
            return;
        }

        // Khách còn tin chưa đọc → upsert với count authoritative từ Pancake.
        const now = data.lastMessageTime ? Number(data.lastMessageTime) : Date.now();
        const snippet = data.snippet ? String(data.snippet).slice(0, 200) : null;
        await pool.query(
            `INSERT INTO web2_unread_messages
                (psid, page_id, conversation_id, customer_name, last_message_snippet,
                 last_message_time, message_count, type, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$6)
             ON CONFLICT (psid, page_id) DO UPDATE SET
                conversation_id      = COALESCE(EXCLUDED.conversation_id, web2_unread_messages.conversation_id),
                customer_name        = COALESCE(EXCLUDED.customer_name, web2_unread_messages.customer_name),
                last_message_snippet = EXCLUDED.last_message_snippet,
                last_message_time    = EXCLUDED.last_message_time,
                message_count        = EXCLUDED.message_count,
                updated_at           = EXCLUDED.updated_at`,
            [
                psid,
                pageId,
                data.conversationId || null,
                data.customerName || null,
                snippet,
                now,
                unread,
                data.type || 'INBOX',
            ]
        );
        _emit(notify, 'upsert', { psid, pageId });
    } catch (e) {
        console.error('[WEB2-UNREAD] syncFromConversation failed:', e.message);
    }
}

module.exports = {
    ensureSchema,
    syncFromConversation,
};
