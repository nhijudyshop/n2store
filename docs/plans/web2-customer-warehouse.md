<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 plan. -->

# PLAN — Kho dữ liệu Khách hàng riêng Web 2.0 + tách config (deliveryzone/printer)

> Trạng thái: **Phase 0 ✅. Phase 1 (backend) ✅. Phase 3 (frontend `web2/customers`) ✅ XONG 2026-06-07.** Còn: gỡ TPOS khỏi tpos-pancake/live-campaign (scope riêng). Ngày: 2026-06-07.
>
> **Phase 3 done**: trang `web2/customers/` (index.html + css/customers.css + js/customers-api.js + js/customers-app.js) — list/search/filter/paginate + CRUD + Chi tiết/QR/Chat (reuse `Web2CustomerDetailModal`) + Gộp KH + SSE `web2:customers` + pill ví + history timeline. Sidebar menu "Kho Khách Hàng (Web 2.0)". Test prod CRUD PASS. Xem dev-log `[web2] Phase 3`.
>
> ### ▶ BẮT ĐẦU PHIÊN MỚI TỪ ĐÂY (handoff)
>
> - **Đã xong Phase 0**: deliveryzone/printer → bảng riêng `web2_delivery_zones`/`web2_printers`, factory `render.com/routes/web2-dedicated-entity.js`, live. TPOS shadow xóa sạch + worker tắt. DB dọn.
> - **Đã xong Phase 1 (backend, 2026-06-07)**: gộp 2 bảng KH (`web2_customers` TPOS-coupled + `web2_order_customers`) → **1 warehouse `web2_customers`** (id BIGSERIAL, phone UNIQUE, `fb_psids` JSONB + `global_id`, KHÔNG TPOS). Rewrite `db/web2-customers-schema.js` (one-time DROP cũ + recreate) + `services/web2-order-customer-service.js` + route `/api/web2/customers` (CRUD đầy đủ + `/merge` + SSE `web2:customers`). Repoint native-orders/fast-sale/pbh-reports/web2-customer-orders/web2-customer-tpos. Bỏ TPOS push/enrich khỏi native-orders. server.js bỏ migration rename + wire SSE. XÓA `db/web2-order-customers-migrate.js`. Test local DB PASS. Xem dev-log 2026-06-07 `[render] Phase 1`.
> - **Làm tiếp (Phase 3)**: frontend trang `web2/customers` (Customer Warehouse UI) — clone `web2/partner-customer` nhưng đọc/ghi `/api/web2/customers/*` (warehouse, không live TPOS). Xem mục "PHASE 3" bên dưới.
> - **CHƯA đụng (project riêng)**: gỡ toàn bộ TPOS khỏi tpos-pancake/live-campaign (backend chat/live-comment/PBH — lớn, scope riêng). SePay match by-phone đã graceful (detector `_resolveCustomer` giữ match theo fb_id/phone).
> - Beta: KHÔNG sợ mất data web2\_\* (xem MEMORY `feedback_web2_beta_data_safe`).

> **Quyết định user (2026-06-07):**
>
> 1. Kho KH = **BẢNG MỚI** (không extend web2_order_customers). Tên dự kiến `web2_customers` — ⚠ va chạm bảng cũ web2_customers (2 rows cache match SePay) → Phase 1 phải đổi tên warehouse (vd `web2_customers_master`) HOẶC gộp/replace bảng cũ (beta nên có thể drop bảng cũ 2 rows + chuyển logic SePay match sang warehouse). Chốt ở Phase 1.
> 2. **Dữ liệu mới hoàn toàn** — beta test, KHÔNG import 92k TPOS, KHÔNG migrate 6.533 web2_order_customers. Kho bắt đầu RỖNG, tự đầy từ Pancake/đơn về sau.
> 3. Thứ tự: **Phase 0 (config) TRƯỚC**, rồi Phase 1-5.

> Bối cảnh: đã tắt TPOS shadow sync (partner-customer giờ chạy live 2 chiều). User muốn Web 2.0 có **kho KH của riêng mình** (không phụ thuộc TPOS), schema giàu như TPOS Partner + đủ field cho FB/Pancake.

---

## 0. Nguyên tắc chủ đạo (CẬP NHẬT 2026-06-07 — KH Web2 ĐỘC LẬP, BỎ TPOS)

