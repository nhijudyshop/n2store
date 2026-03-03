const admin = require('firebase-admin');
const config = require('./config');

let db = null;

function init() {
  if (db) return;
  admin.initializeApp({
    credential: admin.credential.cert(require(config.firebase.credential)),
  });
  db = admin.firestore();
  console.log('[firebase] initialized');
}

function toDateKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

async function uploadRecords(records) {
  if (!records.length) return 0;
  const col = db.collection(config.collections.records);
  let count = 0;

  for (let i = 0; i < records.length; i += 450) {
    const batch = db.batch();
    const chunk = records.slice(i, i + 450);

    for (const r of chunk) {
      const t = new Date(r.recordTime || r.timestamp || r.time || Date.now());
      const uid = String(r.deviceUserId || r.userId || r.uid || '');
      const docId = uid + '_' + t.getTime();

      batch.set(col.doc(docId), {
        deviceUserId: uid,
        checkTime: admin.firestore.Timestamp.fromDate(t),
        dateKey: toDateKey(t),
        type: r.type || r.attState || 0,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      count++;
    }

    await batch.commit();
  }

  return count;
}

async function uploadUsers(users) {
  if (!users.length) return;
  const col = db.collection(config.collections.users);
  const batch = db.batch();

  for (const u of users) {
    const uid = String(u.uid || u.userId || u.id || '');
    if (!uid) continue;
    batch.set(col.doc(uid), {
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
  await db.collection(config.collections.status).doc('current').set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function onCommands(cb) {
  return db.collection(config.collections.commands)
    .where('status', '==', 'pending')
    .onSnapshot(snap => {
      snap.docChanges().forEach(c => {
        if (c.type === 'added') cb({ id: c.doc.id, ...c.doc.data() });
      });
    });
}

async function updateCommand(id, status, result) {
  await db.collection(config.collections.commands).doc(id).update({
    status,
    result: result || '',
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = {
  init, uploadRecords, uploadUsers, setStatus, onCommands, updateCommand,
};
