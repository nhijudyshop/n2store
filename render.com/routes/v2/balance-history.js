/**
 * =====================================================
 * API V2 - BALANCE HISTORY ROUTES
 * =====================================================
 *
 * Bank transaction linking endpoints
 *
 * Routes:
 *   GET    /              - List unlinked transactions
 *   GET    /pending       - Get pending customer matches
 *   POST   /:id/link      - Link transaction to customer
 *   POST   /webhook/sepay - SePay webhook (redirect to main handler)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');
const { searchCustomerByPhone } = require('../../services/tpos-customer-service');
const { getOrCreateCustomerFromTPOS } = require('../../services/customer-creation-service');
const { processDeposit } = require('../../services/wallet-event-processor');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[BalanceHistory V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/balance-history
 * List unlinked bank transactions (balance_history without linked customer)
 */
router.get('/', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 20, linked } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        // Build query based on linked filter
        let whereClause = '';
        if (linked === 'true') {
            whereClause = 'WHERE bh.linked_customer_phone IS NOT NULL';
        } else if (linked === 'false' || linked === undefined) {
            whereClause = `
                WHERE bh.linked_customer_phone IS NULL
                  AND bh.transfer_amount > 0
                  AND bh.transfer_type = 'in'
            `;
        }

        // Get total count
        const countResult = await db.query(`
            SELECT COUNT(*) as total FROM balance_history bh ${whereClause}
        `);
        const total = parseInt(countResult.rows[0].total);

        // Get transactions with pagination
        const result = await db.query(`
            SELECT
                bh.id,
                bh.sepay_id,
                bh.code as transaction_code,
                bh.content,
                bh.transfer_amount as amount,
                bh.description,
                bh.transaction_date,
                bh.account_number as bank_account,
                bh.reference_code,
                bh.linked_customer_phone,
                bh.customer_id,
                bh.wallet_processed,
                bh.created_at,
                c.name as customer_name
            FROM balance_history bh
            LEFT JOIN customers c ON bh.customer_id = c.id
            ${whereClause}
            ORDER BY bh.transaction_date DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), offset]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch transactions');
    }
});

/**
 * GET /api/v2/balance-history/pending
 * Get pending customer matches
 */
router.get('/pending', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { page = 1, limit = 20 } = req.query;

    try {
        // Get total count
        const countResult = await db.query('SELECT COUNT(*) as total FROM pending_customer_matches');
        const total = parseInt(countResult.rows[0].total);

        // Get pending matches
        const result = await db.query(`
            SELECT
                pcm.*,
                bh.transfer_amount as amount,
                bh.content as transaction_content,
                bh.transaction_date
            FROM pending_customer_matches pcm
            LEFT JOIN balance_history bh ON pcm.balance_history_id = bh.id
            ORDER BY pcm.created_at DESC
            LIMIT $1 OFFSET $2
        `, [parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch pending matches');
    }
});

/**
 * POST /api/v2/balance-history/:id/link
 * Link a balance_history transaction to a customer
 * NEW: Fetches TPOS data and creates customer with full info
 */
router.post('/:id/link', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { phone, customer_name, auto_deposit = true } = req.body; // Default auto_deposit to true

    if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone is required' });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        // Check if already linked
        if (tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                error: 'Transaction already linked',
                linked_to: tx.linked_customer_phone
            });
        }

        // 2. NEW: Fetch TPOS data for customer creation
        let tposData = null;
        let customerName = customer_name;

        try {
            const tposResult = await searchCustomerByPhone(normalizedPhone);
            if (tposResult.success && tposResult.customer) {
                tposData = tposResult.customer;
                customerName = tposData.name || customerName || tx.content;
                console.log(`[BalanceHistory V2] Got TPOS data: ${tposData.name} (ID: ${tposData.id})`);
            }
        } catch (e) {
            console.log('[BalanceHistory V2] TPOS fetch failed, using provided name:', e.message);
        }

        // If no TPOS data and customer_name provided, use it
        if (!tposData && customerName) {
            tposData = { name: customerName };
        }

        // 3. Create/update customer with full TPOS data
        const customerResult = await getOrCreateCustomerFromTPOS(db, normalizedPhone, tposData);
        const customerId = customerResult.customerId;
        console.log(`[BalanceHistory V2] Customer ${customerResult.created ? 'created' : 'found'}: ID ${customerId}`);

        // 4. Link transaction to customer
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = $1,
                customer_id = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [normalizedPhone, customerId, id]);

        // 5. Process wallet deposit using wallet-event-processor
        let depositResult = null;
        if (auto_deposit && tx.transfer_amount > 0) {
            try {
                const walletResult = await processDeposit(
                    db,
                    normalizedPhone,
                    tx.transfer_amount,
                    id,
                    `Nạp từ CK ${tx.code || tx.reference_code} (manual link)`,
                    customerId
                );

                // Mark balance_history as wallet processed
                await db.query(`
                    UPDATE balance_history
                    SET wallet_processed = TRUE
                    WHERE id = $1
                `, [id]);

                // Log activity
                await db.query(`
                    INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
                    VALUES ($1, $2, 'WALLET_DEPOSIT', $3, $4, 'balance_history', $5, 'university', 'green')
                `, [
                    normalizedPhone, customerId,
                    `Nạp tiền: ${parseFloat(tx.transfer_amount).toLocaleString()}đ`,
                    `Chuyển khoản ngân hàng (${tx.code || tx.reference_code})`,
                    id
                ]);

                depositResult = {
                    deposited: true,
                    amount: parseFloat(tx.transfer_amount),
                    wallet_tx_id: walletResult.transactionId,
                    newBalance: walletResult.wallet.balance
                };

                console.log(`[BalanceHistory V2] ✅ Wallet updated: TX ${walletResult.transactionId}`);
            } catch (walletErr) {
                console.error('[BalanceHistory V2] Wallet update failed:', walletErr.message);
                depositResult = {
                    deposited: false,
                    error: walletErr.message
                };
            }
        }

        // Remove from pending matches if exists
        await db.query('DELETE FROM pending_customer_matches WHERE balance_history_id = $1', [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã liên kết giao dịch với khách hàng',
            data: {
                transaction_id: id,
                customer_id: customerId,
                customer_name: customerResult.customerName || customerName,
                phone: normalizedPhone,
                tpos_id: tposData?.id || null,
                deposit: depositResult
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to link transaction');
    }
});

/**
 * POST /api/v2/balance-history/:id/unlink
 * Unlink a transaction from customer (for corrections)
 */
router.post('/:id/unlink', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        await db.query('BEGIN');

        // Get transaction
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        if (!tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Transaction is not linked to any customer' });
        }

        // If wallet was processed, need to reverse the deposit
        if (tx.wallet_processed && tx.transfer_amount > 0) {
            await db.query(`
                UPDATE customer_wallets
                SET balance = balance - $2, total_deposited = total_deposited - $2, updated_at = NOW()
                WHERE phone = $1
            `, [tx.linked_customer_phone, tx.transfer_amount]);

            // Log reversal transaction
            await db.query(`
                INSERT INTO wallet_transactions (
                    phone, type, amount, source, reference_type, reference_id, note
                )
                VALUES ($1, 'ADJUSTMENT', $2, 'MANUAL_ADJUSTMENT', 'balance_history', $3, $4)
            `, [
                tx.linked_customer_phone, -tx.transfer_amount, id,
                `Hoàn tác liên kết giao dịch ${tx.code || tx.reference_code}`
            ]);
        }

        // Unlink transaction
        await db.query(`
            UPDATE balance_history
            SET linked_customer_phone = NULL,
                customer_id = NULL,
                wallet_processed = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'Đã hủy liên kết giao dịch',
            data: {
                transaction_id: id,
                previous_phone: tx.linked_customer_phone,
                reversed_amount: tx.wallet_processed ? tx.transfer_amount : 0
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to unlink transaction');
    }
});

