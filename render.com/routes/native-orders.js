// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// NATIVE ORDERS REST API
// Web-native order creation, ISOLATED from TPOS SaleOnline_Order
// and from social_orders (which belongs to don-inbox).
//
// Used by tpos-pancake "Tạo đơn" button (replaces TPOS flow).
// Orders are marked with source='NATIVE_WEB' so they can be
// distinguished from TPOS orders in any downstream report.
// =====================================================

const express = require('express');
const router = express.Router();
const { lookupCustomerIdByPhone } = require('../utils/customer-helpers');

// -----------------------------------------------------
// SSE notifier — injected từ server.js. Sau mỗi DB mutation, broadcast
// topic 'web2:native-orders' để các client đang xem trang Đơn Web tự
// refresh không cần F5. Replaces (would-be) Firestore listener.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:native-orders',
            { action, code: code || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[NATIVE-ORDERS] _notify failed:', e.message);
    }
}

// -----------------------------------------------------
// Auto-create table on first request
// -----------------------------------------------------
let _tablesCreated = false;
async function ensureTables(pool) {
    if (_tablesCreated) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS native_orders (
                id              BIGSERIAL PRIMARY KEY,
                code            VARCHAR(40)  UNIQUE NOT NULL,
                session_index   INTEGER,
                source          VARCHAR(30)  NOT NULL DEFAULT 'NATIVE_WEB',

                customer_name   VARCHAR(255),
                phone           VARCHAR(40),
                address         TEXT,
                note            TEXT,

                fb_user_id      VARCHAR(100),
                fb_user_name    VARCHAR(255),
                fb_page_id      VARCHAR(100),
                fb_post_id      VARCHAR(100),
                fb_comment_id   VARCHAR(100),
                crm_team_id     INTEGER,

                products        JSONB  DEFAULT '[]'::jsonb,
                total_quantity  INTEGER DEFAULT 0,
                total_amount    NUMERIC(14,2) DEFAULT 0,

                status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                tags            JSONB  DEFAULT '[]'::jsonb,

                created_by      VARCHAR(100),
                created_by_name VARCHAR(255),
                created_at      BIGINT NOT NULL,
                updated_at      BIGINT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_native_orders_created_at
                ON native_orders(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_user_id
                ON native_orders(fb_user_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_fb_post_id
                ON native_orders(fb_post_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_status
                ON native_orders(status);
            CREATE INDEX IF NOT EXISTS idx_native_orders_phone
                ON native_orders(phone);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_native_orders_comment
                ON native_orders(fb_comment_id)
                WHERE fb_comment_id IS NOT NULL;

            -- Migration 067: extend with TPOS-style fields (idempotent ADD IF NOT EXISTS)
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS assigned_employee_id   VARCHAR(100),
                ADD COLUMN IF NOT EXISTS assigned_employee_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS live_campaign_id       VARCHAR(100),
                ADD COLUMN IF NOT EXISTS live_campaign_name     VARCHAR(255),
                ADD COLUMN IF NOT EXISTS deposit                NUMERIC(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS partner_status         VARCHAR(50),
                ADD COLUMN IF NOT EXISTS warehouse_id           INTEGER,
                ADD COLUMN IF NOT EXISTS reversed_code          VARCHAR(40),
                ADD COLUMN IF NOT EXISTS print_count            INTEGER NOT NULL DEFAULT 0;

            CREATE INDEX IF NOT EXISTS idx_native_orders_live_campaign
                ON native_orders(live_campaign_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_assigned
                ON native_orders(assigned_employee_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_reversed_code
                ON native_orders(reversed_code);

            -- Migration 068: global display STT — sequence cấp số atomic
            -- "Reset về 1" = ALTER SEQUENCE ... RESTART WITH 1
            CREATE SEQUENCE IF NOT EXISTS native_orders_display_stt_seq START 1;
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS display_stt INTEGER;
            CREATE INDEX IF NOT EXISTS idx_native_orders_display_stt
                ON native_orders(display_stt DESC);

            -- Migration 069: mirror TPOS SaleOnline_Order fields cho full clone
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS city_code         VARCHAR(20),
                ADD COLUMN IF NOT EXISTS city_name         VARCHAR(120),
                ADD COLUMN IF NOT EXISTS district_code     VARCHAR(20),
                ADD COLUMN IF NOT EXISTS district_name     VARCHAR(120),
                ADD COLUMN IF NOT EXISTS ward_code         VARCHAR(20),
                ADD COLUMN IF NOT EXISTS ward_name         VARCHAR(120),
                ADD COLUMN IF NOT EXISTS partner_id        INTEGER,
                ADD COLUMN IF NOT EXISTS partner_code      VARCHAR(60),
                ADD COLUMN IF NOT EXISTS partner_unique_id VARCHAR(80),
                ADD COLUMN IF NOT EXISTS email             VARCHAR(255),
                ADD COLUMN IF NOT EXISTS company_id        INTEGER,
                ADD COLUMN IF NOT EXISTS company_name      VARCHAR(150),
                ADD COLUMN IF NOT EXISTS warehouse_name    VARCHAR(150),
                ADD COLUMN IF NOT EXISTS message_count     INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tpos_index        INTEGER;

            -- Migration 073: gộp comment cùng campaign+customer thay vì tạo đơn mới
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS comment_ids JSONB DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 1;
            -- Migration 074: Customer 360 cross-system FK (Phase 12)
            -- Soft FK (no constraint) — orders survive if customer is hard-deleted
            ALTER TABLE native_orders
                ADD COLUMN IF NOT EXISTS customer_id INTEGER;
            CREATE INDEX IF NOT EXISTS idx_native_orders_partner_id ON native_orders(partner_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_company_id ON native_orders(company_id);
            CREATE INDEX IF NOT EXISTS idx_native_orders_customer_id ON native_orders(customer_id);
        `);

        // Backfill existing rows with display_stt (one-shot, ordered by created_at ASC)
        await pool.query(`
            DO $$
            DECLARE r RECORD;
            BEGIN
                IF EXISTS (SELECT 1 FROM native_orders WHERE display_stt IS NULL LIMIT 1) THEN
                    FOR r IN SELECT id FROM native_orders WHERE display_stt IS NULL ORDER BY created_at ASC LOOP
                        UPDATE native_orders SET display_stt = nextval('native_orders_display_stt_seq') WHERE id = r.id;
                    END LOOP;
                END IF;
            END $$;
        `);
        _tablesCreated = true;
        console.log(
            '[NATIVE-ORDERS] Tables created/verified (migration 068: display_stt sequence)'
        );
    } catch (error) {
        console.error('[NATIVE-ORDERS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function mapRowToOrder(row) {
    if (!row) return null;
    return {
        id: row.id,
        code: row.code,
        displayStt: row.display_stt,
        sessionIndex: row.session_index,
        source: row.source,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.address,
        note: row.note,
        fbUserId: row.fb_user_id,
        fbUserName: row.fb_user_name,
        fbPageId: row.fb_page_id,
        fbPostId: row.fb_post_id,
        fbCommentId: row.fb_comment_id,
        crmTeamId: row.crm_team_id,
        products: row.products || [],
        totalQuantity: row.total_quantity,
        totalAmount: Number(row.total_amount || 0),
        status: row.status,
        tags: row.tags || [],
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        // Migration 067 — TPOS-style fields
        assignedEmployeeId: row.assigned_employee_id,
        assignedEmployeeName: row.assigned_employee_name,
        liveCampaignId: row.live_campaign_id,
        liveCampaignName: row.live_campaign_name,
        deposit: Number(row.deposit || 0),
        partnerStatus: row.partner_status,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        reversedCode: row.reversed_code,
        printCount: Number(row.print_count || 0),
        // Migration 069 — TPOS SaleOnline_Order mirror fields
        cityCode: row.city_code,
        cityName: row.city_name,
        districtCode: row.district_code,
        districtName: row.district_name,
        wardCode: row.ward_code,
        wardName: row.ward_name,
        partnerId: row.partner_id,
        partnerCode: row.partner_code,
        partnerUniqueId: row.partner_unique_id,
        email: row.email,
        companyId: row.company_id,
        companyName: row.company_name,
        messageCount: Number(row.message_count || 0),
        tposIndex: row.tpos_index,
        // Migration 073 — multi-comment merge
        commentIds: row.comment_ids || [],
        commentCount: Number(row.comment_count || 1),
        // Migration 074 — Customer 360 link (Phase 12)
        customerId: row.customer_id != null ? Number(row.customer_id) : null,
    };
}

function pad(n, width) {
    const s = String(n);
    return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

async function nextDailyCode(pool) {
    // NW-YYYYMMDD-XXXX (VN timezone)
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600 * 1000);
    const datePart = `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1, 2)}${pad(vn.getUTCDate(), 2)}`;
    const prefix = `NW-${datePart}-`;

    const r = await pool.query(
        `SELECT code FROM native_orders
         WHERE code LIKE $1
         ORDER BY code DESC
         LIMIT 1`,
        [prefix + '%']
    );
    let seq = 1;
    if (r.rows.length > 0) {
        const last = r.rows[0].code;
        const m = last.match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return prefix + pad(seq, 4);
}

async function nextSessionIndex(pool, fbUserId) {
    if (!fbUserId) return 1;
    const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM native_orders WHERE fb_user_id = $1`,
        [fbUserId]
    );
    return (r.rows[0]?.n || 0) + 1;
}

// -----------------------------------------------------
// POST /api/native-orders/backfill-customer-links
// One-shot admin endpoint to link existing native_orders → customers
// by normalized phone match. Idempotent: only updates orders where
// customer_id IS NULL.
// -----------------------------------------------------
router.post('/backfill-customer-links', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        // Single-query UPDATE: match by raw phone (already normalized at insert)
        const r = await pool.query(`
            UPDATE native_orders AS o
            SET customer_id = c.id
            FROM customers AS c
            WHERE o.customer_id IS NULL
              AND o.phone IS NOT NULL
              AND o.phone <> ''
              AND c.phone = o.phone
            RETURNING o.code
        `);
        if (r.rows.length) _notify('backfill-customer-links', null);
        res.json({
            success: true,
            linked: r.rows.length,
            codes: r.rows.slice(0, 50).map((x) => x.code),
        });
    } catch (e) {
        console.error('[NATIVE-ORDERS] backfill-customer-links error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM native_orders');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/reset-stt
// Reset sequence về 1 — đơn mới tạo sau sẽ có display_stt=1, 2, 3...
// Không ảnh hưởng display_stt của đơn cũ. Optional renumber=true để renumber
// tất cả đơn hiện có theo created_at ASC.
// -----------------------------------------------------
router.post('/reset-stt', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const renumber = req.body?.renumber === true;
        if (renumber) {
            // Renumber tất cả đơn theo created_at ASC, sequence cuối = N+1
            await pool.query('ALTER SEQUENCE native_orders_display_stt_seq RESTART WITH 1');
            await pool.query(`
                DO $$
                DECLARE r RECORD;
                BEGIN
                    FOR r IN SELECT id FROM native_orders ORDER BY created_at ASC LOOP
                        UPDATE native_orders SET display_stt = nextval('native_orders_display_stt_seq') WHERE id = r.id;
                    END LOOP;
                END $$;
            `);
            const c = await pool.query('SELECT COUNT(*)::int AS n FROM native_orders');
            _notify('reset-stt-renumber', null);
            return res.json({ success: true, mode: 'renumber', renumbered: c.rows[0].n });
        }
        // Default: chỉ reset sequence — đơn cũ giữ STT, đơn mới bắt đầu từ 1
        await pool.query('ALTER SEQUENCE native_orders_display_stt_seq RESTART WITH 1');
        res.json({ success: true, mode: 'sequence-only', message: 'Đơn mới sẽ có STT từ 1' });
    } catch (e) {
        console.error('[NATIVE-ORDERS] reset-stt error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/from-comment
// Body:
//  { fbUserId, fbUserName, fbPageId, fbPostId, fbCommentId,
//    crmTeamId, message?, phone?, address?, note?,
//    createdBy?, createdByName? }
// -----------------------------------------------------
router.post('/from-comment', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.fbUserId) {
            return res.status(400).json({ error: 'fbUserId required' });
        }

        // Idempotency: if same comment already linked to an order, return it
        if (b.fbCommentId) {
            const existing = await pool.query(
                `SELECT * FROM native_orders
                 WHERE fb_comment_id = $1 OR comment_ids @> $2::jsonb
                 LIMIT 1`,
                [b.fbCommentId, JSON.stringify([b.fbCommentId])]
            );
            if (existing.rows.length > 0) {
                return res.json({
                    success: true,
                    order: mapRowToOrder(existing.rows[0]),
                    idempotent: true,
                    merged: false,
                });
            }
        }

        // ============================================================
        // MERGE LOGIC (Feature 2): nếu khách đã có đơn DRAFT trong
        // chiến dịch hiện tại → append comment + message vào đơn cũ,
        // không tạo đơn mới.
        // ============================================================
        if (b.fbUserId && b.liveCampaignId) {
            const draft = await pool.query(
                `SELECT * FROM native_orders
                 WHERE fb_user_id = $1
                   AND live_campaign_id = $2
                   AND status IN ('draft', 'confirmed')
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [b.fbUserId, b.liveCampaignId]
            );
            if (draft.rows.length > 0) {
                const src = draft.rows[0];
                const newCommentIds = Array.from(
                    new Set([
                        ...(src.comment_ids || []),
                        ...(src.fb_comment_id ? [src.fb_comment_id] : []),
                        ...(b.fbCommentId ? [b.fbCommentId] : []),
                    ])
                );
                const appendedNote = b.message
                    ? `${src.note || ''}${src.note ? '\n---\n' : ''}[${new Date().toLocaleString('vi-VN')}] ${b.message}`
                    : src.note;
                // Phase 12: if this merge brings a phone the order didn't have before,
                // attempt to link customer_id (lookup-only)
                const mergedPhone = b.phone || src.phone;
                let mergedCustomerId = src.customer_id;
                if (mergedPhone && !mergedCustomerId) {
                    mergedCustomerId = await lookupCustomerIdByPhone(pool, mergedPhone);
                }
                const updated = await pool.query(
                    `UPDATE native_orders
                     SET note = $1,
                         comment_ids = $2::jsonb,
                         comment_count = comment_count + 1,
                         message_count = COALESCE(message_count, 0) + 1,
                         customer_id = COALESCE(customer_id, $5),
                         updated_at = $3
                     WHERE id = $4
                     RETURNING *`,
                    [
                        appendedNote,
                        JSON.stringify(newCommentIds),
                        Date.now(),
                        src.id,
                        mergedCustomerId,
                    ]
                );
                const order = mapRowToOrder(updated.rows[0]);
                // Broadcast WS event để UI tự refresh
                if (req.app.locals.broadcastToClients) {
                    req.app.locals.broadcastToClients({
                        type: 'native_order:updated',
                        action: 'comment-merged',
                        order,
                        newCommentId: b.fbCommentId || null,
                    });
                }
                _notify('comment-merged', order.code);
                return res.json({ success: true, order, merged: true });
            }
        }

        const now = Date.now();
        const code = await nextDailyCode(pool);
        const sessionIndex = await nextSessionIndex(pool, b.fbUserId);

        const note = b.note || (b.message ? String(b.message).slice(0, 500) : null);

        // Phase 12: link to Customer 360 by phone (no auto-create)
        const customerId = b.phone ? await lookupCustomerIdByPhone(pool, b.phone) : null;

        const insert = await pool.query(
            `INSERT INTO native_orders (
                code, session_index, display_stt, source,
                customer_name, phone, address, note,
                fb_user_id, fb_user_name, fb_page_id, fb_post_id, fb_comment_id, crm_team_id,
                products, total_quantity, total_amount,
                status, tags,
                live_campaign_id, live_campaign_name,
                customer_id,
                created_by, created_by_name, created_at, updated_at
            ) VALUES (
                $1, $2, nextval('native_orders_display_stt_seq'), 'NATIVE_WEB',
                $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                '[]'::jsonb, 0, 0,
                'draft', '[]'::jsonb,
                $13, $14,
                $15,
                $16, $17, $18, $18
            ) RETURNING *`,
            [
                code,
                sessionIndex,
                b.customerName || b.fbUserName || null,
                b.phone || null,
                b.address || null,
                note,
                b.fbUserId,
                b.fbUserName || null,
                b.fbPageId || null,
                b.fbPostId || null,
                b.fbCommentId || null,
                b.crmTeamId ? parseInt(b.crmTeamId, 10) : null,
                b.liveCampaignId || null,
                b.liveCampaignName || null,
                customerId,
                b.createdBy || null,
                b.createdByName || null,
                now,
            ]
        );

        const order = mapRowToOrder(insert.rows[0]);

        // Phase 17: Auto-upsert Customer 360 record with all available Facebook
        // data so future orders/customer queries can find them. Non-blocking —
        // wrap in IIFE so any error doesn't kill the create-order response.
        upsertCustomerFromOrder(pool, {
            phone: b.phone,
            customerName: b.customerName || b.fbUserName,
            fbUserId: b.fbUserId,
            fbPageId: b.fbPageId,
            address: b.address,
            email: b.email,
        })
            .then((cid) => {
                // If we now have a linked customer_id but the just-inserted row
                // doesn't yet, backfill it asynchronously so the link is in DB
                // for the next /load.
                if (cid && !order.customerId) {
                    pool.query(
                        `UPDATE native_orders SET customer_id = $1 WHERE id = $2 AND customer_id IS NULL`,
                        [cid, order.id]
                    ).catch(() => {});
                }
            })
            .catch((e) => {
                console.warn('[NATIVE-ORDERS] customer upsert failed (non-fatal):', e.message);
            });

        // Broadcast WS event để các trang khác auto-refresh (native-orders list, etc.)
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'native_order:created',
                action: 'created',
                order,
            });
        }
        _notify('create', order.code);
        res.json({ success: true, order, merged: false });
    } catch (error) {
        console.error('[NATIVE-ORDERS] POST /from-comment error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Phase 17: upsert a customer record with Facebook data.
 * - If phone matches an existing customer: fill in missing fb_id / name / address
 * - If no customer with this phone: create a new one with all known fields
 * - If no phone: try fb_id match; if no fb_id match either, create minimal record
 *   only when fb_id is present (don't pollute customers table with anonymous orders)
 *
 * Returns the customer.id (existing or new), or null if nothing was upserted.
 */
async function upsertCustomerFromOrder(
    pool,
    { phone, customerName, fbUserId, fbPageId, address, email }
) {
    if (!pool) return null;
    const name = (customerName || '').trim();
    const trimmedPhone = phone ? String(phone).replace(/\s/g, '') : null;
    try {
        // 1. Try to find existing customer by phone first
        if (trimmedPhone) {
            const r = await pool.query(
                `SELECT id, fb_id, name, address FROM customers WHERE phone = $1 LIMIT 1`,
                [trimmedPhone]
            );
            if (r.rows.length > 0) {
                const existing = r.rows[0];
                // Fill in missing fields without overwriting non-null values
                const updates = [];
                const params = [];
                if (!existing.fb_id && fbUserId) {
                    params.push(fbUserId);
                    updates.push(`fb_id = $${params.length}`);
                }
                if ((!existing.name || existing.name === 'Khách hàng mới') && name) {
                    params.push(name);
                    updates.push(`name = $${params.length}`);
                }
                if (!existing.address && address) {
                    params.push(address);
                    updates.push(`address = $${params.length}`);
                }
                if (updates.length > 0) {
                    params.push(existing.id);
                    await pool.query(
                        `UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
                        params
                    );
                }
                return existing.id;
            }
        }

        // 2. If no phone-match, try fb_id match
        if (fbUserId) {
            const r = await pool.query(`SELECT id FROM customers WHERE fb_id = $1 LIMIT 1`, [
                fbUserId,
            ]);
            if (r.rows.length > 0) {
                // Fill in phone if we have one and customer doesn't
                if (trimmedPhone) {
                    await pool
                        .query(
                            `UPDATE customers SET phone = COALESCE(NULLIF(phone, ''), $1), updated_at = NOW() WHERE id = $2`,
                            [trimmedPhone, r.rows[0].id]
                        )
                        .catch(() => {});
                }
                return r.rows[0].id;
            }
        }

        // 3. Create new customer if we have at least phone+name OR fb_id+name
        if ((trimmedPhone && name) || (fbUserId && name)) {
            const ins = await pool.query(
                `INSERT INTO customers (phone, name, address, email, fb_id, pancake_data, status, tier, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Bình thường', 'new', NOW(), NOW())
                 ON CONFLICT (phone) DO UPDATE SET
                    fb_id = COALESCE(customers.fb_id, EXCLUDED.fb_id),
                    name = CASE WHEN customers.name IN ('', 'Khách hàng mới') THEN EXCLUDED.name ELSE customers.name END,
                    address = COALESCE(NULLIF(customers.address, ''), EXCLUDED.address),
                    updated_at = NOW()
                 RETURNING id`,
                [
                    trimmedPhone || `fb_${fbUserId}`, // phone is NOT NULL — fall back to fb_-prefixed pseudo-phone
                    name,
                    address || null,
                    email || null,
                    fbUserId || null,
                    fbPageId
                        ? JSON.stringify({
                              fb_page_id: fbPageId,
                              source: 'tpos-pancake-create-order',
                          })
                        : null,
                ]
            );
            return ins.rows[0]?.id || null;
        }

        return null;
    } catch (e) {
        // Silent fail — caller logs the warning
        throw e;
    }
}

// -----------------------------------------------------
// GET /api/native-orders/by-user/:fbUserId — latest order
// -----------------------------------------------------
router.get('/by-user/:fbUserId', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT * FROM native_orders
             WHERE fb_user_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [req.params.fbUserId]
        );
        if (r.rows.length === 0) return res.json({ success: true, order: null });
        res.json({ success: true, order: mapRowToOrder(r.rows[0]) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// GET /api/native-orders/load — list with filters
// -----------------------------------------------------
// -----------------------------------------------------
// GET /api/native-orders/campaigns
// Distinct list of campaigns currently used by native orders, with row count.
// Frontend dùng để render chip filter "Chiến Dịch".
// -----------------------------------------------------
router.get('/campaigns', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`
            SELECT
                COALESCE(NULLIF(live_campaign_id, ''), '__no_campaign__') AS id,
                MAX(NULLIF(live_campaign_name, '')) AS name,
                COUNT(*)::int AS count,
                MAX(created_at)::text AS last_order_at
            FROM native_orders
            GROUP BY COALESCE(NULLIF(live_campaign_id, ''), '__no_campaign__')
            ORDER BY MAX(created_at) DESC NULLS LAST
        `);
        res.json({
            success: true,
            campaigns: r.rows.map((row) => ({
                id: row.id,
                name: row.id === '__no_campaign__' ? '(Không chiến dịch)' : row.name || row.id,
                count: row.count,
                lastOrderAt: row.last_order_at,
            })),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /export — CSV download cho Đơn Web
// -----------------------------------------------------
router.get('/export', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).send('DB unavailable');
    try {
        await ensureTables(pool);
        const { status, search, campaignIds, customerId } = req.query;
        const conds = [];
        const params = [];
        if (status && status !== 'all') {
            const arr = String(status).split(',').filter(Boolean);
            params.push(arr.length === 1 ? arr[0] : arr);
            conds.push(
                arr.length === 1
                    ? `status = $${params.length}`
                    : `status = ANY($${params.length}::text[])`
            );
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(customer_name ILIKE $${i} OR phone ILIKE $${i} OR code ILIKE $${i} OR note ILIKE $${i})`
            );
        }
        if (campaignIds) {
            const ids = String(campaignIds)
                .split(',')
                .filter((s) => s && s !== '__no_campaign__');
            if (ids.length) {
                params.push(ids);
                conds.push(`live_campaign_id = ANY($${params.length}::text[])`);
            }
        }
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const r = await pool.query(
            `SELECT * FROM native_orders ${where} ORDER BY created_at DESC LIMIT 10000`,
            params
        );

        const STATUS_LABEL = {
            draft: 'Nháp',
            confirmed: 'Đã XN',
            cancelled: 'Đã hủy',
            delivered: 'Đã giao',
        };
        const headers = [
            'STT',
            'Mã đơn',
            'Ngày tạo',
            'Khách hàng',
            'SĐT',
            'Địa chỉ',
            'Tỉnh/TP',
            'Quận/Huyện',
            'Phường/Xã',
            'Tổng SL',
            'Tổng tiền',
            'Đặt cọc',
            'Trạng thái',
            'Comment count',
            'Chiến dịch',
            'FB Page',
            'FB User',
            'Nhân viên',
        ];
        function esc(v) {
            if (v == null) return '';
            const s = String(v);
            if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        }
        function fmtMs(ms) {
            if (!ms) return '';
            const d = new Date(Number(ms));
            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        const rows = r.rows.map((row) =>
            [
                row.display_stt || '',
                row.code,
                fmtMs(row.created_at),
                row.customer_name || '',
                row.phone || '',
                row.address || '',
                row.city_name || '',
                row.district_name || '',
                row.ward_name || '',
                row.total_quantity || 0,
                Number(row.total_amount || 0),
                Number(row.deposit || 0),
                STATUS_LABEL[row.status] || row.status,
                row.comment_count || 1,
                row.live_campaign_name || '',
                row.fb_page_id || '',
                row.fb_user_name || '',
                row.assigned_employee_name || row.created_by_name || '',
            ]
                .map(esc)
                .join(',')
        );

        const csv = '﻿' + headers.join(',') + '\n' + rows.join('\n');
        const filename = `donweb-export-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (e) {
        console.error('[NATIVE-ORDERS] export error:', e.message);
        res.status(500).send('Export failed: ' + e.message);
    }
});

router.get('/load', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const {
            status,
            page = 1,
            limit = 200,
            search,
            fbPostId,
            campaignIds,
            customerId,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (status && status !== 'all') {
            params.push(status);
            conds.push(`status = $${params.length}`);
        }
        if (fbPostId) {
            params.push(fbPostId);
            conds.push(`fb_post_id = $${params.length}`);
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(customer_name ILIKE $${i} OR phone ILIKE $${i} OR code ILIKE $${i} OR note ILIKE $${i})`
            );
        }
        // Phase 14: filter by customer_id (link to Customer 360)
        if (customerId) {
            const cid = parseInt(customerId, 10);
            if (Number.isFinite(cid)) {
                params.push(cid);
                conds.push(`customer_id = $${params.length}`);
            }
        }
        // campaignIds=id1,id2,...  → match orders that belong to ANY of the chosen campaigns.
        // Special token __no_campaign__ matches orders WITHOUT a campaign (NULL/empty).
        if (campaignIds) {
            const ids = String(campaignIds)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (ids.length) {
                const realIds = ids.filter((s) => s !== '__no_campaign__');
                const wantsNoCampaign = ids.includes('__no_campaign__');
                const orParts = [];
                if (realIds.length) {
                    params.push(realIds);
                    orParts.push(`live_campaign_id = ANY($${params.length}::text[])`);
                }
                if (wantsNoCampaign) {
                    orParts.push(`(live_campaign_id IS NULL OR live_campaign_id = '')`);
                }
                if (orParts.length) conds.push(`(${orParts.join(' OR ')})`);
            }
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM native_orders ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM native_orders ${where}
             ORDER BY created_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        res.json({
            success: true,
            orders: listR.rows.map(mapRowToOrder),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// PATCH /api/native-orders/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const body = { ...req.body };

        // If client sends `products`, auto-recompute total_quantity + total_amount
        // (prevents mismatch between list + totals). Client MAY still override by
        // sending totalQuantity/totalAmount explicitly — respected below.
        if (Array.isArray(body.products)) {
            if (body.totalQuantity === undefined) {
                body.totalQuantity = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0),
                    0
                );
            }
            if (body.totalAmount === undefined) {
                body.totalAmount = body.products.reduce(
                    (s, p) => s + (Number(p.quantity) || 0) * (Number(p.price) || 0),
                    0
                );
            }
        }

        const allowed = {
            customerName: 'customer_name',
            phone: 'phone',
            address: 'address',
            note: 'note',
            products: 'products',
            totalQuantity: 'total_quantity',
            totalAmount: 'total_amount',
            status: 'status',
            tags: 'tags',
            // Migration 067 — TPOS-style fields editable via PATCH
            assignedEmployeeId: 'assigned_employee_id',
            assignedEmployeeName: 'assigned_employee_name',
            liveCampaignId: 'live_campaign_id',
            liveCampaignName: 'live_campaign_name',
            deposit: 'deposit',
            partnerStatus: 'partner_status',
            warehouseId: 'warehouse_id',
            reversedCode: 'reversed_code',
            printCount: 'print_count',
            // Migration 069 — extended TPOS mirror
            cityCode: 'city_code',
            cityName: 'city_name',
            districtCode: 'district_code',
            districtName: 'district_name',
            wardCode: 'ward_code',
            wardName: 'ward_name',
            partnerId: 'partner_id',
            partnerCode: 'partner_code',
            partnerUniqueId: 'partner_unique_id',
            email: 'email',
            companyId: 'company_id',
            companyName: 'company_name',
            warehouseName: 'warehouse_name',
            messageCount: 'message_count',
            tposIndex: 'tpos_index',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (body[k] === undefined) continue;
            params.push(k === 'products' || k === 'tags' ? JSON.stringify(body[k]) : body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'No update fields' });
        // Phase 12: when phone is updated, re-link customer_id (lookup-only, no auto-create)
        if (body.phone !== undefined) {
            const cid = body.phone ? await lookupCustomerIdByPhone(pool, body.phone) : null;
            params.push(cid);
            sets.push(`customer_id = $${params.length}`);
        }
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.code);

        const r = await pool.query(
            `UPDATE native_orders SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const order = mapRowToOrder(r.rows[0]);
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'native_order:updated',
                action: 'patched',
                order,
            });
        }
        _notify('update', order.code);
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// DELETE /api/native-orders/:code — hard delete
// -----------------------------------------------------
router.delete('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`DELETE FROM native_orders WHERE code = $1 RETURNING code`, [
            req.params.code,
        ]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        if (req.app.locals.broadcastToClients) {
            req.app.locals.broadcastToClients({
                type: 'native_order:deleted',
                action: 'deleted',
                code: req.params.code,
            });
        }
        _notify('delete', req.params.code);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// -----------------------------------------------------
// POST /api/native-orders/merge-to-pbh
// Body: { codes: ['NW-...', 'NW-...'] } (≥2 codes)
// Logic:
//   - Validate: ≥2 codes, tất cả tồn tại, cùng phone
//   - Combine products (concat), sum totalQty + totalAmount
//   - INSERT vào fast_sale_orders (PBH mới) với:
//       source_code = "NW-A+NW-B" (join '+')
//       merged_display_stt = [stt_a, stt_b] (lưu để client hiển thị "1 + 2")
//       source_type = 'native_order'
//       state = 'draft'
//   - KHÔNG xóa native-orders gốc — chỉ tạo PBH mới (user có thể delete đơn web sau)
//   - Notify SSE web2:native-orders + web2:fast-sale-orders + cross-bc web2:customer-wallet
// -----------------------------------------------------
router.post('/merge-to-pbh', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = Array.isArray(req.body?.codes) ? req.body.codes : null;
    if (!codes || codes.length < 2) {
        return res.status(400).json({ error: 'Cần ít nhất 2 đơn để gộp' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');

        // Fetch all native orders
        const placeholders = codes.map((_, i) => `$${i + 1}`).join(',');
        const src = await client.query(
            `SELECT * FROM native_orders WHERE code IN (${placeholders})`,
            codes
        );
        if (src.rows.length !== codes.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: `Tìm thấy ${src.rows.length}/${codes.length} đơn — có đơn không tồn tại`,
            });
        }

        // Validate cùng phone
        const phones = new Set(src.rows.map((r) => (r.phone || '').trim()));
        if (phones.size > 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Phải cùng SĐT. Đang có ${phones.size} SĐT: ${Array.from(phones).join(', ')}`,
            });
        }

        // Combine: sort theo display_stt asc để STT hiển thị đúng thứ tự
        const sorted = src.rows.sort(
            (a, b) => (Number(a.display_stt) || 0) - (Number(b.display_stt) || 0)
        );
        const base = sorted[0];
        const combinedLines = [];
        let totalQty = 0;
        let totalAmount = 0;
        for (const r of sorted) {
            const products = Array.isArray(r.products) ? r.products : [];
            for (const p of products) {
                const q = Number(p.quantity) || 0;
                const price = Number(p.price) || 0;
                combinedLines.push({
                    productName: p.name || p.productName || '',
                    quantity: q,
                    priceUnit: price,
                    uomName: p.uomName || 'Cái',
                    note: p.note || '',
                });
                totalQty += q;
                totalAmount += q * price;
            }
        }
        const mergedStts = sorted.map((r) => Number(r.display_stt) || 0).filter(Boolean);
        const mergedSourceCode = sorted.map((r) => r.code).join('+');
        const combinedComment = sorted
            .map((r) => (r.note ? `[${r.code}] ${r.note}` : null))
            .filter(Boolean)
            .join('\n---\n');

        // Generate new HD number
        const today = new Date();
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const ymd = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
        const todayCountQ = await client.query(
            `SELECT COUNT(*)::int AS n FROM fast_sale_orders WHERE number LIKE $1`,
            [`HD-${ymd}-%`]
        );
        const nextSeq = pad(todayCountQ.rows[0].n + 1, 4);
        const newNumber = `HD-${ymd}-${nextSeq}`;

        // INSERT new PBH (fast_sale_orders)
        const ins = await client.query(
            `INSERT INTO fast_sale_orders (
                number, display_stt, source,
                partner_name, partner_phone, partner_address,
                order_lines, total_quantity, amount_untaxed, amount_total,
                state, source_type, source_code, merged_display_stt,
                customer_id, comment, date_invoice
            ) VALUES (
                $1, nextval('fast_sale_orders_display_stt_seq'), 'NATIVE_WEB',
                $2, $3, $4,
                $5, $6, $7, $7,
                'draft', 'native_order', $8, $9,
                $10, $11, NOW()
            ) RETURNING *`,
            [
                newNumber,
                base.customer_name || '',
                base.phone || '',
                base.address || '',
                JSON.stringify(combinedLines),
                totalQty,
                totalAmount,
                mergedSourceCode,
                JSON.stringify(mergedStts),
                base.customer_id || null,
                combinedComment,
            ]
        );

        await client.query('COMMIT');
        const newOrder = ins.rows[0];

        // Notify cả 2 topics
        _notify('merge-to-pbh', null);
        // Direct broadcast fast-sale-orders topic (route khác, không gọi _notify của route đó được)
        const realtimeSse = req.app.locals.realtimeSseNotify;
        if (typeof realtimeSse === 'function') {
            realtimeSse(
                'web2:fast-sale-orders',
                { action: 'merge-to-pbh', number: newNumber, ts: Date.now() },
                'update'
            );
            realtimeSse(
                'web2:customer-wallet',
                {
                    action: 'merge-to-pbh',
                    number: newNumber,
                    ts: Date.now(),
                    from: 'web2:native-orders',
                },
                'update'
            );
        }

        res.json({
            success: true,
            mergedFrom: codes,
            mergedStts,
            order: {
                id: Number(newOrder.id),
                number: newOrder.number,
                displayStt: newOrder.display_stt,
                mergedDisplayStt: newOrder.merged_display_stt,
                sourceCode: newOrder.source_code,
                totalQuantity: Number(newOrder.total_quantity),
                amountTotal: Number(newOrder.amount_total),
            },
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[NATIVE-ORDERS] merge-to-pbh error:', e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
