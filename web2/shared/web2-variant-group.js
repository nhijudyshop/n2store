// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================
// Web2VariantGroup — gom các dòng SP cùng tên (mỗi biến thể 1 row trong
// web2_products) thành 1 NHÓM: 1 tên + 1 ảnh đại diện + danh sách biến thể với
// tồn kho / chờ hàng TỪNG biến thể. Dùng cho trang TV livestream để người live
// (user1) nhìn 1 card = 1 sản phẩm, đỡ rối khi cùng loại nhiều màu/size.
//
// web2_products lưu PHẲNG (không có product-template) → việc gom là của FRONTEND.
// Khoá gom mặc định = `name` chuẩn hoá (các biến thể do so-order tách ra chung
// name). Tuỳ chọn gom theo name+supplier để tránh trộn 2 SP khác NCC trùng tên.
//
// API (window.Web2VariantGroup):
//   group(products, opts) → [{ key, name, imageUrl, supplier, suppliers[],
//       variantCount, totalStock, totalPending, hasPending, statuses Set-like,
//       variants: [{ code, variant, stock, pendingQty, returnQty, status,
//                    supplier, imageUrl, ...orig }] }]
//   normalizeName(s) → string  (khoá gom)
// opts: { by: 'name' | 'name+supplier' (default 'name'), sortVariants: bool=true }
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2VariantGroup) return;

    function normalizeName(s) {
        return String(s == null ? '' : s)
            .normalize('NFC')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
    }

    // Phân loại token biến thể (màu/size) để sắp xếp ổn định trong nhóm.
    // Ưu tiên Web2VariantMulti.classifyToken nếu có; fallback heuristic size.
    const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|free|fre|\d{1,3})$/i;
    function variantSortKey(variant) {
        const v = String(variant || '');
        // Tách 'Màu / Size' → ưu tiên màu trước, size sau (size có thứ tự riêng).
        const parts = v
            .split(/[\/,|-]/)
            .map((p) => p.trim())
            .filter(Boolean);
        const SIZE_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', '4xl', 'xxxl'];
        let color = '';
        let sizeRank = 999;
        let sizeNum = null;
        for (const p of parts) {
            const low = p.toLowerCase();
            if (SIZE_RE.test(low)) {
                const idx = SIZE_ORDER.indexOf(low);
                if (idx >= 0) sizeRank = Math.min(sizeRank, idx);
                else if (/^\d+$/.test(low)) sizeNum = sizeNum == null ? Number(low) : sizeNum;
            } else if (!color) {
                color = low;
            }
        }
        return { color, sizeRank, sizeNum: sizeNum == null ? 9999 : sizeNum, raw: v.toLowerCase() };
    }
    function cmpVariant(a, b) {
        const ka = variantSortKey(a.variant);
        const kb = variantSortKey(b.variant);
        if (ka.color !== kb.color) return ka.color < kb.color ? -1 : 1;
        if (ka.sizeRank !== kb.sizeRank) return ka.sizeRank - kb.sizeRank;
        if (ka.sizeNum !== kb.sizeNum) return ka.sizeNum - kb.sizeNum;
        if (ka.raw !== kb.raw) return ka.raw < kb.raw ? -1 : 1;
        return 0;
    }

    function imgOf(p) {
        return p && (p.imageUrl || p.image_url || (Array.isArray(p.images) && p.images[0]) || '');
    }

    function group(products, opts) {
        opts = opts || {};
        const by = opts.by === 'name+supplier' ? 'name+supplier' : 'name';
        const sortVariants = opts.sortVariants !== false;
        const list = Array.isArray(products) ? products : [];
        const map = new Map(); // key → group

        for (const p of list) {
            if (!p) continue;
            const nkey = normalizeName(p.name);
            if (!nkey) continue;
            const key = by === 'name+supplier' ? `${nkey}|${normalizeName(p.supplier)}` : nkey;
            let g = map.get(key);
            if (!g) {
                g = {
                    key,
                    name: p.name || p.code || '',
                    imageUrl: '',
                    supplier: p.supplier || null,
                    suppliers: new Set(),
                    regions: new Set(), // ĐỊA DANH nhập hàng (HÀ NỘI/HƯƠNG CHÂU)
                    variants: [],
                    totalStock: 0,
                    totalPending: 0,
                    totalReturn: 0,
                    totalSold: 0, // BÁN = SL trong giỏ KH (gồm cọc)
                    totalCoc: 0, // CỌC = SL trong giỏ có đặt cọc
                    _firstSort: Number.isFinite(p.sort) ? p.sort : Number.MAX_SAFE_INTEGER,
                    _pinned: false,
                };
                map.set(key, g);
            }
            const stock = Number(p.stock) || 0;
            const pending = Number(p.pendingQty != null ? p.pendingQty : p.pending_qty) || 0;
            const ret = Number(p.returnQty != null ? p.returnQty : p.return_qty) || 0;
            g.variants.push({
                code: p.code,
                variant: p.variant || '',
                stock,
                pendingQty: pending,
                returnQty: ret,
                status: p.status || 'DANG_BAN',
                supplier: p.supplier || null,
                region: p.region || null,
                sold: Number(p.sold) || 0,
                coc: Number(p.coc) || 0,
                imageUrl: imgOf(p),
                pinned: !!p.pinned,
                sort: Number.isFinite(p.sort) ? p.sort : null,
                orig: p,
            });
            g.totalStock += stock;
            g.totalPending += pending;
            g.totalReturn += ret;
            g.totalSold += Number(p.sold) || 0;
            g.totalCoc += Number(p.coc) || 0;
            if (p.supplier) g.suppliers.add(p.supplier);
            if (p.region) g.regions.add(p.region);
            if (!g.imageUrl && imgOf(p)) g.imageUrl = imgOf(p);
            if (p.pinned) g._pinned = true;
            const ps = Number.isFinite(p.sort) ? p.sort : Number.MAX_SAFE_INTEGER;
            if (ps < g._firstSort) g._firstSort = ps;
        }

        const groups = [];
        for (const g of map.values()) {
            if (sortVariants) g.variants.sort(cmpVariant);
            groups.push({
                key: g.key,
                name: g.name,
                imageUrl: g.imageUrl || '',
                supplier: g.supplier,
                suppliers: Array.from(g.suppliers),
                regions: Array.from(g.regions),
                region: Array.from(g.regions)[0] || null, // ĐỊA DANH chính (nhóm thường 1)
                variantCount: g.variants.length,
                totalStock: g.totalStock,
                totalPending: g.totalPending,
                totalReturn: g.totalReturn,
                totalSold: g.totalSold,
                totalCoc: g.totalCoc,
                hasPending: g.totalPending > 0,
                pinned: g._pinned,
                _firstSort: g._firstSort,
                variants: g.variants,
            });
        }
        // Thứ tự nhóm: ghim trước, rồi theo sort nhỏ nhất của biến thể (giữ trật tự
        // user2 sắp ở trang điều khiển), rồi tên.
        groups.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a._firstSort !== b._firstSort) return a._firstSort - b._firstSort;
            return a.name.localeCompare(b.name, 'vi');
        });
        return groups;
    }

    global.Web2VariantGroup = { group, normalizeName };
})(typeof window !== 'undefined' ? window : globalThis);
