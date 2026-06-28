<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 design doc — per-unit product code + QR tracking. -->

# Per-unit Product Code + QR Tracking (Web 2.0)

**Trạng thái:** đã hiện thực đợt 1–4 (2026-06-28). Mỗi MÓN VẬT LÝ của 1 SP có 1 mã đơn vị riêng + QR riêng → in tem dán lên món → quét ngoài (điện thoại) để biết SP của NCC nào / đợt nào / đã in mấy lần / thuộc đơn nào → bỏ vào **kệ STT** của đơn. Đủ hàng → đóng gói.

> Đây là mô hình **put wall / kệ chia đơn (sortation wall)**: đơn (digital) gắn khách + ô kệ STT; quét món vật lý → định tuyến vào ô kệ.

---

## 1. Quyết định đã chốt (user)

| Khía cạnh             | Chốt                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mã đơn vị             | `<product_code>-<serial 3 số>` (vd `KHOAODEN-017`). Serial **server cấp atomic** (advisory-lock theo product_code), **global theo SP** (đợt12→001-010, đợt15→011-018). |
| QR                    | URL ngắn + id: `<origin>/web2/unit-scan/?u=<id>` → camera điện thoại mở thẳng trang trace.                                                                             |
| Kệ STT                | = `native_orders.campaign_stt` (per chiến dịch → bounded; fallback `display_stt`). **KHÔNG** bin-pool mới.                                                             |
| Gán đơn ↔ khách ↔ STT | Từ lúc tạo giỏ livestream (native-orders đã có STT).                                                                                                                   |
| Gán unit ↔ đơn        | Lúc QUÉT đóng gói (nhân viên quét món → chọn đơn → bỏ vào kệ STT).                                                                                                     |
| Tem                   | Giữ layout "2 Tem (66×21mm)" của Kho SP. Chỉ **mã SP** thành riêng/tem + **QR** thành URL; tên/giá/biến thể giữ nguyên.                                                |
| Trang quét            | Phone-native, khuôn `live-chat/comments-mobile.html` + `Web2BarcodeScanner`.                                                                                           |

**Vì sao server cấp serial:** audit `Web2ProductCode` chứng minh client tự đếm (cache snapshot) bị **đua-race sinh trùng**. Serial cấp ở DB (advisory-xact-lock) → race-free.

---

## 2. Data model (web2Db)

**`web2_product_units`** — 1 dòng / món vật lý
`id` · `unit_code` UNIQUE (KHOAODEN-017) · `product_code` · `seq` · `supplier` (NCC nguồn) · `shipment_id` (đợt) · `print_count` · `status` (IN_STOCK→ASSIGNED→PACKED→SHIPPED / RETURNED) · `order_id` · `order_code` · `order_stt` (kệ) · `customer_name` · `customer_phone` · `created_by` · `created_at` · `updated_at`.

**`web2_product_unit_events`** — lịch sử (MINT/PRINT/ASSIGN/UNASSIGN/PACK/SHIP/RETURN) → "tất cả đơn của qr1/qr2/qr3" + truy NCC/đợt.

Cả 2 bảng `ensureTables()` idempotent mỗi boot trong [`render.com/routes/web2-product-units.js`](../../render.com/routes/web2-product-units.js).

---

## 3. Backend — `/api/web2-product-units` ([route](../../render.com/routes/web2-product-units.js))

