// =====================================================
// TEXT PARSER - INVENTORY TRACKING
// Phase 2: Parse product text format
// =====================================================

/**
 * Parse product text to structured data
 * Format: MA [ma SP] [ten hang] [so mau] MAU [so luong]X[gia]
 * Examples:
 * - MA 721 2 MAU 10X54
 * - MA AO TAY DAI 999 60X25
 */

// Regex patterns
const PRODUCT_REGEX = /^MA\s+(.+?)\s+(\d+)\s*MAU\s+(\d+)\s*X\s*(\d+)$/i;
const PRODUCT_NO_COLOR_REGEX = /^MA\s+(.+?)\s+(\d+)\s*X\s*(\d+)$/i;

/**
 * Parse a single product text line
 * @param {string} text - Raw text input
 * @returns {Object} Parsed product object
 */
function parseProductText(text) {
    const trimmed = text.trim().toUpperCase();

    // Try with color
    let match = trimmed.match(PRODUCT_REGEX);
    if (match) {
        const soLuong = parseInt(match[3]);
        const giaDonVi = parseInt(match[4]);
        return {
            maSP: match[1].trim(),
            tenHang: '',
            soMau: parseInt(match[2]),
            soLuong: soLuong,
            giaDonVi: giaDonVi,
            thanhTien: soLuong * giaDonVi,
            rawText: text.trim(),
            isValid: true
        };
    }

    // Try without color (default 1 mau)
    match = trimmed.match(PRODUCT_NO_COLOR_REGEX);
    if (match) {
        const soLuong = parseInt(match[2]);
        const giaDonVi = parseInt(match[3]);
        return {
            maSP: match[1].trim(),
            tenHang: '',
            soMau: 1,
            soLuong: soLuong,
            giaDonVi: giaDonVi,
            thanhTien: soLuong * giaDonVi,
            rawText: text.trim(),
            isValid: true
        };
    }

    return {
        rawText: text.trim(),
        isValid: false,
        error: 'Khong parse duoc. Format: MA [ma] [so mau] MAU [SL]X[gia]'
    };
}

/**
 * Parse multiple product lines
 * @param {string} text - Multi-line text input
 * @returns {Object[]} Array of parsed products
 */
function parseMultipleProducts(text) {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => parseProductText(line));
}

/**
 * Validate product text format
 * @param {string} text - Text to validate
 * @returns {boolean} Is valid format
 */
function isValidProductFormat(text) {
    const trimmed = text.trim().toUpperCase();
    return PRODUCT_REGEX.test(trimmed) || PRODUCT_NO_COLOR_REGEX.test(trimmed);
}

/**
 * Calculate totals from product array
 * @param {Object[]} products - Array of parsed products
 * @returns {Object} Totals object
 */
function calculateProductTotals(products) {
    const validProducts = products.filter(p => p.isValid);
    return {
        tongTienHD: validProducts.reduce((sum, p) => sum + (p.thanhTien || 0), 0),
        tongMon: validProducts.reduce((sum, p) => sum + (p.soLuong || 0), 0),
        tongSanPham: validProducts.length
    };
}

console.log('[PARSER] Text parser initialized');
