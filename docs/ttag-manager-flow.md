# Modal "Quản Lý Tag T Chờ Hàng" — Code & Flow

> Modal tím nằm trong **panel Chốt Đơn** của Tab1 (orders-report). Quản lý **Tag T (T-tag)** — là *processing tag nội bộ* của n2store, KHÔNG phải tag TPOS. Mở bằng nút 🏷️ "Quản lý Tag T" trong header panel Chốt Đơn.

File chính: [orders-report/js/tab1/tab1-processing-tags.js](../orders-report/js/tab1/tab1-processing-tags.js)
DOM modal id: `#ptag-ttag-manager`
Prefix hàm: `_ttagMgr*` / `_ptag*TTagManager`

---

## 1. Khái niệm: Tag T là gì

- **Tag T** = nhãn nội bộ gắn vào order, biểu thị "đơn đang chờ hàng/sản phẩm cụ thể". Định nghĩa lưu trong `ProcessingTagState._tTagDefinitions`, dạng `{id: 'T1', name, productCode, createdAt}`.
- Persist qua API n2store (KHÔNG phải TPOS) — xem [`saveProcessingTagToAPI()`](../orders-report/js/tab1/tab1-processing-tags.js#L565). Key đặc biệt `__ttag_config__` lưu danh sách định nghĩa Tag T toàn shop.
- Mỗi order có thể chứa danh sách `tTags: [{id, name}, …]` trong `ProcessingTagState._orderData`.
- Sync ngược về TPOS qua `window.syncXLToTPOS(orderCode, 'ttag-add'|'ttag-remove')` (gắn nhãn XL bên TPOS để filter).

State riêng của modal:
```js
let _ttagMgrData = [];          // [{tagId, tagName, productCode, sttList: number[], errorMessage?}]
let _ttagMgrSelectedRows = new Set(); // tagIds đã tick checkbox
let _ttagMgrActiveTab = 'assign';     // 'assign' | 'remove'
let _ttagMgrDropdownIndex = -1;       // highlight item trong dropdown
let _ttagMgrCreatingInline = false;   // form tạo tag mới đang mở?
```

---

## 2. Mở modal — [`_ptagOpenTTagManager()`](../orders-report/js/tab1/tab1-processing-tags.js#L3097)

1. Reset toàn bộ state (`_ttagMgrData = []`, clear selected, tab về `'assign'`).
2. Tính `counts = _ttagGetCounts()` — đếm số order đang gắn từng Tag T.
3. Lấy `defs = ProcessingTagState.getTTagDefinitions()` rồi **loại bỏ các default tag** (`DEFAULT_TTAG_DEFS`) — chỉ hiện tag custom.
4. Tạo `<div id="ptag-ttag-manager" class="bulk-tag-modal show">` (dùng chung CSS với modal Bulk Tag thường để đồng bộ giao diện) và `appendChild(document.body)`.
5. Cấu trúc render:
   - **Header tím** (gradient `#7c3aed → #a855f7`): tiêu đề + `Tổng: N tag · M đơn chờ hàng` + 3 nút (Lịch sử / ⚙ Cài đặt / X đóng).
   - **Tabs**: `Gán Tag` / `Gỡ Tag` (`_ttagMgrSwitchTab`).
   - **Search section**: input tìm tag + dropdown gợi ý + nút "Xóa tất cả".
   - **Inline create form** (ẩn mặc định): tạo tag T mới ngay tại chỗ.
   - **Select-all row** + counter "0 tag đã thêm".
   - **Body table**: `#ttagMgrTableBody` — render các row tag đã chọn.
   - **Footer**: nút Hủy + nút confirm động ("Gán Tag Đã Chọn" / "Gỡ Tag Đã Chọn").
6. `addEventListener('click', _ttagMgrDocClickHandler)` để đóng dropdown khi click ra ngoài.

Đóng modal: [`_ptagCloseTTagManager()`](../orders-report/js/tab1/tab1-processing-tags.js#L4389) — gỡ DOM + cleanup listener.

---

## 3. Tìm/chọn tag — Dropdown

- [`_ttagMgrShowDropdown()`](../orders-report/js/tab1/tab1-processing-tags.js#L3221) gọi `_ttagMgrFilterDropdown()`.
- [`_ttagMgrFilterDropdown()`](../orders-report/js/tab1/tab1-processing-tags.js#L3227):
  - Lấy toàn bộ defs, loại bỏ default + tag đã có trong `_ttagMgrData`.
  - Lọc theo text (`name`, `productCode`, `id`).
  - Render từng item: tên tag UPPERCASE + product code + số đơn đang chờ (`counts[def.id]`).
  - Nếu **không match** mà user có gõ text → hiện dòng đặc biệt "Không tìm thấy '<text>' - Nhấn Enter để tạo" → click/Enter mở form tạo inline.
- [`_ttagMgrHandleSearchKeydown()`](../orders-report/js/tab1/tab1-processing-tags.js#L3274):
  - `ArrowDown/ArrowUp`: di chuyển highlight (`_ttagMgrDropdownIndex`).
  - `Enter`: nếu có item highlight → `_ttagMgrAddTag(def.id)`; ngược lại nếu input có text → `_ttagMgrShowCreateForm()`.
  - `Escape`: ẩn dropdown.

---

## 4. Tạo Tag T mới (inline) — [`_ttagMgrConfirmCreate()`](../orders-report/js/tab1/tab1-processing-tags.js#L3336)

1. Validate có name.
2. **Auto-generate ID**: scan `defs`, tìm pattern `T(\d+)` lớn nhất → `T(N+1)`.
3. `newDef = {id, name: NAME.toUpperCase(), productCode, createdAt: Date.now()}`.
4. Push vào `defs` → `ProcessingTagState.setTTagDefinitions(defs)`.
5. `mergeConfigDefs('__ttag_config__', [newDef])` — persist lên n2store API.
6. Đóng form, clear input, gọi `_ttagMgrAddTag(tagId)` để add ngay vào bảng modal, rồi `_ttagMgrUpdateSummary()` + `renderPanelContent()`.

---

## 5. Add tag vào bảng — [`_ttagMgrAddTag()`](../orders-report/js/tab1/tab1-processing-tags.js#L3372)

- Nếu đã có thì thoát.
- Lấy def → push entry `{tagId, tagName, productCode, sttList: [], errorMessage: null}`.
- **Đặc biệt cho tab `remove`**: tự động prefill `sttList` bằng tất cả các đơn đang gắn tag này (`_ttagGetOrdersForTag(tagId)`).
- Nếu `sttList.length > 0` → auto-tick checkbox row (`_ttagMgrSelectedRows.add(tagId)`).
- Clear input, ẩn dropdown, re-render bảng + counter + select-all.

Xóa row: [`_ttagMgrRemoveTagRow()`](../orders-report/js/tab1/tab1-processing-tags.js#L3409). Clear all: [`_ttagMgrClearAll()`](../orders-report/js/tab1/tab1-processing-tags.js#L3417).

---

## 6. Render bảng — [`_ttagMgrUpdateTable()`](../orders-report/js/tab1/tab1-processing-tags.js#L3427)

Mỗi row gồm 3 cột:

| Cột | Nội dung |
|---|---|
| **Tag** | Checkbox (disable nếu `sttCount===0`) + dot tím + tên tag + (nếu có) productCode + nút "Tìm Đơn" + dòng error |
| **STT** | Pills `STT N — tên KH ✕` cho từng STT trong `sttList` (lookup tên KH qua `OrderStore.getBySTT(stt)` hoặc `getAllOrders()`), input "Nhập STT và Enter", counter `(N)` |
| **Action** | Nút 🗑 xóa row |

---

## 7. Quản lý STT trong row

- [`_ttagMgrHandleSTTKeydown()`](../orders-report/js/tab1/tab1-processing-tags.js#L3540): bắt Enter, parse số, lookup order qua `OrderStore.getBySTT` (fallback `getAllOrders`). Không tìm thấy → warning. Đã có → warning. Hợp lệ → push vào `sttList`, auto-tick checkbox row, clear input, re-render và re-focus input.
- [`_ttagMgrRemoveSTT(tagId, stt)`](../orders-report/js/tab1/tab1-processing-tags.js#L3575): xóa khỏi pill list; nếu rỗng → uncheck row.
- [`_ttagMgrFindByProductCode(tagId)`](../orders-report/js/tab1/tab1-processing-tags.js#L3584): tính năng đặc biệt — nếu tag có `productCode`, scan toàn bộ orders (cần `Details` đã load, fallback gọi `_ptagLoadReportOrderDetails()`), tìm order có `Details[].ProductCode === productCode`, auto-add tất cả STT match vào row (skip duplicate). Nếu chưa có Details → alert hướng dẫn user vào tab "Báo Cáo Tổng Hợp" để load chi tiết trước.

---

## 8. Switch tab — [`_ttagMgrSwitchTab(tab)`](../orders-report/js/tab1/tab1-processing-tags.js#L3668)

- Reset `_ttagMgrData` + `_ttagMgrSelectedRows` (tab assign và remove KHÔNG share data).
- Update class CSS cho 2 tab.
- Đổi confirm button: tab `assign` → "Gán Tag Đã Chọn" (xanh), tab `remove` → "Gỡ Tag Đã Chọn" (đỏ, class `bulk-tag-btn-delete`).
- Đổi label cột: "Tag cần gán" / "Tag cần gỡ".

---

## 9. Execute — [`_ttagMgrExecute()`](../orders-report/js/tab1/tab1-processing-tags.js#L3704)

Router theo `_ttagMgrActiveTab`.

### 9.1. Tab `assign` → [`_ttagMgrExecuteAssign()`](../orders-report/js/tab1/tab1-processing-tags.js#L3719)

1. Lọc `selectedTags` = các row có tick + có `sttList`. Nếu rỗng → warning, return.
2. Với mỗi tag được chọn:
   - Khởi tạo `successSTT[]`, `failedSTT[]`, `redirectedSTT[]`.
   - Loop từng `stt` trong `sttList`:
     - Tìm order qua `OrderStore.getBySTT` / `getAllOrders().find(o => o.SessionIndex === stt)`. Không có → push `failedSTT`, continue.
     - **Check tag chặn `"ĐÃ GỘP KO CHỐT"`**: parse `order.Tags` (TPOS tag JSON), nếu chứa name `"ĐÃ GỘP KO CHỐT"`:
       - Normalize SĐT qua [`_ttagMgrNormalizePhone()`](../orders-report/js/tab1/tab1-processing-tags.js#L3712) (chỉ giữ số, `84xxx → 0xxx`).
       - SĐT rỗng → fail.
       - `samePhoneOrders = allOrders.filter(o => o.Id !== order.Id && normalizedPhone === ...)`. Rỗng → fail.
       - **Chọn replacement = đơn có `SessionIndex` lớn nhất** cùng SĐT.
       - Gọi [`assignTTagToOrder(replacement.Code, tagId)`](../orders-report/js/tab1/tab1-processing-tags.js#L899) — gắn Tag T vào đơn replacement.
       - Gọi [`transferProcessingTags(originalCode, replacementCode)`](../orders-report/js/tab1/tab1-processing-tags.js#L956) — chuyển flags + tTags từ đơn bị block sang đơn replacement (best-effort, log warn nếu fail).
       - Push `{original, redirectTo}` vào `redirectedSTT`. Continue.
     - **Flow bình thường**: gọi `assignTTagToOrder(order.Code, tagId)` → push `successSTT`. Catch error → push `failedSTT`.
3. Sau loop, nếu có success/redirect → push vào `successResults`. Nếu có fail → push vào `failedResults` với `reason: 'Không tìm thấy đơn hoặc lỗi API'`.
4. **Xóa STT đã thành công khỏi bảng** (gồm cả `redirectedList[].original`); nếu row hết STT → xóa luôn row.
5. Re-render table + count + select-all + summary.
6. Save lịch sử qua [`_ttagMgrSaveHistory('assign', results)`](../orders-report/js/tab1/tab1-processing-tags.js#L3971).
7. Hiển thị result modal qua [`_ttagMgrShowResult()`](../orders-report/js/tab1/tab1-processing-tags.js#L3882).

### 9.2. Tab `remove` → [`_ttagMgrExecuteRemove()`](../orders-report/js/tab1/tab1-processing-tags.js#L3824)

Đơn giản hơn — không có logic redirect. Loop mỗi STT, gọi [`removeTTagFromOrder(order.Code, tagId)`](../orders-report/js/tab1/tab1-processing-tags.js#L932), tổng hợp success/fail, xóa row đã xong, save history `'remove'`, show result.

### 9.3. `assignTTagToOrder` (helper cốt lõi)

```js
async function assignTTagToOrder(orderCode, tagId, source) {
    let data = ProcessingTagState.getOrderData(orderCode) || { tTags: [] };
    const tTags = data.tTags || [];
    if (!tTags.some(t => _ptagTTagId(t) === tagId)) {
        tTags.push({ id: tagId, name: ProcessingTagState.getTTagName(tagId) || tagId });
    }
    data.tTags = tTags;
    // Auto đổi subState: nếu đơn đang ở Cat 1 "OKIE_CHO_DI_DON" → chuyển sang "CHO_HANG"
    if (data.category === PTAG_CATEGORIES.CHO_DI_DON && data.subState === 'OKIE_CHO_DI_DON') {
        data.subState = 'CHO_HANG';
    }
    _ptagEnsureCode(orderCode, data);
    ProcessingTagState.setOrderData(orderCode, data);
    _ptagAddHistory(orderCode, 'ADD_TTAG', tagId, source || null);
    _ptagRefreshRow(orderCode);   // Refresh hiển thị row trong bảng đơn
    renderPanelContent();         // Refresh panel Chốt Đơn
    await saveProcessingTagToAPI(orderCode, data);  // Persist lên n2store API
    if (typeof window.syncXLToTPOS === 'function') {
        window.syncXLToTPOS(orderCode, 'ttag-add'); // Sync nhãn XL bên TPOS
    }
}
```

`removeTTagFromOrder` đối xứng — filter tagId ra khỏi `tTags`, nếu Cat 1 + `CHO_HANG` + hết `tTags` → revert về `OKIE_CHO_DI_DON`, persist + sync.

---

## 10. Result modal — [`_ttagMgrShowResult()`](../orders-report/js/tab1/tab1-processing-tags.js#L3882)

- Tính `totalSuccess` (gồm cả `redirectedList`) và `totalFailed`.
- Bắn notification: success / warning (success+failed) / error.
- Build HTML hiển thị từng tag với danh sách STT thành công + dòng phụ `↳ STT X → chuyển sang STT Y (đơn gộp)` cho redirected, và list failed kèm `reason`.
- Render modal phụ `#ttagMgrResultModal` với `z-index: 10003` (đè lên modal chính). User click ✕ hoặc click outside để đóng.

---

## 11. History — Firebase realtime DB

[`_ttagMgrSaveHistory(type, results)`](../orders-report/js/tab1/tab1-processing-tags.js#L3971):

- Build entry: `{timestamp, dateFormatted, username, type: 'assign'|'remove', results, summary: {totalSuccess, totalFailed}}`.
- Lưu vào `database.ref('tTagHistory/{timestamp}').set(entry)`.
- Username lấy từ `currentUserIdentifier` hoặc `tokenManager.getTokenData()`.

Modal lịch sử riêng (`_ttagMgrShowHistory`) đọc lại từ `tTagHistory/` và render danh sách.

---

## 12. Persist tóm tắt

| Loại data | Storage | Trigger |
|---|---|---|
| Tag T definitions (`__ttag_config__`) | n2store API qua `saveProcessingTagToAPI` + SSE/poll sync | Khi tạo/sửa/xóa định nghĩa |
| Order's `tTags` array | n2store API (`ProcessingTagState._orderData`) | Sau mỗi `assignTTagToOrder` / `removeTTagFromOrder` |
| Sync TPOS XL tag | TPOS API qua `window.syncXLToTPOS` | Sau mỗi assign/remove (forward sync) |
| History | Firebase realtime DB `tTagHistory/{ts}` | Sau mỗi lần execute |
| UI state modal (`_ttagMgrData`, selected, tab) | RAM only | Reset mỗi lần mở modal |

> Khác biệt với modal Bulk Tag XL ngoài toolbar: modal Tag T **không** lưu draft localStorage giữa các lần mở; mở lại là rỗng.

---

## 13. So sánh nhanh với "Gán Tag Hàng Loạt" (modal xanh ngoài toolbar)

| | Tag T (modal tím) | Bulk Tag XL (modal xanh) |
|---|---|---|
| File | `tab1-processing-tags.js` | `tab1-bulk-tags.js` |
| Loại tag | T-tag nội bộ + sync XL | Tag TPOS thật |
| API | n2store + `syncXLToTPOS` | TPOS `TagSaleOnlineOrder/AssignTag` |
| 2 tab gán/gỡ | ✅ trong cùng modal | ❌ tách 2 modal riêng |
| Draft localStorage | ❌ | ✅ (`bulkTagModalDraft`) |
| Tạo tag mới inline | ✅ (form ngay trong dropdown) | ✅ (auto-create khi Enter) |
| "Tìm Đơn theo product code" | ✅ | ❌ |
| Auto-prefill STT khi tab remove | ✅ | ❌ |
| Xử lý "ĐÃ GỘP KO CHỐT" → redirect | ✅ | ✅ |
| Transfer processing tags khi redirect | ✅ | ✅ |
| History storage | Firebase `tTagHistory/` | Firebase `bulkTagHistory/` |

---

## 14. Edge cases / lưu ý

- **`_ttagMgrSwitchTab` reset toàn bộ data** — chuyển tab giữa chừng sẽ mất các STT đã nhập.
- **Tab `remove` chỉ prefill STT từ data đã load** (`ProcessingTagState.getAllOrders()`); nếu data chưa sync xong, có thể thiếu.
- **`_ttagMgrFindByProductCode` cần `Details`** — phải vào tab Báo Cáo Tổng Hợp load chi tiết đơn trước, nếu không sẽ alert.
- **Replacement chọn STT lớn nhất** trong nhóm cùng SĐT — không phân biệt đơn đã chốt hay chưa. Có thể gắn nhầm vào đơn không phù hợp nếu KH có nhiều đơn cùng SĐT.
- **`assignTTagToOrder` KHÔNG quăng error rõ ràng** nếu `data not loaded yet` — chỉ `console.warn` và return undefined → execute loop coi là success (vì không throw). Risk: STT bị mark thành công trong khi thực tế chưa lưu.
- **Redirect ghi history vào ĐƠN REPLACEMENT, không phải đơn original** — chỉ có log console + result modal hiển thị `↳`.
- **`saveProcessingTagToAPI` không có rollback** nếu fail; `tTags` đã set trong RAM/SSE listener khác có thể overwrite.
- **`syncXLToTPOS` chạy fire-and-forget** sau persist; nếu nó fail, n2store và TPOS lệch trạng thái Tag XL.
- **Default Tag T (`DEFAULT_TTAG_DEFS`) bị ẩn** khỏi cả dropdown lẫn summary count — không quản lý được qua modal này.
