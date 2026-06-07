# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-154453-e45084d`
**Session file**: [`./20260607-154453-e45084d.md`](../20260607-154453-e45084d.md)
**Commit**: `e45084d` — feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR
**Last updated**: 2026-06-07 15:44:53 +07
**Summary**: feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `e45084d15` feat(web2-products-print): bỏ Code128, tem SP chỉ còn QR _(2026-06-07)_
- `1d998cfcf` fix(so-order,purchase-refund): mã SP draft đúng format KHO + ẩn dropdown rỗng + tách đơn trả hàng theo đợt _(2026-06-07)_
- `fe66d43ca` feat(so-order): nút 'In tem' trong panel nhận hàng — in/in lại QR cả khi đã nhận đủ _(2026-06-07)_
- `34d580a1c` fix(so-order): nhận hàng in tem QR 2-tem theo SL nhận (bump print script version) _(2026-06-07)_
- `88a063b46` refactor(web2): gộp payment-confirm vào ck-dashboard (1 trang CK + tab Tin nhắn chưa đọc) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-154453-e45084d` cho Claude walk chain theo CLAUDE.md protocol.
