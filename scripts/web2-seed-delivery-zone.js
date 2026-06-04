#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — seed entity `deliveryzone`.
// =====================================================================
// WEB 2.0 — Seed entity `deliveryzone` (vùng giao hàng cho auto-detect)
//
//   Đẩy 7 OPTIONS mặc định của DeliveryMethodPicker lên generic entity
//   `deliveryzone` (code = value, name = label, data = {fee, keywords,
//   manual, isFallback, short}). Picker đọc entity này làm source of truth;
//   trang web2/delivery-zone/ cho admin sửa giá + keyword + thêm/bớt.
//
//   Idempotent: create record mới, record đã có → PATCH cập nhật data.
//
//   Chạy: node scripts/web2-seed-delivery-zone.js
//         node scripts/web2-seed-delivery-zone.js --base https://chatomni-proxy.nhijudyshop.workers.dev
// =====================================================================

const args = process.argv.slice(2);
function arg(name, def) {
    const i = args.indexOf(name);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
const BASE = arg('--base', 'https://chatomni-proxy.nhijudyshop.workers.dev');
const ENTITY = 'deliveryzone';

// Load OPTIONS từ chính picker (single source — tránh lệch định nghĩa).
global.window = { DeliveryMethodPicker: undefined };
require('../web2/shared/delivery-method-picker.js');
const DMP = global.window.DeliveryMethodPicker;
if (!DMP || !Array.isArray(DMP.OPTIONS)) {
    console.error('❌ Không nạp được DeliveryMethodPicker.OPTIONS');
    process.exit(1);
}

const records = DMP.OPTIONS.map((o) => ({
    code: o.value,
    name: o.label,
    isActive: true,
    data: {
        fee: Number(o.price || 0),
        keywords: Array.isArray(o.keywords) ? o.keywords : [],
        manual: !!o.manual,
        isFallback: !!o.isFallback,
        short: o.short || '',
    },
}));

async function getExisting() {
    const r = await fetch(`${BASE}/api/web2/${ENTITY}/list?limit=200`);
    const j = await r.json();
    const set = new Set();
    if (j && Array.isArray(j.records)) j.records.forEach((rec) => set.add(rec.code));
    return set;
}

async function createOne(rec) {
    const r = await fetch(`${BASE}/api/web2/${ENTITY}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code: rec.code,
            name: rec.name,
            data: rec.data,
            isActive: rec.isActive,
            sourcePage: 'seed-script',
        }),
    });
    return r.ok;
}
async function updateOne(rec) {
    const r = await fetch(`${BASE}/api/web2/${ENTITY}/update/${encodeURIComponent(rec.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: rec.name, data: rec.data, isActive: rec.isActive }),
    });
    return r.ok;
}

(async () => {
    console.log(`Seed ${records.length} vùng giao hàng → ${BASE}/api/web2/${ENTITY}`);
    const existing = await getExisting();
    let created = 0,
        updated = 0,
        failed = 0;
    for (const rec of records) {
        try {
            const ok = existing.has(rec.code) ? await updateOne(rec) : await createOne(rec);
            if (ok) {
                existing.has(rec.code) ? updated++ : created++;
                console.log(
                    `  ${existing.has(rec.code) ? '↻ update' : '＋ create'}  ${rec.code} — ${rec.name}`
                );
            } else {
                failed++;
                console.log(`  ✗ fail    ${rec.code}`);
            }
        } catch (e) {
            failed++;
            console.log(`  ✗ error   ${rec.code}: ${e.message}`);
        }
    }
    console.log(`\nXong: created=${created} updated=${updated} failed=${failed}`);
    process.exit(failed ? 1 : 0);
})();
