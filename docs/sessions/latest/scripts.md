# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260604-134618-1394393`
**Session file**: [`./20260604-134618-1394393.md`](../20260604-134618-1394393.md)
**Commit**: `1394393` — fix(web2-reconcile): hien anh SP theo kho hien tai (web2_products) thay snapshot
**Last updated**: 2026-06-04 13:46:18 +07
**Summary**: fix(web2-reconcile): hien anh SP theo kho hien tai (web2_products) thay snapshot

## Files changed in this commit (`scripts/`)

- `scripts/web2-localize-product-images.js`

## Last 5 commits touching `scripts/`

- `dce18bb44` feat(web2): localize anh SP (data URL webp) + hover zoom reconcile _(2026-06-04)_
- `484af0fa2` feat(web2): supplier-debt khop So Order (debt = cost tung NCC) _(2026-06-04)_
- `d931f916a` feat(web2): seed supplier-debt theo kho (5 NCC) + dev-log _(2026-06-04)_
- `03ffe8414` feat(web2): ảnh SP = ảnh quần áo thật theo loại (loremflickr) _(2026-06-04)_
- `de0fba30b` feat(web2): thêm ảnh SP placeholder color-coded cho data ảo _(2026-06-04)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260604-134618-1394393` cho Claude walk chain theo CLAUDE.md protocol.
