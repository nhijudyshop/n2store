<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. -->

# Flow: Gộp Sản Phẩm Đơn Trùng SĐT (Merge Orders Same Phone) — Tag XL edition

> **Trạng thái**: cập nhật 2026-04-22 (refactor: tag sau gộp đơn chuyển từ TPOS → cột Tag XL).
> Xem thêm: [orders-report/docs/MERGE_ORDERS_MODAL_GUIDE.md](../../orders-report/docs/MERGE_ORDERS_MODAL_GUIDE.md) (guide chi tiết UI/state cũ).

---

## 1. Entry point

| Thành phần | File | Dòng |
|---|---|---|
| Button trigger | [orders-report/tab1-orders.html](../../orders-report/tab1-orders.html) | 158–162 |
| Modal container | [orders-report/tab1-orders.html](../../orders-report/tab1-orders.html) | 1471–1512 |
| History modal | [orders-report/tab1-orders.html](../../orders-report/tab1-orders.html) | 1554–1584 |
| Toàn bộ logic | [orders-report/js/tab1/tab1-merge.js](../../orders-report/js/tab1/tab1-merge.js) | ~2,300 dòng |
| Tag XL logic | [orders-report/js/tab1/tab1-processing-tags.js](../../orders-report/js/tab1/tab1-processing-tags.js) | ~6,000 dòng |
| Sync XL↔TPOS | [orders-report/js/tab1/tab1-tag-sync.js](../../orders-report/js/tab1/tab1-tag-sync.js) | ~650 dòng |
| CSS styles | [orders-report/tab1-orders.css](../../orders-report/tab1-orders.css) | 3593–3950 |

Button `#mergeProductsBtn` → gọi `showMergeDuplicateOrdersModal()` (global).

---

## 2. Detect cụm đơn trùng SĐT

### 2.1 Chuẩn hoá số điện thoại
`normalizeMergePhone(phone)` ([tab1-merge.js L11](../../orders-report/js/tab1/tab1-merge.js)):

- Bỏ space / `.` / `-` / `()`
- `+84xxx` → `0xxx`; `84xxx` (len 11) → `0xxx`
- Regex `^\d{9,12}$`; fail → trả `''` → **skip group** (tránh `"0"`, `"000"` gộp nhầm khách khác)

### 2.2 Group + chọn đơn đích
`showMergeDuplicateOrdersModal()` ([tab1-merge.js L703–L860](../../orders-report/js/tab1/tab1-merge.js)):

1. Duyệt `displayedData` (đơn đang render ở tab1)
2. Build `Map<phone, Order[]>`
3. Lọc `orders.length > 1` → cụm cần gộp
4. Sort theo `SessionIndex` (STT) **tăng dần**
5. `target = orders[last]` (STT lớn nhất) · `sources = orders.slice(0, -1)`

> Quy ước: **Luôn gộp từ STT nhỏ → STT lớn**. Tổng đơn cần fetch detail = tổng phần tử trong tất cả cụm.

---

## 3. Loading chi tiết

`showMergeDuplicateOrdersModal` ([tab1-merge.js L777–L812](../../orders-report/js/tab1/tab1-merge.js)):

- **Batch size**: 5 order / lần
- **Trong batch**: `Promise.all(batch.map(getOrderDetails))` → song song
- **Giữa batch**: `await sleep(300ms)` → tránh rate limit TPOS
- **Progress text**: `Đang tải chi tiết {done}/{total} đơn hàng...`
- **Không cache** — mỗi lần mở modal fetch lại fresh

`getOrderDetails(orderId, retries=2)` ([tab1-merge.js L28–L63](../../orders-report/js/tab1/tab1-merge.js)):

```
GET https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order({id})
    ?$expand=Details,Partner,User,CRMTeam
```
- Auth header từ `window.tokenManager.getAuthHeader()`
- Retry 2 lần **chỉ HTTP 502**, back-off `500ms * (attempt+1)`
- Fail cuối → trả `null` (không throw) → caller skip gracefully

Sau fetch → `calculateMergedProductsPreview()` ([tab1-merge.js L833](../../orders-report/js/tab1/tab1-merge.js)) → `renderMergeClusters()` ([L846](../../orders-report/js/tab1/tab1-merge.js)): render bảng `[Sau khi gộp | STT n | STT m | STT k (Đích)]`.

---

## 4. Select / Confirm

