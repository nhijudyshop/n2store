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

// Loại SP (ASCII keyword trong tên) → keyword ảnh quần áo thật (loremflickr).
// Match theo thứ tự — cụm dài trước (AO KHOAC trước AO).
const TYPE_KEYWORD = [
    ['AO THUN', 'tshirt'],
    ['AO SO MI', 'shirt'],
    ['AO KHOAC', 'jacket'],
    ['AO LEN', 'sweater'],
    ['QUAN JEAN', 'jeans'],
    ['QUAN SHORT', 'shorts'],
    ['QUAN TAY', 'trousers'],
    ['DAM', 'dress'],
    ['GIAY', 'shoes'],
    ['GUOC', 'sandals'],
    ['QUAN', 'trousers'],
    ['AO', 'shirt'],
];

// lock số ổn định từ mã SP → mỗi SP 1 ảnh cố định (không đổi mỗi lần load).
function lockFrom(code) {
    let h = 0;
    for (const c of ascii(code)) h = (h * 31 + c.charCodeAt(0)) % 100000;
    return h;
}

function imageFor(p) {
    const nameA = ascii(p.name);
    let kw = 'fashion';
    for (const [t, k] of TYPE_KEYWORD) {
        if (nameA.includes(t)) {
            kw = k;
            break;
        }
    }
    // Ảnh quần áo thật theo loại SP, deterministic qua lock.
    return `https://loremflickr.com/400/400/${kw}?lock=${lockFrom(p.code)}`;
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
