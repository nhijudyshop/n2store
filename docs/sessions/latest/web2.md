# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-155652-07299b9`
**Session file**: [`./20260530-155652-07299b9.md`](../20260530-155652-07299b9.md)
**Commit**: `07299b9` — feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS
**Last updated**: 2026-05-30 15:56:52 +07
**Summary**: feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS

## Files changed in this commit (`web2/`)

- `web2/shared/web2-idb-store.js`

## Last 5 commits touching `web2/`

- `07299b93c` feat(web2-shared): Web2IdbStore helper — generic IDB kv với auto-migrate từ LS _(2026-05-30)_
- `c42f5eadc` perf(web2-cache): localStorage → IndexedDB + auto-migrate _(2026-05-30)_
- `a96f3cdcd` perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant _(2026-05-30)_
- `be3496bee` perf(so-order): stock check fast-path khi cache rỗng + timeout 1.2s fallback _(2026-05-30)_
- `f5c220cb2` feat(so-order): invoice grouping + NCC/invoice cell merge + suggestion ranking + paste thumbnail _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-155652-07299b9` cho Claude walk chain theo CLAUDE.md protocol.
