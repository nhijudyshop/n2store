/**
 * Property 9: Re-add preserves existing qty (Idempotence)
 *
 * For any product already existing in a session with soldQty > 0 or
 * orderedQty > 0, when re-added with updated TPOS info, the soldQty and
 * orderedQty must be preserved unchanged. Only product info (name, image,
 * price) gets updated.
 *
 * The pure logic under test (from firebase-helpers.js — existing product path):
 *   const soldQty = existingProduct.soldQty || 0;
 *   const orderedQty = existingProduct.orderedQty || 0;
 *   const updatedProduct = {
 *       ...product,
 *       soldQty: soldQty,
 *       orderedQty: orderedQty,
 *       addedAt: existingProduct.addedAt || product.addedAt,
 *       lastRefreshed: Date.now()
 *   };
 *
 * **Validates: Requirements B1.6**
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
 * Pure function: replicates the existing-product re-add logic from
 * addProductToFirebase (the `if (existingProduct)` branch).
 */
function reAddExistingProduct(existingProduct, newTposInfo) {
    return {
        ...newTposInfo,
        soldQty: existingProduct.soldQty || 0,
        orderedQty: existingProduct.orderedQty || 0,
        addedAt: existingProduct.addedAt || newTposInfo.addedAt,
        lastRefreshed: Date.now()
    };
}

/**
 * Generator: random existing product with soldQty > 0 and orderedQty > 0.
 * This simulates a product already in the session with accumulated quantities.
 */
const existingProductArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    QtyAvailable: fc.integer({ min: 0, max: 10000 }),
    ProductTmplId: fc.integer({ min: 1, max: 999999 }),
    imageUrl: fc.oneof(
        fc.constant(null),
        fc.constant(''),
        fc.webUrl()
    ),
    ListPrice: fc.integer({ min: 0, max: 50000000 }),
    soldQty: fc.integer({ min: 1, max: 9999 }),
    orderedQty: fc.integer({ min: 1, max: 9999 }),
    addedAt: fc.integer({ min: 1600000000000, max: 1800000000000 }),
    isHidden: fc.boolean()
});

/**
 * Generator: random updated TPOS info (new name, image, price, etc.)
 * that would come from a fresh TPOS API call when re-adding.
 */
const newTposInfoArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    QtyAvailable: fc.integer({ min: 0, max: 10000 }),
    ProductTmplId: fc.integer({ min: 1, max: 999999 }),
    imageUrl: fc.oneof(
        fc.constant(null),
        fc.constant(''),
        fc.webUrl()
    ),
    ListPrice: fc.integer({ min: 0, max: 50000000 }),
    addedAt: fc.integer({ min: 1600000000000, max: 1800000000000 })
});

describe('Feature: live-order-book, Property 9: Re-add preserves existing qty (Idempotence)', () => {

    /**
     * PBT 9a: soldQty is preserved from existing product, not overwritten by new TPOS info.
     */
    it('should preserve soldQty from existing product on re-add', () => {
        fc.assert(
            fc.property(
                existingProductArb,
                newTposInfoArb,
                (existing, newInfo) => {
                    const result = reAddExistingProduct(existing, newInfo);
                    expect(result.soldQty).toBe(existing.soldQty);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 9b: orderedQty is preserved from existing product, not overwritten by new TPOS info.
     */
    it('should preserve orderedQty from existing product on re-add', () => {
        fc.assert(
            fc.property(
                existingProductArb,
                newTposInfoArb,
                (existing, newInfo) => {
                    const result = reAddExistingProduct(existing, newInfo);
                    expect(result.orderedQty).toBe(existing.orderedQty);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 9c: Product info (NameGet, imageUrl, ListPrice) is updated from new TPOS data.
     */
    it('should update product info (name, image, price) from new TPOS data', () => {
        fc.assert(
            fc.property(
                existingProductArb,
                newTposInfoArb,
                (existing, newInfo) => {
                    const result = reAddExistingProduct(existing, newInfo);
                    expect(result.NameGet).toBe(newInfo.NameGet);
                    expect(result.imageUrl).toBe(newInfo.imageUrl);
                    expect(result.ListPrice).toBe(newInfo.ListPrice);
                    expect(result.Id).toBe(newInfo.Id);
                    expect(result.QtyAvailable).toBe(newInfo.QtyAvailable);
                    expect(result.ProductTmplId).toBe(newInfo.ProductTmplId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 9d: addedAt is preserved from existing product (not overwritten by new TPOS addedAt).
     */
    it('should preserve addedAt from existing product on re-add', () => {
        fc.assert(
            fc.property(
                existingProductArb,
                newTposInfoArb,
                (existing, newInfo) => {
                    const result = reAddExistingProduct(existing, newInfo);
                    expect(result.addedAt).toBe(existing.addedAt);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 9e: lastRefreshed is set to a current timestamp on re-add.
     */
    it('should set lastRefreshed to current timestamp on re-add', () => {
        fc.assert(
            fc.property(
                existingProductArb,
                newTposInfoArb,
                (existing, newInfo) => {
                    const before = Date.now();
                    const result = reAddExistingProduct(existing, newInfo);
                    const after = Date.now();
                    expect(result.lastRefreshed).toBeGreaterThanOrEqual(before);
                    expect(result.lastRefreshed).toBeLessThanOrEqual(after);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the re-add preservation logic.
     */
    it('source code should contain re-add qty preservation logic', () => {
        expect(firebaseHelpersSource).toContain('existingProduct.soldQty || 0');
        expect(firebaseHelpersSource).toContain('existingProduct.orderedQty || 0');
        expect(firebaseHelpersSource).toContain('existingProduct.addedAt || product.addedAt');
    });
});
