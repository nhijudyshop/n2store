# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-104252-a66d6b5`
**Session file**: [`./20260605-104252-a66d6b5.md`](../20260605-104252-a66d6b5.md)
**Commit**: `a66d6b5` — docs(dev-log): bill SP ten hang 1, so hang 2
**Last updated**: 2026-06-05 10:42:52 +07
**Summary**: docs(dev-log): bill SP ten hang 1, so hang 2

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/printer-settings/index.html`
- `web2/shared/web2-bill-service.js`

## Last 5 commits touching `web2/`

- `17f8f4cf0` feat(web2 bill): SP hang 1 = ten day du, hang 2 = SL/DON GIA/T.TIEN canh cot duoi header _(2026-06-05)_
- `e4da68737` feat(web2-pending): hien luon list KH tu hoi thoai FB inline trong card (lazy) _(2026-06-05)_
- `07bb48d5d` auto: session update _(2026-06-05)_
- `b0d10735f` auto: session update _(2026-06-05)_
- `0d09c837e` feat(web2): chon KH tu list hoi thoai FB (nut Gan KH nay) -> resolve pending _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-104252-a66d6b5` cho Claude walk chain theo CLAUDE.md protocol.
