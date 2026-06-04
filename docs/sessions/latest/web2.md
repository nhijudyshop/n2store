# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-105742-6687ad8`
**Session file**: [`./20260604-105742-6687ad8.md`](../20260604-105742-6687ad8.md)
**Commit**: `6687ad8` — feat(web2): photo-studio — engine fal.ai BiRefNet (HD, không watermark) cho Cloud HD
**Last updated**: 2026-06-04 10:57:42 +07
**Summary**: feat(web2): photo-studio — engine fal.ai BiRefNet (HD, không watermark) cho Cloud HD

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`

## Last 5 commits touching `web2/`

- `6687ad8a9` feat(web2): photo-studio — engine fal.ai BiRefNet (HD, không watermark) cho Cloud HD _(2026-06-04)_
- `93886e4e0` auto: session update _(2026-06-04)_
- `23fe43e4d` fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn _(2026-06-04)_
- `9fe1e71c0` feat(web2): photo-studio — mặc định tỉ lệ khung 4:5 (chuẩn ảnh sản phẩm) _(2026-06-04)_
- `c694d7a98` feat(web2): photo-studio v10 — REBUILD giao diện camera-app mobile-first _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-105742-6687ad8` cho Claude walk chain theo CLAUDE.md protocol.
