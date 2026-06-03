// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// MIGRATION: rename bảng `customers` (web2Db) → `web2_order_customers`
//
// 2026-06-03: Web 2.0 có 2 kho KH gây nhầm tên với Web 1.0:
//   • web2_customers       — TPOS-synced (search/sửa, id=TPOS Partner Id)
//   • customers (web2Db)   — kho KH đơn hàng (Pancake/FB) của native-orders
// Bảng thứ 2 trùng tên y hệt `customers` Web 1.0 (chatDb) → đổi tên rõ ràng.
//
// ⚠ AN TOÀN TUYỆT ĐỐI: chỉ chạy trên RAW web2Pool (KHÔNG fallback chatDb).
//    Nếu lỡ chạy trên chatDb sẽ phá bảng `customers` Web 1.0. Vì vậy:
//      1. Caller PHẢI truyền raw web2Pool (server.js: web2Pool, KHÔNG web2Pool||chatDbPool)
//      2. Guard thêm: skip nếu !web2Pool hoặc !WEB2_DATABASE_URL
//      3. Idempotent: chỉ rename khi `customers` tồn tại VÀ `web2_order_customers` chưa có
// =====================================================================

let _done = false;

async function ensureWeb2OrderCustomersRename(web2Pool) {
    if (_done) return;
    // GUARD 1: tuyệt đối không chạy khi không có web2Db riêng (tránh hit chatDb)
    if (!web2Pool) {
        console.log('[web2-order-customers-migrate] skip — web2Pool null (KHÔNG đụng chatDb)');
        return;
    }
    // GUARD 2: double-check env (web2Pool chỉ non-null khi env set, nhưng phòng xa)
    if (!process.env.WEB2_DATABASE_URL) {
        console.log('[web2-order-customers-migrate] skip — WEB2_DATABASE_URL unset');
        return;
    }
    try {
        // Idempotent rename: chỉ khi customers còn, web2_order_customers chưa có.
        const r = await web2Pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'customers'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'web2_order_customers'
                ) THEN
                    ALTER TABLE customers RENAME TO web2_order_customers;
                    RAISE NOTICE '[web2-order-customers-migrate] renamed customers -> web2_order_customers';
                END IF;
            END $$;
        `);
        void r;
        // Verify kết quả
        const chk = await web2Pool.query(`
            SELECT
                EXISTS(SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name='web2_order_customers') AS has_new,
                EXISTS(SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name='customers') AS has_old
        `);
        const { has_new, has_old } = chk.rows[0] || {};
        console.log(
            `[web2-order-customers-migrate] OK — web2_order_customers=${has_new} customers=${has_old}`
        );
        _done = true;
    } catch (e) {
        console.error('[web2-order-customers-migrate] rename failed:', e.message);
    }
}

module.exports = { ensureWeb2OrderCustomersRename };
