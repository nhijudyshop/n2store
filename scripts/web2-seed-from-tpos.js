// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Seed Web 2.0 (web2_records) từ TPOS production thông qua REST.
 *
 * Pipeline cho mỗi entity:
 *   1. POST /token để lấy bearer
 *   2. GET TPOS endpoint với pagination ($top + $skip), thu tất cả records
 *   3. Map mỗi record → { code, name, isActive, data } theo schema web2_records
 *   4. POST /api/web2/<slug>/create cho từng record (idempotent: skip nếu code đã tồn tại)
 *   5. Report success/skip/error counts
 *
 * Idempotent — chạy lại an toàn (đã được skip duplicate).
 *
 * Iter 1 chỉ seed các entity REFERENCE DATA NHỎ:
 *   tag, productcategory, productuom, deliverycarrier, rescurrency,
 *   accountaccount-thu, accountaccount-chi, productattribute
 * Iter sau (chunked) sẽ làm Partner (91k), ProductTemplate (3k),
 * FastSaleOrder (11k) — those need direct DB.
 *
 * Usage:
 *   node scripts/web2-seed-from-tpos.js                       — seed all configured entities
 *   node scripts/web2-seed-from-tpos.js --only tag,productuom — chỉ seed entity nhất định
 *   node scripts/web2-seed-from-tpos.js --dry-run             — fetch & map mà không POST
 *   node scripts/web2-seed-from-tpos.js --base http://localhost:10000 — local Render
 */
const https = require('https');
const http = require('http');
const querystring = require('querystring');

// ── Args ───────────────────────────────────────────────────────
const ARGS = (() => {
    const out = {
        only: null,
        dryRun: false,
        base: 'https://n2store-fallback.onrender.com',
    };
    for (let i = 2; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a === '--only') out.only = (process.argv[++i] || '').split(',').filter(Boolean);
        else if (a === '--dry-run') out.dryRun = true;
        else if (a === '--base') out.base = process.argv[++i];
    }
    return out;
})();

const TPOS_HOST = 'tomato.tpos.vn';
const CREDS = {
    grant_type: 'password',
    username: 'nvktlive1',
    password: 'Aa@28612345678',
    client_id: 'tmtWebApp',
};

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ── HTTP helpers ───────────────────────────────────────────────
function httpRequest(opts, body) {
    return new Promise((resolve, reject) => {
        const lib = opts.protocol === 'http:' ? http : https;
        const req = lib.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                })
            );
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getTposToken() {
    const body = querystring.stringify(CREDS);
    const r = await httpRequest(
        {
            protocol: 'https:',
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
    if (r.status !== 200) throw new Error(`TPOS token: ${r.status} ${r.body}`);
    return JSON.parse(r.body).access_token;
}

async function tposGet(token, urlPath) {
    const r = await httpRequest({
        protocol: 'https:',
        method: 'GET',
        hostname: TPOS_HOST,
        path: urlPath,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
    });
    if (r.status !== 200)
        throw new Error(`TPOS GET ${urlPath}: ${r.status} ${r.body.slice(0, 200)}`);
    return JSON.parse(r.body);
}

async function fetchAllPaged(token, basePath, pageSize = 200) {
    const all = [];
    let skip = 0;
    while (true) {
        const sep = basePath.includes('?') ? '&' : '?';
        const url = `${basePath}${sep}%24top=${pageSize}&%24skip=${skip}`;
        const data = await tposGet(token, url);
        const value = Array.isArray(data) ? data : data.value || [];
        all.push(...value);
        if (value.length < pageSize) break;
        skip += pageSize;
        if (skip > 500000) {
            log(`  ⚠ stopping at skip=${skip} for safety (cap raised to 500k)`);
            break;
        }
    }
    return all;
}

async function tposGetAll(token, basePath) {
    // Try non-paged first (small ref data); fallback to paged.
    const data = await tposGet(token, basePath);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.value)) {
        // If TPOS returned full set in one go, use it; otherwise page.
        if (typeof data['@odata.count'] !== 'number' || data.value.length >= data['@odata.count']) {
            return data.value;
        }
        // Need pagination
        return fetchAllPaged(token, basePath);
    }
    return [];
}

function postWeb2(base, slug, payload) {
    const url = new URL(`${base}/api/web2/${encodeURIComponent(slug)}/create`);
    return httpRequest(
        {
            protocol: url.protocol,
            method: 'POST',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        },
        JSON.stringify(payload)
    );
}

