# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260622-023100-e70c44c`
**Session file**: [`./20260622-023100-e70c44c.md`](../20260622-023100-e70c44c.md)
**Commit**: `e70c44c` — docs(web2) SSE R4 verified live (clientsNotified 0->1, no over-match, reviewer APPROVE) + by-design dbl-subscribe note
**Last updated**: 2026-06-22 02:31:00 +07
**Summary**: docs(web2) SSE R4 verified live (clientsNotified 0->1, no over-match, reviewer APPROVE) + by-design dbl-subscribe note

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `e70c44ca2` docs(web2) SSE R4 verified live (clientsNotified 0->1, no over-match, reviewer APPROVE) + by-design dbl-subscribe note _(2026-06-22)_
- `6a65aa6da` chore(session): RESUME:20260622-022249-8d6abe3 _(2026-06-22)_
- `8d6abe393` fix(web2) SSE R4 (live-test): server-side wildcard delivery in _localNotify — exact web2:wallet:<phone> now reaches web2:wallet:\* (6 ví pages) _(2026-06-22)\_
- `c5206249c` chore(session): RESUME:20260622-020527-b07144f _(2026-06-22)_
- `b07144f98` fix(web2) SSE R2: live-snap resync no-op (MED) + resync coalesce + poolDropped stat + load-bearing comment _(2026-06-22)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260622-023100-e70c44c` cho Claude walk chain theo CLAUDE.md protocol.
