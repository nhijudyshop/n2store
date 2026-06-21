# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-154659-5b8e242`
**Session file**: [`./20260621-154659-5b8e242.md`](../20260621-154659-5b8e242.md)
**Commit**: `5b8e242` — auto: session update
**Last updated**: 2026-06-21 15:46:59 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `5b8e24255` auto: session update _(2026-06-21)_
- `5413ac369` fix(worker): gate /api/facebook-graph với allowlist read-only + GET-only _(2026-06-21)_
- `7da119c00` chore(session): RESUME:20260621-154110-0c5bc7d _(2026-06-21)_
- `0c5bc7dc3` feat(web2): over-refund cap ví NCC server-authoritative qua so-order (quick-refund + /tx) _(2026-06-21)_
- `ad7bd125e` chore(session): RESUME:20260621-144755-7698943 _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-154659-5b8e242` cho Claude walk chain theo CLAUDE.md protocol.
