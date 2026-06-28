# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-192722-d636b1e`
**Session file**: [`./20260628-192722-d636b1e.md`](../20260628-192722-d636b1e.md)
**Commit**: `d636b1e` — feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT
**Last updated**: 2026-06-28 19:27:22 +07
**Summary**: feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/PER-UNIT-QR-PLAN.md`

## Last 5 commits touching `docs/`

- `d636b1ea7` feat(web2-product-units): mã đơn vị + QR riêng/món + trang quét định tuyến kệ STT _(2026-06-28)_
- `8e3bf6137` chore(session): RESUME:20260628-183942-ef65bab _(2026-06-28)_
- `969a11077` chore(session): RESUME:20260628-183449-d2a4f90 _(2026-06-28)_
- `d2a4f9072` feat(so-order): Quản lý ảnh NCC theo đợt (BYTEA web2Db) + create-order integration + admin-only _(2026-06-28)_
- `2bb360087` chore(session): RESUME:20260628-182617-6dfedec _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-192722-d636b1e` cho Claude walk chain theo CLAUDE.md protocol.
