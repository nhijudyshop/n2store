#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migrate inventory-tracking data from Firestore → PostgreSQL on Render.
 *
 * Reads:
 *   - Firestore collection 'inventory_tracking' (NCC docs with datHang[] + dotHang[])
 *   - Firestore collection 'inventory_prepayments'
 *   - Firestore collection 'inventory_other_expenses'
 *   - Firestore collection 'edit_history' (inventory-related)
 *
 * Writes:
 *   - PostgreSQL tables: inventory_suppliers, inventory_order_bookings,
 *     inventory_shipments, inventory_prepayments, inventory_other_expenses,
 *     inventory_edit_history
 *
 * Idempotent: uses ON CONFLICT DO UPDATE.
 *
 * Usage:
 *   node migrate-inventory-tracking-firestore-to-pg.js
 *   node migrate-inventory-tracking-firestore-to-pg.js --dry-run   # Preview only
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

// ========================================
// CONFIG
// ========================================

const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    console.error('[migrate] firebase-admin not installed. Run: npm install firebase-admin');
    process.exit(1);
}

// ========================================
// FIREBASE INIT
// ========================================

function initFirebase() {
    if (admin.apps.length) return admin.apps[0];

    const projectId = process.env.FIREBASE_PROJECT_ID || 'n2shop-69e37';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com';
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

    if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    return admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
}

// ========================================
// HELPERS
// ========================================

function toISOString(val) {
    if (!val) return null;
    if (val._seconds !== undefined || val.toDate) {
        const date = val.toDate ? val.toDate() : new Date(val._seconds * 1000);
        return date.toISOString();
    }
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return null;
}

function toDateString(val) {
    if (!val) return null;
    const iso = toISOString(val);
    if (!iso) return null;
    return iso.split('T')[0]; // YYYY-MM-DD
}

function safeFloat(val) {
    if (val === null || val === undefined) return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
}

function safeInt(val) {
    if (val === null || val === undefined) return 0;
    const n = parseInt(val, 10);
    return isNaN(n) ? 0 : n;
}

const stats = {
    suppliers: { migrated: 0, errors: 0 },
    orderBookings: { migrated: 0, errors: 0 },
    shipments: { migrated: 0, errors: 0 },
    prepayments: { migrated: 0, errors: 0 },
    otherExpenses: { migrated: 0, errors: 0 },
    editHistory: { migrated: 0, errors: 0 },
};

// ========================================
// MIGRATE SUPPLIERS
// ========================================

async function migrateSuppliers(client, nccDocs) {
    console.log('\n[migrate] === SUPPLIERS ===');

    for (const doc of nccDocs) {
        try {
            const data = doc.data();
            const sttNCC = safeInt(data.sttNCC);
            if (!sttNCC) {
                console.warn(`[migrate] Skipping doc ${doc.id}: no sttNCC`);
                continue;
            }

            // Extract tenNCC from most recent datHang or dotHang
            const lastDH = (data.datHang || []).slice(-1)[0];
            const lastDot = (data.dotHang || []).slice(-1)[0];
            const tenNCC = lastDH?.tenNCC || lastDot?.tenNCC || null;

            if (!DRY_RUN) {
                await client.query(`
                    INSERT INTO inventory_suppliers (id, stt_ncc, ten_ncc, firestore_doc_id, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (stt_ncc) DO UPDATE SET
                        ten_ncc = COALESCE(EXCLUDED.ten_ncc, inventory_suppliers.ten_ncc),
                        firestore_doc_id = EXCLUDED.firestore_doc_id,
                        updated_at = EXCLUDED.updated_at
                `, [
                    doc.id,
                    sttNCC,
                    tenNCC,
                    doc.id,
                    toISOString(data.createdAt) || new Date().toISOString(),
                    toISOString(data.updatedAt) || new Date().toISOString()
                ]);
            }

            stats.suppliers.migrated++;
        } catch (err) {
            stats.suppliers.errors++;
            console.error(`[migrate] Error migrating supplier ${doc.id}:`, err.message);
        }
    }

    console.log(`[migrate] Suppliers: ${stats.suppliers.migrated} migrated, ${stats.suppliers.errors} errors`);
}

// ========================================
// MIGRATE ORDER BOOKINGS (datHang)
// ========================================

