// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 test — CK cộng ví tự áp vào PBH chưa trả.
// Test applyWalletToUnpaidPbhs: trừ ví theo SĐT vào PBH chưa trả (partial/full,
// campaign mới nhất trước, hết ví dừng). Local throwaway DB, KHÔNG đụng prod.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const fso = require('../render.com/routes/fast-sale-orders');
const wallet = require('../render.com/services/web2-wallet-service');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_walletpbh_test';

async function schema(db) {
    await db.query(
        `CREATE TABLE web2_customer_wallets (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE, customer_id INTEGER, balance NUMERIC(14,2) DEFAULT 0, virtual_balance NUMERIC(14,2) DEFAULT 0, total_deposited NUMERIC(14,2) DEFAULT 0, total_withdrawn NUMERIC(14,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
    );
    await db.query(
        `CREATE TABLE web2_wallet_transactions (id SERIAL PRIMARY KEY, phone VARCHAR(20), customer_id INTEGER, type TEXT, amount NUMERIC(14,2), balance_before NUMERIC(14,2), balance_after NUMERIC(14,2), virtual_balance_before NUMERIC(14,2), virtual_balance_after NUMERIC(14,2), source TEXT, reference_type TEXT, reference_id TEXT, note TEXT, performed_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
    );
    await db.query(
        `CREATE TABLE fast_sale_orders (id SERIAL PRIMARY KEY, number VARCHAR(50) UNIQUE, partner_phone VARCHAR(40), partner_name TEXT, source_type TEXT, source_code VARCHAR(40), state TEXT DEFAULT 'open', residual NUMERIC(15,2) DEFAULT 0, payment_amount NUMERIC(15,2) DEFAULT 0, wallet_deducted NUMERIC(15,2) DEFAULT 0, cash_on_delivery NUMERIC(15,2) DEFAULT 0, amount_total NUMERIC(15,2) DEFAULT 0, date_created TIMESTAMPTZ DEFAULT NOW(), date_updated TIMESTAMPTZ DEFAULT NOW())`
    );
}
let pass = 0,
    fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));
const setBal = (db, phone, bal) =>
    db.query(
        `INSERT INTO web2_customer_wallets (phone,balance,total_deposited) VALUES ($1,$2,$2) ON CONFLICT (phone) DO UPDATE SET balance=$2`,
        [phone, bal]
    );
const insPbh = (db, { number, phone, residual, total, created }) =>
    db.query(
        `INSERT INTO fast_sale_orders (number,partner_phone,source_type,source_code,state,residual,cash_on_delivery,amount_total,date_created) VALUES ($1,$2,'native_order',$1,'open',$3,$3,$4,$5)`,
        [number, phone, residual, total || residual, created || new Date()]
    );
const getPbh = async (db, number) =>
    (
        await db.query(
            `SELECT residual, payment_amount, wallet_deducted FROM fast_sale_orders WHERE number=$1`,
            [number]
        )
    ).rows[0];
const getBal = async (db, phone) =>
    Number(
        (await db.query(`SELECT balance FROM web2_customer_wallets WHERE phone=$1`, [phone]))
            .rows[0]?.balance || 0
    );

