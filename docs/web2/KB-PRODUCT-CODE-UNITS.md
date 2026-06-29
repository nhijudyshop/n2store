<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 KB doc cho NotebookLM + Claude. -->

# KB — Mã sản phẩm & Per-Unit QR Web 2.0 (mint → so-order → Kho SP → unit-scan)

Tài liệu này mô tả **CÁCH THỨC VẬN HÀNH MÃ SẢN PHẨM của Web 2.0**: từ mã SP, mã đơn vị (per-unit), mint, in tem ở **Sổ Order** + **Kho SP**, gán vào **giỏ**, tới **quét tem** ở **unit-scan**. Là nguồn canonical khi code/đụng bất kỳ mắt xích nào. Liên kết từ [`KB-SYSTEM-SERVICES.md`](KB-SYSTEM-SERVICES.md) (tab `web2/system?tab=services`).

**Cập nhật: 2026-06-29.**

---

## 0. Hai con số TUYỆT ĐỐI đừng nhầm

| Khái niệm                 | Ví dụ          | Sinh khi           | Đếm theo         | Nguồn                                  |
| ------------------------- | -------------- | ------------------ | ---------------- | -------------------------------------- |
| **Mã SP** (mã sản phẩm)   | `KHOAODEN`     | Tạo SP             | 1 / 1 SKU        | `Web2ProductCode` (client)             |
| **Mã đơn vị** (unit code) | `KHOAODEN-001` | Tạo SP (theo SL)   | 1 / 1 MÓN VẬT LÝ | server mint, global per `product_code` |
| **STT kệ**                | `3`            | Tạo giỏ livestream | 1 / 1 ĐƠN khách  | `native_orders.campaign_stt`           |

Mô hình **put-wall**: mỗi món vật lý 1 QR riêng → dán tem → đóng gói quét QR → máy báo "bỏ vào kệ STT mấy" của đơn đang cần → kệ đủ hàng → đóng gói.

---

## 1. Mã SP — `Web2ProductCode` ([web2/shared/web2-product-code.js](../../web2/shared/web2-product-code.js))

Công thức: `<PREFIX_NCC><LOẠI><COUNTER?><MÀU><SIZE?>`

- **PREFIX**: nhiều từ → chữ cái đầu mỗi từ ("HÀ NỘI"→`HN`); 1 từ → 2 chữ ("ADIDAS"→`AD`); trùng → +số (`HC1`). so-order thiếu NCC → ép `KHO` (lấy nhãn TAB, [so-order-kho-sync.js](../../so-order/js/so-order-kho-sync.js) `_assignKhoCodes`).
- **LOẠI**: 6 keyword (ÁO→`AO`…), còn lại `MM`. **MÀU**: từ cache Biến Thể (`ĐEN→DEN`, multi→initials). **SIZE**: `SIZE 32→S32`. **COUNTER**: SP đầu họ `(prefix+type)` không số, thứ 2 từ `2`.
- so-order + Kho SP cùng rule (`Web2ProductCode.suggest`). KHÔNG hardcode mã rác.

---

## 2. Mã đơn vị + MINT — theo SL kho (logic chốt 2026-06-29)

**Quy ước user**: SP có **số lượng N → tự tạo `<code>-001` … `<code>-{N}`** (3 số, SL < 1000). Mint ngay **lúc TẠO SP** (so-order _hoặc_ Kho SP), KHÔNG chỉ lúc nhận hàng.

### Nguồn SL = `web2_products.stock + pending_qty` (tổng SL kho)

- Lúc so-order **đặt** (Lưu Nháp): `pending_qty = N`, `stock = 0` → tổng N.
- Lúc **mua/nhận**: `stock = N`, `pending_qty = 0` → tổng vẫn N.
- Bán/ship: `stock` giảm — nhưng **units KHÔNG bị xoá** (tem vật lý + có thể đã gán đơn).

### `ensureUnits` — TOP-UP, KHÔNG SHRINK ([render.com/routes/web2-product-units.js](../../render.com/routes/web2-product-units.js))

`ensureUnits(pool, code, target, opts)`: đảm bảo **tổng** unit của `code` = `target` (thiếu → mint thêm seq tiếp theo `001..target`; **đủ rồi → no-op**; KHÔNG bao giờ xoá). Serial **global per product_code**, advisory-lock per code → race-free, idempotent (gọi nhiều lần an toàn). `ensureUnitsForCodes(pool, codes)` đọc `target = stock+pending_qty` từ web2_products (bỏ SP cha).

