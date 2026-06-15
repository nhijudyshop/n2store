# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-001109-c5a3a62`
**Session file**: [`./20260616-001109-c5a3a62.md`](../20260616-001109-c5a3a62.md)
**Commit**: `c5a3a62` — docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE_OPTIONS heap cap 1536
**Last updated**: 2026-06-16 00:11:09 +07
**Summary**: docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE_OPTIONS heap cap 1536

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `c5a3a6202` docs(dev-log): web2-api OOM resolved — plan standard 2GB + NODE*OPTIONS heap cap 1536 *(2026-06-16)\_
- `66a63b76f` perf(web2-api): bound sharp native memory + RSS log để chống OOM 512Mi _(2026-06-15)_
- `65ae2db65` chore(session): RESUME:20260615-233756-debda8b _(2026-06-15)_
- `debda8b0a` fix(web2): trỏ đúng project Render web2.0n2store — relay → web2-realtime, xóa pbh-realtime dead _(2026-06-15)_
- `646e9b609` chore(session): RESUME:20260615-232814-2a02bff _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-001109-c5a3a62` cho Claude walk chain theo CLAUDE.md protocol.
