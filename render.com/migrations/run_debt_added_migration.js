// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migration: Add debt_added column to balance_history
 * Run: node run_debt_added_migration.js
 */

const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    const client = await pool.connect();

    try {
        console.log('🚀 Running migration: Add debt_added column...\n');

        // Step 1: Add debt_added column
        console.log('1. Adding debt_added column...');
        await client.query(`
            ALTER TABLE balance_history
            ADD COLUMN IF NOT EXISTS debt_added BOOLEAN DEFAULT FALSE
        `);
        console.log('   ✅ Column added\n');

        // Step 2: Create index for unprocessed transactions
        console.log('2. Creating index idx_balance_history_debt_added...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_balance_history_debt_added
            ON balance_history(debt_added)
            WHERE debt_added = FALSE
        `);
        console.log('   ✅ Index created\n');

        // Step 3: Create composite index
        console.log('3. Creating composite index idx_balance_history_debt_processing...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_balance_history_debt_processing
            ON balance_history(debt_added, transfer_type, content)
            WHERE debt_added = FALSE AND transfer_type = 'in'
        `);
        console.log('   ✅ Composite index created\n');

        // Verify migration
        console.log('4. Verifying migration...');
        const result = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'balance_history' AND column_name = 'debt_added'
        `);

        if (result.rows.length > 0) {
            console.log('   ✅ Column verified:', result.rows[0]);
        }

        // Count unprocessed transactions
        const countResult = await client.query(`
            SELECT COUNT(*) as total FROM balance_history
            WHERE debt_added IS NULL OR debt_added = FALSE
        `);
        console.log(`\n📊 Unprocessed transactions: ${countResult.rows[0].total}`);

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration().catch(console.error);
