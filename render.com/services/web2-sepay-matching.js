// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — fully isolated.
// =====================================================================
// Web2SepayMatching — Match SePay deposit → KH → cộng ví Web 2.0
// =====================================================================
// Web 2.0 spec:
//   • LUÔN auto-credit khi match 1-1 (không check auto_approve_enabled)
//   • Không có virtual_credit/virtual_balance
//   • Không có verification_status PENDING/APPROVED/REJECTED
//   • Match đa SĐT → tạo web2_pending_matches để user chọn ở UI
//   • Ghi vào web2_balance_history + web2_customer_wallets/web2_wallet_transactions
//
// Phase 5 (2026-05-30): zero coupling với module SePay khác trong repo.
//   • Self-contained extractor + TPOS search trong web2-content-extractor.js
//   • QR code path live qua bảng web2_payment_qr_codes (native-orders generate
//     QR persistent per customer; matcher detect QR trong content + lookup
//     → credit. Format: <slug(tên)><TPOS_partner_id>, vd 'NHIJUDY571046'.)
//   • Phone length range: 5–10 digits (extractor sort priority 6>7-10>5)
//   • match_method 'prelink_credit' — row đã có linked_customer_phone trước
//     khi matcher fire, chỉ cần re-credit ví, không cần re-extract content.
//
// API public:
//   • processWeb2Match(db, web2BalanceHistoryRow, fetchWithTimeout)
//     → { success, method, phone?, customerName?, walletTxnId?, pendingMatchId? }
// =====================================================================

