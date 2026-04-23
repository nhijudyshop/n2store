#!/usr/bin/env node
// Test HTTP-only OnCallCX portal client (không Playwright)

const fs = require('fs');
const path = require('path');
const { OnCallPortalClient } = require('../render.com/services/oncall-portal-client');

const SECRETS = path.resolve(__dirname, '..', 'serect_dont_push.txt');

(async () => {
    const content = fs.readFileSync(SECRETS, 'utf8');
    const line = content
        .split('\n')
        .find((l) => l.includes('pbx-ucaas.oncallcx.vn') && !l.includes('PBX_HOST'));
    const after = line.replace(/^\s*\d+\/?\s*/, '').replace(/"[^"]*"\s*/, '');
    const [username, ...passParts] = after.trim().split(/\s+/);
    const password = passParts.join(' ');

    const client = new OnCallPortalClient({ username, password, debug: true });

    console.log('\n=== LOGIN ===');
    await client.login();
    console.log('Cookies:', Object.keys(client.cookies).join(', '));

    console.log('\n=== DASHBOARD ===');
    const dash = await client.dashboard();
    console.log(`Phones: ${dash.phones.length}`);
    dash.phones
        .slice(0, 5)
        .forEach((p) => console.log(` - ${p.internalNumber} | ${p.phoneName} | ${p.status}`));

    console.log('\n=== EXTENSIONS ===');
    const exts = await client.listExtensions();
    console.log(`Total: ${exts.extensions.length}`);
    exts.extensions
        .slice(0, 5)
        .forEach((e) =>
            console.log(` - ext=${e.extension} | name=${e.displayedName} | user=${e.pbxUser}`)
        );

    console.log('\n=== CALLS (page 1) ===');
    const calls = await client.listCalls({ page: 1 });
    console.log(`Total rows: ${calls.calls.length}`);
    calls.calls
        .slice(0, 5)
        .forEach((c) =>
            console.log(
                ` - ${c.start} | ${c.from}->${c.to} | dur=${c.duration} | rec=${c.hasRecording} | rk=${c.rowKey}`
            )
        );

    const withRec = calls.calls.find((c) => c.hasRecording);
    if (withRec) {
        console.log(`\n=== DOWNLOAD RECORDING rowKey=${withRec.rowKey} ===`);
        const result = await client.downloadRecording(withRec.rowKey);
        console.log('Filename:', result.filename);
        console.log('Content-Type:', result.contentType);
        console.log('Content-Length:', result.contentLength);
        const outPath = '/tmp/test-oncall-client-' + Date.now() + '.wav';
        const ws = fs.createWriteStream(outPath);
        await new Promise((res, rej) => {
            result.stream.pipe(ws);
            result.stream.on('end', res);
            result.stream.on('error', rej);
        });
        const sz = fs.statSync(outPath).size;
        console.log(`Saved ${sz} bytes -> ${outPath}`);
        const hdr = fs.readFileSync(outPath).slice(0, 4).toString('ascii');
        console.log('File header:', hdr, hdr === 'RIFF' ? '(WAV OK)' : '(NOT WAV!)');
        fs.unlinkSync(outPath);
    } else {
        console.log('[warn] Không tìm thấy call có recording để test download');
    }

    console.log('\n=== LIVE CALLS ===');
    const live = await client.listLiveCalls();
    console.log(`Live calls: ${live.liveCalls.length}`);

    console.log('\n=== PUBLIC NUMBERS ===');
    const dids = await client.listPublicNumbers();
    console.log(`Public numbers: ${dids.publicNumbers.length}`);
    dids.publicNumbers
        .slice(0, 3)
        .forEach((d) => console.log(` - ${d.publicNumber} | ${d.name} | -> ${d.destination}`));

    console.log('\n[ok] All tests passed');
})().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
