# Web 2.0 Flow Audit — Round 4 (2026-06-27)

> Vòng 4 = **vòng XÁC MINH** (verification), nối R1/R2/R3. Trọng tâm: 2 báo cáo user yêu cầu kiểm đúng (`report-warehouse`, `report-revenue`) + công thức lương/khoá kỳ + **luồng SePay webhook → ví Web 2.0** (user yêu cầu test bằng webhook tạo giao dịch). **Kết quả: báo cáo + lương ĐÚNG; tìm + fix 1 bug THẬT trong luồng SePay** (CHECK constraint thiếu `pending_no_order` → gate marker fail → retry storm). Verify bằng integration test Postgres thật. 1 limitation cosmetic ghi nhận (không fix).

## Tổng quan

| Khu vực                                                                           | Kết quả                                 | Verify                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `web2-warehouse-report` — math mua vào / chưa nhận / bán ra + rollup địa danh/NCC | ✅ ĐÚNG                                 | 29 assertions (`warehouse-test.js`)                         |
| `pbh-reports` revenue + refund KPI (web2_returns)                                 | ✅ ĐÚNG (R1 #12 fix giữ nguyên)         | đọc code, refund `status='active' AND created_at>=cutoffMs` |
| Lương: công thức `cham-cong-salary.js` vs `validateLockSnapshot` server           | ✅ KHỚP                                 | đọc code đối chiếu                                          |
| Snapshot khoá kỳ: shape `m` ↔ field validator đọc                                 | ✅ KHỚP                                 | đọc code                                                    |
| **SePay webhook → ví Web 2.0** (deposit/gate/QR/idempotency)                      | ✅ ĐÚNG + 🐞 1 bug FIXED                | 22 assertions (`sepay-webhook-test.js`)                     |
| Warehouse: SP unmatched có variant → tách dòng buy/sell                           | ⚠ limitation cosmetic (totals vẫn đúng) | không fix                                                   |

---

## 1. Warehouse report — math ĐÚNG (29 assertions)

Verify `GET /api/web2-warehouse-report/summary?from&to` trên Postgres thật, seed Sổ Order + Kho SP + PBH:

- **Mua vào (đã nhận)**: `received`→qty đủ; `partial_received`→`min(qtyReceived, qty)`; `draft`→0; `cancelled`→loại hoàn toàn. ✅ (KHOAO1 received 10→buyQty 10; KHOAO2 partial 3/10→buyQty 3 + pendingQty 7; KHOAO3 draft 5→pendingQty 5; KHOAO4 cancelled→ẩn).
- **Tiền**: `costPrice × tab.rate` (tỷ giá→VND). ✅ (KHOAO1 10×100×1000=1.000.000; KHOAO2 buy 3×50×1000=150.000 + pending 7×50×1000=350.000).
- **Bán ra**: CHỈ `fast_sale_orders state='done'` trong range theo `date_invoice` (GMT+7). `confirmed`/done-ngoài-range KHÔNG đếm. ✅ (KHOAO1 bán 4×200.000=800.000; bỏ qua đơn confirmed 100 + done cũ 50).
- **Lọc ngày mua**: theo `shipment.date` (chuỗi YYYY-MM-DD); ngoài range loại. ✅ (shipment 2026-01-01 với qty 99 bị loại).
- **Merge buy↔sell theo CODE**: SP có cả mua + bán → **1 dòng** (không tách). ✅
- **Rollup ĐỊA DANH (cha) + NCC + totals reconcile**: Σ(regions)=Σ(suppliers)=Σ(products)=totals cho mọi cột. ✅ (Σ regions.buyAmount = totals.buyAmount = 1.150.000; Σ suppliers.sellAmount = totals.sellAmount = 800.000). productCount/supplierCount/regionCount đúng.

→ Báo cáo kho **chính xác** đúng yêu cầu user ("debug report-warehouse hoạt động chính xác").

## 2. Revenue report — ĐÚNG

`pbh-reports`: revenue = `SUM(amount_total) FILTER (state != 'cancel')` (today dùng `(date_invoice AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = today VN`); refund KPI (R1 #12) = `web2_returns WHERE status='active' AND created_at >= cutoffMs` (BIGINT epoch ms). Múi giờ GMT+7 nhất quán (Render TZ=+7). Không bug.

> _Ghi chú semantic (không phải bug)_: revenue đếm cả `draft`+`confirmed` (state≠cancel) = "doanh thu đã lập phiếu"; warehouse "bán ra" chỉ đếm `done` = "đã giao/hoàn thành". Hai báo cáo CỐ Ý khác mốc — không trộn.

## 3. Lương / khoá kỳ — công thức KHỚP

`cham-cong-salary.js:252-256`: `giamTru = lateDeduction + giamTruManual`; `tongLuong = luongChinh + lamThem + phuCap + thuong − giamTru`; `conCanTra = tongLuong − daTra`. Đối chiếu `web2-attendance.js validateLockSnapshot`: `expTong = luongChinh + lamThem + phuCap + thuong − giamTru` + `conCanTra = tongLuong − daTra` → **trùng khít**. Snapshot row `m` = full object `calcMonth` (đủ field validator đọc). Tổng snapshot dedup 1 NV nhiều PIN khớp tổng bảng render. Không bug.

## 4. ⚠ Limitation cosmetic (KHÔNG fix) — SP unmatched có variant tách dòng

Khi 1 SP **không có trong `web2_products`** (không resolve được code) VÀ row Sổ Order có `variant`: bucket mua vào key = `N:norm(name)|norm(variant)`, bucket bán ra key = `N:norm(name)|` (PBH line không tách field variant) → 2 key khác nhau → SP hiện **2 dòng** (1 mua-only, 1 bán-only). **Totals/region/supplier VẪN ĐÚNG** (mỗi bên đếm 1 lần) — chỉ là tách dòng hiển thị cho SP chưa map kho.

**KHÔNG fix** vì: (a) báo cáo kho dành cho SP ĐÃ map kho (case thường merge đúng theo code); (b) ép name-only ở buy sẽ over-merge các variant khác nhau cùng tên (sai nặng hơn); (c) PBH line không có field variant tin cậy để tách. Chấp nhận giới hạn, ưu tiên không over-merge.

---

## 5. SePay webhook → ví Web 2.0 — E2E test + 🐞 fix bug constraint

User: _"sepay có chức năng webhook tạo giao dịch nên bạn dùng tạo giao dịch để test chức năng web 2.0"_.

**Kiến trúc**: webhook `/api/sepay/webhook` là endpoint VẬT LÝ dùng chung, fan-out 2 nhánh ĐỘC LẬP: Web 1.0 (`balance_history` + `processDebtUpdate`) và Web 2.0 (`_processWeb2Path` → `insertWeb2BalanceHistory` + `processWeb2Match` → ví `web2_*`). Test đi ĐÚNG nhánh Web 2.0 (như fan-out + retry cron `server.js:350`), **KHÔNG đụng Web 1.0** (tôn trọng tách lớp — user nhắc đúng).

**Verify 22 assertions** (`sepay-webhook-test.js`, Postgres thật): A) SĐT match + đơn active → auto-credit `exact_phone`; B) trùng `sepay_id` → idempotent (không double); C) CK thứ 2 cùng KH → cộng dồn, đúng 2 GD nạp; D) SĐT có KH nhưng KHÔNG đơn → **gate chặn** (`pending_no_order`, không credit); E) QR → bypass gate → credit; F) `transferType=out` → không credit; G) amount ≤ 0 → từ chối.

