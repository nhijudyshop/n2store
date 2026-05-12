// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const cron = require('node-cron');
const db = require('../db/pool');
const fetch = require('node-fetch');

// NEW: Import services for customer creation and wallet processing
const { ensureCustomerWithTPOS } = require('../services/customer-creation-service');
const { processDeposit } = require('../services/wallet-event-processor');
const { withTransaction } = require('../db/with-transaction');

// Import pending withdrawals processor
const { processWithdrawal } = require('../routes/v2/pending-withdrawals');
const { cleanupOrderBuffer } = require('../routes/tpos-order-buffer');

// Chạy mỗi giờ để expire virtual credits
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running expire_virtual_credits...');
    try {
        const result = await db.query('SELECT * FROM expire_virtual_credits()');
        const { expired_count, total_expired_amount } = result.rows[0];
        console.log(
            `[CRON] ✅ Expired ${expired_count} credits, total: ${total_expired_amount} VND`
        );
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
            const ticketCodes = result.rows.map((row) => row.ticket_code).join(', ');
            console.log(
                `[CRON] ✅ Updated priority to 'high' for tickets nearing carrier deadline: ${ticketCodes}`
            );
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
        // CRITICAL: Only process transactions that are APPROVED or AUTO_APPROVED
        // This prevents bypassing the accountant approval workflow for manual entries
        const unprocessedResult = await db.query(`
            SELECT bh.id, bh.sepay_id, bh.transfer_amount, bh.content, bh.code, bh.reference_code,
                   bh.linked_customer_phone, c.id as customer_id
            FROM balance_history bh
            LEFT JOIN customers c ON c.phone = bh.linked_customer_phone
            WHERE bh.linked_customer_phone IS NOT NULL
              AND (bh.wallet_processed = FALSE OR bh.wallet_processed IS NULL)
              AND bh.transfer_amount > 0
              AND bh.transfer_type = 'in'
              AND bh.verification_status IN ('AUTO_APPROVED', 'APPROVED')
            ORDER BY bh.transaction_date ASC
            LIMIT 50
        `);

        if (unprocessedResult.rows.length === 0) {
            console.log('[CRON] No unprocessed bank transactions found (realtime is working!)');
            return;
        }

        console.log(
            `[CRON] Found ${unprocessedResult.rows.length} unprocessed transactions (catching up...)`
        );

        let processedCount = 0;
        let totalAmount = 0;

        for (const tx of unprocessedResult.rows) {
            try {
                // Ensure customer exists with TPOS data (runs outside the wallet transaction — safe to retry)
                let customerId = tx.customer_id;
                if (!customerId) {
                    try {
                        const customerResult = await ensureCustomerWithTPOS(
                            db,
                            tx.linked_customer_phone
                        );
                        customerId = customerResult.customerId;
                        console.log(
                            `[CRON] Created missing customer: ${tx.linked_customer_phone} -> ID ${customerId}`
                        );

                        await db.query(
                            'UPDATE balance_history SET customer_id = $1 WHERE id = $2',
                            [customerId, tx.id]
                        );
                    } catch (custErr) {
                        console.error(
                            `[CRON] Failed to create customer for ${tx.linked_customer_phone}:`,
                            custErr.message
                        );
                    }
                }

                // Atomic: SELECT FOR UPDATE → processDeposit (INSERT ON CONFLICT + UPDATE balance) → mark wallet_processed
                const walletResult = await withTransaction(db, async (client) => {
                    // Re-check inside transaction (row-locked) — protects against concurrent cron instances + realtime
                    const recheck = await client.query(
                        'SELECT wallet_processed FROM balance_history WHERE id = $1 FOR UPDATE',
                        [tx.id]
                    );
                    if (recheck.rows.length > 0 && recheck.rows[0].wallet_processed === true) {
                        return { alreadyProcessed: true };
                    }

                    const result = await processDeposit(
                        client,
                        tx.linked_customer_phone,
                        tx.transfer_amount,
                        tx.id,
                        `Nạp từ CK ${tx.code || tx.reference_code || 'N/A'} (cron backup)`,
                        customerId,
                        null,
                        tx.sepay_id
                    );

                    await client.query(
                        `UPDATE balance_history SET wallet_processed = TRUE WHERE id = $1`,
                        [tx.id]
                    );

                    return result;
                });

                if (walletResult.alreadyProcessed) {
                    console.log(`[CRON] ⚠️ Skipping tx ${tx.id} - already processed by realtime`);
                    continue;
                }

                processedCount++;
                totalAmount += parseFloat(tx.transfer_amount);
                console.log(
                    `[CRON] ✅ Processed tx ${tx.id}: +${tx.transfer_amount} VND (wallet TX: ${walletResult.transactionId}${walletResult.skipped ? ' — duplicate sepay_id, wallet_processed flag set' : ''})`
                );
            } catch (txError) {
                console.error(
                    `[CRON] ❌ Error processing balance_history id=${tx.id}:`,
                    txError.message
                );
            }
        }

        if (processedCount > 0) {
            console.log(
                `[CRON] ✅ Backup processed ${processedCount} bank transactions, total: ${totalAmount} VND`
            );
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
            const customerDetails = result.rows
                .map((row) => `Phone: ${row.phone}, Return Rate: ${row.return_rate}%`)
                .join('; ');
            console.log(
                `[CRON] 🚨 Blacklisted customers due to high return rate: ${customerDetails}`
            );
        } else {
            console.log('[CRON] No customers found for blacklisting due to high return rate.');
        }
    } catch (error) {
        console.error('[CRON] ❌ Error running fraud detection (return rate):', error);
    }
});

