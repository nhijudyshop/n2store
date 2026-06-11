#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// TEST migration 075 (wallet refund outbox + fifo idempotency) trên LOCAL DB riêng —
// KHÔNG đụng production. Pattern giống test-migration-social-tags.js:
//   1. CREATE DATABASE n2store_migration_test (local Postgres)
//   2. Shadow schema (customer_wallets, virtual_credits, wallet_transactions, customers,
//      customer_activities, update_updated_at_column) + chạy migration 025 (old constraints)
//   3. PRE: INSERT status='REFUND_DUE' FAIL, amount=0 FAIL (old CHECK chặn)
//   4. Chạy migration 075
//   5. POST: REFUND_DUE OK, amount=0 (marker) OK; fifo gọi 2 lần cùng order →
//      lần 2 'ALREADY_PROCESSED', balance trừ ĐÚNG 1 lần, đúng 1 dòng tx
//   6. Re-run 075 = no-op (idempotent — Render restart chạy lại)
//   7. DROP DATABASE (cleanup)
//
// Chạy: node scripts/test-migration-075-refund-outbox.js
// Env (optional): PGHOST, PGPORT, PGUSER, PGPASSWORD

const fs = require('fs');
const path = require('path');

const PG_PATH = path.join(__dirname, '..', 'render.com', 'node_modules', 'pg');
const { Client } = require(PG_PATH);

const TEST_DB = 'n2store_migration_test';
const MASTER = {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || process.env.USER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: 'postgres',
};
const MIG_DIR = path.join(__dirname, '..', 'render.com', 'migrations');

const log = (...a) => console.log('[TEST-075]', ...a);
let failures = 0;
function assert(cond, name) {
    if (cond) {
        log(`  ✅ PASS: ${name}`);
    } else {
        failures++;
        console.error(`[TEST-075]   ❌ FAIL: ${name}`);
    }
}
async function expectThrow(fn, name) {
    try {
        await fn();
        failures++;
        console.error(`[TEST-075]   ❌ FAIL (expected error): ${name}`);
    } catch (_) {
        log(`  ✅ PASS (blocked as expected): ${name}`);
    }
}

const SHADOW_SCHEMA = `
CREATE TABLE customers (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE);
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TABLE customer_wallets (
  id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE NOT NULL,
  balance DECIMAL(15,2) DEFAULT 0, virtual_balance DECIMAL(15,2) DEFAULT 0,
  total_withdrawn DECIMAL(15,2) DEFAULT 0, total_virtual_used DECIMAL(15,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE virtual_credits (
  id SERIAL PRIMARY KEY, phone VARCHAR(20), status VARCHAR(20) DEFAULT 'ACTIVE',
  original_amount DECIMAL(15,2), remaining_amount DECIMAL(15,2),
  expires_at TIMESTAMP, used_in_orders JSONB DEFAULT '[]'::jsonb, updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE wallet_transactions (
  id SERIAL PRIMARY KEY, phone VARCHAR(20), wallet_id INTEGER, type VARCHAR(30), amount DECIMAL(15,2),
  balance_before DECIMAL(15,2), balance_after DECIMAL(15,2),
  virtual_balance_before DECIMAL(15,2), virtual_balance_after DECIMAL(15,2),
  source VARCHAR(50), reference_type VARCHAR(30), reference_id VARCHAR(100), note TEXT,
  created_by VARCHAR(100), created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE customer_activities (
  id SERIAL PRIMARY KEY, phone VARCHAR(20), customer_id INTEGER, activity_type VARCHAR(50),
  title TEXT, description TEXT, reference_type VARCHAR(30), reference_id VARCHAR(100),
  metadata JSONB, icon VARCHAR(50), color VARCHAR(20), created_by VARCHAR(100), created_at TIMESTAMP DEFAULT NOW()
);
`;

