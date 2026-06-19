# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260619-212403-351704d`
**Session file**: [`./20260619-212403-351704d.md`](../20260619-212403-351704d.md)
**Commit**: `351704d` — docs(dev-log): fb-ads-stats nhập tay + ad account qua BM
**Last updated**: 2026-06-19 21:24:03 +07
**Summary**: docs(dev-log): fb-ads-stats nhập tay + ad account qua BM

## Files changed in this commit (`web2/`)

- `web2/fb-ads-stats/index.html`
- `web2/fb-ads-stats/js/fb-ads-manual.js`
- `web2/fb-ads-stats/js/fb-ads-stats.js`

## Last 5 commits touching `web2/`

- `f1e733d18` feat(web2/fb-ads-stats): Nhập tay sổ quảng cáo (gắn bài + tiền QC + số đơn) → tổng hợp ngày/tuần/tháng + ad account qua BM _(2026-06-19)_
- `c352ee31b` auto: session update _(2026-06-19)_
- `37c9717cf` feat(web2/fb-ads-stats): lấy ad account qua Business Manager (owned/client) — không cần đăng nhập đúng người chạy QC _(2026-06-19)_
- `c799ddd14` feat(web2): group Facebook riêng + 2 trang Thống kê tương tác & Thống kê quảng cáo _(2026-06-19)_
- `bca58afa1` feat(web2/video-maker): port chất Remotion (spring/easing/interpolate) sang vanilla — KHÔNG Remotion _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260619-212403-351704d` cho Claude walk chain theo CLAUDE.md protocol.
