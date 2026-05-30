# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-155652-07299b9`
**Session file**: [`./20260530-155652-07299b9.md`](../20260530-155652-07299b9.md)
**Commit**: `07299b9` — feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS
**Last updated**: 2026-05-30 15:56:52 +07
**Summary**: feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `07299b93c` feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS _(2026-05-30)_
- `506317533` chore(session): RESUME:20260530-155454-3a058e7 _(2026-05-30)_
- `3a058e7ac` refactor(web2-balance-history): rip out 100% Web 1.0 dependencies trong matcher _(2026-05-30)_
- `c42f5eadc` perf(web2-cache): localStorage → IndexedDB + auto-migrate _(2026-05-30)_
- `a3ff48ed8` chore(session): RESUME:20260530-154750-a96f3cd _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-155652-07299b9` cho Claude walk chain theo CLAUDE.md protocol.
