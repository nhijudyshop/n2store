// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Seed fake demo data vào Web 2.0 Firestore + Render:
//   - so_order_v2/main: ~15 NCC, 3 tabs, ~80 rows over Jan–May 2026
//   - supplier_wallet_v1/main: payment + return tx cho ~10 NCC để running balance đẹp
//   - web2_products (Render): ~40 sản phẩm
//
// Tất cả tên NCC + SP có suffix "(DEMO)" để dễ phân biệt + xóa sau.
//
// Mục đích: user xem trang web2/supplier-debt/, web2/products/ với data dày
// hơn (~15 NCC thay vì 3, ~40 SP thay vì 0). KHÔNG đụng prod legacy.
//
// Usage:
//   node scripts/seed-fake-web2-demo.mjs                 # seed all (so-order + wallet + products)
//   node scripts/seed-fake-web2-demo.mjs --only soorder  # chỉ seed so-order
//   node scripts/seed-fake-web2-demo.mjs --only wallet   # chỉ seed wallet
//   node scripts/seed-fake-web2-demo.mjs --only products # chỉ seed products
//   node scripts/seed-fake-web2-demo.mjs --merge         # giữ data cũ, append (default)
//   node scripts/seed-fake-web2-demo.mjs --replace       # xóa hết DEMO data cũ trước
//   node scripts/seed-fake-web2-demo.mjs --base http://localhost:8080
import { chromium } from 'playwright';

const ARGS = (() => {
    const o = {
        only: null, // null | 'soorder' | 'wallet' | 'products'
        replace: false,
        base: 'http://localhost:8080',
        renderBase: 'https://chatomni-proxy.nhijudyshop.workers.dev',
    };
    for (let i = 2; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a === '--only') o.only = process.argv[++i];
        else if (a === '--replace') o.replace = true;
        else if (a === '--merge') o.replace = false;
        else if (a === '--base') o.base = process.argv[++i];
        else if (a === '--render') o.renderBase = process.argv[++i];
    }
    return o;
})();

const DEMO_TAG = '(DEMO)';

const SUPPLIERS = [
    { name: 'Quảng Châu Fashion ' + DEMO_TAG, tab: 'qchau', city: 'Quảng Châu' },
    { name: 'Shenzhen Hub ' + DEMO_TAG, tab: 'qchau', city: 'Shenzhen' },
    { name: 'Hồng Kông Wholesale ' + DEMO_TAG, tab: 'hkong', city: 'Hồng Kông' },
    { name: 'Hà Nội Bigstore ' + DEMO_TAG, tab: 'hanoi', city: 'Hà Nội' },
    { name: 'Hà Nội Premium ' + DEMO_TAG, tab: 'hanoi', city: 'Hà Nội' },
    { name: 'Sài Gòn Fashion ' + DEMO_TAG, tab: 'hanoi', city: 'Sài Gòn' },
    { name: 'NCC Long Biên ' + DEMO_TAG, tab: 'hanoi', city: 'Hà Nội' },
    { name: 'NCC Đông Anh ' + DEMO_TAG, tab: 'hanoi', city: 'Hà Nội' },
    { name: 'Yiwu Trading ' + DEMO_TAG, tab: 'qchau', city: 'Yiwu' },
    { name: 'NCC Bình Tân ' + DEMO_TAG, tab: 'hanoi', city: 'Sài Gòn' },
    { name: 'NCC Tân Bình ' + DEMO_TAG, tab: 'hanoi', city: 'Sài Gòn' },
    { name: 'NCC Hải Phòng ' + DEMO_TAG, tab: 'hanoi', city: 'Hải Phòng' },
    { name: 'NCC Đà Nẵng ' + DEMO_TAG, tab: 'hanoi', city: 'Đà Nẵng' },
    { name: 'Guangzhou Garment ' + DEMO_TAG, tab: 'qchau', city: 'Quảng Châu' },
    { name: 'Bangkok Supplier ' + DEMO_TAG, tab: 'hanoi', city: 'Bangkok' },
];