/**
 * POST /api/v2/balance-history/:id/adjust
 * Manual adjustment for accountant corrections
 * Use cases:
 *   - Wrong amount: Bank sent 815k but should be 850k → adjust +35k
 *   - Duplicate fix: Remove extra amount → adjust -815k
 *   - Refund: Customer requests refund → adjust -amount
 */
router.post('/:id/adjust', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;
    const { adjustment_amount, reason, adjusted_by } = req.body;

    if (adjustment_amount === undefined || adjustment_amount === 0) {
        return res.status(400).json({ success: false, error: 'adjustment_amount is required and cannot be 0' });
    }

    if (!reason) {
        return res.status(400).json({ success: false, error: 'reason is required for audit trail' });
    }

    try {
        await db.query('BEGIN');

        // 1. Get transaction and verify it's linked
        const txResult = await db.query(
            'SELECT * FROM balance_history WHERE id = $1 FOR UPDATE',
            [parseInt(id)]
        );

        if (txResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const tx = txResult.rows[0];

        if (!tx.linked_customer_phone) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Transaction is not linked to any customer' });
        }

        // 2. Get current wallet
        const walletResult = await db.query(
            'SELECT * FROM customer_wallets WHERE phone = $1 FOR UPDATE',
            [tx.linked_customer_phone]
        );

        if (walletResult.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Wallet not found for this customer' });
        }

        const wallet = walletResult.rows[0];
        const adjustmentNum = parseFloat(adjustment_amount);
        const newBalance = parseFloat(wallet.balance) + adjustmentNum;

        // 3. Update wallet balance
        await db.query(`
            UPDATE customer_wallets
            SET balance = $1, updated_at = NOW()
            WHERE phone = $2
        `, [newBalance, tx.linked_customer_phone]);

        // 4. Create adjustment transaction record
        // Note: This uses 'adjustment' as reference_type (not 'balance_history')
        // so it won't conflict with the UNIQUE constraint
        const adjTxResult = await db.query(`
            INSERT INTO wallet_transactions (
                phone, wallet_id, type, amount,
                balance_before, balance_after,
                source, reference_type, reference_id, note
            )
            VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, 'MANUAL_ADJUSTMENT', 'adjustment', $6, $7)
            RETURNING id
        `, [
            tx.linked_customer_phone,
            wallet.id,
            adjustmentNum,
            wallet.balance,
            newBalance,
            `bh_${id}_adj_${Date.now()}`, // Unique reference for adjustment
            `[${adjusted_by || 'admin'}] ${reason} (BH #${id})`
        ]);

        // 5. Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, customer_id, activity_type, title, description, reference_type, reference_id, icon, color)
            VALUES ($1, $2, 'WALLET_ADJUSTMENT', $3, $4, 'wallet_transaction', $5, 'edit', $6)
        `, [
            tx.linked_customer_phone,
            tx.customer_id,
            `Điều chỉnh: ${adjustmentNum > 0 ? '+' : ''}${adjustmentNum.toLocaleString()}đ`,
            `${reason} (bởi ${adjusted_by || 'admin'})`,
            adjTxResult.rows[0].id,
            adjustmentNum > 0 ? 'blue' : 'orange'
        ]);

        await db.query('COMMIT');

        console.log(`[BalanceHistory V2] ✅ Adjustment: ${tx.linked_customer_phone} ${adjustmentNum > 0 ? '+' : ''}${adjustmentNum} (reason: ${reason})`);

        res.json({
            success: true,
            message: 'Đã điều chỉnh số dư ví',
            data: {
                transaction_id: id,
                phone: tx.linked_customer_phone,
                adjustment_amount: adjustmentNum,
                balance_before: parseFloat(wallet.balance),
                balance_after: newBalance,
                adjustment_tx_id: adjTxResult.rows[0].id,
                reason,
                adjusted_by: adjusted_by || 'admin'
            }
        });

    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to adjust transaction');
    }
});

/**
 * GET /api/v2/balance-history/stats
 * Get balance history statistics
 */
router.get('/stats', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query(`
            SELECT
                COUNT(*) as total_transactions,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NOT NULL) as linked_count,
                COUNT(*) FILTER (WHERE linked_customer_phone IS NULL AND transfer_type = 'in') as unlinked_count,
                COUNT(*) FILTER (WHERE wallet_processed = TRUE) as processed_to_wallet,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'in'), 0) as total_in,
                COALESCE(SUM(transfer_amount) FILTER (WHERE transfer_type = 'out'), 0) as total_out,
                COALESCE(SUM(transfer_amount) FILTER (WHERE wallet_processed = TRUE), 0) as total_processed_to_wallet
            FROM balance_history
        `);

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        handleError(res, error, 'Failed to fetch balance history stats');
    }
});

module.exports = router;
