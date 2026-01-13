/**
 * =====================================================
 * API V2 - WALLETS ROUTES
 * =====================================================
 *
 * Wallet management endpoints
 *
 * Routes:
 *   GET    /:customerId              - Get wallet summary
 *   POST   /:customerId/deposit      - Add real balance
 *   POST   /:customerId/credit       - Add virtual credit
 *   POST   /:customerId/withdraw     - FIFO withdrawal
 *   GET    /:customerId/transactions - Transaction history
 *   POST   /batch-summary            - Batch wallet lookup
 *   POST   /cron/expire              - Expire virtual credits (cron)
 *   POST   /cron/process-bank        - Process bank transactions (cron)
 *
 * Created: 2026-01-12
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const { normalizePhone } = require('../../utils/customer-helpers');
const { processManualDeposit, issueVirtualCredit } = require('../../services/wallet-event-processor');

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function handleError(res, error, message = 'Internal server error') {
    console.error(`[Wallets V2] ${message}:`, error.message);
    res.status(500).json({ success: false, error: message, details: error.message });
}

// Helper to get customer phone from ID or phone
async function getCustomerPhone(db, customerId) {
    const isPhone = /^0\d{9}$/.test(customerId) || /^\d{10,11}$/.test(customerId);
    if (isPhone) {
        return normalizePhone(customerId);
    }

    const result = await db.query('SELECT phone FROM customers WHERE id = $1', [parseInt(customerId)]);
    return result.rows[0]?.phone || null;
}

// =====================================================
// ROUTES
// =====================================================

/**
 * GET /api/v2/wallets/:customerId
 * Get wallet summary with active virtual credits
 */
router.get('/:customerId', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        const walletResult = await db.query(`
            SELECT * FROM customer_wallets WHERE phone = $1
        `, [phone]);

        if (walletResult.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    phone,
                    balance: 0,
                    virtualBalance: 0,
                    total: 0,
                    virtualCredits: []
                }
            });
        }

        const wallet = walletResult.rows[0];

        // Get active virtual credits
        const creditsResult = await db.query(`
            SELECT id, original_amount, remaining_amount, issued_at, expires_at, status, source_type, source_id
            FROM virtual_credits
            WHERE phone = $1 AND status = 'ACTIVE' AND expires_at > NOW()
            ORDER BY expires_at ASC
        `, [phone]);

        res.json({
            success: true,
            data: {
                ...wallet,
                total: parseFloat(wallet.balance) + parseFloat(wallet.virtual_balance),
                virtualCredits: creditsResult.rows
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet');
    }
});

/**
 * POST /api/v2/wallets/:customerId/deposit
 * Deposit to wallet (real balance)
 */
