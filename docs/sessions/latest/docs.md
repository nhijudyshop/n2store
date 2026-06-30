# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-195331-2ae3f06`
**Session file**: [`./20260630-195331-2ae3f06.md`](../20260630-195331-2ae3f06.md)
**Commit**: `2ae3f06` — feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá)
**Last updated**: 2026-06-30 19:53:31 +07
**Summary**: in STT kệ TO lên tem per-unit (phải QR, dưới giá) — unit-scan/reprint

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2ae3f068d` feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá) _(2026-06-30)_
- `85b8d64dd` chore(session): RESUME:20260630-192057-970df85 _(2026-06-30)_
- `970df859a` fix(web2 reconcile): audit fixes — keydown guard, audit-log in-tx, returned tab, a11y, UX kho _(2026-06-30)_
- `fc7c85702` chore(session): RESUME:20260630-185728-e80b791 _(2026-06-30)_
- `e2d1b52c6` refactor(web2 sse): migrate 6 trang pure-debounce → Web2SSE.subscribeReload (7 trang tổng) _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-195331-2ae3f06` cho Claude walk chain theo CLAUDE.md protocol.
