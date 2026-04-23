// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * WALLET EVENT PROCESSOR
 * =====================================================
 *
 * Dịch vụ xử lý wallet events và broadcast SSE realtime
 *
 * Features:
 *   - Atomic wallet updates với transaction logging
 *   - Event emitter cho SSE broadcast
 *   - Virtual credit FIFO management
 *
 * Event Types:
 *   - DEPOSIT: Nạp tiền từ CK ngân hàng
 *   - WITHDRAW: Rút tiền / Thanh toán
 *   - VIRTUAL_CREDIT_ISSUED: Cấp credit ảo (hoàn hàng, boom, bồi thường)
 *   - VIRTUAL_CREDIT_USED: Sử dụng credit ảo
 *   - VIRTUAL_CREDIT_EXPIRED: Credit ảo hết hạn
 *   - ADJUSTMENT: Điều chỉnh thủ công
 *
 * Created: 2026-01-12
 * =====================================================
 */

const EventEmitter = require('events');
const { withTransaction } = require('../db/with-transaction');

// =====================================================
// EVENT EMITTER FOR SSE BROADCAST
// =====================================================

const walletEvents = new EventEmitter();
walletEvents.setMaxListeners(100); // Allow many SSE connections

// Event types enum
const WALLET_EVENT_TYPES = {
    DEPOSIT: 'DEPOSIT',
    WITHDRAW: 'WITHDRAW',
    VIRTUAL_CREDIT_ISSUED: 'VIRTUAL_CREDIT_ISSUED',
    VIRTUAL_CREDIT_USED: 'VIRTUAL_CREDIT_USED',
    VIRTUAL_CREDIT_EXPIRED: 'VIRTUAL_CREDIT_EXPIRED',
    ADJUSTMENT: 'ADJUSTMENT'
};

// Source types - MUST MATCH database constraint in wallet_transactions table
const WALLET_SOURCES = {
    BANK_TRANSFER: 'BANK_TRANSFER',
    RETURN_GOODS: 'RETURN_GOODS',
    ORDER_PAYMENT: 'ORDER_PAYMENT',
    VIRTUAL_CREDIT_ISSUE: 'VIRTUAL_CREDIT_ISSUE',
    VIRTUAL_CREDIT_USE: 'VIRTUAL_CREDIT_USE',
    VIRTUAL_CREDIT_EXPIRE: 'VIRTUAL_CREDIT_EXPIRE',
    MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT'
};

// =====================================================
// WALLET HELPER FUNCTIONS
// =====================================================

/**
 * Get or create wallet for a phone
 * @param {Object} db - Database connection
 * @param {string} phone - Phone number
 * @param {number|null} customerId - Customer ID (optional)
 * @returns {Promise<Object>} Wallet object
 */
async function getOrCreateWallet(db, phone, customerId = null) {
    // Try to get existing wallet
    let result = await db.query(`
        SELECT id, phone, customer_id, balance, virtual_balance,
               total_deposited, total_withdrawn, total_virtual_issued, total_virtual_used
        FROM customer_wallets
        WHERE phone = $1
    `, [phone]);

    if (result.rows.length > 0) {
        const wallet = result.rows[0];

        // Update customer_id if provided and not set
        if (customerId && !wallet.customer_id) {
            await db.query('UPDATE customer_wallets SET customer_id = $1, updated_at = NOW() WHERE id = $2',
                [customerId, wallet.id]);
            wallet.customer_id = customerId;
        }

        return wallet;
    }

    // Create new wallet
    result = await db.query(`
        INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
        VALUES ($1, $2, 0, 0)
        ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
        RETURNING id, phone, customer_id, balance, virtual_balance,
                  total_deposited, total_withdrawn, total_virtual_issued, total_virtual_used
    `, [phone, customerId]);

    console.log(`[WALLET-PROCESSOR] Created wallet for ${phone}`);
    return result.rows[0];
}

/**
 * Calculate new balance based on event type
 */
function calculateNewBalance(currentBalance, type, amount) {
    const amountNum = parseFloat(amount);

    switch (type) {
        case WALLET_EVENT_TYPES.DEPOSIT:
        case WALLET_EVENT_TYPES.VIRTUAL_CREDIT_ISSUED:
            return parseFloat(currentBalance) + amountNum;

        case WALLET_EVENT_TYPES.WITHDRAW:
        case WALLET_EVENT_TYPES.VIRTUAL_CREDIT_USED:
        case WALLET_EVENT_TYPES.VIRTUAL_CREDIT_EXPIRED:
            return parseFloat(currentBalance) - amountNum;

        case WALLET_EVENT_TYPES.ADJUSTMENT:
            return parseFloat(currentBalance) + amountNum; // Can be negative

        default:
            return parseFloat(currentBalance);
    }
}

