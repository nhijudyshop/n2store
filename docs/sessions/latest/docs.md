# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-140901-2ce637c`
**Session file**: [`./20260616-140901-2ce637c.md`](../20260616-140901-2ce637c.md)
**Commit**: `2ce637c` — feat(web2): NCC 1 nguồn duy nhất — products/purchase-refund/supplier-debt dùng Web2SuppliersCache (supplier-wallet)
**Last updated**: 2026-06-16 14:09:01 +07
**Summary**: feat(web2): NCC 1 nguồn duy nhất — products/purchase-refund/supplier-debt dùng Web2SuppliersCache (supplier-wa...

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2ce637c02` feat(web2): NCC 1 nguồn duy nhất — products/purchase-refund/supplier-debt dùng Web2SuppliersCache (supplier-wallet) _(2026-06-16)_
- `543169126` chore(session): RESUME:20260616-140208-2211c06 _(2026-06-16)_
- `d8e8e155b` chore(session): RESUME:20260616-135915-6df9500 _(2026-06-16)_
- `d5e4b2895` chore(session): RESUME:20260616-134827-bc13317 _(2026-06-16)_
- `7296b99aa` fix(orders-report,don-inbox): product search rỗng — tự refresh token TPOS stale _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-140901-2ce637c` cho Claude walk chain theo CLAUDE.md protocol.
