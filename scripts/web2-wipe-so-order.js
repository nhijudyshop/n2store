#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — backup + wipe Firestore web2_so_order/main (Sổ Order).
//
// Backup doc web2_so_order/main → JSON, rồi set về rỗng { tabs:[], activeTabId:'' }.
// Đọc service account creds TRỰC TIẾP từ serect_dont_push.txt (không echo).
// Chỉ đụng web2_so_order — KHÔNG đụng suppliers/wallets/customers (giữ KH).
//
// Usage: node scripts/web2-wipe-so-order.js [--dry]

const fs = require('fs');
const path = require('path');

const SECRET = path.join(__dirname, '..', 'serect_dont_push.txt');
const DRY = process.argv.includes('--dry');

function readCreds() {
    const txt = fs.readFileSync(SECRET, 'utf8');
    const grab = (label) => {
        const re = new RegExp(`^\\s*\\d*/?\\s*${label}\\s*:\\s*(.+)$`, 'mi');
        const m = txt.match(re);
        return m ? m[1].trim() : null;
    };
    const projectId = grab('FIREBASE_PROJECT_ID');
    const clientEmail = grab('FIREBASE_CLIENT_EMAIL');
    let privateKey = grab('FIREBASE_PRIVATE_KEY');
    if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');
    return { projectId, clientEmail, privateKey };
}

async function main() {
    const { projectId, clientEmail, privateKey } = readCreds();
    if (!projectId || !clientEmail || !privateKey) {
        console.error('[wipe-so-order] thiếu creds Firebase trong secret file');
        process.exit(1);
    }
    const admin = require(
        path.join(__dirname, '..', 'render.com', 'node_modules', 'firebase-admin')
    );
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
    }
    const db = admin.firestore();
    const ref = db.collection('web2_so_order').doc('main');

    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;
    const tabCount = data?.tabs?.length || 0;
    const shipmentCount = (data?.tabs || []).reduce((s, t) => s + (t.shipments?.length || 0), 0);
    console.log(
        `web2_so_order/main: exists=${snap.exists} tabs=${tabCount} shipments=${shipmentCount}`
    );

    // Backup
    const outDir = path.join(__dirname, '..', 'downloads', 'n2store-session');
    fs.mkdirSync(outDir, { recursive: true });
    const bak = path.join(outDir, `so-order-backup-${Date.now()}.json`);
    fs.writeFileSync(bak, JSON.stringify(data, null, 2));
    console.log(`backup → ${path.relative(path.join(__dirname, '..'), bak)}`);

    if (DRY) {
        console.log('[dry] không ghi — bỏ qua wipe.');
        process.exit(0);
    }

    // Wipe → empty state. App tự tạo default tab khi load.
    await ref.set({ tabs: [], activeTabId: '', lastUpdated: Date.now() }, { merge: false });
    console.log('✓ web2_so_order/main đã reset về rỗng { tabs:[], activeTabId:"" }');
    process.exit(0);
}

main().catch((e) => {
    console.error('[wipe-so-order] fatal:', e.message);
    process.exit(1);
});
