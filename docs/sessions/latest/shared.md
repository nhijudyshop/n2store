# Latest Snapshot — `shared/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260620-120728-2704ef6`
**Session file**: [`./20260620-120728-2704ef6.md`](../20260620-120728-2704ef6.md)
**Commit**: `2704ef6` — fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password
**Last updated**: 2026-06-20 12:07:28 +07
**Summary**: fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password

## Files changed in this commit (`shared/`)

- `shared/browser/token-manager.js`
- `shared/js/navigation-modern.js`
- `shared/js/token-manager.js`
- `shared/universal/tpos-client.js`

## Last 5 commits touching `shared/`

- `2704ef6f0` fix(tpos): bo hardcode creds client -> proxy-auth {companyId} sau khi doi password _(2026-06-20)_
- `6e03f1f43` auto: session update _(2026-06-20)_
- `306e6ce6c` feat(customer-hub): double-click cột Ví khách hàng → xếp khách có công nợ lên đầu _(2026-06-16)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `b64200cc9` chore(realtime): HARD-DELETE n2store-realtime — xóa service Render + folder + refs (api-endpoints/service-costs/nginx). −$7/mo _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260620-120728-2704ef6` cho Claude walk chain theo CLAUDE.md protocol.
