// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// API V2 — Web 2.0 Balance History (ĐỘC LẬP với /v2/balance-history cũ)
// =====================================================================
// Đọc/sửa web2_balance_history (Web 2.0 source-of-truth).
// Không có endpoint /approve, /reject — Web 2.0 không cần kế toán duyệt.
//
// Endpoints:
//   GET  /api/web2/balance-history               — list (pagination + filter)
//   GET  /api/web2/balance-history/stats         — counts by status/phone
//   GET  /api/web2/balance-history/pending       — list multi-match cần user chọn
//   POST /api/web2/balance-history/pending/:id/resolve — chọn KH cho pending match
//   PATCH /api/web2/balance-history/:id/link     — gán SĐT thủ công
// =====================================================================

const express = require('express');
const router = express.Router();
const web2SepayMatching = require('../../services/web2-sepay-matching');
const web2WalletService = require('../../services/web2-wallet-service');
const web2ContentParser = require('../../services/web2-content-parser');
const web2MatchAudit = require('../../services/web2-match-audit');
const { recordAuditEvent } = require('../../services/web2-audit-sink');
// 3H14 (2026-06-12): mọi route MUTATION tiền gate SOFT — enforce khi env WEB2_AUTH_ENFORCE=1.
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');
const { withTransaction } = require('../../db/with-transaction');
// SINGLE SOURCE: badge "Đuôi SĐT" trên UI DÙNG ĐÚNG hàm matcher dùng để khớp
// (web2-content-extractor.extractIdentifier) → badge luôn phản ánh chính xác
// phone candidate mà matcher sẽ tìm KH. Trước đây badge dùng
// extractPhoneCandidates riêng → lệch matcher (vd dash-GD `-GD-387721`). Quy
// ước trích xuất canonical: xem web2/overview #conventions.
const {
    extractIdentifier: web2ExtractIdentifier,
} = require('../../services/web2-content-extractor');
function web2ExtractionPreview(content) {
    const ext = web2ExtractIdentifier(content || '');
    if (!ext.phoneCandidates || ext.phoneCandidates.length === 0) {
        return { type: 'none', value: null, note: ext.note || 'NO_MATCH' };
    }
    return { type: ext.type, value: ext.value, note: ext.note };
}

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2BalanceHistory] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
}

// Best-effort audit event for the global "Lịch sử thao tác" feed. Fire-and-forget
// — recordAuditEvent never throws, KHÔNG await, KHÔNG try/catch. ADDITIVE-ONLY:
// không đụng money logic, chỉ ghi log thao tác tay (manual-deposit/link/reassign/
// resolve-pending) trên success path.
function _auditBalance(req, action, id, note) {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    recordAuditEvent(pool, {
        entity: 'balance-transaction',
        entityId: id != null ? String(id) : null,
        action,
        userId: req.body?.userId ?? req.web2User?.id ?? null,
        userName:
            req.body?.userName || req.web2User?.display_name || req.web2User?.username || null,
        sourcePage: 'balance-history',
        changes: note ? (typeof note === 'string' ? { note } : note) : {},
    });
}

