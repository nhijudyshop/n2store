// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// WEB 2.0 PRODUCTS REST API
// Kho sản phẩm riêng cho native_orders flow, tách biệt hoàn toàn với
// Kho SP Web 2.0 + Excel cache của orders-report.
// =====================================================

const express = require('express');
// 1D-auth (2026-06-12): route maintenance bulk-mutation gate admin (chuẩn S1).
// Audit 2026-06-20: gate MỌI handler mutating (POST/PATCH/DELETE) bằng requireWeb2AuthSoft
// (401 khi WEB2_AUTH_ENFORCE=1 đang BẬT). Đọc/GET vẫn mở.
const { requireWeb2Admin, requireWeb2AuthSoft } = require('../middleware/web2-auth');
// PER-UNIT (2026-06-29): sau khi SL (stock/pending) đổi → ĐẢM BẢO units = SL (mint
// top-up SP-001..SP-SL) để quét tem + gán giỏ chạy. Units cần có TRƯỚC khi SP vào
// giỏ (reconcile gán STT). web2-product-units KHÔNG require ngược → không vòng lặp.
const { ensureUnitsForCodes } = require('./web2-product-units');
const router = express.Router();
// Fire-and-forget: KHÔNG chặn/làm fail response (mint là phụ trợ). idempotent top-up.
function _syncUnits(pool, codes) {
    Promise.resolve()
        .then(() => ensureUnitsForCodes(pool, Array.isArray(codes) ? codes : [codes]))
        .catch((e) => console.error('[WEB2-PRODUCTS] _syncUnits error:', e.message));
}

// audit r6 (2026-06-21): trần số mục/lần cho bulk-write — mỗi item chạy
// SELECT FOR UPDATE + UPDATE trong 1 transaction nối tiếp. KHÔNG cap → client
// gửi vài chục nghìn item giữ connection + transaction mở nhiều giây → cạn pg
// pool (DoS). 1000 đủ rộng cho mọi đợt nhận hàng/đồng bộ thực tế.
const MAX_BULK_ITEMS = 1000;

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

