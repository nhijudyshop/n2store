// #Note: One-off migration. Dedupe delivery_assignments rows where same order_number appears in both 2026-05-09 and 2026-05-10.
//
// ⚠️ ATTEMPTED 2026-05-11 → REVERTED. Strategy ("non-nap wins") flipped 89 đơn nap→tomato visible
//    against user intent. Final migration that was kept: dedupe-delivery-09-10-strategyB.js
//    (Strategy B: 09/05 wins for group_name → 0 user-visible flip). Keep this file for audit trail.
//
// Pattern: 10/05 row = correct date, 09/05 row = wrong-date duplicate from old multi-day filter bug.
// Action: MERGE preserve non-NAP group + is_scanned + earliest scanned_at + corresponding scanned_by, then DELETE 09/05 dupe.
// Special: NJD/2026/66254 force group=tomato.
// Usage:
//   PGURL='postgresql://...' node dedupe-delivery-09-10.js          → dry-run (default)
//   PGURL='postgresql://...' node dedupe-delivery-09-10.js --apply  → execute in transaction

const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const PGURL = process.env.PGURL;
if (!PGURL) {
    console.error('PGURL env var required');
    process.exit(1);
}

const DATE_LEFT = '2026-05-09'; // wrong-date side (delete)
const DATE_RIGHT = '2026-05-10'; // correct-date side (keep, merge)
const SPECIAL_TOMATO = ['NJD/2026/66254'];

async function main() {
    const c = new Client({ connectionString: PGURL });
    await c.connect();

    console.log(`mode: ${APPLY ? 'APPLY (will commit)' : 'DRY-RUN (rollback at end)'}`);
    console.log(`scope: assignment_date IN (${DATE_LEFT}, ${DATE_RIGHT})`);

    try {
        await c.query('BEGIN');
        // Use EXCLUSIVE — blocks writes, allows reads. Migration is fast (single statement set).
        await c.query('LOCK TABLE delivery_assignments IN EXCLUSIVE MODE');

        // Pre-counts
        const pre = await c.query(
            `SELECT
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date = $1) AS rows_09,
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date = $2) AS rows_10`,
            [DATE_LEFT, DATE_RIGHT]
        );
        const dupCount = await c.query(
            `SELECT COUNT(*)::int AS n FROM (
               SELECT order_number FROM delivery_assignments
               WHERE assignment_date IN ($1,$2)
               GROUP BY order_number HAVING COUNT(*) > 1
             ) sub`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(
            `pre: rows_09=${pre.rows[0].rows_09}, rows_10=${pre.rows[0].rows_10}, duplicate_pairs=${dupCount.rows[0].n}`
        );

        // Preview a few merge rows to inspect
        const preview = await c.query(
            `SELECT d9.order_number,
                    d9.group_name AS g9, d9.is_scanned AS s9, d9.scanned_at AS sa9, d9.scanned_by AS sb9,
                    d10.group_name AS g10, d10.is_scanned AS s10, d10.scanned_at AS sa10, d10.scanned_by AS sb10,
                    d9.is_hidden AS h9, d10.is_hidden AS h10
             FROM delivery_assignments d9
             JOIN delivery_assignments d10
               ON d9.order_number = d10.order_number
              AND d10.assignment_date = $2
             WHERE d9.assignment_date = $1
             ORDER BY d9.order_number
             LIMIT 5`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log('preview (first 5 duplicate pairs):');
        for (const r of preview.rows) {
            console.log(`  ${r.order_number}: g9=${r.g9} s9=${r.s9} | g10=${r.g10} s10=${r.s10}`);
        }

        // STEP 1: merge 10/05 row with 09/05 row's data (preserve non-NAP group, OR is_scanned, earliest scanned_at).
        const mergeRes = await c.query(
            `UPDATE delivery_assignments t
             SET is_scanned = m.merged_scanned,
                 is_hidden = m.merged_hidden,
                 group_name = m.merged_group,
                 scanned_at = m.merged_scanned_at,
                 scanned_by = m.merged_scanned_by,
                 updated_at = NOW()
             FROM (
               SELECT d10.id,
                      (d9.is_scanned OR d10.is_scanned) AS merged_scanned,
                      (d9.is_hidden  OR d10.is_hidden)  AS merged_hidden,
                      CASE
                        WHEN d10.group_name <> 'nap' THEN d10.group_name
                        WHEN d9.group_name  <> 'nap' THEN d9.group_name
                        ELSE 'nap'
                      END AS merged_group,
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
        console.log(`merged ${mergeRes.rowCount} 10/05 rows with 09/05 dupe data`);

        // STEP 2: DELETE the 09/05 dupe rows (only those that have a corresponding 10/05 row).
        const delRes = await c.query(
            `DELETE FROM delivery_assignments
             WHERE assignment_date = $1
               AND order_number IN (
                 SELECT order_number FROM delivery_assignments WHERE assignment_date = $2
               )`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`deleted ${delRes.rowCount} 09/05 dupe rows`);

        // STEP 3: special-case NJD/2026/66254 → group=tomato on 10/05 row
        for (const num of SPECIAL_TOMATO) {
            const upd = await c.query(
                `UPDATE delivery_assignments
                 SET group_name = 'tomato', updated_at = NOW()
                 WHERE order_number = $1 AND assignment_date = $2`,
                [num, DATE_RIGHT]
            );
            console.log(`special ${num} → tomato: ${upd.rowCount} row updated`);
        }

        // Post-counts
        const post = await c.query(
            `SELECT
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date = $1) AS rows_09,
                (SELECT COUNT(*) FROM delivery_assignments WHERE assignment_date = $2) AS rows_10`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`post: rows_09=${post.rows[0].rows_09}, rows_10=${post.rows[0].rows_10}`);

        const postDup = await c.query(
            `SELECT COUNT(*)::int AS n FROM (
               SELECT order_number FROM delivery_assignments
               WHERE assignment_date IN ($1,$2)
               GROUP BY order_number HAVING COUNT(*) > 1
             ) sub`,
            [DATE_LEFT, DATE_RIGHT]
        );
        console.log(`post duplicate_pairs in [09,10]: ${postDup.rows[0].n} (expect 0)`);

        // Verify 66254
        const v = await c.query(
            `SELECT assignment_date, group_name, is_scanned
             FROM delivery_assignments WHERE order_number = 'NJD/2026/66254' ORDER BY assignment_date`
        );
        console.log('66254 rows after:', v.rows);

        if (APPLY) {
            await c.query('COMMIT');
            console.log('COMMITTED');
        } else {
            await c.query('ROLLBACK');
            console.log('ROLLBACK (dry-run). Re-run with --apply to commit.');
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
