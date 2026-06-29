# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-113245-78dd026`
**Session file**: [`./20260629-113245-78dd026.md`](../20260629-113245-78dd026.md)
**Commit**: `78dd026` — feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN
**Last updated**: 2026-06-29 11:32:45 +07
**Summary**: unit-scan: danh sách tất cả tem của SP (ẩn/bật, mỗi tem→STT) + QR tem in to hơn

## Files changed in this commit (`web2/`)

- `web2/products/index.html`
- `web2/products/js/web2-products-print-render.js`
- `web2/unit-scan/css/unit-scan.css`
- `web2/unit-scan/index.html`
- `web2/unit-scan/js/unit-scan.js`

## Last 5 commits touching `web2/`

- `78dd026c1` feat(unit-scan): danh sách TẤT CẢ tem của SP (ẩn/bật, mỗi tem→STT) + QR tem TO HƠN _(2026-06-29)_
- `968eadd74` feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens) _(2026-06-29)_
- `e3c37b66b` docs(web2): regen codemap + system-data (goods-weight page/route/SSE registered) _(2026-06-29)_
- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `bc8640b9f` feat(clearance): admin-only chuyển SP rớt xả ↔ kho chính (gate POST /:id/clearance + ẩn nút non-admin) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-113245-78dd026` cho Claude walk chain theo CLAUDE.md protocol.
