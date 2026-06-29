# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-141219-8711499`
**Session file**: [`./20260629-141219-8711499.md`](../20260629-141219-8711499.md)
**Commit**: `8711499` — fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto
**Last updated**: 2026-06-29 14:12:19 +07
**Summary**: fix order-tags: Có ghi chú đơn chỉ tính userNote

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `87114993a` fix(order-tags): TAG "Có ghi chú đơn" chỉ tính userNote, bỏ note=log comment auto _(2026-06-29)_
- `cb34c45a3` chore(session): RESUME:20260629-140045-e707261 _(2026-06-29)_
- `e70726129` feat(print): tem QR sát lề trái + biến thể/giá lên đỉnh → chừa khoảng trống ghi bút _(2026-06-29)_
- `30796fd2e` chore(session): RESUME:20260629-131443-4df262c _(2026-06-29)_
- `4df262c83` refactor(web2): module CHUNG Web2ProductUnits — client duy nhất /api/web2-product-units/\* _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-141219-8711499` cho Claude walk chain theo CLAUDE.md protocol.
