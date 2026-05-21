# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-172838-3f1cb9a`
**Session file**: [`./20260521-172838-3f1cb9a.md`](../20260521-172838-3f1cb9a.md)
**Commit**: `3f1cb9a` — feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP
**Last updated**: 2026-05-21 17:28:38 +07
**Summary**: feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP

## Files changed in this commit (`web2/`)

- `web2/products/css/web2-products.css`
- `web2/products/index.html`
- `web2/products/js/web2-products-api.js`
- `web2/products/js/web2-products-app.js`

## Last 5 commits touching `web2/`

- `3f1cb9a1` feat(web2-products): badge "ĐANG DÙNG" + popover orders chứa SP _(2026-05-21)_
- `bd2afacf` perf(web2-msg-template): parallel multi-worker send theo page _(2026-05-21)_
- `d3e665d1` feat(native-orders): bulk send tin nhắn template như orders-report _(2026-05-21)_
- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `acae6441` fix(web2-chat): silent-success bug — sendMessage/replyComment phải check Pancake success:false _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-172838-3f1cb9a` cho Claude walk chain theo CLAUDE.md protocol.
