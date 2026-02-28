/**
 * Device Manager - Kết nối và giao tiếp với Ronald Jack DG-600
 * Sử dụng ZK Protocol qua thư viện node-zklib
 *
 * Có retry logic để xử lý lỗi subarray/buffer phổ biến trên Node v24+
 */
const ZKLib = require('node-zklib');
const config = require('./config');

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 giây

class DeviceManager {
    constructor() {
        this.device = null;
        this.connected = false;
    }

    /**
     * Kết nối tới máy chấm công
     */
    async connect() {
        // Luôn tạo kết nối mới để tránh lỗi buffer cũ
        await this.disconnect();

        const { ip, port, timeout, inport } = config.device;
        this.device = new ZKLib(ip, port, timeout, inport);

        try {
            await this.device.createSocket();
            this.connected = true;
            // Đợi máy CC ổn định sau kết nối
            await this._sleep(500);
            console.log(`[Device] Đã kết nối ${ip}:${port}`);
            return true;
        } catch (err) {
            this.connected = false;
            this.device = null;
            throw new Error(`Không thể kết nối máy chấm công (${ip}:${port}): ${err.message}`);
        }
    }

    /**
     * Ngắt kết nối
     */
    async disconnect() {
        if (this.device) {
            try {
                await this.device.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }
            this.device = null;
            this.connected = false;
        }
    }

    /**
     * Lấy danh sách user trên máy chấm công (có retry)
     * @returns {Array<{uid, name, role, password, cardno}>}
     */
    async getUsers() {
        return this._retryOperation('getUsers', async () => {
            this._ensureConnected();
            const result = await this.device.getUsers();
            const users = result && result.data ? result.data : (Array.isArray(result) ? result : []);
            console.log(`[Device] Lấy được ${users.length} users`);
            return users;
        });
    }

    /**
     * Lấy tất cả log chấm công trên máy (có retry)
     * @returns {Array<{deviceUserId, attTime, type}>}
     */
    async getAttendances() {
        return this._retryOperation('getAttendances', async () => {
            this._ensureConnected();
            const result = await this.device.getAttendances();
            const logs = result && result.data ? result.data : (Array.isArray(result) ? result : []);
            console.log(`[Device] Lấy được ${logs.length} bản ghi chấm công`);
            return logs;
        });
    }

    /**
     * Lấy thông tin thiết bị (serial, firmware, v.v.)
     */
    async getInfo() {
        return this._retryOperation('getInfo', async () => {
            this._ensureConnected();
            return await this.device.getInfo();
        });
    }

    /**
     * Lấy thời gian hiện tại trên máy chấm công
     */
    async getTime() {
        return this._retryOperation('getTime', async () => {
            this._ensureConnected();
            return await this.device.getTime();
        });
    }

    /**
     * Đăng ký real-time log (nhận sự kiện ngay khi quẹt vân tay)
     * @param {Function} callback - Hàm xử lý khi có log mới
     */
    async startRealTimeLogs(callback) {
        this._ensureConnected();
        try {
            await this.device.getRealTimeLogs((data) => {
                if (data) {
                    callback({
                        deviceUserId: String(data.visitorId || data.userId || data.uid),
                        attTime: data.attTime || data.timestamp || new Date().toISOString(),
                        type: data.type || 0,
                    });
                }
            });
            console.log('[Device] Real-time monitoring đã bật');
            return true;
        } catch (err) {
            console.warn(`[Device] Real-time logs không khả dụng: ${err.message}`);
            return false;
        }
    }

    /**
     * Thêm user mới vào máy chấm công (dùng khi đăng ký vân tay)
     */
    async addUser(uid, name, role = 0) {
        return this._retryOperation('addUser', async () => {
            this._ensureConnected();
            await this.device.setUser(uid, name, '', role, '');
            console.log(`[Device] Đã thêm user: ${name} (ID: ${uid})`);
            return true;
        });
    }

    /**
     * Xoá user khỏi máy chấm công
     */
    async deleteUser(uid) {
        return this._retryOperation('deleteUser', async () => {
            this._ensureConnected();
            await this.device.deleteUser(uid);
            console.log(`[Device] Đã xoá user ID: ${uid}`);
            return true;
        });
    }

    /**
     * Retry wrapper - tự kết nối lại khi gặp lỗi buffer/subarray
     */
    async _retryOperation(name, operation) {
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (err) {
                lastError = err;
                const isRetryable = err.message &&
                    (err.message.includes('subarray') ||
                     err.message.includes('null') ||
                     err.message.includes('undefined') ||
                     err.message.includes('TIMEOUT') ||
                     err.message.includes('ECONNRESET') ||
                     err.message.includes('EPIPE'));

                if (isRetryable && attempt < MAX_RETRIES) {
                    console.warn(`[Device] ${name} lỗi (lần ${attempt}/${MAX_RETRIES}): ${err.message}`);
                    console.warn(`[Device] Đang kết nối lại...`);
                    // Ngắt kết nối cũ và tạo kết nối mới
                    await this.disconnect();
                    await this._sleep(RETRY_DELAY);
                    try {
                        await this.connect();
                    } catch (connErr) {
                        console.warn(`[Device] Kết nối lại thất bại: ${connErr.message}`);
                    }
                } else {
                    break;
                }
            }
        }

        throw new Error(`Lỗi ${name}: ${lastError ? lastError.message : 'unknown'}`);
    }

    /**
     * Kiểm tra kết nối
     */
    _ensureConnected() {
        if (!this.connected || !this.device) {
            throw new Error('Chưa kết nối máy chấm công');
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = DeviceManager;
