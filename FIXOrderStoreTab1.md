# FIXOrderStoreTab1 - Changelog & Revert Guide

> **Date:** 2026-01-18
> **Purpose:** Document all OrderStore optimization changes for potential rollback
> **Related Plan:** `C:\Users\Nguyen Tam\.claude\plans\glimmering-tickling-fiddle.md`

---

## 📋 SUMMARY

This document tracks ALL changes made during the OrderStore optimization (Phase A) implementation.
If issues occur, use this as a guide to revert specific changes.

---

## 🔄 PHASE A INITIAL (Already Committed)

**Commit:** `260111e3` - feat(tab1): implement OrderStore for O(1) order lookups

### Files Modified:

#### 1. `orders-report/js/tab1/tab1-core.js`

**Lines Added:** 190-328 (OrderStore class)

```javascript
// ADDED: OrderStore class for O(1) lookups
const OrderStore = {
    _orders: new Map(),
    _initialized: false,
    setAll(orders) { ... },
    addBatch(orders) { ... },
    get(orderId) { ... },
    has(orderId) { ... },
    update(orderId, data) { ... },
    getAll() { ... },
    get size() { ... },
    get isInitialized() { ... },
    clear() { ... },
    syncFromArray(arr) { ... }
};
window.OrderStore = OrderStore;
```

**To Revert:** Delete lines 190-328 and remove `window.OrderStore = OrderStore;`

---

#### 2. `orders-report/js/tab1/tab1-search.js`

**Line 1179-1181:** Added OrderStore.clear() when resetting allData
```javascript
// ADDED
if (window.OrderStore) {
    window.OrderStore.clear();
}
```

**Line 1198-1203:** Added OrderStore initialization with first batch
```javascript
// ADDED
if (window.OrderStore) {
    window.OrderStore.setAll(firstOrders);
    console.log('[PROGRESSIVE] OrderStore initialized with', firstOrders.length, 'orders');
}
```

**Line 1314-1319:** Added OrderStore.addBatch during background loading
```javascript
// ADDED
if (window.OrderStore) {
    window.OrderStore.addBatch(orders);
}
```

**To Revert:** Remove these 3 blocks

---

#### 3. `orders-report/js/tab1/tab1-table.js`

**Line ~20-28:** Added OrderStore O(1) update in updateOrderInTable()
```javascript
// ADDED: O(1) update via OrderStore
if (window.OrderStore && window.OrderStore.isInitialized) {
    const updated = window.OrderStore.update(orderId, cleanedData);
    if (updated) {
        console.log('[UPDATE] ✅ Updated via OrderStore O(1)');
    }
}
```

**To Revert:** Remove this block

---

#### 4. `orders-report/js/tab1/tab1-firebase.js`

**Line ~245-249:** Added OrderStore update in handleRealtimeTagUpdate()
```javascript
// ADDED
if (window.OrderStore && window.OrderStore.isInitialized) {
    window.OrderStore.update(orderId, { Tags: tagsJson });
}
```

**Line ~287-291:** Added OrderStore update in updateTagCellOnly()
```javascript
// ADDED
if (window.OrderStore && window.OrderStore.isInitialized) {
    window.OrderStore.update(orderId, { Tags: tagsJson });
    console.log('[TAG-REALTIME] ✅ Updated Tags via OrderStore O(1)');
}
```

**To Revert:** Remove these 2 blocks

---

## 🔄 PHASE A EXTENDED (Current Implementation)

### Files to be Modified:

---

### 1. `orders-report/js/tab1/tab1-core.js` - Add STT Map

**Lines to Add:** Inside OrderStore class (after line 209)

```javascript
// TO ADD: STT Map for bulk tagging lookup
_ordersBySTT: new Map(),     // STT (SessionIndex) -> order object

// TO MODIFY: setAll() - also populate STT map
// TO MODIFY: addBatch() - also populate STT map
// TO ADD: getBySTT(stt) method
```

---

### 2. `orders-report/js/tab1/tab1-tags.js` - 3 locations

**Line 480:** `addTagToOrder` function
- BEFORE: `const order = allData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

**Line 580:** `quickRemoveTag` function
- BEFORE: `const order = allData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

**Line 843:** `openTagModal` function
- BEFORE: `const order = allData.find((o) => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find((o) => o.Id === orderId);`

---

### 3. `orders-report/js/tab1/tab1-edit-modal.js` - 1 location

**Line 878:** `saveOrderChanges` function
- BEFORE: `const existingOrder = allData.find(order => order.Id === currentEditOrderId);`
- AFTER: `const existingOrder = window.OrderStore?.get(currentEditOrderId) || allData.find(order => order.Id === currentEditOrderId);`

---

### 4. `orders-report/js/tab1/tab1-fast-sale.js` - 6 locations

**Line 193:** `fetchFastSaleOrdersData` fallback
- BEFORE: `const order = displayedData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || displayedData.find(o => o.Id === orderId);`

