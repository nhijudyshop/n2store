#!/usr/bin/env node
// #Note: Deep probe FastSaleOrder schema + convert endpoint
const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const OUT = path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-pbh-explore');
fs.mkdirSync(OUT, { recursive: true });
const S = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
const USER = S.match(/TPOS_USERNAME:\s*(\S+)/)[1];
const PASS = S.match(/TPOS_PASSWORD:\s*(\S+)/)[1];
const HOST = 'tomato.tpos.vn';

function req(o, b) {
    return new Promise((res, rej) => {
        const r = https.request(o, (rs) => {
            const c = [];
            rs.on('data', (d) => c.push(d));
            rs.on('end', () =>
                res({ status: rs.statusCode, body: Buffer.concat(c).toString('utf8') })
            );
        });
        r.on('error', rej);
        if (b) r.write(b);
        r.end();
    });
}
async function token() {
    const b = querystring.stringify({
        grant_type: 'password',
        username: USER,
        password: PASS,
        client_id: 'tmtWebApp',
    });
    const r = await req(
        {
            method: 'POST',
            hostname: HOST,
            path: '/token',
            port: 443,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(b),
            },
        },
        b
    );
    return JSON.parse(r.body).access_token;
}
async function get(t, p) {
    const r = await req({
        method: 'GET',
        hostname: HOST,
        path: p,
        port: 443,
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' },
    });
    let j = null;
    try {
        j = JSON.parse(r.body);
    } catch {}
    return { status: r.status, body: r.body, json: j };
}
async function post(t, p, b) {
    const d = typeof b === 'string' ? b : JSON.stringify(b);
    const r = await req(
        {
            method: 'POST',
            hostname: HOST,
            path: p,
            port: 443,
            headers: {
                Authorization: `Bearer ${t}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(d),
            },
        },
        d
    );
    let j = null;
    try {
        j = JSON.parse(r.body);
    } catch {}
    return { status: r.status, body: r.body, json: j };
}

async function main() {
    const t = await token();
    console.log('▶ token ok');

    // 1. List FastSaleOrder — no expand, just top 1 to see schema
    console.log('\n▶ STEP 1: FastSaleOrder top 1');
    const r1 = await get(t, `/odata/FastSaleOrder?%24top=1&%24orderby=DateInvoice%20desc`);
    console.log(`  ${r1.status}`);
    if (r1.json?.value?.[0]) {
        const o = r1.json.value[0];
        console.log(`  fields (${Object.keys(o).length}): ${Object.keys(o).sort().join(', ')}`);
        fs.writeFileSync(path.join(OUT, 'fso-sample.json'), JSON.stringify(o, null, 2));
        console.log(
            `  Sample: Id=${o.Id} Number=${o.Number} PartnerName=${o.PartnerName} Total=${o.AmountTotal}`
        );
    } else if (r1.json?.error) {
        console.log('  err:', JSON.stringify(r1.json.error).slice(0, 300));
    }

    // 2. Detail with OrderLines
    if (r1.json?.value?.[0]?.Id) {
        const id = r1.json.value[0].Id;
        console.log('\n▶ STEP 2: FastSaleOrder(' + id + ') + OrderLines');
        const r2 = await get(t, `/odata/FastSaleOrder(${id})?%24expand=OrderLines`);
        console.log(`  ${r2.status}`);
        if (r2.json && !r2.json.error) {
            console.log(`  fields total: ${Object.keys(r2.json).length}`);
            console.log(`  OrderLines: ${r2.json.OrderLines?.length ?? 0}`);
            if (r2.json.OrderLines?.[0]) {
                console.log(
                    `  OrderLine fields (${Object.keys(r2.json.OrderLines[0]).length}): ${Object.keys(r2.json.OrderLines[0]).sort().join(', ')}`
                );
            }
            fs.writeFileSync(path.join(OUT, 'fso-detail.json'), JSON.stringify(r2.json, null, 2));
        }
    }

    // 3. GetView FastSaleOrder (UI thường dùng)
    console.log('\n▶ STEP 3: FastSaleOrder GetView');
    const r3 = await post(
        t,
        '/odata/FastSaleOrder/ODataService.GetView?$top=2&$count=true&$skip=0',
        { Keyword: '0123456788' }
    );
    console.log(`  ${r3.status}`);
    if (r3.json?.value?.[0]) {
        const o = r3.json.value[0];
        console.log(`  fields: ${Object.keys(o).length}`);
        console.log(
            `  Sample: Id=${o.Id} Number=${o.Number} Phone=${o.PartnerPhone} Customer=${o.PartnerName} Total=${o.AmountTotal}`
        );
        fs.writeFileSync(
            path.join(OUT, 'fso-getview.json'),
            JSON.stringify(r3.json.value.slice(0, 3), null, 2)
        );
    }

    // 4. Search broad probe — TPOS có nhiều method name khác
    console.log('\n▶ STEP 4: probe convert/create endpoints');
    const targetOrderId = 'bd160000-5d16-0015-86d5-08de7e73e38a';
    const probes = [
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.ApplySalesOnlineOrder',
            { Ids: [targetOrderId] },
        ],
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.ApplyDraftSaleOrder',
            { Ids: [targetOrderId] },
        ],
        ['POST', '/odata/SaleOnline_Order/ODataService.CreateInvoice', { Ids: [targetOrderId] }],
        ['POST', '/odata/SaleOnline_Order/ODataService.CreateOrder', { Ids: [targetOrderId] }],
        [
            'POST',
            '/odata/FastSaleOrder/ODataService.CreateFromSaleOnlineOrder',
            { Ids: [targetOrderId] },
        ],
        [
            'POST',
            '/odata/FastSaleOrder/ODataService.CreateFromOrderOnline',
            { Ids: [targetOrderId] },
        ],
        ['POST', '/rest/v1.0/saleonlineorder/createinvoice', { Ids: [targetOrderId] }],
        ['POST', '/rest/v1.0/fastsaleorder/createfromsaleonline', { Ids: [targetOrderId] }],
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.CreateFastSaleOrder',
            { Ids: [targetOrderId] },
        ],
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.QuickCreateFastSaleOrder',
            { Ids: [targetOrderId] },
        ],
        ['POST', '/rest/v1.0/saleonline-order/createfastsaleorder', { Ids: [targetOrderId] }],
        ['POST', '/rest/v1.0/saleonlineorder/createfastsaleorder', { Ids: [targetOrderId] }],
    ];
    const probeOut = [];
    for (const [m, p, b] of probes) {
        const r = await post(t, p, b);
        const ok = r.status >= 200 && r.status < 400;
        const summary = `${ok ? '✓' : '  '} ${r.status} ${p}`;
        console.log(`  ${summary}`);
        probeOut.push({ method: m, path: p, status: r.status, sample: r.body.slice(0, 200) });
    }
    fs.writeFileSync(path.join(OUT, 'probe-convert.json'), JSON.stringify(probeOut, null, 2));

    // 5. Get TPOS UI's bundle.js to grep endpoints
    console.log('\n▶ STEP 5: try Customer/Partner endpoint for context');
    const r5 = await get(
        t,
        `/odata/Partner?$filter=${encodeURIComponent("Phone eq '0123456788'")}&$top=1`
    );
    console.log(`  ${r5.status}`);
    if (r5.json?.value?.[0]) {
        console.log(`  Partner fields: ${Object.keys(r5.json.value[0]).length}`);
        fs.writeFileSync(
            path.join(OUT, 'partner-sample.json'),
            JSON.stringify(r5.json.value[0], null, 2)
        );
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