// _notify(action, codeOrCodes) — broadcast SSE web2:products sau DB commit.
//   codeOrCodes: string (1 SP) | string[] (bulk op nhiều SP) | null.
// Payload luôn có CẢ `code` (single hoặc null) LẪN `codes` (array hoặc null) →
// client patch đúng các row bị đổi tại chỗ (KHÔNG full reload → KHÔNG giật bảng).
// Chỉ chứa MÃ SP nội bộ (vd KHOAOTRANG) + action + ts — KHÔNG PII (client tự re-fetch).
function _notify(action, codeOrCodes) {
    if (!_notifyClients) return;
    const codes = Array.isArray(codeOrCodes)
        ? [...new Set(codeOrCodes.filter(Boolean))]
        : codeOrCodes
          ? [codeOrCodes]
          : null;
    const code = Array.isArray(codeOrCodes) ? null : codeOrCodes || null;
    try {
        _notifyClients('web2:products', { action, code, codes, ts: Date.now() }, 'update');
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
                { action, code, codes, ts: Date.now(), from: 'web2:products' },
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
// Key theo pool object (WeakSet) thay vì flag module-level: cold-start fallback
// chatDb không được làm web2Db skip ensureTables (2 pool riêng biệt).
const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
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

            -- [2026-06-05] print_count: số lần IN TEM mã vạch của SP → biết tem đã
            -- in mấy lần, tránh in trùng gây soạn/chuẩn bị hàng lặp.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS print_count  INTEGER NOT NULL DEFAULT 0;

            -- [2026-06-06] return_qty: tồn kho THU VỀ chờ duyệt (Thu về / shipper_gui).
            -- Khi tạo phiếu thu về cách "Shipper gửi" → return_qty += qty (chưa vào
            -- stock thật). Duyệt phiếu → return_qty → stock. Badge "Thu về" ở Kho SP
            -- khi return_qty > 0. Xem render.com/routes/web2-returns.js.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS return_qty   INTEGER NOT NULL DEFAULT 0;

            -- [2026-06-16] origin_currency + origin_rate: tiền tệ GỐC lúc nhập SP
            -- từ so-order (tab CNY/USD…). Kho SP lưu giá VND canonical (price /
            -- original_price); origin_rate = số VND cho 1 đơn vị origin_currency
            -- → suy ngược giá gốc = VND / origin_rate cho tooltip hover ở Kho SP.
            -- origin_currency NULL hoặc 'VND' → SP nhập bằng VND, không hover.
            -- Set 1 lần lúc INSERT (giá kho khoá tại lần nhập đầu, không update sau).
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS origin_currency VARCHAR(8),
                ADD COLUMN IF NOT EXISTS origin_rate     NUMERIC(14,4);

            -- Migration 080: ĐỊA DANH nhập hàng (Sổ Order tab: HÀ NỘI/HƯƠNG CHÂU) —
            -- field RIÊNG, KHÁC note (ghi chú). Trước đây so-order nhét địa danh vào
            -- note (sai, user báo) → backfill 080 bên dưới tách địa danh khỏi ghi chú.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS region VARCHAR(60);

            CREATE INDEX IF NOT EXISTS idx_web2_products_status   ON web2_products(status);
            CREATE INDEX IF NOT EXISTS idx_web2_products_supplier ON web2_products(supplier);

            -- Migration 070: SP CHA–CON (biến thể). 1 SP nhiều biến thể → 1 dòng CHA
            -- (is_parent=true, parent_code=null, tồn/pending = TỔNG con) + N dòng CON
            -- (parent_code = mã cha, biến thể riêng, tồn/pending/giá riêng).
            -- Mã con = mã cha + viết tắt biến thể (HCAO → HCAOGHI, HCAODO).
            -- SP 1 biến thể → dòng phẳng (parent_code=null, is_parent=false) như cũ.
            ALTER TABLE web2_products
                ADD COLUMN IF NOT EXISTS parent_code VARCHAR(40),
                ADD COLUMN IF NOT EXISTS is_parent   BOOLEAN NOT NULL DEFAULT false;
            CREATE INDEX IF NOT EXISTS idx_web2_products_parent ON web2_products(parent_code);
            CREATE INDEX IF NOT EXISTS idx_web2_products_isparent ON web2_products(is_parent);

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

        // Guard schema chéo (2026-06-12): cascade PATCH + migration 078 bên dưới
        // ghi fast_sale_orders.updated_at nhưng schema PBH chưa từng có cột này
        // → edit SP 500 "column updated_at does not exist". Thêm ở đây (ngoài
        // fast-sale-orders ensureTables) vì products PATCH có thể chạy TRƯỚC
        // khi bất kỳ route PBH nào được gọi sau boot.
        await pool.query(
            `ALTER TABLE IF EXISTS fast_sale_orders ADD COLUMN IF NOT EXISTS updated_at BIGINT`
        );

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

        // Migration 080 (AUTO-HEAL — KHÔNG gate): backfill ĐỊA DANH (region) cho SP
        // cũ do so-order nhét địa danh vào note. ensureTables chạy 1 lần/boot → mỗi
        // deploy tự lành. SP mới từ so-order ghi thẳng region (không cần backfill).
        //
        // ⚠ DÙNG PREFIX MÃ (ASCII) làm nguồn chính: so-order sinh mã HN..=Hà Nội,
        // HC..=Hương Châu theo tab. KHÔNG match note bằng ILIKE '%HƯƠNG CHÂU%' vì
        // chữ Việt trong note có thể khác Unicode-normalize (NFC/NFD) → ILIKE không
        // khớp (bug thật: HC* note='HƯƠNG CHÂU' không lành). Prefix mã thuần ASCII
        // nên luôn khớp.
        await pool.query(`
            UPDATE web2_products
               SET region = CASE
                              WHEN code LIKE 'HN%' THEN 'HÀ NỘI'
                              WHEN code LIKE 'HC%' THEN 'HƯƠNG CHÂU'
                              ELSE region END
             WHERE (region IS NULL OR region = '')
               AND (code LIKE 'HN%' OR code LIKE 'HC%')
        `);
        // Dọn note = địa danh (so-order cũ) — so khớp normalize() Unicode-an-toàn.
        // Bọc EXCEPTION để KHÔNG vỡ ensureTables nếu normalize() thiếu (region đã set
        // ở query trên rồi → đây chỉ là dọn note phụ).
        await pool.query(`
            DO $$
            BEGIN
                UPDATE web2_products SET note = NULL
                 WHERE region IS NOT NULL AND note IS NOT NULL AND btrim(note) <> ''
                   AND normalize(upper(btrim(note)), NFC) IN
                       (normalize('HÀ NỘI', NFC), normalize('HƯƠNG CHÂU', NFC));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$
        `);

        // Migration 081 (AUTO-HEAL — KHÔNG gate): backfill trạng thái HẾT HÀNG
        // (logic mới 2026-06-28). SP đã NHẬN HÀNG rồi BÁN HẾT (stock<=0, pending=0,
        // status còn 'DANG_BAN') = hết hiệu lực → status='HET_HANG' + is_active=false.
        // Tự ẩn khỏi Kho SP (filter activeOnly) + bảng live; CHỈ còn trong gợi ý Số
        // Order để nhập lại nhanh. KHÔNG đụng SP đang chờ (CHO_MUA, pending>0) hay SP
        // còn tồn. is_parent=false (dòng CHA do _recomputeParent tự suy). Idempotent
        // (lần 2 no-op vì đã HET_HANG). Re-import (upsert-pending) reactivate lại.
        const retR = await pool.query(
            `
            UPDATE web2_products
               SET status = 'HET_HANG', is_active = false, updated_at = $1
             WHERE status = 'DANG_BAN'
               AND COALESCE(stock, 0) <= 0
               AND COALESCE(pending_qty, 0) = 0
               AND is_parent = false
               AND is_active = true
        `,
            [Date.now()]
        );
        if (retR.rowCount > 0) {
            console.log(
                `[WEB2-PRODUCTS] Migration 081: retired ${retR.rowCount} sold-out products → HET_HANG`
            );
        }
        // SELF-HEAL ngược (an toàn lưới): SP đang HET_HANG nhưng đã có tồn / có hàng
        // chờ lại (do trả hàng KH/hoàn NCC restock ở path chưa inline-patch) → un-retire
        // về trạng thái đúng + hiện lại. CHỈ đụng status='HET_HANG' (không chạm SP user
        // tự "Tạm dừng"). Boot-time catch cho mọi path tồn-tăng không inline-patch.
        const unretR = await pool.query(
            `
            UPDATE web2_products
               SET status = CASE WHEN COALESCE(stock, 0) > 0
                                 THEN (CASE WHEN COALESCE(pending_qty, 0) > 0 THEN 'MUA_1_PHAN' ELSE 'DANG_BAN' END)
                                 ELSE 'CHO_MUA' END,
                   is_active = true, updated_at = $1
             WHERE status = 'HET_HANG'
               AND (COALESCE(stock, 0) > 0 OR COALESCE(pending_qty, 0) > 0)
               AND is_parent = false
        `,
            [Date.now()]
        );
        if (unretR.rowCount > 0) {
            console.log(
                `[WEB2-PRODUCTS] Migration 081: un-retired ${unretR.rowCount} restocked products`
            );
        }

        _ensuredPools.add(pool);
        console.log('[WEB2-PRODUCTS] Tables created/verified (+ migration 078, 080, 081)');
    } catch (error) {
        console.error('[WEB2-PRODUCTS] Table creation error:', error.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
// ĐỊA DANH từ PREFIX MÃ (so-order: HN..=Hà Nội, HC..=Hương Châu). Dùng làm fallback
// read-time khi region chưa set (SP cũ tạo bằng frontend cũ chưa kịp backfill/boot) →
// địa danh LUÔN nhận diện đúng, không phụ thuộc timing backfill.
function regionFromCode(code) {
    const c = String(code || '').toUpperCase();
    if (c.startsWith('HN')) return 'HÀ NỘI';
    if (c.startsWith('HC')) return 'HƯƠNG CHÂU';
    return null;
}

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
        // địa danh nhập hàng (Sổ Order: HÀ NỘI/HƯƠNG CHÂU) — RIÊNG note (ghi chú).
        // Fallback prefix mã khi region rỗng (SP cũ chưa backfill) → luôn nhận diện.
        region: row.region || regionFromCode(row.code),
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
        // [2026-06-05] số lần in tem mã vạch
        printCount: Number(row.print_count) || 0,
        // [2026-06-06] tồn kho thu về chờ duyệt (shipper gửi)
        returnQty: Number(row.return_qty) || 0,
        // [2026-06-16] tiền tệ gốc lúc nhập (để hover hiện giá gốc CNY ở Kho SP).
        // Giá gốc suy ngược = price|original_price / originRate. VND → null.
        originCurrency: row.origin_currency || null,
        originRate: row.origin_rate != null ? Number(row.origin_rate) : null,
        // Migration 070: SP CHA–CON (biến thể)
        parentCode: row.parent_code || null,
        isParent: !!row.is_parent,
    };
}

// -----------------------------------------------------
// Migration 070 — đồng bộ tồn/pending/status của dòng CHA = TỔNG các con.
// Gọi SAU mọi mutation con (create/upsert/confirm/adjust/delete). 1 nguồn cập nhật.
// Không còn con → xoá cha (tránh cha mồ côi). Lỗi → log, KHÔNG ném (best-effort).
// -----------------------------------------------------
async function _recomputeParent(pool, parentCode) {
    if (!parentCode) return;
    try {
        const agg = await pool.query(
            `SELECT COALESCE(SUM(stock),0)::int AS stock,
                    COALESCE(SUM(pending_qty),0)::int AS pending,
                    COALESCE(SUM(return_qty),0)::int AS ret,
                    COUNT(*)::int AS n
             FROM web2_products WHERE parent_code = $1`,
            [parentCode]
        );
        const { stock, pending, ret, n } = agg.rows[0];
        if (n === 0) {
            await pool.query(`DELETE FROM web2_products WHERE code = $1 AND is_parent = true`, [
                parentCode,
            ]);
            return;
        }
        // Trạng thái CHA suy từ tổng con: còn tồn → MUA_1_PHAN/DANG_BAN; hết tồn mà
        // còn chờ → CHO_MUA; hết tồn + hết chờ → HET_HANG (logic mới 2026-06-28).
        // is_active CHA = có tồn HOẶC có hàng đang chờ (hết sạch → tự ẩn như con).
        const status =
            stock > 0
                ? pending > 0
                    ? 'MUA_1_PHAN'
                    : 'DANG_BAN'
                : pending > 0
                  ? 'CHO_MUA'
                  : 'HET_HANG';
        const active = stock > 0 || pending > 0;
        await pool.query(
            `UPDATE web2_products
             SET stock = $2, pending_qty = $3, return_qty = $4, status = $5, is_active = $7, updated_at = $6
             WHERE code = $1 AND is_parent = true`,
            [parentCode, stock, pending, ret, status, Date.now(), active]
        );
    } catch (e) {
        console.error('[WEB2-PRODUCTS] _recomputeParent error:', e.message);
    }
}

// Recompute tồn cha cho tập mã con (sau confirm/adjust). Tra parent_code distinct
// rồi recompute từng cha. Gọi SAU COMMIT của endpoint mutation con.
async function _recomputeParentsForCodes(pool, codes) {
    if (!codes || !codes.length) return;
    try {
        const r = await pool.query(
            `SELECT DISTINCT parent_code FROM web2_products
             WHERE code = ANY($1) AND parent_code IS NOT NULL`,
            [codes]
        );
        for (const row of r.rows) await _recomputeParent(pool, row.parent_code);
    } catch (e) {
        console.error('[WEB2-PRODUCTS] _recomputeParentsForCodes error:', e.message);
    }
}

// -----------------------------------------------------
// GET /api/web2/products/health
// -----------------------------------------------------
router.get('/health', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const {
            search,
            activeOnly,
            status,
            page = 1,
            limit = 200,
            topLevel,
            parentCode,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10));
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10)));
        const offset = (pageNum - 1) * limitNum;

        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') {
            conds.push('is_active = true');
        }
        // Lọc theo trạng thái (vd status=HET_HANG cho filter "Hết hàng" ở Kho SP).
        // Whitelist để tránh injection ngoài ý muốn (param đã parameterized nhưng giới
        // hạn giá trị hợp lệ cho rõ ràng).
        if (status && ['CHO_MUA', 'DANG_BAN', 'MUA_1_PHAN', 'HET_HANG'].includes(String(status))) {
            params.push(String(status));
            conds.push(`status = $${params.length}`);
        }
        // Migration 070 — Kho SP table: topLevel=1 chỉ trả CHA + standalone (ẩn con).
        // parentCode=X trả CON của 1 cha (lazy expand). Mặc định (không 2 cờ này)
        // trả TẤT CẢ → Web2ProductsCache + matching (findByNameVariant) KHÔNG đổi.
        if (parentCode) {
            params.push(String(parentCode));
            conds.push(`parent_code = $${params.length}`);
        } else if (topLevel === '1' || topLevel === 'true') {
            conds.push('parent_code IS NULL');
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
        // [2026-06-05] Sort theo created_at DESC (THỨ TỰ ỔN ĐỊNH) thay vì
        // updated_at DESC. Trước đây mọi tương tác (in tem, sửa, toggle, chỉnh
        // tồn…) bump updated_at → SP nhảy lên đầu khi reload. created_at không
        // đổi sau khi tạo → vị trí SP cố định, chỉ SP MỚI tạo mới lên đầu.
        // code ASC = tiebreaker xác định khi trùng created_at. Index sẵn có
        // idx_web2_products_created (created_at DESC).
        const listR = await pool.query(
            `SELECT * FROM web2_products ${where}
             ORDER BY is_active DESC, created_at DESC, code ASC
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const supplier = req.query.supplier ? String(req.query.supplier).trim() : null;
        // is_parent = false: dòng CHA chỉ là aggregate (tồn/pending = TỔNG con) cho
        // Kho SP — KHÔNG phải SP bán được. Picker/so-order chỉ chờ-mua các CON +
        // SP phẳng. (Migration 070 cha-con.)
        let sql = `SELECT * FROM web2_products WHERE status = 'CHO_MUA' AND pending_qty > 0 AND is_parent = false`;
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
// GET /api/web2-products/restock-needed[?supplier=]
// SP CẦN ĐẶT THÊM NCC: cầu giỏ NHÁP (draft native_orders) > TỒN hiện tại.
// "Chờ hàng cần đặt" = max(0, demand − stock). PBH (đã trừ tồn) KHÔNG tính (chỉ
// draft). is_parent=false. Dùng cho Sổ Order surface bấm-đặt-NCC nhanh
// (#2 follow-up 2026-06-30). Seed-tested.
// =====================================================
router.get('/restock-needed', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const supplier = req.query.supplier ? String(req.query.supplier).trim() : null;
        const params = [];
        let supFilter = '';
        if (supplier) {
            params.push(supplier);
            supFilter = ` AND p.supplier = $${params.length}`;
        }
        const sql = `
            WITH committed AS (
                SELECT COALESCE(prod->>'productCode', prod->>'code') AS code,
                       SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0)) AS demand
                FROM native_orders n, jsonb_array_elements(n.products) prod
                WHERE n.status = 'draft'
                GROUP BY 1
            )
            SELECT p.*, c.demand::int AS _demand,
                   GREATEST(0, c.demand - p.stock)::int AS _needed
            FROM committed c
            JOIN web2_products p ON p.code = c.code
            WHERE c.demand > p.stock AND p.is_parent = false${supFilter}
            ORDER BY (c.demand - p.stock) DESC, p.supplier, p.name`;
        const r = await pool.query(sql, params);
        const items = r.rows.map((row) => {
            const m = mapRow(row);
            m.demand = Number(row._demand) || 0; // tổng SL trong giỏ nháp (GIỎ)
            m.needed = Number(row._needed) || 0; // cần đặt thêm = max(0, GIỎ − TỒN)
            return m;
        });
        res.json({ success: true, items });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] restock-needed error:', e.message);
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
// GET /api/web2/products/batch?codes=A,B,C
// Lấy nhiều SP 1 lượt — client SSE patch nhiều row tại chỗ sau bulk op
// (confirm-purchase-partial, …) mà KHÔNG full reload. PHẢI khai báo TRƯỚC
// route '/:code' nếu không Express bắt 'batch' làm :code.
// -----------------------------------------------------
router.get('/batch', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = String(req.query.codes || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!codes.length) return res.json({ success: true, products: [] });
    try {
        await ensureTables(pool);
        const r = await pool.query(`SELECT * FROM web2_products WHERE code = ANY($1::text[])`, [
            codes,
        ]);
        res.json({ success: true, products: r.rows.map(mapRow) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// GET /api/web2/products/:code
// -----------------------------------------------------
router.get('/:code', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // AUDIT 2026-06-20 #2: dedupe logic (name+variant+supplier) TRONG transaction
            // + FOR UPDATE → 2 create đồng thời (code khác nhau) không sinh SP trùng.
            // Khớp CẢ variant+supplier nên KHÔNG chặn SP thật khác biến thể/NCC.
            const dup = await client.query(
                `SELECT code FROM web2_products
                 WHERE LOWER(name) = LOWER($1)
                   AND LOWER(COALESCE(variant, '')) = LOWER($2)
                   AND LOWER(COALESCE(supplier, '')) = LOWER($3)
                 LIMIT 1 FOR UPDATE`,
                [
                    b.name.trim(),
                    b.variant ? String(b.variant).trim() : '',
                    String(b.supplier).trim(),
                ]
            );
            if (dup.rows.length) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: `SP trùng (tên + biến thể + NCC) đã tồn tại: ${dup.rows[0].code}`,
                    existingCode: dup.rows[0].code,
                });
            }
            const r = await client.query(
                `INSERT INTO web2_products
                 (code, name, price, image_url, stock, note, tags, is_active,
                  original_price, barcode, category, variant, supplier, region,
                  parent_code, is_parent,
                  created_by, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true,
                         $8, $9, $10, $11, $12, $13,
                         $14, $15,
                         $16, $17, $17)
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
                    b.region ? String(b.region).trim() : null,
                    b.parentCode ? String(b.parentCode).trim() : null,
                    !!b.isParent,
                    b.createdBy || null,
                    now,
                ]
            );
            await client.query('COMMIT');
            // Con mới (có parent_code) → đồng bộ tồn cha.
            if (b.parentCode) await _recomputeParent(pool, String(b.parentCode).trim());
            _notify('create', r.rows[0].code);
            _syncUnits(pool, r.rows[0].code);
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
            await client.query('ROLLBACK').catch(() => {});
            if (err.code === '23505') {
                return res.status(409).json({ error: `Mã SP "${b.code}" đã tồn tại` });
            }
            throw err;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('[WEB2-PRODUCTS] POST / error:', e);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// PATCH /api/web2/products/:code — update mutable fields
