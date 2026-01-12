const cron = require('node-cron');
const db = require('../db/pool');

// Chạy mỗi giờ để expire virtual credits
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running expire_virtual_credits...');
    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');
        const { expired_count, total_expired_amount } = result.rows[0];
        console.log(`[CRON] ✅ Expired ${expired_count} credits, total: ${total_expired_amount} VND`);
    } catch (error) {
        console.error('[CRON] ❌ Error running expire_virtual_credits:', error);
    }
});

// Chạy mỗi 6 giờ để kiểm tra deadline nhà vận chuyển
cron.schedule('0 */6 * * *', async () => {
    console.log('[CRON] Running carrier deadline checker...');
    try {
        const result = await db.query(`
            UPDATE customer_tickets
            SET priority = 'high', updated_at = CURRENT_TIMESTAMP
            WHERE carrier_deadline IS NOT NULL
              AND status NOT IN ('COMPLETED', 'CANCELLED')
              AND priority != 'urgent' -- urgent tickets are already high priority
              AND carrier_deadline <= NOW() + INTERVAL '24 hours'
            RETURNING ticket_code;
        `);
        if (result.rows.length > 0) {
            const ticketCodes = result.rows.map(row => row.ticket_code).join(', ');
            console.log(`[CRON] ✅ Updated priority to 'high' for tickets nearing carrier deadline: ${ticketCodes}`);
        } else {
            console.log('[CRON] No tickets found nearing carrier deadline.');
        }
    } catch (error) {
        console.error('[CRON] ❌ Error running carrier deadline checker:', error);
    }
});

// Chạy mỗi 5 phút để process bank transactions vào wallet
cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Running process-bank-transactions...');
    try {
        // Get unprocessed bank transactions that have customer phone linked
        const unprocessedResult = await db.query(`
            SELECT bh.id, bh.transfer_amount, bh.content, bh.code, bh.reference_code,
                   bh.linked_customer_phone, c.id as customer_id
            FROM balance_history bh
            LEFT JOIN customers c ON c.phone = bh.linked_customer_phone
            WHERE bh.linked_customer_phone IS NOT NULL
              AND (bh.wallet_processed = FALSE OR bh.wallet_processed IS NULL)
              AND bh.transfer_amount > 0
              AND bh.transfer_type = 'in'
            ORDER BY bh.transaction_date ASC
            LIMIT 50
        `);

        if (unprocessedResult.rows.length === 0) {
            console.log('[CRON] No unprocessed bank transactions found');
            return;
        }

        let processedCount = 0;
        let totalAmount = 0;

        for (const tx of unprocessedResult.rows) {
            try {
                await db.query('BEGIN');

                // Get or create wallet
                let walletResult = await db.query(
                    `INSERT INTO customer_wallets (phone, customer_id, balance, virtual_balance)
                     VALUES ($1, $2, 0, 0)
                     ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
                     RETURNING id, balance`,
                    [tx.linked_customer_phone, tx.customer_id]
                );

                const walletId = walletResult.rows[0].id;
                const currentBalance = parseFloat(walletResult.rows[0].balance) || 0;
                const newBalance = currentBalance + parseFloat(tx.transfer_amount);

                // Log wallet transaction
                await db.query(
                    `INSERT INTO wallet_transactions (
                        phone, wallet_id, type, amount,
                        balance_before, balance_after,
                        source, reference_type, reference_id, note
                    ) VALUES ($1, $2, 'DEPOSIT', $3, $4, $5, 'BANK_TRANSFER', 'balance_history', $6, $7)`,
                    [
                        tx.linked_customer_phone, walletId, tx.transfer_amount,
                        currentBalance, newBalance,
                        tx.id.toString(),
                        'Nap tu CK ' + (tx.code || tx.reference_code || 'N/A')
                    ]
                );

                // Update wallet balance
                await db.query(
                    `UPDATE customer_wallets
                     SET balance = $1, total_deposited = COALESCE(total_deposited, 0) + $2, updated_at = NOW()
                     WHERE phone = $3`,
                    [newBalance, tx.transfer_amount, tx.linked_customer_phone]
                );

                // Mark as processed
                await db.query(
                    `UPDATE balance_history SET wallet_processed = TRUE WHERE id = $1`,
                    [tx.id]
                );

                await db.query('COMMIT');

                processedCount++;
                totalAmount += parseFloat(tx.transfer_amount);

            } catch (txError) {
                await db.query('ROLLBACK');
                console.error(`[CRON] ❌ Error processing balance_history id=${tx.id}:`, txError.message);
            }
        }

        if (processedCount > 0) {
            console.log(`[CRON] ✅ Processed ${processedCount} bank transactions, total: ${totalAmount} VND`);
        }

    } catch (error) {
        console.error('[CRON] ❌ Error running process-bank-transactions:', error);
    }
});

// Chạy mỗi ngày lúc 2AM để phát hiện gian lận (fraud detection)
cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Running fraud detection (return rate)...');
    try {
        const result = await db.query(`
            UPDATE customers
            SET tier = 'blacklist', updated_at = CURRENT_TIMESTAMP
            WHERE return_rate > 50 AND tier != 'blacklist'
            RETURNING id, phone, return_rate;
        `);
        if (result.rows.length > 0) {
            const customerDetails = result.rows.map(row => `Phone: ${row.phone}, Return Rate: ${row.return_rate}%`).join('; ');
            console.log(`[CRON] 🚨 Blacklisted customers due to high return rate: ${customerDetails}`);
        } else {
            console.log('[CRON] No customers found for blacklisting due to high return rate.');
        }
    } catch (error) {
        console.error('[CRON] ❌ Error running fraud detection (return rate):', error);
    }
});

console.log('[CRON] Scheduler started');
