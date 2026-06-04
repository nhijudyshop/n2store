// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// DELIVERY INVOICES (Phiếu Giao Hàng) — Phase 4
// Phiếu giao hàng được tạo từ PBH (FastSaleOrder).
// 1 PBH → có thể có nhiều phiếu giao (chia lô, chia ngày).
// =====================================================

const express = require('express');
const router = express.Router();

let _ready = false;
async function ensureTables(pool) {
    if (_ready) return;
    try {
        await pool.query(`
            -- Migration 071: delivery_invoices (Phiếu Giao Hàng)
            CREATE TABLE IF NOT EXISTS delivery_invoices (
                id              BIGSERIAL PRIMARY KEY,
                number          VARCHAR(50) UNIQUE NOT NULL,    -- DLV-YYYYMMDD-XXXX
                display_stt     INTEGER,

                -- Link to source PBH
                fso_id          BIGINT,
                fso_number      VARCHAR(50),

                -- Dates
                date_delivery   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_created    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                date_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

                -- Customer snapshot (from PBH)
                partner_id      INTEGER,
                partner_name    VARCHAR(255),
                partner_phone   VARCHAR(40),
                partner_address TEXT,
                city_name       VARCHAR(120),
                district_name   VARCHAR(120),
                ward_name       VARCHAR(120),

                -- Carrier
                carrier_id      INTEGER,
                carrier_name    VARCHAR(150),
                tracking_ref    VARCHAR(255),
                tracking_url    TEXT,

                -- Items
                delivery_lines  JSONB DEFAULT '[]'::jsonb,  -- subset of PBH lines being delivered
                total_quantity  INTEGER DEFAULT 0,
                total_weight    NUMERIC(10,2),   -- kg

                -- Money
                cash_on_delivery NUMERIC(15,2) DEFAULT 0,
                delivery_fee     NUMERIC(15,2) DEFAULT 0,

                -- State
                state           VARCHAR(30) NOT NULL DEFAULT 'pending',  -- pending|shipping|delivered|returned|cancel
                state_history   JSONB DEFAULT '[]'::jsonb,

                -- Misc
                note            TEXT,
                created_by      VARCHAR(100),
                created_by_name VARCHAR(255)
            );

            CREATE INDEX IF NOT EXISTS idx_dlv_fso ON delivery_invoices(fso_id);
            CREATE INDEX IF NOT EXISTS idx_dlv_fso_number ON delivery_invoices(fso_number);
            CREATE INDEX IF NOT EXISTS idx_dlv_state ON delivery_invoices(state);
            CREATE INDEX IF NOT EXISTS idx_dlv_tracking ON delivery_invoices(tracking_ref);
            CREATE INDEX IF NOT EXISTS idx_dlv_date ON delivery_invoices(date_delivery DESC);
            CREATE INDEX IF NOT EXISTS idx_dlv_partner_phone ON delivery_invoices(partner_phone);

            CREATE SEQUENCE IF NOT EXISTS delivery_invoices_display_stt_seq START 1;
        `);
        _ready = true;
        console.log('[DELIVERY-INVOICES] Tables created/verified (migration 071)');
    } catch (e) {
        console.error('[DELIVERY-INVOICES] migration error:', e.message);
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
        dateDelivery: r.date_delivery,
        dateCreated: r.date_created,
        dateUpdated: r.date_updated,
        partner: {
            id: r.partner_id,
            name: r.partner_name,
            phone: r.partner_phone,
            address: r.partner_address,
            cityName: r.city_name,
            districtName: r.district_name,
            wardName: r.ward_name,
        },
        carrier: {
            id: r.carrier_id,
            name: r.carrier_name,
            trackingRef: r.tracking_ref,
            trackingUrl: r.tracking_url,
        },
        deliveryLines: r.delivery_lines || [],
        totalQuantity: r.total_quantity,
        totalWeight: r.total_weight !== null ? Number(r.total_weight) : null,
        cashOnDelivery: Number(r.cash_on_delivery || 0),
        deliveryFee: Number(r.delivery_fee || 0),
        state: r.state,
        stateHistory: r.state_history || [],
        note: r.note,
        createdBy: r.created_by,
        createdByName: r.created_by_name,
    };
}

async function nextNumber(pool) {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `DLV-${datePart}-`;
    const r = await pool.query(
        `SELECT number FROM delivery_invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length) {
        const m = r.rows[0].number.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM delivery_invoices');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/load', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
                `(partner_name ILIKE $${i} OR partner_phone ILIKE $${i} OR number ILIKE $${i} OR tracking_ref ILIKE $${i} OR fso_number ILIKE $${i})`
            );
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM delivery_invoices ${where}`,
            params
        );
        const total = countR.rows[0].n;
        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM delivery_invoices ${where} ORDER BY date_delivery DESC, id DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT * FROM delivery_invoices WHERE number = $1', [
            req.params.number,
        ]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, order: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /from-pbh — Create delivery from PBH (FastSaleOrder)
