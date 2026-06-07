<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 plan. -->

# PLAN — Kho dữ liệu Khách hàng riêng Web 2.0 + tách config (deliveryzone/printer)

> Trạng thái: **ĐÃ DUYỆT HƯỚNG — đang làm Phase 0**. Ngày: 2026-06-07.
>
> **Quyết định user (2026-06-07):**
>
> 1. Kho KH = **BẢNG MỚI** (không extend web2_order_customers). Tên dự kiến `web2_customers` — ⚠ va chạm bảng cũ web2_customers (2 rows cache match SePay) → Phase 1 phải đổi tên warehouse (vd `web2_customers_master`) HOẶC gộp/replace bảng cũ (beta nên có thể drop bảng cũ 2 rows + chuyển logic SePay match sang warehouse). Chốt ở Phase 1.
> 2. **Dữ liệu mới hoàn toàn** — beta test, KHÔNG import 92k TPOS, KHÔNG migrate 6.533 web2_order_customers. Kho bắt đầu RỖNG, tự đầy từ Pancake/đơn về sau.
> 3. Thứ tự: **Phase 0 (config) TRƯỚC**, rồi Phase 1-5.

> Bối cảnh: đã tắt TPOS shadow sync (partner-customer giờ chạy live 2 chiều). User muốn Web 2.0 có **kho KH của riêng mình** (không phụ thuộc TPOS), schema giàu như TPOS Partner + đủ field cho FB/Pancake.

---

## 0. Nguyên tắc chủ đạo

- **TÁI SỬ DỤNG, không build từ 0.** Web 2.0 ĐÃ có kho KH: `web2_order_customers` (web2Db, 6.533 rows) — nguồn Pancake/FB webhook, đã có phone/name/address/email/fb_id/pancake_data/status/tier/tpos_id/tpos_data/aliases. → Nâng cấp bảng này thành **Customer Warehouse** chính thức, KHÔNG tạo bảng thứ 4 (tránh thêm kho KH chồng chéo: hiện đã có web2_order_customers + web2_customers + TPOS partner live).
- **Web2 là source of truth của KH** (khác hiện tại: partner-customer page đọc live TPOS). TPOS chỉ là 1 nguồn enrich + đích push 2 chiều (optional).
- Mọi thứ theo convention Web 2.0: table `web2_*`, route `/api/web2-customers`, SSE `web2:customers`, pool `web2Db`.

---

## PHASE 0 — Tách config deliveryzone + printer ra bảng riêng (quick win, task 1)

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

## PHASE 1 — Schema Customer Warehouse (extend web2_order_customers)

**Field hiện có (giữ):** id, phone (UNIQUE), name, address, email, fb_id, pancake_data JSONB, status, tier, tpos_id, tpos_data JSONB, aliases, created_at, updated_at.

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

**Index:** phone (UNIQUE đã có), fb_id, global_id, pancake_customer_id, tpos_id, GIN(tags), GIN(to_tsvector name).

**Dedup key:** `phone` (chính) + fallback `fb_id`/`global_id`. Merge tool xử lý trùng.

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

- **Ingest Pancake/FB (chính):** webhook đơn → `POST /upsert` (phone/fb*id/global_id/pancake*\*). Đây là nguồn tự nhiên — KH tự vào kho khi nhắn/đặt.
- **Enrich TPOS (pull, on-demand):** khi thiếu địa chỉ/tpos_id → gọi `searchCustomerByPhone` (đã có) điền vào, lưu tpos_id.
- **Push TPOS 2 chiều (optional):** khi sửa KH ở Web2 → `CreateUpdatePartner` (đã có ở tpos-customer-service) cập nhật TPOS Partner. Cờ bật/tắt.
- **Import 1 lần (optional):** nếu muốn seed từ TPOS 92k partner → chạy seeder ghi vào `web2_order_customers` (KHÔNG dùng lại web2_records shadow).

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