- **"Chọn tất cả"**: `toggleSelectAllMergeClusters()` ([L1136–L1154](../../orders-report/js/tab1/tab1-merge.js)) — toggle `.selected` + add/remove `selectedMergeClusters: Set`
- **Indeterminate**: `updateMergeSelectAllCheckbox()` ([L1159–L1174](../../orders-report/js/tab1/tab1-merge.js))
- **Xác nhận Gộp Đơn**: `confirmMergeSelectedClusters()` ([L1199–L1345](../../orders-report/js/tab1/tab1-merge.js)) — validate size > 0 → confirm dialog → loop từng cluster

---

## 5. Merge một cluster

`executeMergeOrderProducts(mergedOrder)` ([tab1-merge.js L253–L474](../../orders-report/js/tab1/tab1-merge.js))

### 5.1 Lock (chống race đa-tab)
`acquireMergeLock(targetId)` / `releaseMergeLock(targetId)` ([L233–L246](../../orders-report/js/tab1/tab1-merge.js)) — keyed by target order id qua `window._mergeInProgress`. Tab thứ 2 nhận lỗi: "Đơn đích STT … đang được gộp (tab khác?)".

### 5.2 Re-fetch full order (tránh stale data)
Target + sources → `getOrderDetails()` (snapshot mới ngay trước PUT).

### 5.3 Merge Details
- Map theo `ProductId`; cùng → **cộng Quantity** (cap 999999)
- Product không có `ProductId` → synthetic key `_noid_${index}`
- Giá giữ của target; note source append nếu chưa có
- `TotalAmount = Σ(Price × Quantity)`; `TotalQuantity = Σ Quantity`

### 5.4 PUT target rồi clear sources
`updateOrderWithFullPayload(orderData, newDetails, totalAmount, totalQuantity, retries=2)` ([L75](../../orders-report/js/tab1/tab1-merge.js)):

```
PUT https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order({id})
Headers:
  Authorization, Content-Type: application/json
  If-Match: W/"<RowVersion>"   // optimistic lock nếu có RowVersion
Body: { "@odata.context": "...SaleOnline_Order(Details(),Partner(),User(),CRMTeam())/$entity",
        Id, Details, TotalAmount, TotalQuantity, RowVersion, ... }
```

- Retry **chỉ 502/503/504**; **không retry** 400/409/412
- Source clear = gọi `updateOrderWithFullPayload(src, [], 0, 0)`
- **Partial success**: target OK, source clear FAIL → `{partial: true, sourceClearResults[]}` → UI cảnh báo *"sản phẩm có thể bị trùng"*

### 5.5 Lỗi 412 concurrency
Đơn bị sửa bởi user khác giữa fetch và PUT → không retry → user reload lại.

---

## 6. Gán Tag XL sau khi gộp (NGHIỆP VỤ MỚI)

> **Quan trọng (refactor 2026-04-22)**:
> - **Bỏ hoàn toàn `assignTagsAfterMerge()`** — không còn gọi OData `TagSaleOnlineOrder/AssignTag` trực tiếp từ flow gộp.
> - Chỉ tag mới được tạo là **`"Gộp {STT1} {STT2} … {STTn}"`** dạng **custom flag** ở cột Tag XL — gán cho **target + tất cả source**.
> - **"ĐÃ GỘP KO CHỐT"** cho source giữ cơ chế cũ: `category=3, subTag=DA_GOP_KHONG_CHOT` (không tạo custom flag cùng tên).
> - `syncXLToTPOS` giữ nguyên → flag "Gộp X Y Z" **sẽ** xuất hiện trên TPOS qua pipeline XL→TPOS (không phải do code merge gọi tạo trực tiếp).

### 6.1 Tag duy nhất cần tạo

| Label | Gắn cho | Lưu ở đâu |
|---|---|---|
| `Gộp {STT1} {STT2} …` (VD `Gộp 5 8 12`) | **target + tất cả source** | Custom Flag ở cột Tag XL (global scope) |

STT list: `[target, ...sources].map(o => o.SessionIndex).sort((a,b) => a-b)`.

**Helper**: `ensureMergeCustomFlag(label)` ([tab1-processing-tags.js](../../orders-report/js/tab1/tab1-processing-tags.js), gần `saveCustomFlagDefinitions`) — idempotent theo label (case-insensitive) + lock theo label tránh race. Expose qua `window.ensureMergeCustomFlag`.

### 6.2 Loại trừ khi thu thập tag source → target

| Loại | Chuyển? | Ghi chú |
|---|---|---|
| `category` (0–4) | ❌ | Target giữ nguyên; source sẽ set = 3 |
| `subTag`, `subState` | ❌ | Phụ thuộc category |
| Flag label = `ĐÃ GỘP KO CHỐT` | ❌ | Phòng runs cũ còn custom flag cùng tên |
| Flag label prefix `Gộp ` | ❌ | Từ các lần gộp trước |
| Flag khác (preset/custom) | ✅ | Chuyển |
| tTags (`T_MY`, `T1`, …) | ✅ | Chuyển |