// Bulk-create endpoint: POSTs {records:[...]} in chunks of <=BULK_CHUNK records.
const BULK_CHUNK = 500;
async function bulkInsert(base, slug, records) {
    const url = new URL(`${base}/api/web2/${encodeURIComponent(slug)}/bulk-create`);
    let inserted = 0,
        skipped = 0,
        errors = 0;
    for (let i = 0; i < records.length; i += BULK_CHUNK) {
        const chunk = records.slice(i, i + BULK_CHUNK);
        try {
            const resp = await httpRequest(
                {
                    protocol: url.protocol,
                    method: 'POST',
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                },
                JSON.stringify({ records: chunk })
            );
            if (resp.status >= 200 && resp.status < 300) {
                const j = JSON.parse(resp.body);
                inserted += j.inserted || 0;
                skipped += j.skipped || 0;
                log(
                    `    bulk chunk ${i}-${i + chunk.length - 1}: inserted=${j.inserted} skipped=${j.skipped}`
                );
            } else {
                errors += chunk.length;
                log(`    ❌ bulk chunk ${i}: HTTP ${resp.status} ${resp.body.slice(0, 200)}`);
            }
        } catch (e) {
            errors += chunk.length;
            log(`    ❌ bulk chunk ${i}: ${e.message}`);
        }
    }
    return { inserted, skipped, errors };
}

// ── Entity configurations ──────────────────────────────────────
function pickFields(obj, keys) {
    const out = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
}

