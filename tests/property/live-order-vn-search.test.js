/**
 * Property 11: Vietnamese diacritics search
 *
 * For any list of products and search keyword (with or without Vietnamese
 * diacritics), the search function must return all products whose name or
 * product ID contains the keyword after normalization (tone removal).
 * Searching with an accented keyword must produce the same results as
 * searching with the equivalent tone-removed keyword.
 *
 * The pure logic under test:
 *   From main.js — removeVietnameseTones():
 *     Uses regex replacement to strip Vietnamese diacritics (NOT normalize('NFD')).
 *
 *   From main.js — performListSearch():
 *     const searchNorm = removeVietnameseTones(keyword);
 *     filteredProducts = visibleProducts.filter(p => {
 *         const nameNorm = removeVietnameseTones(p.NameGet || '');
 *         const id = String(p.Id || '');
 *         return nameNorm.includes(searchNorm) || id.includes(keyword.trim());
 *     });
 *
 * **Validates: Requirements B6.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const mainJsSource = readN2File('live-order-book/js/main.js');

/**
 * Pure function: removeVietnameseTones — exact replica of main.js regex logic.
 * Uses regex replacement (NOT normalize('NFD')).
 */
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.toLowerCase();
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    str = str.replace(/đ/g, 'd');
    return str;
}

/**
 * Pure function: search filter logic extracted from performListSearch.
 * Filters visible products by normalized name or raw ID match.
 */
function searchProducts(products, keyword) {
    const trimmed = keyword.trim();
    if (!trimmed) return [];
    const searchNorm = removeVietnameseTones(trimmed);
    const visibleProducts = products.filter(p => !p.isHidden);
    return visibleProducts.filter(p => {
        const nameNorm = removeVietnameseTones(p.NameGet || '');
        const id = String(p.Id || '');
        return nameNorm.includes(searchNorm) || id.includes(trimmed);
    });
}

// --- Vietnamese character maps for generators ---

const VN_VOWEL_MAP = {
    a: ['à', 'á', 'ạ', 'ả', 'ã', 'â', 'ầ', 'ấ', 'ậ', 'ẩ', 'ẫ', 'ă', 'ằ', 'ắ', 'ặ', 'ẳ', 'ẵ'],
    e: ['è', 'é', 'ẹ', 'ẻ', 'ẽ', 'ê', 'ề', 'ế', 'ệ', 'ể', 'ễ'],
    i: ['ì', 'í', 'ị', 'ỉ', 'ĩ'],
    o: ['ò', 'ó', 'ọ', 'ỏ', 'õ', 'ô', 'ồ', 'ố', 'ộ', 'ổ', 'ỗ', 'ơ', 'ờ', 'ớ', 'ợ', 'ở', 'ỡ'],
    u: ['ù', 'ú', 'ụ', 'ủ', 'ũ', 'ư', 'ừ', 'ứ', 'ự', 'ử', 'ữ'],
    y: ['ỳ', 'ý', 'ỵ', 'ỷ', 'ỹ'],
    d: ['đ']
};

/** All Vietnamese accented characters (lowercase). */
const ALL_VN_ACCENTED = Object.values(VN_VOWEL_MAP).flat();

/** Generator: a single Vietnamese accented character. */
const vnAccentedChar = fc.constantFrom(...ALL_VN_ACCENTED);

/** Generator: a basic ASCII lowercase letter. */
const asciiLowerChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));

/**
 * Generator: a Vietnamese-style product name.
 * Mix of ASCII lowercase and Vietnamese accented characters, 2-30 chars.
 */
const vnProductName = fc.array(
    fc.oneof(
        { weight: 3, arbitrary: asciiLowerChar },
        { weight: 2, arbitrary: vnAccentedChar },
        { weight: 1, arbitrary: fc.constant(' ') }
    ),
    { minLength: 2, maxLength: 30 }
).map(chars => chars.join(''));

/**
 * Common Vietnamese product names for realistic testing.
 */
const commonVnNames = fc.constantFrom(
    'Áo thun trắng',
    'Quần đùi',
    'Váy đầm hồng',
    'Túi xách nữ',
    'Giày thể thao',
    'Mũ lưỡi trai',
    'Đồng hồ nam',
    'Bình nước giữ nhiệt',
    'Ốp lưng điện thoại',
    'Kính râm thời trang'
);

/**
 * Generator: product name — mix of common names and random Vietnamese strings.
 */
const productNameArb = fc.oneof(
    { weight: 1, arbitrary: commonVnNames },
    { weight: 2, arbitrary: vnProductName }
);

/**
 * Generator: a product matching the Firebase schema.
 */
const productArbitrary = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: productNameArb,
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 }),
    imageUrl: fc.constant(''),
    addedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
    ProductTmplId: fc.integer({ min: 1, max: 99999 }),
    isHidden: fc.constant(false) // visible by default for search tests
});

/**
 * Generator: array of products (1 to 30 items).
 */
const productsArrayArb = fc.array(productArbitrary, { minLength: 1, maxLength: 30 });

/**
 * Generator: a search keyword that is a substring of a Vietnamese name.
 * Picks a random product name and extracts a random substring.
 */
