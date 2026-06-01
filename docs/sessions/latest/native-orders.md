# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-185926-b1b5d7c`
**Session file**: [`./20260601-185926-b1b5d7c.md`](../20260601-185926-b1b5d7c.md)
**Commit**: `b1b5d7c` — feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS
**Last updated**: 2026-06-01 18:59:26 +07
**Summary**: feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix n...

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `fbfbba67f` feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address _(2026-06-01)_
- `c8519cd5c` feat(native-orders): customer side-panel slide-in từ phải (option 4) _(2026-06-01)_
- `5964e7cbb` refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại") _(2026-06-01)_
- `cbc4e8cd5` fix(native-orders): customer hover popover overlap bug + TPOS-live address _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-185926-b1b5d7c` cho Claude walk chain theo CLAUDE.md protocol.
