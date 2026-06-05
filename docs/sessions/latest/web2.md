# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-102613-b0d1073`
**Session file**: [`./20260605-102613-b0d1073.md`](../20260605-102613-b0d1073.md)
**Commit**: `b0d1073` — auto: session update
**Last updated**: 2026-06-05 10:26:13 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/web2-pending-match.js`
- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-bill-service.js`
- `web2/shared/web2-chat-readonly.js`

## Last 5 commits touching `web2/`

- `b0d10735f` auto: session update _(2026-06-05)_
- `0d09c837e` feat(web2): chon KH tu list hoi thoai FB (nut Gan KH nay) -> resolve pending _(2026-06-05)_
- `83cfd4b79` auto: session update _(2026-06-05)_
- `4296bb215` feat(web2-pending): nut chat moi card + goi y ten KH tu Pancake theo SDT _(2026-06-05)_
- `47c0d995f` feat(web2 bill): redesign bill HTML/CSS thay ReceiptLine - khung COD + khung ma vach + duong trang tri (dashed/solid/double) + gon dep, in qua raster vat-ly 72mm->576cham _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-102613-b0d1073` cho Claude walk chain theo CLAUDE.md protocol.
