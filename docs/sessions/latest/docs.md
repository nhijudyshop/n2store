# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-224330-578de96`
**Session file**: [`./20260625-224330-578de96.md`](../20260625-224330-578de96.md)
**Commit**: `578de96` — fix(web2/products): tem SP biến thể hiện đủ (bỏ ellipsis cắt size)
**Last updated**: 2026-06-25 22:43:30 +07
**Summary**: Tem SP price-tag: fix biến thể bị ellipsis cắt size; verify trang Sản phẩm THẬT (real data + auth)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `578de963e` fix(web2/products): tem SP biến thể hiện đủ (bỏ ellipsis cắt size) _(2026-06-25)_
- `18616d6b4` chore(session): RESUME:20260625-223225-4d45610 _(2026-06-25)_
- `4d4561048` feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo _(2026-06-25)_
- `1754fde7e` chore(session): RESUME:20260625-220850-881c19b _(2026-06-25)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-224330-578de96` cho Claude walk chain theo CLAUDE.md protocol.
