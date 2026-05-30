// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2SepayMatching — Match SePay deposit → KH → cộng ví Web 2.0
// =====================================================================
// Tách hoàn toàn khỏi routes/sepay-transaction-matching.js (Web 1).
// Khác biệt Web 2.0 spec:
//   • LUÔN auto-credit khi match 1-1 (KHÔNG check auto_approve_enabled)
//   • KHÔNG có virtual_credit/virtual_balance
//   • KHÔNG có verification_status PENDING/APPROVED/REJECTED
//   • Match đa SĐT → tạo web2_pending_matches để user chọn ở UI
//   • Ghi vào web2_balance_history + web2_customer_wallets/web2_wallet_transactions
//
// Phase 4 (2026-05-30): ZERO Web 1.0 dependency.
//   • Bỏ đọc legacy table balance_customer_info (QR + phone name cache)
//   • Bỏ đọc legacy table balance_history (sequence init)
//   • Name lookup CHỈ qua TPOS OData (live, không local cache)
//   • Trade-off: 1 TPOS call mỗi unknown phone (~150ms), bù lại data luôn fresh
//
// Reuse các helper extract/search từ legacy (pure function, không write DB):
//   • extractPhoneFromContent
//   • searchTPOSByPhone
//   • searchTPOSByPartialPhone
//
// API public:
//   • processWeb2Match(db, web2BalanceHistoryRow, fetchWithTimeout)
//     → { success, method, phone?, customerName?, walletTxnId?, pendingMatchId? }
// =====================================================================

const {
    extractPhoneFromContent,
    searchTPOSByPhone,
    searchTPOSByPartialPhone,
} = require('../routes/sepay-transaction-matching');
const web2WalletService = require('./web2-wallet-service');
const web2ContentParser = require('./web2-content-parser');
const web2MatchAudit = require('./web2-match-audit');

// Confidence threshold for auto-credit (single match only).
// Multi-match always goes to pending_match regardless of score.
const AUTO_CREDIT_MIN_SCORE = 70;

// Ensure web2_balance_history + web2_pending_matches schema. Idempotent.
let _ready = false;
async function ensureSchema(pool) {
    if (_ready || !pool) return;
    try {
        // Web 1.0-independent bootstrap:
        //   • Nếu balance_history (legacy) tồn tại → vẫn dùng LIKE để inherit
        //     mọi migration đã apply trên table cũ (safest cho legacy-shared env).
        //   • Nếu legacy không tồn tại → tạo explicit schema từ
        //     migrations/create_balance_history.sql (base cols Web 2.0 cần).
        //     Các col Web 2.0-only (debt_added, linked_customer_phone, …) được
        //     ALTER thêm idempotent ở phần ALTER bên dưới.
        // Trên prod: web2_balance_history đã tồn tại → cả 2 nhánh CREATE đều no-op.
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class WHERE relname = 'web2_balance_history'
                ) THEN
                    IF EXISTS (
                        SELECT 1 FROM pg_class WHERE relname = 'balance_history'
                    ) THEN
                        CREATE TABLE web2_balance_history (
                            LIKE balance_history INCLUDING DEFAULTS
                                                 INCLUDING CONSTRAINTS
                                                 INCLUDING INDEXES
                        );
                    ELSE
                        CREATE TABLE web2_balance_history (
                            id SERIAL PRIMARY KEY,
                            sepay_id INTEGER UNIQUE NOT NULL,
                            gateway VARCHAR(100) NOT NULL,
                            transaction_date TIMESTAMP NOT NULL,
                            account_number VARCHAR(50) NOT NULL,
                            code VARCHAR(100),
                            content TEXT,
                            transfer_type VARCHAR(10) NOT NULL CHECK (transfer_type IN ('in', 'out')),
                            transfer_amount BIGINT NOT NULL,
                            accumulated BIGINT NOT NULL,
                            sub_account VARCHAR(100),
                            reference_code VARCHAR(100),
                            description TEXT,
                            body JSONB,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE INDEX idx_web2_bh_sepay_id ON web2_balance_history(sepay_id);
                        CREATE INDEX idx_web2_bh_tx_date ON web2_balance_history(transaction_date DESC);
                        CREATE INDEX idx_web2_bh_transfer_type ON web2_balance_history(transfer_type);
                    END IF;
                END IF;
            END $$;
        `);
        // Sequence riêng — chỉ tham chiếu web2_balance_history (zero Web 1.0 dep).
        // Lần đầu init: nếu bảng rỗng, sequence khởi đầu từ 10000 — đủ buffer cho
        // mọi row legacy đã backfill (ID < 10000 không tồn tại trong web2_).
        await pool.query(`
            CREATE SEQUENCE IF NOT EXISTS web2_balance_history_id_seq;
            DO $$
            DECLARE max_id BIGINT;
            BEGIN
                SELECT COALESCE((SELECT MAX(id) FROM web2_balance_history), 0) + 10000
                  INTO max_id;
                PERFORM setval('web2_balance_history_id_seq', max_id, false);
            END $$;
            ALTER TABLE web2_balance_history
                ALTER COLUMN id SET DEFAULT nextval('web2_balance_history_id_seq');
        `);

        // Pending matches riêng cho Web 2.0
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_pending_matches (
                id SERIAL PRIMARY KEY,
                transaction_id BIGINT NOT NULL,
                extracted_phone VARCHAR(20) NOT NULL,
                matched_customers JSONB NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                resolution_notes TEXT,
                resolved_at TIMESTAMPTZ,
                resolved_by VARCHAR(100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_web2_pending_matches_status
                ON web2_pending_matches(status) WHERE status = 'pending';
            CREATE INDEX IF NOT EXISTS idx_web2_pending_matches_tx
                ON web2_pending_matches(transaction_id);
        `);
        _ready = true;
        console.log('[web2-sepay-matching] schema ready');
    } catch (e) {
        console.error('[web2-sepay-matching] ensureSchema failed:', e.message);
    }
}

