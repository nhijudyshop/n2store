/**
 * Device Manager - Kết nối và giao tiếp với Ronald Jack DG-600
 * Sử dụng ZK Protocol qua thư viện node-zklib
 */
const ZKLib = require('node-zklib');
const config = require('./config');

class DeviceManager {
    constructor() {
        this.device = null;
        this.connected = false;
    }

    /**
     * Kết nối tới máy chấm công
     */
    async connect() {
        if (this.connected && this.device) {
            return true;
        }

        const { ip, port, timeout, inport } = config.device;
        this.device = new ZKLib(ip, port, timeout, inport);

        try {
            await this.device.createSocket();
            this.connected = true;
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
     * Lấy danh sách user trên máy chấm công
     * @returns {Array<{uid, name, role, password, cardno}>}
     */
    async getUsers() {
        this._ensureConnected();
        try {
            const result = await this.device.getUsers();
            const users = result.data || result || [];
            console.log(`[Device] Lấy được ${users.length} users`);
            return users;
        } catch (err) {
            throw new Error(`Lỗi lấy danh sách users: ${err.message}`);
        }
    }

    /**
     * Lấy tất cả log chấm công trên máy
     * @returns {Array<{deviceUserId, attTime, type}>}
     *   type: 0 = check-in, 1 = check-out (tuỳ cấu hình máy)
     */
    async getAttendances() {
        this._ensureConnected();
        try {
            const result = await this.device.getAttendances();
            const logs = result.data || result || [];
            console.log(`[Device] Lấy được ${logs.length} bản ghi chấm công`);
            return logs;
        } catch (err) {
            throw new Error(`Lỗi lấy log chấm công: ${err.message}`);
        }
    }

    /**
     * Lấy thông tin thiết bị (serial, firmware, v.v.)
     */
    async getInfo() {
        this._ensureConnected();
        try {
            return await this.device.getInfo();
        } catch (err) {
            throw new Error(`Lỗi lấy thông tin thiết bị: ${err.message}`);
        }
    }

    /**
     * Lấy thời gian hiện tại trên máy chấm công
     */
    async getTime() {
        this._ensureConnected();
        try {
            return await this.device.getTime();
        } catch (err) {
            throw new Error(`Lỗi lấy thời gian: ${err.message}`);
        }
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
     * @param {string} uid - Mã nhân viên trên máy
     * @param {string} name - Tên nhân viên
     * @param {number} role - 0=user, 14=admin
     */
    async addUser(uid, name, role = 0) {
        this._ensureConnected();
        try {
            // node-zklib setUser: (uid, name, password, role, cardno)
            await this.device.setUser(uid, name, '', role, '');
            console.log(`[Device] Đã thêm user: ${name} (ID: ${uid})`);
            return true;
        } catch (err) {
            throw new Error(`Lỗi thêm user: ${err.message}`);
        }
    }

    /**
     * Xoá user khỏi máy chấm công
     */
    async deleteUser(uid) {
        this._ensureConnected();
        try {
            await this.device.deleteUser(uid);
            console.log(`[Device] Đã xoá user ID: ${uid}`);
            return true;
        } catch (err) {
            throw new Error(`Lỗi xoá user: ${err.message}`);
        }
    }

    /**
     * Kiểm tra kết nối
     */
    _ensureConnected() {
        if (!this.connected || !this.device) {
            throw new Error('Chưa kết nối máy chấm công');
        }
    }
}

module.exports = DeviceManager;
