#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Fix duplicate stock moves for PO BILL/2026/1805 (TPOS PO 55687).
 *
 * Background — see docs/dev-log.md 2026-05-12:
 *   PO 55687 sinh 103 lines nhưng TPOS tạo 206 stock moves (2 batch tại
 *   12:49:33 và 12:50:32, gấp đôi mọi qty). Code-side fix đã merge để tránh
 *   tái diễn. Script này clean up dữ liệu đã sai.
 *
 * TPOS adjust flow (captured 2026-05-12 từ Chrome DevTools, B2171 manual fix):
 *   Step 1: POST /odata/StockChangeProductQty/ODataService.PostChangeQtyProduct
 *           Body: {model:[{Id:0, ProductId, ProductTmplId, NewQuantity,
 *                         LocationId:12, ProductTmpl:{...}, Product:{...},
 *                         Location:{...}, ...}]}
 *           Returns: array of StockChangeProductQty entities (Id is what we need)
 *   Step 2: POST /odata/StockChangeProductQty/ODataService.ChangeProductQtyIds
 *           Body: {ids:[<id from step 1>]}
 *           Returns: success → TPOS creates StockInventory + StockMove for adjustment
 *
 * Công thức:
 *   new_qty = current_TPOS_qty - excess_qty
 *   excess_qty = (số batch duplicate - 1) × n2store_ordered_qty
 *              = n2store_ordered_qty (vì có đúng 1 batch thừa)
 *
 * Usage:
 *   node scripts/fix-po-55687-duplicates.js                         # dry-run mặc định
 *   node scripts/fix-po-55687-duplicates.js --apply --only B2172    # apply 1 SP test
 *   node scripts/fix-po-55687-duplicates.js --apply --limit 5       # apply 5 SP đầu
 *   node scripts/fix-po-55687-duplicates.js --apply                 # apply tất cả
 *
 * Read creds from serect_dont_push.txt (gitignored).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const TPOS_HOST = 'tomato.tpos.vn';
const PO_ORIGIN = 'BILL/2026/1805';
const LOCATION_ID = 12; // "Dự trữ" — location TPOS UI dùng để adjust

// Location object đầy đủ (capture từ DevTools — required field trong step 1 payload)
const LOCATION_OBJ = {
    Id: 12,
    Usage: 'internal',
    ScrapLocation: false,
    Name: 'Dự trữ',
    CompleteName: 'Địa điểm vật lý / WH / Dự trữ',
    ParentLocationId: null,
    Active: true,
    ParentLeft: null,
    CompanyId: null,
    CompanyName: null,
    ShowUsage: 'Địa điểm nội bộ',
    NameGet: 'WH/Dự trữ',
    NameWarehouse: null,
};

function readSecrets() {
    const secPath = path.join(__dirname, '..', 'serect_dont_push.txt');
    const txt = fs.readFileSync(secPath, 'utf8');
    const m = {};
    for (const line of txt.split('\n')) {
        const match = line.match(/^\d+\/([A-Z_]+):\s*(.+)$/);
        if (match) m[match[1]] = match[2].trim();
    }
    if (!m.TPOS_USERNAME || !m.TPOS_PASSWORD || !m.TPOS_CLIENT_ID) {
        throw new Error(
            'Missing TPOS_USERNAME/TPOS_PASSWORD/TPOS_CLIENT_ID in serect_dont_push.txt'
        );
    }
    return m;
}

