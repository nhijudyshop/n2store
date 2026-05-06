// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// One-off diagnostic: check state of kpi_sale_flag + kpi_statistics
// Run: node render.com/scripts/check-kpi-state.js
const { Client } = require('pg');

const CONN =
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

(async function main() {
    const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('Connected.\n');

    try {
        // ====== 1. kpi_sale_flag summary
        console.log('='.repeat(70));
        console.log('[1] kpi_sale_flag SUMMARY');
        console.log('='.repeat(70));
        const flagSummary = await client.query(`
            SELECT
                COUNT(*)::int AS total_flags,
                COUNT(*) FILTER (WHERE is_sale_product = TRUE)::int AS ticked_true,
                COUNT(*) FILTER (WHERE is_sale_product = FALSE)::int AS ticked_false,
                COUNT(DISTINCT order_code)::int AS distinct_orders
            FROM kpi_sale_flag
        `);
        console.table(flagSummary.rows);

        // Recent 10 flags
        const recentFlags = await client.query(`
            SELECT order_code, product_id, is_sale_product, set_by_user_name, updated_at
            FROM kpi_sale_flag
            ORDER BY updated_at DESC
            LIMIT 10
        `);
        console.log('\nRecent 10 flags:');
        console.table(recentFlags.rows);

        // ====== 2. kpi_statistics summary
        console.log('\n' + '='.repeat(70));
        console.log('[2] kpi_statistics SUMMARY');
        console.log('='.repeat(70));
        const statsSummary = await client.query(`
            SELECT
                COUNT(*)::int AS total_rows,
                COUNT(DISTINCT user_id)::int AS distinct_users,
                SUM(total_kpi) AS sum_total_kpi,
                SUM(total_net_products)::int AS sum_total_net,
                MAX(updated_at) AS latest_update
            FROM kpi_statistics
        `);
        console.table(statsSummary.rows);

        // Per-user breakdown
        const perUser = await client.query(`
            SELECT user_id, user_name,
                   COUNT(*)::int AS row_count,
                   SUM(total_kpi) AS sum_kpi,
                   SUM(total_net_products)::int AS sum_net
            FROM kpi_statistics
            GROUP BY user_id, user_name
            ORDER BY sum_kpi DESC
            LIMIT 15
        `);
        console.log('\nTop 15 users by KPI:');
        console.table(perUser.rows);

        // ====== 3. Orders with kpi = 0 trong JSONB (từ union-skip-guard)
        console.log('\n' + '='.repeat(70));
        console.log('[3] kpi_statistics — ORDERS trong JSONB theo kpi value');
        console.log('='.repeat(70));
        const ordersByKpi = await client.query(`
            SELECT
                user_id,
                COUNT(*) FILTER (WHERE (elem->>'kpi')::numeric > 0)::int AS orders_kpi_pos,
                COUNT(*) FILTER (WHERE (elem->>'kpi')::numeric = 0)::int AS orders_kpi_zero
            FROM kpi_statistics, jsonb_array_elements(orders) elem
            GROUP BY user_id
            ORDER BY orders_kpi_pos DESC NULLS LAST
            LIMIT 10
        `);
        console.table(ordersByKpi.rows);

        // ====== 4. Sample order with kpi=0 (để verify union-skip-guard đã chạy chưa)
        console.log('\n' + '='.repeat(70));
        console.log('[4] Sample orders với kpi=0 (nếu có → union-skip-guard hoạt động)');
        console.log('='.repeat(70));
        const zeroKpiSamples = await client.query(`
            SELECT user_id, user_name, stat_date,
                   elem->>'orderCode' AS order_code,
                   (elem->>'kpi')::numeric AS kpi,
                   (elem->>'netProducts')::int AS net
            FROM kpi_statistics, jsonb_array_elements(orders) elem
            WHERE (elem->>'kpi')::numeric = 0
            LIMIT 10
        `);
        console.table(zeroKpiSamples.rows);
        console.log(`→ ${zeroKpiSamples.rows.length} rows found`);
        if (zeroKpiSamples.rows.length === 0) {
            console.log(
                '   ⚠ Chưa có order kpi=0 nào trong kpi_statistics. Cần click "Tính lại KPI toàn bộ" để migration.'
            );
        }

        // ====== 5. kpi_base vs kpi_statistics coverage
        console.log('\n' + '='.repeat(70));
        console.log('[5] Coverage: kpi_base vs kpi_statistics');
        console.log('='.repeat(70));
        const coverage = await client.query(`
            SELECT
                (SELECT COUNT(*)::int FROM kpi_base) AS bases_total,
                (SELECT COUNT(DISTINCT elem->>'orderCode')::int
                 FROM kpi_statistics, jsonb_array_elements(orders) elem) AS orders_in_stats
        `);
        console.table(coverage.rows);

        // Bases chưa có trong stats
        const orphanBases = await client.query(`
            SELECT COUNT(*)::int AS orphan_bases_count
            FROM kpi_base kb
            WHERE NOT EXISTS (
                SELECT 1 FROM kpi_statistics ks,
                jsonb_array_elements(ks.orders) elem
                WHERE elem->>'orderCode' = kb.order_code
            )
        `);
        console.table(orphanBases.rows);
        const orphanCount = orphanBases.rows[0].orphan_bases_count;
        if (orphanCount > 0) {
            console.log(
                `   → ${orphanCount} orders có BASE nhưng KHÔNG có trong kpi_statistics.`
            );
            console.log(
                '   ⚠ Đây là đơn chưa tick SP nào VÀ không có upsell (hoặc union-skip-guard chưa run).'
            );
            console.log('   → Click "Tính lại KPI toàn bộ" để migrate.');
        }
    } catch (err) {
        console.error('Query error:', err.message);
    } finally {
        await client.end();
        console.log('\nConnection closed.');
    }
})();