/**
 * Insert a new row in web2_balance_history mirroring data from webhook payload.
 * Called by sepay-webhook-core fan-out.
 *
 * @param {Pool} db
 * @param {Object} webhookData - normalized SePay webhook payload
 * @returns {Promise<{ id: number, isDuplicate: boolean }>}
 */
async function insertWeb2BalanceHistory(db, webhookData) {
    try {
        const result = await db.query(
            `INSERT INTO web2_balance_history (
                sepay_id, gateway, transaction_date, account_number, code,
                content, transfer_type, transfer_amount, accumulated,
                sub_account, reference_code, description, body
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (sepay_id) DO NOTHING
             RETURNING id`,
            [
                webhookData.id,
                webhookData.gateway,
                webhookData.transactionDate,
                webhookData.accountNumber,
                webhookData.code || null,
                webhookData.content || null,
                webhookData.transferType,
                webhookData.transferAmount,
                webhookData.accumulated,
                webhookData.subAccount || null,
                webhookData.referenceCode || null,
                webhookData.description || null,
                JSON.stringify(webhookData),
            ]
        );
        if (result.rows.length === 0) {
            // Already inserted previously; fetch id
            const existing = await db.query(
                `SELECT id FROM web2_balance_history WHERE sepay_id = $1`,
                [webhookData.id]
            );
            return { id: existing.rows[0]?.id || null, isDuplicate: true };
        }
        return { id: result.rows[0].id, isDuplicate: false };
    } catch (e) {
        console.error('[web2-sepay-matching] insertWeb2BalanceHistory failed:', e.message);
        throw e;
    }
}

/**
 * Process Web 2.0 match for one balance_history row.
 * @param {Pool} db
 * @param {number} web2BhId - id in web2_balance_history
 * @param {Function} fetchWithTimeout
 * @returns {Promise<Object>} result with method/phone/etc
 */
