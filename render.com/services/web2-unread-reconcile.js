// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Unread Reconcile (lưới an toàn cho event WS bị miss)
// =====================================================
//
// Vấn đề: WS event là ephemeral. Khi shop đọc tin trên Pancake mà server đang
// restart/deploy (hoặc Pancake không đẩy unread=0 về socket bot) → event "đã đọc"
// bị MISS → row web2_unread_messages kẹt vĩnh viễn (thuần socket không recover).
//
// Giải pháp: định kỳ (+ lúc boot) hỏi Pancake "hội thoại nào còn chưa đọc THẬT"
// (nguồn sự thật, qua page_access_token) → REPLAY chính `syncFromConversation`
// của tracker trên dữ liệu Pancake hiện tại:
//   • conv unread=0 / shop gửi cuối  → tracker xoá row (đã đọc/đã xử lý)
//   • conv còn unread của khách       → tracker upsert (bắt cả event ADD bị miss)
//
// → Đọc trên Pancake → chậm nhất 1 chu kỳ (≤2') row tự biến mất, kể cả sau restart.
//
// Page token: bảng pancake_page_access_tokens (chatDb — infra credential Pancake
// chung, giống socket dùng pancake_accounts). Reconcile chỉ ĐỌC token; GHI vào
// web2Db. Không vi phạm tách lớp data (token là shared Pancake infra).

'use strict';

const tracker = require('./web2-unread-tracker');

const WORKER_URL = process.env.CF_WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
const FETCH_TIMEOUT_MS = 15000;

// ─── fetch JSON với timeout ───────────────────────────────────────────
async function _fetchJson(url, init = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        const text = await r.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (e) {
            /* non-JSON */
        }
        return { ok: r.ok, status: r.status, data };
    } finally {
        clearTimeout(timer);
    }
}

// ─── Page Access Token từ chatDb (read-only) ──────────────────────────
async function _getPAT(chatPool, pageId) {
    try {
        const { rows } = await chatPool.query(
            `SELECT token FROM pancake_page_access_tokens WHERE page_id = $1`,
            [String(pageId)]
        );
        return rows[0]?.token || null;
    } catch (e) {
        console.warn('[WEB2-UNREAD-RECONCILE] read PAT failed:', e.message);
        return null;
    }
}

// ─── Lấy conversations hiện tại của 1 page từ Pancake (qua worker) ─────
async function _fetchConversations(pageId, pat) {
    const url =
        `${WORKER_URL}/api/pancake-official-v2/pages/${encodeURIComponent(pageId)}/conversations` +
        `?page_access_token=${encodeURIComponent(pat)}&type=INBOX`;
    const { ok, data } = await _fetchJson(url, { headers: { Accept: 'application/json' } });
    if (!ok || !data) return [];
    return data.conversations || data.data || [];
}

// ─── Parse 1 conversation Pancake → shape cho syncFromConversation ─────
function _convToSyncData(conv, pageId) {
    const cid = String(conv.id || '');
    // psid: ưu tiên customers[0].fb_id (khớp cách WS lưu: from_psid||customers[0].fb_id),
    // fallback tách từ conversation_id "{pageId}_{psid}". KHÔNG dùng from.id (có thể
    // là page khi shop gửi cuối).
    let psid = String(conv.customers?.[0]?.fb_id || '');
    if (!psid && cid.includes('_')) psid = cid.split('_').pop();
    if (!psid) return null;

    const lastSenderId = String(
        conv.last_sent_by?.id || conv.last_message?.from?.id || conv.from_psid || ''
    );
    const shopSentLast = !!lastSenderId && lastSenderId === String(pageId);

    let lastMessageTime;
    const t = conv.updated_at || conv.last_message?.inserted_at;
    if (typeof t === 'number') lastMessageTime = t < 1e12 ? t * 1000 : t;
    else if (typeof t === 'string') {
        const p = Date.parse(t);
        if (!Number.isNaN(p)) lastMessageTime = p;
    }

    return {
        psid,
        pageId: String(pageId),
        conversationId: cid || `${pageId}_${psid}`,
        customerName: conv.from?.name || conv.customers?.[0]?.name || null,
        snippet: conv.snippet || conv.last_message?.message || '',
        unreadCount: Number(conv.unread_count || 0),
        shopSentLast,
        lastMessageTime,
    };
}

// ─── Áp danh sách conv (replay syncFromConversation) — TESTABLE ───────
// Trả số conv đã xử lý. syncFromConversation tự xoá (đã đọc) / upsert (còn unread).
async function applyConversations(web2Db, pageId, conversations, notify) {
    let applied = 0;
    for (const conv of conversations || []) {
        const data = _convToSyncData(conv, pageId);
        if (!data) continue;
        await tracker.syncFromConversation(web2Db, data, notify);
        applied++;
    }
    return applied;
}

// ─── Reconcile 1 page ─────────────────────────────────────────────────
async function reconcilePage(web2Db, chatPool, pageId, notify) {
    const pat = await _getPAT(chatPool, pageId);
    if (!pat) return { page: pageId, skipped: 'no-PAT' };
    const convs = await _fetchConversations(pageId, pat);
    if (!convs.length) return { page: pageId, convs: 0, applied: 0 };
    const applied = await applyConversations(web2Db, pageId, convs, notify);
    return { page: pageId, convs: convs.length, applied };
}

// ─── Reconcile tất cả page đang có row unread ─────────────────────────
async function reconcileAll(web2Db, chatPool, notify) {
    if (!web2Db || !chatPool) return;
    try {
        const { rows } = await web2Db.query(
            `SELECT DISTINCT page_id FROM web2_unread_messages WHERE page_id IS NOT NULL`
        );
        if (!rows.length) return;
        let pages = 0;
        for (const r of rows) {
            try {
                await reconcilePage(web2Db, chatPool, r.page_id, notify);
                pages++;
            } catch (e) {
                console.warn(`[WEB2-UNREAD-RECONCILE] page ${r.page_id} failed:`, e.message);
            }
        }
        console.log(`[WEB2-UNREAD-RECONCILE] reconciled ${pages} page(s)`);
    } catch (e) {
        console.error('[WEB2-UNREAD-RECONCILE] reconcileAll failed:', e.message);
    }
}

module.exports = {
    reconcileAll,
    reconcilePage,
    applyConversations, // export cho test
    _convToSyncData,
};
