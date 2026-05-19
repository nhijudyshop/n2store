# Web 2.0 — QA Test Plan (End-to-End Cross-Page Verification)

> Plan test toàn bộ 16 pages Web 2.0 chính + cross-page flows. Mục tiêu: verify SSE realtime + data flow + UI consistency thực sự work trong production.
>
> **Approach**: chậm rãi, từng scenario, screenshot từng bước, document kết quả.

---

## 1. Test environment

### 1.1 Setup

- **Browser**: Persistent Playwright session `scripts/n2store-browser-session.js` (đã login `admin`/`admin@@`)
- **Base URL**: `http://localhost:8093` (tự spawn `python3 -m http.server 8093` qua `ensure-local-server.js`)
- **Cache bust**: append `?t=$(date +%s)` cho HTML khi nav
- **Production verify**: sau khi pass local → curl + browser test trên `https://nhijudyshop.github.io/n2store/...`

### 1.2 Test data (BẮT BUỘC theo MEMORY/CLAUDE.md rules)

- **Test customer mặc định**: `Huỳnh Thành Đạt — 0123456788` (đã có sẵn trong DB)
- **Test SĐT giả**: `0900000000`, `0900000001`, `0900000002`, … khi cần thêm khách
- **Test supplier code**: `TEST-NCC-001`, `TEST-NCC-002`
- **Test mã đơn / product code**: prefix `TEST-` (vd `TEST-20260519-001`) để dễ filter cleanup
- **KHÔNG dùng SĐT/order ID khách thật khác trong write tests**

### 1.3 Cleanup protocol

Sau mỗi scenario, ghi lại tất cả test records tạo (mã đơn / SP / supplier) để xóa sạch:

```bash
# SQL cleanup template (chạy cuối session test)
DELETE FROM web2_products WHERE code LIKE 'TEST-%';
DELETE FROM native_orders WHERE code LIKE 'TEST-%';
DELETE FROM fast_sale_orders WHERE number LIKE 'TEST-%' OR source_code LIKE 'TEST-%';
DELETE FROM web2_records WHERE code LIKE 'TEST-%';
DELETE FROM customer_wallet_transactions WHERE phone LIKE '09000000%';
```

---

## 2. Test scenarios — Per-page functional (Tier 1)

Smoke test từng page hoạt động độc lập. Mỗi scenario ~2-3 phút.

| #     | Page                                | Smoke checks                                                     |
| ----- | ----------------------------------- | ---------------------------------------------------------------- |
| T1.1  | `web2/products/`                    | Load list, search, filter active, page-builder render            |
| T1.2  | `web2/variants/`                    | Load list, filter group, search                                  |
| T1.3  | `web2/users/`                       | Load list, filter active, permission matrix dialog               |
| T1.4  | `so-order/`                         | Load tabs (HÀ NỘI, HƯƠNG CHÂU), shipment expand, row inline edit |
| T1.5  | `native-orders/`                    | Load orders list, filter status, search by phone                 |
| T1.6  | `web2/fastsaleorder-invoice/` (PBH) | Load PBH list, filter state, search                              |
| T1.7  | `web2/customer-wallet/`             | Load wallet cards, sort, search                                  |
| T1.8  | `web2/supplier-wallet/`             | Load wallet cards, sort, search                                  |
| T1.9  | `web2/supplier-debt/`               | Load debt report, date range, expand row                         |
| T1.10 | `web2/balance-history/`             | 4 tabs (Live Mode, Balance, Transfer Stats, Kế Toán)             |
| T1.11 | `web2/partner-customer/`            | Generic CRUD page-builder, list render                           |
| T1.12 | `web2/partner-supplier/`            | Same                                                             |
| T1.13 | `web2/delivery-carrier/`            | Same                                                             |
| T1.14 | `web2/product-category/`            | Same                                                             |
| T1.15 | `web2/live-campaign/`               | Same                                                             |
| T1.16 | `tpos-pancake/`                     | Sidebar pages list, WS status                                    |

---

## 3. Cross-page integration flows (Tier 2 — quan trọng nhất)

Đây là phần user yêu cầu chính. Mỗi flow test cascade qua nhiều pages.

### 🛒 Flow C1 — Sổ Order → Web2 Products (nhập hàng pending)

**Mục đích**: Verify khi tạo dòng SP mới trong Sổ Order, SP tự xuất hiện ở Kho SP với status `CHO_MUA` + `pending_qty`.

**Steps**:

