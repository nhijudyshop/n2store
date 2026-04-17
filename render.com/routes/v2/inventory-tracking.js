// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * INVENTORY TRACKING API v2
 * Migrated from Firestore → PostgreSQL
 *
 * Endpoints:
 *   GET    /suppliers                    - List all suppliers
 *   POST   /suppliers                    - Create/update supplier
 *
 *   GET    /order-bookings               - List with filters (date, NCC, status, search)
 *   GET    /order-bookings/:id           - Get one
 *   POST   /order-bookings               - Create
 *   PUT    /order-bookings/:id           - Update
 *   PATCH  /order-bookings/:id/status    - Change status
 *   DELETE /order-bookings/:id           - Delete
 *
 *   GET    /shipments                    - List with filters
 *   GET    /shipments/:id               - Get one
 *   POST   /shipments                    - Create
 *   PUT    /shipments/:id               - Update
 *   PATCH  /shipments/:id/shortage       - Update shortage
 *   DELETE /shipments/:id               - Delete
 *
 *   GET    /prepayments                  - List
 *   POST   /prepayments                  - Create
 *   PUT    /prepayments/:id              - Update
 *   DELETE /prepayments/:id              - Delete
 *
 *   GET    /other-expenses               - List
 *   POST   /other-expenses               - Create
 *   PUT    /other-expenses/:id           - Update
 *   DELETE /other-expenses/:id           - Delete
 *
 *   GET    /product-images               - List all product images
 *   PUT    /product-images               - Bulk replace all product images
 *   DELETE /product-images/:id           - Delete one
 *
 *   GET    /finance/summary              - Balance summary
 *   GET    /edit-history                 - Audit trail
 *   POST   /edit-history                 - Log action
 */

const express = require('express');
const router = express.Router();

function getDb(req) {
    return req.app.locals.chatDb;
}

function generateId(prefix = 'id') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}

function getUserFromHeaders(req) {
    try {
        const authData = req.headers['x-auth-data'];
        if (authData) {
            let jsonStr;
            try {
                jsonStr = decodeURIComponent(escape(Buffer.from(authData, 'base64').toString('binary')));
            } catch (_) {
                jsonStr = authData;
            }
            const parsed = JSON.parse(jsonStr);
            return parsed.userName || parsed.userId || 'anonymous';
        }
    } catch (_) { /* ignore */ }
    return 'anonymous';
}

// =====================================================
// SUPPLIERS
// =====================================================