// -----------------------------------------------------
router.patch('/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    // H13: UPDATE products + cascade native_orders + cascade fast_sale_orders
    // chạy trong 1 transaction (cùng client) — tránh partial update khi crash giữa chừng.
    const client = await pool.connect();
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
            // địa danh nhập hàng (RIÊNG note)
            region: 'region',
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

        await client.query('BEGIN');
        // Fetch previous row for history diff + stock-vs-pending guard.
        // FOR UPDATE: row-lock đến hết transaction → serialize PATCH đồng thời.
        const prevQ = await client.query(`SELECT * FROM web2_products WHERE code = $1 FOR UPDATE`, [
            req.params.code,
        ]);
        const prevMapped = prevQ.rows[0] ? mapRow(prevQ.rows[0]) : null;

        // Optimistic-concurrency cho stock (audit 2026-06-20): PATCH stock là ABSOLUTE set.
        // Nếu client gửi expectedStock (giá trị stock đã đọc lúc mở form), so sánh với
        // stock vừa lock FOR UPDATE. Khác nhau = đã có write đồng thời → ROLLBACK + 409
        // stale_stock để client re-fetch + re-apply, tránh lost-update (đè mất delta).
        if (req.body.stock !== undefined && req.body.expectedStock !== undefined && prevMapped) {
            const expected = Number(req.body.expectedStock);
            const locked = Number(prevMapped.stock) || 0;
            if (Number.isFinite(expected) && expected !== locked) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'stale_stock',
                    code: req.params.code,
                    name: prevMapped.name,
                    expectedStock: expected,
                    currentStock: locked,
                    newStock: Number(req.body.stock),
                    message: `Tồn kho đã thay đổi (bạn thấy ${expected}, hiện tại ${locked}). Tải lại rồi chỉnh lại.`,
                });
            }
        }

        // Guard: nếu user PATCH stock và stock mới < pending_qty hiện tại
        // (SP còn N cái CHỜ MUA chưa nhận) → 409 với message rõ. User phải
        // confirm-purchase pending về stock TRƯỚC khi giảm stock dưới mức đó.
        // Lý do: pending = số đã ORDER từ NCC, là cam kết phải nhận. Nếu giảm
        // stock dưới pending, sau khi nhận hàng tổng sẽ overflow → inconsistent.
        if (req.body.stock !== undefined && prevMapped) {
            const newStock = Number(req.body.stock);
            const curPending = Number(prevMapped.pendingQty) || 0;
            if (Number.isFinite(newStock) && newStock < curPending && !req.query.force) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    error: 'stock_less_than_pending',
                    code: req.params.code,
                    name: prevMapped.name,
                    currentStock: prevMapped.stock,
                    newStock,
                    pendingQty: curPending,
                    supplier: prevMapped.supplier,
                    message: `Không thể giảm tồn kho xuống ${newStock} vì còn ${curPending} cái CHỜ MUA từ ${prevMapped.supplier || 'NCC'}. Confirm-purchase trước hoặc force=1 để bỏ qua.`,
                });
            }
        }

        const r = await client.query(
            `UPDATE web2_products SET ${sets.join(', ')}
             WHERE code = $${params.length}
             RETURNING *`,
            params
        );
        if (!r.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }

        // Diff cho history (ghi SAU COMMIT — best-effort, không poison transaction).
        const newMapped = mapRow(r.rows[0]);
        const changes = prevMapped ? _diff(prevMapped, newMapped) : { snapshot: newMapped };

        // Cascade snapshot fields (imageUrl + name + price) sang các đơn đã chọn
        // sản phẩm này. native_orders.products[] và fast_sale_orders.order_lines[]
        // đều JSONB array có productCode → cập nhật cùng key. Cascade chỉ khi user
        // explicitly set field (req.body có), tránh ghi đè khi PATCH chỉ chỉnh stock.
        const cascadeMap = {
            imageUrl: 'imageUrl',
            name: 'productName', // fast_sale_orders dùng productName key
            price: 'priceUnit', // fast_sale_orders dùng priceUnit; native dùng price
        };
        // Audit 2026-06-20 (low): KHÔNG cascade price khi value null/NaN/âm.
        // Trước đây PATCH {price:null} làm Number(null)=0 ghi 0 vào MỌI order line
        // (zero snapshot prices). Chỉ cascade price khi là số hữu hạn >= 0.
        const _priceIsCascadable = (v) => {
            const n = Number(v);
            return v !== null && v !== undefined && Number.isFinite(n) && n >= 0;
        };
        const cascadeFields = Object.keys(cascadeMap).filter((k) => {
            if (req.body[k] === undefined) return false;
            if (k === 'price') return _priceIsCascadable(req.body.price);
            return true;
        });
        const cascadeCounts = {
            nativeOrders: 0,
            fastSaleOrders: 0,
        };
        const postCommitNotifies = []; // SSE chỉ broadcast SAU COMMIT
        if (cascadeFields.length > 0) {
            const newProd = r.rows[0];
            const code = newProd.code;
            const now = Date.now();

            // Build SET expressions for native_orders.products (key shape: productCode)
            // products[*] có: productCode, name, price, imageUrl
            try {
                // C14 (2026-06-13): VALUE tham số hoá ($N) thay vì pgString inline —
                // key name là literal cứng (an toàn), giá trị đi qua params (hết
                // rủi ro SQL string-build dù pgString có escape).
                const setNative = [];
                const pNative = [code, now]; // $1=code, $2=now
                if (req.body.imageUrl !== undefined) {
                    pNative.push(newProd.image_url);
                    setNative.push(`'imageUrl', to_jsonb($${pNative.length}::text)`);
                }
                if (req.body.name !== undefined) {
                    pNative.push(newProd.name);
                    setNative.push(`'name', to_jsonb($${pNative.length}::text)`);
                }
                if (_priceIsCascadable(req.body.price)) {
                    pNative.push(Number(newProd.price) || 0);
                    setNative.push(`'price', to_jsonb($${pNative.length}::numeric)`);
                }
                if (setNative.length > 0) {
                    const updNative = await client.query(
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
                        pNative
                    );
                    cascadeCounts.nativeOrders = updNative.rowCount;
                    if (updNative.rowCount > 0) {
                        postCommitNotifies.push([
                            'web2:native-orders',
                            {
                                action: 'product-snapshot-sync',
                                productCode: code,
                                affected: updNative.rowCount,
                                ts: now,
                            },
                        ]);
                    }
                }
            } catch (cascadeErr) {
                console.warn('[WEB2-PRODUCTS] cascade native_orders failed:', cascadeErr.message);
                throw cascadeErr; // trong transaction: phải rollback toàn bộ, không nuốt lỗi
            }

            // Cascade tới fast_sale_orders.order_lines (key: productCode, productName, priceUnit)
            try {
                const setPbh = [];
                const pPbh = [code, now]; // $1=code, $2=now
                if (req.body.imageUrl !== undefined) {
                    pPbh.push(newProd.image_url);
                    setPbh.push(`'imageUrl', to_jsonb($${pPbh.length}::text)`);
                }
                if (req.body.name !== undefined) {
                    pPbh.push(newProd.name);
                    setPbh.push(`'productName', to_jsonb($${pPbh.length}::text)`);
                }
                if (_priceIsCascadable(req.body.price)) {
                    pPbh.push(Number(newProd.price) || 0);
                    setPbh.push(`'priceUnit', to_jsonb($${pPbh.length}::numeric)`);
                }
                if (setPbh.length > 0) {
                    const updPbh = await client.query(
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
                        pPbh
                    );
                    cascadeCounts.fastSaleOrders = updPbh.rowCount;
                    if (updPbh.rowCount > 0) {
                        postCommitNotifies.push([
                            'web2:fast-sale-orders',
                            {
                                action: 'product-snapshot-sync',
                                productCode: code,
                                affected: updPbh.rowCount,
                                ts: now,
                            },
                        ]);
                    }
                }
            } catch (cascadeErr) {
                console.warn(
                    '[WEB2-PRODUCTS] cascade fast_sale_orders failed:',
                    cascadeErr.message
                );
                throw cascadeErr; // trong transaction: phải rollback toàn bộ, không nuốt lỗi
            }
        }

        await client.query('COMMIT');

        // Post-commit: history (best-effort) + SSE notifies.
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
        if (_notifyClients) {
            for (const [topic, payload] of postCommitNotifies) {
                try {
                    _notifyClients(topic, payload, 'update');
                } catch {}
            }
        }
        _notify('update', r.rows[0].code);
        _syncUnits(pool, r.rows[0].code);
        // Migration 070: sửa con (tồn/giá) → đồng bộ tồn cha.
        if (r.rows[0].parent_code) await _recomputeParent(pool, r.rows[0].parent_code);
        // Audit 2026-06-20 (low): PATCH dùng action 'update' KHÔNG nằm trong
        // stockAffectingActions → Ví NCC (debt = Σ qty×cost) bị stale khi user
        // sửa stock/price bằng PATCH. Nếu diff có stock hoặc price thì
        // cross-broadcast web2:supplier-wallet để pill nợ tự refresh.
        if (_notifyClients && (changes.stock !== undefined || changes.price !== undefined)) {
            try {
                _notifyClients(
                    'web2:supplier-wallet',
                    {
                        action: 'product-edit',
                        code: r.rows[0].code,
                        codes: null,
                        ts: Date.now(),
                        from: 'web2:products',
                    },
                    'update'
                );
            } catch {}
        }
        res.json({
            success: true,
            product: mapRow(r.rows[0]),
            cascade: cascadeFields.length > 0 ? cascadeCounts : undefined,
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// C14 (2026-06-13): pgString() đã GỠ — cascade snapshot giờ dùng VALUE tham số
// hoá ($N) trong jsonb_build_object (key name vẫn literal cứng). Hết string-build.

// -----------------------------------------------------
// POST /api/web2/products/adjust-stock
// Body: { adjustments: [{ code, delta, reason }] }
//   - delta > 0: nhập kho (mua từ NCC, KH trả về)
//   - delta < 0: xuất kho (bán PBH, trả NCC)
// Atomic in a single transaction. Returns updated stocks.
// Stock không bao giờ âm — clamp về 0 nếu tổng < 0 (warn).
// -----------------------------------------------------
router.post('/adjust-stock', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    if (adjustments.length > MAX_BULK_ITEMS) {
        return res.status(400).json({ error: `Tối đa ${MAX_BULK_ITEMS} mục mỗi lần` });
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
            // GREATEST clamps negative result to 0.
            // Audit 2026-06-20 (low): RETURNING prev_stock (giá trị TRƯỚC update qua
            // sub-select trong CTE) để tính applied vs requested delta — phát hiện
            // oversell theo MAGNITUDE thay vì chỉ "stock chạm 0".
            const r = await client.query(
                // Giữ INVARIANT trạng thái (logic mới 2026-06-28): chỉnh tồn về 0 +
                // hết chờ → HET_HANG + ẩn; chỉnh tồn LÊN cho SP đang HET_HANG → un-retire
                // (DANG_BAN/MUA_1_PHAN + hiện lại). CHỈ đụng status='HET_HANG' khi un-retire
                // → không ghi đè SP user tự "Tạm dừng". CASE đọc giá trị TRƯỚC update.
                `WITH prev AS (
                     SELECT stock AS old_stock FROM web2_products WHERE code = $3
                 )
                 UPDATE web2_products p
                 SET stock = GREATEST(0, p.stock + $1),
                     status = CASE
                                WHEN GREATEST(0, p.stock + $1) = 0 AND COALESCE(p.pending_qty, 0) = 0 AND p.is_active = true THEN 'HET_HANG'
                                WHEN p.status = 'HET_HANG' AND GREATEST(0, p.stock + $1) > 0
                                     THEN (CASE WHEN COALESCE(p.pending_qty, 0) > 0 THEN 'MUA_1_PHAN' ELSE 'DANG_BAN' END)
                                ELSE p.status END,
                     is_active = CASE
                                WHEN GREATEST(0, p.stock + $1) = 0 AND COALESCE(p.pending_qty, 0) = 0 AND p.is_active = true THEN false
                                WHEN p.status = 'HET_HANG' AND GREATEST(0, p.stock + $1) > 0 THEN true
                                ELSE p.is_active END,
                     updated_at = $2
                 FROM prev
                 WHERE p.code = $3
                 RETURNING p.code, p.stock, prev.old_stock`,
                [delta, Date.now(), code]
            );
            if (!r.rows.length) {
                warnings.push(`Code "${code}" not found, skipped`);
                continue;
            }
            // 1D fix: clamp GREATEST(0) trước đây nuốt im lặng xuất-quá-tồn.
            // applied = thay đổi thực tế sau clamp; requested = delta yêu cầu.
            // oversold = phần âm bị clamp nuốt (chỉ khi delta < 0 và |delta| > tồn cũ).
            const oldStock = Number(r.rows[0].old_stock) || 0;
            const newStock = Number(r.rows[0].stock) || 0;
            const applied = newStock - oldStock; // = delta nếu không clamp, lớn hơn (ít âm hơn) nếu clamp
            // oversold = phần xuất vượt tồn bị GREATEST(0) nuốt (chỉ khi delta âm và oldStock+delta < 0).
            const oversold = delta < 0 && oldStock + delta < 0 ? -(oldStock + delta) : 0;
            if (oversold > 0) {
                warnings.push(
                    `Code "${code}" xuất ${-delta} nhưng tồn chỉ ${oldStock} — vượt ${oversold} cái (clamped về 0)`
                );
            }
            results.push({
                code: r.rows[0].code,
                stock: newStock,
                delta,
                applied,
                oversold,
            });
        }
        await client.query('COMMIT');
        // Migration 070: con đổi tồn → đồng bộ tồn cha.
        await _recomputeParentsForCodes(
            pool,
            results.map((r) => r.code)
        );
        if (results.length)
            _notify(
                'adjust-stock',
                results.map((r) => r.code)
            );
        if (results.length)
            _syncUnits(
                pool,
                results.map((r) => r.code)
            );
        res.json({ success: true, results, warnings });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /api/web2/products/mark-printed   body: { codes: ["KHO-...", ...] }
// Tăng print_count khi IN TEM mã vạch SP → biết tem in mấy lần, tránh in trùng.
// Trả counts mới { code: printCount }.
// -----------------------------------------------------
router.post('/mark-printed', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const codes = Array.isArray(req.body && req.body.codes) ? req.body.codes.filter(Boolean) : [];
    if (!codes.length) return res.status(400).json({ error: 'codes required' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `UPDATE web2_products SET print_count = print_count + 1, updated_at = $1
             WHERE code = ANY($2::text[]) RETURNING code, print_count`,
            [Date.now(), codes]
        );
        const counts = {};
        r.rows.forEach((row) => {
            counts[row.code] = Number(row.print_count || 0);
        });
        if (r.rows.length)
            _notify(
                'mark-printed',
                r.rows.map((x) => x.code)
            );
        res.json({ success: true, counts });
    } catch (e) {
        console.error('[WEB2-PRODUCTS] /mark-printed error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// DELETE /api/web2/products/:code
// Query: ?force=1 để bỏ qua check pending_qty > 0.
// Trả 409 nếu pending_qty > 0 và không force (để caller cảnh báo user).
// -----------------------------------------------------
router.delete('/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const force = req.query.force === '1' || req.query.force === 'true';
        // 1D fix TOCTOU: check pending + DELETE gộp 1 câu atomic — không còn cửa
        // sổ pending tăng giữa SELECT và DELETE. RETURNING * → snapshot history
        // đủ cột (trước đây chỉ SELECT 5 cột).
        const r = await pool.query(
            `DELETE FROM web2_products
             WHERE code = $1 AND ($2::boolean OR COALESCE(pending_qty, 0) = 0)
             RETURNING *`,
            [req.params.code, force]
        );
        if (!r.rows.length) {
            // rowCount=0: phân biệt "không tồn tại" (404) vs "còn pending không
            // force" (409 — giữ behavior cũ để caller cảnh báo user).
            const r0 = await pool.query(
                `SELECT code, name, pending_qty, supplier, stock FROM web2_products WHERE code = $1`,
                [req.params.code]
            );
            if (!r0.rows.length) return res.status(404).json({ error: 'Not found' });
            const cur = r0.rows[0];
            const curPending = Number(cur.pending_qty) || 0;
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
        const deleted = r.rows[0];
        _notify('delete', deleted.code);
        // Migration 070: xoá con → đồng bộ tồn cha (xoá cha nếu hết con). Xoá CHA
        // → xoá luôn các con (tránh con mồ côi).
        if (deleted.parent_code) {
            await _recomputeParent(pool, deleted.parent_code);
        } else if (deleted.is_parent) {
            try {
                await pool.query(`DELETE FROM web2_products WHERE parent_code = $1`, [
                    deleted.code,
                ]);
            } catch (e) {
                console.error('[WEB2-PRODUCTS] delete parent cascade error:', e.message);
            }
        }
        await _logHistory(
            pool,
            deleted.code,
            'delete',
            { snapshot: mapRow(deleted) },
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
router.post('/adjust-pending', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const adjustments = Array.isArray(req.body?.adjustments) ? req.body.adjustments : null;
    if (!adjustments || !adjustments.length) {
        return res.status(400).json({ error: 'adjustments array required' });
    }
    if (adjustments.length > MAX_BULK_ITEMS) {
        return res.status(400).json({ error: `Tối đa ${MAX_BULK_ITEMS} mục mỗi lần` });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const results = [];
        const warnings = [];
        const touchedParents = new Set(); // Migration 070
        for (const adj of adjustments) {
            const code = adj.code ? String(adj.code).trim() : null;
            const name = adj.name ? String(adj.name).trim() : null;
            const variant = adj.variant ? String(adj.variant).trim() : null;
            // 2026-06-16: + supplier (NCC) — đối xứng upsert-pending. Giảm pending
            // phải trúng đúng SP theo NCC (A1 vs b1 cùng tên+biến thể = SP riêng).
            const supplier = adj.supplier ? String(adj.supplier).trim() : null;
            const delta = Number(adj.delta) || 0;
            if ((!code && !name) || !Number.isFinite(delta) || delta === 0) continue;

            // 3H16 FIX (2026-06-12): FOR UPDATE cả 3 nhánh — trước đây SELECT
            // không khoá rồi UPDATE pending_qty = giá trị tuyệt đối tính ở JS →
            // 2 máy so-order chỉnh qty cùng SP đồng thời: delta của request
            // trước bị ghi đè mất (lost update), và nhánh ghost-delete quyết
            // định trên data cũ có thể xoá nhầm SP khi pending vừa được cộng.
            // Cùng pattern upsert-pending (:1127) + confirm-purchase-partial (C5).
            let r;
            if (code) {
                r = await client.query(
                    `SELECT * FROM web2_products WHERE code = $1 LIMIT 1 FOR UPDATE`,
                    [code]
                );
            } else if (variant) {
                const p = [name, variant];
                let where = `LOWER(name) = LOWER($1) AND LOWER(COALESCE(variant, '')) = LOWER($2) AND is_parent = false`;
                let order = 'id';
                if (supplier) {
                    p.push(supplier);
                    where += ` AND (supplier IS NULL OR LOWER(supplier) = LOWER($3))`;
                    order = `(LOWER(COALESCE(supplier, '')) = LOWER($3)) DESC, id`;
                }
                r = await client.query(
                    `SELECT * FROM web2_products WHERE ${where} ORDER BY ${order} LIMIT 1 FOR UPDATE`,
                    p
                );
            } else {
                const p = [name];
                let where = `LOWER(name) = LOWER($1) AND (variant IS NULL OR variant = '') AND is_parent = false`;
                let order = 'id';
                if (supplier) {
                    p.push(supplier);
                    where += ` AND (supplier IS NULL OR LOWER(supplier) = LOWER($2))`;
                    order = `(LOWER(COALESCE(supplier, '')) = LOWER($2)) DESC, id`;
                }
                r = await client.query(
                    `SELECT * FROM web2_products WHERE ${where} ORDER BY ${order} LIMIT 1 FOR UPDATE`,
                    p
                );
            }
            if (!r.rows.length) {
                warnings.push(
                    `Không tìm thấy SP "${name || code}"${variant ? ' / ' + variant : ''}`
                );
                continue;
            }
            const row = r.rows[0];
            if (row.parent_code) touchedParents.add(row.parent_code);
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
        // Migration 070: đồng bộ tồn cha sau khi đổi pending con.
        for (const pc of touchedParents) await _recomputeParent(pool, pc);
        if (results.length)
            _notify(
                'adjust-pending',
                results.map((r) => r.code)
            );
        if (results.length)
            _syncUnits(
                pool,
                results.map((r) => r.code)
            );
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
router.post('/upsert-pending', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
    if (!items.length) return res.json({ success: true, created: 0, updated: 0, items: [] });
    if (items.length > MAX_BULK_ITEMS) {
        return res.status(400).json({ error: `Tối đa ${MAX_BULK_ITEMS} mục mỗi lần` });
    }
    // MEDIUM-cleanup (2026-06-13): resolveOnly = chỉ tra/tạo SP lấy MÃ (in tem),
    // KHÔNG cộng pending_qty — path "In tem" so-order trước đây upsert qty gốc
    // → tái nhiễm double-pending (gốc H15). SP mới tạo với pending=0; SP có sẵn
    // chỉ trả code, không UPDATE.
    const resolveOnly = (req.body || {}).resolveOnly === true;
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const now = Date.now();
        let created = 0,
            updated = 0;
        const results = [];
        const touchedParents = new Set(); // Migration 070: recompute tồn cha sau COMMIT
        for (const it of items) {
            const name = String(it.name || '').trim();
            const variant = it.variant ? String(it.variant).trim() : null;
            const qty = Math.max(0, Number(it.qty) || 0);
            const supplier = it.supplier ? String(it.supplier).trim() : null;
            if (!name || (qty <= 0 && !resolveOnly)) continue;
            // Match: name + variant + supplier (NCC).
            // 1D fix: ưu tiên exact-match variant — SP base (variant NULL, id nhỏ)
            // không được "thắng" khi SP đúng variant tồn tại (đối xứng adjust-pending).
            // 2026-06-16: + supplier (NCC) vào match key. NCC là 1 PHẦN ĐỊNH DANH
            // (mã SP sinh theo prefix NCC: A1AODO ≠ B1AODO). Nên cùng tên+biến thể
            // nhưng KHÁC NCC = SP RIÊNG (không gộp). Cùng NCC → vẫn gộp (dedup khi
            // lưu nháp lại). NULL-supplier SP cũ được NCC đầu tiên "claim" (tránh
            // tạo trùng). Chỉ ràng buộc khi item CÓ supplier — item không NCC giữ
            // hành vi cũ (match theo tên+biến thể).
            // is_parent=false: item con CHỈ match dòng con/standalone, KHÔNG match
            // dòng CHA (cha variant=NULL sẽ "ăn" nhầm item con nếu không loại trừ).
            const conds = ['LOWER(name) = LOWER($1)', 'is_parent = false'];
            const findParams = [name];
            const orderBy = [];
            if (variant) {
                findParams.push(variant);
                conds.push(`(variant IS NULL OR LOWER(variant) = LOWER($${findParams.length}))`);
                orderBy.push(`(LOWER(COALESCE(variant, '')) = LOWER($${findParams.length})) DESC`);
            }
            if (supplier) {
                findParams.push(supplier);
                conds.push(`(supplier IS NULL OR LOWER(supplier) = LOWER($${findParams.length}))`);
                orderBy.push(`(LOWER(COALESCE(supplier, '')) = LOWER($${findParams.length})) DESC`);
            }
            orderBy.push('id ASC');
            const findSql = `SELECT * FROM web2_products WHERE ${conds.join(' AND ')} ORDER BY ${orderBy.join(', ')} FOR UPDATE`;
            const existing = await client.query(`${findSql} LIMIT 1`, findParams);

            if (!existing.rows.length) {
                // INSERT new product with CHO_MUA status. Mã BẮT BUỘC do client
                // gửi (Web2ProductCode.suggest()). KHÔNG sinh 'KHO-<rnd>' rác —
                // thiếu code → skip item này + ghi lý do, không fail cả batch.
                const code = it.code ? String(it.code).trim() : '';
                if (!code) {
                    results.push({
                        name,
                        action: 'error',
                        error: 'Thiếu mã SP (code) — client phải gửi mã từ Web2ProductCode.suggest()',
                    });
                    continue;
                }
                // [2026-06-16] origin: tiền tệ gốc lúc nhập (so-order tab). Kho lưu
                // VND canonical; lưu origin_currency + origin_rate để hover hiện
                // giá gốc. Bỏ qua khi VND (không cần). Set 1 lần lúc INSERT.
                const originCur =
                    it.originCurrency && String(it.originCurrency).toUpperCase() !== 'VND'
                        ? String(it.originCurrency).toUpperCase().slice(0, 8)
                        : null;
                const originRate = originCur ? Number(it.originRate) || null : null;
                // Migration 070: item con của 1 SP nhiều biến thể → có parentCode.
                // Đảm bảo dòng CHA tồn tại (is_parent) trước khi tạo con; tồn/pending
                // cha do _recomputeParent tính sau COMMIT.
                const parentCode = it.parentCode ? String(it.parentCode).trim() : null;
                if (parentCode) {
                    await client.query(
                        `INSERT INTO web2_products
                            (code, name, price, image_url, stock, note, tags, is_active,
                             original_price, barcode, category, variant,
                             status, pending_qty, supplier, region, is_parent,
                             created_by, created_at, updated_at)
                         VALUES ($1, $2, 0, $3, 0, NULL, '[]'::jsonb, TRUE,
                                 0, NULL, $4, NULL,
                                 'CHO_MUA', 0, $5, $6, TRUE,
                                 'so-order', $7, $7)
                         ON CONFLICT (code) DO NOTHING`,
                        [
                            parentCode,
                            (it.parentName ? String(it.parentName).trim() : '') || name,
                            it.imageUrl || null,
                            it.category ? String(it.category).trim() : null,
                            supplier,
                            it.region ? String(it.region).trim() : null,
                            now,
                        ]
                    );
                    touchedParents.add(parentCode);
                }
                try {
                    const r = await client.query(
                        `INSERT INTO web2_products
                            (code, name, price, image_url, stock, note, tags, is_active,
                             original_price, barcode, category, variant,
                             status, pending_qty, supplier, region,
                             origin_currency, origin_rate, parent_code,
                             created_by, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, 0, $5, '[]'::jsonb, TRUE,
                                 $6, NULL, $14, $7,
                                 'CHO_MUA', $8, $9, $13,
                                 $11, $12, $15,
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
                            resolveOnly ? 0 : qty,
                            supplier,
                            now,
                            originCur,
                            originRate,
                            it.region ? String(it.region).trim() : null,
                            it.category ? String(it.category).trim() : null,
                            parentCode,
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
                        // Code collision (rare) — báo lỗi item, không fail batch.
                        results.push({ name, code, action: 'error', error: 'Code collision' });
                    } else {
                        throw err;
                    }
                }
            } else {
                const row = existing.rows[0];
                if (resolveOnly) {
                    // Chỉ cần mã — không đụng pending/status của SP có sẵn.
                    results.push({
                        code: row.code,
                        name: row.name,
                        action: 'resolved',
                        status: row.status,
                        pendingQty: Number(row.pending_qty) || 0,
                        stock: Number(row.stock) || 0,
                    });
                    continue;
                }
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
                // địa danh sticky: chỉ điền nếu SP chưa có (không ghi đè) — KHÔNG nhét note.
                const newRegion =
                    (row.region && String(row.region).trim()) ||
                    (it.region ? String(it.region).trim() : null);
                // Re-import (nhập lại): CHỈ un-retire SP đã HẾT HÀNG (status='HET_HANG'
                // → is_active=true để hiện lại). SP user tự "Tạm dừng" (is_active=false,
                // status≠HET_HANG) GIỮ NGUYÊN pause — KHÔNG auto-bật lại (logic mới
                // 2026-06-28, review-fix). CASE đọc status TRƯỚC update (Postgres).
                const r2 = await client.query(
                    `UPDATE web2_products
                       SET pending_qty = $1,
                           status      = $2,
                           supplier    = $3,
                           region      = $4,
                           is_active   = CASE WHEN status = 'HET_HANG' THEN true ELSE is_active END,
                           updated_at  = $5
                     WHERE code = $6
                     RETURNING *`,
                    [newPending, newStatus, newSupplier, newRegion, now, row.code]
                );
                const updated_row = r2.rows[0];
                updated++;
                if (updated_row.parent_code) touchedParents.add(updated_row.parent_code);
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
        await client.query('COMMIT');
        // Migration 070: đồng bộ tồn/pending CHA = TỔNG con (sau COMMIT → đọc con đã ghi).
        for (const pc of touchedParents) await _recomputeParent(pool, pc);
        if (created || updated)
            _notify(
                'upsert-pending',
                results.map((r) => r.code)
            );
        _syncUnits(
            pool,
            results.map((r) => r.code)
        );
        res.json({ success: true, created, updated, items: results });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCTS] upsert-pending error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// POST /api/web2-products/confirm-purchase
// Body: { codes: [code1, code2, ...] }  hoặc  { supplier: "X" } (confirm all CHO_MUA của NCC)
//
// Logic: với mỗi SP → status='DANG_BAN', stock += pending_qty, pending_qty=0.
// Returns: { success, confirmed, items: [{code, name, stock, status}] }
// =====================================================
router.post('/confirm-purchase', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const b = req.body || {};
    const codes = Array.isArray(b.codes)
        ? b.codes.map((c) => String(c).trim()).filter(Boolean)
        : [];
    const supplier = b.supplier ? String(b.supplier).trim() : null;
    if (!codes.length && !supplier) {
        return res.status(400).json({ error: 'Cần codes[] hoặc supplier' });
    }
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const now = Date.now();
        // Cập nhật: cho phép cả CHO_MUA và MUA_1_PHAN (P1 2026-05-29) — cả
        // 2 status đều có pending_qty > 0 chờ chuyển sang stock.
        // Bọc trong transaction: status guard + row-lock của UPDATE serialize
        // các request đồng thời → chống double-confirm (cộng stock 2 lần).
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
        const r = await client.query(sql, params);
        await client.query('COMMIT');
        // Migration 070: con vừa confirm → đồng bộ tồn cha.
        await _recomputeParentsForCodes(
            pool,
            r.rows.map((x) => x.code)
        );
        if (r.rows.length)
            _notify(
                'confirm-purchase',
                r.rows.map((x) => x.code)
            );
        if (r.rows.length)
            _syncUnits(
                pool,
                r.rows.map((x) => x.code)
            );
        res.json({
            success: true,
            confirmed: r.rows.length,
            items: r.rows.map(mapRow),
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCTS] confirm-purchase error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
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
router.post('/confirm-purchase-partial', requireWeb2AuthSoft, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
    if (!items.length) {
        return res.status(400).json({ error: 'items[] required' });
    }
    if (items.length > MAX_BULK_ITEMS) {
        return res.status(400).json({ error: `Tối đa ${MAX_BULK_ITEMS} mục mỗi lần` });
    }
    // C5: FOR UPDATE chỉ có tác dụng trong transaction — pool.query autocommit
    // làm lock vô hiệu → lost update khi 2 máy cùng nhận hàng. Bọc toàn bộ
    // SELECT FOR UPDATE + tính newStock + UPDATE trên CÙNG client (như
    // upsert-pending / confirm-purchase ở trên).
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const now = Date.now();
        const results = [];
        const historyLogs = []; // ghi SAU COMMIT (best-effort, không poison tx)
        for (const it of items) {
            const code = String(it.code || '').trim();
            const qtyReq = Math.max(0, Number(it.qtyReceived) || 0);
            if (!code) {
                results.push({ code: null, action: 'error', error: 'missing code' });
                continue;
            }
            const cur = await client.query(
                `SELECT * FROM web2_products WHERE code = $1 FOR UPDATE`,
                [code]
            );
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
            const upd = await client.query(
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
                stock: m.stock,
                pendingQty: m.pendingQty,
                status: m.status,
            });
            historyLogs.push({
                code,
                changes: {
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
            });
        }
        await client.query('COMMIT');
        // History log (post-commit, best-effort)
        for (const h of historyLogs) {
            try {
                await _logHistory(
                    pool,
                    h.code,
                    'partial-purchase',
                    h.changes,
                    _extractUser(req),
                    _extractSourcePage(req) || 'so-order'
                );
            } catch (_) {}
        }
        const partialCodes = results
            .filter((r) => r.action === 'partial-purchase')
            .map((r) => r.code);
        // Migration 070: con vừa nhận hàng → đồng bộ tồn cha.
        await _recomputeParentsForCodes(pool, partialCodes);
        if (partialCodes.length) _notify('confirm-purchase-partial', partialCodes);
        if (partialCodes.length) _syncUnits(pool, partialCodes);
        res.json({ success: true, processed: partialCodes.length, items: results });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-PRODUCTS] confirm-purchase-partial error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Backfill supplier cho SP cũ chưa có supplier field.
// Body: { prefixMap: { 'HN': 'HÀ NỘI', 'HC': 'HƯƠNG CHÂU', 'HC1': 'HẢI CHÂU', ... } }
// Match longer prefix first (HC1 trước HC để tránh prefix collision).
router.post('/backfill-supplier', requireWeb2Admin, async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
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
