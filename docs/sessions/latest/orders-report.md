# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-000545-0b723cb`
**Session file**: [`./20260701-000545-0b723cb.md`](../20260701-000545-0b723cb.md)
**Commit**: `0b723cb` — ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước
**Last updated**: 2026-07-01 00:05:45 +07
**Summary**: ci(security): gitleaks allowlist FP (storage-key/CORS/Firebase-public/.tmp/backups) — sót commit trước

## Files changed in this commit (`orders-report/`)

- `orders-report/docs1/FastSaleOrder_SaleOnlineRes_DecreaseAmount.txt`
- `orders-report/docs1/FastSaleOrder_SaleOnlineRes_true.txt`
- `orders-report/docs1/INBOX_PREVIEW_VARIABLES.md`
- `orders-report/docs1/InsertListOrderModel.txt`

## Last 5 commits touching `orders-report/`

- `ab5c2c57b` security: sanitize token trong INBOX*PREVIEW doc + dev-log (rotate, không purge history) *(2026-07-01)\_
- `07e0e0e92` security: xoá 5 file dump token hết hạn + allowlist FP gitleaks (storage-key/CORS/Firebase-public) _(2026-06-30)_
- `cb305e95f` fix(bill): bo default account hardcode nvqldonhang/Aa@123456987 — chua gan TPOS thi bao 'khong ra bill' _(2026-06-20)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `1940a8e00` auto: session update _(2026-06-19)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-000545-0b723cb` cho Claude walk chain theo CLAUDE.md protocol.
