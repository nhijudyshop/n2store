# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260610-203826-330bd95`
**Session file**: [`./20260610-203826-330bd95.md`](../20260610-203826-330bd95.md)
**Commit**: `330bd95` — auto: session update
**Last updated**: 2026-06-10 20:38:26 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-app.js`
- `so-order/js/so-order-storage.js`

## Last 5 commits touching `so-order/`

- `330bd95eb` auto: session update _(2026-06-10)_
- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260610-203826-330bd95` cho Claude walk chain theo CLAUDE.md protocol.
