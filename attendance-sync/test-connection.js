/**
 * Test nhanh ket noi may cham cong
 * Chay: node test-connection.js
 */
const DeviceManager = require('./device-manager');

async function main() {
    console.log('Test ket noi may cham cong...\n');

    const device = new DeviceManager();

    try {
        await device.connect();
        console.log('\n--- KET NOI THANH CONG ---\n');

        // Lay thong tin may
        try {
            const info = await device.getInfo();
            console.log('Thong tin may:', JSON.stringify(info, null, 2));
        } catch (e) {
            console.log('Khong lay duoc thong tin may:', e.message);
        }

        // Lay danh sach users
        try {
            const users = await device.getUsers();
            console.log(`\nDanh sach users (${users.length}):`);
            users.forEach(u => {
                console.log(`  ID: ${u.uid}, Ten: ${u.name}, Role: ${u.role}`);
            });
        } catch (e) {
            console.log('Khong lay duoc users:', e.message);
        }

        // Lay ban ghi cham cong
        try {
            const records = await device.getAttendances();
            console.log(`\nBan ghi cham cong: ${records.length} records`);
            if (records.length > 0) {
                console.log('5 ban ghi gan nhat:');
                records.slice(-5).forEach(r => {
                    console.log(`  User ${r.deviceUserId} @ ${r.recordTime} (type: ${r.type || 0})`);
                });
            }
        } catch (e) {
            console.log('Khong lay duoc ban ghi:', e.message);
        }

        await device.disconnect();
        console.log('\n--- TEST HOAN TAT ---');

    } catch (err) {
        console.error('\n--- KET NOI THAT BAI ---');
        console.error('Loi:', err.message);
        console.error('\nGoi y:');
        console.error('  1. Chay "node diagnose.js" de chan doan chi tiet');
        console.error('  2. Tat firewall hoac them rule cho UDP port 4370');
        console.error('  3. Dam bao khong co phan mem khac dang ket noi may');
        console.error('  4. Thu tat/bat lai may cham cong');
    }

    process.exit(0);
}

main();