const { extractIdentifier, searchTposByPhone } = require('./web2-content-extractor');
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
        // web2_balance_history — explicit Web 2.0 schema, self-contained.
        // Idempotent: trên prod table đã tồn tại → CREATE IF NOT EXISTS no-op.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_balance_history (
                id BIGINT PRIMARY KEY,
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
                linked_customer_phone VARCHAR(20),
                display_name VARCHAR(255),
                debt_added BOOLEAN DEFAULT FALSE,
                wallet_processed BOOLEAN DEFAULT FALSE,
                match_method VARCHAR(40),
                verification_status VARCHAR(40),
                verified_at TIMESTAMPTZ,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_web2_bh_sepay_id ON web2_balance_history(sepay_id);
            CREATE INDEX IF NOT EXISTS idx_web2_bh_tx_date ON web2_balance_history(transaction_date DESC);
            CREATE INDEX IF NOT EXISTS idx_web2_bh_transfer_type ON web2_balance_history(transfer_type);
            CREATE INDEX IF NOT EXISTS idx_web2_bh_debt_added ON web2_balance_history(debt_added) WHERE debt_added = FALSE;
        `);

        // Match-method CHECK constraint — Web 2.0 enumerated values.
        // 'manual_entry' giữ lại vì 1500+ row hiện có đã set value đó (read-only,
        // không tạo mới qua flow Web 2.0). Idempotent.
        await pool.query(`
            DO $$
            BEGIN
                ALTER TABLE web2_balance_history
                    DROP CONSTRAINT IF EXISTS balance_history_match_method_check;
                ALTER TABLE web2_balance_history
                    DROP CONSTRAINT IF EXISTS web2_balance_history_match_method_check;
                ALTER TABLE web2_balance_history
                    ADD CONSTRAINT web2_balance_history_match_method_check
                    CHECK (match_method IS NULL OR match_method IN (
                        'qr_code',
                        'exact_phone',
                        'single_match',
                        'pending_match',
                        'pending_low_confidence',
                        'manual_entry',
                        'manual_link',
                        'prelink_credit',
                        'manual_deposit',  -- nạp tay (+) từ balance-history page
                        'manual_withdraw', -- rút tay (-) từ balance-history page
                        'legacy_credited'  -- giữ lại cho row đã có value cũ, KHÔNG dùng cho UPDATE mới
                    ));
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'web2_balance_history match_method constraint reset: %', SQLERRM;
            END $$;
        `);

        // web2_payment_qr_codes — Web 2.0 native QR registry, PERSISTENT per KH.
        // Workflow:
        //   1. native-orders bấm "Gửi VietQR" cho KH có TPOS Partner Id = 571046
        //   2. Generator tạo qr_code = <slug(tên)><partner_id>, vd 'NHIJUDY571046'
        //      — tên có thể trùng giữa nhiều KH, nhưng partner_id TPOS là UNIQUE
        //        toàn shop → qr_code unique, KH đổi tên thì qr_code regenerate
        //        nhưng partner_id giữ nguyên (UPSERT theo customer_id).
        //   3. INSERT/UPDATE row (customer_id PK).
        //   4. Gửi VietQR cho khách → khách CK với nội dung chứa qr_code.
        //   5. SePay webhook → matcher scan content → match qr_code → credit.
        //   6. QR persistent: khách dùng nhiều CK cùng QR, không expire/use_at
        //      block. last_used_at chỉ để audit + UI hiển thị "lần gần nhất".
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_payment_qr_codes (
                customer_id BIGINT PRIMARY KEY,
                qr_code VARCHAR(50) NOT NULL UNIQUE,
                phone VARCHAR(20) NOT NULL,
                customer_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_used_at TIMESTAMPTZ,
                last_used_balance_history_id BIGINT,
                use_count INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT web2_payment_qr_codes_format
                    CHECK (qr_code ~ '^[A-Z0-9]{5,50}$')
            );
            CREATE INDEX IF NOT EXISTS idx_web2_qr_code_lookup
                ON web2_payment_qr_codes(qr_code);
            CREATE INDEX IF NOT EXISTS idx_web2_qr_phone
                ON web2_payment_qr_codes(phone);
        `);

        // Sequence riêng — chỉ tham chiếu web2_balance_history. Lần đầu init:
        // nếu bảng rỗng, sequence khởi đầu từ 10000 — buffer an toàn cho mọi
        // row đã có ID < 10000 (nếu có) không bị collision.
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

    // 1. PRELINK CREDIT: row đã có linked_customer_phone (phone ≥ 5 digits)
    //    nhưng ví Web 2.0 chưa cộng → credit lại theo phone đã link, fill name
    //    qua TPOS realtime. Không cần re-extract content. Phone < 5 digit
    //    là artifact extraction lỗi, KHÔNG credit (tránh tạo wallet sai).
    if (tx.linked_customer_phone && tx.linked_customer_phone.length >= 5) {
        // Backfill display_name từ TPOS nếu null
        let prelinkName = tx.display_name;
        if (!prelinkName) {
            try {
                const tposResult = await searchTposByPhone(
                    tx.linked_customer_phone,
                    fetchWithTimeout
                );
                if (tposResult?.success && tposResult.uniquePhones?.length > 0) {
                    const phoneData = tposResult.uniquePhones.find(
                        (p) => p.phone === tx.linked_customer_phone
                    );
                    if (phoneData?.customers?.length > 0) {
                        prelinkName = phoneData.customers[0].name || null;
                    }
                }
            } catch (e) {
                console.warn(
                    `[processWeb2Match] prelink TPOS name lookup fail for ${tx.linked_customer_phone}:`,
                    e.message
                );
            }
        }
        try {
            const walletResult = await web2WalletService.processDeposit(
                db,
                tx.linked_customer_phone,
                amount,
                tx.id,
                'Nap tu CK (prelink credit)',
                null,
                null,
                tx.sepay_id
            );
            await db.query(
                `UPDATE web2_balance_history
                 SET debt_added = TRUE,
                     wallet_processed = TRUE,
                     verification_status = 'AUTO_APPROVED',
                     match_method = 'prelink_credit',
                     display_name = COALESCE(display_name, $2),
                     verified_at = NOW()
                 WHERE id = $1`,
                [tx.id, prelinkName]
            );
            return {
                success: true,
                method: 'prelink_credit',
                phone: tx.linked_customer_phone,
                customerName: prelinkName,
                amount,
                walletTxId: walletResult?.transaction?.id,
            };
        } catch (e) {
            console.warn(`[processWeb2Match] prelink credit fail for id=${tx.id}:`, e.message);
            // Fall through to normal re-extraction
        }
    }

    const content = tx.content || '';
    let matchedPhone = null;
    let customerName = null;
    let customerId = null;
    let matchMethod = null;
    let dataSource = null;
    let qrCodeUsed = null; // remember QR để mark used sau khi credit

    // 2. Extract identifier (QR candidates + phone)
    const extracted = extractIdentifier(content);

    // 2a. QR code path — try DB lookup với tất cả candidates từ extractor
    //     (format mới <slug><partner_id> + legacy N2+16). Match ≥1 candidate
    //     → use QR path. Miss → fall through to phone extraction (không
    //     return early — content có thể có phone hợp lệ kèm theo).
    const candidates = extracted.qrCandidates || [];
    if (candidates.length > 0) {
        const qrLookup = await db.query(
            `SELECT qr_code, phone, customer_name, customer_id
             FROM web2_payment_qr_codes
             WHERE qr_code = ANY($1)
             LIMIT 1`,
            [candidates]
        );
        if (qrLookup.rows.length > 0) {
            const qr = qrLookup.rows[0];
            matchedPhone = qr.phone;
            customerName = qr.customer_name;
            customerId = qr.customer_id;
            matchMethod = 'qr_code';
            dataSource = 'WEB2_QR';
            qrCodeUsed = qr.qr_code;
        } else {
            console.log(
                `[processWeb2Match] QR candidates [${candidates.join(',')}] không có trong web2_payment_qr_codes — fallback phone extraction`
            );
        }
    }

    // 2b. Aggregate ALL phone candidates (5–10 digits) — search TPOS per
    //     candidate, merge unique phones (dedup by phone). 1 unique → auto
    //     credit; >1 unique → pending; 0 → no_match.
    //     Cap MAX_CANDIDATES_TO_TRY để tránh spam TPOS calls.
    const MAX_CANDIDATES_TO_TRY = 5;
    if (!matchedPhone) {
        const candidates = (extracted.phoneCandidates || []).slice(0, MAX_CANDIDATES_TO_TRY);
        if (candidates.length === 0) {
            return {
                success: false,
                reason: 'No identifier found',
                note: extracted.note,
            };
        }

        const phoneMap = new Map(); // unique phone → { phone, customers[], sourceCandidate }
        for (const cand of candidates) {
            try {
                const r = await searchTposByPhone(cand, fetchWithTimeout);
                if (!r?.success || !r.uniquePhones?.length) continue;
                dataSource = 'TPOS';
                for (const u of r.uniquePhones) {
                    if (!phoneMap.has(u.phone)) {
                        phoneMap.set(u.phone, { ...u, sourceCandidate: cand });
                    } else {
                        // Merge customers by id (dedup)
                        const ex = phoneMap.get(u.phone);
                        for (const c of u.customers || []) {
                            if (!ex.customers.find((x) => x.id === c.id)) {
                                ex.customers.push(c);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn(`[web2-sepay-matching] TPOS search "${cand}" failed:`, e.message);
            }
        }

        const merged = Array.from(phoneMap.values());
        const bestCand = candidates[0];
        const bestIsExact = bestCand.length === 10 && bestCand.startsWith('0');

        if (merged.length === 1) {
            // Single unique phone → auto credit
            matchedPhone = merged[0].phone;
            customerName = merged[0].customers?.[0]?.name || null;
            customerId = merged[0].customers?.[0]?.id || null;
            matchMethod =
                bestIsExact && bestCand === merged[0].phone ? 'exact_phone' : 'single_match';
        } else if (merged.length > 1) {
            // Multi unique phones → pending_match
            const insertPending = await db.query(
                `INSERT INTO web2_pending_matches
                   (transaction_id, extracted_phone, matched_customers, status)
                 VALUES ($1, $2, $3, 'pending')
                 RETURNING id`,
                [web2BhId, candidates.join(','), JSON.stringify(merged)]
            );
            await db.query(
                `UPDATE web2_balance_history
                 SET match_method = 'pending_match'
                 WHERE id = $1`,
                [web2BhId]
            );
            const auditCandidates = merged.flatMap((m) =>
                (m.customers || []).map((c) => ({
                    phone: m.phone || c.phone,
                    name: c.name,
                }))
            );
            await web2MatchAudit.log(db, {
                transactionId: web2BhId,
                sepayId: tx.sepay_id,
                extractedValue: candidates.join(','),
                extractedType: 'partial_phone',
                candidates: auditCandidates,
                chosenPhone: null,
                chosenName: null,
                decisionTier: 'pending_ambiguous',
                confidenceScore: 0,
                confidenceBreakdown: {
                    reason: 'multi_match_aggregated',
                    candidatesTried: candidates.length,
                    uniquePhonesFound: merged.length,
                },
                amount,
                decidedBy: 'auto',
                note: `Multi-match ${merged.length} unique phones từ ${candidates.length} candidates → user pick`,
            });
            return {
                success: true,
                method: 'pending_match_created',
                pendingMatchId: insertPending.rows[0].id,
                transactionId: web2BhId,
                candidates,
                uniquePhonesCount: merged.length,
            };
        } else {
            // 0 match — no TPOS customer found for any candidate
            return {
                success: false,
                reason: 'No match found',
                candidates,
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

    // 6b. Nếu credit từ QR path → update use_count + last_used_* (audit)
    if (qrCodeUsed) {
        await db
            .query(
                `UPDATE web2_payment_qr_codes
             SET use_count = use_count + 1,
                 last_used_at = NOW(),
                 last_used_balance_history_id = $2
             WHERE qr_code = $1`,
                [qrCodeUsed, web2BhId]
            )
            .catch((e) =>
                console.warn(
                    `[processWeb2Match] QR usage update fail for ${qrCodeUsed}:`,
                    e.message
                )
            );
    }

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
