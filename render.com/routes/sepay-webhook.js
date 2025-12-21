// =====================================================
// SEPAY WEBHOOK ROUTES
// Nhận và xử lý webhook từ Sepay
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * GET /api/sepay/ping
 * Health check endpoint - also helps wake up sleeping Render server
 */
router.get('/ping', (req, res) => {
    console.log('[SEPAY-PING] Health check received');
    res.json({
        success: true,
        message: 'SePay webhook endpoint is healthy',
        timestamp: new Date().toISOString(),
        api_key_configured: !!process.env.SEPAY_API_KEY
    });
});

/**
 * POST /api/sepay/webhook
 * Nhận webhook từ Sepay khi có giao dịch mới
 *
 * Docs: https://docs.sepay.vn/tich-hop-webhooks.html
 */
router.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    const db = req.app.locals.chatDb; // Sử dụng PostgreSQL connection từ server.js

    // Log request để debug (sanitized - không log full headers vì có thể chứa API key)
    console.log('[SEPAY-WEBHOOK] ========================================');
    console.log('[SEPAY-WEBHOOK] Received webhook at:', new Date().toISOString());
    console.log('[SEPAY-WEBHOOK] Has Authorization header:', !!req.headers['authorization']);
    console.log('[SEPAY-WEBHOOK] Content-Type:', req.headers['content-type']);
    console.log('[SEPAY-WEBHOOK] Body:', JSON.stringify(req.body).substring(0, 500));

    // ============================================
    // AUTHENTICATION - Verify API Key (if enabled)
    // ============================================
    const SEPAY_API_KEY = process.env.SEPAY_API_KEY;

    if (SEPAY_API_KEY) {
        // API Key authentication is enabled
        const authHeader = req.headers['authorization'];

        if (!authHeader) {
            console.error('[SEPAY-WEBHOOK] Missing Authorization header');
            await logWebhook(db, null, req, 401, { error: 'Missing Authorization header' }, 'Unauthorized - Missing auth header');
            return res.status(401).json({
                success: false,
                error: 'Unauthorized - Missing Authorization header'
            });
        }

        // Sepay sends: "Authorization: Apikey YOUR_API_KEY"
        const apiKey = authHeader.replace(/^Apikey\s+/i, '').trim();

        if (apiKey !== SEPAY_API_KEY) {
            console.error('[SEPAY-WEBHOOK] Invalid API Key');
            await logWebhook(db, null, req, 401, { error: 'Invalid API Key' }, 'Unauthorized - Invalid API key');
            return res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid API Key'
            });
        }

        console.log('[SEPAY-WEBHOOK] ✅ API Key validated');
    } else {
        console.warn('[SEPAY-WEBHOOK] ⚠️  Running without API Key authentication (not recommended for production)');
    }

    try {
        const webhookData = req.body;

        // Validate dữ liệu
        if (!webhookData || typeof webhookData !== 'object') {
            console.error('[SEPAY-WEBHOOK] Invalid data type:', typeof webhookData);
            await logWebhook(db, null, req, 400, { error: 'Invalid data type' }, 'Invalid data type');
            return res.status(400).json({
                success: false,
                error: 'Invalid data - expected JSON object'
            });
        }

        // Validate required fields
        const requiredFields = ['id', 'gateway', 'transactionDate', 'accountNumber',
                               'transferType', 'transferAmount', 'accumulated'];
        const missingFields = requiredFields.filter(field =>
            webhookData[field] === undefined || webhookData[field] === null
        );

        if (missingFields.length > 0) {
            console.error('[SEPAY-WEBHOOK] Missing required fields:', missingFields);
            await logWebhook(db, webhookData.id, req, 400,
                { error: 'Missing required fields', missing: missingFields },
                `Missing fields: ${missingFields.join(', ')}`
            );
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
                missing: missingFields
            });
        }

        // Validate transfer_type
        if (!['in', 'out'].includes(webhookData.transferType)) {
            console.error('[SEPAY-WEBHOOK] Invalid transfer_type:', webhookData.transferType);
            await logWebhook(db, webhookData.id, req, 400,
                { error: 'Invalid transfer_type' },
                'Invalid transfer_type - must be "in" or "out"'
            );
            return res.status(400).json({
                success: false,
                error: 'Invalid transfer_type - must be "in" or "out"'
            });
        }

        // Insert vào database với atomic duplicate handling
        // Sử dụng ON CONFLICT để tránh race condition
        const insertQuery = `
            INSERT INTO balance_history (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, webhook_received_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
            )
            ON CONFLICT (sepay_id) DO NOTHING
            RETURNING id
        `;

        const values = [
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
            JSON.stringify(webhookData)
        ];

        const result = await db.query(insertQuery, values);

        // Check if insert was successful or skipped due to duplicate
        if (result.rows.length === 0) {
            // Duplicate transaction - ON CONFLICT triggered
            console.log('[SEPAY-WEBHOOK] Duplicate transaction ignored (atomic check):', webhookData.id);
            await logWebhook(db, webhookData.id, req, 200,
                { success: true, message: 'Duplicate transaction ignored' },
                null
            );
            return res.status(200).json({
                success: true,
                message: 'Duplicate transaction - already processed'
            });
        }

        const insertedId = result.rows[0].id;

        console.log('[SEPAY-WEBHOOK] ✅ Transaction saved:', {
            id: insertedId,
            sepay_id: webhookData.id,
            type: webhookData.transferType,
            amount: webhookData.transferAmount,
            gateway: webhookData.gateway
        });

        // Log successful webhook
        await logWebhook(db, webhookData.id, req, 200,
            { success: true, id: insertedId },
            null
        );

        // Broadcast realtime update to all connected balance history clients
        broadcastBalanceUpdate(req.app, 'new-transaction', {
            id: insertedId,
            sepay_id: webhookData.id,
            gateway: webhookData.gateway,
            transaction_date: webhookData.transactionDate,
            account_number: webhookData.accountNumber,
            code: webhookData.code || null,
            content: webhookData.content || null,
            transfer_type: webhookData.transferType,
            transfer_amount: webhookData.transferAmount,
            accumulated: webhookData.accumulated,
            sub_account: webhookData.subAccount || null,
            reference_code: webhookData.referenceCode || null,
            description: webhookData.description || null,
            created_at: new Date().toISOString()
        });
        console.log('[SEPAY-WEBHOOK] Broadcasting realtime update to clients...');

        // Auto-update customer debt for incoming transactions
        if (webhookData.transferType === 'in') {
            try {
                const debtResult = await processDebtUpdate(db, insertedId);
                console.log('[SEPAY-WEBHOOK] Debt update result:', debtResult);
            } catch (debtError) {
                console.error('[SEPAY-WEBHOOK] Debt update error (non-critical):', debtError.message);
            }
        }

        const processingTime = Date.now() - startTime;
        console.log('[SEPAY-WEBHOOK] ✅ Completed in', processingTime, 'ms');
        console.log('[SEPAY-WEBHOOK] ========================================');

        // Trả về response theo spec của Sepay
        res.status(200).json({
            success: true,
            id: insertedId,
            message: 'Transaction recorded successfully',
            processing_time_ms: processingTime
        });

    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error('[SEPAY-WEBHOOK] ❌ Error processing webhook after', processingTime, 'ms:', error);

        // Log error
        await logWebhook(db, req.body?.id, req, 500,
            { error: 'Internal server error' },
            error.message
        );

        // Save to failed queue for retry
        if (req.body && typeof req.body === 'object') {
            await saveToFailedQueue(db, req.body, error.message);
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process webhook',
            message: error.message,
            queued_for_retry: true
        });
    }
});