async function migrateOrderBookings(client, nccDocs) {
    console.log('\n[migrate] === ORDER BOOKINGS (datHang) ===');

    for (const doc of nccDocs) {
        const data = doc.data();
        const sttNCC = safeInt(data.sttNCC);
        if (!sttNCC) continue;

        const datHangList = data.datHang || [];

        for (const dh of datHangList) {
            try {
                const id = dh.id || `${doc.id}_dh_${dh.ngayDatHang}_${Date.now()}`;
                const ngayDatHang = toDateString(dh.ngayDatHang);
                if (!ngayDatHang) {
                    console.warn(`[migrate] Skipping datHang: no date, NCC ${sttNCC}`);
                    continue;
                }

                const sanPham = JSON.stringify(dh.sanPham || []);
                const anhHoaDon = dh.anhHoaDon || [];

                if (!DRY_RUN) {
                    await client.query(`
                        INSERT INTO inventory_order_bookings (
                            id, stt_ncc, ngay_dat_hang, ten_ncc, trang_thai,
                            san_pham, tong_tien_hd, tong_mon,
                            anh_hoa_don, ghi_chu, linked_dot_hang_id,
                            created_by, updated_by, created_at, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                        ON CONFLICT (id) DO UPDATE SET
                            stt_ncc = EXCLUDED.stt_ncc,
                            ngay_dat_hang = EXCLUDED.ngay_dat_hang,
                            ten_ncc = EXCLUDED.ten_ncc,
                            trang_thai = EXCLUDED.trang_thai,
                            san_pham = EXCLUDED.san_pham,
                            tong_tien_hd = EXCLUDED.tong_tien_hd,
                            tong_mon = EXCLUDED.tong_mon,
                            anh_hoa_don = EXCLUDED.anh_hoa_don,
                            ghi_chu = EXCLUDED.ghi_chu,
                            linked_dot_hang_id = EXCLUDED.linked_dot_hang_id,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = EXCLUDED.updated_at
                    `, [
                        id,
                        sttNCC,
                        ngayDatHang,
                        dh.tenNCC || null,
                        dh.trangThai || 'pending',
                        sanPham,
                        safeFloat(dh.tongTienHD),
                        safeInt(dh.tongMon),
                        anhHoaDon,
                        dh.ghiChu || '',
                        dh.linkedDotHangId || null,
                        dh.createdBy || null,
                        dh.updatedBy || null,
                        toISOString(dh.createdAt) || new Date().toISOString(),
                        toISOString(dh.updatedAt) || new Date().toISOString()
                    ]);
                }

                stats.orderBookings.migrated++;
            } catch (err) {
                stats.orderBookings.errors++;
                console.error(`[migrate] Error migrating datHang (NCC ${sttNCC}):`, err.message);
            }
        }
    }

    console.log(`[migrate] Order Bookings: ${stats.orderBookings.migrated} migrated, ${stats.orderBookings.errors} errors`);
}

// ========================================
// MIGRATE SHIPMENTS (dotHang)
// ========================================

async function migrateShipments(client, nccDocs) {
    console.log('\n[migrate] === SHIPMENTS (dotHang) ===');

    for (const doc of nccDocs) {
        const data = doc.data();
        const sttNCC = safeInt(data.sttNCC);
        if (!sttNCC) continue;

        const dotHangList = data.dotHang || [];

        for (const dot of dotHangList) {
            try {
                const id = dot.id || `${doc.id}_dot_${dot.ngayDiHang}_${Date.now()}`;
                const ngayDiHang = toDateString(dot.ngayDiHang);
                if (!ngayDiHang) {
                    console.warn(`[migrate] Skipping dotHang: no date, NCC ${sttNCC}`);
                    continue;
                }

                if (!DRY_RUN) {
                    await client.query(`
                        INSERT INTO inventory_shipments (
                            id, stt_ncc, ngay_di_hang, ten_ncc,
                            kien_hang, tong_kien, tong_kg,
                            san_pham, tong_tien_hd, tong_mon,
                            so_mon_thieu, ghi_chu_thieu,
                            anh_hoa_don, ghi_chu,
                            chi_phi_hang_ve, tong_chi_phi,
                            created_by, updated_by, created_at, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                        ON CONFLICT (id) DO UPDATE SET
                            stt_ncc = EXCLUDED.stt_ncc,
                            ngay_di_hang = EXCLUDED.ngay_di_hang,
                            ten_ncc = EXCLUDED.ten_ncc,
                            kien_hang = EXCLUDED.kien_hang,
                            tong_kien = EXCLUDED.tong_kien,
                            tong_kg = EXCLUDED.tong_kg,
                            san_pham = EXCLUDED.san_pham,
                            tong_tien_hd = EXCLUDED.tong_tien_hd,
                            tong_mon = EXCLUDED.tong_mon,
                            so_mon_thieu = EXCLUDED.so_mon_thieu,
                            ghi_chu_thieu = EXCLUDED.ghi_chu_thieu,
                            anh_hoa_don = EXCLUDED.anh_hoa_don,
                            ghi_chu = EXCLUDED.ghi_chu,
                            chi_phi_hang_ve = EXCLUDED.chi_phi_hang_ve,
                            tong_chi_phi = EXCLUDED.tong_chi_phi,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = EXCLUDED.updated_at
                    `, [
                        id,
                        sttNCC,
                        ngayDiHang,
                        dot.tenNCC || null,
                        JSON.stringify(dot.kienHang || []),
                        safeInt(dot.tongKien),
                        safeFloat(dot.tongKg),
                        JSON.stringify(dot.sanPham || []),
                        safeFloat(dot.tongTienHD),
                        safeInt(dot.tongMon),
                        safeInt(dot.soMonThieu),
                        dot.ghiChuThieu || '',
                        dot.anhHoaDon || [],
                        dot.ghiChu || '',
                        JSON.stringify(dot.chiPhiHangVe || []),
                        safeFloat(dot.tongChiPhi),
                        dot.createdBy || null,
                        dot.updatedBy || null,
                        toISOString(dot.createdAt) || new Date().toISOString(),
                        toISOString(dot.updatedAt) || new Date().toISOString()
                    ]);
                }

                stats.shipments.migrated++;
            } catch (err) {
                stats.shipments.errors++;
                console.error(`[migrate] Error migrating dotHang (NCC ${sttNCC}):`, err.message);
            }
        }
    }

    console.log(`[migrate] Shipments: ${stats.shipments.migrated} migrated, ${stats.shipments.errors} errors`);
}

