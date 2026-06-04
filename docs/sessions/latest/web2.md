# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-205141-336191a`
**Session file**: [`./20260604-205141-336191a.md`](../20260604-205141-336191a.md)
**Commit**: `336191a` — feat(web2-chat-readonly): avatar that FB (list + thread) qua Worker /api/fb-avatar
**Last updated**: 2026-06-04 20:51:41 +07
**Summary**: feat(web2-chat-readonly): avatar that FB (list + thread) qua Worker /api/fb-avatar

## Files changed in this commit (`web2/`)

- `web2/balance-history/css/web2-balance-history.css`
- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-chat-readonly.js`
- `web2/shared/web2-printer.js`

## Last 5 commits touching `web2/`

- `336191adf` feat(web2-chat-readonly): avatar that FB (list + thread) qua Worker /api/fb-avatar _(2026-06-04)_
- `e409d5347` fix(web2 print): dau tieng Viet ro hon khi in - bo emphasis (giong NHI JUDY) + chu to cpl 32 + supersample 2x raster (giu net manh/dau) + stroke nhe _(2026-06-04)_
- `f2f9bdd64` feat(web2-balance): nut chat tren row + bo icon link/reassign (gọn UI) _(2026-06-04)_
- `1db42e229` feat(web2-chat-readonly): panel tim hoi thoai KH (ten/SDT/noi dung) nhu native-orders _(2026-06-04)_
- `a0e64a075` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-205141-336191a` cho Claude walk chain theo CLAUDE.md protocol.
