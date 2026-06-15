// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2WalletService — Wallet operations cho Web 2.0
// =====================================================================
// Tách hoàn toàn khỏi services/wallet-event-processor.js (Web 1).
// Ghi trực tiếp vào web2_customer_wallets + web2_wallet_transactions.
//
// Policy Web 2.0:
//   • KHÔNG có virtual wallet (virtual_balance luôn = 0 ở web2_*)
//   • Mọi DEPOSIT đều tính là tiền thật, cộng vào balance
//   • KHÔNG cần kế toán duyệt
//   • Idempotent qua sepay_id (DEPOSIT từ SePay) hoặc reference_id
//
// API public:
//   • getOrCreateWallet(client, phone, customerId)
//   • processDeposit(db, phone, amount, sourceId, note, customerId, txDate, sepayId)
//   • processWithdraw(db, phone, amount, referenceType, referenceId, note)
//   • getWallet(db, phone)
//   • listTransactions(db, phone, opts)
//
// Event emit: web2WalletEvents.emit('web2:wallet:update', { phone, wallet, transaction })
// =====================================================================

const { EventEmitter } = require('events');
const { withTransaction } = require('../db/with-transaction');

const web2WalletEvents = new EventEmitter();
// Tăng max listeners — realtime SSE + bất kỳ subscriber nào khác
web2WalletEvents.setMaxListeners(100);

// =============================================================
// Constants
// =============================================================
const WEB2_TX_TYPES = Object.freeze({
    DEPOSIT: 'DEPOSIT',
    WITHDRAW: 'WITHDRAW',
    ADJUSTMENT: 'ADJUSTMENT',
});

const WEB2_SOURCES = Object.freeze({
    BANK_TRANSFER: 'BANK_TRANSFER', // CK SePay
    MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT', // Admin chỉnh tay
    REFUND: 'REFUND', // Hoàn tiền từ ticket Khách Gửi
    ORDER_PAYMENT: 'ORDER_PAYMENT', // KH trả tiền khi mua đơn
});

// =============================================================
// Internal helpers
// =============================================================
function normalizePhone(phone) {
    if (!phone) return '';
    const s = String(phone).replace(/\D/g, '');
    if (!s) return '';
    if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
    return s;
}

/**
 * Get-or-create wallet với UPSERT atomic.
 * @param {Object} client - pg client (đang trong transaction)
 * @param {string} phone
 * @param {number|null} customerId
 * @returns {Promise<Object>} wallet row
 */
async function getOrCreateWallet(client, phone, customerId = null) {
    const normPhone = normalizePhone(phone);
    if (!normPhone) throw new Error('Phone không hợp lệ');

    const existing = await client.query(
        `SELECT id, phone, customer_id, balance, virtual_balance,
                total_deposited, total_withdrawn, created_at, updated_at
         FROM web2_customer_wallets
         WHERE phone = $1`,
        [normPhone]
    );
    if (existing.rows.length > 0) {
        // Cập nhật customer_id nếu trước đây null + giờ có
        if (customerId && !existing.rows[0].customer_id) {
            await client.query(
                `UPDATE web2_customer_wallets SET customer_id = $1, updated_at = NOW() WHERE id = $2`,
                [customerId, existing.rows[0].id]
            );
            existing.rows[0].customer_id = customerId;
        }
        return existing.rows[0];
    }

    const inserted = await client.query(
        `INSERT INTO web2_customer_wallets (phone, customer_id, balance, virtual_balance, created_at, updated_at)
         VALUES ($1, $2, 0, 0, NOW(), NOW())
         ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
         RETURNING id, phone, customer_id, balance, virtual_balance,
                   total_deposited, total_withdrawn, created_at, updated_at`,
        [normPhone, customerId]
    );
    return inserted.rows[0];
}

/**
 * Helper to detect pg pool vs pg client.
 * Pool có .connect; PoolClient cũng có .connect VÀ .release.
 */
