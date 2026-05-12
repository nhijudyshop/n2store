// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// REALTIME UPDATES API
// Lưu và truy vấn tin nhắn/bình luận mới từ Pancake
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * Lưu một realtime update vào database
 * Được gọi từ WebSocket handler trong server.js
 */
async function saveRealtimeUpdate(db, updateData) {
    const { conversationId, type, snippet, unreadCount, pageId, psid, customerName } = updateData;

    try {
        const query = `
            INSERT INTO realtime_updates
            (conversation_id, type, snippet, unread_count, page_id, psid, customer_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, created_at
        `;

        const result = await db.query(query, [
            conversationId,
            type || 'INBOX',
            snippet ? snippet.substring(0, 200) : null, // Limit snippet length
            unreadCount || 0,
            pageId,
            psid,
            customerName,
        ]);

        console.log(`[REALTIME-DB] Saved update: ${type} from ${customerName || psid}`);
        return result.rows[0];
    } catch (error) {
        console.error('[REALTIME-DB] Error saving update:', error.message);
        return null;
    }
}

/**
 * GET /api/realtime/new-messages
 * Lấy tin nhắn/bình luận mới kể từ timestamp
 *
 * Query params:
 * - since: Unix timestamp (ms) - bắt buộc
 * - limit: Số lượng tối đa (default: 100)
 */
router.get('/new-messages', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const since = parseInt(req.query.since) || 0;
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);

        // Convert timestamp to Date
        const sinceDate = since > 0 ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

        const query = `
            SELECT
                id,
                conversation_id,
                type,
                snippet,
                unread_count,
                page_id,
                psid,
                customer_name,
                created_at
            FROM realtime_updates
            WHERE created_at > $1 AND (seen = FALSE OR seen IS NULL)
            ORDER BY created_at DESC
            LIMIT $2
        `;

        const result = await db.query(query, [sinceDate, limit]);

        // Group by type
        const messages = result.rows.filter((r) => r.type === 'INBOX');
        const comments = result.rows.filter((r) => r.type === 'COMMENT');

        // Get unique customers
        const uniquePsids = [...new Set(result.rows.map((r) => r.psid).filter(Boolean))];

        res.json({
            success: true,
            total: result.rows.length,
            messages: {
                count: messages.length,
                items: messages,
            },
            comments: {
                count: comments.length,
                items: comments,
            },
            uniqueCustomers: uniquePsids.length,
            since: sinceDate.toISOString(),
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[REALTIME-API] Error fetching new messages:', error);
        res.status(500).json({ error: 'Failed to fetch new messages' });
    }
});

/**
 * GET /api/realtime/summary
 * Lấy tóm tắt tin mới (count only, không chi tiết)
 */
router.get('/summary', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const since = parseInt(req.query.since) || 0;
        const sinceDate = since > 0 ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

        const query = `
            SELECT
                type,
                COUNT(*) as count,
                COUNT(DISTINCT psid) as unique_customers
            FROM realtime_updates
            WHERE created_at > $1 AND (seen = FALSE OR seen IS NULL)
            GROUP BY type
        `;

        const result = await db.query(query, [sinceDate]);

        const summary = {
            messages: 0,
            comments: 0,
            uniqueCustomers: 0,
        };

        result.rows.forEach((row) => {
            if (row.type === 'INBOX') {
                summary.messages = parseInt(row.count);
            } else if (row.type === 'COMMENT') {
                summary.comments = parseInt(row.count);
            }
        });

        // Get total unique customers across all types (only unseen)
        const uniqueQuery = `
            SELECT COUNT(DISTINCT psid) as total
            FROM realtime_updates
            WHERE created_at > $1 AND psid IS NOT NULL AND (seen = FALSE OR seen IS NULL)
        `;
        const uniqueResult = await db.query(uniqueQuery, [sinceDate]);
        summary.uniqueCustomers = parseInt(uniqueResult.rows[0]?.total || 0);

        res.json({
            success: true,
            ...summary,
            total: summary.messages + summary.comments,
            since: sinceDate.toISOString(),
            serverTime: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[REALTIME-API] Error fetching summary:', error);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

/**
 * POST /api/realtime/mark-seen
 * Đánh dấu đã xem các updates
 */
router.post('/mark-seen', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { ids, before } = req.body;

        let query, params;

        if (ids && Array.isArray(ids) && ids.length > 0) {
            // Mark specific IDs as seen
            query = `UPDATE realtime_updates SET seen = TRUE WHERE id = ANY($1)`;
            params = [ids];
        } else if (before) {
            // Mark all before timestamp as seen
            query = `UPDATE realtime_updates SET seen = TRUE WHERE created_at <= $1`;
            params = [new Date(before)];
        } else {
            return res.status(400).json({ error: 'Missing ids or before parameter' });
        }

        const result = await db.query(query, params);

        res.json({
            success: true,
            updated: result.rowCount,
        });
    } catch (error) {
        console.error('[REALTIME-API] Error marking seen:', error);
        res.status(500).json({ error: 'Failed to mark as seen' });
    }
});

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
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        const query = `
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                last_message_time,
                message_count,
                type
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
        const query = useUnread
            ? `
                INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
                VALUES ($1, $2, $3, $4, NOW(), $6, $5)
                ON CONFLICT (psid, page_id)
                DO UPDATE SET
                    customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                    last_message_snippet = EXCLUDED.last_message_snippet,
                    last_message_time = NOW(),
                    message_count = $6
            `
            : `
                INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
                VALUES ($1, $2, $3, $4, NOW(), 1, $5)
                ON CONFLICT (psid, page_id)
                DO UPDATE SET
                    customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                    last_message_snippet = EXCLUDED.last_message_snippet,
                    last_message_time = NOW(),
                    message_count = pending_customers.message_count + 1
            `;

        const params = [
            data.psid,
            data.pageId,
            data.customerName,
            data.snippet ? data.snippet.substring(0, 200) : null,
            data.type || 'INBOX',
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

// Export both router and helper functions
module.exports = router;
module.exports.saveRealtimeUpdate = saveRealtimeUpdate;
module.exports.upsertPendingCustomer = upsertPendingCustomer;