// ========================================
// MIGRATE PREPAYMENTS
// ========================================

async function migratePrepayments(client, db) {
    console.log('\n[migrate] === PREPAYMENTS ===');

    const snapshot = await db.collection('inventory_prepayments').get();
    console.log(`[migrate] Found ${snapshot.size} prepayment documents`);

    for (const doc of snapshot.docs) {
        try {
            const data = doc.data();

            if (!DRY_RUN) {
                await client.query(`
                    INSERT INTO inventory_prepayments (id, ngay, so_tien, ghi_chu, created_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO UPDATE SET
                        ngay = EXCLUDED.ngay,
                        so_tien = EXCLUDED.so_tien,
                        ghi_chu = EXCLUDED.ghi_chu,
                        updated_at = EXCLUDED.updated_at
                `, [
                    doc.id,
                    toDateString(data.ngay),
                    safeFloat(data.soTien),
                    data.ghiChu || '',
                    data.createdBy || null,
                    toISOString(data.createdAt) || new Date().toISOString(),
                    toISOString(data.updatedAt) || new Date().toISOString()
                ]);
            }

            stats.prepayments.migrated++;
        } catch (err) {
            stats.prepayments.errors++;
            console.error(`[migrate] Error migrating prepayment ${doc.id}:`, err.message);
        }
    }

    console.log(`[migrate] Prepayments: ${stats.prepayments.migrated} migrated, ${stats.prepayments.errors} errors`);
}

// ========================================
// MIGRATE OTHER EXPENSES
// ========================================

async function migrateOtherExpenses(client, db) {
    console.log('\n[migrate] === OTHER EXPENSES ===');

    const snapshot = await db.collection('inventory_other_expenses').get();
    console.log(`[migrate] Found ${snapshot.size} other expense documents`);

    for (const doc of snapshot.docs) {
        try {
            const data = doc.data();

            if (!DRY_RUN) {
                await client.query(`
                    INSERT INTO inventory_other_expenses (id, ngay, loai_chi, so_tien, ghi_chu, created_by, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        ngay = EXCLUDED.ngay,
                        loai_chi = EXCLUDED.loai_chi,
                        so_tien = EXCLUDED.so_tien,
                        ghi_chu = EXCLUDED.ghi_chu,
                        updated_at = EXCLUDED.updated_at
                `, [
                    doc.id,
                    toDateString(data.ngay),
                    data.loaiChi || '',
                    safeFloat(data.soTien),
                    data.ghiChu || '',
                    data.createdBy || null,
                    toISOString(data.createdAt) || new Date().toISOString(),
                    toISOString(data.updatedAt) || new Date().toISOString()
                ]);
            }

            stats.otherExpenses.migrated++;
        } catch (err) {
            stats.otherExpenses.errors++;
            console.error(`[migrate] Error migrating other expense ${doc.id}:`, err.message);
        }
    }

    console.log(`[migrate] Other Expenses: ${stats.otherExpenses.migrated} migrated, ${stats.otherExpenses.errors} errors`);
}

