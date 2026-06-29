# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-071815-27fb461`
**Session file**: [`./20260629-071815-27fb461.md`](../20260629-071815-27fb461.md)
**Commit**: `27fb461` — docs(dev-log): 8 so-order audit fixes verified (#1a admin gate live, #5 scroll-lock, soft-warn)
**Last updated**: 2026-06-29 07:18:15 +07
**Summary**: Fix 8 so-order audit findings (#1 admin gate img, #3,#4,#5,#6,#7,#8) + soft-warn #2 — workflow-investigated, verified

## Files changed in this commit (`so-order/`)

- `so-order/index.html`
- `so-order/js/so-order-confirm.js`
- `so-order/js/so-order-delete.js`
- `so-order/js/so-order-inline-edit.js`
- `so-order/js/so-order-modal-submit.js`
- `so-order/js/so-order-render.js`
- `so-order/js/so-order-storage.js`
- `so-order/js/so-order-toolbar.js`

## Last 5 commits touching `so-order/`

- `c466cb7d2` fix(so-order): 8 audit findings (#1 admin gate img + #3,#4,#5,#6,#7,#8) + soft-warn #2 _(2026-06-29)_
- `88ae3878e` fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified _(2026-06-28)_
- `7e6950dfe` fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close _(2026-06-28)_
- `a56562d38` fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun) _(2026-06-28)_
- `8f37cffac` feat(so-order): Dien ngau nhien bom nhieu data hon - LOAI bien the (Ao/Quan/Dam/Vay/Giay/Dep) tu ProductTypesCache + 12 NCC + 2-6 dong; reset-flow wipe target _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-071815-27fb461` cho Claude walk chain theo CLAUDE.md protocol.
