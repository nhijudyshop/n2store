# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-095959-b08f869`
**Session file**: [`./20260605-095959-b08f869.md`](../20260605-095959-b08f869.md)
**Commit**: `b08f869` — auto: session update
**Last updated**: 2026-06-05 09:59:59 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `09393c923` feat(web2 print): TSPL cho may in tem chuyen dung (XP-470B/TSC/Godex) - sinh SIZE/GAP/BITMAP/PRINT tu canvas gui raw qua bridge + field gap mm trong cau hinh _(2026-06-05)_
- `41002b5d6` feat(web2 print): may in tem 2-con in dung kich thuoc that (raster vat-ly-mm 8 cham/mm) + option 'Tem nhan' trong cau hinh may in _(2026-06-04)_
- `f2761d6b6` fix(web2 bill): STT ghi so ngay canh 'Phieu Ban Hang - 313' + fix cat chu SAN PHAM/THANH TIEN/TONG TIEN (^ double-width tran cpl -> ^^ double-height vua khit) _(2026-06-04)_
- `e409d5347` fix(web2 print): dau tieng Viet ro hon khi in - bo emphasis (giong NHI JUDY) + chu to cpl 32 + supersample 2x raster (giu net manh/dau) + stroke nhe _(2026-06-04)_
- `d197b6b72` feat(web2 printer): luu may in LEN SERVER (moi user chon) + nut tat/go bridge .bat + in dam hon (dilation raster + stroke 0.9-1.1 + weight 900) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-095959-b08f869` cho Claude walk chain theo CLAUDE.md protocol.
