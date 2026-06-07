// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// E2E test cho web2-returns trên LOCAL DB ảo (KHÔNG đụng prod). Mount route thật +
// web2-wallet-service thật, seed SP/đơn/ví, gọi HTTP qua mọi luồng. DROP DB cuối.
// Chạy: NODE_PATH=render.com/node_modules node scripts/test-e2e-web2-returns.js
const { Client, Pool } = require('pg');
const express = require('express');
const http = require('http');

const ADMIN = { host: 'localhost', user: process.env.USER, database: 'postgres' };
const DB = 'n2store_returns_e2e';
const PHONE = '0123456788';

let pass = 0,
    fail = 0;
const ok = (m) => {
    console.log('  ✓', m);
    pass++;
};
const bad = (m) => {
    console.error('  ✗', m);
    fail++;
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function seed(pool) {
    await pool.query(`
        CREATE TABLE web2_products (
            id BIGSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL, name VARCHAR(255),
            price NUMERIC(14,2) DEFAULT 0, original_price NUMERIC(14,2) DEFAULT 0,
            stock INTEGER NOT NULL DEFAULT 0, updated_at BIGINT);
        INSERT INTO web2_products(code,name,price,stock,updated_at) VALUES ('TESTSP1','Áo test',100000,10,0);

        CREATE TABLE web2_customer_wallets (
            id BIGSERIAL PRIMARY KEY, phone VARCHAR(40) UNIQUE NOT NULL, customer_id BIGINT,
            balance NUMERIC(15,2) DEFAULT 0, virtual_balance NUMERIC(15,2) DEFAULT 0,
            total_deposited NUMERIC(15,2) DEFAULT 0, total_withdrawn NUMERIC(15,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

        CREATE TABLE web2_wallet_transactions (
            id BIGSERIAL PRIMARY KEY, phone VARCHAR(40), customer_id BIGINT, type VARCHAR(30),
            amount NUMERIC(15,2), balance_before NUMERIC(15,2), balance_after NUMERIC(15,2),
            virtual_balance_before NUMERIC(15,2) DEFAULT 0, virtual_balance_after NUMERIC(15,2) DEFAULT 0,
            source VARCHAR(40), reference_type VARCHAR(40), reference_id VARCHAR(80),
            note TEXT, performed_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

        CREATE TABLE native_orders (
            id BIGSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL, products JSONB DEFAULT '[]'::jsonb,
            total_amount NUMERIC(14,2) DEFAULT 0, phone VARCHAR(40));
        INSERT INTO native_orders(code,products,total_amount,phone) VALUES
          ('NJ-TEST-1','[{"productCode":"TESTSP1","productName":"Áo test","quantity":2,"price":100000}]'::jsonb,200000,'${PHONE}');

        CREATE TABLE fast_sale_orders (
            id BIGSERIAL PRIMARY KEY, number VARCHAR(60) UNIQUE NOT NULL, order_lines JSONB DEFAULT '[]'::jsonb,
            amount_total NUMERIC(15,2) DEFAULT 0, wallet_deducted NUMERIC(15,2) DEFAULT 0,
            partner_phone VARCHAR(40), cash_on_delivery NUMERIC(15,2) DEFAULT 0,
            delivery_price NUMERIC(15,2) DEFAULT 0, source_type VARCHAR(30), source_code VARCHAR(40));
        INSERT INTO fast_sale_orders(number,order_lines,amount_total,wallet_deducted,partner_phone,cash_on_delivery,delivery_price,source_type,source_code)
          VALUES ('PBH-TEST-1','[{"productCode":"TESTSP1","productName":"Áo test","quantity":2,"priceUnit":100000}]'::jsonb,
                  200000,50000,'${PHONE}',180000,20000,'native_order','NJ-TEST-1');
    `);
    // Nạp ví 100.000 qua service thật (đúng luồng)
    const ws = require('../render.com/services/web2-wallet-service');
    await ws.processDeposit(pool, PHONE, 100000, null, 'seed', null, null, null, 'seed');
}

async function balance(pool) {
    const r = await pool.query('SELECT balance FROM web2_customer_wallets WHERE phone=$1', [PHONE]);
    return Number(r.rows[0]?.balance) || 0;
}
async function stockOf(pool) {
    const r = await pool.query('SELECT stock, return_qty FROM web2_products WHERE code=$1', [
        'TESTSP1',
    ]);
    return { stock: Number(r.rows[0].stock), returnQty: Number(r.rows[0].return_qty) };
}

async function main() {
    const a = new Client(ADMIN);
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${DB}`);
    await a.query(`CREATE DATABASE ${DB}`);
    await a.end();

    const pool = new Pool({ host: 'localhost', user: process.env.USER, database: DB });
    let server;
    try {
        await seed(pool);
        ok('seed: SP/native/pbh/ví (ví=100k)');

        // Mount route thật
        const app = express();
        app.use(express.json());
        app.locals.web2Db = pool;
        app.use('/api/web2-returns', require('../render.com/routes/web2-returns'));
        await new Promise((res) => {
            server = app.listen(0, res);
        });
        const PORT = server.address().port;
        const base = `http://127.0.0.1:${PORT}/api/web2-returns`;
        const call = async (method, path, body) => {
            const r = await fetch(base + path, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify({ userName: 'tester', ...body }) : undefined,
            });
            return { status: r.status, data: await r.json().catch(() => ({})) };
        };

        // 1) source-order native (cod=0)
        let r = await call('GET', '/source-order/native/NJ-TEST-1');
        r.data.items?.length === 1 && r.data.cod === 0
            ? ok('source-order native: 1 SP, cod=0')
            : bad('source-order native: ' + JSON.stringify(r.data));

        // 2) source-order pbh (amount_total fix → totalAmount + cod)
        r = await call('GET', '/source-order/pbh/PBH-TEST-1');
        near(r.data.totalAmount, 200000) && r.data.cod === 180000 && r.data.ship === 20000
            ? ok('source-order pbh: totalAmount=200k (amount_total), cod=180k, ship=20k')
            : bad('source-order pbh: ' + JSON.stringify(r.data));

        // 3) thu_ve_1_phan + khach_gui → ví +100k, stock +1
        let b0 = await balance(pool),
            s0 = await stockOf(pool);
        r = await call('POST', '', {
            phone: PHONE,
            method: 'khach_gui',
            issue: 'van_de_khach',
            subType: 'thu_ve_1_phan',
            sourceOrderCode: 'NJ-TEST-1',
            sourceOrderType: 'native',
            items: [{ productCode: 'TESTSP1', productName: 'Áo test', quantity: 1, price: 100000 }],
        });
        let b1 = await balance(pool),
            s1 = await stockOf(pool);
        const tv1 = r.data.return?.code;
        r.status === 200 && near(b1 - b0, 100000) && s1.stock - s0.stock === 1
            ? ok(
                  `thu_ve_1_phan khach_gui: ví +100k (${b0}→${b1}), stock +1 (${s0.stock}→${s1.stock})`
              )
            : bad(
                  `thu_ve_1_phan: status=${r.status} ví Δ=${b1 - b0} stockΔ=${s1.stock - s0.stock}`
              );

        // 4) khong_nhan_hang + shipper_gui (pbh, walletDeducted=50k) → ví +50k, return_qty +2 pending
        let b2 = await balance(pool),
            s2 = await stockOf(pool);
        r = await call('POST', '', {
            phone: PHONE,
            method: 'shipper_gui',
            issue: 'van_de_khach',
            subType: 'khong_nhan_hang',
            reason: 'khach_boom',
            sourceOrderCode: 'PBH-TEST-1',
            sourceOrderType: 'pbh',
        });
        let b3 = await balance(pool),
            s3 = await stockOf(pool);
        const tvBoom = r.data.return?.code;
        r.status === 200 &&
        near(b3 - b2, 50000) &&
        s3.returnQty - s2.returnQty === 2 &&
        s3.stock === s2.stock &&
        r.data.return?.stockStatus === 'pending'
            ? ok(`khong_nhan_hang shipper: ví +50k, return_qty +2 pending, stock giữ ${s3.stock}`)
            : bad(
                  `khong_nhan_hang: status=${r.status} víΔ=${b3 - b2} rqΔ=${s3.returnQty - s2.returnQty} stock=${s3.stock} st=${r.data.return?.stockStatus}`
              );

        // 5) approve → return_qty→stock
        r = await call('POST', `/${tvBoom}/approve`, {});
        let s4 = await stockOf(pool);
        r.status === 200 && s4.returnQty === 0 && s4.stock === s3.stock + 2
            ? ok(`approve: return_qty→0, stock +2 (${s3.stock}→${s4.stock})`)
            : bad(`approve: status=${r.status} rq=${s4.returnQty} stock=${s4.stock}`);

        // 6) Vấn đề shipper — tinh_sai_ship: COD giảm, KHÔNG đụng ví
        let b4 = await balance(pool);
        r = await call('POST', '', {
            phone: PHONE,
            method: 'shipper_gui',
            issue: 'van_de_shipper',
            subType: 'cod_shipper',
            reason: 'tinh_sai_ship',
            sourceOrderCode: 'PBH-TEST-1',
            sourceOrderType: 'pbh',
            codReduction: 10000,
        });
        let b5 = await balance(pool);
        r.status === 200 &&
        near(b5, b4) &&
        near(r.data.return?.codReduction, 10000) &&
        near(r.data.return?.payableCarrier, 10000) &&
        near(r.data.return?.walletCredited, 0)
            ? ok('shipper tinh_sai_ship: cod_reduction=10k, payable=10k, ví KHÔNG đổi')
            : bad(
                  `shipper tinh_sai_ship: status=${r.status} ví ${b4}→${b5} ` +
                      JSON.stringify(r.data.return)
              );

        // 7) Vấn đề shipper — tru_cong_no_khach: trừ ví
        let b6 = await balance(pool);
        r = await call('POST', '', {
            phone: PHONE,
            method: 'shipper_gui',
            issue: 'van_de_shipper',
            subType: 'cod_shipper',
            reason: 'tru_cong_no_khach',
            sourceOrderCode: 'PBH-TEST-1',
            sourceOrderType: 'pbh',
            codReduction: 5000,
        });
        let b7 = await balance(pool);
        const tvCod = r.data.return?.code;
        r.status === 200 && near(b6 - b7, 5000) && near(r.data.return?.walletCredited, -5000)
            ? ok(`shipper tru_cong_no_khach: trừ ví 5k (${b6}→${b7}), wallet_credited=-5k`)
            : bad(
                  `shipper tru_cong_no: status=${r.status} víΔ=${b6 - b7} ` +
                      JSON.stringify(r.data.return)
              );

        // 8) tru_cong_no_khach > số dư → 400
        r = await call('POST', '', {
            phone: PHONE,
            method: 'shipper_gui',
            issue: 'van_de_shipper',
            subType: 'cod_shipper',
            reason: 'tru_cong_no_khach',
            sourceOrderCode: 'PBH-TEST-1',
            sourceOrderType: 'pbh',
            codReduction: 99999999,
        });
        r.status === 400 && /không đủ/i.test(r.data.error || '')
            ? ok('shipper tru_cong_no vượt số dư → 400 "Ví khách không đủ"')
            : bad(`shipper over-withdraw: status=${r.status} err=${r.data.error}`);

        // 9) DELETE thu_ve_1_phan → rollback ví -100k, stock -1
        let b8 = await balance(pool),
            s8 = await stockOf(pool);
        r = await call('DELETE', `/${tv1}`, {});
        let b9 = await balance(pool),
            s9 = await stockOf(pool);
        r.status === 200 && near(b8 - b9, 100000) && s8.stock - s9.stock === 1
            ? ok(
                  `DELETE thu_ve_1_phan: rollback ví -100k (${b8}→${b9}), stock -1 (${s8.stock}→${s9.stock})`
              )
            : bad(`DELETE: status=${r.status} víΔ=${b8 - b9} stockΔ=${s8.stock - s9.stock}`);

        // 10) DELETE shipper tru_cong_no → hoàn ví +5k
        let b10 = await balance(pool);
        r = await call('DELETE', `/${tvCod}`, {});
        let b11 = await balance(pool);
        r.status === 200 && near(b11 - b10, 5000)
            ? ok(`DELETE shipper COD: hoàn ví +5k (${b10}→${b11})`)
            : bad(`DELETE COD: status=${r.status} víΔ=${b11 - b10}`);

        // 11) list + pending
        r = await call('GET', '/list');
        const pend = await call('GET', '/pending');
        r.data.success && Array.isArray(r.data.returns) && pend.data.success
            ? ok(`list (${r.data.total} phiếu) + pending OK`)
            : bad('list/pending fail');
    } catch (e) {
        bad('EXCEPTION: ' + e.message);
        console.error(e);
    } finally {
        if (server) server.close();
        await pool.end();
        const a2 = new Client(ADMIN);
        await a2.connect();
        await a2.query(`DROP DATABASE IF EXISTS ${DB}`);
        await a2.end();
    }

    console.log(`\n${fail ? '❌' : '✅'} ${pass} pass · ${fail} fail`);
    process.exit(fail ? 1 : 0);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