// Chạy mỗi ngày lúc 9AM để kiểm tra tickets RETURN_SHIPPER quá 10 ngày chưa nhận hàng
cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Running expired RETURN_SHIPPER tickets checker...');
    try {
        // Find RETURN_SHIPPER tickets that are older than 10 days and not completed
        const result = await db.query(`
            WITH expired_tickets AS (
                SELECT
                    id, ticket_code, phone, order_id, customer_name,
                    virtual_credit_amount, created_at,
                    EXTRACT(DAY FROM NOW() - created_at) as days_old
                FROM customer_tickets
                WHERE type = 'RETURN_SHIPPER'
                  AND status NOT IN ('COMPLETED', 'CANCELLED')
                  AND created_at <= NOW() - INTERVAL '10 days'
            )
            INSERT INTO customer_activities (phone, activity_type, title, description, icon, color, metadata)
            SELECT
                phone,
                'TICKET_OVERDUE',
                'Ticket hoàn hàng quá hạn 10 ngày',
                'Ticket ' || ticket_code || ' (đơn ' || COALESCE(order_id, 'N/A') || ') đã quá 10 ngày chưa nhận hàng. Cần kiểm tra và xử lý.',
                'alert-triangle',
                'orange',
                jsonb_build_object(
                    'ticket_code', ticket_code,
                    'order_id', order_id,
                    'days_old', days_old,
                    'virtual_credit_amount', virtual_credit_amount
                )
            FROM expired_tickets
            WHERE NOT EXISTS (
                -- Prevent duplicate notifications for the same ticket
                SELECT 1 FROM customer_activities ca
                WHERE ca.phone = expired_tickets.phone
                  AND ca.activity_type = 'TICKET_OVERDUE'
                  AND ca.metadata->>'ticket_code' = expired_tickets.ticket_code
                  AND ca.created_at > NOW() - INTERVAL '7 days'
            )
            RETURNING ticket_code, phone, days_old;
        `);

        if (result.rows.length > 0) {
            const ticketCodes = result.rows.map((r) => r.ticket_code).join(', ');
            console.log(
                `[CRON] 🚨 Found ${result.rows.length} overdue RETURN_SHIPPER tickets: ${ticketCodes}`
            );
        } else {
            console.log('[CRON] ✅ No overdue RETURN_SHIPPER tickets found.');
        }
    } catch (error) {
        console.error('[CRON] ❌ Error running expired tickets checker:', error);
    }
});

