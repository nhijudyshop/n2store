/**
 * Device Manager - Kết nối Ronald Jack DG-600
 * Dùng thư viện zk-jubaer (ổn định hơn node-zklib)
 */
const ZKLib = require('zk-jubaer');
const config = require('./config');

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

class DeviceManager {
    constructor() {
        this.device = null;
        this.connected = false;
    }

    async connect() {
        await this.disconnect();

        const { ip, port, timeout, inport } = config.device;
        console.log(`[Device] Kết nối ${ip}:${port} (timeout: ${timeout}ms)...`);

        this.device = new ZKLib(ip, port, timeout, inport);

        try {
            await this.device.createSocket();
            this.connected = true;
            await this._sleep(1000);
            console.log(`[Device] ✔ Đã kết nối thành công`);
            return true;
        } catch (err) {
            this.connected = false;
            this.device = null;
            const msg = this._errorMsg(err);
            console.error(`[Device] ✖ Lỗi kết nối: ${msg}`);
            if (err && err.stack) console.error(err.stack);
            throw new Error(`Không thể kết nối (${ip}:${port}): ${msg}`);
        }
    }

    async disconnect() {
        if (this.device) {
            try { await this.device.disconnect(); } catch (e) {}
            this.device = null;
            this.connected = false;
        }
    }

    async getUsers() {
        return this._retry('getUsers', async () => {
            this._check();
            const result = await this.device.getUsers();
            const users = (result && result.data) || (Array.isArray(result) ? result : []);
            console.log(`[Device] ${users.length} users`);
            return users;
        });
    }

    async getAttendances() {
        return this._retry('getAttendances', async () => {
            this._check();
            const result = await this.device.getAttendances();
            const logs = (result && result.data) || (Array.isArray(result) ? result : []);
            console.log(`[Device] ${logs.length} bản ghi chấm công`);
            return logs;
        });
    }

    async getInfo() {
        return this._retry('getInfo', async () => {
            this._check();
            return await this.device.getInfo();
        });
    }

    async getTime() {
        return this._retry('getTime', async () => {
            this._check();
            return await this.device.getTime();
        });
    }

    async startRealTimeLogs(callback) {
        this._check();
        try {
            await this.device.getRealTimeLogs((data) => {
                if (data) {
                    callback({
                        deviceUserId: String(data.visitorId || data.userId || data.uid || ''),
                        attTime: data.attTime || data.timestamp || new Date().toISOString(),
                        type: data.type || 0,
                    });
                }
            });
            console.log('[Device] Real-time monitoring ON');
            return true;
        } catch (err) {
            console.warn(`[Device] Real-time không khả dụng: ${this._errorMsg(err)}`);
            return false;
        }
    }

    async addUser(uid, name, role = 0) {
        return this._retry('addUser', async () => {
            this._check();
            await this.device.setUser(uid, name, '', role, '');
            console.log(`[Device] Thêm user: ${name} (ID: ${uid})`);
            return true;
        });
    }

    async deleteUser(uid) {
        return this._retry('deleteUser', async () => {
            this._check();
            await this.device.deleteUser(uid);
            console.log(`[Device] Xoá user ID: ${uid}`);
            return true;
        });
    }

    // === INTERNAL ===

    async _retry(name, fn) {
        let lastErr;
        for (let i = 1; i <= MAX_RETRIES; i++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                console.warn(`[Device] ${name} lỗi lần ${i}: ${this._errorMsg(err)}`);
                if (i < MAX_RETRIES) {
                    await this.disconnect();
                    await this._sleep(RETRY_DELAY);
                    try { await this.connect(); } catch (e) {}
                }
            }
        }
        throw new Error(`${name} thất bại sau ${MAX_RETRIES} lần: ${this._errorMsg(lastErr)}`);
    }

    _check() {
        if (!this.connected || !this.device) {
            throw new Error('Chưa kết nối máy chấm công');
        }
    }

    _errorMsg(err) {
        if (!err) return 'unknown';
        return err.message || err.code || (typeof err === 'string' ? err : JSON.stringify(err));
    }

    _sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

module.exports = DeviceManager;
