/**
 * KPI Cleanup Script - Xóa TOÀN BỘ dữ liệu KPI
 * 
 * Chạy trong browser console khi đang ở trang orders-report
 * (cần Firebase đã được khởi tạo)
 * 
 * Collections sẽ bị xóa:
 * 1. kpi_base/{orderId}
 * 2. kpi_statistics/{userId}/dates/{date}  (subcollection)
 * 3. kpi_audit_log/{auto-id}
 */

(async function cleanupAllKPI() {
    'use strict';

    if (!window.firebase || !window.firebase.firestore) {
        console.error('❌ Firebase chưa sẵn sàng. Hãy chạy script này trên trang orders-report.');
        return;
    }

    const db = window.firebase.firestore();
    const BATCH_SIZE = 500; // Firestore batch limit
    let totalDeleted = 0;

    console.log('🧹 Bắt đầu cleanup toàn bộ dữ liệu KPI...\n');

    // Helper: delete documents in batches
    async function deleteCollection(collectionPath) {
        let deleted = 0;
        let snapshot;

        do {
            snapshot = await db.collection(collectionPath).limit(BATCH_SIZE).get();
            if (snapshot.empty) break;

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            deleted += snapshot.size;
            console.log(`  → Đã xóa ${deleted} documents từ ${collectionPath}`);
        } while (snapshot.size === BATCH_SIZE);

        return deleted;
    }

    // ========================================
    // 1. Xóa kpi_statistics (có subcollection)
    // ========================================
    console.log('📊 [1/3] Xóa kpi_statistics...');
    try {
        const usersSnapshot = await db.collection('kpi_statistics').get();
        let statsDeleted = 0;

        for (const userDoc of usersSnapshot.docs) {
            // Xóa subcollection dates trước
            const datesSnapshot = await db.collection('kpi_statistics')
                .doc(userDoc.id)
                .collection('dates')
                .get();

            if (!datesSnapshot.empty) {
                const batch = db.batch();
                datesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                statsDeleted += datesSnapshot.size;
            }

            // Xóa parent document
            await userDoc.ref.delete();
            statsDeleted++;
        }

        totalDeleted += statsDeleted;
        console.log(`  ✅ kpi_statistics: ${statsDeleted} documents đã xóa\n`);
    } catch (e) {
        console.error('  ❌ Lỗi xóa kpi_statistics:', e.message);
    }

    // ========================================
    // 2. Xóa kpi_base
    // ========================================
    console.log('📦 [2/3] Xóa kpi_base...');
    try {
        const count = await deleteCollection('kpi_base');
        totalDeleted += count;
        console.log(`  ✅ kpi_base: ${count} documents đã xóa\n`);
    } catch (e) {
        console.error('  ❌ Lỗi xóa kpi_base:', e.message);
    }

    // ========================================
    // 3. Xóa kpi_audit_log
    // ========================================
    console.log('📝 [3/3] Xóa kpi_audit_log...');
    try {
        const count = await deleteCollection('kpi_audit_log');
        totalDeleted += count;
        console.log(`  ✅ kpi_audit_log: ${count} documents đã xóa\n`);
    } catch (e) {
        console.error('  ❌ Lỗi xóa kpi_audit_log:', e.message);
    }

    // ========================================
    // Kết quả
    // ========================================
    console.log('═══════════════════════════════════════');
    console.log(`🎉 Hoàn tất! Tổng cộng đã xóa ${totalDeleted} documents.`);
    console.log('💡 Hãy refresh tab KPI hoa hồng để thấy kết quả.');
    console.log('═══════════════════════════════════════');
})();
