// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Test Suite: v2 OData TPOS Shadow Router
 *
 * Strategy: spin up Express server with the router mounted + mocked DB pool,
 * hit each endpoint with HTTP, validate JSON shape khớp với chuẩn OData.
 *
 * Usage:  node scripts/test-v2-odata-shadow.js
 * Exit 0 if all green, 1 if any fail.
 */

const express = require('express');
const http = require('http');

const router = require('../render.com/routes/v2/odata-tpos-shadow');

// ── Mock chatDb pool ───────────────────────────────────────────
const FAKE_CUSTOMERS = [
    {
        id: 1,
        tpos_id: 570444,
        name: 'Mi Tết',
        display_name: 'Mi Tết',
        name_no_sign: 'Mi Tet',
        phone: '0912345678',
        email: null,
        address: '123 ABC',
        is_company: false,
        is_supplier: false,
        active: true,
        status: 'Undefined',
        status_text: 'Bom hàng',
        source: 'Facebook',
        source_ref: '270136663390370',
        facebook_as_ids: '26693795580251552',
        facebook_id: null,
        zalo_user_id: null,
        zalo_user_name: null,
        birth_day: null,
        tax_code: null,
        id_card_number: null,
        credit: 0,
        debit: 0,
        loyalty_points: null,
        discount: 0,
        comment: null,
        image_url: null,
        city_name: 'TP HCM',
        district_name: 'Quận 1',
        ward_name: null,
        ref: null,
        tags: null,
        created_at: '2026-05-07T13:16:32.313Z',
        updated_at: '2026-05-07T13:16:32.313Z',
    },
    {
        id: 2,
        tpos_id: 570445,
        name: 'Khách Test',
        display_name: 'Khách Test',
        phone: '0900000001',
        active: true,
        is_supplier: false,
        created_at: '2026-05-06T10:00:00Z',
    },
    {
        id: 3,
        tpos_id: 570329,
        name: 'NCC ABC',
        display_name: 'NCC ABC',
        phone: '0987654321',
        active: true,
        is_supplier: true,
        created_at: '2026-05-01T10:00:00Z',
    },
];

const fakeDb = {
    async query(sql, params = []) {
        const s = sql.toString();

        if (/SELECT COUNT\(\*\)/i.test(s)) {
            const rows = filterCustomers(s, params);
            return { rows: [{ n: rows.length }] };
        }
        if (/FROM customers/i.test(s)) {
            const rows = filterCustomers(s, params);
            return { rows };
        }
        return { rows: [] };
    },
};

function filterCustomers(sql, params) {
    let rows = FAKE_CUSTOMERS.slice();
    if (/is_supplier.*=\s*true/i.test(sql)) {
        rows = rows.filter((r) => r.is_supplier === true);
    } else if (/is_supplier.*=\s*false/i.test(sql)) {
        rows = rows.filter((r) => r.is_supplier !== true);
    }
    if (/phone ILIKE/i.test(sql) && params[0]) {
        const phone = String(params[0]).replace(/%/g, '');
        rows = rows.filter((r) => (r.phone || '').includes(phone));
    }
    if (/WHERE id\s*=\s*\$1\s*OR\s*tpos_id\s*=\s*\$1/i.test(sql)) {
        rows = rows.filter((r) => r.id === params[0] || r.tpos_id === params[0]);
    }
    // LIMIT/OFFSET handled inline via SQL constants in the route — emulate:
    const limMatch = sql.match(/LIMIT\s+(\d+)/i);
    const offMatch = sql.match(/OFFSET\s+(\d+)/i);
    if (offMatch) rows = rows.slice(parseInt(offMatch[1], 10));
    if (limMatch) rows = rows.slice(0, parseInt(limMatch[1], 10));
    return rows;
}

// ── Test harness ───────────────────────────────────────────────
function makeApp() {
    const app = express();
    app.locals.chatDb = fakeDb;
    app.use(express.json());
    app.use('/api/v2/odata', router);
    return app;
}

