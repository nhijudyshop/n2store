# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-200323-f547f29`
**Session file**: [`./20260630-200323-f547f29.md`](../20260630-200323-f547f29.md)
**Commit**: `f547f29` — auto: session update
**Last updated**: 2026-06-30 20:03:23 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/goods-weight/index.html`
- `web2/goods-weight/js/goods-weight.js`

## Last 5 commits touching `web2/`

- `f547f29fd` auto: session update _(2026-06-30)_
- `2ae3f068d` feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá) _(2026-06-30)_
- `970df859a` fix(web2 reconcile): audit fixes — keydown guard, audit-log in-tx, returned tab, a11y, UX kho _(2026-06-30)_
- `6eef43c84` auto: session update _(2026-06-30)_
- `7e6f56823` feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh] _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-200323-f547f29` cho Claude walk chain theo CLAUDE.md protocol.