// Chạy mỗi ngày lúc 3AM để xóa recent_transfer_phones đã hết hạn (>7 ngày)
cron.schedule('0 3 * * *', async () => {
    console.log('[CRON] Running cleanup recent_transfer_phones...');
    try {
        const result = await db.query(
            'DELETE FROM recent_transfer_phones WHERE expires_at < NOW() RETURNING phone'
        );
        console.log(`[CRON] ✅ Cleaned up ${result.rowCount} expired recent transfer phones`);
    } catch (error) {
        console.error('[CRON] ❌ Error cleaning up recent_transfer_phones:', error.message);
    }
});

// Clean up old order buffer entries (keep last 3 days)
cron.schedule('0 4 * * *', async () => {
    console.log('[CRON] Running cleanup tpos_order_buffer...');
    try {
        const deleted = await cleanupOrderBuffer(db);
        console.log(`[CRON] Cleaned up ${deleted} old order buffer entries`);
    } catch (error) {
        console.error('[CRON] Error cleaning up tpos_order_buffer:', error.message);
    }
});

// Clean up dropped products older than 60 days (runs daily at 5 AM)
cron.schedule('0 5 * * *', async () => {
    console.log('[CRON] Running cleanup dropped_products > 60 days...');
    try {
        const result = await db.query(
            `DELETE FROM dropped_products WHERE created_at < NOW() - INTERVAL '60 days' RETURNING id`
        );
        console.log(`[CRON] ✅ Deleted ${result.rowCount} dropped products older than 60 days`);
    } catch (error) {
        console.error('[CRON] ❌ Error cleaning up dropped_products:', error.message);
    }
});

console.log('[CRON] Scheduler started');

// =====================================================
// PENDING WALLET WITHDRAWALS - Retry every 5 minutes
// =====================================================
// Ensures no lost transactions from network failures
cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Running retry-pending-withdrawals...');
    try {
        // Get pending records older than 1 minute (to avoid racing with immediate processing)
        const pendingResult = await db.query(`
            SELECT id, order_id, phone, amount, retry_count, max_retries
            FROM pending_wallet_withdrawals
            WHERE status = 'PENDING'
              AND created_at < NOW() - INTERVAL '1 minute'
              AND retry_count < max_retries
            ORDER BY created_at ASC
            LIMIT 50
        `);

        if (pendingResult.rows.length === 0) {
            console.log('[CRON] No pending withdrawals to retry');
            return;
        }

        console.log(`[CRON] Found ${pendingResult.rows.length} pending withdrawals to retry`);

        let successCount = 0;
        let failCount = 0;
        let retryLaterCount = 0;

        for (const pending of pendingResult.rows) {
            try {
                const result = await processWithdrawal(db, pending.id);

                if (result.success) {
                    successCount++;
                } else if (result.status === 'FAILED') {
                    failCount++;
                } else {
                    retryLaterCount++;
                }
            } catch (error) {
                console.error(`[CRON] Error processing pending #${pending.id}:`, error.message);
                retryLaterCount++;
            }
        }

        console.log(
            `[CRON] ✅ Pending withdrawals: ${successCount} success, ${failCount} failed, ${retryLaterCount} retry later`
        );
    } catch (error) {
        console.error('[CRON] ❌ Error in retry-pending-withdrawals:', error.message);
    }
});