// =====================================================
// linkTransaction — gán SĐT/tên vào 1 GD SePay + cộng ví (atomic, idempotent).
// SINGLE SOURCE: dùng chung cho PATCH /:id/link VÀ payment-signals approve
// (đối chiếu CK). Trả { linked, credited, wallet_tx_id?, notFound?, alreadyProcessed? }.
// =====================================================
async function linkTransaction(db, { id, phone, name, verifiedBy }) {
    const verifiedByVal =
        String(verifiedBy || '')
            .trim()
            .slice(0, 100) || null;
    // ATOMIC (BUG FIX 2026-06-11): SELECT … FOR UPDATE + processDeposit + UPDATE
    // history trong CÙNG 1 transaction. Trước đây SELECT không lock + 2 bước rời
    // → race 2 link song song có thể credit 2 lần / UPDATE lệch. `db` có thể là
    // Pool HOẶC PoolClient (payment-signals approve truyền client của tx ngoài)
    // → client thì chạy thẳng trên tx của caller, Pool thì withTransaction.
    const isClient = !!(db && typeof db.release === 'function');
    const runTx = (fn) => (isClient ? fn(db) : withTransaction(db, fn));
    const result = await runTx(async (client) => {
        const r = await client.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, debt_added
             FROM web2_balance_history WHERE id = $1
             FOR UPDATE`,
            [id]
        );
        if (r.rows.length === 0) return { linked: false, notFound: true };
        const tx = r.rows[0];
        // Re-check SAU lock: link song song vừa credit xong → skip (idempotent).
        if (tx.debt_added === true) return { linked: false, alreadyProcessed: true };
        const amount = parseInt(tx.transfer_amount) || 0;
        if (tx.transfer_type !== 'in' || amount <= 0) {
            // Non-deposit → chỉ gán phone, không cộng ví.
            await client.query(
                `UPDATE web2_balance_history
                 SET linked_customer_phone = $2,
                     display_name = COALESCE(display_name, $3),
                     match_method = 'manual_link',
                     verified_by = COALESCE($4, verified_by)
                 WHERE id = $1`,
                [id, phone, name || null, verifiedByVal]
            );
            return { linked: true, credited: false };
        }
        const walletResult = await web2WalletService.processDeposit(
            client,
            phone,
            amount,
            tx.id,
            'Nap tu CK (manual link)',
            null,
            null,
            tx.sepay_id,
            verifiedByVal || '(đối soát thủ công)' // performed_by — audit
        );
        await client.query(
            `UPDATE web2_balance_history
             SET debt_added = TRUE,
                 linked_customer_phone = $2,
                 wallet_processed = TRUE,
                 verification_status = 'AUTO_APPROVED',
                 match_method = 'manual_link',
                 display_name = COALESCE(display_name, $3),
                 verified_at = NOW(),
                 verified_by = COALESCE($4, verified_by)
             WHERE id = $1`,
            [id, phone, name || null, verifiedByVal]
        );
        return {
            linked: true,
            credited: true,
            wallet_tx_id: walletResult.transaction?.id,
            balance:
                walletResult.wallet?.balance != null ? Number(walletResult.wallet.balance) : null,
            amount, // số tiền GD vừa cộng (= số tiền khách chuyển khoản)
        };
    });
    // 2026-06-06: cộng ví xong (CK/đối soát) → tự áp số dư vào PBH chưa trả của
    // SĐT → đơn thành "đã thanh toán" (trả góp nếu thiếu). Best-effort, KHÔNG
    // chặn kết quả link. Lazy require tránh circular (fast-sale-orders ⇏ balance-history).
    // Đặt NGOÀI runTx: fire-and-forget không được giữ client sau khi tx commit.
    if (result.linked && result.credited) {
        try {
            require('../fast-sale-orders')
                .applyWalletToUnpaidPbhs(db, phone, verifiedByVal || '(CK tự thanh toán)')
                .catch(() => {});
        } catch (e) {
            /* ignore */
        }
    }
    return result;
}

// =====================================================
// GET /api/web2/balance-history
// Query: ?limit=50&offset=0&status=AUTO_APPROVED|NO_PHONE|all&search=<phone|content>
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status || 'all';
        const search = (req.query.search || '').trim();

        const params = [];
        const where = [];
        if (status === 'AUTO_APPROVED') {
            where.push(`verification_status = 'AUTO_APPROVED'`);
        } else if (status === 'NO_PHONE') {
            // B (2026-05-30): exclude manual deposit/withdraw NCC — đã có
            // display_name dù không phone, không phải webhook unmatched.
            where.push(`linked_customer_phone IS NULL`);
            where.push(
                `(match_method IS NULL OR match_method NOT IN ('manual_deposit', 'manual_withdraw'))`
            );
        } else if (status === 'PENDING_MATCH') {
            where.push(`match_method = 'pending_match'`);
        } else if (status === 'MANUAL') {
            where.push(`match_method IN ('manual_deposit', 'manual_withdraw')`);
        } else if (status === 'MANUAL_ALL') {
            // Audit view: mọi action thủ công (gán/chọn KH + nạp/rút tay + reassign)
            where.push(
                `match_method IN ('manual_link', 'manual_resolve', 'manual_reassign', 'manual_deposit', 'manual_withdraw')`
            );
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(
                // sepay_id là INTEGER (clone từ Web 1.0) → phải cast ::text mới
                // dùng được ILIKE, nếu không Postgres throw "operator does not
                // exist: integer ~~* text" → search 500.
                `(content ILIKE $${params.length} OR linked_customer_phone ILIKE $${params.length} OR sepay_id::text ILIKE $${params.length})`
            );
        }
        // Date range filter (YYYY-MM-DD inclusive)
        const since = (req.query.since || '').trim();
        const until = (req.query.until || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
            params.push(since + ' 00:00:00');
            where.push(`transaction_date >= $${params.length}`);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(until)) {
            params.push(until + ' 23:59:59');
            where.push(`transaction_date <= $${params.length}`);
        }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

        // MANUAL_ALL view sort theo `verified_at DESC` (thứ tự thao tác user,
        // mới nhất ở trên) thay vì `transaction_date` (thứ tự bank).
        const orderSql =
            status === 'MANUAL_ALL'
                ? `ORDER BY COALESCE(verified_at, transaction_date) DESC NULLS LAST, id DESC`
                : `ORDER BY transaction_date DESC NULLS LAST, id DESC`;
        const list = await db.query(
            `SELECT * FROM web2_balance_history
             ${whereSql}
             ${orderSql}
             LIMIT ${limit} OFFSET ${offset}`,
            params
        );
        const count = await db.query(
            `SELECT COUNT(*) AS n FROM web2_balance_history ${whereSql}`,
            params
        );
        // Phase 6 UX: include extraction preview for rows chưa gán
        // (NO_PHONE) — server-side extractor cho UI hiển thị candidate
        // mà không cần port logic xuống client.
        const rows = list.rows.map((r) => {
            if (!r.linked_customer_phone && r.content) {
                try {
                    const ext = web2ExtractionPreview(r.content);
                    r.extraction_preview = {
                        type: ext.type,
                        value: ext.value,
                        note: ext.note,
                    };
                } catch (e) {
                    r.extraction_preview = null;
                }
            }
            return r;
        });
        res.json({
            success: true,
            data: rows,
            total: Number(count.rows[0].n) || 0,
            limit,
            offset,
        });
    } catch (e) {
        handleError(res, e, 'List');
    }
});

// =====================================================
// GET /api/web2/balance-history/stats
// =====================================================
router.get('/stats', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await db.query(
            `SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE verification_status = 'AUTO_APPROVED') AS auto_approved,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NULL) AS no_phone,
                COUNT(*) FILTER (WHERE match_method = 'pending_match') AS pending_match,
                COUNT(*) FILTER (WHERE match_method IN ('manual_deposit', 'manual_withdraw')) AS manual,
                COUNT(*) FILTER (WHERE match_method IN ('manual_link', 'manual_resolve', 'manual_reassign', 'manual_deposit', 'manual_withdraw')) AS manual_all,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END), 0) AS total_in,
                COALESCE(SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END), 0) AS total_out
             FROM web2_balance_history`
        );
        res.json({ success: true, data: r.rows[0] });
    } catch (e) {
        handleError(res, e, 'Stats');
    }
});

// =====================================================
// GET /api/web2/balance-history/pending
// =====================================================
router.get('/pending', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const r = await db.query(
            `SELECT pm.id, pm.transaction_id, pm.extracted_phone, pm.matched_customers,
                    pm.created_at,
                    bh.sepay_id, bh.content, bh.transfer_amount, bh.transaction_date
             FROM web2_pending_matches pm
             LEFT JOIN web2_balance_history bh ON bh.id = pm.transaction_id
             WHERE pm.status = 'pending'
             ORDER BY pm.created_at DESC
             LIMIT 200`
        );
        res.json({ success: true, data: r.rows });
    } catch (e) {
        handleError(res, e, 'Pending list');
    }
});

// =====================================================
// POST /api/web2/balance-history/pending/:id/resolve
// Body: { phone, name?, resolvedBy? }
// =====================================================
router.post('/pending/:id/resolve', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const id = parseInt(req.params.id);
        const { phone, name, resolvedBy } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const result = await web2SepayMatching.resolveWeb2PendingMatch(
            db,
            id,
            phone,
            name || null,
            resolvedBy || 'web2-ui'
        );
        if (result?.success && result.transactionId) _tryLinkCkSignal(db, result.transactionId);
        if (result?.success) {
            _notifyBalanceHistory(req, {
                action: 'resolve',
                id: result.transactionId || id,
                ts: Date.now(),
            });
            _auditBalance(req, 'resolve-pending', req.params.id, {
                matchedCustomerPhone: phone,
                matchedCustomerName: name || null,
                transactionId: result.transactionId || id,
            });
        }
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Resolve pending');
    }
});

// 2026-06-06: sau khi GÁN KH thủ công cho 1 GD (credit ví) → thử nối tín hiệu
// CK đang chờ của SĐT đó + GỬI TIN BÁO cho khách. Reuse watcher.onNewSepayTx —
// GD giờ đã có linked_customer_phone → watcher tìm signal khớp (phone/partner/
// tên), auto-confirm + reply. An toàn KHÔNG đệ quy: tx đã debt_added → bên trong
// _applyMatch gọi linkTransaction trả alreadyProcessed sớm (không re-credit, không
// gọi lại onNewSepayTx). deps lấy từ _deps (initDeps ở server.js → có sendMessage).
// Best-effort. Gọi ở ENDPOINT (không trong linkTransaction) để tránh đệ quy watcher.
function _tryLinkCkSignal(db, txId) {
    try {
        require('../../services/web2-ck-watcher')
            .onNewSepayTx(db, txId, {})
            .catch(() => {});
    } catch (e) {
        /* ignore */
    }
}

// SSE: báo trang balance-history reload sau mutation (link/resolve/reassign).
// Best-effort, đặt SAU commit + TRƯỚC res.json (pattern manual-deposit).
function _notifyBalanceHistory(req, payload) {
    try {
        const notify = req.app.locals.web2RealtimeSseNotify;
        if (notify) notify('web2:balance-history', payload);
    } catch (e) {
        /* best-effort */
    }
}

// =====================================================
// PATCH /api/web2/balance-history/:id/link
// Body: { phone, name? }
// Gán SĐT thủ công cho transaction chưa có phone — auto credit ví.
// =====================================================
router.patch('/:id/link', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const id = parseInt(req.params.id);
        const { phone, name, verifiedBy } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const result = await linkTransaction(db, { id, phone, name, verifiedBy });
        if (result.notFound) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        if (result.alreadyProcessed) {
            return res
                .status(400)
                .json({ success: false, error: 'Đã được xử lý — không thể link lại' });
        }
        if (result.credited) _tryLinkCkSignal(db, id); // nối tín hiệu CK + gửi tin
        _notifyBalanceHistory(req, { action: 'link', id, ts: Date.now() });
        _auditBalance(req, 'link', req.params.id, {
            customerPhone: phone,
            customerName: name || null,
        });
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Link');
    }
});

// =====================================================
// POST /api/web2/balance-history/:id/reassign
// Body: { phone, name?, verifiedBy?, reason? }
// Admin chuyển 1 giao dịch đã gán sang KH khác (gán nhầm / phòng cases sai):
//   1. Validate row đã có debt_added=true + linked_customer_phone
//   2. Withdraw ví KH cũ (số tiền = transfer_amount, idempotent ref qua sepay_id)
//   3. Deposit ví KH mới (cùng số tiền, reference = sepay_id để giữ idempotency)
//   4. UPDATE web2_balance_history: linked_customer_phone, display_name,
//      match_method = 'manual_reassign', verified_by, verified_at
//   5. Audit log
// Idempotency: nếu reassign cùng KH với hiện tại → no-op return.
// =====================================================
router.post('/:id/reassign', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const id = parseInt(req.params.id);
        const { phone, name, verifiedBy, reason } = req.body || {};
        if (!phone) {
            return res.status(400).json({ success: false, error: 'phone required' });
        }
        const verifiedByVal =
            String(verifiedBy || '')
                .trim()
                .slice(0, 100) ||
            req.web2User?.display_name ||
            null;
        const reasonText =
            String(reason || '')
                .trim()
                .slice(0, 500) || null;

        const r = await db.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, debt_added,
                    linked_customer_phone, display_name, match_method
             FROM web2_balance_history WHERE id = $1`,
            [id]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Not found' });
        }
        const tx = r.rows[0];
        const oldPhone = tx.linked_customer_phone || null;
        const amount = parseInt(tx.transfer_amount) || 0;

        // Normalize phones (loose: strip non-digits, handle 84 prefix)
        const normalize = (p) => {
            let s = String(p || '').replace(/[^0-9]/g, '');
            if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
            return s;
        };
        const newPhoneNorm = normalize(phone);
        if (!newPhoneNorm || newPhoneNorm.length < 9 || newPhoneNorm.length > 11) {
            return res.status(400).json({ success: false, error: 'SĐT không hợp lệ' });
        }
        const oldPhoneNorm = normalize(oldPhone || '');

        // Idempotent: cùng KH → no-op (vẫn cho cập nhật name/verified_by để fix typo)
        if (oldPhoneNorm && oldPhoneNorm === newPhoneNorm) {
            await db.query(
                `UPDATE web2_balance_history
                 SET display_name = COALESCE($2, display_name),
                     verified_by = COALESCE($3, verified_by)
                 WHERE id = $1`,
                [id, name || null, verifiedByVal]
            );
            return res.json({
                success: true,
                data: { reassigned: false, sameCustomer: true },
            });
        }

        // Refuse nếu row chưa từng credit (chưa có gì để "chuyển")
        if (!tx.debt_added || !oldPhoneNorm) {
            return res.status(400).json({
                success: false,
                error: 'Giao dịch chưa được cộng vào ví nào — dùng "Gán KH" thay vì "Sửa KH".',
            });
        }

        if (tx.transfer_type !== 'in' || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Chỉ reassign được giao dịch tiền vào (+) với amount > 0',
            });
        }

        // Steps 1-3 GỘP TRONG 1 TRANSACTION ATOMIC (BUG FIX — đường tiền):
        //   Trước đây 3 bước (withdraw ví cũ → deposit ví mới → UPDATE history) chạy
        //   trên pool, KHÔNG cùng transaction. Rollback thủ công = gọi lại
        //   processDeposit(oldPhone) → fragile: nếu rollback fail thì tiền lệch.
        //   processWithdraw/processDeposit nhận `db` là Pool HOẶC PoolClient —
        //   runWithTx phát hiện client (.release) → KHÔNG mở tx mới, dùng tx của
        //   caller. Nên truyền `client` của withTransaction → cả 3 bước atomic:
        //   bước nào throw → withTransaction ROLLBACK toàn bộ, không cần re-credit
        //   thủ công. Idempotency vẫn giữ: deposit mới dùng reassignRef riêng (không
        //   đụng sepay_id gốc đã dùng cho withdraw audit).
        const reassignRef = `${tx.sepay_id}:reassign:${newPhoneNorm}`;
        let withdrawResult = null;
        let depositResult = null;
        let alreadyReassigned = false;
        try {
            await withTransaction(db, async (client) => {
                // 3H12 FIX (2026-06-12): SELECT đầu route chạy NGOÀI tx không lock —
                // 2 admin reassign cùng GD sang 2 KH KHÁC NHAU đồng thời: cả 2 đọc
                // oldPhone=P0, reassignRef khác nhau nên Step 0 không chặn → ví P0
                // bị withdraw ×2. Lock row + re-check phone TƯƠI trong tx: request
                // thứ 2 (chờ lock xong) thấy linked_customer_phone đã đổi → 409.
                const lockQ = await client.query(
                    `SELECT linked_customer_phone, debt_added
                     FROM web2_balance_history WHERE id = $1 FOR UPDATE`,
                    [id]
                );
                if (!lockQ.rows[0]) {
                    const err = new Error('Giao dịch không còn tồn tại');
                    err.httpStatus = 404;
                    throw err;
                }
                const freshOldNorm = normalize(lockQ.rows[0].linked_customer_phone || '');
                if (freshOldNorm !== oldPhoneNorm || !lockQ.rows[0].debt_added) {
                    const err = new Error(
                        `Giao dịch vừa bị thay đổi bởi người khác (KH hiện tại: ${lockQ.rows[0].linked_customer_phone || '—'}) — tải lại rồi thử lại`
                    );
                    err.httpStatus = 409;
                    throw err;
                }

                // Step 0 (IDEMPOTENCY — BUG FIX 2026-06-11): deposit có dup-check
                // qua reassignRef nhưng withdraw thì KHÔNG → reassign lặp vòng
                // A→B→A→B lần 2: withdraw vẫn trừ ví A mà deposit B bị skip →
                // MẤT TIỀN im lặng. Check reassignRef đã tồn tại = reassign này
                // từng chạy → KHÔNG withdraw/deposit nữa, chỉ đảm bảo history row
                // đúng phone mới (idempotent).
                const dupRe = await client.query(
                    `SELECT 1 FROM web2_wallet_transactions
                     WHERE reference_type = 'sepay' AND reference_id = $1
                     LIMIT 1`,
                    [reassignRef]
                );
                if (dupRe.rows.length > 0) {
                    alreadyReassigned = true;
                    await client.query(
                        `UPDATE web2_balance_history
                         SET linked_customer_phone = $2,
                             display_name = COALESCE($3, display_name),
                             match_method = 'manual_reassign',
                             verified_by = COALESCE($4, verified_by),
                             verified_at = NOW()
                         WHERE id = $1`,
                        [id, newPhoneNorm, name || null, verifiedByVal]
                    );
                    return;
                }

                // Step 1: withdraw từ ví cũ — reference 'sepay_reassign_out' +
                // reassignRef (KHÔNG dùng 'sepay'+sepay_id: collide partial unique
                // index idx_web2_wallet_tx_unique_sepay với row DEPOSIT gốc → 500).
                withdrawResult = await web2WalletService.processWithdraw(
                    client,
                    oldPhoneNorm,
                    amount,
                    'sepay_reassign_out',
                    reassignRef,
                    `Reassign giao dịch ${tx.sepay_id} → ${newPhoneNorm}${reasonText ? ` (${reasonText})` : ''}${verifiedByVal ? ` bởi ${verifiedByVal}` : ''}`,
                    verifiedByVal || '(reassign)' // performed_by — audit
                );

                // Step 2: deposit vào ví mới — dùng reassignRef variant để idempotent
                // theo row+phone (sepay_id gốc đã dùng cho deposit gốc).
                depositResult = await web2WalletService.processDeposit(
                    client,
                    newPhoneNorm,
                    amount,
                    tx.id,
                    `Reassign từ ${oldPhoneNorm} → bởi ${verifiedByVal || 'admin'}${reasonText ? ` (${reasonText})` : ''}`,
                    null,
                    null,
                    reassignRef,
                    verifiedByVal || '(reassign)' // performed_by — audit
                );
                // An toàn tiền: deposit bị skip (đã tồn tại — edge race Step 0 không
                // bắt được) mà withdraw vừa trừ → throw để ROLLBACK toàn bộ.
                if (depositResult?.alreadyProcessed === true) {
                    throw new Error(
                        `Deposit reassign đã tồn tại (ref=${reassignRef}) — rollback withdraw để tránh mất tiền`
                    );
                }

                // Step 3: update history row — cùng transaction
                await client.query(
                    `UPDATE web2_balance_history
                     SET linked_customer_phone = $2,
                         display_name = COALESCE($3, display_name),
                         match_method = 'manual_reassign',
                         verified_by = COALESCE($4, verified_by),
                         verified_at = NOW()
                     WHERE id = $1`,
                    [id, newPhoneNorm, name || null, verifiedByVal]
                );
            });
        } catch (e) {
            // withTransaction đã ROLLBACK toàn bộ → không có tiền nào bị trừ/cộng
            // dở dang, không cần re-credit thủ công.
            if (e.httpStatus) {
                return res.status(e.httpStatus).json({ success: false, error: e.message });
            }
            console.error(
                `[reassign] CRITICAL: atomic reassign FAILED (id=${id}, ${oldPhoneNorm}→${newPhoneNorm}, amount=${amount}) — đã rollback: ${e.message}`
            );
            return res.status(500).json({
                success: false,
                error: `Không thể chuyển giao dịch (${oldPhoneNorm} → ${newPhoneNorm}): ${e.message}`,
            });
        }

        // Reassign này từng chạy rồi (idempotent) → không có withdraw/deposit
        // mới, history row đã được đảm bảo đúng phone. Trả sớm, không audit lại.
        if (alreadyReassigned) {
            _notifyBalanceHistory(req, { action: 'reassign', id, ts: Date.now() });
            return res.json({
                success: true,
                data: {
                    reassigned: false,
                    alreadyReassigned: true,
                    oldPhone: oldPhoneNorm,
                    newPhone: newPhoneNorm,
                    amount,
                },
            });
        }

        // Step 4: audit log
        try {
            await web2MatchAudit.log(db, {
                transactionId: id,
                sepayId: tx.sepay_id,
                extractedValue: newPhoneNorm,
                extractedType: 'manual_reassign',
                candidates: [
                    { phone: oldPhoneNorm, name: tx.display_name || '' },
                    { phone: newPhoneNorm, name: name || '' },
                ],
                chosenPhone: newPhoneNorm,
                chosenName: name || null,
                decisionTier: 'manual_reassign',
                confidenceScore: 100,
                confidenceBreakdown: {
                    reason: 'admin_reassign',
                    oldPhone: oldPhoneNorm,
                    newPhone: newPhoneNorm,
                    note: reasonText,
                },
                amount,
                decidedBy: verifiedByVal || 'admin',
                walletTxId: depositResult?.transaction?.id,
                note: `Reassign: ${oldPhoneNorm} → ${newPhoneNorm}${reasonText ? ` (${reasonText})` : ''}`,
            });
        } catch (auditErr) {
            console.warn('[reassign] audit log fail:', auditErr.message);
        }

        _tryLinkCkSignal(db, id); // đổi KH → nối tín hiệu CK của KH mới + gửi tin
        _notifyBalanceHistory(req, { action: 'reassign', id, ts: Date.now() });
        _auditBalance(req, 'reassign', req.params.id, {
            from: oldPhoneNorm,
            to: newPhoneNorm,
            amount,
        });
        res.json({
            success: true,
            data: {
                reassigned: true,
                oldPhone: oldPhoneNorm,
                newPhone: newPhoneNorm,
                amount,
                withdrawTxId: withdrawResult?.transaction?.id,
                depositTxId: depositResult?.transaction?.id,
            },
        });
    } catch (e) {
        handleError(res, e, 'Reassign');
    }
});

