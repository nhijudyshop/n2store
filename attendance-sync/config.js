const path = require('path');

module.exports = {
    // ============================================================
    // Ronald Jack DG-600 - Kết nối qua ZK Protocol
    // ============================================================
    device: {
        ip: '192.168.1.201',
        port: 4370,
        inport: 5200,
        timeout: 10000,  // 10 giây (DG-600 có thể chậm phản hồi)
    },

    // ============================================================
    // Firebase Admin SDK
    // Cần file serviceAccountKey.json từ Firebase Console:
    // Project Settings → Service Accounts → Generate New Private Key
    // ============================================================
    firebase: {
        serviceAccountPath: path.join(__dirname, 'serviceAccountKey.json'),
    },

    // ============================================================
    // Firestore collections cho chấm công
    // ============================================================
    collections: {
        records: 'attendance_records',       // Log chấm công
        deviceUsers: 'attendance_device_users', // DS user trên máy CC
        commands: 'attendance_commands',      // Lệnh từ web (enroll, sync...)
        syncStatus: 'attendance_sync_status', // Trạng thái sync
    },

    // ============================================================
    // Cài đặt đồng bộ
    // ============================================================
    sync: {
        intervalMs: 2 * 60 * 1000,       // Poll mỗi 2 phút
        retryIntervalMs: 30 * 1000,       // Thử lại sau 30 giây khi lỗi
        maxRetries: 5,                     // Tối đa 5 lần thử liên tiếp
        longRetryMs: 5 * 60 * 1000,       // Nghỉ 5 phút sau khi hết lần thử
    },

    // ============================================================
    // Logging
    // ============================================================
    log: {
        dir: path.join(__dirname, 'logs'),
        maxFiles: 30, // Giữ log 30 ngày
    },
};