1. Mở `so-order/` tab HÀ NỘI
2. Click "Tạo Đơn Hàng" → tạo shipment mới với ngày + đợt
3. Click "Thêm dòng" → nhập:
    - Supplier: `TEST-NCC-001`
    - Tên SP: `TEST-AO-T1`
    - Variant: pick từ kho (Size M)
    - SL: 5
    - Giá nhập: 100,000
4. Lưu nháp
5. **Verify ở Sổ Order**: row hiển thị đúng, badge "SP mới" hoặc "Đã có ở kho"
6. Mở tab MỚI: `web2/products/`
7. **Verify Kho SP**:
    - SP `TEST-AO-T1` xuất hiện trong list
    - Status badge: `CHỜ MUA`
    - `pending_qty: 5`, `stock: 0`
    - Supplier hiện `TEST-NCC-001`
8. **SSE check**: Browser DevTools → Network → EventSource → check event `web2:products` với action `upsert-pending` đã fire

### 🛍️ Flow C2 — Sổ Order "Mua hàng" → Web2 Products (confirm purchase)

**Mục đích**: Verify khi click "Mua hàng" trong Sổ Order, SP từ `CHO_MUA` → `DANG_BAN`, `stock += pending_qty`.

**Steps**:

1. Tiếp tục từ Flow C1 (SP `TEST-AO-T1` đang `CHO_MUA pending=5 stock=0`)
2. Mở `so-order/`, find row vừa tạo
3. Click button "Mua hàng" trên row (hoặc "Mua tất cả NCC")
4. Confirm modal "Mua hàng cho NCC TEST-NCC-001 — 5 SP"
5. **Verify ở Sổ Order**: row đổi status sang `DA_GOP_KHONG_CHOT` hoặc tương tự
6. Mở tab `web2/products/`
7. **Verify Kho SP**:
    - SP `TEST-AO-T1` status: `ĐANG BÁN`
    - `pending_qty: 0`, `stock: 5`
8. **SSE check**: event `web2:products` action `confirm-purchase` + cross-broadcast `web2:supplier-wallet`

### 💸 Flow C3 — Web2 Products edit qty → Sổ Order sync ngược

**Mục đích**: Verify khi edit pending_qty ở Kho SP, Sổ Order row tự update.

**Steps**:

1. SP `TEST-AO-T1` đang ở `pending_qty=5`
2. Mở `web2/products/` tab
3. Edit row → đổi `pending_qty` từ 5 → 3
4. Mở `so-order/` tab cùng SP
5. **Verify**: SL hiển thị 3 (sync 2-way qua `adjust-pending`)
6. **SSE check**: event flow 2 chiều

### 🗑️ Flow C4 — Web2 Products xóa SP có pending_qty > 0 → Cảnh báo + Sổ Order cleanup

**Mục đích**: Verify ghost cleanup logic.

**Steps**:

1. Tạo SP test `TEST-AO-T2` qua Sổ Order với pending=2
2. Mở `web2/products/`, click xóa SP đó
3. **Verify**: modal "409 pending_qty_not_zero" hiện, cảnh báo còn pending
4. Click "Xóa luôn" → force=1
5. Mở `so-order/`
6. **Verify**: row tương ứng bị xóa hoặc qty=0 (ghost cleanup pattern)

### 📦 Flow C5 — Native Orders → PBH (convert)

**Mục đích**: Verify chuyển Đơn Web sang Phiếu Bán Hàng.

**Steps**:

1. Mở `native-orders/`
2. Tìm khách test `0123456788` (Huỳnh Thành Đạt)
3. Click "Tạo Đơn Mới" với SP `TEST-AO-T1` × 2
4. Note mã đơn (vd `TEST-NO-001`)
5. Click button "Tạo PBH" (receipt icon) trên row
6. Verify modal confirm → OK
7. Mở `web2/fastsaleorder-invoice/`
8. **Verify**: PBH mới có `source_code = TEST-NO-001`
9. Quay lại `native-orders/`
10. **Verify**: Nếu đã wire A4 (defer) → có badge "→ PBH: HD-…" → SKIP nếu chưa wire
11. Click button "Xem đơn nguồn" (external-link icon) trong PBH row → mở native-orders với search filter

### ✅ Flow C6 — PBH Confirm → Customer Wallet (Phase A1 + B2)

**Mục đích**: Verify SSE cross-broadcast PBH → customer wallet.

**Steps**:

1. Mở `web2/customer-wallet/` tab (tab 1)
2. **Note**: tổng công nợ KH `0123456788` hiện tại
3. Mở tab MỚI `web2/fastsaleorder-invoice/` (tab 2)
4. Find PBH của KH `0123456788` (state `draft`)
5. Click button "Xác nhận" (check icon) → confirm
6. **Verify**: PBH state đổi sang `done`
7. Switch về tab 1 (`customer-wallet/`)
8. **Verify**: trong vòng 1-2 giây, công nợ KH tự cập nhật (KHÔNG click "Làm mới")
9. **SSE check**: DevTools Network → SSE stream từ `chatomni-proxy.../api/realtime/sse` có event `web2:customer-wallet` với action `confirm`

### 🏪 Flow C7 — Sổ Order shipment → Supplier Wallet (Ví NCC)

**Mục đích**: Verify supplier-wallet aggregate từ so_order shipments.

**Steps**:

1. Mở `so-order/` tab `HÀ NỘI`
2. Tạo shipment với NCC `TEST-NCC-001`, 3 dòng SP × 2 SL × 100k
3. Verify total HD = 600k
4. Mở `web2/supplier-wallet/` tab
5. **Verify**: NCC `TEST-NCC-001` xuất hiện trong list
6. Click vào card → mở detail
7. **Verify**: Tab "Đợt mua" hiển thị shipment vừa tạo với 600k

### 💰 Flow C8 — SePay webhook → Wallet + Balance History (manual trigger)

**Mục đích**: Verify pipeline SePay → walletEvents → SSE → wallet + balance-history.

**Steps**:

1. Mở `web2/customer-wallet/` tab 1
2. Mở `web2/balance-history/` tab 2 (Live Mode)
3. Note tổng số giao dịch hiện tại trong cả 2 trang
4. Trigger SePay test webhook qua curl:
    ```bash
    curl -X POST "https://chatomni-proxy.../api/sepay/webhook" \
      -H "Authorization: Apikey TEST_KEY" \
      -d '{
        "id": 999999,
        "gateway": "TEST",
        "transactionDate": "2026-05-19 12:00:00",
        "accountNumber": "12345",
        "transferType": "in",
        "transferAmount": 100000,
        "content": "TEST 0123456788 thanh toan don hang",
        "referenceCode": "TEST-SP-001"
      }'
    ```
5. **Verify tab 1 (customer-wallet)**: trong 1-3s, KH `0123456788` công nợ giảm 100k (KHÔNG click refresh)
6. **Verify tab 2 (balance-history Live Mode)**: kanban "TỰ ĐỘNG GÁN" có card mới (matched phone) hoặc "NHẬP TAY" nếu không match

### 👤 Flow C9 — Users page permission change → Live session reload (Phase A5)

**Mục đích**: Verify khi admin sửa permission của user X, session của user X tự reload.

**Steps**:

1. Tạo 2 user session đồng thời:
    - Tab 1: login as admin, mở `web2/users/`
    - Tab 2 (incognito): login as staff `staff1`, mở `web2/products/`
2. Trên tab 1 (admin): edit user `staff1` → đổi role staff → viewer
3. **Verify tab 2**: trong 3s, toast cảnh báo "Quyền/thông tin tài khoản của bạn vừa thay đổi" + page reload tự động
4. **Verify post-reload**: tab 2 quyền viewer, không edit được products

### 🎯 Flow C10 — Variant added → so-order picker refresh

**Mục đích**: Verify Web2VariantsCache SSE update.

**Steps**:

1. Mở `so-order/` tab 1 (có row đang edit, variant picker open)
2. Mở `web2/variants/` tab 2
3. Trên tab 2: Click "+ Thêm Biến Thể" → group="Size", value="XXL"
4. Lưu
5. **Verify tab 1**: variant picker dropdown chứa "XXL" mới (KHÔNG đóng/mở lại)
6. **SSE check**: event `web2:variants` action `create`

### 🔄 Flow C11 — Cross-tab same machine sync (SSE multi-client)

**Mục đích**: Verify 2 tab cùng entity update đồng bộ.

**Steps**:

1. Mở `web2/partner-customer/` 2 tab cạnh nhau
2. Tab A: tạo customer mới `TEST-KH-001`, name "Test KH 1"
3. **Verify tab B**: trong 1-2s, list refresh, KH mới xuất hiện
4. Tab B: edit name → "Test KH 1 — Edited"
5. **Verify tab A**: tự refresh, name đã đổi
6. Tab A: xóa
7. **Verify tab B**: KH biến mất

---

## 4. Critical regression checks (Tier 3)

Sau khi pass Tier 1+2, verify các flow không bị break:

