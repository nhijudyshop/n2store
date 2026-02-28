/**
 * Test kết nối máy chấm công Ronald Jack DG-600
 * Chạy: node test-connection.js
 */
const DeviceManager = require('./device-manager');
const config = require('./config');

async function test() {
    const device = new DeviceManager();
    const { ip, port } = config.device;

    console.log('══════════════════════════════════════');
    console.log('  TEST MÁY CHẤM CÔNG');
    console.log(`  ${ip}:${port}  |  Node ${process.version}`);
    console.log('══════════════════════════════════════\n');

    try {
        await device.connect();

        // Users
        const users = await device.getUsers();
        console.log(`\nNhân viên (${users.length}):`);
        for (const u of users) {
            console.log(`  [${u.uid}] ${u.name || '(no name)'}`);
        }

        // Attendance
        const logs = await device.getAttendances();
        console.log(`\nLog chấm công: ${logs.length} bản ghi`);
        if (logs.length > 0) {
            console.log('5 bản ghi gần nhất:');
            for (const l of logs.slice(-5)) {
                const name = users.find(u => String(u.uid) === String(l.deviceUserId))?.name || '';
                console.log(`  User:${l.deviceUserId} ${name} - ${l.attTime}`);
            }
        }

        console.log('\n══ ✔ THÀNH CÔNG ══');

    } catch (err) {
        console.error(`\n✖ LỖI: ${err.message}`);
        console.error(`\nThử chạy: node diagnose.js  (chẩn đoán chi tiết)`);
    } finally {
        await device.disconnect();
        process.exit(0);
    }
}

test();
