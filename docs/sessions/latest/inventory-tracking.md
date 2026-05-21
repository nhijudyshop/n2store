# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-150622-ddd3761`
**Session file**: [`./20260521-150622-ddd3761.md`](../20260521-150622-ddd3761.md)
**Commit**: `ddd3761` — fix(inventory): SSE handler map snake_case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1')
**Last updated**: 2026-05-21 15:06:22 +07
**Summary**: fix(inventory): SSE handler map snake_case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1')

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/js/data-loader.js`

## Last 5 commits touching `inventory-tracking/`

- `ddd37616` fix(inventory): SSE handler map snake*case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1') *(2026-05-21)\_
- `1cd1cd8b` fix(inventory): không leak ảnh cross-đợt khi NCC trùng giữa đợt 1 và đợt 2 _(2026-05-21)_
- `31cafa32` auto: session update _(2026-05-20)_
- `3f89510f` auto: session update _(2026-05-19)_
- `5deb5ef7` feat(inventory/image-mgr): bỏ ngày, chỉ chọn theo Đợt + cho phép Đợt tùy chỉnh _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-150622-ddd3761` cho Claude walk chain theo CLAUDE.md protocol.
