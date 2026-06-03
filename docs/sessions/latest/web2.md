# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-193815-fb2a1c6`
**Session file**: [`./20260603-193815-fb2a1c6.md`](../20260603-193815-fb2a1c6.md)
**Commit**: `fb2a1c6` — feat(web2): photo-studio v2 — fix loading overlay + tỉ lệ khung, spill, mờ nền, chụp full-res, PNG/JPG
**Last updated**: 2026-06-03 19:38:15 +07
**Summary**: feat(web2): photo-studio v2 — fix loading overlay + tỉ lệ khung, spill, mờ nền, chụp full-res, PNG/JPG

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/balance-history/js/tpos-partner-enricher.js`
- `web2/balance-history/js/web2-balance-history-app.js`
- `web2/balance-history/js/web2-customer-detail-modal.js`
- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.css`
- `web2/photo-studio/photo-studio.js`
- `web2/services-dashboard/js/services-dashboard.js`

## Last 5 commits touching `web2/`

- `fb2a1c683` feat(web2): photo-studio v2 — fix loading overlay + tỉ lệ khung, spill, mờ nền, chụp full-res, PNG/JPG _(2026-06-03)_
- `e3296f2d3` auto: session update _(2026-06-03)_
- `2db6ef09b` fix(services-dashboard): cập nhật mô tả DB đúng cutover — chatDb=Web 1.0, web2Db=toàn bộ Web 2.0 (khớp overview) _(2026-06-03)_
- `0d69b76ea` feat(balance-history): bỏ cột Mã tham chiếu + nút ↗ + modal chi tiết KH (info/ví/đơn hàng, sửa→sync TPOS) _(2026-06-03)_
- `f3193229a` feat(web2): photo-studio — chụp camera tách nền (AI + chroma key) ghép phông màu/ảnh/trong suốt _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-193815-fb2a1c6` cho Claude walk chain theo CLAUDE.md protocol.
