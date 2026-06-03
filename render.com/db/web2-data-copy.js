// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — copy data chatDb → web2Db (Phase 5 tách DB).
// =====================================================================
// web2-data-copy — copy ROWS từ bảng ở source pool (chatDb) sang target pool
// (web2Db) theo batch. Idempotent (ON CONFLICT DO NOTHING). READ-ONLY trên
// source. Sau copy: setval sequence + đối chiếu count.
//
// Yêu cầu: schema 2 bên đã khớp (chạy web2-schema-mirror trước).
// =====================================================================

async function getColumnNames(pool, table) {
    const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
         ORDER BY ordinal_position`,
        [table]
    );
    return rows.map((r) => r.column_name);
}

// PK column đơn (đa số bảng web2 PK 1 cột id/code). Trả null nếu không có/đa cột.
async function getPkColumn(pool, table) {
    const { rows } = await pool.query(
        `SELECT a.attname
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [table]
    );
    return rows.length === 1 ? rows[0].attname : null;
}

function quoteIdent(n) {
    return '"' + String(n).replace(/"/g, '""') + '"';
}

// Copy 1 bảng theo batch. opts: { batchSize=500, dryRun=false }
async function copyTableData(sourcePool, targetPool, table, opts = {}) {
    const { batchSize = 500, dryRun = false } = opts;
    const cols = await getColumnNames(sourcePool, table);
    if (!cols.length) throw new Error(`${table}: không có cột (chưa mirror schema?)`);
    const pk = await getPkColumn(sourcePool, table);

    const srcCount = Number(
        (await sourcePool.query(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(table)}`)).rows[0].n
    );
    const tgtBefore = Number(
        (await targetPool.query(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(table)}`)).rows[0].n
    );

    if (dryRun) {
        return { table, srcCount, tgtBefore, copied: 0, dryRun: true, pk, columns: cols.length };
    }

    const colList = cols.map(quoteIdent).join(', ');
    const orderBy = pk ? `ORDER BY ${quoteIdent(pk)}` : '';
    let copied = 0;
    let offset = 0;
    // OFFSET pagination (đơn giản, ổn vì source read-only trong cửa sổ copy).
    // Với bảng lớn keyset tốt hơn nhưng OFFSET đủ cho quy mô hiện tại.
    for (;;) {
        const batch = await sourcePool.query(
            `SELECT ${colList} FROM ${quoteIdent(table)} ${orderBy} LIMIT $1 OFFSET $2`,
            [batchSize, offset]
        );
        if (batch.rows.length === 0) break;

        // Build multi-row parameterized INSERT ... ON CONFLICT DO NOTHING
        const params = [];
        const tuples = batch.rows.map((row, ri) => {
            const ph = cols.map((c, ci) => {
                params.push(row[c]);
                return `$${ri * cols.length + ci + 1}`;
            });
            return `(${ph.join(', ')})`;
        });
        const sql = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`;
        const r = await targetPool.query(sql, params);
        copied += r.rowCount || 0;
        offset += batch.rows.length;
        if (batch.rows.length < batchSize) break;
    }

    // Sync sequence: setval = max(pk) để insert mới không đụng id đã copy.
    // web2 tables tạo sequence RỜI (không OWNED BY cột) → pg_get_serial_sequence
    // trả null. Phải parse tên sequence từ default expression của cột PK.
    let seqSynced = null;
    if (pk) {
        try {
            const defRow = await targetPool.query(
                `SELECT pg_get_expr(d.adbin, d.adrelid) AS def
                 FROM pg_attribute a
                 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                 WHERE a.attrelid=$1::regclass AND a.attname=$2`,
                [table, pk]
            );
            const m = (defRow.rows[0]?.def || '').match(/nextval\('([^']+?)'(?:::regclass)?\)/);
            const seq = m ? m[1].replace(/^[^.]+\./, '') : null;
            if (seq) {
                await targetPool.query(
                    `SELECT setval($1, GREATEST((SELECT COALESCE(MAX(${quoteIdent(pk)}),0) FROM ${quoteIdent(table)}), 1))`,
                    [seq]
                );
                seqSynced = seq;
            }
        } catch (e) {
            seqSynced = 'ERR: ' + e.message;
        }
    }

    const tgtAfter = Number(
        (await targetPool.query(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(table)}`)).rows[0].n
    );
    return {
        table,
        srcCount,
        tgtBefore,
        tgtAfter,
        copied,
        pk,
        seqSynced,
        match: srcCount === tgtAfter,
    };
}

// Bảng tiền cần verify thêm SUM cột balance/amount.
const MONEY_SUM = {
    web2_customer_wallets: 'balance',
    web2_wallet_transactions: 'amount',
};

async function verifyMoneySum(sourcePool, targetPool, table) {
    const col = MONEY_SUM[table];
    if (!col) return null;
    const q = `SELECT COALESCE(SUM(${quoteIdent(col)}),0)::numeric AS s FROM ${quoteIdent(table)}`;
    const [s, t] = await Promise.all([sourcePool.query(q), targetPool.query(q)]);
    const srcSum = String(s.rows[0].s);
    const tgtSum = String(t.rows[0].s);
    return { table, col, srcSum, tgtSum, match: srcSum === tgtSum };
}

module.exports = { copyTableData, verifyMoneySum, getColumnNames, getPkColumn, MONEY_SUM };
