# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260625-194528-308ce60`
**Session file**: [`./20260625-194528-308ce60.md`](../20260625-194528-308ce60.md)
**Commit**: `308ce60` — fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware
**Last updated**: 2026-06-25 19:45:28 +07
**Summary**: Audit unique-theo-mã 8 surface (7/8 sạch) + fix triệt để: default by:code, modal+supplier-wallet variant-aware

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `308ce60ba` fix(web2): unique theo mã triệt để — default by:'code' + modal/supplier-wallet variant-aware _(2026-06-25)_
- `2fb834c3f` chore(session): RESUME:20260625-193028-05649cd _(2026-06-25)_
- `05649cde5` fix(web2/live-control,live-tv): SP unique theo MÃ — bỏ gom theo tên _(2026-06-25)_
- `713a7da51` chore(session): RESUME:20260625-192358-3d11612 _(2026-06-25)_
- `927c3e8a3` fix(web2/zalo): focus-lease phiên Zalo — hết spam 'Đổi thiết bị' trên chat.zalo.me _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260625-194528-308ce60` cho Claude walk chain theo CLAUDE.md protocol.
