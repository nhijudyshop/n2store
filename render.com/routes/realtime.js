// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// REALTIME UPDATES API
// Lưu và truy vấn tin nhắn/bình luận mới từ Pancake
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// DEPRECATED (2026-06-14): `realtime_updates` event-log system + the
// GET /new-messages, GET /summary, POST /mark-seen endpoints below it
// have been REMOVED. They were a parallel "seen"-based unread system that
// NO frontend called anymore — the live cột TIN NHẮN uses `pending_customers`
// exclusively (see GET /pending-customers + upsertPendingCustomer). The old
// system only bloated the DB (server ghi mỗi event, không ai đọc/clear).
// `saveRealtimeUpdate` write path (server.js handleMessage) đã gỡ.
// Bảng `realtime_updates` giữ husk (không còn ghi) — dọn rows cũ qua
// POST /wipe-all hoặc DELETE /clear-all?confirm=yes nếu cần.
// =====================================================

/**
 * DELETE /api/realtime/cleanup
 * Xóa records cũ (admin only)
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const days = parseInt(req.query.days) || 7;

        const query = `
            DELETE FROM realtime_updates
            WHERE created_at < NOW() - INTERVAL '${days} days'
            RETURNING id
        `;

        const result = await db.query(query);

        console.log(`[REALTIME-DB] Cleaned up ${result.rowCount} old records`);

        res.json({
            success: true,
            deleted: result.rowCount,
        });
    } catch (error) {
        console.error('[REALTIME-API] Error cleaning up:', error);
        res.status(500).json({ error: 'Failed to cleanup' });
    }
});

/**
 * DELETE /api/realtime/clear-all
 * Xóa TẤT CẢ records trong realtime_updates (reset database)
 */
router.delete('/clear-all', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Safety: require confirmation query param
        if (req.query.confirm !== 'yes') {
            return res.status(400).json({
                error: 'Missing confirmation',
                hint: 'Add ?confirm=yes to confirm deletion of all records',
            });
        }

        const result = await db.query('DELETE FROM realtime_updates RETURNING id');

        console.log(`[REALTIME-DB] CLEARED ALL ${result.rowCount} records`);

        res.json({
            success: true,
            deleted: result.rowCount,
            message: 'All realtime_updates records have been deleted',
        });
    } catch (error) {
        console.error('[REALTIME-API] Error clearing all:', error);
        res.status(500).json({ error: 'Failed to clear all records' });
    }
});

// =====================================================
// PENDING CUSTOMERS APIs
// Danh sách khách hàng chưa được trả lời
// =====================================================

/**
 * GET /api/realtime/pending-customers
 * Lấy danh sách khách chưa được trả lời
 */
router.get('/pending-customers', async (req, res) => {
    try {
        // Defense-in-depth: đây là realtime Web 1.0 (chatDb). web2-api (WEB2_ONLY=1)
        // KHÔNG được phục vụ. Cloudflare routing đã chặn, đây là lớp guard thứ 2.
        if (process.env.WEB2_ONLY === '1') {
            return res
                .status(410)
                .json({ error: 'Not available on web2-api — use Web 1.0 (n2store-fallback)' });
        }
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        // ⚠ last_message_time là TIMESTAMP (no tz) lưu giờ UTC dạng naive. Node pg
        // driver chạy TZ=+7 sẽ đọc naive đó NHẦM thành +7 → client thấy lệch −7h
        // (khách mới nhắn báo "trễ 7h"). Emit ISO-UTC kèm 'Z' để client parse đúng instant.
        const query = `
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                to_char(last_message_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_message_time,
                message_count,
                type,
                phone
            FROM pending_customers
            ORDER BY last_message_time DESC
            LIMIT $1
        `;

        const result = await db.query(query, [limit]);

        res.json({
            success: true,
            count: result.rows.length,
            customers: result.rows,
        });
    } catch (error) {
        console.error('[REALTIME-API] Error fetching pending customers:', error);
        res.status(500).json({ error: 'Failed to fetch pending customers' });
    }
});

/**
 * POST /api/realtime/mark-replied
 * Đánh dấu đã trả lời khách (xóa khỏi pending)
 */
