// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// REFUNDS (Trả hàng) — Phase 4
// 1 PBH → có thể có nhiều phiếu refund (trả từng phần / từng đợt).
// =====================================================

const express = require('express');
const router = express.Router();

let _ready = false;
async function ensureTables(pool) {
    if (_ready) return;
    try {
        await pool.query(`
            -- Migration 072: refunds (Trả hàng)
            CREATE TABLE IF NOT EXISTS refunds (
                id              BIGSERIAL PRIMARY KEY,
                number          VARCHAR(50) UNIQUE NOT NULL,    -- RF-YYYYMMDD-XXXX
                display_stt     INTEGER,

                -- Link to source PBH
                fso_id          BIGINT,
                fso_number      VARCHAR(50),

                -- Dates
                date_refund     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_created    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                -- Customer snapshot
                partner_id      INTEGER,
                partner_name    VARCHAR(255),
                partner_phone   VARCHAR(40),

                -- Refund items (subset of PBH order_lines + quantity_returned)
                refund_lines    JSONB DEFAULT '[]'::jsonb,
                total_quantity  INTEGER DEFAULT 0,
                amount_refund   NUMERIC(15,2) DEFAULT 0,

                -- Refund mode
                refund_mode     VARCHAR(30) DEFAULT 'cash',    -- cash|wallet|exchange
                exchange_lines  JSONB,                          -- nếu exchange, sản phẩm thay thế

                -- State
                state           VARCHAR(30) NOT NULL DEFAULT 'draft',   -- draft|approved|completed|cancel
                state_history   JSONB DEFAULT '[]'::jsonb,

                -- Misc
                reason          TEXT,
                note            TEXT,
                created_by      VARCHAR(100),
                created_by_name VARCHAR(255)
            );

            CREATE INDEX IF NOT EXISTS idx_rf_fso ON refunds(fso_id);
            CREATE INDEX IF NOT EXISTS idx_rf_fso_number ON refunds(fso_number);
            CREATE INDEX IF NOT EXISTS idx_rf_state ON refunds(state);
            CREATE INDEX IF NOT EXISTS idx_rf_date ON refunds(date_refund DESC);
            CREATE INDEX IF NOT EXISTS idx_rf_partner_phone ON refunds(partner_phone);

            CREATE SEQUENCE IF NOT EXISTS refunds_display_stt_seq START 1;
        `);
        _ready = true;
        console.log('[REFUNDS] Tables created/verified (migration 072)');
    } catch (e) {
        console.error('[REFUNDS] migration error:', e.message);
    }
}

function pad(n, w) {
    const s = String(n);
    return s.length >= w ? s : '0'.repeat(w - s.length) + s;
}

function mapRow(r) {
    if (!r) return null;
    return {
        id: Number(r.id),
        number: r.number,
        displayStt: r.display_stt,
        fso: { id: r.fso_id ? Number(r.fso_id) : null, number: r.fso_number },
        dateRefund: r.date_refund,
        dateCreated: r.date_created,
        dateUpdated: r.date_updated,
        partner: { id: r.partner_id, name: r.partner_name, phone: r.partner_phone },
        refundLines: r.refund_lines || [],
        totalQuantity: r.total_quantity,
        amountRefund: Number(r.amount_refund || 0),
        refundMode: r.refund_mode,
        exchangeLines: r.exchange_lines || null,
        state: r.state,
        stateHistory: r.state_history || [],
        reason: r.reason,
        note: r.note,
        createdBy: r.created_by,
        createdByName: r.created_by_name,
    };
}

