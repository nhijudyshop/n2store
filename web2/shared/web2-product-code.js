// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — PRODUCT CODE SUGGESTION (rule shop 2026-05-22)
// =====================================================
// Sinh mã SP tự động theo công thức:
//   <PREFIX_NCC><LOAI><SỐ?><MÀU><SIZE?>
//
// PREFIX NCC (tab Sổ Order):
//   - "HÀ NỘI"      → HN     (mỗi từ 1 chữ)
//   - "HƯƠNG CHÂU"  → HC
//   - "HẢI CHÂU"    → HC1    (trùng HC → append 1, 2, 3…)
//   - 1 từ          → 2 chữ đầu ("ADIDAS"→AD)
//   - KHÔNG có NCC  → BẮT BUỘC truyền opts.customPrefix tay (UI Web 2.0 sẽ
//                     bắt user nhập). Không có customPrefix → throw Error.
//
// LOẠI SP (chỉ 6 keyword, còn lại fallback MM):
//   ÁO   → AO
//   QUẦN → QUAN
//   GUỐC → GUOC
//   ĐẦM  → DAM
//   TLQD → TLQD
//   TDQD → TDQD
//   (Không match) → MM
//
// MÀU: lấy short_code từ kho Biến Thể Web 2.0 (`web2_variants`).
//   Build colorShortMap qua Web2ProductCode.buildColorShortMap(allColorNames)
//   - Tự xử lý collision (XAM ĐẬM vs XANH ĐẬM)
//   - Truyền opts.colorShortMap vào suggest()
//
// SIZE: SIZE 3 → S3, SIZE 32 → S32. Letter size S/M/L/XL giữ nguyên.
//
// COUNTER:
//   - SP đầu tiên (NCC + type) → KHÔNG có số (HNMMDENS32)
//   - SP thứ 2 trở đi → bắt đầu từ 2 (HNMM2DENS32, HNMM3...)
//
// Ví dụ:
//   HÀ NỘI / GIÀY ĐEN SIZE 32 (1st)   → HN + MM + DEN + S32     → HNMMDENS32
//   HÀ NỘI / GIÀY ĐEN SIZE 33 (2nd)   → HN + MM2 + DEN + S33    → HNMM2DENS33
//   HƯƠNG CHÂU / ÁO ĐỎ                → HC + AO + DO            → HCAODO
//   HẢI CHÂU / QUẦN XANH DƯƠNG SIZE 5 → HC1 + QUAN + XD + S5    → HC1QUANXDS5
//   HÀ NỘI / ĐẦM HỒNG                 → HN + DAM + HONG         → HNDAMHONG
//   customPrefix='ABC' / ÁO ĐỎ        → ABC + AO + DO           → ABCAODO  (caller nhập tay)
//   no NCC + no customPrefix          → throw Error             (UI bắt user nhập)
//
// Usage:
//   const code = Web2ProductCode.suggest({
//     supplierName: 'HÀ NỘI',
//     productName: 'GIÀY ĐEN SIZE 32',
//     existingCodes: ['HNMMDENS31'],  // có 1 → SP mới sẽ là HNMM2DENS32
//     supplierPrefixMap: { 'HÀ NỘI': 'HN', 'HƯƠNG CHÂU': 'HC', 'HẢI CHÂU': 'HC1' },
//     colorShortMap: { 'DEN': 'DEN', 'XANH DUONG': 'XD', ... }, // từ web2_variants
//   });

