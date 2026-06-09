// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Reconciled NET (2026-06-06)
 *
 * Bằng chứng cho thay đổi: KPI NET = (final TPOS − BASE) thay vì cộng dồn audit log.
 * Audit log drift (thêm trùng nhiều lần / xóa ảo) KHÔNG còn ảnh hưởng NET; nó chỉ
 * dùng để PHÂN BỔ (ai thêm → cap theo NET thật). Cổng "tick KPI" giữ nguyên.
 *
 * Test này replicate phần lõi snapshot-NET của calculateNetKPI (kpi-manager.js)
 * như pure function (giống các test KPI khác trong repo) + xác thực đúng case
 * đơn 260600214 / NJD/2026/70868 mà user báo lỗi (hệ thống cũ ra 10.000đ, đúng 5.000đ).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const KPI_PER_PRODUCT = 5000;

/**
 * Lõi reconciled NET. Mô phỏng kpi-manager.js calculateNetKPI (nhánh reconciled):
 *  - baseProducts: [{ProductId, Quantity}] (BASE snapshot)
 *  - finalProducts: [{ProductId, ProductCode, ProductName, Quantity}] (đơn thật TPOS)
 *  - auditLogs: [{productId, action, quantity, userId, createdAt}] (chỉ để phân bổ)
 *  - flags: { [productId]: true } — SP được tick KPI
 *  - baseTemplateIds / baseNameSet: để bỏ qua đổi biến thể (ở đây test bằng tham số tùy chọn)
 */
function reconciledNetKPI(baseProducts, finalProducts, auditLogs, flags, opts = {}) {
    const baseProductIds = new Set((baseProducts || []).map((p) => Number(p.ProductId)));
    const baseQtyByPid = new Map();
    for (const p of baseProducts || []) {
        const k = Number(p.ProductId);
        baseQtyByPid.set(k, (baseQtyByPid.get(k) || 0) + (Number(p.Quantity) || 1));
    }
    const baseTemplateIds = new Set(opts.baseTemplateIds || []);
    const templateOf = opts.templateOf || {}; // productCode -> templateId

    // audit adds per pid (để phân bổ last-add-wins)
    const addsByPid = {};
    for (const log of auditLogs || []) {
        if (log.action !== 'add') continue;
        const pid = String(log.productId);
        (addsByPid[pid] = addsByPid[pid] || []).push(log);
    }
    const attribute = (pid, n) => {
        const out = [];
        if (n <= 0) return out;
        const adds = (addsByPid[pid] || [])
            .slice()
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        let remaining = n;
        for (let i = adds.length - 1; i >= 0 && remaining > 0; i--) {
            const take = Math.min(adds[i].quantity || 0, remaining);
            if (take > 0) out.push({ userId: adds[i].userId, qty: take });
            remaining -= take;
        }
        if (remaining > 0) out.push({ userId: 'unknown', qty: remaining });
        return out;
    };

    const details = {};
    let totalNetTicked = 0;
    let kpiTicked = 0;
    let excludedCount = 0;
    const perUserNet = {};

    for (const fp of finalProducts || []) {
        const pidNum = fp.ProductId != null ? Number(fp.ProductId) : null;
        const finalQty = Number(fp.Quantity) || 0;
        if (finalQty <= 0) continue;
        let net = 0;
        let baseQty = 0;
        if (pidNum != null && baseProductIds.has(pidNum)) {
            baseQty = baseQtyByPid.get(pidNum) || 0;
            net = Math.max(0, finalQty - baseQty); // phần dư
        } else {
            const tpl = fp.ProductCode ? templateOf[fp.ProductCode] : null;
            if (tpl && baseTemplateIds.has(Number(tpl))) continue; // đổi biến thể → không tính
            net = finalQty; // SP mới
        }
        if (net <= 0) continue;

        const pid = pidNum != null ? String(pidNum) : fp.ProductCode;
        const ticked = flags && flags[pid] === true;
        details[pid] = { code: fp.ProductCode, net, real: finalQty, baseQty, ticked };

        const entries = attribute(pid, net);
        if (ticked) {
            totalNetTicked += net;
            kpiTicked += net * KPI_PER_PRODUCT;
            for (const e of entries) perUserNet[e.userId] = (perUserNet[e.userId] || 0) + e.qty;
        } else {
            excludedCount++;
        }
    }

    return {
        details,
        netProducts: totalNetTicked,
        kpiAmount: kpiTicked,
        excludedCount,
        perUserNet,
    };
}

