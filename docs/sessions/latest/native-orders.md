# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-232814-2a02bff`
**Session file**: [`./20260615-232814-2a02bff.md`](../20260615-232814-2a02bff.md)
**Commit**: `2a02bff` — refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401
**Last updated**: 2026-06-15 23:28:14 +07
**Summary**: refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-api.js`
- `native-orders/js/native-orders-app.js`
- `native-orders/js/native-orders-kpi.js`

## Last 5 commits touching `native-orders/`

- `2a02bff32` refactor(web2): hợp nhất base-URL về 1 nguồn (web2-auth.js) + fix livestream 404 worker + ck-dashboard 401 _(2026-06-15)_
- `e2d9d87b2` chore(web2): TPOS triệt để — doc sửa (web2*customers KHÔNG có cột tpos), DROP safety-net, rename var *(2026-06-15)\_
- `f6276d58b` fix(web2): gắn x-web2-token cho TOÀN BỘ web2 write còn thiếu (audit) + bump ?v=20260615auth _(2026-06-15)_
- `fa050c1fa` auto: session update _(2026-06-15)_
- `283422bf5` feat(web2): trạng thái/thông tin KH = 1 nguồn chung web2*customers + SSE đồng bộ *(2026-06-15)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-232814-2a02bff` cho Claude walk chain theo CLAUDE.md protocol.
