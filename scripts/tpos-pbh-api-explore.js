#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// API-first exploration của TPOS PBH (Phiếu Bán Hàng) flow.
// Goal: map endpoints + payload shapes để clone vào web2.

const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-pbh-explore');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SECRETS = fs.readFileSync(path.join(__dirname, '..', 'serect_dont_push.txt'), 'utf8');
const USER = SECRETS.match(/TPOS_USERNAME:\s*(\S+)/)[1];
const PASS = SECRETS.match(/TPOS_PASSWORD:\s*(\S+)/)[1];
const CLIENT_ID = (SECRETS.match(/TPOS_CLIENT_ID:\s*(\S+)/) || ['', 'tmtWebApp'])[1];

const TEST_PHONE = '0123456788';
const HOST = 'tomato.tpos.vn';

function httpReq(opts, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                    headers: res.headers,
                })
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
        client_id: CLIENT_ID,
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
    if (r.status !== 200) throw new Error(`token HTTP ${r.status}: ${r.body.slice(0, 300)}`);
    return JSON.parse(r.body).access_token;
}

async function odataGet(token, urlPath) {
    const r = await httpReq({
        method: 'GET',
        hostname: HOST,
        path: urlPath,
        port: 443,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return { status: r.status, body: r.body, json: tryJson(r.body) };
}

function tryJson(s) {
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function maskPII(rec) {
    if (typeof rec !== 'object' || !rec) return rec;
    const out = { ...rec };
    for (const k of Object.keys(out)) {
        if (/phone|address|email/i.test(k) && typeof out[k] === 'string') {
            out[k] = out[k].slice(0, 4) + '****' + out[k].slice(-2);
        }
    }
    return out;
}

async function main() {
    console.log('▶ Login TPOS');
    const token = await getToken();
    console.log('  ✓ token ok');
    fs.writeFileSync(path.join(OUT_DIR, 'tpos-token.txt'), token);

    // STEP 1: find orders for test customer
    console.log('\n▶ STEP 1: Find SaleOnline_Order rows for phone ' + TEST_PHONE);
    const search = encodeURIComponent(
        `contains(tolower(Telephone),'${TEST_PHONE.toLowerCase()}') or contains(tolower(Name),'${TEST_PHONE.toLowerCase()}')`
    );
    const r1 = await odataGet(
        token,
        `/odata/SaleOnline_Order?$filter=${search}&$top=5&$count=true`
    );
    console.log(`  HTTP ${r1.status}, count=${r1.json?.['@odata.count'] ?? '?'}`);
    if (r1.json?.value) {
        console.log(`  found ${r1.json.value.length} orders`);
        for (const o of r1.json.value.slice(0, 3)) {
            console.log(
                `    Id=${o.Id} Code=${o.Code} Name=${o.Name} Phone=${o.Telephone} Status=${o.StatusText} Total=${o.TotalAmount}`
            );
        }
        fs.writeFileSync(
            path.join(OUT_DIR, '01-saleonline-orders.json'),
            JSON.stringify(r1.json.value, null, 2)
        );
    }

    // STEP 2: Get one order in detail (full structure)
    if (r1.json?.value?.length) {
        const orderId = r1.json.value[0].Id;
        console.log('\n▶ STEP 2: Fetch SaleOnline_Order/' + orderId + ' detail');
        const r2 = await odataGet(
            token,
            `/odata/SaleOnline_Order(${orderId})?$expand=Details,Partner,Tags`
        );
        console.log(`  HTTP ${r2.status}`);
        if (r2.json) {
            const fieldList = Object.keys(r2.json).sort();
            console.log(`  fields (${fieldList.length}): ${fieldList.slice(0, 30).join(', ')}…`);
            fs.writeFileSync(
                path.join(OUT_DIR, '02-saleonline-order-detail.json'),
                JSON.stringify(r2.json, null, 2)
            );
        }
    }

    // STEP 3: Find existing PBH for test customer (FastSaleOrder)
    console.log('\n▶ STEP 3: Find FastSaleOrder rows (PBH) for phone ' + TEST_PHONE);
    const searchPbh = encodeURIComponent(
        `contains(tolower(Partner/Phone),'${TEST_PHONE.toLowerCase()}')`
    );
    const r3 = await odataGet(
        token,
        `/odata/FastSaleOrder?$filter=${searchPbh}&$top=3&$count=true&$expand=Partner`
    );
    console.log(`  HTTP ${r3.status}, count=${r3.json?.['@odata.count'] ?? '?'}`);
    if (r3.json?.value?.length) {
        for (const o of r3.json.value.slice(0, 3)) {
            console.log(
                `    Id=${o.Id} Number=${o.Number} PartnerName=${o.Partner?.Name} Total=${o.AmountTotal} State=${o.State}`
            );
        }
        fs.writeFileSync(
            path.join(OUT_DIR, '03-fastsaleorder-list.json'),
            JSON.stringify(r3.json.value, null, 2)
        );

        // STEP 4: Get one PBH in detail
        const pbhId = r3.json.value[0].Id;
        console.log('\n▶ STEP 4: Fetch FastSaleOrder/' + pbhId + ' detail');
        const r4 = await odataGet(
            token,
            `/odata/FastSaleOrder(${pbhId})?$expand=OrderLines,Partner,Tax,Carrier`
        );
        console.log(`  HTTP ${r4.status}`);
        if (r4.json) {
            const f = Object.keys(r4.json).sort();
            console.log(`  fields (${f.length}): ${f.slice(0, 30).join(', ')}…`);
            console.log(`  OrderLines count: ${r4.json.OrderLines?.length ?? 0}`);
            fs.writeFileSync(
                path.join(OUT_DIR, '04-fastsaleorder-detail.json'),
                JSON.stringify(r4.json, null, 2)
            );
        }
    }

    // STEP 5: Inspect default templates for "Tạo nhanh PBH"
    // TPOS often has /odata/FastSaleOrder/ODataService.GetDefault or similar
    console.log('\n▶ STEP 5: Probe default-getter endpoints');
    const probes = [
        '/odata/FastSaleOrder/ODataService.GetDefault',
        '/odata/SaleOnline_Order/ODataService.ConvertToInvoice',
        '/rest/v1.0/saleonlineorder/getsaleonlineorder',
        '/odata/SaleOnline_Order/ODataService.GetView',
    ];
    const probeResults = {};
    for (const p of probes) {
        const r = await odataGet(token, p);
        console.log(`  ${r.status} ${p}`);
        probeResults[p] = { status: r.status, sample: r.body.slice(0, 200) };
    }
    fs.writeFileSync(
        path.join(OUT_DIR, '05-probe-results.json'),
        JSON.stringify(probeResults, null, 2)
    );

    console.log('\n✓ DONE — output in ' + OUT_DIR);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
