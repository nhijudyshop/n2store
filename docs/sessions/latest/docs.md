# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-102439-41509cd`
**Session file**: [`./20260615-102439-41509cd.md`](../20260615-102439-41509cd.md)
**Commit**: `41509cd` — auto: session update
**Last updated**: 2026-06-15 10:24:39 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `194ce5230` fix(inventory-tracking): thêm NCC trùng tên KHÔNG gộp dòng — gỡ dedup-merge server-side POST /shipments _(2026-06-15)_
- `3f48d03c0` chore(session): RESUME:20260615-092929-195f358 _(2026-06-15)_
- `195f3584a` docs(dev-log): TPOS đợt 2 deployed + verified (env dead removed, batch endpoints live) _(2026-06-15)_
- `81adccb7e` refactor(web2): gỡ TPOS perm registry + 3 N+1 batch endpoint (đợt 2) _(2026-06-15)_
- `2cb6f2356` fix(orders-report/KPI): "Làm mới dữ liệu" fetch được đơn thật TPOS — load token-manager trong iframe KPI _(2026-06-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-102439-41509cd` cho Claude walk chain theo CLAUDE.md protocol.
