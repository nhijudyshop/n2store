# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-093135-5922ea4`
**Session file**: [`./20260518-093135-5922ea4.md`](../20260518-093135-5922ea4.md)
**Commit**: `5922ea4` — fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che
**Last updated**: 2026-05-18 09:31:35 +07
**Summary**: fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/index.html`
- `web2/pancake-settings/index.html`
- `web2/product-category/index.html`
- `web2/product-uom-categ/index.html`
- `web2/product-uom/index.html`
- `web2/report-revenue/index.html`

## Last 5 commits touching `web2/`

- `5922ea4d` fix(web2-shared): sidebar collapsed — labels bleed + toggle bị che _(2026-05-18)_
- `034b2608` chore(web2): xóa 2 trang TPOS-clone product-template + product-variant _(2026-05-17)_
- `4c16c749` feat(web2): pancake-settings page — manage JWT + page tokens inside Web 2.0 _(2026-05-14)_
- `e34d5868` auto: session update _(2026-05-14)_
- `91286ec4` perf(web2): fix bulk-PBH scroll lag + shared CSS classes for heavy modals _(2026-05-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-093135-5922ea4` cho Claude walk chain theo CLAUDE.md protocol.
