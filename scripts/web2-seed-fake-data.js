#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — seed data ảo (variants + products mã đúng Web2ProductCode).
//
// Tạo lại data ảo Web 2.0 sau khi wipe: variants (màu/size) + products với mã SP
// sinh đúng logic Web2ProductCode (<PREFIX_NCC><LOẠI><SỐ?><MÀU><SIZE?>).
// POST qua API thật trong 1 authenticated browser context (auth parity với app).
//
// Usage:
//   node scripts/web2-seed-fake-data.js --base https://nhijudy.store
//   node scripts/web2-seed-fake-data.js   # default worker prod
//
// KHÔNG wipe — chạy admin-web2-data-reset trước. Idempotent: bỏ qua 409 (đã tồn tại).

const path = require('path');

// Load Web2ProductCode (browser global module) into Node global.
require(path.join(__dirname, '..', 'web2', 'shared', 'web2-product-code.js'));
const Web2ProductCode = global.Web2ProductCode || globalThis.Web2ProductCode;

const API = 'https://chatomni-proxy.nhijudyshop.workers.dev';

// POST web2-products/variants không yêu cầu auth (verified 2026-06-04) → node fetch
// trực tiếp, không cần browser/login. Idempotent: 409 (đã tồn tại) coi như OK.
async function post(url, body) {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let j = null;
    try {
        j = await r.json();
    } catch (_) {}
    return { status: r.status, body: j };
}

// ── Seed definitions ────────────────────────────────────────────────
const COLORS = ['Đen', 'Trắng', 'Đỏ', 'Xanh Dương', 'Xám', 'Be', 'Hồng', 'Vàng', 'Nâu', 'Xanh Lá'];
const SIZES = ['S', 'M', 'L', 'XL', '28', '29', '30', '38', '39', '40'];

const SUPPLIERS = ['HÀ NỘI', 'HƯƠNG CHÂU', 'QUẢNG CHÂU', 'ADIDAS', 'B4'];

// Mỗi product: { supplier, name (chứa loại+màu+size), price, costPrice, stock }
const PRODUCTS = [
    { s: 'HÀ NỘI', name: 'ÁO THUN ĐEN', price: 150000, cost: 80000, stock: 20 },
    { s: 'HÀ NỘI', name: 'ÁO SƠ MI TRẮNG', price: 250000, cost: 140000, stock: 15 },
    { s: 'HÀ NỘI', name: 'QUẦN JEAN XANH DƯƠNG SIZE 30', price: 350000, cost: 200000, stock: 12 },
    { s: 'HÀ NỘI', name: 'QUẦN JEAN ĐEN SIZE 32', price: 350000, cost: 200000, stock: 8 },
    { s: 'HÀ NỘI', name: 'ĐẦM HỒNG', price: 420000, cost: 250000, stock: 10 },
    { s: 'HƯƠNG CHÂU', name: 'ÁO KHOÁC XÁM', price: 480000, cost: 290000, stock: 7 },
    { s: 'HƯƠNG CHÂU', name: 'ĐẦM ĐỎ', price: 450000, cost: 270000, stock: 9 },
    { s: 'HƯƠNG CHÂU', name: 'GUỐC NÂU SIZE 38', price: 280000, cost: 150000, stock: 14 },
    { s: 'HƯƠNG CHÂU', name: 'ÁO THUN TRẮNG', price: 150000, cost: 80000, stock: 25 },
    { s: 'QUẢNG CHÂU', name: 'ĐẦM XANH LÁ', price: 460000, cost: 280000, stock: 6 },
    { s: 'QUẢNG CHÂU', name: 'QUẦN TÂY ĐEN SIZE 29', price: 320000, cost: 180000, stock: 11 },
    { s: 'QUẢNG CHÂU', name: 'ÁO SƠ MI XANH DƯƠNG', price: 260000, cost: 145000, stock: 13 },
    { s: 'QUẢNG CHÂU', name: 'GIÀY ĐEN SIZE 39', price: 550000, cost: 320000, stock: 5 },
    { s: 'ADIDAS', name: 'GIÀY TRẮNG SIZE 40', price: 1200000, cost: 700000, stock: 8 },
    { s: 'ADIDAS', name: 'ÁO THUN ĐỎ', price: 320000, cost: 180000, stock: 18 },
    { s: 'ADIDAS', name: 'QUẦN SHORT ĐEN SIZE M', price: 280000, cost: 150000, stock: 16 },
    { s: 'B4', name: 'ÁO LEN BE', price: 380000, cost: 210000, stock: 9 },
    { s: 'B4', name: 'ĐẦM VÀNG', price: 440000, cost: 260000, stock: 7 },
    { s: 'B4', name: 'QUẦN JEAN XÁM SIZE 28', price: 360000, cost: 205000, stock: 10 },
    { s: 'B4', name: 'ÁO KHOÁC NÂU', price: 520000, cost: 310000, stock: 6 },
];

async function main() {
    // 1) Variants — màu + size. shortCode auto-suggest server-side.
    console.log('── Seeding variants ──');
    let vOk = 0;
    for (const c of COLORS) {
        const r = await post(`${API}/api/web2-variants`, { value: c, groupName: 'Màu' });
        if (r.status === 200 || r.status === 409) vOk++;
        else console.log(`  color ${c}: ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    }
    for (const s of SIZES) {
        const r = await post(`${API}/api/web2-variants`, { value: s, groupName: 'Size' });
        if (r.status === 200 || r.status === 409) vOk++;
        else console.log(`  size ${s}: ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    }
    console.log(`  variants OK: ${vOk}/${COLORS.length + SIZES.length}`);

    // 2) Build maps cho code-gen
    const supplierPrefixMap = Web2ProductCode.buildPrefixMap(SUPPLIERS);
    const colorShortMap = Web2ProductCode.buildColorShortMap(COLORS.map((c) => 'Màu ' + c));
    console.log('  supplierPrefixMap:', JSON.stringify(supplierPrefixMap));

    // 3) Products — code sinh bằng Web2ProductCode, tích luỹ existingCodes tránh trùng
    console.log('── Seeding products ──');
    const existingCodes = [];
    let pOk = 0;
    const created = [];
    for (const p of PRODUCTS) {
        const { code, parts } = Web2ProductCode.suggest({
            supplierName: p.s,
            productName: p.name,
            existingCodes,
            supplierPrefixMap,
            colorShortMap,
        });
        existingCodes.push(code);
        const r = await post(`${API}/api/web2-products`, {
            code,
            name: p.name,
            supplier: p.s,
            price: p.price,
            originalPrice: p.cost,
            stock: p.stock,
            createdBy: 'seed-script',
        });
        if (r.status === 200) {
            pOk++;
            created.push({ code, name: p.name, supplier: p.s });
            console.log(`  ✓ ${code.padEnd(14)} ${p.s} / ${p.name}`);
        } else {
            console.log(
                `  ✗ ${code} ${p.s}/${p.name}: ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`
            );
        }
    }
    console.log(`\nProducts created: ${pOk}/${PRODUCTS.length}`);
    console.log('Codes:', created.map((c) => c.code).join(', '));

    // Expose created products for downstream order seeding
    require('fs').writeFileSync(
        path.join(__dirname, '..', 'downloads', 'n2store-session', 'web2-seeded-products.json'),
        JSON.stringify(created, null, 2)
    );
    process.exit(pOk === PRODUCTS.length ? 0 : 2);
}

main().catch((e) => {
    console.error('[seed] fatal:', e.message);
    process.exit(1);
});
