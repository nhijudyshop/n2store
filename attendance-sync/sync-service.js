/**
 * N2Store Attendance Sync Service
 * ================================
 * Đồng bộ dữ liệu chấm công từ Ronald Jack DG-600 lên Firebase Firestore.
 *
 * Cách hoạt động:
 *   1. Khởi động: kết nối máy CC → sync toàn bộ users + logs
 *   2. Bật real-time monitoring (nhận log ngay khi quẹt vân tay)
 *   3. Backup: poll định kỳ mỗi 2 phút để bắt log bị sót
 *   4. Lắng nghe lệnh từ Web App (thêm user, sync thủ công)
 *
 * Chạy: node sync-service.js
 */
const DeviceManager = require('./device-manager');
const FirebaseSync = require('./firebase-sync');
const config = require('./config');
const fs = require('fs');
const path = require('path');

class SyncService {
    constructor() {
        this.device = new DeviceManager();
        this.firebase = new FirebaseSync();
        this.userMap = new Map(); // deviceUserId → {name, uid, ...}
        this.running = false;
        this.retryCount = 0;
        this.syncTimer = null;
        this.commandUnsubscribe = null;
        this.realTimeActive = false;
    }

    /**
     * Khởi động service
     */
    async start() {
        this._log('='.repeat(55));
        this._log('  N2Store Attendance Sync Service');
        this._log(`  Máy chấm công: Ronald Jack DG-600 @ ${config.device.ip}`);
        this._log(`  Interval: ${config.sync.intervalMs / 1000}s`);
        this._log('='.repeat(55));

        // Khởi tạo Firebase
        try {
            this.firebase.init();
        } catch (err) {
            this._log(`[LỖI] Không khởi tạo được Firebase: ${err.message}`, 'error');
            this._log('Kiểm tra file serviceAccountKey.json', 'error');
            process.exit(1);
        }

        this.running = true;

        // Lắng nghe lệnh từ Web App
        this._startCommandListener();

        // Bắt đầu vòng lặp chính
        await this._mainLoop();
    }

    /**
     * Vòng lặp chính - kết nối, sync, retry
     */
    async _mainLoop() {
        while (this.running) {
            try {
                // Kết nối máy chấm công
                await this.device.connect();
                this.retryCount = 0;

                // Cập nhật trạng thái: đã kết nối
                await this.firebase.updateSyncStatus({
                    connected: true,
                    deviceIp: config.device.ip,
                    lastConnectedAt: new Date().toISOString(),
                });

                // Sync toàn bộ users
                await this._syncUsers();

                // Sync log chấm công
                await this._syncAttendances();

                // Thử bật real-time monitoring
                await this._startRealTimeMonitoring();

                // Bắt đầu poll định kỳ (backup)
                await this._startPeriodicSync();

            } catch (err) {
                this._log(`[LỖI] ${err.message}`, 'error');

                // Dọn dẹp
                this._stopPeriodicSync();
                this.realTimeActive = false;
                await this.device.disconnect();

                // Cập nhật trạng thái: mất kết nối
                try {
                    await this.firebase.updateSyncStatus({
                        connected: false,
                        lastError: err.message,
                        lastErrorAt: new Date().toISOString(),
                    });
                } catch (e) {
                    // Ignore
                }

                // Retry
                this.retryCount++;
                const waitMs = this.retryCount > config.sync.maxRetries
                    ? config.sync.longRetryMs
                    : config.sync.retryIntervalMs;

                this._log(`Thử lại lần ${this.retryCount} sau ${waitMs / 1000}s...`);
                await this._sleep(waitMs);
            }
        }
    }

    /**
     * Đồng bộ danh sách user từ máy CC
     */
    async _syncUsers() {
        const users = await this.device.getUsers();

        // Cập nhật local map
        this.userMap.clear();
        for (const user of users) {
            this.userMap.set(String(user.uid), user);
        }

        // Upload lên Firestore
        await this.firebase.syncDeviceUsers(users);
        this._log(`Đồng bộ ${users.length} nhân viên từ máy CC`);
    }

    /**
     * Đồng bộ log chấm công (chỉ log mới)
     */
    async _syncAttendances() {
        const lastSync = await this.firebase.getLastSyncTime();
        const allLogs = await this.device.getAttendances();

        // Lọc log mới (sau thời điểm sync cuối)
        let newLogs = allLogs;
        if (lastSync) {
            newLogs = allLogs.filter(log => {
                const logTime = new Date(log.attTime);
                return logTime > lastSync;
            });
        }

        if (newLogs.length > 0) {
            const count = await this.firebase.uploadAttendances(newLogs, this.userMap);
            this._log(`Upload ${count} bản ghi chấm công mới`);
        } else {
            this._log('Không có bản ghi chấm công mới');
        }

        // Cập nhật trạng thái sync
        await this.firebase.updateSyncStatus({
            lastSyncTime: new Date(),
            totalLogsOnDevice: allLogs.length,
            newLogsCount: newLogs.length,
        });
    }

