// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Test schema + stock/return flow của web2-returns trên LOCAL DB riêng (KHÔNG đụng prod).
// Pattern bắt buộc cho DB schema change: CREATE local DB → schema → INSERT → verify → DROP.
const { Client, Pool } = require('pg');

const ADMIN = { host: 'localhost', user: process.env.USER, database: 'postgres' };
const TEST_DB = 'n2store_returns_test';

async function main() {
    const admin = new Client(ADMIN);
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
    await admin.end();

    const pool = new Pool({ host: 'localhost', user: process.env.USER, database: TEST_DB });
    let failed = false;
    const ok = (m) => console.log('  ✓', m);
    const bad = (m) => {
        console.error('  ✗', m);
        failed = true;
    };

    try {
        // Bảng phụ thuộc tối thiểu (web2_products) để test return_qty + stock.
        await pool.query(`
            CREATE TABLE web2_products (
                code VARCHAR(40) PRIMARY KEY, name VARCHAR(255),
                stock INTEGER NOT NULL DEFAULT 0, updated_at BIGINT
            );
            INSERT INTO web2_products(code,name,stock,updated_at) VALUES
              ('A1','Áo',10,0),('B2','Quần',5,0);
        `);

        // ---- Replay ensureTables SQL của web2-returns.js ----
        await pool.query(
            `ALTER TABLE IF EXISTS web2_products ADD COLUMN IF NOT EXISTS return_qty INTEGER NOT NULL DEFAULT 0;`
        );
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_returns (
                id BIGSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL,
                phone VARCHAR(40), customer_name VARCHAR(255), customer_id BIGINT,
                method VARCHAR(20) NOT NULL, sub_type VARCHAR(20) NOT NULL,
                reason VARCHAR(20), reason_note TEXT,
                source_order_code VARCHAR(40), source_order_type VARCHAR(20),
                items JSONB NOT NULL DEFAULT '[]'::jsonb,
                total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
                wallet_credited NUMERIC(14,2) NOT NULL DEFAULT 0, wallet_tx_id BIGINT,
                stock_status VARCHAR(20) NOT NULL DEFAULT 'applied',
                approved_at BIGINT, approved_by VARCHAR(255),
                bill_status VARCHAR(20), consumed_pbh_code VARCHAR(40),
                status VARCHAR(20) NOT NULL DEFAULT 'active', note TEXT,
                history JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
                created_by VARCHAR(100), created_by_name VARCHAR(255)
            );
            CREATE INDEX IF NOT EXISTS idx_web2_returns_phone ON web2_returns(phone);
        `);
        ok('ensureTables SQL valid (web2_returns + return_qty)');

        // Idempotency: chạy lại không lỗi.
        await pool.query(
            `ALTER TABLE IF EXISTS web2_products ADD COLUMN IF NOT EXISTS return_qty INTEGER NOT NULL DEFAULT 0;`
        );
        ok('ALTER return_qty idempotent');

        // ---- Khách gửi: stock += ngay ----
        await pool.query(`UPDATE web2_products SET stock = GREATEST(0, stock + 3) WHERE code='A1'`);
        let s = (await pool.query(`SELECT stock FROM web2_products WHERE code='A1'`)).rows[0].stock;
        s === 13 ? ok('khach_gui: stock 10→13') : bad('khach_gui stock = ' + s);

        // ---- Shipper gửi: return_qty += (pending) ----
        await pool.query(
            `UPDATE web2_products SET return_qty = GREATEST(0, return_qty + 2) WHERE code='B2'`
        );
        let rq = (await pool.query(`SELECT return_qty,stock FROM web2_products WHERE code='B2'`))
            .rows[0];
        rq.return_qty === 2 && rq.stock === 5
            ? ok('shipper_gui: return_qty 0→2, stock giữ 5')
            : bad('shipper return_qty=' + rq.return_qty + ' stock=' + rq.stock);

        // ---- Duyệt: return_qty → stock ----
        await pool.query(
            `UPDATE web2_products SET return_qty=GREATEST(0,return_qty-2), stock=stock+2 WHERE code='B2'`
        );
        rq = (await pool.query(`SELECT return_qty,stock FROM web2_products WHERE code='B2'`))
            .rows[0];
        rq.return_qty === 0 && rq.stock === 7
            ? ok('approve: return_qty→0, stock 5→7')
            : bad('approve return_qty=' + rq.return_qty + ' stock=' + rq.stock);

        // ---- Insert phiếu + JSONB items ----
        const now = Date.now();
        await pool.query(
            `INSERT INTO web2_returns (code,phone,method,sub_type,items,total_amount,wallet_credited,stock_status,bill_status,created_at,updated_at)
             VALUES ('TV-20260606-0001','0900000001','khach_gui','thu_ve_1_phan',
               '[{"productCode":"A1","quantity":3,"price":100000}]'::jsonb,300000,300000,'applied','queued',$1,$1)`,
            [now]
        );
        const cnt = (
            await pool.query(`SELECT COUNT(*)::int n FROM web2_returns WHERE bill_status='queued'`)
        ).rows[0].n;
        cnt === 1 ? ok('insert phiếu + queued query OK') : bad('queued count=' + cnt);

        // ---- mark-consumed ----
        await pool.query(
            `UPDATE web2_returns SET bill_status='consumed', consumed_pbh_code='NJ-X' WHERE code='TV-20260606-0001' AND bill_status='queued'`
        );
        const bs = (
            await pool.query(`SELECT bill_status FROM web2_returns WHERE code='TV-20260606-0001'`)
        ).rows[0].bill_status;
        bs === 'consumed' ? ok('mark-consumed OK') : bad('bill_status=' + bs);
    } catch (e) {
        bad('EXCEPTION: ' + e.message);
    } finally {
        await pool.end();
        const a2 = new Client(ADMIN);
        await a2.connect();
        await a2.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await a2.end();
    }

    console.log(failed ? '\n❌ FAILED' : '\n✅ ALL PASS — schema + stock/return flow OK');
    process.exit(failed ? 1 : 0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
