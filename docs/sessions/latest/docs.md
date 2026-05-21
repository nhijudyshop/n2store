# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-151235-bd96bd1`
**Session file**: [`./20260521-151235-bd96bd1.md`](../20260521-151235-bd96bd1.md)
**Commit**: `bd96bd1` — auto: session update
**Last updated**: 2026-05-21 15:12:35 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `4759134e` fix(web2-extension): re-compute jazoest từ fb*dtsg + \_\_comet_req=1 cho Business Suite *(2026-05-21)\_
- `cdd0290d` chore(session): RESUME:20260521-150622-ddd3761 _(2026-05-21)_
- `ddd37616` fix(inventory): SSE handler map snake*case→camelCase (gốc bug 'đợt 2 lệch qua đợt 1') *(2026-05-21)\_
- `92d237f1` chore(session): RESUME:20260521-145223-a9060fc _(2026-05-21)_
- `a9060fc8` docs(dev-log): document FB error 1545012 (BLOCKED*RETRY_SOCKET) fix in web2-extension *(2026-05-21)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-151235-bd96bd1` cho Claude walk chain theo CLAUDE.md protocol.
