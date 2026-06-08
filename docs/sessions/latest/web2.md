# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260608-123415-395b3e7`
**Session file**: [`./20260608-123415-395b3e7.md`](../20260608-123415-395b3e7.md)
**Commit**: `395b3e7` — fix(live-chat): bo lap comment (dedupe theo id o loadComments + merge)
**Last updated**: 2026-06-08 12:34:15 +07
**Summary**: fix(live-chat): bo lap comment (dedupe theo id o loadComments + merge)

## Files changed in this commit (`web2/`)

- `web2/overview/index.html`
- `web2/shared/web2-chat-client.js`
- `web2/shared/web2-pancake-accounts.js`

## Last 5 commits touching `web2/`

- `46b933e8c` refactor(web2): tách localStorage Pancake sang web2* namespace (độc lập Web1) *(2026-06-08)\_
- `e512f88df` refactor(web2): quét sạch chữ 'tpos' trong Web 2.0 (identifiers/UI/comments) _(2026-06-08)_
- `82a132258` fix(web2): QR ví KH lấy customer*id từ kho warehouse (bỏ TPOS fallback) *(2026-06-08)\_
- `96291b813` fix(web2-customers): SĐT bị mất do wallet-balance pill ghi đè span _(2026-06-08)_
- `183e77110` refactor(web2): xóa hẳn live-campaign (page + route + sidebar + worker) _(2026-06-08)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260608-123415-395b3e7` cho Claude walk chain theo CLAUDE.md protocol.
