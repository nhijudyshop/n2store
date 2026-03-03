const net = require('net');
const dgram = require('dgram');
const { execSync } = require('child_process');
const config = require('./config');

const IP = config.device.ip;
const PORT = config.device.port;

async function main() {
  console.log('=== DIAGNOSE: ' + IP + ':' + PORT + ' ===\n');

  // 1. Ping
  console.log('[1] PING');
  try {
    const cmd = process.platform === 'win32'
      ? 'ping -n 2 -w 2000 ' + IP
      : 'ping -c 2 -W 2 ' + IP;
    const out = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    const ok = out.includes('TTL=') || out.includes('ttl=') || out.includes('time=');
    console.log(ok ? '    OK\n' : '    FAIL - device not reachable\n');
    if (!ok) return;
  } catch (e) {
    console.log('    FAIL: ' + e.message + '\n');
    return;
  }

  // 2. TCP
  console.log('[2] TCP port ' + PORT);
  const tcp = await testTCP();
  console.log(tcp ? '    OPEN\n' : '    CLOSED (normal for some ZK devices)\n');

  // 3. UDP
  console.log('[3] UDP port ' + PORT);
  const udp = await testUDP();
  console.log(udp ? '    RESPONDING\n' : '    NO RESPONSE (may be blocked by firewall)\n');

  // 4. node-zklib
  console.log('[4] node-zklib createSocket()');
  try {
    const ZKLib = require('node-zklib');
    const zk = new ZKLib(IP, PORT, 10000, 5200);
    await zk.createSocket();
    console.log('    OK (' + (zk.connectionType || 'tcp') + ')');

    try {
      const users = await zk.getUsers();
      console.log('    users: ' + (users.data ? users.data.length : 0));
    } catch (_) {}

    try {
      const att = await zk.getAttendances();
      console.log('    records: ' + (att.data ? att.data.length : 0));
    } catch (_) {}

    await zk.disconnect();
  } catch (e) {
    console.log('    FAIL: ' + e.message);
  }

  // Summary
  console.log('\n=== RESULT ===');
  if (tcp) console.log('TCP works -> node-zklib should connect normally');
  else if (udp) console.log('UDP works -> may need UDP-only library');
  else console.log('Neither TCP nor UDP -> check firewall / device power / CommKey=0');
}

function testTCP() {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(5000);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(false); });
    s.connect(PORT, IP);
  });
}

function testUDP() {
  return new Promise(resolve => {
    const c = dgram.createSocket('udp4');
    const t = setTimeout(() => { c.close(); resolve(false); }, 5000);
    c.on('message', () => { clearTimeout(t); c.close(); resolve(true); });
    c.on('error', () => { clearTimeout(t); c.close(); resolve(false); });
    const pkt = Buffer.from([
      0x50, 0x50, 0x82, 0x7d, 0x08, 0x00, 0xe8, 0x03,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    c.send(pkt, 0, pkt.length, PORT, IP, (e) => {
      if (e) { clearTimeout(t); c.close(); resolve(false); }
    });
  });
}

main().catch(e => { console.error(e); process.exit(1); });