describe('KPI reconciled NET — đối chiếu đơn thật TPOS', () => {
    it('đơn 260600214: MM15 (tick) qty1 = 5.000đ, KHÔNG phải 10.000đ', () => {
        // BASE = 4 SP gốc.
        const base = [
            { ProductId: 1, Quantity: 1 }, // B703D
            { ProductId: 2, Quantity: 1 }, // B703XN
            { ProductId: 3, Quantity: 1 }, // B2652X1
            { ProductId: 4, Quantity: 1 }, // Q542
        ];
        // Đơn thật cuối trên TPOS = 6 SP, mỗi món qty 1.
        const final = [
            { ProductId: 1, ProductCode: 'B703D', Quantity: 1 },
            { ProductId: 2, ProductCode: 'B703XN', Quantity: 1 },
            { ProductId: 3, ProductCode: 'B2652X1', Quantity: 1 },
            { ProductId: 4, ProductCode: 'Q542', Quantity: 1 },
            { ProductId: 5, ProductCode: 'Q439H', Quantity: 1 }, // mới, CHƯA tick
            { ProductId: 6, ProductCode: 'MM15', Quantity: 1 }, // mới, ĐÃ tick
        ];
        // Audit log lệch: MM15 +Thêm×3 −Xóa×1; Q439H +Thêm −Xóa (xóa ảo).
        const audit = [
            {
                productId: 5,
                action: 'add',
                quantity: 1,
                userId: 'my',
                createdAt: '2026-06-05T02:33:00Z',
            },
            {
                productId: 6,
                action: 'add',
                quantity: 1,
                userId: 'my',
                createdAt: '2026-06-05T06:43:00Z',
            },
            {
                productId: 6,
                action: 'add',
                quantity: 1,
                userId: 'my',
                createdAt: '2026-06-05T06:44:00Z',
            },
            {
                productId: 6,
                action: 'remove',
                quantity: 1,
                userId: 'hanh',
                createdAt: '2026-06-05T07:56:00Z',
            },
            {
                productId: 6,
                action: 'add',
                quantity: 1,
                userId: 'hanh',
                createdAt: '2026-06-05T07:56:30Z',
            },
            {
                productId: 5,
                action: 'remove',
                quantity: 1,
                userId: 'hanh',
                createdAt: '2026-06-05T08:16:00Z',
            },
        ];
        const flags = { 6: true }; // chỉ MM15 được tick

        const r = reconciledNetKPI(base, final, audit, flags);

        // MM15: NET = final 1 − base 0 = 1 (KHÔNG phải audit 3−1=2).
        expect(r.details['6'].net).toBe(1);
        expect(r.details['6'].real).toBe(1);
        // Q439H: NET thật = 1 (xóa ảo bị bỏ qua), nhưng CHƯA tick → không tính KPI.
        expect(r.details['5'].net).toBe(1);
        // Tổng KPI tính = chỉ MM15 = 5.000đ (đúng — hệ thống cũ ra 10.000đ).
        expect(r.netProducts).toBe(1);
        expect(r.kpiAmount).toBe(5000);
        // Q439H là "món chưa tick".
        expect(r.excludedCount).toBe(1);
        // 4 SP base (qty không đổi) → net 0 → không xuất hiện trong details.
        expect(Object.keys(r.details).sort()).toEqual(['5', '6']);
    });

    it('NET độc lập với số lần audit thêm/xóa (chỉ phụ thuộc đơn thật)', () => {
        const base = [];
        const final = [{ ProductId: 9, ProductCode: 'X1', Quantity: 1 }];
        const flags = { 9: true };
        // Dù audit thêm 5 lần xóa 1, NET vẫn = 1 (đơn thật qty 1).
        const noisyAudit = [
            {
                productId: 9,
                action: 'add',
                quantity: 1,
                userId: 'a',
                createdAt: '2026-06-05T01:00:00Z',
            },
            {
                productId: 9,
                action: 'add',
                quantity: 1,
                userId: 'a',
                createdAt: '2026-06-05T01:01:00Z',
            },
            {
                productId: 9,
                action: 'add',
                quantity: 1,
                userId: 'b',
                createdAt: '2026-06-05T01:02:00Z',
            },
            {
                productId: 9,
                action: 'add',
                quantity: 1,
                userId: 'b',
                createdAt: '2026-06-05T01:03:00Z',
            },
            {
                productId: 9,
                action: 'add',
                quantity: 1,
                userId: 'c',
                createdAt: '2026-06-05T01:04:00Z',
            },
            {
                productId: 9,
                action: 'remove',
                quantity: 1,
                userId: 'c',
                createdAt: '2026-06-05T01:05:00Z',
            },
        ];
        const r = reconciledNetKPI(base, final, noisyAudit, flags);
        expect(r.netProducts).toBe(1);
        expect(r.kpiAmount).toBe(5000);
        // Phân bổ last-add-wins, cap theo NET=1 → người thêm gần nhất ('c').
        expect(r.perUserNet).toEqual({ c: 1 });
    });

    it('mua thêm số lượng SP đã có trong BASE → tính phần dư (final − base)', () => {
        const base = [{ ProductId: 7, Quantity: 1 }];
        const final = [{ ProductId: 7, ProductCode: 'Y1', Quantity: 3 }];
        const flags = { 7: true };
        const r = reconciledNetKPI(base, final, [], flags);
        expect(r.details['7'].net).toBe(2); // 3 − 1
        expect(r.kpiAmount).toBe(10000);
    });

    it('đổi biến thể (cùng template với BASE) → không tính KPI', () => {
        const base = [{ ProductId: 10, Quantity: 1 }]; // B1118T
        const final = [{ ProductId: 11, ProductCode: 'B1118N', Quantity: 1 }]; // cùng template
        const flags = { 11: true };
        const r = reconciledNetKPI(base, final, [], flags, {
            baseTemplateIds: [500],
            templateOf: { B1118N: 500 },
        });
        expect(r.netProducts).toBe(0);
        expect(r.kpiAmount).toBe(0);
        expect(Object.keys(r.details)).toEqual([]);
    });

    it('SP mới nhưng CHƯA tick → không tính KPI (giữ cổng tick)', () => {
        const base = [];
        const final = [{ ProductId: 12, ProductCode: 'Z1', Quantity: 2 }];
        const r = reconciledNetKPI(base, final, [], {} /* không tick */);
        expect(r.netProducts).toBe(0);
        expect(r.kpiAmount).toBe(0);
        expect(r.excludedCount).toBe(1);
    });
});