/**
 * GET /api/sepay/history
 * Lấy lịch sử giao dịch
 */
router.get('/history', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const {
            page = 1,
            limit = 50,
            type,
            gateway,
            startDate,
            endDate,
            search
        } = req.query;

        const offset = (page - 1) * limit;
        let queryConditions = [];
        let queryParams = [];
        let paramCounter = 1;

        // Filter by transfer type
        if (type && ['in', 'out'].includes(type)) {
            queryConditions.push(`transfer_type = $${paramCounter}`);
            queryParams.push(type);
            paramCounter++;
        }

        // Filter by gateway
        if (gateway) {
            queryConditions.push(`gateway ILIKE $${paramCounter}`);
            queryParams.push(`%${gateway}%`);
            paramCounter++;
        }

        // Filter by date range
        if (startDate) {
            queryConditions.push(`transaction_date >= $${paramCounter}`);
            queryParams.push(startDate);
            paramCounter++;
        }

        if (endDate) {
            queryConditions.push(`transaction_date <= $${paramCounter}`);
            queryParams.push(endDate);
            paramCounter++;
        }

        // Search in content, reference_code
        if (search) {
            queryConditions.push(`(
                content ILIKE $${paramCounter} OR
                reference_code ILIKE $${paramCounter} OR
                code ILIKE $${paramCounter}
            )`);
            queryParams.push(`%${search}%`);
            paramCounter++;
        }

        const whereClause = queryConditions.length > 0
            ? 'WHERE ' + queryConditions.join(' AND ')
            : '';

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM balance_history ${whereClause}`;
        const countResult = await db.query(countQuery, queryParams);
        const total = parseInt(countResult.rows[0].count);

        // Get paginated data
        const dataQuery = `
            SELECT
                id, sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount, accumulated,
                sub_account, reference_code, description, created_at
            FROM balance_history
            ${whereClause}
            ORDER BY transaction_date DESC
            LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
        `;

        queryParams.push(limit, offset);
        const dataResult = await db.query(dataQuery, queryParams);

        res.json({
            success: true,
            data: dataResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('[SEPAY-HISTORY] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch history',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/statistics
 * Lấy thống kê giao dịch
 */
router.get('/statistics', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const { startDate, endDate, gateway } = req.query;

        let queryConditions = [];
        let queryParams = [];
        let paramCounter = 1;

        if (startDate) {
            queryConditions.push(`transaction_date >= $${paramCounter}`);
            queryParams.push(startDate);
            paramCounter++;
        }

        if (endDate) {
            queryConditions.push(`transaction_date <= $${paramCounter}`);
            queryParams.push(endDate);
            paramCounter++;
        }

        if (gateway) {
            queryConditions.push(`gateway ILIKE $${paramCounter}`);
            queryParams.push(`%${gateway}%`);
            paramCounter++;
        }

        const whereClause = queryConditions.length > 0
            ? 'WHERE ' + queryConditions.join(' AND ')
            : '';

        const statsQuery = `
            SELECT
                COUNT(*) as total_transactions,
                COUNT(CASE WHEN transfer_type = 'in' THEN 1 END) as total_in_count,
                COUNT(CASE WHEN transfer_type = 'out' THEN 1 END) as total_out_count,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE 0 END), 0) as total_in,
                COALESCE(SUM(CASE WHEN transfer_type = 'out' THEN transfer_amount ELSE 0 END), 0) as total_out,
                COALESCE(SUM(CASE WHEN transfer_type = 'in' THEN transfer_amount ELSE -transfer_amount END), 0) as net_change,
                MAX(CASE WHEN transfer_type = 'in' THEN accumulated END) as latest_balance
            FROM balance_history
            ${whereClause}
        `;

        const result = await db.query(statsQuery, queryParams);
        const stats = result.rows[0];

        res.json({
            success: true,
            statistics: {
                total_transactions: parseInt(stats.total_transactions),
                total_in_count: parseInt(stats.total_in_count),
                total_out_count: parseInt(stats.total_out_count),
                total_in: parseInt(stats.total_in),
                total_out: parseInt(stats.total_out),
                net_change: parseInt(stats.net_change),
                latest_balance: parseInt(stats.latest_balance) || 0
            }
        });

    } catch (error) {
        console.error('[SEPAY-STATS] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/stream
 * SSE endpoint for realtime balance history updates
 */
router.get('/stream', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Get or create balance SSE clients map
    if (!req.app.locals.balanceSseClients) {
        req.app.locals.balanceSseClients = new Set();
    }

    // Add this client to the set
    req.app.locals.balanceSseClients.add(res);
    console.log(`✅ [BALANCE-SSE] Client connected (Total: ${req.app.locals.balanceSseClients.size})`);

    // Send initial connection event
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    // Send keep-alive every 30 seconds
    const keepAliveInterval = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(keepAliveInterval);
        req.app.locals.balanceSseClients.delete(res);
        console.log(`❌ [BALANCE-SSE] Client disconnected (Total: ${req.app.locals.balanceSseClients.size})`);
        res.end();
    });
});

/**
 * Helper function: Broadcast to all balance SSE clients
 */
function broadcastBalanceUpdate(app, event, data) {
    if (!app.locals.balanceSseClients) return;

    app.locals.balanceSseClients.forEach(client => {
        try {
            client.write(`event: ${event}\n`);
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.error('[BALANCE-SSE] Failed to send to client:', error);
        }
    });
}

/**
 * Helper function: Log webhook request
 */
async function logWebhook(db, sepayId, req, statusCode, responseBody, errorMessage) {
    try {
        await db.query(`
            INSERT INTO sepay_webhook_logs (
                sepay_id, request_method, request_headers, request_body,
                response_status, response_body, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            sepayId,
            req.method,
            JSON.stringify(req.headers),
            JSON.stringify(req.body),
            statusCode,
            JSON.stringify(responseBody),
            errorMessage
        ]);
    } catch (err) {
        console.error('[SEPAY-WEBHOOK] Failed to log webhook:', err);
    }
}

