# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260606-193727-abf02a3`
**Session file**: [`./20260606-193727-abf02a3.md`](../20260606-193727-abf02a3.md)
**Commit**: `abf02a3` — fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG
**Last updated**: 2026-06-06 19:37:27 +07
**Summary**: fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `abf02a354` fix(web2-products-print): render barcode = PNG canvas (giống TPOS) thay SVG _(2026-06-06)_
- `da26372d7` fix(delivery-report): chot co dinh nhom NAP/TOMATO - bo ghi de group*name khi upsert + chunk lookup-batch <=1000 *(2026-06-06)\_
- `14885fbbc` chore(session): RESUME:20260606-190242-5cd867b _(2026-06-06)_
- `5cd867bf4` feat(web2): click pill Ví → lịch sử thanh toán KH (mọi nơi có tên/SĐT) _(2026-06-06)_
- `cc8776be7` chore(session): RESUME:20260606-185212-4c06d93 _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260606-193727-abf02a3` cho Claude walk chain theo CLAUDE.md protocol.
