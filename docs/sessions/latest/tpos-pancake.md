# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-100833-754a65e`
**Session file**: [`./20260606-100833-754a65e.md`](../20260606-100833-754a65e.md)
**Commit**: `754a65e` — auto: session update
**Last updated**: 2026-06-06 10:08:33 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/tpos/tpos-comment-list.js`

## Last 5 commits touching `tpos-pancake/`

- `754a65e15` auto: session update _(2026-06-06)_
- `2455c1a61` auto: session update _(2026-06-06)_
- `90c3cd165` perf(tpos-pancake): render comment thông minh — inline SVG (bỏ createIcons full-DOM), lazy status dropdown, bỏ data đơn TPOS legacy, lazy avatar _(2026-06-06)_
- `c70542eee` auto: session update _(2026-06-05)_
- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-100833-754a65e` cho Claude walk chain theo CLAUDE.md protocol.
