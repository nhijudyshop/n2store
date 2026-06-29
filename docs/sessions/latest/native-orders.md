# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-220615-9403ec1`
**Session file**: [`./20260629-220615-9403ec1.md`](../20260629-220615-9403ec1.md)
**Commit**: `9403ec1` — perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge
**Last updated**: 2026-06-29 22:06:15 +07
**Summary**: perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-packing-slip.js`

## Last 5 commits touching `native-orders/`

- `9403ec175` perf(in-bill): gộp Phiếu Soạn Hàng vào đường in chung Web2Bill + bridge _(2026-06-29)_
- `6ce9bb94b` feat(native-orders): Phiếu Soạn Hàng tự tick SP đang Chờ Hàng _(2026-06-29)_
- `ce1efe30e` refactor(native-orders): bỏ nút PBH SHOP bulk (redundant) + gỡ content-visibility _(2026-06-29)_
- `41bddb7cc` perf(native-orders): chunked render + content-visibility — hết freeze list lớn _(2026-06-29)_
- `435dd7632` feat(native-orders): ô tìm kiếm typeahead gợi ý KH/đơn từ data đã tải _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-220615-9403ec1` cho Claude walk chain theo CLAUDE.md protocol.