// ============================================================
// Staleness guard (fix race "chốt nhiều SP liên tiếp" — 2026-06-09)
// ============================================================
const SNAPSHOT_STALENESS_GRACE_MS = 1500;

/**
 * Mô phỏng điều kiện staleness guard trong calculateNetKPI (kpi-manager.js).
 * Trả true nếu có audit log MỚI HƠN snapshot.fetchedAt + grace → snapshot lỗi thời,
 * cần fetch lại đơn thật TPOS.
 */
function isSnapshotStale(snapshotFetchedAt, relevantLogs, graceMs = SNAPSHOT_STALENESS_GRACE_MS) {
    if (!snapshotFetchedAt) return false;
    const snapAt = new Date(snapshotFetchedAt).getTime();
    if (!Number.isFinite(snapAt)) return false;
    const latestActivityAt = (relevantLogs || []).reduce(
        (mx, l) => Math.max(mx, new Date(l.createdAt).getTime() || 0),
        0
    );
    return latestActivityAt > snapAt + graceMs;
}

describe('KPI snapshot staleness guard — phát hiện snapshot chụp giữa chừng', () => {
    // Data THẬT từ đơn 260600892 (fetch qua API 2026-06-09).
    it('đơn 260600892: snapshot chụp 03:13:36, Q739A1 thêm 03:13:48 → STALE', () => {
        const snapshotFetchedAt = '2026-06-09 03:13:36.224972+07:00';
        const relevantLogs = [
            {
                productId: 158614,
                action: 'add',
                createdAt: '2026-06-09 03:13:35.530179+07:00', // Q741A1 (trước snapshot)
            },
            {
                productId: 158616,
                action: 'add',
                createdAt: '2026-06-09 03:13:48.231146+07:00', // Q739A1 (SAU snapshot 12s)
            },
        ];
        expect(isSnapshotStale(snapshotFetchedAt, relevantLogs)).toBe(true);
    });

    // Data THẬT từ đơn 260601110.
    it('đơn 260601110: snapshot chụp 03:13:01.8, Q741A2 thêm 03:13:05 → STALE', () => {
        const snapshotFetchedAt = '2026-06-09 03:13:01.809515+07:00';
        const relevantLogs = [
            { productId: 158618, action: 'add', createdAt: '2026-06-09 03:13:01.112860+07:00' }, // Q739A2
            { productId: 158617, action: 'add', createdAt: '2026-06-09 03:13:05.475495+07:00' }, // Q741A2 (sau)
        ];
        expect(isSnapshotStale(snapshotFetchedAt, relevantLogs)).toBe(true);
    });

    it('snapshot chụp SAU mọi audit → KHÔNG stale (0 overhead, không refetch)', () => {
        const snapshotFetchedAt = '2026-06-09 04:00:00+07:00';
        const relevantLogs = [
            { productId: 1, action: 'add', createdAt: '2026-06-09 03:13:35+07:00' },
            { productId: 2, action: 'add', createdAt: '2026-06-09 03:13:48+07:00' },
        ];
        expect(isSnapshotStale(snapshotFetchedAt, relevantLogs)).toBe(false);
    });

    it('audit chỉ mới hơn trong khoảng grace (1s < 1.5s) → KHÔNG refetch thừa', () => {
        const snapshotFetchedAt = '2026-06-09 03:13:36.000+07:00';
        const relevantLogs = [
            { productId: 1, action: 'add', createdAt: '2026-06-09 03:13:37.000+07:00' }, // +1s
        ];
        expect(isSnapshotStale(snapshotFetchedAt, relevantLogs)).toBe(false);
    });

    it('fetchedAt thiếu / parse NaN → coi như không stale (an toàn, không crash)', () => {
        const logs = [{ productId: 1, action: 'add', createdAt: '2026-06-09 03:13:48+07:00' }];
        expect(isSnapshotStale(null, logs)).toBe(false);
        expect(isSnapshotStale('not-a-date', logs)).toBe(false);
    });

    // End-to-end: chứng minh refetch sửa đúng NET cho đơn 260600892.
    it('NET sai khi snapshot stale (1) → đúng khi đã fetch lại đơn TPOS (2)', () => {
        const base = [
            { ProductId: 157776, Quantity: 1 }, // Q449A2
            { ProductId: 158036, Quantity: 1 }, // Q548N
        ];
        const audit = [
            { productId: 158614, action: 'add', quantity: 1, userId: 'hanhlive', createdAt: '2026-06-09 03:13:35+07:00' },
            { productId: 158616, action: 'add', quantity: 1, userId: 'hanhlive', createdAt: '2026-06-09 03:13:48+07:00' },
        ];
        const flags = { 158614: true, 158616: true }; // cả 2 SP mới đều tick KPI

        // (A) Snapshot STALE — thiếu Q739A1 (158616) → NET đếm thiếu = 1, KPI 5.000đ.
        const staleFinal = [
            { ProductId: 157776, ProductCode: 'Q449A2', Quantity: 1 },
            { ProductId: 158036, ProductCode: 'Q548N', Quantity: 1 },
            { ProductId: 158614, ProductCode: 'Q741A1', Quantity: 1 },
        ];
        const rStale = reconciledNetKPI(base, staleFinal, audit, flags);
        expect(rStale.netProducts).toBe(1);
        expect(rStale.kpiAmount).toBe(5000);

        // (B) Sau refetch — snapshot tươi có ĐỦ cả Q741A1 + Q739A1 → NET = 2, KPI 10.000đ.
        const freshFinal = [
            ...staleFinal,
            { ProductId: 158616, ProductCode: 'Q739A1', Quantity: 1 },
        ];
        const rFresh = reconciledNetKPI(base, freshFinal, audit, flags);
        expect(rFresh.netProducts).toBe(2);
        expect(rFresh.kpiAmount).toBe(10000);
        expect(rFresh.perUserNet).toEqual({ hanhlive: 2 });
    });

    // Regression: source code phải còn chứa staleness guard (khóa hồi quy).
    it('kpi-manager.js có staleness guard gọi ensureKpiFinalSnapshot force=true', () => {
        const src = readFileSync(
            resolve(__dirname, '../../orders-report/js/managers/kpi-manager.js'),
            'utf-8'
        );
        expect(src).toContain('SNAPSHOT_STALENESS_GRACE_MS');
        expect(src).toMatch(/ensureKpiFinalSnapshot\([^)]*\{[^}]*force:\s*true/s);
        expect(src).toContain('latestActivityAt');
    });
});