// =====================================================
// POST /api/web2/balance-history/:id/auto-match
// Single-row reprocess — chạy lại processWeb2Match với extractor mới.
// =====================================================
router.post('/:id/auto-match', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const id = parseInt(req.params.id);
        const { fetchWithTimeout } = require('../../../shared/node/fetch-utils.cjs');
        const result = await web2SepayMatching.processWeb2Match(db, id, fetchWithTimeout);
        _notifyBalanceHistory(req, { action: 'auto-match', id: req.params.id, ts: Date.now() });
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Auto-match single');
    }
});

// =====================================================
// POST /api/web2/balance-history/reprocess-unmatched
// Bulk re-run processWeb2Match for ALL unprocessed 'in' rows:
//   - linked_customer_phone IS NULL (chưa extract được phone), OR
//   - linked_customer_phone IS NOT NULL nhưng debt_added=false (legacy
//     từ Web 1.0 backfill, có phone nhưng ví Web 2.0 chưa cộng tiền)
// Web 2.0 = 100% auto: không có khái niệm "manual" hay "cũ" cho user.
// Body: { limit?: number, dryRun?: boolean }
// =====================================================
router.post('/reprocess-unmatched', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
        const { fetchWithTimeout } = require('../../../shared/node/fetch-utils.cjs');

        const data = await web2SepayMatching.reprocessUnmatched(db, fetchWithTimeout, { limit });
        _notifyBalanceHistory(req, { action: 'reprocess', ts: Date.now() });
        res.json({ success: true, data });
    } catch (e) {
        handleError(res, e, 'Reprocess unmatched');
    }
});

