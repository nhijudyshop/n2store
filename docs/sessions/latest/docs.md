# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-123111-f3883fa`
**Session file**: [`./20260616-123111-f3883fa.md`](../20260616-123111-f3883fa.md)
**Commit**: `f3883fa` — auto: session update
**Last updated**: 2026-06-16 12:31:11 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `0df1cd9bf` fix(web2/live-chat): reconcileFullText truyền customer*id (UUID) → vá comment dài cắt '...' *(2026-06-16)\_
- `eabd0af09` fix(web2/live-chat): comments-mobile hiện SĐT cùng lúc với địa chỉ (fallback kho như desktop) _(2026-06-16)_
- `1271fafb6` chore(session): RESUME:20260616-111550-4b253d0 _(2026-06-16)_
- `4b253d0b6` docs(realtime): n2store-realtime HARD-DELETE hoàn tất (service 404 + folder + refs). −$7/mo, data chatDb giữ nguyên. _(2026-06-16)_
- `b64200cc9` chore(realtime): HARD-DELETE n2store-realtime — xóa service Render + folder + refs (api-endpoints/service-costs/nginx). −$7/mo _(2026-06-16)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-123111-f3883fa` cho Claude walk chain theo CLAUDE.md protocol.
