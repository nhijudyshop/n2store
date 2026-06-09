// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 test — gate auto-gán SePay theo đơn active.
// Test _hasActiveOrder: chỉ pass khi KH có đơn live chiến dịch mới nhất per page
// HOẶC đơn inbox chưa huỷ. Local throwaway DB.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const m = require('../render.com/services/web2-sepay-matching');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const DB = 'n2store_sepaygate_test';

let pass = 0,
    fail = 0;
const ok = (c, msg) => (c ? (pass++, console.log('✅', msg)) : (fail++, console.log('❌', msg)));

async function main() {
    const a = new Pool(ADMIN);
    await a.query(`DROP DATABASE IF EXISTS ${DB}`);
    await a.query(`CREATE DATABASE ${DB}`);
    await a.end();
    const db = new Pool({ ...ADMIN, database: DB });
    try {
        await db.query(`CREATE TABLE native_orders (
            id SERIAL PRIMARY KEY, code VARCHAR(40), phone VARCHAR(40), status VARCHAR(20) DEFAULT 'draft',
            channel VARCHAR(20) DEFAULT 'web2_livestream', fb_page_id VARCHAR(100),
            live_campaign_id VARCHAR(100), created_at BIGINT,
            customer_name VARCHAR(255), customer_id INTEGER)`);
        const ins = (o) =>
            db.query(
                `INSERT INTO native_orders (code,phone,status,channel,fb_page_id,live_campaign_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    o.code,
                    o.phone,
                    o.status || 'draft',
                    o.channel || 'web2_livestream',
                    o.page || null,
                    o.camp || null,
                    o.at || Date.now(),
                ]
            );

        // House (PAGE_H): camp cũ C1 → camp mới C2. Store (PAGE_S): camp S1 mới nhất.
        const now = Date.now();
        await ins({
            code: 'OLD-H',
            phone: '0900000001',
            page: 'PAGE_H',
            camp: 'C1',
            at: now - 1000000,
        }); // live cũ
        await ins({ code: 'NEW-H', phone: '0900000002', page: 'PAGE_H', camp: 'C2', at: now }); // live mới nhất House
        await ins({ code: 'NEW-S', phone: '0900000003', page: 'PAGE_S', camp: 'S1', at: now }); // live mới nhất Store
        await ins({
            code: 'INBOX',
            phone: '0900000004',
            channel: 'web2_inbox',
            page: 'PAGE_H',
            at: now,
        }); // inbox
        await ins({
            code: 'CANCEL',
            phone: '0900000005',
            channel: 'web2_inbox',
            status: 'cancelled',
            at: now,
        }); // inbox huỷ
        await ins({
            code: 'OLDH2',
            phone: '0900000002',
            page: 'PAGE_H',
            camp: 'C1',
            at: now - 2000000,
        }); // KH NEW-H cũng có đơn cũ (vẫn pass vì có NEW-H)

        ok(
            (await m._hasActiveOrder(db, '0900000002')) === true,
            'KH có đơn LIVE chiến dịch mới nhất (C2 House) → PASS'
        );
        ok(
            (await m._hasActiveOrder(db, '0900000003')) === true,
            'KH có đơn LIVE chiến dịch mới nhất (S1 Store) → PASS'
        );
        ok((await m._hasActiveOrder(db, '0900000004')) === true, 'KH có đơn INBOX chưa huỷ → PASS');
        ok(
            (await m._hasActiveOrder(db, '0900000001')) === false,
            'KH CHỈ có đơn live chiến dịch CŨ (C1) → BLOCK'
        );
        ok(
            (await m._hasActiveOrder(db, '0900000005')) === false,
            'KH chỉ có đơn inbox ĐÃ HUỶ → BLOCK'
        );
        ok((await m._hasActiveOrder(db, '0900000099')) === false, 'KH KHÔNG có đơn nào → BLOCK');
        ok((await m._hasActiveOrder(db, '')) === false, 'phone rỗng → BLOCK');

        // Biến thể SĐT (normalize): '84900000002' đuôi khớp '0900000002'
        ok((await m._hasActiveOrder(db, '84900000002')) === true, 'normalize đuôi SĐT → PASS');

        // Part 1 (2026-06-09): _findActiveOrderByPhone trả IDENTITY của ĐƠN
        // (tên/customer_id/phone chuẩn) — dùng làm chân lý gán, chống trùng kho.
        await db.query(
            `INSERT INTO native_orders (code,phone,status,channel,fb_page_id,live_campaign_id,created_at,customer_name,customer_id)
             VALUES ('IDT','0900000006','draft','web2_inbox','PAGE_H',NULL,$1,'Nguyễn Văn Đơn',778899)`,
            [now]
        );
        const found = await m._findActiveOrderByPhone(db, '0900000006');
        ok(
            found &&
                found.customer_name === 'Nguyễn Văn Đơn' &&
                Number(found.customer_id) === 778899,
            'order-identity: trả đúng tên + customer_id của đơn'
        );
        ok(
            (await m._findActiveOrderByPhone(db, '0900000099')) === null,
            'order-identity: KH không đơn → null (gate chặn)'
        );
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message, e.stack);
    } finally {
        await db.end();
        const a2 = new Pool(ADMIN);
        await a2.query(`DROP DATABASE IF EXISTS ${DB}`);
        await a2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed --- (test DB dropped)`);
        process.exit(fail ? 1 : 0);
    }
}
main();
