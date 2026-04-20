// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migration 061 Runner: Normalize wallet/virtual_credit note format.
 *
 * Modes:
 *   --dry-run   Preview: count rows sẽ bị ảnh hưởng + 5 sample rows (DEFAULT — KHÔNG UPDATE).
 *   --apply     Chạy migration thật (backup + transform inside transaction).
 *   --rollback  Restore note cũ từ wallet_note_backup_061.
 *   --verify    In stats before/after (không thay đổi data).
 *
 * Ví dụ:
 *   node 061_run_normalize_note.js --dry-run
 *   node 061_run_normalize_note.js --apply
 *   node 061_run_normalize_note.js --rollback
 *   node 061_run_normalize_note.js --verify
 *
 * Biến env: DATABASE_URL (bắt buộc hoặc pass qua CLI arg)
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL
    || 'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const MIGRATION_SQL = path.join(__dirname, '061_normalize_wallet_note_format.sql');
const ROLLBACK_SQL = path.join(__dirname, '061_rollback_normalize_wallet_note.sql');

function parseArgs() {
    const args = process.argv.slice(2);
    return {
        dryRun: args.includes('--dry-run') || args.length === 0,
        apply: args.includes('--apply'),
        rollback: args.includes('--rollback'),
        verify: args.includes('--verify'),
    };
}

async function countAffected(client) {
    const vc = await client.query(`
        SELECT COUNT(*)::int AS n FROM virtual_credits vc
        WHERE vc.source_type = 'RETURN_SHIPPER'
          AND vc.note IS NOT NULL
          AND vc.note NOT LIKE 'Công Nợ Ảo Từ%'
    `);
    const wtMirror = await client.query(`
        SELECT COUNT(*)::int AS n FROM wallet_transactions wt
        WHERE wt.type = 'VIRTUAL_CREDIT'
          AND wt.source = 'VIRTUAL_CREDIT_ISSUE'
          AND wt.reference_id ~ '^[0-9]+$'
          AND wt.note IS NOT NULL
          AND wt.note NOT LIKE 'Công Nợ Ảo Từ%'
          AND EXISTS (
              SELECT 1 FROM virtual_credits vc
              WHERE vc.id = wt.reference_id::INTEGER
                AND vc.source_type = 'RETURN_SHIPPER'
          )
    `);
    const wtReturnGoods = await client.query(`
        SELECT COUNT(*)::int AS n FROM wallet_transactions wt
        JOIN customer_tickets ct ON ct.ticket_code = wt.reference_id
        WHERE wt.source = 'RETURN_GOODS'
          AND wt.note IS NOT NULL
          AND wt.note NOT LIKE 'Công Nợ Ảo Từ%'
    `);
    return {
        virtualCredits: vc.rows[0].n,
        walletTxMirror: wtMirror.rows[0].n,
        walletTxReturnGoods: wtReturnGoods.rows[0].n,
    };
}