    /**
     * Bật real-time monitoring (nhận log ngay khi quẹt vân tay)
     */
    async _startRealTimeMonitoring() {
        if (this.realTimeActive) return;

        const started = await this.device.startRealTimeLogs(async (log) => {
            this._log(`[REAL-TIME] ${log.deviceUserId} quẹt vân tay lúc ${log.attTime}`);
            try {
                await this.firebase.uploadAttendances([log], this.userMap);
            } catch (err) {
                this._log(`[REAL-TIME] Lỗi upload: ${err.message}`, 'error');
            }
        });

        this.realTimeActive = started;
    }

    /**
     * Poll định kỳ (backup cho real-time)
     */
    _startPeriodicSync() {
        return new Promise((resolve) => {
            this._stopPeriodicSync();

            this.syncTimer = setInterval(async () => {
                try {
                    this._log('--- Poll định kỳ ---');
                    await this._syncAttendances();
                } catch (err) {
                    this._log(`[Poll] Lỗi: ${err.message}`, 'error');
                    // Nếu mất kết nối, dừng timer và throw để mainLoop retry
                    this._stopPeriodicSync();
                    this.realTimeActive = false;
                    // Disconnect để mainLoop chạy lại
                    this.device.disconnect();
                }
            }, config.sync.intervalMs);

            this._log(`Poll định kỳ mỗi ${config.sync.intervalMs / 1000}s`);
            resolve();
        });
    }

    _stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * Lắng nghe lệnh từ Web App qua Firestore
     */
    _startCommandListener() {
        this.commandUnsubscribe = this.firebase.listenForCommands(async (command) => {
            this._log(`[LỆNH] ${command.action} - ${command.employeeName || ''}`);
            await this._handleCommand(command);
        });
        this._log('Đang lắng nghe lệnh từ Web App...');
    }

    /**
     * Xử lý lệnh từ Web App
     */
    async _handleCommand(command) {
        try {
            switch (command.action) {
                case 'add_user': {
                    // Thêm user vào máy chấm công
                    const { deviceUserId, employeeName, role } = command;
                    await this.device.addUser(deviceUserId, employeeName, role || 0);
                    // Sync lại danh sách users
                    await this._syncUsers();
                    await this.firebase.updateCommand(command.id, 'completed', {
                        message: `Đã thêm "${employeeName}" vào máy chấm công (ID: ${deviceUserId})`,
                    });
                    break;
                }

                case 'delete_user': {
                    const { deviceUserId } = command;
                    await this.device.deleteUser(deviceUserId);
                    await this._syncUsers();
                    await this.firebase.updateCommand(command.id, 'completed', {
                        message: `Đã xoá user ID: ${deviceUserId}`,
                    });
                    break;
                }

                case 'sync_now': {
                    await this._syncUsers();
                    await this._syncAttendances();
                    await this.firebase.updateCommand(command.id, 'completed', {
                        message: 'Đồng bộ thành công',
                    });
                    break;
                }

                case 'enroll_fingerprint': {
                    // Đăng ký vân tay cần user đặt tay trực tiếp lên máy
                    // Script chỉ có thể thêm user, việc quẹt vân tay làm trên máy
                    const { deviceUserId, employeeName } = command;
                    await this.device.addUser(deviceUserId, employeeName, 0);
                    await this.firebase.updateCommand(command.id, 'waiting_fingerprint', {
                        message: `Đã thêm "${employeeName}" (ID: ${deviceUserId}). Vui lòng đến máy chấm công, vào Menu → User → chọn user → đăng ký vân tay.`,
                    });
                    break;
                }

                default:
                    await this.firebase.updateCommand(command.id, 'failed', {
                        message: `Lệnh không hợp lệ: ${command.action}`,
                    });
            }
        } catch (err) {
            this._log(`[LỆNH] Lỗi: ${err.message}`, 'error');
            await this.firebase.updateCommand(command.id, 'failed', {
                message: err.message,
            });
        }
    }

    /**
     * Dừng service
     */
    stop() {
        this.running = false;
        this._stopPeriodicSync();
        if (this.commandUnsubscribe) {
            this.commandUnsubscribe();
        }
        this.device.disconnect();
        this._log('Service đã dừng');
    }

    // ================================================================
    // HELPERS
    // ================================================================

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _log(message, level = 'info') {
        const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const prefix = level === 'error' ? '❌' : '✔';
        const line = `[${now}] ${prefix} ${message}`;

        console.log(line);

        // Ghi log ra file theo ngày
        try {
            const logDir = config.log.dir;
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const dateStr = new Date().toISOString().split('T')[0];
            const logFile = path.join(logDir, `sync-${dateStr}.log`);
            fs.appendFileSync(logFile, line + '\n');
        } catch (e) {
            // Ignore log errors
        }
    }
}

// ================================================================
// KHỞI CHẠY
// ================================================================
const service = new SyncService();

// Tắt an toàn khi nhận SIGINT (Ctrl+C) hoặc SIGTERM
process.on('SIGINT', () => {
    console.log('\nĐang tắt...');
    service.stop();
    setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
    service.stop();
    setTimeout(() => process.exit(0), 1000);
});

// Bắt lỗi không xử lý
process.on('uncaughtException', (err) => {
    console.error('[FATAL]', err.message);
    service.stop();
    setTimeout(() => process.exit(1), 1000);
});

// Start
service.start();
