# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-145734-b64a5da`
**Session file**: [`./20260613-145734-b64a5da.md`](../20260613-145734-b64a5da.md)
**Commit**: `b64a5da` — auto: session update
**Last updated**: 2026-06-13 14:57:34 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/ZALO-INTEGRATION.md`

## Last 5 commits touching `docs/`

- `b64a5daca` auto: session update _(2026-06-13)_
- `690663ac4` chore(session): RESUME:20260613-145512-bed1cb3 _(2026-06-13)_
- `4a59600b9` fix(pancake): PIVOT sang query-param ?client*key (CORS) — X-API-Key header bị worker preflight chặn *(2026-06-13)\_
- `300a8d3fe` chore(session): RESUME:20260613-144101-147e0a0 _(2026-06-13)_
- `5fffc9cfa` fix(live-chat): kéo SP vào comment mượt + đúng dòng (defer re-render khi drag) + undo toast hết bị iframe FB live che _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-145734-b64a5da` cho Claude walk chain theo CLAUDE.md protocol.
