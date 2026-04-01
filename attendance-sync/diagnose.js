const ZK = require('./zk');

(async () => {
  const zk = new ZK('192.168.1.201', 4370, 10000, 0);
  await zk.connect();
  const recs = await zk.getAttendances();

  const valid = recs.filter(r => r.deviceUserId !== '0' && !r.recordTime.includes('1999'));
  const bad = recs.filter(r => r.deviceUserId === '0' || r.recordTime.includes('1999'));

  console.log('Total:', recs.length, '| Valid:', valid.length, '| Bad:', bad.length);
  if (valid.length) console.log('Last valid:', valid[valid.length - 1]);
  if (bad.length) console.log('First bad:', bad[0]);

  await zk.disconnect();
})();