function keywordFromName(name) {
    return fc.tuple(
        fc.integer({ min: 0, max: Math.max(0, name.length - 1) }),
        fc.integer({ min: 1, max: Math.max(1, name.length) })
    ).map(([start, len]) => {
        const end = Math.min(start + len, name.length);
        return name.substring(start, end);
    }).filter(k => k.trim().length > 0);
}

describe('Feature: live-order-book, Property 11: Vietnamese diacritics search', () => {

    /**
     * PBT 11a: Searching with accented keyword produces same results as
     * searching with the tone-removed equivalent.
     *
     * For any product list and any accented keyword, the search results
     * must be identical whether we search with the accented or unaccented form.
     */
    it('should return same results for accented vs unaccented keyword', () => {
        fc.assert(
            fc.property(
                productsArrayArb,
                productNameArb,
                (products, accentedKeyword) => {
                    const unaccentedKeyword = removeVietnameseTones(accentedKeyword);

                    const resultsAccented = searchProducts(products, accentedKeyword);
                    const resultsUnaccented = searchProducts(products, unaccentedKeyword);

                    // Both searches normalize the keyword, so name-based matches must be identical
                    const accentedIds = resultsAccented.map(p => p.Id).sort();
                    const unaccentedIds = resultsUnaccented.map(p => p.Id).sort();

                    expect(accentedIds).toEqual(unaccentedIds);
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * PBT 11b: removeVietnameseTones is idempotent.
     * Applying it twice gives the same result as applying it once.
     */
    it('removeVietnameseTones should be idempotent', () => {
        fc.assert(
            fc.property(
                vnProductName,
                (name) => {
                    const once = removeVietnameseTones(name);
                    const twice = removeVietnameseTones(once);
                    expect(twice).toBe(once);
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * PBT 11c: removeVietnameseTones always returns lowercase ASCII.
     * The output must not contain any Vietnamese accented characters.
     */
    it('removeVietnameseTones should return only lowercase ASCII', () => {
        fc.assert(
            fc.property(
                vnProductName,
                (name) => {
                    const result = removeVietnameseTones(name);
                    // Must not contain any Vietnamese accented characters
                    for (const ch of ALL_VN_ACCENTED) {
                        expect(result).not.toContain(ch);
                    }
                    // Must be lowercase
                    expect(result).toBe(result.toLowerCase());
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * PBT 11d: A product whose name contains the keyword (after normalization)
     * must appear in search results.
     */
    it('should find product when normalized name contains normalized keyword', () => {
        fc.assert(
            fc.property(
                productsArrayArb.filter(arr => arr.length > 0),
                fc.integer({ min: 0, max: 29 }),
                (products, idx) => {
                    const product = products[idx % products.length];
                    const name = product.NameGet || '';
                    if (name.trim().length === 0) return; // skip empty names

                    // Take a substring of the normalized name as keyword
                    const normName = removeVietnameseTones(name);
                    if (normName.length === 0) return;

                    const start = 0;
                    const end = Math.min(3, normName.length);
                    const keyword = normName.substring(start, end).trim();
                    if (!keyword) return;

                    const results = searchProducts(products, keyword);
                    const resultIds = results.map(p => p.Id);

                    // The product whose name contains this keyword must be in results
                    expect(resultIds).toContain(product.Id);
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * PBT 11e: Empty keyword returns empty results.
     */
    it('should return empty results for empty or whitespace keyword', () => {
        fc.assert(
            fc.property(
                productsArrayArb,
                fc.constantFrom('', ' ', '  ', '\t'),
                (products, keyword) => {
                    const results = searchProducts(products, keyword);
                    expect(results).toEqual([]);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 11f: Search results only contain visible products (isHidden !== true).
     */
    it('should only return visible products in search results', () => {
        const mixedProducts = fc.array(
            fc.record({
                Id: fc.integer({ min: 1, max: 999999 }),
                NameGet: productNameArb,
                soldQty: fc.integer({ min: 0, max: 100 }),
                orderedQty: fc.integer({ min: 0, max: 100 }),
                imageUrl: fc.constant(''),
                addedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
                ProductTmplId: fc.integer({ min: 1, max: 99999 }),
                isHidden: fc.boolean()
            }),
            { minLength: 1, maxLength: 30 }
        );

        fc.assert(
            fc.property(
                mixedProducts,
                productNameArb,
                (products, keyword) => {
                    const results = searchProducts(products, keyword);
                    for (const p of results) {
                        expect(p.isHidden).not.toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: main.js contains removeVietnameseTones with regex approach.
     */
    it('source code should contain removeVietnameseTones with regex replacement', () => {
        expect(mainJsSource).toContain('function removeVietnameseTones(str)');
        expect(mainJsSource).toContain("str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')");
        expect(mainJsSource).toContain("str = str.replace(/đ/g, 'd')");
    });

    /**
     * Source code verification: main.js contains performListSearch with normalization.
     */
    it('source code should contain performListSearch with Vietnamese normalization', () => {
        expect(mainJsSource).toContain('function performListSearch');
        expect(mainJsSource).toContain('removeVietnameseTones(listSearchKeyword)');
        expect(mainJsSource).toContain("removeVietnameseTones(p.NameGet || '')");
    });
});
