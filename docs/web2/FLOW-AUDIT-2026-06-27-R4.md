# Web 2.0 Flow Audit — Round 4 (2026-06-27)

> Vòng 4 = **vòng XÁC MINH** (verification), nối R1/R2/R3. Trọng tâm: 2 báo cáo user yêu cầu kiểm đúng (`report-warehouse`, `report-revenue`) + công thức lương/khoá kỳ. **Kết quả: 0 bug code mới** — code (gồm `web2-warehouse-report.js` mới viết) đã ĐÚNG; verify bằng integration test Postgres thật. 1 limitation cosmetic ghi nhận (không fix vì fix có rủi ro over-merge).

## Tổng quan

| Khu vực                                                                           | Kết quả                                 | Verify                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `web2-warehouse-report` — math mua vào / chưa nhận / bán ra + rollup địa danh/NCC | ✅ ĐÚNG                                 | 29 assertions (`warehouse-test.js`)                         |
| `pbh-reports` revenue + refund KPI (web2_returns)                                 | ✅ ĐÚNG (R1 #12 fix giữ nguyên)         | đọc code, refund `status='active' AND created_at>=cutoffMs` |
| Lương: công thức `cham-cong-salary.js` vs `validateLockSnapshot` server           | ✅ KHỚP                                 | đọc code đối chiếu                                          |
| Snapshot khoá kỳ: shape `m` ↔ field validator đọc                                 | ✅ KHỚP                                 | đọc code                                                    |
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

## Phương pháp

Integration test mount route Express thật trên Postgres local `n2store_flow_test`, seed Sổ Order (JSONB doc) + Kho SP + PBH, assert từng con số + reconcile rollup, KHÔNG đụng prod. Harness: `warehouse-test.js` (29). R4 không đổi code → chỉ doc.
