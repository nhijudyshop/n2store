/**
 * Property 12: TPOS search priority ordering
 *
 * For any search keyword and list of TPOS products, the search results must
 * be sorted by priority: (1) match in bracket code [xxx], (2) match in
 * product code, (3) match in product name.
 *
 * The pure logic under test:
 *   From main.js — searchProducts(searchText):
 *     1. Filter: match nameNoSign, name (lowercase), or code (lowercase)
 *     2. Sort: bracket match > code match > name match
 *     3. Cap at 10 results
 *     4. searchText < 2 chars → empty array
 *
 *   From main.js — removeVietnameseTones(str):
 *     Regex-based Vietnamese diacritics removal.
 *
 *   productsData shape: { id, name, nameNoSign, code }
 *
 * **Validates: Requirements B1.2**
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

// --- Pure function replicas from main.js ---

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
 * Pure replica of searchProducts from main.js.
 * Takes productsData array and searchText, returns sorted + capped results.
 */
function searchProducts(productsData, searchText) {
    if (!searchText || searchText.length < 2) return [];

    const searchLower = searchText.toLowerCase();
    const searchNoSign = removeVietnameseTones(searchText);

    const matched = productsData.filter(product => {
        const matchName = product.nameNoSign.includes(searchNoSign);
        const matchNameOriginal = product.name && product.name.toLowerCase().includes(searchLower);
        const matchCode = product.code && product.code.toLowerCase().includes(searchLower);
        return matchName || matchNameOriginal || matchCode;
    });

    // Sort by priority: [bracket] > code > name
    matched.sort((a, b) => {
        const extractBracket = (name) => {
            const match = name?.match(/\[([^\]]+)\]/);
            return match ? match[1].toLowerCase().trim() : '';
        };

        const aBracket = extractBracket(a.name);
        const bBracket = extractBracket(b.name);
        const aMatchBracket = aBracket && aBracket.includes(searchLower);
        const bMatchBracket = bBracket && bBracket.includes(searchLower);

        if (aMatchBracket && !bMatchBracket) return -1;
        if (!aMatchBracket && bMatchBracket) return 1;

        if (aMatchBracket && bMatchBracket) {
            if (aBracket === searchLower && bBracket !== searchLower) return -1;
            if (aBracket !== searchLower && bBracket === searchLower) return 1;
            if (aBracket.length !== bBracket.length) return aBracket.length - bBracket.length;
            return aBracket.localeCompare(bBracket);
        }

        const aMatchCode = a.code && a.code.toLowerCase().includes(searchLower);
        const bMatchCode = b.code && b.code.toLowerCase().includes(searchLower);
        if (aMatchCode && !bMatchCode) return -1;
        if (!aMatchCode && bMatchCode) return 1;

        return a.name.localeCompare(b.name);
    });

    return matched.slice(0, 10);
}

// --- Helper: classify a product's match type ---

function classifyMatch(product, searchLower) {
    const extractBracket = (name) => {
        const match = name?.match(/\[([^\]]+)\]/);
        return match ? match[1].toLowerCase().trim() : '';
    };
    const bracket = extractBracket(product.name);
    if (bracket && bracket.includes(searchLower)) return 'bracket';
    if (product.code && product.code.toLowerCase().includes(searchLower)) return 'code';
    return 'name';
}

const PRIORITY_ORDER = { bracket: 0, code: 1, name: 2 };

// --- Generators ---

const asciiLowerChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));
const digitChar = fc.constantFrom(...'0123456789'.split(''));

/** Helper: generate a string from a char arbitrary with length constraints. */
function stringFromChars(charArb, minLength, maxLength) {
    return fc.array(charArb, { minLength, maxLength }).map(chars => chars.join(''));
}

/** Generator: a simple lowercase keyword (2-5 chars) for search. */
const searchKeywordArb = stringFromChars(asciiLowerChar, 2, 5);

/** Generator: a product code like "SP001", "ABC123". */
const productCodeArb = fc.tuple(
    stringFromChars(asciiLowerChar, 2, 4),
    stringFromChars(digitChar, 1, 4)
).map(([letters, digits]) => letters.toUpperCase() + digits);

/**
 * Generator: a TPOS product with the shape { id, name, nameNoSign, code }.
 * Optionally embeds a keyword in bracket, code, or name for controlled testing.
 */
