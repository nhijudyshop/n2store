// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 one-off — clear Firestore Web 2.0 docs về empty (Sổ Order, Ví NCC, NCC list, Ví KH legacy).
// =====================================================================
// One-off: wipe Web 2.0 Firestore docs về EMPTY (KHÔNG delete doc — init
// Firestore-first chỉ override local khi doc tồn tại). Đọc credentials qua
// env (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) —
// KHÔNG hardcode. Chạy: node scripts/web2-firestore-wipe.js [--dry]
// =====================================================================
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
// .env style escaped newlines → real newlines
privateKey = privateKey.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
    console.error('Thiếu FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env');
    process.exit(1);
}

const dryRun = process.argv.includes('--dry');

admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});
const db = admin.firestore();

// Doc shape: { data: <state>, lastUpdated }. Empty state per page expectation.
const TARGETS = [
    { col: 'web2_so_order', empty: { tabs: [], activeTabId: null } },
    { col: 'web2_supplier_wallet', empty: { wallets: {} } },
    { col: 'web2_suppliers', empty: { suppliers: [] } },
    { col: 'web2_customer_wallet', empty: { wallets: {} } },
];

(async () => {
    const now = Date.now();
    for (const t of TARGETS) {
        const ref = db.collection(t.col).doc('main');
        const snap = await ref.get();
        const before = snap.exists ? JSON.stringify(snap.data()?.data || {}).length : 0;
        console.log(`[${t.col}/main] exists=${snap.exists} beforeDataBytes=${before}`);
        if (dryRun) continue;
        await ref.set({ data: t.empty, lastUpdated: now });
        console.log(`  → set EMPTY (lastUpdated=${now})`);
    }
    console.log(dryRun ? 'DRY RUN — no writes' : 'DONE — Firestore Web 2.0 docs cleared');
    process.exit(0);
})().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
