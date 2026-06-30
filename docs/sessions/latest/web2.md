# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-195331-2ae3f06`
**Session file**: [`./20260630-195331-2ae3f06.md`](../20260630-195331-2ae3f06.md)
**Commit**: `2ae3f06` — feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá)
**Last updated**: 2026-06-30 19:53:31 +07
**Summary**: in STT kệ TO lên tem per-unit (phải QR, dưới giá) — unit-scan/reprint

## Files changed in this commit (`web2/`)

- `web2/products/js/web2-products-print-modal.js`
- `web2/products/js/web2-products-print-render.js`
- `web2/shared/web2-unit-reprint.js`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `2ae3f068d` feat(web2 products-print): in STT kệ TO lên tem per-unit (phải QR, dưới giá) _(2026-06-30)_
- `970df859a` fix(web2 reconcile): audit fixes — keydown guard, audit-log in-tx, returned tab, a11y, UX kho _(2026-06-30)_
- `6eef43c84` auto: session update _(2026-06-30)_
- `7e6f56823` feat(web2 sse): Web2SSE.subscribeReload (1 nguồn subscribe+debounce) + wire variants [dedup hoàn chỉnh] _(2026-06-30)_
- `4a5208919` auto: session update _(2026-06-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-195331-2ae3f06` cho Claude walk chain theo CLAUDE.md protocol.
