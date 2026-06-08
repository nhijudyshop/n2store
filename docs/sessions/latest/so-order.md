# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-122649-e512f88`
**Session file**: [`./20260608-122649-e512f88.md`](../20260608-122649-e512f88.md)
**Commit**: `e512f88` — refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)
**Last updated**: 2026-06-08 12:26:49 +07
**Summary**: refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments)

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-app.js`

## Last 5 commits touching `so-order/`

- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `a1037d2a1` refactor(web2): rename design-system tpos-_ → web2-_ (classes + --vars), files + theme class _(2026-06-07)_
- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_
- `fe66d43ca` feat(so-order): nút 'In tem' trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ _(2026-06-07)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-122649-e512f88` cho Claude walk chain theo CLAUDE.md protocol.