- **Kho KH Web 2.0 RIÊNG, độc lập hoàn toàn.** Bảng MỚI `web2_customers` (warehouse). Nguồn dữ liệu: **Pancake / FB / nhập tay** — KHÔNG dính TPOS.
- **BỎ HẾT TPOS khỏi warehouse**: KHÔNG `tpos_id`, KHÔNG `tpos_data`, KHÔNG sync 2 chiều, KHÔNG enrich từ TPOS, KHÔNG push CreateUpdatePartner. (Trang `partner-customer` vẫn riêng, đọc live TPOS — KHÔNG liên quan warehouse.)
- **XÓA data KH cũ** (beta): drop `web2_order_customers` (6.533) + `web2_customers` cũ (2 rows cache SePay). Warehouse bắt đầu RỖNG, tự đầy từ Pancake/đơn.
- Convention Web 2.0: table `web2_customers`, route `/api/web2-customers`, SSE `web2:customers`, pool `web2Db`.

### ⚠ Hệ quả phải xử lý khi bỏ TPOS + xóa kho cũ (sequencing)

1. **native-orders + fast-sale-orders** hiện lookup KH qua `web2_order_customers` (`lookupCustomerIdByPhone`, `getOrCreateCustomerFromTPOS`). → Repoint sang `web2_customers` warehouse (Phase 2) TRƯỚC khi drop bảng cũ. Bỏ bước enrich TPOS, chỉ upsert theo phone/fb từ Pancake.
2. **SePay match** (`web2-payment-signal-detector`) dùng `web2_customers.id = TPOS Partner Id`. Bỏ TPOS → match theo **phone** (CK content chứa SĐT) vào warehouse, không dùng Partner Id nữa. Rework ở Phase 4.
3. Hiện `native_orders` + `fast_sale_orders` = 0 row (đã wipe) → drop kho KH cũ AN TOÀN (không đơn nào ref).

---

## PHASE 0 — Tách config deliveryzone + printer ra bảng riêng (quick win, task 1) — ✅ XONG 2026-06-07

> Đã làm: factory `web2-dedicated-entity.js` → bảng `web2_delivery_zones`(7)+`web2_printers`(3), shape/path giữ nguyên (consumer không đổi), auto-migrate từ web2_records. Orphan rows web2_records còn (dead, harmless). Bước 4 (sửa consumer) KHÔNG cần vì giữ path. Bước 5 (xóa slug web2_records) hoãn — API bị dedicated route shadow, dọn sau.

**Vấn đề:** `deliveryzone` (7) + `printer` (3) đang nằm trong `web2_records` generic (multi-tenant, dễ wipe nhầm, lẫn shadow).

**Làm:**

1. Tạo 2 bảng web2Db: `web2_delivery_zones`, `web2_printers` (schema phẳng từ data hiện tại).
    - `web2_delivery_zones`: id, code, short, fee NUMERIC, keywords JSONB, is_fallback BOOL, manual BOOL, sort_order, is_active, history JSONB, created/updated_at.
    - `web2_printers`: id, code, name, ip, port, paper, method, role (pbh|tem), is_active, history JSONB, created/updated_at.
2. Route dedicated `/api/web2-delivery-zones` + `/api/web2-printers` (CRUD + SSE `web2:delivery-zones`/`web2:printers`).
3. Migrate 7+3 rows từ `web2_records` sang bảng mới (script idempotent).
4. Update 2 consumer: `web2/shared/delivery-method-picker.js` (BACKEND_ENTITY → endpoint mới), `web2/shared/web2-printer.js` (URL mới).
5. Xóa slug `deliveryzone`+`printer` khỏi `web2_records` sau khi verify. → web2_records rỗng hẳn (có thể bỏ trống hoặc giữ cho generic features khác).

**Effort:** nhỏ (~1 buổi). **Rủi ro:** thấp (10 rows, 2 consumer).

---

## PHASE 1 — Schema Customer Warehouse (bảng MỚI `web2_customers`, KHÔNG TPOS)

> Tạo bảng MỚI từ đầu (không kế thừa web2_order_customers). Drop kho cũ sau khi repoint consumer (Phase 2). KHÔNG cột tpos_id/tpos_data.