Helper detect trong `assignTagXLAfterMerge`:
```js
const isMergeRelatedFlag = (f) => {
    const label = String(f?.label || f?.name || '').trim().toLowerCase();
    if (!label) return false;
    if (label === 'đã gộp ko chốt') return true;
    if (/^gộp\s+/i.test(label)) return true;
    return false;
};
```

### 6.3 Các bước trong `assignTagXLAfterMerge(cluster)`

File: [tab1-merge.js](../../orders-report/js/tab1/tab1-merge.js) (function ~L2157)

1. **Ensure flag "Gộp X Y Z"** qua `ensureMergeCustomFlag(groupLabel)`
2. **Thu thập** flags + tTags từ source orders (filter `isMergeRelatedFlag`)
3. **Add** flags/tTags thu thập vào target (`toggleOrderFlag` / `assignTTagToOrder`, idempotent)
4. **Add** flag `"Gộp X Y Z"` vào target
5. **Với mỗi source**:
   - 5a. Remove transferred flags (`toggleOrderFlag` toggle)
   - 5b. Remove transferred tTags (`removeTTagFromOrder`)
   - 5c. `assignOrderCategory(code, 3, {subTag: 'DA_GOP_KHONG_CHOT'})` — preserves existing flags
   - 5d. Add flag `"Gộp X Y Z"` vào source
6. `renderPanelContent()` refresh panel

### 6.4 Functions dùng từ Processing Tags module

| Function | File:Line | Role |
|---|---|---|
| `ensureMergeCustomFlag(label)` | [tab1-processing-tags.js ~L676](../../orders-report/js/tab1/tab1-processing-tags.js) | Tạo/lookup custom flag idempotent theo label |
| `assignOrderCategory(code, cat, {subTag, source})` | [tab1-processing-tags.js L843–L919](../../orders-report/js/tab1/tab1-processing-tags.js) | Set category + subTag (preserves flags) |
| `toggleOrderFlag(code, flagId, source)` | [tab1-processing-tags.js ~L927](../../orders-report/js/tab1/tab1-processing-tags.js) | Toggle flag (add/remove) |
| `assignTTagToOrder(code, tagId, source)` | [tab1-processing-tags.js ~L1030](../../orders-report/js/tab1/tab1-processing-tags.js) | Add tTag (idempotent dedup) |
| `removeTTagFromOrder(code, tagId, source)` | [tab1-processing-tags.js ~L1063](../../orders-report/js/tab1/tab1-processing-tags.js) | Remove 1 tTag |

### 6.5 Deprecated (giữ source, không invoke)

- `assignTagsAfterMerge(cluster)` ([tab1-merge.js L2033](../../orders-report/js/tab1/tab1-merge.js)) — comment `// DEPRECATED 2026-04-22`
- `ensureMergeTagExists`, `queryTPOSTagByName`, `assignTagsToOrder` (TPOS tag helpers)
- Constants `MERGED_ORDER_TAG_NAME`, `MERGE_TAG_COLOR`

### 6.6 Mark InvoiceStatusStore (không đổi)

`markSourceOrdersMergeCancelled(sourceIds)` → set `IsMergeCancel = true` trong `InvoiceStatusStore` (sync về Firestore `invoice_status_v2` theo pattern ở [CLAUDE.md](../../CLAUDE.md) · DATA SYNC).

---

## 7. Lịch sử (nút "Lịch sử")

| Hàm | File:Dòng | Vai trò |
|---|---|---|
| `saveMergeHistory(cluster, result, errorResponse?)` | [tab1-merge.js L1393–L1478](../../orders-report/js/tab1/tab1-merge.js) | Lưu Firestore sau mỗi lần gộp (success & failed) |
| `loadMergeHistory()` | [tab1-merge.js L1483–L1510](../../orders-report/js/tab1/tab1-merge.js) | Query top 100 theo `timestamp DESC` |
| `showMergeHistoryModal()` | [tab1-merge.js L1515–L1560](../../orders-report/js/tab1/tab1-merge.js) | Render collapsible entries |

- **Collection**: `merge_orders_history` (Firestore, `window.db`)
- **Snapshot pre-merge**: `sourceOrders[]` + `targetOrder` kèm `originalTags[]`, `products[]` — phục vụ audit/khôi phục thủ công
- **Không có undo tự động**

---

## 8. Flow tổng thể

