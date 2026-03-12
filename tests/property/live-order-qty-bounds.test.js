/**
 * Property 1: Qty increment/decrement with boundary
 *
 * For any product with soldQty >= 0, incrementing yields soldQty + 1,
 * decrementing yields max(0, soldQty - 1), and soldQty is never negative.
 *
 * The pure logic under test (from firebase-helpers.js):
 *   safeSoldQty = Math.max(0, Math.floor(newSoldQty))
 *
 * The increment/decrement pattern (from main.js):
 *   newQty = Math.max(0, (product.soldQty || 0) + delta)
 *
 * **Validates: Requirements B3.1, B3.2**
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
const mainJsSource = readN2File('live-order-book/js/main.js');

/**
 * Pure function: firebase-helpers.js safeguard for qty values.
 * Ensures qty is a non-negative integer.
 */
function safeSoldQty(newSoldQty) {
    return Math.max(0, Math.floor(newSoldQty));
}

/**
 * Pure function: main.js increment/decrement pattern.
 * Computes the new qty after applying a delta (+1 or -1).
 */
function applyDelta(currentSoldQty, delta) {
    return Math.max(0, (currentSoldQty || 0) + delta);
}

describe('Feature: live-order-book, Property 1: Qty increment/decrement with boundary', () => {

    /**
     * PBT 1a: Increment always yields soldQty + 1.
     */
    it('should increment soldQty by 1', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 100000 }),
                (soldQty) => {
                    const result = applyDelta(soldQty, 1);
                    expect(result).toBe(soldQty + 1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 1b: Decrement yields max(0, soldQty - 1).
     */
    it('should decrement soldQty by 1, floored at 0', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 100000 }),
                (soldQty) => {
                    const result = applyDelta(soldQty, -1);
                    expect(result).toBe(Math.max(0, soldQty - 1));
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 1c: soldQty never goes negative after any sequence of +1/-1 deltas.
     */
    it('should never produce a negative soldQty after any delta sequence', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 100000 }),
                fc.array(fc.constantFrom(1, -1), { minLength: 1, maxLength: 50 }),
                (initialQty, deltas) => {
                    let qty = initialQty;
                    for (const delta of deltas) {
                        qty = applyDelta(qty, delta);
                        expect(qty).toBeGreaterThanOrEqual(0);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 1d: safeSoldQty always returns a non-negative integer,
     * even for fractional or negative inputs.
     */
    it('should enforce non-negative integer via safeSoldQty', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1000, max: 100000, noNaN: true, noDefaultInfinity: true }),
                (rawQty) => {
                    const result = safeSoldQty(rawQty);
                    expect(result).toBeGreaterThanOrEqual(0);
                    expect(Number.isInteger(result)).toBe(true);
                    expect(result).toBe(Math.max(0, Math.floor(rawQty)));
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains the safeguard logic.
     */
    it('source code should contain qty safeguard logic', () => {
        expect(firebaseHelpersSource).toContain('Math.max(0, Math.floor(newSoldQty))');
        expect(firebaseHelpersSource).toContain('Math.max(0, Math.floor(newOrderedQty))');
    });

    /**
     * Source code verification: main.js contains the increment/decrement pattern.
     */
    it('source code should contain increment/decrement pattern', () => {
        expect(mainJsSource).toContain('Math.max(0, (product.soldQty || 0) + delta)');
    });
});
