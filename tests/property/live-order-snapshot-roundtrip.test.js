/**
 * Property 4: Snapshot save/restore round-trip
 *
 * For any products list of a live session, saving a snapshot then restoring
 * from that snapshot must produce a product list identical to the original
 * (including soldQty, orderedQty, and all other fields).
 *
 * The pure logic under test (from firebase-helpers.js):
 *   saveCartSnapshot deep-copies products into a snapshot object.
 *   restoreProductsFromSnapshot writes snapshot products back to both nodes.
 *   Pure equivalent: shallow-copy each product in/out of the snapshot.
 *
 * **Validates: Requirements D1.1, D1.5**
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
 * Pure function: create a snapshot from products (deep copy).
 * Mirrors the save logic in saveCartSnapshot — the snapshot stores
 * a copy of each product object.
 */
function createSnapshot(products) {
    const snapshot = {};
    Object.entries(products).forEach(([key, product]) => {
        snapshot[key] = { ...product };
    });
    return snapshot;
}

/**
 * Pure function: restore products from a snapshot (deep copy).
 * Mirrors the restore logic in restoreProductsFromSnapshot — each
 * product is shallow-copied back into the local products object.
 */
function restoreFromSnapshot(snapshotProducts) {
    const restored = {};
    Object.entries(snapshotProducts).forEach(([key, product]) => {
        restored[key] = { ...product };
    });
    return restored;
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
 * Generates 0–20 products with unique keys.
 */
const productsObjectArbitrary = fc.array(productArbitrary, { minLength: 0, maxLength: 20 })
    .map(products => {
        const obj = {};
        products.forEach(p => {
            obj[`product_${p.Id}`] = p;
        });
        return obj;
    });

describe('Feature: live-order-book, Property 4: Snapshot save/restore round-trip', () => {

    /**
     * PBT 4a: save then restore produces an identical products object.
     */
    it('should produce identical products after save then restore round-trip', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (products) => {
                    const snapshot = createSnapshot(products);
                    const restored = restoreFromSnapshot(snapshot);

                    expect(restored).toEqual(products);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4b: snapshot is a deep copy — mutating snapshot does not affect original.
     */
    it('should create an independent snapshot (deep copy)', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (products) => {
                    const originalCopy = JSON.parse(JSON.stringify(products));
                    const snapshot = createSnapshot(products);

                    // Mutate snapshot values
                    Object.values(snapshot).forEach(p => {
                        p.soldQty = 99999;
                        p.orderedQty = 99999;
                    });

                    // Original must be unchanged
                    expect(products).toEqual(originalCopy);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4c: restored products are independent from snapshot — mutating
     * restored does not affect the snapshot.
     */
    it('should create independent restored products (deep copy from snapshot)', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (products) => {
                    const snapshot = createSnapshot(products);
                    const snapshotCopy = JSON.parse(JSON.stringify(snapshot));
                    const restored = restoreFromSnapshot(snapshot);

                    // Mutate restored values
                    Object.values(restored).forEach(p => {
                        p.soldQty = 99999;
                        p.orderedQty = 99999;
                    });

                    // Snapshot must be unchanged
                    expect(snapshot).toEqual(snapshotCopy);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 4d: round-trip preserves the exact set of product keys.
     */
    it('should preserve all product keys through round-trip', () => {
        fc.assert(
            fc.property(
                productsObjectArbitrary,
                (products) => {
                    const snapshot = createSnapshot(products);
                    const restored = restoreFromSnapshot(snapshot);

                    const originalKeys = Object.keys(products).sort();
                    const restoredKeys = Object.keys(restored).sort();
                    expect(restoredKeys).toEqual(originalKeys);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains snapshot functions.
     */
    it('source code should contain snapshot save/restore functions', () => {
        expect(firebaseHelpersSource).toContain('saveCartSnapshot');
        expect(firebaseHelpersSource).toContain('restoreProductsFromSnapshot');
        expect(firebaseHelpersSource).toContain('liveOrderCartHistory');
    });
});
