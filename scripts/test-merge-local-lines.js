#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// Unit test for mergeLocalLinesIntoServerDetails (orders-report/js/tab1/tab1-sale.js).
//
// Reproduces the bug from order 260500478 (12:17:02 + 12:17:08) where a sale-modal
// PUT used a stale local snapshot and overwrote products that another flow had just
// added — and verifies the new merge logic preserves both flows' additions.
//
// Run: node scripts/test-merge-local-lines.js

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SALE_FILE = path.join(__dirname, '..', 'orders-report', 'js', 'tab1', 'tab1-sale.js');
const src = fs.readFileSync(SALE_FILE, 'utf8');

// Extract just the merge function from the source. We don't want to execute the
// whole module (which depends on DOM, fetch, etc.) — use a tiny VM sandbox.
const fnStart = src.indexOf('function mergeLocalLinesIntoServerDetails');
if (fnStart === -1) throw new Error('mergeLocalLinesIntoServerDetails not found in source');

// Find the matching closing brace by counting braces.
let depth = 0;
let i = src.indexOf('{', fnStart);
const bodyStart = i;
for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
        depth--;
        if (depth === 0) break;
    }
}
if (depth !== 0) throw new Error('Could not find end of mergeLocalLinesIntoServerDetails');
const fnSource = src.slice(fnStart, i + 1);

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fnSource + '\nthis.merge = mergeLocalLinesIntoServerDetails;', sandbox);
const merge = sandbox.merge;

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        pass++;
        console.log(`  ✓ ${label}`);
    } else {
        fail++;
        failures.push({ label, actual, expected });
        console.log(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
    }
}

function it(name, fn) {
    console.log(`\n• ${name}`);
    try {
        fn();
    } catch (err) {
        fail++;
        failures.push({ label: name, error: err });
        console.log(`  ✗ THREW ${err.message}`);
    }
}

// =====================================================
// TEST CASES
// =====================================================

it('reproduces the bug fix: stale local + server has lines from another flow → both kept', () => {
    // Server already has lines added by edit-modal (e.g., 1904 Q10 Đen + Vàng).
    const server = [
        { Id: 'srv-1', ProductId: 100, UOMId: 1, Quantity: 1, Price: 290000, Note: null },
        { Id: 'srv-2', ProductId: 101, UOMId: 1, Quantity: 1, Price: 290000, Note: null },
        { Id: 'srv-3', ProductId: 102, UOMId: 1, Quantity: 1, Price: 290000, Note: null }, // 1904 Đen
        { Id: 'srv-4', ProductId: 103, UOMId: 1, Quantity: 1, Price: 290000, Note: null }, // 1904 Vàng
    ];
    // Sale modal opened BEFORE edit-modal saved → local lines are stale (no 102/103).
    const local = [
        { Id: 'srv-1', ProductId: 100, UOMId: 1, Quantity: 1, Price: 290000 },
        { Id: 'srv-2', ProductId: 101, UOMId: 1, Quantity: 1, Price: 290000 },
        // User adds NEW product (1726 Vàng = 200) in sale modal.
        { ProductId: 200, UOMId: 1, Quantity: 1, Price: 290000, ProductName: '1726 Vàng' },
    ];

    const result = merge(server, local, 'order-id', 'user-id');

    eq(
        result.length,
        5,
        '5 lines (3 originals + 2 from edit-modal preserved + 1 new from sale modal)'
    );
    eq(
        result.filter((d) => d.Id === 'srv-3').length,
        1,
        'edit-modal line srv-3 (1904 Đen) preserved'
    );
    eq(
        result.filter((d) => d.Id === 'srv-4').length,
        1,
        'edit-modal line srv-4 (1904 Vàng) preserved'
    );
    eq(result.filter((d) => d.ProductId === 200).length, 1, 'new sale-modal line (200) appended');
    const newLine = result.find((d) => d.ProductId === 200);
    eq(newLine.Id, undefined, 'new line has no Id (server will assign)');
});

it('local line with Id matches server by Id and updates qty/price/note', () => {
    const server = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 1, Price: 100, Note: 'old' }];
    const local = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 5, Price: 200, Note: 'new' }];
    const result = merge(server, local, 'oid', 'uid');
    eq(result.length, 1, 'still 1 line');
    eq(result[0].Quantity, 5, 'qty updated');
    eq(result[0].Price, 200, 'price updated');
    eq(result[0].Note, 'new', 'note updated');
});

it('local line without Id matches server by ProductId+UOMId → bumps qty (treats as duplicate-add)', () => {
    const server = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 2, Price: 100 }];
    const local = [{ ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 }]; // user clicked "add" again
    const result = merge(server, local, 'oid', 'uid');
    eq(result.length, 1, 'no duplicate line created');
    eq(result[0].Quantity, 3, '2 (server) + 1 (local add) = 3');
    eq(result[0].Id, 'a', 'kept server Id');
});

it('local line without Id and no server match → appended as new', () => {
    const server = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 }];
    const local = [{ ProductId: 999, UOMId: 1, Quantity: 1, Price: 500, ProductName: 'NEW' }];
    const result = merge(server, local, 'oid', 'uid');
    eq(result.length, 2, '1 server + 1 new');
    const newLine = result.find((d) => d.ProductId === 999);
    eq(newLine.Quantity, 1, 'qty 1');
    eq(newLine.OrderId, 'oid', 'OrderId set');
    eq(newLine.CreatedById, 'uid', 'CreatedById set');
});