async function nextNumber(pool) {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `RF-${datePart}-`;
    const r = await pool.query(
        `SELECT number FROM refunds WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length) {
        const m = r.rows[0].number.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

function computeRefundTotals(lines) {
    const arr = Array.isArray(lines) ? lines : [];
    let qty = 0,
        amount = 0;
    for (const l of arr) {
        const q = Number(l.quantityReturned ?? l.quantity ?? 0);
        const p = Number(l.priceUnit ?? l.price ?? 0);
        qty += q;
        amount += q * p;
    }
    return { qty, amount };
}

router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM refunds');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/load', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const { state, search, limit, page, fsoNumber } = req.query;
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (state) {
            params.push(state);
            conds.push(`state = $${params.length}`);
        }
        if (fsoNumber) {
            params.push(fsoNumber);
            conds.push(`fso_number = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(partner_name ILIKE $${i} OR partner_phone ILIKE $${i} OR number ILIKE $${i} OR fso_number ILIKE $${i})`
            );
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const countR = await pool.query(`SELECT COUNT(*)::int AS n FROM refunds ${where}`, params);
        const total = countR.rows[0].n;
        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM refunds ${where} ORDER BY date_refund DESC, id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            orders: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:number', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT * FROM refunds WHERE number = $1', [req.params.number]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, order: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /from-pbh — Create refund from PBH
// Body: { pbhNumber, refundLines:[{productId, quantityReturned, priceUnit}],
//   refundMode? 'cash'|'wallet'|'exchange', exchangeLines?, reason, note }
router.post('/from-pbh', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.pbhNumber) return res.status(400).json({ error: 'pbhNumber required' });

        const fso = (
            await pool.query('SELECT * FROM fast_sale_orders WHERE number = $1', [b.pbhNumber])
        ).rows[0];
        if (!fso) return res.status(404).json({ error: 'PBH not found' });

        const lines = Array.isArray(b.refundLines)
            ? b.refundLines
            : (fso.order_lines || []).map((l) => ({
                  ...l,
                  quantityReturned: l.quantity,
              }));
        const totals = computeRefundTotals(lines);
        const number = await nextNumber(pool);

        const r = await pool.query(
            `INSERT INTO refunds (
                number, display_stt, fso_id, fso_number,
                date_refund,
                partner_id, partner_name, partner_phone,
                refund_lines, total_quantity, amount_refund,
                refund_mode, exchange_lines,
                state, state_history, reason, note,
                created_by, created_by_name
            ) VALUES (
                $1, nextval('refunds_display_stt_seq'), $2, $3,
                COALESCE($4::timestamptz, NOW()),
                $5, $6, $7,
                $8::jsonb, $9, $10,
                $11, $12::jsonb,
                'draft', $13::jsonb, $14, $15,
                $16, $17
            ) RETURNING *`,
            [
                number,
                fso.id,
                fso.number,
                b.dateRefund || null,
                fso.partner_id,
                fso.partner_name,
                fso.partner_phone,
                JSON.stringify(lines),
                totals.qty,
                totals.amount,
                b.refundMode || 'cash',
                b.exchangeLines ? JSON.stringify(b.exchangeLines) : null,
                JSON.stringify([
                    { from: null, to: 'draft', at: Date.now(), by: b.createdBy || null },
                ]),
                b.reason || null,
                b.note || null,
                b.createdBy || null,
                b.createdByName || null,
            ]
        );
        res.json({ success: true, order: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[REFUNDS] from-pbh error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

async function _changeState(pool, number, newState, by) {
    const cur = await pool.query('SELECT state, state_history FROM refunds WHERE number = $1', [
        number,
    ]);
    if (!cur.rows.length) return null;
    const history = cur.rows[0].state_history || [];
    history.push({ from: cur.rows[0].state, to: newState, at: Date.now(), by: by || null });
    const r = await pool.query(
        `UPDATE refunds SET state = $1, state_history = $2::jsonb, date_updated = NOW() WHERE number = $3 RETURNING *`,
        [newState, JSON.stringify(history), number]
    );
    return r.rows[0];
}
for (const [path, st] of [
    ['/:number/approve', 'approved'],
    ['/:number/complete', 'completed'],
    ['/:number/cancel', 'cancel'],
]) {
    router.post(path, async (req, res) => {
        const pool = req.app.locals.chatDb;
        try {
            await ensureTables(pool);
            const row = await _changeState(pool, req.params.number, st, req.body?.by);
            if (!row) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true, order: mapRow(row) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

router.delete('/:number', async (req, res) => {
    const pool = req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const force = req.query.force === '1';
        const guard = force ? '' : `AND state IN ('draft', 'cancel')`;
        const r = await pool.query(
            `DELETE FROM refunds WHERE number = $1 ${guard} RETURNING number`,
            [req.params.number]
        );
        if (!r.rows.length)
            return res
                .status(404)
                .json({ error: 'Not deletable (state ≠ draft/cancel, use force=1)' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
