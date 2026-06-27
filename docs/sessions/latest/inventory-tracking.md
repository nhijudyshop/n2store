# Latest Snapshot — `inventory-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-114933-a8933df`
**Session file**: [`./20260627-114933-a8933df.md`](../20260627-114933-a8933df.md)
**Commit**: `a8933df` — feat(inventory-tracking): cho nhập giá thập phân (ô Sản phẩm) + kg thập phân (ô Kiện Hàng), dấu phẩy kiểu VN
**Last updated**: 2026-06-27 11:49:33 +07
**Summary**: inventory-tracking: nhập giá/kg thập phân dấu phẩy VN

## Files changed in this commit (`inventory-tracking/`)

- `inventory-tracking/js/modal-order-booking.js`
- `inventory-tracking/js/modal-shipment.js`

## Last 5 commits touching `inventory-tracking/`

- `a8933df1a` feat(inventory-tracking): cho nhập giá thập phân (ô Sản phẩm) + kg thập phân (ô Kiện Hàng), dấu phẩy kiểu VN _(2026-06-27)_
- `a607fb10b` auto: session update _(2026-06-27)_
- `c12c94f20` auto: session update _(2026-06-24)_
- `54328d2f0` feat(inventory-tracking): bỏ inline edit → popup input (dễ thao tác iPad) _(2026-06-24)_
- `2b6e72cb7` feat(inventory-tracking): kéo sắp xếp thứ tự Màu/Size — lưu DB, load về các máy _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-114933-a8933df` cho Claude walk chain theo CLAUDE.md protocol.
