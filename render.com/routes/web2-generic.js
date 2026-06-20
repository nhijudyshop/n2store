// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 GENERIC ENTITY REST API
// One table backs all 87 TPOS-clone pages. Schema-driven CRUD.
// Routes: /api/web2/:entity/(health|list|get/:code|create|update/:code|delete/:code)
// =====================================================

const express = require('express');
const router = express.Router();
// 3H21 (2026-06-12): CRUD generic wire SOFT để bật được WEB2_AUTH_ENFORCE=1
// (trước đây không tham chiếu middleware nào → bật enforce vẫn mở toang 78 entity).
const { requireWeb2Admin, requireWeb2AuthSoft } = require('../middleware/web2-auth');

// -----------------------------------------------------
// SSE notifier — injected từ server.js. Sau mỗi DB mutation, broadcast
// topic `web2:<entity-slug>` (vd 'web2:partner-customer') để các page
// generic CRUD đang subscribe (qua page-builder + Web2SSE) tự refresh.
// Xem docs/web2/SSE-REALTIME.md.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(entity, action, code) {
    if (!_notifyClients || !entity) return;
    try {
        _notifyClients(`web2:${entity}`, { action, code: code || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-GENERIC] _notify failed:', e.message);
    }
}

// Key theo pool object (WeakSet) thay vì flag module-level: cold-start fallback
// chatDb không được làm web2Db skip ensureTables (2 pool riêng biệt).
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_entities (
                slug        VARCHAR(60)  PRIMARY KEY,
                label       VARCHAR(100) NOT NULL,
                schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS web2_records (
                id            BIGSERIAL PRIMARY KEY,
                entity_slug   VARCHAR(60) NOT NULL,
                code          VARCHAR(100),
                name          VARCHAR(255),
                data          JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_active     BOOLEAN NOT NULL DEFAULT true,
                created_by    VARCHAR(100),
                created_at    BIGINT NOT NULL,
                updated_at    BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_records_entity   ON web2_records(entity_slug);
            CREATE INDEX IF NOT EXISTS idx_web2_records_name     ON web2_records(name);
            CREATE INDEX IF NOT EXISTS idx_web2_records_code     ON web2_records(code);
            CREATE INDEX IF NOT EXISTS idx_web2_records_active   ON web2_records(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_records_created  ON web2_records(created_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_records_entity_code
                ON web2_records(entity_slug, code) WHERE code IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_web2_records_entity_active_updated
                ON web2_records(entity_slug, is_active DESC, updated_at DESC);
        `);
        _ensuredPools.add(pool);
        console.log('[WEB2-GENERIC] Tables created/verified');
    } catch (e) {
        console.error('[WEB2-GENERIC] Table creation error:', e.message);
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        entitySlug: row.entity_slug,
        code: row.code,
        name: row.name,
        data: row.data || {},
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
function validSlug(s) {
    return typeof s === 'string' && SLUG_RE.test(s);
}

// -----------------------------------------------------
// GET /api/web2/_storage
// Trả disk usage cho web2_records: tổng table + index, breakdown theo entity_slug.
// Read-only, an toàn dùng để monitor.
// -----------------------------------------------------
router.get('/_storage', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const total = await pool.query(`
            SELECT
                pg_size_pretty(pg_total_relation_size('web2_records')) AS total_size,
                pg_size_pretty(pg_relation_size('web2_records')) AS table_size,
                pg_size_pretty(pg_indexes_size('web2_records')) AS index_size,
                pg_total_relation_size('web2_records') AS total_bytes,
                pg_database_size(current_database()) AS db_total_bytes
        `);
        const byEntity = await pool.query(`
            SELECT entity_slug, COUNT(*)::int AS records,
                   pg_size_pretty(SUM(pg_column_size(data))) AS data_size,
                   SUM(pg_column_size(data))::bigint AS data_bytes
            FROM web2_records
            GROUP BY entity_slug
            ORDER BY data_bytes DESC
        `);
        res.json({
            ok: true,
            web2_records: {
                total_size_pretty: total.rows[0].total_size,
                table_size_pretty: total.rows[0].table_size,
                index_size_pretty: total.rows[0].index_size,
                total_bytes: Number(total.rows[0].total_bytes),
            },
            db_total_bytes: Number(total.rows[0].db_total_bytes),
            db_total_pretty: prettyBytes(Number(total.rows[0].db_total_bytes)),
            by_entity: byEntity.rows.map((r) => ({
                slug: r.entity_slug,
                records: r.records,
                data_size_pretty: r.data_size,
                data_bytes: Number(r.data_bytes),
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function prettyBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// =====================================================
// CAPTURE LOCK — atomic compare-and-swap (1 máy capture livestream)
// Fix TOCTOU: client cũ read-rồi-write → 2 máy cùng thành leader.
// Giờ acquire/renew/heartbeat = 1 câu SQL atomic; release chỉ khi còn là holder.
//
// POST /api/web2/capture-lock/acquire  body {holder, holderName?, force?, ttlMs?}
//   → {success:true, data}  (lấy được / renew — heartbeat dùng chính endpoint này)
//   → {success:false, current}  (máy khác đang giữ và chưa hết TTL)
// POST /api/web2/capture-lock/release  body {holder}
//   → {success:true|false} — sendBeacon-friendly (Blob type application/json)
// Backward compat: GET get/global + PATCH update/global (generic) vẫn hoạt động.
// =====================================================
const LOCK_SLUG = 'capture-lock';
const LOCK_CODE = 'global';
const LOCK_TTL_DEFAULT_MS = 90000;

// Auth (soft → 401 khi WEB2_AUTH_ENFORCE=1): chống force-acquire/release lock
// capture livestream bởi client lạ (audit CRITICAL 2026-06-20). acquire gửi token
// qua header (NS._w2AuthHeaders); release qua sendBeacon (KHÔNG set header được) →
// token đi trong body, extractToken đọc header → query → body.token.
router.post('/capture-lock/acquire', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const holder = String(b.holder || '').slice(0, 120);
        if (!holder) return res.status(400).json({ success: false, error: 'holder required' });
        const holderName = String(b.holderName || '').slice(0, 120) || null;
        const ttlMs = Math.min(Math.max(Number(b.ttlMs) || LOCK_TTL_DEFAULT_MS, 15000), 600000);
        const force = b.force === true;
        const now = Date.now();
        const data = { holder, holderName, ts: now, ttlMs, acquiredVia: force ? 'force' : 'cas' };
        // Atomic CAS: update chỉ khi lock trống / của mình (renew) / hết TTL / force.
        const r = await pool.query(
            `INSERT INTO web2_records (entity_slug, code, name, data, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Capture Lock', $3::jsonb, TRUE, $4, $4)
             ON CONFLICT (entity_slug, code) WHERE code IS NOT NULL
             DO UPDATE SET data = EXCLUDED.data, updated_at = $4
             WHERE web2_records.data->>'holder' IS NULL
                OR web2_records.data->>'holder' = ''
                OR web2_records.data->>'holder' = $5
                OR COALESCE((web2_records.data->>'ts')::bigint, 0)
                   + COALESCE((web2_records.data->>'ttlMs')::bigint, ${LOCK_TTL_DEFAULT_MS}) < $4
                OR $6::boolean
             RETURNING data`,
            [LOCK_SLUG, LOCK_CODE, JSON.stringify(data), now, holder, force]
        );
        if (r.rows.length > 0) {
            _notify(LOCK_SLUG, force ? 'force-acquire' : 'acquire', LOCK_CODE);
            return res.json({ success: true, data: r.rows[0].data });
        }
        const cur = await pool.query(
            `SELECT data FROM web2_records WHERE entity_slug = $1 AND code = $2 LIMIT 1`,
            [LOCK_SLUG, LOCK_CODE]
        );
        return res.json({ success: false, current: cur.rows[0]?.data || null });
    } catch (e) {
        console.error('[WEB2-GENERIC] capture-lock acquire error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/capture-lock/release', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const holder = String((req.body || {}).holder || '').slice(0, 120);
        if (!holder) return res.status(400).json({ success: false, error: 'holder required' });
        const now = Date.now();
        const r = await pool.query(
            `UPDATE web2_records
             SET data = data || jsonb_build_object('holder', null, 'holderName', null, 'ts', 0, 'releasedAt', $3::bigint),
                 updated_at = $3
             WHERE entity_slug = $1 AND code = $2 AND data->>'holder' = $4
             RETURNING data`,
            [LOCK_SLUG, LOCK_CODE, now, holder]
        );
        if (r.rows.length > 0) _notify(LOCK_SLUG, 'release', LOCK_CODE);
        res.json({ success: r.rows.length > 0 });
    } catch (e) {
        console.error('[WEB2-GENERIC] capture-lock release error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// A4 (2026-06-13): live-hidden-commenters — APPEND/REMOVE 1 phần tử ATOMIC.
// TRƯỚC đây client gửi TOÀN BỘ mảng `commenters` qua PATCH update/global →
// 2 máy ẩn 2 người cùng lúc đọc state cũ → ghi đè nhau → MẤT 1 người (lost write).
// Giờ: server tự append/remove 1 phần tử trong 1 câu SQL (row-lock của UPDATE/
// upsert = atomic, không read-modify-write). Endpoint generic update/global VẪN
// giữ (backward-compat client cũ) nhưng client mới gọi /hide|/unhide.
// =====================================================
const LHC_SLUG = 'live-hidden-commenters';
const LHC_CODE = 'global';

// POST /api/web2/live-hidden-commenters/hide/:fbId  body {name?, userName?}
router.post('/live-hidden-commenters/hide/:fbId', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const fbId = String(req.params.fbId || '').trim();
        if (!fbId) return res.status(400).json({ success: false, error: 'fbId required' });
        const now = Date.now();
        const entry = {
            fbId,
            name: String((req.body || {}).name || '').slice(0, 200),
            hiddenAt: now,
            by:
                (req.web2User && (req.web2User.display_name || req.web2User.username)) ||
                String((req.body || {}).userName || '').slice(0, 120) ||
                'user',
        };
        // Upsert: tạo record nếu chưa có; nếu có thì append entry CHỈ KHI fbId chưa
        // tồn tại (NOT data.commenters @> [{fbId}]) → idempotent, atomic row-level.
        const r = await pool.query(
            `INSERT INTO web2_records (entity_slug, code, name, data, is_active, created_at, updated_at)
             VALUES ($1, $2, 'Live hidden commenters',
                     jsonb_build_object('commenters', jsonb_build_array($3::jsonb), 'history', '[]'::jsonb),
                     TRUE, $4, $4)
             ON CONFLICT (entity_slug, code) WHERE code IS NOT NULL
             DO UPDATE SET
                 data = jsonb_set(COALESCE(web2_records.data, '{}'::jsonb), '{commenters}',
                          COALESCE(web2_records.data->'commenters', '[]'::jsonb) || $3::jsonb),
                 updated_at = $4
             WHERE NOT (COALESCE(web2_records.data->'commenters', '[]'::jsonb) @> $5::jsonb)
             RETURNING *`,
            [LHC_SLUG, LHC_CODE, JSON.stringify(entry), now, JSON.stringify([{ fbId }])]
        );
        // r.rows.length===0 → fbId đã có sẵn (idempotent) → vẫn success.
        _notify(LHC_SLUG, 'hide', LHC_CODE);
        res.json({
            success: true,
            record: r.rows[0] ? mapRow(r.rows[0]) : null,
            alreadyHidden: r.rows.length === 0,
        });
    } catch (e) {
        console.error('[WEB2-GENERIC] live-hidden hide error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /api/web2/live-hidden-commenters/unhide/:fbId
router.post('/live-hidden-commenters/unhide/:fbId', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const fbId = String(req.params.fbId || '').trim();
        if (!fbId) return res.status(400).json({ success: false, error: 'fbId required' });
        const now = Date.now();
        // Lọc bỏ phần tử có fbId trong 1 câu (subquery đọc OLD data của chính row →
        // atomic dưới row-lock của UPDATE).
        const r = await pool.query(
            `UPDATE web2_records
             SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{commenters}',
                   COALESCE((
                       SELECT jsonb_agg(e)
                       FROM jsonb_array_elements(COALESCE(data->'commenters', '[]'::jsonb)) e
                       WHERE e->>'fbId' <> $3
                   ), '[]'::jsonb)),
                 updated_at = $4
             WHERE entity_slug = $1 AND code = $2
             RETURNING *`,
            [LHC_SLUG, LHC_CODE, fbId, now]
        );
        _notify(LHC_SLUG, 'unhide', LHC_CODE);
        res.json({ success: true, record: r.rows[0] ? mapRow(r.rows[0]) : null });
    } catch (e) {
        console.error('[WEB2-GENERIC] live-hidden unhide error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/:entity/health
// -----------------------------------------------------
router.get('/:entity/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ ok: false, error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            'SELECT COUNT(*)::int AS n FROM web2_records WHERE entity_slug = $1',
            [req.params.entity]
        );
        res.json({ ok: true, entity: req.params.entity, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/:entity/list?search=&activeOnly=true&page=1&limit=200
// -----------------------------------------------------
router.get('/:entity/list', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const { search, activeOnly, page = 1, limit = 200 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        // Cap limit để query luôn bounded (chống unbounded scan). NaN → default 200.
        const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10) || 200));
        const offset = (pageNum - 1) * limitNum;

        const conds = ['entity_slug = $1'];
        const params = [req.params.entity];
        if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(code ILIKE $${i} OR name ILIKE $${i})`);
        }
        const where = 'WHERE ' + conds.join(' AND ');

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_records ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_records ${where}
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );
        res.json({
            success: true,
            entity: req.params.entity,
            records: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/:entity/get/:code
// -----------------------------------------------------
router.get('/:entity/get/:code', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM web2_records WHERE entity_slug = $1 AND code = $2 LIMIT 1`,
            [req.params.entity, req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, record: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/create
// Body: { code?, name, data?, createdBy? }
// -----------------------------------------------------
router.post('/:entity/create', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.name) return res.status(400).json({ error: 'name required' });
        const now = Date.now();
        // P1 2026-05-30: auto-seed data.history[0] = "create" entry với user
        // nếu client chưa seed. Caller pages chỉ cần pass userId/userName.
        const data = b.data && typeof b.data === 'object' ? { ...b.data } : {};
        if (!Array.isArray(data.history)) {
            data.history = [
                {
                    ts: now,
                    action: 'create',
                    userId: req.web2User?.id ?? (b.userId || b.createdBy || null),
                    userName:
                        req.web2User?.display_name ||
                        b.userName ||
                        data.createdByName ||
                        '(ẩn danh)',
                    sourcePage: b.sourcePage || null,
                    note: null,
                },
            ];
        }
        if (b.userName && !data.createdByName) data.createdByName = b.userName;
        try {
            const r = await pool.query(
                `INSERT INTO web2_records (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
                [
                    req.params.entity,
                    b.code ? String(b.code).trim() : null,
                    String(b.name).trim(),
                    JSON.stringify(data),
                    b.isActive !== false,
                    b.createdBy || b.userId || null,
                    now,
                ]
            );
            _notify(req.params.entity, 'create', r.rows[0].code);
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res
                    .status(409)
                    .json({ error: `Mã "${b.code}" đã tồn tại trong "${req.params.entity}"` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-GENERIC] create error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /api/web2/:entity/update/:code
// -----------------------------------------------------
router.patch('/:entity/update/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    // H12: SELECT → append history JS-side → UPDATE phải atomic. Transaction +
    // FOR UPDATE row-lock — 2 update đồng thời không mất history / lost update.
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        const allowed = { name: 'name', data: 'data', isActive: 'is_active' };
        // P1 2026-05-30: auto-append history entry "update" với user info.
        // Đọc existing data (FOR UPDATE), append new entry, mới ghi lại.
        const b = req.body || {};
        let dataPayload = b.data;
        // 3H10 FIX (2026-06-12): field do STATE MACHINE server quản — client
        // KHÔNG được ghi đè qua generic update. purchase-refund: PATCH đè
        // status/stock_deducted (copy stale từ STATE tab khác) rồi /approve
        // lần nữa → deductStock chạy LẦN 2 = kho trừ đôi. Mọi chuyển trạng
        // thái CHỈ qua /api/purchase-refund/:code/* (transaction + FOR UPDATE).
        const PROTECTED_DATA_FIELDS = {
            'purchase-refund': [
                'status',
                'stock_deducted',
                'approved_at',
                'approved_by',
                'approved_by_id',
                'rejected_at',
                'rejected_by',
                'refunded_at',
                'refunded_by',
                'history',
            ],
        };
        const protectedFields = PROTECTED_DATA_FIELDS[req.params.entity];
        if (protectedFields && dataPayload && typeof dataPayload === 'object') {
            dataPayload = { ...dataPayload };
            for (const f of protectedFields) delete dataPayload[f];
        }
        await client.query('BEGIN');
        if (b.userId || b.userName || dataPayload !== undefined) {
            const existing = await client.query(
                `SELECT data FROM web2_records WHERE entity_slug = $1 AND code = $2 LIMIT 1 FOR UPDATE`,
                [req.params.entity, req.params.code]
            );
            const existingData = existing.rows[0]?.data || {};
            const merged =
                dataPayload && typeof dataPayload === 'object'
                    ? { ...existingData, ...dataPayload }
                    : { ...existingData };
            const history = Array.isArray(merged.history) ? [...merged.history] : [];
            history.push({
                ts: Date.now(),
                action: 'update',
                userId: req.web2User?.id ?? (b.userId || null),
                userName: req.web2User?.display_name || b.userName || '(ẩn danh)',
                sourcePage: b.sourcePage || null,
                note: b.updateNote || null,
            });
            merged.history = history;
            if (b.userName) merged.updatedByName = b.userName;
            dataPayload = merged;
        }
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            const value = k === 'data' ? dataPayload : b[k];
            if (value === undefined) continue;
            params.push(k === 'data' ? JSON.stringify(value) : value);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No update fields' });
        }
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.entity);
        params.push(req.params.code);

        const r = await client.query(
            `UPDATE web2_records SET ${sets.join(', ')}
             WHERE entity_slug = $${params.length - 1} AND code = $${params.length}
             RETURNING *`,
            params
        );
        if (!r.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }
        await client.query('COMMIT');
        _notify(req.params.entity, 'update', r.rows[0].code);
        res.json({ success: true, record: mapRow(r.rows[0]) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/delete-all
// Bulk delete TẤT CẢ records của 1 entity. Cần body { confirm: true } để tránh accident.
// Trả về số rows đã xóa. Không tự VACUUM — caller có thể gọi /_vacuum riêng.
// S1: admin/maintenance-only → gate requireWeb2Admin (token web2_user_sessions, role='admin').
// -----------------------------------------------------
router.post('/:entity/delete-all', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    if (!req.body || req.body.confirm !== true) {
        return res
            .status(400)
            .json({ error: 'confirm flag required: POST body must be {"confirm": true}' });
    }
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM web2_records WHERE entity_slug = $1 RETURNING id`, [
            req.params.entity,
        ]);
        if (r.rowCount) _notify(req.params.entity, 'delete-all', null);
        res.json({ success: true, entity: req.params.entity, deleted: r.rowCount });
    } catch (e) {
        console.error('[WEB2-GENERIC] delete-all error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/_vacuum
// Reclaim disk sau khi delete hàng loạt. VACUUM FULL chậm + lock table — chỉ chạy adhoc.
// Thường VACUUM (không FULL) là đủ.
// S1: admin/maintenance-only → gate requireWeb2Admin (token web2_user_sessions, role='admin').
// -----------------------------------------------------
router.post('/_vacuum', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!req.body || req.body.confirm !== true) {
        return res
            .status(400)
            .json({ error: 'confirm flag required: POST body must be {"confirm": true}' });
    }
    const full = req.body.full === true;
    try {
        const before = await pool.query(`
            SELECT pg_total_relation_size('web2_records') AS bytes
        `);
        await pool.query(full ? `VACUUM FULL ANALYZE web2_records` : `VACUUM ANALYZE web2_records`);
        const after = await pool.query(`
            SELECT pg_total_relation_size('web2_records') AS bytes
        `);
        const beforeBytes = Number(before.rows[0].bytes);
        const afterBytes = Number(after.rows[0].bytes);
        res.json({
            success: true,
            mode: full ? 'VACUUM FULL ANALYZE' : 'VACUUM ANALYZE',
            before_bytes: beforeBytes,
            after_bytes: afterBytes,
            freed_bytes: beforeBytes - afterBytes,
            freed_pretty: prettyBytes(beforeBytes - afterBytes),
        });
    } catch (e) {
        console.error('[WEB2-GENERIC] vacuum error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /api/web2/:entity/delete/:code
// -----------------------------------------------------
router.delete('/:entity/delete/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `DELETE FROM web2_records WHERE entity_slug = $1 AND code = $2 RETURNING code`,
            [req.params.entity, req.params.code]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify(req.params.entity, 'delete', req.params.code);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2/:entity/bulk-create
// Body: { records: [{ code, name, data?, isActive?, createdBy? }, ...] }
// Inserts all rows in a single statement; ON CONFLICT (entity_slug, code) DO NOTHING.
// Returns: { success, total, inserted, skipped }
// Designed for seeders importing thousands of rows. Cap: 5000 records / call.
// -----------------------------------------------------
router.post('/:entity/bulk-create', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    if (!validSlug(req.params.entity))
        return res.status(400).json({ error: 'invalid entity slug' });
    const records = Array.isArray(req.body?.records) ? req.body.records : null;
    if (!records || records.length === 0) {
        return res.status(400).json({ error: 'records array required' });
    }
    if (records.length > 5000) {
        return res
            .status(413)
            .json({ error: `Too many records (${records.length}); limit 5000 per call` });
    }
    try {
        await ensureTables(pool);
        const now = Date.now();
        const slug = req.params.entity;

        const valuesSql = [];
        const params = [];
        let pi = 1;
        for (const rec of records) {
            if (!rec || !rec.name) continue;
            valuesSql.push(
                `($${pi++}, $${pi++}, $${pi++}, $${pi++}::jsonb, $${pi++}, $${pi++}, $${pi++}, $${pi++})`
            );
            params.push(
                slug,
                rec.code ? String(rec.code).trim() : null,
                String(rec.name).trim(),
                JSON.stringify(rec.data || {}),
                rec.isActive !== false,
                rec.createdBy || null,
                now,
                now
            );
        }
        if (valuesSql.length === 0) {
            return res.status(400).json({ error: 'no valid records (each needs name)' });
        }

        const sql = `
            INSERT INTO web2_records
                (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
            VALUES ${valuesSql.join(', ')}
            ON CONFLICT (entity_slug, code) WHERE code IS NOT NULL DO NOTHING
            RETURNING id
        `;
        const r = await pool.query(sql, params);
        if (r.rows.length) _notify(req.params.entity, 'bulk-create', null);
        res.json({
            success: true,
            total: records.length,
            inserted: r.rows.length,
            skipped: records.length - r.rows.length,
        });
    } catch (e) {
        console.error('[WEB2-GENERIC] bulk-create error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
