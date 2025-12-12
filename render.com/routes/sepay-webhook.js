// =====================================================
// SEPAY WEBHOOK ROUTES
// Nhận và xử lý webhook từ Sepay
// =====================================================

const express = require('express');
const router = express.Router();

/**
 * POST /api/sepay/webhook
 * Nhận webhook từ Sepay khi có giao dịch mới
 *
 * Docs: https://docs.sepay.vn/tich-hop-webhooks.html
 */
router.post('/webhook', async (req, res) => {
    const db = req.app.locals.chatDb; // Sử dụng PostgreSQL connection từ server.js

    // Log request để debug
    console.log('[SEPAY-WEBHOOK] Received webhook:', {
        method: req.method,
        headers: req.headers,
        body: req.body
    });

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

        // Trả về response theo spec của Sepay
        res.status(200).json({
            success: true,
            id: insertedId,
            message: 'Transaction recorded successfully'
        });

    } catch (error) {
        console.error('[SEPAY-WEBHOOK] ❌ Error processing webhook:', error);

        // Log error
        await logWebhook(db, req.body?.id, req, 500,
            { error: 'Internal server error' },
            error.message
        );

        res.status(500).json({
            success: false,
            error: 'Failed to process webhook',
            message: error.message
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
 * Get total debt and transaction list for a phone number
 * Calculates from balance_history instead of reading from customers.debt
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

        // 1. Find all QR codes linked to this phone (try both normalized and with leading 0)
        const qrResult = await db.query(
            `SELECT unique_code FROM balance_customer_info WHERE customer_phone = $1 OR customer_phone = $2`,
            [normalizedPhone, '0' + normalizedPhone]
        );

        const qrCodes = qrResult.rows.map(r => (r.unique_code || '').toUpperCase()).filter(Boolean);
        console.log('[DEBT-SUMMARY] QR codes found:', qrCodes);

        if (qrCodes.length === 0) {
            // Fallback: Try to get debt from customers table (try both with and without leading 0)
            const customerResult = await db.query(
                `SELECT debt FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`,
                [normalizedPhone, '0' + normalizedPhone]
            );

            const customerDebt = customerResult.rows.length > 0
                ? (parseFloat(customerResult.rows[0].debt) || 0)
                : 0;

            console.log('[DEBT-SUMMARY] No QR codes, fallback to customers.debt:', customerDebt);

            return res.json({
                success: true,
                data: {
                    phone,
                    total_debt: customerDebt,
                    transactions: [],
                    transaction_count: 0,
                    source: 'customers_table'
                }
            });
        }

        // 2. Find ALL incoming transactions with these QR codes (calculate total from transactions)
        const placeholders = qrCodes.map((_, i) => `$${i + 1}`).join(', ');
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
        const transactions = txResult.rows;

        // 3. Calculate total debt from transactions
        const totalDebt = transactions.reduce((sum, t) => sum + (parseInt(t.transfer_amount) || 0), 0);

        console.log('[DEBT-SUMMARY] Found:', {
            phone,
            transactionCount: transactions.length,
            totalDebt
        });

        res.json({
            success: true,
            data: {
                phone,
                total_debt: totalDebt,
                transactions: transactions.map(t => ({
                    id: t.id,
                    amount: parseInt(t.transfer_amount) || 0,
                    date: t.transaction_date,
                    content: t.content,
                    debt_added: t.debt_added
                })),
                transaction_count: transactions.length
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

        // Get current debt first
        const currentResult = await db.query(
            `SELECT debt FROM customers WHERE phone = $1 OR phone = $2 LIMIT 1`,
            [normalizedPhone, '0' + normalizedPhone]
        );
        const oldDebt = currentResult.rows.length > 0 ? (parseFloat(currentResult.rows[0].debt) || 0) : 0;

        // Update or insert customer debt
        const updateResult = await db.query(`
            INSERT INTO customers (phone, debt, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (phone) DO UPDATE SET
                debt = $2,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [normalizedPhone, newDebtValue]);

        // Log the change to debt_adjustment_log table (if exists) or just log
        console.log('[UPDATE-DEBT] ✅ Debt updated:', {
            phone: normalizedPhone,
            old_debt: oldDebt,
            new_debt: newDebtValue,
            change: newDebtValue - oldDebt,
            reason: reason || 'Admin manual adjustment'
        });

        res.json({
            success: true,
            data: {
                phone: normalizedPhone,
                old_debt: oldDebt,
                new_debt: newDebtValue,
                change: newDebtValue - oldDebt
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

module.exports = router;
