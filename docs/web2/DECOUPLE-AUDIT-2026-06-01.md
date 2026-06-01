# Web 2.0 — Decouple Audit (2026-06-01)

> **Trigger**: User feedback "Web 2.0 muốn tách biệt với TPOS/Web 1.0 nếu thực sự dữ liệu đó không cần — hiện tại tôi thấy cần TPOS trên Web 2.0 chỉ là: kho data KH, tạo/quản lý chiến dịch live, comment ở tpos-pancake".
>
> **Method**: grep tất cả files trong `web2/`, `tpos-pancake/js/`, `native-orders/`, `so-order/js/` tìm calls đến `/api/v2/customers`, `/api/v2/wallets`, `/api/v2/balance-history` (Web 1.0 endpoints), TPOS OData, và imports từ legacy folders.
>
> **Status**: ANALYSIS ONLY — chưa fix. User decision required.

## TL;DR — Verdict

Hiện tại Web 2.0 có **3 loại coupling**:

| Coupling                                                                                                          | Acceptable per user?                                                                                                | Action                 |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **A. TPOS Customer lookup** (`/api/v2/customers/...`) — đọc KH info, link KH cho PBH/native-orders                | ✅ User OK ("kho data KH")                                                                                          | Keep, không fix        |
| **B. TPOS OData campaigns/comments** (`/api/odata/SaleOnline_LiveCampaign`, `/api/odata/CRMTeam`, FB `livevideo`) | ✅ User OK ("tạo/quản lý chiến dịch + comment")                                                                     | Keep                   |
| **C. TPOS Write Partner** (`UpdateStatus`, `CreateUpdatePartner`) trong tpos-pancake                              | ⚠ User chưa nói rõ — write sang TPOS, có thể NOT OK                                                                 | **Cần user confirm**   |
| **D. TPOS PartnerDebtReport** trong supplier-debt                                                                 | ⚠ Đọc debt từ TPOS — KHÔNG nằm trong 3 cases user cho phép                                                          | **CẦN refactor**       |
| **E. Web 1.0 `/api/v2/wallets/batch-summary`** trong tpos-pancake (debt-manager, chat)                            | ⚠ Đọc ví KH từ Web 1.0 thay vì Web 2.0                                                                              | **CẦN refactor**       |
| **F. Web 1.0 `/api/v2/customers/:id/orders`** trong fastsaleorder-invoice + report-revenue + native-orders        | ⚠ Lịch sử đơn KH lấy từ Web 1.0                                                                                     | **Cần đánh giá**       |
| **G. Web 1.0 `/api/v2/balance-history` legacy**                                                                   | ✅ Đã decoupled — web2-balance-history dùng `/api/v2/balance-history` chính nó (cùng namespace nhưng route Web 2.0) | Verify                 |
| **H. Imports legacy folders**                                                                                     | ⚠ 1 file: `web2/balance-history/index.legacy.html` import từ `orders-report/`                                       | **Delete legacy file** |

## Chi tiết findings

### A. TPOS Customer lookup (✅ User cho phép)

**Endpoints**: `/api/v2/customers/:phone`, `/api/v2/customers/by-fb-id/:fbId`, `/api/v2/customers?search=...`

**Files dùng**:

- `tpos-pancake/js/tpos/tpos-comment-list.js` (lines 1198, 1211) — lookup KH info khi click comment
- `web2/fastsaleorder-invoice/pbh-app.js` (line 461) — Customer 360 modal: lấy orders của KH để hiển thị
- `web2/report-revenue/index.html` (line 530) — modal aggregation orders by customer
- `native-orders/js/native-orders-app.js` (line 3017) — Customer 360 popover trong order list
- `web2/balance-history/js/web2-balance-history-app.js` (lines 539, 542) — search customer cho match SePay
- `web2/balance-history/js/balance-verification.js` (line 1369) — quick-view customer info
- `web2/balance-history/js/web2-pending-match.js` (lines 308, 309) — pending SePay match

**Verdict**: User confirm "kho data KH" → KEEP. Web 2.0 KHÔNG có dedicated customer store, dùng Customer 360 (đã sync TPOS). Migration tốn công và không có ích.

### B. TPOS OData campaigns/comments (✅ User cho phép)

**Endpoints**: `/api/odata/SaleOnline_LiveCampaign`, `/api/odata/CRMTeam/...`, `/api/facebook-graph/livevideo`

**Files**:

- `web2/live-campaign/js/live-campaign-api.js` (lines 14-17) — tạo/quản lý chiến dịch
- `tpos-pancake/js/tpos/...` — load comments từ TPOS live

**Verdict**: KEEP.