```
click #mergeProductsBtn
 └─ showMergeDuplicateOrdersModal()
     ├─ group displayedData theo normalizeMergePhone()
     ├─ loop batch 5 đơn → getOrderDetails()  (progress: "Đang tải chi tiết x/y...")
     ├─ calculateMergedProductsPreview()
     └─ renderMergeClusters()
        │
        │ user tick checkbox → "Xác nhận Gộp Đơn"
        ▼
 confirmMergeSelectedClusters()
 └─ for each cluster:
     ├─ executeMergeOrderProducts()                   // merge products trên TPOS
     │   ├─ acquireMergeLock(targetId)
     │   ├─ re-fetch target + sources (TPOS)
     │   ├─ merge Details theo ProductId
     │   ├─ PUT target (RowVersion → If-Match)
     │   ├─ PUT clear mỗi source
     │   └─ releaseMergeLock()
     ├─ saveMergeHistory()                             // Firestore
     ├─ assignTagXLAfterMerge()                        // TAG XL ONLY
     │   ├─ ensureMergeCustomFlag('Gộp 5 8 12')
     │   ├─ collect transferable flags+tTags từ source (loại Cat/subCat/"ĐÃ GỘP…"/"Gộp …")
     │   ├─ add into target (toggleOrderFlag / assignTTagToOrder)
     │   ├─ add "Gộp 5 8 12" vào target
     │   └─ for each source:
     │       ├─ remove transferred flags+tTags
     │       ├─ assignOrderCategory(3, DA_GOP_KHONG_CHOT)
     │       └─ add flag "Gộp 5 8 12"
     ├─ markSourceOrdersMergeCancelled()               // InvoiceStatusStore v2
     └─ sleep 500ms
 └─ fetchOrders() + renderTable() + updateStats()
```

> **Side-effect**: mỗi `toggleOrderFlag` / `assignOrderCategory` / `assignTTagToOrder` trigger `syncXLToTPOS` ([tab1-tag-sync.js L368–L448](../../orders-report/js/tab1/tab1-tag-sync.js)) → flag "Gộp 5 8 12" tự push sang TPOS dưới dạng TPOS tag (tên tag = label). **Behavior chấp nhận** — không blacklist.

---

## 9. Edge cases / gotchas

1. **Partial success** — target PUT OK, source clear FAIL → products bị nhân đôi. UI cảnh báo; user kiểm tra/retry thủ công.
2. **HTTP 412 concurrency** — không retry; user reload.
3. **Multi-tab race** — `_mergeInProgress` lock theo target id.
4. **Phone normalization fail-safe** — 9–12 digit, loại `"0"`/`"000"`.
5. **ProductId = null** → synthetic key `_noid_${index}`.
6. **Không cache fetch** — mỗi lần mở modal fetch lại TPOS (106 orders ≈ 22 batch × 300ms ≈ 6.6s).
7. **Prefix `Gộp `** — tránh tích luỹ tag rác qua nhiều lần gộp.
8. **syncXLToTPOS side-effect** — flag "Gộp X Y Z" auto push sang TPOS; user đã OK.
9. **Batch save performance** — mỗi cluster ~(1 + nSources × ~4 + flags_moved × 2 + tTags_moved × 2) lần toggle. `queueProcessingTagSave` batch 500ms OK. Theo dõi `syncXLToTPOS` xem có rate limit.
10. **Race `ensureMergeCustomFlag`** — có lock theo `normLabel` (`Map<label, Promise<flagDef>>`).
11. **`assignOrderCategory` preserves flags** ([tab1-processing-tags.js L843–L919](../../orders-report/js/tab1/tab1-processing-tags.js)) → step 5c → 5d thứ tự an toàn.

---

## 10. Files để đọc khi debug

- [orders-report/js/tab1/tab1-merge.js](../../orders-report/js/tab1/tab1-merge.js) — merge logic
- [orders-report/js/tab1/tab1-processing-tags.js](../../orders-report/js/tab1/tab1-processing-tags.js) — Tag XL core + `ensureMergeCustomFlag`
- [orders-report/js/tab1/tab1-tag-sync.js](../../orders-report/js/tab1/tab1-tag-sync.js) — XL↔TPOS sync
- [orders-report/tab1-orders.html](../../orders-report/tab1-orders.html) — modal markup
- [orders-report/tab1-orders.css](../../orders-report/tab1-orders.css) — styles
- [orders-report/docs/MERGE_ORDERS_MODAL_GUIDE.md](../../orders-report/docs/MERGE_ORDERS_MODAL_GUIDE.md) — guide UI/state cũ
- [docs/architecture/DATA-SYNCHRONIZATION.md](../architecture/DATA-SYNCHRONIZATION.md) — Firestore sync
- [docs/tpos/TposWebsite.md](../tpos/TposWebsite.md) — TPOS endpoints (CLAUDE.md bắt buộc đọc)