// =====================================================
// KPI Auto-Reconcile — chạy 6AM hàng ngày
// So sánh audit-based KPI với TPOS thực tế, flag discrepancy
// =====================================================
cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Running KPI auto-reconcile...');
    try {
        // Get all statistics from last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .substring(0, 10);
        const statsResult = await db.query(
            'SELECT user_id, stat_date, orders FROM kpi_statistics WHERE stat_date >= $1',
            [sevenDaysAgo]
        );

        let checked = 0,
            flagged = 0;

        for (const row of statsResult.rows) {
            const orders = row.orders || [];
            for (const order of orders) {
                if (!order.orderCode) continue;
                checked++;

                // Get BASE with creation timestamp
                const baseResult = await db.query(
                    'SELECT products, created_at FROM kpi_base WHERE order_code = $1',
                    [order.orderCode]
                );
                if (baseResult.rows.length === 0) continue;
                const baseCreatedAt = baseResult.rows[0].created_at;

                // Get audit logs AFTER BASE creation only
                const auditResult = await db.query(
                    `SELECT product_id, action, quantity, user_id, out_of_range, created_at
                     FROM kpi_audit_log WHERE order_code = $1 AND created_at >= $2
                     ORDER BY created_at`,
                    [order.orderCode, baseCreatedAt]
                );

                // Cross-check userId: flag if audit user ≠ assigned employee
                const assignedUserId = row.user_id;
                const foreignActions = auditResult.rows.filter(
                    (l) => l.user_id && l.user_id !== assignedUserId && l.user_id !== 'unknown'
                );
                if (foreignActions.length > 0) {
                    const foreignUsers = [...new Set(foreignActions.map((l) => l.user_id))];
                    flagged++;
                    console.warn(
                        `[KPI-RECONCILE] ⚠️ Order ${order.orderCode}: ${foreignActions.length} actions by ${foreignUsers.join(', ')} (assigned: ${assignedUserId})`
                    );
                }
            }
        }

        console.log(`[CRON] ✅ KPI auto-reconcile: checked ${checked} orders, flagged ${flagged}`);
    } catch (error) {
        console.error('[CRON] ❌ Error in KPI auto-reconcile:', error.message);
    }
});

// =====================================================
// KPI Data Retention — chạy 5AM hàng ngày
// Xóa audit logs > 90 ngày (giữ statistics summary)
// =====================================================
cron.schedule('0 5 * * *', async () => {
    console.log('[CRON] Running KPI audit log cleanup...');
    try {
        // Only delete audit logs older than 90 days whose orders no longer have BASE
        // This preserves logs that could still be recalculated
        const result = await db.query(`
            DELETE FROM kpi_audit_log
            WHERE created_at < NOW() - INTERVAL '90 days'
              AND order_code NOT IN (SELECT order_code FROM kpi_base)
            RETURNING id
        `);
        const count = result.rowCount || 0;
        if (count > 0) {
            console.log(`[CRON] ✅ Cleaned up ${count} orphaned audit logs older than 90 days`);
        } else {
            console.log('[CRON] No orphaned audit logs to clean up');
        }
    } catch (error) {
        console.error('[CRON] ❌ Error in KPI audit log cleanup:', error.message);
    }
});

