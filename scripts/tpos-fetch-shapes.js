// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Fetch sample TPOS records để xem field names + types thực, dùng để build
 * mapper config trong web2-seed-from-tpos.js.
 *
 * Output ra stdout: cho mỗi entity, in tổng số records + 1 sample record
 * với mask PII cơ bản (Phone, Address, Email partly masked).
 */
const https = require('https');
const querystring = require('querystring');

const TPOS_HOST = 'tomato.tpos.vn';
const CREDS = {
    grant_type: 'password',
    username: 'nvktlive1',
    password: 'Aa@28612345678',
    client_id: 'tmtWebApp',
};

function httpReq(opts, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
                resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
            );
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getToken() {
    const body = querystring.stringify(CREDS);
    const r = await httpReq(
        {
            method: 'POST',
            hostname: TPOS_HOST,
            path: '/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        },
        body
    );
    if (r.status !== 200) throw new Error(`token ${r.status}`);
    return JSON.parse(r.body).access_token;
}

async function tposGet(token, urlPath) {
    const r = await httpReq({
        method: 'GET',
        hostname: TPOS_HOST,
        path: urlPath,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return { status: r.status, body: r.body, json: tryJson(r.body) };
}

function tryJson(s) {
    try {
        return JSON.parse(s);
    } catch (_) {
        return null;
    }
}

function maskPII(v, k) {
    if (typeof v !== 'string') return v;
    const lk = k.toLowerCase();
    if (/phone|mobile|fax|telephone/.test(lk)) return v.replace(/\d/g, '*');
    if (/(name|address|email|street|city)/.test(lk) && v.length > 6)
        return v.slice(0, 3) + '***' + v.slice(-2);
    return v;
}

function summarize(record, depth = 0) {
    if (record == null) return null;
    if (Array.isArray(record)) return record.length === 0 ? '[]' : `[${record.length}]`;
    if (typeof record !== 'object') return record;
    const out = {};
    for (const [k, v] of Object.entries(record)) {
        if (k.startsWith('@odata')) continue;
        if (Array.isArray(v)) {
            out[k] =
                v.length === 0
                    ? '[]'
                    : `[array len=${v.length}, first=${
                          typeof v[0] === 'object'
                              ? Object.keys(v[0] || {})
                                    .slice(0, 5)
                                    .join(',') + '...'
                              : v[0]
                      }]`;
        } else if (typeof v === 'object' && v !== null && depth < 1) {
            out[k] = `{obj: ${Object.keys(v).slice(0, 6).join(',')}...}`;
        } else {
            out[k] = maskPII(v, k);
        }
    }
    return out;
}

const TARGETS = [
    {
        name: 'ProductTemplate',
        listPath:
            '/odata/ProductTemplate/ODataService.GetViewV2?%24top=1&%24orderby=DateCreated%20desc&%24count=true',
    },
    {
        name: 'Product (variant)',
        listPath:
            '/odata/Product/ODataService.GetViewV2?%24top=1&Active=true&%24orderby=DateCreated%20desc&%24count=true',
    },
    {
        name: 'FastSaleOrder',
        listPath:
            '/odata/FastSaleOrder/ODataService.GetView?%24top=1&%24orderby=DateInvoice%20desc&%24count=true',
    },
    {
        name: 'FastPurchaseOrder',
        listPath:
            '/odata/FastPurchaseOrder/OdataService.GetView?%24top=1&%24orderby=DateInvoice%20desc&%24count=true',
    },
    {
        name: 'SaleOnline_Order',
        listPath:
            '/odata/SaleOnline_Order/ODataService.GetView?%24top=1&%24orderby=DateCreated%20desc&%24count=true',
    },
    {
        name: 'AccountJournal',
        listPath: '/odata/AccountJournal?%24top=1',
    },
    {
        name: 'AccountTax',
        listPath: '/odata/AccountTax?%24top=1',
    },
    {
        name: 'StockWarehouse',
        listPath: '/odata/StockWarehouse?%24top=1',
    },
    {
        name: 'CRMTeam',
        listPath: '/odata/CRMTeam/ODataService.GetAllFacebook?%24expand=Childs',
    },
    {
        name: 'SaleOnline_LiveCampaign',
        listPath:
            '/odata/SaleOnline_LiveCampaign/ODataService.GetAvailables?%24top=1&%24orderby=DateCreated%20desc',
    },
];

(async () => {
    const token = await getToken();
    console.log('Token OK\n');
    for (const t of TARGETS) {
        const r = await tposGet(token, t.listPath);
        if (r.status !== 200 || !r.json) {
            console.log(`### ${t.name}: HTTP ${r.status} — ${r.body.slice(0, 150)}\n`);
            continue;
        }
        const data = r.json;
        const sample = Array.isArray(data)
            ? data[0]
            : data.value && data.value[0]
              ? data.value[0]
              : data;
        const total = data && data['@odata.count'] != null ? data['@odata.count'] : '?';
        const fieldCount = sample && typeof sample === 'object' ? Object.keys(sample).length : 0;
        console.log(`### ${t.name}  total=${total}  fields=${fieldCount}`);
        console.log(JSON.stringify(summarize(sample), null, 2).slice(0, 2500));
        console.log('---\n');
        await new Promise((r) => setTimeout(r, 300));
    }
})().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
