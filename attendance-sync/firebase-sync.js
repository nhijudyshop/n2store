/**
 * Firebase Sync - Upload du lieu cham cong len Firestore
 */
const admin = require('firebase-admin');
const config = require('./config');
const path = require('path');

class FirebaseSync {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    /**
     * Khoi tao Firebase Admin SDK
     */
    init() {
        if (this.initialized) return;

        const credPath = path.resolve(__dirname, config.firebase.credentialPath);
        const serviceAccount = require(credPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });

        this.db = admin.firestore();
        this.initialized = true;
        console.log('[Firebase] Da khoi tao thanh cong');
    }

    /**
     * Upload ban ghi cham cong len Firestore
     * Dung doc ID duy nhat de tranh trung lap: {deviceUserId}_{timestamp}
     */
    async uploadAttendances(records) {
        if (!records || records.length === 0) return { uploaded: 0, skipped: 0 };

        const col = this.db.collection(config.collections.records);
        let uploaded = 0;
        let skipped = 0;

        // Chia thanh batch 450 records (duoi gioi han 500 cua Firestore)
        const batchSize = 450;
        for (let i = 0; i < records.length; i += batchSize) {
            const chunk = records.slice(i, i + batchSize);
            const batch = this.db.batch();

            for (const record of chunk) {
                const checkTime = record.recordTime
                    ? new Date(record.recordTime)
                    : new Date(record.timestamp || record.time || Date.now());

                const dateKey = this._toDateKey(checkTime);
                const deviceUserId = String(record.deviceUserId || record.odoo_id || record.userId || record.uid || '');
                const ts = checkTime.getTime();

                // Doc ID duy nhat
                const docId = `${deviceUserId}_${ts}`;
                const docRef = col.doc(docId);

                batch.set(docRef, {
                    deviceUserId,
                    checkTime: admin.firestore.Timestamp.fromDate(checkTime),
                    dateKey,
                    type: record.type || record.attState || 0,
                    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                uploaded++;
            }

            await batch.commit();
        }

        console.log(`[Firebase] Upload ${uploaded} records, skip ${skipped}`);
        return { uploaded, skipped };
    }

    /**
     * Dong bo danh sach user tu may len Firestore
     */
    async syncDeviceUsers(users) {
        if (!users || users.length === 0) return;

        const col = this.db.collection(config.collections.deviceUsers);
        const batch = this.db.batch();

        for (const user of users) {
            const uid = String(user.uid || user.userId || user.id || '');
            if (!uid) continue;

            const docRef = col.doc(uid);
            batch.set(docRef, {
                uid,
                name: user.name || `User ${uid}`,
                role: user.role || 0,
                cardno: user.cardno || '',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        await batch.commit();
        console.log(`[Firebase] Sync ${users.length} device users`);
    }

    /**
     * Lay thoi gian sync lan cuoi
     */
    async getLastSyncTime() {
        const doc = await this.db.collection(config.collections.syncStatus).doc('current').get();
        if (doc.exists && doc.data().lastSyncTime) {
            return doc.data().lastSyncTime.toDate();
        }
        return null;
    }

    /**
     * Cap nhat trang thai sync
     */
    async updateSyncStatus(data) {
        await this.db.collection(config.collections.syncStatus).doc('current').set({
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    /**
     * Lang nghe lenh tu web app (real-time)
     */
    listenForCommands(callback) {
        return this.db.collection(config.collections.commands)
            .where('status', '==', 'pending')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const cmd = { id: change.doc.id, ...change.doc.data() };
                        callback(cmd);
                    }
                });
            }, err => {
                console.error('[Firebase] Loi listen commands:', err.message);
            });
    }

    /**
     * Cap nhat trang thai lenh
     */
    async updateCommandStatus(cmdId, status, result) {
        await this.db.collection(config.collections.commands).doc(cmdId).update({
            status,
            result: result || '',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    /**
     * Format date thanh YYYY-MM-DD
     */
    _toDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}

module.exports = FirebaseSync;
