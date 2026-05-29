// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 PRODUCTS REST API
// Kho sản phẩm riêng cho native_orders flow, tách biệt hoàn toàn với
// TPOS Product + Excel cache của orders-report.
// =====================================================

const express = require('express');
const router = express.Router();

// -----------------------------------------------------
// SSE notifier — injected from server.js via initializeNotifiers().
// Sau mỗi DB mutation success, gọi _notify('web2:products', { action, code })
// để broadcast cho tất cả client đang subscribe SSE topic 'web2:products'.
// Replaces Firestore tickle pattern (every mutation no longer needs FS write).
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
// Insert 1 row vào web2_product_history. Best-effort — không chặn flow chính.
//   action: 'create' | 'update' | 'delete' | 'stock-adjust' | 'toggle-active' | ...
//   changes: với 'create' = full snapshot; với 'update' = {field: {before, after}}; với 'delete' = full prev snapshot
//   user: {id, name} từ req.body / req.headers
//   sourcePage: req.body.sourcePage || req.headers['x-source-page'] (vd 'products', 'so-order', 'inventory-tracking')
async function _logHistory(pool, productCode, action, changes, user, sourcePage) {
    if (!pool || !productCode) return;
    try {
        await pool.query(
            `INSERT INTO web2_product_history (product_code, action, changes, user_id, user_name, source_page, created_at)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
            [
                productCode,
                action,
                JSON.stringify(changes || {}),
                user?.id || null,
                user?.name || null,
                sourcePage || null,
                Date.now(),
            ]
        );
    } catch (e) {
        console.warn('[WEB2-PRODUCTS] _logHistory failed:', e.message);
    }
}

// Diff helper: trả {field: {before, after}} cho mỗi field khác nhau.
// Bỏ qua field 'updated_at' (luôn thay đổi) và 'created_at' (không bao giờ đổi).
const HIST_IGNORE_FIELDS = new Set(['updated_at', 'created_at', 'id']);
function _diff(prev, next) {
    const out = {};
    const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
    for (const k of keys) {
        if (HIST_IGNORE_FIELDS.has(k)) continue;
        const a = prev?.[k];
        const b = next?.[k];
        // JSON-compare để xử lý JSONB array/object
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            out[k] = { before: a, after: b };
        }
    }
    return out;
}

// Extract user info từ request — accept body/header. Fallback null.
function _extractUser(req) {
    const b = req.body || {};
    return {
        id: b.userId || b.createdBy || req.headers['x-user-id'] || null,
        name: b.userName || b.createdByName || req.headers['x-user-name'] || null,
    };
}
function _extractSourcePage(req) {
    return req.body?.sourcePage || req.headers['x-source-page'] || null;
}

function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:products', { action, code: code || null, ts: Date.now() }, 'update');
        // PHASE B1: cross-broadcast cho supplier-wallet (Ví NCC) khi stock change.
        // Lý do: supplier debt = Σ(qty × costPrice). Stock change qua adjust-stock /
        // upsert-pending / confirm-purchase ảnh hưởng debt → page Ví NCC tự refresh.
        const stockAffectingActions = new Set([
            'adjust-stock',
            'upsert-pending',
            'confirm-purchase',
            'confirm-purchase-partial',
            'adjust-pending',
        ]);
        if (stockAffectingActions.has(action)) {
            _notifyClients(
                'web2:supplier-wallet',
                { action, code: code || null, ts: Date.now(), from: 'web2:products' },
                'update'
            );
        }
    } catch (e) {
        console.warn('[WEB2-PRODUCTS] _notify failed:', e.message);
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
            CREATE TABLE IF NOT EXISTS web2_products (
                id          BIGSERIAL PRIMARY KEY,
                code        VARCHAR(40)  UNIQUE NOT NULL,
                name        VARCHAR(255) NOT NULL,
                price       NUMERIC(14,2) NOT NULL DEFAULT 0,
                image_url   TEXT,
                stock       INTEGER NOT NULL DEFAULT 0,
                note        TEXT,
                tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
                is_active   BOOLEAN NOT NULL DEFAULT true,
                created_by  VARCHAR(100),
                created_at  BIGINT NOT NULL,
                updated_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_web2_products_code    ON web2_products(code);
            CREATE INDEX IF NOT EXISTS idx_web2_products_name    ON web2_products(name);
            CREATE INDEX IF NOT EXISTS idx_web2_products_active  ON web2_products(is_active);
            CREATE INDEX IF NOT EXISTS idx_web2_products_created ON web2_products(created_at DESC);

            -- Migration 067: extend with original_price, barcode, category
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS original_price NUMERIC(14,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS barcode        VARCHAR(60),
                ADD COLUMN IF NOT EXISTS category       VARCHAR(80);

            CREATE INDEX IF NOT EXISTS idx_web2_products_barcode  ON web2_products(barcode);
            CREATE INDEX IF NOT EXISTS idx_web2_products_category ON web2_products(category);

            -- Migration 068: dedicated variant column (size/color/spec). Trước đó
            -- variant đi ké vào note ở so-order; tách riêng để Kho SP hiển thị
            -- cột BIẾN THỂ độc lập với ghi chú.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS variant TEXT;

            -- Migration 069: status (CHO_MUA | DANG_BAN) + pending_qty.
            -- so-order Lưu Nháp → tạo SP với status='CHO_MUA' và pending_qty=qty.
            -- Khi nhấn "Mua hàng" cho NCC → status='DANG_BAN', stock += pending_qty,
            -- pending_qty = 0.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS status       VARCHAR(20) DEFAULT 'DANG_BAN',
                ADD COLUMN IF NOT EXISTS pending_qty  INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS supplier     VARCHAR(255);

            CREATE INDEX IF NOT EXISTS idx_web2_products_status   ON web2_products(status);
            CREATE INDEX IF NOT EXISTS idx_web2_products_supplier ON web2_products(supplier);

            -- Migration 079: lịch sử chỉnh sửa SP (audit log).
            -- Mỗi mutation create/update/delete/stock-adjust ghi 1 row với
            -- before+after JSONB + user info + source page. Dùng cho modal
            -- "Lịch sử" trong web2/products edit.
            CREATE TABLE IF NOT EXISTS web2_product_history (
                id          BIGSERIAL PRIMARY KEY,
                product_code VARCHAR(40) NOT NULL,
                action      VARCHAR(30) NOT NULL,     -- create|update|delete|stock-adjust|toggle-active|confirm-purchase|upsert-pending
                changes     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {field: {before, after}} cho update; full snapshot cho create
                user_id     VARCHAR(100),
                user_name   VARCHAR(255),
                source_page VARCHAR(60),              -- 'products' | 'so-order' | 'inventory-tracking' | 'native-orders' | ...
                created_at  BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_w2ph_code    ON web2_product_history(product_code, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_w2ph_created ON web2_product_history(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_w2ph_user    ON web2_product_history(user_id);
        `);

        // Migration 078: backfill snapshot fields (imageUrl + name + price) cho
        // các đơn đã chọn SP. Trước commit 8d89d1c0 (2026-05-21 02:26 UTC), PATCH
        // web2_products chỉ ghi 1 row, không cascade → snapshot trong native_orders.
        // products[] và fast_sale_orders.order_lines[] vẫn giữ giá trị cũ.
        // Migration scan từng SP và sync xuống tất cả đơn matching.
        // Self-gated qua `native_orders_migrations` (tạo nếu chưa có — share table
        // với native-orders module để 1 nguồn sự thật cho mọi migration web2.0).
        await pool.query(`
            CREATE TABLE IF NOT EXISTS native_orders_migrations (
                name   VARCHAR(120) PRIMARY KEY,
                run_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            DO $$
            DECLARE p RECORD;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM native_orders_migrations
                    WHERE name = '078_backfill_product_snapshots'
                ) THEN
                    -- Chỉ chạy khi 2 bảng đích tồn tại (chống lỗi khi web2-products
                    -- ensureTables chạy trước native-orders / fast-sale-orders).
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'native_orders')
                       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fast_sale_orders')
                    THEN
                        FOR p IN SELECT code, name, price, image_url FROM web2_products LOOP
                            UPDATE native_orders
                            SET products = (
                                    SELECT jsonb_agg(
                                        CASE WHEN elem->>'productCode' = p.code
                                            THEN elem || jsonb_build_object(
                                                'name', to_jsonb(p.name),
                                                'price', to_jsonb(p.price),
                                                'imageUrl', to_jsonb(COALESCE(p.image_url, ''))
                                            )
                                            ELSE elem
                                        END
                                    ) FROM jsonb_array_elements(products) elem
                                ),
                                updated_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
                            WHERE products @> jsonb_build_array(jsonb_build_object('productCode', p.code::text));

                            UPDATE fast_sale_orders
                            SET order_lines = (
                                    SELECT jsonb_agg(
                                        CASE WHEN elem->>'productCode' = p.code
                                            THEN elem || jsonb_build_object(
                                                'productName', to_jsonb(p.name),
                                                'priceUnit', to_jsonb(p.price),
                                                'imageUrl', to_jsonb(COALESCE(p.image_url, ''))
                                            )
                                            ELSE elem
                                        END
                                    ) FROM jsonb_array_elements(order_lines) elem
                                ),
                                updated_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
                            WHERE order_lines @> jsonb_build_array(jsonb_build_object('productCode', p.code::text));
                        END LOOP;
                        INSERT INTO native_orders_migrations(name) VALUES ('078_backfill_product_snapshots');
                        RAISE NOTICE 'Migration 078: backfilled product snapshots';
                    END IF;
                END IF;
            END $$;
        `);

        _tablesCreated = true;
        console.log('[WEB2-PRODUCTS] Tables created/verified (+ migration 078)');
    } catch (error) {
        console.error('[WEB2-PRODUCTS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function mapRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        code: row.code,
        name: row.name,
        price: Number(row.price || 0),
        imageUrl: row.image_url,
        stock: row.stock,
        note: row.note,
        tags: row.tags || [],
        isActive: !!row.is_active,
        createdBy: row.created_by,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        // Migration 067
        originalPrice: Number(row.original_price || 0),
        barcode: row.barcode,
        category: row.category,
        // Migration 068
        variant: row.variant || null,
        // Migration 069: purchase pipeline status
        status: row.status || 'DANG_BAN',
        pendingQty: Number(row.pending_qty) || 0,
        supplier: row.supplier || null,
    };
}

// -----------------------------------------------------
// GET /api/web2/products/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ ok: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT COUNT(*)::int AS n FROM web2_products');
        res.json({ ok: true, count: r.rows[0].n });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/products/list?search&activeOnly&page&limit
// Cho cả UI quản lý kho + UI picker khi tạo đơn
// -----------------------------------------------------
router.get('/list', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const { search, activeOnly, page = 1, limit = 200 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') {
            conds.push('is_active = true');
        }
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(`(code ILIKE $${i} OR name ILIKE $${i})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const countR = await pool.query(
            `SELECT COUNT(*)::int AS n FROM web2_products ${where}`,
            params
        );
        const total = countR.rows[0].n;

        const listParams = [...params, limitNum, offset];
        const listR = await pool.query(
            `SELECT * FROM web2_products ${where}
             ORDER BY is_active DESC, updated_at DESC
             LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
            listParams
        );

        res.json({
            success: true,
            products: listR.rows.map(mapRow),
            total,
            page: pageNum,
            limit: limitNum,
            hasMore: offset + listR.rows.length < total,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-products/pending?supplier=X
// List CHỜ MUA items, optional filter by supplier.
// NOTE: phải đặt trước /:code để không bị Express route catch /pending → code='pending'.
// =====================================================
router.get('/pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const supplier = req.query.supplier ? String(req.query.supplier).trim() : null;
        let sql = `SELECT * FROM web2_products WHERE status = 'CHO_MUA' AND pending_qty > 0`;
        const params = [];
        if (supplier) {
            params.push(supplier);
            sql += ` AND supplier = $${params.length}`;
        }
        sql += ` ORDER BY supplier, name`;
        const r = await pool.query(sql, params);
        res.json({ success: true, items: r.rows.map(mapRow) });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] pending list error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-products/usage?codes=A,B,C
// Returns map: productCode → array of native-orders that currently contain
// that product (excluding cancelled). Each entry includes order code,
// display STT, customer name, status, campaign info, qty, addedAt.
//
// Used by web2/products page to show "Đang dùng ở N đơn" badge per product
// and a popover listing every (campaign, STT, customer) using it. Click an
// order → jump to native-orders với filter ?search=<code>.
//
// NOTE: phải đặt TRƯỚC /:code để không bị Express route catch /usage → code='usage'.
// =====================================================
router.get('/usage', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        const codesRaw = String(req.query.codes || '').trim();
        if (!codesRaw) return res.json({ success: true, usage: {} });
        const codes = codesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!codes.length) return res.json({ success: true, usage: {} });

        // Đơn cancelled bỏ qua — user không cần biết. STT lớn nhất trước (mới).
        // COALESCE 'productCode' vs 'code' vì products[] có 2 shape khác nhau:
        //   - cart (v2/cart.js refactor): {code, name, quantity, qty, price, ...}
        //   - native-orders modal saveEdit: {productCode, name, quantity, price, ...}
        // Read cả 2 + đọc cả `quantity` lẫn `qty` cho qty (cùng lý do back-compat).
        const sql = `
            SELECT
                n.code           AS order_code,
                n.display_stt    AS display_stt,
                n.merged_display_stt AS merged_display_stt,
                n.customer_name  AS customer_name,
                n.phone          AS phone,
                n.status         AS order_status,
                n.live_campaign_id AS campaign_id,
                n.live_campaign_name AS campaign_name,
                n.fb_post_id     AS fb_post_id,
                n.created_at     AS created_at,
                COALESCE(prod->>'productCode', prod->>'code') AS product_code,
                COALESCE((prod->>'quantity')::int, (prod->>'qty')::int, 1) AS qty,
                COALESCE((prod->>'price')::bigint, 0) AS unit_price,
                (prod->>'addedAt')::bigint AS added_at
            FROM native_orders n,
                 jsonb_array_elements(n.products) prod
            WHERE COALESCE(prod->>'productCode', prod->>'code') = ANY($1::text[])
              AND n.status != 'cancelled'
            ORDER BY n.display_stt DESC NULLS LAST, prod->>'addedAt' DESC NULLS LAST
        `;
        const r = await pool.query(sql, [codes]);

        const usage = {};
        for (const row of r.rows) {
            const pc = row.product_code;
            if (!pc) continue;
            if (!usage[pc]) usage[pc] = [];
            usage[pc].push({
                orderCode: row.order_code,
                displayStt: row.display_stt,
                mergedDisplayStt: row.merged_display_stt,
                customerName: row.customer_name,
                phone: row.phone,
                status: row.order_status,
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                fbPostId: row.fb_post_id,
                qty: row.qty,
                unitPrice: Number(row.unit_price) || 0,
                addedAt: row.added_at,
                createdAt: row.created_at,
            });
        }

        res.json({ success: true, usage });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] usage error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// GET /api/web2-products/:code/history?limit=50
// Lịch sử chỉnh sửa SP: ai, khi nào, đổi field gì (before/after).
// Mới nhất trước.
// NOTE: phải đặt TRƯỚC route /:code để không match nhầm.
// =====================================================
router.get('/:code/history', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const code = req.params.code;
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const r = await pool.query(
            `SELECT id, product_code, action, changes, user_id, user_name, source_page, created_at
             FROM web2_product_history
             WHERE product_code = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [code, limit]
        );
        res.json({
            success: true,
            history: r.rows.map((row) => ({
                id: row.id,
                code: row.product_code,
                action: row.action,
                changes: row.changes,
                userId: row.user_id,
                userName: row.user_name,
                sourcePage: row.source_page,
                createdAt: Number(row.created_at),
            })),
            total: r.rows.length,
        });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] history error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/products/:code
// -----------------------------------------------------
router.get('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(`SELECT * FROM web2_products WHERE code = $1 LIMIT 1`, [
            req.params.code,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, product: mapRow(r.rows[0]) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /api/web2-products — create
// Body: { code, name, price?, imageUrl?, stock?, note?, tags?, createdBy? }
// -----------------------------------------------------
router.post('/', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.code || !b.name) {
            return res.status(400).json({ error: 'code + name required' });
        }
        // Web 2.0 rule (2026-05-22): SP mới BẮT BUỘC có supplier để filter tab NCC
        // hoạt động đúng ở tpos-pancake inventory panel.
        if (!b.supplier || !String(b.supplier).trim()) {
            return res.status(400).json({
                error: 'supplier (NCC) bắt buộc — chọn từ tab Sổ Order trước khi tạo SP',
            });
        }
        const now = Date.now();
        try {
            const r = await pool.query(
                `INSERT INTO web2_products
                 (code, name, price, image_url, stock, note, tags, is_active,
                  original_price, barcode, category, variant, supplier,
                  created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true,
                         $8, $9, $10, $11, $12,
                         $13, $14, $14)
                 RETURNING *`,
                [
                    b.code.trim(),
                    b.name.trim(),
                    Number(b.price) || 0,
                    b.imageUrl || null,
                    Number.isFinite(Number(b.stock)) ? Number(b.stock) : 0,
                    b.note || null,
                    JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
                    Number(b.originalPrice) || 0,
                    b.barcode ? b.barcode.trim() : null,
                    b.category ? b.category.trim() : null,
                    b.variant ? String(b.variant).trim() : null,
                    b.supplier ? String(b.supplier).trim() : null,
                    b.createdBy || null,
                    now,
                ]
            );
            _notify('create', r.rows[0].code);
            await _logHistory(
                pool,
                r.rows[0].code,
                'create',
                { snapshot: mapRow(r.rows[0]) },
                _extractUser(req),
                _extractSourcePage(req) || 'products'
            );
            res.json({ success: true, product: mapRow(r.rows[0]) });
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: `Mã SP "${b.code}" đã tồn tại` });
            }
            throw err;
        }
    } catch (e) {
        console.error('[WEB2-PRODUCTS] POST / error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /api/web2/products/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const allowed = {
            name: 'name',
            price: 'price',
            imageUrl: 'image_url',
            stock: 'stock',
            note: 'note',
            tags: 'tags',
            isActive: 'is_active',
            // Migration 067
            originalPrice: 'original_price',
            barcode: 'barcode',
            category: 'category',
            // Migration 068
            variant: 'variant',
            supplier: 'supplier',
        };
        const sets = [];
        const params = [];
        for (const [k, col] of Object.entries(allowed)) {
            if (req.body[k] === undefined) continue;
            params.push(k === 'tags' ? JSON.stringify(req.body[k]) : req.body[k]);
            sets.push(`${col} = $${params.length}`);
        }
        if (!sets.length) return res.status(400).json({ error: 'No update fields' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(req.params.code);

        // Fetch previous row for history diff + stock-vs-pending guard.
        const prevQ = await pool.query(`SELECT * FROM web2_products WHERE code = $1`, [
            req.params.code,
        ]);
        const prevMapped = prevQ.rows[0] ? mapRow(prevQ.rows[0]) : null;

        // Guard: nếu user PATCH stock và stock mới < pending_qty hiện tại
        // (SP còn N cái CHỜ MUA chưa nhận) → 409 với message rõ. User phải
        // confirm-purchase pending về stock TRƯỚC khi giảm stock dưới mức đó.
        // Lý do: pending = số đã ORDER từ NCC, là cam kết phải nhận. Nếu giảm
        // stock dưới pending, sau khi nhận hàng tổng sẽ overflow → inconsistent.
        if (req.body.stock !== undefined && prevMapped) {
            const newStock = Number(req.body.stock);
            const curPending = Number(prevMapped.pendingQty) || 0;
            if (Number.isFinite(newStock) && newStock < curPending && !req.query.force) {
                return res.status(409).json({
                    error: 'stock_less_than_pending',
                    code: req.params.code,
                    name: prevMapped.name,
                    currentStock: prevMapped.quantity,
                    newStock,
                    pendingQty: curPending,
                    supplier: prevMapped.supplier,
                    message: `Không thể giảm tồn kho xuống ${newStock} vì còn ${curPending} cái CHỜ MUA từ ${prevMapped.supplier || 'NCC'}. Confirm-purchase trước hoặc force=1 để bỏ qua.`,
                });
            }
        }

        const r = await pool.query(
            `UPDATE web2_products SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });

        // Log diff vào history (chỉ field actually changed).
        const newMapped = mapRow(r.rows[0]);
        const changes = prevMapped ? _diff(prevMapped, newMapped) : { snapshot: newMapped };
        if (Object.keys(changes).length > 0) {
            await _logHistory(
                pool,
                r.rows[0].code,
                'update',
                changes,
                _extractUser(req),
                _extractSourcePage(req) || 'products'
            );
        }

        // Cascade snapshot fields (imageUrl + name + price) sang các đơn đã chọn
        // sản phẩm này. native_orders.products[] và fast_sale_orders.order_lines[]
        // đều JSONB array có productCode → cập nhật cùng key. Cascade chỉ khi user
        // explicitly set field (req.body có), tránh ghi đè khi PATCH chỉ chỉnh stock.
        const cascadeMap = {
            imageUrl: 'imageUrl',
            name: 'productName', // fast_sale_orders dùng productName key
            price: 'priceUnit', // fast_sale_orders dùng priceUnit; native dùng price
        };
        const cascadeFields = Object.keys(cascadeMap).filter((k) => req.body[k] !== undefined);
        const cascadeCounts = {
            nativeOrders: 0,
            fastSaleOrders: 0,
        };
        if (cascadeFields.length > 0) {
            const newProd = r.rows[0];
            const code = newProd.code;
            const now = Date.now();

            // Build SET expressions for native_orders.products (key shape: productCode)
            // products[*] có: productCode, name, price, imageUrl
            try {
                const setNative = [];
                if (req.body.imageUrl !== undefined) {
                    setNative.push(`'imageUrl', to_jsonb(${pgString(newProd.image_url)}::text)`);
                }
                if (req.body.name !== undefined) {
                    setNative.push(`'name', to_jsonb(${pgString(newProd.name)}::text)`);
                }
                if (req.body.price !== undefined) {
                    setNative.push(`'price', to_jsonb(${Number(newProd.price) || 0}::numeric)`);
                }
                if (setNative.length > 0) {
                    const updNative = await pool.query(
                        `UPDATE native_orders
                         SET products = (
                                SELECT jsonb_agg(
                                    CASE
                                        WHEN elem->>'productCode' = $1
                                            THEN elem || jsonb_build_object(${setNative.join(', ')})
                                        ELSE elem
                                    END
                                )
                                FROM jsonb_array_elements(products) elem
                            ),
                            updated_at = $2
                         WHERE products @> jsonb_build_array(jsonb_build_object('productCode', $1::text))
                         RETURNING code`,
                        [code, now]
                    );
                    cascadeCounts.nativeOrders = updNative.rowCount;
                    if (updNative.rowCount > 0 && _notifyClients) {
                        try {
                            _notifyClients(
                                'web2:native-orders',
                                {
                                    action: 'product-snapshot-sync',
                                    productCode: code,
                                    affected: updNative.rowCount,
                                    ts: now,
                                },
                                'update'
                            );
                        } catch {}
                    }
                }
            } catch (cascadeErr) {
                console.warn('[WEB2-PRODUCTS] cascade native_orders failed:', cascadeErr.message);
            }

            // Cascade tới fast_sale_orders.order_lines (key: productCode, productName, priceUnit)
            try {
                const setPbh = [];
                if (req.body.imageUrl !== undefined) {
                    setPbh.push(`'imageUrl', to_jsonb(${pgString(newProd.image_url)}::text)`);
                }
                if (req.body.name !== undefined) {
                    setPbh.push(`'productName', to_jsonb(${pgString(newProd.name)}::text)`);
                }
                if (req.body.price !== undefined) {
                    setPbh.push(`'priceUnit', to_jsonb(${Number(newProd.price) || 0}::numeric)`);
                }
                if (setPbh.length > 0) {
                    const updPbh = await pool.query(
                        `UPDATE fast_sale_orders
                         SET order_lines = (
                                SELECT jsonb_agg(
                                    CASE
                                        WHEN elem->>'productCode' = $1
                                            THEN elem || jsonb_build_object(${setPbh.join(', ')})
                                        ELSE elem
                                    END
                                )
                                FROM jsonb_array_elements(order_lines) elem
                            ),
                            updated_at = $2
                         WHERE order_lines @> jsonb_build_array(jsonb_build_object('productCode', $1::text))
                         RETURNING number`,
                        [code, now]
                    );
                    cascadeCounts.fastSaleOrders = updPbh.rowCount;
                    if (updPbh.rowCount > 0 && _notifyClients) {
                        try {
                            _notifyClients(
                                'web2:fast-sale-orders',
                                {
                                    action: 'product-snapshot-sync',
                                    productCode: code,
                                    affected: updPbh.rowCount,
                                    ts: now,
                                },
                                'update'
                            );
                        } catch {}
                    }
                }
            } catch (cascadeErr) {
                console.warn(
                    '[WEB2-PRODUCTS] cascade fast_sale_orders failed:',
                    cascadeErr.message
                );
            }
        }

        _notify('update', r.rows[0].code);
        res.json({
            success: true,
            product: mapRow(r.rows[0]),
            cascade: cascadeFields.length > 0 ? cascadeCounts : undefined,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// SQL-safe string literal builder cho cascade jsonb_build_object — chỉ dùng cho
// giá trị đã trust (lấy từ DB row sau UPDATE thành công). Vì jsonb_build_object
// args là expressions không phải $-params, ta phải embed inline. Escape ' bằng
// '' và quote literal.
function pgString(s) {
    if (s == null) return 'NULL';
    return "'" + String(s).replace(/'/g, "''") + "'";
}

// -----------------------------------------------------
// POST /api/web2/products/adjust-stock
// Body: { adjustments: [{ code, delta, reason }] }
//   - delta > 0: nhập kho (mua từ NCC, KH trả về)
//   - delta < 0: xuất kho (bán PBH, trả NCC)
// Atomic in a single transaction. Returns updated stocks.
// Stock không bao giờ âm — clamp về 0 nếu tổng < 0 (warn).
// -----------------------------------------------------
router.post('/adjust-stock', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const results = [];
        const warnings = [];
        for (const adj of adjustments) {
            const code = String(adj.code || '').trim();
            const delta = Number(adj.delta) || 0;
            if (!code || !Number.isFinite(delta) || delta === 0) continue;
            // GREATEST clamps negative result to 0
            const r = await client.query(
                `UPDATE web2_products
                 SET stock = GREATEST(0, stock + $1), updated_at = $2
                 WHERE code = $3
                 RETURNING code, stock`,
                [delta, Date.now(), code]
            );
            if (!r.rows.length) {
                warnings.push(`Code "${code}" not found, skipped`);
                continue;
            }
            results.push({ code: r.rows[0].code, stock: r.rows[0].stock, delta });
        }
        await client.query('COMMIT');
        if (results.length) _notify('adjust-stock', null);
        res.json({ success: true, results, warnings });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// DELETE /api/web2/products/:code
// Query: ?force=1 để bỏ qua check pending_qty > 0.
// Trả 409 nếu pending_qty > 0 và không force (để caller cảnh báo user).
// -----------------------------------------------------
router.delete('/:code', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const force = req.query.force === '1' || req.query.force === 'true';
        const r0 = await pool.query(
            `SELECT code, name, pending_qty, supplier, stock FROM web2_products WHERE code = $1`,
            [req.params.code]
        );
        if (!r0.rows.length) return res.status(404).json({ error: 'Not found' });
        const cur = r0.rows[0];
        const curPending = Number(cur.pending_qty) || 0;
        if (curPending > 0 && !force) {
            return res.status(409).json({
                error: 'pending_qty_not_zero',
                code: cur.code,
                name: cur.name,
                pendingQty: curPending,
                stock: Number(cur.stock) || 0,
                supplier: cur.supplier,
                message: `SP còn ${curPending} cái chờ mua${cur.supplier ? ' từ ' + cur.supplier : ''}. Xóa sẽ mất số liệu này.`,
            });
        }
        await pool.query(`DELETE FROM web2_products WHERE code = $1`, [req.params.code]);
        _notify('delete', cur.code);
        await _logHistory(
            pool,
            cur.code,
            'delete',
            { snapshot: mapRow(cur) },
            _extractUser(req),
            _extractSourcePage(req) || 'products'
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-products/adjust-pending
// Body: { adjustments: [{ code?, name?, variant?, supplier?, delta }] }
//   - Match SP theo code (ưu tiên) hoặc name+variant.
//   - pending_qty = GREATEST(0, pending_qty + delta).
//   - delta < 0: giảm pending (user xóa/giảm qty row so-order).
//   - delta > 0: tăng pending (user tăng qty).
// Side effects:
//   - Nếu pending=0 AND stock=0 AND created_by='so-order' → DELETE SP (ghost cleanup).
//   - Nếu pending=0 AND stock>0 AND status='CHO_MUA' → SET status='DANG_BAN'.
// Atomic trong 1 transaction. Returns updated info per adjustment.
// =====================================================
router.post('/adjust-pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const results = [];
        const warnings = [];
        for (const adj of adjustments) {
            const code = adj.code ? String(adj.code).trim() : null;
            const name = adj.name ? String(adj.name).trim() : null;
            const variant = adj.variant ? String(adj.variant).trim() : null;
            const delta = Number(adj.delta) || 0;
            if ((!code && !name) || !Number.isFinite(delta) || delta === 0) continue;

            let r;
            if (code) {
                r = await client.query(`SELECT * FROM web2_products WHERE code = $1 LIMIT 1`, [
                    code,
                ]);
            } else if (variant) {
                r = await client.query(
                    `SELECT * FROM web2_products
                     WHERE LOWER(name) = LOWER($1)
                       AND LOWER(COALESCE(variant, '')) = LOWER($2)
                     ORDER BY id LIMIT 1`,
                    [name, variant]
                );
            } else {
                r = await client.query(
                    `SELECT * FROM web2_products
                     WHERE LOWER(name) = LOWER($1)
                       AND (variant IS NULL OR variant = '')
                     ORDER BY id LIMIT 1`,
                    [name]
                );
            }
            if (!r.rows.length) {
                warnings.push(
                    `Không tìm thấy SP "${name || code}"${variant ? ' / ' + variant : ''}`
                );
                continue;
            }
            const row = r.rows[0];
            const curPending = Number(row.pending_qty) || 0;
            const curStock = Number(row.stock) || 0;
            const newPending = Math.max(0, curPending + delta);
            const now = Date.now();

            // Ghost cleanup: pending=0 + stock=0 + tạo từ so-order → DELETE.
            if (newPending === 0 && curStock === 0 && row.created_by === 'so-order') {
                await client.query(`DELETE FROM web2_products WHERE id = $1`, [row.id]);
                results.push({
                    code: row.code,
                    name: row.name,
                    action: 'deleted',
                    newPendingQty: 0,
                });
                continue;
            }
            // Pending về 0 mà còn stock → status DANG_BAN.
            const newStatus =
                newPending === 0 && curStock > 0 && row.status === 'CHO_MUA'
                    ? 'DANG_BAN'
                    : row.status;

            const u = await client.query(
                `UPDATE web2_products
                    SET pending_qty = $1, status = $2, updated_at = $3
                  WHERE id = $4
                  RETURNING code, name, pending_qty, status, stock`,
                [newPending, newStatus, now, row.id]
            );
            const ur = u.rows[0];
            results.push({
                code: ur.code,
                name: ur.name,
                action: 'updated',
                newPendingQty: Number(ur.pending_qty) || 0,
                status: ur.status,
                stock: Number(ur.stock) || 0,
            });
        }
        await client.query('COMMIT');
        if (results.length) _notify('adjust-pending', null);
        res.json({ success: true, results, warnings });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCTS] adjust-pending error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// POST /api/web2-products/upsert-pending
// Body: { items: [{name, variant, qty, costPrice, sellPrice, supplier, imageUrl, note}] }
//
// Logic per item (so-order Lưu Nháp flow):
//   1. Tìm SP theo (name) — variant matching optional.
//   2. KHÔNG tìm thấy → INSERT mới
//        status='CHO_MUA', stock=0, pending_qty=qty, supplier=<supplier>
//   3. Tìm thấy:
//        - stock = 0 → SET status='CHO_MUA', pending_qty += qty
//        - stock > 0 → KEEP status, pending_qty += qty (giữ "đang bán" + có thêm "chờ mua")
//        - Update supplier nếu chưa có
// Returns: { success, created, updated, items: [{code, name, action, status, pendingQty, stock}] }
// =====================================================
router.post('/upsert-pending', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
        if (!items.length) return res.json({ success: true, created: 0, updated: 0, items: [] });
        const now = Date.now();
        let created = 0,
            updated = 0;
        const results = [];
        for (const it of items) {
            const name = String(it.name || '').trim();
            const variant = it.variant ? String(it.variant).trim() : null;
            const qty = Math.max(0, Number(it.qty) || 0);
            const supplier = it.supplier ? String(it.supplier).trim() : null;
            if (!name || qty <= 0) continue;
            // Match: name + variant (variant nullable, NULL match NULL)
            const findSql = variant
                ? `SELECT * FROM web2_products WHERE LOWER(name) = LOWER($1) AND (variant IS NULL OR LOWER(variant) = LOWER($2)) ORDER BY id LIMIT 1`
                : `SELECT * FROM web2_products WHERE LOWER(name) = LOWER($1) ORDER BY id LIMIT 1`;
            const findParams = variant ? [name, variant] : [name];
            const existing = await pool.query(findSql, findParams);

            if (!existing.rows.length) {
                // INSERT new product with CHO_MUA status
                const code =
                    it.code ||
                    'KHO-' +
                        Math.random().toString(36).slice(2, 6).toUpperCase() +
                        '-' +
                        Date.now().toString(36).toUpperCase();
                try {
                    const r = await pool.query(
                        `INSERT INTO web2_products
                            (code, name, price, image_url, stock, note, tags, is_active,
                             original_price, barcode, category, variant,
                             status, pending_qty, supplier,
                             created_by, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, 0, $5, '[]'::jsonb, TRUE,
                                 $6, NULL, NULL, $7,
                                 'CHO_MUA', $8, $9,
                                 'so-order', $10, $10)
                         RETURNING *`,
                        [
                            code,
                            name,
                            Number(it.sellPrice) || 0,
                            it.imageUrl || null,
                            it.note || null,
                            Number(it.costPrice) || 0,
                            variant,
                            qty,
                            supplier,
                            now,
                        ]
                    );
                    const row = r.rows[0];
                    created++;
                    results.push({
                        code: row.code,
                        name: row.name,
                        action: 'created',
                        status: row.status,
                        pendingQty: row.pending_qty,
                        stock: row.stock,
                    });
                } catch (err) {
                    if (err.code === '23505') {
                        // Code collision (rare) — retry with new code
                        results.push({ name, action: 'error', error: 'Code collision' });
                    } else {
                        throw err;
                    }
                }
            } else {
                const row = existing.rows[0];
                const curStock = Number(row.stock) || 0;
                const curPending = Number(row.pending_qty) || 0;
                const newPending = curPending + qty;
                // Status logic (P1 2026-05-29: + MUA_1_PHAN handling):
                //   - stock=0, newPending>0 → CHO_MUA (chưa nhận gì)
                //   - stock>0, newPending>0 → MUA_1_PHAN (đã có hàng + đang chờ thêm)
                //   - stock>0, newPending=0 → DANG_BAN (đủ hàng)
                let newStatus;
                if (curStock === 0) newStatus = 'CHO_MUA';
                else if (newPending > 0) newStatus = 'MUA_1_PHAN';
                else newStatus = 'DANG_BAN';
                const newSupplier = row.supplier || supplier;
                const r2 = await pool.query(
                    `UPDATE web2_products
                       SET pending_qty = $1,
                           status      = $2,
                           supplier    = $3,
                           updated_at  = $4
                     WHERE code = $5
                     RETURNING *`,
                    [newPending, newStatus, newSupplier, now, row.code]
                );
                const updated_row = r2.rows[0];
                updated++;
                results.push({
                    code: updated_row.code,
                    name: updated_row.name,
                    action: 'updated',
                    status: updated_row.status,
                    pendingQty: updated_row.pending_qty,
                    stock: updated_row.stock,
                });
            }
        }
        if (created || updated) _notify('upsert-pending', null);
        res.json({ success: true, created, updated, items: results });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] upsert-pending error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// =====================================================
// POST /api/web2-products/confirm-purchase
// Body: { codes: [code1, code2, ...] }  hoặc  { supplier: "X" } (confirm all CHO_MUA của NCC)
//
// Logic: với mỗi SP → status='DANG_BAN', stock += pending_qty, pending_qty=0.
// Returns: { success, confirmed, items: [{code, name, stock, status}] }
// =====================================================
router.post('/confirm-purchase', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        const codes = Array.isArray(b.codes)
            ? b.codes.map((c) => String(c).trim()).filter(Boolean)
            : [];
        const supplier = b.supplier ? String(b.supplier).trim() : null;
        if (!codes.length && !supplier) {
            return res.status(400).json({ error: 'Cần codes[] hoặc supplier' });
        }
        const now = Date.now();
        // Cập nhật: cho phép cả CHO_MUA và MUA_1_PHAN (P1 2026-05-29) — cả
        // 2 status đều có pending_qty > 0 chờ chuyển sang stock.
        const whereParts = ["status IN ('CHO_MUA', 'MUA_1_PHAN')"];
        const params = [];
        if (codes.length) {
            params.push(codes);
            whereParts.push(`code = ANY($${params.length}::text[])`);
        }
        if (supplier) {
            params.push(supplier);
            whereParts.push(`supplier = $${params.length}`);
        }
        params.push(now);
        const sql = `
            UPDATE web2_products
               SET status      = 'DANG_BAN',
                   stock       = stock + COALESCE(pending_qty, 0),
                   pending_qty = 0,
                   updated_at  = $${params.length}
             WHERE ${whereParts.join(' AND ')}
            RETURNING *
        `;
        const r = await pool.query(sql, params);
        if (r.rows.length) _notify('confirm-purchase', null);
        res.json({
            success: true,
            confirmed: r.rows.length,
            items: r.rows.map(mapRow),
        });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] confirm-purchase error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/web2-products/confirm-purchase-partial
// Mua 1 phần — user nhập số lượng thực tế nhận về cho từng SP. Khác với
// confirm-purchase (mua đủ): cho phép qty_received < pending_qty hiện tại.
//
// Body: { items: [{ code, qtyReceived }] }
//
// Logic per SP:
//   - qtyR = min(qtyReceived, current_pending)  (cap để tránh overflow)
//   - stock += qtyR
//   - pending -= qtyR
//   - status:
//       * pending > 0 && stock > 0 → MUA_1_PHAN
//       * pending == 0 && stock > 0 → DANG_BAN
//       * pending > 0 && stock == 0 → giữ nguyên CHO_MUA (qtyR == 0 case)
//       * pending == 0 && stock == 0 → DANG_BAN (edge case sau cleanup)
// Returns: { success, processed, items: [{code, name, stock, pendingQty, status, qtyReceived}] }
router.post('/confirm-purchase-partial', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
        if (!items.length) {
            return res.status(400).json({ error: 'items[] required' });
        }
        const now = Date.now();
        const results = [];
        for (const it of items) {
            const code = String(it.code || '').trim();
            const qtyReq = Math.max(0, Number(it.qtyReceived) || 0);
            if (!code) {
                results.push({ code: null, action: 'error', error: 'missing code' });
                continue;
            }
            const cur = await pool.query(`SELECT * FROM web2_products WHERE code = $1 FOR UPDATE`, [
                code,
            ]);
            if (!cur.rows.length) {
                results.push({ code, action: 'error', error: 'not_found' });
                continue;
            }
            const row = cur.rows[0];
            const curPending = Number(row.pending_qty) || 0;
            const curStock = Number(row.stock) || 0;
            // Cap qtyR at pending để tránh stock overflow (đáng lẽ phải tăng
            // pending trước qua upsert-pending nếu user thực sự nhận nhiều hơn).
            const qtyR = Math.min(qtyReq, curPending);
            const newStock = curStock + qtyR;
            const newPending = curPending - qtyR;
            let newStatus;
            if (newPending > 0 && newStock > 0) newStatus = 'MUA_1_PHAN';
            else if (newPending === 0 && newStock > 0) newStatus = 'DANG_BAN';
            else if (newPending > 0 && newStock === 0) newStatus = 'CHO_MUA';
            else newStatus = 'DANG_BAN';
            const upd = await pool.query(
                `UPDATE web2_products
                   SET stock       = $1,
                       pending_qty = $2,
                       status      = $3,
                       updated_at  = $4
                 WHERE code = $5
                RETURNING *`,
                [newStock, newPending, newStatus, now, code]
            );
            const m = mapRow(upd.rows[0]);
            results.push({
                code: m.code,
                name: m.name,
                action: 'partial-purchase',
                qtyReceived: qtyR,
                qtyRequested: qtyReq,
                stock: m.quantity,
                pendingQty: m.pendingQty,
                status: m.status,
            });
            // History log
            try {
                await _logHistory(
                    pool,
                    code,
                    'partial-purchase',
                    {
                        qtyReceived: qtyR,
                        qtyRequested: qtyReq,
                        beforeStock: curStock,
                        afterStock: newStock,
                        beforePending: curPending,
                        afterPending: newPending,
                        beforeStatus: row.status,
                        afterStatus: newStatus,
                        supplier: row.supplier,
                    },
                    _extractUser(req),
                    _extractSourcePage(req) || 'so-order'
                );
            } catch (_) {}
        }
        const processed = results.filter((r) => r.action === 'partial-purchase').length;
        if (processed) _notify('confirm-purchase-partial', null);
        res.json({ success: true, processed, items: results });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] confirm-purchase-partial error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Backfill supplier cho SP cũ chưa có supplier field.
// Body: { prefixMap: { 'HN': 'HÀ NỘI', 'HC': 'HƯƠNG CHÂU', 'HC1': 'HẢI CHÂU', ... } }
// Match longer prefix first (HC1 trước HC để tránh prefix collision).
router.post('/backfill-supplier', async (req, res) => {
    const pool = req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        const prefixMap = (req.body && req.body.prefixMap) || {};
        const entries = Object.entries(prefixMap).sort((a, b) => b[0].length - a[0].length);
        if (!entries.length) {
            return res.status(400).json({ error: 'prefixMap rỗng' });
        }
        let updated = 0;
        const perPrefix = {};
        for (const [prefix, supplier] of entries) {
            const r = await pool.query(
                `UPDATE web2_products
                 SET supplier = $1, updated_at = $2
                 WHERE (supplier IS NULL OR supplier = '')
                   AND code LIKE $3
                 RETURNING code`,
                [supplier, Date.now(), prefix + '%']
            );
            perPrefix[prefix] = { supplier, updated: r.rowCount };
            updated += r.rowCount;
        }
        _notify('backfill-supplier', null);
        res.json({ success: true, total: updated, perPrefix });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] backfill-supplier error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
