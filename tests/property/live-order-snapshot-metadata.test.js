/**
 * Property 15: Snapshot metadata consistency
 *
 * For any snapshot being saved, the productCount in metadata must equal
 * the actual number of products in the snapshot (Object.keys(snapshot.products).length).
 *
 * The pure logic under test (from main.js saveCartAndRefresh):
 *   const productCount = Object.keys(localProducts).length;
 *   snapshot.metadata.productCount = productCount;
 *   snapshot.products = JSON.parse(JSON.stringify(localProducts));
 *
 * **Validates: Requirements D1.2**
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
 * Pure function: build a snapshot from a products object.
 * Mirrors the saveCartAndRefresh logic in main.js — productCount is
 * computed from Object.keys(localProducts).length, and products are
 * deep-copied via JSON.parse(JSON.stringify(...)).
 */
function buildSnapshot(localProducts, name) {
    const productCount = Object.keys(localProducts).length;
    return {
        metadata: {
            name: name,
            savedAt: Date.now(),
            productCount: productCount
        },
        products: JSON.parse(JSON.stringify(localProducts))
    };
}

/**
 * Generator: random product object matching the Firebase schema.
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
 * Generator: random products object (keyed by product_{Id}).
 * Generates 0–30 products with unique keys.
 */
const productsObjectArbitrary = fc.array(productArbitrary, { minLength: 0, maxLength: 30 })
    .map(products => {
        const obj = {};
        products.forEach(p => {
            obj[`product_${p.Id}`] = p;
        });
        return obj;
    });

describe('Feature: live-order-book, Property 15: Snapshot metadata consistency', () => {

    /**
     * PBT 15a: metadata.productCount equals Object.keys(snapshot.products).length.
     */
    it('should have metadata.productCount equal to actual product count in snapshot', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (localProducts) => {
                    const snapshot = buildSnapshot(localProducts, 'Test Snapshot');

                    expect(snapshot.metadata.productCount).toBe(
                        Object.keys(snapshot.products).length
                    );
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 15b: metadata.productCount equals the original products count
     * (consistency between source and snapshot).
     */
    it('should have metadata.productCount equal to source products count', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (localProducts) => {
                    const originalCount = Object.keys(localProducts).length;
                    const snapshot = buildSnapshot(localProducts, 'Test Snapshot');

                    expect(snapshot.metadata.productCount).toBe(originalCount);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 15c: deep copy in snapshot does not alter product count —
     * mutating the snapshot products does not change metadata.productCount.
     */
    it('should maintain consistent productCount even after mutating snapshot products', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (localProducts) => {
                    const snapshot = buildSnapshot(localProducts, 'Test Snapshot');
                    const countAtSave = snapshot.metadata.productCount;

                    // The count recorded at save time must match the actual products
                    expect(countAtSave).toBe(Object.keys(snapshot.products).length);

                    // Even if we add/remove from snapshot.products after save,
                    // the metadata.productCount still reflects the original count
                    snapshot.products['product_extra'] = { Id: 0, NameGet: 'extra' };
                    expect(snapshot.metadata.productCount).toBe(countAtSave);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: main.js contains the snapshot creation pattern.
     */
    it('source code should contain productCount assignment pattern', () => {
        expect(mainJsSource).toContain('productCount: productCount');
    });

    it('source code should contain deep copy via JSON.parse(JSON.stringify)', () => {
        expect(mainJsSource).toContain('products: JSON.parse(JSON.stringify(localProducts))');
    });
});
