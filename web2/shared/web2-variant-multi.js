// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web2VariantMulti — NGUỒN DUY NHẤT cho "nhập nhanh nhiều biến thể" Web 2.0.
// Parse 1 chuỗi quick-entry (token cách nhau bằng "/") → expand thành NHIỀU
// variant chuẩn "Màu / Size". Dùng chung mọi trang web2 cần chọn nhiều biến thể
// (hiện wire ở so-order; trang khác load script này rồi gọi Web2VariantMulti.*).
//
// Quy tắc (user 2026-06-16):
//   "Đen / S / M / L / 28"  → 4 SP: Đen/S, Đen/M, Đen/L, Đen/28   (1 màu + nhiều size)
//   "M / Đỏ / Trắng / Đen"  → 3 SP: Đỏ/M, Trắng/M, Đen/M          (1 size + nhiều màu — chuẩn hoá MÀU trước)
//   "Đen / Đỏ / Trắng"      → 3 SP chỉ-màu: Đen, Đỏ, Trắng
//   "Đỏ / Xanh / S / M"     → cartesian 4: Đỏ/S, Đỏ/M, Xanh/S, Xanh/M  (cả 2 loại nhiều)
//   "Đen / S"               → 1 SP: Đen / S
//   "Đen" (1 token)         → giữ nguyên (single)
//
// Phân loại MÀU/SIZE: hỏi Web2VariantsCache (groupName, mirror web2-products
// `_isSizeGroup`/`_variantKind`) TRƯỚC; cache miss → SIZE_RE heuristic; vẫn
// không rõ → "unknown" rồi suy vào loại CÒN THIẾU (vd 1 size + token lạ = màu).
// Robust kể cả khi cache rỗng cho các ví dụ trên (1 loại đã biết → token còn lại
// là loại kia).

(function (global) {
    'use strict';

    const SEP = ' / ';
    const MAX_EXPAND = 60; // chặn cartesian quá lớn (vd 6×11) tạo bất ngờ nhiều dòng

    // Size phổ biến: chữ (XS..5XL, Free) hoặc số 2-3 chữ số (28, 29, 110…).
    const SIZE_RE = /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|F|FREE|FREESIZE|\d{2,3})$/i;

    // mirror web2/products/js/web2-products-app.js `_isSizeGroup`.
    function _isSizeGroup(groupName) {
        const g = (groupName || '').toLowerCase();
        return g.includes('size') || g.includes('cỡ') || g.includes('co');
    }

    // 'color' | 'size' | null (null = chưa phân loại được). Cache TRƯỚC, regex sau.
    function classifyToken(token) {
        const t = String(token || '').trim();
        if (!t) return null;
        const cache = global.Web2VariantsCache;
        const v = cache && cache.findByValueExact ? cache.findByValueExact(t) : null;
        if (v) return _isSizeGroup(v.groupName) ? 'size' : 'color';
        if (SIZE_RE.test(t.replace(/\s+/g, ''))) return 'size';
        return null;
    }

    function _combine(color, size) {
        if (color && size) return color + SEP + size;
        return color || size || '';
    }

    function _dedupe(list) {
        const seen = new Set();
        return list.filter((v) => {
            const k = v.toLowerCase();
            if (!v || seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }

    // parse(rawText) → {ok, variants[], mode, anchor, list, unknownTokens, reason, count}
    //   mode: 'single' | 'expand' | 'cartesian' | 'passthrough'
    //   variants[]: mảng chuỗi "Màu / Size" (hoặc 1 phần) — để tạo N dòng SP.
    function parse(rawText) {
        const raw = String(rawText || '').trim();
        const tokens = raw
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean);

        if (!tokens.length)
            return {
                ok: false,
                variants: [],
                mode: 'passthrough',
                reason: 'empty',
                unknownTokens: [],
            };
        if (tokens.length === 1)
            return {
                ok: true,
                variants: [tokens[0]],
                mode: 'single',
                reason: 'one-token',
                unknownTokens: [],
            };

        const colors = [];
        const sizes = [];
        const unknown = [];
        for (const t of tokens) {
            const k = classifyToken(t);
            if (k === 'color') colors.push(t);
            else if (k === 'size') sizes.push(t);
            else unknown.push(t);
        }
        const unknownTokens = unknown.slice();

        // Token lạ (cache miss + KHÔNG khớp SIZE_RE) → coi là MÀU. Lý do: SIZE_RE
        // đã bắt chắc các size (chữ S..5XL / số 2-3 chữ số); phần còn lại gần như
        // chắc chắn là TÊN MÀU (từ vựng mở). Xử lý đúng cả 3 ca user:
        //   "Đen/S/M/L/28" (Đen lạ→màu, còn lại size) → anchor màu Đen.
        //   "M/Đỏ/Trắng/Đen" (M size, Đỏ/Trắng/Đen lạ→màu) → anchor size M.
        //   "Đỏ/Xanh/S/M" (Đỏ màu, Xanh lạ→màu, S/M size) → cartesian 2×2.
        // (Size phi-chuẩn dạng chữ Việt — vd "Đại" — phải khai trong Kho Biến Thể
        //  để classifyToken bắt qua cache; nếu không sẽ bị coi là màu.)
        if (unknown.length) colors.push(...unknown);
        if (!colors.length && !sizes.length)
            return { ok: false, variants: [], mode: 'passthrough', reason: 'empty', unknownTokens };

        const cc = colors.length;
        const sc = sizes.length;
        let variants = [];
        let mode = 'expand';
        let anchor = null;
        let list = null;

        if (cc === 1 && sc >= 1) {
            anchor = { kind: 'color', value: colors[0] };
            list = { kind: 'size', values: sizes };
            variants = sizes.map((s) => _combine(colors[0], s));
            mode = sc === 1 ? 'single' : 'expand';
        } else if (sc === 1 && cc >= 1) {
            anchor = { kind: 'size', value: sizes[0] };
            list = { kind: 'color', values: colors };
            variants = colors.map((c) => _combine(c, sizes[0]));
            mode = cc === 1 ? 'single' : 'expand';
        } else if (cc >= 1 && sc === 0) {
            variants = colors.map((c) => _combine(c, ''));
            mode = cc === 1 ? 'single' : 'expand';
        } else if (sc >= 1 && cc === 0) {
            variants = sizes.map((s) => _combine('', s));
            mode = sc === 1 ? 'single' : 'expand';
        } else {
            // cc>=2 && sc>=2 → cartesian (mọi cặp màu × size).
            for (const c of colors) for (const s of sizes) variants.push(_combine(c, s));
            mode = 'cartesian';
        }

        variants = _dedupe(variants);
        if (variants.length > MAX_EXPAND)
            return {
                ok: false,
                variants: [],
                mode,
                reason: 'too-many',
                count: variants.length,
                unknownTokens,
            };

        return { ok: true, variants, mode, anchor, list, unknownTokens, reason: 'ok' };
    }

    // expand(rawText) → mảng variant CHỈ KHI ra >1 (để caller tạo N dòng); else [].
    function expand(rawText) {
        const r = parse(rawText);
        return r.ok && r.variants.length > 1 ? r.variants.slice() : [];
    }

    // detect(rawText) → true nếu là multi-variant (có '/' + parse ra >1 variant).
    function detect(rawText) {
        if (!String(rawText || '').includes('/')) return false;
        const r = parse(rawText);
        return r.ok && r.variants.length > 1;
    }

    global.Web2VariantMulti = { classifyToken, parse, expand, detect, SEP, MAX_EXPAND };
})(typeof window !== 'undefined' ? window : globalThis);
