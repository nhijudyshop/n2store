# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-093945-90c3cd1`
**Session file**: [`./20260606-093945-90c3cd1.md`](../20260606-093945-90c3cd1.md)
**Commit**: `90c3cd1` — perf(tpos-pancake): render comment thông minh — inline SVG (bỏ createIcons full-DOM), lazy status dropdown, bỏ data đơn TPOS legacy, lazy avatar
**Last updated**: 2026-06-06 09:39:45 +07
**Summary**: perf(tpos-pancake): render comment thông minh — inline SVG (bỏ createIcons full-DOM), lazy status dropdown, bỏ...

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/js/tpos/tpos-comment-list.js`

## Last 5 commits touching `tpos-pancake/`

- `90c3cd165` perf(tpos-pancake): render comment thông minh — inline SVG (bỏ createIcons full-DOM), lazy status dropdown, bỏ data đơn TPOS legacy, lazy avatar _(2026-06-06)_
- `c70542eee` auto: session update _(2026-06-05)_
- `6502f392f` feat(tpos-pancake): enrich SĐT/địa chỉ comment từ kho khách hàng theo fb*id (TPOS trước, kho KH lấp chỗ trống, batch /customers/batch fb_ids) *(2026-06-05)\_
- `d65400306` feat(web2): tu dong lam giau kho KH (fb*id) khi bat chat Pancake moi noi *(2026-06-04)\_
- `ba21c5780` perf(tpos-pancake): fix drop-feedback CSS (tpos rows) + drag delegation + search debounce _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-093945-90c3cd1` cho Claude walk chain theo CLAUDE.md protocol.