router.post('/:customerId/deposit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, source, reference_id, note, created_by } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Get customer ID if available
        const customerResult = await db.query('SELECT id FROM customers WHERE phone = $1', [phone]);
        const customerIdNum = customerResult.rows[0]?.id || null;

        // Use centralized wallet-event-processor for consistency and SSE
        const result = await processManualDeposit(
            db,
            phone,
            amount,
            source || 'MANUAL_ADJUSTMENT',
            reference_id || created_by || 'admin',
            note || 'Nạp tiền thủ công',
            customerIdNum
        );

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
            VALUES ($1, 'WALLET_DEPOSIT', $2, $3, 'dollar-sign', 'green')
        `, [phone, `Nạp tiền: ${parseFloat(amount).toLocaleString()}đ`, note || '']);

        res.json({
            success: true,
            data: {
                phone,
                deposited: parseFloat(amount),
                previousBalance: result.wallet.balance - parseFloat(amount),
                newBalance: result.wallet.balance,
                transactionId: result.transactionId
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to deposit to wallet');
    }
});

/**
 * POST /api/v2/wallets/:customerId/credit
 * Issue virtual credit
 */
router.post('/:customerId/credit', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, source_type, source_id, expiry_days = 15, note, created_by } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Use centralized wallet-event-processor for consistency and SSE
        const result = await issueVirtualCredit(
            db,
            phone,
            amount,
            source_id || created_by || 'admin',
            note || `Cấp công nợ ảo (${source_type || 'ADMIN'})`,
            expiry_days
        );

        // Calculate expiry for response
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiry_days);

        // Log activity
        await db.query(`
            INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
            VALUES ($1, 'WALLET_VIRTUAL_CREDIT', $2, $3, 'gift', 'purple')
        `, [phone, `Cấp công nợ ảo: ${parseFloat(amount).toLocaleString()}đ`, `Hết hạn: ${expiresAt.toLocaleDateString('vi-VN')}`]);

        res.json({
            success: true,
            data: {
                phone,
                amount: parseFloat(amount),
                newVirtualBalance: result.wallet.virtual_balance,
                expiresAt: expiresAt.toISOString(),
                transactionId: result.transactionId
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to issue virtual credit');
    }
});

/**
 * POST /api/v2/wallets/:customerId/withdraw
 * Withdraw from wallet (FIFO virtual credits first)
 */
router.post('/:customerId/withdraw', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { amount, order_id, note } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        // Use FIFO withdrawal function
        const result = await db.query(`
            SELECT * FROM wallet_withdraw_fifo($1, $2, $3, $4)
        `, [phone, amount, order_id || 'MANUAL', note]);

        const withdrawal = result.rows[0];

        if (!withdrawal.success) {
            return res.status(400).json({ success: false, error: withdrawal.error_message });
        }

        res.json({
            success: true,
            data: {
                phone,
                requested: parseFloat(amount),
                virtualUsed: parseFloat(withdrawal.virtual_used),
                realUsed: parseFloat(withdrawal.real_used),
                totalUsed: parseFloat(withdrawal.total_used),
                newBalance: parseFloat(withdrawal.new_balance),
                newVirtualBalance: parseFloat(withdrawal.new_virtual_balance)
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to withdraw from wallet');
    }
});

/**
 * GET /api/v2/wallets/:customerId/transactions
 * Get wallet transaction history
 */
router.get('/:customerId/transactions', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { customerId } = req.params;
    const { page = 1, limit = 50, type } = req.query;

    try {
        const phone = await getCustomerPhone(db, customerId);
        if (!phone) {
            return res.status(404).json({ success: false, error: 'Customer not found' });
        }

        let query = 'SELECT * FROM wallet_transactions WHERE phone = $1';
        const params = [phone];

        if (type) {
            query += ' AND type = $2';
            params.push(type);
        }

        // Count total
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
        const countResult = await db.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count);

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

        const result = await db.query(query, params);

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
        handleError(res, error, 'Failed to fetch wallet transactions');
    }
});

/**
 * POST /api/v2/wallets/batch-summary
 * Get wallet summary for multiple customers
 */
router.post('/batch-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones, customer_ids } = req.body;

    if ((!phones || !Array.isArray(phones)) && (!customer_ids || !Array.isArray(customer_ids))) {
        return res.status(400).json({ success: false, error: 'phones or customer_ids array is required' });
    }

    try {
        let result;
        if (phones && phones.length > 0) {
            const normalizedPhones = phones.map(normalizePhone).filter(Boolean);
            result = await db.query(`
                SELECT phone, balance, virtual_balance, (balance + virtual_balance) as total
                FROM customer_wallets
                WHERE phone = ANY($1)
            `, [normalizedPhones]);
        } else {
            result = await db.query(`
                SELECT w.phone, w.balance, w.virtual_balance, (w.balance + w.virtual_balance) as total
                FROM customer_wallets w
                JOIN customers c ON w.customer_id = c.id
                WHERE c.id = ANY($1)
            `, [customer_ids.map(id => parseInt(id))]);
        }

        const walletMap = {};
        result.rows.forEach(row => {
            walletMap[row.phone] = {
                balance: parseFloat(row.balance),
                virtualBalance: parseFloat(row.virtual_balance),
                total: parseFloat(row.total)
            };
        });

        res.json({ success: true, data: walletMap });
    } catch (error) {
        handleError(res, error, 'Failed to fetch wallet batch summary');
    }
});

/**
 * POST /api/v2/wallets/cron/expire
 * Cron endpoint to expire virtual credits
 */
router.post('/cron/expire', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');

        res.json({
            success: true,
            data: {
                expiredCount: result.rows[0].expired_count,
                totalExpiredAmount: parseFloat(result.rows[0].total_expired_amount) || 0
            }
        });
    } catch (error) {
        handleError(res, error, 'Failed to expire virtual credits');
    }
});

/**
 * POST /api/v2/wallets/cron/process-bank
 * Process unprocessed bank transactions from balance_history
 */
router.post('/cron/process-bank', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { limit = 100 } = req.body;

    try {
        await db.query('BEGIN');

        // Get unprocessed bank transactions with linked customer
        const unprocessedResult = await db.query(`
            SELECT
                bh.id,
                bh.linked_customer_phone as phone,
                bh.transfer_amount as amount,
                bh.content as description,
                bh.transaction_date
            FROM balance_history bh
            WHERE bh.linked_customer_phone IS NOT NULL
              AND (bh.wallet_processed = FALSE OR bh.wallet_processed IS NULL)
              AND bh.transfer_amount > 0
              AND bh.transfer_type = 'in'
            ORDER BY bh.transaction_date ASC
            LIMIT $1
        `, [parseInt(limit)]);

        const processed = [];
        const errors = [];

        for (const tx of unprocessedResult.rows) {
            try {
                const normalizedPhone = normalizePhone(tx.phone);
                if (!normalizedPhone) {
                    errors.push({ id: tx.id, error: 'Invalid phone number' });
                    continue;
                }

                // Get or create wallet
                const walletResult = await db.query(`
                    INSERT INTO customer_wallets (phone, balance)
                    VALUES ($1, 0)
                    ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
                    RETURNING *
                `, [normalizedPhone]);

                const wallet = walletResult.rows[0];
                const newBalance = parseFloat(wallet.balance) + parseFloat(tx.amount);

                // Update wallet
                await db.query(`
                    UPDATE customer_wallets
                    SET balance = $2, total_deposited = total_deposited + $3, updated_at = NOW()
                    WHERE id = $1
                `, [wallet.id, newBalance, tx.amount]);

                // Log wallet transaction
                await db.query(`
                    INSERT INTO wallet_transactions
                    (phone, wallet_id, type, amount, balance_before, balance_after, source, reference_id, note)
                    VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'BANK_TRANSFER', $6, $7)
                `, [normalizedPhone, wallet.id, tx.amount, wallet.balance, newBalance, tx.id, tx.description]);

                // Mark as processed
                await db.query(`
                    UPDATE balance_history
                    SET wallet_processed = TRUE, customer_phone = $2
                    WHERE id = $1
                `, [tx.id, normalizedPhone]);

                // Log activity
                await db.query(`
                    INSERT INTO customer_activities (phone, activity_type, title, description, icon, color)
                    VALUES ($1, 'WALLET_DEPOSIT', $2, $3, 'university', 'green')
                `, [normalizedPhone, `Nạp tiền: ${parseFloat(tx.amount).toLocaleString()}đ`, tx.description || 'Chuyển khoản ngân hàng']);

                processed.push({
                    id: tx.id,
                    phone: normalizedPhone,
                    amount: parseFloat(tx.amount),
                    newBalance
                });
            } catch (txError) {
                errors.push({ id: tx.id, error: txError.message });
            }
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            data: {
                processedCount: processed.length,
                errorCount: errors.length,
                processed,
                errors
            }
        });
    } catch (error) {
        await db.query('ROLLBACK');
        handleError(res, error, 'Failed to process bank transactions');
    }
});

module.exports = router;