// ========================================
// MIGRATE EDIT HISTORY (inventory-related only)
// ========================================

async function migrateEditHistory(client, db) {
    console.log('\n[migrate] === EDIT HISTORY ===');

    const snapshot = await db.collection('edit_history')
        .where('page', '==', 'inventory-tracking')
        .get();
    console.log(`[migrate] Found ${snapshot.size} edit history documents`);

    for (const doc of snapshot.docs) {
        try {
            const data = doc.data();

            if (!DRY_RUN) {
                await client.query(`
                    INSERT INTO inventory_edit_history (id, action, entity_type, entity_id, stt_ncc, changes, user_name, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        action = EXCLUDED.action,
                        entity_type = EXCLUDED.entity_type,
                        changes = EXCLUDED.changes
                `, [
                    doc.id,
                    data.action || 'unknown',
                    data.entityType || data.type || 'unknown',
                    data.entityId || data.id || '',
                    safeInt(data.sttNCC) || null,
                    JSON.stringify(data.changes || data.details || {}),
                    data.userName || data.user || null,
                    toISOString(data.createdAt || data.timestamp) || new Date().toISOString()
                ]);
            }

            stats.editHistory.migrated++;
        } catch (err) {
            stats.editHistory.errors++;
            console.error(`[migrate] Error migrating edit history ${doc.id}:`, err.message);
        }
    }

    console.log(`[migrate] Edit History: ${stats.editHistory.migrated} migrated, ${stats.editHistory.errors} errors`);
}

// ========================================
// MAIN
// ========================================

async function migrate() {
    console.log(`[migrate] Starting Firestore → PostgreSQL migration for inventory-tracking...`);
    if (DRY_RUN) console.log('[migrate] *** DRY RUN MODE — no writes ***\n');

    const app = initFirebase();
    const db = admin.firestore();

    // Read inventory_tracking collection
    console.log('[migrate] Reading Firestore collection "inventory_tracking"...');
    const nccSnapshot = await db.collection('inventory_tracking').get();
    console.log(`[migrate] Found ${nccSnapshot.size} NCC documents`);

    if (nccSnapshot.empty) {
        console.log('[migrate] No NCC documents found. Checking other collections...');
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Suppliers
        await migrateSuppliers(client, nccSnapshot.docs);

        // 2. Order Bookings (datHang from each NCC doc)
        await migrateOrderBookings(client, nccSnapshot.docs);

        // 3. Shipments (dotHang from each NCC doc)
        await migrateShipments(client, nccSnapshot.docs);

        // 4. Prepayments
        await migratePrepayments(client, db);

        // 5. Other Expenses
        await migrateOtherExpenses(client, db);

        // 6. Edit History
        await migrateEditHistory(client, db);

        if (DRY_RUN) {
            await client.query('ROLLBACK');
            console.log('\n[migrate] DRY RUN — rolled back all changes');
        } else {
            await client.query('COMMIT');
        }

        // Print summary
        console.log('\n========================================');
        console.log('[migrate] MIGRATION SUMMARY');
        console.log('========================================');
        const totalMigrated = Object.values(stats).reduce((s, v) => s + v.migrated, 0);
        const totalErrors = Object.values(stats).reduce((s, v) => s + v.errors, 0);

        for (const [entity, s] of Object.entries(stats)) {
            const icon = s.errors > 0 ? '⚠️' : '✅';
            console.log(`  ${icon} ${entity}: ${s.migrated} migrated, ${s.errors} errors`);
        }
        console.log(`\n  Total: ${totalMigrated} records migrated, ${totalErrors} errors`);

        if (!DRY_RUN) {
            // Verify counts
            const tables = [
                'inventory_suppliers', 'inventory_order_bookings', 'inventory_shipments',
                'inventory_prepayments', 'inventory_other_expenses', 'inventory_edit_history'
            ];
            console.log('\n[migrate] PostgreSQL row counts:');
            for (const table of tables) {
                const result = await client.query(`SELECT COUNT(*)::int as count FROM ${table}`);
                console.log(`  ${table}: ${result.rows[0].count}`);
            }
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[migrate] Transaction failed, rolled back:', err);
    } finally {
        client.release();
    }

    await pool.end();
    const hasErrors = Object.values(stats).some(s => s.errors > 0);
    process.exit(hasErrors ? 1 : 0);
}

migrate().catch(err => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
});