function httpGet(port, path) {
    return new Promise((resolve, reject) => {
        http.get(
            {
                host: '127.0.0.1',
                port,
                path,
                headers: { 'x-base-url': `http://127.0.0.1:${port}` },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf8');
                    let json = null;
                    try {
                        json = JSON.parse(body);
                    } catch (_) {}
                    resolve({ status: res.statusCode, body, json });
                });
            }
        ).on('error', reject);
    });
}

const tests = [];
function t(name, fn) {
    tests.push({ name, fn });
}

// ── Test cases ────────────────────────────────────────────────

t('GET /_health → ok=true', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/_health');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!r.json || r.json.ok !== true) throw new Error('ok missing');
    if (!Array.isArray(r.json.seededEntities)) throw new Error('seededEntities not array');
});

t('GET /POSCategory → OData collection shape', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/POSCategory');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (!r.json['@odata.context']) throw new Error('missing @odata.context');
    if (!Array.isArray(r.json.value)) throw new Error('value not array');
    if (r.json.value.length < 1) throw new Error('value empty');
    const row = r.json.value[0];
    if (typeof row.Id !== 'number') throw new Error('row.Id not number');
    if (typeof row.Name !== 'string') throw new Error('row.Name not string');
});

t('GET /ProductCategory → 4 rows + correct fields', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/ProductCategory');
    if (r.json.value.length !== 4) throw new Error(`expected 4, got ${r.json.value.length}`);
    for (const row of r.json.value) {
        if (typeof row.Id !== 'number') throw new Error(`Id not number: ${JSON.stringify(row)}`);
        if (!row.CompleteName) throw new Error('CompleteName missing');
    }
});

t('GET /ProductUOM → 4 UoM rows', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/ProductUOM');
    if (r.json.value.length !== 4) throw new Error(`expected 4, got ${r.json.value.length}`);
});

t('GET /Tag with $filter=Type eq sale → fewer rows', async ({ port }) => {
    const allR = await httpGet(port, '/api/v2/odata/Tag');
    const filteredR = await httpGet(
        port,
        '/api/v2/odata/Tag?$filter=' + encodeURIComponent("Type eq 'saleonline'")
    );
    if (filteredR.json.value.length >= allR.json.value.length) {
        throw new Error('filter did not reduce');
    }
    for (const r of filteredR.json.value) {
        if (r.Type !== 'saleonline') throw new Error(`bad Type ${r.Type}`);
    }
});

t('GET /POSCategory?$top=1 → 1 row', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/POSCategory?$top=1');
    if (r.json.value.length !== 1) throw new Error(`got ${r.json.value.length}`);
});

t('GET /Tag?$count=true → @odata.count present', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Tag?$count=true');
    if (typeof r.json['@odata.count'] !== 'number') throw new Error('count missing');
    if (r.json['@odata.count'] < 1) throw new Error('count must be >0');
});

t('GET /ProductUOM?$select=Id,Name → only 2 fields', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/ProductUOM?$select=Id,Name');
    const row = r.json.value[0];
    const keys = Object.keys(row);
    if (!keys.includes('Id') || !keys.includes('Name')) throw new Error('missing Id/Name');
    if (keys.includes('CategoryId') || keys.includes('Factor')) {
        throw new Error('extra fields not pruned: ' + keys.join(','));
    }
});

t(
    'GET /Partner/ODataService.GetViewV2?Type=Customer&$top=10 → only customers',
    async ({ port }) => {
        const r = await httpGet(
            port,
            '/api/v2/odata/Partner/ODataService.GetViewV2?Type=Customer&$top=10&$count=true'
        );
        if (r.status !== 200) throw new Error(`status ${r.status}: ${r.body}`);
        if (!r.json['@odata.context']) throw new Error('missing context');
        if (typeof r.json['@odata.count'] !== 'number') throw new Error('missing count');
        for (const p of r.json.value) {
            if (p.Customer !== true) throw new Error(`p.Customer must be true: ${p.Id}`);
            if (p.Supplier !== false) throw new Error(`p.Supplier must be false: ${p.Id}`);
        }
    }
);