function productWithKeyword(keyword) {
    const bracketName = fc.tuple(
        stringFromChars(asciiLowerChar, 1, 8),
        stringFromChars(asciiLowerChar, 0, 5)
    ).map(([prefix, suffix]) => `${prefix} [${keyword}${suffix}] product`);

    const codeName = productCodeArb.map(code => code);
    const codeWithKeyword = stringFromChars(asciiLowerChar, 0, 3)
        .map(suffix => (keyword + suffix).toUpperCase());

    const plainName = fc.tuple(
        stringFromChars(asciiLowerChar, 1, 8),
        stringFromChars(asciiLowerChar, 0, 8)
    ).map(([prefix, suffix]) => `${prefix} ${keyword} ${suffix}`);

    const nonMatchingName = stringFromChars(
        fc.constantFrom(...'zyxwvuts'.split('')),
        3, 10
    ).filter(n => !n.includes(keyword));

    // Product that matches via bracket
    const bracketProduct = fc.tuple(
        fc.integer({ min: 1, max: 999999 }),
        bracketName,
        productCodeArb.filter(c => !c.toLowerCase().includes(keyword))
    ).map(([id, name, code]) => ({
        id,
        name,
        nameNoSign: removeVietnameseTones(name),
        code
    }));

    // Product that matches via code (not bracket)
    const codeProduct = fc.tuple(
        fc.integer({ min: 1, max: 999999 }),
        nonMatchingName,
        codeWithKeyword
    ).map(([id, name, code]) => ({
        id,
        name,
        nameNoSign: removeVietnameseTones(name),
        code
    }));

    // Product that matches via name only (not bracket, not code)
    const nameProduct = fc.tuple(
        fc.integer({ min: 1, max: 999999 }),
        plainName,
        productCodeArb.filter(c => !c.toLowerCase().includes(keyword))
    ).map(([id, name, code]) => ({
        id,
        name,
        nameNoSign: removeVietnameseTones(name),
        code
    }));

    return { bracketProduct, codeProduct, nameProduct };
}

/**
 * Generator: a random TPOS product (may or may not match any keyword).
 */
const randomProduct = fc.tuple(
    fc.integer({ min: 1, max: 999999 }),
    stringFromChars(asciiLowerChar, 2, 15),
    productCodeArb
).map(([id, name, code]) => ({
    id,
    name,
    nameNoSign: removeVietnameseTones(name),
    code
}));

