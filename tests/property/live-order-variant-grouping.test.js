/**
 * Property 10: Variant grouping invariant
 *
 * For any list of products, the groupByProductTmplId function must ensure:
 * (a) all products in the same group share the same ProductTmplId,
 * (b) total products after grouping equals total before,
 * (c) no products are lost or duplicated.
 *
 * The pure logic under test (from main.js — updateProductListUI):
 *   const groups = {};
 *   productsToDisplay.forEach(p => {
 *       const tmplId = p.ProductTmplId || p.Id;
 *       if (!groups[tmplId]) groups[tmplId] = { products: [], maxAddedAt: 0 };
 *       groups[tmplId].products.push(p);
 *       groups[tmplId].maxAddedAt = Math.max(groups[tmplId].maxAddedAt, p.addedAt || 0);
 *   });
 *
 * **Validates: Requirements B2.2**
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
 * Pure function: replicates the variant grouping logic from updateProductListUI.
 */
function groupByProductTmplId(products) {
    const groups = {};
    products.forEach(p => {
        const tmplId = p.ProductTmplId || p.Id;
        if (!groups[tmplId]) groups[tmplId] = { products: [], maxAddedAt: 0 };
        groups[tmplId].products.push(p);
        groups[tmplId].maxAddedAt = Math.max(groups[tmplId].maxAddedAt, p.addedAt || 0);
    });
    return groups;
}

/**
 * Generator: random product with random ProductTmplId values.
 * Some products share the same ProductTmplId (variants of the same template).
 */
const productArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 80 }),
    ProductTmplId: fc.oneof(
        fc.integer({ min: 1, max: 20 }),   // small range to encourage grouping
        fc.constant(null),
        fc.constant(undefined)
    ),
    soldQty: fc.integer({ min: 0, max: 500 }),
    orderedQty: fc.integer({ min: 0, max: 500 }),
    addedAt: fc.oneof(
        fc.integer({ min: 1700000000000, max: 1800000000000 }),
        fc.constant(0),
        fc.constant(undefined)
    ),
    imageUrl: fc.oneof(fc.constant(null), fc.webUrl()),
    isHidden: fc.boolean()
});

const productListArb = fc.array(productArb, { minLength: 0, maxLength: 50 });

describe('Feature: live-order-book, Property 10: Variant grouping invariant', () => {

    /**
     * PBT 10a: All products in the same group share the same effective ProductTmplId.
     */
    it('should group products so all items in a group share the same ProductTmplId', () => {
        fc.assert(
            fc.property(
                productListArb,
                (products) => {
                    const groups = groupByProductTmplId(products);

                    for (const [tmplId, group] of Object.entries(groups)) {
                        for (const p of group.products) {
                            const effectiveTmplId = p.ProductTmplId || p.Id;
                            expect(String(effectiveTmplId)).toBe(tmplId);
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 10b: Total products after grouping equals total before (no loss).
     */
    it('should preserve total product count after grouping', () => {
        fc.assert(
            fc.property(
                productListArb,
                (products) => {
                    const groups = groupByProductTmplId(products);

                    const totalAfter = Object.values(groups)
                        .reduce((sum, g) => sum + g.products.length, 0);

                    expect(totalAfter).toBe(products.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 10c: No product is lost or duplicated — every input product appears
     * exactly once across all groups.
     */
    it('should not lose or duplicate any product', () => {
        fc.assert(
            fc.property(
                productListArb,
                (products) => {
                    const groups = groupByProductTmplId(products);

                    // Collect all products from groups
                    const allGrouped = [];
                    for (const group of Object.values(groups)) {
                        allGrouped.push(...group.products);
                    }

                    // Same length
                    expect(allGrouped.length).toBe(products.length);

                    // Each input product is reference-equal to exactly one grouped product
                    for (const p of products) {
                        const count = allGrouped.filter(gp => gp === p).length;
                        expect(count).toBe(1);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 10d: maxAddedAt in each group equals the maximum addedAt among its products.
     */
    it('should track maxAddedAt correctly per group', () => {
        fc.assert(
            fc.property(
                productListArb,
                (products) => {
                    const groups = groupByProductTmplId(products);

                    for (const group of Object.values(groups)) {
                        const expectedMax = Math.max(
                            0,
                            ...group.products.map(p => p.addedAt || 0)
                        );
                        expect(group.maxAddedAt).toBe(expectedMax);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: main.js contains the grouping logic.
     */
    it('source code should contain variant grouping logic', () => {
        expect(mainJsSource).toContain('ProductTmplId || p.Id');
        expect(mainJsSource).toContain('groups[tmplId]');
        expect(mainJsSource).toContain('groups[tmplId].products.push(p)');
        expect(mainJsSource).toContain('groups[tmplId].maxAddedAt');
    });
});
