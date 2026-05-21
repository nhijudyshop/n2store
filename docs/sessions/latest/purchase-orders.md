# Latest Snapshot — `purchase-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-100104-b968047`
**Session file**: [`./20260521-100104-b968047.md`](../20260521-100104-b968047.md)
**Commit**: `b968047` — docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN
**Last updated**: 2026-05-21 10:01:04 +07
**Summary**: docs(web2-products): dev-log entry cho migration 078 backfill + force-sync GIÀY ĐEN

## Files changed in this commit (`purchase-orders/`)

- `purchase-orders/js/form-modal.js`
- `purchase-orders/js/lib/image-utils.js`

## Last 5 commits touching `purchase-orders/`

- `243383d0` fix(purchase-orders): paste image lớn không bị lỗi nữa + persistent session restore + debug-via-console rule _(2026-05-21)_
- `54cc66d6` feat(purchase-orders): hover x5 zoom + click lightbox cho ảnh trong form Tạo đơn đặt hàng _(2026-05-19)_
- `3cf7d74c` fix(orders): InventoryPicker "Chọn từ Kho SP" thiếu template không có active variant _(2026-05-15)_
- `04fbfd41` fix(orders): barcode recheck báo 38/38 missing vì TPOS OData 400 với >20 `or` _(2026-05-15)_
- `3ac3ed4c` fix(orders): auto-generate code jump B2246 → B19752 vì query Product variants _(2026-05-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-100104-b968047` cho Claude walk chain theo CLAUDE.md protocol.
