<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — kế hoạch tách DB. -->

# Kế hoạch tách DB Web 2.0 hoàn toàn khỏi Web 1.0

> Trạng thái: **APPROVED — đang thực thi**. Lập 2026-06-03, user duyệt cùng ngày.
> Mục tiêu user: mọi data Web 2.0 nằm ở **Render PG `n2store-web2-db`** + **Firebase Web 2.0**, độc lập hoàn toàn data cũ. Bỏ mọi coupling Web 1.0 (gồm `/api/v2/customers`).
>
> **QUYẾT ĐỊNH USER (2026-06-03)**:
>
> 1. ✅ Làm **triệt để** — chuyển toàn bộ data Web 2.0 sang web2Db.
> 2. ✅ **Được phép XÓA data** (Web 2.0 đang test) → **BỎ Phase 3 (copy data)**. Tạo bảng rỗng trên web2Db (ensureTables auto-create khi route trỏ pool mới). KHÔNG cần verify balance/row-count.
> 3. ✅ Firebase: giữ prefix `web2_` chung project (không tách project riêng).
>    Hệ quả: migration = **mirror schema rỗng + cutover pool toàn bộ route web2 + đổi `customers`→`web2_customers`**. Các JOIN nội-bộ web2 (orders⋈ví) giữ nguyên vì mọi bảng web2 cùng sang web2Db. JOIN ngoài duy nhất = legacy `customers` → thay `web2_customers`.

## 1. Hiện trạng (facts, verified qua Render API + code)

| DB      | Render name       | id         | db name        | Chứa gì hiện tại                                                                           |
| ------- | ----------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------ |
| Chính   | `n2store-chat-db` | dpg-d4kr80 | `n2store_chat` | **Toàn bộ** web2\_\* tables + legacy (`customers`, `balance_history`, `customer_wallets`…) |
| Web 2.0 | `n2store-web2-db` | dpg-d8d7be | `n2store_web2` | **Chỉ** `web2_records` (generic) — gần như trống                                           |

- Pool: `chatDb` ← `DATABASE_URL` (n2store_chat). `web2Db` ← `WEB2_DATABASE_URL` (n2store_web2), fallback chatDb nếu env unset.
- **Tất cả ~24 route web2 đang dùng `chatDb`**, chưa route nào dùng `web2Db`.
- ✅ Tên DB đã rõ (`n2store-web2-db` / `n2store_web2`) — thoả yêu cầu "có chữ web2".

## 2. ⚠ Mâu thuẫn lịch sử cần user xác nhận

`render.com/routes/admin-migrate-web2.js` (2026-05-30) ghi rõ: **trước đây user yêu cầu NGƯỢC** — consolidate web2 (Neon) **VÀO** chatDb để **bỏ** DB riêng, lý do "cùng provider, đỡ tốn phí, còn headroom". Yêu cầu hôm nay (2026-06-03) đảo ngược: tách web2 RA DB riêng.

**Hệ quả cần chấp nhận:**

- Chạy **2 Postgres basic_1gb** song song (tốn phí gấp đôi phần DB).
- Reverse lại công sức consolidate tháng 5.

→ **Cần user confirm**: vẫn muốn tách dù tốn 2× phí DB?

## 3. Phân tích khả thi (đã check)

- ✅ **Không có JOIN runtime** trộn `web2_*` với bảng legacy → tách DB vật lý KHÔNG vỡ query nào. (Các JOIN `balance_history⋈customers` đều ở file Web 1.0 legacy, không phải web2.)
- ✅ Webhook SePay đã fan-out 2 path độc lập → web2 path chỉ cần đổi pool đích.
- ⚠ Backfill trong `web2-wallet-isolation.js` đọc legacy `customer_wallets` (1 lần, guarded) → khi web2 sang DB khác, backfill này thành cross-DB. Đã chạy xong nên bỏ được.
- ⚠ `/api/v2/customers` đọc legacy `customers` → thay bằng `web2_customers` (Phase 1).