/**
 * Process debt update for a single transaction
 * @param {Object} db - Database connection
 * @param {number} transactionId - The ID of the transaction in balance_history
 */
async function processDebtUpdate(db, transactionId) {
    console.log('[DEBT-UPDATE] Processing transaction ID:', transactionId);

    // 1. Get transaction details
    const txResult = await db.query(
        `SELECT id, content, transfer_amount, transfer_type, debt_added
         FROM balance_history
         WHERE id = $1`,
        [transactionId]
    );

    if (txResult.rows.length === 0) {
        console.log('[DEBT-UPDATE] Transaction not found:', transactionId);
        return { success: false, reason: 'Transaction not found' };
    }

    const tx = txResult.rows[0];

    // 2. Check if already processed
    if (tx.debt_added === true) {
        console.log('[DEBT-UPDATE] Transaction already processed:', transactionId);
        return { success: false, reason: 'Already processed' };
    }

    // 3. Only process 'in' transactions
    if (tx.transfer_type !== 'in') {
        console.log('[DEBT-UPDATE] Not an incoming transaction:', transactionId);
        return { success: false, reason: 'Not incoming transaction' };
    }

    // 4. Extract QR code from content (N2 + 16 alphanumeric)
    const content = tx.content || '';
    const qrMatch = content.toUpperCase().match(/N2[A-Z0-9]{16}/);
    if (!qrMatch) {
        console.log('[DEBT-UPDATE] No QR code in content:', transactionId);
        return { success: false, reason: 'No QR code found' };
    }

    const qrCode = qrMatch[0];
    console.log('[DEBT-UPDATE] QR code found:', qrCode);

    // 5. Find phone number from balance_customer_info (case-insensitive)
    const infoResult = await db.query(
        `SELECT customer_phone FROM balance_customer_info
         WHERE UPPER(unique_code) = $1`,
        [qrCode]
    );

    if (infoResult.rows.length === 0 || !infoResult.rows[0].customer_phone) {
        console.log('[DEBT-UPDATE] No phone linked to QR:', qrCode);
        return { success: false, reason: 'No phone linked to QR code' };
    }

    const phone = infoResult.rows[0].customer_phone;
    const amount = parseInt(tx.transfer_amount) || 0;

    console.log('[DEBT-UPDATE] Phone:', phone, 'Amount:', amount);

    // 6. Update customer debt (UPSERT)
    const updateResult = await db.query(
        `INSERT INTO customers (phone, name, debt, status, active)
         VALUES ($1, $1, $2, 'Bình thường', true)
         ON CONFLICT (phone) DO UPDATE SET
             debt = COALESCE(customers.debt, 0) + $2,
             updated_at = CURRENT_TIMESTAMP
         RETURNING id, phone, debt`,
        [phone, amount]
    );

    const customer = updateResult.rows[0];
    console.log('[DEBT-UPDATE] Customer updated:', customer);

    // 7. Mark transaction as processed
    await db.query(
        `UPDATE balance_history SET debt_added = TRUE WHERE id = $1`,
        [transactionId]
    );

    console.log('[DEBT-UPDATE] ✅ Success:', {
        transactionId,
        qrCode,
        phone,
        amount,
        newDebt: customer.debt
    });

    return {
        success: true,
        transactionId,
        qrCode,
        phone,
        amount,
        newDebt: customer.debt
    };
}

/**
 * GET /api/sepay/debt-summary
 * Get total debt for a phone number
 *
 * Logic:
 * - If admin has adjusted debt (debt_adjusted_at exists):
 *   total_debt = customers.debt (baseline) + sum(transactions AFTER debt_adjusted_at)
 * - If no admin adjustment:
 *   total_debt = sum(ALL transactions)
 *
 * This ensures both admin adjustments AND new bank transfers are reflected correctly.
 */
