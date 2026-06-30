// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — KPI Attribution System
//
// Plan: docs/plans/kpi-attribution-system.md (v2 — campaign-scoped + beneficiary-based)
//
// Architecture (TÁCH RIÊNG Web 2.0 — KHÔNG còn dùng chung table Web 1.0 từ 2026-06-09):
//   web2_kpi_assignments         — phân công khoảng STT/NV theo chiến dịch (web2Db) — OWN
//                                  key=campaign_name (sanitized), JSONB [{userId,userName,fromSTT,toSTT}]
//   web2_kpi_assignments_history — audit log thay đổi phân công (web2Db) — OWN
//   web2_kpi_events              — append-only ledger (forecast + actual events)
//
// Forecast/Actual KPI được TÍNH TRỰC TIẾP (live aggregate) từ ledger ở /forecast +
// /actual mỗi request. KHÔNG còn bảng cache web2_kpi_forecast/web2_kpi_actual
// (đã gỡ 2026-06-09 — dead code: không nơi nào đọc, không cron nào recalc).
//
// Beneficiary = lookup at emit time qua web2_kpi_assignments (or fallback actor).
// Backlog source NOT counted in either projection.
// Key by campaign_NAME (sanitized). TRƯỚC 2026-06-09 dùng campaign_employee_ranges của
// Web 1.0 (chatDb) → sau tách DB resolver đọc web2Db rỗng → assignment không tới
// (cross-pool bug). Nay Web 2.0 có bảng riêng trong web2Db, độc lập hoàn toàn Web 1.0 tab1.
// =====================================================

const express = require('express');
const crypto = require('crypto');
const {
    requireWeb2Admin,
    requireWeb2AuthSoft,
    hashWeb2Token,
} = require('../../middleware/web2-auth');
// NGUỒN DUY NHẤT toán KPI (rate/sanitize/productMap/beneficiaryByStt/computeKpiQty).
// KHÔNG fork lại ở đây — xem render.com/services/web2-kpi-core.js.
const kpiCore = require('../../services/web2-kpi-core');
// EVENT-SINK audit toàn bộ (2026-06-22): đổi phân công STT cũng lên Lịch sử thao tác.
const { recordAuditEvent } = require('../../services/web2-audit-sink');

const router = express.Router();

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}

let _migrationDone = false;
async function ensureSchema(pool) {
    if (_migrationDone || !pool) return;
    await pool.query(`
        -- Phân công khoảng STT/NV theo chiến dịch (OWN — web2Db, độc lập Web 1.0).
        CREATE TABLE IF NOT EXISTS web2_kpi_assignments (
            id              SERIAL PRIMARY KEY,
            campaign_name   VARCHAR(255) NOT NULL UNIQUE,
            employee_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS web2_kpi_assignments_history (
            id             BIGSERIAL PRIMARY KEY,
            campaign_key   VARCHAR(255) NOT NULL,
            campaign_label VARCHAR(255),
            action         VARCHAR(20) NOT NULL DEFAULT 'update',
            user_id        VARCHAR(255),
            user_name      VARCHAR(255),
            ranges_before  JSONB,
            ranges_after   JSONB,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_web2_kpi_assign_hist_key
            ON web2_kpi_assignments_history(campaign_key);
        CREATE INDEX IF NOT EXISTS idx_web2_kpi_assign_hist_created
            ON web2_kpi_assignments_history(created_at DESC);

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

        -- Dọn dead projection caches (forecast/actual nay tính live từ ledger).
        DROP TABLE IF EXISTS web2_kpi_forecast;
        DROP TABLE IF EXISTS web2_kpi_actual;
    `);
    _migrationDone = true;
    console.log('[web2-kpi] schema ready (ledger web2_kpi_events; forecast/actual computed live)');
}

router.use(async (req, res, next) => {
    try {
        await ensureSchema(req.app.locals.web2Db || req.app.locals.chatDb);
        next();
    } catch (e) {
        res.status(500).json({ success: false, error: 'kpi-schema-init: ' + e.message });
    }
});

// =====================================================
// CORE HELPERS — public for other route modules
// =====================================================

const RATE_PER_SP = kpiCore.RATE_PER_SP; // 1 nguồn ở web2-kpi-core
// PHẢI khớp campaigns dropdown — native-orders _campaignsHandler dùng '__no_campaign__'
// cho đơn không chiến dịch (COALESCE(NULLIF(live_campaign_id,''),'__no_campaign__')).
// Trước 2026-06-09 dùng 'NO_CAMPAIGN' → lệch dropdown → filter "(Không chiến dịch)" rỗng.
const SYNTHETIC_NO_CAMPAIGN = '__no_campaign__';
const _LEGACY_NO_CAMPAIGN = 'NO_CAMPAIGN'; // events cũ trước fix — vẫn match khi đọc