function httpReq(opts, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(opts, (res) => {
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
    const c = readSecrets();
    const body = querystring.stringify({
        grant_type: 'password',
        username: c.TPOS_USERNAME,
        password: c.TPOS_PASSWORD,
        client_id: c.TPOS_CLIENT_ID,
    });
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
    if (r.status !== 200) throw new Error(`token error ${r.status}: ${r.body.slice(0, 200)}`);
    return JSON.parse(r.body).access_token;
}

async function tposApi(token, method, urlPath, body) {
    const bodyStr = body ? JSON.stringify(body) : null;
    return httpReq(
        {
            method,
            hostname: TPOS_HOST,
            path: urlPath,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json;charset=UTF-8',
                Accept: 'application/json, text/plain, */*',
                'feature-version': '2',
                tposappversion: '6.5.11.2',
                'x-tpos-lang': 'vi',
                Referer: 'https://tomato.tpos.vn/',
                ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
            },
        },
        bodyStr
    );
}

async function listDuplicateMoves(token) {
    // Identify moves where same Origin + same ProductId has ≥2 entries.
    const path =
        '/odata/StockMove?' +
        querystring.stringify({
            $filter: `Origin eq '${PO_ORIGIN}'`,
            $top: 500,
            $orderby: 'Id asc',
        });
    const r = await tposApi(token, 'GET', path);
    if (r.status !== 200) throw new Error(`StockMove list ${r.status}: ${r.body.slice(0, 200)}`);
    const moves = JSON.parse(r.body).value || [];

    const byProd = new Map();
    for (const m of moves) {
        const k = m.ProductId;
        if (!byProd.has(k))
            byProd.set(k, {
                productId: k,
                name: m.Name,
                qty: m.ProductUOMQty,
                moveIds: [],
            });
        byProd.get(k).moveIds.push(m.Id);
    }
    const dup = [];
    for (const e of byProd.values()) {
        if (e.moveIds.length >= 2) {
            const codeMatch = e.name && e.name.match(/^\[([^\]]+)\]/);
            dup.push({
                code: codeMatch ? codeMatch[1] : '?',
                productId: e.productId,
                lineQty: e.qty,
                excess: e.qty * (e.moveIds.length - 1),
                moveIds: e.moveIds,
            });
        }
    }
    return dup;
}

async function fetchProductPair(token, productId) {
    // Fetch full Product + parent ProductTemplate. TPOS adjust API needs both.
    const pRes = await tposApi(token, 'GET', `/odata/Product?$filter=Id+eq+${productId}`);
    if (pRes.status !== 200) throw new Error(`fetch Product(${productId}) → ${pRes.status}`);
    const product = JSON.parse(pRes.body).value?.[0];
    if (!product) throw new Error(`Product ${productId} not found`);

    const tmplId = product.ProductTmplId;
    const tRes = await tposApi(token, 'GET', `/odata/ProductTemplate?$filter=Id+eq+${tmplId}`);
    if (tRes.status !== 200) throw new Error(`fetch ProductTemplate(${tmplId}) → ${tRes.status}`);
    const template = JSON.parse(tRes.body).value?.[0];
    if (!template) throw new Error(`Template ${tmplId} not found`);

    return { product, template };
}

function buildAdjustPayload({ product, template, newQuantity }) {
    return {
        model: [
            {
                Id: 0,
                ProductId: product.Id,
                ProductTmplId: template.Id,
                LotId: null,
                NewQuantity: newQuantity,
                LocationId: LOCATION_ID,
                WarehouseId: null,
                CompanyId: null,
                ProductVariantCount: template.ProductVariantCount || 1,
                ProductTmpl: template,
                Product: product,
                Location: LOCATION_OBJ,
            },
        ],
    };
}

async function getCurrentQty(token, productId) {
    // Use entity-by-id form (filter+select returns 500 on TPOS).
    const r = await tposApi(token, 'GET', `/odata/Product(${productId})`);
    if (r.status !== 200) throw new Error(`getCurrentQty ${productId} → ${r.status}`);
    return JSON.parse(r.body).QtyAvailable || 0;
}

