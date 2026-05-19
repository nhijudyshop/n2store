# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260519-100742-95dc85b`
**Session file**: [`./20260519-100742-95dc85b.md`](../20260519-100742-95dc85b.md)
**Commit**: `95dc85b` — chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'
**Last updated**: 2026-05-19 10:07:42 +07
**Summary**: chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0'

## Files changed in this commit (`so-order/`)

- `so-order/index.html`

## Last 5 commits touching `so-order/`

- `95dc85bf` chore(web2): đồng nhất title 15 trang chính thành '<base> - WEB 2.0' _(2026-05-19)_
- `3c5d5c10` feat(web2-products): SSE pub/sub thay Firestore tickle — server broadcast khi DB write _(2026-05-19)_
- `228e8cf2` feat(so-order): nút edit ảnh overlay (pencil) — sửa được ảnh kể cả khi đã có ảnh _(2026-05-18)_
- `20edfcd1` refactor(so-order): sync sang local-first — bỏ onSnapshot, debounce push, pull-on-focus _(2026-05-18)_
- `f5cb1cb3` fix(so-order): bỏ giật khi sync — skip Firestore snapshot có hasPendingWrites _(2026-05-18)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260519-100742-95dc85b` cho Claude walk chain theo CLAUDE.md protocol.
