# Web 2.0 Flow Audit — Round 3 (2026-06-26)

> Vòng 3 audit luồng tiền/kho/chấm-công Web 2.0, nối tiếp [R1](FLOW-AUDIT-2026-06-26.md) (12/12 fixed) + [R2](FLOW-AUDIT-2026-06-26-R2.md) (13/13 fixed). Trọng tâm R3: các luồng PHỤ chưa soi kỹ ở R1/R2 — **PBH tách (split)**, **chấm công / khoá kỳ lương**, **sổ quỹ / chi tiêu (soquy)**, **voucher**. Mỗi finding verify bằng integration test trên Postgres thật (DB `n2store_flow_test`, mount route Express thật) trước khi đánh ✅.

## Tổng quan

| #   | Mức         | Khu vực                                   | Trạng thái             |
| --- | ----------- | ----------------------------------------- | ---------------------- |
| 1   | HIGH        | order-tags / PBH tách                     | ✅ FIXED (`8b5c4b22a`) |
| 2   | MEDIUM→HIGH | chấm công / khoá kỳ lương                 | ✅ FIXED               |
| 3   | MEDIUM      | soquy — optimistic update số dư stale     | ⬜ documented          |
| 4   | MEDIUM      | soquy — giao dịch lùi ngày double-count   | ⬜ documented          |
| 5   | LOW         | sổ quỹ — chặn khoảng thời gian sub-second | ⬜ documented          |
| 6   | LOW         | payroll override merge-on-omit            | ⬜ documented          |
| 7   | LOW         | nhập Excel — double-count khi trùng       | ⬜ documented          |
| 8   | LOW         | voucher — fallback mã rỗng                | ⬜ documented          |

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

## #3 [MEDIUM] ⬜ — soquy: optimistic update hiển thị số dư stale

**Triệu chứng:** trang Sổ quỹ/Chi tiêu (`web2/soquy` hoặc tương đương) cập nhật optimistic số dư từ giá trị client đang giữ; nếu tab khác vừa ghi giao dịch, số dư hiển thị sau optimistic là stale tới khi reload/SSE. Không mất tiền (server là nguồn thật) nhưng UX hiển thị sai tạm thời.

**Đề xuất:** sau mutation, re-fetch số dư thật từ server (hoặc dựa SSE `web2:<entity>` để reconcile) thay vì cộng/trừ cục bộ. Theo dõi.

## #4 [MEDIUM] ⬜ — soquy: giao dịch lùi ngày (back-dated) double-count

**Triệu chứng:** thêm giao dịch với ngày trong quá khứ có thể bị tính 2 lần ở báo cáo tổng hợp nếu báo cáo đã cache khoảng ngày đó. Cần dedup theo id giao dịch ở tầng tổng hợp. Theo dõi.

## #5 [LOW] ⬜ — sổ quỹ: chặn khoảng thời gian sub-second

Biên `to` của filter ngày dùng `<= endOfDay` nhưng so sánh ở mức giây có thể bỏ sót giao dịch trong giây cuối. Đổi sang biên `< nextDay` (exclusive) cho an toàn. Theo dõi.

## #6 [LOW] ⬜ — payroll override merge-on-omit

`PUT /payroll/:id` set thẳng `salary_days_override = $9` (NULL khi omit) → nếu client gửi patch thiếu field override, override cũ bị xoá về NULL. Cân nhắc COALESCE-on-omit cho 3 cột override nếu UX là patch-từng-phần. (Hiện UI gửi đủ field nên chưa lộ.) Theo dõi.

## #7 [LOW] ⬜ — nhập Excel: double-count khi trùng dòng

Import punch từ Excel/TXT dựa `id = uid_ms`; 2 dòng cùng uid+giây bị ON CONFLICT gộp (đúng), nhưng tổng "đã nhập" đếm cả dòng conflict. Chỉ ảnh hưởng số báo, không sai data. Theo dõi.

## #8 [LOW] ⬜ — voucher: fallback mã rỗng

Voucher sinh mã có thể rơi vào nhánh fallback tạo mã rỗng/trùng khi thiếu prefix. Cần guard sinh mã idempotent. Theo dõi.

---

## Phương pháp verify

Mọi fix HIGH/MEDIUM được verify bằng integration test mount route Express thật trên Postgres local (`n2store_flow_test`), seed dữ liệu, assert invariant, KHÔNG đụng prod. Harness trong scratchpad: `tags-test.js` (#1, 9), `lock-test.js` (#2, 18).
