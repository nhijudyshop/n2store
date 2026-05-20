#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Setup DNS records on GoDaddy via official Developer API
// (https://developer.godaddy.com/doc/endpoint/domains).
//
// Reads GODADDY_API_KEY + GODADDY_API_SECRET from serect_dont_push.txt.
// Replaces A/@ and AAAA/@ with GitHub Pages IPs, sets CNAME/www → nhijudyshop.github.io.
//
// Run:
//   node scripts/godaddy-setup-dns.js <domain>
//   node scripts/godaddy-setup-dns.js nhijudy.store

const fs = require('fs');
const path = require('path');

const DOMAIN = process.argv[2] || 'nhijudy.store';

// GitHub Pages apex IPs (https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain)
const GH_PAGES_A = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const GH_PAGES_AAAA = [
    '2606:50c0:8000::153',
    '2606:50c0:8001::153',
    '2606:50c0:8002::153',
    '2606:50c0:8003::153',
];
const GH_PAGES_CNAME = 'nhijudyshop.github.io';

const TTL = 3600;
const BASE = 'https://api.godaddy.com';

function loadSecrets() {
    const file = path.join(__dirname, '..', 'serect_dont_push.txt');
    const content = fs.readFileSync(file, 'utf8');
    const kv = {};
    for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
        if (m) kv[m[1]] = m[2];
    }
    if (!kv.GODADDY_API_KEY || !kv.GODADDY_API_SECRET) {
        throw new Error('Missing GODADDY_API_KEY / GODADDY_API_SECRET in serect_dont_push.txt');
    }
    return { key: kv.GODADDY_API_KEY, secret: kv.GODADDY_API_SECRET };
}

const { key, secret } = loadSecrets();
const authHeader = `sso-key ${key}:${secret}`;

async function api(method, urlPath, body) {
    const res = await fetch(`${BASE}${urlPath}`, {
        method,
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
        throw new Error(`${method} ${urlPath} → ${res.status} ${res.statusText}\n${text}`);
    }
    return json;
}

function fmt(records) {
    return records.map((r) => `  ${r.type} ${r.name} → ${r.data}  (TTL ${r.ttl})`).join('\n');
}

(async () => {
    console.log(`\n→ Domain: ${DOMAIN}\n`);

    // 1. Verify domain exists in account
    console.log('[1/5] Verifying domain ownership…');
    const info = await api('GET', `/v1/domains/${DOMAIN}`);
    console.log(`  ✓ Domain: ${info.domain}  status=${info.status}  expires=${info.expires}`);

    // 2. Show current DNS records (filter to apex + www)
    console.log('\n[2/5] Current DNS records (A, AAAA, CNAME):');
    const before = await api('GET', `/v1/domains/${DOMAIN}/records`);
    const relevant = before.filter(
        (r) =>
            (r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME') &&
            (r.name === '@' || r.name === 'www')
    );
    if (relevant.length === 0) {
        console.log('  (none for @ or www)');
    } else {
        console.log(fmt(relevant));
    }

    // 3. PUT A records for @ (replaces existing)
    console.log('\n[3/5] Setting A records @ → GitHub Pages IPs…');
    await api(
        'PUT',
        `/v1/domains/${DOMAIN}/records/A/@`,
        GH_PAGES_A.map((data) => ({ data, ttl: TTL }))
    );
    console.log('  ✓ 4 A records written');

    // 4. PUT AAAA records for @
    console.log('\n[4/5] Setting AAAA records @ → GitHub Pages IPv6…');
    await api(
        'PUT',
        `/v1/domains/${DOMAIN}/records/AAAA/@`,
        GH_PAGES_AAAA.map((data) => ({ data, ttl: TTL }))
    );
    console.log('  ✓ 4 AAAA records written');

    // 5. PUT CNAME for www
    console.log(`\n[5/5] Setting CNAME www → ${GH_PAGES_CNAME}…`);
    await api('PUT', `/v1/domains/${DOMAIN}/records/CNAME/www`, [
        { data: GH_PAGES_CNAME, ttl: TTL },
    ]);
    console.log('  ✓ CNAME written');

    // Verify
    console.log('\n→ Verifying (GET records after change):');
    const after = await api('GET', `/v1/domains/${DOMAIN}/records`);
    const verifyRecs = after.filter(
        (r) =>
            (r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME') &&
            (r.name === '@' || r.name === 'www')
    );
    console.log(fmt(verifyRecs));

    console.log(`\n✅ Done. DNS will propagate in 5-30 min globally.`);
    console.log(`   Check with: dig ${DOMAIN} +short   (expect 4 GitHub Pages IPs)`);
    console.log(`   Then go to GitHub repo → Settings → Pages → enable Enforce HTTPS.`);
})().catch((e) => {
    console.error('\n❌ ERROR:', e.message);
    process.exit(1);
});
