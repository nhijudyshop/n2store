# Web 2.0 — Improvement Plan (Cross-Page Realtime + Consistency)

> Plan tổng hợp sau khi research ngày 2026-05-19. Mục tiêu: liên kết chức năng 16 pages chính, thống nhất realtime SSE, fix friction cross-page interactions.
>
> Đọc kèm: [SSE-REALTIME.md](SSE-REALTIME.md), [WEB2-INDEX.md](WEB2-INDEX.md).

---

## 1. Hiện trạng (research summary)

### 1.1 Pages + data sources

| Page                                                                                 | DB chính                                                       | Realtime hiện tại                      | Reads từ                                                               | Writes đến                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `so-order/`                                                                          | **Firestore** `web2_so_order/main`                             | onSnapshot                             | Firestore + Web2ProductsCache + Web2VariantsCache                      | Firestore + `/api/web2-products/upsert-pending`                             |
| `native-orders/`                                                                     | Postgres `native_orders`                                       | SSE `web2:native-orders`               | `/api/native-orders/load` + Web2ProductsCache                          | `/api/native-orders/*`, convert → `/api/fast-sale-orders/from-native-order` |
| `tpos-pancake/`                                                                      | (Pancake bên ngoài)                                            | WS direct + Render broker              | Pancake API                                                            | TPOS API                                                                    |
| `web2/products/`                                                                     | Postgres `web2_products`                                       | SSE `web2:products` + Firestore tickle | `/api/web2-products/list`                                              | `/api/web2-products/*`                                                      |
| `web2/variants/`                                                                     | Postgres `web2_variants`                                       | SSE `web2:variants` + Firestore tickle | `/api/web2-variants/list`                                              | `/api/web2-variants/*`                                                      |
| `web2/customer-wallet/`                                                              | Postgres `fast_sale_orders` + Firestore `web2_customer_wallet` | SSE `wallet:all`                       | `/api/fast-sale-orders/load` + `/api/wallet-deposits/load` + Firestore | Firestore (notes, payments)                                                 |
| `web2/supplier-wallet/`                                                              | Firestore `web2_supplier_wallet` + `web2_so_order`             | SSE `wallet:all` + onSnapshot          | Firestore                                                              | Firestore                                                                   |
| `web2/supplier-debt/`                                                                | Firestore + TPOS odata                                         | SSE × 3 topics                         | Firestore (so_order + supplier_wallet) + TPOS                          | (read-only)                                                                 |
| `web2/fastsaleorder-invoice/` (PBH)                                                  | Postgres `fast_sale_orders`                                    | WS qua PbhRealtime                     | `/api/fast-sale-orders/*`                                              | `/api/fast-sale-orders/*`                                                   |
| `web2/balance-history/`                                                              | Postgres `balance_history`                                     | SSE `wallet:all`                       | `/api/v2/balance-history/*` + SePay                                    | `/approve`, `/reject`, `/adjust`                                            |
| `web2/live-campaign/`, `partner-customer/`, `partner-supplier/`, `product-category/` | Postgres `web2_records`                                        | SSE `web2:<slug>` (generic)            | `/api/web2/<slug>/list`                                                | `/api/web2/<slug>/*`                                                        |
| `web2/users/`                                                                        | Postgres `web2_users`                                          | SSE `web2:users`                       | `/api/web2-users/list` + `/pages`                                      | `/api/web2-users/*`                                                         |

### 1.2 8 frictions phát hiện

