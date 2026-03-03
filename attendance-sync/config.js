const path = require('path');

module.exports = {
  device: {
    ip: '192.168.1.201',
    port: 4370,
    inport: 5200,
    timeout: 10000,
  },
  firebase: {
    credential: path.join(__dirname, 'serviceAccountKey.json'),
  },
  sync: {
    interval: 5 * 60 * 1000,
    retryDelay: 30 * 1000,
    maxRetries: 3,
  },
  collections: {
    records: 'attendance_records',
    users: 'attendance_device_users',
    commands: 'attendance_commands',
    status: 'attendance_sync_status',
  },
};
