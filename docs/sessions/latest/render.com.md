# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-121628-55f5efe`
**Session file**: [`./20260606-121628-55f5efe.md`](../20260606-121628-55f5efe.md)
**Commit**: `55f5efe` — fix(snap): update yt-dlp lên latest tại build (postinstall -U) — fix '[facebook] Cannot parse data' → force extract; yt-dlp primary, Graph fallback
**Last updated**: 2026-06-06 12:16:28 +07
**Summary**: fix(snap): update yt-dlp lên latest tại build (postinstall -U) — fix '[facebook] Cannot parse data' → force ex...

## Files changed in this commit (`render.com/`)

- `render.com/package.json`
- `render.com/scripts/update-ytdlp.js`

## Last 5 commits touching `render.com/`

- `55f5efeb3` fix(snap): update yt-dlp lên latest tại build (postinstall -U) — fix '[facebook] Cannot parse data' → force extract; yt-dlp primary, Graph fallback _(2026-06-06)_
- `871426e70` auto: session update _(2026-06-06)_
- `5202d1b67` feat(web2-reconcile): endpoint + nút hủy đóng gói (cancel-pack) _(2026-06-06)_
- `c9e3898d5` fix(web2): performed*by ALTER lên tuyệt đối đầu + CREATE guard to_regclass *(2026-06-06)\_
- `4030613bd` fix(web2): cộng ví fail toàn bộ (performed*by) + CK tự động hoàn toàn *(2026-06-06)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-121628-55f5efe` cho Claude walk chain theo CLAUDE.md protocol.
