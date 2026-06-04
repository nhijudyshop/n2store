#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — seed Sổ Order (Firestore web2_so_order/main) theo kho SP.
//
// Xoá data so-order cũ + tạo lại data ảo: tabs/shipments/rows tham chiếu ĐÚNG
// 20 SP trong kho (web2_products). Row.productName = product.name exact → so-order
// tự lookup mã SP từ kho (Web2ProductsCache.findByNameExact).
//
// Backup doc cũ trước khi ghi. Creds Firebase đọc từ serect_dont_push.txt.
// Usage: node scripts/web2-seed-so-order.js [--dry]

const fs = require('fs');
const path = require('path');

const SECRET = path.join(__dirname, '..', 'serect_dont_push.txt');
const API = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const DRY = process.argv.includes('--dry');

function readCreds() {
    const txt = fs.readFileSync(SECRET, 'utf8');
    const grab = (label) => {
        const re = new RegExp(`^\\s*\\d*/?\\s*${label}\\s*:\\s*(.+)$`, 'mi');
        const m = txt.match(re);
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

const mkId = (() => {
    let n = 0;
    // Deterministic-ish unique id (Math.random tránh trong workflow, nhưng đây là script thường)
    return () =>
        Date.now().toString(36) +
        (n++).toString(36).padStart(3, '0') +
        Math.random().toString(36).slice(2, 6);
})();

// Tab nào chứa supplier nào (gom NCC vào 2 sổ cho gọn). Tất cả VND rate 1.
const TAB_PLAN = [
    { id: 'hanoi', label: 'HÀ NỘI', suppliers: ['HÀ NỘI', 'B4'] },
    { id: 'quangchau', label: 'QUẢNG CHÂU', suppliers: ['HƯƠNG CHÂU', 'QUẢNG CHÂU', 'ADIDAS'] },
];
// Ngày giao + trạng thái mẫu cho mỗi shipment (theo supplier).
const SHIPMENT_META = {
    'HÀ NỘI': { date: '2026-06-01', batch: 'HN-2606', status: 'received' },
    B4: { date: '2026-06-02', batch: 'B4-2606', status: 'draft' },
    'HƯƠNG CHÂU': { date: '2026-06-01', batch: 'HC-2606', status: 'received' },
    'QUẢNG CHÂU': { date: '2026-06-02', batch: 'QC-2606', status: 'received' },
    ADIDAS: { date: '2026-06-03', batch: 'AD-2606', status: 'draft' },
};

async function fetchProducts() {
    const r = await fetch(`${API}/api/web2-products/list?page=1&limit=200`);
    const j = await r.json();
    return j.data || j.items || j.products || j.records || [];
}

function buildState(products) {
    const bySupplier = {};
    for (const p of products) {
        const s = (p.supplier || '').trim();
        (bySupplier[s] = bySupplier[s] || []).push(p);
    }
    const tabs = TAB_PLAN.map((plan) => {
        const shipments = [];
        for (const sup of plan.suppliers) {
            const items = bySupplier[sup] || [];
            if (!items.length) continue;
            const meta = SHIPMENT_META[sup] || { date: '2026-06-01', batch: sup, status: 'draft' };
            const invoiceGroupId = mkId();
            const rows = items.map((p, i) => {
                const qty = Math.max(1, Math.min(Number(p.stock) || 1, 1 + (i % 4)));
                return {
                    id: mkId(),
                    invoiceGroupId,
                    supplier: sup,
                    productName: p.name, // exact → lookup mã SP từ kho
                    variant: p.variant || '',
                    qty,
                    sellPrice: Number(p.price) || 0,
                    costPrice: Number(p.originalPrice) || 0,
                    productImage: p.imageUrl || '',
                    invoiceImage: '',
                    note: '',
                    costNote: '',
                    status: meta.status,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                };
            });
            const weightKg = rows.reduce((s, r) => s + r.qty, 0); // 1kg/cái mẫu
            shipments.push({
                id: mkId(),
                date: meta.date,
                batch: meta.batch,
                caseCount: Math.ceil(rows.length / 3),
                weightKg,
                contractAmount: rows.reduce((s, r) => s + r.costPrice * r.qty, 0),
                contractCurrency: 'VND',
                expectedDeliveryDate: null,
                collapsed: false,
                rows,
            });
        }
        return {
            id: plan.id,
            label: plan.label,
            currency: 'VND',
            rate: 1,
            footer: { discount: 0, shipping: 0 },
            columnVisibility: {
                supplier: true,
                stt: true,
                productName: true,
                variant: true,
                qty: true,
                sellPrice: true,
                costPrice: true,
                productImage: true,
                invoiceImage: true,
                note: true,
                costNote: true,
                status: true,
                actions: true,
            },
            shipments,
        };
    });
    // App đọc doc dạng { data: <state>, lastUpdated } (xem SoOrderStorage.Sync._loadFromFirestore).
    // state gồm { tabs, activeTabId, trash }.
    return { trash: [], tabs, activeTabId: tabs[0].id };
}

async function main() {
    const products = await fetchProducts();
    console.log(`Kho SP: ${products.length} sản phẩm`);
    if (!products.length) {
        console.error('[seed-so-order] Kho rỗng — seed products trước.');
        process.exit(1);
    }
    const state = buildState(products);
    const doc = { data: state, lastUpdated: Date.now() };
    const totalRows = state.tabs.reduce(
        (s, t) => s + t.shipments.reduce((x, sh) => x + sh.rows.length, 0),
        0
    );
    const totalShip = state.tabs.reduce((s, t) => s + t.shipments.length, 0);
    console.log(`Build: ${state.tabs.length} tabs, ${totalShip} shipments, ${totalRows} rows`);
    for (const t of state.tabs) {
        for (const sh of t.shipments) {
            console.log(
                `  [${t.label}] ${sh.batch} ${sh.date} — ${sh.rows.length} rows (${sh.rows[0]?.status})`
            );
        }
    }

    const { projectId, clientEmail, privateKey } = readCreds();
    const admin = require(
        path.join(__dirname, '..', 'render.com', 'node_modules', 'firebase-admin')
    );
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    }
    const ref = admin.firestore().collection('web2_so_order').doc('main');

    // Backup
    const snap = await ref.get();
    const outDir = path.join(__dirname, '..', 'downloads', 'n2store-session');
    fs.mkdirSync(outDir, { recursive: true });
    const bak = path.join(outDir, `so-order-backup-${Date.now()}.json`);
    fs.writeFileSync(bak, JSON.stringify(snap.exists ? snap.data() : null, null, 2));
    console.log(`backup cũ → ${path.relative(path.join(__dirname, '..'), bak)}`);

    if (DRY) {
        fs.writeFileSync(
            path.join(outDir, 'so-order-seed-preview.json'),
            JSON.stringify(doc, null, 2)
        );
        console.log(
            '[dry] preview → downloads/n2store-session/so-order-seed-preview.json (không ghi Firestore)'
        );
        process.exit(0);
    }

    await ref.set(doc, { merge: false });
    console.log(
        `✓ web2_so_order/main đã ghi: ${totalShip} shipments / ${totalRows} rows tham chiếu kho.`
    );
    process.exit(0);
}

main().catch((e) => {
    console.error('[seed-so-order] fatal:', e.message);
    process.exit(1);
});