// Push campaign_id filter chấp nhận cả sentinel mới lẫn legacy (backward-compat đọc).
// Trả về index $N kế tiếp.
function _pushCampaignFilter(conds, params, i, val) {
    if (val === SYNTHETIC_NO_CAMPAIGN || val === _LEGACY_NO_CAMPAIGN) {
        conds.push(`campaign_id IN ($${i}, $${i + 1})`);
        params.push(SYNTHETIC_NO_CAMPAIGN, _LEGACY_NO_CAMPAIGN);
        return i + 2;
    }
    conds.push(`campaign_id = $${i}`);
    params.push(val);
    return i + 1;
}

function _idempotencyKey({
    actor_user_id,
    customer_id,
    product_code,
    campaign_id,
    event_type,
    qty_delta,
    client_event_id,
}) {
    // qty_delta nằm trong composite key (RACE fix): confirm lần 2 với qty khác
    // PHẢI tạo event mới, không bị drop như duplicate. qty_delta == null → '' để
    // ổn định khi caller không truyền (giữ backward-compat cũ).
    const composite = [
        actor_user_id,
        customer_id,
        product_code,
        campaign_id,
        event_type,
        qty_delta == null ? '' : String(qty_delta),
        client_event_id || '',
    ].join('|');
    return crypto.createHash('sha1').update(composite).digest('hex').slice(0, 64);
}

// Sanitize campaign name — 1 nguồn ở web2-kpi-core (giống Web 1.0 tab1-employee.js:83).
const sanitizeCampaignName = kpiCore.sanitizeCampaignName;

