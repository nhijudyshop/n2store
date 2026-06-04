# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-111903-954852a`
**Session file**: [`./20260604-111903-954852a.md`](../20260604-111903-954852a.md)
**Commit**: `954852a` — feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)
**Last updated**: 2026-06-04 11:19:03 +07
**Summary**: feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `954852a89` feat(soluong-live): realtime TPOS sync tên/hình/số lượng (giữ logic biến thể) _(2026-06-04)_
- `d194eab99` chore(session): RESUME:20260604-105742-6687ad8 _(2026-06-04)_
- `6687ad8a9` feat(web2): photo-studio — engine fal.ai BiRefNet (HD, không watermark) cho Cloud HD _(2026-06-04)_
- `0467990a3` chore(session): RESUME:20260604-105635-93886e4 _(2026-06-04)_
- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-111903-954852a` cho Claude walk chain theo CLAUDE.md protocol.