router.get('/suppliers', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query(
            'SELECT * FROM inventory_suppliers ORDER BY stt_ncc ASC'
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[inventory] GET /suppliers error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/suppliers', async (req, res) => {
    try {
        const db = getDb(req);
        const { stt_ncc, ten_ncc } = req.body;
        if (!stt_ncc) return res.status(400).json({ success: false, error: 'stt_ncc required' });

        const result = await db.query(`
            INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc)
            VALUES ($1, $2, $3)
            ON CONFLICT (stt_ncc) DO UPDATE SET
                ten_ncc = COALESCE(EXCLUDED.ten_ncc, inventory_suppliers.ten_ncc),
                updated_at = NOW()
            RETURNING *
        `, [generateId('ncc'), stt_ncc, ten_ncc || null]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] POST /suppliers error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// ORDER BOOKINGS (Tab 1: Dat Hang)
// =====================================================

router.get('/order-bookings', async (req, res) => {
    try {
        const db = getDb(req);
        const { date_from, date_to, stt_ncc, trang_thai, search, limit = 200, offset = 0 } = req.query;

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (date_from) {
            conditions.push(`ngay_dat_hang >= $${paramIdx++}`);
            params.push(date_from);
        }
        if (date_to) {
            conditions.push(`ngay_dat_hang <= $${paramIdx++}`);
            params.push(date_to);
        }
        if (stt_ncc && stt_ncc !== 'all') {
            conditions.push(`stt_ncc = $${paramIdx++}`);
            params.push(parseInt(stt_ncc));
        }
        if (trang_thai && trang_thai !== 'all') {
            conditions.push(`trang_thai = $${paramIdx++}`);
            params.push(trang_thai);
        }
        if (search) {
            conditions.push(`san_pham::text ILIKE $${paramIdx++}`);
            params.push(`%${search}%`);
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Get count
        const countResult = await db.query(
            `SELECT COUNT(*)::int as total FROM inventory_order_bookings ${where}`, params
        );

        // Get data
        params.push(parseInt(limit), parseInt(offset));
        const result = await db.query(
            `SELECT * FROM inventory_order_bookings ${where}
             ORDER BY ngay_dat_hang DESC, created_at DESC
             LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            params
        );

        // Status counts (within same filter scope, minus trang_thai filter)
        const statusConditions = conditions.filter(c => !c.startsWith('trang_thai'));
        const statusParams = params.slice(0, statusConditions.length);
        const statusWhere = statusConditions.length > 0 ? 'WHERE ' + statusConditions.join(' AND ') : '';
        const statusResult = await db.query(
            `SELECT trang_thai, COUNT(*)::int as count FROM inventory_order_bookings ${statusWhere} GROUP BY trang_thai`,
            statusParams
        );
        const statusCounts = {};
        statusResult.rows.forEach(r => { statusCounts[r.trang_thai] = r.count; });

        res.json({
            success: true,
            data: result.rows,
            meta: { total: countResult.rows[0].total, limit: parseInt(limit), offset: parseInt(offset) },
            statusCounts
        });
    } catch (err) {
        console.error('[inventory] GET /order-bookings error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/order-bookings/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('SELECT * FROM inventory_order_bookings WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/order-bookings', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const {
            id, stt_ncc, ngay_dat_hang, ten_ncc, trang_thai = 'pending',
            san_pham = [], tong_tien_hd = 0, tong_mon = 0,
            anh_hoa_don = [], ghi_chu = '', linked_dot_hang_id
        } = req.body;

        if (!stt_ncc || !ngay_dat_hang) {
            return res.status(400).json({ success: false, error: 'stt_ncc and ngay_dat_hang required' });
        }

        // Ensure supplier exists
        await db.query(`
            INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc)
            VALUES ($1, $2, $3)
            ON CONFLICT (stt_ncc) DO UPDATE SET
                ten_ncc = COALESCE(EXCLUDED.ten_ncc, inventory_suppliers.ten_ncc),
                updated_at = NOW()
        `, [generateId('ncc'), stt_ncc, ten_ncc || null]);

        const bookingId = id || generateId('booking');
        const result = await db.query(`
            INSERT INTO inventory_order_bookings (
                id, stt_ncc, ngay_dat_hang, ten_ncc, trang_thai,
                san_pham, tong_tien_hd, tong_mon,
                anh_hoa_don, ghi_chu, linked_dot_hang_id,
                created_by, updated_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING *
        `, [
            bookingId, stt_ncc, ngay_dat_hang, ten_ncc, trang_thai,
            JSON.stringify(san_pham), tong_tien_hd, tong_mon,
            anh_hoa_don, ghi_chu, linked_dot_hang_id || null,
            user, user
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] POST /order-bookings error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/order-bookings/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const {
            stt_ncc, ngay_dat_hang, ten_ncc, trang_thai,
            san_pham, tong_tien_hd, tong_mon,
            anh_hoa_don, ghi_chu, linked_dot_hang_id
        } = req.body;

        const result = await db.query(`
            UPDATE inventory_order_bookings SET
                stt_ncc = COALESCE($2, stt_ncc),
                ngay_dat_hang = COALESCE($3, ngay_dat_hang),
                ten_ncc = COALESCE($4, ten_ncc),
                trang_thai = COALESCE($5, trang_thai),
                san_pham = COALESCE($6, san_pham),
                tong_tien_hd = COALESCE($7, tong_tien_hd),
                tong_mon = COALESCE($8, tong_mon),
                anh_hoa_don = COALESCE($9, anh_hoa_don),
                ghi_chu = COALESCE($10, ghi_chu),
                linked_dot_hang_id = $11,
                updated_by = $12,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            req.params.id, stt_ncc, ngay_dat_hang, ten_ncc, trang_thai,
            san_pham ? JSON.stringify(san_pham) : null,
            tong_tien_hd, tong_mon,
            anh_hoa_don, ghi_chu,
            linked_dot_hang_id !== undefined ? linked_dot_hang_id : null,
            user
        ]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] PUT /order-bookings/:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/order-bookings/:id/status', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { trang_thai } = req.body;
        if (!trang_thai) return res.status(400).json({ success: false, error: 'trang_thai required' });

        const result = await db.query(`
            UPDATE inventory_order_bookings SET trang_thai = $2, updated_by = $3, updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [req.params.id, trang_thai, user]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/order-bookings/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('DELETE FROM inventory_order_bookings WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// SHIPMENTS (Tab 2: Theo Doi Don Hang)
// =====================================================

router.get('/shipments', async (req, res) => {
    try {
        const db = getDb(req);
        const { date_from, date_to, stt_ncc, search, limit = 200, offset = 0 } = req.query;

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (date_from) {
            conditions.push(`ngay_di_hang >= $${paramIdx++}`);
            params.push(date_from);
        }
        if (date_to) {
            conditions.push(`ngay_di_hang <= $${paramIdx++}`);
            params.push(date_to);
        }
        if (stt_ncc && stt_ncc !== 'all') {
            conditions.push(`stt_ncc = $${paramIdx++}`);
            params.push(parseInt(stt_ncc));
        }
        if (search) {
            conditions.push(`san_pham::text ILIKE $${paramIdx++}`);
            params.push(`%${search}%`);
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const countResult = await db.query(
            `SELECT COUNT(*)::int as total FROM inventory_shipments ${where}`, params
        );

        params.push(parseInt(limit), parseInt(offset));
        const result = await db.query(
            `SELECT * FROM inventory_shipments ${where}
             ORDER BY ngay_di_hang DESC, created_at DESC
             LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
            params
        );

        res.json({
            success: true,
            data: result.rows,
            meta: { total: countResult.rows[0].total, limit: parseInt(limit), offset: parseInt(offset) }
        });
    } catch (err) {
        console.error('[inventory] GET /shipments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/shipments/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('SELECT * FROM inventory_shipments WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/shipments', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const {
            id, stt_ncc, ngay_di_hang, ten_ncc,
            kien_hang = [], tong_kien = 0, tong_kg = 0,
            san_pham = [], tong_tien_hd = 0, tong_mon = 0,
            so_mon_thieu = 0, ghi_chu_thieu = '',
            anh_hoa_don = [], ghi_chu = '',
            chi_phi_hang_ve = [], tong_chi_phi = 0,
            anh_san_pham = {},
            ghi_chu_admin = ''
        } = req.body;

        if (!stt_ncc || !ngay_di_hang) {
            return res.status(400).json({ success: false, error: 'stt_ncc and ngay_di_hang required' });
        }

        // Ensure supplier exists
        await db.query(`
            INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc)
            VALUES ($1, $2, $3)
            ON CONFLICT (stt_ncc) DO UPDATE SET
                ten_ncc = COALESCE(EXCLUDED.ten_ncc, inventory_suppliers.ten_ncc),
                updated_at = NOW()
        `, [generateId('ncc'), stt_ncc, ten_ncc || null]);

        const shipmentId = id || generateId('dot');
        const result = await db.query(`
            INSERT INTO inventory_shipments (
                id, stt_ncc, ngay_di_hang, ten_ncc,
                kien_hang, tong_kien, tong_kg,
                san_pham, tong_tien_hd, tong_mon,
                so_mon_thieu, ghi_chu_thieu,
                anh_hoa_don, ghi_chu,
                chi_phi_hang_ve, tong_chi_phi,
                anh_san_pham, ghi_chu_admin,
                created_by, updated_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            RETURNING *
        `, [
            shipmentId, stt_ncc, ngay_di_hang, ten_ncc,
            JSON.stringify(kien_hang), tong_kien, tong_kg,
            JSON.stringify(san_pham), tong_tien_hd, tong_mon,
            so_mon_thieu, ghi_chu_thieu,
            anh_hoa_don, ghi_chu,
            JSON.stringify(chi_phi_hang_ve), tong_chi_phi,
            JSON.stringify(anh_san_pham), ghi_chu_admin,
            user, user
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] POST /shipments error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/shipments/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const {
            stt_ncc, ngay_di_hang, ten_ncc,
            kien_hang, tong_kien, tong_kg,
            san_pham, tong_tien_hd, tong_mon,
            so_mon_thieu, ghi_chu_thieu,
            anh_hoa_don, ghi_chu,
            chi_phi_hang_ve, tong_chi_phi,
            anh_san_pham,
            ghi_chu_admin
        } = req.body;

        const result = await db.query(`
            UPDATE inventory_shipments SET
                stt_ncc = COALESCE($2, stt_ncc),
                ngay_di_hang = COALESCE($3, ngay_di_hang),
                ten_ncc = COALESCE($4, ten_ncc),
                kien_hang = COALESCE($5, kien_hang),
                tong_kien = COALESCE($6, tong_kien),
                tong_kg = COALESCE($7, tong_kg),
                san_pham = COALESCE($8, san_pham),
                tong_tien_hd = COALESCE($9, tong_tien_hd),
                tong_mon = COALESCE($10, tong_mon),
                so_mon_thieu = COALESCE($11, so_mon_thieu),
                ghi_chu_thieu = COALESCE($12, ghi_chu_thieu),
                anh_hoa_don = COALESCE($13, anh_hoa_don),
                ghi_chu = COALESCE($14, ghi_chu),
                chi_phi_hang_ve = COALESCE($15, chi_phi_hang_ve),
                tong_chi_phi = COALESCE($16, tong_chi_phi),
                anh_san_pham = COALESCE($17, anh_san_pham),
                ghi_chu_admin = COALESCE($18, ghi_chu_admin),
                updated_by = $19,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            req.params.id, stt_ncc, ngay_di_hang, ten_ncc,
            kien_hang ? JSON.stringify(kien_hang) : null,
            tong_kien, tong_kg,
            san_pham ? JSON.stringify(san_pham) : null,
            tong_tien_hd, tong_mon,
            so_mon_thieu, ghi_chu_thieu,
            anh_hoa_don, ghi_chu,
            chi_phi_hang_ve ? JSON.stringify(chi_phi_hang_ve) : null,
            tong_chi_phi,
            anh_san_pham ? JSON.stringify(anh_san_pham) : null,
            ghi_chu_admin !== undefined ? ghi_chu_admin : null,
            user
        ]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] PUT /shipments/:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/shipments/:id/shortage', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { so_mon_thieu, ghi_chu_thieu } = req.body;

        const result = await db.query(`
            UPDATE inventory_shipments SET
                so_mon_thieu = COALESCE($2, so_mon_thieu),
                ghi_chu_thieu = COALESCE($3, ghi_chu_thieu),
                updated_by = $4, updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [req.params.id, so_mon_thieu, ghi_chu_thieu, user]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/shipments/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('DELETE FROM inventory_shipments WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PREPAYMENTS (Tab 3: Cong No)
// =====================================================

router.get('/prepayments', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('SELECT * FROM inventory_prepayments ORDER BY ngay DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/prepayments', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { ngay, so_tien, ghi_chu = '' } = req.body;
        if (!ngay || so_tien === undefined) {
            return res.status(400).json({ success: false, error: 'ngay and so_tien required' });
        }

        const result = await db.query(`
            INSERT INTO inventory_prepayments (id, ngay, so_tien, ghi_chu, created_by)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [generateId('prep'), ngay, so_tien, ghi_chu, user]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/prepayments/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const { ngay, so_tien, ghi_chu } = req.body;
        const result = await db.query(`
            UPDATE inventory_prepayments SET
                ngay = COALESCE($2, ngay), so_tien = COALESCE($3, so_tien),
                ghi_chu = COALESCE($4, ghi_chu), updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [req.params.id, ngay, so_tien, ghi_chu]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/prepayments/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('DELETE FROM inventory_prepayments WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// OTHER EXPENSES (Tab 3: Cong No)
// =====================================================

router.get('/other-expenses', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('SELECT * FROM inventory_other_expenses ORDER BY ngay DESC');
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/other-expenses', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { ngay, loai_chi = '', so_tien, ghi_chu = '' } = req.body;
        if (!ngay || so_tien === undefined) {
            return res.status(400).json({ success: false, error: 'ngay and so_tien required' });
        }

        const result = await db.query(`
            INSERT INTO inventory_other_expenses (id, ngay, loai_chi, so_tien, ghi_chu, created_by)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [generateId('exp'), ngay, loai_chi, so_tien, ghi_chu, user]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/other-expenses/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const { ngay, loai_chi, so_tien, ghi_chu } = req.body;
        const result = await db.query(`
            UPDATE inventory_other_expenses SET
                ngay = COALESCE($2, ngay), loai_chi = COALESCE($3, loai_chi),
                so_tien = COALESCE($4, so_tien), ghi_chu = COALESCE($5, ghi_chu),
                updated_at = NOW()
            WHERE id = $1 RETURNING *
        `, [req.params.id, ngay, loai_chi, so_tien, ghi_chu]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/other-expenses/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query('DELETE FROM inventory_other_expenses WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// FINANCE SUMMARY (Tab 3)
// =====================================================

router.get('/finance/summary', async (req, res) => {
    try {
        const db = getDb(req);

        const [prepResult, invoiceResult, shippingResult, expenseResult] = await Promise.all([
            db.query('SELECT COALESCE(SUM(so_tien), 0)::numeric as total FROM inventory_prepayments'),
            db.query('SELECT COALESCE(SUM(tong_tien_hd), 0)::numeric as total FROM inventory_shipments'),
            db.query('SELECT COALESCE(SUM(tong_chi_phi), 0)::numeric as total FROM inventory_shipments'),
            db.query('SELECT COALESCE(SUM(so_tien), 0)::numeric as total FROM inventory_other_expenses'),
        ]);

        const tongThanhToanTruoc = parseFloat(prepResult.rows[0].total);
        const tongTienHoaDon = parseFloat(invoiceResult.rows[0].total);
        const tongChiPhiHangVe = parseFloat(shippingResult.rows[0].total);
        const tongChiPhiKhac = parseFloat(expenseResult.rows[0].total);
        const conLai = tongThanhToanTruoc - tongTienHoaDon - tongChiPhiHangVe - tongChiPhiKhac;

        res.json({
            success: true,
            data: {
                tongThanhToanTruoc,
                tongTienHoaDon,
                tongChiPhiHangVe,
                tongChiPhiKhac,
                conLai
            }
        });
    } catch (err) {
        console.error('[inventory] GET /finance/summary error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// EDIT HISTORY
// =====================================================

router.get('/edit-history', async (req, res) => {
    try {
        const db = getDb(req);
        const { limit = 50, offset = 0, entity_type } = req.query;

        let query = 'SELECT * FROM inventory_edit_history';
        const params = [];
        let paramIdx = 1;

        if (entity_type) {
            query += ` WHERE entity_type = $${paramIdx++}`;
            params.push(entity_type);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/edit-history', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { action, entity_type, entity_id, stt_ncc, changes = {} } = req.body;

        const result = await db.query(`
            INSERT INTO inventory_edit_history (id, action, entity_type, entity_id, stt_ncc, changes, user_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [generateId('hist'), action, entity_type, entity_id, stt_ncc || null, JSON.stringify(changes), user]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// NOTES (Multi-user Ghi Chú per invoice)
// =====================================================

router.get('/notes', async (req, res) => {
    try {
        const db = getDb(req);
        const { invoice_ids } = req.query;
        if (!invoice_ids) return res.json({ success: true, data: [] });

        const ids = invoice_ids.split(',').filter(Boolean);
        if (ids.length === 0) return res.json({ success: true, data: [] });

        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await db.query(
            `SELECT * FROM inventory_notes WHERE invoice_id IN (${placeholders}) ORDER BY created_at ASC`,
            ids
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[inventory] GET /notes error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/notes', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { invoice_id, note_text, note_images, is_admin = false } = req.body;

        if (!invoice_id) return res.status(400).json({ success: false, error: 'invoice_id required' });
        if (!note_text && (!note_images || note_images.length === 0)) {
            return res.status(400).json({ success: false, error: 'Note content required' });
        }

        const result = await db.query(`
            INSERT INTO inventory_notes (invoice_id, username, is_admin, note_text, note_images)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [invoice_id, user, is_admin, note_text || '', note_images || []]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] POST /notes error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/notes/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);
        const { note_text, note_images } = req.body;

        const result = await db.query(`
            UPDATE inventory_notes SET note_text = $3, note_images = $4
            WHERE id = $1 AND username = $2 RETURNING *
        `, [req.params.id, user, note_text || '', note_images || []]);

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found or not owned' });
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[inventory] PUT /notes/:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/notes/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const user = getUserFromHeaders(req);

        const result = await db.query(
            'DELETE FROM inventory_notes WHERE id = $1 AND username = $2 RETURNING id',
            [req.params.id, user]
        );

        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found or not owned' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        console.error('[inventory] DELETE /notes/:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PRODUCT IMAGES (independent, mapped by STT/NCC)
// =====================================================

router.get('/product-images', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query(
            'SELECT * FROM inventory_product_images ORDER BY stt, ncc NULLS FIRST'
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('[inventory] GET /product-images error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/product-images', async (req, res) => {
    try {
        const db = getDb(req);
        const { rows } = req.body; // [{ stt, ncc, urls }]

        if (!Array.isArray(rows)) {
            return res.status(400).json({ success: false, error: 'rows must be an array' });
        }

        // Bulk replace: delete all, then insert new
        await db.query('BEGIN');
        await db.query('DELETE FROM inventory_product_images');

        for (const row of rows) {
            if (!row.stt || !Array.isArray(row.urls) || row.urls.length === 0) continue;
            await db.query(
                `INSERT INTO inventory_product_images (stt, ncc, urls, updated_at)
                 VALUES ($1, $2, $3, NOW())`,
                [row.stt, row.ncc || null, JSON.stringify(row.urls)]
            );
        }

        await db.query('COMMIT');

        const result = await db.query(
            'SELECT * FROM inventory_product_images ORDER BY stt, ncc NULLS FIRST'
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        await getDb(req).query('ROLLBACK').catch(() => {});
        console.error('[inventory] PUT /product-images error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/product-images/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const result = await db.query(
            'DELETE FROM inventory_product_images WHERE id = $1 RETURNING id',
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (err) {
        console.error('[inventory] DELETE /product-images/:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