> Lifecycle: sau khi bán/ship, `units ≥ target` → ensure no-op → tem trên hàng đã gửi KHÔNG mất. Sửa SL xuống tay cũng không un-mint.

### TRIGGER mint (1 nguồn = web2-products write path)

`web2-products.js` `_syncUnits(pool, codes)` (fire-and-forget, KHÔNG chặn response) gọi sau COMMIT ở **7 handler** đổi SL: `create` · `PATCH /:code` · `adjust-stock` · `adjust-pending` · `upsert-pending` · `confirm-purchase` · `confirm-purchase-partial`.

- **so-order tạo SP** → `Web2ProductsApi.upsertPending` → handler `upsert-pending` → `_syncUnits` mint. ✓
- **Kho SP tạo/sửa SP** → `create`/`patch`/`adjust-*` → mint. ✓
- **so-order nhận hàng** → `confirm-purchase[-partial]` → mint (tổng không đổi → thường no-op). ✓
- ⇒ Units có sẵn **TRƯỚC khi SP vào giỏ** (reconcile cần unit để gán STT).

### `POST /ensure {productCodes}` — cho client (in tem)

Server đọc SL → top-up → trả `{ byCode: { [code]: [units] } }`. Dùng bởi:

- **so-order print** (`so-order-barcode.js` `_attachUnitCodes`) — **đã BỎ mint per-shipment**, dùng `/ensure` (tránh double với hook web2-products).
- **Kho SP print** (`web2-products-render.js` `_attachUnitsForPrint`) — self-heal SP tạo trước feature / SL vừa tăng.

> Endpoint cũ `POST /mint` (per `product_code, shipment_id`) còn để legacy, KHÔNG còn caller chính.

---

## 3. Mã đơn vị ↔ GIỎ ↔ STT (gán tự động)

- **Giỏ = `native_orders` status `draft`**; line-items = `products` JSONB. Thêm SP vào giỏ ở [live-chat](../../live-chat/index.html) (drag) hoặc [native-orders](../../native-orders/index.html) → `reconcileOrderUnits` gán unit.
- **Thứ tự gán = seq NHỎ NHẤT trước** (`ORDER BY u.seq ASC`): lấy `-001, -002, …`. **Unit bị bỏ khỏi giỏ → quay lại pool → lần sau TÁI DÙNG seq nhỏ đó TRƯỚC số cao hơn** (002 freed → add lấy 002, không nhảy 007). Nhả khi giỏ giảm SL: highest-seq-first (giữ 001 ổn định). `freeOrderUnits` khi xoá đơn.
- **STT kệ = 1 NGUỒN** [`render.com/lib/web2-shelf-stt.js`](../../render.com/lib/web2-shelf-stt.js) `shelfStt(row)` = `campaign_stt ?? display_stt`. Dùng chung: tem (`reconcileOrderUnits` đóng `order_stt`), unit-scan, popup giỏ board/TV (`web2-campaign-products` /cart-detail), badge đơn native-orders (`computeOrderStt`). Đơn GỘP hiện campaign_stt MỚI + dấu ⛓ (khớp tem).

---

## 4. Quét tem — unit-scan ([web2/unit-scan/](../../web2/unit-scan/index.html))

PWA mobile, READ-MOSTLY (write duy nhất = reprint `print_count++`; **KHÔNG nút Gán** — gán tự động ở luồng giỏ). Luồng: camera/QR `?u=<id>`/gõ tay → `GET /resolve` → `{ unit, product, orders, clearance, metrics }`:

- **STT hero**: unit `ASSIGNED` → "Đã ở kệ N"; chưa → đơn FIFO đầu còn thiếu "Bỏ vào kệ N".
- **Danh sách "Tất cả tem của SP này (N)"** (ẩn/bật): mỗi unit → STT kệ hoặc chip "kho"; highlight tem đang quét; summary "X đã vào giỏ · Y còn kho". Nguồn `/by-product/:code`.
- **In lại tem này**: reprint 1 unit (QR id cố định) qua `Web2ProductsPrint`.
- SSE `web2:product-units` → tự refresh đa-máy.

---

## 5. Engine in tem (DÙNG CHUNG) — `Web2ProductsPrint` (`web2/products/js/web2-products-print-*.js`)

