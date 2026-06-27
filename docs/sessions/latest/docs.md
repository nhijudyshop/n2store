# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260627-105731-0fb92ed`
**Session file**: [`./20260627-105731-0fb92ed.md`](../20260627-105731-0fb92ed.md)
**Commit**: `0fb92ed` — auto: session update
**Last updated**: 2026-06-27 10:57:31 +07
**Summary**: auto: session update

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `6ed930d63` feat(web2/cham-cong): audit "thời gian chỉnh sửa" chấm công (ai + lúc nào) + fix false-stamp nghỉ phép _(2026-06-27)_
- `999f87ac9` chore(session): RESUME:20260627-104357-b27f50b _(2026-06-27)_
- `2ee7c6386` docs(dev-log): AI tên chiến dịch maxTokens fix (verify thật account web2) _(2026-06-27)_
- `89701265d` chore(session): RESUME:20260627-102830-15668b5 _(2026-06-27)_
- `15668b516` docs(dev-log): audit 5 bug user + fix AI tên chiến dịch/lag/zalo cookie/hardening _(2026-06-27)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260627-105731-0fb92ed` cho Claude walk chain theo CLAUDE.md protocol.
