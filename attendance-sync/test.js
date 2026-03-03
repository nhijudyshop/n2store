const device = require('./device');

async function main() {
  console.log('--- test connection ---\n');

  try {
    await device.connect();
    console.log('CONNECTED\n');
  } catch (e) {
    console.error('CONNECT FAILED:', e.message);
    console.error('\nCheck:');
    console.error('  1. Device is on and same LAN');
    console.error('  2. IP correct: ' + require('./config').device.ip);
    console.error('  3. No other software connected to device');
    console.error('  4. Run "node diagnose.js" for details');
    process.exit(1);
  }

  try {
    const info = await device.getInfo();
    console.log('Info:', JSON.stringify(info, null, 2));
  } catch (e) {
    console.log('Info: N/A (' + e.message + ')');
  }

  try {
    const users = await device.getUsers();
    console.log('\nUsers: ' + users.length);
    users.forEach(u => console.log('  [' + u.uid + '] ' + (u.name || 'N/A')));
  } catch (e) {
    console.log('Users: error (' + e.message + ')');
  }

  try {
    const records = await device.getAttendances();
    console.log('\nRecords: ' + records.length);
    if (records.length > 0) {
      console.log('Last 5:');
      records.slice(-5).forEach(r =>
        console.log('  User ' + r.deviceUserId + ' @ ' + r.recordTime)
      );
    }
  } catch (e) {
    console.log('Records: error (' + e.message + ')');
  }

  await device.disconnect();
  console.log('\n--- done ---');
  process.exit(0);
}

main();
