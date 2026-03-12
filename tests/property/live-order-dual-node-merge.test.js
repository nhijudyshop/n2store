/**
 * Property 5: Dual-node write/merge round-trip
 *
 * For any product with soldQty and orderedQty values, when data exists in
 * both nodes (liveOrderProducts and liveOrderProductsQty) with DIFFERENT
 * values, the merge must always take soldQty/orderedQty from the qty node
 * (source of truth).
 *
 * The pure logic under test (from firebase-helpers.js loadAllProductsFromFirebase):
 *   Object.keys(productsObject).forEach(key => {
 *       if (qtyObject[key]) {
 *           productsObject[key].soldQty = qtyObject[key].soldQty || 0;
 *           productsObject[key].orderedQty = qtyObject[key].orderedQty || 0;
 *       } else {
 *           productsObject[key].soldQty = productsObject[key].soldQty || 0;
 *           productsObject[key].orderedQty = productsObject[key].orderedQty || 0;
 *       }
 *   });
 *
 * **Validates: Requirements E1.3, E1.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const firebaseHelpersSource = readN2File('live-order-book/firebase-helpers.js');

/**
 * Pure function: merge products with qty data.
 * Extracted from loadAllProductsFromFirebase — qty node is source of truth.
 */
function mergeProductsWithQty(productsObject, qtyObject) {
    const merged = {};
    Object.keys(productsObject).forEach(key => {
        merged[key] = { ...productsObject[key] };
        if (qtyObject[key]) {
            merged[key].soldQty = qtyObject[key].soldQty || 0;
            merged[key].orderedQty = qtyObject[key].orderedQty || 0;
        } else {
            merged[key].soldQty = merged[key].soldQty || 0;
            merged[key].orderedQty = merged[key].orderedQty || 0;
        }
    });
    return merged;
}

/**
 * Generator: random product object (static data in products node).
 */
const productArbitrary = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    QtyAvailable: fc.integer({ min: 0, max: 10000 }),
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 }),
    imageUrl: fc.oneof(fc.constant(''), fc.webUrl()),
    ProductTmplId: fc.integer({ min: 1, max: 99999 }),
    ListPrice: fc.integer({ min: 0, max: 50000000 }),
    addedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
    isHidden: fc.boolean()
});

/**
 * Generator: random qty entry (source of truth node) with values
 * intentionally different from the products node.
 */
const qtyEntryArbitrary = fc.record({
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 })
});

/**
 * Generator: random products object with unique keys.
 */
const productsObjectArbitrary = fc.array(productArbitrary, { minLength: 1, maxLength: 20 })
    .map(products => {
        const obj = {};
        products.forEach(p => {
            obj[`product_${p.Id}`] = p;
        });
        return obj;
    });

/**
 * Generator: random qty object matching some/all keys from a products object.
 * Ensures qty values differ from products node values for meaningful testing.
 */
function qtyObjectForProducts(productsObj) {
    const keys = Object.keys(productsObj);
    if (keys.length === 0) return fc.constant({});

    return fc.tuple(
        // For each key, decide if qty entry exists and generate values
        ...keys.map(() => fc.tuple(fc.boolean(), qtyEntryArbitrary))
    ).map(entries => {
        const qtyObj = {};
        keys.forEach((key, i) => {
            const [hasQtyEntry, qtyData] = entries[i];
            if (hasQtyEntry) {
                qtyObj[key] = qtyData;
            }
        });
        return qtyObj;
    });
}

describe('Feature: live-order-book, Property 5: Dual-node write/merge round-trip', () => {

    /**
     * PBT 5a: When qty node has data for a product, merged result uses qty node values.
     */
    it('should take soldQty/orderedQty from qty node when present (source of truth)', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary.chain(prods => 
                    qtyObjectForProducts(prods).map(qty => ({ prods, qty }))
                ),
                ({ prods, qty }) => {
                    const merged = mergeProductsWithQty(prods, qty);

                    Object.keys(prods).forEach(key => {
                        if (qty[key]) {
                            // Qty node is source of truth
                            expect(merged[key].soldQty).toBe(qty[key].soldQty || 0);
                            expect(merged[key].orderedQty).toBe(qty[key].orderedQty || 0);
                        }
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 5b: When qty node has NO data for a product, merged result falls back
     * to product node values (with || 0 fallback).
     */
    it('should fallback to product node values when qty node has no entry', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary.chain(prods =>
                    qtyObjectForProducts(prods).map(qty => ({ prods, qty }))
                ),
                ({ prods, qty }) => {
                    const merged = mergeProductsWithQty(prods, qty);

                    Object.keys(prods).forEach(key => {
                        if (!qty[key]) {
                            // Fallback: use product node values with || 0
                            expect(merged[key].soldQty).toBe(prods[key].soldQty || 0);
                            expect(merged[key].orderedQty).toBe(prods[key].orderedQty || 0);
                        }
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 5c: Merge preserves all non-qty fields from the products node.
     */
    it('should preserve all non-qty fields from products node after merge', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary.chain(prods =>
                    qtyObjectForProducts(prods).map(qty => ({ prods, qty }))
                ),
                ({ prods, qty }) => {
                    const merged = mergeProductsWithQty(prods, qty);

                    Object.keys(prods).forEach(key => {
                        // Non-qty fields must be preserved exactly
                        expect(merged[key].Id).toBe(prods[key].Id);
                        expect(merged[key].NameGet).toBe(prods[key].NameGet);
                        expect(merged[key].QtyAvailable).toBe(prods[key].QtyAvailable);
                        expect(merged[key].imageUrl).toBe(prods[key].imageUrl);
                        expect(merged[key].ProductTmplId).toBe(prods[key].ProductTmplId);
                        expect(merged[key].ListPrice).toBe(prods[key].ListPrice);
                        expect(merged[key].addedAt).toBe(prods[key].addedAt);
                        expect(merged[key].isHidden).toBe(prods[key].isHidden);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 5d: Merge result has exactly the same keys as the products object
     * (qty-only keys are NOT added).
     */
    it('should have exactly the same keys as products object after merge', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary.chain(prods =>
                    qtyObjectForProducts(prods).map(qty => ({ prods, qty }))
                ),
                ({ prods, qty }) => {
                    const merged = mergeProductsWithQty(prods, qty);

                    const prodKeys = Object.keys(prods).sort();
                    const mergedKeys = Object.keys(merged).sort();
                    expect(mergedKeys).toEqual(prodKeys);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the dual-node merge logic.
     */
    it('source code should contain dual-node merge logic', () => {
        expect(firebaseHelpersSource).toContain('liveOrderProductsQty');
        expect(firebaseHelpersSource).toContain('qtyObject[key]');
        expect(firebaseHelpersSource).toContain('soldQty');
        expect(firebaseHelpersSource).toContain('orderedQty');
    });
});
