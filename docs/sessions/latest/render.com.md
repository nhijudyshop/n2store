# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-130524-c4c0a57`
**Session file**: [`./20260606-130524-c4c0a57.md`](../20260606-130524-c4c0a57.md)
**Commit**: `c4c0a57` — feat(snap): force extract + nút Lấy thumbnail chuyển CLIENT-SIDE (seek iframe VOD + capture) — fix FB chặn backend yt-dlp/Graph; verified 14/14✓ thumbnail thật
**Last updated**: 2026-06-06 13:05:24 +07
**Summary**: feat(snap): force extract + nút Lấy thumbnail chuyển CLIENT-SIDE (seek iframe VOD + capture) — fix FB chặn b...

## Files changed in this commit (`render.com/`)

- `render.com/routes/livestream-snapshots.js`

## Last 5 commits touching `render.com/`

- `c4c0a573a` feat(snap): force extract + nút Lấy thumbnail chuyển CLIENT-SIDE (seek iframe VOD + capture) — fix FB chặn backend yt-dlp/Graph; verified 14/14✓ thumbnail thật _(2026-06-06)_
- `8bab5f4cf` fix(web2): CK chỉ auto khi định danh khớp (tránh gửi nhầm khách) _(2026-06-06)_
- `0babf0ce2` feat(web2): CK watcher 2 chiều — xử lý cả tiền-về-trước + đã-ck-sau _(2026-06-06)_
- `1e12157b0` test(snap): Graph resolver thử page+appsecret*proof / page / app-token + nhiều field (source/playable_url/dash) + log chi tiết để tìm strategy chạy được *(2026-06-06)\_
- `55f5efeb3` fix(snap): update yt-dlp lên latest tại build (postinstall -U) — fix '[facebook] Cannot parse data' → force extract; yt-dlp primary, Graph fallback _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-130524-c4c0a57` cho Claude walk chain theo CLAUDE.md protocol.
