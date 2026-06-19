# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-211842-c352ee3`
**Session file**: [`./20260619-211842-c352ee3.md`](../20260619-211842-c352ee3.md)
**Commit**: `c352ee3` — auto: session update
**Last updated**: 2026-06-19 21:18:42 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/fb-ads-stats/index.html`
- `web2/fb-ads-stats/js/fb-ads-stats.js`
- `web2/fb-insights/index.html`
- `web2/fb-insights/js/fb-insights.js`
- `web2/fb-posts/js/fb-posts-api.js`
- `web2/shared/web2-sidebar.js`

## Last 5 commits touching `web2/`

- `c352ee31b` auto: session update _(2026-06-19)_
- `37c9717cf` feat(web2/fb-ads-stats): lấy ad account qua Business Manager (owned/client) — không cần đăng nhập đúng người chạy QC _(2026-06-19)_
- `c799ddd14` feat(web2): group Facebook riêng + 2 trang Thống kê tương tác & Thống kê quảng cáo _(2026-06-19)_
- `bca58afa1` feat(web2/video-maker): port chất Remotion (spring/easing/interpolate) sang vanilla — KHÔNG Remotion _(2026-06-19)_
- `add3a5bcf` feat(web2/fb-posts): nhận diện loại bài (live/video/hình/bài viết) + bộ lọc; bỏ auto-chọn tất cả page (tránh đăng nhầm) _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-211842-c352ee3` cho Claude walk chain theo CLAUDE.md protocol.