t(
    'GET /Partner/ODataService.GetViewV2?Type=Supplier → Customer=false Supplier=true',
    async ({ port }) => {
        const r = await httpGet(
            port,
            '/api/v2/odata/Partner/ODataService.GetViewV2?Type=Supplier&$top=10&$count=true'
        );
        if (r.status !== 200) throw new Error(`status ${r.status}`);
        if (r.json.value.length === 0) throw new Error('expected at least 1 supplier');
        for (const p of r.json.value) {
            if (p.Supplier !== true) throw new Error(`p.Supplier must be true (got ${p.Supplier})`);
            if (p.Customer !== false)
                throw new Error(`p.Customer must be false (got ${p.Customer})`);
        }
    }
);

t('GET /Partner(570444) → single record with @odata.context/$entity', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Partner(570444)');
    if (r.status !== 200) throw new Error(`status ${r.status}: ${r.body}`);
    if (!r.json['@odata.context']) throw new Error('missing context');
    if (!r.json['@odata.context'].endsWith('/$entity')) throw new Error('missing /$entity suffix');
    if (r.json.Id !== 570444) throw new Error(`Id wrong: ${r.json.Id}`);
    if (r.json.DisplayName !== 'Mi Tết')
        throw new Error(`DisplayName wrong: ${r.json.DisplayName}`);
});

t('GET /Partner(99999999) → 404 NotFound', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Partner(99999999)');
    if (r.status !== 404) throw new Error(`expected 404, got ${r.status}`);
});

t('GET /Partner(notanumber) → 400 BadRequest', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Partner(abc)');
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
});

t('GET /POSCategory?$top=0 → empty value array', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/POSCategory?$top=0');
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.json.value.length !== 0) throw new Error(`expected 0 rows, got ${r.json.value.length}`);
    if (!r.json['@odata.context']) throw new Error('context still required');
});

t('GET /Tag?$skip=2 → skips first 2', async ({ port }) => {
    const allR = await httpGet(port, '/api/v2/odata/Tag');
    const skipR = await httpGet(port, '/api/v2/odata/Tag?$skip=2');
    if (skipR.json.value.length !== allR.json.value.length - 2) {
        throw new Error(`expected ${allR.json.value.length - 2}, got ${skipR.json.value.length}`);
    }
});

t('GET /Tag?$count=true&$top=2 → @odata.count = total, value = 2', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Tag?$count=true&$top=2');
    if (r.json.value.length !== 2) throw new Error(`top=2 not applied`);
    if (r.json['@odata.count'] < 2) throw new Error('count must be total, not paged');
});

t('Partner shape — every required TPOS field present', async ({ port }) => {
    const r = await httpGet(port, '/api/v2/odata/Partner(570444)');
    const REQUIRED = [
        'Id',
        'Name',
        'DisplayName',
        'Phone',
        'Active',
        'Customer',
        'Supplier',
        'Type',
        'Status',
        'Source',
        'Credit',
        'Debit',
        'DateCreated',
        'CityName',
        'DistrictName',
        'WardName',
        'TaxCode',
        'IdCardNumber',
    ];
    for (const f of REQUIRED) {
        if (!(f in r.json)) throw new Error(`missing field ${f}`);
    }
});

t('Without DB → returns 503', async () => {
    // Fresh app with no chatDb
    const app2 = express();
    app2.locals.chatDb = null;
    app2.use('/api/v2/odata', router);
    const srv = http.createServer(app2);
    await new Promise((resolve) => srv.listen(0, resolve));
    const port2 = srv.address().port;
    const r = await httpGet(port2, '/api/v2/odata/Partner/ODataService.GetViewV2?Type=Customer');
    srv.close();
    if (r.status !== 503) throw new Error(`expected 503, got ${r.status}`);
});

// ── Runner ────────────────────────────────────────────────────
(async () => {
    const app = makeApp();
    const srv = http.createServer(app);
    await new Promise((resolve) => srv.listen(0, resolve));
    const port = srv.address().port;
    console.log(`[test] server listening on ${port}`);

    let pass = 0,
        fail = 0;
    for (const test of tests) {
        try {
            await test.fn({ port });
            console.log(`  ✅ ${test.name}`);
            pass++;
        } catch (e) {
            console.log(`  ❌ ${test.name}\n     ${e.message}`);
            fail++;
        }
    }
    srv.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
    console.error('FATAL', e);
    process.exit(2);
});
