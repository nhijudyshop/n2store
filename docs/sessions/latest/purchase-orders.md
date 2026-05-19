# Latest Snapshot — `purchase-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-102628-391e058`
**Session file**: [`./20260519-102628-391e058.md`](../20260519-102628-391e058.md)
**Commit**: `391e058` — auto: session update
**Last updated**: 2026-05-19 10:26:28 +07
**Summary**: auto: session update

## Files changed in this commit (`purchase-orders/`)

- `purchase-orders/css/table.css`
- `purchase-orders/js/form-modal.js`

## Last 5 commits touching `purchase-orders/`

- `54cc66d6` feat(purchase-orders): hover x5 zoom + click lightbox cho ảnh trong form Tạo đơn đặt hàng _(2026-05-19)_
- `3cf7d74c` fix(orders): InventoryPicker "Chọn từ Kho SP" thiếu template không có active variant _(2026-05-15)_
- `04fbfd41` fix(orders): barcode recheck báo 38/38 missing vì TPOS OData 400 với >20 `or` _(2026-05-15)_
- `3ac3ed4c` fix(orders): auto-generate code jump B2246 → B19752 vì query Product variants _(2026-05-15)_
- `62b6f42d` fix(purchase-orders): TPOS OData 502 — bỏ \$select trong Strategy A, 2-step Strategy B _(2026-05-14)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-102628-391e058` cho Claude walk chain theo CLAUDE.md protocol.
