// =====================================================
// CAMPAIGNS REST API
// Replaces Firebase Firestore collections: campaigns, user_preferences
// Phase 1: Core campaigns + user preferences
// Phase 2: Campaign reports (report_orders_v2)
// Phase 3: Employee ranges by campaign
// =====================================================

const express = require('express');
const router = express.Router();

let _tablesCreated = false;

async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS campaigns (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                time_frame VARCHAR(50) DEFAULT 'custom',
                time_frame_label VARCHAR(255),
                custom_start_date VARCHAR(50),
                custom_end_date VARCHAR(50),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS user_campaign_preferences (
                user_id VARCHAR(255) PRIMARY KEY,
                active_campaign_id VARCHAR(100) REFERENCES campaigns(id) ON DELETE SET NULL,
                filter_preferences JSONB,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS campaign_reports (
                id SERIAL PRIMARY KEY,
                table_name VARCHAR(255) NOT NULL UNIQUE,
                orders JSONB DEFAULT '[]',
                total_orders INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                error_count INTEGER DEFAULT 0,
                fetched_at VARCHAR(100),
                is_saved_copy BOOLEAN DEFAULT FALSE,
                original_campaign VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS campaign_employee_ranges (
                id SERIAL PRIMARY KEY,
                campaign_name VARCHAR(255) NOT NULL UNIQUE,
                employee_ranges JSONB DEFAULT '[]',
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        _tablesCreated = true;
        console.log('[CAMPAIGNS] Tables created/verified');
    } catch (error) {
        console.error('[CAMPAIGNS] Error creating tables:', error.message);
    }
}

// =====================================================
// PHASE 1: CAMPAIGNS CRUD
// =====================================================

/**
 * GET /api/campaigns
 * Load all campaigns ordered by created_at DESC
 */
router.get('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'SELECT * FROM campaigns ORDER BY created_at DESC'
        );

        res.json({
            success: true,
            campaigns: result.rows.map(mapCampaignRow)
        });
    } catch (error) {
        console.error('[CAMPAIGNS] GET / error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// EMPLOYEE RANGES BY CAMPAIGN (must be before /:id to avoid conflict)
// =====================================================

/**
 * GET /api/campaigns/employee-ranges
 * Get all campaigns' employee ranges
 */
router.get('/employee-ranges', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('SELECT * FROM campaign_employee_ranges ORDER BY updated_at DESC');

        const rangesByCampaign = {};
        result.rows.forEach(row => {
            rangesByCampaign[row.campaign_name] = row.employee_ranges || [];
        });

        res.json({ success: true, rangesByCampaign });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /employee-ranges error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/employee-ranges/:campaignName
 */
router.get('/employee-ranges/:campaignName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'SELECT * FROM campaign_employee_ranges WHERE campaign_name = $1',
            [req.params.campaignName]
        );

        res.json({
            success: true,
            employeeRanges: result.rows.length > 0 ? result.rows[0].employee_ranges : []
        });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /employee-ranges/:campaignName error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/employee-ranges/:campaignName
 */
router.put('/employee-ranges/:campaignName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { employeeRanges } = req.body;
        const ranges = employeeRanges || [];

        // Validate: check for overlapping ranges
        if (Array.isArray(ranges) && ranges.length > 1) {
            const sorted = [...ranges]
                .map(r => ({
                    from: r.fromSTT || r.from || r.start || 0,
                    to: r.toSTT || r.to || r.end || Infinity,
                    userId: r.userId || r.id || '?'
                }))
                .filter(r => r.from <= r.to)
                .sort((a, b) => a.from - b.from);

            const overlaps = [];
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].from <= sorted[i - 1].to) {
                    overlaps.push({
                        range1: `${sorted[i - 1].userId} (${sorted[i - 1].from}-${sorted[i - 1].to})`,
                        range2: `${sorted[i].userId} (${sorted[i].from}-${sorted[i].to})`,
                        overlapAt: `STT ${sorted[i].from}-${Math.min(sorted[i - 1].to, sorted[i].to)}`
                    });
                }
            }

            if (overlaps.length > 0) {
                return res.status(400).json({
                    error: 'Employee ranges overlap',
                    overlaps,
                    message: `Phát hiện ${overlaps.length} chỗ trùng STT: ${overlaps.map(o => o.overlapAt).join(', ')}`
                });
            }
        }

        await pool.query(`
            INSERT INTO campaign_employee_ranges (campaign_name, employee_ranges)
            VALUES ($1, $2)
            ON CONFLICT (campaign_name) DO UPDATE SET
                employee_ranges = EXCLUDED.employee_ranges,
                updated_at = NOW()
        `, [req.params.campaignName, JSON.stringify(ranges)]);

        res.json({ success: true });
    } catch (error) {
        console.error('[CAMPAIGNS] PUT /employee-ranges/:campaignName error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: mapCampaignRow(result.rows[0]) });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { id, name, timeFrame, timeFrameLabel, customStartDate, customEndDate } = req.body;
        if (!id || !name) {
            return res.status(400).json({ error: 'id and name are required' });
        }

        const result = await pool.query(`
            INSERT INTO campaigns (id, name, time_frame, time_frame_label, custom_start_date, custom_end_date)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                time_frame = EXCLUDED.time_frame,
                time_frame_label = EXCLUDED.time_frame_label,
                custom_start_date = EXCLUDED.custom_start_date,
                custom_end_date = EXCLUDED.custom_end_date,
                updated_at = NOW()
            RETURNING *
        `, [id, name, timeFrame || 'custom', timeFrameLabel || '', customStartDate || '', customEndDate || '']);

        res.json({ success: true, campaign: mapCampaignRow(result.rows[0]) });
    } catch (error) {
        console.error('[CAMPAIGNS] POST / error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/:id
 * Update an existing campaign
 */
router.put('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { name, timeFrame, timeFrameLabel, customStartDate, customEndDate } = req.body;

        const result = await pool.query(`
            UPDATE campaigns SET
                name = COALESCE($2, name),
                time_frame = COALESCE($3, time_frame),
                time_frame_label = COALESCE($4, time_frame_label),
                custom_start_date = COALESCE($5, custom_start_date),
                custom_end_date = COALESCE($6, custom_end_date),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [req.params.id, name, timeFrame, timeFrameLabel, customStartDate, customEndDate]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({ success: true, campaign: mapCampaignRow(result.rows[0]) });
    } catch (error) {
        console.error('[CAMPAIGNS] PUT /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/campaigns/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[CAMPAIGNS] DELETE /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/campaigns/batch
 * Batch upsert campaigns (used by migration script)
 */
router.post('/batch', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { campaigns } = req.body;
        if (!campaigns || !Array.isArray(campaigns)) {
            return res.status(400).json({ error: 'campaigns array required' });
        }

        const client = await pool.connect();
        let inserted = 0;
        try {
            await client.query('BEGIN');
            for (const c of campaigns) {
                await client.query(`
                    INSERT INTO campaigns (id, name, time_frame, time_frame_label, custom_start_date, custom_end_date, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        time_frame = EXCLUDED.time_frame,
                        time_frame_label = EXCLUDED.time_frame_label,
                        custom_start_date = EXCLUDED.custom_start_date,
                        custom_end_date = EXCLUDED.custom_end_date,
                        updated_at = EXCLUDED.updated_at
                `, [
                    c.id, c.name, c.timeFrame || 'custom', c.timeFrameLabel || '',
                    c.customStartDate || '', c.customEndDate || '',
                    c.createdAt || new Date().toISOString(), c.updatedAt || new Date().toISOString()
                ]);
                inserted++;
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, count: inserted });
    } catch (error) {
        console.error('[CAMPAIGNS] POST /batch error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PHASE 1: USER CAMPAIGN PREFERENCES
// =====================================================

/**
 * GET /api/campaigns/user-pref/:userId
 */
router.get('/user-pref/:userId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'SELECT * FROM user_campaign_preferences WHERE user_id = $1',
            [req.params.userId]
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, activeCampaignId: null, filterPreferences: null });
        }

        const row = result.rows[0];
        res.json({
            success: true,
            activeCampaignId: row.active_campaign_id,
            filterPreferences: row.filter_preferences
        });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /user-pref/:userId error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/user-pref/:userId
 * Set active campaign for user
 */
router.put('/user-pref/:userId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { activeCampaignId, filterPreferences } = req.body;

        await pool.query(`
            INSERT INTO user_campaign_preferences (user_id, active_campaign_id, filter_preferences)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE SET
                active_campaign_id = COALESCE($2, user_campaign_preferences.active_campaign_id),
                filter_preferences = COALESCE($3, user_campaign_preferences.filter_preferences),
                updated_at = NOW()
        `, [req.params.userId, activeCampaignId || null, filterPreferences ? JSON.stringify(filterPreferences) : null]);

        res.json({ success: true });
    } catch (error) {
        console.error('[CAMPAIGNS] PUT /user-pref/:userId error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/campaigns/user-pref/:userId/active
 * Clear active campaign for user
 */
router.delete('/user-pref/:userId/active', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        await pool.query(
            'UPDATE user_campaign_preferences SET active_campaign_id = NULL, updated_at = NOW() WHERE user_id = $1',
            [req.params.userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[CAMPAIGNS] DELETE /user-pref/:userId/active error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PHASE 2: CAMPAIGN REPORTS
// =====================================================

/**
 * GET /api/campaigns/reports
 * List all reports (metadata only, no orders)
 */
router.get('/reports/list', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(`
            SELECT id, table_name, total_orders, success_count, error_count,
                   fetched_at, is_saved_copy, original_campaign, created_at, updated_at
            FROM campaign_reports
            ORDER BY updated_at DESC
        `);

        res.json({
            success: true,
            reports: result.rows.map(row => ({
                id: row.id,
                tableName: row.table_name,
                totalOrders: row.total_orders,
                successCount: row.success_count,
                errorCount: row.error_count,
                fetchedAt: row.fetched_at,
                isSavedCopy: row.is_saved_copy,
                originalCampaign: row.original_campaign,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }))
        });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /reports/list error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/campaigns/reports/:tableName
 * Get report with full orders data
 */
router.get('/reports/:tableName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'SELECT * FROM campaign_reports WHERE table_name = $1',
            [req.params.tableName]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const row = result.rows[0];
        res.json({
            success: true,
            report: {
                tableName: row.table_name,
                orders: row.orders || [],
                totalOrders: row.total_orders,
                successCount: row.success_count,
                errorCount: row.error_count,
                fetchedAt: row.fetched_at,
                isSavedCopy: row.is_saved_copy,
                originalCampaign: row.original_campaign,
            }
        });
    } catch (error) {
        console.error('[CAMPAIGNS] GET /reports/:tableName error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/reports/:tableName
 * Save/update report
 */
router.put('/reports/:tableName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { orders, totalOrders, successCount, errorCount, fetchedAt, isSavedCopy, originalCampaign } = req.body;

        await pool.query(`
            INSERT INTO campaign_reports (table_name, orders, total_orders, success_count, error_count, fetched_at, is_saved_copy, original_campaign)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (table_name) DO UPDATE SET
                orders = EXCLUDED.orders,
                total_orders = EXCLUDED.total_orders,
                success_count = EXCLUDED.success_count,
                error_count = EXCLUDED.error_count,
                fetched_at = EXCLUDED.fetched_at,
                is_saved_copy = COALESCE(EXCLUDED.is_saved_copy, campaign_reports.is_saved_copy),
                original_campaign = COALESCE(EXCLUDED.original_campaign, campaign_reports.original_campaign),
                updated_at = NOW()
        `, [
            req.params.tableName,
            JSON.stringify(orders || []),
            totalOrders || 0,
            successCount || 0,
            errorCount || 0,
            fetchedAt || Date.now(),
            isSavedCopy || false,
            originalCampaign || null
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('[CAMPAIGNS] PUT /reports/:tableName error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/campaigns/reports/:tableName
 */
router.delete('/reports/:tableName', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('DELETE FROM campaign_reports WHERE table_name = $1', [req.params.tableName]);
        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[CAMPAIGNS] DELETE /reports/:tableName error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/campaigns/reports/:tableName/rename
 */
router.put('/reports/:tableName/rename', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { newName } = req.body;
        if (!newName) return res.status(400).json({ error: 'newName required' });

        const result = await pool.query(
            'UPDATE campaign_reports SET table_name = $2, updated_at = NOW() WHERE table_name = $1 RETURNING *',
            [req.params.tableName, newName]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[CAMPAIGNS] PUT /reports/:tableName/rename error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELPERS
// =====================================================

function mapCampaignRow(row) {
    return {
        id: row.id,
        name: row.name,
        timeFrame: row.time_frame,
        timeFrameLabel: row.time_frame_label,
        customStartDate: row.custom_start_date,
        customEndDate: row.custom_end_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

module.exports = router;
