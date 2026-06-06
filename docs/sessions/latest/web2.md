# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-190242-5cd867b`
**Session file**: [`./20260606-190242-5cd867b.md`](../20260606-190242-5cd867b.md)
**Commit**: `5cd867b` — feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT)
**Last updated**: 2026-06-06 19:02:42 +07
**Summary**: feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT)

## Files changed in this commit (`web2/`)

- `web2/balance-history/index.html`
- `web2/ck-dashboard/index.html`
- `web2/partner-customer/index.html`
- `web2/payment-confirm/index.html`
- `web2/shared/web2-customer-detail-modal.js`
- `web2/shared/web2-wallet-balance.js`

## Last 5 commits touching `web2/`

- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `207dbc12c` fix(web2-products-print): barcode crisp dot-aligned (quét được mã dài) + giữ khổ 2 Tem 25mm mặc định _(2026-06-06)_
- `723c7d924` feat(web2-products-print): đặt khổ tem rộng 50×30mm làm mặc định _(2026-06-06)_
- `a0418691e` feat(web2-products-print): cảnh báo mã quá dài cho khổ tem + thêm tem rộng 50mm _(2026-06-06)_
- `214bc43ee` feat(web2-reconcile): ẩn lịch sử mặc định (toggle) + ưu tiên list SP + scan lỗi liệt kê mã _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-190242-5cd867b` cho Claude walk chain theo CLAUDE.md protocol.
