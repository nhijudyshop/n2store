# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260603-192402-f319322`
**Session file**: [`./20260603-192402-f319322.md`](../20260603-192402-f319322.md)
**Commit**: `f319322` — feat(web2): photo-studio — chụp camera tách nền (AI + chroma key) ghép phông màu/ảnh/trong suốt
**Last updated**: 2026-06-03 19:24:02 +07
**Summary**: feat(web2): photo-studio — chụp camera tách nền (AI + chroma key) ghép phông màu/ảnh/trong suốt

## Files changed in this commit (`web2/`)

- `web2/photo-studio/index.html`
- `web2/photo-studio/photo-studio.css`
- `web2/photo-studio/photo-studio.js`

## Last 5 commits touching `web2/`

- `f3193229a` feat(web2): photo-studio — chụp camera tách nền (AI + chroma key) ghép phông màu/ảnh/trong suốt _(2026-06-03)_
- `ca5cc6c52` auto: session update _(2026-06-03)_
- `69d99a656` docs(web2): overview thêm #datastores (kho dữ liệu dùng chung — 1 nguồn/domain) + dev-log kho KH thống nhất _(2026-06-03)_
- `7c95a42d3` feat(web2): report-delivery tách Web 1.0 — /api/pbh-reports/delivery tổng hợp từ fast*sale_orders (web2Db) group theo nhóm+NVC, bỏ /api/v2/delivery-assignments *(2026-06-03)\_
- `87018611e` docs(web2): overview thêm section #conventions (quy ước Web 2.0 canonical cho code mới) + CLAUDE.md pointer _(2026-06-03)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260603-192402-f319322` cho Claude walk chain theo CLAUDE.md protocol.
