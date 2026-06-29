# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-214247-ce1efe3`
**Session file**: [`./20260629-214247-ce1efe3.md`](../20260629-214247-ce1efe3.md)
**Commit**: `ce1efe3` — refactor(native-orders): bỏ nút PBH SHOP bulk (redundant) + gỡ content-visibility
**Last updated**: 2026-06-29 21:42:47 +07
**Summary**: refactor(native-orders): bỏ nút PBH SHOP bulk + gỡ content-visibility

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-bulk-operations.js`
- `native-orders/js/native-orders-realtime-init.js`

## Last 5 commits touching `native-orders/`

- `ce1efe30e` refactor(native-orders): bỏ nút PBH SHOP bulk (redundant) + gỡ content-visibility _(2026-06-29)_
- `41bddb7cc` perf(native-orders): chunked render + content-visibility — hết freeze list lớn _(2026-06-29)_
- `435dd7632` feat(native-orders): ô tìm kiếm typeahead gợi ý KH/đơn từ data đã tải _(2026-06-29)_
- `093ec4539` feat(native-orders): bộ lọc Thẻ (autoTags) client-side trên trang Đơn Web _(2026-06-29)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-214247-ce1efe3` cho Claude walk chain theo CLAUDE.md protocol.