describe('Feature: live-order-book, Property 12: TPOS search priority ordering', () => {

    /**
     * PBT 12a: Bracket-matched products always come before code-matched products,
     * which always come before name-only-matched products.
     */
    it('should sort results by priority: bracket > code > name', () => {
        fc.assert(
            fc.property(
                searchKeywordArb,
                fc.integer({ min: 1, max: 3 }),
                fc.integer({ min: 1, max: 3 }),
                fc.integer({ min: 1, max: 3 }),
                (keyword, numBracket, numCode, numName) => {
                    const gens = productWithKeyword(keyword);

                    // Build a mixed list with all three match types
                    const bracketProducts = [];
                    const codeProducts = [];
                    const nameProducts = [];

                    // Generate deterministic products for each category
                    for (let i = 0; i < numBracket; i++) {
                        bracketProducts.push({
                            id: 1000 + i,
                            name: `item${i} [${keyword}] product`,
                            nameNoSign: removeVietnameseTones(`item${i} [${keyword}] product`),
                            code: `ZZZ${i}`
                        });
                    }
                    for (let i = 0; i < numCode; i++) {
                        codeProducts.push({
                            id: 2000 + i,
                            name: `zzzzz${i}`,
                            nameNoSign: `zzzzz${i}`,
                            code: keyword.toUpperCase() + i
                        });
                    }
                    for (let i = 0; i < numName; i++) {
                        nameProducts.push({
                            id: 3000 + i,
                            name: `aaa ${keyword} bbb${i}`,
                            nameNoSign: `aaa ${keyword} bbb${i}`,
                            code: `YYY${i}`
                        });
                    }

                    // Shuffle all products together
                    const allProducts = [...nameProducts, ...codeProducts, ...bracketProducts];
                    // Simple shuffle
                    for (let i = allProducts.length - 1; i > 0; i--) {
                        const j = (i * 7 + 3) % (i + 1);
                        [allProducts[i], allProducts[j]] = [allProducts[j], allProducts[i]];
                    }

                    const results = searchProducts(allProducts, keyword);

                    // Classify each result
                    const searchLower = keyword.toLowerCase();
                    const priorities = results.map(p => PRIORITY_ORDER[classifyMatch(p, searchLower)]);

                    // Priorities must be non-decreasing (sorted)
                    for (let i = 1; i < priorities.length; i++) {
                        expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    /**
     * PBT 12b: Results are capped at 10 items.
     */
    it('should cap results at 10 items', () => {
        fc.assert(
            fc.property(
                searchKeywordArb,
                fc.integer({ min: 15, max: 30 }),
                (keyword, count) => {
                    const products = [];
                    for (let i = 0; i < count; i++) {
                        products.push({
                            id: i + 1,
                            name: `product ${keyword} item${i}`,
                            nameNoSign: `product ${keyword} item${i}`,
                            code: `CODE${i}`
                        });
                    }

                    const results = searchProducts(products, keyword);
                    expect(results.length).toBeLessThanOrEqual(10);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 12c: searchText shorter than 2 characters returns empty array.
     */
    it('should return empty array for searchText shorter than 2 chars', () => {
        fc.assert(
            fc.property(
                fc.array(randomProduct, { minLength: 1, maxLength: 20 }),
                stringFromChars(asciiLowerChar, 0, 1),
                (products, shortKeyword) => {
                    const results = searchProducts(products, shortKeyword);
                    expect(results).toEqual([]);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 12d: null/undefined/empty searchText returns empty array.
     */
    it('should return empty array for null/undefined/empty searchText', () => {
        fc.assert(
            fc.property(
                fc.array(randomProduct, { minLength: 1, maxLength: 10 }),
                fc.constantFrom(null, undefined, ''),
                (products, searchText) => {
                    const results = searchProducts(products, searchText);
                    expect(results).toEqual([]);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 12e: Within bracket-matched group, exact match comes before partial match,
     * and shorter bracket comes before longer bracket.
     */
    it('should sort bracket matches: exact > partial, shorter > longer', () => {
        fc.assert(
            fc.property(
                searchKeywordArb,
                stringFromChars(asciiLowerChar, 1, 5),
                (keyword, extra) => {
                    const exactBracket = {
                        id: 1,
                        name: `item [${keyword}] exact`,
                        nameNoSign: removeVietnameseTones(`item [${keyword}] exact`),
                        code: 'ZZZ1'
                    };
                    const partialBracket = {
                        id: 2,
                        name: `item [${keyword}${extra}] partial`,
                        nameNoSign: removeVietnameseTones(`item [${keyword}${extra}] partial`),
                        code: 'ZZZ2'
                    };

                    // Put partial first to test sorting
                    const products = [partialBracket, exactBracket];
                    const results = searchProducts(products, keyword);

                    if (results.length === 2) {
                        // Exact bracket match should come first
                        expect(results[0].id).toBe(1);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 12f: All results actually match the search keyword
     * (via bracket, code, or name).
     */
    it('should only return products that match the keyword', () => {
        fc.assert(
            fc.property(
                searchKeywordArb,
                fc.array(randomProduct, { minLength: 1, maxLength: 20 }),
                (keyword, products) => {
                    const results = searchProducts(products, keyword);
                    const searchLower = keyword.toLowerCase();
                    const searchNoSign = removeVietnameseTones(keyword);

                    for (const p of results) {
                        const matchName = p.nameNoSign.includes(searchNoSign);
                        const matchNameOriginal = p.name && p.name.toLowerCase().includes(searchLower);
                        const matchCode = p.code && p.code.toLowerCase().includes(searchLower);
                        expect(matchName || matchNameOriginal || matchCode).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: main.js contains searchProducts with priority sorting.
     */
    it('source code should contain searchProducts with bracket > code > name priority', () => {
        expect(mainJsSource).toContain('function searchProducts(searchText)');
        expect(mainJsSource).toContain('Sort by priority: [bracket] > code > name');
        expect(mainJsSource).toContain('extractBracket');
        expect(mainJsSource).toContain('aMatchBracket && !bMatchBracket');
        expect(mainJsSource).toContain('aMatchCode && !bMatchCode');
        expect(mainJsSource).toContain('matched.slice(0, 10)');
    });

    /**
     * Source code verification: main.js contains productsData with expected shape.
     */
    it('source code should contain productsData mapping with id, name, nameNoSign, code', () => {
        expect(mainJsSource).toContain('productsData = jsonData.map');
        expect(mainJsSource).toContain("nameNoSign: removeVietnameseTones(row['Tên sản phẩm']");
        expect(mainJsSource).toContain("code: row['Mã sản phẩm']");
    });
});
