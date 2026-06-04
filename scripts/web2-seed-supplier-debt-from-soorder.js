#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — reseed supplier-debt (inventory_shipments) KHỚP so-order.
//
// Đọc Sổ Order (Firestore web2_so_order/main) → gom rows theo NCC → tong_tien_hd
// = Σ(costPrice × qty). Wipe inventory_shipments rồi seed 1 shipment/NCC khớp
// so-order. paid = 0 (so-order không có thanh toán) → debt = full owed.
// POST /api/v2/inventory-tracking/shipments (web2Db).
//
// Usage: node scripts/web2-seed-supplier-debt-from-soorder.js [--dry]

const fs = require('fs');
const path = require('path');

const SECRET = path.join(__dirname, '..', 'serect_dont_push.txt');
const RENDER = 'https://n2store-fallback.onrender.com';
const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const DRY = process.argv.includes('--dry');

// NCC name → stt_ncc (dot_so = stt để payment KHÔNG inherit chéo qua WHERE dot_so).
const NCC_STT = { 'HÀ NỘI': 1, 'HƯƠNG CHÂU': 2, 'QUẢNG CHÂU': 3, ADIDAS: 4, B4: 5 };
const NCC_DATE = {
    'HÀ NỘI': '2026-06-01',
    'HƯƠNG CHÂU': '2026-06-02',
    'QUẢNG CHÂU': '2026-06-03',
    ADIDAS: '2026-06-04',
    B4: '2026-06-05',
};

function readCreds() {
    const txt = fs.readFileSync(SECRET, 'utf8');
    const grab = (label) => {
        const m = txt.match(new RegExp(`^\\s*\\d*/?\\s*${label}\\s*:\\s*(.+)$`, 'mi'));
        return m ? m[1].trim() : null;
    };
    let pk = grab('FIREBASE_PRIVATE_KEY');
    if (pk) pk = pk.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
    return {
        projectId: grab('FIREBASE_PROJECT_ID'),
        clientEmail: grab('FIREBASE_CLIENT_EMAIL'),
        privateKey: pk,
    };
}

async function readSoOrder() {
    const { projectId, clientEmail, privateKey } = readCreds();
    const admin = require(
        path.join(__dirname, '..', 'render.com', 'node_modules', 'firebase-admin')
    );
    if (!admin.apps.length)
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    const snap = await admin.firestore().collection('web2_so_order').doc('main').get();
    const data = snap.exists ? snap.data().data || snap.data() : null;
    return data;
}

async function fetchProductCodes() {
    const r = await fetch(`${WORKER}/api/web2-products/list?page=1&limit=200`);
    const j = await r.json();
    const map = {};
    for (const p of j.data || j.items || j.products || j.records || [])
        map[(p.name || '').trim()] = p;
    return map;
}

function flattenRows(soData) {
    const rows = [];
    for (const tab of soData.tabs || [])
        for (const sh of tab.shipments || []) for (const r of sh.rows || []) rows.push(r);
    return rows;
}

async function main() {
    const soData = await readSoOrder();
    if (!soData) {
        console.error('[seed-debt] so-order rỗng — seed so-order trước.');
        process.exit(1);
    }
    const rows = flattenRows(soData);
    const codeMap = await fetchProductCodes();
    console.log(`Sổ Order: ${rows.length} rows`);

    // Gom theo NCC
    const byNcc = {};
    for (const r of rows) {
        const sup = (r.supplier || '').trim();
        if (!NCC_STT[sup]) continue;
        (byNcc[sup] = byNcc[sup] || []).push(r);
    }

    const shipments = [];
    for (const [sup, items] of Object.entries(byNcc)) {
        const san_pham = items.map((r) => {
            const code = codeMap[(r.productName || '').trim()]?.code || '';
            const qty = Number(r.qty) || 0;
            const donGia = Number(r.costPrice) || 0;
            return {
                maSP: code,
                tenSP: r.productName,
                moTa: r.productName,
                mauSac: r.variant || '',
                soMau: 1,
                soLuong: qty,
                donGia,
                giaDonVi: donGia,
                thanhTien: donGia * qty,
                anhSanPham: codeMap[(r.productName || '').trim()]?.imageUrl || '',
            };
        });
        const tong_tien_hd = san_pham.reduce((s, x) => s + x.thanhTien, 0);
        const tong_mon = san_pham.reduce((s, x) => s + x.soLuong, 0);
        shipments.push({
            stt_ncc: NCC_STT[sup],
            ten_ncc: sup,
            ngay_di_hang: NCC_DATE[sup],
            dot_so: NCC_STT[sup],
            kien_hang: [{ stt: 1, soKg: san_pham.length }],
            tong_kien: 1,
            tong_kg: san_pham.length,
            san_pham,
            tong_tien_hd,
            tong_mon,
            chi_phi_hang_ve: [],
            tong_chi_phi: 0,
            thanh_toan_ck: [], // so-order không có thanh toán → debt = full owed
            ti_gia: 0,
            ghi_chu: 'Khớp Sổ Order (data ảo)',
            anh_hoa_don: [],
        });
    }

    console.log(`Build ${shipments.length} shipments (khớp so-order):`);
    for (const s of shipments)
        console.log(
            `  stt ${s.stt_ncc} ${s.ten_ncc.padEnd(11)} | ${s.san_pham.length} SP, ${s.tong_mon} cái | nợ (HĐ) ${s.tong_tien_hd.toLocaleString()}`
        );

    if (DRY) {
        console.log('[dry] không wipe/POST.');
        return;
    }

    // Wipe inventory trước
    const secret = (fs.readFileSync(SECRET, 'utf8').match(/CLEANUP_SECRET[^:]*:\s*(\S+)/i) ||
        [])[1];
    const wipe = await fetch(`${RENDER}/api/admin/web2-data-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret || '' },
        body: JSON.stringify({ mode: 'wipe', target: 'inventory', confirm: 'YES-RESET' }),
    });
    console.log('wipe inventory:', (await wipe.json()).success);

    let ok = 0;
    for (const s of shipments) {
        const r = await fetch(`${RENDER}/api/v2/inventory-tracking/shipments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success !== false) {
            ok++;
            console.log(`  ✓ ${s.ten_ncc}`);
        } else console.log(`  ✗ ${s.ten_ncc}: ${r.status} ${JSON.stringify(j).slice(0, 100)}`);
    }
    console.log(`\nSeeded ${ok}/${shipments.length} shipments khớp so-order.`);
    process.exit(ok === shipments.length ? 0 : 2);
}

main().catch((e) => {
    console.error('[seed-debt] fatal:', e.message);
    process.exit(1);
});
