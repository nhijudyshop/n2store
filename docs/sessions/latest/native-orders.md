# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-203636-435dd76`
**Session file**: [`./20260629-203636-435dd76.md`](../20260629-203636-435dd76.md)
**Commit**: `435dd76` — feat(native-orders): ô tìm kiếm typeahead gợi ý KH/đơn từ data đã tải
**Last updated**: 2026-06-29 20:36:36 +07
**Summary**: feat(native-orders): ô tìm kiếm typeahead gợi ý KH/đơn từ data đã tải

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`
- `native-orders/js/native-orders-realtime-init.js`
- `native-orders/js/native-orders-render.js`

## Last 5 commits touching `native-orders/`

- `435dd7632` feat(native-orders): ô tìm kiếm typeahead gợi ý KH/đơn từ data đã tải _(2026-06-29)_
- `093ec4539` feat(native-orders): bộ lọc Thẻ (autoTags) client-side trên trang Đơn Web _(2026-06-29)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_
- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `04b66121c` fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-203636-435dd76` cho Claude walk chain theo CLAUDE.md protocol.
