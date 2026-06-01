# Web 2.0 — End-to-End Test Plan

> **Date**: 2026-06-01
> **Triggered by user**: "Plan test lại Web 2.0 — flow đầy đủ từ nhập hàng đến PBH/refund/delivery"
> **Status**: In progress

## Mục tiêu

Test flow business đầy đủ Web 2.0 với **dữ liệu giả lập** (TEST-\* prefix), verify mọi page hoạt động đúng + side-effects giữa các module + cleanup sau khi xong.

## Test data convention (per CLAUDE.md + MEMORY rule)

| Loại                | Convention                                              | Lý do                                    |
| ------------------- | ------------------------------------------------------- | ---------------------------------------- |
| Customer test       | `Huỳnh Thành Đạt — 0123456788` (đã có sẵn DB)           | Default test customer cho mọi flow       |
| Customer phụ        | SĐT `0900000001` → `0900000009`                         | Multi-customer scenarios                 |
| Supplier (NCC)      | `TEST-NCC-AUTO`                                         | Easy filter cleanup                      |
| Product code        | `TEST-AO-001`, `TEST-QUAN-001`, `TEST-DAM-001`          | Easy filter cleanup                      |
| Variant             | `TEST-Size-M`, `TEST-Size-L`, `TEST-Size-S`             | Easy filter cleanup                      |
| Order code (native) | Auto-gen `NW-YYYYMMDD-N` nhưng product có `TEST-*` code | Filter qua product code                  |
| PBH number          | Auto-gen                                                | Tracking qua source native_order TEST-\* |
| Campaign            | `TEST-CAMPAIGN-AUTO` name + fake `Facebook_LiveId`      | Filter cleanup                           |

## Phases & flow

### Phase 0 — Pre-flight checks (non-destructive)

- ✅ Backend Render up: `GET /api/native-orders/health`
- ✅ TPOS access token valid: `GET /api/v2/odata-headers/check`
- ✅ Test customer `0123456788` tồn tại trong customers
- ✅ Cleanup any leftover TEST-\* data từ prior runs (idempotent)
- ✅ Persistent browser session active + auth restored

### Phase 1 — Setup masterdata (lightweight inserts)

**Page**: web2/variants, web2/products

- Create 3 variants: `TEST-Size-M`, `TEST-Size-L`, `TEST-Size-S`
- Create 1 supplier (chỉ là tag, không có DB table riêng — gắn vào product.supplier)
- Create 3 products:
    - `TEST-AO-001` / supplier=TEST-NCC-AUTO / variant=Size M / buy 100k / sell 200k / stock 0
    - `TEST-QUAN-001` / supplier=TEST-NCC-AUTO / variant=Size L / buy 150k / sell 300k / stock 0
    - `TEST-DAM-001` / supplier=TEST-NCC-AUTO / variant=Size S / buy 80k / sell 180k / stock 0

**Verify**:

- web2/products: 3 SP TEST-\* hiển thị, isActive=true, stock=0
- web2/variants: 3 variant TEST-Size-\* hiển thị

### Phase 2 — Nhập hàng (so-order)

**Page**: so-order (root), interacts với supplier-debt, supplier-wallet, balance-history, products

**Steps**:

1. Mở `so-order/`, chọn/tạo tab `TEST-NCC-AUTO`
2. Add row: TEST-AO-001 × 10
3. Add row: TEST-QUAN-001 × 15
4. Add row: TEST-DAM-001 × 20
5. Set thanh toán CK 100% (1,000,000 + 2,250,000 + 1,600,000 = 4,850,000đ)
6. Save shipment → status='pending_receive', stock pending +10/+15/+20 trên products
7. **Verify pending state**:
    - web2/products: cột "Chờ về" = 10/15/20
    - so-order: row.status = pending
8. User click "Đã nhận" trên từng row
9. **Verify confirmed state**:
    - web2/products: stock = 10/15/20, "chờ về" = 0
    - supplier-debt: TEST-NCC-AUTO có entry +4,850,000đ
    - supplier-wallet: TEST-NCC-AUTO balance change
    - balance-history (SePay): entry CK -4,850,000đ (nếu có)

### Phase 3 — Tạo Chiến dịch Live

**Page**: web2/live-campaign

**Steps**:

1. Create campaign "TEST-CAMPAIGN-AUTO" với fake Facebook*LiveId = "fake_live_test*<ts>"
2. Page = NhiJudy Store (page chính)

**Verify**:

- live-campaign list: hiển thị campaign mới
- tpos-pancake selector: thấy "TEST-CAMPAIGN-AUTO" trong dropdown

### Phase 4 — Livestream comments + drag SP

**Page**: tpos-pancake

**Limitation**: KHÔNG có FB live thực → simulate comments qua TposState injection (xem session script pattern).

**Steps**:

1. Chọn campaign TEST-CAMPAIGN-AUTO
2. Inject 3 fake comments:
    - cid=TEST_CMT_001, customer="Huỳnh Thành Đạt" (`fb_id=test_fb_dat`), msg="lấy 1 cái áo size M"
    - cid=TEST_CMT_002, customer="Test KH 2" (`fb_id=test_fb_002`), msg="2 cái quần size L"
    - cid=TEST_CMT_003, customer="Test KH 3" (`fb_id=test_fb_003`), msg="3 cái đầm + 1 áo"
3. Drag TEST-AO-001 vào TEST_CMT_001
4. Drag TEST-QUAN-001 × 2 (drop 2 lần) vào TEST_CMT_002
5. Drag TEST-DAM-001 × 3 + TEST-AO-001 × 1 vào TEST_CMT_003

**Verify**:

- 3 đơn native_orders tự tạo
- Badge "🛒 N" hiện trên mỗi comment row
- Optimistic UI: badge appears trước khi backend response

### Phase 5 — Native-orders edit + PBH + KPI

**Page**: native-orders

**Steps**:

1. Open order của KH "Huỳnh Thành Đạt" (TEST_CMT_001)
2. Sửa: thêm SDT 0123456788, địa chỉ "123 Test Street", note "Test note"
3. Tăng qty TEST-AO-001 từ 1 → 2
4. Save → optimistic UI close modal NGAY
5. **Verify**: row update đúng customer + qty
6. Click "Tạo PBH" trên order
7. **Verify**: status='confirmed', PBH number generated
8. Open KPI page → check user attribution
9. (Optional) test range assignment in campaign settings

### Phase 6 — PBH downstream

**Pages**: fastsaleorder-invoice, reconcile, balance-history

**Steps**:

1. Mở fastsaleorder-invoice → thấy PBH mới
2. Mở reconcile → quét packlist → pack đơn → ship
3. balance-history: customer 0123456788 → ví có entry payment

### Phase 7 — Customer pages

**Pages**: partner-customer, customer-wallet

**Steps**:

1. partner-customer search "0123456788" → thấy "Huỳnh Thành Đạt" + history orders
2. customer-wallet search "0123456788" → balance + recent transactions

### Phase 8 — Refund + delivery

**Pages**: fastsaleorder-refund, fastsaleorder-delivery

**Steps**:

1. fastsaleorder-refund: tạo phiếu trả 1 SP từ PBH ở Phase 5 → approve → complete
2. fastsaleorder-delivery: tạo phiếu giao từ PBH → ship → deliver

### Phase 9 — Smoke remaining pages

Read-only verify (page load + no console errors):

- dashboard, kpi, notifications, audit-log
- supplier-aging, supplier-360, inventory-forecast
- smart-match, report-revenue, report-delivery
- bulk-import, print-export, admin-sse-monitor
- users, users-permissions, pancake-settings, services-dashboard, overview

### Phase 10 — Cleanup (BẮT BUỘC)

Xóa hết TEST-\* data theo thứ tự (FK aware):

1. delivery-invoices từ PBH TEST → DELETE
2. refunds từ PBH TEST → DELETE
3. reconcile state cho PBH TEST → reset
4. fast-sale-orders (PBH) từ native_orders TEST → DELETE
5. native_orders có products[*].productCode LIKE 'TEST-%' → DELETE
6. supplier-debt entries có code LIKE 'TEST-%' → DELETE
7. supplier-wallet entries cho TEST-NCC-AUTO → DELETE
8. balance-history entries CK 4,850,000đ TEST → DELETE
9. so-order shipment TEST → DELETE
10. live-campaign "TEST-CAMPAIGN-AUTO" → DELETE
11. web2_products code LIKE 'TEST-%' → DELETE
12. web2_variants value LIKE 'TEST-Size-%' → DELETE
13. Verify cleanup: count rows với TEST-% prefix = 0 across tất cả tables

## Verify thành công

- ✅ Không có TEST-\* leftover trong DB sau cleanup
- ✅ Mọi page load không console errors
- ✅ Optimistic UI works trên tất cả handlers refactored (xem `docs/web2/UI-FIRST.md`)
- ✅ Side-effects giữa modules đúng (nhập hàng → stock, PBH → wallet, refund → undo)
- ✅ Báo cáo cuối với issues found + recommendations

## Risk mitigation

- ❗ **Real-time concerns**: Test có thể trigger SSE events sang tab user khác đang mở → user thấy entries TEST. Mitigation: notify user trước.
- ❗ **Balance history**: nếu test trigger entry SePay thật → cần manual cleanup. Mitigation: KHÔNG tạo real SePay tx; chỉ test ví transfer nội bộ.
- ❗ **TPOS sync cron**: Có thể sync TEST orders sang TPOS prod nếu cron chạy. Mitigation: kiểm tra cron disabled hoặc filter TEST- prefix.

## Execution log

Sẽ update trong từng phase.
