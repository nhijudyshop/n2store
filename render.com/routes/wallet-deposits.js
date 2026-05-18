// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WALLET DEPOSITS — query SePay bank transfers cho 2 ví (NCC + KH)
// Tận dụng table `balance_history` đã có (SePay webhook ghi vào).
//
// Endpoint:
//   GET /api/wallet-deposits/load?since=<unix_ms>&limit=200
//     → return list incoming transfers (transfer_type='in')
//     Wallet apps tự match: customer wallet (linked_customer_phone match)
//                          supplier wallet (content substring match)
// =====================================================

const express = require('express');
const router = express.Router();

router.get('/load', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const since = Number(req.query.since) || 0;
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    try {
        const since_ts = since > 0 ? new Date(since).toISOString() : null;
        const q = since_ts
            ? `SELECT id, sepay_id, transaction_date, transfer_amount,
                      content, reference_code, description,
                      linked_customer_phone,
                      EXTRACT(EPOCH FROM transaction_date) * 1000 AS ts_ms
               FROM balance_history
               WHERE transfer_type = 'in'
                 AND transaction_date >= $1
               ORDER BY transaction_date DESC
               LIMIT $2`
            : `SELECT id, sepay_id, transaction_date, transfer_amount,
                      content, reference_code, description,
                      linked_customer_phone,
                      EXTRACT(EPOCH FROM transaction_date) * 1000 AS ts_ms
               FROM balance_history
               WHERE transfer_type = 'in'
               ORDER BY transaction_date DESC
               LIMIT $1`;
        const params = since_ts ? [since_ts, limit] : [limit];
        const r = await pool.query(q, params);
        res.json({
            success: true,
            deposits: r.rows.map((row) => ({
                id: Number(row.id),
                sepayId: row.sepay_id,
                ts: Number(row.ts_ms) || 0,
                amount: Number(row.transfer_amount) || 0,
                content: row.content || '',
                referenceCode: row.reference_code || '',
                description: row.description || '',
                linkedPhone: row.linked_customer_phone || '',
            })),
        });
    } catch (e) {
        console.error('[WALLET-DEPOSITS] load error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
