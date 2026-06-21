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
        // ============================================================
        // 0. 🔴 CRITICAL TRƯỚC TIÊN: cột performed_by trên web2_wallet_transactions.
        //    Bảng này LUÔN tồn tại trên prod (ví đang chạy). PHẢI ALTER TRƯỚC mọi
        //    bước có thể throw — đặc biệt block CREATE bên dưới: `CREATE TABLE IF
        //    NOT EXISTS web2_wallet_adjustments (LIKE wallet_adjustments ...)` ném
        //    NGAY nếu web2_wallet_adjustments CHƯA tồn tại + legacy cũng vắng trên
        //    web2Db (đã tách DB 2026-06-03) → outer catch nuốt → ALTER không bao
        //    giờ chạy → processDeposit ghi performed_by fail → MỌI cộng/trừ ví
        //    Web 2.0 fail → ví + GD kẹt "Đang xử lý". `ALTER TABLE IF EXISTS` +
        //    `ADD COLUMN IF NOT EXISTS` = idempotent, an toàn nếu bảng vắng.
        // ============================================================
        try {
            await pool.query(
                `ALTER TABLE IF EXISTS web2_wallet_transactions ADD COLUMN IF NOT EXISTS performed_by TEXT;`
            );
        } catch (e) {
            console.error('[web2-wallet-isolation] performed_by(tx) ALTER failed:', e.message);
        }

        // ============================================================
        // 1-3. Tạo web2_* NẾU THIẾU. ⚠ `LIKE <legacy>` chỉ chạy khi legacy tồn
        //    tại — web2Db (sau tách DB) KHÔNG có customer_wallets/wallet_*; nếu
        //    ref trực tiếp `CREATE ... LIKE legacy` sẽ throw, abort cả ensureSchema.
        //    Guard to_regclass trong DO block (CREATE là utility command → chỉ
        //    execute khi nhánh IF chạy, KHÔNG parse-fail như SELECT). Trên prod
        //    web2_* đã tồn tại từ trước tách DB → toàn bộ no-op.
        //    Web 2.0 policy KHÔNG dùng virtual_balance (LIKE giữ cột để tương
        //    thích, write để = 0).
        // ============================================================
        await pool.query(`
            DO $$
            BEGIN
                IF to_regclass('public.web2_customer_wallets') IS NULL
                   AND to_regclass('public.customer_wallets') IS NOT NULL THEN
                    CREATE TABLE web2_customer_wallets (
                        LIKE customer_wallets INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
                END IF;
                IF to_regclass('public.web2_wallet_transactions') IS NULL
                   AND to_regclass('public.wallet_transactions') IS NOT NULL THEN
                    CREATE TABLE web2_wallet_transactions (
                        LIKE wallet_transactions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
                END IF;
                IF to_regclass('public.web2_wallet_adjustments') IS NULL
                   AND to_regclass('public.wallet_adjustments') IS NOT NULL THEN
                    CREATE TABLE web2_wallet_adjustments (
                        LIKE wallet_adjustments INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
                END IF;
            END $$;
        `);

        // performed_by trên web2_wallet_adjustments (nếu bảng có) — không critical.
        try {
            await pool.query(
                `ALTER TABLE IF EXISTS web2_wallet_adjustments ADD COLUMN IF NOT EXISTS performed_by TEXT;`
            );
        } catch (e) {
            console.warn('[web2-wallet-isolation] performed_by(adj) skip:', e.message);
        }

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

        // Initial value = max(legacy.id, web2.id) + 10000 để tránh conflict id range.
        // ⚠ to_regclass-guard: legacy table có thể KHÔNG tồn tại trên web2Db (đã
        //   tách DB) → nếu ref trực tiếp sẽ throw, abort cả ensureSchema. Bọc try
        //   + chỉ đọc MAX(id) legacy khi bảng tồn tại.
        try {
            await pool.query(`
                DO $$
                DECLARE
                    max_id BIGINT;
                    legacy_max BIGINT;
                BEGIN
                    legacy_max := CASE WHEN to_regclass('public.customer_wallets') IS NOT NULL
                        THEN (SELECT COALESCE(MAX(id),0) FROM customer_wallets) ELSE 0 END;
                    SELECT GREATEST(legacy_max,
                        COALESCE((SELECT MAX(id) FROM web2_customer_wallets), 0)) + 10000 INTO max_id;
                    PERFORM setval('web2_customer_wallets_id_seq', max_id, false);

                    legacy_max := CASE WHEN to_regclass('public.wallet_transactions') IS NOT NULL
                        THEN (SELECT COALESCE(MAX(id),0) FROM wallet_transactions) ELSE 0 END;
                    SELECT GREATEST(legacy_max,
                        COALESCE((SELECT MAX(id) FROM web2_wallet_transactions), 0)) + 10000 INTO max_id;
                    PERFORM setval('web2_wallet_transactions_id_seq', max_id, false);

                    legacy_max := CASE WHEN to_regclass('public.wallet_adjustments') IS NOT NULL
                        THEN (SELECT COALESCE(MAX(id),0) FROM wallet_adjustments) ELSE 0 END;
                    SELECT GREATEST(legacy_max,
                        COALESCE((SELECT MAX(id) FROM web2_wallet_adjustments), 0)) + 10000 INTO max_id;
                    PERFORM setval('web2_wallet_adjustments_id_seq', max_id, false);
                END $$;
            `);
        } catch (e) {
            console.warn('[web2-wallet-isolation] setval-from-legacy skipped:', e.message);
        }

        // ALTER COLUMN default → web2 sequence. Per-table + ALTER IF EXISTS để
        // web2_wallet_adjustments vắng (chưa từng dùng trên web2Db) không abort.
        for (const [tbl, seq] of [
            ['web2_customer_wallets', 'web2_customer_wallets_id_seq'],
            ['web2_wallet_transactions', 'web2_wallet_transactions_id_seq'],
            ['web2_wallet_adjustments', 'web2_wallet_adjustments_id_seq'],
        ]) {
            try {
                await pool.query(
                    `ALTER TABLE IF EXISTS ${tbl} ALTER COLUMN id SET DEFAULT nextval('${seq}');`
                );
            } catch (e) {
                console.warn(`[web2-wallet-isolation] default seq ${tbl} skip:`, e.message);
            }
        }

        // ============================================================
        // 5. Drop legacy→web2 triggers (Web 2.0 độc lập từ 2026-05-25)
        //    KHÔNG re-create — Web 2.0 service tự ghi web2_* trực tiếp.
        //    ⚠ DROP TRIGGER ... ON <legacy> vẫn throw nếu bảng legacy KHÔNG tồn
        //    tại (IF EXISTS chỉ nuốt lỗi trigger thiếu, KHÔNG nuốt table thiếu)
        //    → guard to_regclass; FUNCTION drop an toàn vô điều kiện.
        // ============================================================
        await pool.query(`
            DO $$
            BEGIN
                IF to_regclass('public.customer_wallets') IS NOT NULL THEN
                    DROP TRIGGER IF EXISTS trg_web2_mirror_customer_wallet ON customer_wallets;
                END IF;
                IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
                    DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_transaction ON wallet_transactions;
                END IF;
                IF to_regclass('public.wallet_adjustments') IS NOT NULL THEN
                    DROP TRIGGER IF EXISTS trg_web2_mirror_wallet_adjustment ON wallet_adjustments;
                END IF;
            END $$;
            DROP FUNCTION IF EXISTS web2_mirror_customer_wallet() CASCADE;
            DROP FUNCTION IF EXISTS web2_mirror_wallet_transaction() CASCADE;
            DROP FUNCTION IF EXISTS web2_mirror_wallet_adjustment() CASCADE;
        `);

        // ============================================================
        // 6. Backfill 1 lần — chỉ chạy nếu web2_* còn rỗng VÀ bảng legacy tồn
        //    tại (web2Db sau tách DB KHÔNG có legacy → bỏ qua, KHÔNG throw).
        //    Bọc try riêng để 1 lỗi không abort các bước sau (anti-dup index).
        //    performed_by đã ALTER ở bước 3b (sớm) → backfill SELECT * có thể
        //    mismatch cột → bọc try nuốt; cutover thật đã xong từ lâu.
        // ============================================================
        try {
            const cnt = await pool.query(
                `SELECT (SELECT COUNT(*) FROM web2_customer_wallets) AS w,
                        (SELECT COUNT(*) FROM web2_wallet_transactions) AS t,
                        (SELECT COUNT(*) FROM web2_wallet_adjustments) AS a,
                        to_regclass('public.customer_wallets')  AS lw,
                        to_regclass('public.wallet_transactions') AS lt,
                        to_regclass('public.wallet_adjustments')  AS la`
            );
            const c = cnt.rows[0];
            if (Number(c.w) === 0 && c.lw) {
                const r = await pool.query(
                    `INSERT INTO web2_customer_wallets SELECT * FROM customer_wallets ON CONFLICT (id) DO NOTHING`
                );
                console.log(
                    `[web2-wallet-isolation] backfilled customer_wallets → web2_customer_wallets: ${r.rowCount} rows`
                );
            }
            if (Number(c.t) === 0 && c.lt) {
                const r = await pool.query(
                    `INSERT INTO web2_wallet_transactions (id, phone, customer_id, type, amount, balance_before, balance_after, source, reference_type, reference_id, note, created_at)
                     SELECT id, phone, customer_id, type, amount, balance_before, balance_after, source, reference_type, reference_id, note, created_at
                     FROM wallet_transactions ON CONFLICT (id) DO NOTHING`
                );
                console.log(
                    `[web2-wallet-isolation] backfilled wallet_transactions → web2_wallet_transactions: ${r.rowCount} rows`
                );
            }
            if (Number(c.a) === 0 && c.la) {
                const r = await pool.query(
                    `INSERT INTO web2_wallet_adjustments SELECT * FROM wallet_adjustments ON CONFLICT (id) DO NOTHING`
                );
                console.log(
                    `[web2-wallet-isolation] backfilled wallet_adjustments → web2_wallet_adjustments: ${r.rowCount} rows`
                );
            }
        } catch (e) {
            console.warn(
                '[web2-wallet-isolation] backfill skipped (legacy vắng/cột lệch):',
                e.message
            );
        }

        // ============================================================
        // 7. Lá chắn cứng chống cộng-trùng tiền bank (Web 2.0).
        //    Race: 2 path (webhook + cron reprocess + reload trang) cùng xử lý
        //    1 GD trong cửa sổ READ COMMITTED → cả 2 qua dup-check → cộng 2 lần.
        //    Partial UNIQUE chỉ ràng buộc deposit sepay (reference_type='sepay'),
        //    KHÔNG đụng withdraw/order/manual (tránh lỗi "quá rộng" như legacy 063).
        //    processDeposit bắt 23505 → trả alreadyProcessed (xem web2-wallet-service).
        //    Idempotent: chỉ tạo khi chưa có dup sẵn, nếu có dup → log để admin dọn.
        // ============================================================
        try {
            const dup = await pool.query(
                `SELECT reference_id, COUNT(*) AS cnt
                 FROM web2_wallet_transactions
                 WHERE reference_type = 'sepay' AND reference_id IS NOT NULL
                 GROUP BY reference_id
                 HAVING COUNT(*) > 1
                 ORDER BY cnt DESC
                 LIMIT 20`
            );
            if (dup.rows.length > 0) {
                const sample = dup.rows.map((r) => `${r.reference_id}×${r.cnt}`).join(', ');
                // audit d-fix #8 (2026-06-21): log to lên CRITICAL — index VẮNG = mất lá
                // chắn DB cứng chống double-credit SePay. Race double-credit đã được
                // processWeb2Match serialize qua advisory xact lock (#9) nên KHÔNG còn
                // catastrophic, NHƯNG vẫn PHẢI dọn dup rồi restart để tái tạo index
                // (defense-in-depth). KHÔNG auto-DELETE ở boot (đụng số dư ví — phải sửa
                // balance kèm). Admin: dọn dup giữ MIN(id)/reference_id + chỉnh balance.
                console.error(
                    `[web2-wallet-isolation] 🔴 CRITICAL: ${dup.rows.length} nhóm DUP sepay tồn tại — ` +
                        `unique index idx_web2_wallet_tx_unique_sepay KHÔNG được tạo (mất backstop ` +
                        `double-credit; #9 advisory-lock vẫn chặn race). Dọn dup + restart: ${sample}`
                );
            } else {
                await pool.query(
                    `CREATE UNIQUE INDEX IF NOT EXISTS idx_web2_wallet_tx_unique_sepay
                     ON web2_wallet_transactions (reference_id)
                     WHERE reference_type = 'sepay'`
                );
                console.log(
                    '[web2-wallet-isolation] unique index idx_web2_wallet_tx_unique_sepay ready (anti double-credit)'
                );
            }
        } catch (e) {
            console.error(
                '[web2-wallet-isolation] anti-dup index step failed (boot tiếp tục):',
                e.message
            );
        }

        // 7b. MEDIUM-cleanup (2026-06-13): lá chắn cho NẠP/RÚT TAY (manual,
        //     balance_history). 3H11 đã thêm idempotencyKey route-level nhưng
        //     pre-check vẫn READ COMMITTED → race hẹp double-credit. Partial
        //     UNIQUE (reference_id, type) WHERE reference_type IN ('manual',
        //     'balance_history','manual_balance_history') khoá cứng. Dup-check trước.
        try {
            const dup2 = await pool.query(
                `SELECT reference_id, type, COUNT(*) AS cnt
                 FROM web2_wallet_transactions
                 WHERE reference_type IN ('manual','balance_history','manual_balance_history')
                   AND reference_id IS NOT NULL
                 GROUP BY reference_id, type
                 HAVING COUNT(*) > 1
                 ORDER BY cnt DESC LIMIT 20`
            );
            if (dup2.rows.length > 0) {
                const sample = dup2.rows
                    .map((r) => `${r.reference_id}/${r.type}×${r.cnt}`)
                    .join(', ');
                console.warn(
                    `[web2-wallet-isolation] ⚠ DUP manual deposits tồn tại — KHÔNG tạo unique index. ` +
                        `Dọn dup trước (${dup2.rows.length} nhóm): ${sample}`
                );
            } else {
                await pool.query(
                    `CREATE UNIQUE INDEX IF NOT EXISTS idx_web2_wallet_tx_unique_manual
                     ON web2_wallet_transactions (reference_id, type)
                     WHERE reference_type IN ('manual','balance_history','manual_balance_history')`
                );
                console.log(
                    '[web2-wallet-isolation] unique index idx_web2_wallet_tx_unique_manual ready (anti double manual-credit)'
                );
            }
        } catch (e) {
            console.error(
                '[web2-wallet-isolation] manual anti-dup index step failed (boot tiếp tục):',
                e.message
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
