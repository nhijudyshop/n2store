#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Test migration 069: thêm 4 columns manager_reviewed/manager_review_note/reviewed_by/reviewed_at
// vào wallet_transactions. Pattern: CREATE local DB → schema CŨ → INSERT FAIL → MIGRATE → INSERT OK → DROP DB.

const path = require('path');
const PG_PATH = path.join(__dirname, '..', 'render.com', 'node_modules', 'pg');
const { Client } = require(PG_PATH);

const TEST_DB = 'n2store_migration_test_069';
const LOCAL_PG = {
    host: '127.0.0.1',
    port: 5432,
    user: process.env.USER || 'mac',
    database: 'postgres',
};

const log = (...a) => console.log('[TEST-069]', ...a);

const MIGRATION_SQL = `
ALTER TABLE wallet_transactions
ADD COLUMN IF NOT EXISTS manager_reviewed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS manager_review_note TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_manager_reviewed
ON wallet_transactions(manager_reviewed)
WHERE manager_reviewed = TRUE;
`;

async function run() {
    const master = new Client(LOCAL_PG);
    await master.connect();
    log('Connected local Postgres (master)');
    await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await master.query(`CREATE DATABASE ${TEST_DB}`);
    log(`Created test DB: ${TEST_DB}`);
    await master.end();

    const c = new Client({ ...LOCAL_PG, database: TEST_DB });
    await c.connect();

    let exitCode = 0;
    try {
        // Step 1: Create OLD schema — wallet_transactions WITHOUT manager_* cols
        await c.query(`
            CREATE TABLE wallet_transactions (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20),
                type VARCHAR(50),
                amount NUMERIC,
                balance_before NUMERIC, balance_after NUMERIC,
                virtual_balance_before NUMERIC, virtual_balance_after NUMERIC,
                source TEXT, reference_type VARCHAR(50), reference_id TEXT,
                note TEXT, created_by VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        log('Created shadow wallet_transactions WITHOUT manager_* cols');

        // Insert 1 sample row OK trong schema cũ (sanity)
        await c.query(
            `INSERT INTO wallet_transactions (phone, type, amount, source) VALUES ($1, $2, $3, $4)`,
            ['0123456789', 'VIRTUAL_CREDIT', 100000, 'test']
        );
        log('Sanity insert OK (old schema)');

        // Step 2: PRE-migrate — UPDATE manager_reviewed phải FAIL vì column chưa có
        let preFailed = false;
        try {
            await c.query(`UPDATE wallet_transactions SET manager_reviewed = TRUE WHERE id = 1`);
            log('UNEXPECTED: pre-migrate UPDATE manager_reviewed succeeded');
        } catch (err) {
            if (/column "manager_reviewed" of relation "wallet_transactions" does not exist|column .* does not exist/i.test(err.message)) {
                preFailed = true;
                log('✅ PRE: UPDATE manager_reviewed FAILED as expected:', err.message.split('\n')[0]);
            } else {
                throw err;
            }
        }
        if (!preFailed) throw new Error('PRE-migrate check did not fail — schema may already have columns');

        // Step 3: Run migration
        log('Running migration 069...');
        await c.query(MIGRATION_SQL);
        log('✅ Migration applied');

        // Step 4: POST-migrate — UPDATE phải SUCCESS
        await c.query(
            `UPDATE wallet_transactions SET manager_reviewed = TRUE, reviewed_by = $1, reviewed_at = NOW() WHERE id = 1`,
            ['admin']
        );
        const r = await c.query(
            `SELECT id, manager_reviewed, reviewed_by, reviewed_at FROM wallet_transactions WHERE id = 1`
        );
        log('✅ POST: UPDATE OK — row:', JSON.stringify(r.rows[0]));
        if (r.rows[0].manager_reviewed !== true) {
            throw new Error('manager_reviewed not TRUE after update');
        }

        // Step 5: Idempotency — chạy lại migration không lỗi
        log('Re-running migration (idempotency check)...');
        await c.query(MIGRATION_SQL);
        log('✅ Idempotent: re-run succeeded');

        log('🎉 ALL CHECKS PASSED');
    } catch (err) {
        log('❌ FAILED:', err.message);
        exitCode = 1;
    } finally {
        await c.end();
        const cleanup = new Client(LOCAL_PG);
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await cleanup.end();
        log(`Dropped test DB: ${TEST_DB}`);
    }

    process.exit(exitCode);
}

run().catch((e) => {
    console.error('[TEST-069] fatal:', e);
    process.exit(1);
});
