# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-101633-07841fb`
**Session file**: [`./20260519-101633-07841fb.md`](../20260519-101633-07841fb.md)
**Commit**: `07841fb` — feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages
**Last updated**: 2026-05-19 10:16:33 +07
**Summary**: feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages

## Files changed in this commit (`web2/`)

- `web2/shared/page-builder.js`
- `web2/shared/page-shell.js`

## Last 5 commits touching `web2/`

- `07841fb8` feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages _(2026-05-19)_
- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_
- `40df3b7b` fix(web2-products+so-order): show CHỜ HÀNG status + VND price ×1000 shorthand _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-101633-07841fb` cho Claude walk chain theo CLAUDE.md protocol.
