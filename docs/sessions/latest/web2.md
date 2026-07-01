# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-134116-2108c84`
**Session file**: [`./20260701-134116-2108c84.md`](../20260701-134116-2108c84.md)
**Commit**: `2108c84` — feat(web2-shared): Web2PinchZoom + goods-weight preview pinch-to-zoom (2 ngón)
**Last updated**: 2026-07-01 13:41:16 +07
**Summary**: goods-weight: Web2PinchZoom pinch-to-zoom ảnh preview (2 ngón)

## Files changed in this commit (`web2/`)

- `web2/ai-hub/index.html`
- `web2/goods-weight/index.html`
- `web2/goods-weight/js/goods-weight.js`
- `web2/shared/web2-gemini-client.js`
- `web2/shared/web2-pinch-zoom.js`

## Last 5 commits touching `web2/`

- `2108c84ee` feat(web2-shared): Web2PinchZoom + goods-weight preview pinch-to-zoom (2 ngón) _(2026-07-01)_
- `d0da89dd5` feat(ai-hub): ảnh ưu tiên paid trước, hết lượt mới free; text vẫn free _(2026-07-01)_
- `6531ff93e` feat(goods-weight): thêm nút 'Tải ảnh lên' (gallery/file) cạnh 'Chụp ảnh' _(2026-07-01)_
- `a897e9cf0` feat(goods-weight): báo cáo mỗi lần cân 1 dòng (bỏ gộp ngày) + full datetime giây cả 2 tab _(2026-07-01)_
- `da68db00d` fix(goods-weight): drawer giữ mở khi SSE/reload (refresh tại chỗ) sau sửa/xoá bản ghi _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-134116-2108c84` cho Claude walk chain theo CLAUDE.md protocol.
