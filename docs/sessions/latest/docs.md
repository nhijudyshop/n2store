# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-132913-307da7b`
**Session file**: [`./20260616-132913-307da7b.md`](../20260616-132913-307da7b.md)
**Commit**: `307da7b` — fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn
**Last updated**: 2026-06-16 13:29:13 +07
**Summary**: fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến mo...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `307da7b15` fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn _(2026-06-16)_
- `492fba07b` chore(session): RESUME:20260616-132802-9a48ebe _(2026-06-16)_
- `0a7235290` chore(session): RESUME:20260616-131416-077127f _(2026-06-16)_
- `e39b3b51f` feat(web2/live-chat): POST /snapshots/purge (scope today _(all) + client clear-cache on purge|2026-06-16)_
- `32f40cd40` chore(session): RESUME:20260616-125842-5f185df _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-132913-307da7b` cho Claude walk chain theo CLAUDE.md protocol.