**Line 296:** `renderFastSaleModalBody`
- BEFORE: `saleOnlineOrder = displayedData.find(o => o.Id === saleOnlineId);`
- AFTER: `saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);`

**Line 321:** `renderFastSaleOrderRow`
- BEFORE: `saleOnlineOrder = displayedData.find(o => o.Id === saleOnlineId);`
- AFTER: `saleOnlineOrder = window.OrderStore?.get(saleOnlineId) || displayedData.find(o => o.Id === saleOnlineId);`

**Line 495:** (if exists) Similar pattern

**Line 920:** (if exists) Similar pattern

**Line 1384:** (if exists) Similar pattern

---

### 5. `orders-report/js/tab1/tab1-firebase.js` - 2 additional locations

**Line 101:** `emitTagUpdateToFirebase`
- BEFORE: `const order = allData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

**Line 234:** (if exists) Similar pattern

---

### 6. `orders-report/js/tab1/tab1-chat.js` - 1 location

**Line 1484:** `refreshChatOrderData`
- BEFORE: `let order = allData.find(o => o.Id === orderId);`
- AFTER: `let order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

---

### 7. `orders-report/js/tab1/tab1-qr-debt.js` - 1 location

**Line 1035:** `updateOrderDebtStatus`
- BEFORE: `const order = allData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

---

### 8. `orders-report/js/tab1/tab1-table.js` - 1 additional location

**Line 1444:** `getPrintableOrder`
- BEFORE: `const order = allData.find(o => o.Id === orderId);`
- AFTER: `const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);`

---

### 9. `orders-report/js/tab1/tab1-bulk-tags.js` - 4 locations (STT lookup)

**Line 541:** `addSTTToBulkTagRow`
- BEFORE: `const order = displayedData.find(o => o.SessionIndex === stt);`
- AFTER: `const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);`

**Line 619:** Similar pattern

**Line 1758:** Similar pattern

**Line 1836:** Similar pattern

---

## 🔙 FULL REVERT PROCEDURE

If you need to revert ALL OrderStore changes:

1. **Revert Phase A Initial commit:**
   ```bash
   git revert 260111e3
   ```

2. **Or manually remove all added code blocks documented above**

3. **Test after revert:**
   - Check allData.find() works correctly
   - Check tag updates work
   - Check realtime updates work

---

## ✅ VERIFICATION CHECKLIST

After implementation, test these scenarios:

- [ ] Search by STT works correctly
- [ ] Tag modal opens with correct tags
- [ ] Quick tag add/remove works
- [ ] Realtime tag updates appear
- [ ] Fast sale modal shows correct data
- [ ] Chat modal opens correctly
- [ ] Bulk tagging by STT works
- [ ] Edit order saves correctly

---

## 📝 IMPLEMENTATION LOG

| Time | File | Line | Change | Status |
|------|------|------|--------|--------|
| - | tab1-core.js | 190-328 | Added OrderStore class | ✅ Done |
| - | tab1-search.js | 1179-1181 | Added clear() | ✅ Done |
| - | tab1-search.js | 1198-1203 | Added setAll() | ✅ Done |
| - | tab1-search.js | 1314-1319 | Added addBatch() | ✅ Done |
| - | tab1-table.js | ~20-28 | Added update() | ✅ Done |
| - | tab1-firebase.js | ~245-249 | Added update() | ✅ Done |
| - | tab1-firebase.js | ~287-291 | Added update() | ✅ Done |

*Phase A Extended changes will be logged below as implemented*

---

## 🔄 PHASE A EXTENDED - COMPLETED CHANGES

**Date:** 2026-01-18
**Status:** ✅ ALL IMPLEMENTED

### Summary of Changes:

| File | Lines Modified | Change Type | Status |
|------|---------------|-------------|--------|
| tab1-core.js | 210, 217-232, 239-250, 271-278, 324-327, 335-348 | Added STT Map + getBySTT() | ✅ |
| tab1-tags.js | 480, 580, 843 | OrderStore.get() for 3 find() calls | ✅ |
| tab1-edit-modal.js | 878 | OrderStore.get() for 1 find() call | ✅ |
| tab1-fast-sale.js | 193, 296, 321, 495, 920, 1384 | OrderStore.get() for 6 find() calls | ✅ |
| tab1-firebase.js | 101 | OrderStore.get() for 1 find() call | ✅ |
| tab1-chat.js | 1484 | OrderStore.get() for 1 find() call | ✅ |
| tab1-qr-debt.js | 1035 | OrderStore.get() for 1 find() call | ✅ |
| tab1-table.js | 61, 1486 | OrderStore.get() for 2 find() calls | ✅ |
| tab1-bulk-tags.js | 541, 619, 1758, 1836 | OrderStore.getBySTT() for 4 STT lookups | ✅ |

---

### Detailed Changes:

#### 1. tab1-core.js - STT Map Enhancement

**Line 210:** Added `_ordersBySTT` Map
```javascript
_ordersBySTT: new Map(),    // Secondary index: SessionIndex (STT) -> order object
```

**Lines 217-232:** Modified `setAll()` to populate STT map
```javascript
// Also index by SessionIndex (STT) for bulk tagging
if (order.SessionIndex !== undefined && order.SessionIndex !== null) {
    this._ordersBySTT.set(String(order.SessionIndex), order);
}
```

**Lines 239-250:** Modified `addBatch()` to populate STT map

**Lines 271-278:** Added `getBySTT()` method
```javascript
getBySTT(stt) {
    return this._ordersBySTT.get(String(stt));
},
```

**Lines 324-327:** Modified `clear()` to also clear STT map

**Lines 335-348:** Modified `syncFromArray()` to also populate STT map

---

#### 2. tab1-tags.js - 3 locations

**Line 480:** `addTagToOrder()`
```javascript
// BEFORE: const order = allData.find(o => o.Id === orderId);
// AFTER:
const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

