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
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

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
// `db` có thể là pool HOẶC client trong transaction. Khi gọi trong transaction
// (sau SELECT ... FOR UPDATE row lock) thì read-modify-write history an toàn,
// không bị mất entry do 2 thao tác đồng thời (HIGH RACE fix).
async function _appendHistory(db, id, entry) {
    const e = {
        ts: Date.now(),
        action: entry.action,
        userId: entry.userId || null,
        userName: entry.userName || '(ẩn danh)',
        note: entry.note || null,
    };
    await db.query(
        `UPDATE web2_payment_signals
         SET history = COALESCE(history, '[]'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [id, JSON.stringify([e])]
    );
}

// User info: ƯU TIÊN user từ token (req.web2User — requireWeb2AuthSoft gắn),
// fallback body (frontend gửi qua Web2UserInfo.attachToBody — client-controlled).
function _user(req) {
    if (req.web2User) {
        return {
            userId: req.web2User.id || null,
            userName: req.web2User.display_name || req.web2User.username || '(ẩn danh)',
        };
    }
    const b = req.body || {};
    return {
        userId: b.userId || null,
        userName: b.userName || b.by || req.headers['x-user'] || '(ẩn danh)',
    };
}

// ─── Auto-reply: compose tin báo "đã nhận CK + số tiền chuyển khoản" (pure) ──
function composeCkReplyMessage(amount) {
    const amt =
        amount != null && Number.isFinite(Number(amount))
            ? `\nSố tiền chuyển khoản: ${Number(amount).toLocaleString('vi-VN')}₫.`
            : '';
    return `Shop đã nhận được chuyển khoản của mình rồi nha 💕${amt}\nCảm ơn mình nhiều ạ!`;
}

// Gửi auto-reply qua Pancake + append history. Best-effort (caller catch).
async function sendCkReply(pool, signalId, sig, message) {
    let worker;
    try {
        worker = require('../services/web2-msg-send-worker');
    } catch (e) {
        return;
    }
    if (!worker.sendSingleMessage) return;
    const r = await worker.sendSingleMessage(
        sig.page_id,
        sig.conversation_id,
        sig.psid || null,
        message
    );
    await _appendHistory(pool, signalId, {
        action: 'notify',
        userName: '(hệ thống)',
        note: r.ok ? 'đã gửi tin báo KH' : r.needsExtension ? 'lỗi 24h — chưa gửi được' : 'gửi lỗi',
    }).catch(() => {});
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
    // noTx=1: chỉ signal confirmed CHƯA có GD (chờ tiền về) — cho dashboard.
    if (req.query.noTx === '1' || req.query.noTx === 'true') {
        where.push(`s.matched_tx_id IS NULL`);
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
// Transaction + SELECT FOR UPDATE row lock → status guard + history append
// atomic (không mất history entry khi 2 thao tác đồng thời — HIGH RACE fix).
// Chỉ confirm khi status='pending'; đã confirmed → trả idempotent KHÔNG ghi lại.
router.post('/:id/confirm', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const u = _user(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lock = await client.query(
            `SELECT id, status FROM web2_payment_signals WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (!lock.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'not found' });
        }
        if (lock.rows[0].status !== 'pending') {
            // Đã xử lý (confirmed/dismissed) → idempotent, không ghi history lần 2.
            await client.query('COMMIT');
            _notify('confirm', id);
            return res.json({ success: true, alreadyHandled: true });
        }
        await client.query(
            `UPDATE web2_payment_signals
             SET status = 'confirmed', confirmed_at = $2, confirmed_by = $3
             WHERE id = $1 AND status = 'pending'`,
            [id, Date.now(), u.userName]
        );
        await _appendHistory(client, id, { action: 'confirm', ...u });
        await client.query('COMMIT');
        _notify('confirm', id);
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// ─── POST /:id/dismiss — false positive ───────────────────────────────
// Transaction + FOR UPDATE + status='pending' guard (tránh ghi đè confirmed).
router.post('/:id/dismiss', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = Number(req.params.id);
    const u = _user(req);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lock = await client.query(
            `SELECT id, status FROM web2_payment_signals WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (!lock.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'not found' });
        }
        if (lock.rows[0].status !== 'pending') {
            await client.query('COMMIT');
            _notify('dismiss', id);
            return res.json({ success: true, alreadyHandled: true });
        }
        await client.query(
            `UPDATE web2_payment_signals SET status = 'dismissed' WHERE id = $1 AND status = 'pending'`,
            [id]
        );
        await _appendHistory(client, id, { action: 'dismiss', ...u });
        await client.query('COMMIT');
        _notify('dismiss', id);
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// ─── POST /:id/link-order — gán đơn thủ công ──────────────────────────
router.post('/:id/link-order', requireWeb2AuthSoft, async (req, res) => {
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
router.post('/:id/approve', requireWeb2AuthSoft, async (req, res) => {
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
    // Transaction: lock signal (FOR UPDATE) + linkTransaction (cộng ví) + confirm
    // + history TRONG CÙNG 1 transaction → idempotency guard hiệu lực (FOR UPDATE
    // chỉ giữ lock khi trong transaction) + atomic. linkTransaction nhận client
    // (db param) nên chạy chung transaction này.
    const client = await pool.connect();
    let sig = null;
    let credited = false;
    let reconciled = false; // GD đã cộng ví đúng SĐT từ trước (vd auto-match QR) → vẫn nối + gửi tin
    let ckAmount = null;
    let now = Date.now();
    try {
        await client.query('BEGIN');
        // Idempotency guard (HIGH — money op double-submit): lock signal + check
        // status. Đã confirmed → trả idempotent success, KHÔNG cộng ví/ghi history
        // lần 2 (tránh double-credit + 2 history entry khi double-submit).
        const guard = await client.query(
            `SELECT id, page_id, conversation_id, customer_name, status
             FROM web2_payment_signals WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (!guard.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'signal not found' });
        }
        if (guard.rows[0].status === 'confirmed') {
            await client.query('COMMIT');
            _notify('approve', id);
            return res.json({ success: true, alreadyApproved: true });
        }
        // 3H18 FIX (2026-06-12): guard cũ chỉ chặn 'confirmed' — signal đang
        // 'dismissed' (duyệt chéo 2 staff / openReview từ trang khác) vẫn lọt:
        // linkTransaction CỘNG VÍ + auto-reply khách, nhưng UPDATE bên dưới có
        // điều kiện AND status='pending' match 0 row → signal kẹt dismissed
        // vĩnh viễn dù tiền đã cộng. Giờ: mọi status ≠ pending → 409 rõ ràng.
        if (guard.rows[0].status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: `Signal đang ở trạng thái '${guard.rows[0].status}' — chỉ duyệt được signal pending. Reload danh sách rồi thử lại.`,
                status: guard.rows[0].status,
            });
        }
        sig = guard.rows[0];

        // Link GD SePay (cộng ví) nếu có txId.
        if (txId) {
            const balanceHistory = require('./v2/web2-balance-history');
            const r = await balanceHistory.linkTransaction(client, {
                id: txId,
                phone,
                name,
                verifiedBy: u.userName,
            });
            if (r.notFound) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'GD không tồn tại' });
            }
            if (r.alreadyProcessed) {
                // GD đã được cộng ví trước (auto-match). Nếu cộng cho ĐÚNG SĐT đang
                // duyệt → coi như hợp lệ: nối tín hiệu + gửi tin (KHÔNG cộng lại).
                const ti = await client.query(
                    `SELECT linked_customer_phone, transfer_amount FROM web2_balance_history WHERE id = $1`,
                    [txId]
                );
                const txPhone = String(ti.rows[0]?.linked_customer_phone || '').replace(/\D/g, '');
                const want = String(phone).replace(/\D/g, '');
                if (txPhone && want && txPhone.slice(-9) === want.slice(-9)) {
                    reconciled = true;
                    ckAmount = Number(ti.rows[0].transfer_amount) || null;
                } else {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        error: 'GD đã xử lý cho SĐT khác — không thể link',
                    });
                }
            } else {
                credited = !!r.credited;
                ckAmount = r.amount;
            }
        }

        // Confirm signal + lưu phone/name (nếu trống) + matched_tx_id.
        now = Date.now();
        await client.query(
            `UPDATE web2_payment_signals
             SET status = 'confirmed',
                 confirmed_at = $2,
                 confirmed_by = $3,
                 phone = COALESCE(NULLIF(phone, ''), $4),
                 customer_name = COALESCE(NULLIF(customer_name, ''), $5),
                 matched_tx_id = COALESCE($6, matched_tx_id),
                 matched_tx_at = CASE WHEN $6 IS NOT NULL THEN $2 ELSE matched_tx_at END
             WHERE id = $1 AND status = 'pending'`,
            [id, now, u.userName, phone, name, txId]
        );
        await _appendHistory(client, id, {
            action: 'approve',
            ...u,
            note: txId
                ? `GD#${txId}${credited ? ' +ví' : reconciled ? ' (đã cộng trước, đối soát)' : ''}`
                : 'chờ tiền về (chưa cộng ví)',
        });
        await client.query('COMMIT');
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

        // Auto-reply + báo số tiền CK — khi cộng ví (credited) HOẶC GD đã cộng
        // đúng SĐT từ trước (reconciled) + user không tắt. Best-effort.
        if (
            (credited || reconciled) &&
            b.notifyCustomer !== false &&
            sig.page_id &&
            sig.conversation_id
        ) {
            const msg = composeCkReplyMessage(ckAmount);
            // audit r7: claim confirm_msg_sent của GD (txId) NGAY trước gửi — nếu
            // QR-match (web2-sepay-matching) đã gửi tin cho GD này thì TRUE → skip.
            // Trước đây approve thủ công trên GD đã auto-match QR → gửi tin THỨ 2.
            const _sendCkOnce = async () => {
                if (txId != null) {
                    const claim = await pool
                        .query(
                            `UPDATE web2_balance_history SET confirm_msg_sent = TRUE
                             WHERE id = $1 AND confirm_msg_sent IS NOT TRUE RETURNING id`,
                            [txId]
                        )
                        .catch(() => ({ rowCount: 0 }));
                    if (!claim.rowCount) return; // tin xác nhận đã gửi → bỏ qua double
                }
                await sendCkReply(pool, id, sig, msg);
            };
            _sendCkOnce().catch((e) =>
                console.warn('[WEB2-PAYSIG-API] auto-reply failed:', e.message)
            );
        }

        res.json({ success: true, credited, reconciled });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PAYSIG-API] approve failed:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

router.ensureSchema = detector.ensureSchema;
router.initializeNotifiers = initializeNotifiers;

module.exports = router;
