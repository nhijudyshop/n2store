// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — audit log cho mọi quyết định match SePay.
// =====================================================================
// Web2MatchAudit — ghi mọi quyết định match vào web2_match_audit table
// để có audit trail + Undo capability.
//
// Schema:
//   web2_match_audit (
//     id, transaction_id (web2_balance_history.id), sepay_id,
//     extracted_value, extracted_type, candidates (jsonb),
//     chosen_phone, chosen_name, decision_tier, confidence_score,
//     confidence_breakdown (jsonb), amount, decided_by, decided_at,
//     reverted, reverted_at, reverted_by, note, created_at
//   )
// =====================================================================

let _ready = false;
async function ensureSchema(pool) {
    if (_ready || !pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_match_audit (
                id BIGSERIAL PRIMARY KEY,
                transaction_id BIGINT NOT NULL,
                sepay_id VARCHAR(100),
                extracted_value VARCHAR(50),
                extracted_type VARCHAR(30),
                candidates JSONB,
                chosen_phone VARCHAR(20),
                chosen_name VARCHAR(255),
                decision_tier VARCHAR(30),
                confidence_score NUMERIC(5,2),
                confidence_breakdown JSONB,
                amount NUMERIC(15,2),
                decided_by VARCHAR(100) DEFAULT 'auto',
                decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reverted BOOLEAN DEFAULT FALSE,
                reverted_at TIMESTAMPTZ,
                reverted_by VARCHAR(100),
                wallet_tx_id BIGINT,
                note TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_w2ma_tx ON web2_match_audit(transaction_id);
            CREATE INDEX IF NOT EXISTS idx_w2ma_phone ON web2_match_audit(chosen_phone);
            CREATE INDEX IF NOT EXISTS idx_w2ma_created ON web2_match_audit(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_w2ma_decision ON web2_match_audit(decision_tier);
            CREATE INDEX IF NOT EXISTS idx_w2ma_revert ON web2_match_audit(reverted) WHERE reverted = false;
        `);
        _ready = true;
        console.log('[web2-match-audit] schema ready');
    } catch (e) {
        console.error('[web2-match-audit] ensureSchema failed:', e.message);
    }
}

/**
 * Log a match decision.
 * @param {Object} db - pg Pool
 * @param {Object} payload - {
 *   transactionId, sepayId, extractedValue, extractedType,
 *   candidates: [{phone, name, score}],
 *   chosenPhone, chosenName, decisionTier, confidenceScore,
 *   confidenceBreakdown, amount, decidedBy, walletTxId, note
 * }
 * @returns {Promise<{id: number}>}
 */
async function log(db, payload) {
    if (!db || !payload) return { id: null };
    try {
        const r = await db.query(
            `INSERT INTO web2_match_audit (
                transaction_id, sepay_id, extracted_value, extracted_type,
                candidates, chosen_phone, chosen_name, decision_tier,
                confidence_score, confidence_breakdown, amount, decided_by,
                wallet_tx_id, note
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
                payload.transactionId || null,
                payload.sepayId || null,
                payload.extractedValue || null,
                payload.extractedType || null,
                JSON.stringify(payload.candidates || []),
                payload.chosenPhone || null,
                payload.chosenName || null,
                payload.decisionTier || null,
                payload.confidenceScore != null ? payload.confidenceScore : null,
                JSON.stringify(payload.confidenceBreakdown || {}),
                payload.amount != null ? payload.amount : null,
                payload.decidedBy || 'auto',
                payload.walletTxId || null,
                payload.note || null,
            ]
        );
        return { id: r.rows[0].id };
    } catch (e) {
        console.error('[web2-match-audit] log failed:', e.message);
        return { id: null };
    }
}

/**
 * List audit rows. Filter by phone, decision_tier, time range.
 */
async function list(db, opts = {}) {
    const limit = Math.min(parseInt(opts.limit) || 100, 500);
    const offset = parseInt(opts.offset) || 0;
    const params = [];
    const where = [];
    if (opts.phone) {
        params.push(opts.phone);
        where.push(`chosen_phone = $${params.length}`);
    }
    if (opts.decisionTier) {
        params.push(opts.decisionTier);
        where.push(`decision_tier = $${params.length}`);
    }
    if (opts.minScore != null) {
        params.push(Number(opts.minScore));
        where.push(`confidence_score >= $${params.length}`);
    }
    if (opts.maxScore != null) {
        params.push(Number(opts.maxScore));
        where.push(`confidence_score <= $${params.length}`);
    }
    if (opts.reverted === true || opts.reverted === 'true') where.push('reverted = TRUE');
    if (opts.reverted === false || opts.reverted === 'false') where.push('reverted = FALSE');
    if (opts.sinceMs) {
        params.push(new Date(Number(opts.sinceMs)).toISOString());
        where.push(`created_at >= $${params.length}`);
    }
    const sql = `
        SELECT * FROM web2_match_audit
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    const r = await db.query(sql, params);
    const c = await db.query(
        `SELECT COUNT(*) AS n FROM web2_match_audit ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`,
        params
    );
    return { items: r.rows, total: Number(c.rows[0].n) || 0 };
}

/**
 * Revert a match decision (Undo). Within UNDO_WINDOW_MS only.
 * Steps:
 *   1. Lookup audit row
 *   2. If revert window expired → reject
 *   3. WITHDRAW the wallet amount via web2-wallet-service.processWithdraw
 *      with note 'REVERT match audit #<id>'
 *   4. Reset web2_balance_history row: clear linked_customer_phone,
 *      debt_added=false, wallet_processed=false (let user re-link)
 *   5. Mark audit row reverted=true
 *
 * @param {Object} db
 * @param {number} auditId
 * @param {string} revertedBy
 * @param {number} [windowMs] - default 5 minutes
 */
const UNDO_WINDOW_MS = 5 * 60 * 1000;
async function revert(db, auditId, revertedBy, windowMs = UNDO_WINDOW_MS) {
    // 3H17 FIX (2026-06-12): toàn bộ revert trong 1 transaction + FOR UPDATE.
    // Trước đây SELECT không lock + withdraw + 2 UPDATE rời nhau: (a) 2 revert
    // song song cùng qua check `audit.reverted` → trừ ví ×2; (b) withdraw lỗi
    // bị NUỐT mà vẫn reset history + mark reverted → "sổ reset, tiền chưa rút".
    // Giờ: lock row → guard → withdraw TRONG tx (lỗi ví = throw rollback hết).
    const isPool = typeof db.connect === 'function';
    const client = isPool ? await db.connect() : db;
    // AUDIT 2026-06-20 #LOW21: queue _afterCommit để emitAfterCommit (wallet-service)
    // chạy hook SAU COMMIT thay vì process.nextTick (emit trước commit → stale-read).
    if (isPool) client._afterCommit = [];
    try {
        if (isPool) await client.query('BEGIN');

        const r = await client.query(`SELECT * FROM web2_match_audit WHERE id = $1 FOR UPDATE`, [
            auditId,
        ]);
        if (r.rows.length === 0) {
            const err = new Error('Audit not found');
            err.code = 'NOT_FOUND';
            throw err;
        }
        const audit = r.rows[0];
        if (audit.reverted) {
            const err = new Error('Already reverted');
            err.code = 'ALREADY_REVERTED';
            throw err;
        }
        const ageMs = Date.now() - new Date(audit.decided_at).getTime();
        if (ageMs > windowMs) {
            const err = new Error(
                `Revert window expired (${Math.round(ageMs / 60000)} min > ${Math.round(windowMs / 60000)} min)`
            );
            err.code = 'WINDOW_EXPIRED';
            throw err;
        }
        if (!audit.chosen_phone || !audit.amount) {
            const err = new Error('No wallet credit to revert (chosen_phone or amount missing)');
            err.code = 'NO_CREDIT';
            throw err;
        }

        // Withdraw the previously credited amount — TRONG transaction. Ví không
        // đủ số dư → throw WALLET_REVERT_FAILED, rollback toàn bộ (an toàn tiền
        // hơn reset sổ khi tiền chưa rút như trước).
        let withdrawTxId = null;
        try {
            const web2WalletService = require('./web2-wallet-service');
            const wd = await web2WalletService.processWithdraw(
                client,
                audit.chosen_phone,
                Number(audit.amount),
                'audit_revert',
                String(auditId),
                `REVERT match audit #${auditId} (was credit for sepay ${audit.sepay_id || 'unknown'})`
            );
            withdrawTxId = wd?.transaction?.id || null;
        } catch (e) {
            const err = new Error(`Không rút lại được tiền ví ${audit.chosen_phone}: ${e.message}`);
            err.code = 'WALLET_REVERT_FAILED';
            throw err;
        }

        // Reset balance_history row (allow re-linking)
        await client.query(
            `UPDATE web2_balance_history
             SET linked_customer_phone = NULL,
                 debt_added = FALSE,
                 wallet_processed = FALSE,
                 verification_status = NULL,
                 match_method = NULL,
                 display_name = NULL,
                 verified_at = NULL
             WHERE id = $1`,
            [audit.transaction_id]
        );

        // Mark audit reverted
        await client.query(
            `UPDATE web2_match_audit
             SET reverted = TRUE, reverted_at = NOW(), reverted_by = $2,
                 note = COALESCE(note, '') || '\nReverted by ' || $2
             WHERE id = $1`,
            [auditId, revertedBy || 'unknown']
        );

        if (isPool) await client.query('COMMIT');
        // AUDIT #LOW21: flush hook _afterCommit sau COMMIT (emit wallet SSE durable).
        if (isPool && Array.isArray(client._afterCommit)) {
            for (const hook of client._afterCommit) {
                try {
                    hook();
                } catch (he) {
                    console.error('[revertMatchAudit] afterCommit hook failed:', he.message);
                }
            }
        }
        return {
            auditId,
            transactionId: audit.transaction_id,
            revertedPhone: audit.chosen_phone,
            revertedAmount: audit.amount,
            withdrawTxId,
        };
    } catch (e) {
        if (isPool) await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        if (isPool) {
            client._afterCommit = null;
            client.release();
        }
    }
}

module.exports = {
    ensureSchema,
    log,
    list,
    revert,
    UNDO_WINDOW_MS,
};
