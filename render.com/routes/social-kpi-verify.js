// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Social KPI Verification — đánh dấu "đã kiểm tra" cho đơn KPI Đơn Inbox + lịch sử.
 *
 * Feature mới, bảng + endpoint RIÊNG (tuân MEMORY feedback_api_scope: append-only,
 * KHÔNG đụng endpoint KPI/TPOS hiện có). Pool: chatDb (Web 1.0 — social_orders cùng DB).
 *
 * Append-only log: mỗi lần check/uncheck = 1 row. Trạng thái hiện tại của 1 đơn =
 * action của row mới nhất (verified_at DESC) của order_id đó. Lịch sử = toàn bộ rows.
 */

const express = require('express');
const router = express.Router();

let _tablesCreated = false;

async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS social_kpi_verifications (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) NOT NULL,
                invoice_number VARCHAR(100),
                seller_name VARCHAR(255),
                customer_name VARCHAR(255),
                action VARCHAR(20) NOT NULL DEFAULT 'check',
                verified_by VARCHAR(100),
                verified_by_name VARCHAR(255),
                note TEXT,
                verified_at BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_skpiv_order ON social_kpi_verifications(order_id);
            CREATE INDEX IF NOT EXISTS idx_skpiv_verified_at ON social_kpi_verifications(verified_at DESC);
        `);
        _tablesCreated = true;
        console.log('[SOCIAL-KPI-VERIFY] Tables created/verified');
    } catch (error) {
        console.error('[SOCIAL-KPI-VERIFY] Table creation error:', error.message);
    }
}

/**
 * GET /api/social-kpi-verify/load?from=&to=
 * Trả: { success, history:[...rows DESC], current:{ orderId: {checked, verifiedBy, verifiedByName, verifiedAt} } }
 *   - history: append-only log (mới nhất trước) — optionally lọc theo verified_at trong [from,to].
 *   - current: trạng thái hiện tại mỗi đơn = action mới nhất.
 */
router.get('/load', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const { from, to } = req.query;
        const conds = [];
        const params = [];
        if (from) {
            params.push(parseInt(from));
            conds.push(`verified_at >= $${params.length}`);
        }
        if (to) {
            params.push(parseInt(to));
            conds.push(`verified_at <= $${params.length}`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const result = await pool.query(
            `SELECT order_id, invoice_number, seller_name, customer_name, action,
                    verified_by, verified_by_name, note, verified_at
             FROM social_kpi_verifications ${where}
             ORDER BY verified_at DESC LIMIT 5000`,
            params
        );
        const history = result.rows.map((r) => ({
            orderId: r.order_id,
            invoiceNumber: r.invoice_number,
            sellerName: r.seller_name,
            customerName: r.customer_name,
            action: r.action,
            verifiedBy: r.verified_by,
            verifiedByName: r.verified_by_name,
            note: r.note,
            verifiedAt: parseInt(r.verified_at) || 0,
        }));

        // current = action mới nhất mỗi order_id (history đã DESC → row đầu tiên gặp là mới nhất)
        const current = {};
        for (const h of history) {
            if (current[h.orderId]) continue;
            current[h.orderId] = {
                checked: h.action === 'check',
                verifiedBy: h.verifiedBy,
                verifiedByName: h.verifiedByName,
                verifiedAt: h.verifiedAt,
            };
        }

        res.json({ success: true, history, current });
    } catch (error) {
        console.error('[SOCIAL-KPI-VERIFY] GET /load error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/social-kpi-verify/mark
 * Body: { orderId, invoiceNumber, sellerName, customerName, action:'check'|'uncheck',
 *         verifiedBy, verifiedByName, note, verifiedAt }
 * Insert 1 row (append-only). Trả: { success, verifiedAt }.
 */
router.post('/mark', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);

        const b = req.body || {};
        if (!b.orderId) return res.status(400).json({ error: 'orderId required' });
        const action = b.action === 'uncheck' ? 'uncheck' : 'check';
        const verifiedAt = parseInt(b.verifiedAt) || Date.now();

        await pool.query(
            `INSERT INTO social_kpi_verifications
                (order_id, invoice_number, seller_name, customer_name, action,
                 verified_by, verified_by_name, note, verified_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
                String(b.orderId),
                b.invoiceNumber || null,
                b.sellerName || null,
                b.customerName || null,
                action,
                b.verifiedBy || null,
                b.verifiedByName || null,
                b.note || null,
                verifiedAt,
            ]
        );
        res.json({ success: true, verifiedAt });
    } catch (error) {
        console.error('[SOCIAL-KPI-VERIFY] POST /mark error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/social-orders/kpi-verify/:orderId
 * Xóa toàn bộ lịch sử kiểm tra của 1 đơn (cleanup / xóa nhầm). Trả { success, deleted }.
 */
router.delete('/:orderId', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        if (!pool) return res.status(500).json({ error: 'Database not available' });
        await ensureTables(pool);
        const orderId = String(req.params.orderId || '');
        if (!orderId) return res.status(400).json({ error: 'orderId required' });
        const r = await pool.query('DELETE FROM social_kpi_verifications WHERE order_id = $1', [orderId]);
        res.json({ success: true, deleted: r.rowCount });
    } catch (error) {
        console.error('[SOCIAL-KPI-VERIFY] DELETE error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