async function sampleRows(client, limit = 5) {
    const vc = await client.query(`
        SELECT vc.id, vc.source_id, vc.note AS old_note,
               ct.order_id, ct.ticket_code, ct.internal_note,
               CASE
                   WHEN ct.internal_note IS NOT NULL AND TRIM(ct.internal_note) <> ''
                       THEN 'Công Nợ Ảo Từ Thu Về (' || COALESCE(ct.order_id, ct.ticket_code, vc.source_id) || ') - ' || ct.internal_note
                   ELSE 'Công Nợ Ảo Từ Thu Về (' || COALESCE(ct.order_id, ct.ticket_code, vc.source_id) || ')'
               END AS new_note
        FROM virtual_credits vc
        LEFT JOIN customer_tickets ct ON (vc.source_id = ct.ticket_code OR vc.source_id = ct.order_id)
        WHERE vc.source_type = 'RETURN_SHIPPER'
          AND vc.note IS NOT NULL
          AND vc.note NOT LIKE 'Công Nợ Ảo Từ%'
        LIMIT $1
    `, [limit]);

    const wt = await client.query(`
        SELECT wt.id, wt.reference_id, wt.source, wt.note AS old_note,
               ct.order_id, ct.ticket_code, ct.internal_note,
               CASE
                   WHEN ct.internal_note IS NOT NULL AND TRIM(ct.internal_note) <> ''
                       THEN 'Công Nợ Ảo Từ Khách Gửi (' || COALESCE(ct.order_id, ct.ticket_code) || ') - ' || ct.internal_note
                   ELSE 'Công Nợ Ảo Từ Khách Gửi (' || COALESCE(ct.order_id, ct.ticket_code) || ')'
               END AS new_note
        FROM wallet_transactions wt
        JOIN customer_tickets ct ON ct.ticket_code = wt.reference_id
        WHERE wt.source = 'RETURN_GOODS'
          AND wt.note IS NOT NULL
          AND wt.note NOT LIKE 'Công Nợ Ảo Từ%'
        LIMIT $1
    `, [limit]);

    return { virtualCredits: vc.rows, walletTxReturnGoods: wt.rows };
}

async function verifyStats(client) {
    const transformed = await client.query(`
        SELECT
            (SELECT COUNT(*)::int FROM virtual_credits
                WHERE source_type = 'RETURN_SHIPPER' AND note LIKE 'Công Nợ Ảo Từ%') AS vc_transformed,
            (SELECT COUNT(*)::int FROM wallet_transactions
                WHERE note LIKE 'Công Nợ Ảo Từ%') AS wt_transformed,
            (SELECT COUNT(*)::int FROM wallet_note_backup_061) AS backup_rows
    `);
    return transformed.rows[0];
}

async function dryRun() {
    const client = await pool.connect();
    try {
        console.log('\n🔍 DRY-RUN — Không thay đổi data\n');
        const counts = await countAffected(client);
        console.log('📊 Rows sẽ bị transform:');
        console.log(`   virtual_credits (RETURN_SHIPPER):       ${counts.virtualCredits}`);
        console.log(`   wallet_transactions (VC mirror):        ${counts.walletTxMirror}`);
        console.log(`   wallet_transactions (RETURN_GOODS):     ${counts.walletTxReturnGoods}`);
        console.log(`   TỔNG:                                    ${counts.virtualCredits + counts.walletTxMirror + counts.walletTxReturnGoods}\n`);

        const samples = await sampleRows(client, 5);
        if (samples.virtualCredits.length > 0) {
            console.log('📝 Sample virtual_credits transform (5 rows đầu):');
            samples.virtualCredits.forEach((r, i) => {
                console.log(`   [${i + 1}] id=${r.id}`);
                console.log(`       OLD: ${r.old_note}`);
                console.log(`       NEW: ${r.new_note}`);
            });
            console.log('');
        }
        if (samples.walletTxReturnGoods.length > 0) {
            console.log('📝 Sample wallet_transactions RETURN_GOODS transform (5 rows đầu):');
            samples.walletTxReturnGoods.forEach((r, i) => {
                console.log(`   [${i + 1}] id=${r.id}`);
                console.log(`       OLD: ${r.old_note}`);
                console.log(`       NEW: ${r.new_note}`);
            });
            console.log('');
        }

        console.log('✅ DRY-RUN hoàn tất. Kiểm tra kỹ output trên.');
        console.log('👉 Để apply thật, chạy: node 061_run_normalize_note.js --apply');
        console.log('👉 Để rollback sau khi apply, chạy: node 061_run_normalize_note.js --rollback\n');
    } finally {
        client.release();
    }
}

