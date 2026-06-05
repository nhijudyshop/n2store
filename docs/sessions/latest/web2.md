# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-095959-b08f869`
**Session file**: [`./20260605-095959-b08f869.md`](../20260605-095959-b08f869.md)
**Commit**: `b08f869` — auto: session update
**Last updated**: 2026-06-05 09:59:59 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/products/index.html`
- `web2/shared/web2-printer.js`

## Last 5 commits touching `web2/`

- `b08f869b5` auto: session update _(2026-06-05)_
- `09393c923` feat(web2 print): TSPL cho may in tem chuyen dung (XP-470B/TSC/Godex) - sinh SIZE/GAP/BITMAP/PRINT tu canvas gui raw qua bridge + field gap mm trong cau hinh _(2026-06-05)_
- `41002b5d6` feat(web2 print): may in tem 2-con in dung kich thuoc that (raster vat-ly-mm 8 cham/mm) + option 'Tem nhan' trong cau hinh may in _(2026-06-04)_
- `ca11b5a4a` auto: session update _(2026-06-04)_
- `f2761d6b6` fix(web2 bill): STT ghi so ngay canh 'Phieu Ban Hang - 313' + fix cat chu SAN PHAM/THANH TIEN/TONG TIEN (^ double-width tran cpl -> ^^ double-height vua khit) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-095959-b08f869` cho Claude walk chain theo CLAUDE.md protocol.
