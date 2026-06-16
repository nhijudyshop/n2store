// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — test sinh mã SP.
// =====================================================
// Test Web2ProductCode.suggest() + extractType — bám sát dữ liệu shop thật.
// Chạy: node scripts/test-web2-product-code.js
// Mục tiêu: chốt rule "tìm TỪ LOẠI dù không ở đầu tên" (1606 A1 ÁO… → AO, không MM)
// + biến thể override đúng (Đỏ→DO, Trắng→TRANG) + counter + size.
// =====================================================
require('../web2/shared/web2-product-code.js');
const PC = globalThis.Web2ProductCode;

const PREFIX = { 'HÀ NỘI': 'HN', 'HƯƠNG CHÂU': 'HC' };
let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
    if (actual === expected) {
        pass += 1;
    } else {
        fail += 1;
        console.error(
            `  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
        );
    }
}

// ---- 1. extractType: TỪ LOẠI tìm được dù sau mã nội bộ, né ĐẦM↔ĐẬM ----
console.log('extractType:');
const typeCases = [
    ['1606 A1 ÁO TN TRƠN', 'AO'], // gốc bug HNMMTRANG → giờ AO
    ['ÁO', 'AO'],
    ['QUẦN TÂY CẠP CAO', 'QUAN'],
    ['2003 B5 SET ÁO DÀI', 'AO'],
    ['SET ÁO DÀI CÁCH TÂN', 'AO'],
    ['ÁO KHOÁC DÙ', 'AO'],
    ['GUỐC CAO GÓT', 'GUOC'],
    ['ĐẦM ĐỎ', 'DAM'],
    ['ÁO HỒNG ĐẬM', 'AO'], // AO match trước, KHÔNG nhầm ĐẬM→DAM
    ['HỒNG ĐẬM', 'MM'], // ĐẬM (tính từ) không phải token đầu → MM
    ['GIÀY ĐEN SIZE 32', 'MM'], // GIÀY không trong 6 keyword → MM
    ['2000 QUẦN TEST NHẬP B4', 'QUAN'],
];
for (const [name, expected] of typeCases) {
    const clean = PC.toAsciiUpper(name)
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    eq(PC.extractType(clean).type, expected, `extractType("${name}")`);
}

// ---- 2. suggest() full code — so-order path (override màu/size từ biến thể) ----
console.log('suggest (override path = so-order _assignKhoCodes):');
function code(opts) {
    return PC.suggest({ supplierPrefixMap: PREFIX, ...opts }).code;
}
// Bug gốc: hàng "Đỏ" + tên "1606 A1 ÁO TN TRƠN" KHÔNG được ra HNMMTRANG nữa.
eq(
    code({ supplierName: 'HÀ NỘI', productName: '1606 A1 ÁO TN TRƠN', overrideColorShort: 'DO' }),
    'HNAODO',
    '1606 A1 ÁO TN TRƠN + Đỏ → HNAODO'
);
eq(
    code({
        supplierName: 'HÀ NỘI',
        productName: '1606 A1 ÁO TN TRƠN',
        overrideColorShort: 'TRANG',
    }),
    'HNAOTRANG',
    '1606 A1 ÁO TN TRƠN + Trắng → HNAOTRANG (không MM)'
);
eq(
    code({
        supplierName: 'HÀ NỘI',
        productName: 'ÁO',
        overrideColorShort: 'XL',
        overrideSizeShort: 'L',
    }),
    'HNAOXLL',
    'ÁO + Xanh Lá/L → HNAOXLL'
);
// Counter: SP AO thứ 2 của HC.
eq(
    code({
        supplierName: 'HƯƠNG CHÂU',
        productName: 'ÁO KHOÁC DÙ',
        overrideColorShort: 'BE',
        overrideSizeShort: '28',
        existingCodes: ['HCAOXAMS'],
    }),
    'HCAO2BE28',
    'ÁO thứ 2 của HC → counter 2 (HCAO2BE28)'
);

// ---- 3. suggest() — name-extraction path (colorShortMap, không override) ----
console.log('suggest (colorShortMap path):');
const colorShortMap = PC.buildColorShortMap(['Đỏ', 'Trắng', 'Xanh Dương', 'Xanh Lá']);
eq(
    PC.suggest({
        supplierPrefixMap: PREFIX,
        supplierName: 'HƯƠNG CHÂU',
        productName: 'ĐẦM ĐỎ',
        colorShortMap,
    }).code,
    'HCDAMDO',
    'ĐẦM ĐỎ → HCDAMDO (loại đầu + màu trích từ tên)'
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
