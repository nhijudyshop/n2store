// =====================================================
// ADMIN MIGRATION ENDPOINT
// Auto-run database migration for realtime tables
// =====================================================

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

/**
 * POST /api/admin/run-migration
 * Chạy migration SQL để tạo realtime tables
 * Security: Chỉ chạy được 1 lần (idempotent với CREATE TABLE IF NOT EXISTS)
 */
router.post('/run-migration', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        // Read migration SQL file
        const migrationPath = path.join(__dirname, '../migrations/create_realtime_data.sql');

        if (!fs.existsSync(migrationPath)) {
            return res.status(404).json({
                error: 'Migration file not found',
                path: migrationPath
            });
        }

        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('[MIGRATION] Starting database migration...');
        console.log('[MIGRATION] File size:', migrationSQL.length, 'bytes');

        // Execute migration
        const startTime = Date.now();
        await db.query(migrationSQL);
        const duration = Date.now() - startTime;

        console.log('[MIGRATION] ✅ Migration completed in', duration, 'ms');

        // Verify tables created
        const tableCheck = await db.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN (
                'realtime_updates',
                'realtime_kv',
                'kpi_base',
                'kpi_statistics',
                'held_products',
                'tag_updates',
                'dropped_products',
                'note_snapshots',
                'report_order_details',
                'soluong_products',
                'soluong_meta'
            )
            ORDER BY table_name
        `);

        const createdTables = tableCheck.rows.map(r => r.table_name);
        const expectedTables = [
            'realtime_updates',
            'realtime_kv',
            'kpi_base',
            'kpi_statistics',
            'held_products',
            'tag_updates',
            'dropped_products',
            'note_snapshots',
            'report_order_details',
            'soluong_products',
            'soluong_meta'
        ];

        const missingTables = expectedTables.filter(t => !createdTables.includes(t));

        console.log('[MIGRATION] Created tables:', createdTables.length, '/', expectedTables.length);

        res.json({
            success: true,
            message: 'Migration completed successfully',
            duration: duration + 'ms',
            tables: {
                created: createdTables,
                missing: missingTables,
                total: createdTables.length,
                expected: expectedTables.length
            }
        });

    } catch (error) {
        console.error('[MIGRATION] ❌ Error:', error);
        res.status(500).json({
            error: 'Migration failed',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * GET /api/admin/check-tables
 * Kiểm tra tables nào đã tồn tại
 */
router.get('/check-tables', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const result = await db.query(`
            SELECT table_name,
                   (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            AND table_name LIKE '%realtime%' OR table_name IN ('kpi_base', 'kpi_statistics', 'held_products', 'tag_updates', 'dropped_products', 'note_snapshots', 'soluong_products', 'soluong_meta', 'report_order_details')
            ORDER BY table_name
        `);

        const expectedTables = [
            'realtime_updates',
            'realtime_kv',
            'kpi_base',
            'kpi_statistics',
            'held_products',
            'tag_updates',
            'dropped_products',
            'note_snapshots',
            'report_order_details',
            'soluong_products',
            'soluong_meta'
        ];

        const existingTables = result.rows.map(r => r.table_name);
        const missingTables = expectedTables.filter(t => !existingTables.includes(t));

        res.json({
            success: true,
            tables: result.rows,
            summary: {
                total: result.rows.length,
                expected: expectedTables.length,
                missing: missingTables,
                needsMigration: missingTables.length > 0
            }
        });

    } catch (error) {
        console.error('[MIGRATION] Error checking tables:', error);
        res.status(500).json({
            error: 'Failed to check tables',
            message: error.message
        });
    }
});

module.exports = router;
