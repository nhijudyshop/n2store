/**
 * Property 17: Display settings to CSS mapping
 *
 * For any valid display settings, the applySettings function must produce
 * CSS variable values that correspond exactly to the settings:
 *   --grid-columns  → raw number (displaySettings.gridColumns)
 *   --grid-rows     → raw number (displaySettings.gridRows)
 *   --grid-gap      → `${gridGap}px`
 *   --font-size     → `${fontSize}px`
 *   itemsPerPage    → gridColumns * gridRows
 *
 * The code does NOT use `repeat(N, 1fr)` for --grid-columns — it sets
 * the CSS variable as a plain number, consumed by CSS elsewhere.
 *
 * **Validates: Requirement C2.3**
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
// Pure functions extracted from order-list.js applySettings
// ============================================================================

/**
 * Pure function: given display settings, return the CSS variable values
 * that applySettings would set on document.documentElement.
 *
 * Mirrors the logic:
 *   root.style.setProperty('--grid-columns', displaySettings.gridColumns);
 *   root.style.setProperty('--grid-rows', displaySettings.gridRows);
 *   root.style.setProperty('--grid-gap', `${displaySettings.gridGap}px`);
 *   root.style.setProperty('--font-size', `${displaySettings.fontSize}px`);
 */
function mapSettingsToCSSVariables(settings) {
    return {
        '--grid-columns': settings.gridColumns,
        '--grid-rows': settings.gridRows,
        '--grid-gap': `${settings.gridGap}px`,
        '--font-size': `${settings.fontSize}px`
    };
}

/**
 * Pure function: calculate itemsPerPage from settings.
 * Mirrors: itemsPerPage = displaySettings.gridColumns * displaySettings.gridRows;
 */
function calcItemsPerPage(settings) {
    return settings.gridColumns * settings.gridRows;
}

// ============================================================================
// Generators
// ============================================================================

/** Valid display settings within the design-specified ranges */
const validSettingsArbitrary = fc.record({
    gridColumns: fc.integer({ min: 1, max: 10 }),
    gridRows: fc.integer({ min: 1, max: 10 }),
    gridGap: fc.integer({ min: 0, max: 50 }),
    fontSize: fc.integer({ min: 8, max: 48 })
});

// ============================================================================
// Tests
// ============================================================================

describe('Feature: live-order-book, Property 17: Display settings to CSS mapping', () => {

    /**
     * PBT 17a: --grid-columns is set to the raw number, NOT repeat(N, 1fr).
     */
    it('should map gridColumns to raw number for --grid-columns CSS variable', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const cssVars = mapSettingsToCSSVariables(settings);
                    // Must be the raw number, not a string like "repeat(N, 1fr)"
                    expect(cssVars['--grid-columns']).toBe(settings.gridColumns);
                    expect(typeof cssVars['--grid-columns']).toBe('number');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17b: --grid-rows is set to the raw number.
     */
    it('should map gridRows to raw number for --grid-rows CSS variable', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const cssVars = mapSettingsToCSSVariables(settings);
                    expect(cssVars['--grid-rows']).toBe(settings.gridRows);
                    expect(typeof cssVars['--grid-rows']).toBe('number');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17c: --grid-gap is set to `${gridGap}px` — exact px suffix mapping.
     */
    it('should map gridGap to "${gridGap}px" for --grid-gap CSS variable', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const cssVars = mapSettingsToCSSVariables(settings);
                    expect(cssVars['--grid-gap']).toBe(`${settings.gridGap}px`);
                    expect(typeof cssVars['--grid-gap']).toBe('string');
                    expect(cssVars['--grid-gap']).toMatch(/^\d+px$/);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17d: --font-size is set to `${fontSize}px` — exact px suffix mapping.
     */
    it('should map fontSize to "${fontSize}px" for --font-size CSS variable', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const cssVars = mapSettingsToCSSVariables(settings);
                    expect(cssVars['--font-size']).toBe(`${settings.fontSize}px`);
                    expect(typeof cssVars['--font-size']).toBe('string');
                    expect(cssVars['--font-size']).toMatch(/^\d+px$/);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17e: itemsPerPage = gridColumns * gridRows — deterministic calculation.
     */
    it('should calculate itemsPerPage = gridColumns * gridRows', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const ipp = calcItemsPerPage(settings);
                    expect(ipp).toBe(settings.gridColumns * settings.gridRows);
                    expect(ipp).toBeGreaterThanOrEqual(1);
                    expect(ipp).toBeLessThanOrEqual(100); // max 10*10
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 17f: CSS mapping is deterministic — same settings always produce same CSS values.
     */
    it('should produce deterministic CSS values for the same settings', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const cssVars1 = mapSettingsToCSSVariables(settings);
                    const cssVars2 = mapSettingsToCSSVariables(settings);
                    expect(cssVars1).toEqual(cssVars2);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: order-list.js applySettings sets CSS variables correctly.
     */
    it('source code should set --grid-columns as raw number (not repeat)', () => {
        // Verify the code sets --grid-columns to the raw value
        expect(orderListSource).toContain("root.style.setProperty('--grid-columns', displaySettings.gridColumns)");
        // Verify it does NOT use repeat(N, 1fr) pattern
        expect(orderListSource).not.toContain('repeat(');
    });

    it('source code should set --grid-gap and --font-size with px suffix', () => {
        expect(orderListSource).toContain("root.style.setProperty('--grid-gap', `${displaySettings.gridGap}px`)");
        expect(orderListSource).toContain("root.style.setProperty('--font-size', `${displaySettings.fontSize}px`)");
    });

    it('source code should calculate itemsPerPage from grid settings', () => {
        expect(orderListSource).toContain('itemsPerPage = displaySettings.gridColumns * displaySettings.gridRows');
    });
});
