const fs = require('fs');
const path = require('path');
const SECRET = path.join(__dirname, '..', 'serect_dont_push.txt');
const W = 'https://chatomni-proxy.nhijudyshop.workers.dev';
function grab(txt, label) {
    const m = txt.match(new RegExp(`^\\s*\\d*/?\\s*${label}\\s*[:=]\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : null;
}
(async () => {
    const txt = fs.readFileSync(SECRET, 'utf8');
    const username = grab(txt, 'TPOS_USERNAME'),
        password = grab(txt, 'TPOS_PASSWORD');
    let client_id = grab(txt, 'TPOS_CLIENT_ID') || 'tmtWebApp';
    if (!username || !password) {
        console.error('missing TPOS creds');
        process.exit(1);
    }
    // 1. token
    async function getToken(cid) {
        const r = await fetch(`${W}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&client_id=${encodeURIComponent(cid)}`,
        });
        const j = await r.json();
        return j.access_token
            ? j
            : { err: j.error || j.message || JSON.stringify(j).slice(0, 120) };
    }
    let tok = await getToken(client_id);
    if (tok.err && client_id !== 'tmtWebApp') {
        console.error('client_id from secret failed, trying tmtWebApp:', tok.err);
        tok = await getToken('tmtWebApp');
    }
    if (tok.err) {
        console.error('TOKEN FAIL:', tok.err);
        process.exit(2);
    }
    console.log('✓ token ok, expires_in=', tok.expires_in);
    const bearer = `Bearer ${tok.access_token}`;
    // 2. fetch products with images
    const url = `${W}/api/odata/ProductTemplate?%24top=80&%24select=Id,Name,ImageUrl&%24orderby=Id+desc`;
    const r2 = await fetch(url, { headers: { Authorization: bearer, Accept: 'application/json' } });
    const j2 = await r2.json();
    const all = (j2.value || []).filter((p) => p.ImageUrl && /^https?:/.test(p.ImageUrl));
    console.log(`TPOS products with ImageUrl: ${all.length}/${(j2.value || []).length}`);
    if (!all.length) {
        console.error(
            'no images found. sample:',
            JSON.stringify((j2.value || [])[0] || j2).slice(0, 200)
        );
        process.exit(3);
    }
    console.log('sample img url:', all[0].ImageUrl.slice(0, 90));
    // pick distinct random images (deterministic shuffle by index to avoid Math.random reliance)
    const imgs = all.map((p) => p.ImageUrl);
    fs.writeFileSync(
        path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-image-urls.json'),
        JSON.stringify(imgs.slice(0, 40), null, 2)
    );
    console.log('saved', Math.min(40, imgs.length), 'image urls');
})().catch((e) => {
    console.error('fatal', e.message);
    process.exit(9);
});
