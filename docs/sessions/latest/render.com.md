# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-200946-947aea7`
**Session file**: [`./20260524-200946-947aea7.md`](../20260524-200946-947aea7.md)
**Commit**: `947aea7` — fix(snap): ffmpeg HTTP flags only for URL input — local file fail 'Option timeout not found'
**Last updated**: 2026-05-24 20:09:46 +07
**Summary**: fix(snap): ffmpeg HTTP flags only for URL input — local file fail 'Option timeout not found'

## Files changed in this commit (`render.com/`)

- `render.com/routes/livestream-snapshots.js`
- `render.com/routes/v2/balance-history.js`
- `render.com/routes/v2/dashboard-kpi.js`
- `render.com/routes/v2/notifications.js`
- `render.com/routes/v2/smart-match.js`

## Last 5 commits touching `render.com/`

- `947aea73a` fix(snap): ffmpeg HTTP flags only for URL input — local file fail 'Option timeout not found' _(2026-05-24)_
- `943531847` fix(balance-history): migrate /v2/ về balance*history (Web 1) thay vì web2_balance_history - fix sync Duyệt+ảnh sang delivery-report *(2026-05-24)\_
- `6d41b6366` fix(snap): tier-2 fallback yt-dlp download segment + local ffmpeg _(2026-05-24)_
- `06a9dcb40` fix(snap): ffmpeg UA spoof + Referer — FB CDN 403 với default ffmpeg UA _(2026-05-24)_
- `3254cd31f` fix(snap): ffmpeg input-seek SIGSEGV → fallback output-seek _(2026-05-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-200946-947aea7` cho Claude walk chain theo CLAUDE.md protocol.
