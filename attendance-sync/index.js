const device = require('./device');
const fb = require('./firebase');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');

// ── helpers ──────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = '[' + ts + '] ' + msg;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
    const file = path.join(LOG_DIR, new Date().toISOString().slice(0, 10) + '.log');
    fs.appendFileSync(file, line + '\n');
  } catch (_) {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── sync ─────────────────────────────────────────────────

async function fullSync() {
  log('-- sync start --');

  try {
    const users = await device.getUsers();
    log('users: ' + users.length);
    if (users.length) await fb.uploadUsers(users);
  } catch (e) {
    log('sync users error: ' + e.message);
  }

  try {
    const records = await device.getAttendances();
    log('records: ' + records.length);
    if (records.length) {
      const n = await fb.uploadRecords(records);
      log('uploaded: ' + n);
    }
  } catch (e) {
    log('sync records error: ' + e.message);
  }

  await fb.setStatus({ lastSyncTime: new Date().toISOString(), connected: true });
  log('-- sync done --');
}

// ── commands ─────────────────────────────────────────────

async function handleCommand(cmd) {
  log('cmd: ' + cmd.action + ' (' + cmd.id + ')');
  try {
    switch (cmd.action) {
      case 'sync_now':
        await fullSync();
        break;
      case 'add_user':
        await device.setUser(parseInt(cmd.deviceUserId), cmd.employeeName || 'User');
        const users = await device.getUsers();
        await fb.uploadUsers(users);
        break;
      case 'delete_user':
        await device.deleteUser(parseInt(cmd.deviceUserId));
        const u2 = await device.getUsers();
        await fb.uploadUsers(u2);
        break;
      default:
        log('unknown cmd: ' + cmd.action);
        return;
    }
    await fb.updateCommand(cmd.id, 'completed', 'OK');
  } catch (e) {
    log('cmd error: ' + e.message);
    await fb.updateCommand(cmd.id, 'error', e.message);
  }
}

// ── main ─────────────────────────────────────────────────

async function main() {
  log('=== attendance-sync v3.0 ===');
  log('device: ' + config.device.ip + ':' + config.device.port);

  // 1. firebase
  try {
    fb.init();
  } catch (e) {
    log('FATAL firebase: ' + e.message);
    log('Check serviceAccountKey.json exists in attendance-sync/');
    process.exit(1);
  }

  // 2. connect device
  for (let i = 1; i <= config.sync.maxRetries; i++) {
    try {
      log('connecting... attempt ' + i + '/' + config.sync.maxRetries);
      await device.connect();
      break;
    } catch (e) {
      log('attempt ' + i + ' failed: ' + e.message);
      if (i === config.sync.maxRetries) {
        log('FATAL: cannot connect to device');
        await fb.setStatus({ connected: false, lastError: e.message });
        process.exit(1);
      }
      await sleep(config.sync.retryDelay);
    }
  }

  // 3. device info
  try {
    const info = await device.getInfo();
    log('device info: ' + JSON.stringify(info));
  } catch (_) {}

  // 4. first sync
  await fullSync();

  // 5. realtime logs
  try {
    await device.onRealTimeLog(async (data) => {
      const uid = String(data.userId || data.odoo_id || data.odoo || '');
      const time = data.attTime || data.time || new Date().toISOString();
      log('realtime: user ' + uid + ' @ ' + time);
      try {
        await fb.uploadRecords([{
          deviceUserId: uid,
          recordTime: time,
          type: data.attState || data.type || 0,
        }]);
      } catch (e) {
        log('realtime upload error: ' + e.message);
      }
    });
    log('realtime monitoring started');
  } catch (e) {
    log('realtime not available: ' + e.message);
  }

  // 6. periodic sync
  setInterval(async () => {
    try {
      await fullSync();
    } catch (e) {
      log('periodic error: ' + e.message);
      try {
        await device.disconnect();
        await device.connect();
        log('reconnected');
      } catch (re) {
        log('reconnect failed: ' + re.message);
        await fb.setStatus({ connected: false, lastError: re.message });
      }
    }
  }, config.sync.interval);

  // 7. listen commands from web
  fb.onCommands(handleCommand);

  // 8. graceful shutdown
  const shutdown = async () => {
    log('shutting down...');
    try { await fb.setStatus({ connected: false }); } catch (_) {}
    try { await device.disconnect(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log('service running. Ctrl+C to stop.');
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
