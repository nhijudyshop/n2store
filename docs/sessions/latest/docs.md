# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260522-143349-0e1cb1f`
**Session file**: [`./20260522-143349-0e1cb1f.md`](../20260522-143349-0e1cb1f.md)
**Commit**: `0e1cb1f` — fix(web2/product-code): bỏ SP default — bắt buộc nhập prefix tay khi không có NCC
**Last updated**: 2026-05-22 14:33:49 +07
**Summary**: fix(web2/product-code): bỏ SP default — bắt buộc nhập prefix tay khi không có NCC

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0e1cb1f45` fix(web2/product-code): bỏ SP default — bắt buộc nhập prefix tay khi không có NCC _(2026-05-22)_
- `579ad12d2` chore(session): RESUME:20260522-141821-47dee19 _(2026-05-22)_
- `47dee198c` docs(dev-log): NCC search lọc cả hoaDon[] trong card _(2026-05-22)_
- `c24f860e8` chore(session): RESUME:20260522-141653-8c818ce _(2026-05-22)_
- `8639f228f` feat(web2/product-code): update rule shop — 6 keyword + MM fallback + HC1 collision + SP default _(2026-05-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260522-143349-0e1cb1f` cho Claude walk chain theo CLAUDE.md protocol.
