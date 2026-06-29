# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-085454-9fd3316`
**Session file**: [`./20260629-085454-9fd3316.md`](../20260629-085454-9fd3316.md)
**Commit**: `9fd3316` — feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control
**Last updated**: 2026-06-29 08:54:54 +07
**Summary**: feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `9fd3316f6` feat(unit-scan): quét tem hiện số liệu live SP (Bán/KH mới/NCC/Còn/Tồn) như live-control _(2026-06-29)_
- `591d06b50` chore(session): RESUME:20260629-084757-c74d11e _(2026-06-29)_
- `c74d11eec` docs(dev-log): widened PATCH hook verified — denorm sync triệt để (customer-only edit) _(2026-06-29)_
- `438e6e58f` chore(session): RESUME:20260629-084511-45b9702 _(2026-06-29)_
- `45b9702a9` fix(native-orders): PATCH fire reconcile khi đổi tên/SĐT KH → denorm sync triệt để _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-085454-9fd3316` cho Claude walk chain theo CLAUDE.md protocol.
