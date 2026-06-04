# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-105309-de0fba3`
**Session file**: [`./20260604-105309-de0fba3.md`](../20260604-105309-de0fba3.md)
**Commit**: `de0fba3` — feat(web2): thêm ảnh SP placeholder color-coded cho data ảo
**Last updated**: 2026-06-04 10:53:09 +07
**Summary**: feat(web2): thêm ảnh SP placeholder color-coded cho data ảo

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `de0fba30b` feat(web2): thêm ảnh SP placeholder color-coded cho data ảo _(2026-06-04)_
- `0e92674a5` chore(session): RESUME:20260604-104634-23fe43e _(2026-06-04)_
- `23fe43e4d` fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn _(2026-06-04)_
- `5ae4b9226` chore(session): RESUME:20260604-104500-3af9039 _(2026-06-04)_
- `3af903913` feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2*so_order) *(2026-06-04)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-105309-de0fba3` cho Claude walk chain theo CLAUDE.md protocol.
