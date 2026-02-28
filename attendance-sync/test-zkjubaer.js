/**
 * Test kết nối bằng thư viện zk-jubaer (thay thế cho node-zklib)
 * Cài trước: npm install zk-jubaer
 * Chạy: node test-zkjubaer.js
 */
const ZKLib = require('zk-jubaer');
const config = require('./config');

async function test() {
    const { ip, port, timeout, inport } = config.device;
    console.log(`Testing zk-jubaer → ${ip}:${port}...`);
    console.log(`Node version: ${process.version}\n`);

    const device = new ZKLib(ip, port, timeout, inport);

    try {
        await device.createSocket();
        console.log('✔ Kết nối thành công!\n');

        // Users
        try {
            const users = await device.getUsers();
            const list = users.data || users || [];
            console.log(`Nhân viên: ${list.length} người`);
            list.slice(0, 5).forEach(u => {
                console.log(`  ID:${u.uid} - ${u.name || '(no name)'}`);
            });
            if (list.length > 5) console.log(`  ... và ${list.length - 5} người nữa`);
        } catch (e) {
            console.log(`Users error: ${e.message}`);
        }

        console.log('');

        // Attendances
        try {
            const logs = await device.getAttendances();
            const list = logs.data || logs || [];
            console.log(`Log chấm công: ${list.length} bản ghi`);
            list.slice(-3).forEach(l => {
                console.log(`  User:${l.deviceUserId} - ${l.attTime}`);
            });
        } catch (e) {
            console.log(`Attendance error: ${e.message}`);
        }

        console.log('\n═══════════════════════════════════');
        console.log('✔ zk-jubaer HOẠT ĐỘNG! Dùng thư viện này.');
        console.log('═══════════════════════════════════');

        await device.disconnect();
    } catch (err) {
        console.error('✖ Lỗi:', err.message || err);
        console.error('Full error:', err);
    }

    process.exit(0);
}

test();