// =====================================================
// Pancake PAT Proactive Refresh — chạy mỗi 6 giờ
// Refresh PATs có savedAt > 45 ngày (Pancake PAT ~60 ngày TTL).
// Không máy client nào phải chờ cold regen khi mở chat.
// =====================================================
cron.schedule('15 */6 * * *', async () => {
    console.log('[CRON] Running Pancake PAT proactive refresh...');
    try {
        // PATs saved > 45 ngày (≈ còn 15 ngày) → refresh bây giờ
        const FORTY_FIVE_DAYS_MS = 45 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - FORTY_FIVE_DAYS_MS;

        const { rows } = await db.query(
            `
            SELECT page_id, saved_at, generated_by
            FROM pancake_page_access_tokens
            WHERE saved_at IS NOT NULL AND saved_at < $1
            ORDER BY saved_at ASC
            LIMIT 100
        `,
            [cutoff]
        );

        if (rows.length === 0) {
            console.log('[CRON] No PATs need refresh');
            return;
        }

        console.log(`[CRON] Found ${rows.length} PATs to refresh`);

        // Load active Pancake accounts
        const acctRes = await db.query(
            'SELECT account_id, token, pages FROM pancake_accounts WHERE is_active = true'
        );
        const accounts = acctRes.rows || [];
        if (accounts.length === 0) {
            console.warn('[CRON] No active Pancake accounts — skip refresh');
            return;
        }

        const WORKER_URL =
            process.env.CF_WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        let refreshed = 0;
        let failed = 0;

        for (const { page_id: pageId } of rows) {
            // Find an account that has this page
            const acc = accounts.find((a) => {
                const pages = Array.isArray(a.pages)
                    ? a.pages
                    : typeof a.pages === 'string'
                      ? JSON.parse(a.pages)
                      : [];
                return pages.some((p) => String(p.id || p.pageId) === String(pageId));
            });
            if (!acc) {
                failed++;
                continue;
            }

            try {
                const url = `${WORKER_URL}/api/pancake/pages/${pageId}/generate_page_access_token?access_token=${acc.token}`;
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                });
                if (!r.ok) {
                    failed++;
                    continue;
                }
                const data = await r.json();
                if (!data.success || !data.page_access_token) {
                    failed++;
                    continue;
                }

                // Extract timestamp from JWT payload
                let newTs = null;
                try {
                    const parts = data.page_access_token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(
                            Buffer.from(parts[1], 'base64url').toString('utf8')
                        );
                        newTs = payload.timestamp || null;
                    }
                } catch (_) {}

                await db.query(
                    `
                    UPDATE pancake_page_access_tokens
                    SET token = $2, timestamp = $3, saved_at = $4, generated_by = $5, updated_at = NOW()
                    WHERE page_id = $1
                `,
                    [pageId, data.page_access_token, newTs, Date.now(), 'cron-refresh']
                );
                refreshed++;
            } catch (e) {
                console.warn(`[CRON] PAT refresh failed for ${pageId}:`, e.message);
                failed++;
            }

            // Rate limit: 500ms between calls
            await new Promise((r) => setTimeout(r, 500));
        }

        console.log(
            `[CRON] ✅ PAT refresh done — refreshed: ${refreshed}, failed: ${failed}, total: ${rows.length}`
        );
    } catch (error) {
        console.error('[CRON] ❌ Error in PAT refresh:', error.message);
    }
});

// =====================================================
// Cleanup expired regen locks — chạy mỗi 5 phút
// Locks có TTL 5-30s nhưng nếu client crash giữa chừng → lock stuck
// =====================================================
cron.schedule('*/5 * * * *', async () => {
    try {
        const result = await db.query(`
            UPDATE pancake_page_access_tokens
            SET regen_lock_until = NULL
            WHERE regen_lock_until IS NOT NULL AND regen_lock_until < NOW() - INTERVAL '1 minute'
            RETURNING page_id
        `);
        if (result.rowCount > 0) {
            console.log(`[CRON] Cleaned ${result.rowCount} stale regen locks`);
        }
    } catch (error) {
        console.error('[CRON] ❌ Error cleaning regen locks:', error.message);
    }
});