const ENTITIES = [
    {
        slug: 'tag',
        tposPath: '/odata/Tag',
        topLimit: 500,
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || `Tag ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, ['Id', 'Type', 'Name', 'Color', 'Active', 'CompanyId']),
        }),
    },
    {
        slug: 'productcategory',
        tposPath: '/odata/ProductCategory',
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || r.CompleteName || `Category ${r.Id}`,
            isActive: true,
            data: pickFields(r, ['Id', 'Name', 'CompleteName', 'ParentId', 'Sequence', 'Type']),
        }),
    },
    {
        slug: 'productuom',
        tposPath: '/odata/ProductUOM',
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || `UoM ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, [
                'Id',
                'Name',
                'CategoryId',
                'Factor',
                'FactorInv',
                'UOMType',
                'Active',
                'Rounding',
            ]),
        }),
    },
    {
        slug: 'deliverycarrier',
        tposPath: '/odata/DeliveryCarrier?%24filter=Active%20eq%20true',
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || `Carrier ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, [
                'Id',
                'Name',
                'SenderName',
                'SenderPhone',
                'DeliveryType',
                'DeliveryTypeGet',
                'Active',
                'CompanyId',
                'Amount',
                'FixedPrice',
            ]),
        }),
    },
    {
        slug: 'rescurrency',
        tposPath: '/odata/ResCurrency?%24select=Id,Name,Symbol',
        mapper: (r) => ({
            code: r.Name || `tpos-${r.Id}`, // VND, USD — natural code
            name: r.Name || `Currency ${r.Id}`,
            isActive: true,
            data: pickFields(r, ['Id', 'Name', 'Symbol']),
        }),
    },
    {
        slug: 'productattribute',
        tposPath: '/odata/ProductAttribute',
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || `Attr ${r.Id}`,
            isActive: true,
            data: pickFields(r, [
                'Id',
                'Name',
                'Sequence',
                'CreateVariant',
                'AttributeType',
                'CompanyId',
            ]),
        }),
    },
    {
        slug: 'productattributevalue',
        tposPath: '/odata/ProductAttributeValue?%24orderby=AttributeId,Sequence',
        topLimit: 1000,
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.Name || `Value ${r.Id}`,
            isActive: true,
            data: pickFields(r, [
                'Id',
                'Name',
                'AttributeId',
                'AttributeName',
                'Sequence',
                'NameGet',
            ]),
        }),
    },
    {
        slug: 'partner-customer',
        // Partner GetViewV2 with Type=Customer; max 200 per page (TPOS limit)
        tposPath:
            '/odata/Partner/ODataService.GetViewV2?Type=Customer&Active=true&%24orderby=DateCreated+desc',
        bulk: true,
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.DisplayName || r.Name || `Customer ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, [
                'Id',
                'Name',
                'DisplayName',
                'NameNoSign',
                'Phone',
                'Email',
                'Street',
                'CityName',
                'CityCode',
                'DistrictName',
                'DistrictCode',
                'WardName',
                'WardCode',
                'TaxCode',
                'IdCardNumber',
                'BirthDay',
                'Customer',
                'Supplier',
                'IsCompany',
                'CompanyType',
                'Type',
                'Status',
                'StatusText',
                'Source',
                'SourceRef',
                'Facebook',
                'FacebookId',
                'FacebookASIds',
                'Zalo',
                'ZaloUserId',
                'ZaloUserName',
                'Credit',
                'Debit',
                'LoyaltyPoints',
                'Discount',
                'Comment',
                'ImageUrl',
                'Tags',
                'DateCreated',
                'LastUpdated',
            ]),
        }),
    },
    {
        slug: 'partner-supplier',
        tposPath:
            '/odata/Partner/ODataService.GetViewV2?Type=Supplier&Active=true&%24orderby=DateCreated+desc',
        bulk: true,
        mapper: (r) => ({
            code: `tpos-${r.Id}`,
            name: r.DisplayName || r.Name || `Supplier ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, [
                'Id',
                'Name',
                'DisplayName',
                'NameNoSign',
                'Phone',
                'Email',
                'Street',
                'CityName',
                'DistrictName',
                'WardName',
                'TaxCode',
                'Customer',
                'Supplier',
                'IsCompany',
                'CompanyType',
                'Type',
                'Credit',
                'Debit',
                'Comment',
                'ImageUrl',
                'Tags',
                'DateCreated',
            ]),
        }),
    },
    {
        slug: 'accountjournal',
        tposPath: '/odata/AccountJournal',
        mapper: (r) => ({
            code: r.Code || `tpos-${r.Id}`,
            name: r.Name || `Journal ${r.Id}`,
            isActive: r.Active !== false,
            data: pickFields(r, [
                'Id',
                'Name',
                'Code',
                'Type',
                'TypeName',
                'Active',
                'CompanyId',
                'CurrencyId',
                'CurrencyName',
            ]),
        }),
    },
];

// ── Main ────────────────────────────────────────────────────────
(async () => {
    log('Get TPOS bearer…');
    const token = await getTposToken();
    log('  ✅ token OK');

    const targets = ARGS.only ? ENTITIES.filter((e) => ARGS.only.includes(e.slug)) : ENTITIES;
    log(
        `Seeding ${targets.length} entities to base=${ARGS.base}${ARGS.dryRun ? ' (DRY RUN)' : ''}`
    );

    const summary = [];

    for (const ent of targets) {
        log(`\n=== ${ent.slug} ===`);
        let tposRows;
        try {
            tposRows = await tposGetAll(token, ent.tposPath);
        } catch (e) {
            log(`  ❌ TPOS fetch error: ${e.message}`);
            summary.push({ slug: ent.slug, fetched: 0, created: 0, skipped: 0, errors: 1 });
            continue;
        }
        log(`  fetched ${tposRows.length} rows from TPOS`);

        if (ARGS.dryRun) {
            log(`  sample mapped:`);
            console.log('  ', JSON.stringify(ent.mapper(tposRows[0]), null, 2).slice(0, 400));
            summary.push({
                slug: ent.slug,
                fetched: tposRows.length,
                created: 0,
                skipped: 0,
                errors: 0,
            });
            continue;
        }

        const records = tposRows.map((r) => ent.mapper(r)).filter((p) => p && p.name);
        const useBulk = records.length >= 50 || ent.bulk === true;
        let created, skipped, errors;
        if (useBulk) {
            log(`  using bulk-create (${records.length} records, chunks of ${BULK_CHUNK})`);
            const bulkResult = await bulkInsert(ARGS.base, ent.slug, records);
            created = bulkResult.inserted;
            skipped = bulkResult.skipped;
            errors = bulkResult.errors;
        } else {
            created = 0;
            skipped = 0;
            errors = 0;
            for (const payload of records) {
                try {
                    const resp = await postWeb2(ARGS.base, ent.slug, payload);
                    if (resp.status >= 200 && resp.status < 300) {
                        created++;
                    } else if (resp.status === 409 || /already|duplicate/i.test(resp.body)) {
                        skipped++;
                    } else {
                        errors++;
                        if (errors <= 3)
                            log(
                                `  ❌ ${payload.code}: HTTP ${resp.status} ${resp.body.slice(0, 120)}`
                            );
                    }
                } catch (e) {
                    errors++;
                    if (errors <= 3) log(`  ❌ ${payload.code}: ${e.message}`);
                }
            }
        }
        log(`  ✅ created=${created} skipped=${skipped} errors=${errors}`);
        summary.push({ slug: ent.slug, fetched: tposRows.length, created, skipped, errors });
    }

    log('\n========== SUMMARY ==========');
    console.log(
        '  ' +
            ['slug', 'fetched', 'created', 'skipped', 'errors'].map((c) => c.padEnd(20)).join('') +
            '\n  ' +
            '─'.repeat(100)
    );
    for (const s of summary) {
        console.log(
            '  ' +
                [s.slug, s.fetched, s.created, s.skipped, s.errors]
                    .map((v) => String(v).padEnd(20))
                    .join('')
        );
    }
})();
