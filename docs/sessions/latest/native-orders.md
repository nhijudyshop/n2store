# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-142333-ad9ef3f`
**Session file**: [`./20260605-142333-ad9ef3f.md`](../20260605-142333-ad9ef3f.md)
**Commit**: `ad9ef3f` — auto: session update
**Last updated**: 2026-06-05 14:23:33 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `ad9ef3fe5` auto: session update _(2026-06-05)_
- `d1cba956e` feat(native-orders): nut PBH SHOP (1 don) mo modal Tao PBH voi phuong thuc 'BAN HANG SHOP' disable + ship 0 (giong Tao PBH thuong); nhieu don giu bulk confirm _(2026-06-05)_
- `220a8f98c` fix(native-orders): bill STT khop list (computeOrderStt dung chung) - don gop ghi 'STT1 + STT2', don thuong campaignStt (truoc in displayStt global lech) _(2026-06-05)_
- `5ad4e2281` fix(native-orders): in bill truyen pbhCarrierName vao delivery.carrierName - don PBH SHOP gio hien dau 'PBH SHOP' tren bill (truoc hardcode '' -> mat dau shop) _(2026-06-05)_
- `397deda52` feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP' _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-142333-ad9ef3f` cho Claude walk chain theo CLAUDE.md protocol.
