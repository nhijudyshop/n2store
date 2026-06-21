// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web 2.0 — Order auto-tag ENGINE (single source of truth).
// =========================================================
// Tag đơn hàng = AUTO-only, mỗi tag gắn 1 "trigger". Engine này là 1 NGUỒN cho:
//   - Trang Cấu hình "TAG đơn hàng" (web2/order-tags): danh sách trigger + mô tả.
//   - native-orders /load: tính autoTags + hasChoHang cho mỗi đơn (server-side,
//     authoritative, tự lành — KHÔNG lưu vào DB nên không drift).
//   - fast-sale-orders /from-native-order: chặn PBH khi đơn có SP "chờ hàng".
//
// Vì sao server-side: "âm mã" cần aggregate tồn kho + tổng SL giữ ở mọi đơn nháp;
// trạng thái SP (CHO_MUA) nằm ở web2_products. Client không có sẵn 2 thứ này →
// tính ở /load (cùng pool web2Db) là đúng chỗ. Xem CLAUDE.md "TAG đơn hàng".

const _ensured = new WeakSet();

// ---------------------------------------------------------------------------
// TRIGGER REGISTRY — metadata cho UI config + key của predicate. Toàn diện
// ("lấy hết trigger bên native-orders"). Thêm trigger mới: thêm vào đây + thêm
// predicate tương ứng ở PREDICATES. Trang config đọc qua GET /triggers (1 nguồn).
// ---------------------------------------------------------------------------
const TRIGGERS = [
    // Tồn kho / Sản phẩm
    {
        id: 'cho_hang',
        label: 'Chờ hàng',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn có ≥1 SP đang chờ hàng (web2_products.status = CHO_MUA — tồn 0, chờ NCC giao). Đơn này KHÔNG tạo được PBH, chỉ tạo Phiếu soạn hàng.',
    },
    {
        id: 'am_ma',
        label: 'Âm mã',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn nháp có SP mà tổng SL đang giữ ở các đơn nháp + đã lên PBH vượt tồn kho (over-sell). Vd tồn 2, đơn A giữ 1 + PBH B 2 → âm mã.',
    },
    {
        id: 'het_hang',
        label: 'Hết hàng (tồn 0)',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn có ≥1 SP tồn kho ≤ 0 (không tính SP chờ hàng).',
    },
    {
        id: 'mua_1_phan',
        label: 'Mua 1 phần',
        group: 'Tồn kho / Sản phẩm',
        desc: 'Đơn có ≥1 SP trạng thái MUA_1_PHAN (đã nhận một phần từ NCC, còn chờ phần còn lại).',
    },
    // PBH / Trạng thái
    {
        id: 'pbh_created',
        label: 'Phiếu bán hàng',
        group: 'PBH / Trạng thái',
        desc: 'Đã tạo PBH thành công cho đơn (đơn chuyển trạng thái "Đơn hàng" / có PBH liên kết).',
    },
    {
        id: 'pbh_chua_tt',
        label: 'PBH chưa thu đủ',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đã có PBH nhưng số tiền còn lại (COD/residual) > 0 — chưa thu đủ tiền.',
    },
    {
        id: 'is_draft',
        label: 'Đơn nháp',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đang ở trạng thái Nháp (chưa tạo PBH).',
    },
    {
        id: 'is_confirmed',
        label: 'Đã xác nhận',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đã xác nhận (trạng thái "Đơn hàng").',
    },
    {
        id: 'is_cancelled',
        label: 'Đã huỷ',
        group: 'PBH / Trạng thái',
        desc: 'Đơn đã huỷ.',
    },
    // Thanh toán
    {
        id: 'chua_nhan_ck',
        label: 'Chưa nhận CK',
        group: 'Thanh toán',
        desc: 'Đơn nháp chưa nhận tiền CK (chưa có CK xác nhận + số dư ví KH < tổng đơn).',
    },
    {
        id: 'da_nhan_ck',
        label: 'Đã nhận CK',
        group: 'Thanh toán',
        desc: 'Đơn đã có CK xác nhận hoặc số dư ví KH ≥ tổng đơn.',
    },
    {
        id: 'co_coc',
        label: 'Có đặt cọc',
        group: 'Thanh toán',
        desc: 'Đơn có tiền đặt cọc > 0.',
    },
    // Giao hàng / Địa chỉ
    {
        id: 'thieu_dia_chi',
        label: 'Thiếu địa chỉ',
        group: 'Giao hàng',
        desc: 'Đơn chưa có địa chỉ giao hàng.',
    },
    {
        id: 'thieu_sdt',
        label: 'Thiếu SĐT',
        group: 'Giao hàng',
        desc: 'Đơn chưa có số điện thoại.',
    },
    {
        id: 'ship_tinh',
        label: 'Ship tỉnh',
        group: 'Giao hàng',
        desc: 'Phương thức giao hàng là ship tỉnh (auto-detect theo địa chỉ).',
    },
    {
        id: 'ship_tp',
        label: 'Ship nội thành',
        group: 'Giao hàng',
        desc: 'Phương thức giao hàng nội thành / trung tâm TP.',
    },
    // Cấu trúc đơn
    {
        id: 'gop_don',
        label: 'Đơn gộp',
        group: 'Cấu trúc đơn',
        desc: 'Đơn được gộp từ nhiều đơn (merge).',
    },
    {
        id: 'don_tach',
        label: 'Đơn tách',
        group: 'Cấu trúc đơn',
        desc: 'Đơn tách (split_index ≥ 2 — vd 31-2, 31-3).',
    },
    {
        id: 'da_in',
        label: 'Đã in bill',
        group: 'Cấu trúc đơn',
        desc: 'Đơn đã in bill/phiếu ≥ 1 lần (chống in trùng).',
    },
    // Kênh
    {
        id: 'tu_livestream',
        label: 'Từ Livestream',
        group: 'Kênh',
        desc: 'Đơn từ kênh livestream (web2_livestream).',
    },
    {
        id: 'tu_inbox',
        label: 'Từ Inbox',
        group: 'Kênh',
        desc: 'Đơn từ kênh inbox (web2_inbox).',
    },
];

