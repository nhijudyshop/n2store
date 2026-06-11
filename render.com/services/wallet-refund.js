// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// wallet-refund.js — SHARED refund executor (Web 1.0 PROD).
//
// Single source of truth for "hoàn ví khi hủy đơn". Used by:
//   - routes/v2/wallets.js          POST /refund-by-order   (immediate)
//   - routes/v2/pending-withdrawals.js  /process-pending + /:id/process-refund
//   - cron/scheduler.js             retry loop (REFUND_DUE rows)
//
// Contract: executeRefund(db, pendingId) operates on ONE pending_wallet_withdrawals
// row that has already been claimed into status='REFUND_DUE'. It is fully
// idempotent and atomic (single withTransaction). It NEVER throws for business
// outcomes — it returns a structured result. On unexpected DB errors it records
// the failure, KEEPS the row in REFUND_DUE (a refund obligation is never silently
// dropped), and returns { ok:false, refund_scheduled:true } so the caller can tell
// the user "the system will retry automatically".
//
// Idempotency anchors (wallet_transactions ledger = source of truth):
//   deduction : source='ORDER_PAYMENT'        reference_id=order_id
//   refund    : source='ORDER_CANCEL_REFUND'  reference_id=order_id
//
// Lock order (must match deduction path to avoid deadlock): outbox row -> wallet.

const { withTransaction } = require('../db/with-transaction');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Lazy schema bootstrap (migration 075). Idempotent, runs once per process.
// Mirrors the pattern in routes/v2/sepay-home-webhook.js so the refund outbox
// columns/constraints exist even if the manual migration step was skipped.
// Both refund entry points (wallets.js refund-by-order + pending-withdrawals
// refund loop) call this before touching REFUND_DUE / REFUNDED status.
// ---------------------------------------------------------------------------
let _refundSchemaReady = false;
let _refundSchemaPromise = null; // promise singleton — avoids concurrent double-run on cold start
async function _bootstrapRefundSchema(db) {
    const p = path.join(__dirname, '../migrations/075_wallet_refund_outbox.sql');
    if (!fs.existsSync(p)) {
        // Do NOT mark ready — the file may appear after a deploy; keep retrying so we
        // never silently bypass the fifo idempotency guard / status constraints.
        console.error('[WALLET-REFUND] 🚨 migration 075 file NOT FOUND — refund schema NOT bootstrapped (will retry)');
        return;
    }
    const sql = fs.readFileSync(p, 'utf8');
    await db.query(sql);
    _refundSchemaReady = true;
    console.log('[WALLET-REFUND] Schema bootstrapped (migration 075)');
}
async function ensureRefundSchema(db) {
    if (_refundSchemaReady) return;
    // Singleton: concurrent callers on cold start await the SAME run, not N parallel DDLs.
    if (!_refundSchemaPromise) {
        _refundSchemaPromise = _bootstrapRefundSchema(db).catch((err) => {
            console.error('[WALLET-REFUND] Schema bootstrap failed:', err.message);
            // Don't crash — clear the promise so the next call retries.
        }).finally(() => {
            _refundSchemaPromise = null;
        });
    }
    await _refundSchemaPromise;
}

const STALE_DEDUCTION_MS = 10 * 60 * 1000; // 10 min: after this, a REFUND_DUE row
                                           // claimed from PROCESSING with no ledger
                                           // is treated as "never deducted".

/**
 * Read prior ORDER_PAYMENT ledger totals for (phone, order_id).
 * Stored amounts are negative; returns positive used amounts.
 */
async function readDeductionLedger(client, phone, orderId) {
    const r = await client.query(
        `SELECT
            COALESCE(SUM(CASE WHEN type = 'VIRTUAL_DEBIT' THEN -amount ELSE 0 END), 0) AS virtual_used,
            COALESCE(SUM(CASE WHEN type = 'WITHDRAW'      THEN -amount ELSE 0 END), 0) AS real_used
         FROM wallet_transactions
         WHERE phone = $1 AND reference_id = $2 AND source = 'ORDER_PAYMENT'`,
        [phone, orderId]
    );
    return {
        virtualUsed: parseFloat(r.rows[0].virtual_used) || 0,
        realUsed: parseFloat(r.rows[0].real_used) || 0,
    };
}

