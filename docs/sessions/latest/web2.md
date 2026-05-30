# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-154750-a96f3cd`
**Session file**: [`./20260530-154750-a96f3cd.md`](../20260530-154750-a96f3cd.md)
**Commit**: `a96f3cd` — perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant
**Last updated**: 2026-05-30 15:47:50 +07
**Summary**: perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant

## Files changed in this commit (`web2/`)

- `web2/shared/web2-products-cache.js`

## Last 5 commits touching `web2/`

- `a96f3cdcd` perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant _(2026-05-30)_
- `be3496bee` perf(so-order): stock check fast-path khi cache rỗng + timeout 1.2s fallback _(2026-05-30)_
- `f5c220cb2` feat(so-order): invoice grouping + NCC/invoice cell merge + suggestion ranking + paste thumbnail _(2026-05-30)_
- `05d7c6692` feat(web2): DB badge kế bên tiêu đề trang — Render 2.0 / Firebase 2.0 / Web 2.0 _(2026-05-30)_
- `c4103344a` feat(services-dashboard): inventory updated — Neon → Render PG (Web 2.0) basic*1gb *(2026-05-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-154750-a96f3cd` cho Claude walk chain theo CLAUDE.md protocol.
