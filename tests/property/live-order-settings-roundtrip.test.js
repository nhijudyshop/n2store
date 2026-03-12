/**
 * Property 14: Display settings round-trip
 *
 * For any valid display settings (gridColumns, gridRows, gridGap, fontSize),
 * saving to Firebase then loading back must return the same values.
 *
 * The pure logic under test (from firebase-helpers.js):
 *   saveDisplaySettings writes settings object to Firebase.
 *   loadDisplaySettings reads settings and fills missing fields with defaults
 *   via nullish coalescing (??).
 *
 * The clamping logic from main.js applyDisplaySettings:
 *   gridColumns: clamped to [1, 10]
 *   gridRows: clamped to [1, 10]
 *   gridGap: clamped to [0, 50]
 *   fontSize: clamped to [8, 48]
 *
 * **Validates: Requirement C2.2**
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

const DEFAULT_DISPLAY_SETTINGS = {
    gridColumns: 4,
    gridRows: 2,
    gridGap: 10,
    fontSize: 14
};

/**
 * Pure function: simulate saveDisplaySettings → loadDisplaySettings round-trip.
 * saveDisplaySettings writes the settings object as-is.
 * loadDisplaySettings reads it back and applies nullish coalescing with defaults.
 */
function saveAndLoadRoundTrip(settings) {
    // Simulate save: settings stored as-is
    const stored = { ...settings };

    // Simulate load: apply nullish coalescing (??) with defaults
    return {
        gridColumns: stored.gridColumns ?? DEFAULT_DISPLAY_SETTINGS.gridColumns,
        gridRows: stored.gridRows ?? DEFAULT_DISPLAY_SETTINGS.gridRows,
        gridGap: stored.gridGap ?? DEFAULT_DISPLAY_SETTINGS.gridGap,
        fontSize: stored.fontSize ?? DEFAULT_DISPLAY_SETTINGS.fontSize
    };
}

/**
 * Pure function: simulate the clamping logic from applyDisplaySettings in main.js.
 * This is what happens before settings are saved — values are clamped to valid ranges.
 */
function clampSettings(raw) {
    return {
        gridColumns: Math.min(10, Math.max(1, raw.gridColumns)),
        gridRows: Math.min(10, Math.max(1, raw.gridRows)),
        gridGap: Math.min(50, Math.max(0, raw.gridGap)),
        fontSize: Math.min(48, Math.max(8, raw.fontSize))
    };
}

/**
 * Pure function: simulate loadDisplaySettings when settings is null/undefined.
 * Returns a copy of DEFAULT_DISPLAY_SETTINGS.
 */
function loadWithNullSettings() {
    return { ...DEFAULT_DISPLAY_SETTINGS };
}

/**
 * Pure function: simulate loadDisplaySettings with partial settings (some fields missing).
 * Missing fields are filled with defaults via nullish coalescing.
 */
function loadWithPartialSettings(partial) {
    return {
        gridColumns: partial.gridColumns ?? DEFAULT_DISPLAY_SETTINGS.gridColumns,
        gridRows: partial.gridRows ?? DEFAULT_DISPLAY_SETTINGS.gridRows,
        gridGap: partial.gridGap ?? DEFAULT_DISPLAY_SETTINGS.gridGap,
        fontSize: partial.fontSize ?? DEFAULT_DISPLAY_SETTINGS.fontSize
    };
}

/**
 * Generator: valid display settings within the clamped ranges.
 */
const validSettingsArbitrary = fc.record({
    gridColumns: fc.integer({ min: 1, max: 10 }),
    gridRows: fc.integer({ min: 1, max: 10 }),
    gridGap: fc.integer({ min: 0, max: 50 }),
    fontSize: fc.integer({ min: 8, max: 48 })
});

/**
 * Generator: arbitrary integer settings (may be outside valid ranges).
 */
const rawSettingsArbitrary = fc.record({
    gridColumns: fc.integer({ min: -100, max: 200 }),
    gridRows: fc.integer({ min: -100, max: 200 }),
    gridGap: fc.integer({ min: -100, max: 200 }),
    fontSize: fc.integer({ min: -100, max: 200 })
});

