# Latest Snapshot — `soluong-live/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-143128-7bd7dbe`
**Session file**: [`./20260616-143128-7bd7dbe.md`](../20260616-143128-7bd7dbe.md)
**Commit**: `7bd7dbe` — fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login
**Last updated**: 2026-06-16 14:31:28 +07
**Summary**: fix(auth): tab3 dùng tokenManager (company-correct) thay vì tự login

## Files changed in this commit (`soluong-live/`)

- `soluong-live/index.html`
- `soluong-live/soluong-list.html`

## Last 5 commits touching `soluong-live/`

- `85771c3f7` fix(auth): SwitchCompany theo công ty đang chọn — NJD Live = Company 1 (kho live) _(2026-06-16)_
- `fc56194c8` fix(soluong-live): nut 🔄 TPOS chi cap nhat dung hang duoc bam (khong dung ca bang), giu isHidden/soldQty _(2026-06-08)_
- `f280aa99a` feat(soluong-live): nut 🔄 TPOS per-product - ep sync TPOS roi re-import (bien the/gia/ten/ma/anh, giu soldQty) _(2026-06-08)_
- `7fc5c0395` feat(soluong-live): resize ảnh proxy (WebP thumbnail) + đổi ảnh đẩy lên TPOS _(2026-06-04)_
- `5a3f23507` fix(soluong-live): imageVersion cache-bust theo nội dung ảnh (URL proxy hằng số) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-143128-7bd7dbe` cho Claude walk chain theo CLAUDE.md protocol.