// =====================================================
// POST /api/web2/balance-history/auto-assign
// Tự động GÁN các GD 'in' CHƯA GÁN vào KH kho web2_customers bằng dữ liệu CÓ
// SẴN trong nội dung CK (SĐT đầy đủ/đuôi SĐT + TÊN người gửi). An toàn:
//   • Exact 10-digit phone → KH duy nhất theo phone → gán.
//   • Đuôi SĐT (partial) → lấy candidate phone LIKE %partial; nếu >1 → dùng TÊN
//     (chuẩn hoá bỏ dấu + UPPER) để disambiguate; CHỈ gán khi còn DUY NHẤT 1 KH.
//   • Không có identifier (vd "IB CHUYEN COC") → BỎ QUA (không đoán bừa).
// Dùng chung linkTransaction (gán + cộng ví, idempotent). Body: { limit?, dryRun? }
// =====================================================
function _normName(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd')
        .toUpperCase()
        .replace(/[^A-Z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
const _NAME_STOPWORDS = new Set([
    'MBVCB',
    'VCB',
    'FT',
    'GD',
    'CK',
    'IB',
    'ND',
    'TT',
    'CT',
    'ATM',
    'NAP',
    'QR',
    'MB',
    'CHUYEN',
    'TIEN',
    'COC',
    'SHOP',
    'NHI',
    'JUDY',
    'HOUSE',
    'STORE',
    'TECHCOMBANK',
    'VIETCOMBANK',
    'CHUYENTIEN',
    'THANH',
    'TOAN',
    'MA',
]);
function _nameTokens(content) {
    return _normName(content)
        .split(' ')
        .filter((w) => w.length >= 2 && !_NAME_STOPWORDS.has(w) && !/^\d/.test(w));
}

router.post('/auto-assign', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });
        const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
        const dryRun = !!req.body?.dryRun;

        const rows = (
            await db.query(
                `SELECT id, content, transfer_amount
                 FROM web2_balance_history
                 WHERE transfer_type = 'in' AND (linked_customer_phone IS NULL OR linked_customer_phone = '')
                 ORDER BY transaction_date DESC LIMIT $1`,
                [limit]
            )
        ).rows;

        let assigned = 0,
            ambiguous = 0,
            noId = 0;
        const details = [];

        for (const tx of rows) {
            const ext = web2ExtractIdentifier(tx.content || '');
            const exact = ext.type === 'exact_phone' ? ext.value : null;
            const partials = Array.from(
                new Set([...(ext.phoneCandidates || [])].filter((p) => p && p.length >= 5))
            );
            const nameToks = _nameTokens(tx.content || '');

            // Tập candidate KH theo phone (exact ưu tiên, rồi partial suffix).
            let cands = [];
            if (exact) {
                cands = (
                    await db.query(
                        'SELECT id, name, phone FROM web2_customers WHERE phone = $1 LIMIT 5',
                        [exact]
                    )
                ).rows;
            } else if (partials.length) {
                const seen = new Set();
                for (const p of partials) {
                    const r = await db.query(
                        'SELECT id, name, phone FROM web2_customers WHERE phone LIKE $1 LIMIT 20',
                        ['%' + p]
                    );
                    for (const c of r.rows)
                        if (!seen.has(c.id)) {
                            seen.add(c.id);
                            cands.push(c);
                        }
                }
            }
            if (!exact && !partials.length) {
                noId++;
                continue;
            }

            // Disambiguate bằng tên nếu >1 candidate.
            if (cands.length > 1 && nameToks.length) {
                const byName = cands.filter((c) => {
                    const cn = _normName(c.name);
                    return (
                        nameToks.filter((t) => cn.includes(t)).length >=
                        Math.min(2, nameToks.length)
                    );
                });
                if (byName.length) cands = byName;
            }

            if (cands.length === 1) {
                const c = cands[0];
                if (!dryRun) {
                    await router.linkTransaction(db, {
                        id: tx.id,
                        phone: c.phone,
                        name: c.name,
                        verifiedBy: 'auto-assign',
                    });
                }
                assigned++;
                if (details.length < 30)
                    details.push({
                        id: tx.id,
                        phone: c.phone,
                        name: c.name,
                        amount: tx.transfer_amount,
                    });
            } else {
                ambiguous++;
            }
        }

        // 1D FIX (2026-06-12): mutation hàng loạt phải notify SAU mutation —
        // tab khác đang mở balance-history/ví KH tự reload (quy ước SSE-first).
        _notifyBalanceHistory(req, { action: 'auto-assign', ts: Date.now() });
        res.json({
            success: true,
            scanned: rows.length,
            assigned,
            ambiguous,
            noIdentifier: noId,
            dryRun,
            details,
        });
    } catch (e) {
        handleError(res, e, 'Auto-assign');
    }
});

