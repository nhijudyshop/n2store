/**
 * Property 8: Product addition with default values
 *
 * For any valid TPOS product, when added to a session, the product must be
 * stored with soldQty = 0 and orderedQty = 0 (defaults), and the fields
 * Id, NameGet, QtyAvailable, ProductTmplId, imageUrl must match the
 * original TPOS source data.
 *
 * The pure logic under test (from firebase-helpers.js — new product path):
 *   const soldQty = product.soldQty || 0;
 *   const orderedQty = product.orderedQty || 0;
 *   const newProduct = {
 *       ...product,
 *       soldQty: soldQty,
 *       orderedQty: orderedQty,
 *       addedAt: product.addedAt || Date.now()
 *   };
 *
 * **Validates: Requirements B1.5**
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
 * Pure function: replicates the new-product creation logic from
 * addProductToFirebase (the `else` branch for non-existing products).
 */
function createNewProduct(tposProduct) {
    const soldQty = tposProduct.soldQty || 0;
    const orderedQty = tposProduct.orderedQty || 0;
    return {
        ...tposProduct,
        soldQty: soldQty,
        orderedQty: orderedQty,
        addedAt: tposProduct.addedAt || Date.now()
    };
}

/**
 * Generator: random TPOS product data without pre-existing soldQty/orderedQty.
 * This simulates a fresh product coming from the TPOS API.
 */
const tposProductArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    QtyAvailable: fc.integer({ min: 0, max: 10000 }),
    ProductTmplId: fc.integer({ min: 1, max: 999999 }),
    imageUrl: fc.oneof(
        fc.constant(null),
        fc.constant(''),
        fc.webUrl()
    ),
    ListPrice: fc.integer({ min: 0, max: 50000000 })
});

describe('Feature: live-order-book, Property 8: Product addition with default values', () => {

    /**
     * PBT 8a: New product (no soldQty/orderedQty) gets defaults of 0.
     */
    it('should set soldQty=0 and orderedQty=0 for fresh TPOS products', () => {
        fc.assert(
            fc.property(
                tposProductArb,
                (tposProduct) => {
                    const result = createNewProduct(tposProduct);
                    expect(result.soldQty).toBe(0);
                    expect(result.orderedQty).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 8b: All TPOS source fields are preserved in the new product.
     */
    it('should preserve Id, NameGet, QtyAvailable, ProductTmplId, imageUrl from TPOS source', () => {
        fc.assert(
            fc.property(
                tposProductArb,
                (tposProduct) => {
                    const result = createNewProduct(tposProduct);
                    expect(result.Id).toBe(tposProduct.Id);
                    expect(result.NameGet).toBe(tposProduct.NameGet);
                    expect(result.QtyAvailable).toBe(tposProduct.QtyAvailable);
                    expect(result.ProductTmplId).toBe(tposProduct.ProductTmplId);
                    expect(result.imageUrl).toBe(tposProduct.imageUrl);
                    expect(result.ListPrice).toBe(tposProduct.ListPrice);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 8c: addedAt gets a timestamp when not provided.
     */
    it('should assign addedAt timestamp when not present in TPOS product', () => {
        fc.assert(
            fc.property(
                tposProductArb,
                (tposProduct) => {
                    const before = Date.now();
                    const result = createNewProduct(tposProduct);
                    const after = Date.now();
                    expect(result.addedAt).toBeGreaterThanOrEqual(before);
                    expect(result.addedAt).toBeLessThanOrEqual(after);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 8d: If TPOS product already has soldQty/orderedQty as 0 (falsy),
     * the || 0 pattern still produces 0.
     */
    it('should handle falsy soldQty/orderedQty values correctly (0, undefined, null)', () => {
        const falsyQtyProductArb = fc.record({
            Id: fc.integer({ min: 1, max: 999999 }),
            NameGet: fc.string({ minLength: 1, maxLength: 50 }),
            QtyAvailable: fc.integer({ min: 0, max: 10000 }),
            ProductTmplId: fc.integer({ min: 1, max: 999999 }),
            imageUrl: fc.constant('https://example.com/img.jpg'),
            soldQty: fc.oneof(fc.constant(0), fc.constant(undefined), fc.constant(null)),
            orderedQty: fc.oneof(fc.constant(0), fc.constant(undefined), fc.constant(null))
        });

        fc.assert(
            fc.property(
                falsyQtyProductArb,
                (product) => {
                    const result = createNewProduct(product);
                    expect(result.soldQty).toBe(0);
                    expect(result.orderedQty).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the default value logic.
     */
    it('source code should contain default value logic for new products', () => {
        expect(firebaseHelpersSource).toContain('product.soldQty || 0');
        expect(firebaseHelpersSource).toContain('product.orderedQty || 0');
        expect(firebaseHelpersSource).toContain('product.addedAt || Date.now()');
    });
});