## 4. Phạm vi (scope)

**~25 bảng** cần ở web2Db: `web2_balance_history, web2_customer_wallets, web2_wallet_transactions, web2_wallet_adjustments, web2_pending_matches, web2_payment_qr_codes, web2_match_audit, web2_extraction_blacklist, web2_webhook_retry_queue, web2_products, web2_variants, web2_product_history, web2_product_velocity, web2_entities, web2_records, web2_users, web2_user_sessions, web2_notifications, web2_cart_history, web2_kpi_*, web2_supplier_ratings, native_orders, fast_sale_orders, fast_sale_order_history` + **mới: `web2_customers`**.

**~24 route file** phải đổi `chatDb` → `web2Db`: xem inventory §C trong session.

## 5. Phasing (đề xuất — mỗi phase độc lập, rollback được)

### Phase 0 — Chuẩn bị (zero-risk)

- Helper chọn pool: route web2 lấy `req.app.locals.web2Db` (đã fallback chatDb). Đổi dần, không big-bang.
- Test mọi schema trên **local DB** (`n2store_web2_migration_test`) theo pattern `test-migration-*.js`: CREATE→DDL→INSERT fake→verify→DROP. KHÔNG đụng prod.

### Phase 1 — `web2_customers` + bỏ `/api/v2/customers` (HIGH value, LOW risk, additive)

- Tạo bảng `web2_customers` trong **web2Db** (id TPOS, phone, name, address, …).
- Sync từ TPOS Partner (cron + on-demand upsert khi gán KH).
- Endpoint mới `/api/web2/customers/search?q=` (tên+SĐT) đọc web2_customers, fallback TPOS live.
- Frontend: đổi `CUSTOMER_SEARCH_BASE` `/api/v2/customers` → `/api/web2/customers/search` ở `web2-balance-history-app.js` + `web2-pending-match.js`.
- → Bỏ coupling Web 1.0 rõ nhất; thiết lập pattern dùng web2Db.

### Phase 2 — Schema mirror toàn bộ web2 tables sang web2Db

- DDL idempotent tạo tất cả bảng web2\_\* trong web2Db (clone schema từ chatDb, dùng `LIKE` / pg_dump --schema-only).
- Boot-time `ensureSchema` trỏ web2Db.

### Phase 3 — Data copy chatDb → web2Db (read-only nguồn)

- Batched `INSERT ... SELECT` qua admin route (như `admin-migrate-web2.js` pattern), idempotent `ON CONFLICT DO NOTHING`.
- Verify row counts khớp từng bảng.
- Ưu tiên copy **trong cửa sổ ít traffic**; money tables (wallets) copy cuối + double-check balance tổng.

### Phase 4 — Cutover route pool

- Đổi `chatDb`→`web2Db` trong 24 route, group theo module (products, wallets, sepay, orders, kpi, notifications…).
- Mỗi group: deploy → smoke test → next.

### Phase 5 — Verify + dọn

- Smoke 144 pages, verify UI/SSE/wallet.
- Sau ổn định: chatDb giữ web2\_\* copy cũ (đông cứng) làm backup N ngày → rồi DROP.
- Firebase: confirm các collection đã prefix `web2_` (đã làm 2026-05-25).

## 6. Rollback mỗi phase

- Phase 1–2: additive, chỉ cần không trỏ route sang → no-op.
- Phase 3: data ở web2Db là copy, chatDb còn nguyên → xoá web2Db data + chạy lại.
- Phase 4: đổi pool về `chatDb` (1 dòng/route) → tức thì về cũ.

## 7. Quyết định cần user chốt → ĐÃ CHỐT (2026-06-03)

1. ✅ Tách dù 2× phí DB — đồng ý.
2. ✅ Làm full triệt để.
3. ✅ Money tables: **xóa data, tạo rỗng** (không copy/freeze) — Web 2.0 đang test.

## 8. Tiến độ thực thi (cập nhật 2026-06-03)

