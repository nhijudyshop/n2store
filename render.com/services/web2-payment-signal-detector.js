// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Payment Signal Detector ("KH báo đã chuyển khoản")
// =====================================================
//
// Khách nhắn "CK XONG" / "ĐÃ CK" trong inbox Pancake → server detect keyword →
// ghi vào web2_payment_signals (web2Db) + best-effort khớp đơn (native_orders /
// fast_sale_orders) → broadcast SSE topic `web2:payment-signals`.
//
// Hook: server.js RealtimeClient.handleMessage nhánh `pages:new_message` gọi
//   handleIncoming(web2Db, {...}, notifyClients).
//
// ⚠ KHÔNG xác nhận tiền thật — chỉ là tín hiệu KH *báo* đã CK. Đối soát tiền
//    vẫn qua SePay/balance-history. Signal mặc định status='pending', user duyệt
//    trên trang web2/payment-confirm mới gắn cờ đơn (status='confirmed').
//
// Table (web2Db): web2_payment_signals
//   ⚠ Detector chỉ INSERT khi keyword match → KHÔNG đụng luồng inbox hiện tại.

'use strict';

// Dedup window: bỏ qua nếu psid+page đã có signal (BẤT KỲ status) trong window.
// Phải đủ dài vì detect chạy CẢ trên pages:update_conversation (re-fire nhiều
// lần cùng 1 snippet khi shop đọc/đổi hội thoại) — nếu chỉ chặn status 'pending'
// thì signal đã dismiss/confirm sẽ bị tạo lại mỗi lần re-fire. 6h: gom mọi
// re-fire của cùng 1 lần KH báo, vẫn cho KH báo lại sau (đơn mới) qua ngày.
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;