| #   | Check                                    | Expected                                      |
| --- | ---------------------------------------- | --------------------------------------------- |
| R1  | Login web2-users session persist sau F5  | Vẫn auth, không redirect login                |
| R2  | Mobile responsive sidebar collapse       | Sidebar thu nhỏ ở viewport ≤ 768px            |
| R3  | SSE reconnect sau network glitch         | EventSource auto-reconnect, không cần refresh |
| R4  | Cross-tab BroadcastChannel sync (nếu có) | Login 1 tab → các tab khác cũng login         |
| R5  | Print PBH function                       | Generates print-ready HTML, không broken      |

---

## 5. Execution checklist

```
[ ] Pre-flight: browser session alive + local server :8093
[ ] Tier 1 — Per-page smoke (16 pages, ~30 min)
    [ ] T1.1 web2/products      [ ] T1.9 web2/supplier-debt
    [ ] T1.2 web2/variants      [ ] T1.10 balance-history
    [ ] T1.3 web2/users         [ ] T1.11 partner-customer
    [ ] T1.4 so-order           [ ] T1.12 partner-supplier
    [ ] T1.5 native-orders      [ ] T1.13 delivery-carrier
    [ ] T1.6 PBH                [ ] T1.14 product-category
    [ ] T1.7 customer-wallet    [ ] T1.15 live-campaign
    [ ] T1.8 supplier-wallet    [ ] T1.16 tpos-pancake

[ ] Tier 2 — Cross-page integration (11 flows, ~60 min)
    [ ] C1 Sổ Order → Products (nhập pending)
    [ ] C2 Sổ Order Mua hàng → Products confirm
    [ ] C3 Products edit qty → Sổ Order sync
    [ ] C4 Products xóa có pending → cleanup
    [ ] C5 Native Orders → PBH convert
    [ ] C6 PBH confirm → Customer Wallet (SSE)
    [ ] C7 Sổ Order shipment → Supplier Wallet
    [ ] C8 SePay webhook → Wallet + Balance History
    [ ] C9 Users permission change → Live reload
    [ ] C10 Variant added → so-order picker
    [ ] C11 Cross-tab same machine sync

[ ] Tier 3 — Regression (5 checks, ~15 min)
    [ ] R1-R5

[ ] Cleanup: DELETE all TEST-% records
[ ] Generate test report: docs/web2/QA-TEST-REPORT-2026-05-19.md
[ ] Commit + push
```

---

## 6. Report format

Sau test, sinh file `docs/web2/QA-TEST-REPORT-<DATE>.md`:

```markdown
# QA Test Report — 2026-05-19

| Scenario                         | Status  | Notes                                               |
| -------------------------------- | ------- | --------------------------------------------------- |
| T1.1 web2/products               | ✅ PASS |                                                     |
| ...                              | ...     |                                                     |
| C6 PBH confirm → Customer Wallet | ❌ FAIL | SSE event không fire, customer-wallet không refresh |
| ...                              | ...     |                                                     |

## Bugs found

1. ...

## Action items

1. ...
```

---

## 7. Time budget

- **Tier 1**: 30 phút (16 pages × ~2 phút)
- **Tier 2**: 60 phút (11 flows × ~5-6 phút)
- **Tier 3**: 15 phút (5 checks × ~3 phút)
- **Report + cleanup**: 15 phút
- **Total**: ~2 giờ

Có thể split thành 2-3 session nếu context budget không đủ.

---

## 8. Risk mitigation

- **SSE delay > 5s**: Note timing, document expected vs actual
- **DB write fail trên prod**: KHÔNG retry write test, ghi failed scenario + skip cleanup
- **Browser session crash**: Restart, resume từ checklist
- **localhost server die**: `python3 -m http.server 8093 &` (auto-spawn từ script)
- **Test customer "Huỳnh Thành Đạt" có data thật**: KHÔNG xóa, chỉ READ + thêm test transactions

---

## 9. Tools

| Tool                                 | Purpose                                                      |
| ------------------------------------ | ------------------------------------------------------------ |
| `scripts/n2store-browser-session.js` | Persistent Playwright + login auto                           |
| FIFO `/tmp/n2store-session.fifo`     | Gửi commands `nav/feval/shot`                                |
| `curl`                               | Test API endpoints + SSE stream + webhook trigger            |
| `node -e "..."`                      | DB cleanup via Postgres connection (cần cred từ serect file) |

---

**Next**: Bắt đầu execute Tier 1 smoke từng page, screenshot mỗi step, ghi nhận pass/fail.
