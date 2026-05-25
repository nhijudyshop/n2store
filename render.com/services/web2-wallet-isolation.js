// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Wallet isolation (tách triệt để khỏi Web 1.0)
//
// CHẾ ĐỘ HIỆN TẠI (2026-05-25 trở đi): TRUE ISOLATION
//   - web2_* là source-of-truth riêng cho Web 2.0
//   - Legacy customer_wallets/wallet_transactions KHÔNG đụng tới web2_* nữa
//   - Web 2.0 writers (web2-wallet-service.js, web2-sepay-matching.js) ghi
//     trực tiếp web2_*
//   - Triggers legacy→web2 ĐÃ BỊ DROP (xem dropLegacyTriggers bên dưới)
//
// Lịch sử:
//   - 2026-05-22 ~ 2026-05-25 sáng: dùng TRIGGER AFTER INSERT/UPDATE để mirror
//     legacy → web2_*. Web 2.0 read-only.
//   - 2026-05-25 chiều: user yêu cầu Web 2.0 độc lập hoàn toàn → drop trigger,
//     fan-out webhook gọi cả 2 path song song.
//
// 3 bảng riêng:
//   - web2_customer_wallets    (KHÔNG dùng virtual_balance — Web 2.0 spec)
//   - web2_wallet_transactions
//   - web2_wallet_adjustments
//
// Backfill 1 lần khi schema chưa có; sau đó migration idempotent (no-op).
// =====================================================

let _ready = false;

async function ensureSchema(pool) {
    if (_ready || !pool) return;
    try {
        await pool.query(`
            BEGIN;

            -- ============================================================
            -- 1. web2_customer_wallets (clone customer_wallets)
            --    LƯU Ý: Web 2.0 policy KHÔNG dùng virtual_balance, nhưng
            --    cột vẫn tồn tại để compatible với LIKE customer_wallets.
            --    Mọi write từ Web 2.0 sẽ để virtual_balance = 0.
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_customer_wallets (
                LIKE customer_wallets INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );

            -- ============================================================
            -- 2. web2_wallet_transactions (clone wallet_transactions)
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_wallet_transactions (
                LIKE wallet_transactions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );

            -- ============================================================
            -- 3. web2_wallet_adjustments (clone wallet_adjustments)
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_wallet_adjustments (
                LIKE wallet_adjustments INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );

            COMMIT;
        `);

        // ============================================================
        // 4. Đảm bảo có SEQUENCE riêng cho Web 2.0 (id auto-increment).
        //    LIKE customer_wallets clone DEFAULT nextval của legacy sequence
        //    → Web 2.0 insert sẽ ăn id từ legacy sequence (xung đột với
        //    Web 1.0 insert song song). Đổi sang sequence riêng.
        // ============================================================
        await pool.query(`
            CREATE SEQUENCE IF NOT EXISTS web2_customer_wallets_id_seq;
            CREATE SEQUENCE IF NOT EXISTS web2_wallet_transactions_id_seq;
            CREATE SEQUENCE IF NOT EXISTS web2_wallet_adjustments_id_seq;
        `);

        // Initial value = max(legacy.id, web2.id) + 10000 để tránh conflict id range
        // với data backfill từ legacy.
        await pool.query(`
            DO $$
            DECLARE
                max_id BIGINT;
            BEGIN
                SELECT GREATEST(
                    COALESCE((SELECT MAX(id) FROM customer_wallets), 0),
                    COALESCE((SELECT MAX(id) FROM web2_customer_wallets), 0)
                ) + 10000 INTO max_id;
                PERFORM setval('web2_customer_wallets_id_seq', max_id, false);

                SELECT GREATEST(
                    COALESCE((SELECT MAX(id) FROM wallet_transactions), 0),
                    COALESCE((SELECT MAX(id) FROM web2_wallet_transactions), 0)
                ) + 10000 INTO max_id;
                PERFORM setval('web2_wallet_transactions_id_seq', max_id, false);

                SELECT GREATEST(
                    COALESCE((SELECT MAX(id) FROM wallet_adjustments), 0),
                    COALESCE((SELECT MAX(id) FROM web2_wallet_adjustments), 0)
                ) + 10000 INTO max_id;
                PERFORM setval('web2_wallet_adjustments_id_seq', max_id, false);
            END $$;

            ALTER TABLE web2_customer_wallets
                ALTER COLUMN id SET DEFAULT nextval('web2_customer_wallets_id_seq');
            ALTER TABLE web2_wallet_transactions
                ALTER COLUMN id SET DEFAULT nextval('web2_wallet_transactions_id_seq');
            ALTER TABLE web2_wallet_adjustments
                ALTER COLUMN id SET DEFAULT nextval('web2_wallet_adjustments_id_seq');
        `);

        // ============================================================
        // 5. Drop legacy→web2 triggers (Web 2.0 độc lập từ 2026-05-25)
        //    KHÔNG re-create — Web 2.0 service tự ghi web2_* trực tiếp.
        // ============================================================
        await pool.query(`
            DROP TRIGGER IF EXISTS trg_web2_mirror_customer_wallet ON customer_wallets;
            DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_transaction ON wallet_transactions;
            DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_adjustment ON wallet_adjustments;
            DROP FUNCTION IF EXISTS web2_mirror_customer_wallet() CASCADE;
            DROP FUNCTION IF EXISTS web2_mirror_wallet_transaction() CASCADE;
            DROP FUNCTION IF EXISTS web2_mirror_wallet_adjustment() CASCADE;
        `);

        // ============================================================
        // 6. Backfill 1 lần — chỉ chạy nếu web2_* còn rỗng.
        //    Đảm bảo Web 2.0 có snapshot KH hiện tại lúc cutover.
        // ============================================================
        const cnt = await pool.query(
            `SELECT (SELECT COUNT(*) FROM web2_customer_wallets) AS w,
                    (SELECT COUNT(*) FROM web2_wallet_transactions) AS t,
                    (SELECT COUNT(*) FROM web2_wallet_adjustments) AS a`
        );
        const c = cnt.rows[0];
        if (Number(c.w) === 0) {
            const r = await pool.query(
                `INSERT INTO web2_customer_wallets SELECT * FROM customer_wallets ON CONFLICT (id) DO NOTHING`
            );
            console.log(
                `[web2-wallet-isolation] backfilled customer_wallets → web2_customer_wallets: ${r.rowCount} rows`
            );
        }
        if (Number(c.t) === 0) {
            const r = await pool.query(
                `INSERT INTO web2_wallet_transactions SELECT * FROM wallet_transactions ON CONFLICT (id) DO NOTHING`
            );
            console.log(
                `[web2-wallet-isolation] backfilled wallet_transactions → web2_wallet_transactions: ${r.rowCount} rows`
            );
        }
        if (Number(c.a) === 0) {
            const r = await pool.query(
                `INSERT INTO web2_wallet_adjustments SELECT * FROM wallet_adjustments ON CONFLICT (id) DO NOTHING`
            );
            console.log(
                `[web2-wallet-isolation] backfilled wallet_adjustments → web2_wallet_adjustments: ${r.rowCount} rows`
            );
        }

        _ready = true;
        console.log('[web2-wallet-isolation] schema ready — TRUE ISOLATION mode (no triggers)');
    } catch (e) {
        console.error('[web2-wallet-isolation] ensureSchema failed:', e.message);
        // KHÔNG throw — Web 1.0 vẫn chạy nếu isolation fail
    }
}

module.exports = { ensureSchema };
