// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// PANCAKE UNREAD DISCOVERY (Web 1.0) — quét list hội thoại CHƯA ĐỌC của Pancake
// (unread_count authoritative) rồi upsert vào pending_customers.
//
// VÌ SAO CẦN: cột TIN NHẮN dựa trên WS realtime (server.js RealtimeClient) để
// ADD pending_customers. Nhưng WS KHÔNG replay event đã miss (server restart,
// token gap, hoặc lúc KHÔNG có client nào mở/push token). Hậu quả: tin nhắn tới
// trong "vùng offline" không bao giờ vào pending_customers → mở lại client KHÔNG
// thấy badge. Pancake thì luôn biết vì nó giữ unread_count server-side.
//
// Giải pháp: định kỳ + lúc mở client, quét đúng "list unread của Pancake" và
// mirror vào pending_customers → mở lại nhận biết tin mới y như Pancake, độc lập
// hoàn toàn với việc có client đang mở hay không.
//
// Web 1.0 only (chatDb / pending_customers). KHÔNG phải poller Web 2.0.

const fetch = require('node-fetch');

/**
 * @param {import('pg').Pool} db chatDb pool (Web 1.0)
 * @returns {Promise<{ok:boolean, scanned:number, upserted:number, reason?:string}>}
 */
async function discoverUnread(db) {
    if (!db) return { ok: false, scanned: 0, upserted: 0, reason: 'no db' };

    // Pages Web 1.0 đang theo dõi (browser push qua /api/realtime/start).
    let pageIds = [];
    try {
        const credRes = await db.query(
            `SELECT page_ids FROM realtime_credentials WHERE client_type='pancake' AND is_active=true LIMIT 1`
        );
        pageIds = JSON.parse(credRes.rows[0]?.page_ids || '[]');
    } catch (_) {
        /* table may not exist / bad json → no pages */
    }
    if (!Array.isArray(pageIds) || pageIds.length === 0) {
        return { ok: false, scanned: 0, upserted: 0, reason: 'no active pages' };
    }

    // Token JWT còn hạn — ưu tiên pancake_accounts (như reconcile cron), fallback
    // token browser push trong realtime_credentials.
    const nowSec = Math.floor(Date.now() / 1000);
    let token = null;
    let acctId = null;
    try {
        const acctRes = await db.query(
            `SELECT account_id, token FROM pancake_accounts
             WHERE is_active = true AND token IS NOT NULL
               AND (token_exp IS NULL OR token_exp::bigint > $1)
             ORDER BY last_used_at DESC NULLS LAST LIMIT 1`,
            [nowSec]
        );
        token = acctRes.rows[0]?.token || null;
        acctId = acctRes.rows[0]?.account_id || null;
    } catch (_) {
        /* ignore */
    }
    if (!token) {
        try {
            const cr = await db.query(
                `SELECT token FROM realtime_credentials WHERE client_type='pancake' AND is_active=true LIMIT 1`
            );
            token = cr.rows[0]?.token || null;
        } catch (_) {
            /* ignore */
        }
    }
    if (!token) return { ok: false, scanned: 0, upserted: 0, reason: 'no usable token' };

    // Pancake list cross-page, ưu tiên chưa đọc trước (unread_first) — đúng "list
    // unread" hiển thị trong inbox Pancake. JWT v1 (docs/pancake §13 GET /conversations).
    const pagesParam = pageIds.map((p) => `pages[${encodeURIComponent(p)}]=0`).join('&');
    const url =
        `https://pancake.vn/api/v1/conversations?access_token=${token}&${pagesParam}` +
        `&type=INBOX&unread_first=true&cursor_mode=true`;

    let convs = [];
    try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!r.ok) return { ok: false, scanned: 0, upserted: 0, reason: 'http ' + r.status };
        const data = await r.json().catch(() => null);
        convs = (data && data.conversations) || [];
    } catch (e) {
        return { ok: false, scanned: 0, upserted: 0, reason: e.message };
    }

    let upserted = 0;
    let scanned = 0;
    for (const c of convs) {
        scanned++;
        const unread = typeof c.unread_count === 'number' ? c.unread_count : 0;
        if (unread <= 0) continue; // chỉ chưa đọc (unread_first → đã đọc nằm cuối, bỏ)
        if ((c.type || 'INBOX') !== 'INBOX') continue;
        const pageId = String(c.page_id || '');
        const psid = String(
            c.from_psid ||
                c.from_id ||
                (c.customers && c.customers[0] && c.customers[0].fb_id) ||
                ''
        );
        if (!pageId || !psid || psid === pageId) continue; // bỏ tin của chính page
        const phone =
            (c.recent_phone_numbers &&
                c.recent_phone_numbers[0] &&
                c.recent_phone_numbers[0].phone_number) ||
            (c.conv_phone_numbers &&
                c.conv_phone_numbers[0] &&
                c.conv_phone_numbers[0].phone_number) ||
            null;
        const name =
            (c.from && c.from.name) ||
            (c.customers && c.customers[0] && c.customers[0].name) ||
            null;
        const snippet = (c.snippet || '').toString().substring(0, 200);
        // unread_count Pancake = authoritative → SET message_count = unread (như
        // reconcile cron). Shop-sent-last: list v1 không có last_sent_by; nếu Pancake
        // còn báo unread>0 thì coi như chưa đọc (đúng như Pancake hiển thị). Reconcile
        // cron (:00, fetch full conv có last_sent_by) sẽ DELETE nếu thực ra shop đã rep.
        try {
            await db.query(
                `INSERT INTO pending_customers
                   (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type, phone)
                 VALUES ($1, $2, $3, $4, NOW(), $5, 'INBOX', $6)
                 ON CONFLICT (psid, page_id) DO UPDATE SET
                   customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                   last_message_snippet = EXCLUDED.last_message_snippet,
                   message_count = $5,
                   phone = COALESCE(EXCLUDED.phone, pending_customers.phone)`,
                [psid, pageId, name, snippet, unread, phone]
            );
            upserted++;
        } catch (_) {
            /* per-row failure không chặn các row khác */
        }
    }

    if (acctId) {
        try {
            await db.query(
                `UPDATE pancake_accounts SET last_used_at = NOW() WHERE account_id = $1`,
                [acctId]
            );
        } catch (_) {
            /* ignore */
        }
    }

    return { ok: true, scanned, upserted };
}

module.exports = { discoverUnread };
