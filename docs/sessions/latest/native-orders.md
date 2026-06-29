# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-200306-093ec45`
**Session file**: [`./20260629-200306-093ec45.md`](../20260629-200306-093ec45.md)
**Commit**: `093ec45` — feat(native-orders): bộ lọc Thẻ (autoTags) client-side trên trang Đơn Web
**Last updated**: 2026-06-29 20:03:06 +07
**Summary**: feat(native-orders): bộ lọc Thẻ (autoTags) client-side cho trang Đơn Web

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-filters-campaigns.js`
- `native-orders/js/native-orders-realtime-init.js`
- `native-orders/js/native-orders-render.js`
- `native-orders/js/native-orders-state.js`

## Last 5 commits touching `native-orders/`

- `093ec4539` feat(native-orders): bộ lọc Thẻ (autoTags) client-side trên trang Đơn Web _(2026-06-29)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_
- `17f400a21` feat(sort-station): trang "Bàn chia hàng" 📱 — put-wall sortation guided _(2026-06-29)_
- `04b66121c` fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number) _(2026-06-29)_
- `09123bcbc` docs(native-orders): dọn comment STT cũ ('1 + 2') cho khớp hành vi gộp mới _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-200306-093ec45` cho Claude walk chain theo CLAUDE.md protocol.
