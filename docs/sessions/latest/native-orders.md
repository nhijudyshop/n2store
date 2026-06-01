# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-191704-526848e`
**Session file**: [`./20260601-191704-526848e.md`](../20260601-191704-526848e.md)
**Commit**: `526848e` — fix(tpos-customer-service): chuyển searchCustomerByFbUserId sang chatomni/info endpoint
**Last updated**: 2026-06-01 19:17:04 +07
**Summary**: fix(tpos-customer-service): chuyển searchCustomerByFbUserId sang chatomni/info endpoint

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `526848e33` fix(tpos-customer-service): chuyển searchCustomerByFbUserId sang chatomni/info endpoint _(2026-06-01)_
- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `fbfbba67f` feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address _(2026-06-01)_
- `c8519cd5c` feat(native-orders): customer side-panel slide-in từ phải (option 4) _(2026-06-01)_
- `5964e7cbb` refactor(native-orders): xóa sạch customer hover popover (per user "xóa đi làm lại") _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-191704-526848e` cho Claude walk chain theo CLAUDE.md protocol.
