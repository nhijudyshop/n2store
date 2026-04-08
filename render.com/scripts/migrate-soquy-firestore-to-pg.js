#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migrate Soquy Firestore backup → Postgres on Render.
 *
 * Reads:  render.com/backups/soquy/soquy-backup-latest.json
 *         (or pass a path: node migrate-soquy-firestore-to-pg.js <file>)
 *
 * Writes: tables soquy_vouchers, soquy_counters, soquy_meta (created by migration 041)
 *
 * Idempotent: uses ON CONFLICT (id) DO UPDATE.
 *
 * Requires env: DATABASE_URL
 */

const path = require('path');
const fs = require('fs');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('[migrate-soquy] DATABASE_URL missing in env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

/**
 * Re-hydrate Firestore-special values serialized by backup-soquy-firestore.js.
 * Timestamps → Date; everything else passed through.
 */
function rehydrate(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(rehydrate);
    if (typeof value === 'object') {
        if (value.__type === 'timestamp') return new Date(value.iso);
        if (value.__type === 'geopoint') return value;   // leave as-is in raw
        if (value.__type === 'docref') return value;
        const out = {};
        for (const k of Object.keys(value)) out[k] = rehydrate(value[k]);
        return out;
    }
    return value;
}

function toTs(v) {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object' && v.__type === 'timestamp') return v.iso;
    return null;
}

async function migrateVouchers(client, docs) {
    const sql = `
        INSERT INTO soquy_vouchers (
            id, code, type, fund_type, category, collector, object_type,
            person_name, person_code, phone, address, amount, note, image_data,
            transfer_content, account_name, account_number, branch, source, source_code,
            business_accounting, status, voucher_date_time, created_at, updated_at,
            created_by, cancelled_at, cancel_reason, raw
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29
        )
        ON CONFLICT (id) DO UPDATE SET
            code=EXCLUDED.code, type=EXCLUDED.type, fund_type=EXCLUDED.fund_type,
            category=EXCLUDED.category, collector=EXCLUDED.collector, object_type=EXCLUDED.object_type,
            person_name=EXCLUDED.person_name, person_code=EXCLUDED.person_code, phone=EXCLUDED.phone,
            address=EXCLUDED.address, amount=EXCLUDED.amount, note=EXCLUDED.note,
            image_data=EXCLUDED.image_data, transfer_content=EXCLUDED.transfer_content,
            account_name=EXCLUDED.account_name, account_number=EXCLUDED.account_number,
            branch=EXCLUDED.branch, source=EXCLUDED.source, source_code=EXCLUDED.source_code,
            business_accounting=EXCLUDED.business_accounting, status=EXCLUDED.status,
            voucher_date_time=EXCLUDED.voucher_date_time, created_at=EXCLUDED.created_at,
            updated_at=EXCLUDED.updated_at, created_by=EXCLUDED.created_by,
            cancelled_at=EXCLUDED.cancelled_at, cancel_reason=EXCLUDED.cancel_reason,
            raw=EXCLUDED.raw
    `;

    let n = 0;
    for (const doc of docs) {
        const d = doc.data || {};
        await client.query(sql, [
            doc.id,
            d.code || null,
            d.type || null,
            d.fundType || null,
            d.category || null,
            d.collector || null,
            d.objectType || null,
            d.personName || null,
            d.personCode || null,
            d.phone || null,
            d.address || null,
            Number(d.amount) || 0,
            d.note || null,
            d.imageData || null,
            d.transferContent || null,
            d.accountName || null,
            d.accountNumber || null,
            d.branch || null,
            d.source || null,
            d.sourceCode || null,
            !!d.businessAccounting,
            d.status || null,
            toTs(d.voucherDateTime),
            toTs(d.createdAt),
            toTs(d.updatedAt),
            d.createdBy || null,
            toTs(d.cancelledAt),
            d.cancelReason || null,
            JSON.stringify(rehydrate(d))
        ]);
        n++;
        if (n % 100 === 0) console.log(`[migrate-soquy] vouchers: ${n}/${docs.length}`);
    }
    console.log(`[migrate-soquy] vouchers: ${n} upserted`);
}

async function migrateCounters(client, docs) {
    const sql = `
        INSERT INTO soquy_counters (id, value, raw)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value, raw=EXCLUDED.raw
    `;
    for (const doc of docs) {
        const d = doc.data || {};
        const value = Number(d.lastNumber ?? d.value ?? d.count ?? d.current ?? 0) || 0;
        await client.query(sql, [doc.id, value, JSON.stringify(rehydrate(d))]);
    }
    console.log(`[migrate-soquy] counters: ${docs.length} upserted`);
}

async function migrateMeta(client, docs) {
    const sql = `
        INSERT INTO soquy_meta (id, items, raw, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE
        SET items=EXCLUDED.items, raw=EXCLUDED.raw, updated_at=NOW()
    `;
    for (const doc of docs) {
        const d = doc.data || {};
        const items = Array.isArray(d.items) ? JSON.stringify(d.items) : null;
        await client.query(sql, [doc.id, items, JSON.stringify(rehydrate(d))]);
    }
    console.log(`[migrate-soquy] meta: ${docs.length} upserted`);
}

async function main() {
    const arg = process.argv[2];
    const file = arg
        ? path.resolve(arg)
        : path.join(__dirname, '..', 'backups', 'soquy', 'soquy-backup-latest.json');

    if (!fs.existsSync(file)) {
        console.error(`[migrate-soquy] Backup file not found: ${file}`);
        console.error('Run `node render.com/scripts/backup-soquy-firestore.js` first.');
        process.exit(1);
    }

    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`[migrate-soquy] Loaded backup from ${file} (taken at ${backup.backedUpAt})`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await migrateVouchers(client, backup.collections.soquy_vouchers || []);
        await migrateCounters(client, backup.collections.soquy_counters || []);
        await migrateMeta(client, backup.collections.soquy_meta || []);
        await client.query('COMMIT');
        console.log('[migrate-soquy] DONE ✓');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[migrate-soquy] FAILED, rolled back:', err);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