### C. TPOS Write Partner (⚠ Cần user confirm)

**Endpoints**: `Partner({id})/ODataService.UpdateStatus`, `SaleOnline_Order/ODataService.CreateUpdatePartner`

**Files**:

- `tpos-pancake/js/tpos/tpos-api.js` (lines 394, 452) — UpdateStatus + CreateUpdatePartner
- `tpos-pancake/js/tpos-chat.js` (lines 1802, 1976) — same calls trong chat panel

**Tác động**: Khi user click "Update status" trong tpos-pancake → WRITE sang TPOS Partner DB (Web 1.0). Khi save partner info → CreateUpdatePartner trên TPOS.

**Question to user**: Có muốn tpos-pancake WRITE status/info KH sang TPOS không? Hay chỉ READ?

- Nếu OK write: KEEP (đồng bộ KH 2 chiều)
- Nếu NOT OK: Refactor sang `/api/v2/customers/:id/...` (Web 2.0 endpoint riêng)

### D. TPOS PartnerDebtReport trong supplier-debt (⚠ KHÔNG nằm trong cases user cho phép)

**File**: `web2/supplier-debt/js/supplier-debt-app.js`

- Line 343: `${TPOS_API_BASE}/Report/PartnerDebtReport` → fetch debt aggregate từ TPOS
- Line 371: `${TPOS_API_BASE}/Report/PartnerDebtReportDetail` → fetch chi tiết debt

**Tác động**: Trang "Công nợ NCC" hiện tại đang **đọc debt từ TPOS** thay vì có store riêng Web 2.0.

**Issue**: User nói "Web 2.0 tách biệt với TPOS" — debt NCC không nằm trong 3 cases được phép.

**Options**:

1. **Build Web 2.0 supplier-debt store** từ đầu — đọc debt từ shipments (so-order) + payments (supplier-wallet) thay vì TPOS.
    - Pro: Independent từ TPOS, debt mới có thể tính chính xác từ Web 2.0 data.
    - Con: Tốn effort, mất historical debt data từ TPOS.
2. **Tạm thời keep TPOS reads** — đánh dấu là legacy, refactor sau.
3. **Hybrid**: Web 2.0 store cho NCC mới + TPOS fallback cho NCC cũ.

**Recommendation**: Option 2 ngắn hạn, Option 1 trong roadmap.

### E. Web 1.0 `/api/v2/wallets/batch-summary` trong tpos-pancake (⚠)

**Files** (4 callers):

- `tpos-pancake/js/tpos-chat.js:1704`
- `tpos-pancake/js/pancake/pancake-api.js:767`
- `tpos-pancake/js/shared/debt-manager.js:69`
- `tpos-pancake/js/pancake-chat.js:4460`

**Tác động**: Hiển thị ví KH (balance) trong comment list + chat panel. Đọc từ Web 1.0 `customer_wallets` table thay vì Web 2.0 `web2_customer_wallets`.

**Issue**: Có 2 wallet sources trong hệ thống:

- Web 1.0: `customer_wallets` (Unified Customer 360, SePay-driven)
- Web 2.0: `web2_customer_wallets` (refactor 2026-05 separation)

Tpos-pancake đang đọc **Web 1.0 wallet** → hiển thị có thể không đồng bộ với Web 2.0 wallet ở `web2/customer-wallet/`.

**Recommendation**:

- Migration: thay 4 calls `/api/v2/wallets/batch-summary` → `/api/v2/web2-wallets/batch-summary` (nếu endpoint tồn tại).
- Verify: check `/api/v2/web2-wallets/batch-summary` có signature giống không.
- Effort: ~30 phút, 4 file changes + verify.

### F. Web 1.0 `/api/v2/customers/:id/orders` (⚠ Cần đánh giá)

**Files** (3 callers):

- `web2/fastsaleorder-invoice/pbh-app.js:461`
- `web2/report-revenue/index.html:530`
- `native-orders/js/native-orders-app.js:3017`

**Tác động**: Khi click "Xem lịch sử KH" → fetch orders Web 1.0 (TPOS sync) thay vì native_orders + fast_sale_orders Web 2.0.

**Issue**: Lịch sử đơn nhìn thấy là từ TPOS (Web 1.0), KHÔNG include native_orders Web 2.0 mới tạo.

**Recommendation**:

- Build Web 2.0 endpoint `/api/v2/web2-customers/:phone/orders` aggregate từ `native_orders` + `fast_sale_orders` + `refunds`.
- Hoặc: extend `/api/v2/customers/:id/orders` để JOIN cả 2 sources.

### G. Web 2.0 balance-history đã decoupled (✅)