// =====================================================
// POST /api/web2/balance-history/manual-deposit
// User có quyền (admin) nạp/rút tay tiền vào ví KH hoặc NCC.
//
// Body: {
//   target: 'KH' | 'NCC',
//   type?: 'deposit' | 'withdraw'   (default 'deposit')
//   phone?: string (KH bắt buộc, NCC optional),
//   name: string,
//   customerId?: number (TPOS partner id KH),
//   amount: number (VND > 0),
//   note?: string,
//   userName?: string
// }
//
// Withdraw guards: balance sau khi trừ KHÔNG được < 0. KH check via Postgres
// FOR UPDATE lock + balance comparison. NCC qua Firestore (chưa enforce ở
// backend — sẽ check ở supplier-wallet client trước khi POST).
// =====================================================
router.post('/manual-deposit', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const body = req.body || {};
        const target = String(body.target || '').toUpperCase();
        const type = String(body.type || 'deposit').toLowerCase();
        const amount = Math.floor(Number(body.amount) || 0);
        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').replace(/\D/g, '');
        const note = String(body.note || '').trim();
        const userName = String(body.userName || req.web2User?.display_name || 'system').trim();
        const customerId = Number(body.customerId) || null;

        if (!['KH', 'NCC'].includes(target)) {
            return res.status(400).json({ success: false, error: 'target phải là KH hoặc NCC' });
        }
        if (!['deposit', 'withdraw'].includes(type)) {
            return res
                .status(400)
                .json({ success: false, error: 'type phải là deposit hoặc withdraw' });
        }
        if (amount <= 0) {
            return res.status(400).json({ success: false, error: 'amount phải > 0' });
        }
        if (!name) {
            return res.status(400).json({ success: false, error: 'name bắt buộc' });
        }
        if (target === 'KH' && phone.length < 9) {
            return res.status(400).json({
                success: false,
                error: 'KH bắt buộc có phone hợp lệ (≥9 digits)',
            });
        }

        // Withdraw: pre-check balance để fail fast trước khi insert balance_history
        if (type === 'withdraw' && target === 'KH') {
            const balCheck = await db.query(
                `SELECT balance FROM web2_customer_wallets WHERE phone = $1`,
                [phone]
            );
            const currentBal = Number(balCheck.rows[0]?.balance || 0);
            if (currentBal < amount) {
                return res.status(400).json({
                    success: false,
                    error: `Số dư ví KH không đủ. Hiện có ${currentBal.toLocaleString('vi-VN')}đ, cần ${amount.toLocaleString('vi-VN')}đ`,
                    currentBalance: currentBal,
                });
            }
        }

        // Unique negative sepay_id cho manual deposit (không trùng SePay thật).
        // SePay id INTEGER PostgreSQL range: −2_147_483_648 to 2_147_483_647.
        // BUG (cũ): -floor(Date.now()/1000) → 2 request cùng GIÂY trùng id →
        // ON CONFLICT (sepay_id) DO NOTHING nuốt GD thứ 2 im lặng (mất tiền/audit).
        // FIX: dùng millisecond granularity + random suffix để gần như không trùng,
        // nhưng vẫn fit INTEGER (≤ 2_000_000_000) và LUÔN âm (phân biệt manual vs
        // SePay thật). Range: (ms % 1e8) * 20 + rand[0..19] + 1 ≤ 2_000_000_000.
        //
        // 3H11 FIX (2026-06-12): client gửi idempotencyKey (UUID sinh 1 lần/lần bấm)
        // → sepay_id DERIVE từ key (hash FNV-1a) thay vì random. Retry dual-base
        // (CF Worker timeout 524 SAU khi Render đã COMMIT → client re-POST sang
        // base fallback) tạo CÙNG sepay_id → ON CONFLICT → trả alreadyProcessed
        // thay vì nạp/rút tiền LẦN 2.
        const idempotencyKey =
            String(body.idempotencyKey || req.headers['x-idempotency-key'] || '')
                .trim()
                .slice(0, 80) || null;
        const _fnv1a = (s) => {
            let h = 0x811c9dc5;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 0x01000193) >>> 0;
            }
            return h >>> 0;
        };
        // C17 (2026-06-13): fallback (không idempotencyKey) TRƯỚC đây
        // `(Date.now() % 100_000_000) * 20 + rand(20)` → wrap mỗi 100M ms = 27.7h →
        // collision DETERMINISTIC (2 GD cách ~27.7h cùng ms-mod → trùng sepay_id →
        // ON CONFLICT DO NOTHING → throw 409 "trùng manual sepay_id" + rollback ví).
        // Đổi: wrap mỗi 1B ms (~11.5 ngày) + random 0..9999 (trải rộng trong cùng
        // ms-bucket). Max = 1_000_000_000 + 9_999 < 2.1B (an toàn INT4).
        const manualSepayId = idempotencyKey
            ? -((_fnv1a(idempotencyKey) % 2_000_000_000) + 1)
            : -((Date.now() % 1_000_000_000) + Math.floor(Math.random() * 10_000) + 1);

        // Build content readable cho audit + cho supplier-wallet polling pick up
        // qua name match (NCC). Format: "[Nạp tay] <userName> → <target>:<name> | <note>"
        const content = `[Nạp tay] ${userName} -> ${target}: ${name}` + (note ? ` | ${note}` : '');

        // Ensure raw_data column exists (table có thể chưa có nếu schema cũ).
        // Idempotent — chạy rất nhanh khi column đã tồn tại.
        try {
            await db.query(
                `ALTER TABLE web2_balance_history ADD COLUMN IF NOT EXISTS raw_data JSONB`
            );
        } catch (_) {}

        const metadataJson = JSON.stringify({
            manual: true,
            type,
            target,
            name,
            phone: phone || null,
            customerId,
            note,
            userName,
            userId: body.userId || null,
            idempotencyKey,
            timestamp: new Date().toISOString(),
        });

        const transferType = type === 'deposit' ? 'in' : 'out';
        const matchMethod = type === 'deposit' ? 'manual_deposit' : 'manual_withdraw';

        // Insert row + credit/debit ví TRONG CÙNG 1 transaction (BUG FIX
        // 2026-06-11): trước đây INSERT history (debt_added=TRUE) chạy trước,
        // wallet op chạy SAU ngoài transaction với rollback thủ công DELETE →
        // crash giữa chừng = history ghi TRUE mà ví không đổi (lệch tiền).
        // withTransaction: bước nào throw → ROLLBACK toàn bộ.
        let balanceHistoryId = null;
        let walletResult = null;
        try {
            await withTransaction(db, async (client) => {
                const insertResult = await client.query(
                    `INSERT INTO web2_balance_history (
                        sepay_id, gateway, transaction_date, account_number, code,
                        content, transfer_type, transfer_amount, accumulated,
                        sub_account, reference_code, description, raw_data,
                        linked_customer_phone, display_name, match_method,
                        debt_added, wallet_processed, verification_status, verified_at
                     )
                     VALUES ($1, 'MANUAL', NOW(), 'MANUAL', NULL,
                             $2, $10, $3, 0,
                             NULL, $4, $5, $6,
                             $7, $8, $11,
                             TRUE, $9, 'AUTO_APPROVED', NOW())
                     ON CONFLICT (sepay_id) DO NOTHING
                     RETURNING id`,
                    [
                        manualSepayId,
                        content,
                        amount,
                        `MANUAL-${manualSepayId}`,
                        note || null,
                        metadataJson,
                        target === 'KH' ? phone : null,
                        name,
                        target === 'KH',
                        transferType,
                        matchMethod,
                    ]
                );

                if (insertResult.rows.length === 0) {
                    // 3H11: conflict sepay_id — nếu row sẵn có CÙNG idempotencyKey
                    // thì đây là RETRY (dual-base/timeout) của chính GD đã commit
                    // → trả alreadyProcessed, KHÔNG đụng ví lần 2.
                    if (idempotencyKey) {
                        const exist = await client.query(
                            `SELECT id, raw_data->>'idempotencyKey' AS ikey
                             FROM web2_balance_history WHERE sepay_id = $1 LIMIT 1`,
                            [manualSepayId]
                        );
                        if (exist.rows[0] && exist.rows[0].ikey === idempotencyKey) {
                            balanceHistoryId = exist.rows[0].id;
                            walletResult = { alreadyProcessed: true };
                            return; // skip wallet ops — GD gốc đã làm
                        }
                    }
                    const dupErr = new Error('Trùng manual sepay_id (rare)');
                    dupErr.statusCode = 409;
                    throw dupErr;
                }
                balanceHistoryId = insertResult.rows[0].id;

                // Credit/Debit ví KH (Postgres web2_customer_wallets) — nhận client
                // → chạy chung transaction (runWithTx phát hiện client, không mở tx mới).
                if (target === 'KH') {
                    const opLabel = type === 'deposit' ? 'Nạp tay' : 'Rút tay';
                    const opNote = `${opLabel} bởi ${userName}` + (note ? ` (${note})` : '');
                    if (type === 'deposit') {
                        walletResult = await web2WalletService.processDeposit(
                            client,
                            phone,
                            amount,
                            balanceHistoryId,
                            opNote,
                            customerId,
                            null,
                            String(manualSepayId)
                        );
                    } else {
                        // Withdraw — signature (db, phone, amount, referenceType, referenceId, note)
                        // Atomic balance check trong transaction; throw nếu insufficient.
                        walletResult = await web2WalletService.processWithdraw(
                            client,
                            phone,
                            amount,
                            'manual_balance_history',
                            String(balanceHistoryId),
                            opNote
                        );
                    }
                }
            });
        } catch (e) {
            if (e.statusCode === 409) {
                return res.status(409).json({ success: false, error: e.message });
            }
            console.error(`[manual-deposit] atomic ${type} fail (đã rollback):`, e.message);
            return res.status(500).json({
                success: false,
                error: `${type === 'deposit' ? 'Nạp' : 'Rút'} ${target === 'KH' ? 'ví KH ' : ''}thất bại: ${e.message}`,
            });
        }

        // SSE notify: balance-history page refresh + KH wallet event
        try {
            const notify = req.app.locals.web2RealtimeSseNotify;
            if (notify) {
                notify('web2:balance-history', {
                    action: 'manual-deposit',
                    id: balanceHistoryId,
                    target,
                    name,
                    amount,
                    ts: Date.now(),
                });
                if (target === 'KH') {
                    // Exact per-phone tickle: client bridge prefix-match (rank 3, 2026-06-22)
                    // đưa nó tới subscriber 'web2:wallet:*' (trang ví KH/NCC). Bỏ
                    // 'web2:wallet:update' (DEAD — không ai subscribe literal đó; sau
                    // prefix-match còn double-fire ':*' subscriber).
                    notify(`web2:wallet:${phone}`, {
                        action: 'manual-deposit',
                        amount,
                        ts: Date.now(),
                    });
                }
            }
        } catch (e) {
            console.warn('[manual-deposit] SSE notify fail:', e.message);
        }

        _auditBalance(req, 'manual-deposit', balanceHistoryId, {
            type,
            target,
            name,
            amount,
            customerId,
            phone: phone || null,
        });

        res.json({
            success: true,
            data: {
                balanceHistoryId,
                manualSepayId,
                target,
                phone: phone || null,
                name,
                amount,
                userName,
                walletTxId: walletResult?.transaction?.id || null,
                walletNewBalance: walletResult?.wallet?.balance || null,
                alreadyProcessed: walletResult?.alreadyProcessed === true || undefined,
            },
        });
    } catch (e) {
        handleError(res, e, 'Manual deposit');
    }
});

