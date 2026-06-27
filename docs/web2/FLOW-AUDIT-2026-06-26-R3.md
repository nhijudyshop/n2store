# Web 2.0 Flow Audit — Round 3 (2026-06-26)

> Vòng 3 audit luồng tiền/kho/chấm-công Web 2.0, nối tiếp [R1](FLOW-AUDIT-2026-06-26.md) (12/12 fixed) + [R2](FLOW-AUDIT-2026-06-26-R2.md) (13/13 fixed). Trọng tâm R3: các luồng PHỤ chưa soi kỹ ở R1/R2 — **PBH tách (split)**, **chấm công / khoá kỳ lương**, **sổ quỹ / chi tiêu (soquy)**, **voucher**. Mỗi finding verify bằng integration test trên Postgres thật (DB `n2store_flow_test`, mount route Express thật) trước khi đánh ✅.

## Tổng quan

| #   | Mức         | Khu vực                                 | Trạng thái                        |
| --- | ----------- | --------------------------------------- | --------------------------------- |
| 1   | HIGH        | order-tags / PBH tách                   | ✅ FIXED (`8b5c4b22a`)            |
| 2   | MEDIUM→HIGH | chấm công / khoá kỳ lương               | ✅ FIXED (`fe89e6ebb`)            |
| 5   | LOW         | sổ quỹ — biên ngày cuối sub-second      | ✅ FIXED                          |
| 3   | MEDIUM      | soquy — optimistic update số dư stale   | ✅ verified KHÔNG phải bug        |
| 4   | MEDIUM      | soquy — giao dịch lùi ngày double-count | ✅ verified KHÔNG phải bug        |
| 6   | LOW         | payroll override merge-on-omit          | ✅ verified KHÔNG phải bug        |
| 7   | LOW         | nhập Excel — double-count khi trùng     | ⚠ KHÔNG fix (fix gây regress SSE) |
| 8   | LOW         | voucher — fallback mã rỗng              | ✅ verified KHÔNG phải bug        |

> **Kết luận R3**: 8 finding → **3 thật** (1, 2, 5 đã FIXED + verify integration test); **5 còn lại là false-positive / nếu "fix" sẽ gây regression** — đã xác minh từng cái với code thật (xem dưới). Đây là kết quả của vòng verify đối kháng: KHÔNG sửa mù finding suy đoán.

---

## #1 [HIGH] ✅ — PBH tách: tag tổng hợp đọc nhầm chỉ bill đầu

**Triệu chứng:** đơn `native_order` tách thành N PBH cùng `source_code`. Query enrich tag trước dùng `DISTINCT ON (source_code)` → chỉ đọc **bill#1**. Đơn có bill#1 trả đủ + delivered, bill#2 còn nợ 200k + draft → bị gắn `pbh_chua_tt = false` (ẩn nợ 200k) + `da_doi_soat = true` (đối soát sớm sai).

**Fix:** enrich AGGREGATE theo `source_code` (`render.com/routes/native-orders.js`):

- `SUM(residual)` → `pbhResidual` (còn nợ nếu BẤT KỲ bill nợ);
- `SUM(amount_total)` → `pbhTotal`;
- `BOOL_AND(fulfillment_state IN ('packed','shipped','delivered'))` → `pbhAllReconciled` (chỉ đối soát khi MỌI bill đóng gói+);
- predicate `da_doi_soat` (`web2-order-tags-service.js`) dùng `pbhAllReconciled` (fallback bill đơn khi undefined).

**Verify:** 9 assertions (split nợ → `pbh_chua_tt=T`/`da_doi_soat=F`; cả hai trả đủ+đóng gói → `F`/`T`). Commit `8b5c4b22a`.

---

## #2 [MEDIUM→HIGH] ✅ — Khoá kỳ lương KHÔNG enforce server-side

**Triệu chứng:** chốt kỳ lương (`web2_attendance_period_lock`) chỉ chặn ở **frontend** (state của tháng đang xem). Tab cũ / tab tháng khác / gọi API trực tiếp vẫn mutate được punch, payroll, fullday, holiday của tháng ĐÃ CHỐT → số liệu lệch snapshot lương đã duyệt (rủi ro tiền lương). Nâng mức MEDIUM→HIGH vì chạm tiền lương + bypass trivial.

**Fix:** thêm guard server-side `isMonthLocked(db, monthKey)` (`render.com/routes/web2-attendance.js`) + gọi ở đầu mọi mutation map về 1 tháng, reject `409` nếu tháng có row trong `web2_attendance_period_lock`:

- `POST /records` (thêm punch tay) — derive monthKey từ `check_time`;
- `DELETE /records/:id` — lookup `date_key` của record → monthKey;
- `PUT /payroll/:id` — monthKey nằm trong id (`{emp}_{YYYY-MM}`);
- `POST /fullday` + `DELETE /fullday/:id` — monthKey từ `date_key`;
- `POST /holidays` + `DELETE /holidays/:dateKey` — monthKey từ `date_key`.

Fail-open nếu bảng lock chưa tồn tại / lỗi đọc (không chặn nhầm khi schema chưa migrate). Agent ingest tự động (`POST /records/bulk`, ADMS) KHÔNG bị chặn — snapshot đã đông cứng nên punch nền không sửa số liệu đã chốt; chỉ chặn mutation admin tay.