/**
 * Execute (or reconcile) the refund for a single REFUND_DUE outbox row.
 * @param {import('pg').Pool} db
 * @param {number} pendingId
 * @returns {Promise<Object>} structured result (never throws for business outcomes)
 */
async function executeRefund(db, pendingId) {
    let result;
    try {
        result = await withTransaction(db, async (client) => {
            // 1. Lock the outbox row. Only act on REFUND_DUE (claimed by caller).
            const rowRes = await client.query(
                `SELECT * FROM pending_wallet_withdrawals
                 WHERE id = $1 AND status = 'REFUND_DUE'
                 FOR UPDATE`,
                [pendingId]
            );
            if (rowRes.rows.length === 0) {
                // Already settled or never claimed. Report current status for the caller.
                const cur = await client.query(
                    `SELECT status FROM pending_wallet_withdrawals WHERE id = $1`,
                    [pendingId]
                );
                return {
                    ok: false,
                    refunded: false,
                    reason: 'not_refund_due',
                    status: cur.rows[0] ? cur.rows[0].status : 'NOT_FOUND',
                };
            }

            const row = rowRes.rows[0];
            const phone = row.phone;
            const orderId = row.order_id;

            // Defense-in-depth: a CANCEL_MARKER (amount 0, never deducted) must NEVER be
            // refunded. Status guards already prevent it reaching REFUND_DUE, but if it
            // ever does, settle it as CANCELLED instead of looping for 10 min.
            if (row.source === 'CANCEL_MARKER') {
                await client.query(
                    `UPDATE pending_wallet_withdrawals
                     SET status = 'CANCELLED', updated_at = NOW()
                     WHERE id = $1 AND status = 'REFUND_DUE'`,
                    [pendingId]
                );
                return { ok: true, refunded: false, zero_amount: true };
            }

            // 2. Refund idempotency: already refunded for this order? Just settle.
            const already = await client.query(
                `SELECT id FROM wallet_transactions
                 WHERE phone = $1 AND reference_id = $2 AND source = 'ORDER_CANCEL_REFUND'
                 ORDER BY id ASC LIMIT 1`,
                [phone, orderId]
            );
            if (already.rows.length > 0) {
                await client.query(
                    `UPDATE pending_wallet_withdrawals
                     SET status = 'REFUNDED',
                         refunded_at = COALESCE(refunded_at, NOW()),
                         refund_tx_id = COALESCE(refund_tx_id, $2),
                         updated_at = NOW()
                     WHERE id = $1 AND status = 'REFUND_DUE'`,
                    [pendingId, already.rows[0].id]
                );
                return {
                    ok: true,
                    refunded: true,
                    already_refunded: true,
                    data: { withdrawal_id: pendingId, transaction_id: already.rows[0].id },
                };
            }

            // 3. Determine how much was actually deducted.
            let realUsed = parseFloat(row.real_used) || 0;
            let virtualUsed = parseFloat(row.virtual_used) || 0;

            if (row.completed_at === null) {
                // Row was claimed from PROCESSING (deduction not confirmed via outbox).
                // Reconcile against the ledger = source of truth.
                const ledger = await readDeductionLedger(client, phone, orderId);
                if (ledger.virtualUsed + ledger.realUsed > 0) {
                    // Deduction DID happen — backfill and refund it.
                    realUsed = ledger.realUsed;
                    virtualUsed = ledger.virtualUsed;
                } else {
                    // No deduction ledger yet.
                    const ageMs = Date.now() - new Date(row.updated_at).getTime();
                    if (ageMs >= STALE_DEDUCTION_MS) {
                        // Deduction never happened — nothing to refund. Close it out.
                        await client.query(
                            `UPDATE pending_wallet_withdrawals
                             SET status = 'CANCELLED',
                                 last_error = 'Refund: no deduction ever occurred (stale)',
                                 updated_at = NOW()
                             WHERE id = $1 AND status = 'REFUND_DUE'`,
                            [pendingId]
                        );
                        return { ok: true, refunded: false, cancelled_never_deducted: true };
                    }
                    // Deduction may still be in flight — keep REFUND_DUE, retry later.
                    return { ok: false, refunded: false, reason: 'deduction_in_flight', refund_scheduled: true };
                }
            }

            const refundAmount = realUsed + virtualUsed;

            if (refundAmount <= 0) {
                // Free order / nothing was deducted — settle without a wallet tx.
                await client.query(
                    `UPDATE pending_wallet_withdrawals
                     SET status = 'REFUNDED', refunded_at = NOW(), updated_at = NOW()
                     WHERE id = $1 AND status = 'REFUND_DUE'`,
                    [pendingId]
                );
                return { ok: true, refunded: false, zero_amount: true };
            }

            // 4. Lock wallet, credit it back (real + virtual), restore virtual credits.
            const walletRes = await client.query(
                `SELECT * FROM customer_wallets WHERE phone = $1 FOR UPDATE`,
                [phone]
            );
            if (walletRes.rows.length === 0) {
                // Wallet vanished — cannot refund here. THROW so the outer catch bumps
                // refund_retry_count and (on max) fires the STUCK alert. The obligation
                // stays REFUND_DUE (transaction rolls back, no writes done yet), never lost.
                const e = new Error('REFUND_WALLET_NOT_FOUND');
                e.code = 'REFUND_WALLET_NOT_FOUND';
                throw e;
            }
            const wallet = walletRes.rows[0];
            const balanceBefore = parseFloat(wallet.balance);
            const virtualBefore = parseFloat(wallet.virtual_balance);

            if (realUsed > 0) {
                await client.query(
                    `UPDATE customer_wallets
                     SET balance = balance + $2, updated_at = NOW()
                     WHERE phone = $1`,
                    [phone, realUsed]
                );
            }

            // Restore virtual credits (FIFO by expiry) — exact logic mirrored from
            // wallets.js refund-by-order so refunded records stay consistent.
            if (virtualUsed > 0) {
                await client.query(
                    `UPDATE customer_wallets
                     SET virtual_balance = virtual_balance + $2, updated_at = NOW()
                     WHERE phone = $1`,
                    [phone, virtualUsed]
                );

                let virtualRemaining = virtualUsed;
                // FOR UPDATE: lock the credit rows so a concurrent refund/sale for the
                // same phone can't read a stale remaining_amount and over-restore.
                const creditsToRestore = await client.query(
                    `SELECT id, original_amount, remaining_amount
                     FROM virtual_credits
                     WHERE phone = $1 AND status IN ('USED', 'ACTIVE')
                       AND expires_at > NOW()
                     ORDER BY expires_at ASC
                     FOR UPDATE`,
                    [phone]
                );
                for (const credit of creditsToRestore.rows) {
                    if (virtualRemaining <= 0) break;
                    const canRestore = Math.min(
                        virtualRemaining,
                        parseFloat(credit.original_amount) - parseFloat(credit.remaining_amount)
                    );
                    if (canRestore <= 0) continue;
                    // LEAST cap: never let remaining_amount exceed original_amount.
                    await client.query(
                        `UPDATE virtual_credits
                         SET remaining_amount = LEAST(original_amount, remaining_amount + $2),
                             status = 'ACTIVE',
                             updated_at = NOW()
                         WHERE id = $1`,
                        [credit.id, canRestore]
                    );
                    virtualRemaining -= canRestore;
                }
            }

            // 5. Ledger entry for the refund (source = ORDER_CANCEL_REFUND).
            const txNote =
                (row.refund_reason ? `${row.refund_reason} - ` : 'Hoan vi don huy - ') +
                `Don ${orderId} (Thuc: ${realUsed}, CN: ${virtualUsed})`;
            const txResult = await client.query(
                `INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note, created_by)
                 VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'ORDER_CANCEL_REFUND', $6, $7, $8)
                 RETURNING id`,
                [
                    phone,
                    wallet.id,
                    refundAmount,
                    balanceBefore + virtualBefore,
                    balanceBefore + virtualBefore + refundAmount,
                    orderId,
                    txNote,
                    row.refund_requested_by || 'system',
                ]
            );
            const refundTxId = txResult.rows[0].id;

            // 6. Settle the outbox row (guarded — only from REFUND_DUE).
            await client.query(
                `UPDATE pending_wallet_withdrawals
                 SET status = 'REFUNDED', refunded_at = NOW(), refund_tx_id = $2, updated_at = NOW()
                 WHERE id = $1 AND status = 'REFUND_DUE'`,
                [pendingId, refundTxId]
            );

            return {
                ok: true,
                refunded: true,
                order_id: orderId,
                data: {
                    phone,
                    order_id: orderId,
                    refund_amount: refundAmount,
                    real_refunded: realUsed,
                    virtual_refunded: virtualUsed,
                    new_balance: balanceBefore + realUsed,
                    new_virtual_balance: virtualBefore + virtualUsed,
                    transaction_id: refundTxId,
                    withdrawal_id: pendingId,
                    created_by: row.refund_requested_by || 'system',
                },
            };
        });
    } catch (err) {
        // Unexpected error: record it but NEVER drop the refund obligation.
        // Transaction already rolled back, so status is still REFUND_DUE — the
        // cron retry loop will pick it up again. We only bump the failure counter
        // (best-effort) and surface a console error for ops.
        try {
            const bump = await db.query(
                `UPDATE pending_wallet_withdrawals
                 SET refund_retry_count = COALESCE(refund_retry_count, 0) + 1,
                     refund_last_error = $2,
                     updated_at = NOW()
                 WHERE id = $1 AND status = 'REFUND_DUE'
                 RETURNING refund_retry_count, refund_max_retries, order_id`,
                [pendingId, String((err && err.message) || err).slice(0, 500)]
            );
            const r = bump.rows[0];
            if (r && r.refund_retry_count >= (r.refund_max_retries || 20)) {
                console.error(
                    `[WALLET-REFUND] 🚨 STUCK refund #${pendingId} (order ${r.order_id}) after ` +
                    `${r.refund_retry_count} retries — needs manual settlement. Last error: ${(err && err.message) || err}`
                );
                // Surface to Customer 360 so ops actually SEES the stranded refund
                // (the row stays REFUND_DUE — the obligation is never dropped, the cron
                // just stops auto-retrying; settle via POST /:id/process-refund).
                await db.query(
                    `INSERT INTO customer_activities
                        (phone, activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by)
                     SELECT phone, 'WALLET_REFUND_STUCK',
                            'Hoàn ví KẸT — cần xử lý tay',
                            'Hoàn ví đơn #' || order_id || ' thất bại ' || refund_retry_count || ' lần. Lỗi: ' || COALESCE(refund_last_error,''),
                            'order', order_id,
                            jsonb_build_object('pending_id', id, 'order_id', order_id, 'retries', refund_retry_count),
                            'alert-triangle', 'red', 'system'
                     FROM pending_wallet_withdrawals WHERE id = $1`,
                    [pendingId]
                ).catch((aerr) => console.warn('[WALLET-REFUND] STUCK alert insert failed:', aerr.message));
            }
        } catch (_) {
            /* best-effort bookkeeping only */
        }
        return {
            ok: false,
            refunded: false,
            refund_scheduled: true,
            error: String((err && err.message) || err),
        };
    }

    // Post-commit, best-effort: mirror the WALLET_REFUND timeline entry the old
    // refund-by-order route wrote (customer 360). Failure here never affects the
    // refund itself (already committed).
    if (result && result.refunded && !result.already_refunded && result.data) {
        try {
            const d = result.data;
            await db.query(
                `INSERT INTO customer_activities
                    (phone, activity_type, title, description, reference_type, reference_id, metadata, icon, color, created_by)
                 VALUES ($1, 'WALLET_REFUND', $2, $3, 'order', $4, $5, 'undo', 'blue', $6)`,
                [
                    d.phone,
                    `Hoàn công nợ: ${Number(d.refund_amount).toLocaleString('vi-VN')}đ`,
                    `Hoàn tiền do hủy đơn #${d.order_id || ''}. ` +
                        `Tiền thật: ${Number(d.real_refunded).toLocaleString('vi-VN')}đ, ` +
                        `Công nợ ảo: ${Number(d.virtual_refunded).toLocaleString('vi-VN')}đ`,
                    d.order_id || null,
                    JSON.stringify({
                        total_refunded: d.refund_amount,
                        real_refunded: d.real_refunded,
                        virtual_refunded: d.virtual_refunded,
                        original_withdrawal_id: d.withdrawal_id,
                    }),
                    d.created_by || 'system',
                ]
            );
        } catch (_) {
            /* timeline logging is non-critical */
        }
    }

    return result;
}

module.exports = { executeRefund, ensureRefundSchema };