function runWithTx(db, fn) {
    const isClient = !!(db && typeof db.release === 'function');
    if (isClient) {
        // Already a client — caller manages transaction
        return fn(db);
    }
    if (db && typeof db.connect === 'function') {
        return withTransaction(db, fn);
    }
    throw new Error('runWithTx: invalid db argument');
}

/**
 * Emit wallet event SAU khi transaction COMMIT thật xong (tránh stale-read
 * race). Nếu `client` đến từ withTransaction (có queue `_afterCommit`) → đăng ký
 * hook chạy post-COMMIT. Nếu không (client thô / pool) → fallback process.nextTick
 * (best-effort, hành vi legacy). Mọi caller wallet-service hiện đi qua
 * withTransaction nên đường hook là đường chính.
 */
function emitAfterCommit(client, normPhone, payload) {
    const doEmit = () => {
        try {
            web2WalletEvents.emit('web2:wallet:update', payload);
            web2WalletEvents.emit(`web2:wallet:${normPhone}`, payload);
        } catch (e) {
            console.warn('[Web2WalletService] emit failed:', e.message);
        }
    };
    if (client && Array.isArray(client._afterCommit)) {
        client._afterCommit.push(doEmit);
    } else {
        process.nextTick(doEmit);
    }
}

// =============================================================
// Public API
// =============================================================

/**
 * Process deposit (tiền thật vào ví). Idempotent qua sepayId.
 *
 * @param {Pool|Client} db
 * @param {string} phone
 * @param {number} amount - VND
 * @param {string|number|null} sourceId - reference id (vd transaction_id từ balance_history)
 * @param {string} note
 * @param {number|null} customerId
 * @param {Date|null} txDate - thời điểm GD gốc (optional, default NOW)
 * @param {string|null} sepayId - SePay transaction ID (idempotency key)
 * @returns {Promise<{wallet: Object, transaction: Object, alreadyProcessed: boolean}>}
 */
