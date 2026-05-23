# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-092614-9807454`
**Session file**: [`./20260523-092614-9807454.md`](../20260523-092614-9807454.md)
**Commit**: `9807454` — docs(dev-log): livestream snapshot feature (phase 1+2) + backend smoke verified
**Last updated**: 2026-05-23 09:26:14 +07
**Summary**: docs(dev-log): livestream snapshot feature (phase 1+2) + backend smoke verified

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/css/tpos/tpos-comments.css`
- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-livestream-snap.js`

## Last 5 commits touching `tpos-pancake/`

- `e015ee36d` feat(tpos-pancake): livestream snapshot per customer (📸 Snap button + popover) _(2026-05-23)_
- `1aa81b75c` refactor(v2/cart + tpos-pancake): giỏ TPOS panel = native*orders.products (1 nguồn) *(2026-05-22)\_
- `e5fcbff20` fix(tpos-pancake/cart): /add cũng self-heal native*order broken khi cart đã linked *(2026-05-22)\_
- `6b05bc3cb` fix(tpos-pancake): đơn drag SP mất fbPageId/fbPostId không mở chat được _(2026-05-22)_
- `ea15fb97b` feat(tpos-pancake/cart + native-orders): giữ cart 15 ngày + auto-clear khi tạo PBH + stock sync _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-092614-9807454` cho Claude walk chain theo CLAUDE.md protocol.
