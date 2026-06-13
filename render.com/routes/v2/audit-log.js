// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Audit Log (F05)
// Union view qua 4 bảng audit hiện có:
//   web2_product_history · fast_sale_order_history (created_at BIGINT epoch ms)
//   pbh_fulfillment_logs (created_at BIGINT)
//   wallet_adjustments (created_at TIMESTAMPTZ)
//
// Cast tất cả created_at về to_timestamp(BIGINT/1000) hoặc giữ nguyên TIMESTAMPTZ.
// =====================================================

const express = require('express');
// 1D-auth (2026-06-12): audit log lộ wallet adjustments + SĐT + tên user nội bộ → gate SOFT.
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');
const router = express.Router();

// Cache kết quả _tableExists (MEDIUM perf): 4 lần check serial/request ~40ms.
// Bảng audit cố định (DDL không đổi runtime) → cache 5 phút/process là an toàn.
const _TABLE_EXISTS_TTL_MS = 5 * 60 * 1000;
const _tableExistsCache = new Map(); // table → { exists, ts }

async function _tableExists(pool, table) {
    const cached = _tableExistsCache.get(table);
    if (cached && Date.now() - cached.ts < _TABLE_EXISTS_TTL_MS) {
        return cached.exists;
    }
    try {
        const r = await pool.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = $1) AS e`,
            [table]
        );
        const exists = Boolean(r.rows[0]?.e);
        _tableExistsCache.set(table, { exists, ts: Date.now() });
        return exists;
    } catch {
        return false; // không cache lỗi (transient) → check lại lần sau
    }
}

// GET /list?entity=&user=&from=&to=&limit=100&offset=0
router.get('/list', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const offset = Number(req.query.offset) || 0;
        const filterEntity = req.query.entity || null;
        const filterUser = req.query.user || null;
        const from = req.query.from || null;
        const to = req.query.to || null;

        const blocks = [];

        // 1. web2_product_history (created_at BIGINT epoch ms)
        if (await _tableExists(pool, 'web2_product_history')) {
            blocks.push(`
                SELECT
                    'product'::text AS entity,
                    product_code AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM web2_product_history
            `);
        }

        // 2. fast_sale_order_history (created_at BIGINT)
        if (await _tableExists(pool, 'fast_sale_order_history')) {
            blocks.push(`
                SELECT
                    'pbh'::text AS entity,
                    pbh_number AS entity_id,
                    action,
                    user_id, user_name,
                    source_page,
                    changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM fast_sale_order_history
            `);
        }

        // 3. pbh_fulfillment_logs (created_at BIGINT, columns: action, payload, state_before/after, user_id, user_name)
        if (await _tableExists(pool, 'pbh_fulfillment_logs')) {
            blocks.push(`
                SELECT
                    'reconcile'::text AS entity,
                    pbh_number AS entity_id,
                    action,
                    user_id,
                    user_name,
                    'reconcile'::text AS source_page,
                    jsonb_build_object(
                        'payload', payload,
                        'state_before', state_before,
                        'state_after', state_after
                    ) AS changes,
                    to_timestamp(created_at / 1000.0) AS created_at
                FROM pbh_fulfillment_logs
            `);
        }

        // 4. web2_wallet_adjustments (isolated Web 2.0 copy — sync từ legacy qua Postgres trigger)
        if (await _tableExists(pool, 'web2_wallet_adjustments')) {
            blocks.push(`
                SELECT
                    'wallet'::text AS entity,
                    COALESCE(wrong_customer_phone, correct_customer_phone, original_transaction_id::text) AS entity_id,
                    adjustment_type AS action,
                    NULL::text AS user_id,
                    created_by AS user_name,
                    'balance-history'::text AS source_page,
                    jsonb_build_object(
                        'amount', adjustment_amount,
                        'reason', reason,
                        'wrong_phone', wrong_customer_phone,
                        'correct_phone', correct_customer_phone
                    ) AS changes,
                    created_at
                FROM web2_wallet_adjustments
            `);
        }

        if (blocks.length === 0) {
            // MEDIUM-cleanup (2026-06-13): TRƯỚC đây trả empty IM LẶNG khi cả 4
            // bảng audit thiếu (hoặc _tableExists nuốt lỗi → false) → không phân
            // biệt "0 audit" với "bảng lỗi". Thêm warning + log để admin biết.
            console.warn('[audit-log] 0 bảng audit khả dụng — kiểm tra schema/connection');
            return res.json({
                success: true,
                items: [],
                total: 0,
                warning: 'Không có bảng lịch sử nào khả dụng (schema chưa tạo hoặc lỗi kết nối)',
            });
        }

        const filters = [];
        const params = [];
        if (filterEntity) {
            params.push(filterEntity);
            filters.push(`entity = $${params.length}`);
        }
        if (filterUser) {
            params.push('%' + filterUser + '%');
            filters.push(`(user_name ILIKE $${params.length} OR user_id ILIKE $${params.length})`);
        }
        // 1D-GMT+7 FIX (2026-06-12): from/to là date string 'YYYY-MM-DD' theo
        // giờ VN — cast trần theo session UTC lệch 7h so với cột Thời gian đang
        // render, và `<= to` loại cả ngày cuối (to = 00:00). Pin Asia/Ho_Chi_Minh
        // + nửa khoảng [from, to+1).
        if (from) {
            params.push(from);
            filters.push(
                `created_at >= ($${params.length}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
            );
        }
        if (to) {
            params.push(to);
            filters.push(
                `created_at < (($${params.length}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
            );
        }
        const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

        const sql = `
            WITH unified AS (${blocks.join(' UNION ALL ')})
            SELECT *, COUNT(*) OVER() AS _total FROM unified
            ${where}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const rs = await pool.query(sql, params);
        // _total = tổng số rows khớp filter (window fn, trước LIMIT). 0 row → 0.
        const total = rs.rows.length ? Number(rs.rows[0]._total) || 0 : 0;
        const items = rs.rows.map(({ _total, ...row }) => row);
        res.json({ success: true, items, total, limit, offset });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /entities — danh sách entity types có data
router.get('/entities', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const out = [];
    const map = [
        ['product', 'web2_product_history'],
        ['pbh', 'fast_sale_order_history'],
        ['reconcile', 'pbh_fulfillment_logs'],
        ['wallet', 'web2_wallet_adjustments'],
    ];
    for (const [name, tbl] of map) {
        if (await _tableExists(pool, tbl)) out.push(name);
    }
    res.json({ success: true, entities: out });
});

module.exports = router;