const TRIGGER_IDS = new Set(TRIGGERS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Predicate: (order, productFlags, ctx) → boolean. order là object đã enrich ở
// /load (có pbhResidual/pbhTotal/ckSignal/walletBalance/...). productFlags là
// kết quả orderProductFlags(). Không throw — engine bọc try/catch ở ngoài.
// ---------------------------------------------------------------------------
function _hasText(s) {
    return !!(s && String(s).trim());
}
function _deliveryText(o) {
    return `${o.deliveryMethod || ''} ${o.deliveryMethodLabel || ''}`.toLowerCase();
}

const PREDICATES = {
    cho_hang: (o, f) => f.choHang,
    am_ma: (o, f) => f.amMa,
    het_hang: (o, f) => f.hetHang,
    mua_1_phan: (o, f) => f.mua1Phan,

    pbh_created: (o) => o.status === 'confirmed' || Number(o.pbhTotal || 0) > 0,
    pbh_chua_tt: (o) => Number(o.pbhTotal || 0) > 0 && Number(o.pbhResidual || 0) > 0,
    is_draft: (o) => o.status === 'draft',
    is_confirmed: (o) => o.status === 'confirmed',
    is_cancelled: (o) => o.status === 'cancelled',

    chua_nhan_ck: (o) =>
        o.status === 'draft' &&
        !(o.ckSignal && o.ckSignal.status === 'confirmed') &&
        Number(o.walletBalance || 0) < Number(o.totalAmount || 0),
    da_nhan_ck: (o) =>
        (o.ckSignal && o.ckSignal.status === 'confirmed') ||
        (Number(o.totalAmount || 0) > 0 &&
            Number(o.walletBalance || 0) >= Number(o.totalAmount || 0)),
    co_coc: (o) => Number(o.deposit || 0) > 0,

    thieu_dia_chi: (o) => !_hasText(o.address),
    thieu_sdt: (o) => !_hasText(o.phone),
    ship_tinh: (o) => /tinh|tỉnh/i.test(_deliveryText(o)),
    ship_tp: (o) =>
        /tp|thanh\s*pho|thành\s*phố|noi\s*thanh|nội\s*thành|trung\s*tam|trung\s*tâm/i.test(
            _deliveryText(o)
        ),

    gop_don: (o) => Array.isArray(o.mergedCodes) && o.mergedCodes.length > 0,
    don_tach: (o) => Number(o.splitIndex || 0) >= 2,
    da_in: (o) => Number(o.printCount || 0) > 0,

    tu_livestream: (o) =>
        !o.channel || o.channel === 'web2_livestream' || o.channel === 'livestream',
    tu_inbox: (o) => o.channel === 'web2_inbox' || o.channel === 'inbox',
};

// ---------------------------------------------------------------------------
// Per-order product flags từ ctx (status map + held map). 1 lần / đơn.
//   - choHang : có SP status CHO_MUA.
//   - mua1Phan: có SP status MUA_1_PHAN.
//   - hetHang : có SP (không phải CHO_MUA) tồn ≤ 0.
//   - amMa    : đơn NHÁP có SP (không phải CHO_MUA) mà tổng SL giữ ở các đơn nháp
//               > tồn kho hiện tại. Lưu ý: tạo PBH ĐÃ trừ web2_products.stock →
//               held_drafts > stock_hiện_tại ⇔ (held_drafts + đã_lên_PBH) > tồn_gốc.
// ---------------------------------------------------------------------------
function orderProductFlags(o, ctx) {
    const lines = Array.isArray(o.products) ? o.products : [];
    let choHang = false,
        hetHang = false,
        mua1Phan = false,
        amMa = false;
    for (const l of lines) {
        const code = l.productCode || l.product_code || l.code;
        if (!code) continue;
        const ps = ctx.productStatus.get(code);
        if (!ps) continue;
        if (ps.status === 'CHO_MUA') {
            choHang = true;
            continue; // SP chờ hàng: KHÔNG tính hết hàng / âm mã (tồn 0 là cố ý).
        }
        if (ps.status === 'MUA_1_PHAN') mua1Phan = true;
        if (ps.stock <= 0) hetHang = true;
        const held = ctx.heldByCode.get(code) || 0;
        if (held > ps.stock) amMa = true;
    }
    if (o.status !== 'draft') amMa = false; // âm mã chỉ áp cho đơn nháp đang tranh tồn.
    return { choHang, hetHang, mua1Phan, amMa };
}

// computeAutoTags(order, ctx, tagDefs) → { tags:[{code,name,color,icon,trigger}], hasChoHang }
// tagDefs đã sort theo priority ASC (loadActiveTagDefs) → output giữ thứ tự.
function computeAutoTags(o, ctx, tagDefs) {
    const f = orderProductFlags(o, ctx);
    const tags = [];
    for (const def of tagDefs || []) {
        const pred = PREDICATES[def.trigger];
        if (!pred) continue;
        let match = false;
        try {
            match = !!pred(o, f, ctx);
        } catch {
            match = false;
        }
        if (match) {
            tags.push({
                code: def.code,
                name: def.name,
                color: def.color || '#6b7280',
                icon: def.icon || null,
                trigger: def.trigger,
            });
        }
    }
    return { tags, hasChoHang: f.choHang };
}

// ---------------------------------------------------------------------------
// Context builder: query web2_products status/stock + held-in-drafts cho tập
// product code xuất hiện ở các đơn đang load. Bounded theo codes của trang.
// ---------------------------------------------------------------------------
async function buildContext(pool, orders) {
    const productStatus = new Map();
    const heldByCode = new Map();
    const codeSet = new Set();
    for (const o of orders || []) {
        for (const l of o.products || []) {
            const c = l.productCode || l.product_code || l.code;
            if (c) codeSet.add(c);
        }
    }
    const codes = [...codeSet];
    if (!codes.length) return { productStatus, heldByCode };

    const pr = await pool.query(
        `SELECT code, status, stock, pending_qty FROM web2_products WHERE code = ANY($1::text[])`,
        [codes]
    );
    for (const r of pr.rows) {
        productStatus.set(r.code, {
            status: r.status || 'DANG_BAN',
            stock: Number(r.stock) || 0,
            pending: Number(r.pending_qty) || 0,
        });
    }

    // Tổng SL "giữ" ở MỌI đơn nháp (global, không giới hạn trang) cho các code này.
    // COALESCE 2 shape products[] (productCode/code, quantity/qty) như /usage.
    const hr = await pool.query(
        `SELECT COALESCE(prod->>'productCode', prod->>'code') AS code,
                SUM(COALESCE((prod->>'quantity')::numeric, (prod->>'qty')::numeric, 0)) AS held
         FROM native_orders n, jsonb_array_elements(n.products) prod
         WHERE COALESCE(prod->>'productCode', prod->>'code') = ANY($1::text[])
           AND n.status = 'draft'
         GROUP BY 1`,
        [codes]
    );
    for (const r of hr.rows) {
        if (r.code) heldByCode.set(r.code, Number(r.held) || 0);
    }
    return { productStatus, heldByCode };
}

// ---------------------------------------------------------------------------
// Table + seed (web2Db). web2_order_tags: 1 dòng = 1 tag (code immutable),
// gắn 1 trigger. Seed 3 tag mặc định CHỈ khi bảng rỗng (xoá hết → reseed; tắt
// is_active thì giữ row → không reseed).
// ---------------------------------------------------------------------------
async function ensureTable(pool) {
    if (_ensured.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_order_tags (
            code        VARCHAR(60)  PRIMARY KEY,
            name        VARCHAR(120) NOT NULL,
            trigger     VARCHAR(40)  NOT NULL,
            color       VARCHAR(20)  DEFAULT '#6b7280',
            icon        VARCHAR(40),
            priority    INTEGER      NOT NULL DEFAULT 0,
            is_active   BOOLEAN      NOT NULL DEFAULT true,
            created_by  VARCHAR(100),
            created_at  BIGINT       NOT NULL,
            updated_at  BIGINT       NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_web2_order_tags_active ON web2_order_tags(is_active);
    `);
    try {
        const cnt = await pool.query(`SELECT COUNT(*)::int AS n FROM web2_order_tags`);
        if (cnt.rows[0].n === 0) {
            const now = Date.now();
            await pool.query(
                `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
                 VALUES
                   ('pbh_created', 'Phiếu bán hàng', 'pbh_created', '#16a34a', 'receipt',        10, 'system', $1, $1),
                   ('cho_hang',    'Chờ hàng',       'cho_hang',    '#f59e0b', 'clock',          20, 'system', $1, $1),
                   ('am_ma',       'Âm mã',          'am_ma',       '#dc2626', 'alert-triangle', 30, 'system', $1, $1)
                 ON CONFLICT (code) DO NOTHING`,
                [now]
            );
            console.log('[WEB2-ORDER-TAGS] Seeded 3 default tags (pbh_created, cho_hang, am_ma)');
        }
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] seed warn:', e.message);
    }
    _ensured.add(pool);
}

// Đọc tag def đang bật, sort theo priority ASC. Lỗi/bảng thiếu → [] (không vỡ /load).
async function loadActiveTagDefs(pool) {
    try {
        await ensureTable(pool);
        const r = await pool.query(
            `SELECT code, name, trigger, color, icon, priority
             FROM web2_order_tags WHERE is_active = true
             ORDER BY priority ASC, name ASC`
        );
        return r.rows.map((x) => ({
            code: x.code,
            name: x.name,
            trigger: x.trigger,
            color: x.color || '#6b7280',
            icon: x.icon || null,
            priority: Number(x.priority) || 0,
        }));
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] loadActiveTagDefs warn:', e.message);
        return [];
    }
}

// Tiện ích cho /load: enrich mảng orders tại chỗ (o.autoTags + o.hasChoHang).
// Defensive — bất kỳ lỗi nào → để autoTags=[] và không vỡ list.
async function enrichOrdersWithTags(pool, orders) {
    if (!Array.isArray(orders) || !orders.length) return;
    try {
        const tagDefs = await loadActiveTagDefs(pool);
        const ctx = await buildContext(pool, orders);
        for (const o of orders) {
            const { tags, hasChoHang } = computeAutoTags(o, ctx, tagDefs);
            o.autoTags = tags;
            o.hasChoHang = hasChoHang;
        }
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] enrichOrdersWithTags warn:', e.message);
        for (const o of orders) {
            if (!o.autoTags) o.autoTags = [];
            if (o.hasChoHang == null) o.hasChoHang = false;
        }
    }
}

module.exports = {
    TRIGGERS,
    TRIGGER_IDS,
    PREDICATES,
    orderProductFlags,
    computeAutoTags,
    buildContext,
    ensureTable,
    loadActiveTagDefs,
    enrichOrdersWithTags,
};