**Cột cơ bản:** id, code (KH-xxx), name, phone (UNIQUE), email, address, ward, district, city, carrier, status (Normal|Bom|Warning|Danger|VIP), tier, tags JSONB, aliases JSONB, note, is_active, source (pancake|manual), created_by, history JSONB, created_at, updated_at.

**ĐỀ XUẤT THÊM (ADD COLUMN IF NOT EXISTS — migration idempotent):**

| Nhóm                          | Cột                       | Kiểu    | Mục đích                                                                                      |
| ----------------------------- | ------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| **FB/Messenger**              | `global_id`               | VARCHAR | FB Global Account Id — BẮT BUỘC để gửi tin (xem [[reference_fb_psid_vs_globalid]]); KHÁC psid |
|                               | `psid`                    | VARCHAR | Page-Scoped ID (per page)                                                                     |
|                               | `fb_page_id`              | VARCHAR | Page FB nào                                                                                   |
|                               | `fb_name`                 | VARCHAR | Tên FB (khác tên giao hàng)                                                                   |
| **Pancake**                   | `pancake_customer_id`     | VARCHAR | ID KH bên Pancake                                                                             |
|                               | `pancake_conversation_id` | VARCHAR | Hội thoại gần nhất                                                                            |
|                               | `pancake_page_id`         | VARCHAR | Page Pancake                                                                                  |
| **Địa chỉ (ship)**            | `ward`,`district`,`city`  | VARCHAR | Tách địa chỉ → auto-detect vùng giao (khớp deliveryzone keywords)                             |
|                               | `carrier`                 | VARCHAR | Nhà mạng SĐT (NameNetwork) — gợi ý gọi/zalo                                                   |
| **Ghi chú/CRM**               | `note`                    | TEXT    | Ghi chú (= Comment TPOS)                                                                      |
|                               | `tags`                    | JSONB   | Nhãn KH (VIP, sỉ, bom…)                                                                       |
| **Thống kê (derived, cache)** | `total_orders`            | INT     | Số đơn                                                                                        |
|                               | `total_spent`             | NUMERIC | Tổng mua                                                                                      |
|                               | `bom_count`               | INT     | Số lần bom hàng                                                                               |
|                               | `last_order_at`           | BIGINT  | Đơn gần nhất                                                                                  |
| **Nguồn/audit**               | `source`                  | VARCHAR | pancake\|tpos\|manual\|import                                                                 |
|                               | `created_by`              | VARCHAR | User tạo                                                                                      |
|                               | `history`                 | JSONB   | Audit log (chuẩn Web2HistoryTimeline)                                                         |

> Bỏ khỏi bảng ĐỀ XUẤT THÊM ở trên: **KHÔNG có `tpos_id`, `tpos_data`** (warehouse độc lập TPOS).

**Index:** phone (UNIQUE), fb_id, global_id, psid, pancake_customer_id, GIN(tags), GIN(to_tsvector name).

**Dedup key:** `phone` (chính) + fallback `fb_id`/`global_id`. Merge tool xử lý trùng.

---

## PHASE 1 — Recipe thực thi (chốt 2026-06-07: tạo MỚI hoàn toàn web2_customers, beta ok mất data)

**Quyết định cuối:** drop `web2_customers` cũ + tạo MỚI warehouse cùng tên. Beta → không lo mất 2 rows. Mục tiêu: ĐÚNG + chạy hoàn hảo.

**Consumer của `web2_customers` (5 chỗ — phải rework/kiểm tra khi thay schema):**

1. `web2-payment-signal-detector._resolveCustomer` — `SELECT id, phone FROM web2_customers WHERE fb_id=$1 ORDER BY ... synced_at`. **GRACEFUL** (try/catch → null). → Schema mới GIỮ `id, phone, fb_id, synced_at` để SePay vẫn match theo fb_id (customerId giờ = warehouse id, không còn Partner Id — OK, chỉ là khóa unique).
2. `native-orders.js` — lookup/insert KH. → repoint sang warehouse upsert (bỏ enrich TPOS).
3. `v2/web2-customers.js` (route đã tồn tại) — align hoặc thay bằng `/api/web2-customers`.
4. `tpos-customer-service.js` — TPOS coupling → BỎ (warehouse không TPOS).
5. `web2-order-customer-service.js` — `getOrCreateCustomerFromTPOS` → thay bằng upsert warehouse theo phone/fb (no TPOS).

