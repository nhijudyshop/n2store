# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-211025-9070c9e`
**Session file**: [`./20260604-211025-9070c9e.md`](../20260604-211025-9070c9e.md)
**Commit**: `9070c9e` — docs(dev-log): in tem 2-con raster vat-ly + research ESC/POS vs TSPL
**Last updated**: 2026-06-04 21:10:25 +07
**Summary**: docs(dev-log): in tem 2-con raster vat-ly + research ESC/POS vs TSPL

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/shared/web2-printer.js`

## Last 5 commits touching `web2/`

- `41002b5d6` feat(web2 print): may in tem 2-con in dung kich thuoc that (raster vat-ly-mm 8 cham/mm) + option 'Tem nhan' trong cau hinh may in _(2026-06-04)_
- `ca11b5a4a` auto: session update _(2026-06-04)_
- `f2761d6b6` fix(web2 bill): STT ghi so ngay canh 'Phieu Ban Hang - 313' + fix cat chu SAN PHAM/THANH TIEN/TONG TIEN (^ double-width tran cpl -> ^^ double-height vua khit) _(2026-06-04)_
- `336191adf` feat(web2-chat-readonly): avatar that FB (list + thread) qua Worker /api/fb-avatar _(2026-06-04)_
- `e409d5347` fix(web2 print): dau tieng Viet ro hon khi in - bo emphasis (giong NHI JUDY) + chu to cpl 32 + supersample 2x raster (giu net manh/dau) + stroke nhe _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-211025-9070c9e` cho Claude walk chain theo CLAUDE.md protocol.
