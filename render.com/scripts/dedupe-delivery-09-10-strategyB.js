// #Note: Dedupe delivery_assignments rows duplicated across 2026-05-09 + 2026-05-10.
// Strategy B: preserve 09/05 row's group_name (= user-visible value via last-wins overlay).
// Target: keep row at 10/05 (correct DateInvoice), update group from 09, merge scan/hidden, delete 09 row.
// Usage:
//   PGURL='postgresql://...' node dedupe-delivery-09-10-strategyB.js          → dry-run
//   PGURL='postgresql://...' node dedupe-delivery-09-10-strategyB.js --apply  → commit

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const PGURL = process.env.PGURL;
if (!PGURL) {
    console.error('PGURL env var required');
    process.exit(1);
}

const DATE_LEFT = '2026-05-09'; // row to delete
const DATE_RIGHT = '2026-05-10'; // row to keep (update first)

async function main() {
    const c = new Client({ connectionString: PGURL });
    await c.connect();

    console.log(`mode: ${APPLY ? 'APPLY (will commit)' : 'DRY-RUN (rollback at end)'}`);
    console.log(`strategy: B — 09/05 wins for group_name; 10/05 row kept; 09/05 row deleted`);

    try {
        await c.query('BEGIN');
        await c.query('LOCK TABLE delivery_assignments IN EXCLUSIVE MODE');

        const pre = await c.query(
            `
            SELECT
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date=$1) AS rows_09,
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date=$2) AS rows_10`,
            [DATE_LEFT, DATE_RIGHT]
        );
        const dupCount = await c.query(
            `
            SELECT COUNT(*)::int AS n FROM (
                SELECT order_number FROM delivery_assignments
                WHERE assignment_date IN ($1,$2)
                GROUP BY order_number HAVING COUNT(*) > 1
            ) sub`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(
            `pre: rows_09=${pre.rows[0].rows_09}, rows_10=${pre.rows[0].rows_10}, duplicate_pairs=${dupCount.rows[0].n}`
        );

        const preview = await c.query(
            `
            SELECT d9.order_number, d9.group_name g9, d9.is_scanned s9, d10.group_name g10, d10.is_scanned s10
            FROM delivery_assignments d9
            JOIN delivery_assignments d10 ON d9.order_number=d10.order_number AND d10.assignment_date=$2
            WHERE d9.assignment_date=$1 AND d9.group_name<>d10.group_name
            ORDER BY d9.order_number LIMIT 5`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log('preview (5 group-conflict pairs):');
        for (const r of preview.rows)
            console.log(`  ${r.order_number}: g9=${r.g9} (kept) | g10=${r.g10} (discarded)`);

        // STEP 1: update 10/05 row with merged values, but group_name = 09's value (Strategy B)
        const mergeRes = await c.query(
            `
            UPDATE delivery_assignments t
            SET group_name = m.merged_group,
                is_scanned = m.merged_scanned,
                is_hidden  = m.merged_hidden,
                scanned_at = m.merged_scanned_at,
                scanned_by = m.merged_scanned_by,
                updated_at = NOW()
            FROM (
                SELECT d10.id,
                    d9.group_name AS merged_group,
                    (d9.is_scanned OR d10.is_scanned) AS merged_scanned,
                    (d9.is_hidden  OR d10.is_hidden)  AS merged_hidden,
                    CASE
                        WHEN d9.is_scanned AND d10.is_scanned THEN LEAST(d9.scanned_at, d10.scanned_at)
                        WHEN d9.is_scanned  THEN d9.scanned_at
                        WHEN d10.is_scanned THEN d10.scanned_at
                        ELSE NULL
                    END AS merged_scanned_at,
                    CASE
                        WHEN d9.is_scanned AND d10.is_scanned THEN
                            CASE WHEN d9.scanned_at <= d10.scanned_at THEN d9.scanned_by ELSE d10.scanned_by END
                        WHEN d9.is_scanned  THEN d9.scanned_by
                        WHEN d10.is_scanned THEN d10.scanned_by
                        ELSE NULL
                    END AS merged_scanned_by
                FROM delivery_assignments d9
                JOIN delivery_assignments d10
                  ON d9.order_number = d10.order_number
                 AND d10.assignment_date = $2
                WHERE d9.assignment_date = $1
            ) m
            WHERE t.id = m.id`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`merged ${mergeRes.rowCount} 10/05 rows (group=09's value, scan=OR)`);

        // STEP 2: DELETE 09/05 rows that have corresponding 10/05 row
        const delRes = await c.query(
            `
            DELETE FROM delivery_assignments
            WHERE assignment_date = $1
              AND order_number IN (SELECT order_number FROM delivery_assignments WHERE assignment_date = $2)`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`deleted ${delRes.rowCount} 09/05 dupe rows`);

        const post = await c.query(
            `
            SELECT
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date=$1) AS rows_09,
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date=$2) AS rows_10`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`post: rows_09=${post.rows[0].rows_09}, rows_10=${post.rows[0].rows_10}`);

        const postDup = await c.query(
            `
            SELECT COUNT(*)::int AS n FROM (
                SELECT order_number FROM delivery_assignments
                WHERE assignment_date IN ($1,$2)
                GROUP BY order_number HAVING COUNT(*) > 1
            ) sub`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`post duplicate_pairs: ${postDup.rows[0].n} (expect 0)`);

        // Group breakdown post
        const groupBreak = await c.query(
            `
            SELECT group_name, COUNT(*)::int AS n FROM delivery_assignments
            WHERE assignment_date IN ($1,$2)
            GROUP BY group_name ORDER BY group_name`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log('post group breakdown:');
        for (const r of groupBreak.rows) console.log(`  ${r.group_name}: ${r.n}`);

        // 66254 sanity (user said keep at nap)
        const v = await c.query(`
            SELECT assignment_date, group_name, is_scanned FROM delivery_assignments
            WHERE order_number='NJD/2026/66254' ORDER BY assignment_date`);
        console.log('66254 rows after:', v.rows);

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
