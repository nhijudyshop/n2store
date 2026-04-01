const ZK = require('./zk');

function hex(buf) {
  return buf.toString('hex').match(/../g).join(' ');
}

function decodeTime(t) {
  const s = t % 60; t = (t - s) / 60;
  const m = t % 60; t = (t - m) / 60;
  const h = t % 24; t = (t - h) / 24;
  const d = (t % 31) + 1; t = (t - (d - 1)) / 31;
  const mo = t % 12; t = (t - mo) / 12;
  return new Date(t + 2000, mo, d, h, m, s);
}

(async () => {
  const zk = new ZK('192.168.1.201', 4370, 10000, 0);
  await zk.connect();

  // === 1. Get parsed records ===
  const recs = await zk.getAttendances();
  console.log('Total parsed:', recs.length);

  const valid = recs.filter(r => r.deviceUserId !== '0' && !r.recordTime.includes('1999'));
  const bad = recs.filter(r => r.deviceUserId === '0' || r.recordTime.includes('1999'));
  console.log('Valid:', valid.length, '| Bad:', bad.length);
  if (valid.length) console.log('Last valid:', valid[valid.length - 1]);
  if (bad.length) console.log('First bad:', bad[0]);
  console.log('');

  // === 2. Read raw data again to inspect hex ===
  console.log('=== RAW DATA ANALYSIS ===');
  const raw = await zk.readWithBuffer(13); // CMD_GET_ATTEND
  console.log('Raw size:', raw.length, 'bytes');
  console.log('Records if 40-byte:', Math.floor(raw.length / 40));
  console.log('');

  // Try parsing manually with 40-byte format, tsOff=27
  console.log('=== MANUAL PARSE (40-byte, tsOff=27) ===');
  // Find where records go bad
  let firstBadIdx = -1;
  for (let i = 0; i + 40 <= raw.length; i += 40) {
    const recNum = i / 40;
    const userIdStr = raw.slice(i + 2, i + 26).toString('ascii').split('\0').shift().trim();
    let uid = parseInt(userIdStr);
    if (isNaN(uid) || uid <= 0) uid = raw.readUInt16LE(i);
    const tsRaw = raw.readUInt32LE(i + 27);
    const time = decodeTime(tsRaw);

    // Show records around boundaries
    if (recNum >= 405 && recNum <= 415) {
      console.log(`  [${recNum}] uid=${String(uid).padStart(3)} tsRaw=${tsRaw} time=${time.toISOString()} hex=${hex(raw.slice(i, i + 40))}`);
    }

    if (firstBadIdx === -1 && (uid === 0 || tsRaw === 0)) {
      firstBadIdx = recNum;
    }
  }
  console.log('');
  console.log('First bad record index:', firstBadIdx);

  // Show the first bad record and the one before it
  if (firstBadIdx > 0) {
    const goodOff = (firstBadIdx - 1) * 40;
    const badOff = firstBadIdx * 40;
    console.log('');
    console.log('Last good [' + (firstBadIdx - 1) + '] hex:', hex(raw.slice(goodOff, goodOff + 40)));
    console.log('First bad [' + firstBadIdx + '] hex:', hex(raw.slice(badOff, badOff + 40)));
  }

  // Show first and last records
  console.log('');
  console.log('First record [0] hex:', hex(raw.slice(0, 40)));
  console.log('Last record [' + (Math.floor(raw.length / 40) - 1) + '] hex:', hex(raw.slice(raw.length - (raw.length % 40 || 40) - 40, raw.length)));

  await zk.disconnect();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