async function apply() {
    const client = await pool.connect();
    try {
        console.log('\n🚀 APPLY MIGRATION 061 — Normalize wallet note format\n');

        // Count before
        const before = await countAffected(client);
        console.log('📊 Trước khi apply:');
        console.log(`   virtual_credits:                 ${before.virtualCredits}`);
        console.log(`   wallet_transactions (VC mirror): ${before.walletTxMirror}`);
        console.log(`   wallet_transactions (RG):        ${before.walletTxReturnGoods}\n`);

        if (before.virtualCredits + before.walletTxMirror + before.walletTxReturnGoods === 0) {
            console.log('ℹ️  Không có rows nào cần transform. Thoát.\n');
            return;
        }

        // Run SQL inside transaction
        const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');
        console.log('⚙️  Đang chạy SQL migration...');
        await client.query('BEGIN');
        try {
            await client.query(sql);
            await client.query('COMMIT');
            console.log('   ✅ COMMIT thành công\n');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }

        // Count after
        const after = await countAffected(client);
        const stats = await verifyStats(client);
        console.log('📊 Sau khi apply:');
        console.log(`   virtual_credits còn lại chưa transform:        ${after.virtualCredits}`);
        console.log(`   wallet_transactions (VC mirror) còn lại:       ${after.walletTxMirror}`);
        console.log(`   wallet_transactions (RG) còn lại:              ${after.walletTxReturnGoods}`);
        console.log(`   virtual_credits đã transform:                  ${stats.vc_transformed}`);
        console.log(`   wallet_transactions đã transform:              ${stats.wt_transformed}`);
        console.log(`   Rows trong backup table:                       ${stats.backup_rows}\n`);

        console.log('✅ Migration hoàn tất.');
        console.log('👉 Rollback nếu cần: node 061_run_normalize_note.js --rollback\n');
    } finally {
        client.release();
    }
}

async function rollback() {
    const client = await pool.connect();
    try {
        console.log('\n⏪ ROLLBACK MIGRATION 061\n');

        const backupCount = await client.query(`SELECT COUNT(*)::int AS n FROM wallet_note_backup_061`);
        const n = backupCount.rows[0].n;
        if (n === 0) {
            console.log('⚠️  Backup table trống — không có gì để rollback.\n');
            return;
        }
        console.log(`📦 Backup table có ${n} rows. Đang restore...\n`);

        const sql = fs.readFileSync(ROLLBACK_SQL, 'utf8');
        await client.query('BEGIN');
        try {
            await client.query(sql);
            await client.query('COMMIT');
            console.log('   ✅ COMMIT thành công\n');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }

        const stats = await verifyStats(client);
        console.log('📊 Sau rollback:');
        console.log(`   virtual_credits còn prefix mới:     ${stats.vc_transformed}`);
        console.log(`   wallet_transactions còn prefix mới: ${stats.wt_transformed}`);
        console.log(`   Backup rows (giữ nguyên):           ${stats.backup_rows}\n`);
        console.log('✅ Rollback hoàn tất. Backup table KHÔNG bị xoá (audit trail).\n');
    } finally {
        client.release();
    }
}

async function verify() {
    const client = await pool.connect();
    try {
        console.log('\n🔎 VERIFY STATS\n');
        const counts = await countAffected(client);
        const stats = await verifyStats(client);
        console.log('📊 Rows CHƯA transform (sẽ bị ảnh hưởng nếu apply):');
        console.log(`   virtual_credits:                 ${counts.virtualCredits}`);
        console.log(`   wallet_transactions (VC mirror): ${counts.walletTxMirror}`);
        console.log(`   wallet_transactions (RG):        ${counts.walletTxReturnGoods}\n`);
        console.log('📊 Rows ĐÃ transform (format mới):');
        console.log(`   virtual_credits:                 ${stats.vc_transformed}`);
        console.log(`   wallet_transactions:             ${stats.wt_transformed}`);
        console.log(`   Rows trong backup table:         ${stats.backup_rows}\n`);
    } finally {
        client.release();
    }
}

async function main() {
    const args = parseArgs();
    try {
        if (args.rollback) await rollback();
        else if (args.verify) await verify();
        else if (args.apply) await apply();
        else await dryRun();
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