router.post('/mark-replied', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { psid, pageId } = req.body;

        if (!psid) {
            return res.status(400).json({ error: 'Missing psid parameter' });
        }

        const query = `
            DELETE FROM pending_customers
            WHERE psid = $1 AND (page_id = $2 OR $2 IS NULL)
            RETURNING *
        `;

        const result = await db.query(query, [psid, pageId || null]);

        console.log(`[REALTIME-DB] Marked replied: ${psid} (${result.rowCount} removed)`);

        res.json({
            success: true,
            removed: result.rowCount,
        });
    } catch (error) {
        console.error('[REALTIME-API] Error marking replied:', error);
        res.status(500).json({ error: 'Failed to mark as replied' });
    }
});

/**
 * POST /api/realtime/pending-customers/reset-counts
 * Legacy tool: reset message_count về 1 (giữ lại record nhưng count = 1).
 */
router.post('/pending-customers/reset-counts', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const result = await db.query(
            `UPDATE pending_customers SET message_count = 1 WHERE message_count > 1 RETURNING psid`
        );
        console.log(`[REALTIME-DB] Reset message_count cho ${result.rowCount} rows`);
        res.json({ success: true, resetRows: result.rowCount });
    } catch (error) {
        console.error('[REALTIME-API] Error resetting counts:', error);
        res.status(500).json({ error: 'Failed to reset counts' });
    }
});

/**
 * POST /api/realtime/wipe-all
 * Admin tool: XÓA TOÀN BỘ lịch sử cũ trong:
 *   - pending_customers (badge tin nhắn / bình luận chưa đọc)
 *   - realtime_updates (event log của Pancake updates)
 * Sau wipe, hệ thống tự build lại từ events mới về (đã filter đúng INBOX-only
 * theo fix server.js:769). Không động đến invoice_status_v2 / processing_tags.
 * Dùng để clean slate sau bug count COMMENT-as-INBOX.
 */
router.post('/wipe-all', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const pcResult = await db.query(`DELETE FROM pending_customers RETURNING psid`);
        const ruResult = await db.query(`DELETE FROM realtime_updates RETURNING id`);

        console.log(
            `[REALTIME-DB] WIPED ALL — pending_customers: ${pcResult.rowCount} rows, realtime_updates: ${ruResult.rowCount} rows`
        );
        res.json({
            success: true,
            wiped: {
                pending_customers: pcResult.rowCount,
                realtime_updates: ruResult.rowCount,
            },
        });
    } catch (error) {
        console.error('[REALTIME-API] Error wiping all:', error);
        res.status(500).json({ error: 'Failed to wipe all', detail: error.message });
    }
});

/**
 * POST /api/realtime/sync-pending
 * Body: { psid, pageId, unreadCount, customerName?, snippet?, type? }
 *
 * Override message_count với giá trị từ Pancake's authoritative
 * unread_count. Dùng cho reconcile khi DB drift khỏi Pancake state
 * (vd server WS bị miss event hoặc bump dồn).
 *
 * - unreadCount === 0 → DELETE row (clear)
 * - unreadCount > 0  → upsert với message_count = unreadCount
 */