### 🐞 Bug FIXED — CHECK constraint thiếu `pending_no_order` → gate marker fail → retry storm

**Phát hiện qua test**: scenario D gate đúng (không credit tiền — money AN TOÀN) NHƯNG `match_method` không lưu được. Root cause: `_gateBlock` (`web2-sepay-matching.js:362`) ghi `UPDATE ... SET match_method='pending_no_order'`, value này dùng từ 2026-06-07 + reprocess exclusion 2026-06-20, **NHƯNG KHÔNG có trong CHECK constraint** `web2_balance_history_match_method_check`. Guard migration cũ `IF EXISTS constraint THEN RETURN` → constraint tạo 1 lần, không bao giờ update danh sách → prod thiếu value.

**Hệ quả**: UPDATE vi phạm constraint → throw → bị `try/catch` của `_gateBlock` nuốt → `match_method` giữ NULL → `reprocessUnmatched` (exclusion `NOT IN (...,'pending_no_order')`) KHÔNG loại được row gated → **cron re-process mỗi 10 phút mãi mãi (retry storm)** + đếm sai là `no_match`. (Tiền KHÔNG bị credit sai — gate return trước `processDeposit`; bug là correctness/efficiency, MEDIUM.)

**Fix** (`web2-sepay-matching.js`): (1) thêm `'pending_no_order'` vào danh sách CHECK; (2) đổi guard SELF-HEAL — chỉ `RETURN` khi `pg_get_constraintdef` ĐÃ chứa `pending_no_order`, thiếu → `DROP + ADD` (1 lần, idempotent sau đó → không lock lần deploy sau). Verify: constraint test DB tự heal, scenario D giờ lưu `pending_no_order`, re-run idempotent.

---

## Phương pháp

Integration test trên Postgres local `n2store_flow_test`, seed dữ liệu thật, assert từng con số, KHÔNG đụng prod. Harness: `warehouse-test.js` (29 — báo cáo kho) + `sepay-webhook-test.js` (22 — SePay→ví, nhánh Web 2.0 thuần). R4: fix 1 bug (`web2-sepay-matching.js` CHECK constraint) + verify 51 assertions.
