# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260701-002449-359bea1`
**Session file**: [`./20260701-002449-359bea1.md`](../20260701-002449-359bea1.md)
**Commit**: `359bea1` — security: client creds → env/config-endpoint (SIP fallback + SePay account password)
**Last updated**: 2026-07-01 00:24:49 +07
**Summary**: Client creds → env/config-endpoint: SIP fallback gỡ trống + SePay account password gỡ khỏi client (worker dùng env); user phải set worker secret + rotate

## Files changed in this commit (`orders-report/`)

- `orders-report/js/phone-widget.js`

## Last 5 commits touching `orders-report/`

- `359bea187` security: client creds → env/config-endpoint (SIP fallback + SePay account password) _(2026-07-01)_
- `ab5c2c57b` security: sanitize token trong INBOX*PREVIEW doc + dev-log (rotate, không purge history) *(2026-07-01)\_
- `07e0e0e92` security: xoá 5 file dump token hết hạn + allowlist FP gitleaks (storage-key/CORS/Firebase-public) _(2026-06-30)_
- `cb305e95f` fix(bill): bo default account hardcode nvqldonhang/Aa@123456987 — chua gan TPOS thi bao 'khong ra bill' _(2026-06-20)_
- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260701-002449-359bea1` cho Claude walk chain theo CLAUDE.md protocol.
