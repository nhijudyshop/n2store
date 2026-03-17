// =====================================================
// ADMIN DATA MANAGEMENT API
// Browse and delete data from all PostgreSQL tables
// Based on actual database schema (48 items: 35 tables + 13 views)
// =====================================================

const express = require('express');
const router = express.Router();

// All manageable tables grouped by category (from actual DB)
const TABLE_GROUPS = {
    'Customers': [
        { name: 'customers', label: 'Customers', pk: 'id' },
        { name: 'customer_activities', label: 'Customer Activities', pk: 'id' },
        { name: 'customer_notes', label: 'Customer Notes', pk: 'id' },
        { name: 'pending_customer_matches', label: 'Pending Customer Matches', pk: 'id' },
        { name: 'pending_customers', label: 'Pending Customers', pk: 'id' },
        { name: 'tpos_saved_customers', label: 'TPOS Saved Customers', pk: 'id' }
    ],
    'Wallet & Transactions': [
        { name: 'customer_wallets', label: 'Customer Wallets', pk: 'id' },
        { name: 'wallet_transactions', label: 'Wallet Transactions', pk: 'id' },
        { name: 'virtual_credits', label: 'Virtual Credits', pk: 'id' },
        { name: 'wallet_adjustments', label: 'Wallet Adjustments', pk: 'id' },
        { name: 'pending_wallet_withdrawals', label: 'Pending Withdrawals', pk: 'id' }
    ],
    'Balance & SePay': [
        { name: 'balance_history', label: 'Balance History', pk: 'id' },
        { name: 'balance_customer_info', label: 'Balance Customer Info', pk: 'id' },
        { name: 'sepay_webhook_logs', label: 'SePay Webhook Logs', pk: 'id' },
        { name: 'recent_transfer_phones', label: 'Recent Transfer Phones', pk: 'phone' },
        { name: 'transfer_stats', label: 'Transfer Stats', pk: 'id' }
    ],
    'Support Tickets': [
        { name: 'customer_tickets', label: 'Customer Tickets', pk: 'id' }
    ],
    'Inbox & Conversations': [
        { name: 'inbox_groups', label: 'Inbox Groups', pk: 'id' },
        { name: 'conversation_labels', label: 'Conversation Labels', pk: 'conv_id' },
        { name: 'livestream_conversations', label: 'Livestream Conversations', pk: 'conv_id' }
    ],
    'Realtime Data': [
        { name: 'realtime_credentials', label: 'Realtime Credentials', pk: 'id' },
        { name: 'realtime_updates', label: 'Realtime Updates', pk: 'id' },
        { name: 'realtime_kv', label: 'Realtime KV Store', pk: 'key' }
    ],
    'KPI & Orders': [
        { name: 'kpi_base', label: 'KPI Base', pk: 'id' },
        { name: 'kpi_statistics', label: 'KPI Statistics', pk: 'id' },
        { name: 'report_order_details', label: 'Report Order Details', pk: 'table_name' },
        { name: 'return_orders', label: 'Return Orders', pk: 'id' }
    ],
    'Products & Tags': [
        { name: 'held_products', label: 'Held Products', pk: null, compositePk: ['order_id', 'product_id', 'user_id'] },
        { name: 'dropped_products', label: 'Dropped Products', pk: 'id' },
        { name: 'tag_updates', label: 'Tag Updates', pk: 'id' },
        { name: 'note_snapshots', label: 'Note Snapshots', pk: 'order_id' },
        { name: 'soluong_products', label: 'Soluong Products', pk: 'id' },
        { name: 'soluong_meta', label: 'Soluong Meta', pk: 'key' }
    ],
    'Config & Admin': [
        { name: 'admin_settings', label: 'Admin Settings', pk: 'id' },
        { name: 'rfm_config', label: 'RFM Config', pk: 'id' }
    ],
    'Views (read-only)': [
        { name: 'balance_statistics', label: 'Balance Statistics', pk: null, isView: true },
        { name: 'customer_360_summary', label: 'Customer 360 Summary', pk: null, isView: true },
        { name: 'customer_activity_summary', label: 'Customer Activity Summary', pk: null, isView: true },
        { name: 'customer_by_carrier', label: 'Customer By Carrier', pk: null, isView: true },
        { name: 'customer_statistics', label: 'Customer Statistics', pk: null, isView: true },
        { name: 'daily_wallet_summary', label: 'Daily Wallet Summary', pk: null, isView: true },
        { name: 'return_orders_by_date', label: 'Return Orders By Date', pk: null, isView: true },
        { name: 'return_orders_statistics', label: 'Return Orders Statistics', pk: null, isView: true },
        { name: 'rfm_segment_distribution', label: 'RFM Segment Distribution', pk: null, isView: true },
        { name: 'rfm_segment_mapping', label: 'RFM Segment Mapping', pk: null, isView: true },
        { name: 'ticket_resolution_metrics', label: 'Ticket Resolution Metrics', pk: null, isView: true },
        { name: 'ticket_statistics', label: 'Ticket Statistics', pk: null, isView: true },
        { name: 'wallet_statistics', label: 'Wallet Statistics', pk: null, isView: true }
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
        for (const [groupName, tables] of Object.entries(TABLE_GROUPS)) {
            groups[groupName] = tables.map(t => ({
                ...t,
                exists: existingTables.hasOwnProperty(t.name),
                rowCount: existingTables[t.name] || 0
            }));
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
        if (!ALL_TABLES[tableName]) {
            return res.status(400).json({ error: `Table "${tableName}" is not in the allowed list` });
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
        if (!tableInfo) {
            return res.status(400).json({ error: `Table "${tableName}" is not in the allowed list` });
        }
        if (tableInfo.isView) {
            return res.status(400).json({ error: 'Cannot delete from a view' });
        }

        const { pkValue, pkValues } = req.body;

        if (tableInfo.compositePk) {
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
            await db.query(`DELETE FROM "${tableName}" WHERE "${tableInfo.pk}" = $1`, [pkValue]);
        }

        res.json({ success: true, message: 'Row deleted' });
    } catch (error) {
        console.error(`[ADMIN-DATA] Error deleting from ${req.params.table}:`, error.message);
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
            return res.status(400).json({ error: `Table "${tableName}" is not in the allowed list` });
        }
        if (tableInfo.isView) {
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