async function postAdjust(token, payload) {
    const step1 = await tposApi(
        token,
        'POST',
        '/odata/StockChangeProductQty/ODataService.PostChangeQtyProduct',
        payload
    );
    if (step1.status < 200 || step1.status >= 300) {
        return { ok: false, step: 1, error: `HTTP ${step1.status}: ${step1.body.slice(0, 300)}` };
    }
    const step1Data = JSON.parse(step1.body);
    // Response format: {value:[{Id:..., ...}]} or array — extract Id
    const ids = (step1Data.value || step1Data || [])
        .map((x) => x?.Id)
        .filter((id) => typeof id === 'number' && id > 0);
    if (ids.length === 0) {
        return {
            ok: false,
            step: 1,
            error: `No Id returned. Response: ${step1.body.slice(0, 300)}`,
        };
    }

    const step2 = await tposApi(
        token,
        'POST',
        '/odata/StockChangeProductQty/ODataService.ChangeProductQtyIds',
        { ids }
    );
    if (step2.status < 200 || step2.status >= 300) {
        return {
            ok: false,
            step: 2,
            error: `HTTP ${step2.status}: ${step2.body.slice(0, 300)}`,
            step1Ids: ids,
        };
    }
    return { ok: true, ids };
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const onlyIdx = args.indexOf('--only');
    const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null;
    const skipExcessLessThanIdx = args.indexOf('--skip-excess-less-than');
    const skipExcessLessThan =
        skipExcessLessThanIdx >= 0 ? parseInt(args[skipExcessLessThanIdx + 1], 10) : null;

    console.log(`Mode: ${apply ? 'APPLY (will mutate TPOS)' : 'DRY-RUN'}`);
    if (only) console.log(`Filter: only code = ${only}`);
    if (limit) console.log(`Limit: first ${limit} products`);
    if (skipExcessLessThan) console.log(`Skip products with excess < ${skipExcessLessThan}`);

    console.log('Getting TPOS token...');
    const token = await getTposToken();
    console.log('Token OK');

    console.log(`Listing stock moves of ${PO_ORIGIN}...`);
    let dups = await listDuplicateMoves(token);
    console.log(`Found ${dups.length} product(s) with ≥2 stock moves`);
    if (only) dups = dups.filter((d) => d.code === only);
    if (skipExcessLessThan) dups = dups.filter((d) => d.excess >= skipExcessLessThan);
    if (limit) dups = dups.slice(0, limit);
    console.log(`Will process ${dups.length} product(s)`);

    const log = [];
    for (const [i, d] of dups.entries()) {
        const prefix = `[${i + 1}/${dups.length}] ${d.code} (id=${d.productId})`;
        try {
            const current = await getCurrentQty(token, d.productId);
            const target = current - d.excess;
            const line = `${prefix}: TPOS=${current} → target=${target} (giảm ${d.excess})`;
            console.log(line);

            if (target < 0) {
                console.log(`  SKIP — target<0 (current=${current}, excess=${d.excess})`);
                log.push({ ...d, current, target, skipped: 'target<0' });
                continue;
            }
            if (current <= d.lineQty) {
                console.log(
                    `  SKIP — current(${current}) <= lineQty(${d.lineQty}): có thể đã được fix tay`
                );
                log.push({ ...d, current, target, skipped: 'already-fixed' });
                continue;
            }

            if (!apply) {
                log.push({ ...d, current, target, applied: false });
                continue;
            }

            const pair = await fetchProductPair(token, d.productId);
            const payload = buildAdjustPayload({
                product: pair.product,
                template: pair.template,
                newQuantity: target,
            });
            const res = await postAdjust(token, payload);
            if (res.ok) {
                // Verify by reading back qty
                await new Promise((r) => setTimeout(r, 600));
                const after = await getCurrentQty(token, d.productId);
                if (after === target) {
                    console.log(`  ✓ OK — qty ${current} → ${after}`);
                    log.push({ ...d, current, target, applied: true, after });
                } else {
                    console.log(
                        `  ⚠ POSTED but qty after = ${after} (expected ${target}). Manual verify needed.`
                    );
                    log.push({ ...d, current, target, applied: true, after, mismatch: true });
                }
            } else {
                console.log(`  ✗ FAIL step ${res.step}: ${res.error}`);
                log.push({
                    ...d,
                    current,
                    target,
                    applied: false,
                    error: res.error,
                    step: res.step,
                });
            }
            // Small delay between products to avoid rate limit
            await new Promise((r) => setTimeout(r, 400));
        } catch (err) {
            console.log(`  ✗ ERROR: ${err.message}`);
            log.push({ ...d, error: err.message });
        }
    }

    const outPath = path.join(
        __dirname,
        '..',
        'downloads',
        'n2store-session',
        `fix-po-55687-${apply ? 'applied' : 'dryrun'}-${Date.now()}.json`
    );
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
    console.log(`\nReport saved: ${outPath}`);

    const okCount = log.filter((l) => l.applied && !l.mismatch).length;
    const mismatchCount = log.filter((l) => l.mismatch).length;
    const failCount = log.filter((l) => l.error).length;
    const skipCount = log.filter((l) => l.skipped).length;
    console.log(
        `\nSummary: ${okCount} OK, ${mismatchCount} mismatch, ${failCount} failed, ${skipCount} skipped (already fixed or invalid), ${log.length - okCount - mismatchCount - failCount - skipCount} dry-run`
    );
}

main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
