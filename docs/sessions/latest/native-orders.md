# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-200501-667b583`
**Session file**: [`./20260606-200501-667b583.md`](../20260606-200501-667b583.md)
**Commit**: `667b583` — auto: session update
**Last updated**: 2026-06-06 20:05:01 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-app.js`

## Last 5 commits touching `native-orders/`

- `667b58307` auto: session update _(2026-06-06)_
- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `484f64bd1` feat(web2/native-orders): badge 'KH báo đã CK' cập nhật LIVE qua SSE _(2026-06-06)_
- `0a0637eb1` fix(native-orders): bill In bill tinh PHI SHIP (truoc hardcode 0) - tra gia theo delivery method (DeliveryMethodPicker) -> Phi ship + cong vao TONG TIEN + COD. PBH SHOP=0 _(2026-06-05)_
- `c70542eee` auto: session update _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-200501-667b583` cho Claude walk chain theo CLAUDE.md protocol.
