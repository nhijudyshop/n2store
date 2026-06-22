#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — selective data wipe (đơn/SP/NCC/ví/KPI/chiến-dịch-cha), GIỮ KH + chuyển khoản.
// =====================================================
// WEB 2.0 SELECTIVE DATA WIPE
//
// Xoá data đơn hàng / sản phẩm / NCC / ví KH / KPI / chiến dịch cha trên web2Db.
// GIỮ: khách hàng (web2_customers) + chuyển khoản (web2_balance_history) +
//      data vận hành (live comments, Zalo/chat, FB, noti, J&T) + auth/config.
//
// Chạy:
//   node render.com/scripts/web2-selective-wipe.js --audit     (mặc định, CHỈ đọc, đếm dòng)
//   node render.com/scripts/web2-selective-wipe.js --execute   (TRUNCATE thật — cần --yes)
//
// Connection: đọc env WEB2_DATABASE_URL (KHÔNG hardcode, KHÔNG in ra).
// =====================================================

const { Pool } = require('pg');

// ---- Tables sẽ XOÁ (TRUNCATE) ----
const DELETE_TABLES = [
    // Đơn hàng
    'web2_so_order',
    'web2_order_tags',
    'web2_returns',
    'web2_cart_history',
    'native_orders',
    'fast_sale_orders',
    // Sản phẩm
    'web2_products',
    'web2_variants',
    'web2_product_history',
    'web2_campaign_products',
    // NCC
    'web2_supplier_meta',
    'web2_supplier_ledger',
    // Tiền/ví KH (user chọn XOÁ — chỉ giữ web2_customers + web2_balance_history)
    'web2_customer_wallets',
    'web2_wallet_transactions',
    'web2_wallet_adjustments',
    'web2_payment_signals',
    'web2_payment_qr_codes',
    'web2_pending_matches',
    // Chiến dịch cha (live-control / live-tv hiển thị SP đã xoá)
    'web2_live_parent_campaigns',
    // KPI (user yêu cầu xoá — vốn tính từ đơn hàng)
    'web2_kpi_assignments',
    'web2_kpi_assignments_history',
    'web2_kpi_events',
];

// ---- HARD GUARD: TUYỆT ĐỐI không bao giờ TRUNCATE, kể cả lỡ thêm vào list trên ----
const HARD_KEEP = new Set([
    'web2_customers', // khách hàng — PHẢI giữ
    'web2_balance_history', // chuyển khoản SePay — PHẢI giữ
    'web2_customer_intents', // gắn KH
    'web2_users', // auth
    'web2_user_sessions', // auth
    'web2_migrations', // schema versioning — xoá sẽ chạy lại migration
    'web2_zalo_accounts', // Zalo session/login
]);

function classify(name) {
    if (HARD_KEEP.has(name)) return 'KEEP (guard)';
    if (DELETE_TABLES.includes(name)) return 'DELETE';
    return 'KEEP';
}

async function main() {
    const mode = process.argv.includes('--execute') ? 'execute' : 'audit';
    const confirmed = process.argv.includes('--yes');
    const url = process.env.WEB2_DATABASE_URL;
    if (!url) {
        console.error('❌ WEB2_DATABASE_URL chưa set trong env. Truyền qua env, KHÔNG hardcode.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
        statement_timeout: 60000,
    });

    try {
        // 1) Liệt kê mọi bảng web2_* + native_orders/fast_sale_orders thực tế trong DB
        const { rows: tbls } = await pool.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema='public' AND table_type='BASE TABLE'
              AND (table_name LIKE 'web2\\_%' OR table_name IN ('native_orders','fast_sale_orders'))
            ORDER BY table_name
        `);
        const existing = tbls.map((r) => r.table_name);

        // 2) Đếm dòng thật từng bảng
        const counts = {};
        for (const t of existing) {
            const { rows } = await pool.query(`SELECT count(*)::int AS c FROM "${t}"`);
            counts[t] = rows[0].c;
        }

        // 3) FK: bảng KEEP nào phụ thuộc bảng DELETE (CASCADE sẽ kéo theo → cảnh báo)
        const { rows: fks } = await pool.query(`
            SELECT tc.table_name AS child, ccu.table_name AS parent
            FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
        `);
        const cascadeRisk = fks.filter(
            (f) => DELETE_TABLES.includes(f.parent) && classify(f.child) !== 'DELETE'
        );

        // 4) In báo cáo
        const delExisting = DELETE_TABLES.filter((t) => existing.includes(t));
        const delMissing = DELETE_TABLES.filter((t) => !existing.includes(t));
        let delRows = 0;
        console.log('\n================ WEB 2.0 DATA AUDIT ================');
        console.log(`DB tables (web2_* + native/fast): ${existing.length}`);
        console.log('\n--- 🔴 SẼ XOÁ (DELETE) ---');
        for (const t of delExisting) {
            console.log(`  ${String(counts[t]).padStart(8)}  ${t}`);
            delRows += counts[t];
        }
        if (delMissing.length)
            console.log(`  (không tồn tại trong DB, bỏ qua: ${delMissing.join(', ')})`);
        console.log(`  → Tổng ${delExisting.length} bảng, ${delRows} dòng sẽ bị xoá.`);

        console.log('\n--- 🟢 GIỮ LẠI (KEEP) ---');
        const keepList = existing.filter((t) => classify(t) !== 'DELETE');
        for (const t of keepList) {
            console.log(`  ${String(counts[t]).padStart(8)}  ${t}   [${classify(t)}]`);
        }

        if (cascadeRisk.length) {
            console.log(
                '\n⚠️  CẢNH BÁO FK CASCADE — bảng GIỮ phụ thuộc bảng XOÁ (CASCADE sẽ kéo theo!):'
            );
            for (const r of cascadeRisk) console.log(`    ${r.child}  →(FK)→  ${r.parent}`);
        } else {
            console.log('\n✅ Không có FK nào khiến CASCADE đụng bảng GIỮ.');
        }

        if (mode === 'audit') {
            console.log(
                '\n📋 AUDIT MODE — KHÔNG ghi gì. Chạy lại với --execute --yes để xoá thật.'
            );
            return;
        }

        // 5) EXECUTE
        if (!confirmed) {
            console.error('\n❌ --execute cần kèm --yes để xác nhận. Dừng.');
            process.exit(2);
        }
        if (cascadeRisk.length) {
            console.error(
                '\n❌ Có FK cascade-risk tới bảng GIỮ — DỪNG để tránh xoá nhầm. Xử lý FK trước.'
            );
            process.exit(3);
        }
        // Guard lần cuối: loại bỏ bất kỳ HARD_KEEP nào lỡ lọt
        const toTruncate = delExisting.filter((t) => !HARD_KEEP.has(t));
        console.log(`\n🔥 EXECUTING TRUNCATE ${toTruncate.length} bảng...`);
        // TRUNCATE 1 phát (atomic) — RESTART IDENTITY reset sequence; CASCADE an toàn vì đã check FK
        await pool.query(
            `TRUNCATE TABLE ${toTruncate.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
        );
        console.log('✅ XOÁ XONG. Verify lại bằng --audit.');
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error('❌ Lỗi:', e.message);
    process.exit(1);
});
