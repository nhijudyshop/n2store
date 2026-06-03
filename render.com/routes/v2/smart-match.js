// #Note: WEB2.0 module. F09 — Smart match SePay → order/customer.

const express = require('express');
const router = express.Router();

function _normalizePhone(s) {
    if (!s) return '';
    return String(s)
        .replace(/[^0-9]/g, '')
        .replace(/^84/, '0');
}

function _scoreCandidate({ tx, candidate }) {
    let score = 0;
    const reasons = [];
    const amount = Number(tx.amount) || 0;
    const orderTotal = Number(candidate.amount_total) || 0;
    if (amount && orderTotal) {
        if (amount === orderTotal) {
            score += 50;
            reasons.push('amount=exact');
        } else if (Math.abs(amount - orderTotal) / orderTotal <= 0.05) {
            score += 30;
            reasons.push('amount±5%');
        }
    }
    const desc = String(tx.description || tx.content || '').toLowerCase();
    const phone = _normalizePhone(candidate.customer_phone);
    if (phone && desc.replace(/[^0-9]/g, '').includes(phone)) {
        score += 40;
        reasons.push('phone-in-desc');
    }
    const name = String(candidate.customer_name || '')
        .toLowerCase()
        .trim();
    if (name && name.length > 3 && desc.includes(name)) {
        score += 20;
        reasons.push('name-in-desc');
    }
    if (candidate.created_at && tx.transaction_date) {
        const dt = new Date(candidate.created_at).getTime();
        const tt = new Date(tx.transaction_date).getTime();
        if (!isNaN(dt) && !isNaN(tt)) {
            const diffH = Math.abs(tt - dt) / 3_600_000;
            if (diffH <= 24) {
                score += 30;
                reasons.push('within-24h');
            } else if (diffH <= 72) {
                score += 10;
                reasons.push('within-72h');
            }
        }
    }
    return { score, reasons };
}

// GET /:txId — suggest top 3 candidates for SePay transaction
router.get('/:txId', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const txRs = await pool.query(
            `SELECT id, transfer_amount AS amount, description, content, transaction_date
             FROM web2_balance_history WHERE id = $1`,
            [req.params.txId]
        );
        if (!txRs.rowCount) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }
        const tx = txRs.rows[0];

        // Candidates: PBH state=done & not paid in last 30 days với amount gần đúng (±10%)
        const amt = Number(tx.amount) || 0;
        const lo = Math.floor(amt * 0.9);
        const hi = Math.ceil(amt * 1.1);
        const candRs = await pool.query(
            `SELECT number,
                    partner_name AS customer_name,
                    partner_phone AS customer_phone,
                    amount_total,
                    date_created AS created_at
             FROM fast_sale_orders
             WHERE state = 'done'
               AND date_created > NOW() - INTERVAL '30 days'
               AND amount_total BETWEEN $1 AND $2
             ORDER BY date_created DESC
             LIMIT 30`,
            [lo, hi]
        );
        const ranked = candRs.rows
            .map((c) => ({
                candidate: c,
                ..._scoreCandidate({ tx, candidate: c }),
            }))
            .filter((x) => x.score >= 30)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        res.json({ success: true, tx, suggestions: ranked });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
