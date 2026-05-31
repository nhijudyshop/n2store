# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-132957-1a51d7b`
**Session file**: [`./20260531-132957-1a51d7b.md`](../20260531-132957-1a51d7b.md)
**Commit**: `1a51d7b` — feat(native-orders): badge 'Trực tiếp' cho SP add từ picker
**Last updated**: 2026-05-31 13:29:57 +07
**Summary**: feat(native-orders): badge 'Trực tiếp' cho SP add từ picker

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/css/modern.css`
- `inventory-tracking/index.html`
- `inventory-tracking/js/api-client.js`
- `inventory-tracking/js/data-loader.js`
- `inventory-tracking/js/table-renderer.js`

## Last 5 commits touching `inventory-tracking/`

- `cb06f24ef` feat(inventory-tracking): khoảng ngày bắt đầu/kết thúc cho từng đợt — bound thanh toán CK theo ngày _(2026-05-31)_
- `0ac86941e` fix(inventory-tracking): chặn realtime self-reload phá tạo biến thể / sửa inline _(2026-05-30)_
- `42f2b2260` feat(inventory-tracking): cột Tổng SL — bút chì 1-tap sửa số lượng (iPad) _(2026-05-30)_
- `b39bdcfe7` feat(inventory-tracking): cột Chi tiết màu — bút chì 1-tap mở modal biến thể (iPad) _(2026-05-30)_
- `f1ebdaa4e` feat(inventory-tracking): cột Mã hàng — bút chì edit 1-tap trên iPad _(2026-05-30)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-132957-1a51d7b` cho Claude walk chain theo CLAUDE.md protocol.