// Beneficiary = NV được assigned khoảng STT chứa đơn này.
// Query web2_kpi_assignments (web2Db, OWN — KHÔNG dùng campaign_employee_ranges của Web 1.0).
// Range item shape: { userId, userName, fromSTT, toSTT } (legacy có thể dùng from/to/start/end).
async function resolveBeneficiary(
    pool,
    { campaign_name, campaign_stt, actor_user_id, actor_name }
) {
    // actor_user_id phải là số (cột beneficiary_user_id INTEGER + GROUP BY). actor lạ
    // (null/'bot') → null + source 'fallback_actor_invalid' để attribution hỏng LỘ ra,
    // không âm thầm nhét rác vào ledger.
    const actorOk = Number.isFinite(Number(actor_user_id));
    const fallback = {
        beneficiary_user_id: actorOk ? Number(actor_user_id) : null,
        beneficiary_name: actor_name,
        beneficiary_source: actorOk ? 'fallback_actor' : 'fallback_actor_invalid',
    };
    if (campaign_stt == null || !campaign_name) return fallback;

    const sanitized = sanitizeCampaignName(campaign_name);
    try {
        const r = await pool.query(
            `SELECT employee_ranges FROM web2_kpi_assignments
             WHERE campaign_name = $1 LIMIT 1`,
            [sanitized]
        );
        if (!r.rows.length) return fallback;
        const ranges = Array.isArray(r.rows[0].employee_ranges) ? r.rows[0].employee_ranges : [];
        // Matching dùng core (1 nguồn). uid lạ (non-finite) → fallback actor (giữ hành vi cũ).
        const b = kpiCore.resolveBeneficiaryBySTT(campaign_stt, ranges);
        if (b) {
            return {
                beneficiary_user_id: Number.isFinite(b.id) ? b.id : actor_user_id,
                beneficiary_name: b.name,
                beneficiary_source: 'assignment',
            };
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
        qty_delta: ev.qty_delta,
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
        // Notify subscribers: per-beneficiary + broadcast 'web2:kpi-dashboard'
        // (Dashboard F01 + KPI leaderboard cùng subscribe topic broadcast này).
        if (_notifyClients) {
            const payload = {
                campaign_id: ev.campaign_id,
                event_type: ev.event_type,
                qty_delta: ev.qty_delta,
                ts: now,
            };
            // (gỡ 'web2:kpi:<beneficiary_id>' 2026-06-22, audit producer↔consumer) KHÔNG
            // trang nào subscribe per-NV topic đó — Dashboard F01 + KPI leaderboard chỉ
            // subscribe broadcast 'web2:kpi-dashboard'. Cần realtime per-NV sau → thêm
            // Web2SSE.subscribe('web2:kpi:'+myUserId,...) ở web2/kpi/ rồi mở lại emit.
            try {
                _notifyClients('web2:kpi-dashboard', payload, 'update');
            } catch {}
        }
        return { id: r.rows[0].id, inserted: true };
    } catch (e) {
        console.error('[web2-kpi] emitKpiEvent error:', e.message);
        return { id: null, inserted: false, skipped_reason: 'error:' + e.message };
    }
}

// =====================================================
// Sprint 3 — Visibility scope middleware + WHERE helper
// =====================================================

// Cache scope per token (5min TTL) — avoid querying assignments on every request.
const _scopeCache = new Map(); // token → { scope, user, fetchedAt }
const SCOPE_TTL_MS = 5 * 60 * 1000;
const _SCOPE_CACHE_MAX = 500; // LRU cap (LOW — tránh memory leak: token vô hạn)

// Set + evict entry cũ nhất khi vượt cap (Map giữ thứ tự insert → key đầu = cũ nhất).
function _scopeCacheSet(token, val) {
    if (_scopeCache.has(token)) _scopeCache.delete(token); // refresh recency
    _scopeCache.set(token, val);
    while (_scopeCache.size > _SCOPE_CACHE_MAX) {
        const oldest = _scopeCache.keys().next().value;
        if (oldest === undefined) break;
        _scopeCache.delete(oldest);
    }
}

// Lookup user qua web2_user_sessions token. Returns { id, role, displayName } or null.
async function _resolveUserFromToken(pool, token) {
    if (!token) return null;
    try {
        let r;
        try {
            r = await pool.query(
                `SELECT u.id, u.role, u.display_name, u.username
                 FROM web2_user_sessions s
                 JOIN web2_users u ON u.id = s.user_id
                 WHERE (s.token_hash = $1 OR (s.token_hash IS NULL AND s.token = $2))
                   AND s.expires_at > $3 AND u.is_active = TRUE
                 LIMIT 1`,
                [hashWeb2Token(token), token, Date.now()]
            );
        } catch (qe) {
            if (qe && qe.code === '42703') {
                r = await pool.query(
                    `SELECT u.id, u.role, u.display_name, u.username
                     FROM web2_user_sessions s
                     JOIN web2_users u ON u.id = s.user_id
                     WHERE s.token = $1 AND s.expires_at > $2 AND u.is_active = TRUE
                     LIMIT 1`,
                    [token, Date.now()]
                );
            } else throw qe;
        }
        if (!r.rows.length) return null;
        return {
            id: r.rows[0].id,
            role: r.rows[0].role,
            displayName: r.rows[0].display_name || r.rows[0].username,
        };
    } catch (e) {
        console.warn('[web2-kpi] resolveUser fail:', e.message);
        return null;
    }
}

// Load all assignments cho user X → mảng { campaign_name, fromSTT, toSTT }.
// Query web2_kpi_assignments, parse JSONB, filter ranges có userId match.
async function _loadUserAssignments(pool, userId) {
    try {
        const r = await pool.query(
            `SELECT campaign_name, employee_ranges FROM web2_kpi_assignments`
        );
        const result = [];
        for (const row of r.rows) {
            const ranges = Array.isArray(row.employee_ranges) ? row.employee_ranges : [];
            for (const rg of ranges) {
                const uid = rg.userId ?? rg.id;
                if (String(uid) !== String(userId)) continue;
                const from = Number(rg.fromSTT ?? rg.from ?? rg.start ?? 0);
                const to = Number(rg.toSTT ?? rg.to ?? rg.end ?? 0);
                if (from > 0 && to >= from) {
                    result.push({
                        campaign_name: row.campaign_name,
                        fromSTT: from,
                        toSTT: to,
                    });
                }
            }
        }
        return result;
    } catch (e) {
        console.warn('[web2-kpi] loadUserAssignments fail:', e.message);
        return [];
    }
}

// Sentinel: deny-all scope. buildScopeWhere phát 'FALSE' (0 row) khi gặp giá trị
// này. Dùng khi WEB2_AUTH_ENFORCE=1 mà thiếu/sai token → KHÔNG fail-open thấy hết PII.
const DENY_ALL = '__deny_all__';

// Express middleware — attach req.kpiScope = [{campaign_name, fromSTT, toSTT}, ...]
// • Admin → null (= see all, no filter)
// • Valid user, no assignments → null (= see all — open cho NV chưa phân khoảng)
// • Has assignments → array of scopes
// • WEB2_AUTH_ENFORCE=1 + thiếu/sai token → DENY_ALL (0 row). Khi enforce TẮT,
//   thiếu/sai token vẫn null (transition: frontend chưa gửi token) — giữ behavior cũ.
//
// Usage: app.use('/api/native-orders', applyKpiScope, nativeOrdersRoutes)
//   hoặc per-route: router.get('/load', applyKpiScope, handler)
async function applyKpiScope(req, res, next) {
    req.kpiScope = null; // default: no filter
    const enforce = process.env.WEB2_AUTH_ENFORCE === '1';
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        if (!pool) return next();
        const token =
            req.headers['x-web2-token'] || req.headers['x-user-token'] || req.query.token || null;
        // Thiếu token: enforce → deny-all (0 row); không enforce → open (legacy).
        if (!token) {
            req.kpiScope = enforce ? DENY_ALL : null;
            return next();
        }

        // Cache check
        const cached = _scopeCache.get(token);
        if (cached && Date.now() - cached.fetchedAt < SCOPE_TTL_MS) {
            req.kpiScope = cached.scope;
            req.kpiUser = cached.user;
            return next();
        }

        const user = await _resolveUserFromToken(pool, token);
        // Token sai/hết hạn: enforce → deny-all; không enforce → open (legacy).
        // KHÔNG cache deny — token có thể hợp lệ lại sau khi login.
        if (!user) {
            req.kpiScope = enforce ? DENY_ALL : null;
            return next();
        }
        req.kpiUser = user;

        // Admin sees everything
        if (user.role === 'admin') {
            _scopeCacheSet(token, { scope: null, user, fetchedAt: Date.now() });
            return next();
        }

        const assignments = await _loadUserAssignments(pool, user.id);
        const scope = assignments.length > 0 ? assignments : null;
        req.kpiScope = scope;
        _scopeCacheSet(token, { scope, user, fetchedAt: Date.now() });
        return next();
    } catch (e) {
        console.warn('[web2-kpi] applyKpiScope error:', e.message);
        // Lỗi resolve khi enforce → fail-closed (deny), không fail-open thấy hết.
        req.kpiScope = enforce ? DENY_ALL : null;
        return next();
    }
}