// Body: { pbhNumber, dateDelivery?, carrierId?, carrierName?, trackingRef?,
//   deliveryFee?, cashOnDelivery?, deliveryLines? (subset), note? }
router.post('/from-pbh', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.pbhNumber) return res.status(400).json({ error: 'pbhNumber required' });

        const fso = (
            await pool.query('SELECT * FROM fast_sale_orders WHERE number = $1', [b.pbhNumber])
        ).rows[0];
        if (!fso) return res.status(404).json({ error: 'PBH not found' });
        if (fso.state === 'cancel')
            return res.status(400).json({ error: 'Không thể giao PBH đã hủy' });

        const number = await nextNumber(pool);
        const lines =
            Array.isArray(b.deliveryLines) && b.deliveryLines.length
                ? b.deliveryLines
                : fso.order_lines || [];
        const totalQty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);

        const r = await pool.query(
            `INSERT INTO delivery_invoices (
                number, display_stt, fso_id, fso_number,
                date_delivery,
                partner_id, partner_name, partner_phone, partner_address,
                city_name, district_name, ward_name,
                carrier_id, carrier_name, tracking_ref, tracking_url,
                delivery_lines, total_quantity, total_weight,
                cash_on_delivery, delivery_fee,
                state, state_history, note,
                created_by, created_by_name
            ) VALUES (
                $1, nextval('delivery_invoices_display_stt_seq'), $2, $3,
                COALESCE($4::timestamptz, NOW()),
                $5, $6, $7, $8,
                $9, $10, $11,
                $12, $13, $14, $15,
                $16::jsonb, $17, $18,
                $19, $20,
                'pending', $21::jsonb, $22,
                $23, $24
            ) RETURNING *`,
            [
                number,
                fso.id,
                fso.number,
                b.dateDelivery || null,
                fso.partner_id,
                fso.partner_name,
                fso.partner_phone,
                fso.partner_address,
                fso.city_name,
                fso.district_name,
                fso.ward_name,
                b.carrierId || fso.carrier_id,
                b.carrierName || fso.carrier_name,
                b.trackingRef || fso.tracking_ref,
                b.trackingUrl || null,
                JSON.stringify(lines),
                totalQty,
                b.totalWeight || null,
                b.cashOnDelivery ?? Number(fso.cash_on_delivery || 0),
                b.deliveryFee ?? Number(fso.delivery_price || 0),
                JSON.stringify([
                    { from: null, to: 'pending', at: Date.now(), by: b.createdBy || null },
                ]),
                b.note || null,
                b.createdBy || null,
                b.createdByName || null,
            ]
        );
        const o = mapRow(r.rows[0]);
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'delivery:created',
                order: o,
                pbhNumber: fso.number,
            });
        }
        if (req.app.locals.web2RealtimeSseNotify) {
            try {
                req.app.locals.web2RealtimeSseNotify(
                    'web2:delivery',
                    { action: 'created', number: o.number, ts: Date.now() },
                    'update'
                );
            } catch {}
        }
        res.json({ success: true, order: o });
    } catch (e) {
        console.error('[DELIVERY-INVOICES] from-pbh error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /:number/state — change state with history
async function _changeState(pool, number, newState, by) {
    const cur = await pool.query(
        'SELECT state, state_history FROM delivery_invoices WHERE number = $1',
        [number]
    );
    if (cur.rows.length === 0) return null;
    const history = cur.rows[0].state_history || [];
    history.push({ from: cur.rows[0].state, to: newState, at: Date.now(), by: by || null });
    const r = await pool.query(
        `UPDATE delivery_invoices SET state = $1, state_history = $2::jsonb, date_updated = NOW() WHERE number = $3 RETURNING *`,
        [newState, JSON.stringify(history), number]
    );
    return r.rows[0];
}
for (const [path, st] of [
    ['/:number/ship', 'shipping'],
    ['/:number/deliver', 'delivered'],
    ['/:number/return', 'returned'],
    ['/:number/cancel', 'cancel'],
]) {
    router.post(path, async (req, res) => {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        try {
            await ensureTables(pool);
            const row = await _changeState(pool, req.params.number, st, req.body?.by);
            if (!row) return res.status(404).json({ error: 'Not found' });
            const o = mapRow(row);
            if (req.app.locals.broadcastToClients) {
                req.app.locals.broadcastToClients({ type: `delivery:${st}`, order: o });
            }
            if (req.app.locals.web2RealtimeSseNotify) {
                try {
                    req.app.locals.web2RealtimeSseNotify(
                        'web2:delivery',
                        { action: st, number: req.params.number, ts: Date.now() },
                        'update'
                    );
                } catch {}
            }
            res.json({ success: true, order: o });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

router.patch('/:number', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const allowed = {
            carrierId: 'carrier_id',
            carrierName: 'carrier_name',
            trackingRef: 'tracking_ref',
            trackingUrl: 'tracking_url',
            deliveryFee: 'delivery_fee',
            cashOnDelivery: 'cash_on_delivery',
            totalWeight: 'total_weight',
            note: 'note',
            partnerAddress: 'partner_address',
            cityName: 'city_name',
            districtName: 'district_name',
            wardName: 'ward_name',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (b[k] === undefined) continue;
            params.push(b[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (Array.isArray(b.deliveryLines)) {
            const totalQty = b.deliveryLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            params.push(JSON.stringify(b.deliveryLines));
            sets.push(`delivery_lines = $${params.length}::jsonb`);
            params.push(totalQty);
            sets.push(`total_quantity = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No fields' });
        sets.push(`date_updated = NOW()`);
        params.push(req.params.number);
        const r = await pool.query(
            `UPDATE delivery_invoices SET ${sets.join(', ')} WHERE number = $${params.length} RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, order: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:number', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    try {
        await ensureTables(pool);
        const force = req.query.force === '1';
        const guard = force ? '' : `AND state IN ('pending', 'cancel')`;
        const r = await pool.query(
            `DELETE FROM delivery_invoices WHERE number = $1 ${guard} RETURNING number`,
            [req.params.number]
        );
        if (!r.rows.length)
            return res
                .status(404)
                .json({ error: 'Not deletable (state ≠ pending/cancel, use force=1)' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
