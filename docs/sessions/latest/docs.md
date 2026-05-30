# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-154750-a96f3cd`
**Session file**: [`./20260530-154750-a96f3cd.md`](../20260530-154750-a96f3cd.md)
**Commit**: `a96f3cd` — perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant
**Last updated**: 2026-05-30 15:47:50 +07
**Summary**: perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a96f3cdcd` perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant _(2026-05-30)_
- `be3496bee` perf(so-order): stock check fast-path khi cache rỗng + timeout 1.2s fallback _(2026-05-30)_
- `0ac86941e` fix(inventory-tracking): chặn realtime self-reload phá tạo biến thể / sửa inline _(2026-05-30)_
- `12694f087` chore(session): RESUME:20260530-141653-42f2b22 _(2026-05-30)_
- `42f2b2260` feat(inventory-tracking): cột Tổng SL — bút chì 1-tap sửa số lượng (iPad) _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-154750-a96f3cd` cho Claude walk chain theo CLAUDE.md protocol.
