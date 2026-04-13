#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Migrate purchase_orders from Firestore → PostgreSQL on Render.
 *
 * Reads:  Firestore collection 'purchase_orders' (via Firebase Admin SDK)
 * Writes: PostgreSQL table 'purchase_orders' (created by migration 045)
 *
 * Idempotent: uses ON CONFLICT (id) DO UPDATE.
 *
 * Usage:
 *   node migrate-purchase-orders-firestore-to-pg.js
 *
 * Requires:
 *   - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (env or .env)
 *   - DATABASE_URL (env or .env)
 */

const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const { Pool } = require('pg');

// ========================================
// CONFIG
// ========================================

const DATABASE_URL = process.env.DATABASE_URL ||
    'postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

// Firebase Admin
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

    // Handle escaped newlines
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
    // Firestore Timestamp
    if (val._seconds !== undefined || val.toDate) {
        const date = val.toDate ? val.toDate() : new Date(val._seconds * 1000);
        return date.toISOString();
    }
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return null;
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

// ========================================
// MIGRATION
// ========================================

async function migrate() {
    console.log('[migrate] Starting Firestore → PostgreSQL migration for purchase_orders...');

    // Init Firebase
    const app = initFirebase();
    const db = admin.firestore();

    // Read all documents from Firestore
    console.log('[migrate] Reading Firestore collection "purchase_orders"...');
    const snapshot = await db.collection('purchase_orders').get();
    console.log(`[migrate] Found ${snapshot.size} documents in Firestore`);

    if (snapshot.empty) {
        console.log('[migrate] No documents to migrate. Done.');
        await pool.end();
        return;
    }

    // Connect to PostgreSQL
    const client = await pool.connect();
    let migrated = 0;
    let errors = 0;

    try {
        await client.query('BEGIN');

        for (const doc of snapshot.docs) {
            try {
                const data = doc.data();
                const id = doc.id;

                // Extract fields with safe defaults
                const orderNumber = data.orderNumber || data.order_number || `PO-MIGRATED-${id.slice(0, 8)}`;
                const orderType = data.orderType || data.order_type || 'NJD SHOP';
                const orderDate = toISOString(data.orderDate || data.order_date || data.createdAt || data.created_at);
                const createdAt = toISOString(data.createdAt || data.created_at) || new Date().toISOString();
                const updatedAt = toISOString(data.updatedAt || data.updated_at) || createdAt;
                const deletedAt = toISOString(data.deletedAt || data.deleted_at);

                const status = data.status || 'DRAFT';
                const previousStatus = data.previousStatus || data.previous_status || null;

                // Supplier
                const supplier = data.supplier || {};
                const supplierCode = supplier.code || data.supplier_code || null;
                const supplierName = supplier.name || data.supplier_name || null;

                // Amounts
                const invoiceAmount = safeFloat(data.invoiceAmount || data.invoice_amount);
                const totalAmount = safeFloat(data.totalAmount || data.total_amount);
                const discountAmount = safeFloat(data.discountAmount || data.discount_amount);
                const shippingFee = safeFloat(data.shippingFee || data.shipping_fee);
                const finalAmount = safeFloat(data.finalAmount || data.final_amount) ||
                    (totalAmount - discountAmount + shippingFee);

                // Images
                const invoiceImages = data.invoiceImages || data.invoice_images || [];

                // Notes
                const notes = data.notes || '';

                // Items (JSONB)
                const items = data.items || [];
                const totalItems = safeInt(data.totalItems || data.total_items) || items.length;
                const totalQuantity = safeInt(data.totalQuantity || data.total_quantity) ||
                    items.reduce((sum, item) => sum + safeInt(item.quantity), 0);

                // Status history (JSONB)
                const statusHistory = data.statusHistory || data.status_history || [];

                // Created by
                const createdBy = data.createdBy || data.created_by || {};
                const createdByUid = createdBy.uid || createdBy.userId || '';
                const createdByName = createdBy.displayName || createdBy.userName || '';
                const createdByEmail = createdBy.email || '';

                // Last modified by
                const lastModifiedBy = data.lastModifiedBy || data.last_modified_by || createdBy;
                const lastModifiedByUid = lastModifiedBy.uid || lastModifiedBy.userId || '';
                const lastModifiedByName = lastModifiedBy.displayName || lastModifiedBy.userName || '';
                const lastModifiedByEmail = lastModifiedBy.email || '';

                await client.query(`
                    INSERT INTO purchase_orders (
                        id, order_number, order_type, order_date,
                        created_at, updated_at, deleted_at,
                        status, previous_status,
                        supplier_code, supplier_name,
                        invoice_amount, total_amount, discount_amount, shipping_fee, final_amount,
                        invoice_images, notes,
                        items, status_history,
                        total_items, total_quantity,
                        created_by_uid, created_by_name, created_by_email,
                        last_modified_by_uid, last_modified_by_name, last_modified_by_email
                    ) VALUES (
                        $1, $2, $3, $4,
                        $5, $6, $7,
                        $8, $9,
                        $10, $11,
                        $12, $13, $14, $15, $16,
                        $17, $18,
                        $19, $20,
                        $21, $22,
                        $23, $24, $25,
                        $26, $27, $28
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        order_number = EXCLUDED.order_number,
                        order_type = EXCLUDED.order_type,
                        order_date = EXCLUDED.order_date,
                        updated_at = EXCLUDED.updated_at,
                        deleted_at = EXCLUDED.deleted_at,
                        status = EXCLUDED.status,
                        previous_status = EXCLUDED.previous_status,
                        supplier_code = EXCLUDED.supplier_code,
                        supplier_name = EXCLUDED.supplier_name,
                        invoice_amount = EXCLUDED.invoice_amount,
                        total_amount = EXCLUDED.total_amount,
                        discount_amount = EXCLUDED.discount_amount,
                        shipping_fee = EXCLUDED.shipping_fee,
                        final_amount = EXCLUDED.final_amount,
                        invoice_images = EXCLUDED.invoice_images,
                        notes = EXCLUDED.notes,
                        items = EXCLUDED.items,
                        status_history = EXCLUDED.status_history,
                        total_items = EXCLUDED.total_items,
                        total_quantity = EXCLUDED.total_quantity,
                        last_modified_by_uid = EXCLUDED.last_modified_by_uid,
                        last_modified_by_name = EXCLUDED.last_modified_by_name,
                        last_modified_by_email = EXCLUDED.last_modified_by_email
                `, [
                    id, orderNumber, orderType, orderDate,
                    createdAt, updatedAt, deletedAt,
                    status, previousStatus,
                    supplierCode, supplierName,
                    invoiceAmount, totalAmount, discountAmount, shippingFee, finalAmount,
                    invoiceImages, notes,
                    JSON.stringify(items), JSON.stringify(statusHistory),
                    totalItems, totalQuantity,
                    createdByUid, createdByName, createdByEmail,
                    lastModifiedByUid, lastModifiedByName, lastModifiedByEmail
                ]);

                migrated++;
                if (migrated % 50 === 0) {
                    console.log(`[migrate] Progress: ${migrated}/${snapshot.size}`);
                }
            } catch (err) {
                errors++;
                console.error(`[migrate] Error migrating doc ${doc.id}:`, err.message);
            }
        }

        await client.query('COMMIT');
        console.log(`\n[migrate] ✅ Migration complete!`);
        console.log(`[migrate]   Migrated: ${migrated}`);
        console.log(`[migrate]   Errors: ${errors}`);
        console.log(`[migrate]   Total: ${snapshot.size}`);

        // Verify
        const countResult = await client.query('SELECT status, COUNT(*)::int as count FROM purchase_orders GROUP BY status ORDER BY count DESC');
        console.log('\n[migrate] PostgreSQL purchase_orders status counts:');
        for (const row of countResult.rows) {
            console.log(`  ${row.status}: ${row.count}`);
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[migrate] Transaction failed, rolled back:', err);
    } finally {
        client.release();
    }

    await pool.end();
    process.exit(errors > 0 ? 1 : 0);
}

// ========================================
// RUN
// ========================================
migrate().catch(err => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
});
