#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * ONE-TIME CLEANUP: Delete legacy inventory-tracking Firestore collections.
 *
 * Context:
 *   After migrating inventory-tracking data from Firestore → Render PostgreSQL
 *   (see scripts/migrate-inventory-tracking-firestore-to-pg.js, migration 047),
 *   the original Firestore collections remain as stale copies.
 *   This script deletes them — irreversibly — so Firestore no longer holds
 *   inventory-tracking data.
 *
 * Collections deleted:
 *   - inventory_tracking            (NCC docs with datHang[] + dotHang[])
 *   - inventory_prepayments
 *   - inventory_other_expenses
 *   - inventory_edit_history        (only entity_type in inventory scope is filtered)
 *
 * Safety:
 *   - Runs in --dry-run mode by default (no deletes, prints counts)
 *   - Requires explicit --execute to actually delete
 *   - Prints doc counts before/after each collection
 *
 * Usage:
 *   node cleanup-inventory-firestore.js              # dry-run (default)
 *   node cleanup-inventory-firestore.js --execute    # actually delete
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const EXECUTE = process.argv.includes('--execute');
const DRY_RUN = !EXECUTE;

let admin;
try {
    admin = require('firebase-admin');
} catch (_) {
    console.error('[cleanup] firebase-admin not installed. Run: npm install firebase-admin');
    process.exit(1);
}

function initFirebase() {
    if (admin.apps.length) return admin.apps[0];
    const projectId = process.env.FIREBASE_PROJECT_ID || 'n2shop-69e37';
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-cmdro@n2shop-69e37.iam.gserviceaccount.com';
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
    if (!privateKey) {
        console.error('[cleanup] FIREBASE_PRIVATE_KEY env var is required');
        process.exit(1);
    }
    return admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
    });
}

const COLLECTIONS_TO_DELETE = [
    'inventory_tracking',
    'inventory_prepayments',
    'inventory_other_expenses'
];

async function deleteCollection(db, collectionName, batchSize = 400) {
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();
    const total = snapshot.size;

    if (total === 0) {
        console.log(`  [${collectionName}] empty, nothing to delete`);
        return { collection: collectionName, total: 0, deleted: 0 };
    }

    if (DRY_RUN) {
        console.log(`  [${collectionName}] ${total} docs would be deleted (dry-run)`);
        return { collection: collectionName, total, deleted: 0 };
    }

    let deleted = 0;
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += chunk.length;
        console.log(`  [${collectionName}] deleted ${deleted}/${total}`);
    }
    return { collection: collectionName, total, deleted };
}

// Also filter edit_history for inventory-related docs
async function deleteInventoryEditHistory(db) {
    const collection = 'edit_history';
    const snapshot = await db.collection(collection)
        .where('entity_type', 'in', ['orderBooking', 'shipment', 'prepayment', 'otherExpense'])
        .get();
    const total = snapshot.size;

    if (total === 0) {
        console.log(`  [${collection}] no inventory-related docs to delete`);
        return { collection, total: 0, deleted: 0 };
    }

    if (DRY_RUN) {
        console.log(`  [${collection}] ${total} inventory-related docs would be deleted (dry-run)`);
        return { collection, total, deleted: 0 };
    }

    let deleted = 0;
    const docs = snapshot.docs;
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += chunk.length;
        console.log(`  [${collection}] deleted ${deleted}/${total}`);
    }
    return { collection, total, deleted };
}

async function main() {
    console.log('========================================');
    console.log(`Firestore inventory cleanup — ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);
    console.log('========================================\n');

    initFirebase();
    const db = admin.firestore();

    const results = [];
    for (const collectionName of COLLECTIONS_TO_DELETE) {
        try {
            const res = await deleteCollection(db, collectionName);
            results.push(res);
        } catch (err) {
            console.error(`  [${collectionName}] error:`, err.message);
            results.push({ collection: collectionName, error: err.message });
        }
    }

    try {
        const res = await deleteInventoryEditHistory(db);
        results.push(res);
    } catch (err) {
        console.error(`  [edit_history] error:`, err.message);
        results.push({ collection: 'edit_history', error: err.message });
    }

    console.log('\n========================================');
    console.log('Summary:');
    console.table(results);
    console.log('========================================');

    if (DRY_RUN) {
        console.log('\n(dry-run) To actually delete, run with --execute flag.');
    } else {
        console.log('\nCleanup complete.');
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