// =====================================================
// MAIN WALLET EVENT PROCESSOR
// =====================================================

/**
 * Process a wallet event (atomic operation).
 *
 * Accepts EITHER a pg.Pool or a pg.Client:
 *   - If pool → this function wraps the work in `withTransaction` (single client,
 *     real BEGIN/COMMIT/FOR UPDATE).
 *   - If client → caller already owns a transaction, we run on it directly and
 *     do NOT commit/rollback here. `event.skipCommit = true` forces this mode
 *     even for a pool-like object, kept for backwards compat.
 *
 * Order of operations (fixed in Sprint 2 refactor to prevent double-crediting):
 *   1. SELECT customer_wallets FOR UPDATE — row lock held until COMMIT.
 *   2. INSERT wallet_transactions with ON CONFLICT (sepay_id) DO NOTHING.
 *      If INSERT returns 0 rows (duplicate sepay_id), we return {skipped:true}
 *      WITHOUT updating the balance. This prevents the classic bug where the
 *      wallet UPDATE was committed before the INSERT failed UNIQUE and rolled
 *      back — doubling the balance but leaving only one transaction row.
 *   3. UPDATE customer_wallets balance ONLY if INSERT succeeded.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {Object} event
 * @param {string} event.type - DEPOSIT | WITHDRAW | VIRTUAL_* | ADJUSTMENT
 * @param {string} event.phone
 * @param {number} event.amount
 * @param {string} event.source
 * @param {string} event.referenceType - balance_history | ticket | order | manual
 * @param {string|number} event.referenceId
 * @param {string} event.note
 * @param {number} [event.customerId]
 * @param {number|null} [event.sepayId] - BANK_TRANSFER deposits only; drives the partial UNIQUE index from migration 064
 * @param {boolean} [event.skipCommit] - deprecated; prefer passing a client directly
 * @param {string|Date|null} [event.transactionDate]
 * @returns {Promise<{success:boolean, transactionId?:number, wallet:Object, skipped?:boolean, reason?:string}>}
 */
async function processWalletEvent(db, event) {
    const isPool = db && typeof db.connect === 'function' && !event.skipCommit;
    if (isPool) {
        return withTransaction(db, (client) => runWalletEvent(client, event));
    }
    return runWalletEvent(db, event);
}

/**
 * Inner worker — operates on a dedicated client (no BEGIN/COMMIT here).
 * Caller must own the transaction.
 */
