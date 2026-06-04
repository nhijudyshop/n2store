# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-210031-ca11b5a`
**Session file**: [`./20260604-210031-ca11b5a.md`](../20260604-210031-ca11b5a.md)
**Commit**: `ca11b5a` — auto: session update
**Last updated**: 2026-06-04 21:00:31 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-chat-readonly.js`

## Last 5 commits touching `web2/`

- `ca11b5a4a` auto: session update _(2026-06-04)_
- `f2761d6b6` fix(web2 bill): STT ghi so ngay canh 'Phieu Ban Hang - 313' + fix cat chu SAN PHAM/THANH TIEN/TONG TIEN (^ double-width tran cpl -> ^^ double-height vua khit) _(2026-06-04)_
- `336191adf` feat(web2-chat-readonly): avatar that FB (list + thread) qua Worker /api/fb-avatar _(2026-06-04)_
- `e409d5347` fix(web2 print): dau tieng Viet ro hon khi in - bo emphasis (giong NHI JUDY) + chu to cpl 32 + supersample 2x raster (giu net manh/dau) + stroke nhe _(2026-06-04)_
- `f2f9bdd64` feat(web2-balance): nut chat tren row + bo icon link/reassign (gọn UI) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-210031-ca11b5a` cho Claude walk chain theo CLAUDE.md protocol.
