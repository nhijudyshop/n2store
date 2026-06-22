# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-225026-1cc2385`
**Session file**: [`./20260622-225026-1cc2385.md`](../20260622-225026-1cc2385.md)
**Commit**: `1cc2385` — feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order
**Last updated**: 2026-06-22 22:50:26 +07
**Summary**: feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-public-api.js`
- `native-orders/js/native-orders-render.js`

## Last 5 commits touching `native-orders/`

- `1cc23853f` feat(web2-audit-log): per-record history (openRecord modal) + reference native-orders/so-order _(2026-06-22)_
- `a9b4a5b13` fix(native-orders) tag-add jank: in-place .col-tag update + smooth pop-in for new pills only (compositor-only, no avatar reload, no re-pop) _(2026-06-22)_
- `2a7725294` feat(web2) sidebar: collapsed icon click expands group + un-collapses; dedup Sổ Order _(2026-06-22)_
- `a8d8244f6` fix(web2) products: GHI CHÚ column misaligned — move line-clamp off the <td> _(2026-06-22)_
- `e3c7e1315` fix(web2) native-orders: add mobile shell pack to base.css (hamburger desktop-hide + drawer) _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-225026-1cc2385` cho Claude walk chain theo CLAUDE.md protocol.