| Method | Path                                    | Việc                                                                                                                                                                         |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/mint`                                 | Cấp N unit cho `(product_code, supplier, shipment_id, qty)` — **IDEMPOTENT** theo (product_code, shipment_id); advisory-lock theo product_code. Trả `[{id, unitCode, seq}]`. |
| GET    | `/resolve?u=<id>` / `?code=<unit_code>` | Quét: unit + SP (tên/giá/ảnh) + **đơn mở chứa product_code** (kệ STT, khách, sđt, đặt/đã-gán/còn-thiếu).                                                                     |
| GET    | `/by-product/:code`                     | List qr1..qrN của 1 SP.                                                                                                                                                      |
| GET    | `/:id/events`                           | Lịch sử 1 unit.                                                                                                                                                              |
| POST   | `/reprint`                              | `print_count++` + event PRINT.                                                                                                                                               |
| POST   | `/assign`                               | Gán `unit → order` (set order*\*/customer*\*/`status=ASSIGNED`, ghi STT, event ASSIGN). Trả `fulfillment {totalOrdered, assigned, complete}`.                                |
| POST   | `/:id/status`                           | Chuyển trạng thái (PACKED/SHIPPED/RETURNED/IN_STOCK; unassign khi RETURNED/IN_STOCK).                                                                                        |

- Pool: `web2Db || chatDb`. Mutation gate: `requireWeb2AuthSoft`. GET mở.
- SSE: `_notify(action, …)` → topic **`web2:product-units`** (wired `initializeNotifiers` trong server.js).
- Định tuyến đơn: query `native_orders` (`status≠cancelled`, `EXISTS jsonb_array_elements(products) e WHERE COALESCE(e->>'productCode',e->>'code')=$1`), ORDER BY `campaign_stt ASC NULLS LAST, created_at ASC` (FIFO).

---

## 4. Tích hợp frontend

**In tem per-unit** (so-order receive → in):

- [`so-order/js/so-order-barcode.js`](../../so-order/js/so-order-barcode.js) `printLabelsFromReceivePanel` → `SO._attachUnitCodes(products)` mint units (per `product_code`+`shipmentId`+`supplier`), gắn `units:[{unitCode, qrUrl}]`, bump `/reprint`. Lỗi mint → **fallback** in mã SP cũ (không chặn in).
- Shared print: [`web2-products-print-modal.js`](../../web2/products/js/web2-products-print-modal.js) `generateAndPrint` — nếu `item.units` có, mỗi tem lấy `unitCode` (chữ dưới QR) + `qrUrl` (nội dung QR); QR key theo `qrText`. [`web2-products-print-render.js`](../../web2/products/js/web2-products-print-render.js) lookup QR theo `label.qrText`. **Backward-compat**: không `units` → hành vi cũ (lặp mã, QR=mã SP).

**Trang quét** [`web2/unit-scan/`](../../web2/unit-scan/) (mobile, phone-native):

- `index.html` (khuôn comments-mobile: viewport-fit, theme-color #0068ff, auth-guard inline, manifest riêng PWA) · `css/unit-scan.css` (Zalo-blue, safe-area, anti-lag) · `js/unit-scan.js`.
- `Web2BarcodeScanner.mount(host, {onScan, continuous, dedupeMs})` quét camera; `parseScan()` tách `?u=<id>` / `?code=` / unit_code.
- Deep-link `?u=<id>` (camera điện thoại mở) → resolve ngay.
- Hiển thị: SP + NCC/đợt + print_count; **"BỎ VÀO KỆ STT <n>"**; list đơn chờ (FIFO suggest amber) → tap **Gán**; lịch sử event.
- SSE `Web2SSE.subscribe('web2:product-units')` → máy khác gán → tự refresh.

---

## 5. Luồng end-to-end

1. so-order tạo SP → **nhận hàng** (SL N, NCC X, đợt) → in tem → `mint` N unit `KHOAODEN-001..N` (đóng dấu NCC+đợt) → in N tem (mỗi tem QR `?u=<id>` + chữ `KHOAODEN-017`).
2. Dán tem lên từng món.
3. Livestream kéo SP vào giỏ khách → `native_orders` (product_code + `campaign_stt`).
4. Đóng gói: **quét QR món** → trang hiện NCC/đợt/in-mấy-lần + **kệ STT** đơn cần → bỏ vào kệ → `assign` (unit→đơn→STT).
5. Kệ (đơn) đủ hàng → "ĐỦ HÀNG, đóng gói" → ship.

---

## 6. Còn lại / mở rộng (chưa làm)

- Bump `print_count` chính xác theo lần in THẬT (hiện bump khi mint-for-print; chấp nhận MVP).
- Nút "Quét QR" vào sidebar/menu (hiện truy cập qua QR deep-link + URL trực tiếp).
- Trang `web2/products` hiện qr1..qrN của 1 SP (đã có API `/by-product/:code`, chưa gắn UI).
- Trạng thái PACKED/SHIPPED hàng loạt theo kệ.
- Test E2E sau deploy (route chạy trên web2-api Render — cần push để Render redeploy).
