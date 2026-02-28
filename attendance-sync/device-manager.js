/**
 * Device Manager - Ket noi may cham cong Ronald Jack DG-600
 * Su dung node-zklib voi FORCE UDP (khong dung TCP)
 *
 * Ronald Jack DG-600 chi ho tro UDP tren port 4370
 * Cac thu vien truoc that bai vi dung TCP
 */
const ZKLib = require('node-zklib');
const config = require('./config');

class DeviceManager {
    constructor() {
        this.zk = null;
        this.connected = false;
    }

    /**
     * Ket noi may cham cong bang UDP (FORCE, khong thu TCP)
     */
    async connect() {
        const { ip, port, timeout, inport } = config.device;
        console.log(`[Device] Dang ket noi ${ip}:${port} (UDP)...`);

        this.zk = new ZKLib(ip, port, timeout, inport);

        try {
            // Thu createSocket binh thuong truoc (TCP -> UDP fallback)
            await this.zk.createSocket();
            this.connected = true;
            console.log(`[Device] Ket noi thanh cong! Protocol: ${this.zk.connectionType || 'unknown'}`);
            return true;
        } catch (tcpErr) {
            console.log(`[Device] createSocket() that bai: ${tcpErr.message}`);
            console.log('[Device] Thu force UDP truc tiep...');

            // Force UDP: goi truc tiep zklibUdp
            try {
                // Tao lai instance moi
                this.zk = new ZKLib(ip, port, timeout, inport);

                // Truy cap truc tiep UDP handler, bo qua TCP
                if (this.zk.zklibUdp) {
                    await this.zk.zklibUdp.createSocket();
                    await this.zk.zklibUdp.connect();
                    this.zk.connectionType = 'udp';
                    this.connected = true;
                    console.log('[Device] Ket noi UDP thanh cong!');
                    return true;
                } else {
                    throw new Error('Khong tim thay UDP handler trong node-zklib');
                }
            } catch (udpErr) {
                this.connected = false;
                console.error(`[Device] Force UDP that bai: ${udpErr.message}`);
                throw new Error(`Khong ket noi duoc may cham cong (${ip}:${port}). TCP: ${tcpErr.message}. UDP: ${udpErr.message}`);
            }
        }
    }

    /**
     * Ngat ket noi
     */
    async disconnect() {
        if (this.zk) {
            try {
                await this.zk.disconnect();
            } catch (e) {
                // Ignore
            }
            this.connected = false;
            this.zk = null;
            console.log('[Device] Da ngat ket noi');
        }
    }

    /**
     * Lay thong tin may
     */
    async getInfo() {
        this._checkConnection();
        try {
            return await this.zk.getInfo();
        } catch (err) {
            console.error('[Device] Loi lay thong tin may:', err.message);
            throw err;
        }
    }

    /**
     * Lay danh sach user da dang ky tren may
     */
    async getUsers() {
        this._checkConnection();
        try {
            const result = await this.zk.getUsers();
            console.log(`[Device] Lay ${result.data ? result.data.length : 0} users`);
            return result.data || [];
        } catch (err) {
            console.error('[Device] Loi lay danh sach users:', err.message);
            throw err;
        }
    }

    /**
     * Lay tat ca ban ghi cham cong
     */
    async getAttendances() {
        this._checkConnection();
        try {
            const result = await this.zk.getAttendances();
            console.log(`[Device] Lay ${result.data ? result.data.length : 0} ban ghi cham cong`);
            return result.data || [];
        } catch (err) {
            console.error('[Device] Loi lay ban ghi cham cong:', err.message);
            throw err;
        }
    }

    /**
     * Bat dau nghe real-time log (nhan vien quet van tay)
     */
    async startRealTimeLogs(callback) {
        this._checkConnection();
        try {
            await this.zk.getRealTimeLogs((data) => {
                console.log(`[Device] Real-time: User ${data.odoo_id || data.odoo || data.userId} @ ${data.attTime || data.time}`);
                if (callback) callback(data);
            });
            console.log('[Device] Bat dau nghe real-time logs');
        } catch (err) {
            console.error('[Device] Loi bat real-time logs:', err.message);
            throw err;
        }
    }

    /**
     * Them user moi vao may
     */
    async addUser(uid, name) {
        this._checkConnection();
        try {
            // node-zklib: setUser(uid, name, password, role)
            await this.zk.setUser(uid, name, '', 0);
            console.log(`[Device] Da them user: ${name} (ID: ${uid})`);
            return true;
        } catch (err) {
            console.error(`[Device] Loi them user ${name}:`, err.message);
            throw err;
        }
    }

    /**
     * Xoa user khoi may
     */
    async deleteUser(uid) {
        this._checkConnection();
        try {
            await this.zk.deleteUser(uid);
            console.log(`[Device] Da xoa user ID: ${uid}`);
            return true;
        } catch (err) {
            console.error(`[Device] Loi xoa user ${uid}:`, err.message);
            throw err;
        }
    }

    /**
     * Kiem tra da ket noi chua
     */
    _checkConnection() {
        if (!this.connected || !this.zk) {
            throw new Error('Chua ket noi may cham cong. Goi connect() truoc.');
        }
    }
}

module.exports = DeviceManager;