// =====================================================
// Reconcile pending_customers vs Pancake live state — every 5 min
// =====================================================
//
// Background: server's WS handler updates pending_customers on
// pages:update_conversation events, but Pancake doesn't reliably
// fire that event after shop-direct-API replies (auto bill-send,
// reactions from extension, etc.). Result: row stays with bumped
// message_count even though Pancake's unread_count = 0 or shop is
// last sender. Owner repro 2026-05-12: Mật Ngọt count=6 in DB,
// Pancake unread=0 + shopSentLast=true.
//
// Strategy: every 5 minutes, fetch every pending row, look up the
// matching conv on Pancake via an active staff JWT, and:
//   • shopSentLast || unread_count === 0  → DELETE the row
//   • unread > 0 && != db.message_count    → UPDATE message_count
//   • aligned                              → leave alone
//
// Concurrency 4, rate-limited. Skip when DB has 0 pending rows or
// no usable Pancake account is available.
//
cron.schedule('*/5 * * * *', async () => {
    try {
        const pendingRes = await db.query(
            `SELECT psid, page_id, customer_name, message_count, last_message_snippet
             FROM pending_customers
             WHERE type = 'INBOX'
             ORDER BY last_message_time DESC
             LIMIT 500`
        );
        const rows = pendingRes.rows || [];
        if (rows.length === 0) return;

        // Pick an active pancake account token. Prefer most-recently-used
        // active row with a non-expired token. token_exp is epoch seconds.
        const nowSec = Math.floor(Date.now() / 1000);
        const acctRes = await db.query(
            `SELECT account_id, token, token_exp, fb_name
             FROM pancake_accounts
             WHERE is_active = true
               AND token IS NOT NULL
               AND (token_exp IS NULL OR token_exp::bigint > $1)
             ORDER BY last_used_at DESC NULLS LAST
             LIMIT 1`,
            [nowSec]
        );
        const acct = acctRes.rows[0];
        if (!acct) {
            console.log('[CRON] reconcile-pending: no usable Pancake account, skipping');
            return;
        }
        const token = acct.token;

        let deleted = 0;
        let updated = 0;
        let aligned = 0;
        let errored = 0;
        const CONCURRENCY = 4;
        const queue = [...rows];

        async function worker() {
            while (queue.length) {
                const row = queue.shift();
                if (!row) break;
                try {
                    const url = `https://pancake.vn/api/v1/pages/${row.page_id}/conversations/${row.page_id}_${row.psid}?access_token=${token}`;
                    const r = await fetch(url, { headers: { Accept: 'application/json' } });
                    if (!r.ok) {
                        errored++;
                        continue;
                    }
                    const conv = await r.json().catch(() => null);
                    if (!conv || conv.existed === false || conv.success === false) {
                        // Orphan — no conv on Pancake.
                        await db.query(
                            `DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2`,
                            [row.psid, row.page_id]
                        );
                        deleted++;
                        continue;
                    }
                    const lastSenderId = String(
                        conv.last_sent_by?.id || conv.last_message?.from?.id || ''
                    );
                    const shopSentLast = !!lastSenderId && lastSenderId === String(row.page_id);
                    const unread = typeof conv.unread_count === 'number' ? conv.unread_count : null;

                    if (shopSentLast || unread === 0) {
                        await db.query(
                            `DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2`,
                            [row.psid, row.page_id]
                        );
                        deleted++;
                    } else if (unread !== null && unread !== row.message_count) {
                        const newSnip = (conv.snippet || row.last_message_snippet || '')
                            .toString()
                            .substring(0, 200);
                        await db.query(
                            `UPDATE pending_customers
                             SET message_count = $3,
                                 last_message_snippet = $4,
                                 last_message_time = NOW()
                             WHERE psid = $1 AND page_id = $2`,
                            [row.psid, row.page_id, unread, newSnip]
                        );
                        updated++;
                    } else {
                        aligned++;
                    }
                } catch (e) {
                    errored++;
                }
            }
        }

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));

        // Update last_used_at on the account we used.
        await db
            .query(`UPDATE pancake_accounts SET last_used_at = NOW() WHERE account_id = $1`, [
                acct.account_id,
            ])
            .catch(() => {});

        if (deleted + updated > 0) {
            console.log(
                `[CRON] reconcile-pending (acct=${acct.fb_name}): scanned ${rows.length}, deleted=${deleted}, updated=${updated}, aligned=${aligned}, errored=${errored}`
            );
        }
    } catch (error) {
        console.error('[CRON] ❌ reconcile-pending error:', error.message);
    }
});
