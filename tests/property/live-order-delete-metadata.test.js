/**
 * Property 16: Product deletion updates metadata
 *
 * For any live session with N products, when deleting 1 product,
 * metadata.count must decrease by 1 (become N-1), and the deleted
 * product must no longer appear in sortedIds.
 *
 * The pure logic under test (from firebase-helpers.js removeProductFromFirebase):
 *   delete localProductsObject[productKey];
 *   sortedIds = (currentIds || []).filter(id => id !== productId);
 *   newCount = Object.keys(localProductsObject).length;
 *
 * **Validates: Requirements B4.2**
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
 * Pure function: simulate the local deletion logic from removeProductFromFirebase.
 * 1. Delete the product key from localProductsObject
 * 2. Filter the productId out of sortedIds
 * 3. Compute newCount from remaining keys
 *
 * Returns { localProductsObject, sortedIds, newCount }.
 */
function simulateProductDeletion(localProductsObject, sortedIds, productKey) {
    const productId = productKey.replace('product_', '');

    // Deep copy to avoid mutating input
    const products = JSON.parse(JSON.stringify(localProductsObject));

    // Remove from local object (mirrors: delete localProductsObject[productKey])
    delete products[productKey];

    // Filter sortedIds (mirrors: (currentIds || []).filter(id => id !== productId))
    const newSortedIds = (sortedIds || []).filter(id => id !== productId);

    // Compute new count (mirrors: Object.keys(localProductsObject).length)
    const newCount = Object.keys(products).length;

    return { products, sortedIds: newSortedIds, newCount };
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
 * Generator: random products list (1–30 items) with consistent sortedIds.
 * Returns { productsObject, sortedIds, productKeys }.
 */
const productsWithMetadataArbitrary = fc.array(productArbitrary, { minLength: 1, maxLength: 30 })
    .chain(products => {
        // Deduplicate by Id
        const uniqueById = new Map();
        products.forEach(p => uniqueById.set(p.Id, p));
        const uniqueProducts = Array.from(uniqueById.values());

        const productsObject = {};
        const sortedIds = [];
        const productKeys = [];

        uniqueProducts.forEach(p => {
            const key = `product_${p.Id}`;
            productsObject[key] = p;
            sortedIds.push(String(p.Id));
            productKeys.push(key);
        });

        // Pick a random index to delete
        return fc.integer({ min: 0, max: productKeys.length - 1 }).map(idx => ({
            productsObject,
            sortedIds,
            productKeys,
            deleteIndex: idx
        }));
    });

describe('Feature: live-order-book, Property 16: Product deletion updates metadata', () => {

    /**
     * PBT 16a: After deleting a product, metadata.count equals N-1.
     */
    it('should decrease metadata count by 1 after product deletion', () => {
        fc.assert(
            fc.property(
                productsWithMetadataArbitrary,
                ({ productsObject, sortedIds, productKeys, deleteIndex }) => {
                    const originalCount = Object.keys(productsObject).length;
                    const keyToDelete = productKeys[deleteIndex];

                    const result = simulateProductDeletion(productsObject, sortedIds, keyToDelete);

                    expect(result.newCount).toBe(originalCount - 1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16b: After deleting a product, its ID is no longer in sortedIds.
     */
    it('should remove deleted product ID from sortedIds', () => {
        fc.assert(
            fc.property(
                productsWithMetadataArbitrary,
                ({ productsObject, sortedIds, productKeys, deleteIndex }) => {
                    const keyToDelete = productKeys[deleteIndex];
                    const deletedId = keyToDelete.replace('product_', '');

                    const result = simulateProductDeletion(productsObject, sortedIds, keyToDelete);

                    expect(result.sortedIds).not.toContain(deletedId);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16c: After deleting a product, the deleted key no longer exists
     * in the local products object.
     */
    it('should remove deleted product key from localProductsObject', () => {
        fc.assert(
            fc.property(
                productsWithMetadataArbitrary,
                ({ productsObject, sortedIds, productKeys, deleteIndex }) => {
                    const keyToDelete = productKeys[deleteIndex];

                    const result = simulateProductDeletion(productsObject, sortedIds, keyToDelete);

                    expect(result.products).not.toHaveProperty(keyToDelete);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16d: After deleting a product, newCount equals the actual number
     * of remaining products (consistency between count and object keys).
     */
    it('should have newCount consistent with remaining products object keys', () => {
        fc.assert(
            fc.property(
                productsWithMetadataArbitrary,
                ({ productsObject, sortedIds, productKeys, deleteIndex }) => {
                    const keyToDelete = productKeys[deleteIndex];

                    const result = simulateProductDeletion(productsObject, sortedIds, keyToDelete);

                    expect(result.newCount).toBe(Object.keys(result.products).length);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 16e: After deleting a product, sortedIds length equals N-1.
     */
    it('should decrease sortedIds length by 1 after product deletion', () => {
        fc.assert(
            fc.property(
                productsWithMetadataArbitrary,
                ({ productsObject, sortedIds, productKeys, deleteIndex }) => {
                    const originalSortedIdsLength = sortedIds.length;
                    const keyToDelete = productKeys[deleteIndex];

                    const result = simulateProductDeletion(productsObject, sortedIds, keyToDelete);

                    expect(result.sortedIds.length).toBe(originalSortedIdsLength - 1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the deletion logic.
     */
    it('source code should contain delete from localProductsObject', () => {
        expect(firebaseHelpersSource).toContain('delete localProductsObject[productKey]');
    });

    it('source code should contain sortedIds filter logic', () => {
        expect(firebaseHelpersSource).toContain('.filter(id => id !== productId)');
    });

    it('source code should contain newCount from Object.keys', () => {
        expect(firebaseHelpersSource).toContain('Object.keys(localProductsObject).length');
    });
});