async function processDeposit(
    db,
    phone,
    amount,
    sourceId,
    note,
    customerId,
    txDate,
    sepayId,
    performedBy = null
) {
    const normPhone = normalizePhone(phone);
    if (!normPhone) throw new Error('Phone không hợp lệ');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error('Amount phải > 0');
    }

    const _runDeposit = () =>
        runWithTx(db, async (client) => {
            // 1. Idempotency: skip nếu sepayId đã có tx
            if (sepayId) {
                const dup = await client.query(
                    `SELECT id, phone, amount FROM web2_wallet_transactions
                 WHERE reference_type = 'sepay' AND reference_id = $1
                 LIMIT 1`,
                    [String(sepayId)]
                );
                if (dup.rows.length > 0) {
                    const wallet = await client.query(
                        `SELECT * FROM web2_customer_wallets WHERE phone = $1`,
                        [normPhone]
                    );
                    return {
                        wallet: wallet.rows[0],
                        transaction: dup.rows[0],
                        alreadyProcessed: true,
                    };
                }
            }

            // 2. Get-or-create wallet + LOCK row
            await getOrCreateWallet(client, normPhone, customerId);
            const lockResult = await client.query(
                `SELECT id, phone, customer_id, balance, virtual_balance,
                    total_deposited, total_withdrawn
             FROM web2_customer_wallets
             WHERE phone = $1
             FOR UPDATE`,
                [normPhone]
            );
            if (lockResult.rows.length === 0) {
                throw new Error(`Wallet for ${normPhone} disappeared`);
            }
            const wallet = lockResult.rows[0];

            // 3. Compute new balance
            const balanceBefore = parseFloat(wallet.balance) || 0;
            const balanceAfter = balanceBefore + amt;
            const totalDeposited = (parseFloat(wallet.total_deposited) || 0) + amt;

            // 4. INSERT transaction (performed_by: audit ai/hệ thống cộng ví)
            const txInsert = await client.query(
                `INSERT INTO web2_wallet_transactions (
                phone, customer_id, type, amount,
                balance_before, balance_after,
                virtual_balance_before, virtual_balance_after,
                source, reference_type, reference_id, note, performed_by, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
             RETURNING *`,
                [
                    normPhone,
                    wallet.customer_id || customerId,
                    WEB2_TX_TYPES.DEPOSIT,
                    amt,
                    balanceBefore,
                    balanceAfter,
                    sepayId ? WEB2_SOURCES.BANK_TRANSFER : WEB2_SOURCES.MANUAL_ADJUSTMENT,
                    sepayId ? 'sepay' : sourceId ? 'balance_history' : 'manual',
                    sepayId ? String(sepayId) : sourceId ? String(sourceId) : null,
                    note || null,
                    performedBy || null,
                    txDate || null,
                ]
            );

            // 5. UPDATE wallet balance
            const walletUpdate = await client.query(
                `UPDATE web2_customer_wallets
             SET balance = $1, total_deposited = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
                [balanceAfter, totalDeposited, wallet.id]
            );

            const result = {
                wallet: walletUpdate.rows[0],
                transaction: txInsert.rows[0],
                alreadyProcessed: false,
            };

            // 6. Emit event SAU khi COMMIT thật (qua _afterCommit hook — tránh
            // stale-read race; caller có thể đang trong outer txn).
            emitAfterCommit(client, normPhone, {
                phone: normPhone,
                wallet: result.wallet,
                transaction: result.transaction,
                type: 'deposit',
                ts: Date.now(),
            });

            return result;
        });

    try {
        return await _runDeposit();
    } catch (e) {
        // Thua race trên idx_web2_wallet_tx_unique_sepay → path khác (webhook/
        // cron/reload) đã cộng đúng GD bank này rồi. Re-query & trả
        // alreadyProcessed thay vì cộng trùng. Chỉ recover khi db là Pool —
        // nếu là client trong tx của caller, tx đã abort, không re-query được.
        const isClient = !!(db && typeof db.release === 'function');
        if (sepayId && !isClient && e && e.code === '23505') {
            const dupTx = await db.query(
                `SELECT id, phone, amount FROM web2_wallet_transactions
                 WHERE reference_type = 'sepay' AND reference_id = $1
                 LIMIT 1`,
                [String(sepayId)]
            );
            if (dupTx.rows.length > 0) {
                const w = await db.query(`SELECT * FROM web2_customer_wallets WHERE phone = $1`, [
                    normPhone,
                ]);
                console.warn(
                    `[Web2WalletService] tránh double-credit (race) sepay_id=${sepayId} — đã có tx #${dupTx.rows[0].id}`
                );
                return {
                    wallet: w.rows[0],
                    transaction: dupTx.rows[0],
                    alreadyProcessed: true,
                };
            }
        }
        throw e;
    }
}

/**
 * Withdraw from wallet. Throws if insufficient balance.
 */
