// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Apply migration 074 (kpi_final_snapshot). An toàn chạy nhiều lần (CREATE TABLE IF NOT EXISTS).
// Lưu ý: route realtime-db.js cũng tự lazy-ensure bảng này khi endpoint đầu tiên được gọi,
// nên trên Render bảng sẽ tự tạo dù không chạy script này. Script dùng để apply chủ động/local.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString =
    process.env.DATABASE_URL ||
    process.env.CHAT_DATABASE_URL ||
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

        const sqlPath = path.join(__dirname, 'migrations', '074_create_kpi_final_snapshot.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('='.repeat(60));
        console.log('Running 074_create_kpi_final_snapshot.sql');
        console.log('='.repeat(60));
        await client.query(sql);
        console.log('✓ Migration 074 applied.\n');

        const tbl = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'kpi_final_snapshot'
            ORDER BY ordinal_position
        `);
        console.log('kpi_final_snapshot columns:');
        for (const r of tbl.rows) {
            console.log(
                `  - ${r.column_name}  ${r.data_type}  nullable=${r.is_nullable}  default=${r.column_default || ''}`
            );
        }
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