async function run() {
    // Step 1: (re)create test DB
    {
        const master = new Client(MASTER);
        await master.connect();
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await master.query(`CREATE DATABASE ${TEST_DB}`);
        await master.end();
        log(`Created test DB: ${TEST_DB}`);
    }

    const c = new Client({ ...MASTER, database: TEST_DB });
    await c.connect();
    try {
        // Step 2: shadow schema + migration 025 (old constraints)
        await c.query(SHADOW_SCHEMA);
        const sql025 = fs.readFileSync(path.join(MIG_DIR, '025_create_pending_wallet_withdrawals.sql'), 'utf8');
        await c.query(sql025);
        log('Applied shadow schema + migration 025 (OLD constraints)');

        const PHONE = '0123456788';
        await c.query(`INSERT INTO customers (phone) VALUES ($1)`, [PHONE]);

        // Step 3: PRE-075 — old constraints must block the new states
        log('PRE-075 assertions:');
        await expectThrow(
            () => c.query(
                `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
                 VALUES ('ORD-PRE-1', $1, 100, 'FAST_SALE', 'REFUND_DUE')`, [PHONE]),
            "old status CHECK blocks 'REFUND_DUE'"
        );
        await expectThrow(
            () => c.query(
                `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
                 VALUES ('ORD-PRE-2', $1, 0, 'CANCEL_MARKER', 'CANCELLED')`, [PHONE]),
            'old amount CHECK blocks amount = 0'
        );

        // Step 4: apply migration 075
        const sql075 = fs.readFileSync(path.join(MIG_DIR, '075_wallet_refund_outbox.sql'), 'utf8');
        await c.query(sql075);
        log('Applied migration 075');

        // Step 5: POST-075 assertions
        log('POST-075 assertions:');
        await (async () => {
            try {
                await c.query(
                    `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
                     VALUES ('ORD-POST-1', $1, 100, 'FAST_SALE', 'REFUND_DUE')`, [PHONE]);
                assert(true, "REFUND_DUE now allowed");
            } catch (e) {
                assert(false, `REFUND_DUE now allowed (${e.message})`);
            }
        })();
        await (async () => {
            try {
                await c.query(
                    `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
                     VALUES ('ORD-POST-2', $1, 0, 'CANCEL_MARKER', 'CANCELLED')`, [PHONE]);
                assert(true, 'CANCEL_MARKER amount=0 now allowed');
            } catch (e) {
                assert(false, `CANCEL_MARKER amount=0 now allowed (${e.message})`);
            }
        })();

        // fifo idempotency: deduct once, second call must NOT deduct again
        await c.query(`INSERT INTO customer_wallets (phone, balance) VALUES ($1, 1000)`, [PHONE]);
        const r1 = await c.query(`SELECT * FROM wallet_withdraw_fifo($1, 300, 'ORDER-FIFO-1', NULL)`, [PHONE]);
        assert(r1.rows[0].success === true && Number(r1.rows[0].real_used) === 300, 'fifo 1st call deducts 300');
        const bal1 = (await c.query(`SELECT balance FROM customer_wallets WHERE phone=$1`, [PHONE])).rows[0].balance;
        assert(Number(bal1) === 700, `balance is 700 after 1st deduction (got ${bal1})`);

        const r2 = await c.query(`SELECT * FROM wallet_withdraw_fifo($1, 300, 'ORDER-FIFO-1', NULL)`, [PHONE]);
        assert(r2.rows[0].success === true && r2.rows[0].error_message === 'ALREADY_PROCESSED',
            "fifo 2nd call returns ALREADY_PROCESSED");
        assert(Number(r2.rows[0].real_used) === 300, '2nd call reports prior real_used=300');
        const bal2 = (await c.query(`SELECT balance FROM customer_wallets WHERE phone=$1`, [PHONE])).rows[0].balance;
        assert(Number(bal2) === 700, `balance STILL 700 after 2nd call — no double deduction (got ${bal2})`);
        const txCount = (await c.query(
            `SELECT COUNT(*) FROM wallet_transactions WHERE reference_id='ORDER-FIFO-1' AND source='ORDER_PAYMENT' AND type='WITHDRAW'`
        )).rows[0].count;
        assert(Number(txCount) === 1, `exactly 1 WITHDRAW ledger row for the order (got ${txCount})`);

        // Step 6: idempotent re-run (Render restart safety)
        await c.query(sql075);
        await c.query(sql075);
        assert(true, 'migration 075 re-runs are no-ops (no error)');

        log(failures === 0 ? '🎉 ALL ASSERTIONS PASSED' : `⚠️ ${failures} assertion(s) FAILED`);
    } finally {
        await c.end();
        const master = new Client(MASTER);
        await master.connect();
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await master.end();
        log(`Dropped test DB: ${TEST_DB}`);
    }
    process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
    console.error('[TEST-075] FATAL:', err);
    process.exit(1);
});