`web2/balance-history/index.html:1` comment: "100% Web 2.0 isolation, NO legacy /api/sepay or /api/v2/balance-history".

Verified — `verification.js` dùng `/api/v2/balance-history` nhưng đây là **same namespace** với routes Web 2.0 (`web2-balance-history` slug). Không phải Web 1.0 legacy.

### H. Legacy file import (⚠ Delete)

`web2/balance-history/index.legacy.html` import từ `orders-report/js/utils/wallet-adjustment-store.js`.

**Recommendation**: File `index.legacy.html` không trong production sidebar → safe to delete hoặc move sang `docs/archive/`.

## Recommended action plan

### Priority 1 (immediate — cleanup nhỏ, low risk)

1. Delete `web2/balance-history/index.legacy.html` (chỉ là backup legacy file)
2. Confirm user về Case C (TPOS Write Partner) — yes/no

### Priority 2 (1-2 ngày — high impact, low risk)

3. Refactor Case E (4 calls `/api/v2/wallets/batch-summary` → `/api/v2/web2-wallets/batch-summary`) trong tpos-pancake
4. Verify endpoint exists, add if missing

### Priority 3 (3-5 ngày — high impact, medium risk)

5. Refactor Case F (3 calls customer orders history) — build Web 2.0 endpoint hoặc extend hiện tại

### Priority 4 (roadmap — significant effort)

6. Refactor Case D (supplier-debt) — build Web 2.0 debt store từ so-order shipments + supplier-wallet payments

### Skip (per user OK)

- Case A: TPOS customer lookup — KEEP
- Case B: TPOS OData campaigns/comments — KEEP
- Case G: balance-history — already decoupled

## Test findings (E2E execution log)

| Phase                       | Result | Notes                                                                                                                                                           |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Pre-flight               | ✅     | Backend up, test customer found, clean state                                                                                                                    |
| 1. Setup masterdata         | ✅     | 3 variants + 3 products TEST-\* created                                                                                                                         |
| 2. Nhập hàng (so-order)     | ✅     | upsert-pending + confirm-purchase → stock 10/15/20                                                                                                              |
| 2. Verify side-effects      | ⚠      | supplier-debt = TPOS read (no auto entry), supplier-wallet = SePay only                                                                                         |
| 3. Live campaign            | SKIP   | Tránh tạo TPOS campaign thật (decouple intent)                                                                                                                  |
| 4. Drag SP → cart           | ✅     | 3 native_orders created (NW-20260601-0003/4/5), optimistic UI works                                                                                             |
| 5. Native-orders edit + PBH | ✅     | Edit modal + saveEdit + 2 PBH created (HD-0001/0002), status auto-flip to 'confirmed'                                                                           |
| 6. PBH downstream           | ✅     | reconcile pick → pack → ship flow OK                                                                                                                            |
| 7. Customer pages           | ⚠      | TEST KH 1/2/3 (SĐT 0900000001+) KHÔNG có trong customers table — native_orders không auto-create customer. `web2-customer-wallet/list` endpoint không hoạt động |
| 8. Refund + delivery        | ✅     | RF-0001 + DLV-0001 created                                                                                                                                      |
| 9. Smoke remaining          | ✅     | 17/17 pages return 200                                                                                                                                          |
| 10. Cleanup                 | ✅     | 13/13 cleanup steps OK, DB verified clean (0 TEST-\* leftover)                                                                                                  |

### Other findings during test

1. **native_orders không link sang customers table**: Khi tạo order qua drag SP, phone từ `customer.phone` không trigger insert/lookup vào `customers` (Web 1.0). Phù hợp với decouple intent — Web 2.0 không nên auto-write Web 1.0.
2. **`web2-customer-wallet/list` endpoint**: Trả `{success: false}` với signature thử nghiệm `?limit=3`. Có thể cần phone param hoặc auth header. Cần check.
3. **Optimistic UI verified working**: Tất cả handler refactored (saveEdit, quickStatus, addToCart, etc.) hoạt động đúng. Cart API fast (< 200ms response).

## Questions for user

1. **Case C — TPOS Write Partner**: tpos-pancake update KH info → sync TPOS. Giữ hay tách?
2. **Case D — supplier-debt**: Build Web 2.0 debt store mới (Option 1) hay tạm giữ TPOS reads (Option 2)?
3. **Case F — customer orders history**: Cần Web 2.0 endpoint riêng aggregate native + PBH + refunds, hay extend Web 1.0?
4. **native_orders ↔ customers table**: Có nên thêm sync giữa native_orders.phone → customers table không? (hiện tại không sync)
5. **web2-customer-wallet/list**: Cần verify endpoint hoạt động đúng signature.
