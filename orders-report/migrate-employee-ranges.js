/**
 * EMPLOYEE RANGES MIGRATION SCRIPT
 * Migrate từ Realtime Database sang Firestore
 *
 * USAGE:
 * 1. Mở main.html trong browser
 * 2. Mở Console (F12)
 * 3. Copy toàn bộ file này và paste vào Console
 * 4. Chạy: await migrateEmployeeRanges()
 *
 * NOTE: Script này KHÔNG XÓA data ở RTDB, chỉ COPY sang Firestore
 */

async function migrateEmployeeRanges() {
    console.log('[MIGRATION] 🚀 Starting Employee Ranges migration...');

    // Check Firebase availability
    if (!firebase || !firebase.database || !firebase.firestore) {
        console.error('[MIGRATION] ❌ Firebase not initialized');
        return;
    }

    const db = firebase.database();
    const firestore = firebase.firestore();

    let totalMigrated = 0;
    const errors = [];

    try {
        // ========================================
        // STEP 1: Migrate General Employee Ranges
        // ========================================
        console.log('[MIGRATION] 📋 Step 1: Migrating general employee ranges...');

        const generalSnapshot = await db.ref('settings/employee_ranges').once('value');
        const generalData = generalSnapshot.val();

        if (generalData) {
            const generalRanges = normalizeData(generalData);
            console.log(`[MIGRATION] Found ${generalRanges.length} general ranges`);

            // Delete existing general ranges in Firestore
            const existingGeneral = await firestore.collection('employeeRanges')
                .where('isGeneral', '==', true)
                .get();

            const deleteBatch = firestore.batch();
            existingGeneral.docs.forEach(doc => {
                deleteBatch.delete(doc.ref);
            });
            await deleteBatch.commit();
            console.log(`[MIGRATION] Deleted ${existingGeneral.size} existing general ranges`);

            // Insert new general ranges
            const insertBatch = firestore.batch();
            generalRanges.forEach(range => {
                const docRef = firestore.collection('employeeRanges').doc();
                insertBatch.set(docRef, {
                    employeeId: range.id || range.employeeId || null,
                    employeeName: range.name || range.employeeName || 'Unknown',
                    start: parseInt(range.start) || 0,
                    end: parseInt(range.end) || 0,
                    campaignId: null,
                    campaignName: null,
                    isGeneral: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                totalMigrated++;
            });
            await insertBatch.commit();
            console.log(`[MIGRATION] ✅ Migrated ${generalRanges.length} general ranges`);
        } else {
            console.log('[MIGRATION] No general ranges found');
        }

        // ========================================
        // STEP 2: Migrate Campaign-Specific Ranges
        // ========================================
        console.log('[MIGRATION] 📋 Step 2: Migrating campaign-specific employee ranges...');

        const campaignSnapshot = await db.ref('settings/employee_ranges_by_campaign').once('value');
        const campaignData = campaignSnapshot.val();

        if (campaignData) {
            const campaigns = Object.keys(campaignData);
            console.log(`[MIGRATION] Found ${campaigns.length} campaigns`);

            for (const campaignKey of campaigns) {
                try {
                    const ranges = normalizeData(campaignData[campaignKey]);

                    if (ranges.length === 0) {
                        console.log(`[MIGRATION] ⚠️ Campaign "${campaignKey}" has no ranges, skipping`);
                        continue;
                    }

                    console.log(`[MIGRATION] Processing campaign "${campaignKey}" (${ranges.length} ranges)`);

                    // Delete existing ranges for this campaign
                    const existingCampaign = await firestore.collection('employeeRanges')
                        .where('campaignId', '==', campaignKey)
                        .get();

                    if (existingCampaign.size > 0) {
                        const deleteBatch = firestore.batch();
                        existingCampaign.docs.forEach(doc => {
                            deleteBatch.delete(doc.ref);
                        });
                        await deleteBatch.commit();
                        console.log(`[MIGRATION]   Deleted ${existingCampaign.size} existing ranges`);
                    }

                    // Insert new campaign ranges
                    const insertBatch = firestore.batch();
                    ranges.forEach(range => {
                        const docRef = firestore.collection('employeeRanges').doc();
                        insertBatch.set(docRef, {
                            employeeId: range.id || range.employeeId || null,
                            employeeName: range.name || range.employeeName || 'Unknown',
                            start: parseInt(range.start) || 0,
                            end: parseInt(range.end) || 0,
                            campaignId: campaignKey,
                            campaignName: campaignKey, // Can be updated to display name later
                            isGeneral: false,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        totalMigrated++;
                    });
                    await insertBatch.commit();
                    console.log(`[MIGRATION]   ✅ Migrated ${ranges.length} ranges for "${campaignKey}"`);

                } catch (error) {
                    console.error(`[MIGRATION]   ❌ Error migrating campaign "${campaignKey}":`, error);
                    errors.push({ campaign: campaignKey, error: error.message });
                }
            }
        } else {
            console.log('[MIGRATION] No campaign-specific ranges found');
        }

        // ========================================
        // SUMMARY
        // ========================================
        console.log('\n' + '='.repeat(60));
        console.log('[MIGRATION] 🎉 MIGRATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`✅ Total documents migrated: ${totalMigrated}`);

        if (errors.length > 0) {
            console.log(`⚠️  Errors encountered: ${errors.length}`);
            errors.forEach(err => {
                console.log(`   - Campaign "${err.campaign}": ${err.error}`);
            });
        } else {
            console.log('✅ No errors');
        }

        // Verify migration
        const verifySnapshot = await firestore.collection('employeeRanges').get();
        console.log(`📊 Total documents in Firestore: ${verifySnapshot.size}`);

        console.log('\n📝 Next steps:');
        console.log('   1. Verify data in Firebase Console');
        console.log('   2. Update code to use Firestore');
        console.log('   3. Test thoroughly');
        console.log('   4. Deploy');

        return {
            success: true,
            totalMigrated,
            errors,
            firestoreCount: verifySnapshot.size
        };

    } catch (error) {
        console.error('[MIGRATION] ❌ Critical error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Helper: Normalize RTDB data (object or array) to array
 */
function normalizeData(data) {
    if (!data) return [];

    if (Array.isArray(data)) {
        return data.filter(item => item && typeof item === 'object');
    }

    if (typeof data === 'object') {
        const result = [];
        const keys = Object.keys(data)
            .filter(k => !isNaN(k))
            .sort((a, b) => Number(a) - Number(b));

        for (const key of keys) {
            if (data[key] && typeof data[key] === 'object') {
                result.push(data[key]);
            }
        }
        return result;
    }

    return [];
}

/**
 * Helper: Verify migration integrity
 */
async function verifyMigration() {
    console.log('[VERIFY] 🔍 Verifying migration...');

    const db = firebase.database();
    const firestore = firebase.firestore();

    // Count RTDB records
    const generalRTDB = await db.ref('settings/employee_ranges').once('value');
    const generalCount = normalizeData(generalRTDB.val()).length;

    const campaignRTDB = await db.ref('settings/employee_ranges_by_campaign').once('value');
    const campaignData = campaignRTDB.val() || {};
    let campaignCount = 0;
    Object.values(campaignData).forEach(ranges => {
        campaignCount += normalizeData(ranges).length;
    });

    const totalRTDB = generalCount + campaignCount;

    // Count Firestore records
    const firestoreSnapshot = await firestore.collection('employeeRanges').get();
    const totalFirestore = firestoreSnapshot.size;

    console.log(`[VERIFY] RTDB: ${totalRTDB} records (${generalCount} general + ${campaignCount} campaign)`);
    console.log(`[VERIFY] Firestore: ${totalFirestore} documents`);

    if (totalRTDB === totalFirestore) {
        console.log('[VERIFY] ✅ Record counts match!');
        return true;
    } else {
        console.warn(`[VERIFY] ⚠️ Record count mismatch! RTDB: ${totalRTDB}, Firestore: ${totalFirestore}`);
        return false;
    }
}

/**
 * Helper: Rollback migration (delete all Firestore data)
 */
async function rollbackMigration() {
    console.log('[ROLLBACK] ⚠️  Rolling back migration...');

    const firestore = firebase.firestore();
    const snapshot = await firestore.collection('employeeRanges').get();

    console.log(`[ROLLBACK] Found ${snapshot.size} documents to delete`);

    const batch = firestore.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log('[ROLLBACK] ✅ All Firestore documents deleted');
    console.log('[ROLLBACK] RTDB data remains intact');
}

// Export functions to window for console access
window.migrateEmployeeRanges = migrateEmployeeRanges;
window.verifyMigration = verifyMigration;
window.rollbackMigration = rollbackMigration;

console.log('📦 Migration script loaded!');
console.log('Commands available:');
console.log('  - await migrateEmployeeRanges()  : Run migration');
console.log('  - await verifyMigration()        : Verify data integrity');
console.log('  - await rollbackMigration()      : Delete all Firestore data');
