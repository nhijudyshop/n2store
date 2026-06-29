# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-082833-da9564b`
**Session file**: [`./20260629-082833-da9564b.md`](../20260629-082833-da9564b.md)
**Commit**: `da9564b` — auto: session update
**Last updated**: 2026-06-29 08:28:33 +07
**Summary**: auto: session update

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `da9564b40` auto: session update _(2026-06-29)_
- `c466cb7d2` fix(so-order): 8 audit findings (#1 admin gate img + #3,#4,#5,#6,#7,#8) + soft-warn #2 _(2026-06-29)_
- `88ae3878e` fix(so-order): import "Đã nhận" → draft (tránh row kẹt) + dev-log Task 4 verified _(2026-06-28)_
- `7e6950dfe` fix(so-order): audit fixes — per-unit QR on main receive path + orphan dropdown on modal close _(2026-06-28)_
- `a56562d38` fix(so-order): server-authoritative sync — wipe DB sticks (kill local-first footgun) _(2026-06-28)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-082833-da9564b` cho Claude walk chain theo CLAUDE.md protocol.
