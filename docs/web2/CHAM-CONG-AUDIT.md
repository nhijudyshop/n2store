<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 — Audit trang Chấm công 2026-06-24 (4 reviewer + verify thủ công). -->

# Audit trang Chấm công (Web 2.0) — 2026-06-24

Nguồn: audit đa-agent (4 chiều: tính lương / frontend / backend / UX) + verify thủ công các claim chính. Đã loại trùng + chỉnh lại mức độ thực tế (một số reviewer phóng đại).

## A. BUG — sắp theo mức độ

### 🔴 CRITICAL / HIGH (nên xử lý)

| #   | Bug                                                                                                                            | File                                         | Hướng sửa                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **ADMS `/iclock/*` không có auth** — bất kỳ ai biết URL đều POST punch giả / xoá. (Đã biết: máy ZKTeco không gửi header được.) | `web2-attendance-adms.js`                    | Secret trong path/query do proxy máy shop chèn (`/iclock/.../:secret`); verify server. Hiện dựa cô lập mạng.                    |
| B2  | **`requireAgentSecret` fail-OPEN** khi env `WEB2_ATTENDANCE_SECRET` rỗng → mọi ingest mở toang nếu env mất/typo lúc restart    | `web2-attendance.js`                         | Fail-CLOSED ở prod (`WEB2_ATTENDANCE_ENFORCE=1` → 401 nếu thiếu secret); `crypto.timingSafeEqual`.                              |
| B3  | **2 PIN gán cùng 1 NV → Bảng lương/Excel trùng tên + TỔNG cộng đôi** (lương 1 người tính 2 lần)                                | `cham-cong-payroll.js` + backend             | Chặn gán trùng `employee_id` (validate FE + UNIQUE index BE); hoặc kèm PIN vào dòng để phân biệt.                               |
| B4  | **Modal "ngày" dùng snapshot punch cũ** — đang mở modal mà có punch mới (SSE) → bấm Lưu xoá nhầm/nhân đôi (id cũ)              | `cham-cong-app.js` `openDay`/`saveDayDetail` | Hoãn reload nền khi modal mở, hoặc re-derive ctx từ state hiện tại trước khi lưu.                                               |
| B5  | **Ca qua nửa đêm tính sai hoàn toàn** (vd 18:00–02:00): `standardHours` âm bị kẹp 0.5 → đơn giá giờ gấp đôi, OT/về sớm đảo lộn | `cham-cong-salary.js`                        | `vnMoment(endMin<=startMin → nextDay)` + `standardHours=(endMin+1440-startMin)/60`. (Hiện shop chạy ca ngày 08–20 nên chưa lộ.) |

### 🟡 MEDIUM (nên xử lý sớm)

| #   | Bug                                                                                                                                   | File                              | Ghi chú                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B6  | **Lương THÁNG vẫn = full khi 0 công** (NV nghỉ cả tháng vẫn báo trả đủ) — đúng "lương cố định" nhưng dễ sót giảm trừ → rủi ro tiền    | `cham-cong-salary.js`             | Badge cảnh báo khi `workedDays` thấp bất thường; hoặc tuỳ chọn tự trừ theo ngày vắng.                                                                     |
| B7  | **"Số công" ra số lẻ** (14.8, 20.54…) — ngày đi muộn cộng phân số `baseSalary/dailyRate` thay vì 1 công                               | `cham-cong-salary.js`             | Đếm `workedDays` = số ngày có `day.worked` (nguyên); phần thiếu giờ chỉ ảnh hưởng TIỀN, không ảnh hưởng số công. **(Khớp ảnh user thấy số lẻ khó hiểu.)** |
| B8  | **Grace kéo cả mốc TÍNH TIỀN** (không chỉ miễn phạt) → có thể trả lương khống ở rìa (1 lượt quẹt gần cuối ca)                         | `cham-cong-salary.js`             | Grace chỉ set `lateMinutes/earlyMinutes=0`, KHÔNG kéo mốc tính `baseMinutes`.                                                                             |
| B9  | **Punch THIẾU (1 lượt) vẫn tính tiền vụn** thay vì 0 + cờ cho admin sửa (reviewer nói "full ngày" là phóng đại — thực tế ra vài phút) | `cham-cong-salary.js`             | `if status==='incomplete' → baseSalary=0`; gắn cờ ⚠ để admin chỉnh tay.                                                                                   |
| B10 | **Override công NGÀY không reset phạt muộn/OT** → admin chốt "20 công" vẫn bị trừ thêm phạt muộn ngày thực                            | `cham-cong-salary.js`             | Khi có `salary_days_override` → reset `lateDeduction`/`lamThem` (hoặc tài liệu hoá rõ).                                                                   |
| B11 | **`otMultiplier` phình ~24× nếu cấu hình `work_start==work_end`** (standardHours kẹp 0.5)                                             | `cham-cong-salary.js` + employees | Validate `work_end > work_start` khi lưu NV; cảnh báo nếu kẹp 0.5.                                                                                        |
| B12 | **`DELETE /records/clear-all` xoá sạch punch không xác nhận/backup** — 1 click mất lịch sử mọi tháng                                  | `web2-attendance.js`              | Xác nhận 2 bước + export trước khi xoá, hoặc xoá theo khoảng ngày.                                                                                        |
| B13 | **`insertRecords` N+1 không transaction** — full re-sync hàng nghìn punch = hàng nghìn round-trip tuần tự, ghi 1 phần nếu lỗi         | `web2-attendance.js`              | INSERT multi-row + `BEGIN/COMMIT` theo lô 500.                                                                                                            |
| B14 | **`GET /agent-secret` trả plaintext, không rate-limit/audit**                                                                         | `web2-attendance.js`              | `Cache-Control: no-store` + audit ai lấy + rate-limit.                                                                                                    |
| B15 | **`_needCheck` Map in-RAM per-process** → web2-api đa-instance (rolling deploy) thì `getrequest` không tin cậy                        | `web2-attendance-adms.js`         | Lưu cờ resync vào DB/`web2_attendance_commands` thay vì RAM.                                                                                              |
| B16 | **saveRow/saveAll không cập nhật cache IDB** → đổi tháng-rồi-quay-lại hiện giá trị cũ ~300ms                                          | `cham-cong-employees.js`          | Ghi đè cache `m_<monthKey>` sau PATCH.                                                                                                                    |

