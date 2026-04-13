#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migration script: Firestore purchase_orders → PostgreSQL
 *
 * Usage:
 *   1. Run the SQL migration first: psql < migrations/045_create_purchase_orders.sql
 *   2. Then run this script: node migrations/045_migrate_firestore_to_pg.js
 *
 * Requires: Firebase Admin SDK credentials in GOOGLE_APPLICATION_CREDENTIALS env var
 *           or firebase-admin-key.json in render.com/ directory
 */

const { Pool } = require('pg');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

// Initialize Firebase Admin
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? require(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : require('../firebase-admin-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();

// Initialize PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    console.log('Starting Firestore → PostgreSQL migration for purchase_orders...');

    const snapshot = await firestore.collection('purchase_orders').get();
    console.log(`Found ${snapshot.size} documents to migrate`);

    let migrated = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        try {
            const data = doc.data();

            // Convert Firestore Timestamps to ISO strings
            const toDate = (ts) => {
                if (!ts) return null;
                if (ts.toDate) return ts.toDate().toISOString();
                if (ts instanceof Date) return ts.toISOString();
                return new Date(ts).toISOString();
            };

            // Prepare items - strip Firestore-specific fields
            const items = (data.items || []).map((item, index) => ({
                id: item.id || uuidv4(),
                position: item.position || index + 1,
                productCode: item.productCode || '',
                productName: item.productName || '',
                variant: item.variant || '',
                selectedAttributeValueIds: item.selectedAttributeValueIds || [],
                productImages: item.productImages || [],
                priceImages: item.priceImages || [],
                purchasePrice: item.purchasePrice || 0,
                sellingPrice: item.sellingPrice || 0,
                quantity: item.quantity || 1,
                subtotal: item.subtotal || (item.purchasePrice || 0) * (item.quantity || 1),
                notes: item.notes || '',
                tposSyncStatus: item.tposSyncStatus || null,
                tposProductId: item.tposProductId || null,
                tposProductTmplId: item.tposProductTmplId || null,
                tposSynced: item.tposSynced || false,
                tposImageUrl: item.tposImageUrl || null,
                parentProductCode: item.parentProductCode || null,
                tposSyncError: item.tposSyncError || null
            }));

            // Convert status history timestamps
            const statusHistory = (data.statusHistory || []).map(entry => ({
                from: entry.from || null,
                to: entry.to,
                changedAt: toDate(entry.changedAt) || new Date().toISOString(),
                changedBy: entry.changedBy || { uid: 'system', displayName: 'System', email: '' },
                reason: entry.reason || null
            }));

            await pool.query(`
                INSERT INTO purchase_orders (
                    id, order_number, order_type, order_date, created_at, updated_at, deleted_at,
                    status, previous_status,
                    supplier_code, supplier_name,
                    invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                    invoice_images, notes, items, status_history,
                    total_items, total_quantity,
                    created_by_uid, created_by_name, created_by_email,
                    last_modified_by_uid, last_modified_by_name, last_modified_by_email
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9,
                    $10, $11,
                    $12, $13, $14, $15, $16,
                    $17, $18, $19, $20,
                    $21, $22,
                    $23, $24, $25,
                    $26, $27, $28
                )
                ON CONFLICT (id) DO NOTHING
            `, [
                doc.id, // Keep original Firestore doc ID as UUID-compatible string
                data.orderNumber || `PO-LEGACY-${doc.id.slice(0, 8)}`,
                data.orderType || 'NJD SHOP',
                toDate(data.orderDate),
                toDate(data.createdAt) || new Date().toISOString(),
                toDate(data.updatedAt) || new Date().toISOString(),
                toDate(data.deletedAt),
                data.status || 'DRAFT',
                data.previousStatus || null,
                data.supplier?.code || null,
                data.supplier?.name || null,
                data.invoiceAmount || 0,
                data.totalAmount || 0,
                data.discountAmount || 0,
                data.shippingFee || 0,
                data.finalAmount || 0,
                data.invoiceImages || [],
                data.notes || '',
                JSON.stringify(items),
                JSON.stringify(statusHistory),
                data.totalItems || items.length,
                data.totalQuantity || items.reduce((s, i) => s + (i.quantity || 0), 0),
                data.createdBy?.uid || 'unknown',
                data.createdBy?.displayName || 'Unknown',
                data.createdBy?.email || '',
                data.lastModifiedBy?.uid || data.createdBy?.uid || 'unknown',
                data.lastModifiedBy?.displayName || data.createdBy?.displayName || 'Unknown',
                data.lastModifiedBy?.email || data.createdBy?.email || ''
            ]);

            migrated++;
            if (migrated % 50 === 0) console.log(`  Migrated ${migrated}/${snapshot.size}...`);
        } catch (error) {
            errors++;
            console.error(`  Error migrating ${doc.id}:`, error.message);
        }
    }

    console.log(`\nMigration complete: ${migrated} migrated, ${errors} errors, ${snapshot.size} total`);

    await pool.end();
    process.exit(errors > 0 ? 1 : 0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
