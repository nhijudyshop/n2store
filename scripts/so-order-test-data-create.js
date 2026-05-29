// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test data scripts for so-order — eval qua persistent browser session.
//   Create: bash scripts/so-order-test-data-load.sh create
//   Clean:  bash scripts/so-order-test-data-load.sh cleanup

const TS = '2026-05-29';
const S = window.SoOrderStorage;
const state = S.load();
const img = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w || 300}/${h || 300}`;
const data = {
    'tab-vn': {
        batch: 'TEST-BATCH-VN-001',
        caseCount: 12,
        weightKg: 80,
        contractAmount: 15000000,
        contractCurrency: 'VND',
        nccs: [
            {
                name: 'TEST-NCC-AOQUOC-QC',
                products: [
                    {
                        name: 'TEST-AO-THUN-FORM-RONG',
                        variant: 'Trắng - M',
                        qty: 50,
                        sell: 180000,
                        cost: 120000,
                        img: img('vn1'),
                    },
                    {
                        name: 'TEST-AO-THUN-FORM-RONG',
                        variant: 'Đen - L',
                        qty: 30,
                        sell: 180000,
                        cost: 120000,
                        img: img('vn2'),
                    },
                    {
                        name: 'TEST-AO-POLO-NAM',
                        variant: 'Xám - M',
                        qty: 25,
                        sell: 220000,
                        cost: 150000,
                        img: img('vn3'),
                    },
                    {
                        name: 'TEST-AO-POLO-NAM',
                        variant: 'Xanh navy - L',
                        qty: 20,
                        sell: 220000,
                        cost: 150000,
                        img: img('vn4'),
                    },
                ],
            },
            {
                name: 'TEST-NCC-QUANJEAN-VN',
                products: [
                    {
                        name: 'TEST-QUAN-JEAN-RACH',
                        variant: 'Xanh đậm - 30',
                        qty: 18,
                        sell: 380000,
                        cost: 240000,
                        img: img('vn5'),
                    },
                    {
                        name: 'TEST-QUAN-JEAN-RACH',
                        variant: 'Xanh nhạt - 32',
                        qty: 15,
                        sell: 380000,
                        cost: 240000,
                        img: img('vn6'),
                    },
                    {
                        name: 'TEST-QUAN-KAKI-NU',
                        variant: 'Be - S',
                        qty: 22,
                        sell: 290000,
                        cost: 180000,
                        img: img('vn7'),
                    },
                    {
                        name: 'TEST-QUAN-KAKI-NU',
                        variant: 'Đen - M',
                        qty: 28,
                        sell: 290000,
                        cost: 180000,
                        img: img('vn8'),
                    },
                ],
            },
        ],
    },
    'tab-cn': {
        batch: 'TEST-BATCH-CN-001',
        caseCount: 25,
        weightKg: 180,
        contractAmount: 45000,
        contractCurrency: 'CNY',
        nccs: [
            {
                name: 'TEST-NCC-GUANGZHOU-A',
                products: [
                    {
                        name: 'TEST-DAM-LEN-DAI',
                        variant: 'Hồng - Free size',
                        qty: 40,
                        sell: 450000,
                        cost: 280000,
                        img: img('cn1'),
                    },
                    {
                        name: 'TEST-DAM-LEN-DAI',
                        variant: 'Trắng - Free size',
                        qty: 35,
                        sell: 450000,
                        cost: 280000,
                        img: img('cn2'),
                    },
                    {
                        name: 'TEST-CHAN-VAY-XOE',
                        variant: 'Đen - M',
                        qty: 30,
                        sell: 320000,
                        cost: 200000,
                        img: img('cn3'),
                    },
                    {
                        name: 'TEST-CHAN-VAY-XOE',
                        variant: 'Be - L',
                        qty: 28,
                        sell: 320000,
                        cost: 200000,
                        img: img('cn4'),
                    },
                ],
            },
            {
                name: 'TEST-NCC-SHENZHEN-B',
                products: [
                    {
                        name: 'TEST-TUI-XACH-NU',
                        variant: 'Đen',
                        qty: 50,
                        sell: 520000,
                        cost: 320000,
                        img: img('cn5'),
                    },
                    {
                        name: 'TEST-TUI-XACH-NU',
                        variant: 'Trắng',
                        qty: 45,
                        sell: 520000,
                        cost: 320000,
                        img: img('cn6'),
                    },
                    {
                        name: 'TEST-GIAY-SNEAKER',
                        variant: '38',
                        qty: 20,
                        sell: 680000,
                        cost: 420000,
                        img: img('cn7'),
                    },
                    {
                        name: 'TEST-GIAY-SNEAKER',
                        variant: '39',
                        qty: 25,
                        sell: 680000,
                        cost: 420000,
                        img: img('cn8'),
                    },
                ],
            },
        ],
    },
    'tab-kr': {
        batch: 'TEST-BATCH-KR-001',
        caseCount: 8,
        weightKg: 40,
        contractAmount: 2800000,
        contractCurrency: 'KRW',
        nccs: [
            {
                name: 'TEST-NCC-DONGDAEMUN-K',
                products: [
                    {
                        name: 'TEST-AO-LEN-COLAU',
                        variant: 'Trắng - S',
                        qty: 15,
                        sell: 720000,
                        cost: 480000,
                        img: img('kr1'),
                    },
                    {
                        name: 'TEST-AO-LEN-COLAU',
                        variant: 'Kem - M',
                        qty: 18,
                        sell: 720000,
                        cost: 480000,
                        img: img('kr2'),
                    },
                    {
                        name: 'TEST-VAY-XOA-KOREA',
                        variant: 'Đen - Free',
                        qty: 12,
                        sell: 850000,
                        cost: 560000,
                        img: img('kr3'),
                    },
                    {
                        name: 'TEST-VAY-XOA-KOREA',
                        variant: 'Hồng - Free',
                        qty: 14,
                        sell: 850000,
                        cost: 560000,
                        img: img('kr4'),
                    },
                ],
            },
        ],
    },
};
const result = { tabs: {}, totalRows: 0 };
for (const [tabId, cfg] of Object.entries(data)) {
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) {
        result.tabs[tabId] = 'TAB_NOT_FOUND';
        continue;
    }
    let ship = S.findShipment(tab, { date: TS, batch: cfg.batch });
    if (!ship) {
        ship = S.addShipment(state, tabId, {
            date: TS,
            batch: cfg.batch,
            caseCount: cfg.caseCount,
            weightKg: cfg.weightKg,
            contractAmount: cfg.contractAmount,
            contractCurrency: cfg.contractCurrency,
        });
    }
    let rowsAdded = 0;
    for (const ncc of cfg.nccs) {
        for (const p of ncc.products) {
            S.addRow(state, tabId, ship.id, {
                supplier: ncc.name,
                productName: p.name,
                variant: p.variant,
                qty: p.qty,
                sellPrice: p.sell,
                costPrice: p.cost,
                productImage: p.img,
                invoiceImage: p.img.replace('/300/300', '/600/200'),
                note: 'Auto-test data — claude code 2026-05-29',
                costNote: 'NCC: ' + ncc.name,
                status: 'draft',
            });
            rowsAdded++;
        }
    }
    result.tabs[tabId] = { shipId: ship.id, rowsAdded };
    result.totalRows += rowsAdded;
}
// Force-push to Firestore + flush so reload doesn't wipe
if (S.Sync) {
    S.Sync.pushToFirestore(state);
    await S.Sync.flush();
    result.firestorePushed = true;
}
return JSON.stringify(result);