| #   | Friction                                                     | Severity          | Where                                                                                                   |
| --- | ------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------- |
| F1  | **Dual source Firestore vs Postgres**                        | 🔴 High           | web2_so_order, web2_supplier_wallet Firestore-only; phần CRUD khác Postgres → ambiguous source of truth |
| F2  | **ID scheme inconsistent** (code/number/displayStt/username) | 🟠 Medium         | Cross-page lookup phải có conditional mapping                                                           |
| F3  | **Firestore tickle pattern brittle**                         | 🟠 Medium         | web2_products_sync/notify, web2_variants_sync/notify — race condition khi nhiều tab write               |
| F4  | **Manual refresh thay vì auto-push**                         | 🟠 Medium         | PBH confirm → customer-wallet không refresh ngay (chỉ poll)                                             |
| F5  | **Cross-page nav thiếu deep link**                           | 🟠 Medium         | PBH → source native-order ko link; supplier-wallet ↔ so-order không click-through                       |
| F6  | **Cross-cache invalidation thiếu**                           | 🟠 Medium         | web2/products stock change KHÔNG broadcast tới supplier-wallet (subscribe sai topic)                    |
| F7  | **Users page no realtime permission updates**                | 🟡 Low (security) | Admin sửa role → user khác phải F5 mới mất quyền                                                        |
| F8  | **Order→Wallet không transactional**                         | 🔴 High           | PBH create fail mid-tx → wallet thấy sai total, không rollback                                          |

---

## 2. Roadmap theo priority

### Phase A — Quick wins (làm ngay, low-risk, ~1-2 giờ)

Mỗi item dưới đây ảnh hưởng UX rõ rệt, code change nhỏ, không touch DB schema.

#### A1. Customer-wallet listen `web2:fast-sale-orders` (Fix F4)

- **Hiện**: Customer-wallet chỉ subscribe `wallet:all` (SePay events). Không refresh khi PBH confirm/cancel.
- **Fix**: Thêm subscribe `web2:fast-sale-orders` trong `_sseConnect()` → cùng debounce → reload PBH list + render.
- **File**: `web2/customer-wallet/js/customer-wallet-app.js`
- **Risk**: Rất thấp. Pattern y supplier-debt đã làm.

#### A2. Supplier-wallet listen `web2:products` + `web2:so-order` (Fix F6)

- **Hiện**: Supplier-wallet đọc Firestore web2_so_order nhưng không nhận event khi web2/products stock thay đổi.
- **Fix**: Subscribe thêm `web2:products` (vì stock = mua từ NCC ảnh hưởng debt) + `web2:so-order` (placeholder topic — server emit khi so_order doc Firestore thay đổi qua sync layer).
- **File**: `web2/supplier-wallet/js/supplier-wallet-app.js`

#### A3. PBH → native-order deep link (Fix F5)

- **Hiện**: PBH có `source_code` (mã native-order gốc) nhưng UI không click được.
- **Fix**: Trong PBH detail panel render `<a href="../../native-orders/index.html#order/{code}">` cho source code.
- **File**: `web2/fastsaleorder-invoice/pbh-app.js`

#### A4. Native-orders → PBH list deep link (Fix F5)

- **Hiện**: Khi native-order đã convert thành PBH, UI native-orders không show PBH number để click.
- **Fix**: Render badge "→ PBH: HD-..." link đến `../web2/fastsaleorder-invoice/index.html#pbh/{number}` nếu order có `fast_sale_order_number`.
- **File**: `native-orders/js/native-orders-app.js`

#### A5. Users page subscribe permission events (Fix F7)

- **Hiện**: User-app có SSE subscribe `web2:users` nhưng chỉ reload user LIST. Permission của session current user không bị invalidate.
- **Fix**: Khi nhận event với `action='update-permissions'` AND data.id === currentUserId → toast cảnh báo "Quyền của bạn vừa thay đổi, F5 để áp dụng" + force-reload sau 3s.
- **File**: `web2/users/js/users-app.js`

#### A6. Balance-history reload trigger từ tab change (UX)

- **Hiện**: Balance-history page mở mặc định tab "Lịch sử biến động số dư", switch tab Live Mode mới init. Khi quay lại Balance tab, không refresh dù có SSE event ở tab khác.
- **Fix**: Hook `switchMainTab('balance-history')` → if last SSE event ts > last reload → call loadData() ngay.
- **File**: `web2/balance-history/index.html` (script cuối body)

### Phase B — Cross-cutting wiring (mid-risk, ~2-3 giờ)

#### B1. Server-side: web2-products emit cross-topic `web2:supplier-wallet` (Fix F6)