5 module (utils→barcode→render→modal→entry, `window.W2PP`). Dùng bởi **cả Kho SP, so-order, unit-scan reprint**. Mỗi tem: **QR** (encode `.../web2/unit-scan/?u=<id>`) + mã đơn vị (chữ dưới QR) + tên + biến thể + giá. QR to (2026-06-29: `qrMm` 0.58×ngang / 0.72×cao → ~14.4mm trên tem 25×21). Khổ mặc định "2 Tem 66×21mm". In thẳng máy tem IP (`Web2Printer`) hoặc overlay iframe.

---

## 6. CÁC NÚT IN — kiểm kê (⚠ nhiều, có thể gộp bớt)

| #   | Trang     | Nút                      | Code                                               | Hành vi (sau 2026-06-29)         |
| --- | --------- | ------------------------ | -------------------------------------------------- | -------------------------------- |
| 1   | Kho SP    | "In tem" từng dòng       | `printBarcode` (web2-products-actions)             | `/ensure` → in units = SL        |
| 2   | Kho SP    | "In tem (N)" bulk        | `#w2pBulkPrint`→`_bulkPrint`                       | `/ensure` → in units = SL        |
| 3   | Kho SP    | "In lại tem"             | `#btnReprintUnits`→`Web2UnitReprint`               | tìm SP → list unit → in chọn lọc |
| 4   | so-order  | "In tem" panel Nhận hàng | `#soReceivePrintBtn`→`printLabelsFromReceivePanel` | `/ensure` → in                   |
| 5   | so-order  | auto sau xác nhận nhận   | `confirmReceive`                                   | `/ensure` → in                   |
| 6   | unit-scan | "In lại tem này"         | `reprintUnit`                                      | reprint 1 unit                   |

**Cơ hội gộp** (user lưu ý "nhiều nút in có thể loại bớt"): sau khi mint chuyển sang model "units = SL + /ensure self-heal", nút **(1)(2)(3) ở Kho SP gần như trùng vai** — đều ensure rồi in. Có thể gộp về **1 nút "In tem"** (chọn SP / chọn unit trong cùng modal) + bỏ "In lại tem" riêng. **Chưa thực hiện** — chỉ ghi nhận để refactor sau khi xác nhận.

---

## 7. Data model + Endpoints + SSE

- **Bảng** (web2Db): `web2_product_units` (1 row/món: `unit_code` UNIQUE, `product_code`, `seq`, `supplier`, `shipment_id`, `print_count`, `status` `IN_STOCK→ASSIGNED→PACKED→SHIPPED`/`RETURNED`, `order_id/order_code/order_stt/customer_*`, `clearance_state`); `web2_product_unit_events` (audit MINT/PRINT/ASSIGN/UNASSIGN/…).
- **Endpoints** `/api/web2-product-units`: `POST /ensure` (mint theo SL — MỚI) · `POST /mint` (legacy per-shipment) · `GET /resolve` · `GET /by-product/:code` · `POST /by-orders` · `GET /:id/events` · `POST /reprint` · `POST /assign` (manual, ít dùng) · `POST /:id/status` · `GET /clearance` + `POST /:id/clearance` (admin) · `POST /assign-auto`.
- **Auto-assign** (luồng thật, KHÔNG nút): `reconcileOrderUnits`/`freeOrderUnits` gọi từ `native-orders.js` (create/PATCH/cancel) + `v2/cart.js` (drag giỏ live / xoá đơn), fire-and-forget.
- **SSE**: topic `web2:product-units` (hub web2). Pool `web2Db || chatDb`. Backend chạy **web2-api** (deploy mới có hiệu lực).

---

## 8. Luồng end-to-end

```
Tạo SP (so-order Lưu Nháp / Kho SP) — SL N
  → web2-products _syncUnits → ensureUnits(code, stock+pending=N) → SP-001..SP-N
Kéo SP vào giỏ (live-chat) / thêm ở native-orders
  → reconcileOrderUnits → gán unit seq NHỎ NHẤT còn trống → order_stt = shelfStt(đơn)
Bỏ SP khỏi giỏ → unit về pool (IN_STOCK) → lần sau tái dùng seq nhỏ đó
In tem (Kho SP / so-order) → /ensure (đủ SL) → Web2ProductsPrint → QR ?u=<id>
Đóng gói: quét QR → unit-scan /resolve → "Bỏ vào kệ <STT>" + danh sách tem → STT
Kệ (đơn) đủ hàng → đóng gói → ship
```
