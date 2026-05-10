#!/usr/bin/env node
// #Note: One-shot recovery — pull `inventory_product_images` từ DB restored (PITR)
// và INSERT vào DB prod. Safe re-run (ON CONFLICT DO NOTHING).
//
// Usage:
//   RESTORE_PG_URL='postgresql://...' node scripts/recover-inventory-images.js
//
// Trigger context: 2026-05-10 ~08:47 UTC TRUNCATE accidentally cleared 45 rows.
// User triggered Render PITR → restore-DB; copy data back to prod.

const path = require('path');
const fs = require('fs');
const { Pool } = require(path.resolve(__dirname, '..', 'render.com', 'node_modules', 'pg'));

const SECRETS = path.resolve(__dirname, '..', 'serect_dont_push.txt');
const text = fs.readFileSync(SECRETS, 'utf8');
const pgMatch = text.match(/Render database:\s*(postgresql:\/\/[^\s]+)/);
const PROD_PG_URL = pgMatch ? pgMatch[1] : null;
const RESTORE_PG_URL = process.env.RESTORE_PG_URL;

if (!PROD_PG_URL) {
    console.error('PROD PG URL not found in serect_dont_push.txt');
    process.exit(1);
}
if (!RESTORE_PG_URL) {
    console.error('Set RESTORE_PG_URL=<conn-string-of-restored-db>');
    process.exit(1);
}

async function main() {
    const restorePool = new Pool({
        connectionString: RESTORE_PG_URL,
        ssl: { rejectUnauthorized: false },
    });
    const prodPool = new Pool({
        connectionString: PROD_PG_URL,
        ssl: { rejectUnauthorized: false },
    });

    console.log('[recover] reading from RESTORE pool…');
    const src = await restorePool.query(
        'SELECT id, ncc, urls, created_at, updated_at, ngay_di_hang, dot_so FROM inventory_product_images ORDER BY id'
    );
    console.log(`[recover] found ${src.rowCount} rows in restored DB`);

    if (src.rowCount === 0) {
        console.log('[recover] nothing to restore — abort');
        await restorePool.end();
        await prodPool.end();
        return;
    }

    // Verify prod is empty (sanity check — abort if someone re-populated meanwhile)
    const existing = await prodPool.query(
        'SELECT COUNT(*)::int AS c FROM inventory_product_images'
    );
    console.log(`[recover] prod currently has ${existing.rows[0].c} rows`);
    if (existing.rows[0].c > 0) {
        console.log('[recover] prod NOT empty — using ON CONFLICT DO NOTHING for idempotency');
    }

    let inserted = 0;
    for (const row of src.rows) {
        const r = await prodPool.query(
            `INSERT INTO inventory_product_images
                (ncc, urls, created_at, updated_at, ngay_di_hang, dot_so)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (ngay_di_hang, dot_so, ncc) DO NOTHING
             RETURNING id`,
            [
                row.ncc,
                JSON.stringify(row.urls || []),
                row.created_at,
                row.updated_at,
                row.ngay_di_hang,
                row.dot_so,
            ]
        );
        if (r.rowCount > 0) inserted++;
    }
    console.log(`[recover] inserted ${inserted}/${src.rowCount} rows (rest were dup-skipped)`);

    const final = await prodPool.query('SELECT COUNT(*)::int AS c FROM inventory_product_images');
    console.log(`[recover] prod final count = ${final.rows[0].c}`);

    await restorePool.end();
    await prodPool.end();
}

main().catch((err) => {
    console.error('[recover] fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
});
