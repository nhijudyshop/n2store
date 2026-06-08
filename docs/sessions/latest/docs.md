# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-184009-fc56194`
**Session file**: [`./20260608-184009-fc56194.md`](../20260608-184009-fc56194.md)
**Commit**: `fc56194` — fix(soluong-live): nut 🔄 TPOS chi cap nhat dung hang duoc bam (khong dung ca bang), giu isHidden/soldQty
**Last updated**: 2026-06-08 18:40:09 +07
**Summary**: fix(soluong-live): nut 🔄 TPOS chi cap nhat dung hang duoc bam (khong dung ca bang), giu isHidden/soldQty

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `fc56194c8` fix(soluong-live): nut 🔄 TPOS chi cap nhat dung hang duoc bam (khong dung ca bang), giu isHidden/soldQty _(2026-06-08)_
- `0736da6d3` chore(session): RESUME:20260608-145435-654a1fc _(2026-06-08)_
- `654a1fcc9` docs(dev-log): chien dich cha live-chat + menu Cau hinh + click-to-add fast order _(2026-06-08)_
- `8a76e0f89` chore(session): RESUME:20260608-144824-35d01e7 _(2026-06-08)_
- `f280aa99a` feat(soluong-live): nut 🔄 TPOS per-product - ep sync TPOS roi re-import (bien the/gia/ten/ma/anh, giu soldQty) _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-184009-fc56194` cho Claude walk chain theo CLAUDE.md protocol.