- **Hiện**: `_notify('web2:products', ...)` chỉ broadcast 1 topic.
- **Fix**: Khi action liên quan stock change (adjust-stock, upsert-pending, confirm-purchase) → emit thêm `web2:supplier-wallet` để các page Ví NCC tự refresh.
- **File**: `render.com/routes/web2-products.js`

#### B2. PBH server-side: emit cross-topic `web2:customer-wallet` (Fix F4 + F8)

- **Hiện**: PBH confirm → emit `web2:fast-sale-orders` only.
- **Fix**: Cũng emit `web2:customer-wallet` khi confirm/cancel/print (action ảnh hưởng wallet KH).
- **File**: `render.com/routes/fast-sale-orders.js`

#### B3. Unify ID display helper (Fix F2)

- Tạo `web2/shared/web2-id-helper.js`: function `displayId(entity, record)` → trả về string format chuẩn (code/number/username/displayStt) → import vào page-builder + các page khác.
- **Files**: new `web2/shared/web2-id-helper.js` + import vào products, native-orders, fast-sale-orders, users.

#### B4. Refactor supplier-debt từ TPOS odata → cache local

- **Hiện**: supplier-debt lazy-fetch TPOS Report/PartnerDebtReport mỗi lần expand row. Chậm + tốn quota.
- **Fix**: Add cache layer 5 phút TTL trong supplier-debt-app.js.
- **File**: `web2/supplier-debt/js/supplier-debt-app.js`

### Phase C — Architectural (high-risk, defer cho session khác)

#### C1. Migrate Firestore web2_so_order → Postgres (Fix F1)

- Đại refactor: so-order data từ Firestore sang Postgres table `so_orders` + child `so_shipments` + `so_rows`.
- Lý do defer: rủi ro mất data Sổ Order; cần migration script + verify song song trước khi cut over.

#### C2. Migrate Firestore web2_supplier_wallet → Postgres (Fix F1)

- Same pattern as C1. Defer.

#### C3. PBH transaction saga (Fix F8)

- Khi convert native-order → PBH: dùng 2-phase commit hoặc compensating transaction. Phức tạp, defer.

#### C4. Replace Firestore tickle với Postgres LISTEN/NOTIFY (Fix F3)

- Server emit qua Postgres NOTIFY → realtime-sse listener → SSE topic. Hiện đã có SSE pub/sub, chỉ thay tickle Firestore còn lại trong cache (Web2ProductsCache, Web2VariantsCache). Defer cho cleanup commit.

---

## 3. Implementation order (Phase A — execute ngay)

Sequential execution để verify từng bước:

1. ✅ Write plan doc (this file)
2. ⏳ A1 — customer-wallet subscribe `web2:fast-sale-orders`
3. ⏳ A2 — supplier-wallet subscribe `web2:products` + `web2:so-order`
4. ⏳ A3 — PBH → native-order deep link
5. ⏳ A4 — native-orders → PBH deep link badge
6. ⏳ A5 — users page session permission invalidation
7. ⏳ A6 — balance-history tab-change reload
8. ⏳ B1 — server cross-topic web2:supplier-wallet
9. ⏳ B2 — server cross-topic web2:customer-wallet
10. ⏳ Commit + push từng phase
11. ⏳ Verify production curl + browser test

Phase B3 (id helper), B4 (debt cache) — làm sau Phase A nếu còn ngân sách context.

---

## 4. Tracking dashboard

Sau Phase A xong, expected state:

| Friction                  | Status              |
| ------------------------- | ------------------- |
| F1 dual source            | ⏳ Phase C (defer)  |
| F2 ID inconsistent        | ⏳ Phase B3         |
| F3 tickle brittle         | ⏳ Phase C4 (defer) |
| F4 manual refresh         | ✅ Phase A1 + B2    |
| F5 nav deep link          | ✅ Phase A3 + A4    |
| F6 cross-cache invalidate | ✅ Phase A2 + B1    |
| F7 permission realtime    | ✅ Phase A5         |
| F8 order-wallet sync      | ⏳ Phase C3 (defer) |

→ Phase A + B (subset) sẽ resolve 5/8 frictions hôm nay.
