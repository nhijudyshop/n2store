# Latest Snapshot — `purchase-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153901-7cfb013`
**Session file**: [`./20260521-153901-7cfb013.md`](../20260521-153901-7cfb013.md)
**Commit**: `7cfb013` — chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b
**Last updated**: 2026-05-21 15:39:01 +07
**Summary**: chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b

## Files changed in this commit (`purchase-orders/`)

- `purchase-orders/goods-receiving/index.html`
- `purchase-orders/index.html`

## Last 5 commits touching `purchase-orders/`

- `7cfb0132` chore(cache-bust): opt-in toàn bộ 88 pages còn lại vào ?v=20260521b _(2026-05-21)_
- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `54cc66d6` feat(purchase-orders): hover x5 zoom + click lightbox cho ảnh trong form Tạo đơn đặt hàng _(2026-05-19)_
- `3cf7d74c` fix(orders): InventoryPicker "Chọn từ Kho SP" thiếu template không có active variant _(2026-05-15)_
- `04fbfd41` fix(orders): barcode recheck báo 38/38 missing vì TPOS OData 400 với >20 `or` _(2026-05-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153901-7cfb013` cho Claude walk chain theo CLAUDE.md protocol.
