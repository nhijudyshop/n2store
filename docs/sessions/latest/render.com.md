# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-184810-b3c136b`
**Session file**: [`./20260524-184810-b3c136b.md`](../20260524-184810-b3c136b.md)
**Commit**: `b3c136b` — fix(snap): force re-TRUNCATE với marker v2 (user báo DB còn old snapshots)
**Last updated**: 2026-05-24 18:48:10 +07
**Summary**: fix(snap): force re-TRUNCATE với marker v2 (user báo DB còn old snapshots)

## Files changed in this commit (`render.com/`)

- `render.com/routes/livestream-snapshots.js`

## Last 5 commits touching `render.com/`

- `b3c136b23` fix(snap): force re-TRUNCATE với marker v2 (user báo DB còn old snapshots) _(2026-05-24)_
- `2420d8c86` chore(snap): one-time TRUNCATE post-crop-fix migration _(2026-05-24)_
- `2ead90364` fix(snap): DB dedup — UNIQUE INDEX (comment*id) + ON CONFLICT + client cache skip *(2026-05-24)\_
- `8aa70c0d4` auto: session update _(2026-05-24)_
- `bcf235f87` feat(snap-embed): Step B — dash.js raw stream + video.captureStream (no FB iframe, no share popup) _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-184810-b3c136b` cho Claude walk chain theo CLAUDE.md protocol.
