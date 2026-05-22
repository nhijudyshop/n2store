// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Wallet isolation (tách triệt để khỏi Web 1.0)
//
// Tạo 3 bảng mirror riêng cho Web 2.0:
//   - web2_customer_wallets    ← customer_wallets
//   - web2_wallet_transactions ← wallet_transactions
//   - web2_wallet_adjustments  ← wallet_adjustments
//
// Mirror tự động qua Postgres TRIGGER AFTER INSERT/UPDATE ở 3 bảng legacy.
// Web 1.0 (orders-report tab1, balance-history accountant cũ, routes/v2/wallets,
// services/wallet-event-processor) tiếp tục ghi legacy KHÔNG ĐỔI — trigger
// fire sau commit để sync vào web2_*. Web 2.0 readers chuyên dụng (dashboard-kpi,
// audit-log) đọc web2_* riêng.
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
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_customer_wallets (
                LIKE customer_wallets INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );
            -- Bỏ DEFAULT nextval (id sẽ luôn lấy từ legacy qua trigger)
            ALTER TABLE web2_customer_wallets ALTER COLUMN id DROP DEFAULT;

            -- ============================================================
            -- 2. web2_wallet_transactions (clone wallet_transactions)
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_wallet_transactions (
                LIKE wallet_transactions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );
            ALTER TABLE web2_wallet_transactions ALTER COLUMN id DROP DEFAULT;

            -- ============================================================
            -- 3. web2_wallet_adjustments (clone wallet_adjustments)
            -- ============================================================
            CREATE TABLE IF NOT EXISTS web2_wallet_adjustments (
                LIKE wallet_adjustments INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
            );
            ALTER TABLE web2_wallet_adjustments ALTER COLUMN id DROP DEFAULT;

            COMMIT;
        `);

        // ============================================================
        // 4. Trigger functions — mirror legacy → web2_*
        //    Dùng INSERT ... ON CONFLICT (id) DO UPDATE để upsert idempotent.
        // ============================================================
        await pool.query(`
            CREATE OR REPLACE FUNCTION web2_mirror_customer_wallet()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO web2_customer_wallets SELECT NEW.*
                ON CONFLICT (id) DO UPDATE SET
                    customer_id = EXCLUDED.customer_id,
                    phone = EXCLUDED.phone,
                    balance = EXCLUDED.balance,
                    virtual_balance = EXCLUDED.virtual_balance,
                    total_deposited = EXCLUDED.total_deposited,
                    total_withdrawn = EXCLUDED.total_withdrawn,
                    total_virtual_issued = EXCLUDED.total_virtual_issued,
                    total_virtual_used = EXCLUDED.total_virtual_used,
                    total_virtual_expired = EXCLUDED.total_virtual_expired,
                    updated_at = EXCLUDED.updated_at;
                RETURN NEW;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[web2-wallet-mirror] customer_wallets sync failed: %', SQLERRM;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await pool.query(`
            CREATE OR REPLACE FUNCTION web2_mirror_wallet_transaction()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO web2_wallet_transactions SELECT NEW.*
                ON CONFLICT (id) DO UPDATE SET
                    type = EXCLUDED.type,
                    amount = EXCLUDED.amount,
                    balance_after = EXCLUDED.balance_after;
                RETURN NEW;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[web2-wallet-mirror] wallet_transactions sync failed: %', SQLERRM;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await pool.query(`
            CREATE OR REPLACE FUNCTION web2_mirror_wallet_adjustment()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO web2_wallet_adjustments SELECT NEW.*
                ON CONFLICT (id) DO UPDATE SET
                    adjustment_type = EXCLUDED.adjustment_type,
                    adjustment_amount = EXCLUDED.adjustment_amount,
                    reason = EXCLUDED.reason,
                    approved_by = EXCLUDED.approved_by,
                    approved_at = EXCLUDED.approved_at;
                RETURN NEW;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[web2-wallet-mirror] wallet_adjustments sync failed: %', SQLERRM;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // ============================================================
        // 5. Triggers AFTER INSERT/UPDATE — drop+create để idempotent
        // ============================================================
        await pool.query(`
            DROP TRIGGER IF EXISTS trg_web2_mirror_customer_wallet ON customer_wallets;
            CREATE TRIGGER trg_web2_mirror_customer_wallet
                AFTER INSERT OR UPDATE ON customer_wallets
                FOR EACH ROW EXECUTE FUNCTION web2_mirror_customer_wallet();
        `);
        await pool.query(`
            DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_transaction ON wallet_transactions;
            CREATE TRIGGER trg_web2_mirror_wallet_transaction
                AFTER INSERT OR UPDATE ON wallet_transactions
                FOR EACH ROW EXECUTE FUNCTION web2_mirror_wallet_transaction();
        `);
        await pool.query(`
            DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_adjustment ON wallet_adjustments;
            CREATE TRIGGER trg_web2_mirror_wallet_adjustment
                AFTER INSERT OR UPDATE ON wallet_adjustments
                FOR EACH ROW EXECUTE FUNCTION web2_mirror_wallet_adjustment();
        `);

        // ============================================================
        // 6. Backfill 1 lần — chỉ chạy nếu web2_* còn rỗng
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
        console.log('[web2-wallet-isolation] schema + triggers ready');
    } catch (e) {
        console.error('[web2-wallet-isolation] ensureSchema failed:', e.message);
        // KHÔNG throw — Web 1.0 vẫn chạy nếu isolation fail
    }
}

module.exports = { ensureSchema };
