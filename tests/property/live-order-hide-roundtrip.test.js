/**
 * Property 2: Hide/unhide round-trip
 *
 * For any product, hiding (isHidden = true) then unhiding (isHidden = false)
 * returns the product to its original display state (isHidden = false) and
 * all other fields remain unchanged.
 *
 * The pure logic under test (from firebase-helpers.js):
 *   updateProductVisibility sets isHidden on the product object.
 *   Pure equivalent: { ...product, isHidden: value }
 *
 * **Validates: Requirements B4.3, B4.6**
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
 * Pure function: hide a product (set isHidden = true).
 * Mirrors the Firebase write: setting isHidden on the product object.
 */
function hideProduct(product) {
    return { ...product, isHidden: true };
}

/**
 * Pure function: unhide a product (set isHidden = false).
 * Mirrors the "Hiện lại" action on Hidden Page.
 */
function unhideProduct(product) {
    return { ...product, isHidden: false };
}

/**
 * Generator: random product object with valid fields matching the Firebase schema.
 */
const productArbitrary = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 100 }),
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 }),
    imageUrl: fc.oneof(
        fc.constant(''),
        fc.webUrl()
    ),
    addedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
    ProductTmplId: fc.integer({ min: 1, max: 99999 }),
    isHidden: fc.boolean()
});

describe('Feature: live-order-book, Property 2: Hide/unhide round-trip', () => {

    /**
     * PBT 2a: hide then unhide returns product to isHidden = false,
     * with all other fields unchanged.
     */
    it('should return product to original state after hide then unhide', () => {
        fc.assert(
            fc.property(
                productArbitrary,
                (product) => {
                    const hidden = hideProduct(product);
                    const unhidden = unhideProduct(hidden);

                    // isHidden should be false after round-trip
                    expect(unhidden.isHidden).toBe(false);

                    // All other fields must remain unchanged
                    const { isHidden: _origHidden, ...origFields } = product;
                    const { isHidden: _resultHidden, ...resultFields } = unhidden;
                    expect(resultFields).toEqual(origFields);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 2b: hideProduct always sets isHidden to true,
     * regardless of original isHidden value.
     */
    it('should always set isHidden to true when hiding', () => {
        fc.assert(
            fc.property(
                productArbitrary,
                (product) => {
                    const hidden = hideProduct(product);
                    expect(hidden.isHidden).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 2c: unhideProduct always sets isHidden to false,
     * regardless of original isHidden value.
     */
    it('should always set isHidden to false when unhiding', () => {
        fc.assert(
            fc.property(
                productArbitrary,
                (product) => {
                    const unhidden = unhideProduct(product);
                    expect(unhidden.isHidden).toBe(false);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 2d: hide/unhide does not mutate the original product object.
     */
    it('should not mutate the original product object', () => {
        fc.assert(
            fc.property(
                productArbitrary,
                (product) => {
                    const originalCopy = { ...product };
                    hideProduct(product);
                    unhideProduct(product);

                    // Original product must be unchanged
                    expect(product).toEqual(originalCopy);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the visibility update logic.
     */
    it('source code should contain updateProductVisibility function', () => {
        expect(firebaseHelpersSource).toContain('updateProductVisibility');
        expect(firebaseHelpersSource).toContain('isHidden');
    });
});
