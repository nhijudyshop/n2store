// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// HANG QQ (Hàng Hương Châu) REST API
// PostgreSQL-backed CRUD for goods tracking
// =====================================================

const express = require('express');
const router = express.Router();

let _tablesCreated = false;

async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS hang_qq (
                id SERIAL PRIMARY KEY,
                ngay_di_hang DATE,
                so_luong INTEGER,
                so_kg NUMERIC(10,2),
                stt VARCHAR(50),
                mo_ta TEXT,
                so_tien NUMERIC(12,2) DEFAULT 0,
                sl_nhan INTEGER,
                thieu INTEGER,
                chi_phi NUMERIC(12,2) DEFAULT 0,
                ghi_chu TEXT,
                ngay_tt DATE,
                so_tien_tt NUMERIC(12,2) DEFAULT 0,
                so_tien_vnd NUMERIC(15,0) DEFAULT 0,
                product_images JSONB DEFAULT '[]',
                invoice_images JSONB DEFAULT '[]',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        _tablesCreated = true;
        console.log('[HANG-QQ] Table created/verified');
    } catch (error) {
        console.error('[HANG-QQ] Error creating table:', error.message);
    }
}

function mapRow(row) {
    return {
        id: row.id,
        ngayDiHang: row.ngay_di_hang ? row.ngay_di_hang.toISOString().slice(0, 10) : '',
        soLuong: row.so_luong || '',
        soKg: row.so_kg ? parseFloat(row.so_kg) : '',
        stt: row.stt || '',
        moTa: row.mo_ta || '',
        soTien: row.so_tien ? parseFloat(row.so_tien) : '',
        slNhan: row.sl_nhan || '',
        thieu: row.thieu || '',
        chiPhi: row.chi_phi ? parseFloat(row.chi_phi) : '',
        ghiChu: row.ghi_chu || '',
        ngayTT: row.ngay_tt ? row.ngay_tt.toISOString().slice(0, 10) : '',
        soTienTT: row.so_tien_tt ? parseFloat(row.so_tien_tt) : '',
        soTienVND: row.so_tien_vnd ? parseFloat(row.so_tien_vnd) : '',
        productImages: row.product_images || [],
        invoiceImages: row.invoice_images || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// =====================================================
// GET /api/hang-qq — List all entries
// =====================================================
router.get('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'SELECT * FROM hang_qq ORDER BY ngay_di_hang DESC, id DESC'
        );

        res.json({ success: true, data: result.rows.map(mapRow) });
    } catch (error) {
        console.error('[HANG-QQ] GET / error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// POST /api/hang-qq — Create entry
// =====================================================
router.post('/', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const b = req.body;
        const result = await pool.query(`
            INSERT INTO hang_qq (ngay_di_hang, so_luong, so_kg, stt, mo_ta, so_tien,
                sl_nhan, thieu, chi_phi, ghi_chu, ngay_tt, so_tien_tt, so_tien_vnd,
                product_images, invoice_images)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            RETURNING *
        `, [
            b.ngayDiHang || null, b.soLuong || null, b.soKg || null,
            b.stt || null, b.moTa || null, b.soTien || 0,
            b.slNhan || null, b.thieu || null, b.chiPhi || 0,
            b.ghiChu || null, b.ngayTT || null, b.soTienTT || 0,
            b.soTienVND || 0,
            JSON.stringify(b.productImages || []),
            JSON.stringify(b.invoiceImages || []),
        ]);

        res.json({ success: true, data: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('[HANG-QQ] POST / error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// POST /api/hang-qq/bulk — Bulk import
// =====================================================
router.post('/bulk', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const entries = req.body.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'entries array required' });
        }

        let imported = 0;
        for (const b of entries) {
            await pool.query(`
                INSERT INTO hang_qq (ngay_di_hang, so_luong, so_kg, stt, mo_ta, so_tien,
                    sl_nhan, thieu, chi_phi, ghi_chu, ngay_tt, so_tien_tt, so_tien_vnd,
                    product_images, invoice_images)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            `, [
                b.ngayDiHang || null, b.soLuong || null, b.soKg || null,
                b.stt || null, b.moTa || null, b.soTien || 0,
                b.slNhan || null, b.thieu || null, b.chiPhi || 0,
                b.ghiChu || null, b.ngayTT || null, b.soTienTT || 0,
                b.soTienVND || 0,
                JSON.stringify(b.productImages || []),
                JSON.stringify(b.invoiceImages || []),
            ]);
            imported++;
        }

        res.json({ success: true, imported });
    } catch (error) {
        console.error('[HANG-QQ] POST /bulk error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PUT /api/hang-qq/:id — Update entry
// =====================================================
router.put('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const b = req.body;
        const result = await pool.query(`
            UPDATE hang_qq SET
                ngay_di_hang=$1, so_luong=$2, so_kg=$3, stt=$4, mo_ta=$5, so_tien=$6,
                sl_nhan=$7, thieu=$8, chi_phi=$9, ghi_chu=$10, ngay_tt=$11,
                so_tien_tt=$12, so_tien_vnd=$13,
                product_images=$14, invoice_images=$15,
                updated_at=NOW()
            WHERE id=$16
            RETURNING *
        `, [
            b.ngayDiHang || null, b.soLuong || null, b.soKg || null,
            b.stt || null, b.moTa || null, b.soTien || 0,
            b.slNhan || null, b.thieu || null, b.chiPhi || 0,
            b.ghiChu || null, b.ngayTT || null, b.soTienTT || 0,
            b.soTienVND || 0,
            JSON.stringify(b.productImages || []),
            JSON.stringify(b.invoiceImages || []),
            req.params.id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        res.json({ success: true, data: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('[HANG-QQ] PUT /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// PATCH /api/hang-qq/:id — Partial update (inline edit)
// =====================================================
router.patch('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const fieldMap = {
            ngayDiHang: 'ngay_di_hang', soLuong: 'so_luong', soKg: 'so_kg',
            stt: 'stt', moTa: 'mo_ta', soTien: 'so_tien',
            slNhan: 'sl_nhan', thieu: 'thieu', chiPhi: 'chi_phi',
            ghiChu: 'ghi_chu', ngayTT: 'ngay_tt', soTienTT: 'so_tien_tt',
            soTienVND: 'so_tien_vnd', productImages: 'product_images',
            invoiceImages: 'invoice_images',
        };

        const sets = [];
        const vals = [];
        let paramIdx = 1;

        for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
            if (req.body[jsKey] !== undefined) {
                const val = ['productImages', 'invoiceImages'].includes(jsKey)
                    ? JSON.stringify(req.body[jsKey])
                    : (req.body[jsKey] === '' ? null : req.body[jsKey]);
                sets.push(`${dbCol}=$${paramIdx++}`);
                vals.push(val);
            }
        }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        sets.push(`updated_at=NOW()`);
        vals.push(req.params.id);

        const result = await pool.query(
            `UPDATE hang_qq SET ${sets.join(', ')} WHERE id=$${paramIdx} RETURNING *`,
            vals
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        res.json({ success: true, data: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('[HANG-QQ] PATCH /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =====================================================
// DELETE /api/hang-qq/:id — Delete entry
// =====================================================
router.delete('/:id', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const result = await pool.query(
            'DELETE FROM hang_qq WHERE id=$1 RETURNING id', [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }

        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        console.error('[HANG-QQ] DELETE /:id error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
