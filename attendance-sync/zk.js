/**
 * Raw ZK Protocol (TCP) - No third-party library
 * Reference: https://github.com/adrobinoga/zk-protocol
 *
 * Ronald Jack DG-600 uses ZKTeco protocol over TCP port 4370
 */
const net = require('net');

// ZK Protocol Commands
const CMD_CONNECT      = 1000;
const CMD_EXIT         = 1001;
const CMD_ENABLE       = 1002;
const CMD_DISABLE      = 1003;
const CMD_GET_VERSION  = 1100;
const CMD_GET_USERS    = 9;     // CMD_USERTEMP_RRQ
const CMD_GET_ATTEND   = 13;    // CMD_ATTLOG_RRQ
const CMD_REG_EVENT    = 500;

// Response codes
const CMD_ACK_OK       = 2000;
const CMD_ACK_ERROR    = 2001;
const CMD_ACK_DATA     = 2002;
const CMD_ACK_UNAUTH   = 2005;
const CMD_DATA         = 1501;
const CMD_PREPARE      = 1500;

// TCP header magic bytes
const MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

// -- Checksum --
function zkChecksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length - 1; i += 2) {
    sum += buf.readUInt16LE(i);
  }
  if (buf.length % 2 !== 0) sum += buf[buf.length - 1];
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

// -- Decode ZK timestamp --
function decodeTime(t) {
  const s = t % 60; t = (t - s) / 60;
  const m = t % 60; t = (t - m) / 60;
  const h = t % 24; t = (t - h) / 24;
  const d = (t % 31) + 1; t = (t - (d - 1)) / 31;
  const mo = t % 12; t = (t - mo) / 12;
  return new Date(t + 2000, mo, d, h, m, s);
}

class ZK {
  constructor(ip, port, timeout) {
    this.ip = ip;
    this.port = port || 4370;
    this.timeout = timeout || 10000;
    this.socket = null;
    this.session = 0;
    this.reply = 0;
  }

  // Build a ZK TCP packet
  _packet(cmd, data) {
    if (!data) data = Buffer.alloc(0);
    const payload = Buffer.alloc(8 + data.length);
    payload.writeUInt16LE(cmd, 0);
    // checksum at 2 (fill after)
    payload.writeUInt16LE(this.session, 4);
    payload.writeUInt16LE(this.reply, 6);
    if (data.length) data.copy(payload, 8);
    payload.writeUInt16LE(zkChecksum(payload), 2);
    this.reply = (this.reply + 1) & 0xffff;

    const hdr = Buffer.alloc(8);
    MAGIC.copy(hdr);
    hdr.writeUInt32LE(payload.length, 4);
    return Buffer.concat([hdr, payload]);
  }

