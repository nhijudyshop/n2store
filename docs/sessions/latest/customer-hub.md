# Latest Snapshot — `customer-hub/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153901-7cfb013`
**Session file**: [`./20260521-153901-7cfb013.md`](../20260521-153901-7cfb013.md)
**Commit**: `7cfb013` — chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b
**Last updated**: 2026-05-21 15:39:01 +07
**Summary**: chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b

## Files changed in this commit (`customer-hub/`)

- `customer-hub/index.html`

## Last 5 commits touching `customer-hub/`

- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `0ce7d762` fix(customer-hub): tab TPOS PBH hiển thị bill thực sự thay vì summary card _(2026-05-16)_
- `effb1996` fix(wallet): rút gọn note thanh toán + ghi đúng user nạp ví _(2026-05-16)_
- `b451b433` fix(wallet): ẩn cặp tạo-hủy đơn khỏi UI ví + fix note PBH "Nợ Cũ" sai khi tiền vào ví là ADJUSTMENT _(2026-05-07)_
- `8290a11c` fix(wallet): reliability + race fix — Đoan Nghi case + customer-hub deposit _(2026-05-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153901-7cfb013` cho Claude walk chain theo CLAUDE.md protocol.
