// #Note: WEB2.0 module. Web 2.0 supplier debt store — REPLACE legacy call
// đến TPOS PartnerDebtReport (Web 1.0 coupling).
//
// Compute on-demand từ:
//   - inventory_shipments (so-order shipments): total = sum(tong_tien_hd + tong_chi_phi)
//   - thanh_toan_ck arrays trong shipments: sum(amount) = paid
//   - debt = total - paid
//
// Optional join với inventory_suppliers cho NCC name lookup.
//
// Per user spec 2026-06-01: Web 2.0 tách biệt với TPOS, debt KHÔNG nằm
// trong 3 cases TPOS được phép (KH lookup, campaigns, comments) → cần
// independent store.

const express = require('express');
const router = express.Router();

// GET /aggregate — list tất cả NCC với debt computed
// Query: ?limit=50&offset=0&search=<NCC name>&filter=debt|paid|all
router.get('/aggregate', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });

        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const search = String(req.query.search || '').trim();
        const filter = String(req.query.filter || 'all').toLowerCase();

        // Aggregate per NCC từ inventory_shipments. Mỗi shipment có
        // tong_tien_hd (hóa đơn) + tong_chi_phi (phí ship), và thanh_toan_ck
        // là JSONB array [{date, amount, note}, ...].
        const where = [];
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            where.push(
                `(ten_ncc ILIKE $${params.length} OR stt_ncc::text ILIKE $${params.length})`
            );
        }
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const sql = `
            SELECT
              stt_ncc,
              MAX(ten_ncc) as ten_ncc,
              COUNT(*)::int as shipment_count,
              SUM(COALESCE(tong_tien_hd, 0) + COALESCE(tong_chi_phi, 0))::bigint as total_owed,
              SUM(
                COALESCE((
                  SELECT SUM((p->>'amount')::numeric)
                  FROM jsonb_array_elements(COALESCE(thanh_toan_ck, '[]'::jsonb)) AS p
                ), 0)
              )::bigint as total_paid,
              MAX(ngay_di_hang) as last_shipment_date,
              MAX(updated_at) as updated_at
            FROM inventory_shipments
            ${whereClause}
            GROUP BY stt_ncc
        `;

        const r = await db.query(sql, params);
        let rows = r.rows.map((row) => {
            const owed = Number(row.total_owed) || 0;
            const paid = Number(row.total_paid) || 0;
            return {
                sttNcc: row.stt_ncc,
                tenNcc: row.ten_ncc,
                shipmentCount: row.shipment_count,
                totalOwed: owed,
                totalPaid: paid,
                debt: owed - paid,
                lastShipmentDate: row.last_shipment_date,
                updatedAt: row.updated_at,
            };
        });

        // Apply filter
        if (filter === 'debt') rows = rows.filter((r) => r.debt > 0);
        else if (filter === 'paid_off') rows = rows.filter((r) => r.debt <= 0);

        // Sort by debt desc default
        rows.sort((a, b) => b.debt - a.debt);

        const total = rows.length;
        rows = rows.slice(offset, offset + limit);

        res.json({ success: true, suppliers: rows, total, limit, offset });
    } catch (e) {
        console.error('[web2-supplier-debt] aggregate error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /:sttNcc — chi tiết 1 NCC (shipments + payments)
router.get('/:sttNcc', async (req, res) => {
    try {
        const db = req.app.locals.chatDb;
        if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });

        const sttNcc = parseInt(req.params.sttNcc, 10);
        if (!Number.isFinite(sttNcc)) {
            return res.status(400).json({ success: false, error: 'invalid sttNcc' });
        }

        const r = await db.query(
            `SELECT id, stt_ncc, ten_ncc, ngay_di_hang, tong_tien_hd, tong_chi_phi,
                    thanh_toan_ck, dot_so, ghi_chu, updated_at, created_at
             FROM inventory_shipments
             WHERE stt_ncc = $1
             ORDER BY ngay_di_hang DESC, dot_so DESC`,
            [sttNcc]
        );

        const shipments = r.rows.map((s) => {
            const payments = Array.isArray(s.thanh_toan_ck) ? s.thanh_toan_ck : [];
            const totalPaid = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const totalOwed = (Number(s.tong_tien_hd) || 0) + (Number(s.tong_chi_phi) || 0);
            return {
                id: s.id,
                dotSo: s.dot_so,
                ngayDiHang: s.ngay_di_hang,
                tongTienHd: Number(s.tong_tien_hd) || 0,
                tongChiPhi: Number(s.tong_chi_phi) || 0,
                totalOwed,
                payments,
                totalPaid,
                debt: totalOwed - totalPaid,
                ghiChu: s.ghi_chu,
                updatedAt: s.updated_at,
            };
        });

        const totalOwed = shipments.reduce((s, x) => s + x.totalOwed, 0);
        const totalPaid = shipments.reduce((s, x) => s + x.totalPaid, 0);

        res.json({
            success: true,
            sttNcc,
            tenNcc: r.rows[0]?.ten_ncc || null,
            shipmentCount: shipments.length,
            totalOwed,
            totalPaid,
            debt: totalOwed - totalPaid,
            shipments,
        });
    } catch (e) {
        console.error('[web2-supplier-debt] detail error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
