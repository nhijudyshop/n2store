#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

// Migration: purchase_order_images bytea → Bunny CDN.
//
// Pipeline (idempotent — chạy lại an toàn):
//   1. Đọc tất cả row trong purchase_order_images (bytea + content_type)
//   2. Upload mỗi ảnh lên Bunny key `po-images/<id>.<ext>`
//   3. Build map old-id → new-cdn-url
//   4. Quét purchase_orders.invoice_images[]; thay URL DB bằng URL Bunny
//   5. Sau khi tất cả orders trỏ Bunny → DELETE bytea rows
//
// Run:
//   node scripts/migrate-po-images-to-bunny.js                 # full pipeline
//   node scripts/migrate-po-images-to-bunny.js --dry-run       # đọc, không ghi
//   node scripts/migrate-po-images-to-bunny.js --skip-cleanup  # upload + replace, giữ bytea
//
// Cần env vars (đọc từ serect_dont_push.txt):
//   PG_URL                — Render Postgres connection string
//   BUNNY_STORAGE_KEY     — write key cho zone n2store-aikol
//   BUNNY_STORAGE_ZONE    — n2store-aikol (default)
//   BUNNY_CDN_HOSTNAME    — n2store-aikol.b-cdn.net (default)

const fs = require('fs');
const path = require('path');
const { Pool } = require(path.resolve(__dirname, '..', 'render.com', 'node_modules', 'pg'));

// ---------- env loader ---------------------------------------------------
const SECRETS = path.resolve(__dirname, '..', 'serect_dont_push.txt');
function loadSecrets() {
    const text = fs.readFileSync(SECRETS, 'utf8');
    const env = { ...process.env };
    // 1/Render database: postgresql://...
    const pg = text.match(/Render database:\s*(postgresql:\/\/[^\s]+)/);
    if (pg) env.PG_URL = env.PG_URL || pg[1];
    // BUNNY_STORAGE_KEY=...
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.+)$/);
        if (m) env[m[1]] = env[m[1]] || m[2].trim();
    }
    return env;
}
const env = loadSecrets();
process.env.BUNNY_STORAGE_KEY = env.BUNNY_STORAGE_KEY;
process.env.BUNNY_STORAGE_ZONE = env.BUNNY_STORAGE_ZONE || 'n2store-aikol';
process.env.BUNNY_CDN_HOSTNAME = env.BUNNY_CDN_HOSTNAME || 'n2store-aikol.b-cdn.net';
process.env.BUNNY_STORAGE_ENDPOINT = env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com';

const bunny = require(
    path.resolve(__dirname, '..', 'render.com', 'services', 'bunny-storage-service')
);

// ---------- args --------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_CLEANUP = process.argv.includes('--skip-cleanup');
const BUNNY_PO_PREFIX = 'po-images';

const EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/svg+xml': 'svg',
};
function extFromMime(mime, fallbackName) {
    if (mime && EXT_BY_MIME[mime.toLowerCase()]) return EXT_BY_MIME[mime.toLowerCase()];
    if (fallbackName) {
        const e = path.extname(fallbackName).toLowerCase().replace('.', '');
        if (e) return e;
    }
    return 'jpg';
}

// ---------- main --------------------------------------------------------
async function main() {
    if (!env.PG_URL) throw new Error('PG_URL not found in serect_dont_push.txt');
    if (!env.BUNNY_STORAGE_KEY) throw new Error('BUNNY_STORAGE_KEY not found');

    const pool = new Pool({ connectionString: env.PG_URL, ssl: { rejectUnauthorized: false } });

    console.log(`[migrate] mode=${DRY_RUN ? 'DRY-RUN' : 'APPLY'} skip-cleanup=${SKIP_CLEANUP}`);
    console.log(`[migrate] zone=${bunny.ZONE} cdn=${bunny.CDN_HOSTNAME}`);

    // ---- Phase 1: list rows ----
    const t0 = Date.now();
    const images = await pool.query(
        'SELECT id, data, content_type, filename, size_bytes FROM purchase_order_images ORDER BY created_at ASC'
    );
    console.log(`[phase 1] purchase_order_images rows = ${images.rowCount}`);
    if (images.rowCount === 0) {
        console.log('[migrate] nothing to do — bytea table empty');
        await pool.end();
        return;
    }

    // ---- Phase 2: upload to Bunny ----
    const urlMap = new Map(); // image.id → cdnUrl
    const failed = [];
    for (let i = 0; i < images.rowCount; i++) {
        const row = images.rows[i];
        const ext = extFromMime(row.content_type, row.filename);
        const key = `${BUNNY_PO_PREFIX}/${row.id}.${ext}`;
        const cdnUrl = bunny.cdnUrl(key);
        urlMap.set(row.id, cdnUrl);

        if (DRY_RUN) {
            if (i < 3)
                console.log(`[dry] would upload id=${row.id} key=${key} size=${row.size_bytes}`);
            continue;
        }
        try {
            await bunny.uploadBuffer(row.data, key, row.content_type || 'image/jpeg');
            if ((i + 1) % 50 === 0 || i + 1 === images.rowCount) {
                console.log(`[phase 2] uploaded ${i + 1}/${images.rowCount}`);
            }
        } catch (err) {
            console.error(`[phase 2] FAIL id=${row.id} ${err.message}`);
            failed.push({ id: row.id, err: err.message });
        }
    }
    if (failed.length) {
        console.error(`[phase 2] ${failed.length} uploads failed — abort before URL replace`);
        await pool.end();
        process.exit(1);
    }

    // ---- Phase 3: replace URLs in purchase_orders.invoice_images ----
    const orders = await pool.query(
        `SELECT id, invoice_images FROM purchase_orders
         WHERE invoice_images IS NOT NULL
           AND array_length(invoice_images, 1) > 0`
    );
    let updatedOrders = 0;
    let replacedUrls = 0;
    for (const order of orders.rows) {
        let changed = false;
        const newArr = (order.invoice_images || []).map((url) => {
            if (typeof url !== 'string') return url;
            const m = url.match(/\/images\/([^/?#]+)$/);
            if (m && urlMap.has(m[1])) {
                changed = true;
                replacedUrls++;
                return urlMap.get(m[1]);
            }
            return url;
        });
        if (changed && !DRY_RUN) {
            await pool.query(
                'UPDATE purchase_orders SET invoice_images = $1, updated_at = NOW() WHERE id = $2',
                [newArr, order.id]
            );
            updatedOrders++;
        } else if (changed) {
            updatedOrders++;
        }
    }
    console.log(
        `[phase 3] orders ${DRY_RUN ? 'would-update' : 'updated'} = ${updatedOrders}, urls replaced = ${replacedUrls}`
    );

    // ---- Phase 4: cleanup bytea rows ----
    if (DRY_RUN || SKIP_CLEANUP) {
        console.log(`[phase 4] skipped (${DRY_RUN ? 'dry' : 'flag'})`);
    } else {
        const del = await pool.query('DELETE FROM purchase_order_images');
        console.log(`[phase 4] deleted ${del.rowCount} bytea rows`);
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