(function (global) {
    'use strict';

    if (global.Web2ProductCode) return;

    // ─────────────────────────────────────────────────────────
    // Bảng từ loại SP (Vietnamese → ASCII shortcode)
    // CHỈ 6 keyword theo rule shop (2026-05-22):
    //   ÁO, QUẦN, GUỐC, ĐẦM, TLQD, TDQD
    // Tên SP KHÔNG match keyword nào → fallback 'MM' (xem extractType).
    // ─────────────────────────────────────────────────────────
    const TYPE_MAP = {
        ÁO: 'AO',
        AO: 'AO',
        QUẦN: 'QUAN',
        QUAN: 'QUAN',
        GUỐC: 'GUOC',
        GUOC: 'GUOC',
        ĐẦM: 'DAM',
        DAM: 'DAM',
        TLQD: 'TLQD',
        TDQD: 'TDQD',
    };

    // Fallback khi tên SP không match keyword nào trong TYPE_MAP
    const DEFAULT_TYPE = 'MM';

    // ─────────────────────────────────────────────────────────
    // Bảng màu (single word — giữ nguyên ASCII; multi-word — viết tắt)
    // ─────────────────────────────────────────────────────────
    const COLOR_MAP_SINGLE = {
        ĐỎ: 'DO',
        DO: 'DO',
        XANH: 'XANH',
        VÀNG: 'VANG',
        VANG: 'VANG',
        TRẮNG: 'TRANG',
        TRANG: 'TRANG',
        ĐEN: 'DEN',
        DEN: 'DEN',
        HỒNG: 'HONG',
        HONG: 'HONG',
        TÍM: 'TIM',
        TIM: 'TIM',
        NÂU: 'NAU',
        NAU: 'NAU',
        XÁM: 'XAM',
        XAM: 'XAM',
        CAM: 'CAM',
        BE: 'BE',
        GHI: 'GHI',
        BẠC: 'BAC',
        BAC: 'BAC',
        VÀNG: 'VANG',
    };

    // Multi-word colors: lấy chữ cái đầu mỗi từ.
    // VD: "XANH DƯƠNG" → "X" + "D" = "XD"

    const SIZE_PATTERNS = [
        /SIZE\s*(\d{1,3})/i,
        /CỠ\s*(\d{1,3})/i,
        /SZ\s*(\d{1,3})/i,
        /\bS(\d{1,3})\b/, // matches S5, S12
    ];
    const SIZE_LETTER_PATTERN = /\b(XS|S|M|L|XL|XXL|XXXL|3XL|4XL)\b/i;

    // ─────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────
    function removeDiacritics(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D');
    }

    function toAsciiUpper(s) {
        return removeDiacritics(s).toUpperCase();
    }

    function clean(s) {
        return toAsciiUpper(s)
            .replace(/[^A-Z0-9 ]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ─────────────────────────────────────────────────────────
    // Prefix NCC
    // ─────────────────────────────────────────────────────────
    /**
     * Tạo prefix từ tên NCC.
     * Nhiều từ → chữ đầu mỗi từ. 1 từ → 2 chữ đầu.
     * @param {string} supplierName
     * @returns {string} prefix (chưa xét trùng)
     */
    /**
     * Tạo prefix từ tên NCC.
     * BẮT BUỘC có supplierName — nếu tạo SP ngoài Sổ Order, caller PHẢI tự
     * nhập prefix tay (truyền qua opts.customPrefix). Hàm này throw nếu thiếu.
     */
    function basePrefix(supplierName) {
        if (!supplierName) {
            throw new Error(
                'supplierName bắt buộc — SP tạo ngoài Sổ Order phải nhập prefix tay (opts.customPrefix)'
            );
        }
        const cleaned = clean(supplierName);
        const words = cleaned.split(' ').filter(Boolean);
        if (words.length === 0) {
            throw new Error('supplierName không hợp lệ sau khi normalize');
        }
        if (words.length === 1) {
            const w = words[0];
            return w.length >= 2 ? w.slice(0, 2) : (w + 'X').slice(0, 2);
        }
        return words
            .map((w) => w[0])
            .join('')
            .slice(0, 4);
    }

    /**
     * Xử lý collision: prefix giống với NCC khác → append số.
     * @param {string} supplierName
     * @param {Object<string,string>} supplierPrefixMap — { 'HÀ NỘI': 'HN', … }
     * @param {string} [customPrefix] — caller-supplied prefix (khi không có NCC)
     * @returns {string} prefix final (đã unique)
     */
    function resolvePrefix(supplierName, supplierPrefixMap, customPrefix) {
        // Caller nhập tay prefix → dùng luôn, KHÔNG check collision
        if (customPrefix) {
            return clean(customPrefix).replace(/\s+/g, '');
        }
        const map = supplierPrefixMap || {};
        // Đã có trong map → trả về luôn
        if (map[supplierName]) return map[supplierName];

        const base = basePrefix(supplierName);
        const usedPrefixes = new Set(Object.values(map));
        if (!usedPrefixes.has(base)) return base;

        // Trùng → append số 1, 2, 3, … (HƯƠNG CHÂU=HC, HẢI CHÂU=HC1, third=HC2…)
        let n = 1;
        while (usedPrefixes.has(base + n)) n++;
        return base + n;
    }

    // ─────────────────────────────────────────────────────────
    // Loại SP (ÁO, QUẦN, …)
    // ─────────────────────────────────────────────────────────
    /**
     * Tìm + extract loại SP từ tên SP. Loại được match theo TYPE_MAP,
     * ưu tiên từ dài hơn (ÁO KHOÁC trước ÁO).
     * @returns {{ type: string|null, rest: string }}
     */
    function extractType(productNameClean) {
        // Sort by length desc để match longest first.
        // Chỉ match ở ĐẦU tên SP (convention VN: "ÁO ĐỎ", "QUẦN XANH", "ĐẦM HỒNG"...).
        // Tránh false match như "HỒNG ĐẬM" → DAM khi ĐẬM là tính từ.
        const keys = Object.keys(TYPE_MAP).sort((a, b) => b.length - a.length);
        for (const key of keys) {
            const keyAscii = clean(key);
            const re = new RegExp(`^${keyAscii}\\b`);
            if (re.test(productNameClean)) {
                const rest = productNameClean.replace(re, ' ').replace(/\s+/g, ' ').trim();
                return { type: TYPE_MAP[key], rest };
            }
        }
        // KHÔNG match → fallback MM, giữ nguyên tên SP (không cắt prefix)
        return { type: DEFAULT_TYPE, rest: productNameClean };
    }

    // ─────────────────────────────────────────────────────────
    // Màu
    // ─────────────────────────────────────────────────────────
    /**
     * Tìm + viết tắt màu trong tên SP.
     * Quy tắc:
     *   - Match nhiều từ trước (XANH DƯƠNG → XD), single sau (XANH → XANH).
     *   - Multi-word color: lấy chữ đầu mỗi từ (chỉ khi >=2 từ và đều là từ-màu hợp lệ).
     * @returns {{ colorShort: string|null, rest: string }}
     */
    function extractColor(productNameClean) {
        // Map các tokens có thể là màu (single + những combination khả thi)
        const singleColors = new Set(Object.values(COLOR_MAP_SINGLE));

        // Phương án multi-word: thử match "XANH X" hoặc "X X" liền nhau
        // Lấy chữ đầu mỗi từ-màu hợp lệ.
        const tokens = productNameClean.split(' ').filter(Boolean);

        // Tìm chuỗi liên tiếp các token-màu (>=2 token)
        let i = 0;
        while (i < tokens.length) {
            const t = tokens[i];
            if (singleColors.has(t) || isColorWord(t)) {
                // Greedy: thu hết các từ-màu liên tiếp
                let j = i;
                const seq = [];
                while (
                    j < tokens.length &&
                    (singleColors.has(tokens[j]) || isColorWord(tokens[j]))
                ) {
                    seq.push(tokens[j]);
                    j++;
                }
                if (seq.length >= 2) {
                    const colorShort = seq.map((w) => w[0]).join('');
                    const rest = [...tokens.slice(0, i), ...tokens.slice(j)].join(' ');
                    return { colorShort, rest };
                }
                if (seq.length === 1 && singleColors.has(seq[0])) {
                    const colorShort = seq[0];
                    const rest = [...tokens.slice(0, i), ...tokens.slice(j)].join(' ');
                    return { colorShort, rest };
                }
                i = j;
            } else {
                i++;
            }
        }
        return { colorShort: null, rest: productNameClean };
    }

    // Kiểm tra token có phải từ-màu phụ (LÁ, DƯƠNG, NHẠT, ĐẬM, TRO, …)
    function isColorWord(token) {
        return [
            'LA',
            'DUONG',
            'NHAT',
            'DAM',
            'TRO',
            'NGOC',
            'BIEN',
            'OLIVE',
            'MAU',
            'RANG',
            'RAU',
            'COBAN',
            'XANH',
            'PASTEL',
        ].includes(token);
    }

    // ─────────────────────────────────────────────────────────
    // Size
    // ─────────────────────────────────────────────────────────
    /**
     * Trích size từ tên SP. Trả về "S<n>" hoặc letter size.
     * @returns {{ sizeShort: string|null, rest: string }}
     */
    function extractSize(productNameClean) {
        for (const re of SIZE_PATTERNS) {
            const m = productNameClean.match(re);
            if (m) {
                return {
                    sizeShort: 'S' + m[1],
                    rest: productNameClean.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
                };
            }
        }
        const m = productNameClean.match(SIZE_LETTER_PATTERN);
        if (m) {
            return {
                sizeShort: m[1].toUpperCase(),
                rest: productNameClean.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
            };
        }
        return { sizeShort: null, rest: productNameClean };
    }

    // ─────────────────────────────────────────────────────────
    // Generate suggested code
    // ─────────────────────────────────────────────────────────
    /**
     * @param {Object} opts
     * @param {string} opts.supplierName
     * @param {string} opts.productName — tên SP (chứa loại + màu + size)
     * @param {string[]} [opts.existingCodes] — list mã SP đã có để tránh trùng
     * @param {Object<string,string>} [opts.supplierPrefixMap]
     * @returns {{ code: string, parts: object }}
     */
    function suggest(opts) {
        const supplierName = (opts && opts.supplierName) || '';
        const productName = (opts && opts.productName) || '';
        const existingCodes = (opts && opts.existingCodes) || [];
        const supplierPrefixMap = (opts && opts.supplierPrefixMap) || {};
        const customPrefix = (opts && opts.customPrefix) || '';

        const prefix = resolvePrefix(supplierName, supplierPrefixMap, customPrefix);
        const nameClean = clean(productName);

        // Theo thứ tự: extract type → color → size từ name
        const { type, rest: r1 } = extractType(nameClean);
        const { sizeShort, rest: r2 } = extractSize(r1);
        const { colorShort, rest: r3 } = extractColor(r2);

        // Đếm số thứ tự loại SP của NCC.
        // SP ĐẦU TIÊN của (NCC, type) → KHÔNG có số (vd HNMMDENS32, không HNMM1DENS32).
        // SP thứ 2 trở đi → số bắt đầu từ 2 (HNMM2DENS32, HNMM3...).
        let counter = '';
        if (type) {
            const typePrefix = prefix + type;
            // Match cả pattern không số (đầu tiên) lẫn có số (HNMM2DENS32)
            const reNumbered = new RegExp(`^${typePrefix}(\\d+)`);
            const reBare = new RegExp(`^${typePrefix}(?!\\d)`);
            let maxN = 0;
            let hasBare = false;
            for (const c of existingCodes) {
                const m = c.match(reNumbered);
                if (m && m[1]) {
                    maxN = Math.max(maxN, parseInt(m[1], 10));
                } else if (reBare.test(c)) {
                    hasBare = true;
                }
            }
            // Nếu chưa có SP nào → bare (no counter)
            // Nếu có bare nhưng chưa có numbered → counter = 2
            // Nếu có numbered → counter = maxN + 1
            if (maxN > 0) counter = String(maxN + 1);
            else if (hasBare) counter = '2';
            else counter = '';
        }

        const code = prefix + (type || '') + counter + (colorShort || '') + (sizeShort || '');

        return {
            code,
            parts: {
                prefix,
                type,
                counter,
                colorShort,
                sizeShort,
                unparsed: r3,
            },
        };
    }

    // ─────────────────────────────────────────────────────────
    // Build supplier prefix map from a list of supplier names.
    // Tự handle collision theo thứ tự xuất hiện.
    // ─────────────────────────────────────────────────────────
    /**
     * @param {string[]} supplierNames
     * @returns {Object<string,string>} { 'HÀ NỘI': 'HN', 'HƯƠNG CHÂU': 'HC', 'HẢI CHÂU': 'HC1', … }
     */
    function buildPrefixMap(supplierNames) {
        const map = {};
        const used = new Set();
        for (const name of supplierNames || []) {
            if (!name || map[name]) continue;
            let base = basePrefix(name);
            let prefix = base;
            let n = 1;
            while (used.has(prefix)) {
                prefix = base + n;
                n++;
            }
            map[name] = prefix;
            used.add(prefix);
        }
        return map;
    }

    // ─────────────────────────────────────────────────────────
    // Color shortening with collision detection
    // ─────────────────────────────────────────────────────────
    /**
     * Build map ASCII-uppercase color → unique shortcode.
     *
     * Resolves collisions trong kho biến thể (vd "Xám Đậm" vs "Xanh Đậm" cùng
     * naive code "XD"). Extend chars progressively từ word cuối (more distinguishing
     * in Vietnamese color names) until all unique within collision group.
     *
     * @param {string[]} colorNames — full variant names ("Màu Xanh Dương", …)
     * @returns {Object<string,string>} { "XANH DUONG": "XD", "XAM DAM": "XAMDAM", … }
     */
    function buildColorShortMap(colorNames) {
        // Normalize: strip "Màu " prefix
        const entries = (colorNames || [])
            .map((n) => {
                const stripped = String(n || '')
                    .replace(/^\s*M[àÀáÁ]u\s+/iu, '')
                    .replace(/^\s*MAU\s+/i, '')
                    .trim();
                return { full: n, ascii: clean(stripped) };
            })
            .filter((c) => c.ascii);

        // Pass 1: naive code
        const codes = new Map(); // ascii → code
        for (const c of entries) {
            const words = c.ascii.split(' ').filter(Boolean);
            if (words.length === 1) {
                codes.set(c.ascii, words[0]);
            } else {
                codes.set(c.ascii, words.map((w) => w[0]).join(''));
            }
        }

        // Pass 2: collision groups → progressive extension
        const codeToAsciis = {};
        for (const [ascii, code] of codes) {
            (codeToAsciis[code] = codeToAsciis[code] || []).push(ascii);
        }

        for (const [code, asciis] of Object.entries(codeToAsciis)) {
            if (asciis.length === 1) continue;
            const wordsList = asciis.map((a) => a.split(' ').filter(Boolean));
            const maxWords = Math.max(...wordsList.map((ws) => ws.length));
            const depths = new Array(maxWords).fill(1);

            const generate = (i) => wordsList[i].map((w, k) => w.slice(0, depths[k] || 1)).join('');

            for (let iter = 0; iter < 25; iter++) {
                const all = asciis.map((_, i) => generate(i));
                if (new Set(all).size === asciis.length) {
                    asciis.forEach((a, i) => codes.set(a, all[i]));
                    break;
                }
                // Extend rightmost not-exhausted depth
                let extended = false;
                for (let i = depths.length - 1; i >= 0; i--) {
                    const maxLen = Math.max(...wordsList.map((ws) => (ws[i] || '').length));
                    if (depths[i] < maxLen) {
                        depths[i]++;
                        extended = true;
                        break;
                    }
                }
                if (!extended) {
                    // Fully spelled — fall back to numeric suffix
                    asciis.forEach((a, i) => codes.set(a, generate(i) + (i + 1)));
                    break;
                }
            }
        }

        const result = {};
        for (const [ascii, code] of codes) result[ascii] = code;
        return result;
    }

    /**
     * Override extractColor when colorShortMap provided: lookup từng sub-sequence của
     * product-name-clean. Greedy longest match.
     */
    function extractColorWithMap(productNameClean, colorShortMap) {
        const tokens = productNameClean.split(' ').filter(Boolean);
        // Try each starting position, longest sub-sequence first
        for (let i = 0; i < tokens.length; i++) {
            for (let j = tokens.length; j > i; j--) {
                const sub = tokens.slice(i, j).join(' ');
                if (colorShortMap[sub]) {
                    const rest = [...tokens.slice(0, i), ...tokens.slice(j)].join(' ');
                    return { colorShort: colorShortMap[sub], rest };
                }
            }
        }
        // Fallback to default logic
        return extractColor(productNameClean);
    }

    // Override suggest() to accept colorShortMap
    const _originalSuggest = suggest;
    function suggestWithMap(opts) {
        const colorShortMap = (opts && opts.colorShortMap) || null;
        if (!colorShortMap) return _originalSuggest(opts);

        const supplierName = (opts && opts.supplierName) || '';
        const productName = (opts && opts.productName) || '';
        const existingCodes = (opts && opts.existingCodes) || [];
        const supplierPrefixMap = (opts && opts.supplierPrefixMap) || {};
        const customPrefix = (opts && opts.customPrefix) || '';

        const prefix = resolvePrefix(supplierName, supplierPrefixMap, customPrefix);
        const nameClean = clean(productName);

        const { type, rest: r1 } = extractType(nameClean);
        const { sizeShort, rest: r2 } = extractSize(r1);
        const { colorShort, rest: r3 } = extractColorWithMap(r2, colorShortMap);

        // Counter: SP đầu tiên (NCC, type) không có số; SP thứ 2 trở đi từ 2
        let counter = '';
        if (type) {
            const typePrefix = prefix + type;
            const reNumbered = new RegExp(`^${typePrefix}(\\d+)`);
            const reBare = new RegExp(`^${typePrefix}(?!\\d)`);
            let maxN = 0;
            let hasBare = false;
            for (const c of existingCodes) {
                const m = c.match(reNumbered);
                if (m && m[1]) maxN = Math.max(maxN, parseInt(m[1], 10));
                else if (reBare.test(c)) hasBare = true;
            }
            if (maxN > 0) counter = String(maxN + 1);
            else if (hasBare) counter = '2';
            else counter = '';
        }

        const code = prefix + (type || '') + counter + (colorShort || '') + (sizeShort || '');
        return {
            code,
            parts: { prefix, type, counter, colorShort, sizeShort, unparsed: r3 },
        };
    }

    global.Web2ProductCode = {
        suggest: suggestWithMap,
        suggestNaive: _originalSuggest,
        basePrefix,
        resolvePrefix,
        buildPrefixMap,
        buildColorShortMap,
        extractType,
        extractColor,
        extractColorWithMap,
        extractSize,
        toAsciiUpper,
    };
})(typeof window !== 'undefined' ? window : globalThis);