async function main() {
    const admin = new Pool(ADMIN);
    await admin.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
    await admin.query(`CREATE DATABASE ${TESTDB}`);
    await admin.end();
    const db = new Pool({ ...ADMIN, database: TESTDB });
    try {
        await schema(db);

        // ── C1: ví ĐỦ trả đơn → residual=0 (đã thanh toán), trừ đúng ví
        await setBal(db, '0901234567', 500000);
        await insPbh(db, { number: 'PBH-1', phone: '0901234567', residual: 440000, total: 440000 });
        let res = await fso.applyWalletToUnpaidPbhs(db, '0901234567', 'test');
        let p = await getPbh(db, 'PBH-1');
        ok(
            Number(p.residual) === 0 && Number(p.payment_amount) === 440000,
            'C1 ví đủ → residual=0 (đã thanh toán)'
        );
        ok(Number(p.wallet_deducted) === 440000, 'C1 wallet_deducted=440k');
        ok((await getBal(db, '0901234567')) === 60000, 'C1 ví còn 60k (500k-440k)');
        ok(res.totalDeducted === 440000 && res.appliedCount === 1, 'C1 kết quả đúng');

        // ── C2: ví THIẾU → trả góp (partial), residual = phần còn lại
        await setBal(db, '0902222222', 100000);
        await insPbh(db, { number: 'PBH-2', phone: '0902222222', residual: 300000, total: 300000 });
        await fso.applyWalletToUnpaidPbhs(db, '0902222222', 'test');
        p = await getPbh(db, 'PBH-2');
        ok(
            Number(p.residual) === 200000 && Number(p.payment_amount) === 100000,
            'C2 trả góp → residual=200k còn lại'
        );
        ok((await getBal(db, '0902222222')) === 0, 'C2 ví hết (trừ hết 100k)');

        // ── C3: nhiều PBH cùng SĐT → campaign MỚI NHẤT trước, hết ví thì dừng
        await setBal(db, '0903333333', 250000);
        await insPbh(db, {
            number: 'PBH-OLD',
            phone: '0903333333',
            residual: 200000,
            created: new Date(Date.now() - 86400000),
        });
        await insPbh(db, {
            number: 'PBH-NEW',
            phone: '0903333333',
            residual: 200000,
            created: new Date(),
        });
        await fso.applyWalletToUnpaidPbhs(db, '0903333333', 'test');
        const pNew = await getPbh(db, 'PBH-NEW');
        const pOld = await getPbh(db, 'PBH-OLD');
        ok(Number(pNew.residual) === 0, 'C3 PBH MỚI trả trước → residual=0');
        ok(
            Number(pOld.residual) === 150000,
            'C3 PBH CŨ trả phần dư (250k-200k=50k) → residual=150k'
        );
        ok((await getBal(db, '0903333333')) === 0, 'C3 ví hết');

        // ── C4: ví trống → no-op
        await setBal(db, '0904444444', 0);
        await insPbh(db, { number: 'PBH-4', phone: '0904444444', residual: 100000 });
        res = await fso.applyWalletToUnpaidPbhs(db, '0904444444', 'test');
        p = await getPbh(db, 'PBH-4');
        ok(
            Number(p.residual) === 100000 && res.totalDeducted === 0,
            'C4 ví trống → no-op (residual nguyên)'
        );

        // ── C5: PBH đã huỷ (state=cancel) → KHÔNG trừ
        await setBal(db, '0905555555', 500000);
        await db.query(
            `INSERT INTO fast_sale_orders (number,partner_phone,source_type,source_code,state,residual,cash_on_delivery,amount_total) VALUES ('PBH-CANCEL','0905555555','native_order','PBH-CANCEL','cancel',300000,300000,300000)`
        );
        res = await fso.applyWalletToUnpaidPbhs(db, '0905555555', 'test');
        ok(
            res.totalDeducted === 0 && (await getBal(db, '0905555555')) === 500000,
            'C5 PBH huỷ → KHÔNG trừ ví'
        );

        // ── C6: chạy LẠI sau khi đã trả đủ → idempotent (không trừ thêm)
        const balBefore = await getBal(db, '0901234567'); // 60k từ C1
        await fso.applyWalletToUnpaidPbhs(db, '0901234567', 'test');
        ok(
            (await getBal(db, '0901234567')) === balBefore,
            'C6 chạy lại → idempotent (residual đã 0, không trừ)'
        );

        // ── C7: withdraw tx ghi performed_by (audit)
        const txr = await db.query(
            `SELECT performed_by, reference_type FROM web2_wallet_transactions WHERE reference_id='PBH-1' LIMIT 1`
        );
        ok(
            txr.rows.length === 1 && txr.rows[0].performed_by === 'test',
            'C7 withdraw ghi performed_by audit'
        );
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message, e.stack);
    } finally {
        await db.end();
        const a2 = new Pool(ADMIN);
        await a2.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
        await a2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed --- (test DB dropped)`);
        process.exit(fail ? 1 : 0);
    }
}
main();
