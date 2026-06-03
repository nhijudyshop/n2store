<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — kế hoạch tách DB. -->

# Kế hoạch tách DB Web 2.0 hoàn toàn khỏi Web 1.0

> Trạng thái: **DRAFT — chờ user duyệt phasing**. Lập 2026-06-03.
> Mục tiêu user: mọi data Web 2.0 nằm ở **Render PG `n2store-web2-db`** + **Firebase Web 2.0**, độc lập hoàn toàn data cũ. Bỏ mọi coupling Web 1.0 (gồm `/api/v2/customers`).

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

## 7. Quyết định cần user chốt

1. Xác nhận tách dù **2× phí DB** (mâu thuẫn 30/5)?
2. Bắt đầu từ **Phase 1** (web2_customers, an toàn) hay muốn làm full một mạch?
3. Money tables (wallets): chấp nhận cutover trong cửa sổ ít traffic + freeze ngắn để copy chính xác?
