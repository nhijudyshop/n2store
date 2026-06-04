# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-114156-d931f91`
**Session file**: [`./20260604-114156-d931f91.md`](../20260604-114156-d931f91.md)
**Commit**: `d931f91` — feat(web2): seed supplier-debt theo kho (5 NCC) + dev-log
**Last updated**: 2026-06-04 11:41:56 +07
**Summary**: feat(web2): seed supplier-debt theo kho (5 NCC) + dev-log

## Files changed in this commit (`scripts/`)

- `scripts/web2-seed-inventory-shipments.js`

## Last 5 commits touching `scripts/`

- `d931f916a` feat(web2): seed supplier-debt theo kho (5 NCC) + dev-log _(2026-06-04)_
- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_
- `de0fba30b` feat(web2): thêm ảnh SP placeholder color-coded cho data ảo _(2026-06-04)_
- `3af903913` feat(so-order): seed Sổ Order ảo theo kho SP (Firestore web2*so_order) *(2026-06-04)\_
- `f27b57581` chore(web2): scripts wipe+reseed data ảo (mã SP đúng Web2ProductCode) + verify _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-114156-d931f91` cho Claude walk chain theo CLAUDE.md protocol.
