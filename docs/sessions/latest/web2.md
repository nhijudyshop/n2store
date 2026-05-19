# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-100742-95dc85b`
**Session file**: [`./20260519-100742-95dc85b.md`](../20260519-100742-95dc85b.md)
**Commit**: `95dc85b` — chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'
**Last updated**: 2026-05-19 10:07:42 +07
**Summary**: chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'

## Files changed in this commit (`web2/`)

- `web2/customer-wallet/index.html`
- `web2/delivery-carrier/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/live-campaign/index.html`
- `web2/partner-customer/index.html`
- `web2/partner-supplier/index.html`
- `web2/product-category/index.html`
- `web2/products/index.html`
- `web2/supplier-debt/index.html`
- `web2/supplier-wallet/index.html`
- `web2/users/index.html`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_
- `40df3b7b` fix(web2-products+so-order): show CHỜ HÀNG status + VND price ×1000 shorthand _(2026-05-18)_
- `cbba186a` feat(web2-effects+so-order+products): paste-only image upload + compress JPEG _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-100742-95dc85b` cho Claude walk chain theo CLAUDE.md protocol.
