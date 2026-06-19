// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const ws = require('../render.com/services/web2-wallet-service');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_walaudit_test';
async function main() {
    const a = new Pool(ADMIN);
    await a.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
    await a.query(`CREATE DATABASE ${TESTDB}`);
    await a.end();
    const db = new Pool({ ...ADMIN, database: TESTDB });
    let pass = 0,
        fail = 0;
    const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));
    try {
        await db.query(
            `CREATE TABLE web2_customer_wallets (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE, customer_id INTEGER, balance NUMERIC(14,2) DEFAULT 0, virtual_balance NUMERIC(14,2) DEFAULT 0, total_deposited NUMERIC(14,2) DEFAULT 0, total_withdrawn NUMERIC(14,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
        );
        await db.query(
            `CREATE TABLE web2_wallet_transactions (id SERIAL PRIMARY KEY, phone VARCHAR(20), customer_id INTEGER, type TEXT, amount NUMERIC(14,2), balance_before NUMERIC(14,2), balance_after NUMERIC(14,2), virtual_balance_before NUMERIC(14,2), virtual_balance_after NUMERIC(14,2), source TEXT, reference_type TEXT, reference_id TEXT, note TEXT, performed_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
        );
        // processDeposit có performedBy
        const dep = await ws.processDeposit(
            db,
            '0900000001',
            50000,
            null,
            'nạp tay',
            null,
            null,
            null,
            'NV An'
        );
        ok(dep.transaction.performed_by === 'NV An', 'processDeposit ghi performed_by = NV An');
        // processWithdraw có performedBy
        const wd = await ws.processWithdraw(
            db,
            '0900000001',
            20000,
            'manual',
            null,
            'rút',
            'NV Bình'
        );
        ok(wd.transaction.performed_by === 'NV Bình', 'processWithdraw ghi performed_by = NV Bình');
        // không truyền performedBy → null (auto/system)
        const dep2 = await ws.processDeposit(
            db,
            '0900000002',
            30000,
            null,
            'sepay auto',
            null,
            null,
            9999
        );
        ok(dep2.transaction.performed_by === null, 'không truyền performedBy → null (hệ thống)');
        // verify lưu DB
        const r = await db.query(
            `SELECT performed_by, type FROM web2_wallet_transactions ORDER BY id`
        );
        ok(
            r.rows.length === 3 &&
                r.rows[0].performed_by === 'NV An' &&
                r.rows[1].performed_by === 'NV Bình',
            'DB lưu đúng performed_by mỗi giao dịch'
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
