# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260524-094223-229cb71`
**Session file**: [`./20260524-094223-229cb71.md`](../20260524-094223-229cb71.md)
**Commit**: `229cb71` — feat(tpos-comments): archive fallback via SaleOnline_Order (post xóa khỏi FB vẫn có)
**Last updated**: 2026-05-24 09:42:23 +07
**Summary**: feat(tpos-comments): archive fallback via SaleOnline_Order (post xóa khỏi FB vẫn có)

## Files changed in this commit (`render.com/`)

- `render.com/routes/facebook.routes.js`

## Last 5 commits touching `render.com/`

- `229cb71ff` feat(tpos-comments): archive fallback via SaleOnline*Order (post xóa khỏi FB vẫn có) *(2026-05-24)\_
- `c6c247bfa` fix(tpos-comments): fail-fast 2.5s + live*filter param + Pancake Graph fallback *(2026-05-24)\_
- `22fc7d074` feat(snap-extract): detect live*active stream + auto-retry cron mỗi giờ *(2026-05-23)\_
- `0ea930939` fix(snap-extract): drop format='best[ext=mp4]/best' — FB live serves HLS m3u8 _(2026-05-23)_
- `f4b250ac1` feat(snap): POST /extract-test sync endpoint với chi tiết error chain _(2026-05-23)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260524-094223-229cb71` cho Claude walk chain theo CLAUDE.md protocol.
