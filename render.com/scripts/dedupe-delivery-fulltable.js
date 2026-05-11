// #Note: Full-table dedupe of delivery_assignments.
// Strategy: for each order_number, keep the LATEST created_at row (= what user-visible overlay shows).
// Merge: is_scanned = OR, is_hidden = OR, scanned_at = earliest non-null, scanned_by = corresponding.
// Then ADD UNIQUE (order_number). Old UNIQUE (assignment_date, order_number) kept temporarily for backward compat;
// will be dropped after backend deploy that uses ON CONFLICT (order_number).
// Usage:
//   PGURL=... node dedupe-delivery-fulltable.js          → dry-run
//   PGURL=... node dedupe-delivery-fulltable.js --apply  → commit

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const PGURL = process.env.PGURL;
if (!PGURL) {
    console.error('PGURL env var required');
    process.exit(1);
}

async function main() {
    const c = new Client({ connectionString: PGURL });
    await c.connect();
    console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

    try {
        await c.query('BEGIN');
        await c.query('LOCK TABLE delivery_assignments IN EXCLUSIVE MODE');

        const r1 = await c.query(`SELECT COUNT(*)::int AS n FROM delivery_assignments`);
        const r2 = await c.query(
            `SELECT COUNT(DISTINCT order_number)::int AS n FROM delivery_assignments`
        );
        const r3 = await c.query(
            `SELECT MAX(c)::int AS max FROM (SELECT order_number, COUNT(*) c FROM delivery_assignments GROUP BY order_number) s`
        );
        console.log(
            `pre: total=${r1.rows[0].n}, distinct_orders=${r2.rows[0].n}, max_rows_per_order=${r3.rows[0].max}`
        );

        // Step 1: identify winners (latest created_at per order_number)
        await c.query(`
            CREATE TEMP TABLE order_winners AS
            SELECT DISTINCT ON (order_number) id, order_number, assignment_date, group_name
            FROM delivery_assignments
            ORDER BY order_number, created_at DESC`);
        const winnerCount = await c.query(`SELECT COUNT(*)::int AS n FROM order_winners`);
        console.log(`winners (1 per order_number): ${winnerCount.rows[0].n}`);

        // Step 2: aggregate scan/hidden info across ALL rows per order
        await c.query(`
            CREATE TEMP TABLE order_agg AS
            SELECT order_number,
                   bool_or(is_scanned) AS any_scanned,
                   bool_or(is_hidden) AS any_hidden,
                   MIN(scanned_at) FILTER (WHERE is_scanned) AS earliest_scanned_at
            FROM delivery_assignments
            GROUP BY order_number`);

        // Step 3: update winners with merged data; preserve winner's group_name and assignment_date
        const updRes = await c.query(`
            UPDATE delivery_assignments t
            SET is_scanned = agg.any_scanned,
                is_hidden = agg.any_hidden,
                scanned_at = agg.earliest_scanned_at,
                scanned_by = COALESCE(
                    (SELECT x.scanned_by FROM delivery_assignments x
                     WHERE x.order_number = t.order_number AND x.is_scanned = TRUE
                       AND x.scanned_at = agg.earliest_scanned_at
                     LIMIT 1),
                    (SELECT x.scanned_by FROM delivery_assignments x
                     WHERE x.order_number = t.order_number AND x.is_scanned = TRUE
                     ORDER BY x.scanned_at ASC NULLS LAST LIMIT 1)
                ),
                updated_at = NOW()
            FROM order_agg agg
            WHERE t.order_number = agg.order_number
              AND t.id IN (SELECT id FROM order_winners)`);
        console.log(`merged ${updRes.rowCount} winner rows`);

        // Step 4: delete losers
        const delRes = await c.query(`
            DELETE FROM delivery_assignments
            WHERE id NOT IN (SELECT id FROM order_winners)`);
        console.log(`deleted ${delRes.rowCount} loser rows`);

        // Post-counts
        const p1 = await c.query(`SELECT COUNT(*)::int AS n FROM delivery_assignments`);
        const p2 = await c.query(
            `SELECT COUNT(DISTINCT order_number)::int AS n FROM delivery_assignments`
        );
        console.log(`post: total=${p1.rows[0].n}, distinct=${p2.rows[0].n}`);

        const postDup = await c.query(`
            SELECT COUNT(*)::int AS n FROM (
                SELECT order_number FROM delivery_assignments GROUP BY order_number HAVING COUNT(*) > 1
            ) s`);
        console.log(`post duplicate_orders: ${postDup.rows[0].n} (expect 0)`);

        // Step 5: ADD UNIQUE constraint on order_number alone (old constraint stays for backward compat)
        try {
            await c.query(`ALTER TABLE delivery_assignments
                ADD CONSTRAINT delivery_assignments_order_number_unique UNIQUE (order_number)`);
            console.log(`✓ added UNIQUE (order_number) constraint`);
        } catch (e) {
            if (/already exists/.test(e.message)) {
                console.log(`UNIQUE (order_number) constraint already exists, skipped`);
            } else throw e;
        }

        // Verify by listing constraints
        const constraints = await c.query(`
            SELECT conname FROM pg_constraint
            WHERE conrelid='delivery_assignments'::regclass AND contype='u'`);
        console.log(
            `UNIQUE constraints now:`,
            constraints.rows.map((r) => r.conname)
        );

        // 66254 sanity check
        const v = await c.query(`SELECT assignment_date, order_number, group_name, is_scanned
            FROM delivery_assignments WHERE order_number='NJD/2026/66254'`);
        console.log(`66254:`, v.rows);

        if (APPLY) {
            await c.query('COMMIT');
            console.log('COMMITTED');
        } else {
            await c.query('ROLLBACK');
            console.log('ROLLBACK (dry-run)');
        }
    } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        console.error('ERROR:', e.message);
        process.exitCode = 1;
    } finally {
        await c.end();
    }
}
main();
