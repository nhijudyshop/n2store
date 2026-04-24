// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString =
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

async function run() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
    });
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected.\n');

        const sqlPath = path.join(__dirname, 'migrations', '065_create_kpi_sale_flag.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('='.repeat(60));
        console.log('Running 065_create_kpi_sale_flag.sql');
        console.log('='.repeat(60));
        await client.query(sql);
        console.log('✓ Migration 065 applied.\n');

        // Verify table + index
        const tbl = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'kpi_sale_flag'
            ORDER BY ordinal_position
        `);
        console.log('kpi_sale_flag columns:');
        for (const r of tbl.rows) {
            console.log(
                `  - ${r.column_name}  ${r.data_type}  nullable=${r.is_nullable}  default=${r.column_default || ''}`
            );
        }

        const idx = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'kpi_sale_flag'
            ORDER BY indexname
        `);
        console.log('\nkpi_sale_flag indexes:');
        for (const r of idx.rows) console.log('  - ' + r.indexname);

        console.log('\n✓ Done.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        if (err.position) console.error('Error position:', err.position);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\nConnection closed.');
    }
}

run();