router.get('/debt-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // Normalize phone: remove non-digits, handle Vietnam country code, remove leading 0
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = normalizedPhone.substring(2); // Remove country code 84
        }
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = normalizedPhone.substring(1); // Remove leading 0
        }

        console.log('[DEBT-SUMMARY] Fetching for phone:', phone, '-> normalized:', normalizedPhone);

        // 1. Get customer record with debt and debt_adjusted_at
        const customerResult = await db.query(
            `SELECT debt, debt_adjusted_at FROM customers WHERE phone = $1 OR phone = $2 ORDER BY debt DESC NULLS LAST LIMIT 1`,
            [normalizedPhone, '0' + normalizedPhone]
        );

        const customerDebt = customerResult.rows.length > 0
            ? (parseFloat(customerResult.rows[0].debt) || 0)
            : 0;
        const debtAdjustedAt = customerResult.rows.length > 0
            ? customerResult.rows[0].debt_adjusted_at
            : null;

        console.log('[DEBT-SUMMARY] Customer debt:', customerDebt, 'adjusted_at:', debtAdjustedAt);

        // 2. Find all QR codes linked to this phone
        const qrResult = await db.query(
            `SELECT unique_code FROM balance_customer_info WHERE customer_phone = $1 OR customer_phone = $2`,
            [normalizedPhone, '0' + normalizedPhone]
        );

        const qrCodes = qrResult.rows.map(r => (r.unique_code || '').toUpperCase()).filter(Boolean);
        console.log('[DEBT-SUMMARY] QR codes found:', qrCodes);

        // 3. Calculate transactions
        let transactions = [];
        let transactionsAfterAdjustment = 0;
        let allTransactionsTotal = 0;

        if (qrCodes.length > 0) {
            const placeholders = qrCodes.map((_, i) => `$${i + 1}`).join(', ');

            // Get ALL transactions for display
            const txQuery = `
                SELECT
                    id,
                    transfer_amount,
                    transaction_date,
                    content,
                    debt_added
                FROM balance_history
                WHERE transfer_type = 'in'
                  AND UPPER(SUBSTRING(content FROM 'N2[A-Za-z0-9]{16}')) IN (${placeholders})
                ORDER BY transaction_date DESC
                LIMIT 100
            `;
            const txResult = await db.query(txQuery, qrCodes);
            transactions = txResult.rows;

            // Calculate total of ALL transactions
            allTransactionsTotal = transactions.reduce((sum, t) => sum + (parseInt(t.transfer_amount) || 0), 0);

            // If admin has adjusted, calculate transactions AFTER the adjustment
            if (debtAdjustedAt) {
                transactionsAfterAdjustment = transactions
                    .filter(t => new Date(t.transaction_date) > new Date(debtAdjustedAt))
                    .reduce((sum, t) => sum + (parseInt(t.transfer_amount) || 0), 0);

                console.log('[DEBT-SUMMARY] Transactions after adjustment:', transactionsAfterAdjustment);
            }
        }

        // 4. Calculate total debt
        let totalDebt;
        let source;

        if (debtAdjustedAt) {
            // Admin has adjusted: baseline + new transactions
            totalDebt = customerDebt + transactionsAfterAdjustment;
            source = 'admin_adjusted_plus_new';
            console.log('[DEBT-SUMMARY] Using admin baseline + new transactions:', customerDebt, '+', transactionsAfterAdjustment, '=', totalDebt);
        } else if (qrCodes.length > 0) {
            // No adjustment: use all transactions
            totalDebt = allTransactionsTotal;
            source = 'balance_history';
            console.log('[DEBT-SUMMARY] Using all transactions:', totalDebt);
        } else {
            // No QR codes, no adjustment: use customers.debt as fallback
            totalDebt = customerDebt;
            source = customerDebt > 0 ? 'customers_table' : 'no_data';
            console.log('[DEBT-SUMMARY] Fallback to customers.debt:', totalDebt);
        }

        res.json({
            success: true,
            data: {
                phone,
                total_debt: totalDebt,
                baseline_debt: debtAdjustedAt ? customerDebt : null,
                new_transactions: debtAdjustedAt ? transactionsAfterAdjustment : null,
                debt_adjusted_at: debtAdjustedAt,
                transactions: transactions.map(t => ({
                    id: t.id,
                    amount: parseInt(t.transfer_amount) || 0,
                    date: t.transaction_date,
                    content: t.content,
                    debt_added: t.debt_added
                })),
                transaction_count: transactions.length,
                source
            }
        });

    } catch (error) {
        console.error('[DEBT-SUMMARY] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch debt summary',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/debt-summary-batch
 * Get total debt for multiple phone numbers in ONE request
 * Reduces 80 API calls → 1 API call
 *
 * Body: { phones: ["0901234567", "0912345678", ...] }
 * Response: {
 *   success: true,
 *   data: {
 *     "901234567": { total_debt: 500000, source: "balance_history" },
 *     "912345678": { total_debt: 0, source: "no_data" },
 *     ...
 *   }
 * }
 */
router.post('/debt-summary-batch', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phones } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phones (array)'
        });
    }

    // Limit to 200 phones per request
    if (phones.length > 200) {
        return res.status(400).json({
            success: false,
            error: 'Too many phones. Maximum 200 per request.'
        });
    }

    try {
        const results = {};

        // Normalize all phones
        const normalizedPhones = phones.map(phone => {
            let normalized = (phone || '').replace(/\D/g, '');
            if (normalized.startsWith('84') && normalized.length > 9) {
                normalized = normalized.substring(2);
            }
            if (normalized.startsWith('0')) {
                normalized = normalized.substring(1);
            }
            return normalized;
        }).filter(p => p.length >= 9);

        const uniquePhones = [...new Set(normalizedPhones)];

        if (uniquePhones.length === 0) {
            return res.json({ success: true, data: {} });
        }

        // 1. Batch query customers table for all phones
        const phoneConditions = uniquePhones.flatMap(p => [p, '0' + p]);
        const customerPlaceholders = phoneConditions.map((_, i) => `$${i + 1}`).join(', ');

        const customerQuery = `
            SELECT phone, debt, debt_adjusted_at
            FROM customers
            WHERE phone IN (${customerPlaceholders})
        `;
        const customerResult = await db.query(customerQuery, phoneConditions);

        // Build customer map
        const customerMap = {};
        customerResult.rows.forEach(row => {
            let normalizedPhone = row.phone.replace(/\D/g, '');
            if (normalizedPhone.startsWith('0')) {
                normalizedPhone = normalizedPhone.substring(1);
            }
            // Keep the one with higher debt or has adjustment
            if (!customerMap[normalizedPhone] ||
                (row.debt || 0) > (customerMap[normalizedPhone].debt || 0) ||
                row.debt_adjusted_at) {
                customerMap[normalizedPhone] = {
                    debt: parseFloat(row.debt) || 0,
                    debt_adjusted_at: row.debt_adjusted_at
                };
            }
        });

        // 2. Batch query QR codes for all phones
        const qrQuery = `
            SELECT customer_phone, unique_code
            FROM balance_customer_info
            WHERE customer_phone IN (${customerPlaceholders})
        `;
        const qrResult = await db.query(qrQuery, phoneConditions);

        // Build QR map: phone -> [qr_codes]
        const qrMap = {};
        qrResult.rows.forEach(row => {
            let normalizedPhone = (row.customer_phone || '').replace(/\D/g, '');
            if (normalizedPhone.startsWith('0')) {
                normalizedPhone = normalizedPhone.substring(1);
            }
            if (!qrMap[normalizedPhone]) {
                qrMap[normalizedPhone] = [];
            }
            if (row.unique_code) {
                qrMap[normalizedPhone].push(row.unique_code.toUpperCase());
            }
        });

        // 3. Get all unique QR codes and batch query transactions
        const allQRCodes = [...new Set(Object.values(qrMap).flat())];

        let transactionMap = {}; // qrCode -> total_amount
        if (allQRCodes.length > 0) {
            const qrPlaceholders = allQRCodes.map((_, i) => `$${i + 1}`).join(', ');
            const txQuery = `
                SELECT
                    UPPER(SUBSTRING(content FROM 'N2[A-Za-z0-9]{16}')) as qr_code,
                    SUM(transfer_amount) as total_amount
                FROM balance_history
                WHERE transfer_type = 'in'
                  AND UPPER(SUBSTRING(content FROM 'N2[A-Za-z0-9]{16}')) IN (${qrPlaceholders})
                GROUP BY UPPER(SUBSTRING(content FROM 'N2[A-Za-z0-9]{16}'))
            `;
            const txResult = await db.query(txQuery, allQRCodes);

            txResult.rows.forEach(row => {
                if (row.qr_code) {
                    transactionMap[row.qr_code] = parseInt(row.total_amount) || 0;
                }
            });
        }

        // 4. Calculate debt for each phone
        for (const phone of uniquePhones) {
            const customer = customerMap[phone] || { debt: 0, debt_adjusted_at: null };
            const qrCodes = qrMap[phone] || [];

            let totalDebt = 0;
            let source = 'no_data';

            if (customer.debt_adjusted_at) {
                // Admin adjusted: use customer.debt as baseline
                // Note: For batch, we simplify and just use customer.debt
                totalDebt = customer.debt;
                source = 'admin_adjusted';
            } else if (qrCodes.length > 0) {
                // Sum transactions from all QR codes
                totalDebt = qrCodes.reduce((sum, qr) => sum + (transactionMap[qr] || 0), 0);
                source = totalDebt > 0 ? 'balance_history' : 'no_transactions';
            } else {
                // Fallback to customer.debt
                totalDebt = customer.debt;
                source = customer.debt > 0 ? 'customers_table' : 'no_data';
            }

            results[phone] = {
                total_debt: totalDebt,
                source: source
            };
        }

        // Log summary (not individual phones to reduce noise)
        console.log(`[DEBT-SUMMARY-BATCH] Processed ${uniquePhones.length} phones`);

        res.json({
            success: true,
            data: results,
            count: Object.keys(results).length
        });

    } catch (error) {
        console.error('[DEBT-SUMMARY-BATCH] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch debt summary batch',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/customer-info/:uniqueCode
 * Lấy thông tin khách hàng theo mã giao dịch
 */
router.get('/customer-info/:uniqueCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode } = req.params;

    try {
        const result = await db.query(
            'SELECT unique_code, customer_name, customer_phone, updated_at FROM balance_customer_info WHERE unique_code = $1',
            [uniqueCode]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error fetching:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer info',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/customer-info
 * Lưu hoặc cập nhật thông tin khách hàng
 */
router.post('/customer-info', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode, customerName, customerPhone } = req.body;

    try {
        // Validate input
        if (!uniqueCode) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: uniqueCode'
            });
        }

        // Insert or update customer info
        const query = `
            INSERT INTO balance_customer_info (unique_code, customer_name, customer_phone)
            VALUES ($1, $2, $3)
            ON CONFLICT (unique_code)
            DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `;

        const result = await db.query(query, [
            uniqueCode,
            customerName || null,
            customerPhone || null
        ]);

        console.log('[CUSTOMER-INFO] ✅ Saved:', {
            uniqueCode,
            customerName,
            customerPhone
        });

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error saving:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save customer info',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/customer-info
 * Lấy tất cả thông tin khách hàng
 */
router.get('/customer-info', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        const result = await db.query(
            'SELECT unique_code, customer_name, customer_phone, updated_at FROM balance_customer_info ORDER BY updated_at DESC'
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('[CUSTOMER-INFO] Error fetching all:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch customer info',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/transaction-by-code/:uniqueCode
 * Lấy thông tin giao dịch theo unique code (N2XXXXXXXXXXXXXXXX)
 * Used to get transfer_amount when updating customer debt retroactively
 */
router.get('/transaction-by-code/:uniqueCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { uniqueCode } = req.params;

    if (!uniqueCode) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: uniqueCode'
        });
    }

    try {
        // Find transaction where content contains the unique code
        const query = `
            SELECT
                id,
                sepay_id,
                gateway,
                transaction_date,
                account_number,
                code,
                content,
                transfer_type,
                transfer_amount,
                accumulated,
                sub_account,
                reference_code,
                description,
                created_at
            FROM balance_history
            WHERE content LIKE '%' || $1 || '%'
            ORDER BY transaction_date DESC
            LIMIT 1
        `;

        const result = await db.query(query, [uniqueCode]);

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'No transaction found with this unique code'
            });
        }

        console.log('[TRANSACTION-BY-CODE] ✅ Found transaction:', {
            uniqueCode,
            id: result.rows[0].id,
            transfer_type: result.rows[0].transfer_type,
            transfer_amount: result.rows[0].transfer_amount
        });

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error('[TRANSACTION-BY-CODE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction',
            message: error.message
        });
    }
});

