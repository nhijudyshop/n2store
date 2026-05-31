// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — KPI Attribution System
//
// Plan: docs/plans/kpi-attribution-system.md (v2 — campaign-scoped + beneficiary-based)
//
// Architecture:
//   campaign_employee_ranges     — REUSED (đã exist từ Web 1.0 legacy, key=campaign_name,
//                                  JSONB [{userId, userName, fromSTT, toSTT}, ...])
//   campaign_employee_ranges_history — REUSED (audit)
//   web2_kpi_events              — append-only ledger (forecast + actual events) — NEW
//   web2_kpi_forecast            — derived cache: count add events (source=native) — NEW
//   web2_kpi_actual              — derived cache: confirmed - revoked — NEW
//
// Beneficiary = lookup at emit time qua campaign_employee_ranges (or fallback actor).
// Backlog source NOT counted in either projection.
// Key by campaign_NAME (Vietnamese label) to match Web 1.0 convention + tab1 KPI.
// =====================================================

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone || !pool) return;
    await pool.query(`
        -- assignments table REUSED from campaigns.js (campaign_employee_ranges + history)
        -- — DO NOT create here.

        -- Ledger (append-only events)
        CREATE TABLE IF NOT EXISTS web2_kpi_events (
            id                  BIGSERIAL PRIMARY KEY,
            event_time          BIGINT NOT NULL,
            event_type          VARCHAR(30) NOT NULL,
            actor_user_id       INTEGER NOT NULL,
            actor_name          VARCHAR(120),
            beneficiary_user_id INTEGER NOT NULL,
            beneficiary_name    VARCHAR(120),
            beneficiary_source  VARCHAR(20),
            order_code          VARCHAR(64) NOT NULL,
            order_campaign_stt  INTEGER,
            customer_id         VARCHAR(128) NOT NULL,
            product_code        VARCHAR(64) NOT NULL,
            qty_delta           INTEGER NOT NULL,
            source              VARCHAR(20) NOT NULL,
            campaign_id         VARCHAR(100) NOT NULL,
            source_page         VARCHAR(64),
            client_event_id     VARCHAR(64),
            idempotency_key     VARCHAR(80) UNIQUE,
            raw_payload         JSONB,
            revokes_event_id    BIGINT,
            created_at          BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_events_beneficiary
            ON web2_kpi_events(beneficiary_user_id, campaign_id);
        CREATE INDEX IF NOT EXISTS idx_kpi_events_campaign_time
            ON web2_kpi_events(campaign_id, event_time DESC);
        CREATE INDEX IF NOT EXISTS idx_kpi_events_order
            ON web2_kpi_events(order_code);
        CREATE INDEX IF NOT EXISTS idx_kpi_events_tuple
            ON web2_kpi_events(customer_id, product_code, campaign_id);

        -- 4. Derived projections
        CREATE TABLE IF NOT EXISTS web2_kpi_forecast (
            beneficiary_user_id INTEGER NOT NULL,
            campaign_id         VARCHAR(100) NOT NULL,
            kpi_qty             INTEGER NOT NULL DEFAULT 0,
            kpi_amount          BIGINT NOT NULL DEFAULT 0,
            breakdown           JSONB NOT NULL DEFAULT '[]'::jsonb,
            last_recalc_at      BIGINT NOT NULL,
            PRIMARY KEY (beneficiary_user_id, campaign_id)
        );

        CREATE TABLE IF NOT EXISTS web2_kpi_actual (
            beneficiary_user_id INTEGER NOT NULL,
            campaign_id         VARCHAR(100) NOT NULL,
            kpi_qty             INTEGER NOT NULL DEFAULT 0,
            kpi_amount          BIGINT NOT NULL DEFAULT 0,
            revoked_qty         INTEGER NOT NULL DEFAULT 0,
            breakdown           JSONB NOT NULL DEFAULT '[]'::jsonb,
            last_recalc_at      BIGINT NOT NULL,
            PRIMARY KEY (beneficiary_user_id, campaign_id)
        );
    `);
    _migrationDone = true;
    console.log(
        '[web2-kpi] schema ready (5 tables: assignments, history, events, forecast, actual)'
    );
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'kpi-schema-init: ' + e.message });
    }
});

// =====================================================
// CORE HELPERS — public for other route modules
// =====================================================

const RATE_PER_SP = 5000;
const SYNTHETIC_NO_CAMPAIGN = 'NO_CAMPAIGN';

function _idempotencyKey({
    actor_user_id,
    customer_id,
    product_code,
    campaign_id,
    event_type,
    client_event_id,
}) {
    const composite = [
        actor_user_id,
        customer_id,
        product_code,
        campaign_id,
        event_type,
        client_event_id || '',
    ].join('|');
    return crypto.createHash('sha1').update(composite).digest('hex').slice(0, 64);
}