// Build SQL WHERE clause + params for kpiScope. Returns { clause, params }.
// paramOffset = next $N placeholder index.
// kpiScope=null → empty (no filter applied).
//
// Generated SQL pattern (assuming kpiScope = [{campaign_name:'A', fromSTT:1, toSTT:100}, ...]):
//   ((live_campaign_name = $1 AND campaign_stt BETWEEN $2 AND $3)
//    OR (live_campaign_name = $4 AND campaign_stt BETWEEN $5 AND $6))
function buildScopeWhere(kpiScope, paramOffset = 1) {
    if (kpiScope === DENY_ALL) return { clause: 'FALSE', params: [] };
    if (!kpiScope || !kpiScope.length) return { clause: '', params: [] };
    const conds = [];
    const params = [];
    let i = paramOffset;
    for (const s of kpiScope) {
        conds.push(`(live_campaign_name = $${i} AND campaign_stt BETWEEN $${i + 1} AND $${i + 2})`);
        params.push(s.campaign_name, s.fromSTT, s.toSTT);
        i += 3;
    }
    return { clause: '(' + conds.join(' OR ') + ')', params };
}

// Same pattern but for table prefix scenarios (vd JOIN aliased "n.")
function buildScopeWhereWithAlias(kpiScope, alias, paramOffset = 1) {
    if (kpiScope === DENY_ALL) return { clause: 'FALSE', params: [] };
    if (!kpiScope || !kpiScope.length) return { clause: '', params: [] };
    const conds = [];
    const params = [];
    let i = paramOffset;
    const p = alias ? alias + '.' : '';
    for (const s of kpiScope) {
        conds.push(
            `(${p}live_campaign_name = $${i} AND ${p}campaign_stt BETWEEN $${i + 1} AND $${i + 2})`
        );
        params.push(s.campaign_name, s.fromSTT, s.toSTT);
        i += 3;
    }
    return { clause: '(' + conds.join(' OR ') + ')', params };
}

// Invalidate scope cache when assignments change (called by campaigns.js PUT).
function invalidateScopeCache(userId) {
    if (userId == null) {
        _scopeCache.clear();
        return;
    }
    // Selective: drop entries where user matches
    for (const [tok, e] of _scopeCache) {
        if (e.user && String(e.user.id) === String(userId)) _scopeCache.delete(tok);
    }
}

// GET /scope — debug endpoint: trả scope của user gọi.
router.get('/scope', applyKpiScope, (req, res) => {
    const deny = req.kpiScope === DENY_ALL;
    res.json({
        success: true,
        user: req.kpiUser || null,
        scope: req.kpiScope,
        scope_count: Array.isArray(req.kpiScope) ? req.kpiScope.length : 0,
        access: deny ? 'none' : req.kpiScope ? 'restricted' : 'all',
    });
});

// =====================================================
// READ endpoints — bootstrap stubs (Sprint 4 sẽ build dashboard đầy đủ)
// =====================================================

