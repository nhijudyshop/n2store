// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Firebase Migration Script: Separate soldQty to its own node
 *
 * This script:
 * 1. Creates a backup of all Firebase data
 * 2. Migrates soldQty to a separate node (soluongProductsQty)
 * 3. Provides rollback functionality if needed
 *
 * IMPORTANT: Run this script in browser console on the Admin page (index.html)
 * where Firebase is already initialized.
 *
 * Usage:
 *   1. backupFirebaseData(database)  - Run FIRST to create backup
 *   2. migrateQtyToSeparateNode(database) - Run to migrate data
 *   3. rollbackMigration(database) - Run if something goes wrong
 */

// ============================================================================
// BACKUP FUNCTIONS
// ============================================================================

/**
 * Backup all Firebase data related to soluong
 * Downloads a JSON file with all data
 */
async function backupFirebaseData(database) {
    console.log('📦 Starting full backup...');
    console.log('⏳ Please wait...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = {};

    // Backup all data paths related to soluong
    const paths = [
        'soluongProducts',
        'soluongProductsMeta',
        'soluongProductsQty', // New node (may not exist yet)
        'soluongDisplaySettings',
        'hiddenSoluongDisplaySettings',
        'soluongIsMergeVariants',
        'soluongSyncCurrentPage',
        'soluongSyncSearchData',
        'hiddenSoluongSyncCurrentPage',
        'hiddenSoluongSyncSearchData',
        'soluongSalesLog',
        'cartHistory',
        'cartHistoryMeta'
    ];

    let totalSize = 0;
    for (const path of paths) {
        try {
            const snapshot = await database.ref(path).once('value');
            const data = snapshot.val();
            backup[path] = data;

            const size = data ? JSON.stringify(data).length : 0;
            totalSize += size;
            console.log(`✅ Backed up: ${path} (${(size / 1024).toFixed(2)} KB)`);
        } catch (error) {
            console.error(`❌ Error backing up ${path}:`, error);
            backup[path] = null;
        }
    }

    // Create backup object with metadata
    const backupWithMeta = {
        metadata: {
            timestamp: timestamp,
            date: new Date().toISOString(),
            totalPaths: paths.length,
            totalSize: totalSize
        },
        data: backup
    };

    const backupStr = JSON.stringify(backupWithMeta, null, 2);

    // Option 1: Download file
    const blob = new Blob([backupStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firebase-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Option 2: Save to localStorage
    const localStorageKey = `firebase_backup_${timestamp}`;
    try {
        localStorage.setItem(localStorageKey, backupStr);
        console.log(`💾 Also saved to localStorage: ${localStorageKey}`);
    } catch (e) {
        console.warn('⚠️ Could not save to localStorage (may be too large):', e.message);
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('✅ BACKUP COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log(`📁 File: firebase-backup-${timestamp}.json`);
    console.log(`📊 Total Size: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`🔑 LocalStorage Key: ${localStorageKey}`);
    console.log('');
    console.log('⚠️ IMPORTANT: Save this backup file to a safe location!');
    console.log('═══════════════════════════════════════════');

    return backupWithMeta;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migrate soldQty to separate node
 * This ONLY ADDS new data, does NOT delete anything from soluongProducts
 */
async function migrateQtyToSeparateNode(database) {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🔄 STARTING SOLDQTY MIGRATION');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('ℹ️ This migration will:');
    console.log('   1. Read all products from soluongProducts');
    console.log('   2. Copy soldQty values to soluongProductsQty');
    console.log('   3. Keep original data intact (no deletions)');
    console.log('');

    // Step 1: Check for backup
    const backupKeys = Object.keys(localStorage).filter(k => k.startsWith('firebase_backup_'));
    if (backupKeys.length === 0) {
        console.error('');
        console.error('❌ NO BACKUP FOUND!');
        console.error('');
        console.error('Please run backupFirebaseData(database) first!');
        console.error('');
        return false;
    }
    console.log(`✅ Found ${backupKeys.length} backup(s) in localStorage`);
    console.log(`   Latest: ${backupKeys[backupKeys.length - 1]}`);

    // Step 2: Load all products
    console.log('');
    console.log('📥 Loading products from Firebase...');
    const productsSnapshot = await database.ref('soluongProducts').once('value');
    const products = productsSnapshot.val() || {};
    const productCount = Object.keys(products).length;

    if (productCount === 0) {
        console.log('⚠️ No products found in soluongProducts');
        console.log('Migration complete (nothing to migrate)');
        return true;
    }
    console.log(`✅ Found ${productCount} products`);

    // Step 3: Check if migration already done
    const existingQty = await database.ref('soluongProductsQty').once('value');
    if (existingQty.exists()) {
        const existingCount = Object.keys(existingQty.val() || {}).length;
        console.log('');
        console.warn('⚠️ soluongProductsQty already exists!');
        console.warn(`   Contains ${existingCount} entries`);
        console.log('');

        const proceed = confirm(`soluongProductsQty already has ${existingCount} entries. Continue anyway? (existing data will be overwritten)`);
        if (!proceed) {
            console.log('Migration cancelled by user');
            return false;
        }
    }

    // Step 4: Create qty updates
    console.log('');
    console.log('📝 Preparing qty data...');
    const qtyUpdates = {};
    let qtyWithValue = 0;
    let qtyZero = 0;

    Object.entries(products).forEach(([key, product]) => {
        const soldQty = product.soldQty || 0;
        qtyUpdates[`soluongProductsQty/${key}`] = {
            soldQty: soldQty
        };

        if (soldQty > 0) {
            qtyWithValue++;
        } else {
            qtyZero++;
        }
    });

    console.log(`   Products with soldQty > 0: ${qtyWithValue}`);
    console.log(`   Products with soldQty = 0: ${qtyZero}`);

    // Step 5: Write to Firebase
    console.log('');
    console.log('📤 Writing to Firebase...');
    try {
        await database.ref().update(qtyUpdates);
        console.log('✅ Data written successfully!');
    } catch (error) {
        console.error('❌ Error writing to Firebase:', error);
        return false;
    }

    // Step 6: Verify migration
    console.log('');
    console.log('🔍 Verifying migration...');
    const verifySnapshot = await database.ref('soluongProductsQty').once('value');
    const verifyData = verifySnapshot.val() || {};
    const verifyCount = Object.keys(verifyData).length;

    if (verifyCount === productCount) {
        console.log(`✅ Verification passed: ${verifyCount} qty entries created`);
    } else {
        console.warn(`⚠️ Verification mismatch: expected ${productCount}, got ${verifyCount}`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('ℹ️ Next steps:');
    console.log('   1. Deploy the updated code');
    console.log('   2. Test that soldQty updates work correctly');
    console.log('   3. Monitor Firebase Usage for bandwidth savings');
    console.log('');
    console.log('ℹ️ Original data in soluongProducts is STILL THERE');
    console.log('   You can rollback anytime with: rollbackMigration(database)');
    console.log('═══════════════════════════════════════════');

    return true;
}

// ============================================================================
// ROLLBACK FUNCTIONS
// ============================================================================

/**
 * Rollback migration by removing the new qty node
 * Original data in soluongProducts remains intact
 */
async function rollbackMigration(database) {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🔙 ROLLBACK MIGRATION');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Check if qty node exists
    const qtySnapshot = await database.ref('soluongProductsQty').once('value');
    if (!qtySnapshot.exists()) {
        console.log('ℹ️ soluongProductsQty does not exist');
        console.log('Nothing to rollback');
        return true;
    }

    const count = Object.keys(qtySnapshot.val() || {}).length;
    console.log(`Found ${count} entries in soluongProductsQty`);
    console.log('');

    const proceed = confirm(`Are you sure you want to delete soluongProductsQty (${count} entries)?`);
    if (!proceed) {
        console.log('Rollback cancelled by user');
        return false;
    }

    console.log('🗑️ Removing soluongProductsQty...');
    await database.ref('soluongProductsQty').remove();

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('✅ ROLLBACK COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('ℹ️ Original data in soluongProducts is intact');
    console.log('ℹ️ Revert code changes to use the old structure');
    console.log('═══════════════════════════════════════════');

    return true;
}

/**
 * Restore from a backup file
 * Use this as last resort if something goes very wrong
 */
async function restoreFromBackup(database, backupKey) {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🔄 RESTORE FROM BACKUP');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Find backup
    let backupStr;
    if (backupKey) {
        backupStr = localStorage.getItem(backupKey);
    } else {
        // Find latest backup
        const backupKeys = Object.keys(localStorage).filter(k => k.startsWith('firebase_backup_'));
        if (backupKeys.length === 0) {
            console.error('❌ No backup found in localStorage');
            console.error('You can also load from the downloaded JSON file manually');
            return false;
        }
        backupKey = backupKeys[backupKeys.length - 1];
        backupStr = localStorage.getItem(backupKey);
    }

    if (!backupStr) {
        console.error('❌ Backup not found:', backupKey);
        return false;
    }

    let backup;
    try {
        backup = JSON.parse(backupStr);
    } catch (e) {
        console.error('❌ Error parsing backup:', e);
        return false;
    }

    // Handle both old format (data only) and new format (with metadata)
    const data = backup.data || backup;
    const metadata = backup.metadata || { date: 'Unknown' };

    console.log(`📦 Backup info:`);
    console.log(`   Date: ${metadata.date || 'Unknown'}`);
    console.log(`   Paths: ${Object.keys(data).length}`);
    console.log('');

    console.warn('⚠️ WARNING: This will OVERWRITE current Firebase data!');
    console.log('');

    const proceed = confirm('Are you sure you want to restore from backup? This will overwrite current data!');
    if (!proceed) {
        console.log('Restore cancelled by user');
        return false;
    }

    console.log('');
    console.log('📤 Restoring data...');

    for (const [path, pathData] of Object.entries(data)) {
        if (pathData !== null) {
            try {
                await database.ref(path).set(pathData);
                console.log(`✅ Restored: ${path}`);
            } catch (error) {
                console.error(`❌ Error restoring ${path}:`, error);
            }
        }
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('✅ RESTORE COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('ℹ️ Refresh the page to see restored data');
    console.log('═══════════════════════════════════════════');

    return true;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * List all available backups in localStorage
 */
function listBackups() {
    const backupKeys = Object.keys(localStorage).filter(k => k.startsWith('firebase_backup_'));

    if (backupKeys.length === 0) {
        console.log('No backups found in localStorage');
        return [];
    }

    console.log('');
    console.log('Available backups:');
    console.log('─────────────────────────────────────────');

    backupKeys.forEach((key, index) => {
        try {
            const backup = JSON.parse(localStorage.getItem(key));
            const size = localStorage.getItem(key).length;
            const date = backup.metadata?.date || key.replace('firebase_backup_', '');
            console.log(`${index + 1}. ${key}`);
            console.log(`   Date: ${date}`);
            console.log(`   Size: ${(size / 1024).toFixed(2)} KB`);
        } catch (e) {
            console.log(`${index + 1}. ${key} (error reading)`);
        }
    });

    console.log('─────────────────────────────────────────');
    return backupKeys;
}

/**
 * Verify current state of migration
 */
async function verifyMigrationState(database) {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🔍 MIGRATION STATE CHECK');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // Check soluongProducts
    const productsSnapshot = await database.ref('soluongProducts').once('value');
    const products = productsSnapshot.val() || {};
    const productCount = Object.keys(products).length;
    console.log(`soluongProducts: ${productCount} products`);

    // Check soluongProductsQty
    const qtySnapshot = await database.ref('soluongProductsQty').once('value');
    const qtyData = qtySnapshot.val() || {};
    const qtyCount = Object.keys(qtyData).length;
    console.log(`soluongProductsQty: ${qtyCount} entries`);

    // Compare
    console.log('');
    if (qtyCount === 0) {
        console.log('Status: ❌ Migration NOT done (soluongProductsQty is empty)');
    } else if (qtyCount === productCount) {
        console.log('Status: ✅ Migration COMPLETE (counts match)');
    } else {
        console.log(`Status: ⚠️ Migration PARTIAL (${qtyCount}/${productCount})`);
    }

    // Verify data consistency
    if (qtyCount > 0 && productCount > 0) {
        console.log('');
        console.log('Checking data consistency...');
        let mismatches = 0;
        let missing = 0;

        Object.entries(products).forEach(([key, product]) => {
            const qty = qtyData[key];
            if (!qty) {
                missing++;
            } else if (qty.soldQty !== (product.soldQty || 0)) {
                mismatches++;
            }
        });

        if (missing === 0 && mismatches === 0) {
            console.log('✅ All data is consistent');
        } else {
            if (missing > 0) console.log(`⚠️ Missing in qty node: ${missing}`);
            if (mismatches > 0) console.log(`⚠️ Value mismatches: ${mismatches}`);
        }
    }

    console.log('');
    console.log('═══════════════════════════════════════════');

    return { productCount, qtyCount };
}

// Export for console use
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('🔧 FIREBASE MIGRATION SCRIPT LOADED');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('Available commands:');
console.log('');
console.log('  1. backupFirebaseData(database)');
console.log('     → Creates backup (RUN THIS FIRST!)');
console.log('');
console.log('  2. migrateQtyToSeparateNode(database)');
console.log('     → Migrates soldQty to separate node');
console.log('');
console.log('  3. verifyMigrationState(database)');
console.log('     → Check current migration status');
console.log('');
console.log('  4. rollbackMigration(database)');
console.log('     → Removes soluongProductsQty (if needed)');
console.log('');
console.log('  5. restoreFromBackup(database)');
console.log('     → Restores from backup (last resort)');
console.log('');
console.log('  6. listBackups()');
console.log('     → Shows available backups');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
