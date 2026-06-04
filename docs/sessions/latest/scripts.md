# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-105635-93886e4`
**Session file**: [`./20260604-105635-93886e4.md`](../20260604-105635-93886e4.md)
**Commit**: `93886e4` — auto: session update
**Last updated**: 2026-06-04 10:56:35 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/web2-add-product-images.js`

## Last 5 commits touching `scripts/`

- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_
- `de0fba30b` feat(web2): thêm ảnh SP placeholder color-coded cho data ảo _(2026-06-04)_
- `3af903913` feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2*so_order) *(2026-06-04)\_
- `f27b57581` chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify _(2026-06-04)_
- `cd029da6d` fix(web2): generic /api/web2 route shadow dedicated → data 3 trang load lại _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-105635-93886e4` cho Claude walk chain theo CLAUDE.md protocol.
