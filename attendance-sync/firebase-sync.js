/**
 * Firebase Sync - Đồng bộ dữ liệu chấm công lên Firestore
 */
const admin = require('firebase-admin');
const config = require('./config');

class FirebaseSync {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    /**
     * Khởi tạo Firebase Admin SDK
     */
    init() {
        if (this.initialized) return;

        const serviceAccount = require(config.firebase.serviceAccountPath);

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });

        this.db = admin.firestore();
        this.initialized = true;
        console.log(`[Firebase] Đã kết nối project: ${serviceAccount.project_id}`);
    }

    // ================================================================
    // ATTENDANCE RECORDS
    // ================================================================

    /**
     * Upload log chấm công lên Firestore (idempotent - không bị trùng)
     * @param {Array} records - Danh sách log từ máy chấm công
     * @param {Map} userMap - Map deviceUserId → {name, uid, ...}
     * @returns {number} Số bản ghi đã upload
     */
    async uploadAttendances(records, userMap) {
        if (!records.length) return 0;

        const col = this.db.collection(config.collections.records);
        const chunks = this._chunkArray(records, 450); // Batch limit 500
        let total = 0;

        for (const chunk of chunks) {
            const batch = this.db.batch();

            for (const record of chunk) {
                const attTime = this._parseTime(record.attTime);
                if (!attTime) continue;

                // Doc ID = deviceUserId_timestamp → tự chống trùng
                const docId = `${record.deviceUserId}_${attTime.getTime()}`;
                const userData = userMap.get(String(record.deviceUserId)) || {};

                // Tạo dateKey dạng YYYY-MM-DD để query theo ngày
                const dateKey = attTime.toISOString().split('T')[0];

                batch.set(col.doc(docId), {
                    deviceUserId: String(record.deviceUserId),
                    employeeName: userData.name || `User ${record.deviceUserId}`,
                    checkTime: admin.firestore.Timestamp.fromDate(attTime),
                    dateKey,
                    type: record.type != null ? record.type : 0,
                    source: 'dg600',
                    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

                total++;
            }

            await batch.commit();
        }

        return total;
    }

    /**
     * Lấy thời điểm sync cuối cùng
     */
    async getLastSyncTime() {
        try {
            const doc = await this.db
                .collection(config.collections.syncStatus)
                .doc('current')
                .get();

            if (doc.exists && doc.data().lastSyncTime) {
                return doc.data().lastSyncTime.toDate();
            }
        } catch (err) {
            console.warn(`[Firebase] Không đọc được lastSyncTime: ${err.message}`);
        }
        return null;
    }

    /**
     * Cập nhật trạng thái sync
     */
    async updateSyncStatus(data) {
        await this.db
            .collection(config.collections.syncStatus)
            .doc('current')
            .set({
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
    }

    // ================================================================
    // DEVICE USERS - Đồng bộ danh sách nhân viên từ máy CC
    // ================================================================

    /**
     * Đồng bộ danh sách user trên máy chấm công lên Firestore
     */
    async syncDeviceUsers(users) {
        const col = this.db.collection(config.collections.deviceUsers);
        const chunks = this._chunkArray(users, 450);

        for (const chunk of chunks) {
            const batch = this.db.batch();

            for (const user of chunk) {
                batch.set(col.doc(String(user.uid)), {
                    uid: String(user.uid),
                    name: user.name || '',
                    role: user.role || 0,
                    cardno: user.cardno || '',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }

            await batch.commit();
        }

        console.log(`[Firebase] Đồng bộ ${users.length} device users`);
    }

    // ================================================================
    // COMMANDS - Nhận lệnh từ Web App
    // ================================================================

    /**
     * Lắng nghe lệnh mới từ Web App (enroll vân tay, sync thủ công, v.v.)
     * @param {Function} callback - Xử lý khi có lệnh mới
     * @returns {Function} unsubscribe
     */
    listenForCommands(callback) {
        return this.db
            .collection(config.collections.commands)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added' || change.type === 'modified') {
                        const data = { id: change.doc.id, ...change.doc.data() };
                        if (data.status === 'pending') {
                            callback(data);
                        }
                    }
                });
            }, (err) => {
                console.error(`[Firebase] Lỗi listener commands: ${err.message}`);
            });
    }

    /**
     * Cập nhật trạng thái lệnh
     */
    async updateCommand(commandId, status, result = {}) {
        await this.db
            .collection(config.collections.commands)
            .doc(commandId)
            .update({
                status,
                result,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
    }

    // ================================================================
    // HELPERS
    // ================================================================

    /**
     * Parse thời gian từ nhiều định dạng khác nhau
     */
    _parseTime(timeValue) {
        if (!timeValue) return null;
        if (timeValue instanceof Date) return timeValue;

        const d = new Date(timeValue);
        if (!isNaN(d.getTime())) return d;

        // Thử parse dạng "YYYY-MM-DD HH:mm:ss"
        const match = String(timeValue).match(
            /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/
        );
        if (match) {
            return new Date(
                parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
                parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
            );
        }

        console.warn(`[Firebase] Không parse được thời gian: ${timeValue}`);
        return null;
    }

    /**
     * Chia mảng thành các chunk nhỏ
     */
    _chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }
}

module.exports = FirebaseSync;
