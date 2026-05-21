# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-153213-c53e98a`
**Session file**: [`./20260521-153213-c53e98a.md`](../20260521-153213-c53e98a.md)
**Commit**: `c53e98a` — feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS
**Last updated**: 2026-05-21 15:32:13 +07
**Summary**: feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS

## Files changed in this commit (`scripts/`)

- `scripts/auto-bump-cache-on-change.sh`
- `scripts/bump-cache-version.sh`

## Last 5 commits touching `scripts/`

- `c53e98a3` feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS _(2026-05-21)_
- `eee5df14` auto: session update _(2026-05-21)_
- `8e128d55` feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags _(2026-05-21)_
- `d371b0a9` auto: session update _(2026-05-21)_
- `a82a7de4` auto: session update _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-153213-c53e98a` cho Claude walk chain theo CLAUDE.md protocol.