const PRODUCT_NAMES = [
    'Áo Thun Cotton',
    'Áo Sơ Mi Trắng',
    'Áo Polo',
    'Áo Khoác Bomber',
    'Áo Khoác Dù',
    'Áo Len Cổ Lọ',
    'Áo Hoodie Oversize',
    'Quần Jean Skinny',
    'Quần Jean Slim',
    'Quần Tây Âu',
    'Quần Short Khaki',
    'Quần Jogger',
    'Váy Liền Maxi',
    'Váy Bút Chì',
    'Đầm Xòe',
    'Đầm Body',
    'Chân Váy Xếp Ly',
    'Túi Xách Tote',
    'Túi Đeo Chéo',
    'Ví Cầm Tay',
    'Balo Du Lịch',
    'Giày Sneaker',
    'Giày Cao Gót',
    'Sandal Quai Hậu',
    'Mũ Lưỡi Trai',
    'Mũ Bucket',
    'Khăn Lụa',
    'Thắt Lưng Da',
    'Kính Mát Vintage',
    'Đồng Hồ Đeo Tay',
    'Áo Khoác Da',
    'Áo Sweater Len',
    'Quần Culottes',
    'Áo Croptop',
    'Set Áo Quần',
    'Đầm Dự Tiệc',
    'Áo Vest Nữ',
    'Áo Cardigan',
    'Quần Yoga',
    'Bộ Đồ Ngủ Lụa',
];