it('server lines NOT in local are preserved (the core race-condition fix)', () => {
    const server = [
        { Id: 'a', ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 },
        { Id: 'b', ProductId: 2, UOMId: 1, Quantity: 1, Price: 200 },
    ];
    const local = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 5, Price: 100 }];
    const result = merge(server, local, 'oid', 'uid');
    eq(result.length, 2, 'server line b kept even though local does not have it');
    eq(result.find((d) => d.Id === 'a').Quantity, 5, 'local change to a applied');
    eq(result.find((d) => d.Id === 'b').Quantity, 1, 'server line b unchanged');
});

it('empty local → server unchanged', () => {
    const server = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 }];
    const result = merge(server, [], 'oid', 'uid');
    eq(result.length, 1, 'still 1 line');
    eq(result[0].Quantity, 1, 'qty unchanged');
});

it('empty server + local additions → all appended', () => {
    const local = [
        { ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 },
        { ProductId: 2, UOMId: 1, Quantity: 2, Price: 200 },
    ];
    const result = merge([], local, 'oid', 'uid');
    eq(result.length, 2, '2 new lines');
    eq(result[0].ProductId, 1, 'first product appended');
    eq(result[1].ProductId, 2, 'second product appended');
});

it('different UOMId for same ProductId → treated as separate lines (not merged)', () => {
    // Local lines from sale modal use ProductUOMId (not UOMId), per addProductToSaleFromSearch.
    const server = [{ Id: 'a', ProductId: 1, UOMId: 1, Quantity: 1, Price: 100 }];
    const local = [{ ProductId: 1, ProductUOMId: 2, Quantity: 1, Price: 100 }];
    const result = merge(server, local, 'oid', 'uid');
    eq(result.length, 2, 'two separate lines for same product, different UOM');
});

it('null/undefined inputs are handled', () => {
    eq(merge(null, null, 'oid', 'uid').length, 0, 'null inputs return empty');
    eq(merge(undefined, undefined, 'oid', 'uid').length, 0, 'undefined inputs return empty');
});

it('exact replay of the 12:17 audit log race scenario', () => {
    // t=12:17:00 — Order has 3 original products totaling 810k (3 × 270k).
    // t=12:17:02 — Edit-modal saves: ADDS 1904 Đen + 1904 Vàng (2 × 290k) → server now has 5 items, 1.390k.
    // t=12:17:08 — Sale modal fires updateSaleOrderWithAPI with stale local
    //              (taken at 12:17:00 — only 3 originals + 1 newly added 1726 Vàng).
    //
    // OLD behavior: payload.Details = local (4 items) → server overwritten,
    //               2 edit-modal lines LOST, total 1.390k → 1.100k. ← BUG.
    //
    // NEW behavior (this test): server.Details merged with local additions →
    //                           5 originals/edits preserved + 1 new = 6 items.

    const server = [
        { Id: 'p1', ProductId: 1, UOMId: 1, Quantity: 1, Price: 270000 },
        { Id: 'p2', ProductId: 2, UOMId: 1, Quantity: 1, Price: 270000 },
        { Id: 'p3', ProductId: 3, UOMId: 1, Quantity: 1, Price: 270000 },
        { Id: 'edit-1', ProductId: 1904100, UOMId: 1, Quantity: 1, Price: 290000 }, // 1904 Đen
        { Id: 'edit-2', ProductId: 1904101, UOMId: 1, Quantity: 1, Price: 290000 }, // 1904 Vàng
    ];
    const staleLocal = [
        { Id: 'p1', ProductId: 1, UOMId: 1, Quantity: 1, Price: 270000 },
        { Id: 'p2', ProductId: 2, UOMId: 1, Quantity: 1, Price: 270000 },
        { Id: 'p3', ProductId: 3, UOMId: 1, Quantity: 1, Price: 270000 },
        { ProductId: 1726200, UOMId: 1, Quantity: 1, Price: 290000, ProductName: '1726 Vàng' },
    ];

    const result = merge(server, staleLocal, 'order-478', 'nvktlive1');

    eq(result.length, 6, '6 lines (3 orig + 2 edit-modal preserved + 1 new from sale)');
    const total = result.reduce((sum, d) => sum + d.Quantity * d.Price, 0);
    eq(total, 1680000, 'total 1.680.000 (would have been 1.100.000 with old bug)');
    eq(result.filter((d) => d.Id === 'edit-1').length, 1, '1904 Đen preserved');
    eq(result.filter((d) => d.Id === 'edit-2').length, 1, '1904 Vàng preserved');
    eq(result.filter((d) => d.ProductId === 1726200).length, 1, '1726 Vàng appended');
});

console.log('\n' + '='.repeat(60));
console.log(`PASS: ${pass}   FAIL: ${fail}`);
console.log('='.repeat(60));

if (fail > 0) {
    console.error('\nFailures:');
    failures.forEach((f) => console.error(`  - ${f.label}`));
    process.exit(1);
}
process.exit(0);
