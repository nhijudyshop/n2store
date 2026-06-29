# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-131443-4df262c`
**Session file**: [`./20260629-131443-4df262c.md`](../20260629-131443-4df262c.md)
**Commit**: `4df262c` — refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/_
**Last updated**: 2026-06-29 13:14:43 +07
**Summary**: Audit mã SP web2 → tạo module chung Web2ProductUnits (client duy nhất /api/web2-product-units/_), adopt 4 file, verified browser

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/KB-PRODUCT-CODE-UNITS.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/WEB2-PAGE-MODULES.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_
- `84bd24591` chore(session): RESUME:20260629-130146-04b6612 _(2026-06-29)_
- `04b66121c` fix(native-orders): expand hiện mã đơn vị "-xxx" (o.id string → ép Number) _(2026-06-29)_
- `489d3ff35` chore(session): RESUME:20260629-125215-1f56a64 _(2026-06-29)_
- `1f56a64ae` docs(web2): KB cách vận hành mã SP & per-unit QR (mint→so-order→Kho SP→unit-scan) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-131443-4df262c` cho Claude walk chain theo CLAUDE.md protocol.
