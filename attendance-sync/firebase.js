const admin = require('firebase-admin');
const path = require('path');

const CRED_PATH = path.join(__dirname, 'serviceAccountKey.json');
const COL = {
  records: 'attendance_records',
  users: 'attendance_device_users',
  commands: 'attendance_commands',
  status: 'attendance_sync_status',
};

let db = null;

function init() {
  if (db) return;
  admin.initializeApp({
    credential: admin.credential.cert(require(CRED_PATH)),
  });
  db = admin.firestore();
}

function dateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

async function uploadRecords(records) {
  if (!records.length) return 0;
  let n = 0;
  for (let i = 0; i < records.length; i += 450) {
    const batch = db.batch();
    for (const r of records.slice(i, i + 450)) {
      const t = new Date(r.recordTime || Date.now());
      const uid = String(r.deviceUserId || '');
      const id = uid + '_' + t.getTime();
      batch.set(db.collection(COL.records).doc(id), {
        deviceUserId: uid,
        checkTime: admin.firestore.Timestamp.fromDate(t),
        dateKey: dateKey(t),
        type: r.type || 0,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      n++;
    }
    await batch.commit();
  }
  return n;
}

async function uploadUsers(users) {
  if (!users.length) return;
  const batch = db.batch();
  for (const u of users) {
    const uid = String(u.uid || '');
    if (!uid) continue;
    batch.set(db.collection(COL.users).doc(uid), {
      uid,
      name: u.name || ('User ' + uid),
      role: u.role || 0,
      cardno: u.cardno || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

async function setStatus(data) {
  await db.collection(COL.status).doc('current').set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function onCommands(cb) {
  return db.collection(COL.commands)
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() });
      });
    });
}

async function updateCommand(id, status, result) {
  await db.collection(COL.commands).doc(id).update({
    status, result: result || '',
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = { init, uploadRecords, uploadUsers, setStatus, onCommands, updateCommand };
