/**
 * Test kết nối máy chấm công Ronald Jack DG-600
 * Chạy: node test-connection.js
 *
 * Script này kiểm tra:
 *   1. Kết nối TCP tới máy chấm công
 *   2. Lấy thông tin thiết bị
 *   3. Lấy danh sách users (nhân viên đã đăng ký)
 *   4. Lấy log chấm công gần nhất
 */
const DeviceManager = require('./device-manager');
const config = require('./config');

async function test() {
    const device = new DeviceManager();

    console.log('='.repeat(50));
    console.log('  TEST KẾT NỐI MÁY CHẤM CÔNG');
    console.log(`  IP: ${config.device.ip}:${config.device.port}`);
    console.log('='.repeat(50));
    console.log('');

    try {
        // 1. Kết nối
        console.log('1. Kết nối...');
        await device.connect();
        console.log('   ✔ Kết nối thành công!\n');

        // 2. Thông tin thiết bị
        console.log('2. Thông tin thiết bị:');
        try {
            const info = await device.getInfo();
            console.log('  ', JSON.stringify(info, null, 2));
        } catch (e) {
            console.log(`   (Không đọc được info: ${e.message})`);
        }
        console.log('');

        // 3. Thời gian trên máy
        console.log('3. Thời gian trên máy:');
        try {
            const time = await device.getTime();
            console.log(`   ${time}`);
        } catch (e) {
            console.log(`   (Không đọc được: ${e.message})`);
        }
        console.log('');

        // 4. Danh sách users
        console.log('4. Danh sách nhân viên:');
        const users = await device.getUsers();
        console.log(`   Tổng: ${users.length} người`);
        console.log('   ─'.repeat(25));

        if (users.length > 0) {
            console.log('   ID  │ Tên                │ Vai trò');
            console.log('   ────┼────────────────────┼────────');
            for (const u of users) {
                const id = String(u.uid).padEnd(3);
                const name = (u.name || '(chưa đặt tên)').padEnd(18);
                const role = u.role === 14 ? 'Admin' : 'User';
                console.log(`   ${id} │ ${name} │ ${role}`);
            }
        }
        console.log('');

        // 5. Log chấm công
        console.log('5. Log chấm công:');
        const logs = await device.getAttendances();
        console.log(`   Tổng: ${logs.length} bản ghi`);

        if (logs.length > 0) {
            // Hiện 10 bản ghi gần nhất
            const recent = logs.slice(-10);
            console.log(`   10 bản ghi gần nhất:`);
            console.log('   ─'.repeat(25));
            console.log('   User ID │ Thời gian           │ Loại');
            console.log('   ────────┼─────────────────────┼──────');

            for (const log of recent) {
                const uid = String(log.deviceUserId).padEnd(7);
                const time = String(log.attTime).padEnd(19);
                const type = log.type === 1 ? 'Ra' : 'Vào';
                // Tìm tên user
                const user = users.find(u => String(u.uid) === String(log.deviceUserId));
                const name = user ? ` (${user.name})` : '';
                console.log(`   ${uid} │ ${time} │ ${type}${name}`);
            }
        }
        console.log('');

        console.log('═'.repeat(50));
        console.log('  ✔ TEST THÀNH CÔNG - Máy chấm công hoạt động tốt!');
        console.log('═'.repeat(50));

    } catch (err) {
        console.error('');
        console.error('═'.repeat(50));
        console.error(`  ✖ LỖI: ${err.message}`);
        console.error('');
        console.error('  Kiểm tra:');
        console.error(`  • Máy chấm công có bật không?`);
        console.error(`  • IP ${config.device.ip} có đúng không?`);
        console.error(`  • PC này có cùng mạng LAN không?`);
        console.error(`  • Thử ping ${config.device.ip}`);
        console.error('═'.repeat(50));
    } finally {
        await device.disconnect();
        process.exit(0);
    }
}

test();
