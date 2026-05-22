// #Note: WEB2.0 module. F07 — Customer 360 cho NCC (read-only v1 + ratings).

const express = require('express');
const router = express.Router();

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_supplier_ratings (
            id BIGSERIAL PRIMARY KEY,
            supplier_code TEXT NOT NULL,
            score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
            comment TEXT,
            user_id TEXT,
            user_name TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_w2_sup_rating_code ON web2_supplier_ratings(supplier_code, created_at DESC);
    `);
    _migrationDone = true;
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'schema-init: ' + e.message });
    }
});

// GET /:code/summary
router.get('/:code/summary', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const code = req.params.code;

        // Ratings
        const rRs = await pool.query(
            `SELECT id, score, comment, user_name, created_at
             FROM web2_supplier_ratings WHERE supplier_code = $1 ORDER BY created_at DESC LIMIT 20`,
            [code]
        );
        const avgRs = await pool.query(
            `SELECT AVG(score)::float AS avg, COUNT(*)::int AS c
             FROM web2_supplier_ratings WHERE supplier_code = $1`,
            [code]
        );

        // Purchase refunds (web2_records)
        let refunds = [];
        try {
            const r = await pool.query(
                `SELECT code, name, data, created_at FROM web2_records
                 WHERE entity_slug = 'purchase-refund' AND (data->>'supplier_code' = $1 OR data->>'supplier_name' = $1)
                 ORDER BY created_at DESC LIMIT 50`,
                [code]
            );
            refunds = r.rows;
        } catch {}

        res.json({
            success: true,
            code,
            rating: {
                avg: avgRs.rows[0]?.avg || null,
                count: avgRs.rows[0]?.c || 0,
                recent: rRs.rows,
            },
            refunds,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /:code/rating
router.post('/:code/rating', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const { score, comment, user_id, user_name } = req.body || {};
        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ success: false, error: 'score 1-5 bắt buộc' });
        }
        const rs = await pool.query(
            `INSERT INTO web2_supplier_ratings (supplier_code, score, comment, user_id, user_name)
             VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
            [req.params.code, score, comment || null, user_id || null, user_name || null]
        );
        res.json({ success: true, id: rs.rows[0].id });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
