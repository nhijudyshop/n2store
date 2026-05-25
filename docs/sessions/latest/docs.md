# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260525-113232-0d625da`
**Session file**: [`./20260525-113232-0d625da.md`](../20260525-113232-0d625da.md)
**Commit**: `0d625da` — auto: session update
**Last updated**: 2026-05-25 11:32:32 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `43f26751a` feat(web2): enrich customer-wallet + balance-history với TPOS Partner data _(2026-05-25)_
- `3efaa034a` chore(session): RESUME:20260525-111846-49631b0 _(2026-05-25)_
- `49631b051` feat(product-warehouse): edit modal 6 tab TPOS + fix expand + fix ảnh template _(2026-05-25)_
- `944bb66b8` chore(session): RESUME:20260525-111538-fea793f _(2026-05-25)_
- `b915d1cb8` fix(web2/products): bỏ TPOS barcode endpoint — JsBarcode CDN, zero tpos.vn _(2026-05-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260525-113232-0d625da` cho Claude walk chain theo CLAUDE.md protocol.
