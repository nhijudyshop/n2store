// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// ADMIN DATA MANAGEMENT API
// Browse and delete data from all PostgreSQL tables
// Based on actual database schema (48 items: 35 tables + 13 views)
// =====================================================

const express = require('express');
const router = express.Router();

// All manageable tables grouped by category (from actual DB)
// usedBy: which frontend pages consume this table's data
const TABLE_GROUPS = {
    'Customers': [
        { name: 'customers', label: 'Customers', pk: 'id', usedBy: 'customer-hub, orders-report, balance-history, issue-tracking' },
        { name: 'customer_activities', label: 'Customer Activities', pk: 'id', usedBy: 'customer-hub (timeline), orders-report' },
        { name: 'customer_notes', label: 'Customer Notes', pk: 'id', usedBy: 'customer-hub (ghi chú KH)' },
        { name: 'pending_customer_matches', label: 'Pending Customer Matches', pk: 'id', usedBy: 'balance-history (xác minh chuyển khoản)' },
        { name: 'pending_customers', label: 'Pending Customers', pk: 'id', usedBy: 'don-inbox (KH mới từ Facebook)' },
        { name: 'tpos_saved_customers', label: 'TPOS Saved Customers', pk: 'id', usedBy: 'customer-hub, orders-report (cache TPOS)' }
    ],
    'Wallet & Transactions': [
        { name: 'customer_wallets', label: 'Customer Wallets', pk: 'id', usedBy: 'customer-hub (ví KH), balance-history, orders-report' },
        { name: 'wallet_transactions', label: 'Wallet Transactions', pk: 'id', usedBy: 'customer-hub (lịch sử GD), balance-history (kế toán)' },
        { name: 'virtual_credits', label: 'Virtual Credits', pk: 'id', usedBy: 'customer-hub (tín dụng ảo), orders-report' },
        { name: 'wallet_adjustments', label: 'Wallet Adjustments', pk: 'id', usedBy: 'balance-history (điều chỉnh thủ công)' },
        { name: 'pending_wallet_withdrawals', label: 'Pending Withdrawals', pk: 'id', usedBy: 'balance-history, customer-hub (rút tiền chờ xử lý)' }
    ],
    'Balance & SePay': [
        { name: 'balance_history', label: 'Balance History', pk: 'id', usedBy: 'balance-history (lịch sử biến động số dư chính)' },
        { name: 'balance_customer_info', label: 'Balance Customer Info', pk: 'id', usedBy: 'balance-history (thông tin KH khi xác minh)' },
        { name: 'sepay_webhook_logs', label: 'SePay Webhook Logs', pk: 'id', usedBy: 'balance-history (log webhook thanh toán)' },
        { name: 'recent_transfer_phones', label: 'Recent Transfer Phones', pk: 'phone', usedBy: 'balance-history (gợi ý SĐT chuyển khoản)' },
        { name: 'transfer_stats', label: 'Transfer Stats', pk: 'id', usedBy: 'balance-history (thống kê chuyển khoản)' }
    ],
    'Support Tickets': [
        { name: 'customer_tickets', label: 'Customer Tickets', pk: 'id', usedBy: 'customer-hub (ticket CSKH), issue-tracking' }
    ],
    'Inbox & Conversations': [
        { name: 'inbox_groups', label: 'Inbox Groups', pk: 'id', usedBy: 'don-inbox (nhóm hội thoại)' },
        { name: 'conversation_labels', label: 'Conversation Labels', pk: 'conv_id', usedBy: 'don-inbox (nhãn hội thoại)' },
        { name: 'livestream_conversations', label: 'Livestream Conversations', pk: 'conv_id', usedBy: 'don-inbox (comment livestream)' }
    ],
    'Realtime Data': [
        { name: 'realtime_credentials', label: 'Realtime Credentials', pk: 'id', usedBy: 'Server (auto-reconnect Pancake/TPOS WebSocket)' },
        { name: 'realtime_updates', label: 'Realtime Updates', pk: 'id', usedBy: 'orders-report, soluong-live (SSE realtime)' },
        { name: 'realtime_kv', label: 'Realtime KV Store', pk: 'key', usedBy: 'orders-report (KPI state), soluong-live' }
    ],
    'KPI & Orders': [
        { name: 'kpi_base', label: 'KPI Base', pk: 'id', usedBy: 'orders-report Tab 1 (KPI hoa hồng)' },
        { name: 'kpi_statistics', label: 'KPI Statistics', pk: 'id', usedBy: 'orders-report Tab KPI (thống kê hiệu suất)' },
        { name: 'report_order_details', label: 'Report Order Details', pk: 'table_name', usedBy: 'orders-report Tab 1+3, order-management' },
        { name: 'return_orders', label: 'Return Orders', pk: 'id', usedBy: 'orders-report (đơn hoàn), order-management' }
    ],
    'Products & Tags': [
        { name: 'held_products', label: 'Held Products', pk: null, compositePk: ['order_id', 'product_id', 'user_id'], usedBy: 'orders-report Tab 1 (SP đang giữ), order-management' },
        { name: 'dropped_products', label: 'Dropped Products', pk: 'id', usedBy: 'orders-report Tab 1 (SP bị hủy)' },
        { name: 'tag_updates', label: 'Tag Updates', pk: 'id', usedBy: 'orders-report Tab 1 (cập nhật tag đơn)' },
        { name: 'note_snapshots', label: 'Note Snapshots', pk: 'order_id', usedBy: 'orders-report Tab 1 (ghi chú đơn hàng)' },
        { name: 'soluong_products', label: 'Soluong Products', pk: 'id', usedBy: 'soluong-live (quản lý số lượng SP)' },
        { name: 'soluong_meta', label: 'Soluong Meta', pk: 'key', usedBy: 'soluong-live (metadata số lượng)' }
    ],
    'Invoice Status': [
        { name: 'invoice_status', label: 'Invoice Status', pk: 'id', usedBy: 'orders-report Tab 1 (trạng thái đơn hàng)' },
        { name: 'invoice_sent_bills', label: 'Invoice Sent Bills', pk: 'id', usedBy: 'orders-report Tab 1 (đơn đã gửi bill)' },
        { name: 'invoice_status_delete', label: 'Invoice Status Delete', pk: 'id', usedBy: 'orders-report Tab 1 (đơn đã xóa/hủy)' }
    ],
    'Config & Admin': [
        { name: 'admin_settings', label: 'Admin Settings', pk: 'id', usedBy: 'balance-history (cài đặt auto-approve), orders-report' },
        { name: 'rfm_config', label: 'RFM Config', pk: 'id', usedBy: 'customer-hub (cấu hình phân khúc RFM)' }
    ],
    'Views (read-only)': [
        { name: 'balance_statistics', label: 'Balance Statistics', pk: null, isView: true, usedBy: 'balance-history (thống kê tổng hợp)' },
        { name: 'customer_360_summary', label: 'Customer 360 Summary', pk: null, isView: true, usedBy: 'customer-hub (tổng quan KH)' },
        { name: 'customer_activity_summary', label: 'Customer Activity Summary', pk: null, isView: true, usedBy: 'customer-hub (tóm tắt hoạt động)' },
        { name: 'customer_by_carrier', label: 'Customer By Carrier', pk: null, isView: true, usedBy: 'customer-hub (KH theo nhà vận chuyển)' },
        { name: 'customer_statistics', label: 'Customer Statistics', pk: null, isView: true, usedBy: 'customer-hub (thống kê KH)' },
        { name: 'daily_wallet_summary', label: 'Daily Wallet Summary', pk: null, isView: true, usedBy: 'balance-history (tổng hợp ví hàng ngày)' },
        { name: 'return_orders_by_date', label: 'Return Orders By Date', pk: null, isView: true, usedBy: 'orders-report (đơn hoàn theo ngày)' },
        { name: 'return_orders_statistics', label: 'Return Orders Statistics', pk: null, isView: true, usedBy: 'orders-report (thống kê đơn hoàn)' },
        { name: 'rfm_segment_distribution', label: 'RFM Segment Distribution', pk: null, isView: true, usedBy: 'customer-hub (phân bố RFM)' },
        { name: 'rfm_segment_mapping', label: 'RFM Segment Mapping', pk: null, isView: true, usedBy: 'customer-hub (mapping phân khúc)' },
        { name: 'ticket_resolution_metrics', label: 'Ticket Resolution Metrics', pk: null, isView: true, usedBy: 'customer-hub (hiệu suất xử lý ticket)' },
        { name: 'ticket_statistics', label: 'Ticket Statistics', pk: null, isView: true, usedBy: 'customer-hub (thống kê ticket)' },
        { name: 'wallet_statistics', label: 'Wallet Statistics', pk: null, isView: true, usedBy: 'customer-hub (thống kê ví)' }
    ]
};

