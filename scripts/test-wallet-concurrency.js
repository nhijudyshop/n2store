#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// TEST các bất biến CONCURRENCY của outbox trừ/hoàn ví trên LOCAL DB riêng — KHÔNG đụng prod.
// Import trực tiếp processWithdrawal + executeRefund (logic lõi mà route/cron đều gọi) và
// chạy song song bằng Promise.all:
//   S1 double deduction  → đúng 1 lần trừ, 1 dòng ledger, COMPLETED
//   S2 double refund     → đúng 1 lần hoàn, 1 dòng ORDER_CANCEL_REFUND, REFUNDED
//   S3 CANCEL_MARKER     → UNIQUE(order_id,phone) chặn trừ trùng; processWithdrawal KHÔNG claim CANCELLED
//   S4 stuck PROCESSING  → reclaim sau 10' rồi hoàn tất
//
// Chạy: node scripts/test-wallet-concurrency.js
// Env (optional): PGHOST, PGPORT, PGUSER, PGPASSWORD

const fs = require('fs');
const path = require('path');

const RENDER = path.join(__dirname, '..', 'render.com');
const PG_PATH = path.join(RENDER, 'node_modules', 'pg');
const { Client, Pool } = require(PG_PATH);
const { processWithdrawal } = require(path.join(RENDER, 'routes', 'v2', 'pending-withdrawals'));
const { executeRefund } = require(path.join(RENDER, 'services', 'wallet-refund'));

const TEST_DB = 'n2store_concurrency_test';
const MASTER = {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || process.env.USER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: 'postgres',
};
const MIG_DIR = path.join(RENDER, 'migrations');

