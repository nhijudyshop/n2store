# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-210914-12094b8`
**Session file**: [`./20260603-210914-12094b8.md`](../20260603-210914-12094b8.md)
**Commit**: `12094b8` — fix(inventory-tracking): modal-shipment re-parse ghi đè maSP/mauSac inline-edited + tab Lịch Sử query/recover
**Last updated**: 2026-06-03 21:09:14 +07
**Summary**: fix(inventory-tracking): modal-shipment re-parse ghi đè maSP/mauSac inline-edited + tab Lịch Sử query/recover

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/js/history-tab.js`

## Last 5 commits touching `inventory-tracking/`

- `12094b837` fix(inventory-tracking): modal-shipment re-parse ghi đè maSP/mauSac inline-edited + tab Lịch Sử query/recover _(2026-06-03)_
- `7033a0ec7` auto: session update _(2026-06-03)_
- `9216ea885` feat(inventory-tracking): iPad — nút STT/NCC luôn hiện (bỏ phụ thuộc :hover) _(2026-06-03)_
- `3e40337ef` feat(inventory-tracking): cây bút chỉnh sửa cho cột Đơn giá _(2026-06-03)_
- `bdf8f814e` style(inventory-tracking): financial row label + tiền ngoại tệ màu đen size x2, (VND) xám nhạt giữ size _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-210914-12094b8` cho Claude walk chain theo CLAUDE.md protocol.
