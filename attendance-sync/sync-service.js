/**
 * Sync Service - Chuong trinh chinh
 * Dong bo du lieu cham cong tu may Ronald Jack DG-600 len Firebase
 * Chay tren PC cong ty (Windows) 24/7
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
        this.running = false;
        this.syncTimer = null;
        this.commandListener = null;
    }

    /**
     * Khoi dong service
     */
    async start() {
        this._log('=== ATTENDANCE SYNC SERVICE v2.0 ===');
        this._log(`May cham cong: ${config.device.ip}:${config.device.port}`);
        this._log(`Sync interval: ${config.sync.intervalMs / 1000}s`);

        // 1. Init Firebase
        try {
            this.firebase.init();
            this._log('Firebase: OK');
        } catch (err) {
            this._log(`[FATAL] Loi Firebase: ${err.message}`);
            this._log('Dam bao file serviceAccountKey.json ton tai trong thu muc attendance-sync/');
            process.exit(1);
        }

        // 2. Ket noi may cham cong
        let connected = false;
        for (let attempt = 1; attempt <= config.sync.maxRetries; attempt++) {
            try {
                this._log(`Ket noi may cham cong (lan ${attempt}/${config.sync.maxRetries})...`);
                await this.device.connect();
                connected = true;
                break;
            } catch (err) {
                this._log(`Lan ${attempt} that bai: ${err.message}`);
                if (attempt < config.sync.maxRetries) {
                    this._log(`Thu lai sau ${config.sync.retryDelayMs / 1000}s...`);
                    await this._sleep(config.sync.retryDelayMs);
                }
            }
        }

        if (!connected) {
            this._log('[FATAL] Khong the ket noi may cham cong sau nhieu lan thu');
            this._log('Kiem tra:');
            this._log('  1. May cham cong da bat va o cung mang LAN');
            this._log('  2. IP dung: ' + config.device.ip);
            this._log('  3. Port dung: ' + config.device.port);
            this._log('  4. Firewall khong chan UDP port 4370');
            this._log('  5. Khong co phan mem khac dang ket noi may cham cong');
            await this.firebase.updateSyncStatus({
                connected: false,
                lastError: 'Khong ket noi duoc may cham cong',
            });
            process.exit(1);
        }

        // 3. Lay thong tin may
        try {
            const info = await this.device.getInfo();
            this._log(`Thong tin may: ${JSON.stringify(info)}`);
        } catch (err) {
            this._log(`Canh bao: Khong lay duoc thong tin may: ${err.message}`);
        }

        // 4. Sync lan dau
        this.running = true;
        await this._fullSync();

        // 5. Cap nhat trang thai connected
        await this.firebase.updateSyncStatus({
            connected: true,
            startedAt: new Date().toISOString(),
            lastError: null,
        });

        // 6. Bat real-time monitoring
        this._startRealTimeMonitoring();

        // 7. Bat dinh ky sync
        this._startPeriodicSync();

        // 8. Lang nghe lenh tu web
        this._startCommandListener();

        // 9. Xu ly tat may
        this._handleShutdown();

        this._log('Service dang chay. Nhan Ctrl+C de dung.');
    }

    /**
     * Full sync: users + attendance records
     */
    async _fullSync() {
        this._log('--- Bat dau dong bo ---');

        // Sync users
        try {
            const users = await this.device.getUsers();
            if (users.length > 0) {
                await this.firebase.syncDeviceUsers(users);
                this._log(`Sync ${users.length} users thanh cong`);
            }
        } catch (err) {
            this._log(`Loi sync users: ${err.message}`);
        }

        // Sync attendance
        try {
            const records = await this.device.getAttendances();
            if (records.length > 0) {
                const result = await this.firebase.uploadAttendances(records);
                this._log(`Upload ${result.uploaded} ban ghi cham cong`);
            } else {
                this._log('Khong co ban ghi cham cong moi');
            }
        } catch (err) {
            this._log(`Loi sync attendance: ${err.message}`);
        }

        // Cap nhat thoi gian sync
        await this.firebase.updateSyncStatus({
            lastSyncTime: new Date().toISOString(),
            connected: true,
        });

        this._log('--- Dong bo xong ---');
    }

    /**
     * Nghe real-time khi nhan vien quet van tay
     */
    _startRealTimeMonitoring() {
        this.device.startRealTimeLogs(async (data) => {
            try {
                // Upload record moi ngay lap tuc
                const record = {
                    deviceUserId: String(data.odoo_id || data.odoo || data.userId || ''),
                    recordTime: data.attTime || data.time || new Date().toISOString(),
                    type: data.attState || data.type || 0,
                };
                await this.firebase.uploadAttendances([record]);
                this._log(`Real-time: User ${record.deviceUserId} cham cong luc ${record.recordTime}`);
            } catch (err) {
                this._log(`Loi xu ly real-time: ${err.message}`);
            }
        }).catch(err => {
            this._log(`Canh bao: Khong bat duoc real-time logs: ${err.message}`);
        });
    }

    /**
     * Dinh ky sync (moi 5 phut)
     */
    _startPeriodicSync() {
        this.syncTimer = setInterval(async () => {
            if (!this.running) return;
            try {
                await this._fullSync();
            } catch (err) {
                this._log(`Loi periodic sync: ${err.message}`);
                // Thu reconnect
                try {
                    await this.device.disconnect();
                    await this.device.connect();
                    this._log('Reconnect thanh cong');
                } catch (reconErr) {
                    this._log(`Reconnect that bai: ${reconErr.message}`);
                    await this.firebase.updateSyncStatus({
                        connected: false,
                        lastError: reconErr.message,
                    });
                }
            }
        }, config.sync.intervalMs);

        this._log(`Periodic sync moi ${config.sync.intervalMs / 1000}s`);
    }

    /**
     * Lang nghe lenh tu web app
     */
    _startCommandListener() {
        this.commandListener = this.firebase.listenForCommands(async (cmd) => {
            this._log(`Nhan lenh: ${cmd.action} (ID: ${cmd.id})`);
            try {
                await this._handleCommand(cmd);
                await this.firebase.updateCommandStatus(cmd.id, 'completed', 'OK');
                this._log(`Lenh ${cmd.action} hoan thanh`);
            } catch (err) {
                await this.firebase.updateCommandStatus(cmd.id, 'error', err.message);
                this._log(`Lenh ${cmd.action} loi: ${err.message}`);
            }
        });
    }

    /**
     * Xu ly tung lenh
     */
    async _handleCommand(cmd) {
        switch (cmd.action) {
            case 'sync_now':
                await this._fullSync();
                break;

            case 'add_user':
                await this.device.addUser(
                    parseInt(cmd.deviceUserId),
                    cmd.employeeName || `User ${cmd.deviceUserId}`
                );
                // Sync lai users
                const users = await this.device.getUsers();
                await this.firebase.syncDeviceUsers(users);
                break;

            case 'delete_user':
                await this.device.deleteUser(parseInt(cmd.deviceUserId));
                const usersAfterDel = await this.device.getUsers();
                await this.firebase.syncDeviceUsers(usersAfterDel);
                break;

            case 'enroll_fingerprint':
                this._log(`Enroll fingerprint cho user ${cmd.deviceUserId} - Can thao tac tren may`);
                break;

            default:
                this._log(`Lenh khong biet: ${cmd.action}`);
        }
    }

    /**
     * Xu ly shutdown
     */
    _handleShutdown() {
        const shutdown = async () => {
            this._log('Dang tat service...');
            this.running = false;

            if (this.syncTimer) clearInterval(this.syncTimer);
            if (this.commandListener) this.commandListener();

            try {
                await this.firebase.updateSyncStatus({
                    connected: false,
                    stoppedAt: new Date().toISOString(),
                });
            } catch (e) { }

            try {
                await this.device.disconnect();
            } catch (e) { }

            this._log('Service da dung.');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }

    /**
     * Log voi timestamp, ghi file
     */
    _log(msg) {
        const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const line = `[${now}] ${msg}`;
        console.log(line);

        // Ghi ra file log theo ngay
        try {
            const logDir = path.join(__dirname, 'logs');
            if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

            const today = new Date().toISOString().slice(0, 10);
            const logFile = path.join(logDir, `${today}.log`);
            fs.appendFileSync(logFile, line + '\n');
        } catch (e) {
            // Ignore log errors
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Khoi dong
const service = new SyncService();
service.start().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
