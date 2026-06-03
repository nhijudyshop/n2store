// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — mirror schema chatDb → web2Db (Phase 4 tách DB).
// =====================================================================
// web2-schema-mirror — sinh CREATE TABLE tường minh từ schema THẬT của 1 bảng
// trong source pool (chatDb), rồi tạo trong target pool (web2Db).
//
// Vì sao introspect thay vì chạy lại ensureSchema:
//   - web2 wallet tables định nghĩa bằng `CREATE TABLE (LIKE customer_wallets ...)`
//     → chỉ chạy được nơi có bảng legacy. web2Db không có → LIKE fail.
//   - ensureSchema còn kèm backfill/trigger chatDb-specific → không portable.
//   → Giải pháp: đọc cấu trúc đã-resolve (pg_attribute + format_type), sinh DDL
//     explicit, idempotent (IF NOT EXISTS). KHÔNG copy data (Phase 5 lo).
//
// API: mirrorTableSchema(sourcePool, targetPool, table, { dryRun }) → { table, sql[], executed }
// =====================================================================

// Lấy danh sách cột (tên, type chính xác, notnull, default) theo thứ tự.
async function getColumns(pool, table) {
    const { rows } = await pool.query(
        `SELECT a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS coltype,
                a.attnotnull AS notnull,
                pg_get_expr(d.adbin, d.adrelid) AS coldefault
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [table]
    );
    return rows;
}

// PK + UNIQUE + CHECK constraint defs (bỏ FK — cross-DB không có target).
async function getConstraints(pool, table) {
    const { rows } = await pool.query(
        `SELECT conname AS name, pg_get_constraintdef(oid) AS def, contype
         FROM pg_constraint
         WHERE conrelid = $1::regclass AND contype IN ('p','u','c')
         ORDER BY contype`,
        [table]
    );
    return rows;
}

// Index defs (bỏ index của PK/unique constraint — đã kèm trong constraint).
async function getIndexes(pool, table) {
    const { rows } = await pool.query(
        `SELECT indexname AS name, indexdef AS def
         FROM pg_indexes
         WHERE tablename = $1
           AND indexname NOT IN (
             SELECT conname FROM pg_constraint
             WHERE conrelid = $1::regclass AND contype IN ('p','u')
           )`,
        [table]
    );
    return rows;
}

// Tên các sequence được tham chiếu trong default nextval('seq').
function extractSequences(columns) {
    const seqs = new Set();
    for (const c of columns) {
        const m = (c.coldefault || '').match(/nextval\('([^']+?)'(?:::regclass)?\)/);
        if (m) seqs.add(m[1].replace(/^[^.]+\./, '')); // bỏ schema prefix nếu có
    }
    return [...seqs];
}

function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
}

// Sinh các câu SQL DDL cho 1 bảng (sequences → table → indexes).
async function buildDDL(sourcePool, table) {
    const columns = await getColumns(sourcePool, table);
    if (!columns.length) throw new Error(`Table ${table} không tồn tại ở source`);
    const constraints = await getConstraints(sourcePool, table);
    const indexes = await getIndexes(sourcePool, table);
    const sequences = extractSequences(columns);

    const sql = [];
    // 1. Sequences trước (default cột tham chiếu tới)
    for (const seq of sequences) {
        sql.push(`CREATE SEQUENCE IF NOT EXISTS ${quoteIdent(seq)};`);
    }
    // 2. CREATE TABLE explicit
    const colDefs = columns.map((c) => {
        let def = `  ${quoteIdent(c.name)} ${c.coltype}`;
        if (c.coldefault) def += ` DEFAULT ${c.coldefault}`;
        if (c.notnull) def += ' NOT NULL';
        return def;
    });
    // PK/UNIQUE/CHECK constraint inline
    for (const con of constraints) {
        colDefs.push(`  CONSTRAINT ${quoteIdent(con.name)} ${con.def}`);
    }
    sql.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${colDefs.join(',\n')}\n);`);
    // 3. Indexes (rewrite CREATE INDEX → IF NOT EXISTS)
    for (const idx of indexes) {
        let def = idx.def;
        if (/^CREATE (UNIQUE )?INDEX /i.test(def) && !/IF NOT EXISTS/i.test(def)) {
            def = def.replace(/^CREATE (UNIQUE )?INDEX /i, (m) => m + 'IF NOT EXISTS ');
        }
        sql.push(def.endsWith(';') ? def : def + ';');
    }
    return { sql, sequences, columnCount: columns.length, indexCount: indexes.length };
}

// Mirror 1 bảng. dryRun=true → chỉ trả SQL, không chạy target.
async function mirrorTableSchema(sourcePool, targetPool, table, opts = {}) {
    const { dryRun = false } = opts;
    const built = await buildDDL(sourcePool, table);
    let executed = false;
    if (!dryRun) {
        for (const stmt of built.sql) {
            await targetPool.query(stmt);
        }
        executed = true;
    }
    return {
        table,
        columnCount: built.columnCount,
        indexCount: built.indexCount,
        sequences: built.sequences,
        sql: built.sql,
        executed,
    };
}

// Danh sách bảng web2 cần mirror sang web2Db (FK đã bỏ → thứ tự không quan trọng).
// Web 2.0 đang TEST → data disposable. Mirror MỌI bảng web2 routes đụng, KỂ CẢ
// bảng tên-Web1.0 (`customers`, `balance_history`, `campaigns`) — web2Db giữ
// BẢN COPY RIÊNG, web2 routes ghi/đọc bản này, Web 1.0 (chatDb) KHÔNG bị đụng.
// Bảng không tồn tại ở source → mirror/copy skip (caught per-table).
const WEB2_TABLES = [
    // Money / SePay (critical)
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    'web2_balance_history',
    'web2_pending_matches',
    'web2_payment_qr_codes',
    'web2_match_audit',
    'web2_webhook_retry_queue',
    'web2_extraction_blacklist',
    // Products / variants
    'web2_products',
    'web2_product_history',
    'web2_product_velocity',
    'web2_variants',
    // Generic / entities
    'web2_entities',
    // Orders
    'native_orders',
    'native_orders_migrations',
    'fast_sale_orders',
    'fast_sale_order_history',
    'fast_sale_order_lines',
    'pbh_fulfillment_logs',
    'inventory_shipments',
    'social_orders',
    // Users / notifications / cart
    'web2_users',
    'web2_user_sessions',
    'web2_notifications',
    'web2_cart_history',
    // KPI
    'web2_kpi_events',
    'web2_kpi_actual',
    'web2_kpi_forecast',
    'web2_supplier_ratings',
    'campaign_employee_ranges',
    // Bảng tên-Web1.0 — web2Db giữ BẢN COPY RIÊNG (Web 1.0 chatDb KHÔNG đụng)
    'customers',
    'balance_history',
    'campaigns',
];

module.exports = { mirrorTableSchema, buildDDL, getColumns, WEB2_TABLES };
