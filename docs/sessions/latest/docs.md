# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-134827-bc13317`
**Session file**: [`./20260616-134827-bc13317.md`](../20260616-134827-bc13317.md)
**Commit**: `bc13317` — auto: session update
**Last updated**: 2026-06-16 13:48:27 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7296b99aa` fix(orders-report,don-inbox): product search rỗng — tự refresh token TPOS stale _(2026-06-16)_
- `b9c8a055f` chore(session): RESUME:20260616-132913-307da7b _(2026-06-16)_
- `307da7b15` fix(web2/so-order): mã SP theo biến thể + viết lại extractType (tìm loại giữa tên) + 8 cải tiến modal tạo đơn _(2026-06-16)_
- `492fba07b` chore(session): RESUME:20260616-132802-9a48ebe _(2026-06-16)_
- `0a7235290` chore(session): RESUME:20260616-131416-077127f _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-134827-bc13317` cho Claude walk chain theo CLAUDE.md protocol.
