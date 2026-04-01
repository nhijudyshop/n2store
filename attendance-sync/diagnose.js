const ZK = require('./zk');

function hex(buf) {
  return buf.toString('hex').match(/../g).join(' ');
}

(async () => {
  const zk = new ZK('192.168.1.201', 4370, 10000, 0);
  await zk.connect();

  // === 1. Read raw attendance data to analyze chunk boundary ===
  console.log('=== RAW CHUNK ANALYSIS ===');
  const raw = await zk.readWithBuffer(13); // CMD_GET_ATTEND = 13
  console.log('Raw data size:', raw.length, 'bytes');
  console.log('Expected records (40-byte):', Math.floor(raw.length / 40));
  console.log('Chunk boundary at:', 16384, 'bytes (MAX_CHUNK)');
  console.log('Records in chunk 1:', Math.floor(16384 / 40), '(409 * 40 = 16360)');
  console.log('');

  // Show bytes around chunk boundary (16360-16440)
  if (raw.length > 16440) {
    console.log('=== BYTES AROUND CHUNK BOUNDARY (record 409-411) ===');
    // Record 409 (last in chunk 1): bytes 16320-16359
    console.log('Record 409 (bytes 16320-16359) - last in chunk 1:');
    console.log('  ' + hex(raw.slice(16320, 16360)));
    // Bytes 16360-16383 (end of chunk 1, start of record 410)
    console.log('Record 410 (bytes 16360-16399) - CROSSES chunk boundary:');
    console.log('  ' + hex(raw.slice(16360, 16400)));
    // Record 411 (first fully in chunk 2): bytes 16400-16439
    console.log('Record 411 (bytes 16400-16439) - first full in chunk 2:');
    console.log('  ' + hex(raw.slice(16400, 16440)));
    console.log('');
  }

  // Show first and last 40 bytes (first and last record)
  console.log('=== FIRST RECORD (bytes 0-39) ===');
  console.log('  ' + hex(raw.slice(0, 40)));
  console.log('=== LAST RECORD (bytes ' + (raw.length - 40) + '-' + (raw.length - 1) + ') ===');
  console.log('  ' + hex(raw.slice(raw.length - 40)));
  console.log('');

  // === 2. Parse and show records around boundary ===
  console.log('=== PARSED RECORDS AROUND BOUNDARY ===');
  const recs = await zk.getAttendances();
  console.log('Total parsed:', recs.length);

  const valid = recs.filter(r => r.deviceUserId !== '0' && !r.recordTime.includes('1999'));
  const bad = recs.filter(r => r.deviceUserId === '0' || r.recordTime.includes('1999'));
  console.log('Valid:', valid.length, '| Bad:', bad.length);
  console.log('');

  // Show records 405-415 (around the boundary)
  console.log('Records around position 409:');
  for (let i = Math.max(0, 405); i < Math.min(recs.length, 415); i++) {
    const r = recs[i];
    const marker = (i === 409) ? ' <<<< CHUNK BOUNDARY' : '';
    console.log(`  [${i}] user=${r.deviceUserId.padStart(3)} time=${r.recordTime} type=${r.type}${marker}`);
  }

  await zk.disconnect();
  console.log('\nDONE');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
