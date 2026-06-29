# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-070305-a607846`
**Session file**: [`./20260629-070305-a607846.md`](../20260629-070305-a607846.md)
**Commit**: `a607846` — feat(native-orders): nhả đơn vị (per-unit) khi HUỶ đơn (POST /:code/cancel)
**Last updated**: 2026-06-29 07:03:05 +07
**Summary**: feat(native-orders): nhả đơn vị (per-unit) khi HUỶ đơn (POST /:code/cancel)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `a6078465c` feat(native-orders): nhả đơn vị (per-unit) khi HUỶ đơn (POST /:code/cancel) _(2026-06-29)_
- `888b35c57` chore(session): RESUME:20260628-233732-88ae387 _(2026-06-28)_
- `88ae3878e` fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified _(2026-06-28)_
- `9319f031e` feat(web2-product-units): auto-gán đơn vị theo giỏ (reconcileOrderUnits) — thay nút Gán _(2026-06-28)_
- `85d908fe1` feat(web2-products,unit-scan): per-unit In tem + bỏ nút Gán thủ công (gán auto theo giỏ) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-070305-a607846` cho Claude walk chain theo CLAUDE.md protocol.
