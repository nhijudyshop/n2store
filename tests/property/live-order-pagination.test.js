/**
 * Property 13: Grid pagination calculation
 *
 * For any number of products N and grid settings (columns C, rows R),
 * totalPages must equal ceil(N / (C × R)), and each page (except the last)
 * must contain exactly C × R items.
 *
 * The pure logic under test (from order-list.js):
 *   itemsPerPage = displaySettings.gridColumns * displaySettings.gridRows;
 *
 *   function getTotalPages(visibleCount) {
 *       if (itemsPerPage <= 0) return 1;
 *       return Math.max(1, Math.ceil(visibleCount / itemsPerPage));
 *   }
 *
 *   const startIdx = (currentPage - 1) * itemsPerPage;
 *   const pageProducts = visible.slice(startIdx, startIdx + itemsPerPage);
 *
 * **Validates: Requirement C1.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

function readN2File(relativePath) {
    return readFileSync(resolve(N2STORE_ROOT, relativePath), 'utf-8');
}

const orderListSource = readN2File('live-order-book/js/order-list.js');

// ============================================================================
// Pure functions extracted from order-list.js
// ============================================================================

/**
 * Calculate items per page from grid settings.
 */
function calcItemsPerPage(columns, rows) {
    return columns * rows;
}

/**
 * Calculate total pages (mirrors getTotalPages from order-list.js).
 */
function getTotalPages(visibleCount, itemsPerPage) {
    if (itemsPerPage <= 0) return 1;
    return Math.max(1, Math.ceil(visibleCount / itemsPerPage));
}

/**
 * Get items for a specific page (mirrors slice logic from updateProductGrid).
 */
function getPageItems(allItems, page, itemsPerPage) {
    const startIdx = (page - 1) * itemsPerPage;
    return allItems.slice(startIdx, startIdx + itemsPerPage);
}

// ============================================================================
// Generators
// ============================================================================

/** Random N: number of visible products (0-200) */
const nArbitrary = fc.integer({ min: 0, max: 200 });

/** Random columns (1-10) */
const columnsArbitrary = fc.integer({ min: 1, max: 10 });

/** Random rows (1-10) */
const rowsArbitrary = fc.integer({ min: 1, max: 10 });

/** Combined generator for pagination inputs */
const paginationArbitrary = fc.tuple(nArbitrary, columnsArbitrary, rowsArbitrary);

// ============================================================================
// Tests
// ============================================================================

describe('Feature: live-order-book, Property 13: Grid pagination calculation', () => {

    /**
     * PBT 13a: totalPages = Math.max(1, ceil(N / (C × R)))
     */
    it('should calculate totalPages = max(1, ceil(N / (C * R)))', () => {
        fc.assert(
            fc.property(
                paginationArbitrary,
                ([n, columns, rows]) => {
                    const ipp = calcItemsPerPage(columns, rows);
                    const totalPages = getTotalPages(n, ipp);
                    const expected = Math.max(1, Math.ceil(n / (columns * rows)));
                    expect(totalPages).toBe(expected);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13b: Each page except the last has exactly C × R items.
     */
    it('should have exactly C*R items on every page except the last', () => {
        fc.assert(
            fc.property(
                paginationArbitrary,
                ([n, columns, rows]) => {
                    const ipp = calcItemsPerPage(columns, rows);
                    const totalPages = getTotalPages(n, ipp);
                    // Create a dummy array of N items
                    const allItems = Array.from({ length: n }, (_, i) => i);

                    for (let page = 1; page < totalPages; page++) {
                        const pageItems = getPageItems(allItems, page, ipp);
                        expect(pageItems.length).toBe(ipp);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13c: Last page has between 1 and C × R items (when N > 0).
     */
    it('should have 1 to C*R items on the last page when N > 0', () => {
        fc.assert(
            fc.property(
                fc.tuple(
                    fc.integer({ min: 1, max: 200 }),
                    columnsArbitrary,
                    rowsArbitrary
                ),
                ([n, columns, rows]) => {
                    const ipp = calcItemsPerPage(columns, rows);
                    const totalPages = getTotalPages(n, ipp);
                    const allItems = Array.from({ length: n }, (_, i) => i);
                    const lastPageItems = getPageItems(allItems, totalPages, ipp);

                    expect(lastPageItems.length).toBeGreaterThanOrEqual(1);
                    expect(lastPageItems.length).toBeLessThanOrEqual(ipp);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13d: All items across all pages = N (no loss, no duplication).
     */
    it('should cover all N items across all pages without loss or duplication', () => {
        fc.assert(
            fc.property(
                paginationArbitrary,
                ([n, columns, rows]) => {
                    const ipp = calcItemsPerPage(columns, rows);
                    const totalPages = getTotalPages(n, ipp);
                    const allItems = Array.from({ length: n }, (_, i) => i);

                    const collected = [];
                    for (let page = 1; page <= totalPages; page++) {
                        collected.push(...getPageItems(allItems, page, ipp));
                    }

                    expect(collected.length).toBe(n);
                    // Verify exact same items (order preserved)
                    expect(collected).toEqual(allItems);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13e: When N = 0, totalPages = 1.
     */
    it('should return totalPages = 1 when N = 0', () => {
        fc.assert(
            fc.property(
                fc.tuple(columnsArbitrary, rowsArbitrary),
                ([columns, rows]) => {
                    const ipp = calcItemsPerPage(columns, rows);
                    const totalPages = getTotalPages(0, ipp);
                    expect(totalPages).toBe(1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 13f: itemsPerPage = gridColumns * gridRows.
     */
    it('should calculate itemsPerPage = columns * rows', () => {
        fc.assert(
            fc.property(
                fc.tuple(columnsArbitrary, rowsArbitrary),
                ([columns, rows]) => {
                    expect(calcItemsPerPage(columns, rows)).toBe(columns * rows);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: order-list.js contains getTotalPages logic.
     */
    it('source code order-list.js should contain getTotalPages function', () => {
        expect(orderListSource).toContain('function getTotalPages(visibleCount)');
        expect(orderListSource).toContain('Math.ceil(visibleCount / itemsPerPage)');
    });

    /**
     * Source code verification: order-list.js calculates itemsPerPage from settings.
     */
    it('source code order-list.js should calculate itemsPerPage from grid settings', () => {
        expect(orderListSource).toContain('settings.gridColumns * settings.gridRows');
    });
});
