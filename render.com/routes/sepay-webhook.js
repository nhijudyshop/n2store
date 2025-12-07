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

        // 🆕 Auto-update customer debt if transaction matches a QR code
        if (webhookData.transferType === 'in' && webhookData.content) {
            try {
                await processDebtUpdate(db, webhookData.content, insertedId);
            } catch (debtError) {
                // Log error but don't fail the webhook
                console.error('[SEPAY-WEBHOOK] ⚠️ Debt update failed (non-critical):', debtError.message);
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
 * 🆕 Helper function: Process debt update when receiving new transaction
 * This function:
 * 1. Extracts QR code from transaction content
 * 2. Finds the phone number associated with the QR code
 * 3. Finds all unprocessed transactions (debt_added = FALSE) for that phone
 * 4. Updates customer debt
 * 5. Marks transactions as processed (debt_added = TRUE)
 */
async function processDebtUpdate(db, content, transactionId) {
    // 1. Extract QR code from content (format: N2 + 16 alphanumeric chars)
    const qrCodeMatch = content.match(/N2[A-Z0-9]{16}/i);
    if (!qrCodeMatch) {
        console.log('[DEBT-UPDATE] No QR code found in content');
        return;
    }

    const qrCode = qrCodeMatch[0].toUpperCase();
    console.log('[DEBT-UPDATE] Found QR code:', qrCode);

    // 2. Find phone number associated with this QR code
    const customerInfoResult = await db.query(
        'SELECT customer_phone FROM balance_customer_info WHERE unique_code = $1',
        [qrCode]
    );

    if (customerInfoResult.rows.length === 0) {
        console.log('[DEBT-UPDATE] No phone number linked to QR code:', qrCode);
        return;
    }

    const phone = customerInfoResult.rows[0].customer_phone;
    if (!phone) {
        console.log('[DEBT-UPDATE] QR code exists but no phone number assigned');
        return;
    }

    console.log('[DEBT-UPDATE] Phone found for QR code:', phone);

    // 3. Find ALL QR codes linked to this phone
    const allQrCodesResult = await db.query(
        'SELECT unique_code FROM balance_customer_info WHERE customer_phone = $1',
        [phone]
    );
    const allQrCodes = allQrCodesResult.rows.map(r => r.unique_code);

    if (allQrCodes.length === 0) {
        console.log('[DEBT-UPDATE] No QR codes found for phone:', phone);
        return;
    }

    console.log('[DEBT-UPDATE] All QR codes for phone:', allQrCodes);

    // 4. Find all UNPROCESSED transactions (debt_added = FALSE or NULL) with these QR codes
    const placeholders = allQrCodes.map((_, i) => `$${i + 1}`).join(', ');
    const unprocessedQuery = `
        SELECT id, transfer_amount, content
        FROM balance_history
        WHERE transfer_type = 'in'
          AND (debt_added IS NULL OR debt_added = FALSE)
          AND (regexp_match(content, 'N2[A-Z0-9]{16}'))[1] IN (${placeholders})
    `;

    const unprocessedResult = await db.query(unprocessedQuery, allQrCodes);
    const unprocessedTransactions = unprocessedResult.rows;

    if (unprocessedTransactions.length === 0) {
        console.log('[DEBT-UPDATE] No unprocessed transactions found');
        return;
    }

    // 5. Calculate total amount to add to debt
    const totalToAdd = unprocessedTransactions.reduce((sum, t) =>
        sum + (parseInt(t.transfer_amount) || 0), 0
    );
    const transactionIds = unprocessedTransactions.map(t => t.id);

    console.log('[DEBT-UPDATE] Processing:', {
        phone,
        transactionsCount: transactionIds.length,
        totalToAdd,
        transactionIds
    });

    // 6. Update customer debt (atomic operation)
    // Use UPSERT: if customer doesn't exist, create with this debt
    const updateDebtQuery = `
        INSERT INTO customers (phone, name, debt, status, active)
        VALUES ($1, $1, $2, 'Bình thường', true)
        ON CONFLICT (phone) DO UPDATE SET
            debt = customers.debt + $2,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, phone, debt
    `;
    const updateResult = await db.query(updateDebtQuery, [phone, totalToAdd]);

    console.log('[DEBT-UPDATE] Customer debt updated:', updateResult.rows[0]);

    // 7. Mark transactions as processed (debt_added = TRUE)
    const markProcessedQuery = `
        UPDATE balance_history
        SET debt_added = TRUE
        WHERE id = ANY($1::int[])
    `;
    await db.query(markProcessedQuery, [transactionIds]);

    console.log('[DEBT-UPDATE] ✅ Debt update completed:', {
        phone,
        newDebt: updateResult.rows[0].debt,
        processedTransactions: transactionIds.length,
        totalAdded: totalToAdd
    });
}

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
                ON bci.unique_code = (regexp_match(bh.content, 'N2[A-Z0-9]{16}'))[1]
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
 * 🆕 GET /api/sepay/debt-summary
 * Lấy Tổng Công Nợ và danh sách GD đã cộng vào nợ theo số điện thoại
 * Query params:
 * - phone: Số điện thoại khách hàng (required)
 */
router.get('/debt-summary', async (req, res) => {
    const db = req.app.locals.chatDb;
    const { phone } = req.query;

    // Validate phone number
    if (!phone) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: phone'
        });
    }

    try {
        // 1. Lấy Tổng Công Nợ từ bảng customers
        const customerQuery = `
            SELECT id, phone, name, debt
            FROM customers
            WHERE phone = $1
            LIMIT 1
        `;
        const customerResult = await db.query(customerQuery, [phone]);

        const customer = customerResult.rows[0] || null;
        const totalDebt = customer ? (parseInt(customer.debt) || 0) : 0;

        // 2. Lấy tất cả mã QR (unique_code) liên kết với SĐT này
        const qrCodesQuery = `
            SELECT unique_code, customer_name, customer_phone
            FROM balance_customer_info
            WHERE customer_phone = $1
        `;
        const qrCodesResult = await db.query(qrCodesQuery, [phone]);
        const qrCodes = qrCodesResult.rows.map(r => r.unique_code);

        // 3. Lấy danh sách GD đã được cộng vào nợ (debt_added = TRUE)
        let transactions = [];

        if (qrCodes.length > 0) {
            // Build query to find transactions with these QR codes
            const placeholders = qrCodes.map((_, i) => `$${i + 1}`).join(', ');
            const transactionsQuery = `
                SELECT
                    bh.id,
                    bh.sepay_id,
                    bh.gateway,
                    bh.transaction_date,
                    bh.content,
                    bh.transfer_type,
                    bh.transfer_amount,
                    bh.debt_added,
                    bh.created_at,
                    (regexp_match(bh.content, 'N2[A-Z0-9]{16}'))[1] as qr_code
                FROM balance_history bh
                WHERE bh.transfer_type = 'in'
                  AND bh.debt_added = TRUE
                  AND (regexp_match(bh.content, 'N2[A-Z0-9]{16}'))[1] IN (${placeholders})
                ORDER BY bh.transaction_date DESC
                LIMIT 100
            `;

            const transactionsResult = await db.query(transactionsQuery, qrCodes);
            transactions = transactionsResult.rows;
        }

        // 4. Tính tổng từ các GD đã cộng (để verify)
        const totalFromTransactions = transactions.reduce((sum, t) =>
            sum + (parseInt(t.transfer_amount) || 0), 0
        );

        console.log('[DEBT-SUMMARY] ✅ Summary for phone:', {
            phone,
            totalDebt,
            transactionCount: transactions.length,
            totalFromTransactions,
            qrCodesCount: qrCodes.length
        });

        res.json({
            success: true,
            data: {
                phone,
                total_debt: totalDebt,
                customer: customer ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone
                } : null,
                qr_codes: qrCodes,
                transactions: transactions.map(t => ({
                    id: t.id,
                    qr_code: t.qr_code,
                    amount: parseInt(t.transfer_amount) || 0,
                    date: t.transaction_date,
                    content: t.content,
                    gateway: t.gateway
                })),
                transaction_count: transactions.length,
                total_from_transactions: totalFromTransactions
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

module.exports = router;
