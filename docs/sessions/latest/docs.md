# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-230809-daf1441`
**Session file**: [`./20260625-230809-daf1441.md`](../20260625-230809-daf1441.md)
**Commit**: `daf1441` — fix(web2/products): mã SP full-width không cắt — chạy dài qua phải
**Last updated**: 2026-06-25 23:08:09 +07
**Summary**: Mã SP tem full-width không cắt, chạy dài qua phải (p7); verify trang thật

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `daf144191` fix(web2/products): mã SP full-width không cắt — chạy dài qua phải _(2026-06-25)_
- `8ff13a426` chore(session): RESUME:20260625-225744-6ac77b2 _(2026-06-25)_
- `6ac77b217` feat(web2/products): tem SP đổi chỗ tên↔giá (tên băng full-width, giá+biến thể cạnh QR) _(2026-06-25)_
- `9aa29194f` chore(session): RESUME:20260625-224330-578de96 _(2026-06-25)_
- `578de963e` fix(web2/products): tem SP biến thể hiện đủ (bỏ ellipsis cắt size) _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-230809-daf1441` cho Claude walk chain theo CLAUDE.md protocol.
