const ZK = require('./zk');
const fb = require('./firebase');
const fs = require('fs');
const path = require('path');

const IP   = '192.168.1.201';
const PORT = 4370;
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 min
const LOG_DIR = path.join(__dirname, 'logs');

let device = null;

// ── log ──

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = '[' + ts + '] ' + msg;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
    fs.appendFileSync(
      path.join(LOG_DIR, new Date().toISOString().slice(0, 10) + '.log'),
      line + '\n'
    );
  } catch (_) {}
}

// ── sync ──

async function fullSync() {
  log('-- sync --');
  try {
    const users = await device.getUsers();
    log('users: ' + users.length);
    if (users.length) await fb.uploadUsers(users);
  } catch (e) { log('users error: ' + e.message); }

  try {
    const records = await device.getAttendances();
    log('records: ' + records.length);
    if (records.length) {
      const n = await fb.uploadRecords(records);
      log('uploaded: ' + n);
    }
  } catch (e) { log('records error: ' + e.message); }

  await fb.setStatus({ lastSyncTime: new Date().toISOString(), connected: true });
  log('-- done --');
}

// ── commands ──

async function handleCmd(cmd) {
  log('cmd: ' + cmd.action);
  try {
    if (cmd.action === 'sync_now') {
      await fullSync();
    }
    await fb.updateCommand(cmd.id, 'completed', 'OK');
  } catch (e) {
    log('cmd error: ' + e.message);
    await fb.updateCommand(cmd.id, 'error', e.message);
  }
}

// ── main ──

async function main() {
  log('=== attendance-sync v4 (raw ZK protocol, no library) ===');
  log('device: ' + IP + ':' + PORT);

  // firebase
  try { fb.init(); }
  catch (e) {
    log('FATAL firebase: ' + e.message);
    process.exit(1);
  }

  // connect device
  device = new ZK(IP, PORT, 10000);
  for (let i = 1; i <= 3; i++) {
    try {
      log('connecting... (' + i + '/3)');
      await device.connect();
      log('connected!');
      break;
    } catch (e) {
      log('attempt ' + i + ': ' + e.message);
      if (i === 3) {
        log('FATAL: cannot connect');
        await fb.setStatus({ connected: false, lastError: e.message });
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // version
  try {
    const v = await device.getVersion();
    log('firmware: ' + v);
  } catch (_) {}

  // first sync
  await fullSync();

  // periodic sync
  setInterval(async () => {
    try { await fullSync(); }
    catch (e) {
      log('sync error: ' + e.message);
      try { await device.disconnect(); await device.connect(); log('reconnected'); }
      catch (re) {
        log('reconnect fail: ' + re.message);
        await fb.setStatus({ connected: false, lastError: re.message });
      }
    }
  }, SYNC_INTERVAL);

  // web commands
  fb.onCommands(handleCmd);

  // shutdown
  const stop = async () => {
    log('stopping...');
    try { await fb.setStatus({ connected: false }); } catch (_) {}
    try { await device.disconnect(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  log('running. Ctrl+C to stop.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
