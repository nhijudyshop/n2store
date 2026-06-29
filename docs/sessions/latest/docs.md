# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-084757-c74d11e`
**Session file**: [`./20260629-084757-c74d11e.md`](../20260629-084757-c74d11e.md)
**Commit**: `c74d11e` — docs(dev-log): widened PATCH hook verified — denorm sync triệt để (customer-only edit)
**Last updated**: 2026-06-29 08:47:57 +07
**Summary**: Denorm sync triệt để: PATCH fire reconcile khi đổi customer — verified live

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `c74d11eec` docs(dev-log): widened PATCH hook verified — denorm sync triệt để (customer-only edit) _(2026-06-29)_
- `438e6e58f` chore(session): RESUME:20260629-084511-45b9702 _(2026-06-29)_
- `45b9702a9` fix(native-orders): PATCH fire reconcile khi đổi tên/SĐT KH → denorm sync triệt để _(2026-06-29)_
- `afbf84a5f` chore(session): RESUME:20260629-083824-5ebfd63 _(2026-06-29)_
- `5ebfd6374` docs(dev-log): denorm-sync verified live (audit per-unit 1 vòng done) _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-084757-c74d11e` cho Claude walk chain theo CLAUDE.md protocol.