// Flatten for quick lookup
const ALL_TABLES = {};
for (const group of Object.values(TABLE_GROUPS)) {
    for (const t of group) {
        ALL_TABLES[t.name] = t;
    }
}

/**
 * GET /api/admin/data/tables
 * List all tables with row counts
 */
router.get('/tables', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        // Get row counts for base tables
        const tableResult = await db.query(`
            SELECT relname as table_name, n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY relname
        `);

        const existingTables = {};
        for (const row of tableResult.rows) {
            existingTables[row.table_name] = parseInt(row.row_count) || 0;
        }

        // Also check views
        const viewResult = await db.query(`
            SELECT table_name
            FROM information_schema.views
            WHERE table_schema = 'public'
        `);
        for (const row of viewResult.rows) {
            if (!existingTables.hasOwnProperty(row.table_name)) {
                existingTables[row.table_name] = 0;
            }
        }

        // Build response grouped
        const groups = {};
        const registeredNames = new Set();
        for (const [groupName, tables] of Object.entries(TABLE_GROUPS)) {
            groups[groupName] = tables.map(t => {
                registeredNames.add(t.name);
                return {
                    ...t,
                    exists: existingTables.hasOwnProperty(t.name),
                    rowCount: existingTables[t.name] || 0
                };
            });
        }

        // Auto-detect unregistered tables/views
        const viewNames = new Set(viewResult.rows.map(r => r.table_name));
        const otherTables = [];
        for (const [name, rowCount] of Object.entries(existingTables)) {
            if (!registeredNames.has(name)) {
                otherTables.push({
                    name,
                    label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    pk: 'id',
                    isView: viewNames.has(name),
                    usedBy: 'auto-detected',
                    exists: true,
                    rowCount
                });
            }
        }
        if (otherTables.length > 0) {
            otherTables.sort((a, b) => a.name.localeCompare(b.name));
            groups['Other (auto-detected)'] = otherTables;
        }

        res.json({ success: true, groups, totalTables: Object.keys(existingTables).length });
    } catch (error) {
        console.error('[ADMIN-DATA] Error listing tables:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/admin/data/browse/:table
 * Browse data from a specific table with pagination
 */
router.get('/browse/:table', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const tableName = req.params.table;
        // Validate: must be registered OR exist in database
        if (!ALL_TABLES[tableName]) {
            const checkExists = await db.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [tableName]
            );
            if (checkExists.rows.length === 0) {
                return res.status(400).json({ error: `Table "${tableName}" does not exist` });
            }
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        // Get columns info
        const colResult = await db.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
            ORDER BY ordinal_position
        `, [tableName]);

        if (colResult.rows.length === 0) {
            return res.json({ success: true, rows: [], columns: [], total: 0, message: 'Table does not exist or has no columns' });
        }

        const columns = colResult.rows;

        // Build search WHERE clause
        let whereClause = '';
        const queryParams = [];
        if (search) {
            const textColumns = columns.filter(c =>
                ['text', 'character varying', 'varchar', 'char'].includes(c.data_type)
            );
            if (textColumns.length > 0) {
                const conditions = textColumns.map((c, i) => {
                    queryParams.push(`%${search}%`);
                    return `"${c.column_name}"::text ILIKE $${i + 1}`;
                });
                whereClause = `WHERE ${conditions.join(' OR ')}`;
            }
        }

        // Count total
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM "${tableName}" ${whereClause}`,
            queryParams
        );
        const total = parseInt(countResult.rows[0].total);

        // Fetch rows
        const dataResult = await db.query(
            `SELECT * FROM "${tableName}" ${whereClause} ORDER BY 1 DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
            [...queryParams, limit, offset]
        );

        res.json({
            success: true,
            table: tableName,
            columns: columns,
            rows: dataResult.rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error(`[ADMIN-DATA] Error browsing ${req.params.table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/admin/data/row/:table
 * Delete a single row by primary key
 */
router.delete('/row/:table', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const tableName = req.params.table;
        const tableInfo = ALL_TABLES[tableName];

        // Check if table exists (registered or in database)
        if (!tableInfo) {
            const checkExists = await db.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 AND table_type = 'BASE TABLE'`, [tableName]
            );
            if (checkExists.rows.length === 0) {
                return res.status(400).json({ error: `Table "${tableName}" does not exist or is a view` });
            }
        }
        if (tableInfo?.isView) {
            return res.status(400).json({ error: 'Cannot delete from a view' });
        }

        const { pkValue, pkValues } = req.body;
        const pk = tableInfo?.pk || 'id';

        if (tableInfo?.compositePk) {
            if (!pkValues || Object.keys(pkValues).length !== tableInfo.compositePk.length) {
                return res.status(400).json({ error: 'Missing composite primary key values' });
            }
            const conditions = tableInfo.compositePk.map((col, i) => `"${col}" = $${i + 1}`);
            const values = tableInfo.compositePk.map(col => pkValues[col]);
            await db.query(`DELETE FROM "${tableName}" WHERE ${conditions.join(' AND ')}`, values);
        } else {
            if (!pkValue && pkValue !== 0) {
                return res.status(400).json({ error: 'Missing primary key value (pkValue)' });
            }
            await db.query(`DELETE FROM "${tableName}" WHERE "${pk}" = $1`, [pkValue]);
        }

        res.json({ success: true, message: 'Row deleted' });
    } catch (error) {
        console.error(`[ADMIN-DATA] Error deleting from ${req.params.table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/admin/data/row/:table
 * Update a single row by primary key
 */
router.put('/row/:table', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const tableName = req.params.table;
        const tableInfo = ALL_TABLES[tableName];

        // Check if table exists
        if (!tableInfo) {
            const checkExists = await db.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 AND table_type = 'BASE TABLE'`, [tableName]
            );
            if (checkExists.rows.length === 0) {
                return res.status(400).json({ error: `Table "${tableName}" does not exist or is a view` });
            }
        }
        if (tableInfo?.isView) {
            return res.status(400).json({ error: 'Cannot update a view' });
        }

        const { pkValue, pkValues, updates } = req.body;

        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        // Build SET clause
        const setCols = Object.keys(updates);
        const setValues = Object.values(updates);
        const setClause = setCols.map((col, i) => `"${col}" = $${i + 1}`).join(', ');

        if (tableInfo?.compositePk) {
            if (!pkValues || Object.keys(pkValues).length !== tableInfo.compositePk.length) {
                return res.status(400).json({ error: 'Missing composite primary key values' });
            }
            const conditions = tableInfo.compositePk.map((col, i) => `"${col}" = $${setCols.length + i + 1}`);
            const whereValues = tableInfo.compositePk.map(col => pkValues[col]);
            await db.query(
                `UPDATE "${tableName}" SET ${setClause} WHERE ${conditions.join(' AND ')}`,
                [...setValues, ...whereValues]
            );
        } else {
            const pk = tableInfo?.pk || 'id';
            if (!pkValue && pkValue !== 0) {
                return res.status(400).json({ error: 'Missing primary key value (pkValue)' });
            }
            await db.query(
                `UPDATE "${tableName}" SET ${setClause} WHERE "${pk}" = $${setCols.length + 1}`,
                [...setValues, pkValue]
            );
        }

        res.json({ success: true, message: 'Row updated' });
    } catch (error) {
        console.error(`[ADMIN-DATA] Error updating ${req.params.table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/admin/data/truncate/:table
 * Truncate entire table (delete all rows)
 */
router.delete('/truncate/:table', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ error: 'Database not available' });

        const tableName = req.params.table;
        const tableInfo = ALL_TABLES[tableName];
        if (!tableInfo) {
            const checkExists = await db.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 AND table_type = 'BASE TABLE'`, [tableName]
            );
            if (checkExists.rows.length === 0) {
                return res.status(400).json({ error: `Table "${tableName}" does not exist or is a view` });
            }
        }
        if (tableInfo?.isView) {
            return res.status(400).json({ error: 'Cannot truncate a view' });
        }

        const countBefore = await db.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
        await db.query(`TRUNCATE TABLE "${tableName}" CASCADE`);

        res.json({
            success: true,
            message: `Truncated ${tableName}`,
            deletedRows: parseInt(countBefore.rows[0].cnt)
        });
    } catch (error) {
        console.error(`[ADMIN-DATA] Error truncating ${req.params.table}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
