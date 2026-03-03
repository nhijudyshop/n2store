const ZK = require('./zk');

const IP   = '192.168.1.201';
const PORT = 4370;

async function main() {
  console.log('=== TEST CONNECTION ===');
  console.log('Target: ' + IP + ':' + PORT + '\n');

  const zk = new ZK(IP, PORT, 10000);

  // Connect
  try {
    await zk.connect();
    console.log('CONNECTED\n');
  } catch (e) {
    console.error('FAILED: ' + e.message);
    console.error('\nTroubleshoot:');
    console.error('  1. Ping ' + IP + ' first');
    console.error('  2. Check firewall allows TCP port ' + PORT);
    console.error('  3. Close other software connected to device');
    console.error('  4. Set device CommKey = 0');
    console.error('  5. Restart the device');
    process.exit(1);
  }

  // Version
  try {
    const v = await zk.getVersion();
    console.log('Firmware: ' + v);
  } catch (e) {
    console.log('Firmware: N/A (' + e.message + ')');
  }

  // Users
  try {
    const users = await zk.getUsers();
    console.log('\nUsers: ' + users.length);
    users.forEach(u => console.log('  [' + u.uid + '] ' + u.name + (u.role === 14 ? ' (admin)' : '')));
  } catch (e) {
    console.log('Users: error - ' + e.message);
  }

  // Attendance
  try {
    const records = await zk.getAttendances();
    console.log('\nAttendance records: ' + records.length);
    if (records.length > 0) {
      console.log('Last 10:');
      records.slice(-10).forEach(r =>
        console.log('  User ' + r.deviceUserId + '  ' + r.recordTime + '  state=' + r.type)
      );
    }
  } catch (e) {
    console.log('Attendance: error - ' + e.message);
  }

  await zk.disconnect();
  console.log('\nDONE');
  process.exit(0);
}

main();