router.post('/sync-pending', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const { psid, pageId, unreadCount, customerName, snippet, type } = req.body || {};
        if (!psid || !pageId) {
            return res.status(400).json({ error: 'psid + pageId required' });
        }
        const count = parseInt(unreadCount, 10);
        if (!Number.isFinite(count) || count < 0) {
            return res.status(400).json({ error: 'unreadCount must be a non-negative integer' });
        }

        if (count === 0) {
            const r = await db.query(
                `DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2 RETURNING psid`,
                [psid, pageId]
            );
            return res.json({ success: true, action: 'deleted', removed: r.rowCount });
        }

        await upsertPendingCustomer(db, {
            psid,
            pageId,
            customerName: customerName || null,
            snippet: snippet || null,
            type: type || 'INBOX',
            unreadCount: count,
        });
        return res.json({ success: true, action: 'upserted', count });
    } catch (error) {
        console.error('[REALTIME-API] sync-pending error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Upsert vào pending_customers khi có tin nhắn mới.
 *
 * `data.unreadCount` (optional, integer):
 *   • Pancake's authoritative unread_count cho conversation (đến từ
 *     `pages:update_conversation` event). Khi có giá trị, SET
 *     message_count = unreadCount (không bump). Đảm bảo badge "X MỚI"
 *     khớp với Pancake (owner repro 2026-05-12: DB count 8 nhưng
 *     Pancake unread chỉ 2 vì server bump +1 mỗi event mà không reset
 *     theo source-of-truth).
 *   • Khi không có (vd `pages:new_message` single-message event), bump
 *     count thêm 1 như cũ — update_conversation tiếp theo sẽ correct
 *     lại nếu drift.
 */
async function upsertPendingCustomer(db, data) {
    try {
        const useUnread = typeof data.unreadCount === 'number' && data.unreadCount >= 1;
        const initialCount = useUnread ? data.unreadCount : 1;

        // INSERT: dùng count truyền vào (hoặc 1 nếu không có).
        // UPDATE: nếu unreadCount provided, SET = nó (authoritative); else bump.
        // $6 = phone (nullable). Lưu để match badge theo SĐT khi PSID lệch.
        const query = useUnread
            ? `
                INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type, phone)
                VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'UTC'), $7, $5, $6)
                ON CONFLICT (psid, page_id)
                DO UPDATE SET
                    customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                    last_message_snippet = EXCLUDED.last_message_snippet,
                    last_message_time = (NOW() AT TIME ZONE 'UTC'),
                    message_count = $7,
                    phone = COALESCE(EXCLUDED.phone, pending_customers.phone)
            `
            : `
                INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type, phone)
                VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'UTC'), 1, $5, $6)
                ON CONFLICT (psid, page_id)
                DO UPDATE SET
                    customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                    last_message_snippet = EXCLUDED.last_message_snippet,
                    last_message_time = (NOW() AT TIME ZONE 'UTC'),
                    message_count = pending_customers.message_count + 1,
                    phone = COALESCE(EXCLUDED.phone, pending_customers.phone)
            `;

        const params = [
            data.psid,
            data.pageId,
            data.customerName,
            data.snippet ? data.snippet.substring(0, 200) : null,
            data.type || 'INBOX',
            data.phone || null,
        ];
        if (useUnread) params.push(initialCount);

        await db.query(query, params);

        console.log(
            `[REALTIME-DB] Upserted pending customer: ${data.customerName || data.psid} (count=${useUnread ? data.unreadCount : '+1'})`
        );
    } catch (error) {
        console.error('[REALTIME-DB] Error upserting pending customer:', error.message);
    }
}

// =====================================================
// CONVERSATION POST TYPES APIs
// Lưu post_type per conversation để filter livestream nhanh
// =====================================================

/**
 * PUT /api/realtime/post-type
 * Upsert post_type for a conversation
 */
router.put('/post-type', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { conversationId, pageId, postId, postType, liveVideoStatus } = req.body;

        if (!conversationId) {
            return res.status(400).json({ error: 'Missing conversationId' });
        }

        const query = `
            INSERT INTO conversation_post_types
            (conversation_id, page_id, post_id, post_type, live_video_status)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (conversation_id) DO UPDATE SET
                page_id = COALESCE(EXCLUDED.page_id, conversation_post_types.page_id),
                post_id = COALESCE(EXCLUDED.post_id, conversation_post_types.post_id),
                post_type = EXCLUDED.post_type,
                live_video_status = EXCLUDED.live_video_status,
                updated_at = CURRENT_TIMESTAMP
        `;

        await db.query(query, [
            conversationId,
            pageId || null,
            postId || null,
            postType || null,
            liveVideoStatus || null,
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[REALTIME-API] Error saving post type:', error);
        res.status(500).json({ error: 'Failed to save post type' });
    }
});

/**
 * GET /api/realtime/post-types
 * Get conversation post types, optionally filtered
 * Query params:
 * - post_type: filter by post_type (e.g. 'livestream')
 * - page_id: filter by page_id
 * - limit: max results (default 1000)
 */
router.get('/post-types', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const postType = req.query.post_type;
        const pageId = req.query.page_id;
        const limit = Math.min(parseInt(req.query.limit) || 1000, 5000);

        let query =
            'SELECT conversation_id, page_id, post_id, post_type, live_video_status, updated_at FROM conversation_post_types';
        const conditions = [];
        const params = [];

        if (postType) {
            params.push(postType);
            conditions.push(`post_type = $${params.length}`);
        }
        if (pageId) {
            params.push(pageId);
            conditions.push(`page_id = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY updated_at DESC';
        params.push(limit);
        query += ` LIMIT $${params.length}`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            count: result.rows.length,
            postTypes: result.rows,
        });
    } catch (error) {
        console.error('[REALTIME-API] Error fetching post types:', error);
        res.status(500).json({ error: 'Failed to fetch post types' });
    }
});

// =====================================================
// CHECKED CUSTOMERS — đánh dấu KH "đã kiểm tra/đã bán" theo CHIẾN DỊCH
// → loại khỏi thanh "Khách chưa trả lời" (kể cả khi có tin mới). Đồng bộ
// mọi máy qua SSE topic 'checked_customers'. (Web 1.0, table checked_customers.)
// =====================================================

function _notifyChecked(req, payload) {
    try {
        const notify = req.app.locals.realtimeSseNotify;
        if (notify) notify('checked_customers', payload, 'update');
    } catch (e) {
        console.warn('[CHECKED-CUST] notify failed:', e.message);
    }
}

// GET /api/realtime/checked-customers?campaign=<key> → { success, psids: [...] }
router.get('/checked-customers', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });
        const campaign = String(req.query.campaign || '').trim();
        if (!campaign) return res.json({ success: true, psids: [] });
        const r = await db.query(
            'SELECT psid FROM checked_customers WHERE campaign_key = $1',
            [campaign]
        );
        res.json({ success: true, psids: r.rows.map((x) => String(x.psid)) });
    } catch (error) {
        console.error('[CHECKED-CUST] GET error:', error.message);
        res.status(500).json({ error: 'Failed to fetch checked customers' });
    }
});

// POST /api/realtime/checked-customers { campaign, psid, page_id, checked_by } → mark checked
router.post('/checked-customers', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });
        const campaign = String(req.body.campaign || '').trim();
        const psid = String(req.body.psid || '').trim();
        const pageId = req.body.page_id ? String(req.body.page_id).trim() : null;
        const checkedBy = req.body.checked_by ? String(req.body.checked_by).slice(0, 120) : null;
        if (!campaign || !psid) {
            return res.status(400).json({ error: 'Missing campaign or psid' });
        }
        if (campaign.length > 120 || psid.length > 50) {
            return res.status(400).json({ error: 'campaign or psid too long' });
        }
        await db.query(
            `INSERT INTO checked_customers (campaign_key, psid, page_id, checked_by, checked_at)
             VALUES ($1, $2, $3, $4, (NOW() AT TIME ZONE 'UTC'))
             ON CONFLICT (campaign_key, psid) DO UPDATE SET
                 page_id = COALESCE(EXCLUDED.page_id, checked_customers.page_id),
                 checked_by = EXCLUDED.checked_by,
                 checked_at = (NOW() AT TIME ZONE 'UTC')`,
            [campaign, psid, pageId, checkedBy]
        );
        _notifyChecked(req, { campaign, psid, action: 'check', ts: Date.now() });
        res.json({ success: true });
    } catch (error) {
        console.error('[CHECKED-CUST] POST error:', error.message);
        res.status(500).json({ error: 'Failed to mark checked' });
    }
});

// DELETE /api/realtime/checked-customers { campaign, psid } → bỏ đánh dấu
router.delete('/checked-customers', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });
        const campaign = String(req.body.campaign || '').trim();
        const psid = String(req.body.psid || '').trim();
        if (!campaign || !psid) {
            return res.status(400).json({ error: 'Missing campaign or psid' });
        }
        await db.query(
            'DELETE FROM checked_customers WHERE campaign_key = $1 AND psid = $2',
            [campaign, psid]
        );
        _notifyChecked(req, { campaign, psid, action: 'uncheck', ts: Date.now() });
        res.json({ success: true });
    } catch (error) {
        console.error('[CHECKED-CUST] DELETE error:', error.message);
        res.status(500).json({ error: 'Failed to uncheck' });
    }
});

// Export router + the single live helper (pending_customers upsert).
// saveRealtimeUpdate removed 2026-06-14 (realtime_updates deprecated).
module.exports = router;
module.exports.upsertPendingCustomer = upsertPendingCustomer;