// =====================================================
// POST /api/web2/balance-history/cleanup-stale-pending
// Cleanup web2_pending_matches entries không thể giải quyết:
//   - candidates rỗng (customers=[]) → user không có gì để pick
//   - duplicate cho cùng transaction_id → keep newest
// Reset balance_history.match_method về null cho cleaned rows → re-process
// có thể chạy lại (TPOS state có thể đã đổi).
//
// Body (optional): { dryRun?: boolean }
// =====================================================
router.post('/cleanup-stale-pending', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const dryRun = req.body?.dryRun === true;

        // Detect stale: any candidate có customers=[] empty
        const stale = await db.query(`
            SELECT pm.id, pm.transaction_id, pm.matched_customers
            FROM web2_pending_matches pm
            WHERE pm.status = 'pending'
              AND (
                  jsonb_array_length(pm.matched_customers) = 0
                  OR NOT EXISTS (
                      SELECT 1 FROM jsonb_array_elements(pm.matched_customers) cand
                      WHERE jsonb_array_length(COALESCE(cand->'customers', '[]'::jsonb)) > 0
                  )
              )
        `);

        // Detect duplicates: cùng transaction_id, keep id mới nhất
        const dups = await db.query(`
            SELECT id, transaction_id FROM web2_pending_matches
            WHERE status = 'pending'
              AND id NOT IN (
                  SELECT MAX(id) FROM web2_pending_matches
                  WHERE status = 'pending'
                  GROUP BY transaction_id
              )
        `);

        const stalePendingIds = stale.rows.map((r) => Number(r.id));
        const dupPendingIds = dups.rows.map((r) => Number(r.id));
        const allDelIds = Array.from(new Set([...stalePendingIds, ...dupPendingIds]));
        const affectedTxIds = Array.from(
            new Set([
                ...stale.rows.map((r) => Number(r.transaction_id)),
                ...dups.rows.map((r) => Number(r.transaction_id)),
            ])
        ).filter(Boolean);

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                staleCount: stalePendingIds.length,
                dupCount: dupPendingIds.length,
                totalDelete: allDelIds.length,
                resetTxCount: affectedTxIds.length,
            });
        }

        let deletedPending = 0;
        let resetBalanceHistory = 0;
        if (allDelIds.length > 0) {
            const delResult = await db.query(
                `DELETE FROM web2_pending_matches WHERE id = ANY($1::int[])`,
                [allDelIds]
            );
            deletedPending = delResult.rowCount || 0;
        }
        if (affectedTxIds.length > 0) {
            // Reset match_method='pending_match' về null → reprocess
            const resetResult = await db.query(
                `UPDATE web2_balance_history
                 SET match_method = NULL
                 WHERE id = ANY($1::bigint[])
                   AND match_method = 'pending_match'
                   AND debt_added = FALSE`,
                [affectedTxIds]
            );
            resetBalanceHistory = resetResult.rowCount || 0;
        }
        res.json({
            success: true,
            deletedPending,
            resetBalanceHistory,
            staleCount: stalePendingIds.length,
            dupCount: dupPendingIds.length,
        });
    } catch (e) {
        handleError(res, e, 'Cleanup stale pending');
    }
});

// Export helper để payment-signals approve dùng chung (1 nguồn logic cộng ví).
router.linkTransaction = linkTransaction;

module.exports = router;
