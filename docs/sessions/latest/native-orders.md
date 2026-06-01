# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-142549-fbfbba6`
**Session file**: [`./20260601-142549-fbfbba6.md`](../20260601-142549-fbfbba6.md)
**Commit**: `fbfbba6` — feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address
**Last updated**: 2026-06-01 14:25:49 +07
**Summary**: feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address

## Files changed in this commit (`native-orders/`)

- `native-orders/css/native-orders.css`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `fbfbba67f` feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address _(2026-06-01)_
- `c8519cd5c` feat(native-orders): customer side-panel slide-in từ phải (option 4) _(2026-06-01)_
- `5964e7cbb` refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại") _(2026-06-01)_
- `cbc4e8cd5` fix(native-orders): customer hover popover overlap bug + TPOS-live address _(2026-06-01)_
- `407a3add6` fix(native-orders): customer hover popover bug — bỏ avatar zoom, dời popover xuống dưới row, enrich với TPOS data _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-142549-fbfbba6` cho Claude walk chain theo CLAUDE.md protocol.