const log = (...a) => console.log('[TEST-CONCURRENCY]', ...a);
let failures = 0;
function assert(cond, name) {
    if (cond) log(`  ✅ PASS: ${name}`);
    else { failures++; console.error(`[TEST-CONCURRENCY]   ❌ FAIL: ${name}`); }
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

async function num(pool, q, p) { return Number((await pool.query(q, p)).rows[0].count); }
async function bal(pool, phone) {
    return Number((await pool.query(`SELECT balance FROM customer_wallets WHERE phone=$1`, [phone])).rows[0].balance);
}
async function status(pool, id) {
    return (await pool.query(`SELECT status FROM pending_wallet_withdrawals WHERE id=$1`, [id])).rows[0].status;
}

async function run() {
    {
        const master = new Client(MASTER);
        await master.connect();
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await master.query(`CREATE DATABASE ${TEST_DB}`);
        await master.end();
        log(`Created test DB: ${TEST_DB}`);
    }

    const setup = new Client({ ...MASTER, database: TEST_DB });
    await setup.connect();
    await setup.query(SHADOW_SCHEMA);
    await setup.query(fs.readFileSync(path.join(MIG_DIR, '025_create_pending_wallet_withdrawals.sql'), 'utf8'));
    await setup.query(fs.readFileSync(path.join(MIG_DIR, '075_wallet_refund_outbox.sql'), 'utf8'));
    await setup.end();
    log('Schema + migration 025 + 075 applied');

    const pool = new Pool({ ...MASTER, database: TEST_DB, max: 8 });
    try {
        // ---- S1: double deduction ----
        log('S1 — double deduction (concurrent processWithdrawal x2):');
        const P1 = '0123456788';
        await pool.query(`INSERT INTO customers(phone) VALUES($1)`, [P1]);
        await pool.query(`INSERT INTO customer_wallets (phone, balance) VALUES ($1, 1000)`, [P1]);
        const id1 = (await pool.query(
            `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
             VALUES ('CC-DEDUP-1', $1, 300, 'FAST_SALE', 'PENDING') RETURNING id`, [P1])).rows[0].id;
        await Promise.all([processWithdrawal(pool, id1), processWithdrawal(pool, id1)]);
        assert((await bal(pool, P1)) === 700, 'balance 700 — deducted exactly once');
        assert((await num(pool,
            `SELECT COUNT(*) FROM wallet_transactions WHERE reference_id='CC-DEDUP-1' AND source='ORDER_PAYMENT'`)) === 1,
            'exactly 1 ORDER_PAYMENT ledger row');
        assert((await status(pool, id1)) === 'COMPLETED', 'row COMPLETED');

        // ---- S2: double refund ----
        log('S2 — double refund (concurrent executeRefund x2):');
        const P2 = '0900000002';
        await pool.query(`INSERT INTO customers(phone) VALUES($1)`, [P2]);
        await pool.query(`INSERT INTO customer_wallets (phone, balance) VALUES ($1, 0)`, [P2]);
        const id2 = (await pool.query(
            `INSERT INTO pending_wallet_withdrawals
                (order_id, phone, amount, source, status, real_used, virtual_used, completed_at, refund_requested_at)
             VALUES ('CC-REFUND-1', $1, 300, 'FAST_SALE', 'REFUND_DUE', 300, 0, NOW(), NOW()) RETURNING id`, [P2])).rows[0].id;
        const refunds = await Promise.all([executeRefund(pool, id2), executeRefund(pool, id2)]);
        assert((await bal(pool, P2)) === 300, 'balance credited once = 300');
        assert((await num(pool,
            `SELECT COUNT(*) FROM wallet_transactions WHERE reference_id='CC-REFUND-1' AND source='ORDER_CANCEL_REFUND'`)) === 1,
            'exactly 1 ORDER_CANCEL_REFUND ledger row');
        assert((await status(pool, id2)) === 'REFUNDED', 'row REFUNDED');
        assert(refunds.filter((r) => r && r.refunded && !r.already_refunded).length === 1,
            'exactly one executor performed the actual credit');

        // ---- S3: CANCEL_MARKER blocks deduction ----
        log('S3 — CANCEL_MARKER + UNIQUE blocks late deduction:');
        const P3 = '0900000003';
        await pool.query(`INSERT INTO customers(phone) VALUES($1)`, [P3]);
        await pool.query(`INSERT INTO customer_wallets (phone, balance) VALUES ($1, 1000)`, [P3]);
        const markerId = (await pool.query(
            `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
             VALUES ('CC-MARK-1', $1, 0, 'CANCEL_MARKER', 'CANCELLED') RETURNING id`, [P3])).rows[0].id;
        let unique = false;
        try {
            await pool.query(
                `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status)
                 VALUES ('CC-MARK-1', $1, 300, 'FAST_SALE', 'PENDING')`, [P3]);
        } catch (e) { unique = e.code === '23505'; }
        assert(unique, 'UNIQUE(order_id,phone) blocks a duplicate deduction insert');
        const pm = await processWithdrawal(pool, markerId);
        assert(pm.success === false, 'processWithdrawal does NOT claim a CANCELLED marker row');
        assert((await bal(pool, P3)) === 1000, 'wallet untouched (1000)');

        // ---- S4: stuck PROCESSING recovery ----
        log('S4 — stuck PROCESSING (>10min) is reclaimed:');
        const P4 = '0900000004';
        await pool.query(`INSERT INTO customers(phone) VALUES($1)`, [P4]);
        await pool.query(`INSERT INTO customer_wallets (phone, balance) VALUES ($1, 1000)`, [P4]);
        const stuckId = (await pool.query(
            `INSERT INTO pending_wallet_withdrawals (order_id, phone, amount, source, status, updated_at)
             VALUES ('CC-STUCK-1', $1, 200, 'FAST_SALE', 'PROCESSING', NOW() - INTERVAL '11 minutes') RETURNING id`, [P4])).rows[0].id;
        const sr = await processWithdrawal(pool, stuckId);
        assert(sr.success === true, 'reclaimed + processed');
        assert((await status(pool, stuckId)) === 'COMPLETED', 'now COMPLETED');
        assert((await bal(pool, P4)) === 800, 'deducted 200 -> 800');

        log(failures === 0 ? '🎉 ALL CONCURRENCY ASSERTIONS PASSED' : `⚠️ ${failures} assertion(s) FAILED`);
    } finally {
        await pool.end();
        const master = new Client(MASTER);
        await master.connect();
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await master.end();
        log(`Dropped test DB: ${TEST_DB}`);
    }
    process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
    console.error('[TEST-CONCURRENCY] FATAL:', err);
    process.exit(1);
});