- ✅ **Hạ tầng**: `web2Db` pool (`db/web2-pool.js`, env `WEB2_DATABASE_URL`, fallback chatDb), wired `app.locals.web2Db` (server.js:129).
- ✅ **Phase 1 backend XONG**: `web2_customers` schema (`db/web2-customers-schema.js`, auto-create boot server.js:144), route `/api/web2/customers/search` + `/:phone` (`routes/v2/web2-customers.js`, đọc web2Db, TPOS self-populate), mounted server.js:634.
- ✅ **Phase 1 frontend (1 phần)**: balance-history-app.js + pending-match.js đã dùng `/api/web2/customers/search`.
- 🔄 **Phase 1 frontend còn lại**: customer-wallet (by-phone/orders), balance-verification (quick-view), pbh-app (orders agg), native-orders search-by-phone, tpos-comment-list — vẫn gọi `/api/v2/customers` (vài endpoint mới chưa có: by-phone/orders, quick-view, by-fb-id → cần thêm route web2 tương ứng hoặc giữ tạm).
- ⬜ **Phase 2+4 (gộp vì wipe OK)**: cutover pool + mirror schema rỗng cho các route web2 còn ở chatDb.
- ⬜ **Phase 3**: BỎ (wipe OK).
- ⬜ **Phase 5**: verify.

## 9. Inventory route web2 cần cutover chatDb → web2Db (Phase 2+4)

> Chỉ đổi route **Web 2.0**. Route Web 1.0 (realtime-db, users, campaigns, social-orders, oncall-sip, v2/customers, v2/wallets, v2/balance-history, sepay-_ Web1.0, invoice-_, livestream-\* nếu Web1) **GIỮ chatDb**.

**Nhóm SP + Đơn** (move cùng — JOIN nội bộ): `web2-products.js` (15), `native-orders.js` (15), `fast-sale-orders.js` (17), `reconcile.js` (11), `v2/cart.js` (10), `v2/inventory-forecast.js`, `v2/dashboard-kpi.js`, `v2/notifications.js`, `delivery-invoices.js`, `refunds.js`, `pbh-reports.js`, `v2/web2-customer-orders.js`.
Bảng: `web2_products, web2_product_history, web2_product_velocity, native_orders, native_orders_migrations, fast_sale_orders, fast_sale_order_history, fast_sale_order_lines, pbh_fulfillment_logs`.

**Nhóm Ví + Balance** (move cùng): `v2/web2-customer-wallet.js`, `v2/web2-wallets.js`, `v2/web2-balance-history.js`, `sepay-*` (web2 path), services `web2-wallet-isolation.js` / `web2-sepay-matching.js`.
Bảng: `web2_customer_wallets, web2_wallet_transactions, web2_wallet_adjustments, web2_balance_history, web2_pending_matches, web2_payment_qr_codes, web2_match_audit, web2_extraction_blacklist, web2_webhook_retry_queue`.

**Nhóm khác**: `web2-variants.js` (8), `web2-users.js` (10), `v2/supplier-aging`, `v2/supplier-360`, `v2/audit-log`, `v2/smart-match`, kpi web2.
Bảng: `web2_variants, web2_users, web2_user_sessions, web2_notifications, web2_cart_history, web2_kpi_*, web2_supplier_ratings, web2_entities`.

**Coupling `customers` cần đổi `web2_customers`** (JOIN ngoài): `pbh-reports.js:246` (FULL OUTER JOIN customers), `native-orders.js:752/930/963` (lookup customers), `v2/web2-customer-orders.js:56/73` (customers). → đổi `FROM customers` → `FROM web2_customers` (rỗng lúc đầu, self-populate dần).

**Cách cutover an toàn (wipe OK)**: mỗi route đổi `req.app.locals.chatDb` → `req.app.locals.web2Db`. ensureTables tự tạo bảng rỗng trên web2Db lần query đầu. Test DDL trên local DB `n2store_web2_migration_test` trước (pattern `test-migration-*.js`). Deploy theo nhóm → smoke test → nhóm tiếp.