async function processWeb2Match(db, web2BhId, fetchWithTimeout) {
    // 1. Load row
    const r = await db.query(
        `SELECT id, sepay_id, content, transfer_amount, transfer_type, debt_added,
                linked_customer_phone, display_name, match_method
         FROM web2_balance_history WHERE id = $1`,
        [web2BhId]
    );
    if (r.rows.length === 0) {
        return { success: false, reason: 'Not found' };
    }
    const tx = r.rows[0];

    // Idempotency
    if (tx.debt_added === true) {
        return { success: false, reason: 'Already processed' };
    }
    if (tx.transfer_type !== 'in') {
        return { success: false, reason: 'Not incoming' };
    }

    const amount = parseInt(tx.transfer_amount) || 0;
    if (amount <= 0) {
        return { success: false, reason: 'Invalid amount' };
    }

    // LEGACY MIGRATION: nếu row đã có linked_customer_phone (từ Web 1.0 manual
    // entry / extractor cũ) mà ví Web 2.0 chưa cộng → tin dữ liệu cũ, credit
    // luôn không cần re-extract. Lý do: phone đã được user verify trong Web 1.0.
    if (tx.linked_customer_phone && tx.linked_customer_phone.length >= 9) {
        try {
            const walletResult = await web2WalletService.processDeposit(
                db,
                tx.linked_customer_phone,
                amount,
                tx.id,
                'Nap tu CK (legacy migration)',
                null,
                null,
                tx.sepay_id
            );
            await db.query(
                `UPDATE web2_balance_history
                 SET debt_added = TRUE,
                     wallet_processed = TRUE,
                     verification_status = 'AUTO_APPROVED',
                     match_method = 'legacy_credited',
                     verified_at = NOW()
                 WHERE id = $1`,
                [tx.id]
            );
            return {
                success: true,
                method: 'legacy_credited',
                phone: tx.linked_customer_phone,
                customerName: tx.display_name,
                amount,
                walletTxId: walletResult?.transaction?.id,
            };
        } catch (e) {
            console.warn(`[processWeb2Match] legacy credit fail for id=${tx.id}:`, e.message);
            // Fall through to normal re-extraction
        }
    }

    const content = tx.content || '';
    let matchedPhone = null;
    let customerName = null;
    let matchMethod = null;
    let dataSource = null;

    // 2. QR code path REMOVED — QR codes (N2 + 16 chars) chỉ tồn tại trong table
    //    Web 1.0 `balance_customer_info`. Web 2.0 không generate QR codes mới,
    //    nên không có gì để lookup. Fallback to phone extraction.

    // 3. Try exact / partial phone extraction
    if (!matchedPhone) {
        const extracted = extractPhoneFromContent(content);
        if (extracted.type === 'exact_phone') {
            const exactPhone = extracted.value;
            // TPOS-only lookup (no local cache — zero Web 1.0 dependency)
            try {
                const tposResult = await searchTPOSByPartialPhone(exactPhone, fetchWithTimeout);
                if (tposResult?.success && tposResult.uniquePhones?.length > 0) {
                    const phoneData = tposResult.uniquePhones.find((p) => p.phone === exactPhone);
                    if (phoneData && phoneData.customers?.length > 0) {
                        customerName = phoneData.customers[0].name;
                        dataSource = 'TPOS';
                    }
                }
            } catch (e) {
                console.warn('[web2-sepay-matching] TPOS exact phone lookup failed:', e.message);
            }
            matchedPhone = exactPhone;
            matchMethod = 'exact_phone';
        } else if (extracted.type === 'partial_phone') {
            const partialPhone = extracted.value;
            // TPOS-only lookup (no local cache — zero Web 1.0 dependency)
            let matchedPhones = [];
            try {
                const tposResult = await searchTPOSByPartialPhone(partialPhone, fetchWithTimeout);
                if (tposResult?.success && tposResult.uniquePhones?.length > 0) {
                    matchedPhones = tposResult.uniquePhones;
                    dataSource = 'TPOS';
                }
            } catch (e) {
                console.warn('[web2-sepay-matching] TPOS partial lookup failed:', e.message);
            }

            if (matchedPhones.length === 1) {
                // Single match → auto credit
                matchedPhone = matchedPhones[0].phone;
                customerName = matchedPhones[0].customers?.[0]?.name || null;
                matchMethod = 'single_match';
            } else if (matchedPhones.length > 1) {
                // Multi match → create pending for user pick + audit log
                const insertPending = await db.query(
                    `INSERT INTO web2_pending_matches
                       (transaction_id, extracted_phone, matched_customers, status)
                     VALUES ($1, $2, $3, 'pending')
                     RETURNING id`,
                    [web2BhId, partialPhone, JSON.stringify(matchedPhones)]
                );
                await db.query(
                    `UPDATE web2_balance_history
                     SET match_method = 'pending_match'
                     WHERE id = $1`,
                    [web2BhId]
                );
                // Audit log multi-match decision
                const auditCandidates = matchedPhones.flatMap((m) =>
                    (m.customers || []).map((c) => ({
                        phone: m.phone || c.phone,
                        name: c.name,
                    }))
                );
                await web2MatchAudit.log(db, {
                    transactionId: web2BhId,
                    sepayId: tx.sepay_id,
                    extractedValue: partialPhone,
                    extractedType: 'partial_phone',
                    candidates: auditCandidates,
                    chosenPhone: null,
                    chosenName: null,
                    decisionTier: 'pending_ambiguous',
                    confidenceScore: 0,
                    confidenceBreakdown: {
                        reason: 'multi_match',
                        candidateCount: matchedPhones.length,
                    },
                    amount,
                    decidedBy: 'auto',
                    note: `Multi-match ${matchedPhones.length} candidates → user pick`,
                });
                return {
                    success: true,
                    method: 'pending_match_created',
                    pendingMatchId: insertPending.rows[0].id,
                    transactionId: web2BhId,
                    partialPhone,
                    uniquePhonesCount: matchedPhones.length,
                };
            } else {
                // No match
                return {
                    success: false,
                    reason: 'No match found',
                    partialPhone,
                };
            }
        } else {
            // type === 'none'
            return {
                success: false,
                reason: 'No identifier found',
                note: extracted.note,
            };
        }
    }

    // 4. (NEW Phase 5) Compute confidence score before auto-credit.
    // Single match nhưng confidence thấp → push pending để user review.
    // Multi match đã skip ở bước trên (return early với pending_match_created).
    const candidate = { Name: customerName || '', Phone: matchedPhone };
    const conf = web2ContentParser.scoreConfidence({
        content,
        candidate,
        phoneMatchType:
            matchMethod === 'qr_code'
                ? 'qr_code'
                : matchMethod === 'exact_phone'
                  ? 'exact_phone'
                  : 'partial_phone',
        multiMatchCount: 1, // we're here only after single-match path
    });
    const tier = web2ContentParser.decisionTier(conf.score, 1);

    if (tier === 'pending_ambiguous' || tier === 'review_low') {
        // Confidence quá thấp dù single match — không tự credit, đẩy về pending
        const candidatePayload = [{ phone: matchedPhone, name: customerName, score: conf.score }];
        const insertPending = await db.query(
            `INSERT INTO web2_pending_matches
               (transaction_id, extracted_phone, matched_customers, status)
             VALUES ($1, $2, $3, 'pending')
             RETURNING id`,
            [web2BhId, matchedPhone, JSON.stringify(candidatePayload)]
        );
        await db.query(
            `UPDATE web2_balance_history
             SET match_method = 'pending_low_confidence'
             WHERE id = $1`,
            [web2BhId]
        );
        // Audit log: decision = pending_low_confidence
        await web2MatchAudit.log(db, {
            transactionId: web2BhId,
            sepayId: tx.sepay_id,
            extractedValue: matchedPhone,
            extractedType: matchMethod,
            candidates: candidatePayload,
            chosenPhone: null,
            chosenName: null,
            decisionTier: tier,
            confidenceScore: conf.score,
            confidenceBreakdown: conf.breakdown,
            amount,
            decidedBy: 'auto',
            note: `Single match but confidence ${conf.score} < ${AUTO_CREDIT_MIN_SCORE}`,
        });
        return {
            success: true,
            method: 'pending_low_confidence',
            pendingMatchId: insertPending.rows[0].id,
            transactionId: web2BhId,
            phone: matchedPhone,
            customerName,
            confidenceScore: conf.score,
            note: 'Single match but confidence low — needs user review',
        };
    }

    // 5. Auto credit Web 2.0 wallet (confidence ≥ 70)
    let walletResult;
    try {
        walletResult = await web2WalletService.processDeposit(
            db,
            matchedPhone,
            amount,
            tx.id,
            `Nap tu CK (${matchMethod}, conf ${conf.score})`,
            null,
            null,
            tx.sepay_id
        );
    } catch (e) {
        console.error('[web2-sepay-matching] processDeposit failed:', e.message);
        await db.query(
            `UPDATE web2_balance_history
             SET linked_customer_phone = $2, match_method = $3,
                 display_name = COALESCE(display_name, $4)
             WHERE id = $1`,
            [web2BhId, matchedPhone, matchMethod, customerName]
        );
        await web2MatchAudit.log(db, {
            transactionId: web2BhId,
            sepayId: tx.sepay_id,
            extractedValue: matchedPhone,
            extractedType: matchMethod,
            candidates: [{ phone: matchedPhone, name: customerName, score: conf.score }],
            chosenPhone: matchedPhone,
            chosenName: customerName,
            decisionTier: 'error_wallet_credit',
            confidenceScore: conf.score,
            confidenceBreakdown: conf.breakdown,
            amount,
            decidedBy: 'auto',
            note: `Wallet credit failed: ${e.message}`,
        });
        return {
            success: false,
            reason: 'Wallet credit failed',
            error: e.message,
            phone: matchedPhone,
        };
    }

    // 6. Mark balance_history row processed
    await db.query(
        `UPDATE web2_balance_history
         SET debt_added = TRUE,
             linked_customer_phone = $2,
             wallet_processed = TRUE,
             verification_status = 'AUTO_APPROVED',
             match_method = $3,
             display_name = COALESCE(display_name, $4),
             verified_at = NOW()
         WHERE id = $1`,
        [web2BhId, matchedPhone, matchMethod, customerName]
    );

    // 7. Audit log: SUCCESS
    await web2MatchAudit.log(db, {
        transactionId: web2BhId,
        sepayId: tx.sepay_id,
        extractedValue: matchedPhone,
        extractedType: matchMethod,
        candidates: [{ phone: matchedPhone, name: customerName, score: conf.score }],
        chosenPhone: matchedPhone,
        chosenName: customerName,
        decisionTier: tier,
        confidenceScore: conf.score,
        confidenceBreakdown: conf.breakdown,
        amount,
        decidedBy: 'auto',
        walletTxId: walletResult.transaction?.id,
        note: `Auto credit (${matchMethod}, conf ${conf.score})`,
    });

    return {
        success: true,
        method: matchMethod,
        transactionId: web2BhId,
        phone: matchedPhone,
        customerName,
        dataSource,
        amount,
        walletTxId: walletResult.transaction?.id,
        alreadyProcessed: walletResult.alreadyProcessed,
        confidenceScore: conf.score,
        decisionTier: tier,
    };
}

