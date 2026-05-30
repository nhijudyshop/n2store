# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-154750-a96f3cd`
**Session file**: [`./20260530-154750-a96f3cd.md`](../20260530-154750-a96f3cd.md)
**Commit**: `a96f3cd` — perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant
**Last updated**: 2026-05-30 15:47:50 +07
**Summary**: perf(web2-cache): localStorage stale-while-revalidate persist → kho SP load instant

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/index.html`
- `inventory-tracking/js/api-client.js`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/modal-variant.js`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `0ac86941e` fix(inventory-tracking): chặn realtime self-reload phá tạo biến thể / sửa inline _(2026-05-30)_
- `42f2b2260` feat(inventory-tracking): cột Tổng SL — bút chì 1-tap sửa số lượng (iPad) _(2026-05-30)_
- `b39bdcfe7` feat(inventory-tracking): cột Chi tiết màu — bút chì 1-tap mở modal biến thể (iPad) _(2026-05-30)_
- `f1ebdaa4e` feat(inventory-tracking): cột Mã hàng — bút chì edit 1-tap trên iPad _(2026-05-30)_
- `8ab40dd09` fix(inventory-tracking): iPad — double-click edit toàn bảng, giữ pinch-zoom 2 ngón _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-154750-a96f3cd` cho Claude walk chain theo CLAUDE.md protocol.
