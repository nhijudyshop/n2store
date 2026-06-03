<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — master plan tách triệt để. -->

# MASTER PLAN — Tách Web 2.0 triệt để khỏi Web 1.0

> Lập 2026-06-03 sau audit toàn bộ 33 trang trong menu Web 2.0 (5 agent song song).
> Mục tiêu: mọi data + API + Firebase của Web 2.0 độc lập hoàn toàn — Render PG `n2store-web2-db` + Firebase `web2_*` collections. Không còn dính `n2store_chat` (Web 1.0) hay endpoint/collection legacy.

## 0. Phân loại 3 kiểu "coupling" (QUAN TRỌNG — đừng nhầm)

1. **Web 1.0 thật** (PHẢI bỏ): gọi `/api/v2/<x>` non-web2 (`customers`, `wallets`, `balance-history`, `pending-withdrawals`), `/api/sepay/*`, hoặc Firestore collection legacy (`customers`, `so_order_v2`, `suppliers_v1`).
2. **TPOS** (KHÔNG phải Web 1.0 — GIỮ): `/api/odata/*`, `/api/pancake*`, `/api/facebook*`. TPOS là master dùng chung, Web 2.0 đọc TPOS là đúng thiết kế.
3. **Piggyback `/api/v2/*`** (Web 2.0 logic, namespace chung — DỌN cho sạch): `notifications, audit-log, supplier-aging, supplier-360, dashboard-kpi, kpi, inventory-forecast, smart-match, cart, delivery-assignments`. Là code Web 2.0 nhưng mount nhờ namespace `/api/v2/*` + bảng ở chatDb.

## 1. Kết quả audit 33 trang

### ✅ Đã ISOLATED (chỉ web2 + TPOS, Firestore `web2_*`)

`bulk-import, users-permissions, admin-sse-monitor, fastsaleorder-refund, fastsaleorder-delivery, reconcile, report-revenue, so-order, purchase-refund, supplier-wallet, supplier-aging, products, variants, product-category, users, partner-customer`
→ Chỉ cần **Phase 4-6** (migrate bảng Postgres sang web2Db); Firestore đã `web2_*`.

### 🟡 PIGGYBACK `/api/v2/*` (Web 2.0, cần đổi namespace)

`dashboard, kpi, notifications, audit-log, supplier-360, inventory-forecast, smart-match, report-delivery`
→ **Phase 3** đổi route `/api/v2/<x>` → `/api/web2/<x>` (giữ alias cũ tạm) + sửa frontend; rồi migrate bảng.

### 🔴 Web 1.0 thật — CẦN FIX CODE (Phase 2)

| Trang                     | Coupling Web 1.0 thật                                           | Cách fix                                          |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| **native-orders**         | `/api/v2/customers` (fallback tìm KH)                           | → `/api/web2/customers/search` (đã có từ Phase 1) |
| **customer-wallet**       | `/api/v2/customers/by-phone/*`                                  | → `/api/web2/customers/:phone` (đã có)            |
| **fastsaleorder-invoice** | `/api/v2/kpi/scope` + comment cũ `/api/v2/customers/:id/orders` | → `/api/web2/kpi/scope` + xóa comment             |
| **print-export**          | `/api/v2/balance-history/*`                                     | → `/api/web2/balance-history/*`                   |
| **smart-match**           | `/api/v2/balance-history/*`                                     | → `/api/web2/balance-history/*`                   |
| **overview**              | tham chiếu `/api/v2/balance-history` (doc)                      | → cập nhật tham chiếu                             |
| **services-dashboard**    | `/api/services-overview` generic + Firebase SDK thừa            | → `/api/web2/services-overview` + bỏ Firebase SDK |

### 🧹 DEAD CODE phải XÓA (không migrate)

`balance-history/js/` có **~13 file copy từ trang Web 1.0 cũ KHÔNG được index.html load** (`accountant.js, accountant-history.js, verification.js, balance-verification.js, live-mode.js, customer-info.js, balance-core.js, balance-table.js, balance-filters.js, transfer-stats.js, config.js, qr-generator.js, main.js`) — chứa `/api/v2/balance-history/*`, `/api/sepay/*`, Firestore `customers`. Đây là nguồn gây "COUPLED" giả trong audit. **Xóa hết** + kiểm các folder khác có dead-code tương tự.

