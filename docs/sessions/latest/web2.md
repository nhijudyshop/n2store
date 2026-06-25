# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-215514-83513cd`
**Session file**: [`./20260625-215514-83513cd.md`](../20260625-215514-83513cd.md)
**Commit**: `83513cd` — feat(web2/print): QR đẹp + bố cục tem SP "2 tem" P1 (tên/biến thể/giá) + QR hoá đơn A4
**Last updated**: 2026-06-25 21:55:14 +07
**Summary**: QR đẹp + bố cục tem SP 2 tem P1 (tên/biến thể/giá) + QR hoá đơn A4, verify decode 8/8

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/fastsaleorder-invoice/print.html`
- `web2/printer-settings/index.html`
- `web2/product-card/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-print-modal.js`
- `web2/products/js/web2-products-print-render.js`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-qr.js`

## Last 5 commits touching `web2/`

- `83513cd80` feat(web2/print): QR đẹp + bố cục tem SP "2 tem" P1 (tên/biến thể/giá) + QR hoá đơn A4 _(2026-06-25)_
- `f574d593c` chore: remove accidentally-committed temp QR audit harness (TEMP scratch, unlinked) _(2026-06-25)_
- `274dbc7c9` docs(web2): update CSS-anim audit + dev-log for skeleton rollout-2 (30 pages) _(2026-06-25)_
- `340ec94bd` auto: session update _(2026-06-25)_
- `883445c59` feat(web2): GitHub-style skeleton loading + global interaction polish _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-215514-83513cd` cho Claude walk chain theo CLAUDE.md protocol.
