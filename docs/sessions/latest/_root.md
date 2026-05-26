# Latest Snapshot — `_root/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260526-135946-9279c06`
**Session file**: [`./20260526-135946-9279c06.md`](../20260526-135946-9279c06.md)
**Commit**: `9279c06` — auto: session update
**Last updated**: 2026-05-26 13:59:46 +07
**Summary**: auto: session update

## Files changed in this commit (`_root/`)

- `CLAUDE.md`

## Last 5 commits touching `_root/`

- `688ba9c9b` docs(sse): document Web 2.0 SSE log structure + read-write realtime flow _(2026-05-26)_
- `1893833be` auto: session update _(2026-05-26)_
- `b7cb7648b` auto: session update _(2026-05-26)_
- `cd4bcf408` auto: session update _(2026-05-25)_
- `218e85db6` refactor(purchase-orders): rollback Bunny → Postgres bytea cho upload mới + policy "Bunny chỉ AI KOL" _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260526-135946-9279c06` cho Claude walk chain theo CLAUDE.md protocol.
