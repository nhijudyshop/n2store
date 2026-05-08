#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.

// One-time migration: rewrite legacy image URLs INSIDE items[].productImages and
// items[].priceImages of purchase_orders. Phase B Bunny migration only handled
// invoice_images[]; items[] was missed → "không có hình ảnh sản phẩm" trong PO Draft tab.
//
// Strategy:
//   1. List all keys in Bunny zone `po-images/` to build map UUID → ext.
//   2. SELECT all purchase_orders where items::text LIKE '%n2store-fallback.onrender.com%'.
//   3. For each order, walk items[].productImages and items[].priceImages,
//      rewrite n2store-fallback URLs to BunnyCDN URLs using the UUID→ext map.
//   4. UPDATE the order's items column.
//
// Run:
//   node scripts/migrate-po-item-images-to-bunny.js              # full pipeline
//   node scripts/migrate-po-item-images-to-bunny.js --dry-run    # preview, no writes

const fs = require('fs');
const path = require('path');
const https = require('https');
const { Pool } = require(path.resolve(__dirname, '..', 'render.com', 'node_modules', 'pg'));

// ---------- env loader ---------------------------------------------------
const SECRETS = path.resolve(__dirname, '..', 'serect_dont_push.txt');
function loadSecrets() {
    const text = fs.readFileSync(SECRETS, 'utf8');
    const env = { ...process.env };
    const pg = text.match(/Render database:\s*(postgresql:\/\/[^\s]+)/);
    if (pg) env.PG_URL = env.PG_URL || pg[1];
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m) env[m[1]] = env[m[1]] || m[2].trim();
    }
    return env;
}
const env = loadSecrets();
const ZONE = env.BUNNY_STORAGE_ZONE || 'n2store-aikol';
const KEY = env.BUNNY_STORAGE_KEY;
const CDN_HOSTNAME = env.BUNNY_CDN_HOSTNAME || `${ZONE}.b-cdn.net`;
const ENDPOINT_HOST = (env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
const DRY_RUN = process.argv.includes('--dry-run');

const LEGACY_RE =
    /https:\/\/n2store-fallback\.onrender\.com\/api\/v2\/purchase-orders\/images\/([0-9a-fA-F-]{36})/g;

// ---------- Bunny list helper -------------------------------------------
function bunnyList(prefix) {
    if (!KEY) throw new Error('BUNNY_STORAGE_KEY not configured');
    return new Promise((resolve, reject) => {
        const cleanPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
        const req = https.request(
            {
                hostname: ENDPOINT_HOST,
                method: 'GET',
                path: `/${ZONE}/${cleanPrefix}/`,
                headers: { AccessKey: KEY, Accept: 'application/json' },
            },
            (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error(`Bunny list parse: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`Bunny list ${res.statusCode}: ${body.slice(0, 300)}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    if (!env.PG_URL) throw new Error('PG_URL not found in serect_dont_push.txt');
    if (!KEY) throw new Error('BUNNY_STORAGE_KEY not found');

    console.log(`[migrate] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
    console.log(`[migrate] zone=${ZONE} cdn=${CDN_HOSTNAME}`);

    // ---- Phase 1: list Bunny keys ----
    const t0 = Date.now();
    const bunnyFiles = await bunnyList('po-images');
    console.log(`[phase 1] Bunny po-images/ files = ${bunnyFiles.length}`);
    const idToCdnUrl = new Map();
    for (const f of bunnyFiles) {
        const name = f.ObjectName || f.objectName || '';
        // Format: <UUID>.<ext>
        const m = name.match(/^([0-9a-fA-F-]{36})\.([a-z0-9]+)$/i);
        if (m) idToCdnUrl.set(m[1].toLowerCase(), `https://${CDN_HOSTNAME}/po-images/${name}`);
    }
    console.log(`[phase 1] mapped UUIDs = ${idToCdnUrl.size}`);

    // ---- Phase 2: SELECT orders with legacy URLs in items ----
    const pool = new Pool({ connectionString: env.PG_URL, ssl: { rejectUnauthorized: false } });
    const orders = await pool.query(
        `SELECT id, items FROM purchase_orders
         WHERE items::text LIKE '%n2store-fallback.onrender.com%'`
    );
    console.log(`[phase 2] orders with legacy URLs = ${orders.rowCount}`);

    let ordersUpdated = 0;
    let urlsReplaced = 0;
    let urlsRemoved = 0;
    const sampleRemoved = [];

    for (const row of orders.rows) {
        const items = row.items;
        if (!Array.isArray(items)) continue;
        let changed = false;
        const newItems = items.map((it) => {
            if (!it || typeof it !== 'object') return it;
            const newIt = { ...it };
            for (const field of ['productImages', 'priceImages']) {
                if (!Array.isArray(newIt[field])) continue;
                // Walk URLs: rewrite known UUIDs to Bunny, drop unknown UUIDs (image gone).
                const newArr = [];
                for (const url of newIt[field]) {
                    if (typeof url !== 'string') {
                        newArr.push(url);
                        continue;
                    }
                    const m = url.match(LEGACY_RE);
                    if (!m) {
                        // Not a legacy URL — keep as-is.
                        newArr.push(url);
                        continue;
                    }
                    // Has legacy URL(s). Rewrite or drop.
                    let kept = url;
                    let dropped = false;
                    kept = kept.replace(LEGACY_RE, (_, id) => {
                        const newUrl = idToCdnUrl.get(id.toLowerCase());
                        if (newUrl) {
                            urlsReplaced++;
                            return newUrl;
                        }
                        urlsRemoved++;
                        if (sampleRemoved.length < 5) sampleRemoved.push(id);
                        dropped = true;
                        return ''; // mark for drop if entire URL was just this
                    });
                    if (dropped && kept === '') {
                        // The URL was entirely a legacy unknown reference — drop it.
                        changed = true;
                        continue;
                    }
                    if (kept !== url) changed = true;
                    newArr.push(kept);
                }
                newIt[field] = newArr;
            }
            return newIt;
        });

        if (changed && !DRY_RUN) {
            await pool.query(
                'UPDATE purchase_orders SET items = $1::jsonb, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(newItems), row.id]
            );
            ordersUpdated++;
        } else if (changed) {
            ordersUpdated++;
        }
    }

    console.log(
        `[phase 2] orders ${DRY_RUN ? 'would-update' : 'updated'} = ${ordersUpdated}, urls replaced = ${urlsReplaced}, urls removed (unknown UUIDs) = ${urlsRemoved}`
    );
    if (sampleRemoved.length) {
        console.log(`[phase 2] sample removed UUIDs:`, sampleRemoved);
    }

    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[migrate] DONE in ${sec}s`);
    await pool.end();
}

main().catch((err) => {
    console.error('[migrate] fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
});
