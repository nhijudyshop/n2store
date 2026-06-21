// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// web2-kpi-core — NGUỒN DUY NHẤT cho TOÁN KPI Web 2.0 (rate · sanitize · product-map ·
// beneficiary-by-STT · base-delta qty). Trước 2026-06-21 logic này bị FORK y hệt ở:
//   - render.com/routes/v2/kpi.js (engine KPI thật: /kpi, /forecast, /actual, emit)
//   - render.com/services/web2-order-tags-service.js (pill kpi_user ở native-orders /load)
// → drift nguy hiểm. Giờ CẢ HAI import module này. KHÔNG fork lại — sửa 1 chỗ áp mọi nơi.
//
// Quy ước KPI (xem docs): livestream hưởng = NV theo dải STT (web2_kpi_assignments),
// KPI qty = base-delta Σ max(0, cur − kpi_base) (UPSELL sau "chốt"); inbox = created_by,
// 100% SL. Tiền = qty × RATE_PER_SP. base=null (livestream chưa chốt) → qty 0.

const RATE_PER_SP = 5000;

// Strip ký tự Firebase-unsafe khỏi campaign name (khớp key bảng web2_kpi_assignments).
// PHẢI giống Web 1.0 tab1-employee.js để cùng map 1 campaign.
function sanitizeCampaignName(name) {
    if (!name) return null;
    return String(name)
        .replace(/[.$#[\]/]/g, '_')
        .trim();
}

// products[] (shape {productCode|code, quantity|qty}) → { code: tổngSL } (CỘNG dồn trùng mã).
function buildProductMap(products) {
    const m = {};
    for (const p of Array.isArray(products) ? products : []) {
        const code = p.productCode || p.product_code || p.code;
        const qty = Number(p.quantity ?? p.qty) || 0;
        if (code && qty > 0) m[code] = (m[code] || 0) + qty;
    }
    return m;
}

// Tìm NV hưởng theo khoảng STT (livestream). ranges = [{userId,userName,fromSTT,toSTT}]
// (legacy chấp nhận from/to/start/end, id/name). Trả { id, name, from, to } | null.
// id = Number(uid) THÔ (có thể NaN nếu uid lạ) — caller tự quyết fallback (aggregate→0,
// emit→actor_user_id) để giữ đúng 2 hành vi cũ.
function resolveBeneficiaryBySTT(stt, ranges) {
    if (stt == null) return null;
    for (const r of Array.isArray(ranges) ? ranges : []) {
        const from = Number(r.fromSTT ?? r.from ?? r.start ?? 0);
        const to = Number(r.toSTT ?? r.to ?? r.end ?? Infinity);
        if (stt >= from && stt <= to) {
            const uid = r.userId ?? r.id;
            return {
                id: Number(uid),
                name: r.userName || r.name || String(uid ?? '?'),
                from,
                to,
            };
        }
    }
    return null;
}

// KPI qty + lines của 1 đơn. THỐNG NHẤT _orderKpiQty (kpi.js, chỉ qty) + _kpiLines
// (order-tags, lines). Hành vi theo `mode` (KHÔNG đoán qua base truthiness — xem audit):
//   mode 'inbox'         → base bỏ qua, delta = current (100%).
//   mode 'live' + base map → delta = max(0, current − base[code]) (upsell sau chốt).
//   mode 'live' + base null → CHƯA chốt: base null, delta 0.
// metaMap (optional) = Map(code → {name, imageUrl}) để override ảnh/tên (order-tags
// truyền web2_products status). Trả { qty, lines:[{code,name,imageUrl,base,current,delta}] }.
function computeKpiQty(products, base, mode, metaMap) {
    const cur = buildProductMap(products);
    // name/ảnh fallback từ dòng đơn (lần xuất hiện đầu).
    const lineMeta = {};
    for (const l of Array.isArray(products) ? products : []) {
        const c = l.productCode || l.product_code || l.code;
        if (c && !lineMeta[c]) {
            lineMeta[c] = {
                name: l.name || l.productName || l.product_name || c,
                imageUrl: l.imageUrl || l.image_url || null,
            };
        }
    }
    const lines = [];
    let qty = 0;
    for (const code of Object.keys(cur)) {
        const current = cur[code];
        let b, delta;
        if (mode === 'inbox') {
            b = 0;
            delta = current;
        } else if (base == null) {
            b = null; // livestream chưa chốt
            delta = 0;
        } else {
            b = Number(base[code]) || 0;
            delta = Math.max(0, current - b);
        }
        qty += delta;
        const m = (metaMap && metaMap.get && metaMap.get(code)) || null;
        lines.push({
            code,
            name: (m && m.name) || (lineMeta[code] && lineMeta[code].name) || code,
            imageUrl: (m && m.imageUrl) || (lineMeta[code] && lineMeta[code].imageUrl) || null,
            base: b,
            current,
            delta,
        });
    }
    return { qty, lines };
}

// Load dải STT mọi campaign → Map(sanitized campaign_name → ranges[]). Dùng cho aggregate
// (/kpi) + order-tags pill. Lỗi/bảng thiếu → Map rỗng (caller defensive). filterUserId:
// nếu truyền → CHỈ giữ range của user đó (cho scope NV — giảm payload + đỡ lộ NV khác).
async function loadKpiRanges(pool, filterUserId) {
    const map = new Map();
    if (!pool) return map;
    try {
        const r = await pool.query(
            `SELECT campaign_name, employee_ranges FROM web2_kpi_assignments`
        );
        const fid = filterUserId != null ? String(filterUserId) : null;
        for (const row of r.rows) {
            let ranges = Array.isArray(row.employee_ranges) ? row.employee_ranges : [];
            if (fid != null) {
                ranges = ranges.filter((rg) => String(rg.userId ?? rg.id) === fid);
            }
            map.set(row.campaign_name, ranges);
        }
    } catch (e) {
        console.warn('[web2-kpi-core] loadKpiRanges warn:', e.message);
    }
    return map;
}

module.exports = {
    RATE_PER_SP,
    sanitizeCampaignName,
    buildProductMap,
    resolveBeneficiaryBySTT,
    computeKpiQty,
    loadKpiRanges,
};
