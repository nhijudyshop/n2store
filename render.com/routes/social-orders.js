// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// SOCIAL ORDERS REST API
// Replaces Firestore: social_orders, social_tags collections
// Used by don-inbox page for order management
// =====================================================

const express = require('express');
const router = express.Router();

// =====================================================
// AUTO-CREATE TABLES ON FIRST REQUEST
// =====================================================

let _tablesCreated = false;

async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS social_orders (
                id VARCHAR(50) PRIMARY KEY,
                stt INTEGER,
                customer_name VARCHAR(255),
                phone VARCHAR(20),
                address TEXT,
                post_url TEXT,
                post_label VARCHAR(255),
                source VARCHAR(50),
                products JSONB DEFAULT '[]',
                total_quantity INTEGER DEFAULT 0,
                total_amount NUMERIC DEFAULT 0,
                tags JSONB DEFAULT '[]',
                status VARCHAR(20) DEFAULT 'draft',
                note TEXT,
                note_images JSONB DEFAULT '[]',
                tpos_partner_id INTEGER,
                page_id VARCHAR(100),
                psid VARCHAR(100),
                conversation_id VARCHAR(100),
                assigned_user_id VARCHAR(100),
                assigned_user_name VARCHAR(255),
                created_by VARCHAR(100),
                created_by_name VARCHAR(255),
                created_at BIGINT,
                updated_at BIGINT,
                username VARCHAR(100) DEFAULT 'default'
            );

            CREATE INDEX IF NOT EXISTS idx_social_orders_status ON social_orders(status);
            CREATE INDEX IF NOT EXISTS idx_social_orders_created ON social_orders(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_social_orders_phone ON social_orders(phone);

            CREATE TABLE IF NOT EXISTS social_tags (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                color VARCHAR(20),
                image TEXT,
                updated_at BIGINT
            );
            -- Migration 2026-04-28: extend id từ VARCHAR(50) → VARCHAR(255).
            -- Smoke test phát hiện "value too long for type character varying(50)" khi
            -- client gửi id dài (composite key). DO IF: chỉ ALTER khi cột hiện ≤ 50.
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'social_tags'
                      AND column_name = 'id'
                      AND character_maximum_length = 50
                ) THEN
                    ALTER TABLE social_tags ALTER COLUMN id TYPE VARCHAR(255);
                    RAISE NOTICE 'social_tags.id extended VARCHAR(50) -> VARCHAR(255)';
                END IF;
            END $$;

            CREATE TABLE IF NOT EXISTS social_orders_history (
                id SERIAL PRIMARY KEY,
                action VARCHAR(30),
                order_id VARCHAR(50),
                order_stt INTEGER,
                customer_name VARCHAR(255),
                phone VARCHAR(20),
                details TEXT,
                snapshot JSONB,
                user_email VARCHAR(255),
                created_at BIGINT
            );
            CREATE INDEX IF NOT EXISTS idx_soh_created ON social_orders_history(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_soh_action ON social_orders_history(action);
            CREATE INDEX IF NOT EXISTS idx_soh_order ON social_orders_history(order_id);
        `);
        _tablesCreated = true;
        console.log('[SOCIAL-ORDERS] Tables created/verified');
    } catch (error) {
        console.error('[SOCIAL-ORDERS] Table creation error:', error.message);
    }
}

// =====================================================
// ORDERS - LOAD (with pagination, filter, search)
// =====================================================

/**
 * GET /api/social-orders/load
 * Query params: status, page, limit, search
 */
router.get('/load', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { status, page = 1, limit = 500, search } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let whereClause = '';
        const params = [];
        const conditions = [];

        if (status && status !== 'all') {
            params.push(status);
            conditions.push(`status = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            const searchIdx = params.length;
            conditions.push(
                `(customer_name ILIKE $${searchIdx} OR phone ILIKE $${searchIdx} OR note ILIKE $${searchIdx})`
            );
        }

        if (conditions.length > 0) {
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }

        // Count total
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM social_orders ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Fetch orders
        const orderParams = [...params, limitNum, offset];
        const result = await pool.query(
            `SELECT * FROM social_orders ${whereClause} ORDER BY created_at DESC LIMIT $${orderParams.length - 1} OFFSET $${orderParams.length}`,
            orderParams
        );

        // Map DB rows to frontend format
        const orders = result.rows.map(mapRowToOrder);

        res.json({
            success: true,
            orders,
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + orders.length < total,
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] GET /load error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// KPI STATS - AGGREGATE BY USER (don-inbox)
// =====================================================

/**
 * GET /api/social-orders/kpi-stats
 *
 * Aggregate KPI từ social_orders (don-inbox) GROUP BY created_by.
 * Đơn inbox được tính riêng khỏi KPI tab1-orders (cross-campaign,
 * không thuộc STT-range). KPI = total_quantity × 5000đ flat.
 *
 * Query params:
 *   - from: timestamp ms (inclusive). Default: 30 ngày trước.
 *   - to:   timestamp ms (inclusive). Default: now.
 *   - includeAll: '1' = bao gồm cả status cancelled (mặc định loại).
 *
 * Response: { success, perUser: { userId: { userName, orderCount, totalQty, totalKPI } }, totals }
 */
router.get('/kpi-stats', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const KPI_PER_UNIT = 5000; // đồng bộ với KPI_AMOUNT_PER_DIFFERENCE (tab1 KPI manager)
        const now = Date.now();
        const defaultFrom = now - 30 * 24 * 60 * 60 * 1000;
        const fromMs = parseInt(req.query.from) || defaultFrom;
        const toMs = parseInt(req.query.to) || now;
        const includeCancelled = req.query.includeAll === '1';

        const params = [fromMs, toMs];
        let whereClause = 'WHERE created_at >= $1 AND created_at <= $2';
        if (!includeCancelled) {
            whereClause += " AND COALESCE(status, 'draft') <> 'cancelled'";
        }

        const result = await pool.query(
            `SELECT
                created_by,
                created_by_name,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(total_quantity), 0)::int AS total_qty,
                COALESCE(SUM(total_amount), 0)::numeric AS total_amount
             FROM social_orders
             ${whereClause}
             GROUP BY created_by, created_by_name
             ORDER BY total_qty DESC`,
            params
        );

        const perUser = {};
        let grandOrders = 0;
        let grandQty = 0;
        let grandKpi = 0;
        for (const row of result.rows) {
            const userId = row.created_by || 'unknown';
            const userName = row.created_by_name || userId;
            const qty = parseInt(row.total_qty) || 0;
            const kpi = qty * KPI_PER_UNIT;
            const oc = parseInt(row.order_count) || 0;

            // Merge nếu cùng userId xuất hiện 2 dòng (vì created_by_name có thể khác nhau)
            if (perUser[userId]) {
                perUser[userId].orderCount += oc;
                perUser[userId].totalQty += qty;
                perUser[userId].totalKPI += kpi;
                perUser[userId].totalAmount += Number(row.total_amount) || 0;
            } else {
                perUser[userId] = {
                    userId,
                    userName,
                    orderCount: oc,
                    totalQty: qty,
                    totalKPI: kpi,
                    totalAmount: Number(row.total_amount) || 0,
                };
            }

            grandOrders += oc;
            grandQty += qty;
            grandKpi += kpi;
        }

        res.json({
            success: true,
            from: fromMs,
            to: toMs,
            kpiPerUnit: KPI_PER_UNIT,
            perUser,
            totals: {
                orderCount: grandOrders,
                totalQty: grandQty,
                totalKPI: grandKpi,
            },
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] GET /kpi-stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/social-orders/kpi-stats/orders
 *
 * Trả về danh sách đơn (drill-down) cho 1 nhân viên trong khoảng thời gian.
 * Phục vụ KPI Đơn Inbox tab — hiển thị từng đơn nào được tính KPI.
 *
 * Query params:
 *   - userId: created_by — required.
 *   - from: timestamp ms (inclusive). Default: 30 ngày trước.
 *   - to:   timestamp ms (inclusive). Default: now.
 *   - includeAll: '1' = bao gồm status cancelled (mặc định loại).
 *
 * Response: { success, userId, count, orders: [{ id, stt, status, totalQuantity, totalAmount, kpi, createdAt }] }
 */
router.get('/kpi-stats/orders', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const userId = (req.query.userId || '').toString().trim();
        if (!userId) {
            return res
                .status(400)
                .json({ success: false, error: 'userId is required' });
        }

        const KPI_PER_UNIT = 5000;
        const now = Date.now();
        const defaultFrom = now - 30 * 24 * 60 * 60 * 1000;
        const fromMs = parseInt(req.query.from) || defaultFrom;
        const toMs = parseInt(req.query.to) || now;
        const includeCancelled = req.query.includeAll === '1';

        const params = [userId, fromMs, toMs];
        let whereClause =
            'WHERE created_by = $1 AND created_at >= $2 AND created_at <= $3';
        if (!includeCancelled) {
            whereClause += " AND COALESCE(status, 'draft') <> 'cancelled'";
        }

        const result = await pool.query(
            `SELECT id, stt, status,
                    COALESCE(total_quantity, 0)::int AS total_quantity,
                    COALESCE(total_amount, 0)::numeric AS total_amount,
                    created_at
             FROM social_orders
             ${whereClause}
             ORDER BY stt ASC NULLS LAST, created_at ASC`,
            params
        );

        const orders = result.rows.map((row) => {
            const qty = parseInt(row.total_quantity) || 0;
            return {
                id: row.id,
                stt: row.stt,
                status: row.status || 'draft',
                totalQuantity: qty,
                totalAmount: Number(row.total_amount) || 0,
                kpi: qty * KPI_PER_UNIT,
                createdAt: row.created_at ? Number(row.created_at) : null,
            };
        });

        res.json({
            success: true,
            userId,
            from: fromMs,
            to: toMs,
            kpiPerUnit: KPI_PER_UNIT,
            count: orders.length,
            orders,
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] GET /kpi-stats/orders error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// ORDERS - CREATE / UPSERT
// =====================================================

/**
 * POST /api/social-orders/entries
 * Body: order object
 */
router.post('/entries', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const order = req.body;
        if (!order || !order.id) {
            return res.status(400).json({ error: 'order.id required' });
        }

        await upsertOrder(pool, order);
        res.json({ success: true, id: order.id });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /entries error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ORDERS - UPDATE
// =====================================================

/**
 * PUT /api/social-orders/entries/:id
 * Body: partial update fields
 */
router.put('/entries/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { id } = req.params;
        const updates = req.body;
        if (!updates || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No update fields provided' });
        }

        // Build dynamic UPDATE query
        const setClauses = [];
        const params = [];

        const fieldMap = {
            stt: 'stt',
            customerName: 'customer_name',
            phone: 'phone',
            address: 'address',
            postUrl: 'post_url',
            postLabel: 'post_label',
            source: 'source',
            products: 'products',
            totalQuantity: 'total_quantity',
            totalAmount: 'total_amount',
            tags: 'tags',
            status: 'status',
            note: 'note',
            noteImages: 'note_images',
            tposPartnerId: 'tpos_partner_id',
            pageId: 'page_id',
            psid: 'psid',
            conversationId: 'conversation_id',
            assignedUserId: 'assigned_user_id',
            assignedUserName: 'assigned_user_name',
            createdBy: 'created_by',
            createdByName: 'created_by_name',
            updatedAt: 'updated_at',
        };

        for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
            if (updates[jsKey] !== undefined) {
                params.push(
                    dbCol === 'products' || dbCol === 'tags' || dbCol === 'note_images'
                        ? JSON.stringify(updates[jsKey])
                        : updates[jsKey]
                );
                setClauses.push(`${dbCol} = $${params.length}`);
            }
        }

        // Always update updated_at
        if (!updates.updatedAt) {
            params.push(Date.now());
            setClauses.push(`updated_at = $${params.length}`);
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        params.push(id);
        await pool.query(
            `UPDATE social_orders SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
            params
        );

        res.json({ success: true, id });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] PUT /entries/:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// ORDERS - DELETE
// =====================================================

/**
 * DELETE /api/social-orders/entries/:id
 */
router.delete('/entries/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { id } = req.params;
        const result = await pool.query('DELETE FROM social_orders WHERE id = $1 RETURNING id', [
            id,
        ]);

        res.json({ success: true, deleted: result.rowCount > 0 });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] DELETE /entries/:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/social-orders/entries/batch-delete
 * Body: { ids: ['SO-xxx', 'SO-yyy'] }
 */
router.post('/entries/batch-delete', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array required' });
        }

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(
            `DELETE FROM social_orders WHERE id IN (${placeholders}) RETURNING id`,
            ids
        );

        res.json({ success: true, deletedCount: result.rowCount });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /entries/batch-delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/social-orders/cleanup-cancelled
 * Permanently delete cancelled orders older than 60 days.
 * Protected by X-Cleanup-Secret header (env CLEANUP_SECRET).
 * Called daily by GitHub Actions cron.
 */
router.post('/cleanup-cancelled', async (req, res) => {
    // Auth via shared secret header
    const secret = req.headers['x-cleanup-secret'];
    if (!process.env.CLEANUP_SECRET) {
        return res.status(500).json({ error: 'CLEANUP_SECRET not configured on server' });
    }
    if (!secret || secret !== process.env.CLEANUP_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const RETENTION_DAYS = 60;
        const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

        const result = await pool.query(
            `DELETE FROM social_orders
             WHERE status = 'cancelled' AND updated_at < $1
             RETURNING id, stt, customer_name, phone`,
            [cutoff]
        );

        // Log summary to history (single row)
        if (result.rowCount > 0) {
            try {
                await pool.query(
                    `INSERT INTO social_orders_history (action, details, snapshot, user_email, created_at)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        'auto_cleanup',
                        `Tự động xóa ${result.rowCount} đơn đã hủy cũ hơn ${RETENTION_DAYS} ngày`,
                        JSON.stringify(result.rows),
                        'system@cron',
                        Date.now(),
                    ]
                );
            } catch (logErr) {
                console.warn('[SOCIAL-ORDERS] cleanup log failed:', logErr.message);
            }
        }

        console.log(`[SOCIAL-ORDERS] cleanup-cancelled: deleted ${result.rowCount} orders`);
        res.json({
            success: true,
            deletedCount: result.rowCount,
            retentionDays: RETENTION_DAYS,
            cutoff,
            ids: result.rows.map((r) => r.id),
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /cleanup-cancelled error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// TAGS - LOAD / SAVE
// =====================================================

/**
 * GET /api/social-orders/tags
 */
router.get('/tags', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('SELECT * FROM social_tags ORDER BY name');
        res.json({ success: true, tags: result.rows });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] GET /tags error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/social-orders/tags
 * Body: { tags: [{ id, name, color, image }] }
 * Replaces all tags (delete + insert)
 */
router.post('/tags', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { tags } = req.body;
        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'tags array required' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM social_tags');

            for (const tag of tags) {
                await client.query(
                    `INSERT INTO social_tags (id, name, color, image, updated_at) VALUES ($1, $2, $3, $4, $5)`,
                    [tag.id, tag.name, tag.color || '#6b7280', tag.image || null, Date.now()]
                );
            }

            await client.query('COMMIT');
            res.json({ success: true, count: tags.length });
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /tags error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// MIGRATE - One-time bulk import
// =====================================================

/**
 * POST /api/social-orders/migrate
 * Body: { orders: [...] }
 * Bulk upsert orders from localStorage/Firestore
 */
router.post('/migrate', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { orders } = req.body;
        if (!orders || !Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ error: 'orders array required' });
        }

        const client = await pool.connect();
        let successCount = 0;
        let failCount = 0;

        try {
            await client.query('BEGIN');

            for (const order of orders) {
                try {
                    await upsertOrderWithClient(client, order);
                    successCount++;
                } catch (e) {
                    console.error(`[SOCIAL-ORDERS] Migrate failed for ${order.id}:`, e.message);
                    failCount++;
                }
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }

        res.json({
            success: true,
            migrated: successCount,
            failed: failCount,
            total: orders.length,
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /migrate error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Upsert a single order using pool
 */
async function upsertOrder(pool, order) {
    return pool.query(
        `
        INSERT INTO social_orders (
            id, stt, customer_name, phone, address, post_url, post_label, source,
            products, total_quantity, total_amount, tags, status, note, note_images,
            tpos_partner_id, page_id, psid, conversation_id,
            assigned_user_id, assigned_user_name,
            created_by, created_by_name, created_at, updated_at, username
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21,
            $22, $23, $24, $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
            stt = EXCLUDED.stt,
            customer_name = EXCLUDED.customer_name,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            post_url = EXCLUDED.post_url,
            post_label = EXCLUDED.post_label,
            source = EXCLUDED.source,
            products = EXCLUDED.products,
            total_quantity = EXCLUDED.total_quantity,
            total_amount = EXCLUDED.total_amount,
            tags = EXCLUDED.tags,
            status = EXCLUDED.status,
            note = EXCLUDED.note,
            note_images = EXCLUDED.note_images,
            tpos_partner_id = EXCLUDED.tpos_partner_id,
            page_id = EXCLUDED.page_id,
            psid = EXCLUDED.psid,
            conversation_id = EXCLUDED.conversation_id,
            assigned_user_id = EXCLUDED.assigned_user_id,
            assigned_user_name = EXCLUDED.assigned_user_name,
            created_by = EXCLUDED.created_by,
            created_by_name = EXCLUDED.created_by_name,
            updated_at = EXCLUDED.updated_at
    `,
        [
            order.id,
            order.stt || null,
            order.customerName || order.customer_name || null,
            order.phone || null,
            order.address || null,
            order.postUrl || order.post_url || null,
            order.postLabel || order.post_label || null,
            order.source || 'manual',
            JSON.stringify(order.products || []),
            order.totalQuantity || order.total_quantity || 0,
            order.totalAmount || order.total_amount || 0,
            JSON.stringify(order.tags || []),
            order.status || 'draft',
            order.note || null,
            JSON.stringify(order.noteImages || order.note_images || []),
            order.tposPartnerId || order.tpos_partner_id || null,
            order.pageId || order.page_id || '',
            order.psid || '',
            order.conversationId || order.conversation_id || '',
            order.assignedUserId || order.assigned_user_id || '',
            order.assignedUserName || order.assigned_user_name || '',
            order.createdBy || order.created_by || 'admin',
            order.createdByName || order.created_by_name || 'Admin',
            order.createdAt || order.created_at || Date.now(),
            order.updatedAt || order.updated_at || Date.now(),
            order.username || 'default',
        ]
    );
}

/**
 * Upsert a single order using a transaction client
 */
async function upsertOrderWithClient(client, order) {
    return client.query(
        `
        INSERT INTO social_orders (
            id, stt, customer_name, phone, address, post_url, post_label, source,
            products, total_quantity, total_amount, tags, status, note, note_images,
            tpos_partner_id, page_id, psid, conversation_id,
            assigned_user_id, assigned_user_name,
            created_by, created_by_name, created_at, updated_at, username
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21,
            $22, $23, $24, $25, $26
        )
        ON CONFLICT (id) DO UPDATE SET
            stt = EXCLUDED.stt,
            customer_name = EXCLUDED.customer_name,
            phone = EXCLUDED.phone,
            address = EXCLUDED.address,
            post_url = EXCLUDED.post_url,
            post_label = EXCLUDED.post_label,
            source = EXCLUDED.source,
            products = EXCLUDED.products,
            total_quantity = EXCLUDED.total_quantity,
            total_amount = EXCLUDED.total_amount,
            tags = EXCLUDED.tags,
            status = EXCLUDED.status,
            note = EXCLUDED.note,
            note_images = EXCLUDED.note_images,
            tpos_partner_id = EXCLUDED.tpos_partner_id,
            page_id = EXCLUDED.page_id,
            psid = EXCLUDED.psid,
            conversation_id = EXCLUDED.conversation_id,
            assigned_user_id = EXCLUDED.assigned_user_id,
            assigned_user_name = EXCLUDED.assigned_user_name,
            created_by = EXCLUDED.created_by,
            created_by_name = EXCLUDED.created_by_name,
            updated_at = EXCLUDED.updated_at
    `,
        [
            order.id,
            order.stt || null,
            order.customerName || order.customer_name || null,
            order.phone || null,
            order.address || null,
            order.postUrl || order.post_url || null,
            order.postLabel || order.post_label || null,
            order.source || 'manual',
            JSON.stringify(order.products || []),
            order.totalQuantity || order.total_quantity || 0,
            order.totalAmount || order.total_amount || 0,
            JSON.stringify(order.tags || []),
            order.status || 'draft',
            order.note || null,
            JSON.stringify(order.noteImages || order.note_images || []),
            order.tposPartnerId || order.tpos_partner_id || null,
            order.pageId || order.page_id || '',
            order.psid || '',
            order.conversationId || order.conversation_id || '',
            order.assignedUserId || order.assigned_user_id || '',
            order.assignedUserName || order.assigned_user_name || '',
            order.createdBy || order.created_by || 'admin',
            order.createdByName || order.created_by_name || 'Admin',
            order.createdAt || order.created_at || Date.now(),
            order.updatedAt || order.updated_at || Date.now(),
            order.username || 'default',
        ]
    );
}

/**
 * Map PostgreSQL row (snake_case) to frontend order object (camelCase)
 */
function mapRowToOrder(row) {
    return {
        id: row.id,
        stt: row.stt,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.address,
        postUrl: row.post_url,
        postLabel: row.post_label,
        source: row.source,
        products: row.products || [],
        totalQuantity: row.total_quantity,
        totalAmount: parseFloat(row.total_amount) || 0,
        tags: row.tags || [],
        status: row.status,
        note: row.note,
        noteImages: row.note_images || [],
        tposPartnerId: row.tpos_partner_id,
        pageId: row.page_id,
        psid: row.psid,
        conversationId: row.conversation_id,
        assignedUserId: row.assigned_user_id,
        assignedUserName: row.assigned_user_name,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: parseInt(row.created_at) || 0,
        updatedAt: parseInt(row.updated_at) || 0,
        _source: 'render', // Mark source for hybrid loading
    };
}

// =====================================================
// HISTORY - Lịch sử thao tác (independent of order data)
// =====================================================

/**
 * GET /api/social-orders/history
 * Query: action, search, limit, offset
 */
router.get('/history', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { action, search, limit = 200, offset = 0 } = req.query;
        const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
        const offsetNum = Math.max(0, parseInt(offset) || 0);

        const conditions = [];
        const params = [];

        if (action && action !== 'all') {
            params.push(action);
            conditions.push(`action = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            const idx = params.length;
            conditions.push(
                `(customer_name ILIKE $${idx} OR phone ILIKE $${idx} OR order_id ILIKE $${idx} OR details ILIKE $${idx})`
            );
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM social_orders_history ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const queryParams = [...params, limitNum, offsetNum];
        const result = await pool.query(
            `SELECT * FROM social_orders_history ${whereClause} ORDER BY created_at DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        );

        res.json({
            success: true,
            entries: result.rows.map((row) => ({
                id: row.id,
                action: row.action,
                orderId: row.order_id,
                orderStt: row.order_stt,
                customerName: row.customer_name,
                phone: row.phone,
                details: row.details,
                snapshot: row.snapshot,
                userEmail: row.user_email,
                timestamp: parseInt(row.created_at) || 0,
            })),
            total,
            hasMore: offsetNum + result.rows.length < total,
        });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] GET /history error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/social-orders/history
 * Body: { action, orderId, orderStt, customerName, phone, details, snapshot, userEmail }
 */
router.post('/history', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { action, orderId, orderStt, customerName, phone, details, snapshot, userEmail } =
            req.body;
        if (!action) return res.status(400).json({ error: 'action required' });

        await pool.query(
            `INSERT INTO social_orders_history (action, order_id, order_stt, customer_name, phone, details, snapshot, user_email, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                action,
                orderId || null,
                orderStt || null,
                customerName || null,
                phone || null,
                details || null,
                snapshot ? JSON.stringify(snapshot) : null,
                userEmail || null,
                Date.now(),
            ]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] POST /history error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/social-orders/history
 * Clears all history entries
 */
router.delete('/history', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query('DELETE FROM social_orders_history');
        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[SOCIAL-ORDERS] DELETE /history error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
