// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Payment Signals API ("KH báo đã chuyển khoản")
// =====================================================
//
// Consumer: trang web2/payment-confirm/. Data ở web2Db, bảng web2_payment_signals
// (schema do services/web2-payment-signal-detector.js quản lý — ensureSchema gọi
// 1 lần lúc boot từ server.js).
//
// Mount: /api/web2/payment-signals (CF worker forward /api/web2/* về Render).
//   GET    /                 → list signals (filter status, from, to, page_id) + enrich đơn
//   GET    /stats            → đếm theo status (cho badge/chuông)
//   POST   /:id/confirm      → status='confirmed' (= gắn cờ đơn) + SSE
//   POST   /:id/dismiss      → status='dismissed' (false positive) + SSE
//   POST   /:id/link-order   → gán thủ công { orderType, orderCode } + SSE
//
// SSE topic: web2:payment-signals

'use strict';

const express = require('express');
const router = express.Router();

const detector = require('../services/web2-payment-signal-detector');

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// ─── SSE notifier (injected từ server.js) ─────────────────────────────
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:payment-signals', { action, id, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-PAYSIG-API] _notify failed:', e.message);
    }
}

// ─── Append 1 entry vào history JSONB (timeline ai-làm-gì-lúc-nào) ─────
async function _appendHistory(pool, id, entry) {
    const e = {
        ts: Date.now(),
        action: entry.action,
        userId: entry.userId || null,
        userName: entry.userName || '(ẩn danh)',
        note: entry.note || null,
    };
    await pool.query(
        `UPDATE web2_payment_signals
         SET history = COALESCE(history, '[]'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [id, JSON.stringify([e])]
    );
}

// User info từ body (frontend gửi qua Web2UserInfo.attachToBody).
function _user(req) {
    const b = req.body || {};
    return {
        userId: b.userId || null,
        userName: b.userName || b.by || req.headers['x-user'] || '(ẩn danh)',
    };
}

// ─── Map DB row → API shape ───────────────────────────────────────────
function mapSignal(row) {
    return {
        id: Number(row.id),
        psid: row.psid,
        pageId: row.page_id,
        conversationId: row.conversation_id,
        customerName: row.customer_name,
        rawMessage: row.raw_message,
        keyword: row.matched_keyword,
        phone: row.phone,
        orderType: row.matched_order_type,
        orderCode: row.matched_order_code,
        status: row.status,
        createdAt: row.created_at ? Number(row.created_at) : null,
        confirmedAt: row.confirmed_at ? Number(row.confirmed_at) : null,
        confirmedBy: row.confirmed_by,
        matchedTxId: row.matched_tx_id != null ? Number(row.matched_tx_id) : null,
        matchedTxAt: row.matched_tx_at ? Number(row.matched_tx_at) : null,
        history: Array.isArray(row.history) ? row.history : [],
        // enrich (LEFT JOIN — có thể null)
        order: row.o_code
            ? {
                  type: row.matched_order_type,
                  code: row.o_code,
                  name: row.o_name,
                  phone: row.o_phone,
                  total: row.o_total != null ? Number(row.o_total) : null,
                  status: row.o_status || null,
              }
            : null,
    };
}

// ─── GET / — list signals (enrich đơn qua LEFT JOIN theo type/code) ───
router.get('/', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });

    const status = req.query.status; // pending|confirmed|dismissed|all
    const pageId = req.query.page_id;
    const from = req.query.from ? Number(req.query.from) : null;
    const to = req.query.to ? Number(req.query.to) : null;
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const params = [];
    if (status && status !== 'all') {
        params.push(status);
        where.push(`s.status = $${params.length}`);
    }
    if (pageId) {
        params.push(pageId);
        where.push(`s.page_id = $${params.length}`);
    }
    if (from) {
        params.push(from);
        where.push(`s.created_at >= $${params.length}`);
    }
    if (to) {
        params.push(to);
        where.push(`s.created_at <= $${params.length}`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const countParams = [...params]; // trước khi push limit/offset
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    // Enrich: 1 LEFT JOIN cho native + 1 cho fast_sale, COALESCE theo type.
    const sql = `
        SELECT s.*,
            COALESCE(no.code, fso.number)                AS o_code,
            COALESCE(no.customer_name, fso.partner_name) AS o_name,
            COALESCE(no.phone, fso.partner_phone)        AS o_phone,
            COALESCE(no.total_amount, fso.amount_total)  AS o_total,
            no.status                                    AS o_status
        FROM web2_payment_signals s
        LEFT JOIN native_orders   no  ON s.matched_order_type = 'native'
                                      AND no.code = s.matched_order_code
        LEFT JOIN fast_sale_orders fso ON s.matched_order_type = 'fast_sale'
                                      AND fso.number = s.matched_order_code
        ${whereSql}
        ORDER BY s.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    try {
        const { rows } = await pool.query(sql, params);
        const countQ = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_payment_signals s ${whereSql}`,
            countParams
        );
        const total = countQ.rows[0].n;
        res.json({
            success: true,
            data: rows.map(mapSignal),
            meta: { total, limit, offset, hasMore: offset + rows.length < total },
        });
    } catch (e) {
        console.error('[WEB2-PAYSIG-API] list failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /stats — đếm theo status ─────────────────────────────────────
router.get('/stats', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT status, COUNT(*)::int AS n FROM web2_payment_signals GROUP BY status`
        );
        const stats = { pending: 0, confirmed: 0, dismissed: 0 };
        for (const r of rows) stats[r.status] = r.n;
        res.json({ success: true, data: stats });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /:id — 1 signal (enrich đơn) — cho web2-ck-review mở review ──
// Đăng ký SAU /stats (numeric only để không nuốt path khác).
router.get('/:id(\\d+)', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { rows } = await pool.query(
            `SELECT s.*,
                COALESCE(no.code, fso.number)                AS o_code,
                COALESCE(no.customer_name, fso.partner_name) AS o_name,
                COALESCE(no.phone, fso.partner_phone)        AS o_phone,
                COALESCE(no.total_amount, fso.amount_total)  AS o_total,
                no.status                                    AS o_status
             FROM web2_payment_signals s
             LEFT JOIN native_orders   no  ON s.matched_order_type = 'native' AND no.code = s.matched_order_code
             LEFT JOIN fast_sale_orders fso ON s.matched_order_type = 'fast_sale' AND fso.number = s.matched_order_code
             WHERE s.id = $1`,
            [Number(req.params.id)]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        res.json({ success: true, data: mapSignal(rows[0]) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/confirm — gắn cờ đơn (status=confirmed) ────────────────
router.post('/:id/confirm', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const u = _user(req);
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals
             SET status = 'confirmed', confirmed_at = $2, confirmed_by = $3
             WHERE id = $1 RETURNING id`,
            [id, Date.now(), u.userName]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        await _appendHistory(pool, id, { action: 'confirm', ...u });
        _notify('confirm', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/dismiss — false positive ───────────────────────────────
router.post('/:id/dismiss', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const u = _user(req);
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals SET status = 'dismissed' WHERE id = $1 RETURNING id`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        await _appendHistory(pool, id, { action: 'dismiss', ...u });
        _notify('dismiss', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/link-order — gán đơn thủ công ──────────────────────────
router.post('/:id/link-order', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const { orderType, orderCode } = req.body || {};
    if (!orderCode || !['native', 'fast_sale'].includes(orderType)) {
        return res
            .status(400)
            .json({ success: false, error: 'orderType (native|fast_sale) + orderCode required' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE web2_payment_signals
             SET matched_order_type = $2, matched_order_code = $3
             WHERE id = $1 RETURNING id`,
            [id, orderType, String(orderCode)]
        );
        if (!rows.length) return res.status(404).json({ success: false, error: 'not found' });
        await _appendHistory(pool, id, {
            action: 'link',
            ..._user(req),
            note: `${orderType}:${orderCode}`,
        });
        _notify('link', id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /:id/approve — DUYỆT linh hoạt (đối chiếu CK) ───────────────
// Body: { phone, name?, txId?, userId, userName }
//  • txId  → link GD SePay đó (gán SĐT/tên + CỘNG VÍ tiền thật) qua linkTransaction
//            (1 nguồn logic với PATCH /balance-history/:id/link). Set matched_tx_id.
//  • no txId → chỉ confirm + lưu phone/name lên signal (chờ tiền về, không cộng ví).
// Money op → caller giữ await + loading (KHÔNG optimistic).
router.post('/:id/approve', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const u = _user(req);
    const b = req.body || {};
    const phone = b.phone ? String(b.phone).trim() : null;
    const name = b.name ? String(b.name).trim() : null;
    const txId = b.txId ? Number(b.txId) : null;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone bắt buộc để duyệt' });
    }
    try {
        // Signal tồn tại?
        const sigQ = await pool.query(`SELECT id FROM web2_payment_signals WHERE id = $1`, [id]);
        if (!sigQ.rows.length) {
            return res.status(404).json({ success: false, error: 'signal not found' });
        }

        // Link GD SePay (cộng ví) nếu có txId.
        let credited = false;
        if (txId) {
            const balanceHistory = require('./v2/web2-balance-history');
            const r = await balanceHistory.linkTransaction(pool, {
                id: txId,
                phone,
                name,
                verifiedBy: u.userName,
            });
            if (r.notFound) {
                return res.status(404).json({ success: false, error: 'GD không tồn tại' });
            }
            if (r.alreadyProcessed) {
                return res
                    .status(400)
                    .json({ success: false, error: 'GD đã được xử lý — không thể link lại' });
            }
            credited = !!r.credited;
        }

        // Confirm signal + lưu phone/name (nếu trống) + matched_tx_id.
        const now = Date.now();
        await pool.query(
            `UPDATE web2_payment_signals
             SET status = 'confirmed',
                 confirmed_at = $2,
                 confirmed_by = $3,
                 phone = COALESCE(NULLIF(phone, ''), $4),
                 customer_name = COALESCE(NULLIF(customer_name, ''), $5),
                 matched_tx_id = COALESCE($6, matched_tx_id),
                 matched_tx_at = CASE WHEN $6 IS NOT NULL THEN $2 ELSE matched_tx_at END
             WHERE id = $1`,
            [id, now, u.userName, phone, name, txId]
        );
        await _appendHistory(pool, id, {
            action: 'approve',
            ...u,
            note: txId ? `GD#${txId}${credited ? ' +ví' : ''}` : 'chờ tiền về (chưa cộng ví)',
        });
        _notify('approve', id);
        if (txId && _notifyClients) {
            try {
                _notifyClients(
                    'web2:balance-history',
                    { action: 'link', id: txId, ts: now },
                    'update'
                );
            } catch (e) {
                /* ignore */
            }
        }
        res.json({ success: true, credited });
    } catch (e) {
        console.error('[WEB2-PAYSIG-API] approve failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.ensureSchema = detector.ensureSchema;
router.initializeNotifiers = initializeNotifiers;

module.exports = router;
