# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260523-151846-98dc943`
**Session file**: [`./20260523-151846-98dc943.md`](../20260523-151846-98dc943.md)
**Commit**: `98dc943` — test(snap-e2e): mock getDisplayMedia + set tutorial flag pre-load
**Last updated**: 2026-05-23 15:18:46 +07
**Summary**: test(snap-e2e): mock getDisplayMedia + set tutorial flag pre-load

## Files changed in this commit (`scripts/`)

- `scripts/inspect-fb-thumbnails.js`
- `scripts/inspect-tpos-livevideo.js`
- `scripts/snap-e2e-full-test.js`

## Last 5 commits touching `scripts/`

- `98dc943ae` test(snap-e2e): mock getDisplayMedia + set tutorial flag pre-load _(2026-05-23)_
- `604a8b572` fix(snap): auto-mode không cần share FB nữa (revert auto-prompt) _(2026-05-23)_
- `13f17c601` feat(snap): toggle chip inline thumb (default OFF) + move thumb inline với phone/address _(2026-05-23)_
- `d3a191f6e` feat(snap): compact thumb (chỉ ảnh) + click zoom lightbox _(2026-05-23)_
- `c3c02600c` feat(snap): inline thumbnail strip dưới comment row + by-comment-ids endpoint _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260523-151846-98dc943` cho Claude walk chain theo CLAUDE.md protocol.
