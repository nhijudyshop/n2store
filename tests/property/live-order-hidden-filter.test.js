/**
 * Property 3: Hidden filter partition
 *
 * For any list of products with mixed isHidden values, the visible filter
 * must return exactly the products with isHidden !== true, and the hidden
 * filter must return exactly the products with isHidden === true. The two
 * sets must partition the entire list (no overlap, no missing items).
 *
 * The pure logic under test:
 *   From main.js (Admin page):
 *     const visibleProducts = Object.values(localProducts).filter(p => !p.isHidden);
 *
 *   From hidden-products.js (Hidden page):
 *     const hiddenProducts = Object.entries(localProducts).filter(([, p]) => p.isHidden === true);
 *
 * **Validates: Requirements B4.4, B4.5**
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
const hiddenProductsSource = readN2File('live-order-book/js/hidden-products.js');

/**
 * Pure function: filter visible products (Admin page logic).
 * Products where isHidden is falsy are visible.
 */
function filterVisible(products) {
    return products.filter(p => !p.isHidden);
}

/**
 * Pure function: filter hidden products (Hidden page logic).
 * Products where isHidden === true are hidden.
 */
function filterHidden(products) {
    return products.filter(p => p.isHidden === true);
}

/**
 * Generator: random product with valid fields matching the Firebase schema.
 */
const productArbitrary = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 }),
    imageUrl: fc.oneof(fc.constant(''), fc.webUrl()),
    addedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
    ProductTmplId: fc.integer({ min: 1, max: 99999 }),
    isHidden: fc.boolean()
});

/**
 * Generator: random array of products (0 to 50 items).
 */
const productsArrayArbitrary = fc.array(productArbitrary, { minLength: 0, maxLength: 50 });

describe('Feature: live-order-book, Property 3: Hidden filter partition', () => {

    /**
     * PBT 3a: visible + hidden counts equal total count (partition size).
     */
    it('should partition: visible count + hidden count = total count', () => {
        fc.assert(
            fc.property(
                productsArrayArbitrary,
                (products) => {
                    const visible = filterVisible(products);
                    const hidden = filterHidden(products);
                    expect(visible.length + hidden.length).toBe(products.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 3b: no overlap — every visible product has isHidden falsy,
     * every hidden product has isHidden === true.
     */
    it('should have no overlap between visible and hidden sets', () => {
        fc.assert(
            fc.property(
                productsArrayArbitrary,
                (products) => {
                    const visible = filterVisible(products);
                    const hidden = filterHidden(products);

                    // All visible products must NOT be hidden
                    for (const p of visible) {
                        expect(p.isHidden).not.toBe(true);
                    }
                    // All hidden products must be hidden
                    for (const p of hidden) {
                        expect(p.isHidden).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 3c: no missing items — concatenating visible + hidden yields
     * the same elements as the original list (order-independent).
     */
    it('should have no missing items: visible + hidden = entire list', () => {
        fc.assert(
            fc.property(
                productsArrayArbitrary,
                (products) => {
                    const visible = filterVisible(products);
                    const hidden = filterHidden(products);
                    const combined = [...visible, ...hidden];

                    // Same length
                    expect(combined.length).toBe(products.length);

                    // Every original product must appear in combined
                    // Use Id + isHidden to track (since Ids may repeat, compare by reference)
                    const originalSet = new Set(products);
                    const combinedSet = new Set(combined);
                    expect(combinedSet.size).toBe(originalSet.size);
                    for (const p of originalSet) {
                        expect(combinedSet.has(p)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 3d: all-hidden list → visible is empty, hidden is entire list.
     */
    it('should return empty visible when all products are hidden', () => {
        fc.assert(
            fc.property(
                fc.array(
                    productArbitrary.map(p => ({ ...p, isHidden: true })),
                    { minLength: 1, maxLength: 30 }
                ),
                (products) => {
                    const visible = filterVisible(products);
                    const hidden = filterHidden(products);
                    expect(visible.length).toBe(0);
                    expect(hidden.length).toBe(products.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 3e: all-visible list → hidden is empty, visible is entire list.
     */
    it('should return empty hidden when no products are hidden', () => {
        fc.assert(
            fc.property(
                fc.array(
                    productArbitrary.map(p => ({ ...p, isHidden: false })),
                    { minLength: 1, maxLength: 30 }
                ),
                (products) => {
                    const visible = filterVisible(products);
                    const hidden = filterHidden(products);
                    expect(visible.length).toBe(products.length);
                    expect(hidden.length).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: main.js contains the visible filter logic.
     */
    it('source code main.js should contain visible filter logic', () => {
        expect(mainJsSource).toContain('.filter(p => !p.isHidden)');
    });

    /**
     * Source code verification: hidden-products.js contains the hidden filter logic.
     */
    it('source code hidden-products.js should contain hidden filter logic', () => {
        expect(hiddenProductsSource).toContain('.isHidden === true');
    });
});