async function processWithdraw(
    db,
    phone,
    amount,
    referenceType,
    referenceId,
    note,
    performedBy = null
) {
    const normPhone = normalizePhone(phone);
    if (!normPhone) throw new Error('Phone không hợp lệ');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error('Amount phải > 0');
    }

    return runWithTx(db, async (client) => {
        await getOrCreateWallet(client, normPhone, null);
        const lockResult = await client.query(
            `SELECT id, phone, customer_id, balance, virtual_balance,
                    total_deposited, total_withdrawn
             FROM web2_customer_wallets WHERE phone = $1 FOR UPDATE`,
            [normPhone]
        );
        const wallet = lockResult.rows[0];
        if (!wallet) throw new Error(`Wallet ${normPhone} not found`);

        const balanceBefore = parseFloat(wallet.balance) || 0;
        if (balanceBefore < amt) {
            throw new Error(`Số dư không đủ (${balanceBefore} < ${amt})`);
        }
        const balanceAfter = balanceBefore - amt;
        const totalWithdrawn = (parseFloat(wallet.total_withdrawn) || 0) + amt;

        const txInsert = await client.query(
            `INSERT INTO web2_wallet_transactions (
                phone, customer_id, type, amount,
                balance_before, balance_after,
                virtual_balance_before, virtual_balance_after,
                source, reference_type, reference_id, note, performed_by, created_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, NOW())
             RETURNING *`,
            [
                normPhone,
                wallet.customer_id,
                WEB2_TX_TYPES.WITHDRAW,
                amt,
                balanceBefore,
                balanceAfter,
                WEB2_SOURCES.ORDER_PAYMENT,
                referenceType || 'manual',
                referenceId ? String(referenceId) : null,
                note || null,
                performedBy || null,
            ]
        );

        const walletUpdate = await client.query(
            `UPDATE web2_customer_wallets
             SET balance = $1, total_withdrawn = $2, updated_at = NOW()
             WHERE id = $3 RETURNING *`,
            [balanceAfter, totalWithdrawn, wallet.id]
        );

        const result = {
            wallet: walletUpdate.rows[0],
            transaction: txInsert.rows[0],
        };

        emitAfterCommit(client, normPhone, {
            phone: normPhone,
            wallet: result.wallet,
            transaction: result.transaction,
            type: 'withdraw',
            ts: Date.now(),
        });

        return result;
    });
}

async function getWallet(db, phone) {
    const normPhone = normalizePhone(phone);
    if (!normPhone) return null;
    const r = await db.query(
        `SELECT id, phone, customer_id, balance, virtual_balance,
                total_deposited, total_withdrawn, created_at, updated_at
         FROM web2_customer_wallets WHERE phone = $1`,
        [normPhone]
    );
    return r.rows[0] || null;
}

// Batch: full wallet rows cho nhiều SĐT trong 1 query (chống N+1 /by-phone).
// Trả { [phone]: walletRow }. SĐT chưa có ví → vắng mặt.
async function getWalletsByPhones(db, phones) {
    const norm = [...new Set((phones || []).map(normalizePhone).filter(Boolean))].slice(0, 500);
    if (!norm.length) return {};
    const r = await db.query(
        `SELECT id, phone, customer_id, balance, virtual_balance,
                total_deposited, total_withdrawn, created_at, updated_at
         FROM web2_customer_wallets WHERE phone = ANY($1::text[])`,
        [norm]
    );
    const map = {};
    for (const row of r.rows) map[row.phone] = row;
    return map;
}

async function listWallets(db, opts) {
    const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 1000);
    const offset = Math.max(Number(opts?.offset) || 0, 0);
    const r = await db.query(
        `SELECT id, phone, customer_id, balance, virtual_balance,
                total_deposited, total_withdrawn, created_at, updated_at
         FROM web2_customer_wallets
         ORDER BY balance DESC, updated_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
    const c = await db.query(`SELECT COUNT(*) AS n FROM web2_customer_wallets`);
    return { items: r.rows, total: Number(c.rows[0].n) || 0 };
}

async function listTransactions(db, phone, opts) {
    const normPhone = normalizePhone(phone);
    const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 1000);
    const params = [];
    const where = [];
    if (normPhone) {
        params.push(normPhone);
        where.push(`phone = $${params.length}`);
    }
    if (opts?.type) {
        params.push(opts.type);
        where.push(`type = $${params.length}`);
    }
    const sql = `SELECT * FROM web2_wallet_transactions
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC
                 LIMIT ${limit}`;
    const r = await db.query(sql, params);
    return r.rows;
}

module.exports = {
    web2WalletEvents,
    WEB2_TX_TYPES,
    WEB2_SOURCES,
    normalizePhone,
    getOrCreateWallet,
    processDeposit,
    processWithdraw,
    getWallet,
    getWalletsByPhones,
    listWallets,
    listTransactions,
};
