# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-104634-23fe43e`
**Session file**: [`./20260604-104634-23fe43e.md`](../20260604-104634-23fe43e.md)
**Commit**: `23fe43e` — fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn
**Last updated**: 2026-06-04 10:46:34 +07
**Summary**: fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermar...

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.js`

## Last 5 commits touching `web2/`

- `23fe43e4d` fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn _(2026-06-04)_
- `9fe1e71c0` feat(web2): photo-studio — mặc định tỉ lệ khung 4:5 (chuẩn ảnh sản phẩm) _(2026-06-04)_
- `c694d7a98` feat(web2): photo-studio v10 — REBUILD giao diện camera-app mobile-first _(2026-06-04)_
- `25ba62b80` feat(web2-products): gộp tồn kho vào chung cột Biến thể _(2026-06-04)_
- `a3e145244` auto: session update _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-104634-23fe43e` cho Claude walk chain theo CLAUDE.md protocol.
