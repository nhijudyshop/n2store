# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-104252-a66d6b5`
**Session file**: [`./20260605-104252-a66d6b5.md`](../20260605-104252-a66d6b5.md)
**Commit**: `a66d6b5` — docs(dev-log): bill SP ten hang 1, so hang 2
**Last updated**: 2026-06-05 10:42:52 +07
**Summary**: docs(dev-log): bill SP ten hang 1, so hang 2

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `17f8f4cf0` feat(web2 bill): SP hang 1 = ten day du, hang 2 = SL/DON GIA/T.TIEN canh cot duoi header _(2026-06-05)_
- `b0d10735f` auto: session update _(2026-06-05)_
- `47c0d995f` feat(web2 bill): redesign bill HTML/CSS thay ReceiptLine - khung COD + khung ma vach + duong trang tri (dashed/solid/double) + gon dep, in qua raster vat-ly 72mm->576cham _(2026-06-05)_
- `09393c923` feat(web2 print): TSPL cho may in tem chuyen dung (XP-470B/TSC/Godex) - sinh SIZE/GAP/BITMAP/PRINT tu canvas gui raw qua bridge + field gap mm trong cau hinh _(2026-06-05)_
- `41002b5d6` feat(web2 print): may in tem 2-con in dung kich thuoc that (raster vat-ly-mm 8 cham/mm) + option 'Tem nhan' trong cau hinh may in _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-104252-a66d6b5` cho Claude walk chain theo CLAUDE.md protocol.
