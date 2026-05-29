// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Test data scripts for so-order — eval qua persistent browser session.
//   Create: bash scripts/so-order-test-data-load.sh create
//   Clean:  bash scripts/so-order-test-data-load.sh cleanup

// Cleanup so-order test data created by claude code 2026-05-29
// Removes all shipments where batch startsWith "TEST-BATCH-" + rows where supplier startsWith "TEST-NCC-"
const S = window.SoOrderStorage;
const state = S.load();
const result = { tabs: {}, totalRowsRemoved: 0, totalShipsRemoved: 0 };
for (const tab of state.tabs) {
    const before = tab.shipments.length;
    let rowsRemoved = 0;
    // First: strip TEST rows from non-TEST shipments
    for (const sh of tab.shipments) {
        const oldLen = sh.rows.length;
        sh.rows = sh.rows.filter((r) => !(r.supplier || '').startsWith('TEST-NCC-'));
        rowsRemoved += oldLen - sh.rows.length;
    }
    // Then: drop shipments matching TEST-BATCH-* OR shipments with empty rows after strip
    tab.shipments = tab.shipments.filter((sh) => !(sh.batch || '').startsWith('TEST-BATCH-'));
    const shipsRemoved = before - tab.shipments.length;
    result.tabs[tab.id] = { shipsRemoved, rowsRemoved };
    result.totalShipsRemoved += shipsRemoved;
    result.totalRowsRemoved += rowsRemoved;
}
// Persist via storage layer
const ls = localStorage;
ls.setItem('soOrder_v1', JSON.stringify(state));
if (S.Sync) {
    S.Sync.pushToFirestore(state);
    await S.Sync.flush();
    result.firestoreFlushed = true;
}
return JSON.stringify(result);
