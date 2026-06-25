# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-223225-4d45610`
**Session file**: [`./20260625-223225-4d45610.md`](../20260625-223225-4d45610.md)
**Commit**: `4d45610` — feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo
**Last updated**: 2026-06-25 22:32:25 +07
**Summary**: Tem SP 2 tem bố cục price-tag hoàn hảo (giá hero + tên 2 dòng + biến thể gọn), decode 6/6 @88px

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4d4561048` feat(web2/products): tem SP "2 tem" bố cục price-tag hoàn hảo _(2026-06-25)_
- `1754fde7e` chore(session): RESUME:20260625-220850-881c19b _(2026-06-25)_
- `881c19b4a` fix(web2/bill): PBH thermal QR sạch (bỏ mã giữa QR) + mã PBH dưới QR _(2026-06-25)_
- `39fb331e1` chore(session): RESUME:20260625-220424-20a5b02 _(2026-06-25)_
- `20a5b029f` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-223225-4d45610` cho Claude walk chain theo CLAUDE.md protocol.
