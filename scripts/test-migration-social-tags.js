#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Mục đích: TEST migration `social_tags.id VARCHAR(50) → VARCHAR(255)` AN TOÀN trên LOCAL DB
// — KHÔNG đụng production. User yêu cầu: "tạo db test riêng → copy ít dữ liệu thật → xóa
// db test đi".
//
// Quy trình:
//   1. CREATE DATABASE n2store_migration_test (local Postgres trên 127.0.0.1:5432)
//   2. CREATE TABLE social_tags với schema CŨ (VARCHAR(50))
//   3. (Optional) Copy 5 row mẫu từ prod (chỉ READ, qua psql remote read-only)
//   4. Verify PRE: insert id 60 chars → FAIL "value too long" (giống bug user gặp)
//   5. CHẠY block migration của social-orders.js trên local DB
//   6. Verify POST: insert id 60 chars → SUCCESS
//   7. DROP DATABASE n2store_migration_test (cleanup hoàn toàn)
//
// User chạy: node scripts/test-migration-social-tags.js [--copy-prod]
// Nếu --copy-prod: dump social_tags từ prod (READ ONLY) qua psql, INSERT vào local.
// Mặc định: chỉ FAKE data — không touch prod.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PG_PATH = path.join(__dirname, '..', 'render.com', 'node_modules', 'pg');
const { Client } = require(PG_PATH);

const ARGS = (() => {
    const a = process.argv.slice(2);
    return { copyProd: a.includes('--copy-prod') };
})();

const TEST_DB = 'n2store_migration_test';
const LOCAL_PG = {
    host: '127.0.0.1',
    port: 5432,
    user: process.env.USER || 'mac',
    database: 'postgres', // master DB to issue CREATE/DROP
};

const log = (...a) => console.log('[TEST-MIGRATION]', ...a);

const MIGRATION_SQL = `
DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'social_tags'
          AND column_name = 'id'
          AND character_maximum_length = 50
    ) THEN
        ALTER TABLE social_tags ALTER COLUMN id TYPE VARCHAR(255);
        RAISE NOTICE 'social_tags.id extended VARCHAR(50) -> VARCHAR(255)';
    END IF;
END $migration$;
`;

async function run() {
    // Step 1: Create test DB via master connection
    {
        const master = new Client(LOCAL_PG);
        await master.connect();
        log('Connected local Postgres (master)');
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        await master.query(`CREATE DATABASE ${TEST_DB}`);
        log(`Created test DB: ${TEST_DB}`);
        await master.end();
    }

    // Step 2: Connect to test DB
    const c = new Client({ ...LOCAL_PG, database: TEST_DB });
    await c.connect();

    try {
        // Create OLD schema (VARCHAR(50)) to simulate pre-migration state
        await c.query(`
            CREATE TABLE social_tags (
                id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255),
                color VARCHAR(20),
                image TEXT,
                updated_at BIGINT
            )
        `);
        log('Created shadow social_tags with VARCHAR(50)');

        // Step 3: Optionally copy real data
        let sampleCount = 0;
        if (ARGS.copyProd) {
            log('--copy-prod: dump 5 short rows from prod (read-only)');
            const dumpFile = path.join(__dirname, '..', 'downloads', 'tmp-social-tags-sample.sql');
            const SECRETS = path.join(__dirname, '..', 'serect_dont_push.txt');
            const txt = fs.readFileSync(SECRETS, 'utf8');
            const m = txt.match(/postgresql:\/\/[^\s]+/);
            if (!m) throw new Error('No prod URL in secrets');
            const PROD_URL = m[0];
            const sql = `\\copy (SELECT id,name,color,image,updated_at FROM social_tags WHERE LENGTH(id)<=50 ORDER BY updated_at DESC NULLS LAST LIMIT 5) TO STDOUT WITH CSV`;
            try {
                const out = execSync(`psql "${PROD_URL}" -c "${sql}"`, { encoding: 'utf8' });
                log(`Sampled ${out.split('\n').filter(Boolean).length} rows from prod`);
                const rows = out
                    .split('\n')
                    .filter(Boolean)
                    .map((line) => line.split(',').map((v) => (v === '' ? null : v)));
                for (const r of rows) {
                    await c.query(
                        `INSERT INTO social_tags(id,name,color,image,updated_at) VALUES ($1,$2,$3,$4,$5)`,
                        [r[0], r[1], r[2], r[3], r[4] ? Number(r[4]) : null]
                    );
                    sampleCount++;
                }
            } catch (e) {
                log('Copy from prod failed (non-blocking):', e.message.slice(0, 100));
            }
        }
        if (sampleCount === 0) {
            // Fallback: fake data
            const fake = [
                { id: 'tag-test-001', name: 'Tag A', color: '#ff0000', updated_at: Date.now() },
                { id: 'tag-test-002', name: 'Tag B', color: '#00ff00', updated_at: Date.now() },
                { id: 'tag-test-003', name: 'Tag C', color: '#0000ff', updated_at: Date.now() },
            ];
            for (const r of fake) {
                await c.query(
                    `INSERT INTO social_tags(id,name,color,updated_at) VALUES ($1,$2,$3,$4)`,
                    [r.id, r.name, r.color, r.updated_at]
                );
            }
            log(`Inserted ${fake.length} fake rows (no --copy-prod)`);
        }

        // Step 4: PRE-MIGRATION test — insert id 60 chars must FAIL
        const longId = 'x'.repeat(60);
        let preFail = false;
        try {
            await c.query(`INSERT INTO social_tags(id,name) VALUES ($1, 'preflight')`, [longId]);
        } catch (e) {
            preFail = e.message.includes('value too long');
            log(
                'PRE: insert id(60 chars) →',
                preFail ? 'FAIL "value too long" ✓ (đúng bug)' : `unexpected: ${e.message}`
            );
        }
        if (!preFail) {
            throw new Error('PRE-CHECK: expected insert id(60) to fail, but it succeeded');
        }

        // Step 5: Apply migration
        await c.query(MIGRATION_SQL);
        log('Migration applied');

        // Verify column type
        const colInfo = await c.query(
            `SELECT character_maximum_length FROM information_schema.columns
             WHERE table_name='social_tags' AND column_name='id'`
        );
        const newLen = colInfo.rows[0]?.character_maximum_length;
        log(`Column id length after migration: ${newLen}`);

        // Step 6: POST-MIGRATION test — insert id 60 chars must SUCCEED
        let postOk = false;
        try {
            await c.query(`INSERT INTO social_tags(id,name) VALUES ($1, 'postflight')`, [longId]);
            postOk = true;
        } catch (e) {
            log('POST: insert id(60 chars) → unexpected fail:', e.message);
        }
        log('POST: insert id(60 chars) →', postOk ? 'SUCCESS ✓' : 'FAIL ✗');

        // Step 7: Idempotency — re-run migration must be no-op
        await c.query(MIGRATION_SQL);
        log('Idempotency: re-run migration → no error ✓');

        const verdict = preFail && postOk && newLen === 255;
        log('═════════════════════════════════════════');
        log(verdict ? '✅ MIGRATION TEST PASS' : '❌ MIGRATION TEST FAIL');
        log('═════════════════════════════════════════');
        process.exitCode = verdict ? 0 : 1;
    } finally {
        await c.end();
    }

    // Step 8: Drop test DB
    {
        const master = new Client(LOCAL_PG);
        await master.connect();
        await master.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
        log(`Dropped test DB: ${TEST_DB} (no residue)`);
        await master.end();
    }
}

run().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
