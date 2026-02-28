/**
 * Config cho attendance-sync service
 * Doi IP/port neu can
 */
module.exports = {
    device: {
        ip: '192.168.1.201',
        port: 4370,
        inport: 5200,       // Local UDP port nhan response
        timeout: 10000,      // Timeout 10 giay
    },

    firebase: {
        credentialPath: './serviceAccountKey.json',
    },

    sync: {
        intervalMs: 5 * 60 * 1000,   // Sync moi 5 phut
        retryDelayMs: 30 * 1000,      // Retry sau 30 giay khi loi
        maxRetries: 3,                // Toi da 3 lan retry
    },

    collections: {
        records: 'attendance_records',
        deviceUsers: 'attendance_device_users',
        commands: 'attendance_commands',
        syncStatus: 'attendance_sync_status',
    },
};