**Verify:** 18 assertions (`lock-test.js`): trước khoá mọi mutation tháng 05 → 200; sau khoá → 409 (7 route); tháng khác (2026-04) không ảnh hưởng; mở khoá → cho qua lại.

---

## #5 [LOW] ✅ — sổ quỹ: biên ngày cuối bỏ sót phiếu sub-second

**Triệu chứng:** filter ngày của cashbook (`/summary`, `/report`, `/vouchers`) dùng biên cuối `voucher_time <= ${end}T23:59:59+07:00`. Phiếu có `voucher_time` trong giây cuối với sub-second (vd `23:59:59.700`) bị LOẠI → tổng thu/chi + số dư cuối kỳ thiếu phiếu đó.

**Fix:** đổi sang biên EXCLUSIVE đầu ngày kế: `voucher_time < (end + 1 ngày)T00:00:00+07:00` (`render.com/routes/web2-cashbook.js` summary+report, `render.com/lib/web2-cashbook-lib.js` buildVoucherFilter). Nhất quán với biên đầu kỳ (`>= start T00:00`). +1 ngày an toàn vì VN không DST.

**Verify:** 7 assertions (`cashbook-test.js`): seed phiếu `23:59:59.700` (trong kỳ) + `00:00:00.000` ngày kế (ngoài kỳ) → summary receipts = 150k (gồm sub-second, loại ngày kế), report receipt total = 150k, list gồm START+SUBSEC loại NEXTDAY.

---

## #3 [MEDIUM] ✅ verified KHÔNG phải bug — soquy optimistic số dư stale

Kiểm code thật `web2/chi-tieu/js/chi-tieu-app.js`: **KHÔNG có** optimistic balance. Sau MỌI mutation (create/update/cancel voucher) gọi `await loadAll()` → re-fetch CẢ danh sách phiếu LẪN `/summary` (số dư) tươi từ server (line 423-427, 260-262). Cross-tab reconcile qua `Web2SSE.subscribe('web2:cashbook')` debounce 600ms → `loadAll` (line 614-618). Số dư luôn lấy từ server, không cộng/trừ cục bộ. Finding suy đoán trên module shape không khớp.

## #4 [MEDIUM] ✅ verified KHÔNG phải bug — soquy back-dated double-count

Cashbook KHÔNG cache report server-side: `/summary` + `/report` query DB tươi mỗi lần với date filter. Số dư đầu kỳ = `voucher_time < start`; trong kỳ = `[start, nextDay)` (sau fix #5). Phiếu lùi ngày rơi đúng 1 period theo `voucher_time` → đếm ĐÚNG 1 lần (hoặc trong opening, hoặc trong kỳ, không cả hai). Không có tầng tổng hợp nào cộng trùng. Không phải bug.

## #6 [LOW] ✅ verified KHÔNG phải bug — payroll override merge-on-omit

Frontend `cham-cong-payroll.js:677-679` LUÔN gửi đủ 3 field override mỗi lần lưu: `numOrNull(id)` → `null` khi ô trống (xoá override CHỦ Ý), số khi có. Server set thẳng `= $9` ⇒ khớp UX: trống→xoá, có→set. **Đổi sang COALESCE-on-omit sẽ GÂY REGRESSION** (null gửi để xoá sẽ bị bỏ qua → không xoá được override). Giữ nguyên.

## #7 [LOW] ⚠ KHÔNG fix — Excel double-count (fix gây regress SSE)

`insertRecords` tăng `inserted` cho mọi dòng hợp lệ (kể cả ON CONFLICT UPDATE) → số "đã nhập" hiển thị over-count khi re-sync trùng. **Chỉ cosmetic** (data đúng). Cân nhắc phân biệt new-vs-update bằng `RETURNING (xmax=0)` nhưng **sẽ gây regression**: punch sửa giờ (cùng id, đổi `check_time`) là thay đổi THẬT nhưng xmax≠0 → `inserted=0` → KHÔNG fire `_notify` → tab khác không refresh. `inserted` = số dòng xử lý là semantic đúng để drive SSE/device-user. Giữ nguyên.

## #8 [LOW] ✅ verified KHÔNG phải bug — voucher fallback mã rỗng

`nextCode` (`web2-cashbook-lib.js:136`): prefix LUÔN gán (`receipt`→TTM/TNH/TVD theo fund, `payment_cn`→CCN, else→CKD — không có nhánh rỗng), seq atomic qua `INSERT…ON CONFLICT DO UPDATE SET seq=seq+1 RETURNING seq`, `padStart(6)`. Không có đường sinh mã rỗng/trùng. (Finding có thể nhầm với `soquy_vouchers` Web 1.0 — khác module.) Không phải bug.

---

## Phương pháp verify

Mọi fix HIGH/MEDIUM được verify bằng integration test mount route Express thật trên Postgres local (`n2store_flow_test`), seed dữ liệu, assert invariant, KHÔNG đụng prod. Harness trong scratchpad: `tags-test.js` (#1, 9), `lock-test.js` (#2, 18).