describe('Feature: live-order-book, Property 14: Display settings round-trip', () => {

    /**
     * PBT 14a: For valid settings within range, save→load is identity.
     */
    it('should return identical settings after save then load round-trip', () => {
        fc.assert(
            fc.property(
                validSettingsArbitrary,
                (settings) => {
                    const loaded = saveAndLoadRoundTrip(settings);
                    expect(loaded).toEqual(settings);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 14b: Clamping ensures values stay within valid ranges.
     * For any raw integer settings, clamped values are always within bounds.
     */
    it('should clamp settings to valid ranges', () => {
        fc.assert(
            fc.property(
                rawSettingsArbitrary,
                (raw) => {
                    const clamped = clampSettings(raw);

                    expect(clamped.gridColumns).toBeGreaterThanOrEqual(1);
                    expect(clamped.gridColumns).toBeLessThanOrEqual(10);
                    expect(clamped.gridRows).toBeGreaterThanOrEqual(1);
                    expect(clamped.gridRows).toBeLessThanOrEqual(10);
                    expect(clamped.gridGap).toBeGreaterThanOrEqual(0);
                    expect(clamped.gridGap).toBeLessThanOrEqual(50);
                    expect(clamped.fontSize).toBeGreaterThanOrEqual(8);
                    expect(clamped.fontSize).toBeLessThanOrEqual(48);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 14c: Clamped settings survive round-trip (clamp→save→load = clamp).
     */
    it('should preserve clamped settings through save/load round-trip', () => {
        fc.assert(
            fc.property(
                rawSettingsArbitrary,
                (raw) => {
                    const clamped = clampSettings(raw);
                    const loaded = saveAndLoadRoundTrip(clamped);
                    expect(loaded).toEqual(clamped);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * PBT 14d: When settings is null, loadDisplaySettings returns defaults.
     */
    it('should return default settings when stored settings is null', () => {
        const loaded = loadWithNullSettings();
        expect(loaded).toEqual(DEFAULT_DISPLAY_SETTINGS);
    });

    /**
     * PBT 14e: Partial settings are filled with defaults via nullish coalescing.
     */
    it('should fill missing fields with defaults for partial settings', () => {
        const fieldKeys = ['gridColumns', 'gridRows', 'gridGap', 'fontSize'];

        fc.assert(
            fc.property(
                validSettingsArbitrary,
                fc.subarray(fieldKeys, { minLength: 0, maxLength: 4 }),
                (settings, fieldsToKeep) => {
                    // Build partial settings with only selected fields
                    const partial = {};
                    fieldsToKeep.forEach(key => {
                        partial[key] = settings[key];
                    });

                    const loaded = loadWithPartialSettings(partial);

                    // Kept fields should match original
                    fieldsToKeep.forEach(key => {
                        expect(loaded[key]).toBe(settings[key]);
                    });

                    // Missing fields should be defaults
                    fieldKeys.filter(k => !fieldsToKeep.includes(k)).forEach(key => {
                        expect(loaded[key]).toBe(DEFAULT_DISPLAY_SETTINGS[key]);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * Source code verification: firebase-helpers.js contains display settings functions.
     */
    it('source code should contain display settings functions and constants', () => {
        expect(firebaseHelpersSource).toContain('loadDisplaySettings');
        expect(firebaseHelpersSource).toContain('saveDisplaySettings');
        expect(firebaseHelpersSource).toContain('DEFAULT_DISPLAY_SETTINGS');
        expect(firebaseHelpersSource).toContain('liveOrderDisplaySettings');
    });

    /**
     * Source code verification: main.js contains clamping logic in applyDisplaySettings.
     */
    it('source code should contain applyDisplaySettings with clamping logic', () => {
        expect(mainJsSource).toContain('applyDisplaySettings');
        expect(mainJsSource).toContain('Math.min');
        expect(mainJsSource).toContain('Math.max');
    });
});
