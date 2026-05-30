# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-155454-3a058e7`
**Session file**: [`./20260530-155454-3a058e7.md`](../20260530-155454-3a058e7.md)
**Commit**: `3a058e7` — refactor(web2-balance-history): rip out 100% Web 1.0 dependencies trong matcher
**Last updated**: 2026-05-30 15:54:54 +07
**Summary**: refactor(web2-balance-history): rip out 100% Web 1.0 dependencies trong matcher

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `3a058e7ac` refactor(web2-balance-history): rip out 100% Web 1.0 dependencies trong matcher _(2026-05-30)_
- `c42f5eadc` perf(web2-cache): localStorage → IndexedDB + auto-migrate _(2026-05-30)_
- `a3ff48ed8` chore(session): RESUME:20260530-154750-a96f3cd _(2026-05-30)_
- `a96f3cdcd` perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant _(2026-05-30)_
- `be3496bee` perf(so-order): stock check fast-path khi cache rỗng + timeout 1.2s fallback _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-155454-3a058e7` cho Claude walk chain theo CLAUDE.md protocol.
