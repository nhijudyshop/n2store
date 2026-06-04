#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — gán ảnh placeholder color-coded cho SP kho (data ảo).
//
// Mỗi SP kho được gán imageUrl placehold.co màu theo màu SP + text = mã SP.
// PATCH /api/web2-products/:code (không cần auth). Sau đó chạy lại
// web2-seed-so-order.js để so-order pick up ảnh.
//
// Usage: node scripts/web2-add-product-images.js

const API = 'https://chatomni-proxy.nhijudyshop.workers.dev';

function ascii(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toUpperCase();
}

// Màu (ASCII keyword) → { bg, fg } hex (không # cho placehold.co)
const COLOR_HEX = [
    ['XANH DUONG', '2563eb', 'ffffff'],
    ['XANH LA', '16a34a', 'ffffff'],
    ['XANH', '2563eb', 'ffffff'],
    ['DEN', '1f2937', 'ffffff'],
    ['TRANG', 'f3f4f6', '111827'],
    ['DO', 'dc2626', 'ffffff'],
    ['XAM', '6b7280', 'ffffff'],
    ['BE', 'e7d3b3', '4b2e05'],
    ['HONG', 'ec4899', 'ffffff'],
    ['VANG', 'f59e0b', '1f2937'],
    ['NAU', '78350f', 'ffffff'],
    ['BAC', 'cbd5e1', '1f2937'],
];

function imageFor(p) {
    const nameA = ascii(p.name);
    let bg = '9ca3af';
    let fg = 'ffffff';
    for (const [kw, b, f] of COLOR_HEX) {
        if (nameA.includes(kw)) {
            bg = b;
            fg = f;
            break;
        }
    }
    const text = encodeURIComponent(ascii(p.code));
    return `https://placehold.co/400x400/${bg}/${fg}/png?text=${text}`;
}

async function main() {
    const r = await fetch(`${API}/api/web2-products/list?page=1&limit=200`);
    const j = await r.json();
    const products = j.data || j.items || j.products || j.records || [];
    console.log(`Kho: ${products.length} SP`);

    let ok = 0;
    for (const p of products) {
        const imageUrl = imageFor(p);
        const res = await fetch(`${API}/api/web2-products/${encodeURIComponent(p.code)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl, sourcePage: 'seed-images' }),
        });
        if (res.ok) {
            ok++;
            console.log(`  ✓ ${p.code.padEnd(14)} ← ${imageUrl}`);
        } else {
            const t = await res.text().catch(() => '');
            console.log(`  ✗ ${p.code}: ${res.status} ${t.slice(0, 80)}`);
        }
    }
    console.log(`\nĐã gán ảnh: ${ok}/${products.length} SP`);
    process.exit(ok === products.length ? 0 : 2);
}

main().catch((e) => {
    console.error('[add-images] fatal:', e.message);
    process.exit(1);
});
