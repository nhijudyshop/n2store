# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-102123-83cfd4b`
**Session file**: [`./20260605-102123-83cfd4b.md`](../20260605-102123-83cfd4b.md)
**Commit**: `83cfd4b` — auto: session update
**Last updated**: 2026-06-05 10:21:23 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/web2-chat-readonly.js`

## Last 5 commits touching `web2/`

- `83cfd4b79` auto: session update _(2026-06-05)_
- `4296bb215` feat(web2-pending): nut chat moi card + goi y ten KH tu Pancake theo SDT _(2026-06-05)_
- `47c0d995f` feat(web2 bill): redesign bill HTML/CSS thay ReceiptLine - khung COD + khung ma vach + duong trang tri (dashed/solid/double) + gon dep, in qua raster vat-ly 72mm->576cham _(2026-06-05)_
- `b08f869b5` auto: session update _(2026-06-05)_
- `09393c923` feat(web2 print): TSPL cho may in tem chuyen dung (XP-470B/TSC/Godex) - sinh SIZE/GAP/BITMAP/PRINT tu canvas gui raw qua bridge + field gap mm trong cau hinh _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-102123-83cfd4b` cho Claude walk chain theo CLAUDE.md protocol.
