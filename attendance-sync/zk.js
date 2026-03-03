/**
 * ZK Protocol - TCP + UDP auto-detect
 * No third-party library. Uses only Node.js net + dgram.
 */
const net = require('net');
const dgram = require('dgram');

const CMD_CONNECT     = 1000;
const CMD_EXIT        = 1001;
const CMD_AUTH        = 28;
const CMD_GET_VERSION = 1100;
const CMD_GET_USERS   = 9;
const CMD_GET_ATTEND  = 13;
const CMD_ACK_OK      = 2000;
const CMD_ACK_ERROR   = 2001;
const CMD_ACK_DATA    = 2002;
const CMD_ACK_UNAUTH  = 2005;
const CMD_DATA        = 1501;
const CMD_PREPARE     = 1500;

const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

function checksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length - 1; i += 2) sum += buf.readUInt16LE(i);
  if (buf.length % 2) sum += buf[buf.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

function decodeTime(t) {
  const s = t % 60; t = (t - s) / 60;
  const m = t % 60; t = (t - m) / 60;
  const h = t % 24; t = (t - h) / 24;
  const d = (t % 31) + 1; t = (t - (d - 1)) / 31;
  const mo = t % 12; t = (t - mo) / 12;
  return new Date(t + 2000, mo, d, h, m, s);
}

function hex(buf) {
  return buf.toString('hex').match(/../g).join(' ');
}

class ZK {
  constructor(ip, port, timeout, commkey) {
    this.ip = ip;
    this.port = port || 4370;
    this.timeout = timeout || 10000;
    this.commkey = commkey || 0;
    this.proto = null; // 'tcp' or 'udp'
    this.tcp = null;
    this.udp = null;
    this.session = 0;
    this.reply = 0;
    this.debug = false;
  }

  // -- Packet building --

  _payload(cmd, data) {
    const d = data || Buffer.alloc(0);
    const buf = Buffer.alloc(8 + d.length);
    buf.writeUInt16LE(cmd, 0);
    buf.writeUInt16LE(this.session, 4);
    buf.writeUInt16LE(this.reply, 6);
    if (d.length) d.copy(buf, 8);
    buf.writeUInt16LE(checksum(buf), 2);
    this.reply = (this.reply + 1) & 0xffff;
    return buf;
  }

  _tcpPacket(cmd, data) {
    const payload = this._payload(cmd, data);
    const hdr = Buffer.alloc(8);
    TCP_MAGIC.copy(hdr);
    hdr.writeUInt32LE(payload.length, 4);
    return Buffer.concat([hdr, payload]);
  }

  _udpPacket(cmd, data) {
    return this._payload(cmd, data);
  }

  // -- TCP methods --

  _tcpSend(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._tcpPacket(cmd, data);
      if (this.debug) console.log('  >> TCP send: ' + hex(pkt));
      let buf = Buffer.alloc(0);

      const timer = setTimeout(() => { off(); reject(new Error('TCP response timeout')); }, this.timeout);
      const off = () => { clearTimeout(timer); this.tcp.removeListener('data', onD); };
      const onD = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length < 8) return;
        const pLen = buf.readUInt32LE(4);
        if (buf.length < 8 + pLen) return;
        off();
        if (this.debug) console.log('  << TCP recv: ' + hex(buf.slice(0, 8 + pLen)));
        resolve({ cmd: buf.readUInt16LE(8), session: buf.readUInt16LE(12), data: buf.slice(16, 8 + pLen) });
      };
      this.tcp.on('data', onD);
      this.tcp.write(pkt);
    });
  }

  _tcpReadAll(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._tcpPacket(cmd, data);
      if (this.debug) console.log('  >> TCP send: ' + hex(pkt));
      let buf = Buffer.alloc(0);
      let idle = null;

      const fail = setTimeout(() => { off(); resolve(this._extract(buf)); }, this.timeout * 3);
      const off = () => { clearTimeout(fail); if (idle) clearTimeout(idle); this.tcp.removeAllListeners('data'); };
      const onD = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (idle) clearTimeout(idle);

        // Fast path: single-packet response
        if (buf.length >= 16) {
          const pLen = buf.readUInt32LE(4);
          if (buf.length >= 8 + pLen) {
            const rc = buf.readUInt16LE(8);
            if (rc === CMD_ACK_OK || rc === CMD_ACK_DATA || rc === CMD_ACK_ERROR || rc === CMD_ACK_UNAUTH) {
              off();
              if (this.debug) console.log('  << TCP recv (' + buf.length + ' bytes, cmd=' + rc + ')');
              resolve(this._extract(buf));
              return;
            }
            // Large data: check for trailing ACK
            if (buf.length > 8 + pLen + 16) {
              const t = buf.length - 16;
              if (buf[t]===0x50 && buf[t+1]===0x50 && buf[t+2]===0x82 && buf[t+3]===0x7d && buf.readUInt16LE(t+8)===CMD_ACK_OK) {
                off();
                if (this.debug) console.log('  << TCP recv (' + buf.length + ' bytes, large data)');
                resolve(this._extract(buf));
                return;
              }
            }
          }
        }
        idle = setTimeout(() => { off(); resolve(this._extract(buf)); }, 3000);
      };
      this.tcp.on('data', onD);
      this.tcp.write(pkt);
    });
  }

  // -- UDP methods --

  _udpSend(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._udpPacket(cmd, data);
      if (this.debug) console.log('  >> UDP send: ' + hex(pkt));

      const timer = setTimeout(() => { off(); reject(new Error('UDP response timeout')); }, this.timeout);
      const off = () => { clearTimeout(timer); this.udp.removeListener('message', onM); };
      const onM = (msg) => {
        off();
        if (this.debug) console.log('  << UDP recv: ' + hex(msg));
        resolve({ cmd: msg.readUInt16LE(0), session: msg.readUInt16LE(4), data: msg.slice(8) });
      };
      this.udp.on('message', onM);
      this.udp.send(pkt, 0, pkt.length, this.port, this.ip);
    });
  }

  _udpReadAll(cmd, data) {
    return new Promise((resolve, reject) => {
      const pkt = this._udpPacket(cmd, data);
      if (this.debug) console.log('  >> UDP send: ' + hex(pkt));
      let chunks = [];
      let idle = null;

      const fail = setTimeout(() => { off(); resolve(this._combineUdp(chunks)); }, this.timeout * 3);
      const off = () => { clearTimeout(fail); if (idle) clearTimeout(idle); this.udp.removeAllListeners('message'); };
      const onM = (msg) => {
        chunks.push(msg);
        if (idle) clearTimeout(idle);
        // Check for ACK_OK (end of data)
        if (msg.length >= 8 && msg.readUInt16LE(0) === CMD_ACK_OK) {
          off();
          resolve(this._combineUdp(chunks));
          return;
        }
        idle = setTimeout(() => { off(); resolve(this._combineUdp(chunks)); }, 3000);
      };
      this.udp.on('message', onM);
      this.udp.send(pkt, 0, pkt.length, this.port, this.ip);
    });
  }

  // -- Extract data from TCP buffer --

  _extract(buf) {
    if (buf.length < 16) return Buffer.alloc(0);
    const pLen = buf.readUInt32LE(4);
    const pktEnd = 8 + pLen;
    const cmd = buf.readUInt16LE(8);

    if (cmd === CMD_ACK_OK && pLen <= 8) return Buffer.alloc(0);
    if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) return Buffer.alloc(0);
    if (cmd === CMD_ACK_DATA) return buf.slice(16, pktEnd);

    if (cmd === CMD_DATA || cmd === CMD_PREPARE) {
      let end = buf.length;
      if (end > 20 + 16) {
        const t = end - 16;
        if (buf[t]===0x50 && buf[t+1]===0x50 && buf[t+2]===0x82 && buf[t+3]===0x7d && buf.readUInt16LE(t+8)===CMD_ACK_OK) {
          end = t;
        }
      }
      return buf.slice(20, end); // skip 8 TCP + 8 payload header + 4 size
    }

    return pLen > 8 ? buf.slice(16, pktEnd) : Buffer.alloc(0);
  }

  // -- Combine UDP datagrams --

  _combineUdp(chunks) {
    if (!chunks.length) return Buffer.alloc(0);

    const first = chunks[0];
    const cmd = first.readUInt16LE(0);

    // Small data in first packet
    if (cmd === CMD_ACK_OK && first.length <= 8) return Buffer.alloc(0);
    if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) return Buffer.alloc(0);
    if (cmd === CMD_ACK_DATA) return first.slice(8);

    // Large data: first packet has size, rest are raw data, last is ACK_OK
    if (cmd === CMD_DATA || cmd === CMD_PREPARE) {
      const parts = [];
      for (let i = 1; i < chunks.length; i++) {
        const c = chunks[i];
        if (c.length >= 8 && c.readUInt16LE(0) === CMD_ACK_OK) break;
        parts.push(c);
      }
      return Buffer.concat(parts);
    }

    // Fallback: return data from first packet
    return first.length > 8 ? first.slice(8) : Buffer.alloc(0);
  }

  // -- Protocol-agnostic send --

  _cmd(cmd, data) {
    return this.proto === 'tcp' ? this._tcpSend(cmd, data) : this._udpSend(cmd, data);
  }

  _cmdData(cmd, data) {
    return this.proto === 'tcp' ? this._tcpReadAll(cmd, data) : this._udpReadAll(cmd, data);
  }

  // ====== PUBLIC API ======

  async connect() {
    this.session = 0;
    this.reply = 0;
    const errors = [];

    // Try TCP
    try {
      console.log('[zk] trying TCP ' + this.ip + ':' + this.port + '...');
      await this._tryTCP();
      this.proto = 'tcp';
      console.log('[zk] TCP connected! session=' + this.session);
      return;
    } catch (e) {
      errors.push('TCP: ' + e.message);
      console.log('[zk] TCP failed: ' + e.message);
    }

    // Try UDP
    this.session = 0;
    this.reply = 0;
    try {
      console.log('[zk] trying UDP ' + this.ip + ':' + this.port + '...');
      await this._tryUDP();
      this.proto = 'udp';
      console.log('[zk] UDP connected! session=' + this.session);
      return;
    } catch (e) {
      errors.push('UDP: ' + e.message);
      console.log('[zk] UDP failed: ' + e.message);
    }

    throw new Error('Cannot connect.\n  ' + errors.join('\n  '));
  }

  // Authenticate with CommKey after CMD_CONNECT returns UNAUTH
  async _auth(sendFn) {
    const keyBuf = Buffer.alloc(4);
    keyBuf.writeUInt32LE(this.commkey, 0);
    if (this.debug) console.log('  >> AUTH commkey=' + this.commkey);
    const res = await sendFn(CMD_AUTH, keyBuf);
    if (this.debug) console.log('  << AUTH response cmd=' + res.cmd);
    if (res.cmd === CMD_ACK_OK) return true;
    return false;
  }

  async _tryTCP() {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      const timer = setTimeout(() => { sock.destroy(); reject(new Error('TCP connect timeout')); }, this.timeout);

      sock.once('error', (e) => { clearTimeout(timer); reject(new Error('TCP: ' + e.message)); });
      sock.connect(this.port, this.ip, async () => {
        clearTimeout(timer);
        this.tcp = sock;
        try {
          const res = await this._tcpSend(CMD_CONNECT);
          if (res.cmd === CMD_ACK_OK) {
            this.session = res.session;
            resolve();
          } else if (res.cmd === CMD_ACK_UNAUTH) {
            // Device requires CommKey authentication
            this.session = res.session;
            console.log('[zk] TCP: device requires auth (session=' + this.session + ')');
            const ok = await this._auth(this._tcpSend.bind(this));
            if (ok) {
              resolve();
            } else {
              sock.destroy(); this.tcp = null;
              reject(new Error('AUTH failed (wrong CommKey? current=' + this.commkey + ')'));
            }
          } else {
            reject(new Error('Rejected cmd=' + res.cmd));
          }
        } catch (e) {
          sock.destroy();
          this.tcp = null;
          reject(e);
        }
      });
    });
  }

  async _tryUDP() {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      const timer = setTimeout(() => { sock.close(); reject(new Error('UDP connect timeout')); }, this.timeout);

      sock.once('error', (e) => { clearTimeout(timer); sock.close(); reject(new Error('UDP: ' + e.message)); });

      sock.bind(0, () => {
        this.udp = sock;
        this._udpSend(CMD_CONNECT)
          .then(async res => {
            clearTimeout(timer);
            if (res.cmd === CMD_ACK_OK) {
              this.session = res.session;
              resolve();
            } else if (res.cmd === CMD_ACK_UNAUTH) {
              // Device requires CommKey authentication
              this.session = res.session;
              console.log('[zk] UDP: device requires auth (session=' + this.session + ')');
              try {
                const ok = await this._auth(this._udpSend.bind(this));
                if (ok) {
                  resolve();
                } else {
                  sock.close(); this.udp = null;
                  reject(new Error('AUTH failed (wrong CommKey? current=' + this.commkey + ')'));
                }
              } catch (e) {
                sock.close(); this.udp = null;
                reject(e);
              }
            } else {
              reject(new Error('Rejected cmd=' + res.cmd));
            }
          })
          .catch(e => { clearTimeout(timer); sock.close(); this.udp = null; reject(e); });
      });
    });
  }

  async disconnect() {
    try { await this._cmd(CMD_EXIT); } catch (_) {}
    if (this.tcp) { this.tcp.destroy(); this.tcp = null; }
    if (this.udp) { try { this.udp.close(); } catch(_) {} this.udp = null; }
    this.proto = null;
  }

  async getVersion() {
    const res = await this._cmd(CMD_GET_VERSION);
    return res.data ? res.data.toString('ascii').replace(/\0+$/, '') : '';
  }

  async getUsers() {
    const raw = await this._cmdData(CMD_GET_USERS);
    if (!raw || !raw.length) return [];

    const sz = (raw.length % 72 === 0) ? 72 : (raw.length % 28 === 0) ? 28 : 72;
    const users = [];

    for (let i = 0; i + sz <= raw.length; i += sz) {
      const uid = raw.readUInt16LE(i);
      const role = raw[i + 2];
      const nameEnd = sz === 72 ? i + 35 : i + 19;
      const name = raw.slice(i + 11, nameEnd).toString('utf8').replace(/\0+$/g, '').trim();
      const cardno = raw.readUInt32LE(sz === 72 ? i + 35 : i + 19);
      users.push({ uid, role, name: name || ('User ' + uid), cardno });
    }
    return users;
  }

  async getAttendances() {
    const raw = await this._cmdData(CMD_GET_ATTEND);
    if (!raw || !raw.length) return [];

    const sz = (raw.length % 40 === 0) ? 40 : (raw.length % 16 === 0) ? 16 : 40;
    const records = [];

    for (let i = 0; i + sz <= raw.length; i += sz) {
      const uid = raw.readUInt16LE(i);
      let state, time;
      if (sz === 40) {
        state = raw[i + 27];
        time = decodeTime(raw.readUInt32LE(i + 28));
      } else {
        state = raw[i + 3];
        time = decodeTime(raw.readUInt32LE(i + 4));
      }
      records.push({ deviceUserId: String(uid), recordTime: time.toISOString(), type: state });
    }
    return records;
  }
}

module.exports = ZK;