  // Send command, receive ONE response packet
  _send(cmd, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      const pkt = this._packet(cmd, data);
      let buf = Buffer.alloc(0);

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for response'));
      }, this.timeout);

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.removeListener('data', onData);
        this.socket.removeListener('error', onErr);
      };
      const onErr = (e) => { cleanup(); reject(e); };
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length < 8) return;
        const pLen = buf.readUInt32LE(4);
        if (buf.length < 8 + pLen) return;
        cleanup();
        resolve({
          cmd: buf.readUInt16LE(8),
          session: buf.readUInt16LE(12),
          data: buf.slice(16, 8 + pLen),
        });
      };

      this.socket.on('data', onData);
      this.socket.once('error', onErr);
      this.socket.write(pkt);
    });
  }

  // Send command, receive ALL data (handles large multi-packet responses)
  _sendReadAll(cmd, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      const pkt = this._packet(cmd, data);
      let buf = Buffer.alloc(0);
      let idle = null;

      const failTimer = setTimeout(() => {
        cleanup();
        resolve(this._extractData(buf));
      }, this.timeout * 3);

      const cleanup = () => {
        clearTimeout(failTimer);
        if (idle) clearTimeout(idle);
        this.socket.removeAllListeners('data');
        this.socket.removeListener('error', onErr);
      };
      const onErr = (e) => { cleanup(); reject(e); };

      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (idle) clearTimeout(idle);

        if (buf.length < 16) return;
        const pLen = buf.readUInt32LE(4);
        const pktEnd = 8 + pLen;
        if (buf.length < pktEnd) return;

        const respCmd = buf.readUInt16LE(8);

        // Single-packet response (small data or no data)
        if (respCmd === CMD_ACK_OK || respCmd === CMD_ACK_DATA ||
            respCmd === CMD_ACK_ERROR || respCmd === CMD_ACK_UNAUTH) {
          cleanup();
          resolve(this._extractData(buf));
          return;
        }

        // Large data - check if trailing ACK_OK already arrived
        if (buf.length > pktEnd + 16) {
          const tail = buf.length - 16;
          if (buf[tail] === 0x50 && buf[tail + 1] === 0x50 &&
              buf[tail + 2] === 0x82 && buf[tail + 3] === 0x7d &&
              buf.readUInt16LE(tail + 8) === CMD_ACK_OK) {
            cleanup();
            resolve(this._extractData(buf));
            return;
          }
        }

        // Wait for more data
        idle = setTimeout(() => {
          cleanup();
          resolve(this._extractData(buf));
        }, 3000);
      };

      this.socket.on('data', onData);
      this.socket.once('error', onErr);
      this.socket.write(pkt);
    });
  }

  // Extract raw record data from combined buffer
  _extractData(buf) {
    if (buf.length < 16) return Buffer.alloc(0);

    const pLen = buf.readUInt32LE(4);
    const pktEnd = 8 + pLen;
    const cmd = buf.readUInt16LE(8);

    // No data
    if (cmd === CMD_ACK_OK && pLen <= 8) return Buffer.alloc(0);
    if (cmd === CMD_ACK_ERROR || cmd === CMD_ACK_UNAUTH) return Buffer.alloc(0);

    // Small data inline
    if (cmd === CMD_ACK_DATA) return buf.slice(16, pktEnd);

    // Large data (CMD_DATA or CMD_PREPARE)
    if (cmd === CMD_DATA || cmd === CMD_PREPARE) {
      // First packet payload: [cmd:2][cksum:2][sess:2][reply:2][size:4][inline_data...]
      // Raw data starts at offset 20 (after 4-byte size field)
      const dataStart = 20;
      let dataEnd = buf.length;

      // Strip trailing ACK_OK packet (16 bytes)
      if (dataEnd > dataStart + 16) {
        const tail = dataEnd - 16;
        if (buf[tail] === 0x50 && buf[tail + 1] === 0x50 &&
            buf[tail + 2] === 0x82 && buf[tail + 3] === 0x7d &&
            buf.readUInt16LE(tail + 8) === CMD_ACK_OK) {
          dataEnd = tail;
        }
      }

      return buf.slice(dataStart, dataEnd);
    }

    // Fallback
    return pLen > 8 ? buf.slice(16, pktEnd) : Buffer.alloc(0);
  }

  // ── Public API ──

  async connect() {
    return new Promise((resolve, reject) => {
      this.session = 0;
      this.reply = 0;
      this.socket = new net.Socket();

      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error('TCP timeout ' + this.ip + ':' + this.port));
      }, this.timeout);

      this.socket.once('error', (e) => {
        clearTimeout(timer);
        reject(new Error('TCP error: ' + e.message));
      });

      this.socket.connect(this.port, this.ip, async () => {
        clearTimeout(timer);
        try {
          const res = await this._send(CMD_CONNECT);
          if (res.cmd === CMD_ACK_OK) {
            this.session = res.session;
            resolve();
          } else if (res.cmd === CMD_ACK_UNAUTH) {
            reject(new Error('CommKey required - set CommKey=0 on device'));
          } else {
            reject(new Error('Rejected: code ' + res.cmd));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async disconnect() {
    if (!this.socket) return;
    try { await this._send(CMD_EXIT); } catch (_) {}
    this.socket.destroy();
    this.socket = null;
  }

  async getVersion() {
    const res = await this._send(CMD_GET_VERSION);
    return res.data ? res.data.toString('ascii').replace(/\0+$/, '') : '';
  }

  async getUsers() {
    const raw = await this._sendReadAll(CMD_GET_USERS);
    if (!raw || !raw.length) return [];

    // Detect record size: 72 bytes (new firmware) or 28 bytes (old)
    const sz = (raw.length % 72 === 0) ? 72
             : (raw.length % 28 === 0) ? 28
             : 72;

    const users = [];
    for (let i = 0; i + sz <= raw.length; i += sz) {
      const uid = raw.readUInt16LE(i);
      const role = raw[i + 2];
      const nameEnd = sz === 72 ? i + 35 : i + 19;
      const name = raw.slice(i + 11, nameEnd).toString('utf8').replace(/\0+$/g, '').trim();
      const cardOffset = sz === 72 ? i + 35 : i + 19;
      const cardno = raw.readUInt32LE(cardOffset);

      users.push({ uid, role, name: name || ('User ' + uid), cardno });
    }
    return users;
  }

  async getAttendances() {
    const raw = await this._sendReadAll(CMD_GET_ATTEND);
    if (!raw || !raw.length) return [];

    // Detect record size: 40 bytes (new) or 16 bytes (old)
    const sz = (raw.length % 40 === 0) ? 40
             : (raw.length % 16 === 0) ? 16
             : 40;

    const records = [];
    for (let i = 0; i + sz <= raw.length; i += sz) {
      const uid = raw.readUInt16LE(i);
      let state, time;

      if (sz === 40) {
        // [uid:2][userId:24][verify:1][state:1][time:4][workcode:1][reserved:7]
        state = raw[i + 27];
        time = decodeTime(raw.readUInt32LE(i + 28));
      } else {
        // [uid:2][verify:1][state:1][time:4][workcode:1][reserved:7]
        state = raw[i + 3];
        time = decodeTime(raw.readUInt32LE(i + 4));
      }

      records.push({
        deviceUserId: String(uid),
        recordTime: time.toISOString(),
        type: state,
      });
    }
    return records;
  }
}

module.exports = ZK;