const VARIANTS = ['S', 'M', 'L', 'XL', 'Free Size'];
const COLORS = ['Đen', 'Trắng', 'Be', 'Xanh Navy', 'Nâu', 'Hồng Pastel', 'Xám', 'Đỏ'];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function uuid(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}
function isoDate(year, month, day) {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function buildSoOrderData() {
    // 3 tabs: HÀ NỘI (VND), QUẢNG CHÂU (CNY rate 3500), HỒNG KÔNG (HKD rate 3300)
    const tabs = [
        {
            id: 'demo_hanoi',
            label: 'HÀ NỘI ' + DEMO_TAG,
            currency: 'VND',
            rate: 1,
            shipments: [],
        },
        {
            id: 'demo_qchau',
            label: 'QUẢNG CHÂU ' + DEMO_TAG,
            currency: 'CNY',
            rate: 3500,
            shipments: [],
        },
        {
            id: 'demo_hkong',
            label: 'HỒNG KÔNG ' + DEMO_TAG,
            currency: 'HKD',
            rate: 3300,
            shipments: [],
        },
    ];
    const tabsByKey = { hanoi: tabs[0], qchau: tabs[1], hkong: tabs[2] };

    // Shipments distributed across Jan–May 2026
    const monthDays = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31 };
    let totalRows = 0;

    for (const supplier of SUPPLIERS) {
        const tab = tabsByKey[supplier.tab];
        const shipmentCount = randInt(2, 4);
        const isVnd = tab.currency === 'VND';

        for (let s = 0; s < shipmentCount; s++) {
            const month = randInt(1, 5);
            const day = randInt(1, monthDays[month]);
            const date = isoDate(2026, month, day);
            const rowCount = randInt(2, 6);
            const rows = [];
            for (let r = 0; r < rowCount; r++) {
                const product = pickRandom(PRODUCT_NAMES);
                const variant = `${pickRandom(VARIANTS)}/${pickRandom(COLORS)}`;
                const qty = randInt(3, 30);
                // VND tab: cost 80k–500k; CNY/HKD tab: 30¥–250¥
                const costPrice = isVnd ? randInt(80, 500) * 1000 : randInt(30, 250);
                const sellPrice = Math.round(costPrice * (1.4 + Math.random() * 1.2));
                rows.push({
                    id: uuid('row'),
                    supplier: supplier.name,
                    productName: product,
                    variant,
                    qty,
                    costPrice,
                    sellPrice,
                    note: '',
                    costNote: '',
                    productImage: '',
                    invoiceImage: '',
                    status: pickRandom(['received', 'received', 'ordered', 'received']),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                totalRows++;
            }
            tab.shipments.push({
                id: uuid('ship'),
                date,
                rows,
            });
        }
    }

    // Sort shipments by date asc per tab
    for (const tab of tabs) {
        tab.shipments.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    return { tabs, totalRows };
}

function buildWalletTransactions(suppliers, soData) {
    // For each supplier with totalPurchased > 0, generate 0-2 payments + 0-1 returns
    // so that running balance has movements but ending != 0 (still some debt).
    //
    // Returns: { [supplier]: [tx,...] } indexed by canonical supplier name.
    const totalsBySupplier = {};
    for (const tab of soData.tabs) {
        const rate = tab.currency === 'VND' ? 1 : tab.rate;
        for (const sh of tab.shipments) {
            for (const r of sh.rows) {
                const total = r.qty * r.costPrice * rate;
                totalsBySupplier[r.supplier] = (totalsBySupplier[r.supplier] || 0) + total;
            }
        }
    }
    const out = {};
    for (const [supplierName, totalVnd] of Object.entries(totalsBySupplier)) {
        const txs = [];
        // 1-2 payments mid-period (covering 30-70% của total)
        const paymentCount = randInt(0, 2);
        let paid = 0;
        for (let i = 0; i < paymentCount; i++) {
            const amount = Math.round(totalVnd * (0.2 + Math.random() * 0.25));
            paid += amount;
            const tsDay = randInt(60, 130); // days ago
            txs.push({
                id: uuid('tx'),
                ts: Date.now() - tsDay * 24 * 3600 * 1000,
                type: 'payment',
                amount,
                note: 'CK thanh toán đợt ' + (i + 1) + ' ' + DEMO_TAG,
                ref: { source: 'demo' },
            });
        }
        // 0-1 return
        if (Math.random() < 0.35) {
            const amount = Math.round(totalVnd * (0.05 + Math.random() * 0.1));
            txs.push({
                id: uuid('tx'),
                ts: Date.now() - randInt(20, 80) * 24 * 3600 * 1000,
                type: 'return',
                amount,
                note: 'Trả hàng lỗi ' + DEMO_TAG,
                ref: { source: 'demo' },
            });
        }
        if (txs.length) out[supplierName] = txs;
    }
    return out;
}

function buildProductCodes() {
    // 40 fake products with code DEMO-001 ... DEMO-040
    return PRODUCT_NAMES.map((name, i) => {
        const code = 'DEMO-' + String(i + 1).padStart(3, '0');
        const variant = `${pickRandom(VARIANTS)}/${pickRandom(COLORS)}`;
        const costPrice = randInt(80, 400) * 1000;
        return {
            code,
            name: name + ' ' + DEMO_TAG,
            price: Math.round(costPrice * (1.4 + Math.random() * 0.8)),
            originalPrice: costPrice,
            stock: randInt(0, 100),
            note: 'Sản phẩm demo seed',
            variant,
            category: pickRandom(['Áo', 'Quần', 'Váy/Đầm', 'Phụ kiện', 'Giày dép']),
            tags: ['demo'],
        };
    });
}

async function seedSoOrderAndWallet(page, { replace }) {
    console.log('[seed] Building so-order + wallet data…');
    const soData = buildSoOrderData();
    const walletTxs = buildWalletTransactions(SUPPLIERS, soData);
    console.log(
        `[seed] so-order: ${soData.tabs.length} tabs, ${soData.tabs.reduce((s, t) => s + t.shipments.length, 0)} shipments, ${soData.totalRows} rows`
    );
    console.log(`[seed] wallet tx: ${Object.values(walletTxs).flat().length} transactions`);

    await page.evaluate(
        async ({ soData, walletTxs, replace, demoTag }) => {
            const db = firebase.firestore();

            // ---- so_order_v2/main ----
            const soSnap = await db.collection('so_order_v2').doc('main').get();
            const existing = soSnap.exists ? soSnap.data()?.data || { tabs: [] } : { tabs: [] };
            let nextTabs;
            if (replace) {
                nextTabs = existing.tabs.filter((t) => !String(t.label || '').includes(demoTag));
                nextTabs = nextTabs.concat(soData.tabs);
            } else {
                // Merge: append shipments to existing demo tabs if exist; else add new tab
                nextTabs = [...existing.tabs];
                for (const newTab of soData.tabs) {
                    const idx = nextTabs.findIndex((t) => t.id === newTab.id);
                    if (idx >= 0) {
                        nextTabs[idx] = {
                            ...nextTabs[idx],
                            shipments: [
                                ...(nextTabs[idx].shipments || []),
                                ...newTab.shipments,
                            ],
                        };
                    } else {
                        nextTabs.push(newTab);
                    }
                }
            }
            await db
                .collection('so_order_v2')
                .doc('main')
                .set(
                    { data: { ...existing, tabs: nextTabs }, lastUpdated: Date.now() },
                    { merge: true }
                );

            // ---- supplier_wallet_v1/main ----
            const swSnap = await db.collection('supplier_wallet_v1').doc('main').get();
            const swState = swSnap.exists
                ? swSnap.data()?.data || { wallets: {} }
                : { wallets: {} };
            for (const [supplier, txs] of Object.entries(walletTxs)) {
                const w = swState.wallets[supplier] || {
                    supplier,
                    totalPurchased: 0,
                    paidAmount: 0,
                    returnedAmount: 0,
                    balance: 0,
                    returnedRowIds: {},
                    transactions: [],
                };
                w.supplier = supplier;
                if (replace) {
                    w.transactions = (w.transactions || []).filter(
                        (t) => t.ref?.source !== 'demo'
                    );
                    w.paidAmount = w.transactions.reduce(
                        (s, t) => s + (t.type === 'payment' ? t.amount : 0),
                        0
                    );
                    w.returnedAmount = w.transactions.reduce(
                        (s, t) => s + (t.type === 'return' ? t.amount : 0),
                        0
                    );
                }
                for (const tx of txs) {
                    w.transactions.push(tx);
                    if (tx.type === 'payment') w.paidAmount += tx.amount;
                    if (tx.type === 'return') w.returnedAmount += tx.amount;
                }
                swState.wallets[supplier] = w;
            }
            await db
                .collection('supplier_wallet_v1')
                .doc('main')
                .set({ data: swState, lastUpdated: Date.now() }, { merge: true });

            return 'ok';
        },
        { soData, walletTxs, replace, demoTag: DEMO_TAG }
    );

    console.log('[seed] ✓ so-order + wallet written to Firestore.');
}

async function seedProducts({ renderBase, replace }) {
    console.log('[seed] Seeding web2_products via Render…');
    const products = buildProductCodes();
    let created = 0,
        skipped = 0,
        errors = 0;
    for (const p of products) {
        try {
            const r = await fetch(`${renderBase}/api/web2-products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p),
            });
            if (r.status === 409) {
                skipped++;
            } else if (r.ok) {
                created++;
            } else {
                errors++;
                console.warn(`  ✗ ${p.code}: HTTP ${r.status}`);
            }
        } catch (e) {
            errors++;
            console.warn(`  ✗ ${p.code}: ${e.message}`);
        }
    }
    console.log(`[seed] web2_products: ${created} created, ${skipped} skipped (exists), ${errors} errors.`);
}

async function main() {
    console.log('========== SEED FAKE WEB 2.0 DEMO DATA ==========');
    console.log('Mode:', ARGS.replace ? 'REPLACE (xóa demo cũ trước)' : 'MERGE (append vào data hiện có)');
    console.log('Only:', ARGS.only || 'all');

    const needBrowser = !ARGS.only || ARGS.only === 'soorder' || ARGS.only === 'wallet';
    let browser, ctx, page;
    if (needBrowser) {
        browser = await chromium.launch({ headless: true });
        ctx = await browser.newContext();
        page = await ctx.newPage();
        console.log('[seed] Login…');
        await page.goto(`${ARGS.base}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#username', { timeout: 15000 });
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin@@');
        await page.locator('#password').press('Enter');
        await page
            .waitForFunction(() => !!localStorage.getItem('loginindex_auth'), { timeout: 20000 })
            .catch(() => {});
        await page.goto(`${ARGS.base}/web2/supplier-debt/index.html?t=${Date.now()}`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForFunction(() => typeof firebase !== 'undefined' && firebase.firestore, {
            timeout: 10000,
        });
    }

    try {
        if (!ARGS.only || ARGS.only === 'soorder' || ARGS.only === 'wallet') {
            await seedSoOrderAndWallet(page, { replace: ARGS.replace });
        }
        if (!ARGS.only || ARGS.only === 'products') {
            await seedProducts({ renderBase: ARGS.renderBase, replace: ARGS.replace });
        }
        console.log('========== ✓ DONE ==========');
    } finally {
        if (browser) await browser.close();
    }
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
