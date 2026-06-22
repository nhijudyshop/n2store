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
// requireWeb2Admin cho /purge (housekeeping xoá audit theo entity — chỉ admin).
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../../middleware/web2-auth');
// Event-sink chung (2026-06-22) — ensure bảng tồn tại để union đọc kể cả trước mutation đầu.
const { ensureAuditSinkTable } = require('../../services/web2-audit-sink');
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
        // entityId: lọc lịch sử của 1 RECORD cụ thể (đơn/SP/KH…) — cho per-record
        // history viewer (Web2AuditLog.openRecord). Khớp cột entity_id của union.
        const filterEntityId = req.query.entityId || req.query.entity_id || null;
        const filterUser = req.query.user || null;
        const from = req.query.from || null;
        const to = req.query.to || null;

        // Ensure bảng event-sink (no-op sau lần đầu nhờ _ensured guard) → union đọc được.
        await ensureAuditSinkTable(pool).catch(() => {});

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

        // 5. web2_audit_events — EVENT-SINK chung (purchase-refund, customers,
        // payment-signals, returns, kpi-assignments, generic entities…). Đã có
        // entity/entity_id/action/user/source_page/changes/created_at đúng shape
        // → SELECT thẳng. Xem services/web2-audit-sink.js. KHÔNG trùng 4 bảng trên
        // (sink chỉ ghi nguồn CHƯA có bảng riêng → không đếm 2 lần). Bảng đã được
        // ensureAuditSinkTable ở trên → include thẳng (KHÔNG qua _tableExists cache
        // tránh stale 'false' 5 phút ngay sau lần tạo bảng đầu).
        blocks.push(`
            SELECT
                entity, entity_id, action,
                user_id, user_name, source_page, changes,
                created_at
            FROM web2_audit_events
        `);

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
        if (filterEntityId) {
            params.push(filterEntityId);
            filters.push(`entity_id = $${params.length}`);
        }

        // SCOPE (2026-06-22): NV chỉ xem thao tác của CHÍNH MÌNH, admin xem TẤT CẢ.
        // req.web2User do requireWeb2AuthSoft gắn ({ id, role, username, display_name }).
        // - admin            → xem hết + được lọc user tự do (free-text ILIKE).
        // - staff/manager/... → ÉP scope về chính mình (bỏ qua filterUser nếu gửi lên).
        // - không token hợp lệ → KHÔNG lộ data của bất kỳ ai (trả rỗng + cờ requireAuth).
        const viewer = req.web2User || null;
        const isAdmin = !!viewer && viewer.role === 'admin';
        if (isAdmin) {
            if (filterUser) {
                params.push('%' + filterUser + '%');
                filters.push(
                    `(user_name ILIKE $${params.length} OR user_id ILIKE $${params.length})`
                );
            }
        } else if (viewer) {
            // Match linh hoạt: user_id lưu raw từ client (có thể là id số HOẶC username),
            // user_name lưu display_name. Khớp bất kỳ định danh nào của viewer.
            const ors = [];
            const idStr = viewer.id != null ? String(viewer.id) : '';
            const uname = viewer.username || '';
            const dname = viewer.display_name || '';
            if (idStr) {
                params.push(idStr);
                ors.push(`user_id = $${params.length}`);
            }
            if (uname) {
                params.push(uname);
                ors.push(`user_id = $${params.length}`);
                params.push(uname);
                ors.push(`user_name = $${params.length}`);
            }
            if (dname) {
                params.push(dname);
                ors.push(`user_name = $${params.length}`);
            }
            // Phòng trường hợp user không có định danh nào → không khớp gì (an toàn).
            filters.push(ors.length ? `(${ors.join(' OR ')})` : 'FALSE');
        } else {
            return res.json({
                success: true,
                items: [],
                total: 0,
                viewer: { scope: 'none', role: null, name: null },
                warning: 'Cần đăng nhập Web 2.0 để xem lịch sử thao tác.',
            });
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
        res.json({
            success: true,
            items,
            total,
            limit,
            offset,
            viewer: {
                scope: isAdmin ? 'all' : 'self',
                role: viewer.role,
                name: viewer.display_name || viewer.username || null,
            },
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /entities — danh sách entity types có data (4 bảng cố định + entity động
// từ event-sink web2_audit_events). Dùng để build dropdown lọc động ở frontend.
router.get('/entities', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    const out = new Set();
    const map = [
        ['product', 'web2_product_history'],
        ['pbh', 'fast_sale_order_history'],
        ['reconcile', 'pbh_fulfillment_logs'],
        ['wallet', 'web2_wallet_adjustments'],
    ];
    for (const [name, tbl] of map) {
        if (await _tableExists(pool, tbl)) out.add(name);
    }
    // Entity động từ sink (purchase-refund, customer, payment-signal, return, …).
    if (await _tableExists(pool, 'web2_audit_events')) {
        try {
            const r = await pool.query(
                `SELECT DISTINCT entity FROM web2_audit_events WHERE entity IS NOT NULL ORDER BY entity LIMIT 100`
            );
            for (const row of r.rows) if (row.entity) out.add(row.entity);
        } catch {
            /* best-effort */
        }
    }
    res.json({ success: true, entities: [...out].sort() });
});

// DELETE /purge?entity=<slug>&entityId=<id> — ADMIN housekeeping: xoá audit khỏi
// event-sink web2_audit_events. BẮT BUỘC ít nhất 1 trong `entity` / `entityId`
// (chống xoá nhầm toàn bộ). entityId → dọn lịch sử 1 RECORD cụ thể (vd row test);
// entity → dọn cả 1 loại. Có cả 2 = AND. KHÔNG đụng 4 bảng history riêng.
router.delete('/purge', requireWeb2Admin, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const entity = String(req.query.entity || (req.body && req.body.entity) || '').trim();
        const entityId = String(
            req.query.entityId || req.query.entity_id || (req.body && req.body.entityId) || ''
        ).trim();
        if (!entity && !entityId) {
            return res.status(400).json({
                success: false,
                error: 'cần entity hoặc entityId (chống xoá nhầm toàn bộ audit)',
            });
        }
        if (!(await _tableExists(pool, 'web2_audit_events'))) {
            return res.json({
                success: true,
                entity: entity || null,
                entityId: entityId || null,
                deleted: 0,
            });
        }
        const conds = [];
        const params = [];
        if (entity) {
            params.push(entity);
            conds.push(`entity = $${params.length}`);
        }
        if (entityId) {
            params.push(entityId);
            conds.push(`entity_id = $${params.length}`);
        }
        const r = await pool.query(
            `DELETE FROM web2_audit_events WHERE ${conds.join(' AND ')}`,
            params
        );
        res.json({
            success: true,
            entity: entity || null,
            entityId: entityId || null,
            deleted: r.rowCount,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