async function runWalletEvent(client, event) {
    const {
        type,
        phone,
        amount,
        source,
        referenceType,
        referenceId,
        note,
        customerId = null,
        createdBy = null,
        sepayId = null,
        transactionDate = null
    } = event;

    if (!phone || !type || amount === undefined) {
        throw new Error('Missing required fields: phone, type, amount');
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
        throw new Error('Invalid amount');
    }

    console.log(`[WALLET-PROCESSOR] Processing ${type}: ${phone} - ${amountNum}`);

    // 1. Get or create wallet (row lock held until caller's COMMIT)
    const walletResult = await client.query(`
        SELECT id, phone, customer_id, balance, virtual_balance,
               total_deposited, total_withdrawn, total_virtual_issued, total_virtual_used
        FROM customer_wallets
        WHERE phone = $1
        FOR UPDATE
    `, [phone]);

    let wallet;
    if (walletResult.rows.length === 0) {
        const createResult = await client.query(`
            INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
            VALUES ($1, $2, 0, 0)
            ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
            RETURNING id, phone, customer_id, balance, virtual_balance,
                      total_deposited, total_withdrawn, total_virtual_issued, total_virtual_used
        `, [phone, customerId]);
        wallet = createResult.rows[0];
        console.log(`[WALLET-PROCESSOR] Created wallet for ${phone}`);
    } else {
        wallet = walletResult.rows[0];
    }

    // 2. Compute new balances (both real + virtual, so we have consistent before/after snapshots)
    const isVirtualType = type.startsWith('VIRTUAL_');
    const currentBalance = isVirtualType ? wallet.virtual_balance : wallet.balance;
    const newBalance = calculateNewBalance(currentBalance, type, amountNum);

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = isVirtualType ? balanceBefore : newBalance;
    const virtualBefore = parseFloat(wallet.virtual_balance);
    const virtualAfter = isVirtualType ? newBalance : virtualBefore;

    // 3. INSERT wallet_transactions FIRST (ON CONFLICT DO NOTHING for sepay_id uniqueness).
    //    If this conflicts, we know another code path already processed the same bank tx
    //    → return skipped, DO NOT touch the balance.
    const insertColumns = `phone, wallet_id, type, amount,
            balance_before, balance_after,
            virtual_balance_before, virtual_balance_after,
            source, reference_type, reference_id, note, created_by, sepay_id${transactionDate ? ', created_at' : ''}`;
    const insertValues = transactionDate
        ? "$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, ($15::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' AT TIME ZONE 'UTC')"
        : '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14';
    const insertParams = [
        phone,
        wallet.id,
        type,
        amountNum,
        balanceBefore,
        balanceAfter,
        virtualBefore,
        virtualAfter,
        source,
        referenceType,
        referenceId?.toString(),
        note,
        createdBy,
        sepayId
    ];
    if (transactionDate) {
        insertParams.push(transactionDate);
    }

    // ON CONFLICT DO NOTHING only matters when sepay_id is NOT NULL (partial index
    // from migration 064). For non-bank transactions sepay_id is NULL and the
    // clause is a safe no-op.
    const txResult = await client.query(`
        INSERT INTO wallet_transactions (${insertColumns})
        VALUES (${insertValues})
        ON CONFLICT (sepay_id) WHERE sepay_id IS NOT NULL DO NOTHING
        RETURNING id
    `, insertParams);

    if (txResult.rowCount === 0) {
        // Duplicate sepay_id — another path already credited this bank transaction.
        console.log(`[WALLET-PROCESSOR] ⚠️ Duplicate sepay_id=${sepayId} — skipping wallet update for ${phone}`);
        return {
            success: true,
            skipped: true,
            reason: `Duplicate sepay_id=${sepayId}`,
            wallet
        };
    }

    const transactionId = txResult.rows[0].id;

    // 4. UPDATE wallet balance (safe — we hold the row lock from step 1,
    //    and INSERT succeeded so we know this is a fresh transaction)
    let updateQuery;
    let updateParams;
    if (isVirtualType) {
        const totalField = type === WALLET_EVENT_TYPES.VIRTUAL_CREDIT_ISSUED
            ? 'total_virtual_issued'
            : 'total_virtual_used';
        updateQuery = `
            UPDATE customer_wallets
            SET virtual_balance = $2,
                ${totalField} = ${totalField} + $3,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        updateParams = [wallet.id, newBalance, Math.abs(amountNum)];
    } else {
        const totalField = type === WALLET_EVENT_TYPES.DEPOSIT
            ? 'total_deposited'
            : type === WALLET_EVENT_TYPES.WITHDRAW
                ? 'total_withdrawn'
                : null;
        if (totalField) {
            updateQuery = `
                UPDATE customer_wallets
                SET balance = $2,
                    ${totalField} = ${totalField} + $3,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            updateParams = [wallet.id, newBalance, Math.abs(amountNum)];
        } else {
            updateQuery = `
                UPDATE customer_wallets
                SET balance = $2, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            updateParams = [wallet.id, newBalance];
        }
    }

    const updatedWalletResult = await client.query(updateQuery, updateParams);
    const updatedWallet = updatedWalletResult.rows[0];

    console.log(`[WALLET-PROCESSOR] ✅ ${type} completed: ${phone} - ${amountNum} (TX: ${transactionId})`);

    // 5. Emit SSE event (safe to emit before commit — if this transaction rolls back later
    //    the UI will reconcile on next SSE tick. Previously we emitted inside the old
    //    BEGIN/COMMIT block which was a no-op on pool anyway.)
    const eventData = {
        phone,
        wallet: updatedWallet,
        transaction: {
            id: transactionId,
            type,
            amount: amountNum,
            source,
            referenceType,
            referenceId,
            note
        },
        timestamp: new Date().toISOString()
    };

    walletEvents.emit('wallet:update', eventData);
    walletEvents.emit(`wallet:${phone}`, eventData);

    return {
        success: true,
        transactionId,
        wallet: updatedWallet
    };
}

// =====================================================
// SPECIALIZED EVENT FUNCTIONS
// =====================================================

/**
 * Process bank deposit (from balance_history link)
 * IMPORTANT: Includes idempotency check to prevent duplicate processing.
 *
 * @param {number|null} sepayId - SePay transaction id. When provided, stored on
 *   wallet_transactions.sepay_id — the partial UNIQUE index from migration 064
 *   guarantees at most one wallet deposit per SePay transaction at the DB level.
 */
async function processDeposit(db, phone, amount, balanceHistoryId, note, customerId = null, transactionDate = null, sepayId = null) {
    // IDEMPOTENCY CHECK: Verify balance_history not already processed
    const checkResult = await db.query(
        'SELECT wallet_processed FROM balance_history WHERE id = $1',
        [balanceHistoryId]
    );

    if (checkResult.rows.length > 0 && checkResult.rows[0].wallet_processed === true) {
        console.log(`[WALLET-PROCESSOR] ⚠️ Skipping duplicate deposit for balance_history ${balanceHistoryId} - already processed`);
        // Return existing transaction info if available
        const existingTx = await db.query(
            'SELECT id, balance_after FROM wallet_transactions WHERE reference_type = $1 AND reference_id = $2 LIMIT 1',
            ['balance_history', balanceHistoryId.toString()]
        );
        if (existingTx.rows.length > 0) {
            const wallet = await getOrCreateWallet(db, phone, customerId);
            return {
                success: true,
                transactionId: existingTx.rows[0].id,
                wallet: wallet,
                skipped: true,
                reason: 'Already processed'
            };
        }
        throw new Error(`Duplicate deposit attempt for balance_history ${balanceHistoryId}`);
    }

    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.DEPOSIT,
        phone,
        amount,
        source: WALLET_SOURCES.BANK_TRANSFER,
        referenceType: 'balance_history',
        referenceId: balanceHistoryId,
        note: note || `Nạp từ CK ngân hàng`,
        customerId,
        transactionDate,
        sepayId
    });
}

/**
 * Process manual deposit (admin/accounting - no balance_history)
 * Use this for deposits NOT from bank transfers
 */
async function processManualDeposit(db, phone, amount, source, referenceId, note, customerId = null, createdBy = null) {
    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.DEPOSIT,
        phone,
        amount,
        source: source || WALLET_SOURCES.MANUAL_ADJUSTMENT,
        referenceType: 'manual',
        referenceId: referenceId || 'admin',
        note: note || 'Nạp tiền thủ công',
        customerId,
        createdBy
    });
}

/**
 * Process withdrawal / payment
 */
async function processWithdrawal(db, phone, amount, referenceType, referenceId, note) {
    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.WITHDRAW,
        phone,
        amount,
        source: WALLET_SOURCES.ORDER_PAYMENT,
        referenceType,
        referenceId,
        note
    });
}

/**
 * Issue virtual credit (from ticket completion)
 * Note: Does NOT create wallet_transaction due to type constraint
 * Only creates virtual_credits record and updates wallet virtual_balance
 */
async function issueVirtualCredit(db, phone, amount, ticketId, reason, expiresInDays = 30, createdBy = null) {
    console.log(`[WALLET-PROCESSOR] issueVirtualCredit called: phone=${phone}, amount=${amount}, ticketId=${ticketId}, expiresInDays=${expiresInDays}`);

    const isPool = db && typeof db.connect === 'function';
    const runner = isPool
        ? (fn) => withTransaction(db, fn)
        : (fn) => fn(db);

    try {
        return await runner(async (client) => {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);

            const wallet = await getOrCreateWallet(client, phone);
            console.log(`[WALLET-PROCESSOR] Wallet obtained: id=${wallet.id}`);

            const insertResult = await client.query(`
                INSERT INTO virtual_credits (
                    phone, wallet_id, original_amount, remaining_amount,
                    expires_at, source_type, source_id, note, status
                )
                VALUES ($1, $2, $3, $3, $4, 'RETURN_SHIPPER', $5, $6, 'ACTIVE')
                RETURNING id
            `, [phone, wallet.id, amount, expiresAt, ticketId, reason]);
            const virtualCreditId = insertResult.rows[0].id;

            const newVirtualBalance = parseFloat(wallet.virtual_balance || 0) + parseFloat(amount);
            const newTotalVirtualIssued = parseFloat(wallet.total_virtual_issued || 0) + parseFloat(amount);

            const updateResult = await client.query(`
                UPDATE customer_wallets
                SET virtual_balance = $2,
                    total_virtual_issued = $3,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `, [wallet.id, newVirtualBalance, newTotalVirtualIssued]);

            await client.query(`
                INSERT INTO wallet_transactions (
                    phone, wallet_id, type, amount,
                    balance_before, balance_after,
                    virtual_balance_before, virtual_balance_after,
                    source, reference_type, reference_id, note, created_by
                ) VALUES ($1, $2, 'VIRTUAL_CREDIT', $3, $4, $4, $5, $6,
                    'VIRTUAL_CREDIT_ISSUE', 'virtual_credit', $7, $8, $9)
            `, [
                phone, wallet.id, amount,
                parseFloat(wallet.balance || 0),
                parseFloat(wallet.virtual_balance || 0),
                newVirtualBalance,
                String(virtualCreditId),
                reason,
                createdBy
            ]);

            const updatedWallet = updateResult.rows[0];
            console.log(`[WALLET-PROCESSOR] ✅ Virtual credit issued successfully: ${phone} +${amount}đ (virtual_balance: ${newVirtualBalance})`);

            const eventData = {
                phone,
                wallet: updatedWallet,
                transaction: {
                    type: 'VIRTUAL_CREDIT',
                    amount: parseFloat(amount),
                    source: 'VIRTUAL_CREDIT_ISSUE',
                    referenceType: 'virtual_credit',
                    referenceId: String(virtualCreditId),
                    note: reason
                },
                timestamp: new Date().toISOString()
            };
            walletEvents.emit('wallet:update', eventData);
            walletEvents.emit(`wallet:${phone}`, eventData);

            return {
                success: true,
                virtual_credit_id: virtualCreditId,
                wallet: updatedWallet,
                virtualCredit: {
                    id: virtualCreditId,
                    amount,
                    expiresAt,
                    ticketId,
                    reason
                }
            };
        });
    } catch (error) {
        console.error(`[WALLET-PROCESSOR] issueVirtualCredit FAILED:`, error.message);
        throw error;
    }
}

/**
 * Use virtual credit (FIFO)
 */
async function useVirtualCredit(db, phone, amount, referenceType, referenceId, note) {
    // TODO: Implement FIFO credit usage
    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.VIRTUAL_CREDIT_USED,
        phone,
        amount,
        source: WALLET_SOURCES.ORDER_PAYMENT,
        referenceType,
        referenceId,
        note
    });
}

/**
 * Manual adjustment
 */
async function processAdjustment(db, phone, amount, note, adminId = null) {
    return processWalletEvent(db, {
        type: WALLET_EVENT_TYPES.ADJUSTMENT,
        phone,
        amount, // Can be positive or negative
        source: WALLET_SOURCES.MANUAL_ADJUSTMENT,
        referenceType: 'manual',
        referenceId: adminId || 'system',
        note
    });
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Get wallet balance for a phone
 */
async function getWalletBalance(db, phone) {
    const result = await db.query(`
        SELECT id, phone, balance, virtual_balance,
               total_deposited, total_withdrawn
        FROM customer_wallets
        WHERE phone = $1
    `, [phone]);

    if (result.rows.length === 0) {
        return {
            balance: 0,
            virtual_balance: 0,
            total_balance: 0,
            exists: false
        };
    }

    const wallet = result.rows[0];
    return {
        ...wallet,
        total_balance: parseFloat(wallet.balance) + parseFloat(wallet.virtual_balance),
        exists: true
    };
}

/**
 * Get recent transactions for a phone
 */
async function getRecentTransactions(db, phone, limit = 10) {
    const result = await db.query(`
        SELECT id, type, amount, balance_after, virtual_balance_after,
               source, reference_type, reference_id, note, created_at
        FROM wallet_transactions
        WHERE phone = $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [phone, limit]);

    return result.rows;
}

module.exports = {
    // Event emitter
    walletEvents,

    // Constants
    WALLET_EVENT_TYPES,
    WALLET_SOURCES,

    // Main processor
    processWalletEvent,

    // Specialized functions
    processDeposit,
    processManualDeposit,
    processWithdrawal,
    issueVirtualCredit,
    useVirtualCredit,
    processAdjustment,

    // Utility functions
    getOrCreateWallet,
    getWalletBalance,
    getRecentTransactions
};
