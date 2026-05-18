# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-172713-c6f1321`
**Session file**: [`./20260518-172713-c6f1321.md`](../20260518-172713-c6f1321.md)
**Commit**: `c6f1321` — feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending_qty
**Last updated**: 2026-05-18 17:27:13 +07
**Summary**: feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending_qty

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-api.js`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_
- `40df3b7b` fix(web2-products+so-order): show CHỜ HÀNG status + VND price ×1000 shorthand _(2026-05-18)_
- `cbba186a` feat(web2-effects+so-order+products): paste-only image upload + compress JPEG _(2026-05-18)_
- `c43e9eaf` auto: session update _(2026-05-18)_
- `0546bad3` feat(web2-products+so-order): CHỜ MUA / ĐANG BÁN pipeline + Mua hàng per NCC _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-172713-c6f1321` cho Claude walk chain theo CLAUDE.md protocol.
