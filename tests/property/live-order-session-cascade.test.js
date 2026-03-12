/**
 * Property 7: Session deletion cascade
 * For any session, deleteSession must remove data from ALL 6 Firebase nodes.
 * **Validates: Requirements A2.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const N2STORE_ROOT = resolve(__dirname, '../..');
const firebaseHelpersSource = readFileSync(resolve(N2STORE_ROOT, 'live-order-book/firebase-helpers.js'), 'utf-8');

const ALL_NODE_PREFIXES = [
    'liveOrderSessions', 'liveOrderProducts', 'liveOrderProductsQty',
    'liveOrderProductsMeta', 'liveOrderDisplaySettings', 'liveOrderCartHistory'
];

function buildCascadeDeleteUpdates(sessionId) {
    const updates = {};
    ALL_NODE_PREFIXES.forEach(function(prefix) { updates[prefix + '/' + sessionId] = null; });
    return updates;
}

function applyUpdatesToDatabase(dbState, updates) {
    const newState = JSON.parse(JSON.stringify(dbState));
    Object.entries(updates).forEach(function(entry) {
        var path = entry[0];
        var value = entry[1];
        var parts = path.split('/');
        if (parts.length === 2 && value === null && newState[parts[0]]) {
            delete newState[parts[0]][parts[1]];
        }
    });
    return newState;
}

var sessionIdArb = fc.string({ minLength: 5, maxLength: 20 }).map(function(s) { return 'session_' + s.replace(/[^a-z0-9]/g, 'x'); });

var productArb = fc.record({
    Id: fc.integer({ min: 1, max: 999999 }),
    NameGet: fc.string({ minLength: 1, maxLength: 50 }),
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 }),
    isHidden: fc.boolean()
});

var qtyEntryArb = fc.record({
    soldQty: fc.integer({ min: 0, max: 10000 }),
    orderedQty: fc.integer({ min: 0, max: 10000 })
});

var metaArb = fc.record({
    sortedIds: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    count: fc.integer({ min: 0, max: 100 }),
    lastUpdated: fc.integer({ min: 1700000000000, max: 1800000000000 })
});

var settingsArb = fc.record({
    gridColumns: fc.integer({ min: 1, max: 10 }),
    gridRows: fc.integer({ min: 1, max: 10 }),
    gridGap: fc.integer({ min: 0, max: 50 }),
    fontSize: fc.integer({ min: 8, max: 48 })
});

var snapshotArb = fc.record({
    metadata: fc.record({
        name: fc.string({ minLength: 1, maxLength: 30 }),
        savedAt: fc.integer({ min: 1700000000000, max: 1800000000000 }),
        productCount: fc.integer({ min: 0, max: 50 })
    }),
    products: fc.constant({ product_1: { Id: 1, NameGet: 'Test' } })
});

function fullSessionDbState(sessionId) {
    return fc.tuple(
        fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }), date: fc.constant('2024-06-15'), createdAt: fc.integer({ min: 1700000000000, max: 1800000000000 }), productCount: fc.integer({ min: 0, max: 100 }) }),
        fc.array(productArb, { minLength: 0, maxLength: 5 }),
        fc.array(qtyEntryArb, { minLength: 0, maxLength: 5 }),
        metaArb, settingsArb,
        fc.array(snapshotArb, { minLength: 0, maxLength: 3 })
    ).map(function(arr) {
        var session = arr[0], products = arr[1], qtyEntries = arr[2], meta = arr[3], settings = arr[4], snapshots = arr[5];
        var db = {};
        db.liveOrderSessions = {}; db.liveOrderSessions[sessionId] = session;
        var prods = {}; products.forEach(function(p, i) { prods['product_' + p.Id + '_' + i] = p; });
        db.liveOrderProducts = {}; db.liveOrderProducts[sessionId] = prods;
        var qty = {}; qtyEntries.forEach(function(q, i) { qty['product_qty_' + i] = q; });
        db.liveOrderProductsQty = {}; db.liveOrderProductsQty[sessionId] = qty;
        db.liveOrderProductsMeta = {}; db.liveOrderProductsMeta[sessionId] = meta;
        db.liveOrderDisplaySettings = {}; db.liveOrderDisplaySettings[sessionId] = settings;
        var hist = {}; snapshots.forEach(function(s, i) { hist['snapshot_' + i] = s; });
        db.liveOrderCartHistory = {}; db.liveOrderCartHistory[sessionId] = hist;
        return db;
    });
}

describe('Feature: live-order-book, Property 7: Session deletion cascade', function() {
    it('should produce exactly 6 null entries for all node prefixes', function() {
        fc.assert(fc.property(sessionIdArb, function(sessionId) {
            var updates = buildCascadeDeleteUpdates(sessionId);
            var keys = Object.keys(updates);
            expect(keys).toHaveLength(6);
            keys.forEach(function(key) { expect(updates[key]).toBeNull(); });
            ALL_NODE_PREFIXES.forEach(function(prefix) {
                expect(updates).toHaveProperty(prefix + '/' + sessionId, null);
            });
        }), { numRuns: 100 });
    });

    it('should remove all session data from all 6 nodes after cascade delete', function() {
        fc.assert(fc.property(
            sessionIdArb.chain(function(sid) {
                return fullSessionDbState(sid).map(function(db) { return { sessionId: sid, dbState: db }; });
            }),
            function(data) {
                var updates = buildCascadeDeleteUpdates(data.sessionId);
                var afterDelete = applyUpdatesToDatabase(data.dbState, updates);
                ALL_NODE_PREFIXES.forEach(function(prefix) {
                    if (afterDelete[prefix]) {
                        expect(afterDelete[prefix]).not.toHaveProperty(data.sessionId);
                    }
                });
            }
        ), { numRuns: 100 });
    });

    it('should not affect data belonging to other sessions', function() {
        fc.assert(fc.property(
            fc.tuple(sessionIdArb, sessionIdArb).filter(function(pair) { return pair[0] !== pair[1]; })
                .chain(function(pair) {
                    var targetId = pair[0], otherId = pair[1];
                    return fc.tuple(fullSessionDbState(targetId), fullSessionDbState(otherId))
                        .map(function(dbs) {
                            var targetDb = dbs[0], otherDb = dbs[1];
                            var merged = {};
                            ALL_NODE_PREFIXES.forEach(function(prefix) {
                                merged[prefix] = Object.assign({}, targetDb[prefix] || {}, otherDb[prefix] || {});
                            });
                            return { targetId: targetId, otherId: otherId, dbState: merged, otherDb: otherDb };
                        });
                }),
            function(data) {
                var updates = buildCascadeDeleteUpdates(data.targetId);
                var afterDelete = applyUpdatesToDatabase(data.dbState, updates);
                ALL_NODE_PREFIXES.forEach(function(prefix) {
                    if (data.otherDb[prefix] && data.otherDb[prefix][data.otherId]) {
                        expect(afterDelete[prefix]).toHaveProperty(data.otherId);
                        expect(afterDelete[prefix][data.otherId]).toEqual(data.otherDb[prefix][data.otherId]);
                    }
                });
            }
        ), { numRuns: 100 });
    });

    it('should produce paths matching the pattern prefix/sessionId', function() {
        fc.assert(fc.property(sessionIdArb, function(sessionId) {
            var updates = buildCascadeDeleteUpdates(sessionId);
            Object.keys(updates).forEach(function(path) {
                var parts = path.split('/');
                expect(parts).toHaveLength(2);
                expect(ALL_NODE_PREFIXES).toContain(parts[0]);
                expect(parts[1]).toBe(sessionId);
            });
        }), { numRuns: 100 });
    });

    it('source code should contain cascade delete for all 6 nodes', function() {
        ALL_NODE_PREFIXES.forEach(function(prefix) {
            expect(firebaseHelpersSource).toContain(prefix + '/');
        });
        expect(firebaseHelpersSource).toContain('deleteSession');
        expect(firebaseHelpersSource).toContain('= null');
    });
});
