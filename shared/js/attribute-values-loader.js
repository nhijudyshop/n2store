// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Attribute Values Loader (shared)
 * ------------------------------------------------------------
 * Đọc danh sách thuộc tính biến thể (Màu, Size Số, Size Chữ) từ file CSV có sẵn
 * `purchase-orders/product_attribute_values_rows.csv`.
 *
 * Dùng cho bất kỳ module nào cần biết tập giá trị màu/size hợp lệ để normalize
 * tên sản phẩm, detect biến thể, v.v. (VD: KPI upselling logic).
 *
 * Public API:
 *   await window.AttributeValuesLoader.load()
 *     -> { colors: Set<string>, sizes: Set<string>, all: Set<string> }
 *   Tất cả giá trị trong Set đều uppercase + trimmed, để so khớp nhanh.
 *
 * Fallback: nếu fetch CSV thất bại, dùng hardcode list tối thiểu giống
 * purchase-orders/js/dialogs.js fallback (line ~402-404).
 */

(function (global) {
    'use strict';

    const HARDCODED_COLORS = [
        'Trắng', 'Đen', 'Đỏ', 'Xanh', 'Xám', 'Nude', 'Vàng',
        'Hồng', 'Nâu', 'Cam', 'Tím', 'Be', 'Kem', 'Bạc',
        'Trắng Kem', 'Trắng Sáng', 'Sọc', 'Rêu', 'Mint', 'Navy'
    ];
    const HARDCODED_SIZES_NUM = [
        '1', '2', '3', '4',
        '27', '28', '29', '30', '31', '32', '33', '34', '35',
        '36', '37', '38', '39', '40', '41', '42', '43', '44'
    ];
    const HARDCODED_SIZES_LETTER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'FREESIZE'];

    // Tên attribute trong CSV → bucket
    const ATTR_NAME_TO_BUCKET = {
        'Màu': 'colors',
        'Size Số': 'sizes',
        'Size Chữ': 'sizes'
    };

    let cachedPromise = null;

    /**
     * Suy luận base path tới thư mục purchase-orders/ bất kể module gọi đang ở đâu.
     */
    function resolveCsvUrl() {
        const pathname = global.location ? global.location.pathname : '/';
        if (pathname.includes('/purchase-orders/')) {
            return pathname.split('/').slice(0, -1).join('/') + '/product_attribute_values_rows.csv';
        }
        // Module khác (orders-report, customer-hub…) → ngược về purchase-orders
        return pathname.split('/').slice(0, -1).join('/') + '/../purchase-orders/product_attribute_values_rows.csv';
    }

    /**
     * Parse CSV text → array of row objects.
     * Hỗ trợ giá trị có dấu phẩy trong ngoặc kép.
     */
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const values = [];
            let current = '';
            let inQuotes = false;
            for (const ch of lines[i]) {
                if (ch === '"') { inQuotes = !inQuotes; }
                else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else { current += ch; }
            }
            values.push(current.trim());
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
            rows.push(obj);
        }
        return rows;
    }

    /**
     * Lấy tên attribute từ field `name_get` (format: "Màu: Trắng", "Size Số: 27").
     */
    function attributeNameFromRow(row) {
        const nameGet = row.name_get || '';
        const colonIdx = nameGet.indexOf(':');
        if (colonIdx === -1) return null;
        return nameGet.slice(0, colonIdx).trim();
    }

    function buildFallback() {
        const colors = new Set(HARDCODED_COLORS.map(v => v.toUpperCase()));
        const sizes = new Set([
            ...HARDCODED_SIZES_NUM,
            ...HARDCODED_SIZES_LETTER
        ].map(v => v.toUpperCase()));
        const all = new Set([...colors, ...sizes]);
        return { colors, sizes, all, _source: 'fallback' };
    }

    async function loadFromCSV() {
        const url = resolveCsvUrl();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
        const text = await res.text();
        const rows = parseCSV(text);

        const colors = new Set();
        const sizes = new Set();
        for (const row of rows) {
            if (row.is_active !== 'true') continue;
            const attrName = attributeNameFromRow(row);
            const bucket = attrName ? ATTR_NAME_TO_BUCKET[attrName] : null;
            if (!bucket) continue;
            const value = (row.value || '').trim();
            if (!value) continue;
            const upper = value.toUpperCase();
            if (bucket === 'colors') colors.add(upper);
            else sizes.add(upper);
        }

        if (colors.size === 0 && sizes.size === 0) {
            throw new Error('CSV parsed but no Màu/Size values found');
        }

        const all = new Set([...colors, ...sizes]);
        return { colors, sizes, all, _source: 'csv' };
    }

    /**
     * Load + cache. Trả cùng một Promise trong suốt phiên làm việc.
     * Lỗi → fallback hardcode, không throw.
     */
    function load() {
        if (cachedPromise) return cachedPromise;
        cachedPromise = loadFromCSV().catch(err => {
            console.warn('[AttributeValuesLoader] CSV load failed, dùng fallback hardcode:', err?.message || err);
            return buildFallback();
        });
        return cachedPromise;
    }

    /**
     * Cho test: reset cache để load lại.
     */
    function reset() {
        cachedPromise = null;
    }

    global.AttributeValuesLoader = { load, reset, _parseCSV: parseCSV };
})(typeof window !== 'undefined' ? window : globalThis);