**Thứ tự an toàn (1 deploy):** (a) tạo schema mới web2_customers giữ cột SePay cần; (b) sửa 5 consumer cùng lúc; (c) deploy; (d) verify SePay match + tạo đơn native-orders tạo KH vào warehouse. Drop `web2_order_customers` SAU khi native-orders/fast-sale repoint xong.

**Trạng thái:** Phase 0 ✅. Phase 1 = bước kế (build lớn, chạm SePay/orders live → làm cẩn thận, verify từng phần).

---

## PHASE 1B — Research notes (GitHub/industry, 2026-06-07) → áp dụng

- **Multi-page PSID** ([Meta PSID/ASID](https://developers.facebook.com/docs/messenger-platform/identity/id-matching/)): 1 người = 1 PSID/Page. → Dùng `fb_psids` JSONB `{page_id: psid}` thay cột `psid` đơn; `global_id` = neo gộp xuyên page; `fb_id` = psid mặc định (legacy/đơn page).
- **Dedup deterministic-first** ([dedupeio/dedupe](https://github.com/dedupeio/dedupe), CRM dedup frameworks): khóa chính = `phone` chuẩn hóa (UNIQUE) — nhanh, ít false-positive. Fuzzy (name+address) chỉ để GỢI Ý trùng, làm sau; KHÔNG kéo lib Python nặng.
- **Survivorship rules** cho `/merge`: giữ giá trị field đầy-đủ-nhất / mới-nhất; gộp `aliases` + `fb_psids` + `tags`; cộng dồn `total_orders`/`total_spent`/`bom_count`.
- **Unique constraint = chống trùng mạnh nhất**: `phone UNIQUE` + index `global_id`/`fb_id`.

→ Schema chỉnh: bỏ cột `psid` phẳng, thêm `fb_psids JSONB DEFAULT '{}'`. Giữ `global_id`, `fb_id`.

---

## PHASE 2 — Backend API `/api/web2-customers`

CRUD đầy đủ trên `web2_order_customers` (web2Db), SSE `web2:customers`:

- `GET /list` — search (phone/name/fb/global_id), filter (status/tier/tag/source), sort, paginate (LIMIT/OFFSET).
- `GET /:id` / `GET /by-phone/:phone` / `GET /by-fb/:fbId`.
- `POST /create`, `PATCH /update/:id`, `DELETE /:id` (guard nếu có đơn liên kết → soft-archive).
- `POST /merge` — gộp 2 KH trùng (giữ id chính, gộp aliases/orders/wallet ref).
- `POST /upsert` — dùng bởi webhook Pancake + flow tạo đơn (thay `getOrCreateCustomerFromTPOS`).
- `_notify('web2:customers', …)` sau mỗi mutation (SSE realtime).

---

## PHASE 3 — Frontend trang `web2/customers` (Customer Warehouse UI)

Clone UI `web2/partner-customer` (đã đẹp) NHƯNG đọc/ghi **Web2 DB** thay vì live TPOS:

- Bảng list: tên, SĐT (+carrier), địa chỉ, status badge (Normal/Bom/VIP…), tier, tags, #đơn, tổng mua, FB link.
- Search + filter (status/tier/tag/source) + paginate.
- Modal sửa: name/phone/email/address(ward/district/city)/note/status/tier/tags + FB ids.
- Nút: QR VietQR (đã có pattern), mở chat (Web2ChatPanel theo global_id), xem đơn (link native-orders filter phone), xem ví (web2_customer_wallets).
- Pill số dư ví: tái dùng [[reference_web2_wallet_balance_pill]].
- Audit timeline: `Web2HistoryTimeline.render(history)`.
- UI-first mutation: `Web2Optimistic.run` ([[reference_web2_ui_first]]).
- Realtime: `Web2SSE.subscribe('web2:customers')`.

---

## PHASE 4 — Đồng bộ & nhập liệu

- **Ingest Pancake/FB (DUY NHẤT, tự động):** webhook đơn/chat → `POST /upsert` (phone/fb*id/psid/global_id/pancake*\*). KH tự vào kho khi nhắn/đặt.
- **Nhập tay:** tạo/sửa trên trang web2/customers (source=manual).
- **KHÔNG TPOS:** không enrich, không push CreateUpdatePartner, không import 92k. Warehouse độc lập hoàn toàn.
- **SePay match (rework):** match CK ↔ KH theo **phone** trong nội dung CK — KHÔNG dùng TPOS Partner Id nữa.

---

## PHASE 5 — Tích hợp 360 (sau)

- Link ví KH (web2_customer_wallets theo phone) + lịch sử CK (web2_balance_history).
- Link đơn (native_orders + fast_sale_orders theo phone/customer_id).
- Thống kê derived (total_orders/spent/bom_count) cập nhật qua trigger hoặc cron nhẹ.

---

## Quyết định cần user chốt

1. **Tái dùng `web2_order_customers`** làm warehouse (đề xuất) hay tạo bảng mới `web2_customers_master`?
2. **Source of truth = Web2** (TPOS chỉ enrich/push optional) — đúng ý? Hay vẫn muốn TPOS là gốc?
3. **Có cần import 92k partner TPOS** vào kho Web2 ngay không, hay để kho tự đầy dần từ Pancake/đơn?
4. Thứ tự làm: Phase 0 (config) trước rồi 1→5? Hay ưu tiên warehouse trước?

---

## Phụ lục A — Bản đồ TRANG cần dữ liệu KH (consumer map, scan 2026-06-07)

Warehouse phải phục vụ tất cả các trang sau. Cột "khóa tra cứu" = identifier mỗi trang dùng → warehouse PHẢI index/lookup được hết:

| Trang (Web 2.0)                  | Mức dùng      | Khóa tra cứu chính                         | Cần field                                                                             |
| -------------------------------- | ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| **tpos-pancake** (chat)          | RẤT CAO (795) | `psid`, `fb_id`, `global_id`, TPOS Partner | name, phone, fb_id, psid, global_id, fb_page_id, pancake_conversation_id, status/tier |
| **native-orders** (Đơn Web)      | CAO (236)     | `global_id`, `fb_id`, `psid`, phone        | name, phone, address(ward/district/city), fb_id, global_id, tpos_id                   |
| **customer-wallet** (Ví KH)      | CAO (55)      | `by-phone`, Partner                        | phone, name, tpos_id (= Partner Id)                                                   |
| **balance-history** (CK SePay)   | CAO (63)      | `psid`, phone                              | phone, psid, name (match CK ↔ KH)                                                     |
| **partner-customer** (directory) | TB (16)       | TPOS Partner Id                            | toàn bộ (hiện đọc live TPOS)                                                          |
| **ck-dashboard**                 | thấp (7)      | `psid`                                     | phone, psid                                                                           |
| **fastsaleorder-invoice / PBH**  | (qua native)  | phone, customer_id                         | name, phone, address, tpos_id                                                         |

→ **Giá trị cốt lõi của warehouse = ĐỒ THỊ ĐỊNH DANH** (identity graph): centralize map `phone ↔ fb_id ↔ psid ↔ global_id ↔ tpos_id ↔ pancake_customer_id`. Hiện mỗi trang tự resolve ad-hoc (đặc biệt nỗi đau PSID vs Global Id — xem [[reference_fb_psid_vs_globalid]]). Warehouse giải quyết 1 nơi → mọi trang query bằng bất kỳ khóa nào, nhận đủ identity + info.

**Lưu ý Web1⊥Web2:** `inbox/` (legacy N2Store) cũng dùng psid/fb_id/global_id nhưng KHÔNG gọi API web2, chạy DB riêng (chatDb) → KHÔNG nằm trong scope warehouse Web2. Không cross-import.

---

## Phụ lục B — Kho KH Web2 hiện trạng (tránh nhầm)

- `web2_order_customers` (6.533) — **sẽ là warehouse**. Nguồn Pancake/FB. web2Db.
- `web2_customers` (2) — kho nhỏ on-demand cho match CK SePay (`customer_id = TPOS Partner Id`). → Cân nhắc gộp vào warehouse hoặc giữ làm cache match.
- `partner-customer` (TPOS Partner, live `/api/odata/Partner`) — directory TPOS, KHÔNG còn shadow local. Page hiện tại đọc cái này.