### 🟦 TPOS-only (KHÔNG đụng — đúng thiết kế)

`partner-customer, live-campaign, tpos-pancake, supplier-debt` — đọc TPOS OData/Pancake. Không phải Web 1.0.

## 2. Bảng Postgres cần migrate (chatDb → web2Db)

~25 bảng: `web2_balance_history, web2_customer_wallets, web2_wallet_transactions, web2_wallet_adjustments, web2_pending_matches, web2_payment_qr_codes, web2_match_audit, web2_extraction_blacklist, web2_webhook_retry_queue, web2_customers (mới, đã ở web2Db), web2_products, web2_variants, web2_product_history, web2_product_velocity, web2_entities, web2_records (đã ở web2Db), web2_users, web2_user_sessions, web2_notifications, web2_cart_history, web2_kpi_*, web2_supplier_ratings, native_orders, fast_sale_orders, fast_sale_order_history`.

## 3. CHƯƠNG TRÌNH THỰC THI (8 phase)

| Phase | Nội dung                                                                                                                                        | Risk    | Trạng thái     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| **1** | `web2_customers` + search (balance-history Gán KH)                                                                                              | Thấp    | ✅ DONE + LIVE |
| **2** | Decouple code Web 1.0 thật (7 trang §1.🔴) + XÓA dead code (§1.🧹)                                                                              | Thấp    | ⬜             |
| **3** | Đổi namespace piggyback `/api/v2/*` → `/api/web2/*` (8 trang, route alias + frontend)                                                           | TB      | ⬜             |
| **4** | Schema mirror toàn bộ ~25 bảng sang web2Db (ensureSchema idempotent, **test local DB**)                                                         | Thấp    | ⬜             |
| **5** | Copy data chatDb→web2Db (batched, idempotent, verify counts từng bảng). **Money tables (wallets) copy cuối + freeze ngắn + check tổng balance** | **CAO** | ⬜             |
| **6** | Switch ~24 route `chatDb`→`web2Db` (group: products → orders → sepay/wallet → kpi/noti). Mỗi group deploy + smoke                               | **CAO** | ⬜             |
| **7** | Firebase: verify mọi collection `web2_*` prefix; xóa ref legacy (`customers`, `accountant-history`)                                             | Thấp    | ⬜             |
| **8** | Verify smoke 144 pages + SSE + wallet tổng; freeze bản copy web2\_\* ở chatDb làm backup N ngày → DROP                                          | TB      | ⬜             |

## 4. Nguyên tắc an toàn (BẮT BUỘC)

- Mọi schema/migration **test trên local DB** (`CREATE n2store_web2_migration_test → DDL → INSERT fake → verify → DROP`) trước khi prod.
- **KHÔNG DROP** bảng web2\_\* ở chatDb cho tới khi web2Db chạy ổn N ngày (rollback: đổi pool về chatDb 1 dòng/route).
- Money tables: copy trong cửa sổ ít traffic, verify `SUM(balance)` khớp 2 bên trước khi cutover route ví.
- Mỗi phase commit riêng, deploy riêng, smoke riêng.

## 5. Rollback

- Phase 2-4: additive/cleanup — revert commit là xong.
- Phase 5: data web2Db là copy, chatDb nguyên vẹn → xóa web2Db data, chạy lại.
- Phase 6: đổi `web2Db`→`chatDb` trong route (1 dòng) → tức thì về cũ.

## 6. Quyết định cần user

1. Duyệt thứ tự 8 phase? (đề xuất làm tuần tự 2→3→4→5→6→7→8)
2. Phase 5/6 (money cutover) — chốt cửa sổ giờ ít traffic để tôi thực thi?
3. Có muốn tôi gộp Phase 2+3 (decouple + namespace) làm trước vì rủi ro thấp, thấy hiệu quả ngay?
