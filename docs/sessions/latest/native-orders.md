# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-143625-f5a7c31`
**Session file**: [`./20260602-143625-f5a7c31.md`](../20260602-143625-f5a7c31.md)
**Commit**: `f5a7c31` — feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT
**Last updated**: 2026-06-02 14:36:25 +07
**Summary**: feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `f5a7c3139` feat(native-orders): bỏ nút Reset STT + group STORE/HOUSE thành 1 campaign cho STT _(2026-06-02)_
- `526848e33` fix(tpos-customer-service): chuyển searchCustomerByFbUserId sang chatomni/info endpoint _(2026-06-01)_
- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `fbfbba67f` feat(native-orders): KH lạ + nút Lấy TPOS — chain lookup FB ID khi đơn từ tpos-pancake rỗng phone/address _(2026-06-01)_
- `c8519cd5c` feat(native-orders): customer side-panel slide-in từ phải (option 4) _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-143625-f5a7c31` cho Claude walk chain theo CLAUDE.md protocol.