// ─── Normalize: lowercase + bỏ dấu tiếng Việt + đ→d + collapse space ──
function normalize(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // combining marks (dấu)
        .replace(/đ/g, 'd')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Detect keyword "CK XONG" / "ĐÃ CK" (không phân biệt hoa/thường/dấu) ──
// Trả { matched: bool, keyword: 'CK XONG' | 'ĐÃ CK' | null }
function detectPaymentKeyword(rawText) {
    const t = normalize(rawText);
    if (!t) return { matched: false, keyword: null };

    // Loại câu hỏi (vd "đã ck chưa em?", "ck kiểu gì") → tránh false-positive.
    if (/[?]/.test(rawText)) return { matched: false, keyword: null };
    if (/\b(chua|khong|the nao|kieu gi|lam sao|o dau|bang gi)\b/.test(t)) {
        return { matched: false, keyword: null };
    }

    // "ck xong" — ưu tiên (rõ ràng nhất)
    if (/(^|[^a-z])ck ?xong([^a-z]|$)/.test(t)) {
        return { matched: true, keyword: 'CK XONG' };
    }
    // "đã ck" → "da ck"
    if (/(^|[^a-z])da ?ck([^a-z]|$)/.test(t)) {
        return { matched: true, keyword: 'ĐÃ CK' };
    }
    return { matched: false, keyword: null };
}

// ─── Schema (idempotent, gọi lúc boot từ server.js) ───────────────────
async function ensureSchema(pool) {
    if (!pool) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_payment_signals (
            id                 BIGSERIAL PRIMARY KEY,
            psid               TEXT,
            page_id            TEXT,
            conversation_id    TEXT,
            customer_name      TEXT,
            raw_message        TEXT,
            matched_keyword    TEXT,
            phone              VARCHAR(40),
            matched_order_type VARCHAR(20),   -- 'native' | 'fast_sale' | null
            matched_order_code TEXT,
            status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|confirmed|dismissed
            created_at         BIGINT NOT NULL,
            confirmed_at       BIGINT,
            confirmed_by       TEXT
        );
    `);
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2paysig_status ON web2_payment_signals(status);`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2paysig_created ON web2_payment_signals(created_at DESC);`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2paysig_psid_page ON web2_payment_signals(psid, page_id);`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_w2paysig_order ON web2_payment_signals(matched_order_code) WHERE matched_order_code IS NOT NULL;`
    );
    console.log('[WEB2-PAYSIG] schema ensured');
}

// ─── Resolve phone từ psid (fb_id) qua kho KH web2_customers ──────────
async function _resolvePhone(pool, psid) {
    if (!psid) return null;
    try {
        const { rows } = await pool.query(
            `SELECT phone FROM web2_customers
             WHERE fb_id = $1 AND phone IS NOT NULL AND phone <> ''
             ORDER BY synced_at DESC NULLS LAST LIMIT 1`,
            [String(psid)]
        );
        return rows[0]?.phone || null;
    } catch (e) {
        // web2_customers có thể chưa tồn tại ở môi trường test → im lặng
        return null;
    }
}

// ─── Best-effort khớp đơn theo phone (đơn mới nhất, chưa giao xong) ────
// Trả { type, code } | null
async function _matchOrder(pool, phone) {
    if (!phone) return null;
    // 1. native_orders (Đơn Web) — ưu tiên
    try {
        const { rows } = await pool.query(
            `SELECT code FROM native_orders
             WHERE phone = $1 AND status <> 'cancelled'
             ORDER BY created_at DESC NULLS LAST LIMIT 1`,
            [phone]
        );
        if (rows[0]?.code) return { type: 'native', code: rows[0].code };
    } catch (e) {
        /* table may be absent in test */
    }
    // 2. fast_sale_orders (PBH) — fallback theo partner_phone (mã đơn = number)
    try {
        const { rows } = await pool.query(
            `SELECT number FROM fast_sale_orders
             WHERE partner_phone = $1
             ORDER BY created_at DESC NULLS LAST LIMIT 1`,
            [phone]
        );
        if (rows[0]?.number) return { type: 'fast_sale', code: rows[0].number };
    } catch (e) {
        /* ignore */
    }
    return null;
}

// ─── Có signal (BẤT KỲ status) trùng psid+page trong window? ──────────
// ANY status (không chỉ pending) để signal đã dismiss/confirm KHÔNG bị tạo lại
// khi update_conversation re-fire cùng snippet.
async function _hasRecentSignal(pool, psid, pageId, now) {
    try {
        const { rows } = await pool.query(
            `SELECT 1 FROM web2_payment_signals
             WHERE psid = $1 AND page_id = $2
               AND created_at > $3 LIMIT 1`,
            [String(psid || ''), String(pageId || ''), now - DEDUP_WINDOW_MS]
        );
        return rows.length > 0;
    } catch (e) {
        return false;
    }
}

// ─── Entry point: gọi từ server.js cho mỗi tin nhắn đến của khách ──────
// data = { message, psid, pageId, conversationId, customerName }
// notify = web2RealtimeSseRoutes.notifyClients (topic, payload, eventType)
// Trả signal đã ghi (hoặc null nếu không match / dedup).
async function handleIncoming(pool, data, notify) {
    if (!pool || !data) return null;
    const { matched, keyword } = detectPaymentKeyword(data.message);
    if (!matched) return null;

    const now = Date.now();
    if (await _hasRecentSignal(pool, data.psid, data.pageId, now)) {
        return null; // đã ghi gần đây (bất kỳ status), bỏ qua trùng / chống tái tạo
    }

    const phone = await _resolvePhone(pool, data.psid);
    const order = await _matchOrder(pool, phone);

    let signal = null;
    try {
        const { rows } = await pool.query(
            `INSERT INTO web2_payment_signals
                (psid, page_id, conversation_id, customer_name, raw_message,
                 matched_keyword, phone, matched_order_type, matched_order_code,
                 status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
             RETURNING *`,
            [
                String(data.psid || ''),
                String(data.pageId || ''),
                data.conversationId || null,
                data.customerName || null,
                String(data.message || '').slice(0, 1000),
                keyword,
                phone,
                order?.type || null,
                order?.code || null,
                now,
            ]
        );
        signal = rows[0];
    } catch (e) {
        console.error('[WEB2-PAYSIG] insert failed:', e.message);
        return null;
    }

    console.log(
        `[WEB2-PAYSIG] signal: "${data.customerName || data.psid}" keyword=${keyword} phone=${phone || '?'} order=${order?.code || 'none'}`
    );

    if (typeof notify === 'function') {
        try {
            notify(
                'web2:payment-signals',
                { action: 'new', id: signal.id, keyword, ts: now },
                'update'
            );
        } catch (e) {
            console.warn('[WEB2-PAYSIG] notify failed:', e.message);
        }
    }
    return signal;
}

module.exports = {
    normalize,
    detectPaymentKeyword,
    ensureSchema,
    handleIncoming,
    _resolvePhone,
    _matchOrder,
    DEDUP_WINDOW_MS,
};
