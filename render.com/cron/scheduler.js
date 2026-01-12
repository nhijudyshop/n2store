const cron = require('node-cron');
const db = require('../db/pool');

// NEW: Import services for customer creation and wallet processing
const { ensureCustomerWithTPOS } = require('../services/customer-creation-service');
const { processDeposit } = require('../services/wallet-event-processor');

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

// Chạy mỗi 5 phút để process bank transactions vào wallet (BACKUP cho realtime processing)
cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Running process-bank-transactions (backup)...');
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
            console.log('[CRON] No unprocessed bank transactions found (realtime is working!)');
            return;
        }

        console.log(`[CRON] Found ${unprocessedResult.rows.length} unprocessed transactions (catching up...)`);

        let processedCount = 0;
        let totalAmount = 0;

        for (const tx of unprocessedResult.rows) {
            try {
                // NEW: Ensure customer exists with TPOS data (create if missing)
                let customerId = tx.customer_id;
                if (!customerId) {
                    try {
                        const customerResult = await ensureCustomerWithTPOS(db, tx.linked_customer_phone);
                        customerId = customerResult.customerId;
                        console.log(`[CRON] Created missing customer: ${tx.linked_customer_phone} -> ID ${customerId}`);

                        // Update balance_history with customer_id
                        await db.query(
                            'UPDATE balance_history SET customer_id = $1 WHERE id = $2',
                            [customerId, tx.id]
                        );
                    } catch (custErr) {
                        console.error(`[CRON] Failed to create customer for ${tx.linked_customer_phone}:`, custErr.message);
                    }
                }

                // NEW: Use wallet-event-processor instead of manual queries
                const walletResult = await processDeposit(
                    db,
                    tx.linked_customer_phone,
                    tx.transfer_amount,
                    tx.id,
                    `Nạp từ CK ${tx.code || tx.reference_code || 'N/A'} (cron backup)`,
                    customerId
                );

                // Mark as processed
                await db.query(
                    `UPDATE balance_history SET wallet_processed = TRUE WHERE id = $1`,
                    [tx.id]
                );

                processedCount++;
                totalAmount += parseFloat(tx.transfer_amount);

                console.log(`[CRON] ✅ Processed tx ${tx.id}: +${tx.transfer_amount} VND (wallet TX: ${walletResult.transactionId})`);

            } catch (txError) {
                console.error(`[CRON] ❌ Error processing balance_history id=${tx.id}:`, txError.message);
            }
        }

        if (processedCount > 0) {
            console.log(`[CRON] ✅ Backup processed ${processedCount} bank transactions, total: ${totalAmount} VND`);
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
