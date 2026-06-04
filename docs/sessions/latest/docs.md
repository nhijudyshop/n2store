# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-104634-23fe43e`
**Session file**: [`./20260604-104634-23fe43e.md`](../20260604-104634-23fe43e.md)
**Commit**: `23fe43e` — fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn
**Last updated**: 2026-06-04 10:46:34 +07
**Summary**: fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermar...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `23fe43e4d` fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn _(2026-06-04)_
- `5ae4b9226` chore(session): RESUME:20260604-104500-3af9039 _(2026-06-04)_
- `3af903913` feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2*so_order) *(2026-06-04)\_
- `13bd4e80f` chore(session): RESUME:20260604-103722-f27b575 _(2026-06-04)_
- `f27b57581` chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-104634-23fe43e` cho Claude walk chain theo CLAUDE.md protocol.
