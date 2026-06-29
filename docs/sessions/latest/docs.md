# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-091958-b5afc14`
**Session file**: [`./20260629-091958-b5afc14.md`](../20260629-091958-b5afc14.md)
**Commit**: `b5afc14` — fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan
**Last updated**: 2026-06-29 09:19:58 +07
**Summary**: FIX GỐC widget AI: lỗi provider chứa chữ token bị nhầm phiên hết hạn → đăng xuất oan; verified browser click thật AI trả lời OK

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_
- `6147ebc07` chore(session): RESUME:20260629-091641-b95677b _(2026-06-29)_
- `daa0a432b` chore(session): RESUME:20260629-085755-a45a54a _(2026-06-29)_
- `a45a54a14` docs(dev-log): scan metrics verified live (Bán=8, KH mới=5) _(2026-06-29)_
- `5e79a2003` chore(session): RESUME:20260629-085454-9fd3316 _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-091958-b5afc14` cho Claude walk chain theo CLAUDE.md protocol.