/**
 * 🆕 GET /api/sepay/transactions-by-phone
 * Lấy lịch sử giao dịch theo số điện thoại khách hàng
 * Query params:
 * - phone: Số điện thoại khách hàng (required)
 * - limit: Số lượng giao dịch tối đa (default: 50, max: 200)
 */
router.get('/transactions-by-phone', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, limit = 50 } = req.query;

    // Validate phone number
    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // Validate limit
        const queryLimit = Math.min(parseInt(limit) || 50, 200);

        // Query to find all transactions for this phone number
        // Join balance_history with balance_customer_info by matching unique code from content
        // Unique code format: N2XXXXXXXXXXXXXXXX (N2 + 16 alphanumeric chars)
        const query = `
            SELECT
                bh.id,
                bh.sepay_id,
                bh.gateway,
                bh.transaction_date,
                bh.account_number,
                bh.code,
                bh.content,
                bh.transfer_type,
                bh.transfer_amount,
                bh.accumulated,
                bh.sub_account,
                bh.reference_code,
                bh.description,
                bh.created_at,
                bci.unique_code,
                bci.customer_name,
                bci.customer_phone
            FROM balance_history bh
            INNER JOIN balance_customer_info bci
                ON UPPER(bci.unique_code) = UPPER((regexp_match(bh.content, 'N2[A-Za-z0-9]{16}', 'i'))[1])
            WHERE bci.customer_phone = $1
            ORDER BY bh.transaction_date DESC
            LIMIT $2
        `;

        const result = await db.query(query, [phone, queryLimit]);

        // Calculate statistics
        let totalIn = 0;
        let totalOut = 0;
        let totalInCount = 0;
        let totalOutCount = 0;

        result.rows.forEach(row => {
            if (row.transfer_type === 'in') {
                totalIn += parseInt(row.transfer_amount) || 0;
                totalInCount++;
            } else {
                totalOut += parseInt(row.transfer_amount) || 0;
                totalOutCount++;
            }
        });

        console.log('[TRANSACTIONS-BY-PHONE] ✅ Found transactions:', {
            phone,
            count: result.rows.length,
            totalIn,
            totalOut
        });

        res.json({
            success: true,
            data: result.rows,
            statistics: {
                total_transactions: result.rows.length,
                total_in_count: totalInCount,
                total_out_count: totalOutCount,
                total_in: totalIn,
                total_out: totalOut,
                net_change: totalIn - totalOut
            },
            customer: {
                phone: phone,
                name: result.rows.length > 0 ? result.rows[0].customer_name : null
            }
        });

    } catch (error) {
        console.error('[TRANSACTIONS-BY-PHONE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transactions',
            message: error.message
        });
    }
});

