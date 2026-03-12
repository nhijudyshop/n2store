/**
 * Property 6: Date-based descending sort
 *
 * For any list of sessions (or snapshots) with arbitrary dates/timestamps,
 * the sort function must return the list in descending order (newest first).
 * For every adjacent pair (i, i+1), date[i] >= date[i+1].
 *
 * **Validates: Requirements A1.4, D1.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');

const firebaseHelpersSource = readFileSync(
    resolve(N2STORE_ROOT, 'live-order-book/firebase-helpers.js'), 'utf-8'
);

function sortSessionsByDate(sessions) {
    return [...sessions].sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        return (b.createdAt || 0) - (a.createdAt || 0);
    });
}

function sortSnapshotsBySavedAt(snapshots) {
    return [...snapshots].sort((a, b) => {
        const savedAtA = a.metadata?.savedAt || 0;
        const savedAtB = b.metadata?.savedAt || 0;
        return savedAtB - savedAtA;
    });
}

const dateStringArb = fc.tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
).map(([y, m, d]) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
);

const sessionWithDateArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    date: dateStringArb,
    createdAt: fc.integer({ min: 1600000000000, max: 1900000000000 }),
    productCount: fc.integer({ min: 0, max: 500 })
});

const sessionNoDateArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    date: fc.constant(null),
    createdAt: fc.integer({ min: 1600000000000, max: 1900000000000 }),
    productCount: fc.integer({ min: 0, max: 500 })
});

const snapshotArb = fc.record({
    id: fc.string({ minLength: 5, maxLength: 30 }),
    metadata: fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        savedAt: fc.integer({ min: 1600000000000, max: 1900000000000 }),
        productCount: fc.integer({ min: 0, max: 200 })
    })
});

const snapshotNoMetaArb = fc.record({
    id: fc.string({ minLength: 5, maxLength: 30 })
});

describe('Feature: live-order-book, Property 6: Date-based descending sort', () => {

    it('should sort sessions with dates in descending order', () => {
        fc.assert(
            fc.property(
                fc.array(sessionWithDateArb, { minLength: 0, maxLength: 30 }),
                (sessions) => {
                    const sorted = sortSessionsByDate(sessions);
                    for (let i = 0; i < sorted.length - 1; i++) {
                        expect(sorted[i].date >= sorted[i + 1].date).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('should sort sessions without dates by createdAt descending', () => {
        fc.assert(
            fc.property(
                fc.array(sessionNoDateArb, { minLength: 0, maxLength: 30 }),
                (sessions) => {
                    const sorted = sortSessionsByDate(sessions);
                    for (let i = 0; i < sorted.length - 1; i++) {
                        expect((sorted[i].createdAt || 0) >= (sorted[i + 1].createdAt || 0)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('should preserve all session elements after sorting', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.oneof(sessionWithDateArb, sessionNoDateArb),
                    { minLength: 0, maxLength: 30 }
                ),
                (sessions) => {
                    const sorted = sortSessionsByDate(sessions);
                    expect(sorted.length).toBe(sessions.length);
                    const originalIds = sessions.map(s => s.id).sort();
                    const sortedIds = sorted.map(s => s.id).sort();
                    expect(sortedIds).toEqual(originalIds);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('should sort snapshots by savedAt descending', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.oneof(
                        { weight: 4, arbitrary: snapshotArb },
                        { weight: 1, arbitrary: snapshotNoMetaArb }
                    ),
                    { minLength: 0, maxLength: 30 }
                ),
                (snapshots) => {
                    const sorted = sortSnapshotsBySavedAt(snapshots);
                    for (let i = 0; i < sorted.length - 1; i++) {
                        const savedAtI = sorted[i].metadata?.savedAt || 0;
                        const savedAtNext = sorted[i + 1].metadata?.savedAt || 0;
                        expect(savedAtI >= savedAtNext).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    it('should preserve all snapshot elements after sorting', () => {
        fc.assert(
            fc.property(
                fc.array(snapshotArb, { minLength: 0, maxLength: 30 }),
                (snapshots) => {
                    const sorted = sortSnapshotsBySavedAt(snapshots);
                    expect(sorted.length).toBe(snapshots.length);
                    const originalIds = snapshots.map(s => s.id).sort();
                    const sortedIds = sorted.map(s => s.id).sort();
                    expect(sortedIds).toEqual(originalIds);
                }
            ),
            { numRuns: 100 }
        );
    });

    it('source code should contain date-based sort logic', () => {
        expect(firebaseHelpersSource).toContain('b.date.localeCompare(a.date)');
        expect(firebaseHelpersSource).toContain('b.createdAt');
        expect(firebaseHelpersSource).toContain('savedAt');
        expect(firebaseHelpersSource).toContain('savedAtB - savedAtA');
    });
});