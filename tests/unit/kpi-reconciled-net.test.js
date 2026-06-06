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

    return { details, netProducts: totalNetTicked, kpiAmount: kpiTicked, excludedCount, perUserNet };
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
            { productId: 5, action: 'add', quantity: 1, userId: 'my', createdAt: '2026-06-05T02:33:00Z' },
            { productId: 6, action: 'add', quantity: 1, userId: 'my', createdAt: '2026-06-05T06:43:00Z' },
            { productId: 6, action: 'add', quantity: 1, userId: 'my', createdAt: '2026-06-05T06:44:00Z' },
            { productId: 6, action: 'remove', quantity: 1, userId: 'hanh', createdAt: '2026-06-05T07:56:00Z' },
            { productId: 6, action: 'add', quantity: 1, userId: 'hanh', createdAt: '2026-06-05T07:56:30Z' },
            { productId: 5, action: 'remove', quantity: 1, userId: 'hanh', createdAt: '2026-06-05T08:16:00Z' },
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
            { productId: 9, action: 'add', quantity: 1, userId: 'a', createdAt: '2026-06-05T01:00:00Z' },
            { productId: 9, action: 'add', quantity: 1, userId: 'a', createdAt: '2026-06-05T01:01:00Z' },
            { productId: 9, action: 'add', quantity: 1, userId: 'b', createdAt: '2026-06-05T01:02:00Z' },
            { productId: 9, action: 'add', quantity: 1, userId: 'b', createdAt: '2026-06-05T01:03:00Z' },
            { productId: 9, action: 'add', quantity: 1, userId: 'c', createdAt: '2026-06-05T01:04:00Z' },
            { productId: 9, action: 'remove', quantity: 1, userId: 'c', createdAt: '2026-06-05T01:05:00Z' },
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
