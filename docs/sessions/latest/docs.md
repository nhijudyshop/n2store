# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `7bd7dbe02` fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login _(2026-06-16)_
- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `ab5a312cf` chore(session): RESUME:20260616-140901-2ce637c _(2026-06-16)_
- `2ce637c02` feat(web2): NCC 1 nguồn duy nhất — products/purchase-refund/supplier-debt dùng Web2SuppliersCache (supplier-wallet) _(2026-06-16)_
- `543169126` chore(session): RESUME:20260616-140208-2211c06 _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