### 🟢 LOW

B17 `insertRecords` không clamp `type`/`verify_mode` (SMALLINT overflow → văng batch) · B18 PATCH device-users không ép kiểu số (gửi 'abc' → 500 thay vì 400) · B19 override âm/Infinity lọt vào tiền (clamp ≥0) · B20 làm tròn tiền theo NGÀY tích luỹ sai vài chục đồng/tháng · B21 modal treo khi `du` bị xoá giữa chừng.

## B. ROADMAP TÍNH NĂNG

### Cần ngay (nghiệp vụ lương đòi hỏi)

1. **Chốt lương + khoá kỳ** 🔴 — hiện lương tính LẠI mỗi lần render từ cấu hình HIỆN TẠI → sửa lương NV làm đổi cả tháng đã trả; máy đẩy punch trễ làm đổi tháng cũ. Cần snapshot + khoá kỳ (`web2_attendance_period_lock`).
2. **Lịch sử thay đổi / Audit** — xoá/thêm punch, sửa giờ, đổi lương, thưởng/giảm trừ đều KHÔNG để lại dấu vết. Tiền → cần ai-sửa-gì-khi-nào (tái dùng [[reference_web2_audit_log_page]]).
3. **Cảnh báo hôm nay** — widget "ai chưa vào / ai quên bấm ra / ai vắng" thay vì admin tự dò dot.

### Nên có

4. **Nghỉ phép có loại** (phép năm/ốm/không lương/nửa ngày) + quỹ phép còn lại — thay 3 nút thô; "nghỉ không phép" hiện XOÁ punch (mất gốc).
5. **Duyệt tăng ca (OT approval)** — OT ×2 tự tính bất cứ khi nào ra trễ → trả oan; cần bước duyệt.
6. **Phiếu lương hàng loạt (PDF) + gửi Zalo** — hiện in từng người; tái dùng `Web2Zalo` gửi phiếu cho NV.
7. **NV tự xem công/lương của mình** (self-service scope, mẫu [[reference_web2_kpi_system]]).
8. **Nhập file Excel/TXT chấm công** — backend `POST /records/import` ĐÃ có, thiếu nút UI (đối soát khi PC sync tắt).

### Tương lai

9. Nghỉ lễ VN tự động (Tết/30-4/1-5/2-9) + hệ số lễ 300%. 10. Thống kê/biểu đồ đi muộn–vắng–OT. 11. Phát hiện punch bất thường (chấm hộ/trùng phút/quên ra).

---

_Verify: B1,B3,B4,B5,B7,B11,B12 xác nhận trong code. B9 reviewer phóng đại ("full ngày" → thực ra vài phút). Mức độ đã chỉnh theo tác động tiền thật._
