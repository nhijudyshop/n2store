# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-143926-c38f56f`
**Session file**: [`./20260518-143926-c38f56f.md`](../20260518-143926-c38f56f.md)
**Commit**: `c38f56f` — chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e
**Last updated**: 2026-05-18 14:39:26 +07
**Summary**: chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/fastsaleorder-delivery/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-refund/index.html`
- `web2/index.html`
- `web2/pancake-settings/index.html`
- `web2/product-category/index.html`
- `web2/product-uom-categ/index.html`
- `web2/product-uom/index.html`
- `web2/products/index.html`
- `web2/report-revenue/index.html`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `c38f56fc` chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e _(2026-05-18)_
- `fe0b9102` fix(web2/sidebar): footer compact + sticky bottom — không còn bị che _(2026-05-18)_
- `99ee0226` feat(web2/sidebar): footer hiển thị nút "Đăng nhập" khi chưa có session _(2026-05-18)_
- `2a8ad332` fix(web2/sidebar): nav scroll + footer pinned + nút "Đăng xuất" rõ ràng _(2026-05-18)_
- `853a7501` feat(web2): trang đăng nhập + sidebar user widget + auth helper _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-143926-c38f56f` cho Claude walk chain theo CLAUDE.md protocol.
