# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-104357-b27f50b`
**Session file**: [`./20260627-104357-b27f50b.md`](../20260627-104357-b27f50b.md)
**Commit**: `b27f50b` — auto: session update
**Last updated**: 2026-06-27 10:43:57 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `2ee7c6386` docs(dev-log): AI tên chiến dịch maxTokens fix (verify thật account web2) _(2026-06-27)_
- `89701265d` chore(session): RESUME:20260627-102830-15668b5 _(2026-06-27)_
- `15668b516` docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening _(2026-06-27)_
- `17307ceba` chore(session): RESUME:20260627-094945-41294a1 _(2026-06-27)_
- `41294a16b` fix(web2 sepay R4 MEDIUM): CHECK constraint thiếu pending*no_order → gate marker fail → retry storm *(2026-06-27)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-104357-b27f50b` cho Claude walk chain theo CLAUDE.md protocol.
