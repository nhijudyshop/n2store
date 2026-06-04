# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-162055-a3617be`
**Session file**: [`./20260604-162055-a3617be.md`](../20260604-162055-a3617be.md)
**Commit**: `a3617be` — chore(web2): drop orphan inventory*\* tables tren web2Db (guarded)
**Last updated**: 2026-06-04 16:20:55 +07
**Summary**: chore(web2): drop orphan inventory*\* tables tren web2Db (guarded)

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.css`
- `web2/photo-studio/photo-studio.js`
- `web2/shared/delivery-method-picker.js`
- `web2/shared/tpos-sidebar.js`

## Last 5 commits touching `web2/`

- `eeaed921b` feat(web2): photo-studio đợt 2 — di chuyển/phóng to chủ thể trên nền (kéo + chụm 2 ngón + căn giữa) _(2026-06-04)_
- `fc8656d74` fix(delivery-picker): exact keyword thang fuzzy -> Binh Thanh = TP Trung tam _(2026-06-04)_
- `6a53072fc` feat(web2): photo-studio đợt 1 — bóng đổ + khổ sàn TMĐT + auto-đẹp + WEBP/quality + logo watermark _(2026-06-04)_
- `5877b88ca` feat(native-orders): badge phuong thuc giao o cot dia chi + luu lai + chinh tay _(2026-06-04)_
- `3ac96d297` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-162055-a3617be` cho Claude walk chain theo CLAUDE.md protocol.
