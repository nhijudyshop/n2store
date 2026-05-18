# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-154119-cbba186`
**Session file**: [`./20260518-154119-cbba186.md`](../20260518-154119-cbba186.md)
**Commit**: `cbba186` — feat(web2-effects+so-order+products): paste-only image upload + compress JPEG
**Last updated**: 2026-05-18 15:41:19 +07
**Summary**: feat(web2-effects+so-order+products): paste-only image upload + compress JPEG

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-app.js`
- `web2/shared/web2-effects.js`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `cbba186a` feat(web2-effects+so-order+products): paste-only image upload + compress JPEG _(2026-05-18)_
- `c43e9eaf` auto: session update _(2026-05-18)_
- `0546bad3` feat(web2-products+so-order): CHỜ MUA / ĐANG BÁN pipeline + Mua hàng per NCC _(2026-05-18)_
- `c38f56fc` chore(web2): bump tpos-sidebar.css cache v20260518d → v20260518e _(2026-05-18)_
- `fe0b9102` fix(web2/sidebar): footer compact + sticky bottom — không còn bị che _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-154119-cbba186` cho Claude walk chain theo CLAUDE.md protocol.
