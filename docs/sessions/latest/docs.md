# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260624-142235-4810ecb`
**Session file**: [`./20260624-142235-4810ecb.md`](../20260624-142235-4810ecb.md)
**Commit**: `4810ecb` — feat(printer-settings): nút 1-click tải & cài agent Chấm công DG-600 từ web
**Last updated**: 2026-06-24 14:22:35 +07
**Summary**: feat(printer-settings): nút 1-click tải & cài agent Chấm công DG-600 từ web

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4810ecb47` feat(printer-settings): nút 1-click tải & cài agent Chấm công DG-600 từ web _(2026-06-24)_
- `2b6e72cb7` feat(inventory-tracking): kéo sắp xếp thứ tự Màu/Size — lưu DB, load về các máy _(2026-06-24)_
- `cd4659583` chore(session): RESUME:20260624-140224-4f1cabf _(2026-06-24)_
- `4f1cabfbb` auto: session update _(2026-06-24)_
- `16f698797` fix(attendance-sync): sửa lỗi không cài được + gom 1 folder + 1 nút cài/gỡ tự kiểm tra _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260624-142235-4810ecb` cho Claude walk chain theo CLAUDE.md protocol.
