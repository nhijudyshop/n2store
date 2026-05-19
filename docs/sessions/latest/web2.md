# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-103127-8769fce`
**Session file**: [`./20260519-103127-8769fce.md`](../20260519-103127-8769fce.md)
**Commit**: `8769fce` — feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants
**Last updated**: 2026-05-19 10:31:27 +07
**Summary**: feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants

## Files changed in this commit (`web2/`)

- `web2/fastsaleorder-invoice/index.html`
- `web2/shared/web2-variants-cache.js`
- `web2/users/index.html`
- `web2/users/js/users-app.js`
- `web2/variants/index.html`

## Last 5 commits touching `web2/`

- `8769fced` feat(web2): SSE notify cho 3 routes còn lại (variants/users/PBH) + cache SSE for variants _(2026-05-19)_
- `07841fb8` feat(web2-generic + page-builder): SSE realtime tự enable cho 78 generic CRUD pages _(2026-05-19)_
- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `c6f1321f` feat(web2-products+so-order): full 2-way sync delete/edit qty ⇄ pending*qty *(2026-05-18)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-103127-8769fce` cho Claude walk chain theo CLAUDE.md protocol.
