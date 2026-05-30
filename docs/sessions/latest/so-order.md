# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-130606-2936f6e`
**Session file**: [`./20260530-130606-2936f6e.md`](../20260530-130606-2936f6e.md)
**Commit**: `2936f6e` — feat(so-order): receive UX + edit-shipment + variant dropdown + barcode print + modal full-viewport
**Last updated**: 2026-05-30 13:06:06 +07
**Summary**: feat(so-order): receive UX + edit-shipment + variant dropdown + barcode print + modal full-viewport

## Files changed in this commit (`so-order/`)

- `so-order/css/so-order.css`
- `so-order/index.html`
- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `2936f6e68` feat(so-order): receive UX + edit-shipment + variant dropdown + barcode print + modal full-viewport _(2026-05-30)_
- `3317f51e1` auto: session update _(2026-05-30)_
- `05d7c6692` feat(web2): DB badge kế bên tiêu đề trang — Render 2.0 / Firebase 2.0 / Web 2.0 _(2026-05-30)_
- `d37356872` auto: session update _(2026-05-30)_
- `b5a1a06a5` perf(so-order): stock check 24000× faster — Web2ProductsCache thay N×HTTP _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-130606-2936f6e` cho Claude walk chain theo CLAUDE.md protocol.
