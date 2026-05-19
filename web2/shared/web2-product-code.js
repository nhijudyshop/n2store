// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — PRODUCT CODE SUGGESTION
// =====================================================
// Sinh mã SP tự động theo công thức:
//   <PREFIX_NCC><LOAI><SỐ?><MÀU><SIZE?>
//
// Ví dụ:
//   HÀ NỘI          ÁO   ĐỎ            → HN AO 1 DO       → HNAO1DO     (7)
//   HÀ NỘI          ÁO   XANH  SIZE 3  → HN AO 2 XANH S3  → HNAO2XANHS3 (11)
//   HƯƠNG CHÂU      QUẦN XANH DƯƠNG S5 → HC QUAN 1 XD S5  → HCQUAN1XDS5 (11)
//   HẢI CHÂU        ÁO   ĐEN           → HC2 AO 1 DEN     → HC2AO1DEN   (8)
//
// QUY TẮC RÚT NGẮN:
//   1. Bỏ dấu tiếng Việt (đỏ→DO, đen→DEN, trắng→TRANG)
//   2. Màu 1 từ: lấy nguyên (DO, XANH, VANG, TRANG, DEN, HONG, TIM, NAU, XAM, CAM)
//   3. Màu nhiều từ: lấy chữ cái đầu mỗi từ (XANH DƯƠNG→XD, XANH LÁ→XL, XÁM TRO→XT)
//   4. Loại SP: ÁO→AO, QUẦN→QUAN, VÁY→VAY, ĐẦM→DAM, ÁO KHOÁC→AK, ÁO THUN→AT, …
//   5. Size số: SIZE 3→S3, size 12→S12. Size chữ S/M/L/XL: giữ nguyên.
//   6. Số thứ tự: đếm loại SP của cùng NCC. SP đầu tiên KHÔNG có số (gọn).
//      SP thứ 2 trở đi có số. (Ví dụ user: AO1, AO2 — có thể bỏ số cho cái đầu)
//
// PREFIX NCC:
//   - Lấy chữ cái đầu mỗi từ. "HÀ NỘI"→HN, "HƯƠNG CHÂU"→HC, "HẢI CHÂU"→HC (trùng).
//   - Trùng: append số. HC trước → HC, HC sau → HC2, HC3, …
//   - 1 từ: lấy 2 chữ đầu. "ADIDAS"→AD.
//
// Usage:
//   const code = Web2ProductCode.suggest({
//     supplierName: 'HƯƠNG CHÂU',
//     productName: 'QUẦN XANH DƯƠNG SIZE 5',
//     existingCodes: ['HCQUAN1DO', 'HCAO1XANH'],
//     supplierPrefixMap: { 'HÀ NỘI': 'HN', 'HƯƠNG CHÂU': 'HC', 'HẢI CHÂU': 'HC2' },
//   });
//   // → 'HCQUAN2XDS5'

(function (global) {
    'use strict';

    if (global.Web2ProductCode) return;

    // ─────────────────────────────────────────────────────────
    // Bảng từ loại SP (Vietnamese → ASCII shortcode)
    // ─────────────────────────────────────────────────────────
    const TYPE_MAP = {
        ÁO: 'AO',
        AO: 'AO',
        QUẦN: 'QUAN',
        QUAN: 'QUAN',
        VÁY: 'VAY',
        VAY: 'VAY',
        ĐẦM: 'DAM',
        DAM: 'DAM',
        'ÁO KHOÁC': 'AK',
        'ÁO THUN': 'AT',
        'ÁO SƠ MI': 'ASM',
        'ÁO LEN': 'AL',
        'ÁO DÀI': 'AD',
        QUẦN: 'QUAN',
        'QUẦN JEAN': 'QJ',
        'QUẦN TÂY': 'QT',
        'QUẦN SHORT': 'QS',
        'QUẦN LÓT': 'QL',
        TÚI: 'TUI',
        GIÀY: 'GIAY',
        DÉP: 'DEP',
        MŨ: 'MU',
        NÓN: 'NON',
    };

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
    function basePrefix(supplierName) {
        if (!supplierName) return 'XX';
        const cleaned = clean(supplierName);
        const words = cleaned.split(' ').filter(Boolean);
        if (words.length === 0) return 'XX';
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
     * @returns {string} prefix final (đã unique)
     */
    function resolvePrefix(supplierName, supplierPrefixMap) {
        const map = supplierPrefixMap || {};
        // Đã có trong map → trả về luôn
        if (map[supplierName]) return map[supplierName];

        const base = basePrefix(supplierName);
        const usedPrefixes = new Set(Object.values(map));
        if (!usedPrefixes.has(base)) return base;

        // Trùng → append số 2, 3, …
        let n = 2;
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
        // Sort by length desc để match longest first
        const keys = Object.keys(TYPE_MAP).sort((a, b) => b.length - a.length);
        for (const key of keys) {
            const keyAscii = clean(key);
            // Match nguyên từ ở đầu hoặc giữa chuỗi
            const re = new RegExp(`\\b${keyAscii}\\b`);
            if (re.test(productNameClean)) {
                const rest = productNameClean.replace(re, ' ').replace(/\s+/g, ' ').trim();
                return { type: TYPE_MAP[key], rest };
            }
        }
        return { type: null, rest: productNameClean };
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

        const prefix = resolvePrefix(supplierName, supplierPrefixMap);
        const nameClean = clean(productName);

        // Theo thứ tự: extract type → color → size từ name
        const { type, rest: r1 } = extractType(nameClean);
        const { sizeShort, rest: r2 } = extractSize(r1);
        const { colorShort, rest: r3 } = extractColor(r2);

        // Đếm số thứ tự loại SP của NCC. Luôn bắt đầu từ 1 (kể cả SP đầu tiên).
        // Tránh ambiguity về sau khi tạo SP thứ 2.
        let counter = '';
        if (type) {
            const typePrefix = prefix + type;
            const re = new RegExp(`^${typePrefix}(\\d+)`);
            let maxN = 0;
            for (const c of existingCodes) {
                const m = c.match(re);
                if (m && m[1]) maxN = Math.max(maxN, parseInt(m[1], 10));
            }
            counter = String(maxN + 1);
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
     * @returns {Object<string,string>} { 'HÀ NỘI': 'HN', 'HƯƠNG CHÂU': 'HC', 'HẢI CHÂU': 'HC2', … }
     */
    function buildPrefixMap(supplierNames) {
        const map = {};
        const used = new Set();
        for (const name of supplierNames || []) {
            if (!name || map[name]) continue;
            let base = basePrefix(name);
            let prefix = base;
            let n = 2;
            while (used.has(prefix)) {
                prefix = base + n;
                n++;
            }
            map[name] = prefix;
            used.add(prefix);
        }
        return map;
    }

    global.Web2ProductCode = {
        suggest,
        basePrefix,
        resolvePrefix,
        buildPrefixMap,
        extractType,
        extractColor,
        extractSize,
        toAsciiUpper,
    };
})(typeof window !== 'undefined' ? window : globalThis);