// GET /events?campaign_id=&beneficiary_id=&limit=50
router.get('/events', requireWeb2AuthSoft, applyKpiScope, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        // SCOPE: NV (role≠admin) CHỈ xem ledger của CHÍNH MÌNH; admin xem hết.
        const viewer = req.kpiUser || null;
        const selfOnly = !!(viewer && viewer.role !== 'admin');
        const limit = Math.min(Number(req.query.limit) || 50, 500);
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            i = _pushCampaignFilter(conds, params, i, req.query.campaign_id);
        }
        if (selfOnly) {
            // chặn staff dò beneficiary_id người khác → ÉP về chính mình.
            if (
                req.query.beneficiary_id &&
                Number(req.query.beneficiary_id) !== Number(viewer.id)
            ) {
                return res
                    .status(403)
                    .json({ success: false, error: 'Chỉ xem được KPI của chính bạn' });
            }
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(viewer.id));
        } else if (req.query.beneficiary_id) {
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

// GET /assignments?campaign_name= — list ranges for campaign (web2_kpi_assignments, web2Db).
router.get('/assignments', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const name = sanitizeCampaignName(req.query.campaign_name);
        if (!name) {
            return res.json({ success: true, assignments: [] });
        }
        const r = await pool.query(
            `SELECT employee_ranges, updated_at FROM web2_kpi_assignments
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

// =====================================================
// Employee-ranges CRUD (Web 2.0 riêng — web2_kpi_assignments trên web2Db).
// Mirror shape /api/campaigns/employee-ranges/* để frontend kpi-assignments.js
// chỉ cần đổi base sang /api/web2/kpi. Sanitize tên server-side cho khớp resolver.
// Khai báo /history TRƯỚC /:campaignName (Express match theo thứ tự khai báo).
// =====================================================

// GET /employee-ranges/:campaignName/history
router.get('/employee-ranges/:campaignName/history', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const name = sanitizeCampaignName(req.params.campaignName);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const r = await pool.query(
            `SELECT id, campaign_key, campaign_label, action, user_id, user_name,
                    ranges_before, ranges_after,
                    to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso
             FROM web2_kpi_assignments_history
             WHERE campaign_key = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [name, limit]
        );
        res.json({
            success: true,
            history: r.rows.map((x) => ({
                id: Number(x.id),
                campaignKey: x.campaign_key,
                campaignLabel: x.campaign_label,
                action: x.action,
                userId: x.user_id,
                userName: x.user_name,
                rangesBefore: x.ranges_before || [],
                rangesAfter: x.ranges_after || [],
                createdAt: x.created_at_iso,
            })),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /employee-ranges/:campaignName
router.get('/employee-ranges/:campaignName', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const name = sanitizeCampaignName(req.params.campaignName);
        const r = await pool.query(
            `SELECT employee_ranges FROM web2_kpi_assignments WHERE campaign_name = $1`,
            [name]
        );
        res.json({
            success: true,
            employeeRanges: r.rows.length ? r.rows[0].employee_ranges || [] : [],
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PUT /employee-ranges/:campaignName — upsert ranges + audit history (admin only).
router.put('/employee-ranges/:campaignName', requireWeb2Admin, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const name = sanitizeCampaignName(req.params.campaignName);
        if (!name) return res.status(400).json({ success: false, error: 'campaignName required' });
        const { employeeRanges, userId, userName, campaignLabel } = req.body || {};
        const ranges = Array.isArray(employeeRanges) ? employeeRanges : [];

        // Validate từng range + phát hiện overlap (giống Web 1.0 campaigns.js).
        for (const r of ranges) {
            const from = Number(r.fromSTT ?? r.from ?? r.start ?? 0);
            const to = Number(r.toSTT ?? r.to ?? r.end ?? Infinity);
            if (from < 0 || (Number.isFinite(to) && to < 0)) {
                return res
                    .status(400)
                    .json({ success: false, error: `STT âm: from=${from}, to=${to}` });
            }
            if (from > to) {
                return res
                    .status(400)
                    .json({ success: false, error: `STT from (${from}) > to (${to})` });
            }
        }
        if (ranges.length > 1) {
            const sorted = ranges
                .map((r) => ({
                    from: Number(r.fromSTT ?? r.from ?? r.start ?? 0),
                    to: Number(r.toSTT ?? r.to ?? r.end ?? Infinity),
                    uid: r.userId ?? r.id ?? '?',
                }))
                .filter((r) => r.from <= r.to)
                .sort((a, b) => a.from - b.from);
            const overlaps = [];
            for (let k = 1; k < sorted.length; k++) {
                if (sorted[k].from <= sorted[k - 1].to) {
                    overlaps.push(
                        `STT ${sorted[k].from}-${Math.min(sorted[k - 1].to, sorted[k].to)}`
                    );
                }
            }
            if (overlaps.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Employee ranges overlap',
                    message: `Phát hiện ${overlaps.length} chỗ trùng STT: ${overlaps.join(', ')}`,
                });
            }
        }

        let prevRanges = [];
        try {
            const prev = await pool.query(
                `SELECT employee_ranges FROM web2_kpi_assignments WHERE campaign_name = $1`,
                [name]
            );
            if (prev.rows.length) prevRanges = prev.rows[0].employee_ranges || [];
        } catch {}

        await pool.query(
            `INSERT INTO web2_kpi_assignments (campaign_name, employee_ranges)
             VALUES ($1, $2)
             ON CONFLICT (campaign_name) DO UPDATE SET
                 employee_ranges = EXCLUDED.employee_ranges,
                 updated_at = NOW()`,
            [name, JSON.stringify(ranges)]
        );

        const beforeJSON = JSON.stringify(prevRanges || []);
        const afterJSON = JSON.stringify(ranges);
        if (beforeJSON !== afterJSON) {
            const action = prevRanges && prevRanges.length > 0 ? 'update' : 'create';
            pool.query(
                `INSERT INTO web2_kpi_assignments_history
                    (campaign_key, campaign_label, action, user_id, user_name, ranges_before, ranges_after)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    name,
                    campaignLabel || null,
                    action,
                    userId || null,
                    userName || null,
                    beforeJSON,
                    afterJSON,
                ]
            ).catch((e) =>
                console.warn('[web2-kpi] assignments history insert failed:', e?.message)
            );
            recordAuditEvent(pool, {
                entity: 'kpi-assignment',
                entityId: name,
                action,
                userId: req.web2User?.id ?? (userId || null),
                userName: req.web2User?.display_name || userName || null,
                sourcePage: 'kpi/assignments',
                changes: { campaign: campaignLabel || name, rangesCount: ranges.length },
            });
        }

        // Ranges đổi → invalidate scope cache mọi user.
        invalidateScopeCache();
        // Audit SSE 2026-06-25: đổi phân khoảng STT làm thay đổi scope/attribution
        // KPI của NV → leaderboard/dashboard (web2/dashboard + web2/kpi subscribe
        // 'web2:kpi-dashboard') phải auto-refresh, trước đây phải F5. Payload chỉ
        // {action,campaign,ts} — không PII.
        if (_notifyClients) {
            try {
                _notifyClients(
                    'web2:kpi-dashboard',
                    {
                        action: prevRanges?.length ? 'assignment-update' : 'assignment-create',
                        campaign: name,
                        ts: Date.now(),
                    },
                    'update'
                );
            } catch (e) {
                console.warn('[web2-kpi] employee-ranges _notify failed:', e?.message);
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /forecast?campaign_id=&user_id=
// MEDIUM-cleanup (2026-06-13): DEAD endpoint — kpi-dashboard.js chỉ gọi /kpi +
// /events (không gọi /forecast, /actual; comment đầu file stale). Giữ làm legacy
// nhưng gate soft để không lộ KPI ẩn danh; cân nhắc xoá hẳn đợt sau.
router.get('/forecast', requireWeb2AuthSoft, applyKpiScope, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const viewer = req.kpiUser || null;
        const selfOnly = !!(viewer && viewer.role !== 'admin');
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            i = _pushCampaignFilter(conds, params, i, req.query.campaign_id);
        }
        if (selfOnly) {
            if (req.query.user_id && Number(req.query.user_id) !== Number(viewer.id)) {
                return res
                    .status(403)
                    .json({ success: false, error: 'Chỉ xem được KPI của chính bạn' });
            }
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(viewer.id));
        } else if (req.query.user_id) {
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
            const raw = Number(x.forecast_qty) || 0;
            if (raw < 0)
                console.warn('[web2-kpi] forecast âm bị clamp (double-remove?)', {
                    beneficiary: x.beneficiary_user_id,
                    raw,
                });
            const q = Math.max(0, raw);
            return { ...x, forecast_qty: q, forecast_amount: q * RATE_PER_SP };
        });
        res.json({ success: true, forecast: rows, rate_per_sp: RATE_PER_SP });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /actual?campaign_id=&user_id=
router.get('/actual', requireWeb2AuthSoft, applyKpiScope, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const viewer = req.kpiUser || null;
        const selfOnly = !!(viewer && viewer.role !== 'admin');
        const conds = ['1=1'];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            i = _pushCampaignFilter(conds, params, i, req.query.campaign_id);
        }
        if (selfOnly) {
            if (req.query.user_id && Number(req.query.user_id) !== Number(viewer.id)) {
                return res
                    .status(403)
                    .json({ success: false, error: 'Chỉ xem được KPI của chính bạn' });
            }
            conds.push(`beneficiary_user_id = $${i++}`);
            params.push(Number(viewer.id));
        } else if (req.query.user_id) {
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
            const raw = Number(x.actual_qty) || 0;
            if (raw < 0)
                console.warn('[web2-kpi] actual âm bị clamp (over-revoke?)', {
                    beneficiary: x.beneficiary_user_id,
                    raw,
                });
            const q = Math.max(0, raw);
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

// =====================================================
// GET /kpi?campaign_id= — KPI GỘP (model base-delta, tính TRỰC TIẾP từ đơn).
//
// Mô hình (2026-06-09):
//   • Livestream: KPI = Σ max(0, qty_hiện_tại[p] − base[p]) cho đơn ĐÃ chốt
//     (kpi_base != null). Chưa chốt → 0. Hưởng = NV phân công khoảng STT.
//   • Inbox: base = {} → tính 100% Σ qty. Hưởng = người tạo đơn (created_by).
//   • Đơn cancelled → 0 (loại khỏi tổng).
//   • Tiền = qty × RATE_PER_SP (5000).
// Tính trực tiếp từ native_orders (KHÔNG qua ledger) → luôn khớp trạng thái đơn,
// không dính bug dedup/idempotency. Ledger web2_kpi_events vẫn giữ cho audit.
// =====================================================
// KPI qty 1 đơn (base-delta) + resolve NV theo STT: DÙNG kpiCore (1 nguồn).
//   kpiCore.computeKpiQty(products, base, mode) → { qty, lines }  (mode 'inbox'|'live')
//   kpiCore.resolveBeneficiaryBySTT(stt, ranges) → { id, name, from, to } | null

router.get('/kpi', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const campaignId = req.query.campaign_id || null;
        const isNoCampaign =
            campaignId === SYNTHETIC_NO_CAMPAIGN || campaignId === _LEGACY_NO_CAMPAIGN;

        // Viewer scope: admin → thấy hết; staff → CHỈ KPI của chính mình.
        const token =
            req.headers['x-web2-token'] || req.headers['x-user-token'] || req.query.token || null;
        const viewer = await _resolveUserFromToken(pool, token);
        // MEDIUM-cleanup (2026-06-13): TRƯỚC đây không token → viewer=null →
        // selfOnly=false → trả KPI MỌI nhân viên (default-open). Giờ bắt buộc
        // token hợp lệ (kpi-dashboard đã gửi x-web2-token). enforce flip cũng
        // chặn, nhưng route này tự resolve token nên gate tay cho chắc.
        if (process.env.WEB2_AUTH_ENFORCE === '1' && !viewer) {
            return res.status(401).json({ success: false, error: 'Cần đăng nhập Web 2.0' });
        }
        const selfOnly = !!(viewer && viewer.role !== 'admin');

        // Load đơn (loại cancelled) theo campaign. campaign_id rỗng = mọi campaign.
        let where, params;
        if (!campaignId) {
            where = `status <> 'cancelled'`;
            params = [];
        } else if (isNoCampaign) {
            where = `status <> 'cancelled' AND (live_campaign_id IS NULL OR live_campaign_id = '')`;
            params = [];
        } else {
            where = `status <> 'cancelled' AND live_campaign_id = $1`;
            params = [campaignId];
        }
        const ordersQ = await pool.query(
            `SELECT code, channel, campaign_stt, live_campaign_name, products,
                    kpi_base, status, created_by, created_by_name
             FROM native_orders WHERE ${where}`,
            params
        );

        // Map sanitized campaign_name → ranges (mọi campaign). 1 nguồn ở kpiCore.
        const rangeMap = await kpiCore.loadKpiRanges(pool);

        // Phân loại Dự báo/Thực: CHỈ 'draft' = DỰ BÁO (chưa thành đơn). Mọi trạng thái khác
        // (confirmed/delivered/shipped — cancelled đã loại ở query) = THỰC (đã thành sale).
        // Sửa 2026-06-21: trước là confirmed→actual / else→forecast → 'delivered' bị nhét
        // nhầm vào Dự báo. Giờ tường minh draft→forecast, còn lại→actual.
        const kindOf = (status) => (status === 'draft' ? 'forecast' : 'actual');
        const acc = new Map();
        const bucket = (id, name, qty, status) => {
            if (qty <= 0) return;
            const key = `${id}|${name}`;
            const cur = acc.get(key) || {
                beneficiary_user_id: id,
                beneficiary_name: name,
                forecast_qty: 0,
                actual_qty: 0,
            };
            if (kindOf(status) === 'actual') cur.actual_qty += qty;
            else cur.forecast_qty += qty;
            acc.set(key, cur);
        };
        let unassignedForecast = 0;
        let unassignedActual = 0;
        for (const o of ordersQ.rows) {
            const isInbox = o.channel === 'web2_inbox';
            // base-delta qua kpiCore (1 nguồn). inbox → 100%; live → upsell sau chốt.
            const qty = kpiCore.computeKpiQty(
                o.products,
                isInbox ? null : o.kpi_base,
                isInbox ? 'inbox' : 'live'
            ).qty;
            if (qty <= 0) continue;
            if (isInbox) {
                const uid = Number(o.created_by);
                bucket(
                    Number.isFinite(uid) ? uid : 0,
                    o.created_by_name || o.created_by || 'NV inbox',
                    qty,
                    o.status
                );
            } else {
                const ranges = o.live_campaign_name
                    ? rangeMap.get(sanitizeCampaignName(o.live_campaign_name)) || []
                    : [];
                const b = kpiCore.resolveBeneficiaryBySTT(o.campaign_stt, ranges);
                if (b) bucket(Number.isFinite(b.id) ? b.id : 0, b.name, qty, o.status);
                else if (kindOf(o.status) === 'actual') unassignedActual += qty;
                else unassignedForecast += qty;
            }
        }

        let rows = [...acc.values()].map((x) => ({
            ...x,
            forecast_amount: x.forecast_qty * RATE_PER_SP,
            actual_amount: x.actual_qty * RATE_PER_SP,
            // tổng tiện sort/hiển thị
            total_qty: x.forecast_qty + x.actual_qty,
        }));
        if (selfOnly) {
            rows = rows.filter((r) => String(r.beneficiary_user_id) === String(viewer.id));
            unassignedForecast = 0;
            unassignedActual = 0;
        }
        rows.sort((a, b) => b.total_qty - a.total_qty);

        res.json({
            success: true,
            kpi: rows,
            unassigned_forecast_qty: unassignedForecast,
            unassigned_actual_qty: unassignedActual,
            viewer: viewer
                ? { id: viewer.id, role: viewer.role, scope: selfOnly ? 'self' : 'all' }
                : { scope: 'all' },
            rate_per_sp: RATE_PER_SP,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// Sprint 4 — Backlog review queue + Recalc + Reclassify
// =====================================================

// GET /backlog?campaign_id= — list mọi events source='backlog' chưa được reviewed
// (chưa có compensating reclassify event hoặc admin chưa flag là OK).
router.get('/backlog', async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const conds = [`source = 'backlog'`, `event_type = 'forecast_add'`];
        const params = [];
        let i = 1;
        if (req.query.campaign_id) {
            i = _pushCampaignFilter(conds, params, i, req.query.campaign_id);
        }
        // Exclude events that already have a reclassify compensating event
        conds.push(`NOT EXISTS (
            SELECT 1 FROM web2_kpi_events r
            WHERE r.event_type = 'reclassify_backlog'
              AND r.revokes_event_id = web2_kpi_events.id
        )`);
        const r = await pool.query(
            `SELECT * FROM web2_kpi_events
             WHERE ${conds.join(' AND ')}
             ORDER BY event_time DESC
             LIMIT 200`,
            params
        );
        res.json({ success: true, items: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /backlog/:id/reclassify
// Body: { decision: 'approve_backlog' | 'reclassify_native', reviewerUserId, reviewerName, note }
// approve_backlog → mark reviewed (emit compensating với qty_delta=0, type=reclassify_backlog approve)
// reclassify_native → emit reclassify_backlog event (compensating) + forecast_add native (count KPI)
// MEDIUM-cleanup (2026-06-13): 0 frontend caller — gate admin (mutation reclassify
// KPI event là thao tác nhạy cảm; nếu sống lại phải qua admin).
router.post('/backlog/:id/reclassify', requireWeb2Admin, async (req, res) => {
    try {
        const pool = req.app.locals.web2Db || req.app.locals.chatDb;
        const eventId = Number(req.params.id);
        const { decision, reviewerUserId, reviewerName, note } = req.body || {};
        if (!['approve_backlog', 'reclassify_native'].includes(decision)) {
            return res.status(400).json({ success: false, error: 'Invalid decision' });
        }
        const reviewerId = Number(reviewerUserId);
        if (!Number.isFinite(reviewerId)) {
            return res.status(400).json({ success: false, error: 'reviewerUserId required' });
        }

        const origQ = await pool.query(`SELECT * FROM web2_kpi_events WHERE id = $1`, [eventId]);
        if (!origQ.rows.length)
            return res.status(404).json({ success: false, error: 'Event not found' });
        const orig = origQ.rows[0];
        if (orig.source !== 'backlog' || orig.event_type !== 'forecast_add') {
            return res.status(400).json({ success: false, error: 'Event is not a backlog add' });
        }

        // Step 1: emit compensating "reclassify_backlog" — marks original as reviewed
        await emitKpiEvent(pool, {
            event_type: 'reclassify_backlog',
            actor_user_id: reviewerId,
            actor_name: reviewerName || null,
            beneficiary_user_id: orig.beneficiary_user_id,
            beneficiary_name: orig.beneficiary_name,
            beneficiary_source: 'admin-review',
            order_code: orig.order_code,
            order_campaign_stt: orig.order_campaign_stt,
            customer_id: orig.customer_id,
            product_code: orig.product_code,
            qty_delta: 0, // info-only, không ảnh hưởng forecast/actual
            source: 'backlog',
            campaign_id: orig.campaign_id,
            source_page: 'web2-kpi-backlog-review',
            client_event_id: `reclassify_${eventId}`,
            revokes_event_id: eventId,
            raw_payload: { decision, note: note || null },
        });

        // Step 2: nếu reclassify_native → emit forecast_add với source='native' (count KPI)
        if (decision === 'reclassify_native') {
            await emitKpiEvent(pool, {
                event_type: 'forecast_add',
                actor_user_id: reviewerId,
                actor_name: reviewerName || null,
                beneficiary_user_id: orig.beneficiary_user_id,
                beneficiary_name: orig.beneficiary_name,
                beneficiary_source: orig.beneficiary_source,
                order_code: orig.order_code,
                order_campaign_stt: orig.order_campaign_stt,
                customer_id: orig.customer_id,
                product_code: orig.product_code,
                qty_delta: orig.qty_delta,
                source: 'native',
                campaign_id: orig.campaign_id,
                source_page: 'web2-kpi-backlog-review',
                client_event_id: `reclassify_native_${eventId}`,
                raw_payload: { from_event_id: eventId, note: note || null },
            });
        }
        res.json({ success: true, decision, original_event_id: eventId });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.emitKpiEvent = emitKpiEvent;
module.exports.resolveBeneficiary = resolveBeneficiary;
module.exports.sanitizeCampaignName = sanitizeCampaignName;
module.exports.applyKpiScope = applyKpiScope;
module.exports.buildScopeWhere = buildScopeWhere;
module.exports.buildScopeWhereWithAlias = buildScopeWhereWithAlias;
module.exports.invalidateScopeCache = invalidateScopeCache;
module.exports.RATE_PER_SP = RATE_PER_SP;
module.exports.SYNTHETIC_NO_CAMPAIGN = SYNTHETIC_NO_CAMPAIGN;
