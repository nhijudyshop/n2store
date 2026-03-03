const ZKLib = require('node-zklib');
const config = require('./config');

let zk = null;
let connected = false;

async function connect() {
  const { ip, port, timeout, inport } = config.device;
  zk = new ZKLib(ip, port, timeout, inport);
  await zk.createSocket();
  connected = true;
  console.log('[device] connected (' + (zk.connectionType || 'tcp') + ')');
}

async function disconnect() {
  if (!zk) return;
  try { await zk.disconnect(); } catch (_) {}
  connected = false;
  zk = null;
}

function ensureConnected() {
  if (!connected || !zk) throw new Error('Device not connected');
}

async function getInfo() {
  ensureConnected();
  return zk.getInfo();
}

async function getUsers() {
  ensureConnected();
  const res = await zk.getUsers();
  return res.data || [];
}

async function getAttendances() {
  ensureConnected();
  const res = await zk.getAttendances();
  return res.data || [];
}

async function onRealTimeLog(cb) {
  ensureConnected();
  await zk.getRealTimeLogs(cb);
}

async function setUser(uid, name) {
  ensureConnected();
  await zk.setUser(uid, name, '', 0);
}

async function deleteUser(uid) {
  ensureConnected();
  await zk.deleteUser(uid);
}

module.exports = {
  connect, disconnect, getInfo, getUsers, getAttendances,
  onRealTimeLog, setUser, deleteUser,
};
