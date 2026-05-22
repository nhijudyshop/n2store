# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-192933-bdf9cde`
**Session file**: [`./20260522-192933-bdf9cde.md`](../20260522-192933-bdf9cde.md)
**Commit**: `bdf9cde` — auto: session update
**Last updated**: 2026-05-22 19:29:33 +07
**Summary**: auto: session update

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/cart.js`

## Last 5 commits touching `render.com/`

- `1aa81b75c` refactor(v2/cart + tpos-pancake): giỏ TPOS panel = native*orders.products (1 nguồn) *(2026-05-22)\_
- `f3680e29c` fix(v2/cart): /add lookup noc bỏ qua soft-deleted rows + clear null out native*order_code *(2026-05-22)\_
- `e5fcbff20` fix(tpos-pancake/cart): /add cũng self-heal native*order broken khi cart đã linked *(2026-05-22)\_
- `cf7c4897c` fix(native-orders/from-comment): tự heal fb*page_id/fb_post_id null khi merge vào draft cũ *(2026-05-22)\_
- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-192933-bdf9cde` cho Claude walk chain theo CLAUDE.md protocol.
