#!/usr/bin/env node
// #Note: Iteration 2 — fix $expand + use GetView endpoint
const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-pbh-explore');
fs.mkdirSync(OUT_DIR, { recursive: true });

const S = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
const USER = S.match(/TPOS_USERNAME:\s*(\S+)/)[1];
const PASS = S.match(/TPOS_PASSWORD:\s*(\S+)/)[1];
const HOST = 'tomato.tpos.vn';

function httpReq(opts, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (r) => {
            const c = [];
            r.on('data', (d) => c.push(d));
            r.on('end', () =>
                resolve({ status: r.statusCode, body: Buffer.concat(c).toString('utf8') })
            );
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
async function getToken() {
    const body = querystring.stringify({
        grant_type: 'password',
        username: USER,
        password: PASS,
        client_id: 'tmtWebApp',
    });
    const r = await httpReq(
        {
            method: 'POST',
            hostname: HOST,
            path: '/token',
            port: 443,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        },
        body
    );
    return JSON.parse(r.body).access_token;
}
async function get(token, p) {
    const r = await httpReq({
        method: 'GET',
        hostname: HOST,
        path: p,
        port: 443,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return { status: r.status, body: r.body, json: tryJson(r.body) };
}
async function post(token, p, body) {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const r = await httpReq(
        {
            method: 'POST',
            hostname: HOST,
            path: p,
            port: 443,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json;charset=UTF-8',
                'Content-Length': Buffer.byteLength(data),
            },
        },
        data
    );
    return { status: r.status, body: r.body, json: tryJson(r.body) };
}
function tryJson(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

async function main() {
    console.log('▶ Login');
    const token = await getToken();

    const PHONE = '0123456788';
    console.log('\n▶ STEP A: Get SaleOnline_Order list for phone');
    const r1 = await get(
        token,
        `/odata/SaleOnline_Order?$filter=${encodeURIComponent(`contains(tolower(Telephone),'${PHONE}')`)}&$top=5&$count=true`
    );
    console.log(
        `  ${r1.status} count=${r1.json?.['@odata.count'] ?? '?'} returned=${r1.json?.value?.length}`
    );
    const orders = r1.json?.value || [];
    if (orders[0]) {
        console.log('  sample order keys:', Object.keys(orders[0]).slice(0, 20).join(', ') + '…');
    }

    // STEP B: GetView with phone search — TPOS web UI thường gọi đây
    console.log('\n▶ STEP B: SaleOnline_Order GetView');
    const r2 = await post(
        token,
        '/odata/SaleOnline_Order/ODataService.GetView?$top=5&$count=true&$skip=0',
        {
            Keyword: PHONE,
        }
    );
    console.log(
        `  ${r2.status} count=${r2.json?.['@odata.count'] ?? '?'} value=${r2.json?.value?.length}`
    );
    if (r2.json?.value?.[0]) {
        const o = r2.json.value[0];
        console.log(
            `    Sample: Id=${o.Id} Code=${o.Code} Name=${o.Name} Phone=${o.Telephone} Total=${o.TotalAmount} State=${o.StatusText}`
        );
        fs.writeFileSync(
            path.join(OUT_DIR, 'B-getview-result.json'),
            JSON.stringify(r2.json, null, 2)
        );
    }

    // STEP C: Try $expand=Details only (no Partner — that's a relationship not direct expand)
    if (orders[0]) {
        const id = orders[0].Id;
        console.log(`\n▶ STEP C: GET single order with $expand=Details — Id=${id}`);
        const r3 = await get(token, `/odata/SaleOnline_Order(${id})?$expand=Details`);
        console.log(`  ${r3.status}`);
        if (r3.json && !r3.json.error) {
            console.log(`  fields: ${Object.keys(r3.json).length}`);
            console.log(`  Details count: ${r3.json.Details?.length ?? 0}`);
            fs.writeFileSync(
                path.join(OUT_DIR, 'C-order-detail.json'),
                JSON.stringify(r3.json, null, 2)
            );
        } else if (r3.json?.error) {
            console.log('  ERR:', JSON.stringify(r3.json.error).slice(0, 300));
        }
    }

    // STEP D: FastSaleOrder filter different approach — try /by-partner
    console.log('\n▶ STEP D: FastSaleOrder direct filter without expand');
    // Try with simple filter on PartnerName
    const r4 = await get(
        token,
        `/odata/FastSaleOrder?$filter=${encodeURIComponent("contains(tolower(PartnerName),'huỳnh thành đạt')")}&$top=3&$count=true`
    );
    console.log(`  ${r4.status} count=${r4.json?.['@odata.count'] ?? '?'}`);
    if (r4.json?.value?.[0]) {
        const p = r4.json.value[0];
        console.log(
            `    Sample: Id=${p.Id} Number=${p.Number} PartnerName=${p.PartnerName} Total=${p.AmountTotal} State=${p.State}`
        );
        fs.writeFileSync(
            path.join(OUT_DIR, 'D-fastsaleorder-list.json'),
            JSON.stringify(r4.json, null, 2)
        );

        // STEP E: get FastSaleOrder detail
        const pbhId = p.Id;
        console.log(`\n▶ STEP E: FastSaleOrder(${pbhId}) detail`);
        const r5 = await get(token, `/odata/FastSaleOrder(${pbhId})?$expand=OrderLines`);
        console.log(`  ${r5.status}`);
        if (r5.json && !r5.json.error) {
            console.log(
                `  fields (${Object.keys(r5.json).length}): ${Object.keys(r5.json).slice(0, 30).join(', ')}…`
            );
            console.log(`  OrderLines: ${r5.json.OrderLines?.length ?? 0}`);
            fs.writeFileSync(
                path.join(OUT_DIR, 'E-fastsaleorder-detail.json'),
                JSON.stringify(r5.json, null, 2)
            );
        }
    }

    // STEP F: Find the "create PBH from SaleOnlineOrder" action
    // TPOS calls: POST /odata/SaleOnline_Order/ODataService.ConvertToOrder or similar
    console.log('\n▶ STEP F: Probe convert-to-PBH endpoints');
    const probes = [
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.ConvertToOrder',
            { Ids: orders.length ? [orders[0].Id] : [] },
        ],
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.PrepareInvoice',
            { Ids: orders.length ? [orders[0].Id] : [] },
        ],
        [
            'POST',
            '/odata/SaleOnline_Order/ODataService.QuickPrepareInvoice',
            { Ids: orders.length ? [orders[0].Id] : [] },
        ],
        ['POST', '/odata/FastSaleOrder/ODataService.QuickCreate', {}],
        ['POST', '/odata/FastSaleOrder/ODataService.CreateOrUpdate', {}],
        [
            'POST',
            '/odata/FastSaleOrder/ODataService.PrepareWithSaleOnlineOrderIds',
            { Ids: orders.length ? [orders[0].Id] : [] },
        ],
    ];
    const probeOut = {};
    for (const [m, p, b] of probes) {
        const r = m === 'POST' ? await post(token, p, b) : await get(token, p);
        const bodyHead = r.body.slice(0, 200).replace(/\s+/g, ' ');
        console.log(`  ${r.status} ${m} ${p}  [${bodyHead.slice(0, 100)}]`);
        probeOut[`${m} ${p}`] = { status: r.status, sample: bodyHead };
    }
    fs.writeFileSync(
        path.join(OUT_DIR, 'F-pbh-create-probes.json'),
        JSON.stringify(probeOut, null, 2)
    );

    console.log('\n✓ DONE');
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