/**
 * 🆕 POST /api/sepay/update-debt
 * Admin endpoint to manually update customer debt
 * This updates the customers.debt field directly
 */
router.post('/update-debt', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone, new_debt, reason } = req.body;

    if (!phone || new_debt === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameters: phone, new_debt'
        });
    }

    try {
        // Normalize phone
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = normalizedPhone.substring(2);
        }
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = normalizedPhone.substring(1);
        }

        const newDebtValue = parseFloat(new_debt) || 0;

        console.log('[UPDATE-DEBT] Updating debt for phone:', normalizedPhone, 'to:', newDebtValue, 'reason:', reason);

        // Get current debt first - ORDER BY debt DESC to get the highest value (most relevant record)
        const currentResult = await db.query(
            `SELECT id, phone, debt FROM customers WHERE phone = $1 OR phone = $2 ORDER BY debt DESC NULLS LAST LIMIT 1`,
            [normalizedPhone, '0' + normalizedPhone]
        );
        const oldDebt = currentResult.rows.length > 0 ? (parseFloat(currentResult.rows[0].debt) || 0) : 0;
        const existingCustomerId = currentResult.rows.length > 0 ? currentResult.rows[0].id : null;
        const existingPhone = currentResult.rows.length > 0 ? currentResult.rows[0].phone : null;

        let updateResult;
        if (existingCustomerId) {
            // Customer exists - UPDATE ALL matching records (both phone formats)
            // Set debt_adjusted_at to mark when admin adjusted (for calculating new transactions after)
            updateResult = await db.query(`
                UPDATE customers
                SET debt = $1, updated_at = CURRENT_TIMESTAMP, debt_adjusted_at = CURRENT_TIMESTAMP
                WHERE phone = $2 OR phone = $3
                RETURNING *
            `, [newDebtValue, normalizedPhone, '0' + normalizedPhone]);
            console.log('[UPDATE-DEBT] Updated', updateResult.rowCount, 'customer records');
        } else {
            // Customer doesn't exist - INSERT new record with debt_adjusted_at
            updateResult = await db.query(`
                INSERT INTO customers (phone, debt, created_at, updated_at, debt_adjusted_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING *
            `, [normalizedPhone, newDebtValue]);
        }

        // Log the change to debt_adjustment_log table
        const changeAmount = newDebtValue - oldDebt;
        try {
            await db.query(`
                INSERT INTO debt_adjustment_log (phone, old_debt, new_debt, change_amount, reason, adjusted_by)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [normalizedPhone, oldDebt, newDebtValue, changeAmount, reason || 'Admin manual adjustment', 'admin']);
            console.log('[UPDATE-DEBT] ✅ History logged to debt_adjustment_log');
        } catch (logError) {
            // Table might not exist yet, just log to console
            console.warn('[UPDATE-DEBT] Could not log to debt_adjustment_log:', logError.message);
        }

        console.log('[UPDATE-DEBT] ✅ Debt updated:', {
            phone: normalizedPhone,
            old_debt: oldDebt,
            new_debt: newDebtValue,
            change: changeAmount,
            reason: reason || 'Admin manual adjustment'
        });

        res.json({
            success: true,
            data: {
                phone: normalizedPhone,
                old_debt: oldDebt,
                new_debt: newDebtValue,
                change: changeAmount
            },
            message: 'Debt updated successfully'
        });

    } catch (error) {
        console.error('[UPDATE-DEBT] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update debt',
            message: error.message
        });
    }
});

// =====================================================
// FAILED WEBHOOK QUEUE ENDPOINTS
// =====================================================

/**
 * Helper function: Save webhook to failed queue
 */
async function saveToFailedQueue(db, webhookData, errorMessage) {
    try {
        await db.query(`
            INSERT INTO failed_webhook_queue (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, last_error, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending'
            )
            ON CONFLICT DO NOTHING
        `, [
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
            errorMessage
        ]);
        console.log('[FAILED-QUEUE] ✅ Saved webhook to failed queue:', webhookData.id);
        return true;
    } catch (queueError) {
        console.error('[FAILED-QUEUE] ❌ Failed to save to queue:', queueError.message);
        return false;
    }
}

/**
 * GET /api/sepay/failed-queue
 * List all failed webhooks
 */
router.get('/failed-queue', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { status = 'pending', limit = 50, page = 1 } = req.query;

    try {
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM failed_webhook_queue WHERE status = $1`,
            [status]
        );
        const total = parseInt(countResult.rows[0].count);

        // Get items
        const result = await db.query(`
            SELECT
                id, sepay_id, gateway, transaction_date, account_number,
                reference_code, transfer_type, transfer_amount, content,
                status, retry_count, max_retries, last_error,
                created_at, last_retry_at
            FROM failed_webhook_queue
            WHERE status = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `, [status, limit, offset]);

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
        console.error('[FAILED-QUEUE] Error listing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list failed webhooks',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/failed-queue/:id/retry
 * Retry a specific failed webhook
 */
router.post('/failed-queue/:id/retry', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { id } = req.params;

    try {
        // Get failed webhook
        const queueResult = await db.query(
            `SELECT * FROM failed_webhook_queue WHERE id = $1`,
            [id]
        );

        if (queueResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Failed webhook not found'
            });
        }

        const failedWebhook = queueResult.rows[0];

        // Check max retries
        if (failedWebhook.retry_count >= failedWebhook.max_retries) {
            return res.status(400).json({
                success: false,
                error: 'Max retries exceeded',
                retry_count: failedWebhook.retry_count,
                max_retries: failedWebhook.max_retries
            });
        }

        // Update status to processing
        await db.query(
            `UPDATE failed_webhook_queue SET status = 'processing', last_retry_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );

        // Try to insert into balance_history
        const webhookData = failedWebhook.raw_data;

        const insertQuery = `
            INSERT INTO balance_history (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, webhook_received_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
            )
            ON CONFLICT (sepay_id) DO NOTHING
            RETURNING id
        `;

        const values = [
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
            JSON.stringify(webhookData)
        ];

        const result = await db.query(insertQuery, values);

        if (result.rows.length > 0) {
            // Success - update queue status
            await db.query(`
                UPDATE failed_webhook_queue
                SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
                WHERE id = $1
            `, [id]);

            console.log('[FAILED-QUEUE] ✅ Retry successful for queue ID:', id);

            res.json({
                success: true,
                message: 'Webhook retry successful',
                balance_history_id: result.rows[0].id
            });
        } else {
            // Duplicate or other issue
            await db.query(`
                UPDATE failed_webhook_queue
                SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1,
                    last_error = 'Duplicate - already exists in balance_history'
                WHERE id = $1
            `, [id]);

            res.json({
                success: true,
                message: 'Transaction already exists in balance_history',
                duplicate: true
            });
        }

    } catch (error) {
        console.error('[FAILED-QUEUE] Retry error:', error);

        // Update retry count and error
        await db.query(`
            UPDATE failed_webhook_queue
            SET status = 'pending', retry_count = retry_count + 1, last_error = $2
            WHERE id = $1
        `, [id, error.message]);

        res.status(500).json({
            success: false,
            error: 'Retry failed',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/failed-queue/retry-all
 * Retry all pending failed webhooks
 */
router.post('/failed-queue/retry-all', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Get all pending webhooks that haven't exceeded max retries
        const pendingResult = await db.query(`
            SELECT id FROM failed_webhook_queue
            WHERE status = 'pending' AND retry_count < max_retries
            ORDER BY created_at ASC
            LIMIT 100
        `);

        const results = {
            total: pendingResult.rows.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (const row of pendingResult.rows) {
            try {
                // Simplified retry - call the same logic as single retry
                const queueResult = await db.query(
                    `SELECT raw_data FROM failed_webhook_queue WHERE id = $1`,
                    [row.id]
                );

                if (queueResult.rows.length === 0) continue;

                const webhookData = queueResult.rows[0].raw_data;

                const insertResult = await db.query(`
                    INSERT INTO balance_history (
                        sepay_id, gateway, transaction_date, account_number,
                        code, content, transfer_type, transfer_amount,
                        accumulated, sub_account, reference_code, description,
                        raw_data, webhook_received_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                    ON CONFLICT (sepay_id) DO NOTHING
                    RETURNING id
                `, [
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
                    JSON.stringify(webhookData)
                ]);

                await db.query(`
                    UPDATE failed_webhook_queue
                    SET status = 'success', processed_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1
                    WHERE id = $1
                `, [row.id]);

                results.success++;
                results.details.push({ id: row.id, status: 'success' });

            } catch (retryError) {
                await db.query(`
                    UPDATE failed_webhook_queue
                    SET retry_count = retry_count + 1, last_error = $2
                    WHERE id = $1
                `, [row.id, retryError.message]);

                results.failed++;
                results.details.push({ id: row.id, status: 'failed', error: retryError.message });
            }
        }

        res.json({
            success: true,
            message: `Retry complete: ${results.success}/${results.total} successful`,
            results
        });

    } catch (error) {
        console.error('[FAILED-QUEUE] Retry all error:', error);
        res.status(500).json({
            success: false,
            error: 'Retry all failed',
            message: error.message
        });
    }
});

// =====================================================
// REFERENCE CODE GAP DETECTION
// =====================================================

/**
 * GET /api/sepay/detect-gaps
 * Detect gaps in reference codes
 */
router.get('/detect-gaps', async (req, res) => {
    const db = req.app.locals.chatDb;

    try {
        // Get all reference codes, sorted
        const result = await db.query(`
            SELECT reference_code, sepay_id, transaction_date
            FROM balance_history
            WHERE reference_code IS NOT NULL AND reference_code ~ '^[0-9]+$'
            ORDER BY CAST(reference_code AS INTEGER) ASC
        `);

        const gaps = [];
        const rows = result.rows;

        for (let i = 1; i < rows.length; i++) {
            const prev = parseInt(rows[i - 1].reference_code);
            const curr = parseInt(rows[i].reference_code);

            // Check for gaps
            if (curr - prev > 1) {
                for (let missing = prev + 1; missing < curr; missing++) {
                    gaps.push({
                        missing_reference_code: String(missing),
                        previous_reference_code: rows[i - 1].reference_code,
                        next_reference_code: rows[i].reference_code,
                        previous_date: rows[i - 1].transaction_date,
                        next_date: rows[i].transaction_date
                    });
                }
            }
        }

        // Store detected gaps
        for (const gap of gaps) {
            try {
                await db.query(`
                    INSERT INTO reference_code_gaps (missing_reference_code, previous_reference_code, next_reference_code)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (missing_reference_code) DO NOTHING
                `, [gap.missing_reference_code, gap.previous_reference_code, gap.next_reference_code]);
            } catch (gapError) {
                // Table might not exist, ignore
            }
        }

        res.json({
            success: true,
            total_gaps: gaps.length,
            gaps: gaps.slice(0, 100), // Limit response size
            message: gaps.length > 0 ? `Found ${gaps.length} missing reference codes` : 'No gaps detected'
        });

    } catch (error) {
        console.error('[DETECT-GAPS] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to detect gaps',
            message: error.message
        });
    }
});

/**
 * GET /api/sepay/gaps
 * List all detected gaps
 */
router.get('/gaps', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { status = 'detected' } = req.query;

    try {
        const result = await db.query(`
            SELECT * FROM reference_code_gaps
            WHERE status = $1
            ORDER BY CAST(missing_reference_code AS INTEGER) ASC
            LIMIT 100
        `, [status]);

        res.json({
            success: true,
            data: result.rows,
            total: result.rows.length
        });

    } catch (error) {
        console.error('[GAPS] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list gaps',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/gaps/:referenceCode/ignore
 * Mark a gap as ignored (transaction doesn't exist)
 */
router.post('/gaps/:referenceCode/ignore', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { referenceCode } = req.params;

    try {
        await db.query(`
            UPDATE reference_code_gaps
            SET status = 'ignored', resolved_at = CURRENT_TIMESTAMP
            WHERE missing_reference_code = $1
        `, [referenceCode]);

        res.json({
            success: true,
            message: `Gap ${referenceCode} marked as ignored`
        });

    } catch (error) {
        console.error('[GAPS] Ignore error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to ignore gap',
            message: error.message
        });
    }
});

/**
 * POST /api/sepay/fetch-by-reference/:referenceCode
 * Fetch transaction from Sepay API by reference code and insert to database
 */
router.post('/fetch-by-reference/:referenceCode', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { referenceCode } = req.params;

    console.log('[FETCH-BY-REF] Fetching transaction with reference code:', referenceCode);

    try {
        // Get Sepay API credentials from environment
        const SEPAY_API_KEY = process.env.SEPAY_API_KEY;
        const SEPAY_ACCOUNT_NUMBER = process.env.SEPAY_ACCOUNT_NUMBER || '5354IBT1';

        if (!SEPAY_API_KEY) {
            return res.status(400).json({
                success: false,
                error: 'SEPAY_API_KEY not configured'
            });
        }

        // Call Sepay API to get transaction by reference code
        // Sepay API: GET /userapi/transactions/list?account_number=xxx&reference_number=xxx
        const sepayUrl = `https://my.sepay.vn/userapi/transactions/list?account_number=${SEPAY_ACCOUNT_NUMBER}&reference_number=${referenceCode}`;

        console.log('[FETCH-BY-REF] Calling Sepay API:', sepayUrl);

        const sepayResponse = await fetch(sepayUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${SEPAY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!sepayResponse.ok) {
            const errorText = await sepayResponse.text();
            console.error('[FETCH-BY-REF] Sepay API error:', sepayResponse.status, errorText);
            return res.status(sepayResponse.status).json({
                success: false,
                error: `Sepay API error: ${sepayResponse.status}`,
                message: errorText
            });
        }

        const sepayData = await sepayResponse.json();
        console.log('[FETCH-BY-REF] Sepay response:', JSON.stringify(sepayData).substring(0, 500));

        // Check if transaction found
        if (!sepayData.transactions || sepayData.transactions.length === 0) {
            return res.json({
                success: false,
                error: 'Transaction not found in Sepay',
                message: `Không tìm thấy giao dịch với mã tham chiếu ${referenceCode}`
            });
        }

        const transaction = sepayData.transactions[0];

        // Insert transaction to database
        const insertQuery = `
            INSERT INTO balance_history (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, webhook_received_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
            )
            ON CONFLICT (sepay_id) DO NOTHING
            RETURNING id
        `;

        const values = [
            transaction.id,
            transaction.gateway || transaction.bank_brand_name,
            transaction.transaction_date,
            transaction.account_number || SEPAY_ACCOUNT_NUMBER,
            transaction.code || null,
            transaction.transaction_content || transaction.content || null,
            transaction.amount_in > 0 ? 'in' : 'out',
            transaction.amount_in > 0 ? transaction.amount_in : transaction.amount_out,
            transaction.accumulated || 0,
            transaction.sub_account || null,
            transaction.reference_number || referenceCode,
            transaction.description || null,
            JSON.stringify(transaction)
        ];

        const result = await db.query(insertQuery, values);

        if (result.rows.length > 0) {
            // Mark gap as resolved
            await db.query(`
                UPDATE reference_code_gaps
                SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP
                WHERE missing_reference_code = $1
            `, [referenceCode]);

            console.log('[FETCH-BY-REF] ✅ Transaction inserted:', result.rows[0].id);

            res.json({
                success: true,
                message: `Đã lấy được giao dịch ${referenceCode}`,
                id: result.rows[0].id,
                transaction: {
                    id: result.rows[0].id,
                    reference_code: referenceCode,
                    amount: transaction.amount_in > 0 ? transaction.amount_in : transaction.amount_out,
                    type: transaction.amount_in > 0 ? 'in' : 'out'
                }
            });
        } else {
            res.json({
                success: true,
                message: 'Giao dịch đã tồn tại trong hệ thống',
                duplicate: true
            });
        }

    } catch (error) {
        console.error('[FETCH-BY-REF] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch transaction',
            message: error.message
        });
    }
});

module.exports = router;
