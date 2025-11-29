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

        // Kiểm tra duplicate transaction bằng sepay_id
        const existingCheck = await db.query(
            'SELECT id FROM balance_history WHERE sepay_id = $1',
            [webhookData.id]
        );

        if (existingCheck.rows.length > 0) {
            console.log('[SEPAY-WEBHOOK] Duplicate transaction ignored:', webhookData.id);
            await logWebhook(db, webhookData.id, req, 200,
                { success: true, message: 'Duplicate transaction ignored' },
                null
            );
            return res.status(200).json({
                success: true,
                message: 'Duplicate transaction - already processed'
            });
        }

        // Insert vào database
        const insertQuery = `
            INSERT INTO balance_history (
                sepay_id, gateway, transaction_date, account_number,
                code, content, transfer_type, transfer_amount,
                accumulated, sub_account, reference_code, description,
                raw_data, webhook_received_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP
            ) RETURNING id
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

        // Broadcast realtime update nếu cần (SSE)
        if (req.app.locals.broadcastToUsers) {
            // Broadcast to all admin users or specific users
            // Bạn có thể customize logic này
            console.log('[SEPAY-WEBHOOK] Broadcasting realtime update...');
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

module.exports = router;
