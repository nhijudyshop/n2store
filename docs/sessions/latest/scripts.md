# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260521-162621-8e901b5`
**Session file**: [`./20260521-162621-8e901b5.md`](../20260521-162621-8e901b5.md)
**Commit**: `8e901b5` — auto: session update
**Last updated**: 2026-05-21 16:26:21 +07
**Summary**: auto: session update

## Files changed in this commit (`scripts/`)

- `scripts/n2store-browser-session.js`

## Last 5 commits touching `scripts/`

- `8e901b55` auto: session update _(2026-05-21)_
- `17477942` auto: session update _(2026-05-21)_
- `c53e98a3` feat(scripts): auto cache-bust ?v=YYYYMMDDx for changed JS/CSS _(2026-05-21)_
- `eee5df14` auto: session update _(2026-05-21)_
- `8e128d55` feat(scripts): chrome-connect CDP attach to real Chrome n2store profile + browser-session --profile/--channel flags _(2026-05-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260521-162621-8e901b5` cho Claude walk chain theo CLAUDE.md protocol.
