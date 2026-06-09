// #Note: test searchWeb2CustomersByPhone (kho KH thay TPOS). Local throwaway DB.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const s = require('../render.com/db/web2-customers-schema');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const DB = 'n2store_whsearch_test';
let pass = 0,
    fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));
(async () => {
    const a = new Pool(ADMIN);
    await a.query(`DROP DATABASE IF EXISTS ${DB}`);
    await a.query(`CREATE DATABASE ${DB}`);
    await a.end();
    const db = new Pool({ ...ADMIN, database: DB });
    try {
        await db.query(
            `CREATE TABLE web2_customers (id BIGSERIAL PRIMARY KEY, name TEXT, phone VARCHAR(20) UNIQUE, address TEXT, email TEXT, alt_phones JSONB DEFAULT '[]'::jsonb)`
        );
        await db.query(
            `INSERT INTO web2_customers (name,phone,alt_phones) VALUES ('Nguyễn A','0938281118','[]'),('Trần B','0907654321','[\"0912345678\"]'),('Lê C','0938811182','[]')`
        );

        // exact 10 số
        let r = await s.searchWeb2CustomersByPhone(db, '0938281118');
        ok(
            r.success && r.uniquePhones.length === 1 && r.uniquePhones[0].phone === '0938281118',
            'exact 10 số → 1 KH'
        );
        // suffix '81118' → chỉ 0938281118 (endsWith), KHÔNG 0938811182
        r = await s.searchWeb2CustomersByPhone(db, '81118');
        ok(
            r.uniquePhones.length === 1 && r.uniquePhones[0].phone === '0938281118',
            'suffix 81118 → đúng 1 (loại 811182)'
        );
        // alt_phone match → trả về theo PHONE CHÍNH của KH
        r = await s.searchWeb2CustomersByPhone(db, '0912345678');
        ok(
            r.uniquePhones.length === 1 && r.uniquePhones[0].phone === '0907654321',
            'khớp alt_phone → gom theo phone chính (0907654321)'
        );
        // không có
        r = await s.searchWeb2CustomersByPhone(db, '0900000000');
        ok(r.success && r.uniquePhones.length === 0, 'không khớp → rỗng');
        // < 5 digit → rỗng
        r = await s.searchWeb2CustomersByPhone(db, '118');
        ok(r.uniquePhones.length === 0, '<5 số → rỗng (an toàn)');
    } catch (e) {
        fail++;
        console.error('❌ EXC', e.message);
    } finally {
        await db.end();
        const a2 = new Pool(ADMIN);
        await a2.query(`DROP DATABASE IF EXISTS ${DB}`);
        await a2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed ---`);
        process.exit(fail ? 1 : 0);
    }
})();