**Line 580:** `quickRemoveTag()`
```javascript
// BEFORE: const order = allData.find(o => o.Id === orderId);
// AFTER:
const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

**Line 843:** `openTagModal()`
```javascript
// BEFORE: const order = allData.find((o) => o.Id === orderId);
// AFTER:
const order = window.OrderStore?.get(orderId) || allData.find((o) => o.Id === orderId);
```

---

#### 3. tab1-edit-modal.js - 1 location

**Line 878:** `saveOrderChanges()`
```javascript
// BEFORE: const existingOrder = allData.find(order => order.Id === currentEditOrderId);
// AFTER:
const existingOrder = window.OrderStore?.get(currentEditOrderId) || allData.find(order => order.Id === currentEditOrderId);
```

---

#### 4. tab1-fast-sale.js - 6 locations

**Line 193:** Fallback in `fetchFastSaleOrdersData()`
**Line 296:** Auto-select carrier
**Line 321:** `renderFastSaleOrderRow()`
**Line 495:** Get SaleOnlineOrder for phone and address
**Line 920:** Find saleOnline order
**Line 1384:** Find saleOnline order for data

All changed to:
```javascript
const order = window.OrderStore?.get(orderId) || displayedData.find(o => o.Id === orderId);
```

---

#### 5. tab1-firebase.js - 1 location

**Line 101:** `emitTagUpdateToFirebase()`
```javascript
// BEFORE: const order = allData.find(o => o.Id === orderId);
// AFTER:
const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

---

#### 6. tab1-chat.js - 1 location

**Line 1484:** `openChatModal()`
```javascript
// BEFORE: let order = allData.find(o => o.Id === orderId);
// AFTER:
let order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

---

#### 7. tab1-qr-debt.js - 1 location

**Line 1035:** `openSaleButtonModal()`
```javascript
// BEFORE: const order = allData.find(o => o.Id === orderId);
// AFTER:
const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

---

#### 8. tab1-table.js - 2 locations

**Line 61:** `updateOrderInTable()` - tags only update
**Line 1486:** `isOrderSelectable()`

Both changed to:
```javascript
const order = window.OrderStore?.get(orderId) || allData.find(o => o.Id === orderId);
```

---

#### 9. tab1-bulk-tags.js - 4 locations (STT lookup)

**Lines 541, 619, 1758, 1836:** All STT lookups changed to:
```javascript
// BEFORE: const order = displayedData.find(o => o.SessionIndex === stt);
// AFTER:
const order = window.OrderStore?.getBySTT(stt) || displayedData.find(o => o.SessionIndex === stt);
```

---

## 🔙 REVERT INSTRUCTIONS FOR PHASE A EXTENDED

To revert Phase A Extended changes:

1. **tab1-core.js:**
   - Remove `_ordersBySTT: new Map(),` from OrderStore
   - Remove STT indexing from `setAll()`, `addBatch()`, `syncFromArray()`
   - Remove `getBySTT()` method
   - Remove `this._ordersBySTT.clear();` from `clear()`

2. **All other files:**
   - Replace `window.OrderStore?.get(orderId) ||` with nothing
   - Replace `window.OrderStore?.getBySTT(stt) ||` with nothing
   - Keep only the original `allData.find()` or `displayedData.find()` calls

---

## ✅ FINAL VERIFICATION CHECKLIST

- [x] STT Map added to OrderStore
- [x] getBySTT() method implemented
- [x] tab1-tags.js - 3 locations optimized
- [x] tab1-edit-modal.js - 1 location optimized
- [x] tab1-fast-sale.js - 6 locations optimized
- [x] tab1-firebase.js - 1 location optimized
- [x] tab1-chat.js - 1 location optimized
- [x] tab1-qr-debt.js - 1 location optimized
- [x] tab1-table.js - 2 locations optimized
- [x] tab1-bulk-tags.js - 4 locations optimized with getBySTT()

**Total: 22 O(n) lookups converted to O(1)**
