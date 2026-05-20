# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260520-093617-6c2188c`
**Session file**: [`./20260520-093617-6c2188c.md`](../20260520-093617-6c2188c.md)
**Commit**: `6c2188c` — auto: session update
**Last updated**: 2026-05-20 09:36:17 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6c2188ca` auto: session update _(2026-05-20)_
- `f9b91b88` docs(dev-log): fix sửa Đợt Hàng 404 khi thêm hóa đơn NCC mới + stuck "Đang lưu..." _(2026-05-20)_
- `e2441966` chore(session): RESUME:20260520-093029-31cafa3 _(2026-05-20)_
- `31cafa32` auto: session update _(2026-05-20)_
- `9856e0f5` chore(session): RESUME:20260519-184958-e3d3df0 _(2026-05-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260520-093617-6c2188c` cho Claude walk chain theo CLAUDE.md protocol.
