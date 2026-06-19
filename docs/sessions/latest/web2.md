# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-121936-ed7cdd7`
**Session file**: [`./20260619-121936-ed7cdd7.md`](../20260619-121936-ed7cdd7.md)
**Commit**: `ed7cdd7` — feat(web2/photo-editor): trang Chỉnh sửa ảnh + module dùng chung Web2ImageEditor (Filerobot, on-device)
**Last updated**: 2026-06-19 12:19:36 +07
**Summary**: feat(web2/photo-editor): trang Chỉnh sửa ảnh + module dùng chung Web2ImageEditor (Filerobot, on-device)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/customers/index.html`
- `web2/jt-tracking/index.html`
- `web2/photo-editor/index.html`
- `web2/photo-editor/js/photo-editor.js`
- `web2/photo-editor/photo-editor.css`
- `web2/product-card/index.html`
- `web2/product-card/js/product-card-render.js`
- `web2/product-card/js/product-card.js`
- `web2/shared/web2-customer-chat-core.js`
- `web2/shared/web2-image-editor.js`
- `web2/shared/web2-logo-eraser.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `ed7cdd763` feat(web2/photo-editor): trang Chỉnh sửa ảnh + module dùng chung Web2ImageEditor (Filerobot, on-device) _(2026-06-19)_
- `24258b10c` feat(web2/product-card): công cụ Xoá logo/watermark (Web2LogoEraser, on-device) _(2026-06-19)_
- `140eb7ea7` fix(web2): product-card bỏ placeholder 'Tên sản phẩm' khi rỗng + nhắc đăng nhập FB/Pancake khi gửi tin lỗi _(2026-06-19)_
- `68d3642ea` Revert "fix(web2-chat): hiện rõ lý do Pancake bypass-extension lỗi + detect extension chắc hơn" _(2026-06-19)_
- `8f9acc0cd` fix(web2-chat): hiện rõ lý do Pancake bypass-extension lỗi + detect extension chắc hơn _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-121936-ed7cdd7` cho Claude walk chain theo CLAUDE.md protocol.
