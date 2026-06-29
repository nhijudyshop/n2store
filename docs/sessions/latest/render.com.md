# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-083824-5ebfd63`
**Session file**: [`./20260629-083824-5ebfd63.md`](../20260629-083824-5ebfd63.md)
**Commit**: `5ebfd63` — docs(dev-log): denorm-sync verified live (audit per-unit 1 vòng done)
**Last updated**: 2026-06-29 08:38:24 +07
**Summary**: Audit per-unit 1 vòng: core vững, fix denorm-sync reconcile — verified live

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-product-units.js`
- `render.com/routes/web2-users.js`

## Last 5 commits touching `render.com/`

- `816b11d9a` feat(web2/auth): TTL phiên theo role — admin 90 ngày, user 14 ngày _(2026-06-29)_
- `80e80c426` auto: session update _(2026-06-29)_
- `de304b6c2` fix(web2-product-units): reconcile sync denorm (STT/customer) cho unit đã gán _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_
- `c466cb7d2` fix(so-order): 8 audit findings (#1 admin gate img + #3,#4,#5,#6,#7,#8) + soft-warn #2 _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-083824-5ebfd63` cho Claude walk chain theo CLAUDE.md protocol.