/**
 * Resolve a pending Web 2.0 match by picking one phone from the choices.
 * Called by frontend when user picks customer.
 */
async function resolveWeb2PendingMatch(db, pendingId, selectedPhone, selectedName, resolvedBy) {
    const r = await db.query(
        `SELECT id, transaction_id, status FROM web2_pending_matches WHERE id = $1`,
        [pendingId]
    );
    if (r.rows.length === 0) throw new Error('Pending match not found');
    const pending = r.rows[0];
    if (pending.status !== 'pending') {
        throw new Error(`Match already ${pending.status}`);
    }

    const txRow = await db.query(
        `SELECT id, sepay_id, transfer_amount FROM web2_balance_history WHERE id = $1`,
        [pending.transaction_id]
    );
    if (txRow.rows.length === 0) throw new Error('Transaction not found');
    const tx = txRow.rows[0];
    const amount = parseInt(tx.transfer_amount) || 0;

    if (amount <= 0) throw new Error('Invalid transfer amount');

    const walletResult = await web2WalletService.processDeposit(
        db,
        selectedPhone,
        amount,
        tx.id,
        `Nap tu CK (resolved pending)`,
        null,
        null,
        tx.sepay_id
    );

    await db.query(
        `UPDATE web2_balance_history
         SET debt_added = TRUE,
             linked_customer_phone = $2,
             wallet_processed = TRUE,
             verification_status = 'AUTO_APPROVED',
             match_method = 'manual_resolve',
             display_name = COALESCE(display_name, $3),
             verified_at = NOW()
         WHERE id = $1`,
        [pending.transaction_id, selectedPhone, selectedName || null]
    );

    await db.query(
        `UPDATE web2_pending_matches
         SET status = 'resolved', resolved_at = NOW(), resolved_by = $2,
             resolution_notes = $3
         WHERE id = $1`,
        [pendingId, resolvedBy || null, `Resolved to ${selectedPhone} ${selectedName || ''}`]
    );

    // Audit log manual resolve
    await web2MatchAudit.log(db, {
        transactionId: pending.transaction_id,
        sepayId: tx.sepay_id,
        extractedValue: selectedPhone,
        extractedType: 'manual_resolve',
        candidates: [{ phone: selectedPhone, name: selectedName }],
        chosenPhone: selectedPhone,
        chosenName: selectedName,
        decisionTier: 'manual_resolve',
        confidenceScore: 100,
        confidenceBreakdown: { reason: 'user_picked' },
        amount,
        decidedBy: resolvedBy || 'manual',
        walletTxId: walletResult.transaction?.id,
        note: `Pending #${pendingId} resolved manually`,
    });

    return {
        success: true,
        phone: selectedPhone,
        walletTxId: walletResult.transaction?.id,
        amount,
    };
}

module.exports = {
    ensureSchema,
    insertWeb2BalanceHistory,
    processWeb2Match,
    resolveWeb2PendingMatch,
};
