#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — tải ảnh SP từ net về, resize+compress, lưu data URL vào kho.
//
// Ảnh kho SP đang là loremflickr (net) → load chậm ở reconcile. Script tải về,
// sharp resize 350px WebP q72 → base64 data URL → PATCH web2_products.image_url
// (cascade sang order_lines → reconcile/bill load tức thì, không fetch net).
//
// Usage: node scripts/web2-localize-product-images.js [--max N]

const path = require('path');
const sharp = require(path.join(__dirname, '..', 'render.com', 'node_modules', 'sharp'));

const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const argv = process.argv.slice(2);
const MAX = (() => {
    const i = argv.indexOf('--max');
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : Infinity;
})();

async function fetchProducts() {
    const r = await fetch(`${WORKER}/api/web2-products/list?page=1&limit=200`);
    const j = await r.json();
    return j.data || j.items || j.products || j.records || [];
}

async function toDataUrl(srcUrl) {
    const r = await fetch(srcUrl, { redirect: 'follow' });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const out = await sharp(buf)
        .resize(350, 350, { fit: 'cover', position: 'centre' })
        .webp({ quality: 72 })
        .toBuffer();
    return {
        dataUrl: `data:image/webp;base64,${out.toString('base64')}`,
        kb: Math.round(out.length / 102.4) / 10,
    };
}

async function main() {
    const products = await fetchProducts();
    // Chỉ SP có ảnh http(s) ngoài (chưa phải data URL)
    const todo = products.filter((p) => /^https?:\/\//.test(p.imageUrl || '')).slice(0, MAX);
    console.log(`Kho ${products.length} SP, cần localize ${todo.length} ảnh net`);
    let ok = 0;
    for (const p of todo) {
        try {
            const { dataUrl, kb } = await toDataUrl(p.imageUrl);
            const res = await fetch(`${WORKER}/api/web2-products/${encodeURIComponent(p.code)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: dataUrl, sourcePage: 'localize-images' }),
            });
            if (res.ok) {
                ok++;
                console.log(`  ✓ ${p.code.padEnd(14)} ${kb}KB webp`);
            } else {
                console.log(`  ✗ ${p.code}: PATCH ${res.status}`);
            }
        } catch (e) {
            console.log(`  ✗ ${p.code}: ${e.message}`);
        }
    }
    console.log(`\nLocalized ${ok}/${todo.length} ảnh → data URL (load tức thì, không fetch net).`);
    process.exit(ok === todo.length ? 0 : 2);
}

main().catch((e) => {
    console.error('[localize-images] fatal:', e.message);
    process.exit(1);
});
