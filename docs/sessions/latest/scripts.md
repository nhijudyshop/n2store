# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-155846-6de7c3c`
**Session file**: [`./20260604-155846-6de7c3c.md`](../20260604-155846-6de7c3c.md)
**Commit**: `6de7c3c` — auto: session update
**Last updated**: 2026-06-04 15:58:46 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/web2-seed-inventory-shipments.js`
- `scripts/web2-seed-supplier-debt-from-soorder.js`

## Last 5 commits touching `scripts/`

- `d1982a67b` refactor(web2 supplier-debt): cat sach coupling TPOS/inventory*shipments (Web 1.0) *(2026-06-04)\_
- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_
- `484af0fa2` feat(web2): supplier-debt khop So Order (debt = cost tung NCC) _(2026-06-04)_
- `d931f916a` feat(web2): seed supplier-debt theo kho (5 NCC) + dev-log _(2026-06-04)_
- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-155846-6de7c3c` cho Claude walk chain theo CLAUDE.md protocol.
