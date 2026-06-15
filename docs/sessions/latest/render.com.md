# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260615-123047-16b130a`
**Session file**: [`./20260615-123047-16b130a.md`](../20260615-123047-16b130a.md)
**Commit**: `16b130a` — fix(web2-jt): src_message ưu tiên dòng đơn (COALESCE EXCLUDED trước) — ghi đè text reply cũ
**Last updated**: 2026-06-15 12:30:47 +07
**Summary**: fix(web2-jt): src_message ưu tiên dòng đơn (COALESCE EXCLUDED trước) — ghi đè text reply cũ

## Files changed in this commit (`render.com/`)

- `render.com/routes/web2-jt-tracking.js`

## Last 5 commits touching `render.com/`

- `16b130a61` fix(web2-jt): src*message ưu tiên dòng đơn (COALESCE EXCLUDED trước) — ghi đè text reply cũ *(2026-06-15)\_
- `cc70bf686` auto: session update _(2026-06-15)_
- `8ed03a3c4` auto: session update _(2026-06-15)_
- `2deb63a01` feat(web2-jt): hiện TOÀN BỘ tin nhắn nhóm chứa mã (tên/SĐT/ghi chú KH) trên row + modal _(2026-06-15)_
- `b8c166071` feat(live-chat): WS-direct comment livestream (bỏ poll, nhanh ~TPOS) + render append-only đúng invariant _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260615-123047-16b130a` cho Claude walk chain theo CLAUDE.md protocol.
