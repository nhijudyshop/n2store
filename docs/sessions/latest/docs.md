# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-132957-1a51d7b`
**Session file**: [`./20260531-132957-1a51d7b.md`](../20260531-132957-1a51d7b.md)
**Commit**: `1a51d7b` — feat(native-orders): badge 'Trực tiếp' cho SP add từ picker
**Last updated**: 2026-05-31 13:29:57 +07
**Summary**: feat(native-orders): badge 'Trực tiếp' cho SP add từ picker

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `1a51d7baa` feat(native-orders): badge 'Trực tiếp' cho SP add từ picker _(2026-05-31)_
- `b34e84414` feat(delivery-report): xóa hẳn cột ATRƯỜNG NHẬN CK + CK TRƯỚC theo tab (không CSS-hide) _(2026-05-31)_
- `0d0881ab9` feat(delivery-report): ẩn cột CK theo tab + duyệt giữ nguyên TỔNG CÒN LẠI _(2026-05-31)_
- `cb06f24ef` feat(inventory-tracking): khoảng ngày bắt đầu/kết thúc cho từng đợt — bound thanh toán CK theo ngày _(2026-05-31)_
- `32903b4f6` chore(session): RESUME:20260530-195730-b53b873 _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-132957-1a51d7b` cho Claude walk chain theo CLAUDE.md protocol.