// Sanitize campaign name (giống Web 1.0 tab1-employee.js:83) — strip Firebase-unsafe chars.
function sanitizeCampaignName(name) {
    if (!name) return null;
    return String(name)
        .replace(/[.$#\[\]\/]/g, '_')
        .trim();
}

// Beneficiary = NV được assigned khoảng STT chứa đơn này.
// Query campaign_employee_ranges (JSONB array shared với Web 1.0 tab1 KPI).
// Range item shape: { userId, userName, fromSTT, toSTT } (legacy có thể dùng from/to/start/end).
async function resolveBeneficiary(
    pool,
    { campaign_name, campaign_stt, actor_user_id, actor_name }
) {
    const fallback = {
        beneficiary_user_id: actor_user_id,
        beneficiary_name: actor_name,
        beneficiary_source: 'fallback_actor',
    };
    if (campaign_stt == null || !campaign_name) return fallback;

    const sanitized = sanitizeCampaignName(campaign_name);
    try {
        const r = await pool.query(
            `SELECT employee_ranges FROM campaign_employee_ranges
             WHERE campaign_name = $1 LIMIT 1`,
            [sanitized]
        );
        if (!r.rows.length) return fallback;
        const ranges = Array.isArray(r.rows[0].employee_ranges) ? r.rows[0].employee_ranges : [];
        for (const range of ranges) {
            const from = Number(range.fromSTT ?? range.from ?? range.start ?? 0);
            const to = Number(range.toSTT ?? range.to ?? range.end ?? Infinity);
            if (campaign_stt >= from && campaign_stt <= to) {
                const uid = range.userId ?? range.id;
                // userId trong Web 1.0 có thể là string (firebase uid). Web 2.0
                // dùng integer (web2_users.id). Cast về integer khi parse được.
                const parsed = Number(uid);
                return {
                    beneficiary_user_id: Number.isFinite(parsed) ? parsed : actor_user_id,
                    beneficiary_name: range.userName || range.name || String(uid),
                    beneficiary_source: 'assignment',
                };
            }
        }
        return fallback;
    } catch (e) {
        console.error('[web2-kpi] resolveBeneficiary error:', e.message);
        return fallback;
    }
}

// Emit 1 KPI event. Idempotent qua UNIQUE idempotency_key.
// Returns: { id, inserted: bool, skipped_reason? }
async function emitKpiEvent(pool, ev) {
    if (!pool || !ev) return { id: null, inserted: false, skipped_reason: 'no-pool' };
    if (!ev.actor_user_id) {
        return { id: null, inserted: false, skipped_reason: 'no-actor' };
    }
    if (!ev.campaign_id) ev.campaign_id = SYNTHETIC_NO_CAMPAIGN;

    const key = _idempotencyKey({
        actor_user_id: ev.actor_user_id,
        customer_id: ev.customer_id || '',
        product_code: ev.product_code || '',
        campaign_id: ev.campaign_id,
        event_type: ev.event_type,
        client_event_id: ev.client_event_id || '',
    });
    const now = Date.now();

    try {
        const r = await pool.query(
            `INSERT INTO web2_kpi_events
             (event_time, event_type, actor_user_id, actor_name,
              beneficiary_user_id, beneficiary_name, beneficiary_source,
              order_code, order_campaign_stt, customer_id, product_code, qty_delta,
              source, campaign_id, source_page, client_event_id, idempotency_key,
              raw_payload, revokes_event_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
             ON CONFLICT (idempotency_key) DO NOTHING
             RETURNING id`,
            [
                ev.event_time || now,
                ev.event_type,
                ev.actor_user_id,
                ev.actor_name || null,
                ev.beneficiary_user_id,
                ev.beneficiary_name || null,
                ev.beneficiary_source || 'fallback_actor',
                ev.order_code,
                ev.order_campaign_stt || null,
                ev.customer_id,
                ev.product_code,
                ev.qty_delta,
                ev.source || 'unknown',
                ev.campaign_id,
                ev.source_page || null,
                ev.client_event_id || null,
                key,
                ev.raw_payload ? JSON.stringify(ev.raw_payload) : null,
                ev.revokes_event_id || null,
                now,
            ]
        );
        if (!r.rows.length) {
            return { id: null, inserted: false, skipped_reason: 'duplicate-idempotency' };
        }
        // Notify dashboard subscribers
        if (_notifyClients) {
            try {
                _notifyClients(
                    `web2:kpi:${ev.beneficiary_user_id}`,
                    {
                        campaign_id: ev.campaign_id,
                        event_type: ev.event_type,
                        qty_delta: ev.qty_delta,
                        ts: now,
                    },
                    'update'
                );
            } catch {}
        }
        return { id: r.rows[0].id, inserted: true };
    } catch (e) {
        console.error('[web2-kpi] emitKpiEvent error:', e.message);
        return { id: null, inserted: false, skipped_reason: 'error:' + e.message };
    }
}

// =====================================================
// READ endpoints — bootstrap stubs (Sprint 4 sẽ build dashboard đầy đủ)
// =====================================================

// GET /events?campaign_id=&beneficiary_id=&limit=50
router.get('/events', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const limit = Math.min(Number(req.query.limit) || 50, 500);
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            conds.push(`campaign_id = $${i++}`);
            params.push(req.query.campaign_id);
        }
        if (req.query.beneficiary_id) {
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(req.query.beneficiary_id));
        }
        if (req.query.order_code) {
            conds.push(`order_code = $${i++}`);
            params.push(req.query.order_code);
        }
        params.push(limit);
        const r = await pool.query(
            `SELECT * FROM web2_kpi_events
             WHERE ${conds.join(' AND ')}
             ORDER BY event_time DESC
             LIMIT $${i}`,
            params
        );
        res.json({ success: true, events: r.rows, count: r.rows.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /assignments?campaign_name= — list ranges for campaign.
// Proxy đến table campaign_employee_ranges (key by name) cho convenience.
// Frontend KPI dashboard có thể fetch trực tiếp /api/campaigns/employee-ranges/:name
// nhưng route này cung cấp consistent /api/v2/kpi/* namespace.
router.get('/assignments', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const name = sanitizeCampaignName(req.query.campaign_name);
        if (!name) {
            return res.json({ success: true, assignments: [] });
        }
        const r = await pool.query(
            `SELECT employee_ranges, updated_at FROM campaign_employee_ranges
             WHERE campaign_name = $1 LIMIT 1`,
            [name]
        );
        const ranges = r.rows.length ? r.rows[0].employee_ranges || [] : [];
        res.json({
            success: true,
            campaign_name: name,
            assignments: ranges,
            updated_at: r.rows[0]?.updated_at || null,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /forecast?campaign_id=&user_id=
router.get('/forecast', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            conds.push(`campaign_id = $${i++}`);
            params.push(req.query.campaign_id);
        }
        if (req.query.user_id) {
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(req.query.user_id));
        }
        const r = await pool.query(
            `SELECT
                beneficiary_user_id,
                beneficiary_name,
                campaign_id,
                COALESCE(SUM(qty_delta) FILTER (
                    WHERE source = 'native'
                      AND event_type IN ('forecast_add', 'forecast_qty_change', 'forecast_remove')
                ), 0) AS forecast_qty
             FROM web2_kpi_events
             WHERE ${conds.join(' AND ')}
             GROUP BY beneficiary_user_id, beneficiary_name, campaign_id
             ORDER BY forecast_qty DESC`,
            params
        );
        const rows = r.rows.map((x) => {
            const q = Math.max(0, Number(x.forecast_qty) || 0);
            return { ...x, forecast_qty: q, forecast_amount: q * RATE_PER_SP };
        });
        res.json({ success: true, forecast: rows, rate_per_sp: RATE_PER_SP });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /actual?campaign_id=&user_id=
router.get('/actual', async (req, res) => {
    try {
        const pool = req.app.locals.chatDb;
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            conds.push(`campaign_id = $${i++}`);
            params.push(req.query.campaign_id);
        }
        if (req.query.user_id) {
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(req.query.user_id));
        }
        const r = await pool.query(
            `SELECT
                beneficiary_user_id,
                beneficiary_name,
                campaign_id,
                COALESCE(SUM(qty_delta) FILTER (
                    WHERE source = 'native'
                      AND event_type IN ('actual_confirmed', 'actual_revoked')
                ), 0) AS actual_qty,
                COALESCE(SUM(-qty_delta) FILTER (
                    WHERE source = 'native' AND event_type = 'actual_revoked'
                ), 0) AS revoked_qty
             FROM web2_kpi_events
             WHERE ${conds.join(' AND ')}
             GROUP BY beneficiary_user_id, beneficiary_name, campaign_id
             ORDER BY actual_qty DESC`,
            params
        );
        const rows = r.rows.map((x) => {
            const q = Math.max(0, Number(x.actual_qty) || 0);
            return {
                ...x,
                actual_qty: q,
                actual_amount: q * RATE_PER_SP,
                revoked_qty: Number(x.revoked_qty) || 0,
            };
        });
        res.json({ success: true, actual: rows, rate_per_sp: RATE_PER_SP });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.emitKpiEvent = emitKpiEvent;
module.exports.resolveBeneficiary = resolveBeneficiary;
module.exports.sanitizeCampaignName = sanitizeCampaignName;
module.exports.RATE_PER_SP = RATE_PER_SP;
module.exports.SYNTHETIC_NO_CAMPAIGN = SYNTHETIC_NO_CAMPAIGN;
