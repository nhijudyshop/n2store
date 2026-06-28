# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-112707-035960e`
**Session file**: [`./20260628-112707-035960e.md`](../20260628-112707-035960e.md)
**Commit**: `035960e` — docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause
**Last updated**: 2026-06-28 11:27:07 +07
**Summary**: docs(dev-log): vòng đời SP HẾT HÀNG (nhận→bán→hết hàng) + invariant manual-pause

## Files changed in this commit (`web2/`)

- `web2/live-control/index.html`
- `web2/live-tv/index.html`
- `web2/products/index.html`
- `web2/products/js/web2-products-render.js`

## Last 5 commits touching `web2/`

- `c4da6cce1` fix(web2): HET*HANG review-fixes — preserve manual pause + parent badge + refund paths *(2026-06-28)\_
- `73195acbd` auto: session update _(2026-06-28)_
- `24af511a8` feat(ai-widget): redesign UI sang xanh Zalo (#0068ff) hiện đại + depth/motion _(2026-06-28)_
- `71fa512e4` fix(ai-widget): không treo/im lặng khi data trang quá lớn (live comments) _(2026-06-28)_
- `5eebb5bac` feat(ai-widget): expose + accessor report-revenue + audit-log (đợt cuối, 12/12) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-112707-035960e` cho Claude walk chain theo CLAUDE.md protocol.
