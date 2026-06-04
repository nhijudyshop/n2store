# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-105635-93886e4`
**Session file**: [`./20260604-105635-93886e4.md`](../20260604-105635-93886e4.md)
**Commit**: `93886e4` — auto: session update
**Last updated**: 2026-06-04 10:56:35 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_
- `d10de12c4` chore(session): RESUME:20260604-105309-de0fba3 _(2026-06-04)_
- `de0fba30b` feat(web2): thêm ảnh SP placeholder color-coded cho data ảo _(2026-06-04)_
- `0e92674a5` chore(session): RESUME:20260604-104634-23fe43e _(2026-06-04)_
- `23fe43e4d` fix(web2): photo-studio — mặc định AI nét = Trên máy (@imgly, không watermark); cloud sandbox có watermark thành tùy chọn _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-105635-93886e4` cho Claude walk chain theo CLAUDE.md protocol.
