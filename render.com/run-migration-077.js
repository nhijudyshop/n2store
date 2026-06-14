// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Manual runner cho migration 077. Thường KHÔNG cần — route /kpi-livestream-flag
// tự ensure bảng (lazy CREATE TABLE IF NOT EXISTS) khi gọi lần đầu. Chỉ dùng khi
// muốn tạo bảng + verify trước.
// Dùng env DATABASE_URL (KHÔNG hardcode credential — theo CLAUDE.md security rules):
//   DATABASE_URL="postgresql://..." node render.com/run-migration-077.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('Missing DATABASE_URL env var (connection string của n2store_chat / Web 1.0).');
    process.exit(1);
}

async function run() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
    });
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected.\n');

        const sqlPath = path.join(__dirname, 'migrations', '077_create_kpi_livestream_flag.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('='.repeat(60));
        console.log('Running 077_create_kpi_livestream_flag.sql');
        console.log('='.repeat(60));
        await client.query(sql);
        console.log('✓ Migration 077 applied.\n');

        // Verify table + index
        const tbl = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'kpi_livestream_flag'
            ORDER BY ordinal_position
        `);
        console.log('kpi_livestream_flag columns:');
        for (const r of tbl.rows) {
            console.log(
                `  - ${r.column_name}  ${r.data_type}  nullable=${r.is_nullable}  default=${r.column_default || ''}`
            );
        }

        const idx = await client.query(`
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'kpi_livestream_flag'
            ORDER BY indexname
        `);
        console.log('\nkpi_livestream_flag indexes:');
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
