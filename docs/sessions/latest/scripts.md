# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-100505-020b3c7`
**Session file**: [`./20260524-100505-020b3c7.md`](../20260524-100505-020b3c7.md)
**Commit**: `020b3c7` — fix(snap-embed): full 16:9 video capture + skip FB header chrome
**Last updated**: 2026-05-24 10:05:05 +07
**Summary**: fix(snap-embed): full 16:9 video capture + skip FB header chrome

## Files changed in this commit (`scripts/`)

- `scripts/bench-fb-stream-url.js`

## Last 5 commits touching `scripts/`

- `020b3c7b1` fix(snap-embed): full 16:9 video capture + skip FB header chrome _(2026-05-24)_
- `229cb71ff` feat(tpos-comments): archive fallback via SaleOnline*Order (post xóa khỏi FB vẫn có) *(2026-05-24)\_
- `c6c247bfa` fix(tpos-comments): fail-fast 2.5s + live*filter param + Pancake Graph fallback *(2026-05-24)\_
- `7f510eb91` fix(snap): cleanup frontend refresh-thumbnail call + E2E updates _(2026-05-23)_
- `e0320e0f8` feat(snap): BỎ HẾT chức năng lấy thumbnail URL — chỉ chụp FRAME thật _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-100505-020b3c7` cho Claude walk chain theo CLAUDE.md protocol.
